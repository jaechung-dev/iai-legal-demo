"""
AI Lambda — search, ask, chat.
Full LangChain + OpenAI stack. Cold start ~3s.
Routes: /search  /ask  /chat
"""
import os
import json
import time
import asyncio
import logging
from datetime import datetime, timezone

import psycopg2
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from jose import jwt
from mangum import Mangum
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from services.auth.service import JWT_SECRET, JWT_ALG
from services.rag.retrievers import (
    LegislationRetriever,
    CaselawRetriever,
    CaseEventRetriever,
    CaseChunkRetriever,
    DSN,
    EMBED_MODEL,
)
from services.rag.chains import (
    format_docs,
    stream_single,
    stream_both,
    stream_chat as _stream_chat,
    CHAT_MODEL,
)
from services.rag.prompts import PLAIN_ENGLISH_SYSTEM
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

# ── Pydantic models ────────────────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str
    source: str = "legislation"
    jurisdiction: str = "NSW"
    case_id: str = "nguyen"
    k: int = 5


class AskRequest(BaseModel):
    question: str
    source: str = "legislation"
    jurisdiction: str = "NSW"
    case_id: str = "nguyen"
    k: int = 4


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    messages: list[ChatMessage] = []
    case_id: str | None = None
    k: int = 5


# ── Auth helpers ───────────────────────────────────────────────────────────────


def _get_user_from_header(authorization: str = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        return "anon"
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
        return claims.get("sub", "anon")
    except Exception:
        return "anon"


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


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Legal Intelligence — AI", version="1.0")


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

# ── Routes ─────────────────────────────────────────────────────────────────────


@app.post("/search")
async def search(req: SearchRequest, authorization: str = Header(default=None)):
    user = _get_user_from_header(authorization)
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    else:
        retriever = LegislationRetriever(k=req.k, jurisdiction=req.jurisdiction)

    t0 = time.time()
    docs = retriever.invoke(req.query)
    elapsed_ms = round((time.time() - t0) * 1000)
    logger.info("search query=%r source=%s results=%d ms=%d user=%s", req.query, req.source, len(docs), elapsed_ms, user)

    results = [{"content": d.page_content[:600], "metadata": d.metadata} for d in docs]

    asyncio.create_task(_log_request(
        endpoint="/search",
        user_id=user,
        input_data={"query": req.query, "source": req.source, "k": req.k},
        output_data={"results": results, "count": len(results)},
        elapsed_ms=elapsed_ms,
    ))

    return {"query": req.query, "source": req.source, "results": results}


@app.post("/ask")
async def ask(req: AskRequest, authorization: str = Header(default=None)):
    user = _get_user_from_header(authorization)

    if req.source == "both":
        leg = LegislationRetriever(k=req.k // 2 + 1, jurisdiction=req.jurisdiction)
        cas = CaselawRetriever(k=req.k // 2 + 1)
        leg_docs = leg.invoke(req.question)
        cas_docs = cas.invoke(req.question)
        return StreamingResponse(
            stream_both(leg_docs, cas_docs, req.question, _log_request, user, req.source, req.k),
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

    MIN_CASE_SCORE = 0.35
    leg = LegislationRetriever(k=req.k, jurisdiction="NSW")
    cas = CaselawRetriever(k=req.k)
    all_docs = leg.invoke(req.question) + cas.invoke(req.question)
    case_docs = []
    if req.case_id:
        raw_case_docs = CaseChunkRetriever(case_id=req.case_id, k=req.k).invoke(req.question)
        case_docs = [d for d in raw_case_docs if d.metadata.get("score", 0) >= MIN_CASE_SCORE]
        all_docs = case_docs + all_docs

    sources = [
        {
            "citation":    meta.get("citation") or meta.get("case_name") or meta.get("source", ""),
            "content":     d.page_content,
            "score":       meta.get("score", 0),
            "source_type": meta.get("source", ""),
        }
        for d in all_docs
        for meta in [d.metadata]
    ]

    context = format_docs(all_docs)

    # Hard gate: if a case_id was provided but no documents scored above the
    # threshold, inject an explicit warning so the model does not hallucinate
    # case-specific facts from training data.
    if req.case_id and not case_docs:
        no_doc_warning = (
            "\n\nIMPORTANT: No uploaded case documents were found relevant to this question. "
            "Do NOT answer as though you know the user's specific situation. "
            "If the question is about their personal case, tell them you have no relevant documents "
            "and suggest they upload the relevant documents or consult a qualified lawyer."
        )
    else:
        no_doc_warning = ""

    lc_messages = [
        SystemMessage(content=PLAIN_ENGLISH_SYSTEM + no_doc_warning + "\n\nRelevant legal context:\n" + context)
    ]
    for m in req.messages[-8:]:
        lc_messages.append(
            HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content)
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
        "services.ai.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "20003")),
        reload=False,
    )
