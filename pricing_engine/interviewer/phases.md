# Phase Reveal Scripts + Paste-In Data

Solution:
```
A8-412X  GOLD    Bayside Construction         -> $2.97
A8-412X  SILVER  Maple Ridge Builders         -> $3.21
A8-412X  BRONZE  Walk-in Customer             -> $3.49
PLY-12F  GOLD    Bayside Construction         -> $24.30
88A-99  SILVER  Maple Ridge Builders         -> $17.38
```

Now uncomment last case in main with unknown SKU, ask candidate to fix. Great if their solution already handles this, might need a signature change.
---

## Phase 2 — Time-bounded contract pricing

> New requirement. We have **contracts** — a customer-specific, SKU-specific fixed price that's negotiated separately. Contracts have an effective date and an expiry date — they apply for some window of time.
>
> For example: Bayside Construction negotiated a fixed price of \$2.20 on the 2x4x8 from January through June. During that window, they pay $2.20 — not the tier discount.
>
> - The same customer might have multiple contracts on the same SKU with overlapping date windows.
> - Existing test cases need to continue working.

### Paste above YOUR CODE BELOW

```ts
// ----- Phase 2 data ---------------------------------------------------------

interface Contract {
  id: number;
  customer_id: string;
  sku: string;
  fixed_price: number;
  effective_date: Date;
  expiry_date: Date;
}

const CONTRACTS: Contract[] = [
  // Bayside has a Q1-Q2 contract on 2x4x8 at $3.20
  { id: 1, customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 2.35,
    effective_date: new Date('2026-01-01'), expiry_date: new Date('2026-06-30') },

  // Bayside contract overlaps the first contract Apr-Jun
  { id: 2, customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 2.20,
    effective_date: new Date('2026-04-01'), expiry_date: new Date('2026-09-30') },

  // Maple Ridge has a year-long contract on plywood
  { id: 3, customer_id: 'C-1002', sku: 'PLY-12F', fixed_price: 26.00,
    effective_date: new Date('2026-01-01'), expiry_date: new Date('2026-12-31') },

  // Bayside's drywall contract — already expired
  { id: 4, customer_id: 'C-1001', sku: 'DRY-12-8', fixed_price: 11.00,
    effective_date: new Date('2025-06-01'), expiry_date: new Date('2025-12-31') },

  // Bayside's OSB contract — starts in the future
  { id: 5, customer_id: 'C-1001', sku: '88A-99', fixed_price: 15.50,
    effective_date: new Date('2026-12-01'), expiry_date: new Date('2027-06-30') },
];
```

## PASTE INTO MAIN AT end

```ts
    
  const TEST_DATES = {
    q1: new Date('2026-02-15'),  // Bayside's first contract is active; second isn't yet
    q2: new Date('2026-05-15'),  // Both Bayside contracts overlap
    q3: new Date('2026-08-15'),  // Only the second Bayside contract is active
    preContract: new Date('2025-03-15'), // Before any contract — fall back to tier
  };  
  
  const phase2Cases: Array<{ sku: string; customer: string; asOf: Date }> = [
    { sku: 'A8-412X',  customer: 'C-1001', asOf: TEST_DATES.q1},  // Bayside (GOLD) buying 2x4x8 in Q1
    { sku: 'A8-412X',  customer: 'C-1001', asOf: TEST_DATES.q2},  // Bayside (GOLD) buying 2x4x8 in Q2
    { sku: 'A8-412X',  customer: 'C-1001', asOf: TEST_DATES.q3},  // Bayside (GOLD) buying 2x4x8 in Q3
    { sku: 'A8-412X',  customer: 'C-1001', asOf: TEST_DATES.preContract},  // Bayside (GOLD) buying 2x4x8 in Q1 2025
    { sku: '88A-99',   customer: 'C-1001', asOf: TEST_DATES.preContract},  // Bayside (GOLD) buying OSB in Q1 2025
  ];
  
  for (const c of phase2Cases) {
    const customer = CUSTOMERS.find((x) => x.id === c.customer)!;
    const price = getPrice(c.sku, customer, c.asOf);
    const dateString = c.asOf.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })
    console.log(`${dateString} ${c.sku}  ${customer.tier.padEnd(7)} ${customer.name.padEnd(28)} -> $${price.toFixed(2)}`);
  }
```

Solution:
```
A8-412X  GOLD    Bayside Construction         -> $2.97
A8-412X  SILVER  Maple Ridge Builders         -> $3.21
A8-412X  BRONZE  Walk-in Customer             -> $3.49
PLY-12F  GOLD    Bayside Construction         -> $24.30
88A-99  SILVER  Maple Ridge Builders         -> $17.38
NLF-21: SKU not found
02/15/26 A8-412X  GOLD    Bayside Construction         -> $2.35
05/15/26 A8-412X  GOLD    Bayside Construction         -> $2.20
08/15/26 A8-412X  GOLD    Bayside Construction         -> $2.20
03/15/25 A8-412X  GOLD    Bayside Construction         -> $2.97
08/15/26 88A-99  GOLD    Bayside Construction         -> $16.06
```

---

## Phase 3 — Auditability

> A customer disputed a price six months ago and now finance is asking us to reproduce exactly what they were quoted. How would you ensure that you can respond to this request?

No specific solution, candidate should rework their solution to return or record the amount and source of the discount applied.

## More optional phases

### Volume breaks

> "Now: most contracts and SKUs have **volume breaks**. Buy 1-99 units, pay one price; 100-499, less; 500+, less still. The function needs a `qty` argument now.
>
> Volume breaks can apply on top of either list/tier pricing OR on top of a contract — the contract spec sometimes includes its own break schedule."

#### Paste-in data

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
```

### Promos

> "We also have **promotions** — temporary, SKU-level percentage discounts. Each promo has effective and expiry dates. Some promos stack with the tier discount; others don't. Some promos are excluded if the customer has an active contract on that SKU."

#### Paste-in data

```ts
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

### What to push on

- *"Does the tier discount stack with the volume break?"* — they should ask, not assume.
- *"What's the precedence between contract, volume break, and promo when more than one applies?"* — there's no single answer; watch them reason.
- *"You return a `unit_price` and a `breakdown`. Are those guaranteed consistent?"* — strong candidates ensure the breakdown sums to the unit_price (or document the rounding policy explicitly).
