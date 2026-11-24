# Requirements Document

Extensions: the Study Dungeon memory model, Policy Lab, Life Triage and the policy guide.

> **This spec was written AFTER the code, to document and test what already exists. It was not written first.**

## Introduction

This spec covers four features that were built before any spec existed. It describes what the code does today, read from the files listed below, and adds the requirements the code must meet. Where the code did not meet a requirement when the spec was written, the criterion is marked **(not met today)**. Session 79 changed the code for every such criterion except the switch size in 14.3; those changes are written but not yet run (`tasks.md`, status line). The marks are kept so the gaps found stay on record.

1. **Study Dungeon memory model.** A second decay policy for Study Dungeon, chosen by a switch in the settings. It adds a spacing effect and a per-fact difficulty to the default doubling policy. Its constants are hand-picked. It is **not FSRS** and is **not fitted to any data**.
   Files: `apps/study-dungeon/src/policy-memory.ts`, `policy-select.ts`, `components/MemoryModelToggle.tsx`, `memoryModelText` in `wording.ts`, the toggle in `App.tsx`, `activePolicy()` in `engine-instance.ts` and `backup.ts`, the optional `difficulty` in `FactPolicyData` (`policy.ts`), and the tests `policy-memory.test.ts` and `components/MemoryModelToggle.test.tsx`.
2. **Policy Lab.** A one-page app where the user writes a policy as a short JavaScript object. The page turns the text into a policy with `new Function`, in the user's own browser, runs `checkPolicy` on it, and runs one item on a real `DecayEngine` over simulated days. It has three examples: milk, a fact and one broken policy.
   Files: `apps/policy-lab/` (`index.html`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/lab.ts`, `src/lab.test.ts`, `src/styles.css`). Live at https://decay-engine-lab.netlify.app.
3. **Life Triage.** One time budget across a Study Dungeon backup and a Ghosted backup. A package collects every weak item through the public `engine.triage` and picks the best set with one exact 0/1 knapsack, and reports what an even split of the time between the apps would keep. The app reads backup files in the page or builds sample data.
   Files: `packages/life-triage/` (`package.json`, `tsconfig.json`, `src/index.ts`, `src/life-triage.test.ts`) and `apps/life-triage/` (`index.html`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/load.ts`, `src/load.test.ts`, `src/styles.css`). Live at https://decay-engine-life-triage-app.netlify.app.
4. **Policy guide.** `docs/ADDING_A_POLICY.md`: the policy contract, a worked example (a carton of milk), how to connect it, what the engine gives for free, and how to check it.

The README describes all four (the "Two decay policies, one switch" paragraph and "Beyond the two apps"). Its test counts match the files above: Policy Lab 6 tests (`lab.test.ts`), Life Triage 5 package tests (`life-triage.test.ts`) and 3 app tests (`load.test.ts`). Neither new app has a component test, and both run Vitest in the `node` environment with no jsdom or Testing Library installed.

None of the four changes the engine. None has a backend.

**Authorship.** The developer reports that Kiro wrote the code of the four features, in sessions that left nothing under `.kiro/` and no entry in `docs/KIRO_LOG.md`. Two points conflicted with `.kiro/steering/authorship.md`. The developer settled them in Session 80 (Kiro wrote the code, the developer chose the rules), and `authorship.md` now records both (design section 7):

- `policy-memory.ts` is a decay policy. `authorship.md` allows Kiro to write decay-rule code only for Ghosted.
- The memory model added `difficulty?` to `FactPolicyData` in `apps/study-dungeon/src/policy.ts`, a file `authorship.md` says may change only through a task that names it.

## Glossary

- **Doubling policy**: `studyDungeonPolicy` in `apps/study-dungeon/src/policy.ts`. A right answer doubles the half-life, a wrong one halves it.
- **Memory model**: `memoryPolicy` in `apps/study-dungeon/src/policy-memory.ts`.
- **Model choice**: the value saved under the storage key `decay-engine:study-dungeon:model` (`MODEL_KEY`). `"memory"` selects the memory model. A missing key, any other value, or storage that throws selects the doubling policy.
- **Recalled share**: `health / 100` of a fact at the moment it is answered.
- **Difficulty**: `policyData.difficulty`, 1 to 10. Facts saved by the doubling policy have none, and the memory model treats them as 5.
- **Lab source**: the text in Policy Lab's editor: one JavaScript object literal. `DAY` (86,400,000) is in scope.
- **Lab run**: one call of `runLab`: compile, `checkPolicy`, then one item on a real engine sampled once a day.
- **Preset**: one of the three examples in `PRESETS` (`apps/policy-lab/src/lab.ts`).
- **Source** (Life Triage): `{ label, engine }`. The app uses the labels `"Study Dungeon"` and `"Ghosted"`.
- **Candidate**: a weak item from one source, as returned by that engine's `triage` (`picks` and `others` together).
- **Even split**: each source gets `floor(budget / number of sources)` minutes and its own exact knapsack. The sum of their values is `evenSplitValue`.
- **Backup file**: the JSON file made by Study Dungeon's or Ghosted's "Back up" button: `{ app, version, exportedAt, snapshot }`.
- **Check script**: `bash scripts/check.sh`. **Engine check**: `bash scripts/check-engine-unchanged.sh`.
- **Real-browser pass**: a check by Kiro CLI in a real browser, against a draft deploy (`netlify deploy --build`, never `--prod`) or a server the developer started (`shell-commands.md` rule 6).

## Requirements

### Requirement 1: The engine stays unchanged

**User Story:** As the developer, I want all four features to sit on top of the engine, so that the claim "an app is a policy plus a skin" stays true.

#### Acceptance Criteria

1. THE four features SHALL change no file under `packages/engine/`, and the engine check SHALL exit 0.
2. THE check script SHALL pass every step, including the steps for `@decay-engine/policy-lab`, `@decay-engine/life-triage` and `@decay-engine/life-triage-app` (typecheck, test, and build for the two apps).
3. THE memory model, Policy Lab and Life Triage SHALL import from `@decay-engine/engine` only through the package name and only its public exports (`packages/engine/src/index.ts`).
4. `packages/life-triage` SHALL use only `engine.triage` from each source engine. It SHALL NOT change any engine (no `addItem`, `tend`, `resurrect`, `edit`, `remove` or `tick`).
5. `packages/life-triage` SHALL NOT read the clock: `now` is a parameter.
6. WHEN a feature seems to need an engine change, THE work SHALL stop and report it (`engine-boundary.md`).

### Requirement 2: Memory model, the decay rules as built

**User Story:** As a learner, I want a second set of rules where timing matters, so that a review that comes late counts for more.

#### Acceptance Criteria

1. THE memory model SHALL use the doubling policy's thresholds (weak 60, dead 10), data shape (`halfLifeDays`, plus optional `difficulty`) and health curve: `health × 0.5^(elapsed / halfLife)`.
2. `init` SHALL set the half-life from the knowledge level as the doubling policy does (new 2, shaky 5, solid 10 days) and the difficulty to new 7, shaky 5, solid 3. An unknown knowledge level SHALL throw an error that names it.
3. ON a right answer, health SHALL become 100, the difficulty SHALL fall by 0.3, and the half-life SHALL become `grownHalfLife(halfLife, difficulty, recalled)`:
   `halfLife × (1 + 1.6 × ((11 − difficulty) / 10) × halfLife^−0.2 × (e^(0.9 × (1 − recalled)) − 1) × 3)`.
4. ON a wrong answer, health SHALL become 45, the half-life SHALL become 0.4 times what it was, and the difficulty SHALL rise by 1.
5. THE half-life SHALL always stay from 1 to 180 days and the difficulty from 1 to 10.
6. A later right answer (lower recalled share) SHALL grow the half-life at least as much as an earlier one, and a harder fact SHALL gain less than an easier one from the same answer.
7. `resurrect` SHALL succeed on a right answer and keep the policy data, and SHALL refuse a wrong one with the reason "You got it wrong. The fact stays dead."
8. `nextDueAt` SHALL return `null` for a dead fact, `now` when health is below the weak line, and otherwise the time health reaches 60.
9. THE memory model SHALL pass `checkPolicy` with the three knowledge levels and both answers.
10. A Crypt saved under one policy SHALL load and keep working under the other.

### Requirement 3: Memory model, choosing it

**User Story:** As a learner, I want to switch between the two rule sets without losing my facts.

#### Acceptance Criteria

1. THE settings SHALL show a switch (`role="switch"`) labelled "Memory model", described by a help text through `aria-describedby`, next to the sound switch.
2. THE switch SHALL be on exactly when the model choice is `"memory"`.
3. WHEN the user turns it on, THE app SHALL save `"memory"` under `MODEL_KEY`. WHEN the user turns it off, THE app SHALL remove the key.
4. WHEN the choice is saved, THE page SHALL reload, because the engine is built once, with one policy, when the page loads (`createEngine` calls `activePolicy()`).
5. WHEN the choice cannot be saved (storage throws), THE app SHALL say so in the live region and SHALL NOT reload. **(not met today: nothing happens and nothing is said)**
6. THE backup check (`checkBackup`) and the "sleeps until" line SHALL use the active policy.
7. THE help text SHALL say that the facts are kept and that the page reloads.

### Requirement 4: Memory model, honest wording

**User Story:** As a learner, I want to know what the memory model is and what it is not, so that I do not trust it more than it deserves.

#### Acceptance Criteria

1. THE switch's help text SHALL say that the memory model's numbers are hand-picked, that it is not FSRS, and that it is not fitted to anyone's data. **(not met today: the help text says none of this)**
2. Every text that describes what an answer does SHALL be true for the active policy. Under the memory model, THE fight result SHALL NOT say "half-life doubled" or "half-life halved", and the creature's line SHALL NOT say "It sleeps twice as long now". **(not met today: `fightText.correct`, `fightText.incorrect` and the quip in `FightDialog.tsx` are fixed to the doubling policy)**
3. No text in the app SHALL claim that the memory model predicts, measures or matches how a person's memory works, or that it is based on research.
4. THE README SHALL say that the memory model is not FSRS and that its constants are hand-picked, not fitted to anyone's data. (Met today: "It is inspired by FSRS but is not FSRS, and its constants are hand-picked, not fitted to anyone's data.")
5. THE header comment of `policy-memory.ts` SHALL say the same. (Met today.)

### Requirement 5: Policy Lab, compiling and running a policy

**User Story:** As a developer, I want to try a policy in the browser on the real engine, so that I can see its curve and whether it is sound before I write an app.

#### Acceptance Criteria

1. THE page SHALL turn the lab source into a policy with `new Function("DAY", '"use strict"; return (<source>\n);')`, called with `DAY` = 86,400,000.
2. WHEN the text does not compile, or throws, THE page SHALL show the error message and no chart.
3. WHEN the result is not an object, lacks one of `init`, `healthAt`, `applyEvent`, `nextDueAt`, `resurrect` as a function, or lacks `thresholds` as an object, THE page SHALL show which one ("Missing function: init", "Missing thresholds: { weak, dead }").
4. WHEN the payload or the event is not valid JSON, THE page SHALL say "Payload is not valid JSON." or "Event is not valid JSON."
5. A lab run SHALL call `checkPolicy(policy, [payload], [event], T0)` with `T0` = 1 Jan 2026 00:00 UTC, and show "checkPolicy: passed" or the number of problems with the first 5 of them and "…and N more".
6. A lab run SHALL add one item to a real `DecayEngine` on an `InMemoryAdapter` at `T0`, with importance 2 and cost 5 minutes, tend it once with the event on the chosen day (if any), and read `view` once a day from day 0 to the last day shown.
7. THE number of days shown SHALL be a whole number from 1 to 730, and the tend day from 0 to 730 or "never".
8. WHEN the tend throws, THE page SHALL show "Tend failed:" and the message, and still show the curve.
9. THE page SHALL say on which day the item first goes weak and first dies in the window, or that it does not.
10. A lab run SHALL be deterministic: the same inputs give an equal result.
11. THE page SHALL save nothing: no local storage, no cookies, no files.
12. THE page SHALL say what `checkPolicy` checks and what it does not. It checks the thresholds, that `init` returns data that survives JSON, and, for the item made from the payload and that item after the event, that `healthAt` stays from 0 to 100, gives the same answer twice, and never rises over nine sample times from 0 to 10 years. It does not check `nextDueAt`, `resurrect`, or the event's effect beyond building the item. **(not met today: the page says "`checkPolicy` tells you if the rules are sound")**

### Requirement 6: Policy Lab, the examples

**User Story:** As a developer, I want worked examples, including a wrong one, so that I can see what `checkPolicy` catches.

#### Acceptance Criteria

1. THE page SHALL offer three presets as toggle buttons (`aria-pressed`) in a group labelled "Example policies": "Milk (straight line)", "Fact (half-life)" and "Broken: health rises".
2. Choosing a preset SHALL replace the source, payload, event and tend day, and show its one-line description.
3. THE milk preset SHALL pass `checkPolicy`, and its health on day 5, tended on day 5 with `{ "kind": "freeze" }`, SHALL be 60.
4. THE fact preset SHALL pass `checkPolicy`, die within 40 days when never tended, and die later (or not at all) when tended on day 2.
5. THE broken preset SHALL fail `checkPolicy` with at least one problem.
6. THE milk preset's rules SHALL be the same as the milk example in `docs/ADDING_A_POLICY.md` (thresholds 40 and 10, straight line over the shelf life, freezing sets health to 60, spoiled milk cannot come back).

### Requirement 7: Policy Lab, running code you trust

**User Story:** As a visitor, I want to be told plainly that the editor runs code, so that I do not paste something harmful.

#### Acceptance Criteria

1. THE page SHALL say, next to the editor and before any run, that the text runs as JavaScript in this browser tab with the page's access, and that only code you trust should be pasted. **(not met today: the page has no such text)**
2. THE page SHALL say that a policy that never finishes (an endless loop) freezes the tab, because there is no time limit. **(not met today)**
3. THE page SHALL say that the run happens on every change of the text. **(not met today)**
4. THE page itself SHALL send nothing anywhere (Requirement 13). THE warning SHALL say that code pasted by the user can still make network requests, because it runs with the page's access. **(not met today)**

### Requirement 8: Policy Lab, the chart

**User Story:** As a developer, I want the curve to show the weak and dead lines and each state in more than colour.

#### Acceptance Criteria

1. THE chart SHALL be an SVG with `role="img"` and an accessible name.
2. THE chart SHALL mark the policy's weak and dead thresholds as lines with labels. **(not met today: the grid is at 0, 50 and 100)**
3. Each state SHALL be shown by a word or shape as well as colour, in the chart or next to it. **(not met today: the line and the legend use colour only; the text line gives only the weak and dead days)**
4. WHEN a tend day is set and shown, THE chart SHALL mark it with a labelled line ("tended").

### Requirement 9: Life Triage, the package

**User Story:** As someone with facts and friends to keep up, I want one budget across both apps, so that the minutes go where they save the most.

#### Acceptance Criteria

1. `lifeTriage(sources, budgetMinutes, now)` SHALL throw an error when the budget is not an integer from 1 to 1,440 (`MAX_LIFE_BUDGET_MINUTES`), or when two sources share a label. Engine errors SHALL pass through.
2. THE candidates SHALL be every weak item of every source: `picks` and `others` of `engine.triage(1, now)`, with the engine's own `value` and `diesAt`.
3. THE picks SHALL be one exact 0/1 knapsack over all candidates, by whole minutes, with the best total value that fits the budget.
4. Picks SHALL be ordered by value per minute (highest first), then source label, then id. Other candidates SHALL be ordered by `diesAt` (earliest first, `null` last), then source label, then id.
5. THE result SHALL include `totalValue`, `totalMinutes` and `evenSplitValue`. `totalValue` SHALL never be below `evenSplitValue`.
6. With one source, the picks SHALL be the same set as that engine's own `triage` for the same budget.
7. THE function SHALL be deterministic and change no engine.

### Requirement 10: Life Triage, the app

**User Story:** As the same person, I want to load my two backups, or try sample data, and see what to do in the time I have.

#### Acceptance Criteria

1. THE page SHALL read backup files chosen by the user with the browser's file API, in the page, and SHALL upload nothing. THE page SHALL say so ("Nothing is uploaded; the files are read in this page.").
2. A file SHALL be accepted only when it is JSON, has a `snapshot`, a numeric `version` of at most 1, and `app` `"study-dungeon"` or `"ghosted"`, and the engine can load its snapshot. Each refusal SHALL be listed with the file name and a reason.
3. A Study Dungeon backup SHALL be loaded with `studyDungeonPolicy` and a Ghosted backup with `ghostedPolicy`, imported from the apps' own `policy.ts` files, never copied.
4. A second file for the same app SHALL replace the first, and the page SHALL say that it did. **(not met today: the earlier file is replaced without a word)**
5. "Use sample data" SHALL build five fictional facts and four fictional people, some of them weak at the current time, and the combined picks SHALL draw on both sources.
6. THE user SHALL set the budget ("I have (minutes)") and how many days to look ahead. Looking ahead SHALL only change the `now` passed to `lifeTriage`; it saves nothing.
7. THE page SHALL show how many fading items are saved in how many minutes, the value kept against the even split, the picks ("Do these") and the rest ("Left to fade"), each with its source, cost and when it dies or goes dark.
8. WHEN a file read fails (the browser cannot read the file), THE page SHALL list that file with a reason and keep the other files. **(not met today: `f.text()` is not guarded, so one failed read stops the whole load)**

### Requirement 11: Policy guide

**User Story:** As a developer, I want one page that tells me how to add a policy, with an example that works when copied.

#### Acceptance Criteria

1. `docs/ADDING_A_POLICY.md` SHALL describe the six members of the contract as they are in `packages/engine/src/types.ts`, and say that all of them are pure and synchronous.
2. THE milk example SHALL be valid TypeScript against the public API and SHALL pass `checkPolicy`.
3. THE "Connect it" example SHALL work when copied: its `addItem` call SHALL use an integer importance from 1 to 3 and a cost from 1 to 600 minutes, as `validateImportance` and `validateCostMinutes` in `packages/engine/src/engine.ts` require. **(not met today: it uses `importance: 5`, so `addItem` throws `INVALID_IMPORTANCE`)**
4. THE guide SHALL say how to run `checkPolicy` and the engine check, and what the engine check compares against (the `engine-complete` tag).
5. THE guide SHALL link to Policy Lab (https://decay-engine-lab.netlify.app) as a place to try the example. **(not met today)**
6. THE guide SHALL describe `checkPolicy` as Requirement 5.12 does, not as running "the contract's rules". **(not met today: it says "runs the contract's rules against your policy")**

### Requirement 12: Wording

**User Story:** As a reader, I want plain words that do not overclaim, and that never judge the people in my life.

#### Acceptance Criteria

1. No UI text in the four features SHALL make a medical or scientific claim: no claim that a feature is proven, clinically tested, research-based or optimal for memory, and no claim about how memory or relationships work.
2. Wherever a person's name appears (Life Triage's Ghosted rows and its sample people), THE Ghosted wording rules SHALL apply: "connection freshness", never "how much someone cares"; never "doesn't care", "ignored you" or "ghosted you"; no words that blame or judge either person.
3. A Ghosted row in Life Triage SHALL say "goes dark" where a Study Dungeon row says "dies". **(not met today: every row says "dies", including people)**
4. Sample names and facts SHALL be fictional, and no name SHALL repeat.
5. Interface text SHALL be plain and short, as in `theme-and-wording.md`.

### Requirement 13: No network

**User Story:** As a user, I want my facts, my friends and my code to stay in my browser.

#### Acceptance Criteria

1. THE memory model, Policy Lab, Life Triage and the guide's examples SHALL make no network request: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, analytics, remote fonts or remote scripts.
2. Links the user clicks (the guide, the two apps) are allowed. They are navigation, not requests made by the page.
3. A source scan test SHALL fail when any file under `apps/policy-lab/src`, `apps/life-triage/src` or `packages/life-triage/src`, or the memory-model files, contains one of the names in criterion 1. **(not met today: no such test)**
4. A real-browser pass SHALL show no request after the page's own files have loaded, while the user runs each preset, loads a backup and uses sample data.

### Requirement 14: Accessibility

**User Story:** As a keyboard or screen-reader user, I want every control to be named and reachable.

#### Acceptance Criteria

1. Every input, button, switch and file control SHALL have a visible label or an accessible name.
2. Every focusable element SHALL show a visible focus outline (`:focus-visible`, or `:focus-within` for the hidden file input's label).
3. Every button, switch, file control and number input SHALL be at least 44 by 44 CSS pixels. **(not met today in Policy Lab and Life Triage: buttons and the file label are about 42px tall with 8px padding, inputs about 38px; the memory switch's size is to be measured)**
4. Any animation SHALL sit inside `@media (prefers-reduced-motion: no-preference)`. Policy Lab and Life Triage have no animation today; this criterion keeps it so.
5. Results that change after input SHALL be in a polite live region, and errors SHALL use `role="alert"`.
6. State SHALL never be shown by colour alone (Requirement 8.3 for Policy Lab).

### Requirement 15: Every limit is stated in the UI

**User Story:** As a user, I want to know the limits before I run into them.

#### Acceptance Criteria

1. Memory model: THE help text SHALL state that the numbers are hand-picked and not fitted to data (Requirement 4.1), and that the page reloads.
2. Policy Lab SHALL state: the tend day range (0 to 730) and the days shown (1 to 730); that the item has importance 2 and cost 5 minutes; that `checkPolicy` is run with only the one payload and one event given; that at most 5 problems are listed; and the limits in Requirement 7. **(not met today: only the `min` and `max` attributes carry the ranges; the rest is not said)**
3. Life Triage SHALL state: the budget range (1 to 1,440 minutes); the look-ahead range (0 to 365 days); that a death more than 10 years away shows as "not within 10 years"; that backups up to version 1 are read; that one file per app is used; and that a Study Dungeon backup is read with the default doubling policy, whatever model was chosen in Study Dungeon (the backup does not record it). **(not met today: only the 10-year text is shown)**
4. Life Triage SHALL keep the look-ahead within 0 to 365 days. **(not met today: values above 365 are used as typed)**
5. WHEN the user types a budget outside 1 to 1,440, Life Triage SHALL say which range it used instead of silently clamping. **(not met today)**

### Requirement 16: Checks and log

**User Story:** As the developer, I want each feature checked in a real browser and every session logged, so that the Kiroween write-up rests on what was measured.

#### Acceptance Criteria

1. Each feature SHALL have a real-browser pass by Kiro CLI, recorded in `docs/KIRO_LOG.md` with what was checked and what failed.
2. THIS spec SHALL be logged in `docs/KIRO_LOG.md` as a new session. THE entry SHALL say that the developer reports the code of the four features was written by Kiro in earlier sessions that were not logged, and that this spec was written after that code.

## Correctness properties

Properties run with fast-check at `{ numRuns: 100 }` or more. Times start at a fixed `T0`, never the clock.

- **P1 (memory model bounds):** over any run of right and wrong answers at any gaps, the half-life stays in 1 to 180 and the difficulty in 1 to 10 (exists: `policy-memory.test.ts`).
- **P2 (memory model spacing):** for any half-life in 1 to 180, difficulty in 1 to 10 and two recalled shares `r1 < r2`, `grownHalfLife(h, d, r1) >= grownHalfLife(h, d, r2) >= h` (to be added; today two hand-picked cases).
- **P3 (Life Triage optimum):** for generated sources, the total value equals a brute-force optimum over all candidates for any budget (to be added as a property; today one fixed case).
- **P4 (Life Triage against the even split):** `totalValue >= evenSplitValue − 1e-9` for any sources and budget (to be added as a property).
- **P5 (Policy Lab determinism):** for each preset and tend days and windows across 0 to 730, two runs give equal results. Tested over a fixed grid, not fast-check, because Policy Lab has no fast-check dependency.
