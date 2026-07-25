# ProBono AI — API Reference

Base URL: `https://api.probonoai.com.au`

Default port (local): `20000`

---

## Authentication

Most endpoints do not require auth. Endpoints that do require a session JWT passed as:

```
Authorization: Bearer <access_token>
```

Access tokens are short-lived (1 hour). Obtain them via `/auth/login`, `/auth/register`, or `/auth/refresh`. The JWT payload contains `sub` (email), `name`, `role`, `scopes`, `email_verified`, and `exp`.

MCP tokens (prefixed `mcp-`) are long-lived and stored hashed in the database. They are **not** accepted by the standard `_require_auth` helper used on session-gated endpoints — they exist for programmatic/external tool access only.

---

## Endpoints

---

### Health

#### `GET /health`

Returns server and database status. No auth required.

**Response**

```json
{
  "status": "ok",
  "db": "ok",
  "model": "gpt-4o-mini"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` if the process is running |
| `db` | string | `"ok"` if the DB connection succeeds; error message string otherwise |
| `model` | string | Value of `CHAT_MODEL` env var currently in use |

---

### Auth

#### `POST /auth/register`

Creates a new local account. Sends a 6-digit OTP to the supplied email via AWS SES. Returns tokens immediately with `email_verified: false`.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name; must be non-empty after trimming |
| `email` | string | Yes | Must contain `@`; stored lowercased |
| `password` | string | Yes | Minimum 8 characters |

**Response** — same shape as `/auth/login` plus a `user` object:

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<opaque>",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "username": "user@example.com",
    "name": "Jane Smith",
    "role": "user",
    "email_verified": false
  }
}
```

**Error codes**

| Status | Detail |
|--------|--------|
| 409 | Email already registered |
| 422 | Name empty, invalid email, or password too short |

**Notes**

- Password is stored as SHA-256(`salt + password`) with a random 16-byte hex salt.
- A 6-digit OTP is inserted into `email_verifications` (expires 15 minutes) and emailed. The user must call `/auth/verify-otp` to set `email_verified = true`.
- Seed accounts (`demo`, `admin`) bypass this flow entirely.

---

#### `POST /auth/login`

Authenticates a user and issues tokens.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Email address or seed username (`demo` / `admin`) |
| `password` | string | Yes | Plaintext password |

**Response**

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<opaque-token>",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "username": "user@example.com",
    "name": "Jane Smith",
    "role": "user",
    "email_verified": true
  }
}
```

**Error codes**

| Status | Detail |
|--------|--------|
| 401 | Invalid credentials, user not found, or account is Google-only |

**Notes**

- Seed users (`demo`, `admin`) are matched by exact username + password string comparison; they bypass the DB.
- Google-linked accounts return a 401 with a message directing the user to the OAuth flow.
- A refresh token (48-byte URL-safe random string) is stored hashed in `refresh_tokens` with a 30-day expiry. Old expired tokens for the same user are pruned on each login.

---

#### `POST /auth/refresh`

Exchanges a valid refresh token for a new access token + refresh token pair. The old refresh token is consumed (rotation).

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | Yes | Opaque refresh token from a previous login/register |

**Response** — same shape as `/auth/login`.

**Error codes**

| Status | Detail |
|--------|--------|
| 401 | Token not found, already used, or expired |

---

#### `POST /auth/logout`

Revokes a refresh token.

**Auth required:** No (the refresh token itself is the credential)

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refresh_token` | string | Yes | Token to invalidate |

**Response**

```json
{ "ok": true }
```

**Notes:** Silently succeeds even if the token is not found or already expired.

---

#### `GET /auth/me`

Returns the claims from the caller's access token without hitting the database.

**Auth required:** Yes — `Authorization: Bearer <access_token>`

**Response**

```json
{
  "username": "user@example.com",
  "name": "Jane Smith",
  "role": "user",
  "email_verified": true,
  "scopes": ["search", "ask", "chat", "timeline"]
}
```

**Error codes**

| Status | Detail |
|--------|--------|
| 401 | Missing, malformed, or expired Bearer token |

---

#### `GET /auth/verify-email`

Verifies an email address via a link-click flow (used only when the verification email contains a direct link rather than an OTP). Marks the account as verified and redirects the browser.

**Auth required:** No

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Raw token from the verification email link |

**Response — redirects (302)**

| Condition | Redirect destination |
|-----------|----------------------|
| Valid, unused, unexpired token | `{FRONTEND_URL}/login/?verified=1` |
| Invalid / expired / already used | `{FRONTEND_URL}/login/?error=invalid_link` |

**Notes:** Token is stored as SHA-256 hash. Marked `used=true` immediately on first use.

---

#### `POST /auth/verify-otp`

Verifies a 6-digit OTP sent during registration (or resent via `/auth/resend-verification`).

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Account email |
| `code` | string | Yes | 6-digit OTP from the verification email |

**Response**

```json
{ "ok": true }
```

**Error codes**

| Status | Detail |
|--------|--------|
| 400 | Email not found, code invalid, expired, or already used |

---

#### `POST /auth/resend-verification`

Invalidates any outstanding OTP and sends a fresh one to the given email.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Account email |

**Response**

```json
{ "ok": true }
```

**Notes:** Always returns `{ "ok": true }` regardless of whether the email exists or is already verified, to prevent email enumeration.

---

#### `POST /auth/forgot-password`

Sends a password-reset link to the given email (expires 1 hour). Silently no-ops for unknown emails or Google-linked accounts.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Account email |

**Response**

```json
{ "ok": true }
```

**Notes:** Any existing unused reset tokens for the user are revoked before issuing a new one. Always returns 200 to prevent email enumeration.

---

#### `POST /auth/reset-password`

Consumes a password-reset token and sets a new password. Revokes all existing refresh tokens for the account.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Raw token from the reset email link |
| `password` | string | Yes | New password; minimum 8 characters |

**Response**

```json
{ "ok": true }
```

**Error codes**

| Status | Detail |
|--------|--------|
| 400 | Token invalid, expired, or already used |
| 422 | Password shorter than 8 characters |

---

#### `GET /auth/google`

Initiates the Google OAuth 2.0 authorization code flow.

**Auth required:** No

**Response — redirect (302)**

Redirects to `https://accounts.google.com/o/oauth2/v2/auth` with the following parameters:

- `scope`: `openid email profile`
- `access_type`: `offline`
- `prompt`: `select_account`
- `redirect_uri`: `{BACKEND_URL}/auth/google/callback`

A CSRF state token is stored in-process in `OAUTH_STATES`.

**Error codes**

| Status | Detail |
|--------|--------|
| 501 | `GOOGLE_CLIENT_ID` env var not set |

---

#### `GET /auth/google/callback`

OAuth redirect target. Exchanges the authorization code for Google tokens, upserts the user, and redirects the browser to the frontend with session tokens in the URL.

**Auth required:** No (called by Google)

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Google |
| `state` | string | Yes | CSRF state token issued by `/auth/google` |

**Response — redirect (302)**

On success, redirects to:

```
{FRONTEND_URL}/auth/callback?token=<access_token>&refresh=<refresh_token>
```

**Error codes**

| Status | Detail |
|--------|--------|
| 400 | Invalid/unknown state token, token exchange failure, or no email in Google profile |

**Notes:**

- New Google users are created with `provider='google'`, `email_verified=true`, `role='user'`.
- Existing accounts are matched by email; the existing role is preserved.
- State tokens are single-use (popped from `OAUTH_STATES` on validation).

---

### MCP

#### `POST /auth/mcp/token`

Creates a long-lived MCP API token for programmatic/tool access. Only the raw token is returned once; subsequent list calls never expose it.

**Auth required:** Yes — `Authorization: Bearer <session_jwt>`

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Human-readable label; defaults to `"My MCP Token"` |
| `scopes` | array of strings | No | Defaults to `["search", "ask", "fetch", "collections"]` |
| `expires_days` | integer | No | Days until expiry; defaults to `365` |

**Response**

```json
{
  "token": "mcp-<random>",
  "id": "<uuid>",
  "name": "My MCP Token",
  "expires_at": "2027-07-25T00:00:00+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `token` | string | Raw token — prefixed `mcp-`. **Store this securely; it is never returned again.** |
| `id` | string | UUID used to revoke the token |
| `name` | string | Label as stored |
| `expires_at` | string | ISO 8601 UTC timestamp |

**Notes:** Token is stored as SHA-256 hash in `mcp_tokens`. The raw value is only available in this response.

---

#### `GET /auth/mcp/tokens`

Lists the caller's active (non-expired) MCP tokens. Raw token values are never included.

**Auth required:** Yes — `Authorization: Bearer <session_jwt>`

**Response**

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "My MCP Token",
      "scopes": ["search", "ask", "fetch", "collections"],
      "expires_at": "2027-07-25T00:00:00+00:00",
      "last_used_at": "2026-07-20T10:30:00+00:00",
      "created_at": "2026-07-25T00:00:00+00:00"
    }
  ]
}
```

All timestamp fields are ISO 8601 UTC strings, or `null` if not yet populated.

---

#### `DELETE /auth/mcp/token/{token_id}`

Revokes an MCP token by its UUID.

**Auth required:** Yes — `Authorization: Bearer <session_jwt>`

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `token_id` | string (UUID) | ID returned at token creation time |

**Response**

```json
{ "ok": true }
```

**Error codes**

| Status | Detail |
|--------|--------|
| 404 | Token not found or does not belong to the authenticated user |

---

### Search & Knowledge Base

#### `POST /search`

Performs a vector similarity search against the knowledge base. Returns raw document chunks with metadata. No LLM involved.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `source` | string | No | `"legislation"` (default) \| `"caselaw"` \| `"case_events"` |
| `jurisdiction` | string | No | `"NSW"` (default) \| `"Commonwealth"` \| `"both"` — only used when `source="legislation"` |
| `case_id` | string | No | Case identifier; default `"nguyen"` — only used when `source="case_events"` |
| `k` | integer | No | Number of results to return; default `5` |

**Response**

```json
{
  "query": "unfair dismissal notice period",
  "source": "legislation",
  "results": [
    {
      "content": "<first 600 characters of chunk text>",
      "metadata": {
        "source": "legislation",
        "citation": "Fair Work Act 2009 (Cth) s 387",
        "score": 0.8821
      }
    }
  ]
}
```

**Metadata fields by source**

| Source | Metadata fields |
|--------|-----------------|
| `legislation` | `source`, `citation`, `score` |
| `caselaw` | `source`, `citation` (format: `"Title (neutral_citation)"`), `score` |
| `case_events` | `source`, `date`, `category`, `score` |

**Notes:**

- `score` is cosine similarity (0–1); higher is more relevant.
- `content` is truncated to 600 characters per result.
- Embeddings are generated via `text-embedding-3-small` (OpenAI) and compared using pgvector.

---

#### `POST /ask`

Retrieves relevant document chunks and streams an LLM-generated answer via Server-Sent Events (SSE).

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | Natural language question |
| `source` | string | No | `"legislation"` (default) \| `"caselaw"` \| `"both"` \| `"case_events"` |
| `jurisdiction` | string | No | `"NSW"` (default) \| `"Commonwealth"` \| `"both"` — used for `legislation` and `both` |
| `case_id` | string | No | Case identifier; default `"nguyen"` — used when `source="case_events"` |
| `k` | integer | No | Chunks to retrieve per retriever; default `4`. When `source="both"`, each retriever uses `k//2 + 1` |

**Response** — `text/event-stream`

The response body is a stream of SSE events. Each event is a single line of the form:

```
data: <json>\n\n
```

**Event types**

| Event data | Description |
|------------|-------------|
| `{"text": "<token>"}` | Incremental LLM output token |
| `[DONE]` | Stream termination sentinel (literal string, not JSON) |

**Example stream**

```
data: {"text": "Under the Fair Work Act"}

data: {"text": " 2009, an employer must"}

data: {"text": " provide notice..."}

data: [DONE]
```

**Notes:**

- The system prompt instructs the LLM to answer based only on retrieved context, cite sources, and state when context is insufficient.
- `<think>...</think>` blocks (from chain-of-thought models) are stripped before emission.
- CORS headers are included: `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache`.
- When `source="both"`, legislation and caselaw retrievers run sequentially and their results are merged before being passed to the LLM.

---

### Chat

#### `POST /chat`

Multi-turn conversational endpoint. Retrieves from both legislation and caselaw, then streams a plain-English explanation with sources sent as a leading SSE event.

**Auth required:** No

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The user's current question |
| `messages` | array of `ChatMessage` | No | Conversation history; default `[]`. At most the last 8 messages are used |
| `case_id` | string | No | Case identifier; default `"nguyen"` (currently unused in retrieval, reserved) |
| `k` | integer | No | Chunks to retrieve from each retriever; default `5` |

**`ChatMessage` object**

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"assistant"` |
| `content` | string | Message text |

**Response** — `text/event-stream`

The stream always starts with a `sources` event, followed by incremental tokens, then `[DONE]`.

**Event types**

| `type` field | Description |
|--------------|-------------|
| `sources` | Array of retrieved document references (emitted once, first) |
| `token` | Incremental LLM output text |
| `[DONE]` | Literal string sentinel; stream is complete |

**`sources` event shape**

```
data: {"type": "sources", "docs": [
  {
    "citation": "Fair Work Act 2009 (Cth) s 387",
    "content": "<first 300 characters of chunk>",
    "score": 0.8821,
    "source_type": "legislation"
  }
]}
```

**`token` event shape**

```
data: {"type": "token", "text": "Under the Fair Work"}
```

**Termination**

```
data: [DONE]
```

**Full example stream**

```
data: {"type": "sources", "docs": [{"citation": "...", "content": "...", "score": 0.87, "source_type": "legislation"}]}

data: {"type": "token", "text": "The Fair Work Act says"}

data: {"type": "token", "text": " that your employer must..."}

data: [DONE]
```

**Notes:**

- Retrieves `k` chunks from legislation (NSW jurisdiction) and `k` from caselaw, merged.
- The system prompt (`PLAIN_ENGLISH_SYSTEM`) instructs the model to use simple, warm language without jargon, aimed at a non-lawyer audience.
- `<think>...</think>` blocks are stripped incrementally during streaming.
- Response headers include `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` (prevents nginx from buffering SSE).
- Conversation history is capped at the last 8 messages before the new question.

---

### Case

#### `GET /case/{case_id}/timeline`

Returns all events for a case in chronological order.

**Auth required:** No

**Path parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `case_id` | string | Case identifier (e.g. `nguyen`) |

**Response**

```json
{
  "case_id": "nguyen",
  "total": 42,
  "events": [
    {
      "date": "2024-03-15",
      "category": "correspondence",
      "event_type": "letter",
      "subject": "Notice of termination",
      "summary": "Employer issued formal termination notice.",
      "content": "<full event text>",
      "attachments": null
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | string | Echo of path parameter |
| `total` | integer | Total number of events returned |
| `events[].date` | string | ISO date (`YYYY-MM-DD`) |
| `events[].category` | string | High-level category (e.g. `correspondence`, `hearing`) |
| `events[].event_type` | string | Sub-type within category |
| `events[].subject` | string | Short description / heading |
| `events[].summary` | string | Brief summary text |
| `events[].content` | string | Full event content |
| `events[].attachments` | any | Attachment data as stored; `null` if none |

**Error codes**

| Status | Detail |
|--------|--------|
| 404 | No events found for `case_id` |

---

## Access Logging

Every request is logged to stdout in the following format:

```
ACCESS <iso_timestamp> ip=<ip> method=<method> path=<path> status=<code> ms=<duration> user=<email_or_dash>
```

The `user` field is populated by decoding the Bearer JWT if present; otherwise it is `-`. IP is read from `X-Forwarded-For`, then `X-Real-IP`, then the direct client address.

---

## CORS

All origins, methods, and headers are allowed (`*`). This is configured globally via `CORSMiddleware`.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL DSN with pgvector extension |
| `JWT_SECRET` | Yes | Secret for HS256 JWT signing |
| `DEMO_PASSWORD` | Yes | Password for the `demo` seed user |
| `ADMIN_PASSWORD` | Yes | Password for the `admin` seed user |
| `OPENAI_API_KEY` | Yes | Used for embeddings (always) and LLM (when `CHAT_MODEL` is a GPT model) |
| `CHAT_MODEL` | No | LLM model name; default `gpt-4o-mini`. Prefix `claude-` to use Anthropic. |
| `EMBED_MODEL` | No | Embedding model; default `text-embedding-3-small` |
| `FRONTEND_URL` | No | Frontend origin for OAuth redirects; default `http://localhost:20001` |
| `BACKEND_URL` | No | Backend origin for OAuth callbacks; default `http://localhost:20000` |
| `APP_NAME` | No | App name used in email subjects; default `ProBono AI` |
| `GOOGLE_CLIENT_ID` | No | Required to enable Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Required to enable Google OAuth |
| `FROM_EMAIL` | No | SES sender address; default `noreply@probonoai.com.au` |
| `AWS_REGION` | No | AWS region for SES; default `ap-southeast-2` |
| `PORT` | No | Uvicorn port when run directly; default `20000` |
