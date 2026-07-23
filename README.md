# ProBono AI — Legal Intelligence Platform

AI-powered legal research and case management demo for Australian law.

**Live:** [probonoai.com.au](https://probonoai.com.au)

---

## Overview

ProBono AI helps users search NSW legislation and caselaw using semantic search, ask legal questions in plain English using RAG, and explore a case timeline as an evidence bundle. Targeted at non-lawyers and pro bono contexts.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + React 19 (static export) → S3 + CloudFront |
| Backend | FastAPI + LangChain → AWS Lambda + API Gateway HTTP v2 |
| Database | Supabase (PostgreSQL + pgvector, 1536-dim) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | Anthropic `claude-haiku-4-5` |
| IaC | Terraform (ap-southeast-2) |

---

## Features

- **Login** — JWT auth, demo accounts (see below)
- **Timeline** — Case event viewer with category filters (demo: *R v Nguyen*, NSW District Court 2025)
- **Search** — Semantic search over NSW legislation and caselaw chunks
- **Chat / Ask the Law** — RAG-powered legal Q&A with streaming answers and retrieved-source sidebar
- **Connect** — MCP token issuance page: exchange an API key for a scoped JWT to connect Claude or any MCP client
- **MCP Server** — `mcp_server.py` exposes `search`, `ask`, `fetch`, `collections` tools on port 20002

### RAG Pipeline

```
user query → OpenAIEmbeddings → pgvector cosine search
           → ChatPromptTemplate → Claude Haiku 4.5 → StreamingResponse (SSE)
```

Three retrievers in `main.py`:
- `LegislationRetriever` — queries `legislation_chunks` by jurisdiction
- `CaselawRetriever` — queries `caselaw_chunks`
- `CaseEventRetriever` — queries `demo_case_events` by case_id

### MCP Server

`mcp_server.py` runs as a separate service and wraps the RAG API for Claude Desktop and other MCP clients. JWT auth is required on every tool call — get a token from `/auth/oauth/token` or from the `/connect` page in the UI.

```bash
python mcp_server.py   # port 20002
```

Add to Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "legal-rag": {
      "url": "http://localhost:20002/mcp",
      "env": {
        "MCP_DEFAULT_JWT": "<paste token from /connect page>"
      }
    }
  }
}
```

Demo API key: `lrag-demo`

---

## Project Structure

```
iai-legal-demo/
├── main.py               # FastAPI app + Mangum Lambda handler (port 20000)
├── mcp_server.py         # FastMCP server — search/ask/fetch/collections (port 20002)
├── auth.py               # JWT helpers
├── schema.sql            # Supabase table definitions (pgvector 1536-dim)
├── ingest.py             # Ingest demo case events
├── ingest_law.py         # Ingest legislation/caselaw chunks from CSV
├── requirements.txt      # Python dependencies
├── build_lambda.sh       # Build lambda.zip for deployment
├── deploy_frontend.sh    # Build Next.js + sync to S3 + invalidate CloudFront
├── cases/
│   └── case_nguyen_v_r.jsonl   # Demo case event data
├── frontend/             # Next.js app
│   ├── app/
│   │   ├── page.tsx      # / — Case timeline
│   │   ├── chat/         # /chat — RAG chat + sources panel
│   │   ├── search/       # /search — Search + Ask modes
│   │   ├── connect/      # /connect — MCP token issuance
│   │   └── login/        # /login — Auth
│   ├── components/
│   │   ├── Nav.tsx
│   │   ├── TimelineClient.tsx
│   │   └── ui/           # shadcn/ui components
│   └── out/              # Static export (committed, deployed to S3)
└── terraform/
    ├── main.tf           # S3, CloudFront, ACM cert
    ├── lambda.tf         # Lambda, API Gateway HTTP v2
    ├── iam.tf            # Lambda execution role
    ├── cert.tf           # ACM cert (us-east-1 for CloudFront)
    ├── variables.tf
    └── outputs.tf        # URLs + bucket name
```

---

## AWS Services

| Service | Purpose |
|---|---|
| **Lambda** (Python 3.12, 512 MB, 60s timeout) | Stateless backend — auth, RAG, search, chat, timeline |
| **API Gateway HTTP v2** | HTTPS entry point → Lambda proxy |
| **S3** | Static frontend hosting (`frontend/out/`) |
| **CloudFront** | CDN + HTTPS for `probonoai.com.au` |
| **ACM** | TLS cert (provisioned in `us-east-1` for CloudFront) |
| **CloudWatch Logs** | Lambda execution logs |
| **IAM** | Lambda execution role with CloudWatch write access |

### Lambda Microservices (logical split within one function)

All routes are stateless and run inside a single Lambda function wrapped by [Mangum](https://mangum.io/). Each logical service maps to one or more FastAPI endpoints:

| Microservice | Endpoints | Notes |
|---|---|---|
| **auth** | `POST /auth/login`, `POST /auth/oauth/token` | JWT issuance (24h user, 1h MCP) |
| **search** | `POST /search` | Semantic search — legislation / caselaw / case events |
| **rag** | `POST /ask`, `POST /chat` | SSE streaming — LangChain + Claude Haiku 4.5 |
| **case** | `GET /case/{id}/timeline` | Case event list from Supabase |
| **health** | `GET /health` | DB connectivity check |

---

## Infrastructure

| Resource | Value |
|---|---|
| Frontend | `https://probonoai.com.au` |
| CloudFront | `doaqo43b3vcmk.cloudfront.net` |
| API (Lambda) | `https://6arf47x0pk.execute-api.ap-southeast-2.amazonaws.com/` |
| S3 Bucket | `iai-legal-demo-frontend-18a03647` |
| AWS Region | `ap-southeast-2` (Sydney) |
| Database | Supabase `ap-southeast-1` (Singapore) |

---

## Local Development

### Prerequisites

```bash
cp .env.example .env
# Fill in: OPENAI_API_KEY, DATABASE_URL (Supabase), JWT_SECRET
```

### Backend

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py                  # → http://localhost:20000
```

### MCP Server (optional)

```bash
python mcp_server.py            # → http://localhost:20002
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # → http://localhost:20001
# .env.local already sets NEXT_PUBLIC_API_URL=http://localhost:20000
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | DB + model health check |
| POST | `/auth/login` | Username/password → 24h JWT |
| POST | `/auth/oauth/token` | API key → 1h scoped JWT (for MCP) |
| POST | `/search` | Semantic search (legislation \| caselaw \| case_events) |
| POST | `/ask` | RAG Q&A, streaming SSE |
| POST | `/chat` | Multi-turn chat, streaming SSE + sources payload |
| GET | `/case/{case_id}/timeline` | Case event list |

---

## Deployment

### 1. Backend (Lambda)

```bash
./build_lambda.sh       # creates lambda.zip
cd terraform
terraform apply         # deploys Lambda + API Gateway + S3 + CloudFront
```

### 2. Frontend (S3 + CloudFront)

```bash
./deploy_frontend.sh    # builds Next.js, syncs to S3, invalidates CloudFront cache
```

---

## Database Setup

Schema is in `schema.sql` — run once against Supabase:

```bash
psql $DATABASE_URL -f schema.sql
```

Ingest demo data:

```bash
python ingest.py                                         # case events (R v Nguyen)
python ingest_law.py legislation_demo.csv legislation    # sample legislation chunks
python ingest_law.py caselaw_demo.csv caselaw            # sample caselaw chunks
```

---

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| `sojung` | `demo1234` | Client view |
| `demo` | `demo` | General user |
| `admin` | `admin1234` | Admin view |

---

## What to Include in a Public Repo

Safe to publish — contains no secrets or account-specific values:

| Path | Notes |
|---|---|
| `main.py`, `mcp_server.py`, `auth.py` | Source code |
| `requirements.txt`, `.env.example` | Dependencies and env template |
| `schema.sql` | DB schema (no data) |
| `ingest.py`, `ingest_law.py` | Data pipeline scripts |
| `build_lambda.sh`, `deploy_frontend.sh` | Deployment scripts |
| `cases/` | Demo case data (JSONL) |
| `frontend/` source | All `app/`, `components/`, config files |
| `terraform/*.tf` | Infrastructure-as-code (no state or secrets) |

**Do not publish:**

| Path | Reason |
|---|---|
| `.env` | Contains API keys |
| `terraform/terraform.tfvars` | Account-specific values |
| `terraform/terraform.tfstate*` | Live infra state — treat as secrets |
| `terraform/.terraform/` | Provider binaries |
| `frontend/out/` | Build artifact — deploy to S3, not git |
| `frontend/node_modules/` | Dependencies |
| `lambda.zip`, `lambda_pkg/` | Build artifacts |

---

## Keep Supabase Alive (Free Tier)

The free Supabase project pauses after 7 days of inactivity. Set up UptimeRobot (free) to ping `/health` every 5 minutes:

```
https://6arf47x0pk.execute-api.ap-southeast-2.amazonaws.com/health
```
