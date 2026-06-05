---
name: coding-standards--pricing
description: Prices stored in cents (integers), displayed with formatPrice() from ~/lib/utils which handles the "Free" case. Use when storing or displaying monetary values.
---

# Pricing

## Storage

Price values are stored in **cents** (integers).

## Display

Use `formatPrice()` from `~/lib/utils` to display them. It handles the "Free" case for `0`/`null`.
