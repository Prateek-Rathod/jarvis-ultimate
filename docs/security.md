# Security

## Implemented controls

- Passwords are hashed with bcrypt (work factor 12) and never returned by API responses.
- Session tokens are random, stored as SHA-256 hashes, expiry-checked server-side, and carried in HttpOnly, `SameSite=Strict` cookies. Production cookies require Secure.
- Authenticated mutations validate a per-session CSRF token. Requests declaring an Origin must match `WEB_ORIGIN`.
- CORS is restricted to the configured frontend origin; Helmet sets HTTP security headers; JSON bodies are size-limited.
- Registration/login share an IP-based rate limit. Inputs use Zod schemas. Responses omit stack traces.
- Task and conversation operations include the authenticated user ID in database lookups; client-provided owner IDs are not accepted.
- Memory operations are scoped to the authenticated user. Persistent memory is only created by an explicit save action; users can disable use or delete individual memories. Likely credential-shaped values are rejected by memory validation. The browser speech API may process audio according to browser-provider behavior; JARVIS does not store raw audio.
- Provider keys stay in server environment variables. Logs record request IDs and avoid user message content and credentials.

## Configuration requirements

- Set `COOKIE_SECURE=true`, serve only over HTTPS, and configure a specific `WEB_ORIGIN` for production.
- Keep `.env` out of source control; only placeholders belong in `.env.example`.
- Use a unique, strong database password and managed secret storage in production. The checked-in Compose password is development-only.

## Remaining security work

Password recovery, email verification, account deletion/export, session revocation UI, stronger distributed rate limiting, audit records, authorization/integration scopes, upload validation and malware scanning, SSRF-safe web retrieval, and broader cross-user integration tests are not implemented. Do not expose unimplemented features as operational.
