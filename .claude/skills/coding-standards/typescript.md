---
name: coding-standards--typescript
description: TypeScript conventions — object params for same-type arguments, no any, tagged ok/error result pattern for services. Use when writing functions, return types, or type annotations.
---

# TypeScript Patterns

## Object parameters for same-type arguments

When a function has more than one parameter with the same type (i.e. `string`), use an object parameter instead of positional parameters:

```ts
// BAD
const addUserToPost = (userId: string, postId: string) => {};

// GOOD
const addUserToPost = (opts: { userId: string; postId: string }) => {};
```

## No `any`

Don't use `any`. If you need a type you're not sure about, check the Drizzle schema or use `typeof` inference.

## Tagged results from services

When returning tagged/discriminated results from services (not validation), use `{ ok: true, ... } | { ok: false, error: string }` pattern. See `couponService` for reference.
