---
name: coding-standards--auth
description: Cookie-based auth via ~/lib/session. How to get the current user and protect routes. Use when writing loaders/actions that need user identity or route protection.
---

# Auth

Auth is cookie-based via `~/lib/session`.

## Getting the current user

Use `getCurrentUserId(request)` in loaders/actions. Returns `number | null`.

## Protecting routes

Redirect to `/login` if `getCurrentUserId` returns `null`.
