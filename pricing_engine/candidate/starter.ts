// ============================================================================
// Pricing Engine — TypeScript starter (Phase 1)
//
// Read instructions first. Solve phase 1 below; the interviewer will
// introduce phase 2 and 3 verbally once phase 1 is working.
//
// Run:  npx ts-node starter.ts
// ============================================================================

// ----- Phase 1 data ---------------------------------------------------------

// Sample SKUs (LBM). Prices are in CAD.
const LIST_PRICES: Record<string, number> = {
  'A8-412X':  3.49,   // 2x4x8 Standard Pine
  'XC-8812':  4.29,   // 2x4x10 Standard Pine
  'B-441-9':  6.79,   // 2x6x8 Standard Pine
  '88A-99':  18.89,   // 1/2" 4x8 OSB Sheathing
  'PLY-12F': 28.59,   // 1/2" 4x8 Fir Plywood
  'DRY-12-8': 12.49,  // 1/2" 4x8 Regular Drywall
  'NL-F21':  44.59,   // Framing Nails (box)
  'INS-13-K': 19.89,  // R-13 Fiberglass Batts (bag)
};

type Tier = 'GOLD' | 'SILVER' | 'BRONZE';

interface Customer {
  id: string;
  name: string;
  tier: Tier;
}

const CUSTOMERS: Customer[] = [
  { id: 'C-1001', name: 'Bayside Construction',   tier: 'GOLD' },
  { id: 'C-1002', name: 'Maple Ridge Builders',   tier: 'SILVER' },
  { id: 'C-1003', name: 'Walk-in Customer',       tier: 'BRONZE' },
];

// ============================================================================
// YOUR CODE BELOW
// ============================================================================

function getPrice(sku: string, customer: Customer): number {
  // TODO: implement
  return 0;
}

// ============================================================================
// Driver — leave alone
// ============================================================================

function main() {
  const cases: Array<{ sku: string; customer: string }> = [
    { sku: 'A8-412X',  customer: 'C-1001' },  // Bayside (GOLD) buying 2x4x8
    { sku: 'A8-412X',  customer: 'C-1002' },  // Maple Ridge (SILVER)
    { sku: 'A8-412X',  customer: 'C-1003' },  // Walk-in (BRONZE)
    { sku: 'PLY-12F',  customer: 'C-1001' },  // Bayside on plywood
    { sku: '88A-99',   customer: 'C-1002' },  // Maple Ridge on OSB
    //{ sku: 'NLF-21',   customer: 'C-1001' },  // Bayside (GOLD) nails typo
  ];

  for (const c of cases) {
    const customer = CUSTOMERS.find((x) => x.id === c.customer)!;
    const price = getPrice(c.sku, customer);
    console.log(`${c.sku}  ${customer.tier.padEnd(7)} ${customer.name.padEnd(28)} -> $${price.toFixed(2)}`);
  }
}

main();
