# API Testing Coverage Checklist

> Swagger reference at `/docs`. This file tracks test coverage only.

## Auth

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `POST /auth/register` | - [ ] | - [ ] | - [ ] | |
| `POST /auth/login` | - [ ] | - [ ] | - [ ] | |
| `POST /auth/refresh` | - [ ] | - [ ] | - [ ] | consumes old token |
| `POST /auth/logout` | - [ ] | - [ ] | - [ ] | requires auth |
| `GET /auth/me` | - [ ] | - [ ] | - [ ] | requires auth |
| `POST /auth/verify-otp` | - [ ] | - [ ] | - [ ] | |
| `POST /auth/resend-verification` | - [ ] | - [ ] | - [ ] | |
| `GET /auth/verify-email` | - [ ] | - [ ] | - [ ] | redirects to frontend |
| `POST /auth/forgot-password` | - [ ] | - [ ] | - [ ] | |
| `POST /auth/reset-password` | - [ ] | - [ ] | - [ ] | |
| `GET /auth/google` | - [ ] | - [ ] | - [ ] | redirects to Google |
| `GET /auth/google/callback` | - [ ] | - [ ] | - [ ] | OAuth browser flow only |

## MCP

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `POST /auth/mcp/token` | - [ ] | - [ ] | - [ ] | requires auth |
| `GET /auth/mcp/tokens` | - [ ] | - [ ] | - [ ] | requires auth |
| `DELETE /auth/mcp/token/{token_id}` | - [ ] | - [ ] | - [ ] | requires auth |

## Search & Ask

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `POST /search` | - [ ] | - [ ] | - [ ] | no auth required |
| `POST /ask` | - [ ] | - [ ] | - [ ] | SSE stream, no auth required |

## Chat

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `POST /chat` | - [ ] | - [ ] | - [ ] | SSE stream, no auth required |

## Case

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `GET /case/{case_id}/timeline` | - [ ] | - [ ] | - [ ] | 404 on unknown case_id |

## Health

| Endpoint | Smoke | Unit | E2E | Notes |
|----------|-------|------|-----|-------|
| `GET /health` | - [ ] | - [ ] | - [ ] | no auth required |
