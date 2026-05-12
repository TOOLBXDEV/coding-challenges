# Phase Reveal Scripts + Paste-In Data

When the candidate has phase 1 working, reveal the next phase verbally and paste the corresponding data into their editor. **Don't reveal phases ahead of time.**

---

## Phase 2 — Multi-yard + commitments + on_PO

### What to say (verbatim if helpful)

> "Real inventory is messier. Couple new dimensions:
>
> 1. **Multiple yards.** We operate yards in Vancouver, Burnaby, and Surrey. The same SKU has different stock at each.
>
> 2. **Committed quantity.** Some of the on-hand stock is already allocated to open orders that haven't shipped yet. We can't promise it again — even though it's physically in the building.
>
> 3. **Incoming POs.** We have purchase orders out to vendors with expected arrival dates. If a customer wants a delivery date in three weeks and we have stock arriving in two, we can include that in our promise.
>
> So **Available To Promise (ATP)** is something like: `on_hand − committed + on_PO arriving in time`.
>
> Use cases — these *might* want different answers:
> - A sales rep is quoting for delivery next Friday.
> - A customer is browsing the website and just wants to know "in stock?"
> - The fulfillment team is deciding which yard to ship from.
>
> Reshape your function however you need."

### Paste-in data

```ts
interface InventoryRow {
  sku: string;
  yard: 'VAN' | 'BBY' | 'SUR';
  on_hand: number;
  committed: number;
  on_po: Array<{ qty: number; eta: Date }>;
}

const INVENTORY: InventoryRow[] = [
  // 2x4x8 — stocked at all three yards, varied state
  { sku: 'A8-412X', yard: 'VAN', on_hand: 200, committed: 50, on_po: [
    { qty: 500, eta: new Date('2026-05-20') },
  ]},
  { sku: 'A8-412X', yard: 'BBY', on_hand: 150, committed: 80, on_po: [] },
  { sku: 'A8-412X', yard: 'SUR', on_hand:  65, committed:  0, on_po: [
    { qty: 300, eta: new Date('2026-05-12') },
    { qty: 200, eta: new Date('2026-06-01') },
  ]},

  // Plywood — VAN only, mostly committed
  { sku: 'PLY-12F', yard: 'VAN', on_hand: 195, committed: 180, on_po: [
    { qty: 100, eta: new Date('2026-05-15') },
  ]},

  // OSB — fully committed at VAN, plenty at BBY
  { sku: '88A-99', yard: 'VAN', on_hand: 80,  committed: 80, on_po: [] },
  { sku: '88A-99', yard: 'BBY', on_hand: 260, committed: 30, on_po: [] },

  // Drywall — only at SUR
  { sku: 'DRY-12-8', yard: 'SUR', on_hand: 380, committed: 50, on_po: [] },

  // Joist hangers — small qty, high turnover
  { sku: 'JH-26', yard: 'VAN', on_hand: 320, committed: 200, on_po: [
    { qty: 1000, eta: new Date('2026-05-10') },
  ]},
  { sku: 'JH-26', yard: 'BBY', on_hand: 210, committed: 130, on_po: [] },
];

const TEST_DATES = {
  today:    new Date('2026-05-08'),
  nextWeek: new Date('2026-05-15'),  // catches the 5/10 and 5/12 incoming POs
  nextMonth:new Date('2026-06-15'),  // catches all current incoming POs
};
```

### What to push on

- *"What's the use case — what should `availableQty` actually return?"* They should ask, you can answer "let's start with deliverable-by-asOf-date." But reward them asking.
- *"At yard VAN, on_hand is 200 and committed is 50. With on_PO of 500 arriving 5/20 — what's ATP today vs. on 5/15 vs. on 5/25?"* Walk through the math with them.
- *"If the customer is at VAN but BBY has stock — does your function tell them VAN's number or the total?"* They should keep that policy out of the math.
- *"What happens if `committed > on_hand`?"* — oversold. Should at minimum not return negative.

---

## Phase 3 — Substitutions + kits

You'll likely have time for **only one** of substitutions or kits at the code level — pick based on remaining time and what's already been discussed. Use the other for design conversation.

### What to say — substitutions

> "For some customers, certain SKUs are substitutable for others. A 2x4x8 SPF can substitute for a 2x4x8 Hem-Fir if the customer's spec allows it. The substitution rules are sometimes universal, sometimes negotiated per customer segment.
>
> When the website asks 'is this in stock?' — should it count substitutes? Sometimes yes, sometimes no. The caller decides."

### What to say — kits

> "We sell **kits**. A 'deck kit' SKU is a single SKU that, when ordered, consumes a defined set of components from inventory: 12 joists, 20 deck boards, 200 screws. We don't physically stock the kit; selling 1 kit subtracts 12 joists + 20 boards + 200 screws from on-hand.
>
> Available qty for a kit is determined by **whichever component runs out first**. If you've got enough joists and screws for 50 kits but only enough decking for 30 kits — you have 30 kits' worth available."

### Paste-in data

```ts
// Substitutions — directional. Means: the substitute can fulfill demand for the primary,
// but only for customers in the listed segments (null = all customers).
interface SubRule {
  primary_sku: string;
  substitute_sku: string;
  customer_segments: string[] | null;  // null = applies to anyone
}

const SUB_RULES: SubRule[] = [
  // SPF can sub for Hem-Fir 2x4x8 — only for "framing" segment (commercial framers
  // who don't care about species, vs. cabinet shops who do)
  { primary_sku: 'A8-412X-HF', substitute_sku: 'A8-412X', customer_segments: ['framing'] },

  // OSB sheathing — these are interchangeable for almost anyone
  { primary_sku: '88A-99', substitute_sku: '88A-99-ALT', customer_segments: null },
];

// Kit definitions. Selling 1 kit consumes the listed components.
interface KitDefinition {
  kit_sku: string;
  description: string;
  components: Array<{ sku: string; qty_per_kit: number }>;
}

const KITS: KitDefinition[] = [
  {
    kit_sku: 'DECK-KIT-SM',
    description: '8x10 ft deck framing kit',
    components: [
      { sku: 'A8-412X', qty_per_kit: 12 },   // joists (using 2x4x8s as proxy)
      { sku: 'PLY-12F', qty_per_kit: 4 },    // sheathing
      { sku: 'JH-26',   qty_per_kit: 24 },   // joist hangers
      { sku: 'NL-F21',  qty_per_kit: 1 },    // 1 box of nails
    ],
  },
];

// Optional sample inventory for the substitute SKUs (paste if the candidate uses subs)
const EXTRA_INVENTORY: InventoryRow[] = [
  { sku: 'A8-412X-HF',  yard: 'VAN', on_hand: 30,  committed: 10, on_po: [] },
  { sku: '88A-99-ALT',  yard: 'BBY', on_hand: 100, committed: 0,  on_po: [] },
];
```

### What to push on

- *"How many `DECK-KIT-SM` are available at VAN today?"* Walk through the bottleneck math.
  - Joists (A8-412X) at VAN today: ~150 ATP → 150 / 12 = 12 kits
  - Plywood (PLY-12F) at VAN today: ~15 ATP → 15 / 4 = 3 kits
  - Joist hangers (JH-26) at VAN today: ~120 ATP → 120 / 24 = 5 kits
  - Nails (NL-F21): not at VAN in our data → 0 kits, unless aggregated
  - Bottleneck = nails or plywood, depending on aggregation policy
- *"Substitutes — the website calls your function for an anonymous browser. Does it include subs?"* No customer → no segment match → strict mode is the safer default.
- *"A kit's component is itself a kit. Does your function blow up?"* If they say "I'd memoize / depth-limit" — good. If they say "I assumed one level" — also fine if articulated.
- *"Where does kit math live — in `availableQty` or in a separate `kitAvailability`?"* Either is defensible; the *separation question* is the senior signal.

### If you have time at the end

> "If a marketplace partner exposed *their* yard's inventory through an API with 500ms latency, how would you fold that into your ATP function? What changes about the contract?"

Probes federation, latency tolerance, fallback semantics, "is this answer fresh enough."
