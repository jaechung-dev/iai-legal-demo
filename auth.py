"""
Auth service for Legal RAG MCP
- POST /auth/token  : exchange API key for JWT
- POST /auth/keys   : create new API key (admin only)
- GET  /auth/keys   : list keys (admin only)
"""
import os, secrets, json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import jwt, JWTError

SECRET_KEY = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
ALGORITHM  = "HS256"
KEYS_FILE  = os.path.join(os.path.dirname(__file__), "api_keys.json")

app = FastAPI(title="Legal RAG Auth", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── key store (file-backed, simple) ──────────────────────────────────────────

def load_keys() -> dict:
    if os.path.exists(KEYS_FILE):
        return json.load(open(KEYS_FILE))
    return {}

def save_keys(keys: dict):
    json.dump(keys, open(KEYS_FILE, "w"), indent=2)

def get_key_record(api_key: str) -> Optional[dict]:
    return load_keys().get(api_key)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_jwt(record: dict, expires_hours: int = 24) -> str:
    payload = {
        "sub":         record["name"],
        "tools":       record["tools"],
        "collections": record["collections"],
        "role":        record["role"],
        "exp":         datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# ── dependency ────────────────────────────────────────────────────────────────

def require_auth(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    return decode_jwt(authorization[7:])

def require_admin(claims: dict = Depends(require_auth)):
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return claims


# ── endpoints ─────────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    api_key: str
    expires_hours: int = 24

class CreateKeyRequest(BaseModel):
    name: str
    role: str = "user"           # admin | user
    tools: list[str] = ["search", "ask", "fetch", "collections"]
    collections: list[str] = ["legislation", "caselaw"]

@app.post("/auth/token")
def get_token(req: TokenRequest):
    record = get_key_record(req.api_key)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid API key")
    token = create_jwt(record, req.expires_hours)
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_hours": req.expires_hours,
        "name":         record["name"],
        "tools":        record["tools"],
        "collections":  record["collections"],
    }

@app.post("/auth/keys")
def create_key(req: CreateKeyRequest, _: dict = Depends(require_admin)):
    keys = load_keys()
    api_key = "lrag-" + secrets.token_urlsafe(24)
    keys[api_key] = {
        "name":        req.name,
        "role":        req.role,
        "tools":       req.tools,
        "collections": req.collections,
        "created_at":  datetime.now(timezone.utc).isoformat(),
    }
    save_keys(keys)
    return {"api_key": api_key, **keys[api_key]}

@app.get("/auth/keys")
def list_keys(_: dict = Depends(require_admin)):
    keys = load_keys()
    return [{"api_key": k[:12] + "...", **v} for k, v in keys.items()]

@app.get("/auth/me")
def whoami(claims: dict = Depends(require_auth)):
    return claims


# ── bootstrap admin key ───────────────────────────────────────────────────────

if __name__ == "__main__":
    keys = load_keys()
    if not keys:
        admin_key = "lrag-" + secrets.token_urlsafe(24)
        keys[admin_key] = {
            "name":        "admin",
            "role":        "admin",
            "tools":       ["search", "ask", "fetch", "collections", "ingest", "delete"],
            "collections": ["legislation", "caselaw", "case_events"],
            "created_at":  datetime.now(timezone.utc).isoformat(),
        }
        save_keys(keys)
        print(f"\n  Admin API key created:\n  {admin_key}\n\n  Save this — it won't be shown again.\n")

    import uvicorn
    uvicorn.run("auth:app", host="0.0.0.0", port=20003, reload=False)
