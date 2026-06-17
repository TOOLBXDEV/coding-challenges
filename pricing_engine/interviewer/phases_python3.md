# Phase Reveal Scripts + Paste-In Data

~~~
Solution:
A8-412X  GOLD    Bayside Construction         -> $2.97
A8-412X  SILVER  Maple Ridge Builders         -> $3.21
A8-412X  BRONZE  Walk-in Customer             -> $3.49
PLY-12F  GOLD    Bayside Construction         -> $24.30
88A-99  SILVER  Maple Ridge Builders         -> $17.38
~~~

Now uncomment last case in main with unknown SKU, ask candidate to fix. Great if their solution already handles this, might need a signature change.

---

## Phase 2 — Time-bounded contract pricing

New requirement. We have **contracts** — a customer-specific, SKU-specific fixed price that's negotiated separately. Contracts have an effective date and an expiry date — they apply for some window of time.
>
> For example: Bayside Construction negotiated a fixed price of \$2.20 on the 2x4x8 from January through June. During that window, they pay \$2.20 — not the tier discount.
>
> - The same customer might have multiple contracts on the same SKU with overlapping date windows.
> - Existing test cases need to continue working.

### Paste above YOUR CODE BELOW

~~~python
# ----- Phase 2 data ---------------------------------------------------------

from dataclasses import dataclass
from datetime import date


@dataclass
class Contract:
    id: int
    customer_id: str
    sku: str
    fixed_price: float
    effective_date: date
    expiry_date: date


CONTRACTS: list[Contract] = [
    # Bayside has a Q1-Q2 contract on 2x4x8 at $2.35
    Contract(id=1, customer_id='C-1001', sku='A8-412X', fixed_price=2.35,
             effective_date=date(2026, 1, 1), expiry_date=date(2026, 6, 30)),

    # Bayside contract overlaps the first contract Apr-Sep
    Contract(id=2, customer_id='C-1001', sku='A8-412X', fixed_price=2.20,
             effective_date=date(2026, 4, 1), expiry_date=date(2026, 9, 30)),

    # Maple Ridge has a year-long contract on plywood
    Contract(id=3, customer_id='C-1002', sku='PLY-12F', fixed_price=26.00,
             effective_date=date(2026, 1, 1), expiry_date=date(2026, 12, 31)),

    # Bayside's drywall contract — already expired
    Contract(id=4, customer_id='C-1001', sku='DRY-12-8', fixed_price=11.00,
             effective_date=date(2025, 6, 1), expiry_date=date(2025, 12, 31)),

    # Bayside's OSB contract — starts in the future
    Contract(id=5, customer_id='C-1001', sku='88A-99', fixed_price=15.50,
             effective_date=date(2026, 12, 1), expiry_date=date(2027, 6, 30)),
]
~~~

## PASTE INTO MAIN AT end

~~~python
    TEST_DATES = {
        'q1': date(2026, 2, 15),            # Bayside's first contract is active; second isn't yet
        'q2': date(2026, 5, 15),            # Both Bayside contracts overlap
        'q3': date(2026, 8, 15),            # Only the second Bayside contract is active
        'pre_contract': date(2025, 3, 15),  # Before any contract — fall back to tier
    }

    phase2_cases = [
        {'sku': 'A8-412X', 'customer': 'C-1001', 'as_of': TEST_DATES['q1']},            # Bayside (GOLD) buying 2x4x8 in Q1
        {'sku': 'A8-412X', 'customer': 'C-1001', 'as_of': TEST_DATES['q2']},            # Bayside (GOLD) buying 2x4x8 in Q2
        {'sku': 'A8-412X', 'customer': 'C-1001', 'as_of': TEST_DATES['q3']},            # Bayside (GOLD) buying 2x4x8 in Q3
        {'sku': 'A8-412X', 'customer': 'C-1001', 'as_of': TEST_DATES['pre_contract']},  # Bayside (GOLD) buying 2x4x8 in Q1 2025
        {'sku': '88A-99',  'customer': 'C-1001', 'as_of': TEST_DATES['pre_contract']},  # Bayside (GOLD) buying OSB in Q1 2025
    ]

    for c in phase2_cases:
        customer = next(x for x in CUSTOMERS if x.id == c['customer'])
        price = get_price(c['sku'], customer, c['as_of'])
        date_string = c['as_of'].strftime('%m/%d/%y')
        print(f"{date_string} {c['sku']:<8} {customer.tier:<7} {customer.name:<28} -> ${price:.2f}")
~~~

Solution:

~~~
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
~~~

---

## Phase 3 — Auditability

A customer disputed a price six months ago and now finance is asking us to reproduce exactly what they were quoted. Currently your function returns a number. We need it to return a **breakdown** — every adjustment we applied, what it was, where it came from. Reshape your return type.

No specific solution, candidate should rework their solution to return or record the amount and source of the discount applied.

## More optional phases

### Volume breaks

> "Now: most contracts and SKUs have **volume breaks**. Buy 1-99 units, pay one price; 100-499, less; 500+, less still. The function needs a `qty` argument now.
>
> Volume breaks can apply on top of either list/tier pricing OR on top of a contract — the contract spec sometimes includes its own break schedule."

#### Paste-in data

~~~python
@dataclass
class VolumeBreak:
    min_qty: int
    unit_price: float       # absolute price at this qty tier


# Per-SKU volume breaks (apply when no contract overrides)
VOLUME_BREAKS: dict[str, list[VolumeBreak]] = {
    'A8-412X': [
        VolumeBreak(min_qty=1,   unit_price=3.49),
        VolumeBreak(min_qty=100, unit_price=3.20),
        VolumeBreak(min_qty=500, unit_price=2.95),
    ],
    'PLY-12F': [
        VolumeBreak(min_qty=1,   unit_price=28.59),
        VolumeBreak(min_qty=50,  unit_price=26.99),
        VolumeBreak(min_qty=200, unit_price=24.99),
    ],
}
~~~

### Promos

> "We also have **promotions** — temporary, SKU-level percentage discounts. Each promo has effective and expiry dates. Some promos stack with the tier discount; others don't. Some promos are excluded if the customer has an active contract on that SKU."

#### Paste-in data

~~~python
@dataclass
class Promo:
    sku: str
    percent_off: float
    effective_date: date
    expiry_date: date
    stacks_with_tier: bool
    excluded_if_under_contract: bool


PROMOS: list[Promo] = [
    # Spring framing-lumber sale: 5% off, stacks with tier, blocked by contracts
    Promo(sku='A8-412X', percent_off=0.05,
          effective_date=date(2026, 3, 1), expiry_date=date(2026, 5, 31),
          stacks_with_tier=True, excluded_if_under_contract=True),

    # OSB clearance: 10% off, replaces tier (doesn't stack)
    Promo(sku='88A-99', percent_off=0.10,
          effective_date=date(2026, 4, 1), expiry_date=date(2026, 4, 30),
          stacks_with_tier=False, excluded_if_under_contract=False),
]
~~~

### What to push on

- *"Does the tier discount stack with the volume break?"* — they should ask, not assume.
- *"What's the precedence between contract, volume break, and promo when more than one applies?"* — there's no single answer; watch them reason.
- *"You return a `unit_price` and a `breakdown`. Are those guaranteed consistent?"* — strong candidates ensure the breakdown sums to the unit_price (or document the rounding policy explicitly).
