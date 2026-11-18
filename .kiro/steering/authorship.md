# Authorship and Division of Labor

## What the developer decides

The developer decides the decay rules: every formula, threshold and limit is set in the specs (for example weak 60 / dead 10, half-life 1-180 days). **Kiro never writes decay-rule code.** The code for them is written by the developer, or by Claude Code when the developer asks; every such case is listed under "What Claude Code wrote" below. The rules cover:

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
- The property-test generators and all engine property tests (`tests/generators.ts`, `tests/properties/`, tasks 27-35) and the boundary test (`tests/unit/boundary.test.ts`, task 32.3), run in parallel with Kiro to save time.
- **Triage selection** (`src/triage.ts`, task 21): implements the locked value rule from `product.md` with an exact 0/1 knapsack. Originally planned as hand-written; the developer chose to have Claude Code write it.
- **Autopsy analysis** (`src/autopsy.ts`, task 22): a facts-only report read from the history log. Originally planned as hand-written; the developer chose to have Claude Code write it. Each app still writes its own cause-of-death sentences from the report.
- **Study Dungeon decay policy** (`apps/study-dungeon/src/policy.ts`, Study Dungeon task 2.1): the five policy functions and the 1-180 day half-life clamp, exactly as in the Study Dungeon spec. Originally planned as hand-written; the developer chose to have Claude Code write it. Its tests (tasks 2.2 and 2.3) are Kiro's.
- **Study Dungeon cause-of-death sentences** (`apps/study-dungeon/src/autopsy-sentences.ts`, Study Dungeon task 10.1): turns the engine's autopsy report into the sentences shown in the autopsy dialog. Originally planned as hand-written; the developer chose to have Claude Code write it. Its tests (task 10.2) and the dialog (task 10.3) are Kiro's.

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

