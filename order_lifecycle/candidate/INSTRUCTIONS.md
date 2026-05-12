# Order Lifecycle

**Time:** ~40 minutes total. We'll build this in **2-3 stages** — solve the problem described below first, then I'll introduce a new requirement and we'll work through how your design needs to change.

> **Resist the urge to over-engineer for stages you haven't seen.** Build what's described, not what you imagine might come next. We're going to evaluate how your model evolves under real (not anticipated) requirements.

## The scenario (Phase 1)

You're modeling order management for an LBM (lumber & building materials) distributor. A customer places an order; the order has line items; each line item is `(sku, quantity, unit_price)`.

## What you implement

Model the domain however you like, then implement these operations:

```ts
function placeOrder(customer: Customer, lines: OrderLineInput[]): Order
function getTotal(order: Order): number
```

Where `OrderLineInput` is a `(sku, quantity, unit_price)` tuple — the price is captured at order time.

The starter file (`starter.ts`) has:
- A small customer table.
- A `placeOrder` stub and a `getTotal` stub.
- A driver that places a sample order and prints the total.

## Notes

- All currency is CAD.
- Prices come in already calculated — you don't need a pricing engine here.
- Round however you think is right — be ready to defend it.
- You're free to design types, helpers, and structure however you like.
- TypeScript is the default; use any language you're stronger in.

Talk through your thinking as you go.
