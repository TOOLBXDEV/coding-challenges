# frozen_string_literal: true

# ============================================================================
# Pricing Engine — Ruby starter (Phase 1)
#
# Read instructions first. Solve phase 1 below; the interviewer will
# introduce phase 2 and 3 verbally once phase 1 is working.
#
# Run:  ruby starter.rb
# ============================================================================

# ----- Phase 1 data ---------------------------------------------------------

# Sample SKUs (LBM). Prices are in CAD.
LIST_PRICES = {
  'A8-412X' => 3.49,   # 2x4x8 Standard Pine
  'XC-8812' => 4.29,   # 2x4x10 Standard Pine
  'B-441-9' => 6.79,   # 2x6x8 Standard Pine
  '88A-99' => 18.89,   # 1/2" 4x8 OSB Sheathing
  'PLY-12F' => 28.59,  # 1/2" 4x8 Fir Plywood
  'DRY-12-8' => 12.49, # 1/2" 4x8 Regular Drywall
  'NL-F21' => 44.59,   # Framing Nails (box)
  'INS-13-K' => 19.89  # R-13 Fiberglass Batts (bag)
}.freeze

# Gold: 15% off, Silver: 8% off, Bronze: no discount
TIERS = %i[GOLD SILVER BRONZE].freeze

Customer = Struct.new(:id, :name, :tier, keyword_init: true)

CUSTOMERS = [
  Customer.new(id: 'C-1001', name: 'Bayside Construction', tier: :GOLD),
  Customer.new(id: 'C-1002', name: 'Maple Ridge Builders', tier: :SILVER),
  Customer.new(id: 'C-1003', name: 'Walk-in Customer',     tier: :BRONZE)
].freeze

# ============================================================================
# YOUR CODE BELOW
# ============================================================================

def get_price(sku, customer)
  # TODO: implement
  0.0
end

# ============================================================================
# Driver — leave alone
# ============================================================================

def main
  cases = [
    { sku: 'A8-412X', customer: 'C-1001' }, # Bayside (GOLD) buying 2x4x8
    { sku: 'A8-412X', customer: 'C-1002' }, # Maple Ridge (SILVER)
    { sku: 'A8-412X', customer: 'C-1003' }, # Walk-in (BRONZE)
    { sku: 'PLY-12F', customer: 'C-1001' }, # Bayside on plywood
    { sku: '88A-99',  customer: 'C-1002' }  # Maple Ridge on OSB
    # { sku: 'NLF-21',  customer: 'C-1001' }  # Bayside (GOLD) nails typo
  ]

  cases.each do |c|
    customer = CUSTOMERS.find { |x| x.id == c[:customer] }
    price = get_price(c[:sku], customer)
    puts format('%s  %-7s %-28s  %.2f', c[:sku], customer.tier, customer.name, price)
  end
end

main if $PROGRAM_NAME == __FILE__
