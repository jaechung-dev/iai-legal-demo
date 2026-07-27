"""
API Lambda — auth, intake, conversations, health.
No ML/RAG dependencies; cold start ~1s.
Routes: /health  /auth/*  /intake  /user/*  /case/*/timeline  /conversations
"""
import os
import asyncio
import logging
from uuid import uuid4

import psycopg2
from psycopg2.extras import Json
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from jose import jwt
from pydantic import BaseModel

from services.core.settings import settings
from services.core.middleware import AccessLogMiddleware
from services.auth.service import router as auth_router, seed_db, JWT_SECRET, JWT_ALG

DSN = settings.DATABASE_URL

logger = logging.getLogger(__name__)

# ── Pydantic models ────────────────────────────────────────────────────────────


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"
    case_id: str | None = None


class IntakeRequest(BaseModel):
    personal: dict
    matter: dict
    files: list = []


class FilesUpdate(BaseModel):
    files: list


class TextSnippetRequest(BaseModel):
    text: str
    filename: str = "pasted-text.txt"
    case_id: str | None = None


class ConversationCreate(BaseModel):
    title: str = "New conversation"
    case_id: str | None = None


class ConversationPatch(BaseModel):
    title: str


class ConversationMessageItem(BaseModel):
    role: str
    content: str
    sources: list | None = None


# ── Auth helpers ───────────────────────────────────────────────────────────────


def _get_user_from_header(authorization: str = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        return "anon"
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
        return claims.get("sub", "anon")
    except Exception:
        return "anon"


def _require_auth(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALG])
        user_id = claims.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── S3 client (boto3 provided by Lambda runtime) ───────────────────────────────

UPLOADS_BUCKET = settings.UPLOADS_BUCKET
_AWS_REGION    = settings.AWS_REGION_NAME

try:
    import boto3 as _boto3
    _s3 = _boto3.client("s3", region_name=_AWS_REGION)
except ImportError:
    _s3 = None

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Legal Intelligence — API", version="1.0")

app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
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
    return {"status": "ok", "db": db}


@app.post("/intake/upload-url")
async def intake_upload_url(req: UploadUrlRequest, authorization: str = Header(default=None)):
    if not _s3 or not UPLOADS_BUCKET:
        raise HTTPException(status_code=501, detail="File uploads not configured")
    user_id = _get_user_from_header(authorization)
    safe_name = os.path.basename(req.filename)
    key = f"intakes/{user_id}/{uuid4()}/{safe_name}"
    params: dict = {"Bucket": UPLOADS_BUCKET, "Key": key, "ContentType": req.content_type}
    if req.case_id:
        params["Metadata"] = {"case-id": req.case_id}
    url = _s3.generate_presigned_url("put_object", Params=params, ExpiresIn=300,
                                     HttpMethod="PUT")
    return {"upload_url": url, "key": key, "max_bytes": 25 * 1024 * 1024}


@app.post("/intake/paste-text")
async def intake_paste_text(req: TextSnippetRequest, authorization: str = Header(default=None)):
    """Upload plain text or pasted email content directly (no file picker required)."""
    if not _s3 or not UPLOADS_BUCKET:
        raise HTTPException(status_code=501, detail="File uploads not configured")
    user_id = _get_user_from_header(authorization)
    if len(req.text.encode()) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Text exceeds 25 MB limit")
    safe_name = os.path.basename(req.filename)
    if not safe_name.endswith(".txt"):
        safe_name += ".txt"
    key = f"intakes/{user_id}/{uuid4()}/{safe_name}"
    meta = {"case-id": req.case_id} if req.case_id else {}
    _s3.put_object(
        Bucket=UPLOADS_BUCKET,
        Key=key,
        Body=req.text.encode("utf-8"),
        ContentType="text/plain",
        Metadata=meta,
    )
    return {"key": key, "name": safe_name, "size": len(req.text.encode())}


@app.post("/intake")
async def submit_intake(req: IntakeRequest, authorization: str = Header(default=None)):
    user_id = _get_user_from_header(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO case_intakes (user_id, personal, matter, files) "
            "VALUES (%s, %s, %s, %s) RETURNING id, created_at",
            (user_id, Json(req.personal), Json(req.matter), Json(req.files)),
        )
        row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "id": str(row[0]), "created_at": row[1].isoformat()}


@app.get("/user/case")
async def get_user_case(authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, matter, created_at FROM case_intakes "
            "WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return {"case": None}
    return {"case": {"id": str(row[0]), "matter": row[1], "created_at": row[2].isoformat()}}


@app.get("/user/cases")
async def list_user_cases(authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, matter, files, created_at FROM case_intakes "
            "WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    return [
        {
            "id": str(r[0]),
            "matter": r[1],
            "file_count": len(r[2]) if r[2] else 0,
            "created_at": r[3].isoformat(),
        }
        for r in rows
    ]


@app.get("/case/{case_id}")
async def get_case_detail(case_id: str, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, personal, matter, files, created_at, user_id FROM case_intakes WHERE id = %s",
            (case_id,),
        )
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Case not found")
    if row[5] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": str(row[0]),
        "personal": row[1],
        "matter": row[2],
        "files": row[3] or [],
        "created_at": row[4].isoformat(),
    }


@app.delete("/case/{case_id}", status_code=204)
async def delete_case(case_id: str, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM case_intakes WHERE id = %s", (case_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        cur.execute("DELETE FROM case_chunks WHERE case_id = %s", (case_id,))
        cur.execute("DELETE FROM case_intakes WHERE id = %s", (case_id,))
        conn.commit()
    finally:
        conn.close()


@app.patch("/case/{case_id}/files")
async def update_case_files(case_id: str, req: FilesUpdate, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id, files FROM case_intakes WHERE id = %s", (case_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Case not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")

        # Delete chunks for any files that were removed
        old_keys = {f["key"] for f in (row[1] or []) if f.get("key")}
        new_keys = {f["key"] for f in req.files if f.get("key")}
        removed_keys = old_keys - new_keys
        if removed_keys:
            cur.execute(
                "DELETE FROM case_chunks WHERE case_id = %s AND metadata->>'source_key' = ANY(%s)",
                (case_id, list(removed_keys)),
            )

        cur.execute(
            "UPDATE case_intakes SET files = %s WHERE id = %s",
            (Json(req.files), case_id),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@app.get("/case/{case_id}/timeline")
def timeline(case_id: str):
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT date, category, event_type, subject, summary, content, attachments "
            "FROM case_events WHERE case_id = %s ORDER BY date ASC",
            (case_id,),
        )
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
                "date": str(r[0]), "category": r[1], "event_type": r[2],
                "subject": r[3], "summary": r[4], "content": r[5], "attachments": r[6],
            }
            for r in rows
        ],
    }


# ── Conversations ──────────────────────────────────────────────────────────────


@app.get("/conversations")
async def list_conversations(authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, title, updated_at, case_id FROM conversations "
            "WHERE user_id = %s ORDER BY updated_at DESC LIMIT 50",
            (user_id,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    return [
        {"id": str(r[0]), "title": r[1], "updated_at": r[2].isoformat(), "case_id": r[3]}
        for r in rows
    ]


@app.post("/conversations", status_code=201)
async def create_conversation(req: ConversationCreate, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO conversations (user_id, title, case_id) VALUES (%s, %s, %s) "
            "RETURNING id, title, updated_at, case_id",
            (user_id, req.title[:200], req.case_id),
        )
        row = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    return {"id": str(row[0]), "title": row[1], "updated_at": row[2].isoformat(), "case_id": row[3]}


@app.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, title, updated_at, case_id, user_id FROM conversations WHERE id = %s",
            (conv_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if row[4] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        cur.execute(
            "SELECT id, role, content, sources, created_at FROM conversation_messages "
            "WHERE conversation_id = %s ORDER BY created_at ASC",
            (conv_id,),
        )
        msgs = cur.fetchall()
    finally:
        conn.close()
    return {
        "id": str(row[0]),
        "title": row[1],
        "updated_at": row[2].isoformat(),
        "case_id": row[3],
        "messages": [
            {"id": str(m[0]), "role": m[1], "content": m[2], "sources": m[3], "created_at": m[4].isoformat()}
            for m in msgs
        ],
    }


@app.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        cur.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
        conn.commit()
    finally:
        conn.close()


@app.patch("/conversations/{conv_id}")
async def patch_conversation(conv_id: str, req: ConversationPatch, authorization: str = Header(default=None)):
    user_id = _require_auth(authorization)
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        cur.execute(
            "UPDATE conversations SET title = %s, updated_at = NOW() WHERE id = %s "
            "RETURNING id, title, updated_at, case_id",
            (req.title[:200], conv_id),
        )
        updated = cur.fetchone()
        conn.commit()
    finally:
        conn.close()
    return {
        "id": str(updated[0]), "title": updated[1],
        "updated_at": updated[2].isoformat(), "case_id": updated[3],
    }


@app.post("/conversations/{conv_id}/messages", status_code=201)
async def append_messages(
    conv_id: str,
    messages: list[ConversationMessageItem],
    authorization: str = Header(default=None),
):
    user_id = _require_auth(authorization)
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if row[0] != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        for msg in messages:
            if msg.role not in ("user", "assistant"):
                raise HTTPException(status_code=400, detail=f"Invalid role: {msg.role}")
            cur.execute(
                "INSERT INTO conversation_messages (conversation_id, role, content, sources) "
                "VALUES (%s, %s, %s, %s)",
                (conv_id, msg.role, msg.content, Json(msg.sources) if msg.sources else None),
            )
        cur.execute("UPDATE conversations SET updated_at = NOW() WHERE id = %s", (conv_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "count": len(messages)}


# ── Lambda handler ─────────────────────────────────────────────────────────────

handler = Mangum(app, lifespan="off")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "services.api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "20000")),
        reload=False,
    )
