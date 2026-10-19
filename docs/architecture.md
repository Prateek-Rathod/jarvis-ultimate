# Architecture

## Current system

- `apps/web` is a React 19, TypeScript, Vite single-page client. Feature pages use TanStack Query for server state and a shared API helper for cookie credentials and CSRF headers.
- `apps/api` is a TypeScript Express API. Request IDs, structured request logs, security headers, JSON size limits, CORS, origin checks, rate limits, validation, and shared error responses are handled centrally.
- PostgreSQL is the durable store. Prisma models users, hashed sessions, preferences, conversations, messages, tasks, reminders, and explicit user memories.
- `apps/api/prisma` contains the schema and initial SQL migration. Prisma 7 uses the PostgreSQL driver adapter.
- External AI calls are made only from the API. The browser receives response deltas over Server-Sent Events and never receives the API key.

## Request boundaries

1. The browser sends same-origin requests through Vite's development proxy.
2. Authentication middleware resolves a cookie session to the user record.
3. Mutations validate the session-bound CSRF token and request origin.
4. Route schemas validate input; queries filter by the authenticated user ID.
5. The API persists business records with Prisma and returns a documented JSON envelope or an SSE stream.

## Deliberate current limits

There is no persistent queue, external file store, OAuth layer, document processor, or integration registry yet. Reminders are schema-only; memory has user-facing CRUD and keyword retrieval but not semantic search. See [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) for staged work and blockers.
