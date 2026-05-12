# Pricing Engine — Design Notes

## Process

How I'd actually walk through the 40 minutes.

### Phase 1 (target: under 8 min)

I'd read the prompt carefully and ask two questions before typing:

1. "What should happen on an unknown SKU — throw, or return null?" Throw, probably; silent zero is the worst answer.
2. "Rounding: cents at the boundary, or carry exact and let the caller round?" I'll round to 2dp at the function boundary and say so.

Then I'd type the obvious thing: pull `TIER_DISCOUNT` out as a `Record<Tier, number>`, do `list * (1 - discount)`, round, return. About 10 lines. I would not build types I don't need, I would not build a rules pipeline, I would not even introduce a `PriceQuote` shape — phase 1 doesn't ask for it.

I'd say out loud: "I'm deliberately not building anything I don't need. If you reveal phase 2 and it invalidates this shape, I'll refactor."

### Phase 2 reveal (target: 12 min mark)

Contracts. The interesting bits:

- **The signature has to change.** `getPrice(sku, customer)` cannot answer "what was the price on 2026-04-12?" I'd add `asOf: Date` and explicitly call out: "I'm not using `new Date()` because that breaks reproducibility for backdated invoices."
- **Multiple contracts can overlap.** I'd surface this immediately: "Which contract wins?" If they don't have an opinion I'd pick lowest-price-wins and justify: "Contracts are negotiated; if two overlap it's almost certainly because somebody re-negotiated downward and forgot to retire the old one. Lowest is the customer-friendly read and matches what a real LBM would do under audit."
- **What if no contract is active?** Fall back to tier.

I'd separate concerns visibly: a `findActiveContracts` filter, then a "pick winner" reduce, then a fallback. I would NOT yet refactor to a rules pipeline. The phase-2 shape (find contract → fallback to tier) is still readable as a couple of branches. I'd flag it: "If we add more rules I'd want to refactor toward a pipeline. Let me see what's next."

### Phase 3 reveal (target: 27 min mark)

Volume breaks + promos + audit. This is when I refactor.

The first thing I'd say: "OK, three new dimensions and an audit requirement — the conditional shape doesn't extend cleanly. I want to model this as a pipeline of rules where each rule emits a `PriceLine`. The breakdown is the rule output. The unit price is the sum. That makes audit free."

Concretely:

1. Define `PriceLine`, `PriceQuote`, `Rule` (a function taking ctx + lines so far and returning new lines).
2. Convert phase 1 + 2 logic into rules: `baselineList`, `tierDiscount`, `contractOverride`. Tests pass again (mentally).
3. Add `volumeBreak` and `promoRule`. The interaction matrix (contract suppresses volume? promo stacks with tier? promo blocked by contract?) lives on the data, not in branches.
4. Audit invariant: `sum(breakdown) === unit_price`. Add a sanity check in main().

I'd ask the interviewer about precedence as I go: "Does volume break apply on top of a contract? Probably not — contracts are negotiated and the customer doesn't get a second discount on a hand-shake price. I'll suppress volume when a contract line exists. Push back if that's wrong."

### Refactor moments

Two real ones:

- **Phase 2 → Phase 3.** Contract logic was a `if (active.length > 0) return ...; else fall back to tier`. In the pipeline model this becomes "always emit list, always emit tier, contract emits a re-basing adjustment if applicable." That re-basing trick (emit `winner.fixed_price - running_total` so the breakdown still sums correctly) is the cleanest way I found to keep the audit invariant.

- **Promo non-stacking.** First instinct was branching: "if not stacks_with_tier, skip the tier line." But the tier line is already emitted. So I emit a *compensating* promo line that cancels the tier — the audit trail shows what actually happened ("promo replaces tier discount: +$1.51"). That's better for finance than silently dropping the tier line.

## Key decisions

### Phase 1
- **Tier table extracted** as `Record<Tier, number>`. Trivial, but a senior tells you to keep magic numbers out of branches.
- **Throw on unknown SKU.** Silent zeros lose money.
- **Round at the boundary, 2dp, half-up (Math.round).** Documented in the file header.

### Phase 2
- **`asOf: Date` is a parameter, not `new Date()`.** Reproducibility for backdated invoices and dispute resolution.
- **Lowest active price wins on overlap.** Documented and justified at the rule. The alternative ("most recently effective") is defensible but harder to explain to a customer in a dispute: "your newer contract was actually higher" reads badly.
- **Inclusive date bounds.** `effective <= asOf <= expiry`. Half-open intervals would be more sound but the data is in days, not timestamps, so it doesn't matter here.

### Phase 3
- **Pipeline of rules, each emitting a `PriceLine`.** The breakdown IS the audit trail; unit_price is `sum(breakdown)`. They cannot drift.
- **Re-basing adjustments** for contract / volume / non-stacking-promo. Instead of "replace prior lines," each replacement emits a single signed delta that re-bases the running total. The list+tier history is preserved in the breakdown — finance can see "what tier *would* have given" even when a contract overrode it. That's strictly better for audit than `lines = [contractLine]`.
- **Contracts suppress volume breaks.** Hardcoded as "if any contract line exists, skip volume." Contracts are negotiated unit prices; volume on top of a hand-shake price would surprise both sides.
- **Promo % applies to list, not to running total.** Standard retail convention. "10% off" means 10% off ticket. Cascading percent-of-percent is a finance trap.
- **Promo data carries its own stacking flags** (`stacks_with_tier`, `excluded_if_under_contract`). Behavior on data, not in code. Adding a new promo doesn't require touching the pipeline.
- **Currency: floats, rounded per-line at the boundary.** Internally I do float math and only round to 2dp when constructing the final quote. I considered cents-as-integers internally — see tradeoffs.

## Tradeoffs

| Decision | Picked | Rejected | Cost of pick |
|---|---|---|---|
| Internal money representation | floats, round at boundary | integer cents end-to-end | Float roundoff is theoretically possible at 4-5 decimal places; harmless at 2dp for the values in scope. Integer cents is more correct but adds noise (constant `* 100` / `/ 100`) for a problem this size. |
| Overlap policy | lowest active price wins | most-recently-effective | "Newer contract" can be higher and reads as bad faith in disputes. Lowest is customer-friendly and easy to defend. Cost: ignores intent of a re-negotiation upward (rare, would be flagged anyway). |
| Pipeline shape | ordered list of rule functions | rules engine with priorities / a DAG | Order is a data file (the `RULES` array); priorities would need a sort and tie-breaks. Cost: adding a rule between two existing ones is "edit the array" — fine for 5 rules, would smell at 50. |
| Audit trail | re-basing deltas (every rule contributes; total = sum) | replace-prior (winner overwrites earlier lines) | Re-basing keeps full history in the breakdown — finance loves it. Cost: a contract line says `+$0.23` which looks weird without the description. The description compensates. |
| Contract + volume break interaction | volume suppressed under contract | volume on top of contract | Negotiated contract pricing is already specific. Stacking a generic discount on it is wrong absent explicit per-contract break tables. Cost: when contracts *do* carry break schedules (mentioned in phase 3 reveal), we'd hang it off the contract — not represented in this data. |
| Promo % base | applied to list price | applied to running total | "5% off" means 5% off ticket, both legally and conventionally. Cost: when a promo and tier both apply, the customer doesn't compound — but business already chose that via `stacks_with_tier`. |
| Non-stacking promo | emit compensating tier-cancel line | filter the tier line out | Audit shows what would-have-been. Cost: two `[promo]` lines in the breakdown for one promo, slightly busy. |

## Hardest decisions

### 1. Pipeline order and the contract-replaces-baseline question

Real tension: contract pricing isn't a "discount on top of list+tier" — it's a *replacement* baseline. So either (a) skip emitting tier when a contract applies, or (b) emit tier and have contract issue a re-basing adjustment.

I went with (b). Reason: the audit trail wins. Finance asks "what would Bayside have paid at tier?" and the answer is in the breakdown. With (a), that information is gone.

The cost: it makes the contract line look like a *positive* adjustment (e.g., `+$0.23`) when the contract is "more expensive than tier alone would have been" — counterintuitive on first read. The description ("Contract @ $3.20") covers it.

### 2. Where promo % gets applied (list vs running total)

Genuinely could go either way, business-rules-dependent. I picked list because retail "% off" almost always means off ticket, and because applying to running total compounds in surprising ways under stacking promos. But a procurement-flavored business might define promo as "% off whatever you would have paid" — that's also valid. I'd flag it explicitly to the interviewer.

### 3. Whether to refactor at phase 2 or wait for phase 3

When phase 2 landed, the obvious-and-tempting move is to refactor immediately into a rule pipeline because "more rules are surely coming." But that's exactly the YAGNI failure the brief warns against. Phase 2 alone is cleanly served by `findActiveContracts → pickWinner → fallback`. So I'd hold the line and only refactor when phase 3 actually invalidates the shape. The walkthrough explicitly rewards this restraint, but it's a real call — and a junior who guesses right by refactoring early would still score worse than a senior who reads the room.

## What I'd do with more time (YAGNI deferrals)

- **Persistence / DB.** None of this is wired to a real source. SKUs, contracts, promos, breaks — all in-memory. In production these would come from a feed with versioning. Out of scope.
- **Validation layer.** No checks that effective_date < expiry_date, that volume breaks are sorted, that percent_off is between 0 and 1. Real systems need this on ingest, not at query time.
- **Per-contract volume breaks.** Phase 3 reveal mentions contracts can carry their own break schedules. The current data doesn't have one, so the model doesn't either. The hook would be `Contract.breaks?: VolumeBreak[]` and a check in the volume rule.
- **Caching.** The discussion-prompt asks about 1000x/sec quote loads. Cache key would be `(sku, customer.tier, qty bucket, asOf truncated to day, active contract ids)`. The active-contract set is the hard part — invalidates the moment a contract starts/expires. Out of scope.
- **Currency / locale.** Hardcoded CAD, no FX, no localized rounding (some currencies don't use 2dp).
- **Observability / structured logging.** Each PriceLine could carry `rule_id` and `rule_version` for replay. The `source` enum is the start of that.
- **Tests.** No framework. The `if (sum !== unit_price) throw` in main() is the audit invariant in lieu of a test. In a real codebase I'd add ~15 cases covering each phase's edge: contract overlap, expired contract, promo blocked by contract, non-stacking promo, qty exactly at break threshold, qty=0.
- **Error type hierarchy.** A single `Error` thrown on unknown SKU is enough. No `PricingError extends Error` etc.
- **Quantity = 0 / negative.** Undefined behavior currently. Real system: validate at the boundary.
- **Date timezones.** Contract dates are at midnight UTC. Real ones would be in the customer's local TZ for "effective Jan 1" — out of scope here.
