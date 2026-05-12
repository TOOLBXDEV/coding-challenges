# TOOLBX Senior Engineer Coding Challenges

A small library of 40-minute coding challenges for senior backend hires at TOOLBX (LBM ERP integration). Each challenge is designed to surface **design judgment** — model evolution, abstraction choices, tradeoffs — rather than algorithmic ability.

All three challenges run on **codeinterview.io** with a TypeScript starter (any language allowed). Each is delivered to the candidate in 2-3 phases of new requirements that progressively invalidate earlier assumptions, forcing the candidate to refactor rather than merely add code.

## Layout

```
pricing_engine/      list price + tier  →  time-bounded contracts  →  volume breaks + promo stacking + audit
order_lifecycle/     order + lines      →  partial shipments + backorders  →  returns + price drift
inventory_atp/       on-hand lookup     →  multi-yard + commits + on_PO  →  substitutions + kits
```

Each challenge folder contains:

```
candidate/              ← what the candidate sees during the interview
  INSTRUCTIONS.md       - phase 1 problem brief
  starter.ts            - phase 1 data + scaffold (CSVs/data embedded)
  tsconfig.json

interviewer/            ← do not share with candidate
  GUIDE.md              - time budget, rubric, anti-patterns, discussion prompts
  walkthrough.md        - how a strong senior evolves the model phase by phase
  phases.md             - phase 2 & 3 reveal scripts + paste-in data snippets

sample_solution/        ← reference / calibration aid
  solution.ts           - runnable post-phase-3 reference solution
  NOTES.md              - design journal: process, decisions, tradeoffs, YAGNI deferrals
  tsconfig.json
```

## How a session runs

1. Candidate gets `candidate/INSTRUCTIONS.md` + `candidate/starter.ts`. They build phase 1 (~10 min).
2. Interviewer reveals phase 2 **verbally** and pastes new data from `interviewer/phases.md` (~15 min).
3. Interviewer reveals phase 3 — usually discussion-only by this point (~10 min).
4. Open design discussion (5 min).

The candidate is told up front that requirements will be added but **not** what they are. The point is to test their judgment about what to defer vs. anticipate. Over-engineering phase 1 is itself a flagged senior anti-pattern.

## Pre-flight (interviewer)

Before the session:

```bash
cd <challenge>/candidate
npx ts-node starter.ts
```

Confirm the scaffold compiles and prints the expected phase-1 driver output. Then skim `interviewer/GUIDE.md` and `interviewer/walkthrough.md` (~10 min total) to internalize the rubric.

The `sample_solution/` is calibration: run `npx ts-node solution.ts` inside it to see the post-phase-3 reference. Read `NOTES.md` to align on what a strong senior would defend.

---

## Per-challenge review

### pricing_engine — list price + tier → contracts → volume + promo + audit

**Pros**

- Most universal — every senior has touched pricing/discount/promo logic.
- Phase 2 → 3 is the cleanest YAGNI test in the set: phase 1 over-engineering is a clear red flag, phase 3 over-extending is rewarded. Few challenges grade restraint this cleanly.
- Audit invariant (`sum(breakdown) === unit_price`) gives the interviewer a concrete probe.
- Final shape (rule pipeline) is broadly recognizable senior architecture.

**Cons**

- Pricing-engine is a known interview shape — prepped candidates may have rehearsed.
- The "refactor at phase 2 vs. wait for phase 3" call is genuinely 50/50 in real engineering, but the rubric rewards waiting; risk of grading taste as skill.
- LBM flavor is thin (could be any B2B SaaS); doesn't differentiate TOOLBX-fit candidates.
- 40 min is tight for 3 phases + discussion; phase 3 is often discussion-only.

**Best fit:** broad senior screen, any backend role. Most evergreen of the three.

---

### order_lifecycle — order + lines → partial shipments + backorders → returns + price drift

**Pros**

- Phase 2's *mutate-the-line* vs. *introduce-Shipment* decision is a single moment that tells you a lot — clear binary senior tell.
- Phase 3's "Return references Shipment, not OrderLine" is a hard-to-fake mid-vs-senior distinguisher.
- Solution naturally arrives at event-sourcing-shaped code without requiring it — strong candidates name the shape verbally without building it.
- Highest LBM domain fit (B2B partial truck delivery, returns at original price, monthly invoicing).

**Cons**

- The phase-2 decision is somewhat binary; candidates who pick wrong rarely recover, making phase 3 wasted time.
- Phase 3 often discussion-only; less concrete code to grade than pricing.
- Walkthrough leans on event-sourcing language — interviewers who haven't lived event-sourcing may grade inconsistently.

**Best fit:** TOOLBX-shaped roles — order, fulfillment, billing systems. Tests entity-modeling and immutability instinct.

---

### inventory_atp — on-hand lookup → multi-yard + commits + on_PO → subs + kits

**Pros**

- Phase 2's *"what does 'available' actually mean?"* is the sharpest senior-prompt in the set — a senior pauses and asks; a junior codes.
- Phase 3's composition (kits) vs. equivalence (substitutions) distinction is a hard architectural call to fake.
- Tests recursion + cycle-guard naturally; tests options-bag-vs-positional API design.
- Phase 1 is the most trivial of the three (one-liner), giving the cleanest YAGNI test.

**Cons**

- Heaviest LBM dependency — penalizes candidates from unrelated industries the most.
- Phase 1 is so trivial it can feel awkward — a candidate finishing in 90 seconds creates pacing pressure.
- Phase 2 introduces three dimensions at once (yard, commit, time); risk of overwhelm vs. signal.
- Phase 3 has two distinct new concepts; weaker candidates often get one right and conflate the other, making grading mushy.

**Best fit:** roles that will own inventory/availability/allocation specifically.

---

## Comparison

| Axis | pricing_engine | order_lifecycle | inventory_atp |
|---|---|---|---|
| Interviewer skill required | medium | medium | medium |
| LBM domain dependence | low | high | very high |
| Resistance to rehearsal | low-medium | medium | high |
| Phase-1 YAGNI test sharpness | high | high | very high |
| Cross-role reusability | very high | medium | low |
| Risk of "wrong-answer-grading" | medium | low | low |
| 40-min fit | tight (phase 3 often discussion) | tight (phase 3 often discussion) | comfortable |

---

## Recommendations

For the typical TOOLBX hiring loop:

1. **First-round technical screen → `pricing_engine`.** Most universal, lowest LBM gate, sharpest YAGNI test, broadest applicability across roles. Use it 80% of the time.
2. **On-site / loop second technical → `order_lifecycle`.** Highest TOOLBX domain fit. The Shipment-as-noun moment in phase 2 is the single best senior tell across all three challenges.
3. **For inventory/availability ownership specifically → `inventory_atp`.** Use when the role will literally own ATP/allocation. Otherwise its domain dependence eats signal.

**Don't run two of these to the same candidate** — they share design philosophy (immutability, append-only, derived-state, data-driven rules); the candidate will see patterns and the second result loses signal.

**If forced to pick one challenge for all hires:** `pricing_engine`. Domain-neutral, evergreen, sharpest YAGNI calibration, easiest interviewer training.

**If forced to pick one for senior-engineer + LBM-domain combined fit:** `order_lifecycle`. The Shipment-noun moment is decisive in seconds, and the phase-3 event-projection shape is exactly what TOOLBX engineers actually build.

---

## Design philosophy (shared across all three)

All three challenges are built around the same hiring thesis:

- **Senior judgment is the willingness to ask before coding.** Each challenge has at least one ambiguity in the brief that a strong candidate surfaces explicitly. Silence is a yellow flag.
- **YAGNI is testable.** The phased reveal punishes candidates who over-architect for stages they haven't seen — and rewards those who refactor cleanly when the rug pulls.
- **Domain primitives shift under new requirements.** Each phase invalidates a phase-1 assumption (flat dict, mutable line, single number). The senior tell is *recognizing the shift*, not just executing the refactor.
- **Auditability is a quality bar.** Each solution converges on something a non-engineer could verify (breakdown sums to unit_price; net = shipped − refunded; ATP per yard sums to aggregate). Senior architecture is honest about its own state.

Interviewers should grade on **how the candidate evolves their model**, not on whether the final code matches the reference. There are defensible alternatives at almost every decision point — `walkthrough.md` and `NOTES.md` for each challenge enumerate them.
