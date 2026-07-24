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
import uuid
import httpx
from contextlib import contextmanager
from fastapi import FastAPI, Header, HTTPException, Query, Request
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
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:20001")
BACKEND_URL          = os.getenv("BACKEND_URL", "http://localhost:20000")

SEED_USERS = {
    "demo":  {"password": os.getenv("DEMO_PASSWORD", "demo1234"),   "name": "Guest",  "role": "user"},
    "admin": {"password": os.getenv("ADMIN_PASSWORD", "admin1234"), "name": "Admin",  "role": "admin"},
}

# Short-lived CSRF tokens for the OAuth dance — in-memory is fine (same request flow)
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


# ── auth ─────────────────────────────────────────────────────────────────────

@contextmanager
def _db():
    conn = psycopg2.connect(DSN)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

SCOPES = ["search", "ask", "chat", "timeline"]
SEED_IDS = {
    "demo":  "00000000-0000-0000-0000-000000000001",
    "admin": "00000000-0000-0000-0000-000000000002",
}

def _make_jwt(sub: str, name: str, role: str, scopes: list[str],
              hours: int = 1, email_verified: bool = True) -> str:
    return jwt.encode({
        "sub":            sub,
        "name":           name,
        "role":           role,
        "scopes":         scopes,
        "email_verified": email_verified,
        "exp":            datetime.now(timezone.utc) + timedelta(hours=hours),
    }, JWT_SECRET, algorithm=JWT_ALG)

def _issue(user_id: str, email: str, name: str, role: str,
           email_verified: bool = True) -> dict:
    access = _make_jwt(email, name, role, SCOPES, hours=1, email_verified=email_verified)
    raw    = secrets.token_urlsafe(48)
    exp    = datetime.now(timezone.utc) + timedelta(days=30)
    with _db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM refresh_tokens WHERE user_id=%s AND expires_at<NOW()", (user_id,))
        cur.execute(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s,%s,%s)",
            (user_id, _h(raw), exp),
        )
    return {"access_token": access, "refresh_token": raw, "token_type": "bearer", "expires_in": 3600}

def _db_user(email: str) -> dict | None:
    with _db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id,email,name,password_hash,salt,role,provider,email_verified "
            "FROM users WHERE email=%s", (email,)
        )
        row = cur.fetchone()
    if not row:
        return None
    return dict(zip(["id","email","name","password_hash","salt","role","provider","email_verified"], row))

def _send_email(to: str, subject: str, html: str, text: str):
    FROM = os.getenv("FROM_EMAIL", "noreply@probonoai.com.au")
    try:
        import boto3
        boto3.client("ses", region_name=os.getenv("AWS_REGION", "ap-southeast-2")).send_email(
            Source=FROM,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html, "Charset": "UTF-8"},
                         "Text": {"Data": text, "Charset": "UTF-8"}},
            },
        )
    except Exception as e:
        print(f"SES_ERROR {e}", flush=True)

def _email_verify(to: str, name: str, token: str):
    link = f"{BACKEND_URL}/auth/verify-email?token={token}"
    _send_email(to, "Verify your ProBono AI email address",
        f'<p>Hi {name},</p><p>Click the link below to verify your email:</p>'
        f'<p><a href="{link}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Verify email</a></p>'
        f'<p style="color:#6b7280;font-size:13px">Link expires in 24 hours. If you didn\'t create an account, ignore this email.</p>',
        f"Verify your email: {link}")

def _email_reset(to: str, name: str, token: str):
    link = f"{FRONTEND_URL}/reset-password/?token={token}"
    _send_email(to, "Reset your ProBono AI password",
        f'<p>Hi {name},</p><p>Click the link below to reset your password:</p>'
        f'<p><a href="{link}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Reset password</a></p>'
        f'<p style="color:#6b7280;font-size:13px">Link expires in 1 hour. If you didn\'t request this, ignore this email.</p>',
        f"Reset your password: {link}")

def _seed_db():
    try:
        with _db() as conn:
            cur = conn.cursor()
            for key, info in SEED_USERS.items():
                cur.execute(
                    "INSERT INTO users (id,email,name,role,provider,email_verified) "
                    "VALUES (%s,%s,%s,%s,'seed',true) ON CONFLICT (id) DO NOTHING",
                    (SEED_IDS[key], key, info["name"], info["role"]),
                )
    except Exception as e:
        print(f"SEED_ERROR {e}", flush=True)

_seed_db()

# ── Pydantic models ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class EmailRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

class OAuthTokenRequest(BaseModel):
    api_key: str
    scopes: list[str] = ["search", "ask", "chat"]

class MCPTokenRequest(BaseModel):
    name: str = "My MCP Token"
    scopes: list[str] = ["search", "ask", "fetch", "collections"]
    expires_days: int = 365

# ── Auth helpers ───────────────────────────────────────────────────────────────

def _require_auth(authorization: str | None) -> str:
    """Validate session JWT, return user_id UUID."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token required")
    try:
        p = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    sub = p.get("sub", "")
    if sub in SEED_IDS:
        return SEED_IDS[sub]
    user = _db_user(sub)
    if not user:
        raise HTTPException(401, "User not found")
    return user["id"]

# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/auth/register")
def auth_register(req: RegisterRequest):
    email = req.email.lower().strip()
    if not req.name.strip():
        raise HTTPException(422, "Name is required")
    if "@" not in email:
        raise HTTPException(422, "Invalid email address")
    if len(req.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")

    with _db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE email=%s", (email,))
        if cur.fetchone():
            raise HTTPException(409, "An account with this email already exists")
        salt    = secrets.token_hex(16)
        user_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO users (id,email,name,password_hash,salt,role,provider,email_verified) "
            "VALUES (%s,%s,%s,%s,%s,'user','local',false)",
            (user_id, email, req.name.strip(), _hash_password(req.password, salt), salt),
        )

    vtok = secrets.token_urlsafe(32)
    vexp = datetime.now(timezone.utc) + timedelta(hours=24)
    with _db() as conn:
        conn.cursor().execute(
            "INSERT INTO email_verifications (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
            (user_id, _h(vtok), vexp),
        )
    _email_verify(email, req.name.strip(), vtok)

    tokens = _issue(user_id, email, req.name.strip(), "user", email_verified=False)
    tokens["user"] = {"username": email, "name": req.name.strip(),
                      "role": "user", "email_verified": False}
    return tokens


@app.post("/auth/login")
def auth_login(req: LoginRequest):
    seed = SEED_USERS.get(req.username)
    if seed and seed["password"] == req.password:
        tokens = _issue(SEED_IDS[req.username], req.username,
                        seed["name"], seed["role"], email_verified=True)
        tokens["user"] = {"username": req.username, "name": seed["name"],
                          "role": seed["role"], "email_verified": True}
        return tokens

    email = req.username.lower().strip()
    user  = _db_user(email)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if user["provider"] == "google":
        raise HTTPException(401, "This account uses Google sign-in. Use 'Continue with Google'.")
    if not _verify_password(req.password, user["salt"] or "", user["password_hash"] or ""):
        raise HTTPException(401, "Invalid email or password")

    tokens = _issue(user["id"], email, user["name"], user["role"],
                    email_verified=user["email_verified"])
    tokens["user"] = {"username": email, "name": user["name"],
                      "role": user["role"], "email_verified": user["email_verified"]}
    return tokens


@app.post("/auth/refresh")
def auth_refresh(req: RefreshRequest):
    with _db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT rt.user_id,u.email,u.name,u.role,u.email_verified "
            "FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id "
            "WHERE rt.token_hash=%s AND rt.expires_at>NOW()",
            (_h(req.refresh_token),),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(401, "Invalid or expired refresh token")
        user_id, email, name, role, ev = row
        cur.execute("DELETE FROM refresh_tokens WHERE token_hash=%s", (_h(req.refresh_token),))

    tokens = _issue(user_id, email, name, role, email_verified=ev)
    tokens["user"] = {"username": email, "name": name, "role": role, "email_verified": ev}
    return tokens


@app.post("/auth/logout")
def auth_logout(req: RefreshRequest):
    with _db() as conn:
        conn.cursor().execute(
            "DELETE FROM refresh_tokens WHERE token_hash=%s", (_h(req.refresh_token),)
        )
    return {"ok": True}


@app.get("/auth/me")
def auth_me(authorization: str = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token required")
    try:
        p = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    return {"username": p.get("sub"), "name": p.get("name"), "role": p.get("role"),
            "email_verified": p.get("email_verified", True), "scopes": p.get("scopes", [])}


@app.get("/auth/verify-email")
def auth_verify_email(token: str = Query(...)):
    h = _h(token)
    with _db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id,user_id FROM email_verifications "
            "WHERE token_hash=%s AND expires_at>NOW() AND used=false", (h,)
        )
        row = cur.fetchone()
        if not row:
            return RedirectResponse(f"{FRONTEND_URL}/login/?error=invalid_link")
        ev_id, user_id = row
        cur.execute("UPDATE email_verifications SET used=true WHERE id=%s", (ev_id,))
        cur.execute("UPDATE users SET email_verified=true WHERE id=%s", (user_id,))
    return RedirectResponse(f"{FRONTEND_URL}/login/?verified=1")


@app.post("/auth/resend-verification")
def auth_resend_verification(req: EmailRequest):
    email = req.email.lower().strip()
    user  = _db_user(email)
    if not user or user["email_verified"]:
        return {"ok": True}
    with _db() as conn:
        conn.cursor().execute(
            "UPDATE email_verifications SET used=true WHERE user_id=%s AND used=false",
            (user["id"],)
        )
    vtok = secrets.token_urlsafe(32)
    vexp = datetime.now(timezone.utc) + timedelta(hours=24)
    with _db() as conn:
        conn.cursor().execute(
            "INSERT INTO email_verifications (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
            (user["id"], _h(vtok), vexp),
        )
    _email_verify(email, user["name"], vtok)
    return {"ok": True}


@app.post("/auth/forgot-password")
def auth_forgot_password(req: EmailRequest):
    email = req.email.lower().strip()
    user  = _db_user(email)
    if not user or user["provider"] == "google":
        return {"ok": True}
    with _db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE password_resets SET used=true WHERE user_id=%s AND used=false", (user["id"],))
        rtok = secrets.token_urlsafe(32)
        rexp = datetime.now(timezone.utc) + timedelta(hours=1)
        cur.execute(
            "INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (%s,%s,%s)",
            (user["id"], _h(rtok), rexp),
        )
    _email_reset(email, user["name"], rtok)
    return {"ok": True}


@app.post("/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest):
    if len(req.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    h = _h(req.token)
    with _db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id,user_id FROM password_resets "
            "WHERE token_hash=%s AND expires_at>NOW() AND used=false", (h,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(400, "Invalid or expired reset link")
        pr_id, user_id = row
        salt    = secrets.token_hex(16)
        pw_hash = _hash_password(req.password, salt)
        cur.execute("UPDATE password_resets SET used=true WHERE id=%s", (pr_id,))
        cur.execute("UPDATE users SET password_hash=%s,salt=%s WHERE id=%s", (pw_hash, salt, user_id))
        cur.execute("DELETE FROM refresh_tokens WHERE user_id=%s", (user_id,))
    return {"ok": True}


@app.post("/auth/mcp/token")
def create_mcp_token(req: MCPTokenRequest, authorization: str = Header(default=None)):
    """Generate a long-lived MCP token. Requires a valid session JWT."""
    user_id = _require_auth(authorization)
    raw      = "mcp-" + secrets.token_urlsafe(32)
    exp      = datetime.now(timezone.utc) + timedelta(days=req.expires_days)
    token_id = str(uuid.uuid4())
    with _db() as conn:
        conn.cursor().execute(
            "INSERT INTO mcp_tokens (id,user_id,token_hash,name,scopes,expires_at) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (token_id, user_id, _h(raw), req.name.strip() or "My MCP Token", req.scopes, exp),
        )
    return {"token": raw, "id": token_id, "name": req.name, "expires_at": exp.isoformat()}


@app.get("/auth/mcp/tokens")
def list_mcp_tokens(authorization: str = Header(default=None)):
    """List the caller's active MCP tokens (raw token is never returned)."""
    user_id = _require_auth(authorization)
    with _db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id,name,scopes,expires_at,last_used_at,created_at "
            "FROM mcp_tokens WHERE user_id=%s AND expires_at>NOW() "
            "ORDER BY created_at DESC",
            (user_id,),
        )
        rows = cur.fetchall()
    return {"tokens": [
        {
            "id":           str(r[0]),
            "name":         r[1],
            "scopes":       r[2],
            "expires_at":   r[3].isoformat() if r[3] else None,
            "last_used_at": r[4].isoformat() if r[4] else None,
            "created_at":   r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]}


@app.delete("/auth/mcp/token/{token_id}")
def revoke_mcp_token(token_id: str, authorization: str = Header(default=None)):
    """Revoke an MCP token by ID."""
    user_id = _require_auth(authorization)
    with _db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM mcp_tokens WHERE id=%s AND user_id=%s", (token_id, user_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Token not found")
    return {"ok": True}


@app.get("/auth/google")
def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(501, "Google OAuth not configured")
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
        raise HTTPException(400, "Invalid OAuth state")
    async with httpx.AsyncClient() as client:
        token_resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  f"{BACKEND_URL}/auth/google/callback",
            "grant_type":    "authorization_code",
        })
        if token_resp.status_code != 200:
            raise HTTPException(400, "OAuth token exchange failed")
        userinfo = (await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_resp.json()['access_token']}"},
        )).json()

    email = userinfo.get("email", "").lower()
    name  = userinfo.get("name", email)
    if not email:
        raise HTTPException(400, "No email returned by Google")

    user = _db_user(email)
    if user:
        user_id = user["id"]
    else:
        user_id = str(uuid.uuid4())
        with _db() as conn:
            conn.cursor().execute(
                "INSERT INTO users (id,email,name,role,provider,email_verified) "
                "VALUES (%s,%s,%s,'user','google',true)",
                (user_id, email, name),
            )

    tokens = _issue(user_id, email, name, user["role"] if user else "user", email_verified=True)
    return RedirectResponse(
        f"{FRONTEND_URL}/auth/callback?token={tokens['access_token']}&refresh={tokens['refresh_token']}"
    )


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
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "20000")), reload=False)


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
