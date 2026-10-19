# JARVIS Ultimate

JARVIS Ultimate is a private AI productivity workspace. This repository currently provides a responsive React client, a TypeScript/Express API, PostgreSQL persistence through Prisma, server-side account sessions, task management, conversation history, and streaming through an OpenAI-compatible provider.

The complete product specification is in [note.txt](./note.txt). The staged delivery plan is in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md); current implementation and blockers are tracked in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

## Implemented capabilities

- Password-based registration/login with bcrypt hashes, database-backed expiring sessions, HttpOnly cookies, same-site restrictions, CSRF tokens, request-origin checks, and rate limiting.
- Per-account task creation, listing, completion/reopening, and deletion. Ownership is enforced by the API.
- Explicitly saved user memories, user-controlled enable/disable settings, and relevance-filtered memory context for AI conversations.
- Persistent conversations and messages, with genuine server-side model streaming when an OpenAI-compatible provider is configured.
- Browser speech recognition and speech synthesis where supported, with a text-chat fallback.
- Responsive dark workspace shell, dashboard task totals from server-side aggregates, and a keyboard-accessible command palette (`Ctrl+K` / `Cmd+K`).
- API liveness/readiness endpoints, structured request logs, security headers, environment validation, PostgreSQL schema, and an initial migration.

Other modules in the product specification (reminders/scheduling, document ingestion and retrieval, web search, integrations, and multi-step automations) are not implemented yet. They are not presented as functioning integrations.

## Prerequisites

- Node.js 22 or newer and npm.
- Docker Desktop (or another Docker Compose-compatible runtime) for the included local PostgreSQL service.
- An OpenAI-compatible API key and model name for live AI responses. These are optional for starting the web client and API, but required for chat generation.

## Local setup (Windows PowerShell)

From the repository root:

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:3001>.

The checked-in Compose configuration is for local development only. Its `change-me` database password is not suitable for a deployed environment. Edit `.env` before running the application if the local database credentials or ports differ.

To enable real chat completions, set the following in the root `.env` file:

```dotenv
AI_API_KEY=your-provider-key
AI_MODEL=your-streaming-chat-model
AI_BASE_URL=https://api.openai.com/v1
```

`AI_BASE_URL` may be left empty to use the OpenAI API URL. Keep all provider credentials on the server; do not prefix them with `VITE_`. When credentials are missing, the API returns `AI_PROVIDER_NOT_CONFIGURED` rather than a fabricated response.

## Developer commands

| Command               | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Start API and Vite development server     |
| `npm run typecheck`   | Type-check both workspaces                |
| `npm test`            | Run API and web unit tests                |
| `npm run build`       | Build API and frontend                    |
| `npm run db:generate` | Generate Prisma Client                    |
| `npm run db:migrate`  | Apply/create development migrations       |
| `npm run db:deploy`   | Apply committed migrations for deployment |
| `npm audit`           | Review dependency advisories              |

Run `npm run db:generate` and migrations after changing the Prisma schema. The API's development command generates Prisma Client before starting its watcher and excludes only Prisma's generated `.prisma` directory from watch events. API startup verifies the database connection before opening its listener; `DATABASE_URL` must be set.

The PostgreSQL integration test is opt-in: set `JARVIS_DATABASE_INTEGRATION=1` and point `DATABASE_URL` at a disposable database whose name ends in `_test` or `_integration`, after deploying the committed migrations. The test refuses to run against other database names.

## API and security notes

The versioned API is under `/api/v1`. Mutating authenticated API requests require the CSRF token returned by `/api/v1/auth/session` and an allowed request origin. Session cookies are HttpOnly and `SameSite=Strict`; use HTTPS and set `COOKIE_SECURE=true` in production.

The AI endpoint accepts OpenAI Chat Completions-compatible streaming responses. Provider URLs and credentials belong on the backend. Conversations and task records are scoped by the authenticated user's database ID.

See [docs/api.md](./docs/api.md), [docs/security.md](./docs/security.md), and [docs/ai-system.md](./docs/ai-system.md) for implementation details.

## Deployment

Deployment instructions and required production infrastructure are documented in [docs/deployment.md](./docs/deployment.md). No production deployment, managed database, external integration, or provider credential has been configured or verified as part of this implementation.
