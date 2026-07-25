"""
Entry point — re-exports the FastAPI app and Lambda handler from the BFF service.

All logic lives under services/:
  services/bff/main.py    — FastAPI app, BFF routes (/search, /ask, /chat, /health)
  services/auth/service.py — auth routes (/auth/*)
  services/rag/            — retrievers, chains, prompts
  services/mcp/server.py   — MCP server (separate Lambda / process)
"""
from services.bff.main import app, handler  # noqa: F401

if __name__ == "__main__":
    import uvicorn
    import os
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "20000")), reload=False)
