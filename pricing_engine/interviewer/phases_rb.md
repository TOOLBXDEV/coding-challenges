Ruby instructions. See [interviewer directory in Github repo](https://github.com/TOOLBXDEV/coding-challenges/tree/main/pricing_engine/interviewer) for these and instructions for other languages.


# Phase Reveal Scripts + Paste-In Data

Solution:

~~~
A8-412X  GOLD    Bayside Construction          2.97
A8-412X  SILVER  Maple Ridge Builders          3.21
A8-412X  BRONZE  Walk-in Customer              3.49
PLY-12F  GOLD    Bayside Construction          24.30
88A-99  SILVER  Maple Ridge Builders          17.38
~~~

Now uncomment last case in main with unknown SKU, ask candidate to fix. Great if their solution already handles this, might need a signature change.

Ruby note: `LIST_PRICES[sku]` returns `nil` for a bad SKU, so an unfixed solution fails
late with `NoMethodError: undefined method '*' for nil`. `LIST_PRICES.fetch(sku)` raises
a `KeyError` at the lookup instead. Worth asking which they'd prefer and why.

---

## Phase 2 — Time-bounded contract pricing

> New requirement. We have **contracts** — a customer-specific, SKU-specific fixed price that's negotiated separately. Contracts have an effective date and an expiry date — they apply for some window of time.
>
> For example: Bayside Construction negotiated a fixed price of \$2.20 on the 2x4x8 from January through June. During that window, they pay \$2.20 — not the tier discount.
>
> - The same customer might have multiple contracts on the same SKU with overlapping date windows.
> - Existing test cases need to continue working.

### Paste above YOUR CODE BELOW

~~~ruby
# ----- Phase 2 data ---------------------------------------------------------

require 'date'

Contract = Struct.new(:id, :customer_id, :sku, :fixed_price,
                      :effective_date, :expiry_date, keyword_init: true)

CONTRACTS = [
  # Bayside has a Q1-Q2 contract on 2x4x8 at $2.35
  Contract.new(id: 1, customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 2.35,
               effective_date: Date.new(2026, 1, 1), expiry_date: Date.new(2026, 6, 30)),

  # Bayside contract overlaps the first contract Apr-Sep
  Contract.new(id: 2, customer_id: 'C-1001', sku: 'A8-412X', fixed_price: 2.20,
               effective_date: Date.new(2026, 4, 1), expiry_date: Date.new(2026, 9, 30)),

  # Maple Ridge has a year-long contract on plywood
  Contract.new(id: 3, customer_id: 'C-1002', sku: 'PLY-12F', fixed_price: 26.00,
               effective_date: Date.new(2026, 1, 1), expiry_date: Date.new(2026, 12, 31)),

  # Bayside's drywall contract — already expired
  Contract.new(id: 4, customer_id: 'C-1001', sku: 'DRY-12-8', fixed_price: 11.00,
               effective_date: Date.new(2025, 6, 1), expiry_date: Date.new(2025, 12, 31)),

  # Bayside's OSB contract — starts in the future
  Contract.new(id: 5, customer_id: 'C-1001', sku: '88A-99', fixed_price: 15.50,
               effective_date: Date.new(2026, 12, 1), expiry_date: Date.new(2027, 6, 30))
].freeze
~~~

## PASTE INTO MAIN AT end

~~~ruby
  test_dates = {
    q1: Date.new(2026, 2, 15),            # Bayside's first contract is active; second isn't yet
    q2: Date.new(2026, 5, 15),            # Both Bayside contracts overlap
    q3: Date.new(2026, 8, 15),            # Only the second Bayside contract is active
    pre_contract: Date.new(2025, 3, 15)   # Before any contract — fall back to tier
  }

  phase2_cases = [
    { sku: 'A8-412X', customer: 'C-1001', as_of: test_dates[:q1] },            # Bayside (GOLD) buying 2x4x8 in Q1
    { sku: 'A8-412X', customer: 'C-1001', as_of: test_dates[:q2] },            # Bayside (GOLD) buying 2x4x8 in Q2
    { sku: 'A8-412X', customer: 'C-1001', as_of: test_dates[:q3] },            # Bayside (GOLD) buying 2x4x8 in Q3
    { sku: 'A8-412X', customer: 'C-1001', as_of: test_dates[:pre_contract] },  # Bayside (GOLD) buying 2x4x8 in Q1 2025
    { sku: '88A-99',  customer: 'C-1001', as_of: test_dates[:pre_contract] }   # Bayside (GOLD) buying OSB in Q1 2025
  ]

  phase2_cases.each do |c|
    customer = CUSTOMERS.find { |x| x.id == c[:customer] }
    price = get_price(c[:sku], customer, c[:as_of])
    puts format('%s %s  %-7s %-28s  %.2f',
                c[:as_of].strftime('%m/%d/%y'), c[:sku], customer.tier, customer.name, price)
  end
~~~

Solution:

~~~
A8-412X  GOLD    Bayside Construction          2.20
A8-412X  SILVER  Maple Ridge Builders          3.21
A8-412X  BRONZE  Walk-in Customer              3.49
PLY-12F  GOLD    Bayside Construction          24.30
88A-99  SILVER  Maple Ridge Builders          17.38
NLF-21: SKU not found
02/15/26 A8-412X  GOLD    Bayside Construction          2.35
05/15/26 A8-412X  GOLD    Bayside Construction          2.20
08/15/26 A8-412X  GOLD    Bayside Construction          2.20
03/15/25 A8-412X  GOLD    Bayside Construction          2.97
03/15/25 88A-99  GOLD    Bayside Construction          16.06
~~~

**Line 1 is date-dependent — don't treat 2.20 as the only right answer.** The phase-1
driver still calls `get_price(sku, customer)` with no date. If the candidate defaults
`as_of` to `Date.today`, Bayside falls inside contract #2 (2026-04-01 → 2026-09-30) and
line 1 drops from 2.97 to 2.20. If they default to `nil` and read that as "no contract
lookup," it stays 2.97. Both are defensible; the interesting part is whether they *noticed*
that "existing tests keep working" and "an implicit now" are in tension. Good prompt:
*"What date is the phase-1 driver asking about?"*

### NOTE: There are really no right or wrong answers on applying multiple contracts!

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

~~~ruby
# unit_price is the absolute price at this qty tier
VolumeBreak = Struct.new(:min_qty, :unit_price, keyword_init: true)

# Per-SKU volume breaks (apply when no contract overrides)
VOLUME_BREAKS = {
  'A8-412X' => [
    VolumeBreak.new(min_qty: 1,   unit_price: 3.49),
    VolumeBreak.new(min_qty: 100, unit_price: 3.20),
    VolumeBreak.new(min_qty: 500, unit_price: 2.95)
  ].freeze,
  'PLY-12F' => [
    VolumeBreak.new(min_qty: 1,   unit_price: 28.59),
    VolumeBreak.new(min_qty: 50,  unit_price: 26.99),
    VolumeBreak.new(min_qty: 200, unit_price: 24.99)
  ].freeze
}.freeze
~~~

### Promos

> "We also have **promotions** — temporary, SKU-level percentage discounts. Each promo has effective and expiry dates. Some promos stack with the tier discount; others don't. Some promos are excluded if the customer has an active contract on that SKU."

#### Paste-in data

~~~ruby
Promo = Struct.new(:sku, :percent_off, :effective_date, :expiry_date,
                   :stacks_with_tier, :excluded_if_under_contract, keyword_init: true)

PROMOS = [
  # Spring framing-lumber sale: 5% off, stacks with tier, blocked by contracts
  Promo.new(sku: 'A8-412X', percent_off: 0.05,
            effective_date: Date.new(2026, 3, 1), expiry_date: Date.new(2026, 5, 31),
            stacks_with_tier: true, excluded_if_under_contract: true),

  # OSB clearance: 10% off, replaces tier (doesn't stack)
  Promo.new(sku: '88A-99', percent_off: 0.10,
            effective_date: Date.new(2026, 4, 1), expiry_date: Date.new(2026, 4, 30),
            stacks_with_tier: false, excluded_if_under_contract: false)
].freeze
~~~

### What to push on

- *"Does the tier discount stack with the volume break?"* — they should ask, not assume.
- *"What's the precedence between contract, volume break, and promo when more than one applies?"* — there's no single answer; watch them reason.
- *"You return a `unit_price` and a `breakdown`. Are those guaranteed consistent?"* — strong candidates ensure the breakdown sums to the unit_price (or document the rounding policy explicitly).
