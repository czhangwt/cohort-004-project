---
name: coding-standards--forms
description: Form validation with parseFormData/parseParams/parseJsonBody from ~/lib/validation, and Zod discriminated unions for multi-intent actions. Use when handling form submissions in route actions.
---

# Forms & Validation

## Form validation in route actions

Use `parseFormData(formData, zodSchema)` from `~/lib/validation`. It returns `{ success, data, errors }`.

For route params use `parseParams`. For JSON request bodies use `parseJsonBody`.

## Multiple intents in one action

When a single route action needs to handle multiple different form submissions (like a page with both a "mark complete" button and a "delete comment" button), use Zod discriminated unions on an `intent` field:

```ts
const schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("mark-complete") }),
  z.object({
    intent: z.literal("delete-comment"),
    commentId: z.coerce.number(),
  }),
]);
```
