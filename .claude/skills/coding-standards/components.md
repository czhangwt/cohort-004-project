---
name: coding-standards--components
description: Component location rules (shadcn in ui/, custom in components/) and cn() for Tailwind class merging. Use when creating or moving components.
---

# Components & UI

## Component location

- **shadcn components** live in `app/components/ui/`
- **Custom components** go directly in `app/components/`
- Don't nest component folders deeper than that

## Class name utility

`cn()` from `~/lib/utils` for combining Tailwind classes. It's clsx + tailwind-merge.
