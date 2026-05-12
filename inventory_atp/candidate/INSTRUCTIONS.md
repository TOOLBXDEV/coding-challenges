# Inventory Availability

**Time:** ~40 minutes total. We'll build this in **2-3 stages** — solve the problem described below first, then I'll introduce a new requirement and we'll work through how your design needs to change.

> **Resist the urge to over-engineer for stages you haven't seen.** Build what's described, not what you imagine might come next. We're going to evaluate how your model evolves under real (not anticipated) requirements.

## The scenario (Phase 1)

You're building the inventory-availability lookup for an LBM (lumber & building materials) distributor. When a sales rep is quoting a customer or a customer is checking the website, the system needs to answer: **how much of this SKU is available?**

For phase 1: a single yard, current stock only.

## What you implement

```ts
function availableQty(sku: string): number
```

Return how many units of the SKU are currently available. If the SKU is unknown, decide what to do and be ready to defend it.

The starter file (`starter.ts`) has:
- A small inventory table for one yard.
- The function signature stub.
- A driver that prints sample lookups.

## Notes

- Quantities are integers (units in the SKU's unit-of-measure — we're not converting between UOMs).
- You're free to add types, helpers, comments, tests, or rearrange anything in `starter.ts` except the embedded data.
- TypeScript is the default; use any language you're stronger in.

Talk through your thinking as you go.
