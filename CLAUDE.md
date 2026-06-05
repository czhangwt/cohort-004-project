# CLAUDE.md

Full-stack course platform (mini Udemy) built with React Router v7 (SSR mode), TypeScript, SQLite (better-sqlite3), and Drizzle ORM.

## Essentials

- **Package manager**: `pnpm` (not npm)
- **Import alias**: `~/` maps to `app/`
- **Database access**: Always use service functions from `app/services/` — never use `db` directly in route loaders/actions.

## Core Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at `http://localhost:5173` |
| `pnpm build` | Production build (SSR) |
| `pnpm test` | Run all Vitest tests |
| `pnpm typecheck` | Type-check the project |
| `pnpm db:migrate` | Run Drizzle migrations against `data.db` |
| `pnpm db:generate` | Generate new Drizzle migrations from schema changes |
| `pnpm db:seed` | Seed database with fake data |

## Deeper Dives

- [Architecture](docs/architecture.md) — route structure, service layer, database schema, auth flow, library utilities
- [Components](docs/components.md) — component inventory and patterns
- [Testing](docs/testing.md) — Vitest setup, in-memory databases, seed helpers
- [Full Command Reference](docs/commands.md) — all pnpm scripts
- [Sandcastle](docs/sandcastle.md) — AI agent orchestration layer