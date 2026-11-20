# Authorship and Division of Labor

## What the developer decides

The developer decides the decay rules: every formula, threshold and limit is set in the specs (for example weak 60 / dead 10, half-life 1-180 days). **Kiro never writes decay-rule code.** The code for them is written by the developer; every such case is listed under "What the developer wrote" below. The rules cover:

1. **Decay rules**: The policy functions that define how an item decays and comes back:
   - `thresholds: { weak: number; dead: number }`
   - `init(payload, now)` → policyData
   - `healthAt(item, now)` → number (0-100)
   - `applyEvent(item, event, now)` → { health, policyData }
   - `nextDueAt(item, now)` → timestamp | null
   - `resurrect(item, event, now)` → { ok: true, ... } | { ok: false, reason } (synchronous)

## What the developer wrote

I ran the validation in WSL alongside Kiro, because Kiro's shell could not run commands on this setup. Besides running every test, I wrote:

- The `DecayEngine` class (`src/engine.ts`, tasks 9-19) and its tests.
- The property-test generators and all engine property tests (`tests/generators.ts`, `tests/properties/`, tasks 27-35) and the boundary test (`tests/unit/boundary.test.ts`, task 32.3), run in parallel with Kiro to save time.
- **Triage selection** (`src/triage.ts`, task 21): implements the locked value rule from `product.md` with an exact 0/1 knapsack. Originally planned as hand-written, and written by me.
- **Autopsy analysis** (`src/autopsy.ts`, task 22): a facts-only report read from the history log. Originally planned as hand-written, and written by me. Each app still writes its own cause-of-death sentences from the report.
- **Study Dungeon decay policy** (`apps/study-dungeon/src/policy.ts`, Study Dungeon task 2.1): the five policy functions and the 1-180 day half-life clamp, exactly as in the Study Dungeon spec. Originally planned as hand-written, and written by me. Its tests (tasks 2.2 and 2.3) are Kiro's.
- **Study Dungeon cause-of-death sentences** (`apps/study-dungeon/src/autopsy-sentences.ts`, Study Dungeon task 10.1): turns the engine's autopsy report into the sentences shown in the autopsy dialog. Originally planned as hand-written, and written by me. Its tests (task 10.2) and the dialog (task 10.3) are Kiro's.

Do not rewrite these files; change them only through a task that names them.

## What Opus 5.5 wrote

Written at the developer's request, in new files, while Kiro worked on round 5 (time machine and Triage), so the two never edited the same file:

- **First-run sample data** (`apps/study-dungeon/src/sample-data.ts` and its test, Study Dungeon tasks 11.1 and 11.2).
- **Hero stats logic** (`apps/study-dungeon/src/stats.ts` and its test, the souls and streak part of task 12.1). The HeroSection component itself is Kiro's.
- **Contrast check** (`apps/study-dungeon/src/contrast.test.ts`, task 16.3).
- **Storage problems and the crash screen** (`src/storage-errors.ts`, `src/components/ErrorBoundary.tsx`, `src/styles/problem.css` and their tests, task 18.3). Kiro wires them into `main.tsx` and `App.tsx`.
- **Candle and monster animations** (`src/styles/animations.css` and its test, tasks 17.1 and 17.2). The icons themselves (17.3) are Kiro's, from `icons.tsx`.
- **Sound effects** (`src/sound.ts` and its test, task 20). The toggle and the calls from the dialogs are Kiro's.
- **The check script** (`scripts/check.sh`): install, typechecks, all tests and the build in one command.
- **The visual pass and what followed** (after the spec was complete): the world, creatures, health orb and bar, time dock and motion; answer checking; ranks, combos, today's raid, import, backup and restore. New files: `creatures.ts`, `timeline.ts`, `answer-check.ts`, `ranks.ts`, `import-facts.ts`, `backup.ts`, `components/FactCard.tsx`, `components/TimeDock.tsx`, `components/HeroBoss.tsx`, `components/DialogFoe.tsx`, `components/AnswerPanel.tsx`, `components/AnswerCheckSetting.tsx`, `components/RaidIntro.tsx`, `components/ImportFactsDialog.tsx`, `components/BackupControls.tsx`, `components/DoorSplash.tsx`, `components/art/*`, `styles/world.css`, `styles/dock.css`, `styles/fx.css`, and their tests. Changes to Kiro's files: `App.tsx`, `ThreeLists.tsx`, `HeroSection.tsx`, `FightDialog.tsx`, `ChallengeDialog.tsx`, the styles, and the shell's `TimeMachine` (`belowSlider`) and `TriagePanel` (`initialBudget`). The wireframe itself was designed outside Kiro.
- **After round 7:** catching a full storage during a settle tick (`ticking.ts` and the handler in `App.tsx`), and keeping the add/edit form open on a storage problem (`AddEditFactDialog.tsx`), with their tests.

## Exception: Ghosted's decay policy

The rule above (Kiro never writes decay-rule code) was kept for the engine, Triage, Autopsy and the Study Dungeon policy. For Ghosted the developer chose to let Kiro write `apps/ghosted/src/policy.ts`, to save time and use Kiro more. The rules themselves were still set by the developer, in Requirements 1 to 4 and design section 2.2 of the Ghosted spec, with the formulas and expected values written out and checked by hand before Kiro wrote any code. A different reader, the `policy-reviewer` agent and the developer's own review, checks the result. `apps/ghosted/src/autopsy-sentences.ts` stays hand-written.

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

