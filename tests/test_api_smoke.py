"""
Smoke tests for the ProBono AI production API.
  Target: https://api.probonoai.com.au
  Backend: FastAPI on AWS Lambda via Mangum

Tests run in numbered order. Module-level state (tokens) is set by earlier
tests and consumed by later ones — run the full suite, not individual tests.

Run:
    pytest tests/test_api_smoke.py -v
    pytest tests/test_api_smoke.py -v -s   # to see print output
"""
import json
import warnings

import pytest
import requests

from tests.conftest import BASE_URL, DEMO_PASSWORD

# ── Shared state (populated by tests as they run) ─────────────────────────────

_access_token: str | None = None
_refresh_token: str | None = None

TIMEOUT = 30  # seconds


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth_headers() -> dict:
    if not _access_token:
        pytest.skip("No access_token available — login test must pass first")
    return {"Authorization": f"Bearer {_access_token}"}


def _parse_sse_line(line: str) -> dict | None:
    """
    Parse a single SSE line of the form:
        data: <json>
    Returns the decoded dict, or None if the line is not a data event.
    """
    line = line.strip()
    if not line.startswith("data:"):
        return None
    payload = line[len("data:"):].strip()
    if payload == "[DONE]":
        return {"__done__": True}
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.order(1)
def test_01_health():
    """GET /health → 200, body has status: 'ok'."""
    r = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("status") == "ok", f"Expected status='ok', got: {body}"
    print(f"\n  /health response: {body}")


@pytest.mark.order(2)
def test_02_login_demo():
    """POST /auth/login with demo credentials → tokens + user object."""
    global _access_token, _refresh_token

    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "demo", "password": DEMO_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()

    assert "access_token" in body, f"Missing access_token: {body}"
    assert "refresh_token" in body, f"Missing refresh_token: {body}"
    assert "user" in body, f"Missing user object: {body}"

    user = body["user"]
    assert "email_verified" in user, f"Missing user.email_verified: {user}"

    _access_token = body["access_token"]
    _refresh_token = body["refresh_token"]

    print(f"\n  Logged in as: {user}")
    print(f"  email_verified: {user['email_verified']}")
    print(f"  access_token (first 40): {_access_token[:40]}…")


@pytest.mark.order(3)
def test_03_me():
    """GET /auth/me with Bearer token → username, name, role."""
    r = requests.get(
        f"{BASE_URL}/auth/me",
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()

    assert "username" in body, f"Missing username: {body}"
    assert "name" in body, f"Missing name: {body}"
    assert "role" in body, f"Missing role: {body}"

    print(f"\n  /auth/me response: {body}")


@pytest.mark.order(4)
def test_04_refresh():
    """POST /auth/refresh → new access_token."""
    global _access_token, _refresh_token

    if not _refresh_token:
        pytest.skip("No refresh_token available — login test must pass first")

    r = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refresh_token": _refresh_token},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()

    assert "access_token" in body, f"Missing access_token in refresh response: {body}"

    old = _access_token
    _access_token = body["access_token"]
    # Refresh tokens are rotated — update if a new one was issued
    if "refresh_token" in body:
        _refresh_token = body["refresh_token"]

    print(f"\n  Token refreshed.")
    print(f"  Old token (first 40): {old[:40] if old else 'None'}…")
    print(f"  New token (first 40): {_access_token[:40]}…")


@pytest.mark.order(5)
def test_05_search_legislation():
    """POST /search legislation → list of results, each with content and metadata."""
    r = requests.post(
        f"{BASE_URL}/search",
        json={"query": "bail conditions", "source": "legislation", "k": 3},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()

    assert "results" in body, f"Missing 'results' key: {body}"
    results = body["results"]
    assert isinstance(results, list), f"Expected results to be a list, got: {type(results)}"

    print(f"\n  Legislation search returned {len(results)} result(s)")

    if not results:
        warnings.warn(
            "No legislation results returned — the database may be empty or "
            "embeddings not yet ingested.",
            UserWarning,
            stacklevel=1,
        )
    else:
        for i, result in enumerate(results):
            assert "content" in result, f"Result {i} missing 'content': {result}"
            assert isinstance(result["content"], str) and result["content"].strip(), (
                f"Result {i} 'content' is empty or not a string: {result}"
            )
            assert "metadata" in result, f"Result {i} missing 'metadata': {result}"
            print(f"  [{i}] {result['metadata'].get('citation', '(no citation)')} "
                  f"— score={result['metadata'].get('score', '?')}")


@pytest.mark.order(6)
def test_06_search_caselaw():
    """POST /search caselaw → list of results, each with content and metadata."""
    r = requests.post(
        f"{BASE_URL}/search",
        json={"query": "domestic violence protection order", "source": "caselaw", "k": 3},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()

    assert "results" in body, f"Missing 'results' key: {body}"
    results = body["results"]
    assert isinstance(results, list), f"Expected results to be a list, got: {type(results)}"

    print(f"\n  Caselaw search returned {len(results)} result(s)")

    if not results:
        warnings.warn(
            "No caselaw results returned — the database may be empty or "
            "embeddings not yet ingested.",
            UserWarning,
            stacklevel=1,
        )
    else:
        for i, result in enumerate(results):
            assert "content" in result, f"Result {i} missing 'content': {result}"
            assert isinstance(result["content"], str) and result["content"].strip(), (
                f"Result {i} 'content' is empty or not a string: {result}"
            )
            assert "metadata" in result, f"Result {i} missing 'metadata': {result}"
            print(f"  [{i}] {result['metadata'].get('citation', '(no citation)')} "
                  f"— score={result['metadata'].get('score', '?')}")


@pytest.mark.order(7)
def test_07_ask_streams():
    """
    POST /ask → SSE stream.

    The /ask endpoint (unlike /chat) emits:
        data: {"text": "<chunk>"}\n\n
        data: [DONE]\n\n

    We collect all data lines, assert at least one non-empty "text" chunk
    was received before [DONE].
    """
    r = requests.post(
        f"{BASE_URL}/ask",
        json={"question": "What is bail?", "source": "legislation", "k": 3},
        headers={**_auth_headers(), "Accept": "text/event-stream"},
        stream=True,
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    content_type = r.headers.get("content-type", "")
    assert "text/event-stream" in content_type, (
        f"Expected text/event-stream content-type, got: {content_type}"
    )

    token_chunks: list[str] = []
    done_received = False

    for raw_line in r.iter_lines(decode_unicode=True):
        if not raw_line:
            continue  # blank line separating SSE events
        parsed = _parse_sse_line(raw_line)
        if parsed is None:
            continue
        if parsed.get("__done__"):
            done_received = True
            break
        # /ask emits {"text": "..."} directly (no "type" wrapper)
        text = parsed.get("text")
        if text:
            token_chunks.append(text)

    full_response = "".join(token_chunks)
    total_chars = len(full_response)

    print(f"\n  SSE streaming: received {len(token_chunks)} chunk(s), "
          f"{total_chars} total char(s)")
    print(f"  [DONE] received: {done_received}")
    if full_response:
        preview = full_response[:120].replace("\n", " ")
        print(f"  Response preview: {preview!r}…")

    assert token_chunks, (
        "No 'text' chunks received from /ask stream. "
        "The LLM may have failed to respond, or the SSE format changed."
    )
    assert full_response.strip(), "All received text chunks were empty."
    assert done_received, "Stream ended without [DONE] sentinel."


@pytest.mark.order(8)
def test_08_logout():
    """POST /auth/logout → {ok: true}."""
    if not _refresh_token:
        pytest.skip("No refresh_token available — login test must pass first")

    r = requests.post(
        f"{BASE_URL}/auth/logout",
        json={"refresh_token": _refresh_token},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("ok") is True, f"Expected ok=true, got: {body}"
    print(f"\n  Logout response: {body}")


@pytest.mark.order(9)
def test_09_me_after_logout():
    """
    GET /auth/me after logout.

    The /auth/me endpoint validates JWTs locally (stateless — no DB lookup).
    The access token is NOT blacklisted on logout; only the refresh token is
    deleted from the DB. Therefore this endpoint returns 200 until the JWT
    expires (1 hour from issue).

    If the implementation changes to blacklist access tokens, expect 401 here.
    """
    if not _access_token:
        pytest.skip("No access_token available — login test must pass first")

    r = requests.get(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {_access_token}"},
        timeout=TIMEOUT,
    )

    if r.status_code == 200:
        body = r.json()
        print(
            f"\n  /auth/me after logout returned 200 (expected — JWTs are stateless).\n"
            f"  The access token remains valid until its 1-hour expiry.\n"
            f"  Response: {body}"
        )
        # Confirm the body still looks like a valid /me response
        assert "username" in body, f"Unexpected 200 body shape: {body}"

    elif r.status_code == 401:
        print(
            f"\n  /auth/me after logout returned 401.\n"
            f"  This means access tokens are now being blacklisted on logout."
        )
        # 401 is also acceptable — document it and move on
    else:
        pytest.fail(
            f"Unexpected status {r.status_code} from /auth/me after logout: {r.text}"
        )
