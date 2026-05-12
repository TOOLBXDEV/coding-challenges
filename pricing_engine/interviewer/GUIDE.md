# Interviewer Guide — Pricing Engine

**Total time:** 40 minutes. **Format:** codeinterview.io, screen-shared, TypeScript starter.

This is a **modeling** challenge, not an algorithm challenge. The signal is in **how the candidate evolves their abstractions** as you reveal new requirements that invalidate prior assumptions. A senior should produce a clean phase-1 implementation, then refactor (not patch) as phase 2 and phase 3 land.

The candidate has been told there will be 2-3 stages but **not** what the stages contain. Resist the urge to preview them.

---

## Time budget

| Min | Phase | What you're listening for |
|---|---|---|
| 0-3 | Reads INSTRUCTIONS, looks at starter | Do they ask questions before coding? |
| 3-12 | Phase 1 (implement) | Clean types, simple impl. Should not take more than 10 min. If they spend 15 min on this, that's a yellow flag. |
| 12-13 | Reveal phase 2 (verbally + paste data from `phases.md`) | Watch the *reaction*: do they refactor or patch on top? |
| 13-27 | Phase 2 implementation + discussion | This is the bulk of the signal. |
| 27-28 | Reveal phase 3 (often discussion-only) | Do they sketch the right shape verbally even if no time to code? |
| 28-37 | Phase 3 — code or design discussion | |
| 37-40 | Wrap, prompts from below | |

If a candidate is slow on phase 1, **gently unblock**. The interesting part is phase 2.

---

## What each phase tests

### Phase 1 — list price + tier discount

Trivial. Looks like:

```ts
function getPrice(sku, customer) {
  const list = LIST_PRICES[sku];
  const discount = { GOLD: 0.15, SILVER: 0.08, BRONZE: 0 }[customer.tier];
  return list * (1 - discount);
}
```

What you're watching for:
- Did they ask "what if SKU not found?" / "what if tier is unknown?" before coding?
- Did they pull the discount table out as a constant or hard-code it inline?
- Did they think about rounding? (Most defensible: round to 2 decimals at the boundary, keep math in cents internally — but for phase 1 alone, don't push.)

A candidate who over-engineers phase 1 (builds a rules engine for a 5-line problem) is a **yellow flag**. The candidate doesn't yet know phase 2 is coming and "preparing for the future" is exactly the YAGNI failure we want to see them avoid.

### Phase 2 — time-bounded contract pricing

You reveal: *"Now we have **contracts** — a customer-specific, SKU-specific fixed price that overrides the tier discount, but only between the contract's effective and expiry dates. Some customers have multiple contracts on the same SKU with overlapping windows. The function now needs to take an `asOf` date — what price applies on this date?"*

Paste the contract data from `phases.md`.

**Strong responses:**
- Asks: *"If two contracts overlap, which wins?"* — good. There's no canonical answer; common policies are most-specific, lowest-price, or most-recently-effective. They should **pick one and justify it**.
- Asks: *"What if `asOf` is before any contract — fall back to tier?"* — good.
- Recognizes that the prior `getPrice(sku, customer)` shape is wrong and changes the signature explicitly, rather than overloading.
- Separates "find applicable contracts" from "resolve a price from candidates" — one function, two concerns.

**Weak responses:**
- Adds an `if (contracts[customer.id]?.[sku])` block at the top and moves on.
- Stores contracts in a flat dict keyed `${customer}:${sku}` — works for one contract per pair but breaks the moment you mention multiple overlapping contracts.
- Doesn't notice that `asOf` is needed and tries to use `new Date()` everywhere (breaks reproducibility, breaks backdated invoices).

### Phase 3 — volume breaks + promo stacking + auditability

You reveal (in any combination — pick what time allows):
1. **Volume breaks** — the contract or list price has tiered breakpoints: e.g., 1-99 units at $X, 100-499 at $Y, 500+ at $Z.
2. **Promos** — a SKU-level, time-bounded percent discount. Some promos stack with tier; others don't (`stacks_with_tier: boolean`).
3. **Auditability** — the function should now return a `PriceQuote` with a `breakdown` showing each adjustment and its source. *"A customer disputes a price six months later. Can you reconstruct what happened?"*

Paste the data from `phases.md`. By this point you may run out of code time — that's fine; let them sketch.

**Strong responses:**
- The branchy code from phase 2 stops working; they refactor toward a **rule pipeline** or **resolver chain**: a list of "price layers" each producing a candidate adjustment, with a resolution policy (compose / first-match / lowest-wins).
- Recognizes that "breakdown" requires every layer to record its contribution — the `PriceQuote` is naturally a list of line items, not a single number.
- Articulates why volume breaks aren't just "another discount layer" — they depend on quantity, so the function signature changes again.

**Weak responses:**
- Adds three more `if` blocks. Code becomes unreadable. They don't see the smell.
- Stacks discounts multiplicatively without thinking about whether that's the business rule.
- Returns a number; doesn't volunteer the breakdown until you ask.

---

## Rubric (1-4 per dimension)

| # | Dimension | 1 = miss | 4 = strong |
|---|---|---|---|
| 1 | **Phase 1 restraint** | Builds a rules engine for a 5-line problem | Ships a clean, simple implementation |
| 2 | **Reaction to phase 2** | Patches on top, signature stays | Recognizes the model is wrong and refactors with intent |
| 3 | **Resolution policy** | Implicit / undefined when contracts overlap | Asks, picks, defends |
| 4 | **Time / `asOf` handling** | Uses `new Date()` implicitly | Threads `asOf` through; thinks about reproducibility |
| 5 | **Phase 3 abstraction** | More if-statements | Rule list / pipeline / resolver — data-driven |
| 6 | **Auditability** | Returns a number when asked for breakdown | Volunteers a breakdown structure or arrives at it cleanly |
| 7 | **Type quality** | Stringly-typed; `any` everywhere | Discriminated unions for rules, narrow types for tiers/sources |
| 8 | **Communication** | Silent or hand-wavy | Names tradeoffs out loud, decides crisply |

**Hire signal:** strong on #2 (refactor reaction) and #5 (phase 3 abstraction) plus 3+ on most others.

---

## Discussion prompts (last 3-5 min)

Pick 1-2.

- *"A customer disputes a price six months later — can your system reconstruct what they were quoted on day X?"* (Probes: audit log, immutable data, time-as-first-class)
- *"Marketing wants to upload 50,000 promo overrides via CSV nightly. Does your model accept that gracefully, or does it explode?"* (Probes: data-driven rules, validation boundaries)
- *"The same lookup runs 1000x/sec from quote pages. What's expensive in your current shape, and what would you cache?"* (Probes: cost model, identity vs equality, cache key design)
- *"Quote price was \$10. Order ships next month at a list price of \$12. Which price applies, and where does that policy live?"* (Probes: price-as-of-quote-date, policy locality, stale data)

---

## Anti-patterns to flag

- Builds a 200-line rules framework in phase 1 — bad YAGNI signal.
- Phase 2 lands and they paste a new `if` instead of refactoring — they're not seeing the model break.
- Returns `number` after you explicitly ask about audit/breakdown — not listening.
- Doesn't ask about overlapping contracts — accepting ambiguity instead of surfacing it.
- Hard-codes "GOLD = 0.15" in a function body in phase 3 (the data should be a table).
- Spends >12 min on phase 1.
