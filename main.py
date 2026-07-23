"""
Legal Intelligence Demo API
Port 9300
"""
import os
import re, json, asyncio, secrets
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
load_dotenv()
import psycopg2
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from jose import jwt

from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import Field

# ── config ────────────────────────────────────────────────────────────────────

DSN        = os.getenv("DATABASE_URL", "host=127.0.0.1 port=5432 dbname=bella_legal user=postgres password=postgres")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALG    = "HS256"

DEMO_USERS = {
    "sojung": {"password": os.getenv("SOJUNG_PASSWORD", "demo1234"), "name": "Sojung Kwon", "role": "user"},
    "demo":   {"password": "demo",                                    "name": "Demo User",   "role": "user"},
    "admin":  {"password": os.getenv("ADMIN_PASSWORD", "admin1234"), "name": "Admin",       "role": "admin"},
}

EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")
CHAT_MODEL  = os.getenv("CHAT_MODEL",  "gpt-4o-mini")

# ── embeddings / LLM ─────────────────────────────────────────────────────────
# Switch provider by setting CHAT_MODEL in .env:
#   gpt-4o-mini          → OpenAI  (cheap, good for demos)
#   claude-haiku-4-5     → Anthropic

embedder = OpenAIEmbeddings(model=EMBED_MODEL)

if CHAT_MODEL.startswith("claude-"):
    from langchain_anthropic import ChatAnthropic
    llm = ChatAnthropic(model=CHAT_MODEL, temperature=0.1, max_tokens=2048)
else:
    llm = ChatOpenAI(model=CHAT_MODEL, temperature=0.1, streaming=True)

# ── retrievers ────────────────────────────────────────────────────────────────

class LegislationRetriever(BaseRetriever):
    k: int = Field(default=4)
    jurisdiction: str = Field(default="NSW")

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            if self.jurisdiction == "both":
                cur.execute("""
                    SELECT citation, text, 1 - (embedding <=> %s::vector) AS score
                    FROM legislation_chunks
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (vec_str, vec_str, self.k))
            else:
                cur.execute("""
                    SELECT citation, text, 1 - (embedding <=> %s::vector) AS score
                    FROM legislation_chunks
                    WHERE embedding IS NOT NULL AND jurisdiction = %s
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (vec_str, self.jurisdiction, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(page_content=r[1], metadata={"source": "legislation", "citation": r[0], "score": round(r[2], 4)})
            for r in rows
        ]


class CaselawRetriever(BaseRetriever):
    k: int = Field(default=4)

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT neutral_citation, title, text, 1 - (embedding <=> %s::vector) AS score
                FROM caselaw_chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(page_content=r[2], metadata={"source": "caselaw", "citation": f"{r[1]} ({r[0]})", "score": round(r[3], 4)})
            for r in rows
        ]


class CaseEventRetriever(BaseRetriever):
    k: int = Field(default=5)
    case_id: str = Field(default="nguyen")

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        vec = embedder.embed_query(query)
        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
        conn = psycopg2.connect(DSN)
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT date, category, event_type, subject, content,
                       1 - (embedding <=> %s::vector) AS score
                FROM demo_case_events
                WHERE case_id = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, self.case_id, vec_str, self.k))
            rows = cur.fetchall()
        finally:
            conn.close()
        return [
            Document(
                page_content=f"[{r[1]} — {r[2]}] {r[3]}\n{r[4]}",
                metadata={"source": "case_event", "date": str(r[0]), "category": r[1], "score": round(r[5], 4)}
            )
            for r in rows
        ]

# ── LLM chain ─────────────────────────────────────────────────────────────────

PROMPT = ChatPromptTemplate.from_messages([
    ("system",
     "You are a legal research assistant specialising in NSW law. "
     "Answer based only on the provided context. Be precise and cite sources. "
     "If the context does not contain enough information, say so clearly."),
    ("human", "Context:\n{context}\n\nQuestion: {question}"),
])

def format_docs(docs: list[Document]) -> str:
    parts = []
    for d in docs:
        src = d.metadata.get("citation") or d.metadata.get("case_name") or d.metadata.get("category", "")
        parts.append(f"[{src}]\n{d.page_content}")
    return "\n\n---\n\n".join(parts)

def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Legal Intelligence Demo", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str
    source: str = "legislation"  # legislation | caselaw | case_events
    jurisdiction: str = "NSW"    # NSW | Commonwealth | both
    case_id: str = "nguyen"
    k: int = 5

class AskRequest(BaseModel):
    question: str
    source: str = "legislation"  # legislation | caselaw | both | case_events
    jurisdiction: str = "NSW"    # NSW | Commonwealth | both
    case_id: str = "nguyen"
    k: int = 4


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


# ── auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class OAuthTokenRequest(BaseModel):
    api_key: str
    scopes: list[str] = ["search", "ask", "chat"]

def _make_jwt(sub: str, name: str, role: str, scopes: list[str], hours: int = 24) -> str:
    return jwt.encode({
        "sub":    sub,
        "name":   name,
        "role":   role,
        "scopes": scopes,
        "exp":    datetime.now(timezone.utc) + timedelta(hours=hours),
    }, JWT_SECRET, algorithm=JWT_ALG)

@app.post("/auth/login")
def login(req: LoginRequest):
    user = DEMO_USERS.get(req.username)
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = _make_jwt(req.username, user["name"], user["role"],
                      ["search", "ask", "chat", "timeline"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_in":   86400,
        "user": {"username": req.username, "name": user["name"], "role": user["role"]},
    }

@app.post("/auth/oauth/token")
def oauth_token(req: OAuthTokenRequest):
    """MCP / Custom GPT OAuth token exchange — API key → scoped JWT."""
    valid_keys = json.loads(os.getenv("MCP_API_KEYS", "[]"))
    if req.api_key not in valid_keys and req.api_key != os.getenv("MCP_DEMO_KEY", "lrag-demo"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    token = _make_jwt("mcp-client", "MCP Client", "user", req.scopes, hours=1)
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_in":   3600,
        "scope":        " ".join(req.scopes),
    }


@app.post("/search")
def search(req: SearchRequest):
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    else:
        retriever = LegislationRetriever(k=req.k, jurisdiction=req.jurisdiction)

    docs = retriever.invoke(req.query)
    return {
        "query": req.query,
        "source": req.source,
        "results": [
            {
                "content": d.page_content[:600],
                "metadata": d.metadata,
            }
            for d in docs
        ]
    }


@app.get("/case/{case_id}/timeline")
def timeline(case_id: str):
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT date, category, event_type, subject, summary, content, attachments
            FROM demo_case_events
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
        "total": len(rows),
        "events": [
            {
                "date": str(r[0]),
                "category": r[1],
                "event_type": r[2],
                "subject": r[3],
                "summary": r[4],
                "content": r[5],
                "attachments": r[6],
            }
            for r in rows
        ]
    }


@app.post("/ask")
async def ask(req: AskRequest):
    if req.source == "caselaw":
        retriever = CaselawRetriever(k=req.k)
    elif req.source == "case_events":
        retriever = CaseEventRetriever(k=req.k, case_id=req.case_id)
    elif req.source == "both":
        leg = LegislationRetriever(k=req.k // 2 + 1, jurisdiction=req.jurisdiction)
        cas = CaselawRetriever(k=req.k // 2 + 1)
        leg_docs = leg.invoke(req.question)
        cas_docs = cas.invoke(req.question)
        docs = leg_docs + cas_docs
        context = format_docs(docs)
        chain = PROMPT | llm | StrOutputParser()

        async def stream_both() -> AsyncIterator[str]:
            buffer = ""
            async for chunk in chain.astream({"context": context, "question": req.question}):
                buffer += chunk
                clean = strip_think(buffer)
                if clean:
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            stream_both(),
            media_type="text/event-stream",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"}
        )
    else:
        retriever = LegislationRetriever(k=req.k, jurisdiction=req.jurisdiction)

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | PROMPT
        | llm
        | StrOutputParser()
    )

    async def stream_response() -> AsyncIterator[str]:
        async for chunk in chain.astream(req.question):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=20000, reload=False)


# ── Chat endpoint ─────────────────────────────────────────────────────────────

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

PLAIN_ENGLISH_SYSTEM = """You are a legal assistant helping someone understand their legal situation in plain, everyday English.
You are NOT talking to a lawyer. The person may be stressed or worried.
Rules:
- Use simple language. Avoid jargon. If you must use a legal term, explain it immediately.
- Be warm and clear, not cold and formal.
- Base your answer strictly on the provided legal context. If the context does not cover the question, say so honestly.
- Keep answers concise - 3 to 5 sentences unless the question needs more.
- Do not give personal legal advice. You can explain what the law says and what typically happens."""

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    question: str
    messages: list[ChatMessage] = []
    case_id: str = "nguyen"
    k: int = 5

@app.post("/chat")
async def chat(req: ChatRequest):
    leg = LegislationRetriever(k=req.k, jurisdiction="NSW")
    cas = CaselawRetriever(k=req.k)
    leg_docs = leg.invoke(req.question)
    cas_docs = cas.invoke(req.question)
    all_docs = leg_docs + cas_docs

    sources = []
    for d in all_docs:
        meta = d.metadata
        sources.append({
            "citation": meta.get("citation") or meta.get("case_name") or meta.get("source", ""),
            "content": d.page_content[:300],
            "score": meta.get("score", 0),
            "source_type": meta.get("source", ""),
        })

    context = format_docs(all_docs)

    lc_messages = [
        SystemMessage(content=PLAIN_ENGLISH_SYSTEM + "\n\nRelevant legal context:\n" + context)
    ]
    for m in req.messages[-8:]:
        if m.role == "user":
            lc_messages.append(HumanMessage(content=m.content))
        else:
            lc_messages.append(AIMessage(content=m.content))
    lc_messages.append(HumanMessage(content=req.question))

    async def stream_chat():
        yield f"data: {__import__('json').dumps({'type': 'sources', 'docs': sources})}\n\n"
        buffer = ""
        async for chunk in llm.astream(lc_messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            buffer += token
            before = strip_think(buffer[:-len(token)] if len(token) <= len(buffer) else "")
            after = strip_think(buffer)
            new_text = after[len(before):]
            if new_text:
                yield f"data: {__import__('json').dumps({'type': 'token', 'text': new_text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_chat(),
        media_type="text/event-stream",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

# Lambda handler
from mangum import Mangum
handler = Mangum(app, lifespan='off')
