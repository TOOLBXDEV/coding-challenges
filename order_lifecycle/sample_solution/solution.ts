// ============================================================================
// Order Lifecycle — Final solution (end of phase 3)
//
// Evolution of the model:
//   Phase 1: Order has immutable line items; total = sum(qty * unit_price).
//   Phase 2: Shipment introduced as a first-class noun. Order lines stay
//            immutable; shipments are append-only. Status is derived. "Total"
//            splits into ordered/shipped/outstanding.
//   Phase 3: Return introduced, references a Shipment (so we know what price
//            the customer actually paid). Past shipments are never mutated.
//            Net total = shipped - refunded.
//
// Run:  npx ts-node solution.ts
// ============================================================================

interface Customer {
  id: string;
  name: string;
}

const CUSTOMERS: Customer[] = [
  { id: 'C-1001', name: 'Bayside Construction' },
  { id: 'C-1002', name: 'Maple Ridge Builders' },
];

// ----- Inputs ---------------------------------------------------------------

interface OrderLineInput {
  sku: string;
  quantity: number;
  unit_price: number;
}

interface ShipLineInput {
  sku: string;
  quantity: number;
}

interface ReturnLineInput {
  sku: string;
  quantity: number;
}

// ----- Domain entities ------------------------------------------------------

// OrderLine captures the customer's commitment at order time. Immutable.
// "Outstanding" is *not* stored — it's derived from (ordered - shipped).
interface OrderLine {
  sku: string;
  ordered_qty: number;
  unit_price: number; // price captured at order time
}

// A Shipment is a real-world event: paperwork, a truck, a date.
// Append-only. We snapshot unit_price here too — so if the SKU's price drifts
// later, the shipment's history is unambiguous and a return knows what to refund.
interface ShipmentLine {
  sku: string;
  shipped_qty: number;
  unit_price: number; // snapshot from the order line at ship time
}

interface Shipment {
  id: string;
  order_id: string;
  shipped_at: Date;
  lines: ShipmentLine[];
}

// A Return references the *shipment* it's reversing — not the order line.
// That's the key insight: the same SKU could ship twice at different prices,
// and refund must use the price the customer actually paid on that shipment.
interface ReturnLine {
  sku: string;
  returned_qty: number;
  refund_unit_price: number; // = the shipment line's unit_price, not "current"
}

interface Return {
  id: string;
  shipment_id: string;
  returned_at: Date;
  lines: ReturnLine[];
}

interface Order {
  id: string;
  customer: Customer;
  placed_at: Date;
  lines: OrderLine[];
  shipments: Shipment[];
  returns: Return[];
}

type OrderStatus = 'OPEN' | 'PARTIALLY_SHIPPED' | 'FULFILLED';

// ----- In-memory store ------------------------------------------------------
// Naive ID generation and lookup — enough for the interview, no persistence.

const ORDERS: Record<string, Order> = {};
const SHIPMENTS: Record<string, Shipment> = {};

function nextOrderId(): string {
  return 'O-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}
function nextShipmentId(): string {
  return 'S-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}
function nextReturnId(): string {
  return 'R-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// ----- Helpers --------------------------------------------------------------

function round2(n: number): number {
  // Round half-away-from-zero in cents. Adequate for display; if this were
  // money math at the ledger level I'd use integer minor units.
  return Math.round(n * 100) / 100;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function shippedQtyBySku(order: Order): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const s of order.shipments) {
    for (const l of s.lines) {
      acc[l.sku] = (acc[l.sku] ?? 0) + l.shipped_qty;
    }
  }
  return acc;
}

function returnedQtyBySkuForShipment(shipment: Shipment, order: Order): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of order.returns) {
    if (r.shipment_id !== shipment.id) continue;
    for (const l of r.lines) {
      acc[l.sku] = (acc[l.sku] ?? 0) + l.returned_qty;
    }
  }
  return acc;
}

// ----- Operations -----------------------------------------------------------

function placeOrder(customer: Customer, lines: OrderLineInput[]): Order {
  const order: Order = {
    id: nextOrderId(),
    customer,
    placed_at: new Date(),
    // Defensive copy: don't keep a reference to the caller's array/objects.
    lines: lines.map(l => ({
      sku: l.sku,
      ordered_qty: l.quantity,
      unit_price: l.unit_price,
    })),
    shipments: [],
    returns: [],
  };
  ORDERS[order.id] = order;
  return order;
}

function ship(orderId: string, lines: ShipLineInput[]): Shipment {
  const order = ORDERS[orderId];
  if (!order) throw new Error(`Order ${orderId} not found`);

  const shippedSoFar = shippedQtyBySku(order);
  const shipmentLines: ShipmentLine[] = [];

  for (const l of lines) {
    if (l.quantity <= 0) {
      throw new Error(`Cannot ship non-positive qty for ${l.sku}`);
    }
    const orderLine = order.lines.find(ol => ol.sku === l.sku);
    if (!orderLine) {
      throw new Error(`SKU ${l.sku} is not on order ${orderId}`);
    }
    const already = shippedSoFar[l.sku] ?? 0;
    if (already + l.quantity > orderLine.ordered_qty) {
      throw new Error(
        `Cannot ship ${l.quantity} of ${l.sku}: only ${orderLine.ordered_qty - already} outstanding`
      );
    }
    shipmentLines.push({
      sku: l.sku,
      shipped_qty: l.quantity,
      // Snapshot the price as it stands on the order line. Phase 3 cares about
      // this: if the catalog price drifts later, this snapshot is what we
      // refund against.
      unit_price: orderLine.unit_price,
    });
  }

  const shipment: Shipment = {
    id: nextShipmentId(),
    order_id: order.id,
    shipped_at: new Date(),
    lines: shipmentLines,
  };
  order.shipments.push(shipment);
  SHIPMENTS[shipment.id] = shipment;
  return shipment;
}

function returnFromShipment(shipmentId: string, lines: ReturnLineInput[]): Return {
  const shipment = SHIPMENTS[shipmentId];
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);
  const order = ORDERS[shipment.order_id];
  if (!order) throw new Error(`Order ${shipment.order_id} not found`);

  // Guard: can't return more than was shipped (across all prior returns of this shipment).
  const alreadyReturned = returnedQtyBySkuForShipment(shipment, order);

  const returnLines: ReturnLine[] = [];
  for (const l of lines) {
    if (l.quantity <= 0) {
      throw new Error(`Cannot return non-positive qty for ${l.sku}`);
    }
    const shipLine = shipment.lines.find(sl => sl.sku === l.sku);
    if (!shipLine) {
      throw new Error(`SKU ${l.sku} was not on shipment ${shipmentId}`);
    }
    const remaining = shipLine.shipped_qty - (alreadyReturned[l.sku] ?? 0);
    if (l.quantity > remaining) {
      throw new Error(
        `Cannot return ${l.quantity} of ${l.sku}: only ${remaining} returnable on shipment ${shipmentId}`
      );
    }
    returnLines.push({
      sku: l.sku,
      returned_qty: l.quantity,
      // POLICY: refund at the price the customer paid on this shipment, not
      // the current catalog price. Customer trust > convenience.
      refund_unit_price: shipLine.unit_price,
    });
  }

  const ret: Return = {
    id: nextReturnId(),
    shipment_id: shipment.id,
    returned_at: new Date(),
    lines: returnLines,
  };
  order.returns.push(ret);
  return ret;
}

// ----- Projections (totals + status) ----------------------------------------
// Nothing here is stored. Each is a pure function over (order, shipments, returns).

function getOrderedTotal(order: Order): number {
  return round2(sum(order.lines.map(l => l.ordered_qty * l.unit_price)));
}

function getShippedTotal(order: Order): number {
  return round2(
    sum(order.shipments.flatMap(s => s.lines).map(l => l.shipped_qty * l.unit_price))
  );
}

function getOutstandingTotal(order: Order): number {
  // What's still owed to ship, valued at order-time prices.
  const shipped = shippedQtyBySku(order);
  return round2(
    sum(
      order.lines.map(l => {
        const remaining = l.ordered_qty - (shipped[l.sku] ?? 0);
        return remaining * l.unit_price;
      })
    )
  );
}

function getRefundedTotal(order: Order): number {
  return round2(
    sum(order.returns.flatMap(r => r.lines).map(l => l.returned_qty * l.refund_unit_price))
  );
}

// "Net" is what the order is financially worth to us right now: what we billed
// (shipped) minus what we owe back (refunded). Outstanding is *not* part of net
// because it hasn't been invoiced.
function getNetTotal(order: Order): number {
  return round2(getShippedTotal(order) - getRefundedTotal(order));
}

// Phase 1 callers asked for `getTotal`. We keep it for back-compat, but it now
// means "ordered total" — the customer's original commitment. Anything else
// (shipped, refunded, net) is its own function.
function getTotal(order: Order): number {
  return getOrderedTotal(order);
}

function getStatus(order: Order): OrderStatus {
  const shipped = shippedQtyBySku(order);
  const allFulfilled = order.lines.every(l => (shipped[l.sku] ?? 0) >= l.ordered_qty);
  if (allFulfilled) return 'FULFILLED';
  const anyShipped = order.lines.some(l => (shipped[l.sku] ?? 0) > 0);
  return anyShipped ? 'PARTIALLY_SHIPPED' : 'OPEN';
}

// ============================================================================
// Driver — exercises all three phases
// ============================================================================

function phase1() {
  console.log('--- Phase 1: place order, get total ---');
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X', quantity: 100, unit_price: 3.20 },
    { sku: 'PLY-12F', quantity: 20, unit_price: 26.99 },
    { sku: 'NL-F21',  quantity: 4,  unit_price: 44.59 },
  ]);

  console.log(`Order ${order.id} for ${bayside.name}`);
  console.log(`Total: $${getTotal(order).toFixed(2)}`);
  // Expected: $1038.16
  console.log(`Status: ${getStatus(order)}`); // OPEN
  console.log('');
}

function phase2() {
  console.log('--- Phase 2: partial shipments + backorders ---');
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X', quantity: 100, unit_price: 3.20 },
    { sku: 'PLY-12F', quantity: 20, unit_price: 26.99 },
    { sku: 'NL-F21',  quantity: 4,  unit_price: 44.59 },
  ]);

  // Truck A: 60 of the 2x4x8s, plus the rest of plywood and nails in full.
  ship(order.id, [
    { sku: 'A8-412X', quantity: 60 },
    { sku: 'PLY-12F', quantity: 20 },
    { sku: 'NL-F21',  quantity: 4 },
  ]);

  console.log('After truck A:');
  console.log('  Status:           ', getStatus(order));                          // PARTIALLY_SHIPPED
  console.log('  Ordered total:    $' + getOrderedTotal(order).toFixed(2));       // 1038.16
  console.log('  Shipped total:    $' + getShippedTotal(order).toFixed(2));       // 910.16
  console.log('  Outstanding:      $' + getOutstandingTotal(order).toFixed(2));   // 128.00

  // Truck B: the remaining 40 of 2x4x8s.
  ship(order.id, [{ sku: 'A8-412X', quantity: 40 }]);

  console.log('After truck B:');
  console.log('  Status:           ', getStatus(order));                          // FULFILLED
  console.log('  Shipped total:    $' + getShippedTotal(order).toFixed(2));       // 1038.16
  console.log('  Outstanding:      $' + getOutstandingTotal(order).toFixed(2));   // 0.00
  console.log('');
}

function phase3() {
  console.log('--- Phase 3: returns + price drift ---');
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X', quantity: 100, unit_price: 3.20 },
    { sku: 'PLY-12F', quantity: 20,  unit_price: 26.99 },
  ]);

  const truckA = ship(order.id, [
    { sku: 'A8-412X', quantity: 60 },
    { sku: 'PLY-12F', quantity: 20 },
  ]);

  // Two weeks later: lumber market jumps; A8-412X is now $3.49 in the catalog.
  // (We don't model that drift here — the point is that the *shipment* line
  // already snapshotted $3.20, which is what the refund references.)
  // Bayside reports 3 of the 60 2x4x8s arrived damaged; we accept the return.
  returnFromShipment(truckA.id, [{ sku: 'A8-412X', quantity: 3 }]);

  console.log('After return:');
  console.log('  Status:           ', getStatus(order));                          // PARTIALLY_SHIPPED (40 still outstanding)
  console.log('  Shipped total:    $' + getShippedTotal(order).toFixed(2));       // 910.16 (unchanged — past is past)
  console.log('  Refunded total:   $' + getRefundedTotal(order).toFixed(2));      // 9.60
  console.log('  Net total:        $' + getNetTotal(order).toFixed(2));           // 900.56
  console.log('  Outstanding:      $' + getOutstandingTotal(order).toFixed(2));   // 128.00
  console.log('');
}

function main() {
  phase1();
  phase2();
  phase3();
}

main();
