"""
BFF (Backend-for-Frontend) — thin FastAPI layer.

Imports domain logic from services/ and exposes:
  GET  /health
  POST /search
  GET  /case/{case_id}/timeline
  POST /ask
  POST /chat

Auth routes are handled by services/auth/service.py via APIRouter.
"""
import os
import json
import time
import asyncio
import logging
from datetime import datetime, timezone
from typing import AsyncIterator

import psycopg2
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from jose import jwt
from mangum import Mangum
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from services.auth.service import (
    router as auth_router,
    seed_db,
    JWT_SECRET,
    JWT_ALG,
)
from services.rag.retrievers import (
    LegislationRetriever,
    CaselawRetriever,
    CaseEventRetriever,
    DSN,
    EMBED_MODEL,
)
from services.rag.chains import (
    llm,
    format_docs,
    strip_think,
    stream_single,
    stream_both,
    stream_chat as _stream_chat,
    CHAT_MODEL,
)
from services.rag.prompts import PLAIN_ENGLISH_SYSTEM

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

# ── Audit logging ──────────────────────────────────────────────────────────────


def _write_request_log(
    endpoint: str, user_id: str, input_data: dict,
    output_data: dict, elapsed_ms: int,
) -> None:
    try:
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO request_logs (endpoint, user_id, input, output, elapsed_ms) "
                "VALUES (%s, %s, %s::jsonb, %s::jsonb, %s)",
                (endpoint, user_id, json.dumps(input_data), json.dumps(output_data), elapsed_ms),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.warning("request_log failed: %s", e)


async def _log_request(
    endpoint: str, user_id: str, input_data: dict,
    output_data: dict, elapsed_ms: int,
) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, _write_request_log, endpoint, user_id, input_data, output_data, elapsed_ms
    )


# ── Pydantic models ────────────────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str
    source: str = "legislation"   # legislation | caselaw | case_events
    jurisdiction: str = "NSW"     # NSW | Commonwealth | both
    case_id: str = "nguyen"
    k: int = 5


class AskRequest(BaseModel):
    question: str
    source: str = "legislation"   # legislation | caselaw | both | case_events
    jurisdiction: str = "NSW"     # NSW | Commonwealth | both
    case_id: str = "nguyen"
    k: int = 4


class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    messages: list[ChatMessage] = []
    case_id: str = "nguyen"
    k: int = 5


# ── Auth helper ────────────────────────────────────────────────────────────────


def _get_user_from_header(authorization: str = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        return "anon"
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
        return claims.get("sub", "anon")
    except Exception:
        return "anon"


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Legal Intelligence", version="1.0")


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = round((time.time() - start) * 1000)
        ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or request.headers.get("x-real-ip", "")
            or (request.client.host if request.client else "-")
        )
        user = "-"
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            try:
                payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALG])
                user = payload.get("sub", "-")
            except Exception:
                pass
        print(
            f'ACCESS {datetime.now(timezone.utc).isoformat()} '
            f'ip={ip} method={request.method} path={request.url.path} '
            f'status={response.status_code} ms={duration_ms} user={user}',
            flush=True,
        )
        return response


app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount auth router
app.include_router(auth_router)

# Seed demo users
seed_db()

# ── Routes ─────────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    try:
        conn = psycopg2.connect(DSN)
        conn.cursor().execute("SELECT 1")
        conn.close()
        db = "ok"
    except Exception as e:
        db = str(e)
    return {"status": "ok", "db": db, "model": CHAT_MODEL}


@app.post("/search")
async def search(req: SearchRequest, authorization: str = Header(default=None)):
    user = _get_user_from_header(authorization)
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    else:
        retriever = LegislationRetriever(k=req.k, jurisdiction=req.jurisdiction)

    logger.info("search query=%r source=%s k=%d user=%s", req.query, req.source, req.k, user)
    t0 = time.time()
    docs = retriever.invoke(req.query)
    elapsed_ms = round((time.time() - t0) * 1000)
    logger.info(
        "search query=%r source=%s k=%d user=%s results=%d elapsed_ms=%d",
        req.query, req.source, req.k, user, len(docs), elapsed_ms,
    )

    results = [{"content": d.page_content[:600], "metadata": d.metadata} for d in docs]

    asyncio.create_task(_log_request(
        endpoint="/search",
        user_id=user,
        input_data={"query": req.query, "source": req.source, "k": req.k},
        output_data={"results": results, "count": len(results)},
        elapsed_ms=elapsed_ms,
    ))

    return {"query": req.query, "source": req.source, "results": results}


@app.get("/case/{case_id}/timeline")
def timeline(case_id: str):
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT date, category, event_type, subject, summary, content, attachments
            FROM case_events
            WHERE case_id = %s
            ORDER BY date ASC
        """, (case_id,))
        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    return {
        "case_id": case_id,
        "total":   len(rows),
        "events": [
            {
                "date":        str(r[0]),
                "category":    r[1],
                "event_type":  r[2],
                "subject":     r[3],
                "summary":     r[4],
                "content":     r[5],
                "attachments": r[6],
            }
            for r in rows
        ],
    }


@app.post("/ask")
async def ask(req: AskRequest, authorization: str = Header(default=None)):
    user = _get_user_from_header(authorization)
    logger.info("ask question=%r source=%s k=%d user=%s", req.question[:120], req.source, req.k, user)

    if req.source == "both":
        leg = LegislationRetriever(k=req.k // 2 + 1, jurisdiction=req.jurisdiction)
        cas = CaselawRetriever(k=req.k // 2 + 1)
        leg_docs = leg.invoke(req.question)
        cas_docs = cas.invoke(req.question)
        return StreamingResponse(
            stream_both(
                leg_docs, cas_docs, req.question, _log_request,
                user, req.source, req.k,
            ),
            media_type="text/event-stream",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )

    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    else:
        retriever = LegislationRetriever(k=req.k, jurisdiction=req.jurisdiction)

    return StreamingResponse(
        stream_single(retriever, req.question, _log_request, user, req.source, req.k),
        media_type="text/event-stream",
    )


@app.post("/chat")
async def chat(req: ChatRequest, authorization: str = Header(default=None)):
    user = _get_user_from_header(authorization)
    logger.info(
        "chat question=%r messages=%d case_id=%s user=%s",
        req.question[:120], len(req.messages), req.case_id, user,
    )

    leg = LegislationRetriever(k=req.k, jurisdiction="NSW")
    cas = CaselawRetriever(k=req.k)
    all_docs = leg.invoke(req.question) + cas.invoke(req.question)

    sources = [
        {
            "citation":    meta.get("citation") or meta.get("case_name") or meta.get("source", ""),
            "content":     d.page_content[:300],
            "score":       meta.get("score", 0),
            "source_type": meta.get("source", ""),
        }
        for d in all_docs
        for meta in [d.metadata]
    ]

    context     = format_docs(all_docs)
    lc_messages = [
        SystemMessage(content=PLAIN_ENGLISH_SYSTEM + "\n\nRelevant legal context:\n" + context)
    ]
    for m in req.messages[-8:]:
        lc_messages.append(
            HumanMessage(content=m.content) if m.role == "user"
            else AIMessage(content=m.content)
        )
    lc_messages.append(HumanMessage(content=req.question))

    messages_raw = [{"role": m.role, "content": m.content} for m in req.messages]

    return StreamingResponse(
        _stream_chat(
            lc_messages, sources, req.question, messages_raw,
            req.case_id, req.k, _log_request, user,
        ),
        media_type="text/event-stream",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
        },
    )


# ── Lambda handler ─────────────────────────────────────────────────────────────

handler = Mangum(app, lifespan="off")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "services.bff.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "20000")),
        reload=False,
    )
