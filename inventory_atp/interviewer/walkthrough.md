# Walkthrough — Senior Model Evolution

How a strong senior tends to evolve the inventory model phase by phase. Pair with `GUIDE.md` (rubric) and `phases.md` (reveal scripts).

---

## Phase 1 — single yard, on-hand only

**Strong shape:** trivial.

```ts
function availableQty(sku: string): number {
  return ON_HAND[sku] ?? 0;
}
```

What "strong" looks like:
- One line.
- Decided what to do for unknown SKU and stated it (`?? 0`, throw, return null — any of these are fine if articulated).
- Moves to phase 2 quickly.

What "weak" looks like:
- `class InventoryService { private on_hand: Map<...>; ... }` for a 5-line problem. Over-engineering.
- Imports a logger, designs error types, builds a "future-proof" generic `availableQty<T>`. Solving tomorrow's problem badly while ignoring today's.

---

## Phase 2 — multi-yard + commitments + on_PO

The candidate now has data shaped like:

```ts
interface InventoryRow {
  sku: string;
  yard: string;
  on_hand: number;
  committed: number;          // allocated to open orders
  on_po: Array<{ qty: number; eta: Date }>;
}
```

**The single-row lookup is gone.** ATP for a single yard is `on_hand - committed + on_po(eta <= asOf)`. Aggregate ATP is the sum across yards.

**Strong shape:** decompose. Per-yard ATP is the primitive; aggregation and transfer policy compose on top.

```ts
function atpAtYard(sku: string, yard: string, asOf: Date): number {
  const rows = INVENTORY.filter(r => r.sku === sku && r.yard === yard);
  if (rows.length === 0) return 0;
  return rows.reduce((sum, r) => {
    const incoming = r.on_po
      .filter(p => p.eta <= asOf)
      .reduce((s, p) => s + p.qty, 0);
    return sum + Math.max(0, r.on_hand - r.committed + incoming);
  }, 0);
}

function atpAcrossYards(sku: string, asOf: Date): number {
  const yards = unique(INVENTORY.map(r => r.yard));
  return yards.reduce((s, y) => s + atpAtYard(sku, y, asOf), 0);
}

// More expressive return shape if the candidate goes there:
interface AvailabilityReport {
  sku: string;
  asOf: Date;
  byYard: Array<{ yard: string; on_hand: number; committed: number; incoming: number; atp: number }>;
  total_atp: number;
}
```

Strong tells:
- **Asked what "available" means** before coding. Different callers want different views: "right now physically" vs "deliverable by Friday" vs "sellable inclusive of incoming."
- Signature became `(sku, yard?, asOf?)` — explicitly. Or returns a structured report so the caller picks what they need.
- Per-yard ATP is the primitive. **Don't bake "can we source from yard B" into the math** — that's a transfer-routing policy on a different layer.
- on_PO is filtered by `asOf` / promise date. Future incoming doesn't help today's quote.
- Caps negative ATP at zero (`Math.max(0, ...)`) or at minimum surfaces oversold state explicitly.

Senior candidates often verbalize the framing: *"This function is doing two things — measuring availability at a yard, and aggregating across yards. I'll keep them separate because the aggregation rule depends on context — quoting wants the home yard, fulfillment wants nearest-with-stock."*

Weak tells:
- Sums `on_hand` across yards and calls it the answer. Customer at yard A is told "we have 200" when those 200 are at yard B and can't be transferred for two weeks.
- Counts all on_PO regardless of ETA. Promises stock that won't arrive in time.
- Subtracts `committed` from each yard but doesn't subtract committed for the right SKU — accidentally subtracts global commits.
- Picks one ATP definition silently (usually the most generous one) and doesn't mention the alternatives.

---

## Phase 3 — substitutions + kits

Two new relationship types:

| Relationship | Direction | Example |
|---|---|---|
| **Equivalence** (substitution) | sideways: A ≈ B (under conditions) | 2x4x8 SPF substitutes for 2x4x8 Hem-Fir for some customers |
| **Composition** (kit/BOM) | downward: K = N×A + M×B | Deck kit = 12 joists + 20 boards + 200 screws |

**Strong shape:** keep these clearly separate.

```ts
interface SubRule {
  primary_sku: string;
  substitute_sku: string;
  customer_segments?: string[];   // null = all customers
}

interface KitDefinition {
  kit_sku: string;
  components: Array<{ sku: string; qty_per_kit: number }>;
}

function atpAtYardForSku(sku, yard, asOf, customer?, includeSubstitutes = false): number {
  const kit = KITS.find(k => k.kit_sku === sku);
  if (kit) {
    // Kit: bottleneck across components. Each component itself is recursive.
    return Math.min(...kit.components.map(c =>
      Math.floor(atpAtYardForSku(c.sku, yard, asOf, customer, includeSubstitutes) / c.qty_per_kit)
    ));
  }

  let qty = atpRawAtYard(sku, yard, asOf);   // the phase-2 implementation
  if (includeSubstitutes) {
    const subs = SUB_RULES.filter(r =>
      r.primary_sku === sku &&
      (!r.customer_segments || r.customer_segments.includes(customer?.segment ?? ''))
    );
    qty += subs.reduce((s, r) => s + atpRawAtYard(r.substitute_sku, yard, asOf), 0);
  }
  return qty;
}
```

Strong tells:
- **Kits and subs are different shapes.** Kits go through `Math.min(...components.map(c => atp(c) / c.qty_per_kit))`. Subs add equivalent stock conditionally.
- **Substitution is opt-in / customer-conditional**, not a property of inventory. The function gains a `customer` or `includeSubstitutes` parameter.
- **Recursion is real.** A kit's component might be a kit (kits-of-kits) or have a sub. Strong candidates flag this even if they don't implement: *"I'm not handling cycles — in production I'd cache visited SKUs or limit depth."*
- The kit math is articulated: *"Available kits = floor of the bottleneck — whichever component runs out first caps you."*

Senior candidates often say something like: *"There are two graphs here. Substitutions are a directed graph between equivalent SKUs. Kits are a tree — a SKU has a list of children that compose it. They shouldn't share storage."*

Weak tells:
- Stores substitute SKUs in the inventory array as if they were extra stock. Now substitutability is a property of inventory rather than a relationship — wrong.
- Treats kits and subs as the same thing, both adding to the qty.
- Linear loop over components with the right math but the candidate can't articulate what `min` is computing.
- Doesn't notice that components can themselves be kits — recursion isn't acknowledged.
- Adds substitute-as-fact rather than substitute-as-option (always-on, can't be turned off per request).

---

## Common stuck points

| Stuck on | What to do |
|---|---|
| Phase 1, "what about UOM?" | Spec says integers only — push them past it. |
| Phase 2, what does "available" mean | Tell them to pick a definition (any) and articulate it; the *picking* is what you score. |
| Phase 3, recursion paralysis | Tell them to assume one level of nesting and flag the rest as a TODO with a comment. |

---

## Calibration

| Outcome | Read |
|---|---|
| Phase 1 in 3 min, asks "what does available mean" in phase 2 and reshapes signature deliberately, separates kits from subs in phase 3 | **Strong hire** |
| Phase 1 in 8 min, gets phase 2 right after a discussion, kit math right but conflates with subs | **Hire** |
| Phase 1 in 10 min, sums across yards in phase 2, gives up in phase 3 | **No hire** |
| Phase 1 in 3 min with a class hierarchy that doesn't quite fit the actual phase-2 data | **No hire** — over-engineering |
