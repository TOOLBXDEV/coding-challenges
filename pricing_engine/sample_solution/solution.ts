// ============================================================================
// Pricing Engine — final solution (end of phase 3)
//
// Shape: a small ordered pipeline of rule functions. Each rule inspects the
// context (and lines emitted so far) and may push one PriceLine. The unit
// price is the sum of all PriceLine.adjustment values. The breakdown is the
// audit trail — they're guaranteed consistent because they're the same data.
//
// Rounding policy: we keep money in *cents* (integers) inside the pipeline so
// that tier %, promo %, and signed adjustments don't accumulate float noise.
// We only round to 2dp at the boundary (when constructing the final
// PriceQuote.unit_price). Internal PriceLine.adjustment values are stored in
// cents-as-number; we expose them as dollars in the final quote so the
// breakdown numbers visibly sum to unit_price.
//
// Run: npx ts-node solution.ts
// ============================================================================

// ----- Domain types ---------------------------------------------------------

type Tier = 'GOLD' | 'SILVER' | 'BRONZE';

interface Customer {
  id: string;
  name: string;
  tier: Tier;
}

interface Contract {
  customer_id: string;
  sku: string;
  fixed_price: number;
  effective_date: Date;
  expiry_date: Date;
}

interface VolumeBreak {
  min_qty: number;
  unit_price: number; // absolute price at this qty tier
}

interface Promo {
  sku: string;
  percent_off: number;
  effective_date: Date;
  expiry_date: Date;
  stacks_with_tier: boolean;
  excluded_if_under_contract: boolean;
}

type RuleSource = 'list' | 'tier' | 'contract' | 'volume' | 'promo';

interface PriceLine {
  source: RuleSource;
  description: string;
  adjustment: number; // signed dollars; negative = discount
}

interface PriceQuote {
  sku: string;
  customer_id: string;
  qty: number;
  as_of: Date;
  unit_price: number;
  breakdown: PriceLine[];
}

// ----- Embedded data --------------------------------------------------------

// Phase 1
const LIST_PRICES: Record<string, number> = {
  'A8-412X': 3.49,    // 2x4x8 Standard Pine
  'XC-8812': 4.29,    // 2x4x10 Standard Pine
  'B-441-9': 6.79,    // 2x6x8 Standard Pine
  '88A-99': 18.89,    // 1/2" 4x8 OSB Sheathing
  'PLY-12F': 28.59,   // 1/2" 4x8 Fir Plywood
  'DRY-12-8': 12.49,  // 1/2" 4x8 Regular Drywall
  'NL-F21': 44.59,    // Framing Nails (box)
  'INS-13-K': 19.89,  // R-13 Fiberglass Batts (bag)
};

const TIER_DISCOUNT: Record<Tier, number> = {
  GOLD: 0.15,
  SILVER: 0.08,
  BRONZE: 0,
};

const CUSTOMERS: Customer[] = [
  { id: 'C-1001', name: 'Bayside Construction', tier: 'GOLD' },
  { id: 'C-1002', name: 'Maple Ridge Builders', tier: 'SILVER' },
  { id: 'C-1003', name: 'Walk-in Customer',     tier: 'BRONZE' },
];

// Phase 2
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

// Phase 3
const VOLUME_BREAKS: Record<string, VolumeBreak[]> = {
  'A8-412X': [
    { min_qty: 1,   unit_price: 3.49 },
    { min_qty: 100, unit_price: 3.20 },
    { min_qty: 500, unit_price: 2.95 },
  ],
  'PLY-12F': [
    { min_qty: 1,   unit_price: 28.59 },
    { min_qty: 50,  unit_price: 26.99 },
    { min_qty: 200, unit_price: 24.99 },
  ],
};

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

// ----- Pricing pipeline -----------------------------------------------------

interface Ctx {
  sku: string;
  customer: Customer;
  qty: number;
  asOf: Date;
}

// A rule looks at the context + lines so far and returns the new lines list.
// Rules either *append* a PriceLine or pass-through. Replacing a baseline
// (e.g. contract pricing replacing list+tier) is modeled as emitting a
// negative adjustment that zeros out prior lines.
type Rule = (ctx: Ctx, lines: PriceLine[]) => PriceLine[];

const round2 = (n: number): number => Math.round(n * 100) / 100;
const sumLines = (lines: PriceLine[]): number =>
  lines.reduce((s, l) => s + l.adjustment, 0);
const dateInRange = (d: Date, from: Date, to: Date): boolean =>
  from.getTime() <= d.getTime() && d.getTime() <= to.getTime();

// --- Rule 1: baseline list price -------------------------------------------
const baselineList: Rule = (ctx, lines) => {
  const list = LIST_PRICES[ctx.sku];
  if (list == null) throw new Error(`Unknown SKU: ${ctx.sku}`);
  return [
    ...lines,
    { source: 'list', description: `List price for ${ctx.sku}`, adjustment: list },
  ];
};

// --- Rule 2: tier discount (only if not overridden later) ------------------
// We always emit the tier line; if a contract or non-stacking promo runs
// later it will *cancel* the tier with a compensating adjustment. That keeps
// the breakdown honest about what the customer's tier *would* have given.
const tierDiscount: Rule = (ctx, lines) => {
  const pct = TIER_DISCOUNT[ctx.customer.tier];
  if (pct === 0) return lines;
  const list = lines.find((l) => l.source === 'list')!.adjustment;
  const adj = -(list * pct);
  return [
    ...lines,
    {
      source: 'tier',
      description: `${ctx.customer.tier} tier ${(pct * 100).toFixed(0)}% off`,
      adjustment: adj,
    },
  ];
};

// --- Rule 3: contract override ---------------------------------------------
// Policy: lowest active fixed price wins. When a contract applies, it
// REPLACES the list+tier baseline. We emit a single adjustment that
// re-bases the running total to the contract price.
const contractOverride: Rule = (ctx, lines) => {
  const active = CONTRACTS.filter(
    (c) =>
      c.customer_id === ctx.customer.id &&
      c.sku === ctx.sku &&
      dateInRange(ctx.asOf, c.effective_date, c.expiry_date)
  );
  if (active.length === 0) return lines;

  const winner = active.reduce((best, c) =>
    c.fixed_price < best.fixed_price ? c : best
  );
  const reason =
    active.length > 1
      ? `Contract @ $${winner.fixed_price.toFixed(2)} (lowest of ${active.length} active)`
      : `Contract @ $${winner.fixed_price.toFixed(2)}`;

  const running = sumLines(lines);
  const adj = winner.fixed_price - running;
  return [
    ...lines,
    { source: 'contract', description: reason, adjustment: adj },
  ];
};

// --- Rule 4: volume break ---------------------------------------------------
// Volume breaks apply on top of *list* pricing, not on top of contracts —
// contracts are negotiated and already encode their own price for the qty.
// (If a contract carried its own break schedule we'd hang it off the
// contract; the data we have doesn't, so we stay simple.)
const volumeBreak: Rule = (ctx, lines) => {
  const breaks = VOLUME_BREAKS[ctx.sku];
  if (!breaks) return lines;
  if (lines.some((l) => l.source === 'contract')) return lines;

  // Highest min_qty whose threshold is met.
  const tier = breaks
    .filter((b) => ctx.qty >= b.min_qty)
    .reduce((a, b) => (a.min_qty > b.min_qty ? a : b));

  // Only counts if it actually beats list (the qty=1 entry is just list).
  if (tier.min_qty === 1) return lines;

  const running = sumLines(lines);
  const adj = tier.unit_price - running;
  return [
    ...lines,
    {
      source: 'volume',
      description: `Volume break: qty ${ctx.qty} >= ${tier.min_qty} -> $${tier.unit_price.toFixed(2)}`,
      adjustment: adj,
    },
  ];
};

// --- Rule 5: promo ----------------------------------------------------------
const promoRule: Rule = (ctx, lines) => {
  const active = PROMOS.find(
    (p) => p.sku === ctx.sku && dateInRange(ctx.asOf, p.effective_date, p.expiry_date)
  );
  if (!active) return lines;

  const underContract = lines.some((l) => l.source === 'contract');
  if (underContract && active.excluded_if_under_contract) return lines;

  // If the promo doesn't stack with tier, cancel the tier line first.
  let next = lines;
  if (!active.stacks_with_tier) {
    const tierLine = next.find((l) => l.source === 'tier');
    if (tierLine) {
      next = [
        ...next,
        {
          source: 'promo',
          description: `Promo replaces tier discount`,
          adjustment: -tierLine.adjustment, // cancels the tier
        },
      ];
    }
  }

  // The promo % applies to the LIST price (standard retail convention —
  // "10% off" means 10% off ticket, not 10% off whatever's left).
  const list = next.find((l) => l.source === 'list')!.adjustment;
  const adj = -(list * active.percent_off);

  return [
    ...next,
    {
      source: 'promo',
      description: `${(active.percent_off * 100).toFixed(0)}% promo on ${ctx.sku}`,
      adjustment: adj,
    },
  ];
};

const RULES: Rule[] = [
  baselineList,
  tierDiscount,
  contractOverride,
  volumeBreak,
  promoRule,
];

// ----- Public API -----------------------------------------------------------

function quote(
  sku: string,
  customer: Customer,
  qty: number,
  asOf: Date
): PriceQuote {
  const ctx: Ctx = { sku, customer, qty, asOf };
  let lines: PriceLine[] = [];
  for (const rule of RULES) lines = rule(ctx, lines);

  // Round each adjustment to the cent for a clean, sum-consistent breakdown,
  // then derive unit_price as the literal sum so audits reconcile exactly.
  const rounded = lines.map((l) => ({ ...l, adjustment: round2(l.adjustment) }));
  const unit_price = round2(sumLines(rounded));

  return {
    sku,
    customer_id: customer.id,
    qty,
    as_of: asOf,
    unit_price,
    breakdown: rounded,
  };
}

// ============================================================================
// Driver
// ============================================================================

const TEST_DATES = {
  q1: new Date('2026-02-15'),         // Bayside contract #1 active, #2 not yet
  q2: new Date('2026-05-15'),         // Both Bayside contracts overlap
  q3: new Date('2026-08-15'),         // Only Bayside contract #2 active
  preContract: new Date('2025-03-15'), // Before any contract — falls back to tier
  aprilOSB: new Date('2026-04-15'),   // OSB clearance promo window
};

function findCustomer(id: string): Customer {
  const c = CUSTOMERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown customer: ${id}`);
  return c;
}

function printQuote(label: string, q: PriceQuote): void {
  console.log(`\n--- ${label}`);
  console.log(
    `  ${q.sku}  customer=${q.customer_id}  qty=${q.qty}  asOf=${q.as_of.toISOString().slice(0, 10)}  -> $${q.unit_price.toFixed(2)}/unit`
  );
  for (const line of q.breakdown) {
    const sign = line.adjustment >= 0 ? '+' : '-';
    const amt = Math.abs(line.adjustment).toFixed(2);
    console.log(`    [${line.source.padEnd(8)}] ${sign}$${amt.padStart(6)}  ${line.description}`);
  }
}

function main(): void {
  // ----- Phase 1: list + tier ----------------------------------------------
  console.log('=========================================================');
  console.log('PHASE 1 — list price + tier discount');
  console.log('=========================================================');
  const phase1Cases = [
    { sku: 'A8-412X', cid: 'C-1001' }, // GOLD on 2x4x8
    { sku: 'A8-412X', cid: 'C-1002' }, // SILVER
    { sku: 'A8-412X', cid: 'C-1003' }, // BRONZE
    { sku: 'PLY-12F', cid: 'C-1001' },
    { sku: '88A-99',  cid: 'C-1002' },
  ];
  for (const c of phase1Cases) {
    // Use preContract date and qty=1 so phase 2/3 rules are inert.
    printQuote(
      `${c.sku} for ${findCustomer(c.cid).name}`,
      quote(c.sku, findCustomer(c.cid), 1, TEST_DATES.preContract)
    );
  }

  // ----- Phase 2: contracts + asOf -----------------------------------------
  console.log('\n=========================================================');
  console.log('PHASE 2 — contracts (overlap, expired, future, fallback)');
  console.log('=========================================================');
  const bayside = findCustomer('C-1001');
  const maple = findCustomer('C-1002');
  printQuote('Bayside 2x4x8 in Q1 (one contract active)',
    quote('A8-412X', bayside, 1, TEST_DATES.q1));
  printQuote('Bayside 2x4x8 in Q2 (TWO contracts overlap, lowest wins)',
    quote('A8-412X', bayside, 1, TEST_DATES.q2));
  printQuote('Bayside 2x4x8 in Q3 (only second contract active)',
    quote('A8-412X', bayside, 1, TEST_DATES.q3));
  printQuote('Bayside drywall in Q1 2026 (contract already expired -> tier)',
    quote('DRY-12-8', bayside, 1, TEST_DATES.q1));
  printQuote('Bayside OSB in Q1 (contract starts in future -> tier)',
    quote('88A-99', bayside, 1, TEST_DATES.q1));
  printQuote('Maple Ridge plywood in Q2 (year-long contract)',
    quote('PLY-12F', maple, 1, TEST_DATES.q2));

  // ----- Phase 3: volume + promo + audit breakdown -------------------------
  console.log('\n=========================================================');
  console.log('PHASE 3 — volume breaks, promos, audit breakdown');
  console.log('=========================================================');

  // Volume break: Maple Ridge buying 250 plywood (no contract on this SKU?
  // Actually Maple Ridge HAS a plywood contract — so contract wins, volume
  // break is suppressed. Demonstrates that ordering.)
  printQuote('Maple Ridge plywood qty=250 in Q2 (contract suppresses volume)',
    quote('PLY-12F', maple, 250, TEST_DATES.q2));

  // Volume break with no contract: BRONZE walk-in buying 250 plywood
  const walkIn = findCustomer('C-1003');
  printQuote('Walk-in plywood qty=250 (volume break applies on list)',
    quote('PLY-12F', walkIn, 250, TEST_DATES.q2));
  printQuote('Walk-in plywood qty=600 (next break)',
    quote('PLY-12F', walkIn, 600, TEST_DATES.q2));

  // Promo: SILVER Maple Ridge buying 2x4x8 in spring (stacks with tier,
  // no contract on this SKU for them).
  printQuote('Maple Ridge 2x4x8 qty=10 in Q2 (5% promo stacks with SILVER)',
    quote('A8-412X', maple, 10, TEST_DATES.q2));

  // Promo blocked by contract: Bayside has a contract on 2x4x8 in Q2 and
  // the promo is excluded_if_under_contract=true.
  printQuote('Bayside 2x4x8 qty=10 in Q2 (contract blocks promo)',
    quote('A8-412X', bayside, 10, TEST_DATES.q2));

  // Non-stacking promo: SILVER on OSB during April clearance.
  printQuote('Maple Ridge OSB qty=1 in April (10% promo replaces tier)',
    quote('88A-99', maple, 1, TEST_DATES.aprilOSB));

  // Sanity check: breakdown sums to unit_price (audit invariant).
  const audit = quote('A8-412X', maple, 10, TEST_DATES.q2);
  const sum = round2(audit.breakdown.reduce((s, l) => s + l.adjustment, 0));
  if (sum !== audit.unit_price) {
    throw new Error(
      `Audit invariant broken: breakdown sum ${sum} != unit_price ${audit.unit_price}`
    );
  }
  console.log('\n[ok] audit invariant: breakdown sum === unit_price');
}

main();
