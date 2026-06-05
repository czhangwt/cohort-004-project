---
name: coding-standards--routing
description: React Router v7 file-based routing. Routes go in app/routes/, export loader/action/default/meta/ErrorBoundary. Business logic lives in services, not routes. Use when creating or modifying route files.
---

# Routing

## Framework

React Router v7 with file-based routing. Routes go in `app/routes/`.

## Route exports

Each route file can export:
- `loader` — fetch data before render
- `action` — handle mutations (POST, PUT, DELETE, etc.)
- `default` — the route component
- `meta` — page metadata
- `ErrorBoundary` — error handling

## Separation of concerns

**Don't put business logic directly in routes** — call into services instead.
