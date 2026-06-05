---
name: coding-standards--testing
description: Vitest with globals, db module mocking pattern (must come before import), service tests required for *Service.ts files. Use when writing or updating tests.
---

# Testing

## Framework

Tests use vitest with globals.

## Service tests

Anything marked as a 'service' (by the name of the file, for instance `authTokenService.ts`) should have tests written for them in an accompanying `.test.ts` file.

## Database mocking

Every test file needs to mock the db module. The mock MUST come before importing the service under test:

```ts
let testDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));
```

Use `createTestDb()` and `seedBaseData()` from `~/test/setup` in `beforeEach`.
