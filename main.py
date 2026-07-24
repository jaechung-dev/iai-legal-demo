"""
Legal Intelligence API
"""
import os
import re, json, asyncio, secrets, hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from dotenv import load_dotenv
load_dotenv()
import psycopg2
from typing import AsyncIterator

import time
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
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

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:3131")
BACKEND_URL          = os.getenv("BACKEND_URL", "http://localhost:20000")

SEED_USERS = {
    "demo":  {"password": "demo1234",                                "name": "Guest",  "role": "user"},
    "admin": {"password": os.getenv("ADMIN_PASSWORD", "admin1234"), "name": "Admin",  "role": "admin"},
}

# In-memory user store for registered users {username: {name, email, password_hash, salt, role}}
REGISTERED_USERS: dict = {}
# In-memory OAuth state tokens for CSRF protection
OAUTH_STATES: dict = {}

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def _verify_password(password: str, salt: str, stored_hash: str) -> bool:
    return _hash_password(password, salt) == stored_hash

EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")
CHAT_MODEL  = os.getenv("CHAT_MODEL",  "gpt-4o-mini")

# ── embeddings / LLM ─────────────────────────────────────────────────────────
# Switch provider by setting CHAT_MODEL in .env:
#   gpt-4o-mini          → OpenAI
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
    key = req.username.lower().strip()
    # Check seed users (plain-text passwords)
    seed = SEED_USERS.get(req.username)
    if seed and seed["password"] == req.password:
        token = _make_jwt(req.username, seed["name"], seed["role"],
                          ["search", "ask", "chat", "timeline"])
        return {
            "access_token": token,
            "token_type":   "bearer",
            "expires_in":   86400,
            "user": {"username": req.username, "name": seed["name"], "role": seed["role"]},
        }
    # Check registered users (hashed passwords)
    reg = REGISTERED_USERS.get(key)
    if reg and reg["password_hash"] and _verify_password(req.password, reg["salt"], reg["password_hash"]):
        token = _make_jwt(key, reg["name"], reg["role"],
                          ["search", "ask", "chat", "timeline"])
        return {
            "access_token": token,
            "token_type":   "bearer",
            "expires_in":   86400,
            "user": {"username": key, "name": reg["name"], "role": reg["role"]},
        }
    raise HTTPException(status_code=401, detail="Invalid username or password")

@app.post("/auth/oauth/token")
def oauth_token(req: OAuthTokenRequest):
    """MCP / Custom GPT OAuth token exchange — API key → scoped JWT."""
    valid_keys = json.loads(os.getenv("MCP_API_KEYS", "[]"))
    if req.api_key not in valid_keys and req.api_key != os.getenv("MCP_KEY", "lrag-demo"):
        raise HTTPException(status_code=401, detail="Invalid API key")
    token = _make_jwt("mcp-client", "MCP Client", "user", req.scopes, hours=1)
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_in":   3600,
        "scope":        " ".join(req.scopes),
    }


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

@app.post("/auth/register")
def register(req: RegisterRequest):
    username = req.email.lower().strip()
    if username in SEED_USERS or username in REGISTERED_USERS:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    salt = secrets.token_hex(16)
    REGISTERED_USERS[username] = {
        "name": req.name.strip(),
        "email": username,
        "password_hash": _hash_password(req.password, salt),
        "salt": salt,
        "role": "user",
    }
    token = _make_jwt(username, req.name.strip(), "user", ["search", "ask", "chat", "timeline"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_in":   86400,
        "user": {"username": username, "name": req.name.strip(), "role": "user"},
    }


@app.get("/auth/google")
def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET")
    state = secrets.token_urlsafe(32)
    OAUTH_STATES[state] = True
    params = urlencode({
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  f"{BACKEND_URL}/auth/google/callback",
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "state":         state,
        "prompt":        "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@app.get("/auth/google/callback")
async def google_callback(code: str = Query(...), state: str = Query(...)):
    if not OAUTH_STATES.pop(state, None):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri":  f"{BACKEND_URL}/auth/google/callback",
                "grant_type":    "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange OAuth code")
        token_data = token_resp.json()

        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        userinfo = info_resp.json()

    email = userinfo.get("email", "").lower()
    name  = userinfo.get("name", email)
    if email not in REGISTERED_USERS and email not in SEED_USERS:
        salt = secrets.token_hex(16)
        REGISTERED_USERS[email] = {
            "name": name, "email": email,
            "password_hash": "", "salt": salt, "role": "user",
        }

    jwt_token = _make_jwt(email, name, "user", ["search", "ask", "chat", "timeline"])
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


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
