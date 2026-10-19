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

- `GET /api/v1/tasks?status=open|completed&limit=50&cursor=<task-id>` — returns one page of owned tasks (default page size 50, maximum 100) as `{ "tasks": [...], "pagination": { "nextCursor": "..." } }`. Follow `nextCursor` to reach older tasks; `status` is optional.
- `POST /api/v1/tasks` — creates a task with `title`, optional `description`, `priority` (`low`, `medium`, `high`), and optional ISO `dueAt`.
- `PATCH /api/v1/tasks/:id` — updates validated task fields or status.
- `DELETE /api/v1/tasks/:id` — deletes an owned task.

Every write requires `X-CSRF-Token`. Unowned or nonexistent task IDs return the same `404` response.

## Conversations and streaming

- `GET /api/v1/conversations` — lists the authenticated user's non-archived conversations.
- `POST /api/v1/conversations` — creates a conversation; optional `title`.
- `GET /api/v1/conversations/:id/messages` — returns messages only when the conversation belongs to the current user.
- `DELETE /api/v1/conversations/:id` — deletes an owned conversation and its messages.
- `POST /api/v1/conversations/:id/messages` — accepts `{ "content": "..." }` and optionally `{ "mode": "agent", "context": "..." }`; `context` is limited to Agent Mode, sent to the provider as untrusted request context, and is not persisted as part of the user's message. After authenticating and checking ownership, the endpoint streams actual provider deltas as SSE `data: {"delta":"..."}` events and ends with `data: {"done":true,"messageId":"..."}`. The provider system instructions guide JARVIS to greet naturally, answer questions directly, keep voice replies concise, avoid unsolicited capability lists, and never claim actions without a confirmed application result.

An SSE `event: error` identifies failures that occur after streaming starts. If provider credentials are missing, the endpoint returns `503` with `AI_PROVIDER_NOT_CONFIGURED`. Upstream `401` and `404` failures return `502` with specific error codes, while upstream `429` returns `503 AI_PROVIDER_RATE_LIMITED`. Provider credentials and raw provider error bodies are never sent to the client.

## Memory

- `GET /api/v1/memories` — lists the current user's saved memories.
- `POST /api/v1/memories` — saves explicit user-provided content with an optional category.
- `PATCH /api/v1/memories/:id` — updates owned memory content/category or whether it may be used.
- `DELETE /api/v1/memories/:id` — deletes an owned memory.
- `GET /api/v1/memories/settings` — reads the user's memory-use setting.
- `PATCH /api/v1/memories/settings` — accepts `{ "enabled": boolean }`.

## Preferences

- `GET /api/v1/preferences` — returns the authenticated user's appearance, response-style, and speech preferences, using safe defaults before preferences are saved.
- `PATCH /api/v1/preferences` — updates one or more validated preference fields (`theme`, `responseStyle`, `memoryEnabled`, `autoSpeak`, `speechRate`, `speechPitch`, `speechVoice`, `reduceMotion`). Unknown properties are rejected.

Both routes are authenticated; updates also require `X-CSRF-Token`. Preferences are scoped to the authenticated user. Speech voice, pitch, and reduced-motion storage use the `20261019010000_voice_settings` migration.

## Agent Mode and voice experience

- `GET /api/v1/agent/capabilities` — reports whether Agent Mode is available to the authenticated account and returns the fixed tool registry.
- `GET /api/v1/agent/tasks` — lists up to 50 agent tasks belonging to the signed-in user.
- `GET /api/v1/agent/tasks/:id` — returns an owned task and its ordered execution steps; other users' tasks return `404`.
- `POST /api/v1/agent/tasks` — accepts `{ "instruction": "Create task: Review the React hooks guide" }`; requires authentication, `X-CSRF-Token`, a valid UUID `Idempotency-Key`, and is rate-limited.
- `POST /api/v1/agent/tasks/:id/confirm-navigation` — records an owned pending website action as confirmed by the browser client. General website opens require a confirmation click; an explicit play-song voice request authorizes direct navigation to its validated YouTube search.
- `POST /api/v1/agent/tasks/:id/cancel` — cancels an owned task only while planning/running/awaiting approval. A committed action cannot be undone.
- `DELETE /api/v1/agent/tasks/:id` — deletes an owned terminal task-history record and its steps. Active tasks must be cancelled or completed first.

Agent Mode is available to authenticated accounts in local development for testing. Non-development environments continue to require the existing active `AgentEntitlement` row. There is no email allowlist or billing/checkout flow. Existing task ownership rules remain in force.

The full-screen Agent Mode starts microphone capture only after the user starts a voice call. It uses browser speech recognition and synthesis where supported, resumes recognition between spoken turns, offers interruption and end-call controls, and releases microphone tracks and its Web Audio analyser when the call ends. Its holographic skull and energy waves reflect voice state; microphone amplitude drives the listening animation locally, while speech output follows synthesis events because generated audio is not generally exposed for analysis. Markdown responses are rendered for display and normalized before speech playback. This is turn-based browser voice, not full-duplex speech-to-speech. General conversation and task planning use the existing authenticated conversation stream; verified task actions use the authenticated task API or agent endpoints. It can create, list, complete, and explicitly confirm deletion of the user's tasks, and carry task-creation and search refinements across relevant follow-up turns. Its deterministic agent registry also supports navigation to validated websites, YouTube search, and Bing web/image search pages. General website opens require explicit confirmation; a specific spoken play-song request can directly navigate to a validated YouTube search URL without a second confirmation. Search-page fallback only opens the provider's search URL; it does not retrieve results on the server or start YouTube playback. Persistent reminders, notification delivery, and external calendar writes are not implemented because the project has no reminder scheduler or notification-delivery service.

The Agent Mode status indicates whether the authenticated Agent API is reachable and whether the browser voice session is active; it does not preflight the external AI provider. Provider availability is only known when a conversation request is made, and upstream errors are shown as request failures.

## Validation, CORS, and limits

Request bodies are limited to 64 KB. Zod validation failures return `400 VALIDATION_ERROR`. CORS only allows the configured `WEB_ORIGIN`; state-changing requests with a different `Origin` are rejected. Configure `WEB_ORIGIN` to the exact frontend origin (without a path); trailing slashes are normalized. In production, use the Vercel same-origin rewrites for `/api/*` and `/health/*` so cookies and streaming requests remain on the frontend origin.
