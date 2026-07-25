# ProBono AI

Semantic search and RAG-powered legal Q&A over NSW legislation and caselaw — serverless, MCP-native, and built for non-lawyers who can't afford counsel.

## Live Demo

→ https://www.probonoai.com.au  
Guest login: `demo` / `demo1234`

Search NSW legislation and caselaw by meaning, not keywords. Ask legal questions in plain English and get cited answers. Explore a real case as a structured evidence timeline. Connect Claude Desktop (or any MCP client) via the `/connect` page and query the same data through tool calls.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   probonoai.com.au                          │
├──────────────┬──────────────────┬───────────────────────────┤
│  Frontend    │   BFF            │   MCP Server              │
│  Next.js 15  │   FastAPI        │   FastMCP                 │
│  S3+CDN      │   Lambda         │   Lambda                  │
└──────┬───────┴────────┬─────────┴──────────────┬────────────┘
       │                │                         │
       ▼                ▼                         ▼
              ┌─────────────────┐       ┌─────────────────┐
              │   RAG Service   │       │  Auth Service   │
              │   LangChain     │       │  JWT + OTP      │
              │   pgvector      │       │  OAuth          │
              └────────┬────────┘       └────────┬────────┘
                       │                         │
                       ▼                         ▼
              ┌──────────────────────────────────────────┐
              │         Supabase PostgreSQL               │
              │         pgvector (1536-dim HNSW)          │
              └──────────────────────────────────────────┘
```

All three Lambda functions share one Supabase PostgreSQL instance. The frontend is a static export — no SSR, no server-side secrets. API calls are client-side fetch/SSE through API Gateway HTTP v2.

---

## Services

### RAG (`services/rag/`)

Retrieval and generation logic used by both the BFF and (indirectly) the MCP server.

- Three `BaseRetriever` subclasses — `LegislationRetriever`, `CaselawRetriever`, `CaseEventRetriever` — each embeds the query with `text-embedding-3-small` and issues a pgvector cosine similarity query (`<=>` operator) against the appropriate table.
- `LegislationRetriever` supports a `jurisdiction` filter (`NSW` / `Commonwealth` / `both`), switching between a filtered and unfiltered SQL path.
- LangChain LCEL chain: `{context: retriever | format_docs, question: passthrough} | ChatPromptTemplate | LLM | StrOutputParser`.
- Streaming via async generators that yield `data: {...}` SSE lines, terminated with `data: [DONE]`.
- Reasoning-model safe: `strip_think()` filters `<think>…</think>` blocks before emitting tokens.
- Switchable LLM: `CHAT_MODEL=gpt-4o-mini` (default) or `CHAT_MODEL=claude-haiku-4-5` — provider is selected at import time, no runtime branching in the hot path.

### BFF (`services/bff/`)

Thin FastAPI routing layer. Owns no retrieval logic — imports from `services/rag/`.

- Every search and chat request is audit-logged to a `request_logs` table (input, output, elapsed_ms, user_id). Compliance requirement for legal tech: you need to know what advice was given and to whom.
- Legal guardrail: the system prompt explicitly prevents giving legal advice and redirects users to qualified lawyers. Enforced at the prompt level, not post-hoc filtering.
- `/chat` passes the last 8 messages as `HumanMessage`/`AIMessage` objects, prepends a `SystemMessage` with retrieved context, and streams via SSE with a `sources` event before tokens.
- Lambda adapter: `handler = Mangum(app, lifespan="off")`.

### Auth (`services/auth/`)

All identity concerns in one router, mounted at `/auth/*`.

- JWT access tokens (HS256) + refresh token rotation. Refresh tokens are stored hashed (SHA-256) and deleted on use — single-use sliding window.
- Email OTP: 6-digit code (`random.randint(100000, 999999)`), 15-minute TTL, hash stored in DB, not the plaintext code.
- Google OAuth2 with in-memory CSRF state tokens for the OAuth dance.
- Long-lived MCP tokens: opaque bearer tokens (`mcp-<uuid>`), SHA-256 hashed in `mcp_tokens` table, scoped to `[search, ask, chat, timeline]`, user-revocable from `/connect`.

### MCP (`services/mcp/`)

FastMCP server over streamable HTTP — lets any MCP client (Claude Desktop, Cursor, custom agents) call the RAG tools directly.

- Four tools: `search` (semantic search with citation + score), `ask` (RAG Q&A, consumes SSE stream internally and returns assembled text), `fetch` (full case timeline by `case_id`), `collections` (live chunk counts from DB).
- Auth is token-gated: `MCPAuthMiddleware` validates every request against `mcp_tokens` (DB lookup, not JWT decode) and updates `last_used_at` on hit.
- Separate from the BFF intentionally — MCP token lifecycle is different from session JWTs, and the server needs to be independently deployable.
- `ask` internally calls `/chat` over HTTP and reassembles the SSE stream. The MCP server delegates retrieval to the BFF rather than duplicating pgvector logic.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 (static export) → S3 + CloudFront |
| Backend | FastAPI + LangChain LCEL → AWS Lambda (Mangum) + API Gateway HTTP v2 |
| Database | Supabase PostgreSQL + pgvector (1536-dim, HNSW cosine) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o-mini` default; Anthropic Claude via `CHAT_MODEL` env var |
| MCP | FastMCP (streamable HTTP transport, opaque bearer token auth) |
| IaC | Terraform (ap-southeast-2) |
| CI/CD | GitHub Actions → Lambda + S3/CloudFront |

---

## RAG Pipeline

```
User query
  → OpenAI text-embedding-3-small (1536-dim)
  → pgvector HNSW cosine search  (legislation_chunks / caselaw_chunks / case_events)
  → LangChain LCEL: docs → format_docs() → ChatPromptTemplate → LLM
  → StreamingResponse (SSE) → fetchEventSource (frontend)
```

`/chat` retrieves from both legislation and caselaw simultaneously, emits a `sources` SSE event with citations and relevance scores, then streams tokens. Multi-turn history: last 8 messages converted to LangChain message objects and passed in the LLM call.

| Retriever | Table | Filter |
|---|---|---|
| `LegislationRetriever` | `legislation_chunks` | `jurisdiction` (NSW / Commonwealth / both) |
| `CaselawRetriever` | `caselaw_chunks` | — |
| `CaseEventRetriever` | `case_events` | `case_id` |

---

## Key Technical Decisions

**pgvector over Pinecone/Weaviate.** The corpus is already in Postgres (Supabase). Adding a second vector store means a second service to operate, a sync job to maintain, and an extra network hop on every query. pgvector with HNSW indexes gives sub-10ms retrieval at this scale; the operational simplicity is worth more than the marginal performance difference at 180K vectors.

**LangChain LCEL over custom chains.** LCEL's `|` composition makes the retrieval→prompt→LLM→parser chain readable and makes swapping components (retriever, model, parser) trivially safe. The async streaming protocol (`astream`) integrates directly with FastAPI's `StreamingResponse` without a wrapper. The tradeoff is that LangChain is a heavy dependency — acceptable here because this is the core product, not a library.

**Lambda over ECS for this workload.** Request volume is demo-scale and bursty. Lambda costs zero at rest, cold starts are under 2 seconds (acceptable for a demo), and Mangum's ASGI adapter means no code changes to run locally vs. in Lambda. ECS would be warranted at sustained load or if Lambda's 15-minute execution limit became relevant (it doesn't for SSE — API Gateway HTTP v2 supports streaming).

**MCP for AI client integration.** The RAG tools are already well-defined with typed inputs and string outputs — exactly what MCP expects. Exposing them over FastMCP's streamable HTTP means Claude Desktop, Cursor, or any future MCP client can query NSW law without any custom integration. The `/connect` page gives users a self-service token flow so onboarding is frictionless.

---

## Project Structure

```
iai-legal-demo/
├── services/
│   ├── rag/              # pgvector retrievers + LangChain LCEL chains + prompts
│   │   ├── retrievers.py #   LegislationRetriever, CaselawRetriever, CaseEventRetriever
│   │   ├── chains.py     #   stream_single, stream_both, stream_chat
│   │   ├── prompts.py    #   ChatPromptTemplate + legal guardrail system prompt
│   │   └── tests/
│   ├── auth/             # JWT, refresh tokens, OTP, Google OAuth, MCP tokens
│   │   ├── service.py    #   FastAPI APIRouter mounted at /auth/*
│   │   └── tests/
│   ├── bff/              # Backend-for-Frontend — thin routing + audit logging
│   │   ├── main.py       #   FastAPI app + Mangum handler
│   │   └── tests/
│   └── mcp/              # FastMCP server — RAG tools over streamable HTTP
│       ├── server.py     #   search, ask, fetch, collections tools
│       └── tests/
├── frontend/             # Next.js 15 static export → S3 + CloudFront
│   ├── app/              #   chat, search, timeline, connect, auth pages
│   ├── components/       #   Nav, TimelineClient, LoginModal
│   └── tests/            #   Vitest unit tests
├── tests/                # Integration tests against production API
│   ├── test_api_smoke.py      #   smoke tests: health, search, ask, chat
│   ├── test_mcp_smoke.py      #   MCP tool smoke tests
│   └── test_integration_judge.py  # LLM-as-judge response quality tests
├── terraform/            # Lambda, API Gateway, S3, CloudFront, ACM (ap-southeast-2)
├── build_lambda.sh       # Package services/ + requirements → lambda.zip
└── deploy_frontend.sh    # next build → S3 sync → CloudFront invalidation
```

---

## Local Setup

### 1. Environment

```bash
cp .env.example .env
# Required: OPENAI_API_KEY, DATABASE_URL (Postgres + pgvector), JWT_SECRET
# Optional: CHAT_MODEL (default: gpt-4o-mini), GOOGLE_CLIENT_ID/SECRET
```

### 2. Database

```bash
psql $DATABASE_URL -f schema.sql

python ingest.py                                          # case events
python ingest_law.py legislation_demo.csv legislation     # legislation chunks
python ingest_law.py caselaw_demo.csv caselaw             # caselaw chunks
```

### 3. Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m services.bff.main          # → http://localhost:20000
```

### 4. MCP Server (optional)

```bash
python -m services.mcp.server        # → http://localhost:20002
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev                          # → http://localhost:20001
```

### Connect Claude Desktop (MCP)

Log in at `localhost:20001/connect`, generate an MCP token, then:

```json
{
  "mcpServers": {
    "legal-rag": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.probonoai.com.au/mcp",
        "--header",
        "Authorization: Bearer <your-mcp-token>"
      ]
    }
  }
}
```

---

## Testing

```
tests/
├── services/auth/tests/     13 pytest unit tests — register, login, OTP, refresh, MCP tokens
├── services/bff/tests/       9 pytest unit tests — search, ask, chat, timeline endpoints
├── services/mcp/tests/       5 pytest unit tests — tool registration, auth middleware
├── services/rag/tests/      21 pytest unit tests — retrievers (10) + chains (11)
└── tests/                   integration tests against production API
    ├── test_api_smoke.py         smoke tests: health, search, ask, chat
    ├── test_mcp_smoke.py         MCP tool smoke tests (search, ask, fetch, collections)
    └── test_integration_judge.py LLM-as-judge: gpt-4o-mini evaluates response quality

frontend/tests/              76 Vitest unit tests
    ├── pages/               login, register, forgot-password, reset-password
    ├── Nav.test.tsx
    ├── LoginModal.test.tsx
    └── useGuestQuota.test.ts

frontend/e2e/                Playwright end-to-end (auth, search, chat, timeline, MCP connect)
```

Run service unit tests:

```bash
pytest services/ -v
```

Run integration tests against production:

```bash
pytest tests/ -v
```

Run frontend unit tests:

```bash
cd frontend && npm test
```

---

## Deployment

### Backend → Lambda

```bash
./build_lambda.sh    # zip services/ + deps → lambda.zip
cd terraform
terraform apply      # Lambda (BFF + MCP), API Gateway, S3, CloudFront, ACM cert
```

### Frontend → S3 + CloudFront

```bash
./deploy_frontend.sh    # next build (static export) → S3 sync → CloudFront invalidation
```

### Switching LLM providers

```bash
CHAT_MODEL=gpt-4o-mini      # OpenAI (default)
CHAT_MODEL=claude-haiku-4-5 # Anthropic — ChatAnthropic imported automatically
```

Set in Lambda environment variables (or `.env` locally). No code changes required.

> **Planned:** Migrate secrets (JWT_SECRET, DATABASE_URL, OPENAI_API_KEY) to AWS Secrets Manager for rotation. Currently using GitHub Secrets → Lambda environment variables.
