# Implementation Plan: Extensions (memory model, Policy Lab, Life Triage, policy guide)


## Overview

Four features already exist in the repo: the Study Dungeon memory model, Policy Lab, Life Triage and `docs/ADDING_A_POLICY.md`. The developer reports that Kiro wrote them in earlier sessions that left nothing under `.kiro/` and no entry in `docs/KIRO_LOG.md`. The tasks marked **built before this spec** are those existing file groups. Ticking them records that the files exist, not that they met every requirement.

The other ticked tasks were done in Session 79, after the spec, to close the gaps it found.

**Status (Session 79, no commands run):** tasks 2.2 to 2.6, 3.2 to 3.5, 3.7, 4.2 to 4.5, 5.1 to 5.4 and 6.2 to 6.4 are written but **not yet run**. Task 8.1 runs them. Tasks 2.7, 3.6 and 4.6 (browser checks), 7.1 (the developer's decision) and 8.1 are open.

No task changes `packages/engine/` or `packages/shell/`. If one seems to need it, stop and report it (`engine-boundary.md`).

Commands follow `.kiro/steering/shell-commands.md`: one command per call, long output to a file under `/tmp`, long runs in the background with `nohup`, stop after two identical failures, and never start a server. Tests follow `no-fake-tests.md`: no caught errors to pass, no lowered `numRuns`, and no expected values changed to match output. If a new test fails in 8.1, fix the code, or stop and report if the test looks wrong.

## Tasks

- [x] 1. Engine boundary and checks (built before this spec)
  - [x] 1.1 `scripts/check.sh` runs typecheck, test and build for `@decay-engine/policy-lab`, typecheck and test for `@decay-engine/life-triage`, and typecheck, test and build for `@decay-engine/life-triage-app`
    - Built before this spec. Not yet confirmed green for this spec; see 8.1
    - _Requirements: 1.2_
  - [x] 1.2 No file under `packages/engine/` changed by the four features (all four use the public API through `@decay-engine/engine`)
    - Built before this spec. Confirmed by reading imports; `packages/life-triage/src/source.test.ts` now checks the package's imports. 8.1 runs the engine check
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

- [ ] 2. Memory model
  - [x] 2.1 Existing files: `src/policy-memory.ts`, `src/policy-select.ts`, `src/components/MemoryModelToggle.tsx`, `memoryModelText` in `src/wording.ts`, the toggle in `src/App.tsx`, `activePolicy()` in `src/engine-instance.ts` and `src/backup.ts`, `difficulty?` in `FactPolicyData` (`src/policy.ts`), and the tests `src/policy-memory.test.ts` and `src/components/MemoryModelToggle.test.tsx`
    - Built before this spec
    - _Requirements: 2.1 to 2.10, 3.1 to 3.4, 3.6, 3.7_
  - [x] 2.2 Help text says the numbers are hand-picked, that it is not FSRS and not fitted to anyone's data (design 6.1)
    - `memoryModelText.help` in `wording.ts`; `MemoryModelToggle.test.tsx` checks the exact text and that no memory-model text claims research or proof
    - _Requirements: 4.1, 4.3, 15.1_
  - [x] 2.3 Fight text true for the active model (design 6.1)
    - `fightResultText(model)` in `wording.ts`; optional `model` prop on `FightDialog` (default `"doubling"`, so the old tests see the old texts); the App passes `readModel(storage)`; the quip on a right answer comes from the same table
    - New `components/FightDialog.model.test.tsx`: doubling right and wrong; memory right ("longer", half-life `grownHalfLife(5, 5, health/100)`) and wrong ("shorter", half-life 2)
    - In `FightDialog.tsx` only the props, the result text and the right-answer quip changed, plus one header line.
    - _Requirements: 4.2_
  - [x] 2.4 Save failure says so; the reload uses the `reload` prop (design 6.2)
    - `memoryModelText.notSaved`; new `App.memory-model.test.tsx`: on and off each save and reload once; a storage that throws for the model key gives no reload, no saved key and the message in the live region
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 2.5 Property P2 and the worked examples (in `policy-memory.test.ts`)
    - P2 with `{ numRuns: 200 }`; `grownHalfLife(5, 5, 0.95)` ≈ 5.48 and `grownHalfLife(5, 5, 0.55)` ≈ 10.21; recalled 1 keeps the half-life; `nextDueAt` (dead, below 60, the 60-crossing at 5 × log2(100/60) days); `resurrect` (right and wrong); `init` (difficulties and the unknown-level error)
    - _Requirements: 2.2, 2.3, 2.6, 2.7, 2.8_
  - [x] 2.6 Pin the switch-back behaviour (in `policy-memory.test.ts`)
    - The doubling policy returns `{ halfLifeDays: 10 }` only, and the memory model then reads the missing difficulty as 5 (a wrong answer gives 6). Kept as it is; changing it needs `policy.ts` and the developer's say
    - _Requirements: 2.10_
  - [ ] 2.7 Check: real-browser pass by Kiro CLI (design section 9, memory model)
    - On https://decay-engine-study-dungeon.netlify.app (after a deploy of Session 79's changes), a draft deploy or a server the developer starts. Measure the switch and its label (the switch shares the `sd-sound-toggle` class with the sound switch; its CSS was not found by reading); record results in `docs/KIRO_LOG.md`; fix nothing during the pass
    - _Requirements: 3, 4, 13.4, 14, 16.1_

- [ ] 3. Policy Lab
  - [x] 3.1 Existing files: `apps/policy-lab/` (`index.html`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/lab.ts`, `src/lab.test.ts`, `src/styles.css`)
    - Built before this spec
    - _Requirements: 5.1 to 5.11, 6.1 to 6.6, 8.1, 8.4_
  - [x] 3.2 Trust warning next to the editor (design 6.3)
    - New `src/text.ts` (`labText.warning`); `<p id="lab-warning">` above the editor and `aria-describedby="lab-warning"` on the textarea; new `src/page.test.tsx` checks both
    - _Requirements: 7.1 to 7.4_
  - [x] 3.3 Chart: threshold lines and state shapes (design 6.4)
    - `thresholds` in `LabResult`; dashed lines labelled "weak below N" and "dead below N" (the 50 grid line is gone); a circle at day 0, a triangle on the first weak day and a cross on the first dead day; circle, triangle and cross before the legend words; a summary as the chart's accessible name. `Chart` is exported for its test
    - _Requirements: 8.2, 8.3, 14.6_
  - [x] 3.4 State the limits in the page (design 6.3)
    - `labText.limits` under the inputs, and the tend and days inputs describe themselves with it; the inputs clamp with `clampTendDay` and `clampHorizon`
    - _Requirements: 5.7, 15.2_
  - [x] 3.5 More `runLab` tests (in `lab.test.ts`)
    - Clamps; the never-tended fact preset weak on day 4 and dead on day 9 (worked by hand); a tend past the window; a tend on a dead item gives `tendError`; thresholds; P5 over a fixed grid (3 presets × 8 tend days × 3 windows), because Policy Lab has no fast-check dependency and adding one would change the lockfile
    - _Requirements: 5.7, 5.8, 5.10_
  - [ ] 3.6 Check: real-browser pass by Kiro CLI (design section 9, Policy Lab)
    - On https://decay-engine-lab.netlify.app (after a deploy), a draft deploy (`netlify deploy --build`, never `--prod`) or a developer-started server; record in `docs/KIRO_LOG.md`; fix nothing during the pass
    - _Requirements: 5 to 8, 13.4, 14, 15.2, 16.1_
  - [x] 3.7 Say what `checkPolicy` checks (design 6.10)
    - `labText.checks` replaces "tells you if the rules are sound"; `page.test.tsx` checks the text and that "sound" is gone from the page
    - _Requirements: 5.12_

- [ ] 4. Life Triage
  - [x] 4.1 Existing files: `packages/life-triage/` (`package.json`, `tsconfig.json`, `src/index.ts`, `src/life-triage.test.ts`) and `apps/life-triage/` (`index.html`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/load.ts`, `src/load.test.ts`, `src/styles.css`)
    - Built before this spec
    - _Requirements: 9.1 to 9.7, 10.1 to 10.3, 10.5 to 10.7, 12.4_
  - [x] 4.2 Ghosted wording on people rows (design 6.5)
    - New `src/text.ts`: `fateOf` ("goes dark …" for Ghosted, "dies …" for Study Dungeon), `detailOf` ("freshness" for a person, "health" for a fact), `nameOf`. New `src/text.test.ts`: exact phrases, and every Ghosted row of the sample free of die/dies/died/dying/dead and the banned phrases
    - _Requirements: 12.2, 12.3_
  - [x] 4.3 State the limits; clamp the look-ahead; say when a value is clamped (design 6.5)
    - `ltText.limits` on the page; `clampBudget` and `clampAhead` with notes ("Using 1440 minutes (1 to 1,440).", "Using 365 days ahead (0 to 365)."); App takes an optional `now` prop so its test needs no clock. New `src/page.test.tsx` renders the page in Node
    - _Requirements: 15.3, 15.4, 15.5_
  - [x] 4.4 File loading: guard each read, say when a file replaces another (design 6.6)
    - New `src/files.ts` (`readBackupFiles`); new `src/files.test.ts`: an unreadable file is listed and the next one loads; a second Ghosted file says it replaces the earlier one; a refused file changes nothing
    - _Requirements: 10.4, 10.8_
  - [x] 4.5 Properties P3 and P4, and real backups
    - New `packages/life-triage/src/life-triage.property.test.ts`: coverage check, P3 (against a brute force over the engines' own candidates), P4, the order of picks and others, `{ numRuns: 100 }` each; and a three-source even split with an odd budget, worked by hand
    - `files.test.ts`: backups built the way `makeBackup` builds them (a real engine's saved snapshot inside `{ app, version, exportedAt, snapshot }`) load with the right label and count. `makeBackup` itself is not imported, so the test does not pull in either app's storage modules
    - _Requirements: 9.3 to 9.5, 10.2, 10.3_
  - [ ] 4.6 Check: real-browser pass by Kiro CLI (design section 9, Life Triage)
    - On https://decay-engine-life-triage-app.netlify.app (after a deploy), a draft deploy or a developer-started server, with real backups exported from the live Study Dungeon and Ghosted; record in `docs/KIRO_LOG.md`; fix nothing during the pass
    - _Requirements: 9, 10, 12, 13.4, 14, 15.3, 16.1_

- [x] 5. Across all four
  - [x] 5.1 Wording scan
    - In `MemoryModelToggle.test.tsx`, Policy Lab's `page.test.tsx` and Life Triage's `text.test.ts`: no "proven", "scientific", "research", "clinical", "optimal" or "guarantee"
    - _Requirements: 12.1, 4.3_
  - [x] 5.2 44px targets in Policy Lab and Life Triage (design 6.7)
    - `min-height: 44px` on buttons (and `min-width`), inputs, the editor and the file label (`inline-flex`); the hidden file input is left out. Each app's `source.test.ts` checks the rules, the focus outline and that there is no animation
    - _Requirements: 14.2, 14.3, 14.4_
  - [x] 5.3 No-network scan (design 6.8)
    - `apps/policy-lab/src/source.test.ts`, `apps/life-triage/src/source.test.ts`, `packages/life-triage/src/source.test.ts` (also no clock, no engine writes, only `@decay-engine/engine` imported) and `apps/study-dungeon/src/memory-model.source.test.ts`, each with a self-test; both `index.html` files load nothing from another host
    - _Requirements: 13.1, 13.3, 1.3 to 1.5_
  - [x] 5.4 `scripts/check.sh` header comment lists the eight new steps and who added them
    - Comment only; no step changed
    - _Requirements: 1.2_
  - [x] 5.5 Component-test setup (design 6.11)
    - Not needed: the page tests use `react-dom/server` in Node, so no `jsdom` or Testing Library was added and the lockfile is unchanged
    - _Requirements: definition of done (`testing.md`)_

- [x] 6. Policy guide
  - [x] 6.1 Existing file: `docs/ADDING_A_POLICY.md` (contract, milk example, connect, what you get, check), and the README's "Beyond the two apps" and memory-model paragraphs
    - Built before this spec
    - _Requirements: 11.1, 11.2, 11.4, 6.6_
  - [x] 6.2 Fix the connect example and link Policy Lab (design 6.9)
    - `importance: 2`; a sentence on the allowed importance and cost; a pointer to https://decay-engine-lab.netlify.app with the trust note
    - _Requirements: 11.3, 11.5_
  - [x] 6.3 Check: the guide's examples run
    - New `apps/policy-lab/src/guide.test.ts`: the milk object read out of the guide compiles, passes `checkPolicy`, gives the same curve as the milk preset, and the connect example's importance and cost are accepted by `addItem`
    - _Requirements: 6.6, 11.2, 11.3_
  - [x] 6.4 Describe `checkPolicy` accurately in the guide (design 6.10)
    - Section 5 now says what it checks and that it does not check `nextDueAt` or `resurrect`; `guide.test.ts` checks it
    - _Requirements: 11.6_

- [ ] 7. Authorship
  - [x] 7.1 The developer decides how `authorship.md` records the memory model (a decay policy) and the `difficulty?` edit to `policy.ts` (design section 7)
    - Decided (Session 80): Kiro wrote the code; the developer chose the formula and constants. Recorded as "Exception: Study Dungeon's memory model" in `authorship.md`, and in the README's Kiro paragraph
    - _Requirements: none (project rule)_
  - [ ] 7.2 Run the `policy-reviewer` agent on the memory model, and record its findings in `docs/KIRO_LOG.md`
    - Review only; any change to the rules is the developer's call
    - _Requirements: 2_

- [ ] 8. Checkpoint and log
  - [ ] 8.1 `bash scripts/check.sh > /tmp/ext-check.log 2>&1; echo EXIT $? >> /tmp/ext-check.log`, in the background with `nohup`; every step passes, including "engine unchanged". The developer runs it in WSL if Kiro's shell cannot
    - _Requirements: 1.1, 1.2_
  - [x] 8.2 Log the spec in `docs/KIRO_LOG.md` (Session 78) and the fixes (Session 79)
    - _Requirements: 16.2_
