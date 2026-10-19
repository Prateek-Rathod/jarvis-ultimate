# AI system

## Provider configuration

The API sends requests to an OpenAI Chat Completions-compatible endpoint. Configure `AI_API_KEY` and `AI_MODEL`; optionally set `AI_BASE_URL` (default `https://api.openai.com/v1`). No key or hardcoded answer is embedded in the frontend.

If a key or model is missing, the request returns `503 AI_PROVIDER_NOT_CONFIGURED`. Provider HTTP `401` and `404` responses are normalized to `502` with specific error codes; provider `429` is returned as `503 AI_PROVIDER_RATE_LIMITED`. Other provider rejections return `502 AI_PROVIDER_ERROR`.

Provider diagnostics record the provider hostname/name, configured model, response-reported model when available, upstream HTTP status, and request duration. Logs do not include API keys, authorization headers, cookies, or user message content. The response-reported model is saved on the assistant message when present; if the provider omits it, the configured model is saved instead.

## Context and persistence

The API persists the user message, selects at most 40 most-recent messages for the conversation, restores chronological order, then includes the newest complete messages that fit within a 24,000-character conversation-history budget. This bounds provider context size while retaining the latest user message (the API accepts up to 20,000 characters per message). If memory use is enabled, up to three keyword-relevant user-approved memories are included as context; memory content is explicitly treated as data, not instructions. Assistant content is persisted after a completed or interrupted stream. The implementation does not store model hidden reasoning.

## Streaming and cancellation

Actual upstream provider stream chunks are forwarded as SSE deltas; the server does not simulate streaming. A stream is only marked complete after the provider stream finishes successfully; interrupted partial output is persisted with an interrupted status and returned with an SSE error event so the client can offer a retry. Client cancellation aborts the upstream request. Provider calls have a two-minute timeout. A missing or unavailable AI provider is an explicit error.

## Not implemented yet

Tool calling, embeddings/semantic memory retrieval, document retrieval, usage/cost tracking, model capability discovery, provider retry policy, per-user AI quotas, and workflow approvals remain future work. The current assistant is conversational only and must not be represented as an action-capable agent.
