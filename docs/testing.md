# Testing

Tests use **Vitest** with in-memory SQLite databases.

## Setup (`app/test/setup.ts`)

- `createTestDb()` — Creates an isolated `:memory:` database and runs Drizzle migrations against it (same schema as production).
- `seedBaseData()` — Inserts a user, instructor, category, and published course for tests.

Services are tested directly against these in-memory DBs.
