# Architecture

## Current system

- `apps/web` is a React 19, TypeScript, Vite single-page client. Feature pages use TanStack Query for server state and a shared API helper for cookie credentials and CSRF headers.
- `apps/api` is a TypeScript Express API. Request IDs, structured request logs, security headers, JSON size limits, CORS, origin checks, rate limits, validation, and shared error responses are handled centrally.
- PostgreSQL is the durable store. Prisma models users, hashed sessions, preferences, conversations, messages, tasks, reminders, explicit user memories, Agent Mode entitlements, and agent execution history.
- `apps/api/prisma` contains the schema and initial SQL migration. Prisma 7 uses the PostgreSQL driver adapter.
- External AI calls are made only from the API. The browser receives response deltas over Server-Sent Events and never receives the API key.

## Request boundaries

1. The browser sends same-origin requests through Vite's development proxy.
2. Authentication middleware resolves a cookie session to the user record.
3. Mutations validate the session-bound CSRF token and request origin.
4. Route schemas validate input; queries filter by the authenticated user ID.
5. The API persists business records with Prisma and returns a documented JSON envelope or an SSE stream.

## Deliberate current limits

There is no persistent job queue, external file store, OAuth layer, document processor, billing provider, search provider, or desktop companion. Reminders remain schema-only and have no notification delivery. Agent Mode is a full-screen browser voice-call interface with an optional hands-free wake phrase, a Three.js GLB scene, a red/orange energy field, state-reactive animation, and a compact conversation transcript. Hands-free is opt-in and requires an explicit click and microphone permission. Wake detection uses the browser's Web Speech recognition API; this is not a hardware/local wake-word engine, may send speech to the browser vendor for transcription, and can stop when the tab is suspended or the browser ends its recognition session. JARVIS does not send ambient audio to its AI provider for wake detection. The interface reports recognition and permission failures and retries temporary recognition interruptions a limited number of times.

Agent Mode renders the supplied `apps/web/public/models/jarvis-armored-suit.glb` with Three.js, animated red/orange reactor rings, particles, floating and rotation effects, and emissive-material response to the speaking, listening, processing, and error voice states. The GLB was provided by the project owner; the browser loads it locally from the web app's public assets. Reduced-motion settings stop scene motion.

Agent Mode analyzes microphone amplitude locally, resumes recognition between turns, and releases media resources at call end. It is turn-based, not full-duplex speech-to-speech; speech output visualization follows browser synthesis events rather than analyzed output audio. Agent Mode uses the existing conversation stream and its system prompt for natural-language replies, and authenticated task APIs for task operations. Its deterministic tool registry supports task creation and navigation to validated public URLs. General website navigation requires explicit confirmation, while a specific spoken play-song request directly opens a validated YouTube search URL; no server-side browsing or arbitrary code execution is performed. Search fallbacks open provider pages without retrieving or summarizing results or starting playback. Unsupported requests are reported briefly without executing them. Persistent reminders, notification delivery, billing, real-time speech-to-speech, and local desktop control require separate implementation and verification.

`apps/api/src/modules/agent/desktop-adapter.ts` defines only a future structured desktop adapter contract. No adapter is registered or executable. A secure companion still needs explicit pairing, scoped permissions, authenticated command delivery, revocation, and independently verified local execution.
