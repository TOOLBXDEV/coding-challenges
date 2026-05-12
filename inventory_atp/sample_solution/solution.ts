// ============================================================================
// Inventory Availability — final state at end of phase 3.
//
// Layering (intentional):
//   1. atpAtYard(sku, yard, asOf)            — phase-2 primitive
//   2. atpAcrossYards(sku, asOf)             — aggregation composes on top
//   3. availableQty({...})                   — phase-3 facade: kits + subs
//                                              gated by caller intent
//
// Run:  npx ts-node solution.ts
// ============================================================================

// ---------------------------------------------------------------------------
// Phase 1 data (kept as a fallback for the trivial case; not used after we
// migrate to the multi-yard INVENTORY table — left here so the file can show
// where we started and how the model evolved).
// ---------------------------------------------------------------------------

const ON_HAND_PHASE1: Record<string, number> = {
  'A8-412X':  415,
  'XC-8812':  320,
  'B-441-9':  285,
  '88A-99':   340,
  'PLY-12F':  195,
  'DRY-12-8': 380,
  'NL-F21':   170,
  'INS-13-K': 150,
  'JH-26':    530,
  'SCW-DK2':  170,
};

// Phase-1 trivial lookup — what we shipped at minute 3.
function availableQtyPhase1(sku: string): number {
  return ON_HAND_PHASE1[sku] ?? 0;
}

// ---------------------------------------------------------------------------
// Phase 2 data — multi-yard, committed, on_PO.
// ---------------------------------------------------------------------------

type Yard = 'VAN' | 'BBY' | 'SUR';

interface InventoryRow {
  sku: string;
  yard: Yard;
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
  today:     new Date('2026-05-08'),
  nextWeek:  new Date('2026-05-15'),  // catches the 5/10 and 5/12 incoming POs
  nextMonth: new Date('2026-06-15'),  // catches all current incoming POs
};

// ---------------------------------------------------------------------------
// Phase 3 data — substitutions (equivalence) and kits (composition).
// Stored separately on purpose — they're different relationships.
// ---------------------------------------------------------------------------

interface SubRule {
  primary_sku: string;
  substitute_sku: string;
  // null means "applies to anyone"; otherwise must match the customer's segment.
  customer_segments: string[] | null;
}

const SUB_RULES: SubRule[] = [
  // SPF can sub for Hem-Fir 2x4x8 — only for "framing" segment.
  { primary_sku: 'A8-412X-HF', substitute_sku: 'A8-412X', customer_segments: ['framing'] },
  // OSB sheathing — interchangeable for anyone.
  { primary_sku: '88A-99',     substitute_sku: '88A-99-ALT', customer_segments: null },
];

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
      { sku: 'A8-412X', qty_per_kit: 12 },
      { sku: 'PLY-12F', qty_per_kit: 4  },
      { sku: 'JH-26',   qty_per_kit: 24 },
      { sku: 'NL-F21',  qty_per_kit: 1  },
    ],
  },
];

// Inventory rows for the substitute SKUs.
const EXTRA_INVENTORY: InventoryRow[] = [
  { sku: 'A8-412X-HF', yard: 'VAN', on_hand: 30,  committed: 10, on_po: [] },
  { sku: '88A-99-ALT', yard: 'BBY', on_hand: 100, committed: 0,  on_po: [] },
];

// One combined table — easier to reason about than two arrays.
const ALL_INVENTORY: InventoryRow[] = [...INVENTORY, ...EXTRA_INVENTORY];

// ---------------------------------------------------------------------------
// Core: phase-2 ATP primitive.
//
// "Available" here means: deliverable by `asOf`, at this specific yard, not
// counting substitutes and not aware of kit composition. Those concerns live
// one layer up, in `availableQty` / `kitAvailableAtYard`.
// ---------------------------------------------------------------------------

function atpAtYard(sku: string, yard: Yard, asOf: Date): number {
  const rows = ALL_INVENTORY.filter(r => r.sku === sku && r.yard === yard);
  if (rows.length === 0) return 0;

  return rows.reduce((sum, r) => {
    const incoming = r.on_po
      .filter(p => p.eta <= asOf)
      .reduce((s, p) => s + p.qty, 0);
    // Cap at zero. Oversold (committed > on_hand) is a real state but it
    // shouldn't leak negative numbers to a quoting/website caller. If the
    // ops team needs to see oversold rows, they should look at a different
    // report, not bend this one.
    return sum + Math.max(0, r.on_hand - r.committed + incoming);
  }, 0);
}

function listYards(): Yard[] {
  const set = new Set<Yard>();
  for (const r of ALL_INVENTORY) set.add(r.yard);
  return [...set];
}

// Aggregation across yards. A separate function on purpose — yard locality is
// a transfer-routing question, not an ATP-math question. Quoting wants the
// home yard; fulfillment wants the cheapest available source. Keeping it
// separate means the caller can pick.
function atpAcrossYards(sku: string, asOf: Date): number {
  return listYards().reduce((s, y) => s + atpAtYard(sku, y, asOf), 0);
}

// Per-yard structured report — useful for "show me the breakdown" callers
// (fulfillment routing, ops dashboards). Not strictly needed but cheap to add.
interface AvailabilityReport {
  sku: string;
  asOf: Date;
  byYard: Array<{ yard: Yard; on_hand: number; committed: number; incoming: number; atp: number }>;
  total_atp: number;
}

function atpReport(sku: string, asOf: Date): AvailabilityReport {
  const byYard = listYards().map(yard => {
    const rows = ALL_INVENTORY.filter(r => r.sku === sku && r.yard === yard);
    const on_hand   = rows.reduce((s, r) => s + r.on_hand, 0);
    const committed = rows.reduce((s, r) => s + r.committed, 0);
    const incoming  = rows.reduce((s, r) =>
      s + r.on_po.filter(p => p.eta <= asOf).reduce((a, p) => a + p.qty, 0), 0);
    const atp = atpAtYard(sku, yard, asOf);
    return { yard, on_hand, committed, incoming, atp };
  }).filter(b => b.on_hand + b.committed + b.incoming + b.atp > 0);

  return {
    sku,
    asOf,
    byYard,
    total_atp: byYard.reduce((s, b) => s + b.atp, 0),
  };
}

// ---------------------------------------------------------------------------
// Phase 3: substitutions. Equivalence relation, customer-conditional, opt-in.
// ---------------------------------------------------------------------------

interface Customer {
  segment: string;
}

function applicableSubs(primarySku: string, customer?: Customer): SubRule[] {
  return SUB_RULES.filter(r => {
    if (r.primary_sku !== primarySku) return false;
    if (r.customer_segments === null) return true;            // universal sub
    if (!customer) return false;                              // anonymous: no segment match
    return r.customer_segments.includes(customer.segment);
  });
}

// ---------------------------------------------------------------------------
// Phase 3: kits. Composition (downward tree). Bottleneck = floor of the
// least-available component. Recursive — a component may itself be a kit.
// Visited-set guards against cycles in malformed kit data.
// ---------------------------------------------------------------------------

function findKit(sku: string): KitDefinition | undefined {
  return KITS.find(k => k.kit_sku === sku);
}

// ---------------------------------------------------------------------------
// Top-level facade.
//
// "Available" doesn't have one definition. The caller picks the view by
// passing the options they care about:
//
//   - yard           omit -> aggregate across all yards
//   - asOf           omit -> "right now" (only counts on_hand - committed)
//   - customer       used to gate which substitutes apply
//   - includeSubs    explicit opt-in. Default false because the website /
//                    anonymous browser case must NOT silently inflate stock
//                    with substitutes.
// ---------------------------------------------------------------------------

interface AvailabilityOptions {
  yard?: Yard;
  asOf?: Date;
  customer?: Customer;
  includeSubs?: boolean;
}

function availableQty(sku: string, opts: AvailabilityOptions = {}): number {
  const asOf = opts.asOf ?? new Date(0); // epoch -> no future POs counted
  return availableQtyInner(sku, opts, asOf, new Set<string>());
}

function availableQtyInner(
  sku: string,
  opts: AvailabilityOptions,
  asOf: Date,
  visited: Set<string>,
): number {
  // Cycle / depth guard. Kits-of-kits is supported, but a kit cannot
  // (transitively) contain itself.
  if (visited.has(sku)) return 0;

  const kit = findKit(sku);
  if (kit) {
    const next = new Set(visited);
    next.add(sku);
    // Bottleneck: the component with the fewest "kits' worth" available
    // caps how many kits we can build.
    let bottleneck = Infinity;
    for (const c of kit.components) {
      const compAvail = availableQtyInner(c.sku, opts, asOf, next);
      const kitsFromComp = Math.floor(compAvail / c.qty_per_kit);
      if (kitsFromComp < bottleneck) bottleneck = kitsFromComp;
    }
    return bottleneck === Infinity ? 0 : bottleneck;
  }

  // Plain SKU: per-yard or aggregate ATP.
  const baseAtp = opts.yard
    ? atpAtYard(sku, opts.yard, asOf)
    : atpAcrossYards(sku, asOf);

  if (!opts.includeSubs) return baseAtp;

  // Add stock available via applicable substitutes. Substitutes are
  // additive — they're stock you can use to fulfill demand for `sku`.
  // They go through the same yard/asOf scoping but DO NOT recurse into
  // kits (a SKU that's substitutable is a normal SKU, not a kit). If we
  // ever need substitutes that point at kits, the recursion is already
  // here — but we'd want product input first.
  const subs = applicableSubs(sku, opts.customer);
  const subQty = subs.reduce((sum, rule) => {
    const q = opts.yard
      ? atpAtYard(rule.substitute_sku, opts.yard, asOf)
      : atpAcrossYards(rule.substitute_sku, asOf);
    return sum + q;
  }, 0);

  return baseAtp + subQty;
}

// ============================================================================
// Driver — demonstrates each phase.
// ============================================================================

function header(s: string) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function main() {
  // -----------------------------------------------------------------------
  // PHASE 1 — single yard, on-hand only.
  // -----------------------------------------------------------------------
  header('Phase 1 — single yard, on-hand only (legacy lookup)');
  for (const sku of ['A8-412X', 'PLY-12F', '88A-99', 'JH-26', 'UNKNOWN-SKU']) {
    console.log(`  ${sku.padEnd(14)} -> ${availableQtyPhase1(sku)}`);
  }

  // -----------------------------------------------------------------------
  // PHASE 2 — per-yard ATP, aggregate ATP, asOf shifts the answer.
  // -----------------------------------------------------------------------
  header('Phase 2 — per-yard ATP for A8-412X (the multi-yard 2x4x8)');
  for (const [label, asOf] of Object.entries(TEST_DATES)) {
    const van = atpAtYard('A8-412X', 'VAN', asOf);
    const bby = atpAtYard('A8-412X', 'BBY', asOf);
    const sur = atpAtYard('A8-412X', 'SUR', asOf);
    const tot = atpAcrossYards('A8-412X', asOf);
    console.log(`  asOf=${fmtDate(asOf as Date)} (${label.padEnd(9)})  VAN=${String(van).padStart(4)}  BBY=${String(bby).padStart(4)}  SUR=${String(sur).padStart(4)}  TOTAL=${tot}`);
  }
  // Show how on_PO inclusion changes the answer for PLY-12F (heavily
  // committed today, big PO arriving 5/15).
  header('Phase 2 — PLY-12F at VAN: how asOf changes ATP');
  for (const [label, asOf] of Object.entries(TEST_DATES)) {
    console.log(`  asOf=${fmtDate(asOf as Date)} (${label.padEnd(9)})  VAN ATP = ${atpAtYard('PLY-12F', 'VAN', asOf)}`);
  }

  // Oversold at VAN for OSB — committed == on_hand, no incoming. Should be 0,
  // never negative.
  header('Phase 2 — oversold edge case (88A-99 at VAN: committed == on_hand)');
  console.log(`  atpAtYard('88A-99','VAN',today) = ${atpAtYard('88A-99', 'VAN', TEST_DATES.today)}  (capped at 0)`);

  // Structured report — for fulfillment / dashboard callers.
  header('Phase 2 — structured availability report (A8-412X, nextWeek)');
  const rep = atpReport('A8-412X', TEST_DATES.nextWeek);
  console.log(`  total_atp = ${rep.total_atp}`);
  for (const b of rep.byYard) {
    console.log(`    ${b.yard}  on_hand=${b.on_hand}  committed=${b.committed}  incoming=${b.incoming}  atp=${b.atp}`);
  }

  // -----------------------------------------------------------------------
  // PHASE 3 — substitutions (customer-gated, opt-in) and kits (bottleneck).
  // -----------------------------------------------------------------------
  header('Phase 3 — substitutions are opt-in and customer-gated');
  // A8-412X-HF (Hem-Fir) is only stocked at VAN: 30 on_hand, 10 committed
  // -> base ATP = 20. SPF (A8-412X) can substitute, but only for "framing".
  const hf = 'A8-412X-HF';
  const today = TEST_DATES.today;
  console.log(`  ${hf} base (no subs):                                ${availableQty(hf, { asOf: today })}`);
  console.log(`  ${hf} includeSubs but anonymous customer:            ${availableQty(hf, { asOf: today, includeSubs: true })}`);
  console.log(`  ${hf} includeSubs + customer in 'cabinet' segment:   ${availableQty(hf, { asOf: today, includeSubs: true, customer: { segment: 'cabinet' } })}`);
  console.log(`  ${hf} includeSubs + customer in 'framing' segment:   ${availableQty(hf, { asOf: today, includeSubs: true, customer: { segment: 'framing' } })}`);

  // Universal sub: 88A-99 (OSB) <- 88A-99-ALT applies to anyone.
  console.log(`  88A-99 base aggregate:                              ${availableQty('88A-99', { asOf: today })}`);
  console.log(`  88A-99 includeSubs anonymous (universal sub fires): ${availableQty('88A-99', { asOf: today, includeSubs: true })}`);

  header('Phase 3 — kit availability (DECK-KIT-SM): bottleneck math');
  // Walk through component math at VAN today so the bottleneck is visible.
  const kit = KITS[0];
  console.log(`  Kit: ${kit.kit_sku} (${kit.description})`);
  for (const c of kit.components) {
    const atVan = atpAtYard(c.sku, 'VAN', today);
    const agg   = atpAcrossYards(c.sku, today);
    console.log(
      `    ${c.sku.padEnd(8)}  per_kit=${String(c.qty_per_kit).padStart(3)}  ` +
      `VAN_atp=${String(atVan).padStart(4)} -> ${Math.floor(atVan / c.qty_per_kit)} kits   ` +
      `AGG_atp=${String(agg).padStart(4)} -> ${Math.floor(agg / c.qty_per_kit)} kits`
    );
  }
  console.log(`  availableQty(DECK-KIT-SM, yard=VAN, today) = ${availableQty('DECK-KIT-SM', { yard: 'VAN', asOf: today })}`);
  console.log(`    (NL-F21 not stocked at VAN -> bottleneck pins the kit at 0 there)`);
  console.log(`  availableQty(DECK-KIT-SM, aggregate, today) = ${availableQty('DECK-KIT-SM', { asOf: today })}`);
  console.log(`  availableQty(DECK-KIT-SM, aggregate, nextMonth) = ${availableQty('DECK-KIT-SM', { asOf: TEST_DATES.nextMonth })}`);
  console.log(`    (NL-F21 has no inventory rows in our data, so the kit pins at 0 even with future POs)`);
  // Show the bottleneck shifting in a scenario where it actually shifts:
  // exclude the nails component by pretending we have a nails-free kit -> the
  // floor jumps to whichever real component is now smallest (PLY-12F at 3).
  const nailFreeKitAtp = Math.min(
    Math.floor(atpAcrossYards('A8-412X', today) / 12),
    Math.floor(atpAcrossYards('PLY-12F', today) / 4),
    Math.floor(atpAcrossYards('JH-26',   today) / 24),
  );
  console.log(`  if we drop NL-F21 from the kit, aggregate ATP today = ${nailFreeKitAtp}  (bottleneck = PLY-12F)`);

  header('Phase 3 — unknown SKU and cycle guard');
  console.log(`  availableQty('UNKNOWN-SKU')                = ${availableQty('UNKNOWN-SKU')}`);
  console.log(`  cycle guard: kits-of-kits OK; self-cycles return 0 instead of stack-overflowing`);
}

main();
