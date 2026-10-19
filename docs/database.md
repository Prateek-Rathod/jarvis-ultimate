# Database

PostgreSQL is the persistent store; Prisma schema is in `apps/api/prisma/schema.prisma` and the generated initial migration is in `apps/api/prisma/migrations`.

## Models currently present

- `User`, `Session`, and `UserPreference`.
- `Conversation` and `Message`.
- `Task` and `Reminder`.
- `Memory` (a model only; no management or retrieval endpoints yet).

Private records reference `User` directly or through an owned conversation. Session token values are hashed before storage. Cascading relationships remove a user's sessions/preferences/conversations/messages/tasks/reminders/memories on account deletion if that operation is added.

Indexes support unique emails/session-token hashes, per-user recent conversations, per-conversation message order, and per-user task/reminder filtering.

## Migrations

For local development, run `npm run db:generate` then `npm run db:migrate`. Deployment should use `npm run db:deploy` after taking the platform's normal backup precautions.

Migration SQL was generated from the Prisma schema, but could not be applied or verified against a running PostgreSQL service in this environment because Docker Desktop's engine was unavailable and no PostgreSQL service was configured.
