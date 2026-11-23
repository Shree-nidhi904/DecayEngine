# Implementation Plan: @decay-engine/insight (task E1)

## Overview

A new package `packages/insight` with `replay`, `whatIf` and `deathTime`, built only on the engine's public API. Nothing under `packages/engine/`, `packages/shell/` or `apps/` changes. If a task seems to need an engine change, stop and report it (`engine-boundary.md`).

Commands follow `.kiro/steering/shell-commands.md`: one command per call, long output to a file under `/tmp`, long runs in the background with `nohup`, stop after two identical failures. If Kiro's shell cannot run them, the developer runs the checkpoint tasks in WSL.

Every test follows `no-fake-tests.md`: no caught errors to pass, no lowered `numRuns`, no expected values changed to match output. If a property fails, fix the code, or stop and report if the property looks wrong.

**Status (build session, no commands run):** tasks 1 to 10 are written but not yet run. Task 11 is the developer's. Task 12 is open: the log entry could not be saved (two "Failed to save" errors).

## Tasks

- [x] 1. Package skeleton
  - [x] 1.1 Create `packages/insight/package.json` and `packages/insight/tsconfig.json` exactly as design section 2.1 (copied from `packages/shell`, with the listed differences)
    - `@decay-engine/engine` `workspace:*` under `dependencies`; devDependencies `@types/node`, `fast-check`, `typescript`, `vitest` at the versions in the design
    - One line for `packages/insight/` added to `.kiro/steering/structure.md` (open question 6, decided)
    - _Requirements: 1.1, 1.6_
  - [x] 1.2 Create `src/index.ts` with the exports of design section 3 and `src/types.ts` with the types and `DEATH_TIME_PRECISION_MS` of section 3.2
    - _Requirements: 1.1, 8.3, 9.3_
  - [x] 1.3 Create `src/boundary.test.ts` as design section 7.6
    - The maths check strips comments first (JSDoc openers contain `**`), with a self-test that it still finds `**` and `Math.` in code
    - _Requirements: 1.2, 1.3, 1.4, 5.7_

- [x] 2. Test policies and fixtures
  - [x] 2.1 Create `src/test/fixtures.ts` (`T0 = 1_793_491_200_000`, `MINUTE`, `DAY`, `ITEM_ID = "item-1"`) and `src/test/policies.ts` with the five policies in design section 7.1
  - [x] 2.2 Create `src/test/policies.test.ts`: each policy passes `checkPolicy` (`{ passed: true, failures: [] }`); hand-worked values: `expPolicy` health 50 after 3 days from 100, `linearPolicy` 79 after 3 days, `crammingPolicy` 65 for a review 0.5 days after the last one
    - _Requirements: correctness properties (test policies)_

- [x] 3. deathTime
  - [x] 3.1 Create `src/death-time.ts` as Requirement 5: `history`, then `view(from)` (dead → `diedAt`), else the item's `forecast(from, horizonMs)` entry or `null`
  - [x] 3.2 Create `src/death-time.test.ts` as design section 7.5
    - _Requirements: 5.1 to 5.7_

- [x] 4. replay
  - [x] 4.1 Create `src/internal.ts` (`jsonCopy`, `checkHistory`, `checkTime`, `startReplay`, `step`) as design section 4.1, catching only the named `DecayEngineError` codes around the one call that raises them
    - Also `checkHorizon`, `replayRange` and `viewItem`, shared by replay and whatIf
    - _Requirements: 2.1, 2.2, 3.5, 3.6, 8.2_
  - [x] 4.2 Create `src/replay.ts` as design section 4.2
    - _Requirements: 2, 3, 4_
  - [x] 4.3 Create `src/replay.test.ts` as design section 7.5, including the L1 outcome test with `payloadHalfLifePolicy` and the `throwingPolicy` test
    - _Requirements: 2, 3, 4, 8, L1, L3, L7_

- [x] 5. Scenario generator
  - [x] 5.1 Create `src/test/scenario.ts` (`scenarioArb`, `runScenario`) as design section 7.2. The generator reads `view(t)` to choose tend or resurrect; it never catches an engine error
  - [x] 5.2 Create `src/test/scenario.coverage.test.ts` with the shares in design section 7.3. If a share fails, change the generator mix, never the threshold

- [x] 6. replay properties
  - [x] 6.1 Create `src/replay.property.test.ts`: P-A, P-B (replay) and P-E (replay results), `{ numRuns: 100 }` or more each
    - _Requirements: correctness properties P-A, P-B, P-E; 9.1 to 9.3_

- [x] 7. whatIf
  - [x] 7.1 Create `src/what-if.ts` as design section 5.1, reusing `internal.ts` and `deathTime`
    - _Requirements: 6, 7, 8_
  - [x] 7.2 Create `src/what-if.test.ts` as design section 7.5, including the `crammingPolicy` table (design section 6.3) and every `WhatIfReason`
    - _Requirements: 6, 7, 9.6_

- [x] 8. whatIf properties
  - [x] 8.1 Create `src/what-if.property.test.ts`: P-B (whatIf), P-C1, P-C2, P-C3, P-D and P-E (whatIf results), with the `at` generators of design section 7.4 and the 20% P-C2 branch check, `{ numRuns: 100 }` or more each
    - _Requirements: correctness properties P-B to P-E_

- [x] 9. README
  - [x] 9.1 Create `packages/insight/README.md` as design section 9, with the "What the engine does not record" section (L1 to L7)
    - _Requirements: 10.1 to 10.4_

- [x] 10. One-command check
  - [x] 10.1 In `scripts/check.sh` (Claude Code's file, named by this task), add `step "typecheck insight"  pnpm --filter @decay-engine/insight typecheck` and `step "test insight"       pnpm --filter @decay-engine/insight test` after "build ghosted" and before "landing page" (the developer's placement); add both to the header comment's step list with the line "The two Insight steps were added by Kiro (task E1)". No other line changes
    - _Requirements: 11.1 to 11.3_

- [x] 11. Checkpoint
  - [x] 11.1 `pnpm install > /tmp/e1-install.log 2>&1; echo EXIT $? >> /tmp/e1-install.log` (links the package and updates `pnpm-lock.yaml`)
  - [x] 11.2 `pnpm --filter @decay-engine/insight typecheck > /tmp/e1-typecheck.log 2>&1; echo EXIT $? >> /tmp/e1-typecheck.log`
  - [x] 11.3 `pnpm --filter @decay-engine/insight test > /tmp/e1-test.log 2>&1; echo EXIT $? >> /tmp/e1-test.log`, in the background with `nohup`
  - [x] 11.4 `bash scripts/check-engine-unchanged.sh` exits 0, with the same engine line as before E1
  - [x] 11.5 `bash scripts/check.sh` in the background: every step passes, the engine, shell, Study Dungeon and Ghosted test counts are unchanged, and "test insight" reports its count
    - _Requirements: 1.5, 11_

- [x] 12. Log
  - [x] 12.1 Add a session to `docs/KIRO_LOG.md` for the build, in the existing format
    - Done by Claude Code (Kiro's save failed twice, so the entry text was pasted in).  Original note: the edit failed to save twice ("Internal error: Failed to save"). The entry is Session 64 (the log ends at Session 63)
    - _Requirements: 12_
