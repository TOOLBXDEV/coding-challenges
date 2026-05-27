# Pricing Engine

**Time:** ~40 minutes total. We'll build this in **2-3 stages** — solve the problem described below first, then I'll introduce a new requirement and we'll work through how your design needs to change.

## The scenario (Phase 1)

You're building the pricing engine for an LBM (lumber & building materials) distributor. Customers buy SKUs at prices that depend on:

1. **List price** — every SKU has a published list price.
2. **Customer tier** — each customer is assigned a tier (`GOLD`, `SILVER`, or `BRONZE`). Tiers grant a flat percentage discount off list:
   - `GOLD` → 15% off
   - `SILVER` → 8% off
   - `BRONZE` → 0% off (pays list)

## What you implement

```ts
function getPrice(sku: string, customer: Customer): number
```

Given a SKU and a customer, return the per-unit price the customer pays.

The starter file (`starter.ts`) has:
- A small SKU list-price table (LBM products).
- A small customer table.
- The function signature stub.
- A driver that prints a few lookups so you can verify your work.

## Notes

- Round however you think is right — but be ready to defend the choice.
- You're free to add types, helpers, comments, tests, or rearrange anything in `starter.ts` except the embedded data.
- TypeScript is the default but you can use any language you're stronger in.

Talk through your thinking as you go.
