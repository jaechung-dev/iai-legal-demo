# ProBono AI — Public API Reference

**Base URL:** `https://api.probonoai.com.au`

All requests and responses use JSON (`Content-Type: application/json`) unless noted otherwise.

---

## Authentication

Protected endpoints require a bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Access tokens expire after **1 hour**. Use `POST /auth/refresh` to obtain a new one.

---

## Standard Error Responses

| Status | Meaning |
|--------|---------|
| `400`  | Bad request — invalid parameters or state |
| `401`  | Unauthorized — missing, invalid, or expired token |
| `404`  | Resource not found |
| `409`  | Conflict — e.g. email already registered |
| `422`  | Unprocessable entity — validation failure |
| `501`  | Feature not configured on this deployment |

Error body:

```json
{ "detail": "Human-readable error message" }
```

---

## Health

### `GET /health`

Returns server and database status. No authentication required.

**Response**

```json
{
  "status": "ok",
  "db": "ok",
  "model": "gpt-4o-mini"
}
```

---

## Auth

### `POST /auth/register`

Create a new account. Sends a 6-digit OTP to the provided email for verification.

**Request body**

| Field      | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| `name`     | string | yes      | Display name                       |
| `email`    | string | yes      | Email address (used as username)   |
| `password` | string | yes      | Minimum 8 characters               |

**Response** — same shape as `/auth/login` with `"email_verified": false`.

---

### `POST /auth/login`

Authenticate with email and password.

**Request body**

| Field      | Type   | Required | Description          |
|------------|--------|----------|----------------------|
| `username` | string | yes      | Email address        |
| `password` | string | yes      | Account password     |

**Response**

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<opaque-string>",
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

---

### `POST /auth/refresh`

Exchange a refresh token for a new access token. The old refresh token is consumed.

**Request body**

| Field           | Type   | Required |
|-----------------|--------|----------|
| `refresh_token` | string | yes      |

**Response** — same shape as `/auth/login`.

---

### `POST /auth/logout`

Revoke a refresh token.

**Request body**

| Field           | Type   | Required |
|-----------------|--------|----------|
| `refresh_token` | string | yes      |

**Response**

```json
{ "ok": true }
```

---

### `GET /auth/me`

Return the identity encoded in the current access token.

**Auth required:** yes

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

---

### `POST /auth/verify-otp`

Verify the 6-digit OTP sent after registration.

**Request body**

| Field   | Type   | Required |
|---------|--------|----------|
| `email` | string | yes      |
| `code`  | string | yes      |

**Response**

```json
{ "ok": true }
```

---

### `POST /auth/resend-verification`

Re-send the OTP to the given email. No-ops silently if the address is unknown or already verified (prevents enumeration).

**Request body**

| Field   | Type   | Required |
|---------|--------|----------|
| `email` | string | yes      |

**Response**

```json
{ "ok": true }
```

---

### `GET /auth/verify-email`

Email-link verification (used in legacy link emails). Redirects the browser to the frontend on success or failure.

**Query parameters**

| Parameter | Type   | Required |
|-----------|--------|----------|
| `token`   | string | yes      |

**Response:** HTTP redirect (302) — no JSON body.

---

### `POST /auth/forgot-password`

Request a password-reset email. No-ops silently for unknown addresses.

**Request body**

| Field   | Type   | Required |
|---------|--------|----------|
| `email` | string | yes      |

**Response**

```json
{ "ok": true }
```

---

### `POST /auth/reset-password`

Set a new password using a reset token from the email.

**Request body**

| Field      | Type   | Required | Description            |
|------------|--------|----------|------------------------|
| `token`    | string | yes      | Token from reset email |
| `password` | string | yes      | New password (min 8 chars) |

**Response**

```json
{ "ok": true }
```

---

### `GET /auth/google`

Initiate Google OAuth 2.0 sign-in. Redirects the browser to Google's consent screen. On completion, the callback redirects to the frontend with `?token=<access_token>&refresh=<refresh_token>` in the URL.

**Response:** HTTP redirect (302) — no JSON body.

---

## MCP Tokens

Long-lived tokens intended for programmatic / MCP client access. They are distinct from session tokens and do not expire in 1 hour.

### `POST /auth/mcp/token`

Create a new MCP token.

**Auth required:** yes

**Request body**

| Field          | Type           | Required | Default                              |
|----------------|----------------|----------|--------------------------------------|
| `name`         | string         | no       | `"My MCP Token"`                     |
| `scopes`       | array[string]  | no       | `["search", "ask", "fetch", "collections"]` |
| `expires_days` | integer        | no       | `365`                                |

**Response**

```json
{
  "token": "mcp-<value>",
  "id": "<uuid>",
  "name": "My MCP Token",
  "expires_at": "2027-07-25T00:00:00+00:00"
}
```

The raw token is returned **only at creation time** — store it securely.

---

### `GET /auth/mcp/tokens`

List the caller's active (non-expired) MCP tokens. Raw token values are never returned.

**Auth required:** yes

**Response**

```json
{
  "tokens": [
    {
      "id": "<uuid>",
      "name": "My MCP Token",
      "scopes": ["search", "ask"],
      "expires_at": "2027-07-25T00:00:00+00:00",
      "last_used_at": "2026-07-20T10:00:00+00:00",
      "created_at": "2026-07-01T00:00:00+00:00"
    }
  ]
}
```

---

### `DELETE /auth/mcp/token/{token_id}`

Revoke an MCP token by its ID.

**Auth required:** yes

**Path parameter:** `token_id` — UUID of the token to revoke.

**Response**

```json
{ "ok": true }
```

Returns `404` if the token does not exist or belongs to another user.

---

## Search

### `POST /search`

Perform a semantic vector search across legislation, case law, or case events. Returns the top-k matching passages with source metadata. No auth required.

**Request body**

| Field          | Type    | Required | Default         | Description |
|----------------|---------|----------|-----------------|-------------|
| `query`        | string  | yes      | —               | Natural-language search query |
| `source`       | string  | no       | `"legislation"` | `"legislation"`, `"caselaw"`, or `"case_events"` |
| `jurisdiction` | string  | no       | `"NSW"`         | `"NSW"`, `"Commonwealth"`, or `"both"` (legislation only) |
| `case_id`      | string  | no       | `"nguyen"`      | Case identifier (case_events only) |
| `k`            | integer | no       | `5`             | Number of results to return |

**Response**

```json
{
  "query": "adverse possession requirements",
  "source": "legislation",
  "results": [
    {
      "content": "<passage text, up to 600 characters>",
      "metadata": {
        "source": "legislation",
        "citation": "Real Property Act 1900 (NSW) s 45D",
        "score": 0.8821
      }
    }
  ]
}
```

`metadata` fields vary by source:

| source         | metadata keys                                      |
|----------------|----------------------------------------------------|
| `legislation`  | `source`, `citation`, `score`                      |
| `caselaw`      | `source`, `citation` (title + neutral citation), `score` |
| `case_events`  | `source`, `date`, `category`, `score`              |

---

## Ask (RAG with streaming)

### `POST /ask`

Ask a legal question. Retrieves relevant passages and streams an LLM-generated answer. No auth required.

**Request body**

| Field          | Type    | Required | Default         | Description |
|----------------|---------|----------|-----------------|-------------|
| `question`     | string  | yes      | —               | The legal question to answer |
| `source`       | string  | no       | `"legislation"` | `"legislation"`, `"caselaw"`, `"case_events"`, or `"both"` |
| `jurisdiction` | string  | no       | `"NSW"`         | `"NSW"`, `"Commonwealth"`, or `"both"` (legislation only) |
| `case_id`      | string  | no       | `"nguyen"`      | Case identifier (case_events only) |
| `k`            | integer | no       | `4`             | Number of context passages to retrieve |

**Response** — `Content-Type: text/event-stream`

The response is a standard [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream. Each event is a JSON object on a `data:` line:

```
data: {"text": "The "}\n\n
data: {"text": "Real "}\n\n
data: {"text": "Property Act..."}\n\n
data: [DONE]\n\n
```

- `data: {"text": "<chunk>"}` — incremental text token from the LLM.
- `data: [DONE]` — stream complete.

Concatenate all `text` values to reconstruct the full answer.

---

## Chat (conversational with streaming)

### `POST /chat`

Plain-English conversational interface backed by multi-turn history. Retrieves legislation and case law context, then streams the response. No auth required.

**Request body**

| Field      | Type                      | Required | Default      | Description |
|------------|---------------------------|----------|--------------|-------------|
| `question` | string                    | yes      | —            | The current user message |
| `messages` | array[ChatMessage]        | no       | `[]`         | Prior conversation turns (up to last 8 are used) |
| `case_id`  | string                    | no       | `"nguyen"`   | Case identifier for context |
| `k`        | integer                   | no       | `5`          | Number of context passages per source |

**ChatMessage object**

| Field     | Type   | Values                  |
|-----------|--------|-------------------------|
| `role`    | string | `"user"` or `"assistant"` |
| `content` | string | Message text            |

**Response** — `Content-Type: text/event-stream`

The stream emits two event types:

**1. Sources event** (first, always one):

```
data: {"type": "sources", "docs": [...]}\n\n
```

`docs` array item:

```json
{
  "citation": "Real Property Act 1900 (NSW) s 45D",
  "content": "<first 300 chars of passage>",
  "score": 0.8821,
  "source_type": "legislation"
}
```

**2. Token events** (one per LLM chunk):

```
data: {"type": "token", "text": "<chunk>"}\n\n
```

**3. Done sentinel**:

```
data: [DONE]\n\n
```

Concatenate all `text` values from `token` events to reconstruct the full answer.

---

## Case Timeline

### `GET /case/{case_id}/timeline`

Return all events for a given case, ordered chronologically. No auth required.

**Path parameter:** `case_id` — e.g. `nguyen`.

**Response**

```json
{
  "case_id": "nguyen",
  "total": 42,
  "events": [
    {
      "date": "2023-03-15",
      "category": "correspondence",
      "event_type": "letter",
      "subject": "Notice to Vacate",
      "summary": "Landlord issued formal notice to vacate the premises.",
      "content": "<full event text>",
      "attachments": null
    }
  ]
}
```

Returns `404` if `case_id` is not found.
