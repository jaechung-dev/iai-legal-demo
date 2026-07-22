"""
Legal RAG MCP Server — port 20002
Tools: search, ask, fetch, collections
Auth: JWT Bearer token (get one from /auth/token on port 20003)
"""
import os, json, requests
from typing import Any
from mcp.server.fastmcp import FastMCP
from jose import jwt, JWTError
from starlette.requests import Request
from starlette.middleware.cors import CORSMiddleware

SECRET_KEY = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
ALGORITHM  = "HS256"
RAG_URL    = os.getenv("RAG_URL", "http://127.0.0.1:20000")

mcp = FastMCP(
    "Legal RAG",
    instructions="Legal intelligence platform — search NSW legislation and caselaw, ask questions in plain English.",
)


# ── auth helper ───────────────────────────────────────────────────────────────

DEFAULT_JWT = os.getenv("MCP_DEFAULT_JWT", "")

def get_claims(token: str) -> dict:
    t = token or DEFAULT_JWT
    if not t:
        raise PermissionError("No JWT token provided")
    try:
        return jwt.decode(t, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise PermissionError(f"Invalid token: {e}")

def check_tool(claims: dict, tool: str):
    if tool not in claims.get("tools", []):
        raise PermissionError(f"Token does not permit tool: {tool}")


# ── tools ─────────────────────────────────────────────────────────────────────

@mcp.tool()
def search(query: str, source: str = "legislation", k: int = 5, jwt_token: str = "") -> str:
    """
    Search NSW legislation and caselaw semantically.
    source: 'legislation' | 'caselaw' | 'both' | 'case_events'
    Returns top-k relevant chunks with citations.
    """
    claims = get_claims(jwt_token)
    check_tool(claims, "search")

    r = requests.post(f"{RAG_URL}/search", json={
        "query": query, "source": source,
        "jurisdiction": "NSW", "k": k
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
def ask(question: str, source: str = "both", k: int = 5, jwt_token: str = "") -> str:
    """
    Ask a legal question in plain English. Returns an answer backed by NSW legislation and caselaw.
    source: 'legislation' | 'caselaw' | 'both'
    """
    claims = get_claims(jwt_token)
    check_tool(claims, "ask")

    r = requests.post(f"{RAG_URL}/chat", json={
        "question": question,
        "messages": [],
        "k": k,
    }, timeout=120, stream=True)
    r.raise_for_status()

    answer  = ""
    sources = []
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
def fetch(case_id: str, jwt_token: str = "") -> str:
    """
    Fetch all timeline events for a case.
    case_id: e.g. 'nguyen'
    """
    claims = get_claims(jwt_token)
    check_tool(claims, "fetch")

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
def collections(jwt_token: str = "") -> str:
    """
    List available data collections and their sizes.
    """
    claims = get_claims(jwt_token)
    check_tool(claims, "collections")

    r = requests.get(f"{RAG_URL}/health", timeout=10)
    r.raise_for_status()

    return (
        "Available collections:\n"
        "- legislation  : 114,920 NSW legislation chunks (OALC corpus, BGE-M3 embedded)\n"
        "- caselaw      : 66,547 NSW caselaw paragraph chunks\n"
        "- case_events  : Demo case event timeline (R v Nguyen)\n"
        f"Model: {r.json().get('model', 'unknown')}"
    )


# expose as ASGI app for uvicorn
_mcp_app = mcp.streamable_http_app()
app = CORSMiddleware(
    _mcp_app,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["mcp-session-id"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("mcp_server:app", host="0.0.0.0", port=20002)
