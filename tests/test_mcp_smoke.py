"""
MCP token endpoint smoke tests against the production API at https://api.probonoai.com.au

Endpoints under test:
  POST   /auth/mcp/token        — create a long-lived MCP token
  GET    /auth/mcp/tokens       — list active MCP tokens
  DELETE /auth/mcp/token/{id}   — revoke an MCP token

Run with: pytest tests/test_mcp_smoke.py -v -s
"""

import pytest
import requests

from conftest import BASE_URL, DEMO_PASSWORD

# ---------------------------------------------------------------------------
# Module-level state shared across ordered tests
# ---------------------------------------------------------------------------

access_token: str | None = None
mcp_token: str | None = None
mcp_token_id: str | None = None

TIMEOUT = 30


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {access_token}"}


# ---------------------------------------------------------------------------
# test_01 — Login to obtain a session JWT
# ---------------------------------------------------------------------------

def test_01_login():
    global access_token
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "demo", "password": DEMO_PASSWORD},
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"Login failed ({resp.status_code}): {resp.text}"
    body = resp.json()
    access_token = body.get("access_token")
    assert access_token, f"No access_token in login response: {body}"
    print(f"\n  [login] access_token obtained (len={len(access_token)})")


# ---------------------------------------------------------------------------
# test_02 — No auth header → 401 or 403
# ---------------------------------------------------------------------------

def test_02_no_token_rejected():
    if access_token is None:
        pytest.skip("Login failed — skipping test_02_no_token_rejected")
    resp = requests.post(
        f"{BASE_URL}/auth/mcp/token",
        json={"name": "should-be-rejected", "scopes": ["search"], "expires_days": 1},
        timeout=TIMEOUT,
    )
    assert resp.status_code in (401, 403), (
        f"Expected 401 or 403 without auth, got {resp.status_code}: {resp.text}"
    )
    print(f"\n  [no_token_rejected] status={resp.status_code} (correct)")


# ---------------------------------------------------------------------------
# test_03 — Create an MCP token with a valid session JWT
# ---------------------------------------------------------------------------

def test_03_create_token():
    global mcp_token, mcp_token_id
    if access_token is None:
        pytest.skip("Login failed — skipping test_03_create_token")
    resp = requests.post(
        f"{BASE_URL}/auth/mcp/token",
        json={"name": "smoke-test-token", "scopes": ["search", "ask"], "expires_days": 1},
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"Create MCP token failed ({resp.status_code}): {resp.text}"
    body = resp.json()

    # Verify required fields are present
    assert "token" in body, f"Missing 'token' in response: {body}"
    assert "id" in body, f"Missing 'id' in response: {body}"
    assert "name" in body, f"Missing 'name' in response: {body}"
    assert "expires_at" in body, f"Missing 'expires_at' in response: {body}"

    # Token must start with "mcp-"
    assert body["token"].startswith("mcp-"), (
        f"Expected token to start with 'mcp-', got: {body['token'][:20]!r}"
    )

    mcp_token = body["token"]
    mcp_token_id = body["id"]
    print(f"\n  [create_token] id={mcp_token_id} name={body['name']} expires_at={body['expires_at']}")
    print(f"  [create_token] token prefix={mcp_token[:12]}...")


# ---------------------------------------------------------------------------
# test_04 — List tokens; created token must appear in the list
# ---------------------------------------------------------------------------

def test_04_list_tokens():
    if access_token is None:
        pytest.skip("Login failed — skipping test_04_list_tokens")
    if mcp_token_id is None:
        pytest.skip("Token creation failed — skipping test_04_list_tokens")
    resp = requests.get(
        f"{BASE_URL}/auth/mcp/tokens",
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"List tokens failed ({resp.status_code}): {resp.text}"
    body = resp.json()
    assert "tokens" in body, f"Missing 'tokens' key in response: {body}"
    tokens = body["tokens"]
    assert isinstance(tokens, list), f"Expected 'tokens' to be a list, got: {type(tokens)}"

    token_ids = [t["id"] for t in tokens]
    assert mcp_token_id in token_ids, (
        f"Created token id {mcp_token_id!r} not found in list: {token_ids}"
    )
    print(f"\n  [list_tokens] {len(tokens)} active token(s); created token present ✓")


# ---------------------------------------------------------------------------
# test_05 — Use the MCP token as a Bearer on /auth/me
#           MCP tokens are not JWTs, so 401 is expected; document either outcome.
# ---------------------------------------------------------------------------

def test_05_mcp_token_auth():
    if access_token is None:
        pytest.skip("Login failed — skipping test_05_mcp_token_auth")
    if mcp_token is None:
        pytest.skip("Token creation failed — skipping test_05_mcp_token_auth")
    resp = requests.get(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {mcp_token}"},
        timeout=TIMEOUT,
    )
    # /auth/me decodes a JWT — MCP tokens are opaque, so 401 is the expected
    # outcome. 200 would mean MCP tokens happen to be JWTs (also acceptable).
    assert resp.status_code in (200, 401), (
        f"Expected 200 or 401 when using MCP token on /auth/me, got {resp.status_code}: {resp.text}"
    )
    if resp.status_code == 200:
        print(f"\n  [mcp_token_auth] /auth/me accepted MCP token (200) — token is a JWT")
    else:
        print(f"\n  [mcp_token_auth] /auth/me rejected MCP token (401) — expected; MCP tokens are opaque")


# ---------------------------------------------------------------------------
# test_06 — Revoke the created token
# ---------------------------------------------------------------------------

def test_06_revoke_token():
    if access_token is None:
        pytest.skip("Login failed — skipping test_06_revoke_token")
    if mcp_token_id is None:
        pytest.skip("Token creation failed — skipping test_06_revoke_token")
    resp = requests.delete(
        f"{BASE_URL}/auth/mcp/token/{mcp_token_id}",
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"Revoke token failed ({resp.status_code}): {resp.text}"
    body = resp.json()
    assert body.get("ok") is True, f"Expected ok=true in revoke response: {body}"
    print(f"\n  [revoke_token] token {mcp_token_id} revoked ✓")


# ---------------------------------------------------------------------------
# test_07 — Revoked token must no longer appear in list
# ---------------------------------------------------------------------------

def test_07_token_gone():
    if access_token is None:
        pytest.skip("Login failed — skipping test_07_token_gone")
    if mcp_token_id is None:
        pytest.skip("Token creation failed — skipping test_07_token_gone")
    resp = requests.get(
        f"{BASE_URL}/auth/mcp/tokens",
        headers=_auth_headers(),
        timeout=TIMEOUT,
    )
    assert resp.status_code == 200, f"List tokens failed ({resp.status_code}): {resp.text}"
    body = resp.json()
    assert "tokens" in body, f"Missing 'tokens' key in response: {body}"
    tokens = body["tokens"]
    assert isinstance(tokens, list), f"Expected 'tokens' to be a list, got: {type(tokens)}"

    token_ids = [t["id"] for t in tokens]
    assert mcp_token_id not in token_ids, (
        f"Revoked token {mcp_token_id!r} still appears in list: {token_ids}"
    )
    print(f"\n  [token_gone] revoked token absent from list ✓ ({len(tokens)} token(s) remaining)")
