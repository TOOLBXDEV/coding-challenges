// ============================================================================
// Inventory Availability — TypeScript starter (Phase 1)
//
// Read INSTRUCTIONS.md first. Solve phase 1 below; the interviewer will
// introduce phase 2 and 3 verbally once phase 1 is working.
//
// Run:  npx ts-node starter.ts
// ============================================================================

// ----- Phase 1 data ---------------------------------------------------------

// Single yard. SKU -> units on hand.
const ON_HAND: Record<string, number> = {
  'A8-412X':  415,   // 2x4x8 Standard Pine
  'XC-8812':  320,   // 2x4x10 Standard Pine
  'B-441-9':  285,   // 2x6x8 Standard Pine
  '88A-99':   340,   // 1/2" 4x8 OSB Sheathing
  'PLY-12F':  195,   // 1/2" 4x8 Fir Plywood
  'DRY-12-8': 380,   // 1/2" 4x8 Regular Drywall
  'NL-F21':   170,   // Framing Nails (box)
  'INS-13-K': 150,   // R-13 Fiberglass Batts (bag)
  'JH-26':    530,   // Joist Hanger 2x6
  'SCW-DK2':  170,   // Deck Screws (1lb)
};

// ============================================================================
// YOUR CODE BELOW
// ============================================================================

function availableQty(sku: string): number {
  // TODO: implement
  return 0;
}

// ============================================================================
// Driver — leave alone
// ============================================================================

function main() {
  const lookups = ['A8-412X', 'PLY-12F', '88A-99', 'JH-26', 'UNKNOWN-SKU'];

  for (const sku of lookups) {
    const qty = availableQty(sku);
    console.log(`${sku.padEnd(14)} -> ${qty}`);
  }
}

main();
