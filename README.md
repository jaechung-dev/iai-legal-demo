# ProBono AI

Semantic search and RAG-powered legal Q&A over NSW legislation and caselaw — serverless, MCP-native, and built for non-lawyers who can't afford counsel.

## Live Demo

→ https://www.probonoai.com.au  
Guest login: `demo` / `demo1234`

Search NSW legislation and caselaw by meaning, not keywords. Ask legal questions in plain English and get cited answers. Explore a real case as a structured evidence timeline. Submit a case intake form and upload supporting documents. Connect Claude Desktop (or any MCP client) via the `/connect` page and query the same data through tool calls.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           probonoai.com.au                                 │
├──────────────┬──────────────────┬──────────────┬──────────┬────────────────┤
│  Frontend    │   API Lambda     │  AI Lambda   │  MCP     │ Ingest Lambda  │
│  Next.js 15  │   FastAPI        │  FastAPI     │  Lambda  │ (planned)      │
│  S3+CDN      │   auth/intake/   │  search/ask/ │  FastMCP │ S3 event trig  │
│              │   conversations  │  chat + RAG  │  Mangum  │                │
└──────┬───────┴────────┬─────────┴──────┬───────┴────┬─────┴──────┬─────────┘
       │                │                │            │            │
       ▼                ▼                ▼            ▼            ▼
  CloudFront    ┌───────────────────────────────┐  ┌──────┐  ┌──────────────┐
  + CF Func     │  Single API Gateway HTTP v2   │  │ same │  │  S3 Uploads  │
  (path rewrite │  route-based Lambda targeting │  │ GW   │  │  (case docs) │
   for SPA)     └───────────────┬───────────────┘  └──────┘  └──────┬───────┘
                                │                                    │
                                ▼                                    ▼
               ┌────────────────────────────────────────────────────────────┐
               │                  Supabase PostgreSQL                        │
               │                  pgvector (1536-dim HNSW)                   │
               └────────────────────────────────────────────────────────────┘
```

All Lambda functions share one Supabase PostgreSQL instance and one API Gateway HTTP v2 — routes are targeted per Lambda (no extra cost vs. a `$default` catch-all). The frontend is a static export — no SSR, no server-side secrets. API calls are client-side fetch/SSE. A CloudFront Function rewrites directory-style paths (e.g. `/search/`) to their `index.html` before S3 lookup, enabling SPA routing without website-hosting mode.

---

## Services

### RAG (`services/rag/`)

Retrieval and generation logic used by both the AI Lambda and (indirectly) the MCP server.

- Retriever subclasses embed the query with `text-embedding-3-small` and issue pgvector cosine similarity queries (`<=>`) against the appropriate table.
- `LegislationRetriever` — `legislation_chunks`, supports `jurisdiction` filter (NSW / Commonwealth / both).
- `CaselawRetriever` — `caselaw_chunks`.
- `CaseEventRetriever` — `case_events` / `demo_case_events`, filtered by `case_id`.
- `CaseChunkRetriever` — `case_chunks`, for user-uploaded document RAG (used once ingestion pipeline is live).
- LangChain LCEL chain: `{context: retriever | format_docs, question: passthrough} | ChatPromptTemplate | LLM | StrOutputParser`.
- Streaming via async generators that yield `data: {...}` SSE lines, terminated with `data: [DONE]`.
- Reasoning-model safe: `strip_think()` filters `<think>…</think>` blocks before emitting tokens.
- Switchable LLM: `CHAT_MODEL=gpt-4o-mini` (default) or `CHAT_MODEL=claude-haiku-4-5` — provider selected at import time.

### API Lambda (`services/api/`)

Lightweight FastAPI app — no ML dependencies. Cold start in ~1s.

- `/health` — DB connectivity check.
- `/auth/*` — JWT access tokens (HS256) + refresh token rotation. Email OTP (6-digit, 15-min TTL). Google OAuth2. Long-lived MCP tokens.
- `/intake/upload-url` + `/intake` — presigned S3 PUT URL generation; saves intake form to `case_intakes`. Files upload directly browser → S3 (bypasses Lambda 6MB payload limit).
- `/user/case` — most recent intake for the authenticated user.
- `/case/{case_id}/timeline` — chronological case events from `case_events`.
- `/conversations` + `/conversations/{id}/messages` — full conversation history CRUD.
- Lambda adapter: `handler = Mangum(app, lifespan="off")`.

### AI Lambda (`services/ai/`)

FastAPI app with the full ML stack (LangChain + OpenAI). ~50MB zip; cold start ~3s.

- Every request is audit-logged to `request_logs` (input, output, elapsed_ms, user_id).
- Legal guardrail: two-layer hallucination prevention — (1) system prompt forbids answering case-specific questions without grounded sources, predicting outcomes, or recommending strategy; (2) hard gate injects an explicit "no documents found" warning into the system message when a `case_id` is present but no case chunks score ≥ 0.35, preventing the model from filling gaps with training-data probability.
- `/search` — semantic retrieval over legislation, caselaw, or case events; returns ranked excerpts.
- `/ask` — single-turn RAG answer streamed as SSE with cited sources.
- `/chat` — multi-turn RAG chat: retrieves from legislation + caselaw + user case chunks, emits a `sources` SSE event, then streams tokens. Passes last 8 messages as `HumanMessage`/`AIMessage` objects.
- Lambda adapter: `handler = Mangum(app, lifespan="off")`.

### Auth (`services/auth/`)

FastAPI `APIRouter` mounted at `/auth/*` — imported by the API Lambda, not deployed standalone.

- JWT access tokens (HS256) + refresh token rotation. Refresh tokens stored hashed (SHA-256), deleted on use — single-use sliding window.
- Email OTP: 6-digit code, 15-minute TTL, hash stored in DB.
- Google OAuth2 with in-memory CSRF state tokens.
- Long-lived MCP tokens: opaque bearer tokens (`mcp-<uuid>`), SHA-256 hashed in `mcp_tokens`, scoped to `[search, ask, chat, timeline]`, user-revocable from `/connect`.

### MCP (`services/mcp/`)

FastMCP server over streamable HTTP — lets any MCP client (Claude Desktop, Cursor, custom agents) call the RAG tools directly.

- Four tools: `search`, `ask`, `fetch`, `collections`.
- Auth is token-gated: `MCPAuthMiddleware` validates every request against `mcp_tokens` and updates `last_used_at`.
- `ask` internally calls `/chat` over HTTP and reassembles the SSE stream.

### Ingestion (`services/ingestion/`)

Async document processing pipeline, triggered by S3 PutObject events on the uploads bucket.

**Supported file types:** PDF · Word (.docx) · Plain text (.txt) · Email (.eml) · Images (.jpg .png .tiff) · **25 MB max per file**

```
Document source (one of):
  ① File upload  → presigned S3 PUT (browser → S3 directly, bypasses Lambda 6 MB limit)
  ② Email drag   → .eml file upload (same presigned PUT path)
  ③ Paste text   → POST /intake/paste-text (API writes directly to S3 as .txt)

  → S3 PutObject event (includes x-amz-meta-case-id)
  → SQS queue (iai-legal-demo-ingest)
  → Ingestion Lambda
      → Size check  (skip if > 25 MB)
      → Parse       PDF: PyMuPDF native text; sparse pages → Amazon Textract OCR
                    DOCX: python-docx
                    TXT/TEXT: raw UTF-8
                    EML: stdlib email — headers (From/To/Cc/Date/Subject) + plain-text body
                    Images: Amazon Textract DetectDocumentText
      → Chunk       ~500 token segments, 50-token overlap
      → Embed       OpenAI text-embedding-3-small (1536 dims)
      → Store       case_chunks (user_id, case_id, content, embedding, metadata)
      → Update      case_intakes.files[].status = 'ready'
```

Key implementation details:
- S3 keys are URL-decoded (`unquote_plus`) before use — S3 event notifications percent-encode special characters (e.g. `@` → `%40`).
- `case_id` is passed as S3 object metadata (`x-amz-meta-case-id`) at upload time, so the Lambda targets the exact case without a fragile `ORDER BY created_at` fallback.
- `_mark_file_ready` uses `COALESCE(files, '[]'::jsonb)` to handle NULL `files` column (cases submitted without documents).
- Removing a file via `PATCH /case/{id}/files` cascades to `DELETE FROM case_chunks WHERE metadata->>'source_key' = key`.
- Deleting a case via `DELETE /case/{id}` cascades to `DELETE FROM case_chunks WHERE case_id = id`.
- `.eml` parsing extracts headers + plain-text body only; attachments inside the email are ignored (not recursively processed).

Once chunks are in `case_chunks`, the existing `CaseChunkRetriever` surfaces them in `/chat` automatically — no other changes needed.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 (static export) → S3 + CloudFront |
| CDN routing | CloudFront Function (viewer-request) — rewrites `/path/` → `/path/index.html` |
| API gateway | AWS API Gateway HTTP v2 — route-based targeting (no extra cost per Lambda) |
| API Lambda | FastAPI + Mangum — auth, intake, conversations (~10MB zip, no ML deps) |
| AI Lambda | FastAPI + LangChain LCEL + Mangum — search, ask, chat (~50MB zip) |
| Document uploads | S3 presigned PUT URLs → private S3 uploads bucket |
| Database | Supabase PostgreSQL + pgvector (1536-dim, HNSW cosine) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o-mini` default; Anthropic Claude via `CHAT_MODEL` env var |
| MCP | FastMCP (streamable HTTP transport, opaque bearer token auth) |
| IaC | Terraform (ap-southeast-2) |
| CI/CD | GitHub Actions → Lambda + S3/CloudFront |

---

## Lambda Functions

| Function | Trigger | Timeout | Zip size | Purpose |
|---|---|---|---|---|
| `iai-legal-demo-api` | API Gateway HTTP | 30s | ~10MB | Auth, intake, conversations, health |
| `iai-legal-demo-ai` | API Gateway HTTP | 60s | ~50MB | Search, ask, chat — full RAG + LLM stack |
| `iai-legal-demo-mcp` | API Gateway HTTP | 60s | ~50MB | MCP server for Claude Desktop / AI clients |
| `iai-legal-demo-ingest` | SQS (S3 PutObject) | 10 min | ~64MB | Document parse → chunk → embed → case_chunks |

**API Gateway route mapping** (one gateway, four Lambdas):
```
$default                 → API Lambda (fallback)
ANY /auth/{proxy+}       → API Lambda
ANY /health              → API Lambda
ANY /intake              → API Lambda
ANY /intake/{proxy+}     → API Lambda
ANY /user/{proxy+}       → API Lambda
ANY /conversations        → API Lambda
ANY /conversations/{proxy+} → API Lambda
ANY /case/{proxy+}       → API Lambda
ANY /search              → AI Lambda
ANY /ask                 → AI Lambda
ANY /chat                → AI Lambda
ANY /mcp                 → MCP Lambda
ANY /mcp/{proxy+}        → MCP Lambda
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `legislation_chunks` | NSW + Commonwealth legislation, pgvector embeddings |
| `caselaw_chunks` | NSW caselaw, pgvector embeddings |
| `case_events` | Case timeline events (live, user-specific) |
| `demo_case_events` | Seeded fixture case (Bella's case), used for demo |
| `case_chunks` | User-uploaded document chunks, pgvector embeddings |
| `case_intakes` | Intake form submissions — personal, matter, file metadata + S3 keys |
| `conversations` | Chat conversation records per user |
| `conversation_messages` | Individual messages with role, content, sources |
| `users` | Auth — email, password hash, OAuth provider |
| `refresh_tokens` | Hashed refresh tokens with expiry |
| `email_verifications` | OTP codes for email verification |
| `password_resets` | OTP codes for password reset |
| `mcp_tokens` | Long-lived MCP bearer tokens, scoped |
| `request_logs` | Audit log — every search/chat request with input, output, latency |

---

## RAG Pipeline

```
User query
  → OpenAI text-embedding-3-small (1536-dim)
  → pgvector HNSW cosine search
  → LangChain LCEL: docs → format_docs() → ChatPromptTemplate → LLM
  → StreamingResponse (SSE) → fetchEventSource (frontend)
```

`/chat` retrieves from both legislation and caselaw simultaneously (plus user's case chunks if available), emits a `sources` SSE event with citations and relevance scores, then streams tokens.

| Retriever | Table | Filter |
|---|---|---|
| `LegislationRetriever` | `legislation_chunks` | `jurisdiction` (NSW / Commonwealth / both) |
| `CaselawRetriever` | `caselaw_chunks` | — |
| `CaseEventRetriever` | `case_events` / `demo_case_events` | `case_id` |
| `CaseChunkRetriever` | `case_chunks` | `user_id` |

---

## Document Intelligence Roadmap

The current ingestion pipeline handles parsing, chunking, and embedding. The next layer is **document intelligence** — making the system understand what a document *means*, not just what it says.

### 1. Auto-classification (Priority 1)

After embedding, run a single LLM pass over the first ~500 tokens to classify the document type:

```
Court Order / Judgment → Police Report → Medical Report → Legal Correspondence → Personal Statement → Other
```

Write the result back to `case_intakes.files[n].category` automatically — no manual dropdown required from the user.

**Why it matters:** Document type feeds the authority weighting system (see below). A court order saying "bail condition: 10pm curfew" must override a personal statement saying "I need to be out until midnight." Without classification, all chunks are treated equally.

### 2. Authority Weighting (Priority 1 — depends on classification)

In law, documents carry different levels of authority. The RAG retriever should reflect this:

```
Legislation / Acts          weight: 1.5   (highest — binding law)
Court Orders / Judgments    weight: 1.4
Police / Medical Reports    weight: 1.2
Legal Correspondence        weight: 1.1
Personal Statements         weight: 1.0   (lowest — subjective, self-serving)
```

Implementation: multiply pgvector cosine similarity score by the authority weight before applying `MIN_CASE_SCORE`. Court order chunks surface first; personal statement chunks only fill gaps.

### 3. Auto-timeline Extraction (Priority 2)

Run a structured extraction pass over each document after embedding:

```
LLM prompt: "Extract all dates and events from this document as JSON: [{date, description, source_doc}]"
```

Insert results directly into `case_events`. The Timeline section in My Case populates automatically as documents are uploaded — no manual entry.

### 4. Auto-summary (Priority 3)

After all documents for a case are processed, run a summarisation pass across all chunks and store a plain-English case summary. The Summary section always reflects the current state of uploaded documents.

---

### 5. Email as a Case Document Source

Emails are primary evidence in many legal cases — threatening messages, correspondence with lawyers, court notices. Three levels of integration, in order of complexity:

**Level 1 — .eml file upload (live)**
User exports an email from Gmail/Outlook as `.eml` and uploads it like any other document. The ingest Lambda parses headers + body and embeds the content. No OAuth, no API keys — fully self-serve.

**Level 2 — Paste text (live)**
`POST /intake/paste-text` accepts raw text directly. User copies email body, pastes into a text box in My Case → Documents. Stored as `.txt` in S3, processed identically to an uploaded file.

**Level 3 — Gmail OAuth (roadmap — assisted onboarding)**
Full Gmail API integration: user connects their Gmail account once, selects relevant threads, system fetches and embeds them automatically. Requires:
- Google OAuth2 consent screen verification (Google review process, can take weeks)
- `gmail.readonly` scope — users must understand what they are authorising
- Token storage per user (encrypted refresh tokens in DB)
- Thread picker UI in My Case

**Why Level 3 requires assisted setup:** Gmail OAuth for production apps requires Google's consent screen verification. The scope (`gmail.readonly`) reads all email — non-technical clients need to understand what they're authorising before proceeding. Recommended model: a one-time onboarding call where a support person walks the client through connecting their account, similar to how accountants set up cloud accounting tools for clients.

---

### Why this order?

Auto-classification is foundational — it unlocks authority weighting, which is what makes the RAG system legally trustworthy rather than just semantically similar. Auto-timeline is the highest user-visible value (users don't know how to build a legal timeline). Auto-summary can be triggered lazily. Email Level 3 is high value but gated on Google approval and client trust-building.

---

## Key Technical Decisions

**pgvector over Pinecone/Weaviate.** The corpus is already in Postgres. Adding a second vector store means a second service, a sync job, and an extra network hop. pgvector with HNSW gives sub-10ms retrieval at this scale.

**LangChain LCEL over custom chains.** `|` composition makes the retrieval→prompt→LLM→parser chain readable and makes swapping components trivially safe. The tradeoff is a heavy dependency — acceptable here because this is the core product.

**Lambda over ECS.** Request volume is demo-scale and bursty. Lambda costs zero at rest, cold starts are under 2s, and Mangum means no code changes between local and Lambda. ECS would be warranted at sustained load.

**S3 presigned PUT for document uploads.** Files go directly browser → S3, bypassing Lambda (Lambda has a 6 MB payload cap, incompatible with 10 MB file uploads). Lambda only generates the short-lived URL.

**Same embedding model everywhere.** All tables use `text-embedding-3-small` at 1536 dims. The ingestion Lambda must use the same model — switching models requires re-embedding all existing chunks.

**MCP for AI client integration.** The RAG tools are well-defined with typed inputs and string outputs — exactly what MCP expects. The `/connect` page gives users a self-service token flow.

---

## Project Structure

```
iai-legal-demo/
├── services/
│   ├── rag/              # pgvector retrievers + LangChain LCEL chains + prompts
│   │   ├── retrievers.py #   LegislationRetriever, CaselawRetriever, CaseEventRetriever, CaseChunkRetriever
│   │   ├── chains.py     #   stream_single, stream_both, stream_chat
│   │   ├── prompts.py    #   ChatPromptTemplate + legal guardrail system prompt
│   │   └── tests/
│   ├── auth/             # JWT, refresh tokens, OTP, Google OAuth, MCP tokens
│   │   ├── service.py    #   FastAPI APIRouter mounted at /auth/*
│   │   └── tests/
│   ├── api/              # API Lambda — auth/intake/conversations, no ML deps (~10MB)
│   │   └── main.py       #   FastAPI app + Mangum handler
│   ├── ai/               # AI Lambda — search/ask/chat, full RAG stack (~50MB)
│   │   └── main.py       #   FastAPI app + Mangum handler
│   ├── mcp/              # FastMCP server — RAG tools over streamable HTTP
│   │   ├── server.py     #   search, ask, fetch, collections tools
│   │   └── tests/
│   └── ingestion/        # (planned) S3-triggered document ingestion pipeline
│       └── handler.py    #   parse → chunk → embed → case_chunks
├── frontend/             # Next.js 15 static export → S3 + CloudFront
│   ├── app/              #   chat, search, intake, connect, auth pages
│   ├── components/       #   Nav, TimelineClient, LoginModal
│   └── tests/
├── tests/                # Integration tests against production API
├── terraform/            # Lambda, API GW, S3 (frontend + uploads), CloudFront, ACM
│   ├── main.tf           #   S3 buckets, CloudFront distribution + CF Function (SPA rewrite)
│   ├── lambda.tf         #   API + AI + MCP Lambda functions + API Gateway routes
│   ├── iam.tf            #   Lambda execution role, GitHub Actions OIDC, S3 upload policy
│   └── cert.tf           #   ACM certificate + Route53 validation
├── schema.sql            # Full PostgreSQL schema (run once on fresh DB)
├── build_lambda.sh       # Package → api_lambda.zip + ai_lambda.zip + mcp_lambda.zip
└── deploy_frontend.sh    # next build → S3 sync → CloudFront invalidation
```

---

## Local Setup

### 1. Environment

```bash
cp .env.example .env
# Required: OPENAI_API_KEY, DATABASE_URL (Postgres + pgvector), JWT_SECRET
# Optional: CHAT_MODEL (default: gpt-4o-mini), GOOGLE_CLIENT_ID/SECRET, UPLOADS_BUCKET
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

# API Lambda routes (auth, intake, conversations — no ML deps)
python -m services.api.main      # → http://localhost:20000

# AI Lambda routes (search, ask, chat — needs OPENAI_API_KEY)
python -m services.ai.main       # → http://localhost:20003
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
services/auth/tests/     13 pytest unit tests — register, login, OTP, refresh, MCP tokens
services/bff/tests/       9 pytest unit tests — search, ask, chat, timeline, intake endpoints
services/mcp/tests/       5 pytest unit tests — tool registration, auth middleware
services/rag/tests/      21 pytest unit tests — retrievers (10) + chains (11)
tests/                   integration tests against production API
  test_api_smoke.py          smoke: health, search, ask, chat
  test_mcp_smoke.py          MCP tool smoke tests
  test_integration_judge.py  LLM-as-judge response quality evaluation
frontend/tests/          76 Vitest unit tests (pages, Nav, LoginModal, useGuestQuota)
frontend/e2e/            Playwright end-to-end (auth, search, chat, timeline, MCP)
```

```bash
pytest services/ -v          # unit tests
pytest tests/ -v             # integration tests (hits production)
cd frontend && npm test       # frontend unit tests
```

---

## Deployment

### Backend → Lambda

```bash
./build_lambda.sh    # → api_lambda.zip + ai_lambda.zip + mcp_lambda.zip
cd terraform
terraform apply      # Lambda (API + AI + MCP), API Gateway routes, S3, CloudFront, ACM cert
```

### Frontend → S3 + CloudFront

```bash
./deploy_frontend.sh    # next build → S3 sync → CloudFront invalidation
```

### Switching LLM providers

```bash
CHAT_MODEL=gpt-4o-mini       # OpenAI (default)
CHAT_MODEL=claude-haiku-4-5  # Anthropic — ChatAnthropic imported automatically
```

Set in Lambda environment variables (or `.env` locally). No code changes required.

> **Next:** Document intelligence layer — auto-classify document type, authority-weighted retrieval, auto-extract timeline events, auto-generate case summary (see Document Intelligence Roadmap above). Email Level 3 (Gmail OAuth, assisted onboarding). Also: migration system for schema changes, AWS Secrets Manager for secret rotation, GitHub Actions CI for automated Lambda deploys on push.
