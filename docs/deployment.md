# Deployment

No production deployment has been performed or verified.

## Required production configuration

- Node.js 22 runtime for the API and static frontend hosting for the Vite build.
- Managed PostgreSQL with backups and a private network connection.
- `DATABASE_URL`, `WEB_ORIGIN`, `API_PORT`, `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, and `COOKIE_SECURE=true`.
- `AI_API_KEY` and `AI_MODEL` only if live AI chat is required; optionally `AI_BASE_URL`.
- HTTPS, correct proxy/header configuration, and CORS restricted to the deployed frontend origin.

## Build and migrate

1. Install dependencies using the committed lockfile with `npm ci`.
2. Build with `npm run build`.
3. Apply committed migrations with `npm run db:deploy`.
4. Deploy `apps/api/dist` with the production environment variables.
5. Publish `apps/web/dist` through a static host configured to serve the SPA fallback.
6. Configure the host's API routing/reverse proxy so `/api/v1` and `/health` reach the API.
7. Verify `/health/live` and `/health/ready`, then exercise authentication and a real provider request.

The local Docker Compose file uses a development password and must not be used as a production database deployment. Set up database backups, monitoring, secret management, TLS, and rollback procedures with the selected hosting provider before release.
