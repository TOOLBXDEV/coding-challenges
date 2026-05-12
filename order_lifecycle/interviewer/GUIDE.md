# Interviewer Guide — Order Lifecycle

**Total time:** 40 minutes. **Format:** codeinterview.io, screen-shared, TypeScript starter.

This is a **modeling** challenge. The signal is in **whether the candidate's primitives shift correctly** when the domain stops being atomic. Phase 1 looks trivial; phase 2 forces a real choice (mutate vs. introduce shipments vs. event log); phase 3 makes the order total a projection over events rather than a function of line items.

The candidate has been told there will be 2-3 stages but **not** what the stages contain. Don't preview them.

---

## Time budget

| Min | Phase | What you're listening for |
|---|---|---|
| 0-3 | Reads INSTRUCTIONS, looks at starter | Do they ask questions? *"What does an order need to support beyond a total?"* is a good clarifying question — but you don't have to give them the future. |
| 3-12 | Phase 1 (design + implement) | Should not take more than 10 min. |
| 12-13 | Reveal phase 2 (verbally + paste data from `phases.md`) | Watch the *reaction*: do they refactor or patch on top? |
| 13-27 | Phase 2 implementation + design discussion | Bulk of the signal. |
| 27-28 | Reveal phase 3 (often discussion-only) | Can they sketch the right shape verbally? |
| 28-37 | Phase 3 — code or design discussion | |
| 37-40 | Wrap, prompts from below | |

If a candidate is slow on phase 1, **gently unblock**. The interesting part is phase 2.

---

## What each phase tests

### Phase 1 — order with line items, totals

Trivial. The interesting question is what `Order` and `LineItem` look like as types. Some shape like:

```ts
interface LineItem { sku: string; quantity: number; unit_price: number; }
interface Order { id: string; customer: Customer; lines: LineItem[]; }

function getTotal(order) {
  return order.lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
}
```

What you're watching for:
- Did they mutate the input array or copy it? (Foreshadowing for phase 2 immutability.)
- Did they capture price at order time, or store a reference to "current price"? (Spec says price is on the input — but did they internalize that fact?)
- Did they over-design — adding a `status` field, an event log, or a `shipments` list before being asked? **Yellow flag.**

### Phase 2 — partial shipments + backorders

You reveal: *"Lines don't always ship in one go. A line ordered for quantity=10 might ship as 6 today and 4 next week. The customer is invoiced for shipped portion only. Some quantities get backordered indefinitely. We need to track what's been shipped, what's outstanding, and the order's status."*

You introduce a new operation: `ship(orderId, lineSku, quantity)`. (Strictly: `ship(orderId, shipments: { sku, quantity }[])` is more realistic — pick whichever serves the conversation.)

**This is where the model breaks.** Three reasonable directions:

| Direction | Trade-off |
|---|---|
| **Mutate the line** with `shipped_qty` accumulator | Simplest. But: if you ever need to know *which* shipment shipped *which* qty, you've lost it. Foreshadows trouble in phase 3. |
| **Introduce a `Shipment` entity** referencing line items | Adds a noun, but each shipment is now a first-class auditable thing. Naturally extends to returns. |
| **Event log** — `LineAdded`, `Shipped`, `Backordered` — and project state | Most extensible, most overhead. Strong candidates may name event-sourcing here, or arrive at it without naming. |

Most defensible mid-path: **introduce `Shipment`**. It's a real noun in the domain (LBM yards generate shipping documents), it preserves traceability, and it sets up phase 3 cleanly.

**Strong responses:**
- Asks: *"Can the customer be invoiced for the shipped portion before the order is fully fulfilled?"* — yes, in B2B that's normal.
- Recognizes that mutating `quantity` on the line loses the original ordered qty; either keeps both `ordered_qty` and `shipped_qty`, or splits into separate entities.
- Adds an order `status` (`OPEN` / `PARTIALLY_SHIPPED` / `FULFILLED`) and computes it from state — doesn't store it as a separate flag.

**Weak responses:**
- Subtracts shipped quantity from `quantity` directly. Now `quantity` doesn't mean "ordered" or "outstanding" — it means "remaining to ship," which is confusing and loses information.
- Stores `shipments` as a flat list on the order with no link back to which line they fulfilled.
- Treats backorder as a separate concept needing new types when it's just the gap between `ordered_qty` and `shipped_qty`.

### Phase 3 — returns + price drift

You reveal: *"The customer returns 3 of the 6 units that shipped on shipment #1. That happened 2 weeks ago. Between then and now, we've raised the price on that SKU. What price do we refund? And — what is this order's `total` now?"*

This is where the senior signal lights up. The naïve `getTotal = sum(qty * unit_price)` over line items doesn't work anymore because:
- Returns reference a **specific shipment** at the **price at that time**.
- Two shipments of the same line could be at different prices (if the line was ordered → partially shipped → re-priced → re-shipped).
- "Total" is no longer a function of the order; it's a projection over `(line added, shipped, returned, invoiced, refunded)` events.

**Strong responses:**
- Recognizes that returns must reference a `Shipment` (or shipment line), not just an order line.
- Decides explicitly that the **refund price = original ship price**, not current price, and explains why (customer trust, dispute resolution).
- Reshapes `getTotal` into something like `getNetTotal = shipped - returned (at original prices)` and is okay that line items alone can no longer compute it.
- May explicitly name event-sourcing or "treat the order as an aggregate over a stream of events." Doesn't have to use the words; the shape is what matters.

**Weak responses:**
- Mutates the shipment's `quantity` down by the return. Loses traceability.
- Refunds at current price without surfacing it as a policy decision.
- Tries to keep `total` as a sum over lines and ends up with a wrong number.
- Adds a `returns` field on the line and stops.

---

## Rubric (1-4 per dimension)

| # | Dimension | 1 = miss | 4 = strong |
|---|---|---|---|
| 1 | **Phase 1 restraint** | Builds shipments + status field for phase 1 | Ships a clean, simple order/line model |
| 2 | **Reaction to phase 2** | Mutates the line directly | Introduces `Shipment` (or events) and preserves ordered vs. shipped |
| 3 | **Status modeling** | Stores status as a flag, mutated externally | Computes status from state |
| 4 | **Reaction to phase 3** | Mutates shipment qty; refunds at current price implicitly | Returns reference shipments; refund price is explicit policy |
| 5 | **Total as projection** | `total` is a sum over lines, becomes wrong | `total` is computed over events / shipments / returns; immutable past |
| 6 | **Type quality** | Stringly-typed, mutable, weak boundaries | Discriminated unions, immutable shapes where it matters |
| 7 | **Domain language** | "List of stuff" terminology | Real domain nouns: shipment, backorder, return, invoice |
| 8 | **Communication** | Silent or hand-wavy | Names the modeling choice and trade-off out loud |

**Hire signal:** strong on #2 and #4 (the two refactor moments) plus 3+ on most others.

---

## Discussion prompts (last 3-5 min)

Pick 1-2.

- *"Build me a refund report — line items refunded, totals, by date range. Where does that data come from in your model?"* (Probes: derivability, query shape, projections)
- *"A truck rejected the shipment at the customer's site — we need to reverse it before it's invoiced. How does that flow through your model?"* (Probes: reversibility, append-only vs. mutation)
- *"In B2B, multiple shipments roll up into a monthly invoice. How does invoicing fit into what you've built?"* (Probes: invoice as another projection, decoupling)
- *"What if a SKU's price changed five times during an order's life? Does your `total` still work?"* (Probes: time-as-first-class, price-on-shipment-line)

---

## Anti-patterns to flag

- Builds shipment / status / events into phase 1 — over-engineering for a 5-line problem.
- Phase 2 lands and they subtract from `line.quantity` instead of separating ordered from shipped.
- Phase 3 lands and they keep `total` as `sum(line.qty * line.price)` and don't notice it's wrong.
- Refunds at current price without flagging it as a policy.
- Doesn't name `Shipment` as a noun; everything stays on the order/line.
- Introduces an event log in phase 1 unprompted (over-engineering) but **fails to introduce it in phase 3 when it's actually warranted** (under-engineering when it counts).
- Spends >12 min on phase 1.
