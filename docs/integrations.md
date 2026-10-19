# Integrations

## AI provider

The assistant supports an OpenAI Chat Completions-compatible streaming endpoint. Configure `AI_API_KEY` and `AI_MODEL` on the backend; `AI_BASE_URL` is optional. The API defaults to `https://api.openai.com/v1`. Verify that the configured provider supports the streaming format.

## Other services

Google Calendar, Gmail, Google Drive, GitHub, weather, web search, embeddings, email delivery, OAuth, object storage, and persistent background queues are not integrated yet. No connected status is shown for these unavailable services. Credentials and scopes must be specified and reviewed when each integration is implemented.

## Local PostgreSQL

`docker-compose.yml` provides PostgreSQL 17 for development only. It is not a managed or production database configuration.
