# Walkthrough — Senior Model Evolution

How a strong senior tends to reshape the order/fulfillment model phase by phase. Pair with `GUIDE.md` (rubric) and `phases.md` (reveal scripts).

---

## Phase 1 — order with line items

**Strong shape:** simple, immutable, captures price at order time.

```ts
interface LineItem {
  sku: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  customer: Customer;
  lines: LineItem[];
  placed_at: Date;
}

function placeOrder(customer, lines): Order {
  return {
    id: nextOrderId(),
    customer,
    lines: lines.map(l => ({ ...l })),  // defensive copy
    placed_at: new Date(),
  };
}

function getTotal(order: Order): number {
  return round2(order.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
}
```

What "strong" looks like:
- Defensive copy of inputs (input arrays don't leak).
- `placed_at` captured — sets up time-as-first-class.
- Total is a pure function of lines.
- No status, no shipment list, no event log — there's no requirement for them.

What "weak" looks like:
- Builds an event store, an `OrderState` enum, and a `shipments: []` field "for later." This is **over-engineering** and a senior anti-pattern. The candidate doesn't yet know phase 2 exists; the right move is to solve today's problem.
- Mutates the input array.
- Stores customer ID by reference rather than embedding the customer (or vice versa) without being able to articulate why.

---

## Phase 2 — partial shipments + backorders

The candidate learns shipments are partial, lines may backorder, and an invoice is generated for what shipped (not what was ordered).

**The single mutable `quantity` is now wrong.** A line ordered for 10 might be shipped 6 + 4 across two shipments — possibly at different times, possibly at different prices in phase 3.

**Strong shape:** introduce `Shipment` as a first-class entity, keep order lines immutable.

```ts
interface OrderLine {
  sku: string;
  ordered_qty: number;
  unit_price: number;       // captured at order time
}

interface ShipmentLine {
  sku: string;
  shipped_qty: number;
  unit_price: number;       // captured at ship time (matters in phase 3!)
}

interface Shipment {
  id: string;
  order_id: string;
  shipped_at: Date;
  lines: ShipmentLine[];
}

interface Order {
  id: string;
  customer: Customer;
  placed_at: Date;
  lines: OrderLine[];
  shipments: Shipment[];
}

// Status is *derived*, not stored
function getStatus(order: Order): 'OPEN' | 'PARTIAL' | 'FULFILLED' {
  const shippedBySku = aggregateShipped(order);
  const allFulfilled = order.lines.every(l => (shippedBySku[l.sku] ?? 0) >= l.ordered_qty);
  const anyShipped   = order.lines.some(l  => (shippedBySku[l.sku] ?? 0) > 0);
  return allFulfilled ? 'FULFILLED' : anyShipped ? 'PARTIAL' : 'OPEN';
}

// Total now decomposed
function getOrderedTotal(order)   { return sum(order.lines.map(l => l.ordered_qty * l.unit_price)); }
function getShippedTotal(order)   { return sum(order.shipments.flatMap(s => s.lines).map(l => l.shipped_qty * l.unit_price)); }
function getOutstandingTotal(o)   { return getOrderedTotal(o) - getShippedTotal(o); }
```

Strong tells:
- Recognized the **single number "total" is now ambiguous** — ordered? shipped? outstanding? — and split it.
- Kept `OrderLine` immutable; ship state lives on `Shipment`, which is append-only.
- Captured price at the shipment level too — sets up phase 3 cleanly without backtracking.
- Status is computed, not stored — no possibility of "stored status disagrees with actual state" bug.

Senior candidates often pause and articulate: *"I want shipment to be a noun in this domain — it has a date, it's auditable, returns will reference it."* That self-narration is the signal.

Weak tells:
- Decrements `line.quantity` as shipments happen. Loses ordered qty entirely. Now you can't tell "did we order 10 and ship 6, or order 6 and ship 6?"
- Adds `shipments: []` to `Order` with no shipment line linkage — when phase 3 hits, can't trace returns.
- Stores status as a string field that has to be updated everywhere.
- Treats backorder as a separate type instead of "the gap between ordered_qty and shipped_qty."

---

## Phase 3 — returns + price drift

The candidate learns that returns reference past shipments, and that prices may have changed between shipment and return. The "obvious" `total = sum(qty × price)` no longer works; the order's net financial state is a projection over events.

**Strong shape:** add `Return` as another first-class entity referencing a `Shipment`. Preserve immutability of past shipments. Compute totals over events.

```ts
interface ReturnLine {
  sku: string;
  returned_qty: number;
  refund_unit_price: number;  // = original shipment price (POLICY)
}

interface Return {
  id: string;
  shipment_id: string;        // returns reference a specific shipment
  returned_at: Date;
  lines: ReturnLine[];
}

interface Order {
  id: string;
  customer: Customer;
  placed_at: Date;
  lines: OrderLine[];
  shipments: Shipment[];
  returns: Return[];
}

// Net total over the order's full event history
function getNetTotal(order: Order): number {
  const shipped  = sum(order.shipments.flatMap(s => s.lines).map(l => l.shipped_qty * l.unit_price));
  const refunded = sum(order.returns  .flatMap(r => r.lines).map(l => l.returned_qty * l.refund_unit_price));
  return round2(shipped - refunded);
}
```

Strong tells:
- **Return references shipment**, not order line. This is the key insight — without it, you can't determine the original price.
- Refund price is **derived from the shipment** at return time, not from current pricing. Articulated as a policy with a reason ("customer paid this; we refund this").
- `getTotal` is no longer a function of `lines` — it's a projection over `(shipments, returns)`. Some candidates will explicitly name this as event-sourcing-shaped.
- Doesn't mutate past shipments. Past is append-only.

Senior candidates may say something like: *"At this point, the order is more like an aggregate root with a stream of events — placed, shipped, returned, eventually invoiced and paid — and 'total' is just one of many projections. If this kept growing, I'd move to an explicit event log."*

That naming is a strong-hire moment. They don't have to use the term "event sourcing" — but they should see the shape.

Weak tells:
- Mutates `shipment.lines[i].shipped_qty` down by the return amount. Loses the audit trail. *"You just made the returns invisible after the fact."*
- Refunds at current price by mistake. When asked, doesn't see why that's a problem.
- Adds a `returns` field on the order line (not on the shipment) and tries to make math work. Can't, because the same line can have shipments at different prices.
- Tries to keep the original `getTotal = sum(line.qty × line.price)` and ends up with the wrong number, doesn't notice.

---

## Common stuck points

| Stuck on | What to do |
|---|---|
| Phase 1, picking IDs | Tell them `'O-' + Date.now()` is fine. Move on. |
| Phase 2, can't decide between mutate/shipment/events | Suggest shipment-as-noun; you're scoring whether they execute it cleanly, not whether they invent it. |
| Phase 3, won't fit in time | Pivot to discussion. Have them sketch types and the projection shape on the right side of the editor. |

---

## Calibration

| Outcome | Read |
|---|---|
| Phase 1 in 8 min, introduces Shipment cleanly in phase 2, sketches Return-references-Shipment with event projection in phase 3 | **Strong hire** |
| Phase 1 in 12 min, eventually arrives at Shipment after a wrong turn, decent return modeling | **Hire** |
| Phase 1 in 15 min, mutates `quantity` in phase 2, gives up in phase 3 | **No hire** |
| Phase 1 in 5 min with shipments/returns/events already built — but phase 2's actual shipment requirements don't quite fit because they over-fit a different shape | **No hire** — over-engineering is a senior anti-pattern |
