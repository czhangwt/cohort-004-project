---
name: coding-standards--database
description: SQLite + Drizzle schema conventions — auto-increment integer PKs, ISO string timestamps, boolean mode, soft deletes with deleted_at. Use when creating migrations, defining schema, or writing queries.
---

# Database Standards

## Setup

SQLite via better-sqlite3 + Drizzle. The db instance is initialized in `app/db/index.ts` with WAL mode and foreign keys enabled. **Don't create new Database connections in service code** unless you have a really good reason.

## Primary keys

DB ids are always `integer().primaryKey({ autoIncrement: true })`. Don't use UUIDs.

## Timestamps

Timestamps in the database are stored as ISO strings in `text` columns, not as unix timestamps or integers. Use `$defaultFn(() => new Date().toISOString())` for defaults.

## Booleans

Booleans in SQLite are stored as integers with Drizzle's `mode: "boolean"`, e.g. `integer("ppp_enabled", { mode: "boolean" })`.

## Soft deletes

For soft deletes, use a nullable `text("deleted_at")` column. Don't actually delete rows. See `lessonComments` in the schema for an example.
