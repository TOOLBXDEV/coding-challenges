# Interviewer Guide — Inventory ATP

**Total time:** 40 minutes. **Format:** codeinterview.io, screen-shared, TypeScript starter.

This is a **modeling** challenge. Phase 1 is a hash-table lookup. Phase 2 introduces three new dimensions at once (location, commitment, time) and forces the candidate to define what "available" means. Phase 3 introduces composition (kits) and equivalence (substitutions) — two distinct relationships that juniors conflate.

The candidate has been told there will be 2-3 stages but **not** what the stages contain. Don't preview them.

---

## Time budget

| Min | Phase | What you're listening for |
|---|---|---|
| 0-3 | Reads INSTRUCTIONS, looks at starter | Do they ask any clarifying questions? |
| 3-10 | Phase 1 (implement) | Should be 5 min max. If they take longer, they're over-thinking. |
| 10-11 | Reveal phase 2 (verbally + paste data from `phases.md`) | Watch the *reaction*. |
| 11-27 | Phase 2 implementation + design conversation | Bulk of the signal. |
| 27-28 | Reveal phase 3 (often discussion-only) | Can they sketch the right shape verbally? |
| 28-37 | Phase 3 — code or design discussion | |
| 37-40 | Wrap, prompts from below | |

---

## What each phase tests

### Phase 1 — single yard, on-hand only

Trivial. Looks like:

```ts
function availableQty(sku) {
  return ON_HAND[sku] ?? 0;
}
```

What you're watching for:
- Did they handle unknown SKU? `?? 0` vs throwing vs returning `null` — any defensible choice.
- Did they over-design? Building `Inventory` types and a class hierarchy for a 5-line problem is a yellow flag.
- Did they ask "what does available mean?" — there's only one definition in phase 1, but the question itself is a senior signal.

### Phase 2 — multi-yard + commitments + on_PO

You reveal: *"Real inventory has more dimensions. We have multiple yards. At each yard, the SKU has on-hand qty, **committed** qty (allocated to open orders), and **on-PO** qty (incoming, with an ETA). Available-to-Promise typically = on_hand − committed + on_PO (where on_PO arrives before our promise date). Also: customers shop at a specific yard, but we may be able to fulfill from another."*

Paste the data from `phases.md`.

The candidate now has to make several decisions:
- **What does "available" mean?** Physical (on-hand minus committed)? Sellable (including future incoming)? Deliverable (yard-aware)?
- **Per-yard or aggregate?** The function probably needs `yard?` and maybe `asOf?` parameters now.
- **Time component on on_PO** — only count incoming if it arrives by some promise date.

**Strong responses:**
- Asks: *"What's the use case — am I quoting today, am I promising delivery in two weeks, am I checking the website?"* Different answers want different ATP definitions.
- Recognizes that the prior signature `availableQty(sku)` is wrong. Either changes it explicitly, or returns a richer shape (`{ on_hand, committed, on_po, atp }`).
- Treats yard locality as a **separate concern** from raw availability — doesn't bake "can I source from another yard" into the math; it's a transfer policy on top.
- Explicit about whether on_PO with a future ETA counts (depends on `asOf`).

**Weak responses:**
- Adds a `yard` field but keeps everything else the same; doesn't account for committed.
- Sums on_hand across yards and calls it the answer — loses locality.
- Includes all on_PO unconditionally — promises stock that won't arrive in time.
- Doesn't ask what "available" means; picks one definition silently.

### Phase 3 — substitutions + kits

Reveal both, or one if time-constrained:

#### Substitutions
*"For some customers, certain SKUs are substitutable for others — a 2x4x8 SPF can substitute for a 2x4x8 Hem-Fir. The substitution rules are sometimes customer-specific (negotiated). When we report 'available', should we include substitutes? The answer is 'sometimes' — depending on the caller and the customer."*

#### Kits
*"We sell kits — a 'deck kit' SKU is composed of N joists + M decking boards + fasteners. We don't physically stock the kit; selling 1 kit consumes the components. Available-qty for a kit is determined by the bottleneck component. Components might themselves have substitutes."*

Paste the data from `phases.md`.

**Strong responses:**
- Distinguishes **composition** (kit-of-components) from **equivalence** (sub-rules) — different relationships, different graphs.
- Kit availability = `min(component_avail / component_qty)` floor — and they articulate that out loud.
- Substitution is a strategy / option, not a fact. The function signature gains a `customer?` or an `include_subs?` flag — they don't bake it into the data.
- Recognizes the recursion: a kit's component might itself be a kit, or have a substitute. They flag the cycle/depth concern even if they don't implement it.
- Names the structural difference: kits are **trees** (composed downward); subs are a **graph** (sideways equivalence).

**Weak responses:**
- Treats subs as "extra inventory pooled with the original SKU." Loses the customer-conditionality.
- Computes kit availability with a `for` loop that does the right math but doesn't recognize it could be recursive.
- Adds `is_kit: true` and a `components` field but the function still loops linearly with no thought to nesting.

---

## Rubric (1-4 per dimension)

| # | Dimension | 1 = miss | 4 = strong |
|---|---|---|---|
| 1 | **Phase 1 restraint** | Builds inventory class hierarchy for `Map.get` | Ships a one-liner, moves on |
| 2 | **"Available" semantics** | Picks a definition silently | Asks what use case, picks deliberately, can articulate |
| 3 | **Yard locality** | Bakes transfer policy into ATP math | Keeps locality separate; per-yard ATP is a primitive, transfers compose on top |
| 4 | **Time / on_PO handling** | Counts all incoming unconditionally | Filters on_PO by `asOf` / promise date |
| 5 | **Composition vs equivalence** | Conflates subs and kits | Models them separately as different relationships |
| 6 | **Kit math** | Linear loop, no insight | `min(component_avail / qty_per_kit)`, articulated |
| 7 | **Recursion awareness** | Doesn't notice components could nest | Flags depth / cycles, even if doesn't implement |
| 8 | **Communication** | Silent or hand-wavy | Names every modeling choice and the alternative they rejected |

**Hire signal:** strong on #2 (semantics) and #5 (composition vs equivalence) plus 3+ on most others.

---

## Discussion prompts (last 3-5 min)

Pick 1-2.

- *"Two orders try to commit the last unit at the same time. What happens?"* (Probes: concurrency, optimistic locking, atomic decrement)
- *"This function gets called 1000x/sec from the website but inventory only changes 10x/sec. Where would you cache?"* (Probes: read/write asymmetry, cache key design, invalidation)
- *"There's a separate system that **commits** inventory when orders are placed. Should it share code with your ATP function?"* (Probes: read vs. write paths, double-decrement bugs, source of truth)
- *"Our biggest customer wants real-time availability across our 12 yards plus our 3 vendors' yards. What changes?"* (Probes: federation, latency, staleness tolerance, fallback)

---

## Anti-patterns to flag

- Builds yards/commits/POs into phase 1 — over-engineering.
- Phase 2 lands and they **sum on_hand across all yards**, losing locality. Common junior pattern.
- Doesn't filter on_PO by ETA — promises stock that won't arrive in time.
- Phase 3 lands and they store substitution targets in the same `Inventory[]` array as primary stock, conflating identity.
- Kit math without articulating the bottleneck principle — they got the right number for the wrong reason.
- Recursive structures with no depth limit / cycle handling — kit's component is a kit is a kit.
- Spends >10 min on phase 1.
