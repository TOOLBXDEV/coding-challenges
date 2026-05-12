# Phase Reveal Scripts + Paste-In Data

When the candidate has phase 1 working, reveal the next phase verbally and paste the corresponding data into their editor. **Don't reveal phases ahead of time.**

---

## Phase 2 — Time-bounded contract pricing

### What to say (verbatim if helpful)

> "Nice. Now let's add a wrinkle. We have **contracts** — a customer-specific, SKU-specific fixed price that's negotiated separately and overrides the tier discount. Contracts have an effective date and an expiry date — they apply for some window of time.
>
> For example: Bayside Construction negotiated a fixed price of \$3.20 on the 2x4x8 from January through June. During that window, they pay \$3.20 — not the tier discount.
>
> A few realistic wrinkles I want you to think through:
> - The same customer might have multiple contracts on the same SKU with overlapping date windows.
> - Some contracts are in the past, some are in the future.
> - Your function now needs to take an `asOf` date — what price applies on this date?
>
> Here's some sample data to add."

### Paste-in data

```ts
interface Contract {
  customer_id: string;
  sku: string;
  fixed_price: number;
  effective_date: Date;
  expiry_date: Date;
}

const CONTRACTS: Contract[] = [
  // Bayside has a Q1-Q2 contract on 2x4x8 at $3.20
  { customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 3.20,
    effective_date: new Date('2026-01-01'), expiry_date: new Date('2026-06-30') },

  // Bayside negotiated a better deal mid-year — overlaps the first contract Apr-Jun
  { customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 3.05,
    effective_date: new Date('2026-04-01'), expiry_date: new Date('2026-09-30') },

  // Maple Ridge has a year-long contract on plywood
  { customer_id: 'C-1002', sku: 'PLY-12F', fixed_price: 26.00,
    effective_date: new Date('2026-01-01'), expiry_date: new Date('2026-12-31') },

  // Bayside's drywall contract — already expired
  { customer_id: 'C-1001', sku: 'DRY-12-8', fixed_price: 11.00,
    effective_date: new Date('2025-06-01'), expiry_date: new Date('2025-12-31') },

  // Bayside's OSB contract — starts in the future
  { customer_id: 'C-1001', sku: '88A-99', fixed_price: 17.50,
    effective_date: new Date('2026-07-01'), expiry_date: new Date('2027-06-30') },
];

const TEST_DATES = {
  q1: new Date('2026-02-15'),  // Bayside's first contract is active; second isn't yet
  q2: new Date('2026-05-15'),  // Both Bayside contracts overlap
  q3: new Date('2026-08-15'),  // Only the second Bayside contract is active
  preContract: new Date('2025-03-15'), // Before any contract — fall back to tier
};
```

### What to push on

- *"Two contracts overlap in Q2. Which one wins, and why?"* — there's no canonical answer. Watch them surface it and pick.
- *"What if `asOf` is before any contract?"* — should fall back to tier pricing.
- *"Could we use `new Date()` instead of passing `asOf`?"* — no, breaks reproducibility (backdated invoices, audit). See if they catch it.

---

## Phase 3 — Volume breaks + promos + auditability

You probably won't get all of phase 3 implemented. Pick **one or two** of (volume / promos / breakdown) based on time remaining.

### What to say

#### If introducing volume breaks:

> "Now: most contracts and SKUs have **volume breaks**. Buy 1-99 units, pay one price; 100-499, less; 500+, less still. The function needs a `qty` argument now.
>
> Volume breaks can apply on top of either list/tier pricing OR on top of a contract — the contract spec sometimes includes its own break schedule."

#### If introducing promos:

> "We also have **promotions** — temporary, SKU-level percentage discounts. Each promo has effective and expiry dates. Some promos stack with the tier discount; others don't (they're either-or). Some promos are excluded if the customer has an active contract on that SKU."

#### If introducing auditability (always introduce this if time permits):

> "Final wrinkle. A customer disputed a price six months ago and now finance is asking us to reproduce exactly what they were quoted. Currently your function returns a number. We need it to return a **breakdown** — every adjustment we applied, what it was, where it came from. Reshape your return type."

### Paste-in data

```ts
interface VolumeBreak {
  min_qty: number;
  unit_price: number;       // absolute price at this qty tier
}

// Per-SKU volume breaks (apply when no contract overrides)
const VOLUME_BREAKS: Record<string, VolumeBreak[]> = {
  'A8-412X': [
    { min_qty: 1,    unit_price: 3.49 },
    { min_qty: 100,  unit_price: 3.20 },
    { min_qty: 500,  unit_price: 2.95 },
  ],
  'PLY-12F': [
    { min_qty: 1,    unit_price: 28.59 },
    { min_qty: 50,   unit_price: 26.99 },
    { min_qty: 200,  unit_price: 24.99 },
  ],
};

interface Promo {
  sku: string;
  percent_off: number;
  effective_date: Date;
  expiry_date: Date;
  stacks_with_tier: boolean;
  excluded_if_under_contract: boolean;
}

const PROMOS: Promo[] = [
  // Spring framing-lumber sale: 5% off, stacks with tier, blocked by contracts
  { sku: 'A8-412X', percent_off: 0.05,
    effective_date: new Date('2026-03-01'), expiry_date: new Date('2026-05-31'),
    stacks_with_tier: true, excluded_if_under_contract: true },

  // OSB clearance: 10% off, replaces tier (doesn't stack)
  { sku: '88A-99', percent_off: 0.10,
    effective_date: new Date('2026-04-01'), expiry_date: new Date('2026-04-30'),
    stacks_with_tier: false, excluded_if_under_contract: false },
];
```

### Expected return type when auditability is introduced

```ts
interface PriceLine {
  source: 'list' | 'tier' | 'contract' | 'volume' | 'promo';
  description: string;
  adjustment: number;  // signed; e.g., negative for discount
}

interface PriceQuote {
  sku: string;
  customer_id: string;
  qty: number;
  as_of: Date;
  unit_price: number;
  breakdown: PriceLine[];
}
```

### What to push on

- *"Does the tier discount stack with the volume break?"* — they should ask, not assume.
- *"What's the precedence between contract, volume break, and promo when more than one applies?"* — there's no single answer; watch them reason.
- *"You return a `unit_price` and a `breakdown`. Are those guaranteed consistent?"* — strong candidates ensure the breakdown sums to the unit_price (or document the rounding policy explicitly).
