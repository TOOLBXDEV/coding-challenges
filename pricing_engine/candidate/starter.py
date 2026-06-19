from dataclasses import dataclass
from typing import Literal

# ----- Phase 1 data ---------------------------------------------------------
# Sample SKUs (LBM). Prices are in CAD.
LIST_PRICES: dict[str, float] = {
    'A8-412X':  3.49,   # 2x4x8 Standard Pine
    'XC-8812':  4.29,   # 2x4x10 Standard Pine
    'B-441-9':  6.79,   # 2x6x8 Standard Pine
    '88A-99':  18.89,   # 1/2" 4x8 OSB Sheathing
    'PLY-12F': 28.59,   # 1/2" 4x8 Fir Plywood
    'DRY-12-8': 12.49,  # 1/2" 4x8 Regular Drywall
    'NL-F21':  44.59,   # Framing Nails (box)
    'INS-13-K': 19.89,  # R-13 Fiberglass Batts (bag)
}

Tier = Literal['GOLD', 'SILVER', 'BRONZE']


@dataclass
class Customer:
    id: str
    name: str
    tier: Tier


CUSTOMERS: list[Customer] = [
    Customer(id='C-1001', name='Bayside Construction', tier='GOLD'),
    Customer(id='C-1002', name='Maple Ridge Builders', tier='SILVER'),
    Customer(id='C-1003', name='Walk-in Customer',     tier='BRONZE'),
]


# ============================================================================
# YOUR CODE BELOW
# ============================================================================
def get_price(sku: str, customer: Customer) -> float:
    # TODO: implement
    return 0.0


# ============================================================================
# Driver — leave alone
# ============================================================================
def main() -> None:
    cases = [
        {'sku': 'A8-412X', 'customer': 'C-1001'},  # Bayside (GOLD) buying 2x4x8
        {'sku': 'A8-412X', 'customer': 'C-1002'},  # Maple Ridge (SILVER)
        {'sku': 'A8-412X', 'customer': 'C-1003'},  # Walk-in (BRONZE)
        {'sku': 'PLY-12F', 'customer': 'C-1001'},  # Bayside on plywood
        {'sku': '88A-99',  'customer': 'C-1002'},  # Maple Ridge on OSB
        # {'sku': 'NLF-21', 'customer': 'C-1001'},  # Bayside (GOLD) nails typo
    ]

    for c in cases:
        customer = next(x for x in CUSTOMERS if x.id == c['customer'])
        price = get_price(c['sku'], customer)
        print(f"{c['sku']:<8} {customer.tier:<7} {customer.name:<28} -> ${price:.2f}")


if __name__ == '__main__':
    main()
