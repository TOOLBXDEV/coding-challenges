# Phase Reveal Scripts + Paste-In Data

When the candidate has phase 1 working, reveal the next phase verbally and paste the corresponding scenario or data into their editor. **Don't reveal phases ahead of time.**

---

## Phase 2 — Partial shipments + backorders

### What to say (verbatim if helpful)

> "Nice. New requirement. Lines don't always ship in one go.
>
> Picture this: Bayside ordered 100 of the 2x4x8s. We have 60 in the yard today, so we ship 60 today on truck A. Next week, the rest of the inventory comes in and we ship the remaining 40 on truck B. Each shipment is its own event — separate paperwork, separate invoice line, possibly weeks apart.
>
> Sometimes a portion gets backordered indefinitely (out of stock, vendor issue) — we ship what we can and the rest stays open until we cancel or fulfill it.
>
> Implications:
> - We need to track what's been shipped vs. what's still outstanding.
> - The customer is invoiced for the **shipped portion only**, not the full order.
> - The order has a status: `OPEN`, `PARTIALLY_SHIPPED`, or `FULFILLED`.
>
> Add a `ship` operation. Reshape your model however you need."

### Paste-in scenario

```ts
// Phase 2 — paste this into the driver
function phase2() {
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X',  quantity: 100, unit_price: 3.20 },
    { sku: 'PLY-12F',  quantity: 20,  unit_price: 26.99 },
    { sku: 'NL-F21',   quantity: 4,   unit_price: 44.59 },
  ]);

  // Truck A leaves with what we have on hand
  ship(order.id, [
    { sku: 'A8-412X',  quantity: 60 },   // 40 still outstanding
    { sku: 'PLY-12F',  quantity: 20 },   // fully shipped
    { sku: 'NL-F21',   quantity: 4 },    // fully shipped
  ]);

  console.log('After truck A:');
  console.log('  Status:           ', getStatus(order));   // PARTIALLY_SHIPPED
  console.log('  Ordered total:    $', getOrderedTotal(order).toFixed(2));   // $1038.16
  console.log('  Shipped total:    $', getShippedTotal(order).toFixed(2));   // $910.16
  console.log('  Outstanding:      $', getOutstandingTotal(order).toFixed(2)); // $128.00

  // Truck B brings the rest
  ship(order.id, [{ sku: 'A8-412X', quantity: 40 }]);

  console.log('After truck B:');
  console.log('  Status:           ', getStatus(order));   // FULFILLED
}
```

### What to push on

- *"The customer wants to be invoiced for truck A right away — they don't want to wait for the rest. What does the invoice know?"* — should be derivable from the shipment.
- *"What if a line never ships in full — the rest gets cancelled?"* — should be a graceful state, not a special case.
- *"Why did you (mutate the line / introduce Shipment / use events)?"* — make them defend their choice.

If they mutate `quantity` directly, push: *"Now I want to know the original ordered quantity. Where is that in your model?"*

---

## Phase 3 — Returns + price drift

### What to say

> "Final wrinkle.
>
> Bayside calls and says 3 of those 60 2x4x8s from truck A are damaged — they want to return them. Truck A shipped two weeks ago. Between then and now, lumber prices spiked and the SKU is now \$3.49.
>
> A few things I want you to think through:
> - At what price do we refund? The customer paid \$3.20. They're entitled to that back. Where does that information live in your model?
> - The order's net financial state is now: shipped \$X, refunded \$Y, outstanding \$Z. What is the order's `total`? Does your existing function still work?
> - We may have already invoiced the customer for truck A. The return generates a credit note, not a refund-in-cash.
>
> Reshape what's needed. If we run out of code time, sketch the types and walk me through the projection."

### Paste-in scenario

```ts
// Phase 3 — paste this into the driver
function phase3() {
  const bayside = CUSTOMERS[0];

  const order = placeOrder(bayside, [
    { sku: 'A8-412X',  quantity: 100, unit_price: 3.20 },
    { sku: 'PLY-12F',  quantity: 20,  unit_price: 26.99 },
  ]);

  const truckA = ship(order.id, [
    { sku: 'A8-412X',  quantity: 60 },
    { sku: 'PLY-12F',  quantity: 20 },
  ]);

  // Two weeks pass. Prices change in the system. Customer returns 3 damaged 2x4x8s.
  // Refund price should be the price they paid, not today's price.
  returnFromShipment(truckA.id, [
    { sku: 'A8-412X', quantity: 3 },
  ]);

  console.log('After return:');
  console.log('  Shipped total:    $', getShippedTotal(order).toFixed(2));    // $910.16 (unchanged — past is past)
  console.log('  Refunded total:   $',  getRefundedTotal(order).toFixed(2));  // 3 × $3.20 = $9.60
  console.log('  Net total:        $', getNetTotal(order).toFixed(2));        // $900.56

  // Truck B ships the remaining 40 at the *new* price - line price was captured
  // at order time so this is a separate question; you can use it to probe
  // whether the candidate stores price on the shipment line or pulls from the order line.
}
```

### What to push on

- *"Where does the refund price come from?"* — must be the original shipment line, not current. If they refund at current price by accident, ask: *"What does the customer think when their refund is bigger than what they paid?"*
- *"What does `total` mean now?"* — they should split into shipped / refunded / net. If they kept a single function, it's probably wrong.
- *"Could the customer return more than was shipped?"* — should be guarded.
- *"If the order had been fulfilled and invoiced, can the return still happen?"* — yes; returns are decoupled from fulfillment status.

### If you have time at the end

Ask:

> "If this system kept growing — invoices, payments, credit notes, allocations across multiple invoices, refund-against-account-balance — what shape would the `Order` itself eventually take?"

Strong candidates name event-sourcing or aggregate-with-projections. They might also push back: *"At some point, the order becomes a derived view over a shared event stream — invoice and shipment and return are all participants in that stream."* That's a very strong signal.
