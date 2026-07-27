"""
MCP Lambda entry point — re-exports the handler from services/mcp/server.py.
Lambda handler: mcp_server.handler
"""
from services.mcp.server import app, handler  # noqa: F401
