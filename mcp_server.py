"""
Legal RAG MCP Server — port 20002

Auth: Bearer JWT issued by probonoai.com.au /auth/login.
      Every request must carry:  Authorization: Bearer <jwt>
      Tokens are validated against the same JWT_SECRET as the main API.
"""
import os, json, requests
from dotenv import load_dotenv
load_dotenv()
from mcp.server.fastmcp import FastMCP
from jose import jwt as jose_jwt, JWTError
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
JWT_ALG    = "HS256"
RAG_URL    = os.getenv("RAG_URL", "http://127.0.0.1:20000")

# Paths that don't require auth (MCP negotiation)
_PUBLIC = {"/"}


class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PUBLIC:
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(
                {"error": "Missing Authorization header. Login at probonoai.com.au to get a token."},
                status_code=401,
            )
        token = auth[len("Bearer "):]
        try:
            claims = jose_jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        except JWTError:
            return JSONResponse({"error": "Invalid or expired token."}, status_code=401)

        scopes = claims.get("scopes", [])
        if not scopes:
            return JSONResponse({"error": "Token has no scopes."}, status_code=403)

        request.state.claims = claims
        return await call_next(request)


mcp = FastMCP(
    "Legal RAG",
    instructions="Legal intelligence platform — search NSW legislation and caselaw, ask questions in plain English.",
)


@mcp.tool()
def search(query: str, source: str = "legislation", k: int = 5) -> str:
    """
    Search NSW legislation and caselaw semantically.
    source: 'legislation' | 'caselaw' | 'both' | 'case_events'
    Returns top-k relevant chunks with citations.
    """
    r = requests.post(f"{RAG_URL}/search", json={
        "query": query, "source": source, "jurisdiction": "NSW", "k": k,
    }, timeout=30)
    r.raise_for_status()
    results = r.json()["results"]
    output = f"Search: '{query}' ({source}, {len(results)} results)\n\n"
    for i, res in enumerate(results, 1):
        citation = res["metadata"].get("citation") or res["metadata"].get("case_name", "")
        score    = res["metadata"].get("score", 0)
        output  += f"[{i}] {citation} (relevance: {score})\n{res['content']}\n\n"
    return output


@mcp.tool()
def ask(question: str, source: str = "both", k: int = 5) -> str:
    """
    Ask a legal question in plain English. Returns an answer backed by NSW legislation and caselaw.
    source: 'legislation' | 'caselaw' | 'both'
    """
    r = requests.post(f"{RAG_URL}/chat", json={
        "question": question, "messages": [], "k": k,
    }, timeout=120, stream=True)
    r.raise_for_status()

    answer, sources = "", []
    for line in r.iter_lines():
        if not line:
            continue
        line = line.decode() if isinstance(line, bytes) else line
        if not line.startswith("data: ") or line == "data: [DONE]":
            continue
        try:
            evt = json.loads(line[6:])
            if evt["type"] == "sources":
                sources = evt["docs"]
            elif evt["type"] == "token":
                answer += evt["text"]
        except Exception:
            pass

    output = f"Answer:\n{answer}\n\nSources used:\n"
    for s in sources[:5]:
        output += f"- {s['citation']} ({s['source_type']}, relevance: {s['score']})\n"
    return output


@mcp.tool()
def fetch(case_id: str) -> str:
    """
    Fetch all timeline events for a case.
    case_id: e.g. 'nguyen'
    """
    r = requests.get(f"{RAG_URL}/case/{case_id}/timeline", timeout=15)
    if r.status_code == 404:
        return f"Case '{case_id}' not found."
    r.raise_for_status()
    data   = r.json()
    output = f"Case: {case_id} — {data['total']} events\n\n"
    for e in data["events"]:
        output += f"[{e['date']}] {e['category']} — {e['subject']}\n{e['summary']}\n\n"
    return output


@mcp.tool()
def collections() -> str:
    """List available data collections and their sizes."""
    r = requests.get(f"{RAG_URL}/health", timeout=10)
    r.raise_for_status()
    return (
        "Available collections:\n"
        "- legislation  : 114,920 NSW legislation chunks (OALC corpus, text-embedding-3-small)\n"
        "- caselaw      : 66,547 NSW caselaw paragraph chunks\n"
        "- case_events  : Case event timeline (R v Nguyen)\n"
        f"Model: {r.json().get('model', 'unknown')}"
    )


_mcp_app = mcp.streamable_http_app()

# Middleware applied outer-to-inner: CORS → JWT → MCP
app = CORSMiddleware(
    JWTAuthMiddleware(_mcp_app),
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
    expose_headers=["mcp-session-id"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("mcp_server:app", host="0.0.0.0", port=20002)
