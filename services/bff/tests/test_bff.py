"""
Smoke tests for services/bff/main.py

No real DB or LLM calls.  psycopg2, OpenAIEmbeddings, and ChatOpenAI are all
mocked so the FastAPI app can be constructed without credentials.

Auth behaviour notes (from bff/main.py):
  - /health  : no auth required — always returns 200
  - /search  : uses _get_user_from_header which returns "anon" on missing/bad
                token — so unauthenticated POST /search is allowed (200),
                but will fail at retriever time (DB call).  We mock psycopg2
                and the retriever so we get 200.
  - /ask     : same pattern — anon allowed, retriever mocked.
  - /chat    : same.
"""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Patches applied before any import of the BFF app
# ---------------------------------------------------------------------------

_EMBED_PATCH  = patch("langchain_openai.OpenAIEmbeddings",
                      side_effect=lambda *a, **kw: MagicMock(embed_query=lambda q: [0.0] * 1536))
_LLM_PATCH    = patch("langchain_openai.ChatOpenAI",
                      side_effect=lambda *a, **kw: MagicMock())
_PG_PATCH     = patch("psycopg2.connect", side_effect=Exception("no db in tests"))


def _make_mock_conn(rows=None):
    rows = rows or []
    cur = MagicMock()
    cur.fetchall.return_value = rows
    cur.fetchone.return_value = (1,)   # SELECT 1 for health check
    conn = MagicMock()
    conn.cursor.return_value = cur
    return conn


def _import_app():
    """Import (or reimport) the BFF app under the standard patches."""
    with _EMBED_PATCH, _LLM_PATCH, _PG_PATCH:
        import importlib
        import services.bff.main as bff
        importlib.reload(bff)
        return bff


# ---------------------------------------------------------------------------
# Test: GET /health returns 200 with a "status" key
# ---------------------------------------------------------------------------

class TestHealth(unittest.IsolatedAsyncioTestCase):
    async def test_health_returns_200(self):
        import httpx
        from httpx import ASGITransport

        bff = _import_app()
        # Patch psycopg2 at the BFF module level so the SELECT 1 succeeds
        with patch("psycopg2.connect", return_value=_make_mock_conn()):
            transport = ASGITransport(app=bff.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.get("/health")

        self.assertEqual(response.status_code, 200)

    async def test_health_has_status_key(self):
        import httpx
        from httpx import ASGITransport

        bff = _import_app()
        with patch("psycopg2.connect", return_value=_make_mock_conn()):
            transport = ASGITransport(app=bff.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.get("/health")

        body = response.json()
        self.assertIn("status", body)

    async def test_health_status_is_ok(self):
        import httpx
        from httpx import ASGITransport

        bff = _import_app()
        with patch("psycopg2.connect", return_value=_make_mock_conn()):
            transport = ASGITransport(app=bff.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.get("/health")

        body = response.json()
        self.assertEqual(body["status"], "ok")


# ---------------------------------------------------------------------------
# Test: POST /search without auth — BFF allows anon access (returns 200)
# ---------------------------------------------------------------------------

class TestSearchNoAuth(unittest.IsolatedAsyncioTestCase):
    async def test_search_without_auth_returns_200(self):
        """
        /search uses _get_user_from_header which falls back to 'anon' rather
        than raising 401.  With retriever mocked it should return 200.
        """
        import httpx
        from httpx import ASGITransport
        from langchain_core.documents import Document

        bff = _import_app()

        mock_docs = [
            Document(
                page_content="Bail Act s7 text",
                metadata={"source": "legislation", "citation": "Bail Act 2013 s 7", "score": 0.9},
            )
        ]

        with (
            patch("services.rag.retrievers.LegislationRetriever.invoke", return_value=mock_docs),
            patch("services.bff.main._log_request", new_callable=AsyncMock),
        ):
            transport = ASGITransport(app=bff.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/search",
                    json={"query": "bail conditions", "source": "legislation", "k": 1},
                )

        self.assertEqual(response.status_code, 200)

    async def test_search_response_has_results_key(self):
        import httpx
        from httpx import ASGITransport
        from langchain_core.documents import Document

        bff = _import_app()
        mock_docs = [
            Document(
                page_content="Bail Act s7",
                metadata={"source": "legislation", "citation": "Bail Act 2013 s 7", "score": 0.9},
            )
        ]

        with (
            patch("services.rag.retrievers.LegislationRetriever.invoke", return_value=mock_docs),
            patch("services.bff.main._log_request", new_callable=AsyncMock),
        ):
            transport = ASGITransport(app=bff.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                response = await client.post(
                    "/search",
                    json={"query": "bail conditions", "source": "legislation", "k": 1},
                )

        body = response.json()
        self.assertIn("results", body)


# ---------------------------------------------------------------------------
# Test: app has routes for /search, /ask, /chat
# ---------------------------------------------------------------------------

class TestAppRoutes(unittest.TestCase):
    def _route_paths(self, app):
        from fastapi.routing import APIRoute
        return {route.path for route in app.routes if isinstance(route, APIRoute)}

    def test_search_route_exists(self):
        bff = _import_app()
        self.assertIn("/search", self._route_paths(bff.app))

    def test_ask_route_exists(self):
        bff = _import_app()
        self.assertIn("/ask", self._route_paths(bff.app))

    def test_chat_route_exists(self):
        bff = _import_app()
        self.assertIn("/chat", self._route_paths(bff.app))

    def test_health_route_exists(self):
        bff = _import_app()
        self.assertIn("/health", self._route_paths(bff.app))


if __name__ == "__main__":
    unittest.main()
