# Inventory ATP — Senior Developer Modeling Challenge

A 40-minute design-focused challenge run on **codeinterview.io**. The candidate models an inventory availability ("Available To Promise") system that grows through 3 phases: a single-yard quantity lookup, then multi-yard with commitments and incoming POs, then substitutions and kits. Each phase invalidates assumptions from the prior phase. Focus: **how the candidate's primitives evolve** from a flat number to a per-yard projection to a graph traversal.

## Layout

```
candidate/                  ← what the candidate sees during the interview
  INSTRUCTIONS.md           - phase 1 problem brief
  starter.ts                - phase 1 data + minimal scaffold
  tsconfig.json

interviewer/                ← do not share with candidate
  GUIDE.md                  - time budget, rubric, anti-patterns, discussion prompts
  walkthrough.md            - how a strong senior evolves the model phase by phase
  phases.md                 - phase 2 & 3 reveal scripts + paste-in data
```

## How it runs

1. Candidate gets `INSTRUCTIONS.md` and `starter.ts`. They build phase 1 (10 min).
2. Interviewer reveals phase 2 verbally and pastes new data from `phases.md` (15 min).
3. Interviewer reveals phase 3 — usually discussion-only by this point (10 min).
4. Open design discussion (5 min).

## Pre-flight

```bash
cd candidate
npx ts-node starter.ts
```

Expected: prints sample availability lookups using the stub.

## Why this challenge works

Phase 1 is a hashtable lookup — every senior nails it. Phase 2 introduces three new dimensions simultaneously (location, commitment, time) and forces the candidate to decide what "available" even means. Phase 3 introduces composition (kits) and equivalence (substitutions) — two distinct relationship types that juniors conflate. The strongest signal: does the candidate keep these concepts cleanly separated, and does their ATP function become recursive without becoming spaghetti?
