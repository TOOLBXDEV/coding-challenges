# Pricing Engine — Senior Developer Modeling Challenge

A 40-minute design-focused challenge run on **codeinterview.io**. The candidate models a pricing system that grows through 3 phases of new requirements — each phase invalidates assumptions from the prior phase. Focus: **how the candidate evolves their abstractions** under changing requirements, not whether they catch every edge case.

## Layout

```
candidate/                  ← what the candidate sees during the interview
  INSTRUCTIONS.md           - phase 1 problem brief
  starter.ts                - phase 1 data + function signature stub
  tsconfig.json

interviewer/                ← do not share with candidate
  GUIDE.md                  - time budget, rubric, anti-patterns, discussion prompts
  walkthrough.md            - how a strong senior evolves the model phase by phase
  phases.md                 - phase 2 & 3 reveal scripts + paste-in data snippets
```

## How it runs

1. Candidate gets `INSTRUCTIONS.md` and `starter.ts`. They build phase 1 (10 min).
2. Interviewer reveals phase 2 verbally and pastes new data from `phases.md` (15 min).
3. Interviewer reveals phase 3 — usually discussion-only by this point (10 min).
4. Open design discussion (5 min).

The candidate is told up front that requirements will be added — but **not** what they are. The point is to test their judgment about what to over-engineer vs. defer.

## Pre-flight

```bash
cd candidate
npx ts-node starter.ts
```

Expected: prints phase 1 sample lookups with the stub returning `0`.

## Why this challenge works

Pricing is the canonical "looks simple, isn't" domain. Each phase genuinely breaks the prior model:
- **Phase 1** (list price + tier) → flat dict works fine.
- **Phase 2** (time-bounded contracts) → the dict is wrong; you need a resolution policy with effective dates.
- **Phase 3** (volume breaks + promo stacking with auditability) → branchy code becomes unmaintainable; you need a rules pipeline with a price-breakdown.

A junior typically hard-codes phase 1, then pastes phase 2 logic on top, then drowns in phase 3. A senior either anticipates extension points lightly (without over-engineering) or refactors cleanly when the requirement arrives.
