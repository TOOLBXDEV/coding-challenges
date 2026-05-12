// ============================================================================
// Order Lifecycle — TypeScript starter (Phase 1)
//
// Read INSTRUCTIONS.md first. Solve phase 1 below; the interviewer will
// introduce phase 2 and 3 verbally once phase 1 is working.
//
// Run:  npx ts-node starter.ts
// ============================================================================

interface Customer {
  id: string;
  name: string;
}

const CUSTOMERS: Customer[] = [
  { id: 'C-1001', name: 'Bayside Construction' },
  { id: 'C-1002', name: 'Maple Ridge Builders' },
];

// Input shape for a line being added to an order
interface OrderLineInput {
  sku: string;
  quantity: number;
  unit_price: number;
}

// ============================================================================
// YOUR DESIGN BELOW
// You decide what `Order` looks like, what types you need, etc.
// ============================================================================

interface Order {
  // TODO: design this
  id: string;
}

function placeOrder(customer: Customer, lines: OrderLineInput[]): Order {
  // TODO: implement
  return { id: 'TODO' };
}

function getTotal(order: Order): number {
  // TODO: implement
  return 0;
}

// ============================================================================
// Driver — leave alone for phase 1
// ============================================================================

function main() {
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X',  quantity: 100, unit_price: 3.20 },  // 2x4x8s
    { sku: 'PLY-12F',  quantity: 20,  unit_price: 26.99 }, // plywood
    { sku: 'NL-F21',   quantity: 4,   unit_price: 44.59 }, // boxes of nails
  ]);

  console.log(`Order ${order.id} for ${bayside.name}`);
  console.log(`Total: $${getTotal(order).toFixed(2)}`);
  // Expected: 100 * 3.20 + 20 * 26.99 + 4 * 44.59 = 320.00 + 539.80 + 178.36 = $1038.16
}

main();
