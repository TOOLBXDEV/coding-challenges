# Walkthrough — Senior Model Evolution

How a strong senior tends to reshape the pricing model phase by phase. Pair with `GUIDE.md` (rubric) and `phases.md` (reveal scripts and data).

---

## Phase 1 — list price + tier

**Strong shape:** flat function, table-driven discount, simple lookup.

```ts
const TIER_DISCOUNT: Record<Tier, number> = {
  GOLD: 0.15, SILVER: 0.08, BRONZE: 0,
};

function getPrice(sku: string, customer: Customer): number {
  const list = LIST_PRICES[sku];
  if (list == null) throw new Error(`Unknown SKU: ${sku}`);
  return round2(list * (1 - TIER_DISCOUNT[customer.tier]));
}
```

What "strong" looks like:
- Pulled the discount table out as data, not branches.
- Threw on unknown SKU instead of returning 0 / NaN silently.
- Picked an explicit rounding policy at the boundary.

What "weak" looks like:
- A discriminated union for `PriceRule` and a 100-line resolver framework. The candidate is over-fitting to imagined future requirements. **This is a bad signal**, not a good one — solving today's problem is half the senior judgment we're testing.

---

## Phase 2 — time-bounded contract pricing

The candidate sees `Contract { customer_id, sku, fixed_price, effective_date, expiry_date }` and learns multiple contracts can overlap.

**The flat dict approach now breaks.** The function signature must change to accept `asOf: Date`.

**Strong shape:**

```ts
function getPrice(sku: string, customer: Customer, asOf: Date): number {
  const applicable = CONTRACTS.filter(c =>
    c.customer_id === customer.id &&
    c.sku === sku &&
    c.effective_date <= asOf &&
    asOf <= c.expiry_date
  );

  if (applicable.length > 0) {
    // Policy: lowest active contract price wins (vendor-friendly to customer).
    return round2(Math.min(...applicable.map(c => c.fixed_price)));
  }

  // Fall back to tier-based pricing
  const list = LIST_PRICES[sku];
  return round2(list * (1 - TIER_DISCOUNT[customer.tier]));
}
```

Strong tells:
- Surfaced the overlap question (*"What if two contracts apply?"*) and **picked a policy with a reason**.
- `asOf` is threaded explicitly — no `new Date()` inside the function.
- Separated the predicate ("is this contract applicable on date X for customer/sku?") from the resolution ("which one wins?"). Even if not extracted into named functions yet, the structure is visible.

Senior candidates often pause here and say something like: *"This is starting to look like a rules engine. If you're going to add more sources, I'd want to refactor this — but let me see what comes next first."* That self-awareness is the signal.

Weak tells:
- Adds a `contracts` field to `Customer` keyed by SKU. Loses time dimension.
- Picks "most-recently-effective wins" without surfacing that overlapping contracts exist at all.
- Uses `new Date()` inside `getPrice` instead of taking `asOf` — breaks reproducibility for backdated invoices.

---

## Phase 3 — volume breaks + promo stacking + auditability

Three new things, often introduced one at a time:
1. Quantity breakpoints (per SKU or per contract).
2. Time-bounded promos with stacking flags.
3. The function should return a price **breakdown** for audit.

The phase-2 shape (filter contracts → take lowest → fallback) doesn't extend cleanly. The candidate has to **change shape**, not patch.

**Strong shape:**

```ts
type RuleSource = 'list' | 'tier' | 'contract' | 'volume' | 'promo';

interface PriceLine {
  source: RuleSource;
  description: string;
  adjustment: number; // signed; negative = discount
}

interface PriceQuote {
  unit_price: number;
  breakdown: PriceLine[];
}

// Rules pipeline: each rule looks at the input and may emit a price-line.
// A resolution policy combines lines into a final price.
const rules = [
  baselineFromList,           // emits: list price
  applyContractIfActive,      // if active contract: REPLACES baseline
  applyTierIfNoContract,      // if no contract: applies tier %
  applyVolumeBreakIfQualifies,// if qty crosses threshold
  applyPromoIfActive,         // if active promo: applies promo %, respecting stacks_with_tier
];

function getPrice(sku, customer, qty, asOf): PriceQuote {
  let lines: PriceLine[] = [];
  for (const rule of rules) lines = rule({ sku, customer, qty, asOf, lines });
  const unit_price = lines.reduce((sum, l) => sum + l.adjustment, 0);
  return { unit_price: round2(unit_price), breakdown: lines };
}
```

Strong tells:
- The rule list is **data, not branches**. Each rule is a small function with a uniform shape.
- Conflict / stacking is encoded **on the rule** (`stacks_with_tier`), not in a giant if-else.
- Breakdown comes for free — every rule contributes a `PriceLine`.
- Recognizes that contract pricing fundamentally **replaces** the list+tier baseline rather than discounting it. *That distinction matters.*

In 10 minutes this won't be polished. What you want to see is the **shape** — even sketched in pseudocode or comments. *"I'd structure this as a list of rules that each contribute a price line; the resolver iterates them in order…"* — that's the senior signal even without final code.

Weak tells:
- Adds three more nested `if` blocks. The function balloons to 80 lines. They don't see the smell.
- Returns a number when you ask for breakdown; "I'd add the breakdown later."
- Makes contract + tier discount stack multiplicatively without surfacing that as a business decision.
- Doesn't notice that volume breaks need quantity context that the previous signature didn't have.

---

## Common stuck points

| Stuck on | What to do |
|---|---|
| Phase 1, picking rounding | Tell them to round at the boundary and move on. Don't burn time on this. |
| Phase 2, overlap policy | Suggest one if they're stalled: *"Let's say lowest active price wins."* |
| Phase 3, can't refactor in time | Pivot to discussion: *"Sketch the shape on the right side of the editor."* You're scoring the model, not the diff. |

---

## Calibration

| Outcome | Read |
|---|---|
| Phase 1 in 8 min, refactors phase 2 cleanly, sketches phase 3 shape verbally | **Strong hire** |
| Phase 1 in 12 min, patches phase 2 then rewrites when promos arrive, decent breakdown | **Hire** |
| Phase 1 in 15 min, never refactors, phases stack as nested ifs | **No hire** for senior |
| Phase 1 in 5 min with a 200-line rules framework that doesn't quite fit phase 2 | **No hire** — over-engineering is itself a senior failure mode |
