# API

The API runs on port `3001` by default. JSON endpoints use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

## Health

- `GET /health/live` — confirms the process is running.
- `GET /health/ready` — checks PostgreSQL and returns `503` while the database is unavailable.
- `GET /api/v1/dashboard/summary` — returns task aggregates and recent task previews for the authenticated user.

## Authentication

- `POST /api/v1/auth/register` — accepts `email`, `password` (12–128 characters), and optional `displayName`; creates an account, preference record, and session.
- `POST /api/v1/auth/login` — accepts `email` and `password`; returns the user, CSRF token, and expiry.
- `GET /api/v1/auth/session` — restores the current cookie session and returns a fresh-use CSRF token.
- `POST /api/v1/auth/logout` — invalidates the current server-side session; requires authentication and `X-CSRF-Token`.

Authentication and account mutations are rate-limited. Session cookies are HttpOnly.

## Tasks

- `GET /api/v1/tasks?status=open|completed` — lists up to 100 owned tasks.
- `POST /api/v1/tasks` — creates a task with `title`, optional `description`, `priority` (`low`, `medium`, `high`), and optional ISO `dueAt`.
- `PATCH /api/v1/tasks/:id` — updates validated task fields or status.
- `DELETE /api/v1/tasks/:id` — deletes an owned task.

Every write requires `X-CSRF-Token`. Unowned or nonexistent task IDs return the same `404` response.

## Conversations and streaming

- `GET /api/v1/conversations` — lists the authenticated user's non-archived conversations.
- `POST /api/v1/conversations` — creates a conversation; optional `title`.
- `GET /api/v1/conversations/:id/messages` — returns messages only when the conversation belongs to the current user.
- `DELETE /api/v1/conversations/:id` — deletes an owned conversation and its messages.
- `POST /api/v1/conversations/:id/messages` — accepts `{ "content": "..." }`; after authenticating and checking ownership, streams actual provider deltas as SSE `data: {"delta":"..."}` events and ends with `data: {"done":true,"messageId":"..."}`.

An SSE `event: error` identifies failures that occur after streaming starts. If provider credentials are missing, the endpoint returns `503` with `AI_PROVIDER_NOT_CONFIGURED`. Upstream `401` and `404` failures return `502` with specific error codes, while upstream `429` returns `503 AI_PROVIDER_RATE_LIMITED`. Provider credentials and raw provider error bodies are never sent to the client.

## Memory

- `GET /api/v1/memories` — lists the current user's saved memories.
- `POST /api/v1/memories` — saves explicit user-provided content with an optional category.
- `PATCH /api/v1/memories/:id` — updates owned memory content/category or whether it may be used.
- `DELETE /api/v1/memories/:id` — deletes an owned memory.
- `GET /api/v1/memories/settings` — reads the user's memory-use setting.
- `PATCH /api/v1/memories/settings` — accepts `{ "enabled": boolean }`.

## Validation, CORS, and limits

Request bodies are limited to 64 KB. Zod validation failures return `400 VALIDATION_ERROR`. CORS only allows the configured `WEB_ORIGIN`; state-changing requests with a different `Origin` are rejected. Configure `WEB_ORIGIN` to the exact production web origin.
