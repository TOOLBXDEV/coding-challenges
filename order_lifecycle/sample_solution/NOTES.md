# Design Journal — Order Lifecycle

## Process

### Phase 1 (0–10 min)

Read INSTRUCTIONS.md and the starter. Two clarifying questions I'd ask the
interviewer before writing anything:

1. *"Is `unit_price` the price-as-quoted at order time, or a live reference to
   a catalog?"* The spec says "captured at order time" — good, I'll snapshot it
   on the line. (This question matters because it foreshadows phase 3, even if
   I don't know that yet — it's just a normal modeling question.)
2. *"Currency / rounding tolerance?"* CAD per the brief; round to cents on
   display. Internally, store as JS number for now; flag that real money math
   should use integer minor units.

Then I'd type the obvious thing: an `Order` with an `id`, `customer`,
`placed_at`, and a `lines: LineItem[]`. `getTotal` = `reduce` over `qty *
price`, rounded once at the end. Defensive copy of the input array (I want
the order to own its lines, not alias the caller's array).

I'd resist the urge to add `status: OrderStatus`, an event log, or a
`shipments: []` field "for later." The instructions explicitly say "build what's
described, not what you imagine might come next." There's no shipment in phase
1; adding one is wasted code and locks me into a shape I might want to throw
away.

This phase should take 8 minutes.

### Phase 2 reveal (10–13 min)

When the interviewer says "lines don't always ship in one go… each shipment
is its own event… separate paperwork, possibly weeks apart," I'd pause for
**maybe 30 seconds** before typing. This is the moment that decides whether
the rest of the interview goes well.

The naive thing — decrement `line.quantity` as you ship — has a tell that
should jump out immediately: *if I do that, the original ordered quantity is
gone.* The interviewer can ask "how much did Bayside originally order?" and
the model can't answer.

So I'd say out loud: *"Three options: mutate the line with a `shipped_qty`
accumulator, introduce a `Shipment` entity, or go full event log. The
interviewer literally said 'each shipment is its own event — separate
paperwork, separate invoice line.' That's a noun in this domain. I'm
introducing a `Shipment` entity. Lines stay immutable."*

That self-narration is deliberate — it's the signal the rubric is testing for.

Then refactor:
- `LineItem` → `OrderLine` with `ordered_qty` (rename — it now means
  "originally ordered," not "current").
- `Shipment` is a new top-level entity with its own `id`, `shipped_at`, and
  `ShipmentLine[]`. Append-only.
- I'd put `unit_price` on `ShipmentLine` too. At this phase I don't *need* it —
  the price hasn't drifted yet — but it costs me one field and it makes the
  shipment a self-describing record. (This bet pays off in phase 3 immediately.)
- `Order.shipments: Shipment[]`. Status is **derived**, not stored.

`getTotal` becomes ambiguous, so I'd split it:
`getOrderedTotal` / `getShippedTotal` / `getOutstandingTotal`. I'd keep
`getTotal` as a thin alias for `getOrderedTotal` so phase 1 callers don't
break, and I'd say so out loud.

A guard in `ship()`: don't allow over-shipping vs. ordered_qty. Backorder is
just `ordered - shipped > 0` after the fact — no new type needed. (The
interviewer prompt explicitly tests this — they ask "what if a line never
ships in full?" and the right answer is *"that's already a graceful state in
my model — it's just a non-zero outstanding qty forever."*)

### Phase 3 reveal (27–30 min)

"Bayside calls — 3 of those 60 2x4x8s are damaged. Lumber prices spiked. At
what price do we refund?"

The trick here is that the answer is *already in my model*: the
`ShipmentLine.unit_price` I snapshotted in phase 2. If I hadn't done that
in phase 2, I'd have to backtrack and answer "do I refund at order-line
price or current price?" — but those collapse to the same thing only because
the order has only had one price so far. As soon as a line could be
re-shipped at a different price (imagine truck A at $3.20, then a price
update, then truck B at $3.49), order-line-price is wrong. Shipment-line-price
is the only correct source.

So I'd add `Return` as another append-only entity, **referencing
`shipment_id`**, not order line. The `refund_unit_price` on the return line
is copied from the shipment line. I'd articulate this as a policy:
*"The customer paid X on this shipment; we refund X. If they want today's
price, they can buy fresh."*

Then `getNetTotal = shipped - refunded`. And I'd say out loud:
*"At this point the order's 'total' is a projection over a stream of events —
placed, shipped, returned — and lines alone can't compute it. If invoicing
and payments came next, I'd seriously consider an explicit event log."*

That last sentence is the senior signal per the rubric — naming the shape
without rushing to build it.

If I had a spare minute, I'd add the "can't return more than was shipped
(net of prior returns)" guard. It's the obvious next bug.

---

## Key decisions

### Phase 1: keep `Order` boring

- Immutable line items captured at order time.
- `placed_at` so time is first-class from day one (cheap, useful later).
- Defensive copy of the input array.
- `getTotal` is a pure reduce; rounding happens once on the way out.

No status field, no shipments array, no events. The instructions warn
against over-engineering and the rubric flags it. Phase 1 is a 5-line
problem; I want to land the simple shape and have time for phase 2's actual
modeling work.

### Phase 2: Shipment as a noun, not a column

The big call: introduce `Shipment` as a first-class entity instead of
mutating the line. Three reasons:

1. **The domain says so.** The interviewer literally narrated "each shipment
   is its own event — separate paperwork, separate invoice line." That's a
   noun. Adding it means my types speak the same language as the warehouse.
2. **It preserves the past.** Mutating `line.quantity` down loses the
   original commitment. Even adding a `shipped_qty` accumulator on the
   line collapses two shipments into one number — fine until phase 3, when
   returns need to know *which* shipment.
3. **It lets status be derived.** With shipments on the side,
   `getStatus(order)` is `f(lines, shipments)` — there's no second source of
   truth to keep in sync.

I also put `unit_price` on `ShipmentLine`, not just on `OrderLine`. At phase 2
this is technically redundant (no price drift yet), but it costs one field
and makes the shipment a self-describing record. In phase 3 it becomes the
only correct source for the refund price, so I get the next refactor for
free.

`total` splits into `ordered`, `shipped`, `outstanding`. I keep `getTotal`
as an alias for `getOrderedTotal` so phase 1 callers keep working — and I'd
say out loud that "total" alone is now ambiguous and probably shouldn't
exist long-term.

### Phase 3: Return references Shipment, not OrderLine

The whole phase turns on this. If `Return` references `OrderLine`, it can't
distinguish "the 3 damaged units came from truck A at $3.20" vs. "truck B at
$3.49 (hypothetically)." Same SKU, same order line, two different prices.

By referencing the `Shipment`, the return inherits the shipment's price
snapshot, and the refund policy ("refund what they paid") is directly
expressible: `refund_unit_price = shipmentLine.unit_price`. No catalog
lookup, no time travel.

Past shipments are never mutated — `shipped_qty` stays as it was when the
truck left. The return is a separate row. This means the audit trail is
intact: anyone can ask "what was on truck A?" and get the original answer
forever. Refunds are a separate question.

### Why `total` is derived, not stored

A stored total is a cache, and caches go stale. Every operation
(`placeOrder`, `ship`, `returnFromShipment`) would have to remember to
update it. Worse, by phase 3, "total" splits into four meanings
(ordered / shipped / refunded / net), so a single stored field would lie
about three of them.

Computing each from `(lines, shipments, returns)` is cheap, can't desync,
and reads like the domain: *net = shipped − refunded.* That's the one-line
explanation a non-technical person can verify.

---

## Tradeoffs

### Mutate-the-line vs. shipment-as-noun vs. event log

- **Mutate the line** (rejected): simplest, but kills the audit trail and
  conflates "ordered" with "remaining." When phase 3 hit, returns would
  have nowhere good to live.
- **Shipment as a noun** (chosen): real domain object, append-only, makes
  status derivable and gives returns something to reference.
- **Full event log** (rejected for phase 2): the right shape if the
  domain keeps growing (invoices, payments, credit notes), but
  over-engineering for "place an order, ship some of it, return some of
  it." I'd name the option in phase 3 discussion as the next step if
  scope grew, without actually building it.

### Refund at original price vs. current price

- **Original price** (chosen): "the customer paid X, we refund X." Easy
  to defend in a dispute, easy to reason about, easy to implement
  (`shipmentLine.unit_price`).
- **Current price** (rejected): occasionally the customer's friend, often
  their enemy (price drops). Either way it's surprising, and surprises in
  refunds are the kind of thing that becomes a support ticket. Also
  requires a price oracle the order doesn't currently need.

### Store price on shipment line vs. always pull from order line

- **Store on shipment line** (chosen): one extra field, makes shipment
  self-describing, and is the only correct answer if the same line could
  ever ship at multiple prices (re-priced backorders, manual price
  override on a single truck, etc.).
- **Pull from order line on demand** (rejected): works in phase 2,
  silently wrong in some plausible phase 4. The cost of the wrong choice
  is a data migration; the cost of the right choice is one field.

### Status stored vs. derived

- **Derived** (chosen): always agrees with the underlying state.
- **Stored** (rejected): another place that has to be updated on every
  operation, and another place that can drift.

### Return references Shipment vs. OrderLine vs. SKU+date

- **Shipment** (chosen): the only place where price-paid is unambiguous.
- **OrderLine** (rejected): can't distinguish two shipments of the same
  SKU at different prices.
- **SKU + date** (rejected): asks the system to guess which shipment we
  meant. Brittle.

### `getTotal` keep-or-rename

- **Keep as alias for `getOrderedTotal`** (chosen): phase 1 callers keep
  working, deprecation can happen later.
- **Delete it** (rejected): unnecessary churn for the interview, and in
  reality I'd want a deprecation path.

---

## Hardest decisions

### 1. Whether to put `unit_price` on `ShipmentLine` in phase 2

The tension: in phase 2 alone, `unit_price` on the shipment line is
duplicate data — it always equals the order line's price. A strict YAGNI
read says don't add it. But I had a strong hunch that prices and shipments
were going to interact, and the cost of being wrong is asymmetric:

- If I skip the field and a later phase needs it, I'm doing a refactor
  (and possibly a data backfill) under time pressure.
- If I add the field and never need it, I've added one line per
  shipment line.

I added it. In phase 3 the call paid off — `Return.refund_unit_price`
just copies the field, no scrambling. This was *right on the edge* of
over-engineering, and I'd defend it the same way I'd defend it in code
review: *"a `Shipment` is a real-world record; a real-world record carries
its own prices. It's self-describing, not speculative."* If the
interviewer pushed back on it as YAGNI in phase 2, I'd hear them out —
it's a defensible argument.

### 2. Whether to introduce an event log in phase 3

After phase 3 it's tempting to refactor everything onto an explicit
event stream — `OrderPlaced`, `Shipped`, `Returned`, eventually
`Invoiced`, `Paid`, `Credited`. The walkthrough explicitly flags this as
a senior-strong move… **as a discussion**, not as code in 40 minutes.

I chose to stop at "shipment-as-noun + return-as-noun, with totals as
projections" and *name* the event-sourcing shape verbally. Reasons:

- The current model is a thin step away from event sourcing: shipments
  and returns are already append-only, and totals are already
  projections. The shape is right; only the storage is conventional.
- Going full event log mid-phase-3 means redoing all the operations,
  rewriting the projections, and probably not finishing. The interview
  rewards finishing the right shape over half-shipping the perfect one.
- If invoicing landed in phase 4, *that's* where I'd actually pull the
  trigger on events — invoices roll up multiple shipments and reference
  payments, which is the moment the order stops being a useful
  aggregate boundary.

### 3. What `getTotal` should mean post-phase-3

The phase 1 callers used `getTotal` to mean "what does this order cost?"
That's three different numbers now (ordered / shipped / net). I aliased
`getTotal` to `getOrderedTotal` because "what the customer committed to"
is the closest match to the original intent — but I could equally have
defended pointing it at `getNetTotal` ("what the order is worth right
now"). The honest answer is that in a real codebase I'd deprecate
`getTotal`, force callers to pick, and delete the alias in a follow-up.

---

## What I'd do with more time

Explicit YAGNI deferrals — these are real and deliberate, not oversights:

- **Invoicing.** Shipments imply invoices in B2B (one truck = one
  invoice line). Not asked for. The shape is obvious: `Invoice`
  references one or more shipments. I'd add it the moment a real
  scenario needs it.
- **Credit notes vs. cash refunds.** Phase 3 specifically said "credit
  note, not refund-in-cash." I modeled the *amount* but not the
  destination (account credit vs. card chargeback). That's a separate
  entity (`CreditNote`) and a separate flow.
- **Payments.** Same boat as invoices.
- **Partial cancellations of unshipped lines.** "Cancel the remaining 40
  on backorder." Today my model lets that quantity sit outstanding
  forever; a real system would want a `Cancellation` entity (or, if I'd
  gone full event log, a `LineCancelled` event).
- **Idempotency keys on operations.** `ship()` and
  `returnFromShipment()` should accept a client-supplied idempotency
  key so retries don't double-ship. Not relevant for an in-memory demo.
- **Persistence.** `ORDERS` and `SHIPMENTS` are in-memory `Record`s.
  Real system: postgres with append-only tables for shipments and
  returns, derived views for totals/status.
- **Money type.** JS numbers for currency are fine for a demo, wrong for
  a ledger. I'd use integer minor units (cents) and a `Money` wrapper.
- **Concurrency.** Two `ship()` calls racing could both pass the
  "outstanding qty" guard and over-ship. Real system needs a row lock or
  optimistic concurrency on the order.
- **Authorization.** Who is allowed to call `returnFromShipment`?
  Out of scope.
- **Audit / who-did-what.** Every operation should record an actor.
  Trivial to add (`actor_id` on shipments and returns), skipped because
  the brief didn't mention it.
- **Testing.** Real solution would have unit tests on the projections
  (they're pure functions over data — easy targets) and integration
  tests on the operations. The instructions said no test framework.

The intentional through-line: I left these out *because they weren't
asked for*. If any of them lands as phase 4, the current model bends
toward them cleanly — which is the whole point of getting the primitives
right at each phase rather than guessing at the future.
