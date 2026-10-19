# Deployment

No production deployment has been performed or verified.

## Production routing and configuration

- Deploy the API as a Render web service and the Vite build as a Vercel static site.
- Keep the Vercel project root at the repository root so it uses the checked-in `vercel.json`. The `/api/*` and `/health/*` rewrites proxy to Render without changing the browser-visible origin or route prefixes; the final SPA fallback serves the app shell on direct route refreshes.
- Set Vercel's production `VITE_API_BASE_URL` to `https://jarvis-ultimate-orcin.vercel.app`, the Vercel site origin. The browser calls that same origin; Vercel forwards the requests to Render. Do not set this variable to `localhost` or the Render origin when using the same-origin proxy.
- Configure Render with `NODE_ENV=production`, `WEB_ORIGIN=https://jarvis-ultimate-orcin.vercel.app`, `TRUST_PROXY_HOPS=1`, `COOKIE_SECURE=true`, `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, and the existing Neon `DATABASE_URL`. Leave `API_PORT` unset so the API uses Render's assigned `PORT`.
- Configure `AI_API_KEY`, `AI_MODEL`, and optionally `AI_BASE_URL` on Render only. Never expose provider credentials in Vercel `VITE_` variables.
- `WEB_ORIGIN` is normalized to an origin and must not include a path. CORS allows only that exact origin with credentials and the API's required headers. No wildcard or Vercel preview origins are allowed.
- Render's public web service terminates its ingress proxy before forwarding HTTP to the Node process. `TRUST_PROXY_HOPS=1` trusts only that immediate Render proxy hop; do not increase it unless the deployed proxy chain has been independently verified.
- Keep the session cookie `HttpOnly`, `Secure`, `SameSite=Strict`, host-only, and scoped to `/`. The same-origin rewrite avoids making the session a third-party cookie.

## Build, migrate, and deploy

1. Confirm the Vercel project root is the repository root. Set `VITE_API_BASE_URL` to the exact Vercel site origin above in the Production environment.
2. On Render, set the production variables above, including the exact `WEB_ORIGIN` without a trailing slash and `TRUST_PROXY_HOPS=1`.
3. Set Render's build command to `npm ci --include=dev && npm run build --workspace @jarvis/api`; TypeScript, Prisma CLI, workspace type declarations, and other build-time tools are development dependencies. The API production TypeScript config excludes tests, and the API workspace generates Prisma Client before building. `--include=dev` makes the build dependencies available without changing `NODE_ENV` or moving test-only packages into production dependencies.
4. Set Render's pre-deploy command to `npm run db:deploy --workspace @jarvis/api`. This applies the committed `20261019010000_voice_settings` migration and the `20261019020000_agent_mode_foundation` migration for Agent Mode task history and its legacy entitlement table, along with any other pending migrations. `prisma migrate deploy` applies committed migrations only; do not use `migrate reset` or `migrate dev` in production.
5. Set Render's start command to `npm run start --workspace @jarvis/api`. Keep Render's assigned `PORT`; do not hardcode port 3001 in production.
6. Deploy the API and wait for it to become healthy. Check `https://jarvis-ultimate.onrender.com/health/live` and `/health/ready`.
7. Deploy the Vercel frontend so the checked-in rewrites and its production `VITE_API_BASE_URL` are active. Vite embeds `VITE_` values at build time, so changing the variable requires a new Vercel deployment.
8. Verify the browser-visible requests use the Vercel origin for `/health/ready`, `/api/v1/auth/session`, login, and chat. Then test registration/login, refresh, a CSRF-protected action, and AI streaming.

The local Docker Compose file uses a development password and must not be used as a production database deployment. Set up Neon backups, monitoring, secret management, TLS, and rollback procedures with the selected hosting providers before release.

In local development (`NODE_ENV=development`), Agent Mode is enabled for authenticated users to support testing without manually provisioning entitlements. Outside development, the existing server-side entitlement check remains active. No email restrictions or billing setup are required for local use.

Agent Mode is a full-screen voice interface. It uses the existing AI provider for general conversation and suggested daily plans, existing authenticated task APIs for task operations, and explicit browser confirmation for website/search navigation. Voice calls require a supported browser, microphone permission, and a secure context (HTTPS or localhost). Browser speech recognition and synthesis vary by browser. Capture begins only after the user starts a call; microphone audio is used locally for amplitude visualization and browser speech recognition, and JARVIS does not store raw audio. The implementation is turn-based and is not a full-duplex real-time voice provider. Search fallbacks open results pages only and do not retrieve or summarize results. Persistent reminder notifications, external calendar writes, and desktop automation are not implemented.

## Production verification status

The Render health endpoints have been checked: liveness returned 200 and readiness reported the database available. The Render root path returns 404 by design because this service serves the API and health routes, not the frontend. An unauthenticated session request returning 401 is expected. The live preflight response was observed with a trailing slash in `Access-Control-Allow-Origin`, which does not match a browser Origin; the API now normalizes `WEB_ORIGIN` and the deployment must be updated to the exact origin above. The live Neon migration status, authenticated production login, and AI provider request cannot be verified without production credentials and a deployed build containing these changes.
