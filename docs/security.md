# Security

## Implemented controls

- Passwords are hashed with bcrypt (work factor 12) and never returned by API responses.
- Session tokens are random, stored as SHA-256 hashes, expiry-checked server-side, and carried in host-only, path `/`, HttpOnly, `SameSite=Strict` cookies. Production cookies require Secure. Production frontend requests should use the Vercel same-origin API rewrites so the session cookie is first-party rather than cross-site.
- Authenticated mutations validate a per-session CSRF token. Requests declaring an Origin must match `WEB_ORIGIN`.
- CORS is restricted to the normalized configured frontend origin; credentialed preflight allows only the methods and headers used by the API. Helmet sets HTTP security headers; JSON bodies are size-limited.
- The Render deployment trusts exactly one configured reverse-proxy hop (`TRUST_PROXY_HOPS=1`) for client IPs and rate limiting. Do not trust forwarded headers on direct/local connections.
- Registration/login share an IP-based rate limit. Inputs use Zod schemas. Responses omit stack traces.
- Task and conversation operations include the authenticated user ID in database lookups; client-provided owner IDs are not accepted.
- Agent Mode APIs require authentication, preserve CSRF protection for mutations, and scope task history and actions to the authenticated user. Navigation targets are limited to HTTP(S) public hostnames without embedded credentials or IP literals; localhost and local-network hostname suffixes are rejected. General destinations require browser confirmation; a user's explicit play-song voice request may directly open only a validated YouTube search URL. Destinations are never fetched by the server, and this search flow does not start playback.
- Memory operations are scoped to the authenticated user. Persistent memory is only created by an explicit save action; users can disable use or delete individual memories. Likely credential-shaped values are rejected by memory validation. Microphone capture starts only after an explicit call action, and the Web Audio analyser computes amplitude in the browser without sending the raw stream to the JARVIS API. Browser speech-recognition implementations may transmit audio according to that browser/provider's behavior; JARVIS does not store raw audio. Ending the call stops recognition, media tracks, the analyser, timers, synthesis, and any cancellable conversation stream. Voice transcripts sent to chat are persisted as conversation messages, while agent commands are persisted in the authenticated user's agent history.
- Provider keys stay in server environment variables. Logs record request IDs and avoid user message content and credentials.

## Configuration requirements

- Set `COOKIE_SECURE=true`, serve only over HTTPS, and configure a specific `WEB_ORIGIN` for production.
- Keep `.env` out of source control; only placeholders belong in `.env.example`.
- Use a unique, strong database password and managed secret storage in production. The checked-in Compose password is development-only.

## Remaining security work

Password recovery, email verification, account deletion/export, session revocation UI, stronger distributed rate limiting, audit records, authorization/integration scopes, upload validation and malware scanning, SSRF-safe web retrieval, and broader cross-user integration tests are not implemented. Do not expose unimplemented features as operational.
