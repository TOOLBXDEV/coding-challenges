# NOTES — Inventory ATP

A design journal for what I built and why, written like I lived through the 40 minutes.

---

## Process

### Minutes 0–3 — read INSTRUCTIONS, look at the data

The brief warned me twice: 2–3 stages, don't over-engineer for what I haven't seen yet. The `ON_HAND` table is a flat `Record<string, number>`. The signature is `(sku: string) => number`. There's a `?? 0`-shaped one-liner staring me in the face.

The only real question for phase 1 is "what does an unknown SKU return?" — `0`, `null`, throw — all defensible. I'd say out loud: "I'll go with `?? 0` and treat unknown as 'not stocked'. If product needs to distinguish 'we don't carry this' from 'we're sold out' we can revisit." Then move on.

### Minutes 3–10 — phase 1

```ts
function availableQty(sku: string): number {
  return ON_HAND[sku] ?? 0;
}
```

That's it. Run the driver. Done. I'm not building an `InventoryService` class for a hash-table lookup. If asked "how would you scale this?" I'd say "I'd want to see what scaling pressure actually looks like before adding indirection."

### Minutes 10–11 — reveal of phase 2

Three things change at once: yards, committed, on_PO with ETAs. The first thing I'd say is **"so what does 'available' actually mean now?"** Because the brief implies three different callers (sales rep quoting a future delivery, a website browser, the fulfillment team) and they want different answers:

- Quoting for next Friday → `on_hand − committed + on_PO arriving by Friday`
- Website "in stock today?" → `on_hand − committed`, ignore future POs
- Fulfillment routing → wants the per-yard breakdown, not a total

This is the moment the original signature `availableQty(sku): number` is dead — "available" no longer has a single answer. I'd state that explicitly.

What I'd ask the interviewer: **"For the function's primary purpose, can I assume 'deliverable by an `asOf` date, at a yard'? I'll make `asOf` and `yard` parameters so the caller picks the view."** They'd say yes.

### Minutes 11–27 — phase 2 implementation

I'd type the per-yard ATP function first because it's the actual primitive:

```ts
function atpAtYard(sku, yard, asOf): number
```

That contains the math. Then aggregation across yards is a separate function that reduces over yards. Then a `report` function for the dashboard caller.

Three things I'd articulate while typing:
1. on_PO is filtered by `eta <= asOf`. Future stock doesn't help today's promise.
2. `Math.max(0, on_hand - committed + incoming)` — never return negative. Oversold is a real state but not what this function is for.
3. **Yard locality is not transfer policy.** I won't bake "we can ship from another yard" into the math. That's a routing decision and it lives somewhere else.

A pause-to-refactor moment: after the first version, I'd notice that `report` repeats the row-filter logic. Worth pulling a `rowsFor(sku, yard)` helper — but probably not. The duplication is two lines and clarifies what each function does. I'd leave it.

### Minutes 27–28 — reveal of phase 3

Substitutions and kits, both at once. The senior tell here is recognizing they are **different relationships**:

- A kit is a **tree** — composition, downward (kit → components → maybe more kits).
- A substitution is a **graph edge** — equivalence, sideways (A ≈ B for some customers).

These should not share storage. They should not share code paths. I'd say this out loud before writing anything.

### Minutes 28–37 — phase 3 implementation

I picked one facade — `availableQty(sku, opts)` — that knows about both, but routes them differently:

- If the SKU is a kit → recurse into components, take the bottleneck (`Math.floor(component / per_kit)`, then `min`).
- If the SKU is plain → compute base ATP, optionally add applicable substitute stock.

Two concerns I called out:
1. **Cycles.** A kit's component might be a kit. I added a `visited` set guard. If someone defines a self-referential kit, we return 0 instead of stack-overflowing. Cheap, correct.
2. **Anonymous-customer default.** The website calls this for someone who hasn't logged in. If `customer` is undefined and a sub rule is segment-gated, the rule does NOT fire. Universal subs (`customer_segments: null`) still fire. This matches "strict mode is the safer default" — we shouldn't silently inflate stock for the anonymous case.

### Minutes 37–40 — wrap

I'd be ready to discuss federation/concurrency/caching as design conversation but wouldn't try to implement any of it.

---

## Key decisions

### Phase 1
- **`?? 0` for unknown SKU.** Stated and defended.
- **No types yet.** Don't pre-build `InventoryRow` for data I don't have.

### Phase 2 — the "available" moment
This was the meaningful decision phase. The realization: **"available" is not one number, it's a view the caller picks.** That changes the API:

- `atpAtYard(sku, yard, asOf)` — the primitive. Per-yard, time-bounded.
- `atpAcrossYards(sku, asOf)` — composition on top.
- `atpReport(sku, asOf)` — structured shape for callers that want the breakdown.

Other choices:
- **`asOf` is a `Date`, required at this layer.** No magic "now" inside the function — that makes it untestable. The facade defaults to epoch (= no future POs counted) for the "right now" callers.
- **Cap negative ATP at zero.** Surfacing oversold needs a different report.
- **Yard locality is the caller's concern.** The function says "here's what's at VAN today." It doesn't say "and BBY can transfer some by Friday." That's a transfer-routing layer.

### Phase 3 — kits and subs are different shapes
This was the architectural call. Kits and subs are stored separately (`KITS` array, `SUB_RULES` array), have different types, and run through different code paths in the facade. Specifically:

- **Kit math = bottleneck.** `min(floor(component_atp / qty_per_kit))`. Articulated as "whichever component runs out first caps the kit."
- **Sub math = additive, conditional, opt-in.** Caller sets `includeSubs: true`. Then for the given customer's segment, applicable subs add their ATP to the base.
- **Recursion is real.** The kit traversal is recursive with a `visited` set guard.

### Function signature evolution
- Phase 1: `availableQty(sku: string): number`
- Phase 2: `atpAtYard(sku, yard, asOf): number` (renamed; old signature deleted) + an aggregate sibling.
- Phase 3: `availableQty(sku, opts: { yard?, asOf?, customer?, includeSubs? }): number` — facade that picks the view, with the phase-2 primitives still available underneath for callers that want them directly.

The options-bag shape is deliberate: as views multiplied (yard scope, asOf, customer, sub policy), positional args got unreadable.

---

## Tradeoffs

**Per-yard ATP as primitive vs aggregate as primitive.**
Chose per-yard. Rejected aggregate-first because it loses information you can't reconstruct. From per-yard you can always sum; from aggregate you can never split. The aggregate function is two lines on top of the primitive.

**Substitution as data vs substitution as option.**
Chose option. Rejected baking substitutes into the inventory rows (e.g. "this row contributes to A8-412X-HF demand"). Subs are a relationship between SKUs, customer-conditional. If they were stored in inventory, you'd need to denormalize for every customer segment, and you'd lose the opt-in capability — the website case requires "no subs" by default.

**Recursion vs iteration on kit traversal.**
Chose recursion. The kit graph is a tree (with the visited-set guard for malformed data) and recursion reads naturally as "a kit is its bottleneck-component-as-kits." Iteration would need an explicit stack. With shallow real-world kit depth (1–3 levels), the simplicity wins.

**Single facade `availableQty(sku, opts)` vs separate `kitAvailability` / `availableSku`.**
Chose single facade. Rejected splitting because the caller frequently doesn't know whether a SKU is a kit — a sales rep quoting `DECK-KIT-SM` should call the same function as one quoting `A8-412X`. Internally the facade dispatches to kit-vs-plain logic.

**Options bag vs positional args.**
Chose options bag once we hit four parameters. Positional `(sku, yard, asOf, customer, includeSubs)` is bug-bait — you'll pass `undefined` for one and a `Date` shows up where a `Customer` should be.

**Cap ATP at zero vs return signed value.**
Chose cap. Rejected returning negative numbers because every plausible caller (quoting, website, kit math) does the wrong thing with `-30`. Oversold is real — but it belongs in a different report, not bleeding into the ATP number.

**Default `asOf` to epoch vs to "now".**
Chose epoch. Rejected `new Date()` because it makes pure functions impure and tests time-dependent. Epoch encodes "no future POs count" cleanly — which is the website browser's view.

---

## Hardest decisions

These are the ones that genuinely could have gone the other way:

### 1. Should kit math live inside `availableQty` or in a separate `kitAvailability`?

I went with single facade. The argument for splitting: kits are conceptually different from plain SKUs (no row in inventory, different math, different failure modes), and forcing them through one function risks the function feeling overloaded.

The argument for unifying — which won — is the caller-doesn't-know-which-it-is point. From a quoting tool's perspective, "how many DECK-KIT-SM can I sell?" has the same shape as "how many A8-412X?". If the function diverges, every caller has to pre-classify. That's leaky.

What I'd revisit: if kits grow another dimension (configurable kits, BOM versioning), the facade may strain. At that point I'd extract `kitAvailability(sku, opts)` and have the facade dispatch to it — which is a one-line change.

### 2. Number vs structured report as the return type.

I went with `number` for the facade and added `atpReport` as a separate function for callers that want the breakdown. Could have made the facade return `{ atp, byYard, ... }` and let callers project to a number.

The argument for structured: callers asking "where can we ship from?" need the breakdown anyway. Returning `number` forces them to call twice or call a different function.

The argument for number — which won — is that 90% of callers (website, quoting, kit math itself) want a single number, and a one-line `availableQty(sku, opts)` reads more cleanly than `report.total_atp` everywhere. The richer shape exists when you need it.

### 3. Are universal substitutes (`customer_segments: null`) really a different case from segment-gated?

The data models them as the same shape with `null` meaning "any". I implemented "applies to anyone, including anonymous browsers." The defensible alternative: `null` means "any logged-in customer regardless of segment, but anonymous still doesn't get them." Could be argued either way without product input.

I went with the looser interpretation because the data calls it "applies to anyone" and the SUB_RULE for OSB sheathing reads like genuinely interchangeable inventory. But this is the place I'd most want product to confirm.

---

## What I'd do with more time

Explicit YAGNI list — things I deliberately did not build:

- **Concurrency / commit allocation.** Two orders racing for the last unit. Today this is a read function; commits live elsewhere. In production I'd want optimistic locking on the commit path, atomic decrement in the database, and a clear contract that ATP is a hint not a reservation.
- **Caching.** The discussion prompt mentions 1000 reads/sec vs 10 writes/sec. I'd cache `atpAtYard(sku, yard, asOf)` keyed by `(sku, yard, day-bucket-of-asOf)` with invalidation on commit/PO change. But premature without traffic data.
- **Federation across vendor APIs.** The marketplace partner with 500ms latency. I'd expand the return shape to include a `freshness` field per yard (`{ source: 'local'|'partner', as_of_response: Date }`) and let callers choose stale-OK vs strict. Fallback semantics — what does ATP return if the partner is down? Probably exclude with a warning surface, not fail the whole call.
- **Reservation as a separate write path.** Right now ATP is a pure read. If we add `reserveQty(sku, qty, customer)` it should share the row-fetch code but absolutely not the math — reservations decrement state, ATP just reads it.
- **Observability.** Each call should emit a structured event with `(sku, yard, asOf, customer.segment, includeSubs, result)` so we can trace why a quote came out wrong.
- **Promise-date semantics.** Right now `asOf` is "all POs arriving on or before this date." Real-world might want lead-time per yard, weekend buffers, vendor reliability haircuts. All deferrable.
- **Kit-with-substitutes-on-components.** Today, if a kit's component has a substitute, kit availability ignores the sub. That's defensible (kits are a fixed BOM) but might not be what product wants. I'd ask before changing the math.
- **Error type hierarchies / logger / DI.** The brief explicitly forbids these. Even if it didn't, a 200-line read function doesn't earn them.
