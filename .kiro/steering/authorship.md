# Authorship and Division of Labor

## What the developer writes (hand-written)

The decay rules are **never generated**. They are the developer's creative work:

1. **Decay rules**: The policy functions that define how an item decays and comes back:
   - `thresholds: { weak: number; dead: number }`
   - `init(payload, now)` → policyData
   - `healthAt(item, now)` → number (0-100)
   - `applyEvent(item, event, now)` → { health, policyData }
   - `nextDueAt(item, now)` → timestamp | null
   - `resurrect(item, event, now)` → { ok: true, ... } | { ok: false, reason } (synchronous)

## What Claude Code wrote

Claude Code ran in WSL alongside Kiro, because Kiro's shell could not run commands on this setup. Besides running every test, it wrote:

- The `DecayEngine` class (`src/engine.ts`, tasks 9-19) and its tests.
- **Triage selection** (`src/triage.ts`, task 21): implements the locked value rule from `product.md` with an exact 0/1 knapsack. Originally planned as hand-written; the developer chose to have Claude Code write it.
- **Autopsy analysis** (`src/autopsy.ts`, task 22): a facts-only report read from the history log. Originally planned as hand-written; the developer chose to have Claude Code write it. Each app still writes its own cause-of-death sentences from the report.

Do not rewrite these files; change them only through a task that names them.

## What Kiro writes (generated)

Kiro is used for:

- The engine modules not listed above (types, errors, state derivation, settle, bisection, serialization, storage adapters, checkPolicy, forecast)
- UI components and layout
- App glue code (connecting the engine to React)
- Tests (unit tests and property-based tests)
- Styling and CSS
- Sample data generation

## Kiro usage log

Every Kiro contribution is logged in `docs/KIRO_LOG.md` using the session format already established in that file. Each session records:

- Goal
- Kiro feature used
- What Kiro produced
- What was changed by hand
- What went wrong or surprised
- Credits used
- Screenshot file names

This log is part of the Kiroween submission and demonstrates how the IDE was used.

