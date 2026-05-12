# Order Lifecycle — Senior Developer Modeling Challenge

A 40-minute design-focused challenge run on **codeinterview.io**. The candidate models an order/fulfillment domain that grows through 3 phases: a simple order with line items, then partial shipments and backorders, then returns and price drift. Each phase invalidates assumptions from the prior phase. Focus: **how the candidate's primitives evolve** when fulfillment stops being atomic.

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
2. Interviewer reveals phase 2 verbally and pastes new requirements from `phases.md` (15 min).
3. Interviewer reveals phase 3 — usually discussion-only by this point (10 min).
4. Open design discussion (5 min).

The candidate is told up front that requirements will be added but **not** what they are.

## Pre-flight

```bash
cd candidate
npx ts-node starter.ts
```

Expected: prints sample order totals from the stub.

## Why this challenge works

Order lifecycle starts deceptively simple — an order is a list of lines, total is sum(qty × price) — and then atomicity breaks. The moment a line ships in two parts, mutability vs. immutability becomes a live question. The moment a return references a shipment from two weeks ago at a price that has since changed, "what is the order total?" stops being a function of the lines and starts being a projection over events. The strongest signal is whether the candidate **sees the primitive shifting** — line item → shipment → event — and adapts cleanly.
