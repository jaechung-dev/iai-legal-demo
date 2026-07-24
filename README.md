# ProBono AI — Legal Intelligence Platform

Semantic search and RAG-powered Q&A over NSW legislation and caselaw, built as a production demo for [probonoai.com.au](https://probonoai.com.au).

**Live demo →** [probonoai.com.au](https://probonoai.com.au) · login: `demo` / `demo`

---

## What it does

Non-lawyers can search NSW legislation and caselaw using natural language, ask legal questions and get plain-English answers with cited sources, and explore a case timeline as a structured evidence bundle.

The interesting parts technically:

- **Semantic search** over ~180K embedded legal text chunks using pgvector HNSW cosine similarity
- **RAG pipeline** built with LangChain LCEL — retrieval → prompt → LLM → SSE stream
- **Multi-turn chat** with context window management and real-time source attribution
- **MCP server** wrapping the RAG tools so Claude Desktop (or any MCP client) can search and ask
- **Serverless** — FastAPI on Lambda via Mangum, static Next.js on S3 + CloudFront

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 (static export) → S3 + CloudFront |
| Backend | FastAPI + LangChain → AWS Lambda (Mangum) + API Gateway HTTP v2 |
| Database | Supabase PostgreSQL + pgvector (1536-dim, HNSW cosine) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | OpenAI `gpt-4o-mini` (switchable to any Anthropic model via `CHAT_MODEL` env var) |
| MCP | FastMCP (streamable HTTP transport, JWT Bearer auth) |
| IaC | Terraform (ap-southeast-2) |

---

## RAG Pipeline

```
User query
  → OpenAIEmbeddings (text-embedding-3-small, 1536-dim)
  → pgvector HNSW cosine search (legislation_chunks / caselaw_chunks)
  → LangChain LCEL chain: retrieved docs → ChatPromptTemplate → LLM
  → StreamingResponse (SSE) → frontend fetchEventSource
```

Three retrievers in `main.py`:

| Retriever | Table | Filter |
|---|---|---|
| `LegislationRetriever` | `legislation_chunks` | jurisdiction (NSW / Commonwealth / both) |
| `CaselawRetriever` | `caselaw_chunks` | — |
| `CaseEventRetriever` | `demo_case_events` | case_id |

The `/chat` endpoint retrieves from both legislation and caselaw, sends a `sources` SSE event before streaming tokens, and supports multi-turn history (last 8 messages passed as LangChain message objects).

### Switching LLM providers

Set `CHAT_MODEL` in `.env`:

```bash
CHAT_MODEL=gpt-4o-mini          # OpenAI (default)
CHAT_MODEL=claude-haiku-4-5     # Anthropic — auto-imports ChatAnthropic
```

---

## MCP Server

`mcp_server.py` exposes four tools over streamable HTTP (port 20002):

| Tool | Description |
|---|---|
| `search` | Semantic search — legislation, caselaw, or case events |
| `ask` | RAG Q&A with streamed answer + sources |
| `fetch` | Full case timeline by case_id |
| `collections` | List available data collections |

**Auth:** every request requires `Authorization: Bearer <jwt>`. Get a token by logging in at probonoai.com.au — the same JWT works for both the web UI and MCP.

Connect Claude Desktop:

```json
{
  "mcpServers": {
    "legal-rag": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://api.probonoai.com.au/mcp",
        "--header",
        "Authorization: Bearer <your-jwt>"
      ]
    }
  }
}
```

---

## Project Structure

```
iai-legal-demo/
├── main.py               # FastAPI app — auth, search, ask, chat, timeline (port 20000)
├── mcp_server.py         # FastMCP server — search/ask/fetch/collections (port 20002)
├── auth.py               # JWT helpers
├── schema.sql            # PostgreSQL schema — pgvector tables + HNSW indexes
├── ingest.py             # Embed and ingest case events (JSONL → demo_case_events)
├── ingest_law.py         # Embed and ingest legislation/caselaw chunks (CSV → tables)
├── requirements.txt
├── build_lambda.sh       # Package Lambda zip
├── deploy_frontend.sh    # Build Next.js → sync S3 → invalidate CloudFront
├── cases/
│   └── case_nguyen_v_r.jsonl   # Demo case data (R v Nguyen, NSW District Court 2025)
├── legislation_demo.csv  # Sample legislation chunks for local setup
├── caselaw_demo.csv      # Sample caselaw chunks for local setup
├── frontend/
│   ├── app/
│   │   ├── page.tsx      # / — Case timeline
│   │   ├── chat/         # /chat — RAG chat + sources panel
│   │   ├── search/       # /search — Semantic search + Ask modes
│   │   ├── connect/      # /connect — MCP token page
│   │   └── login/
│   └── components/
│       ├── TimelineClient.tsx
│       └── Nav.tsx
└── terraform/            # Lambda + API Gateway + S3 + CloudFront + ACM
```

---

## Local Setup

### 1. Environment

```bash
cp .env.example .env
# Fill in: OPENAI_API_KEY, DATABASE_URL (Supabase or any Postgres+pgvector), JWT_SECRET
```

### 2. Database

```bash
psql $DATABASE_URL -f schema.sql

python ingest.py                                          # case events
python ingest_law.py legislation_demo.csv legislation     # ~200 legislation chunks
python ingest_law.py caselaw_demo.csv caselaw             # ~200 caselaw chunks
```

### 3. Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py          # → http://localhost:20000
```

### 4. MCP Server (optional)

```bash
python mcp_server.py    # → http://localhost:20002
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev             # → http://localhost:20001
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | DB + model health check |
| `POST` | `/auth/login` | Username + password → 24h JWT |
| `POST` | `/auth/oauth/token` | API key → 1h scoped JWT |
| `POST` | `/search` | Semantic search (`legislation` \| `caselaw` \| `case_events`) |
| `POST` | `/ask` | RAG Q&A — SSE stream |
| `POST` | `/chat` | Multi-turn RAG chat — SSE stream with sources event |
| `GET` | `/case/{case_id}/timeline` | Ordered case event list |

---

## Deployment

### Backend → Lambda

```bash
./build_lambda.sh    # creates lambda.zip
cd terraform
terraform apply      # Lambda + API Gateway + S3 + CloudFront + ACM cert
```

### Frontend → S3 + CloudFront

```bash
./deploy_frontend.sh    # build → S3 sync → CloudFront invalidation
```

---

## AWS Architecture

```
probonoai.com.au
  → CloudFront (CDN + HTTPS)
      ├── S3 (static Next.js export)
      └── API Gateway HTTP v2
            └── Lambda (FastAPI + Mangum)
                  └── Supabase (PostgreSQL + pgvector)
```

| Service | Purpose |
|---|---|
| Lambda (512 MB, 60s) | Stateless backend — all API routes |
| API Gateway HTTP v2 | HTTPS entry point + Lambda proxy |
| S3 | Static frontend |
| CloudFront | CDN + HTTPS + cache |
| ACM | TLS certificate |
| Supabase | PostgreSQL + pgvector (managed, ap-southeast-1) |
