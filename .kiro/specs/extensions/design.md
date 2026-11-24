# Design Document

Extensions: the Study Dungeon memory model, Policy Lab, Life Triage and the policy guide.

> This spec was written AFTER the code, to document and test what already exists. It was not written first. Each component below says what was built before the spec, and what Session 79 changed to meet the requirements marked **(not met today)**. The Session 79 changes are written but not yet run (`tasks.md`, task 8.1).

## Overview

Four features sit on top of the unchanged engine and use only its public API (`packages/engine/src/index.ts`):

- **Memory model**: a second decay policy for Study Dungeon, chosen by a switch. It adds a spacing effect and a per-fact difficulty. The developer chose the formula and its constants by hand; Kiro wrote the code. It is not FSRS and is not fitted to any data.
- **Policy Lab**: a page where the user writes a policy as a JavaScript object. The page compiles it with `new Function` in the user's browser, runs `checkPolicy`, and runs one item on a real `DecayEngine` over simulated days.
- **Life Triage**: one time budget across a Study Dungeon backup and a Ghosted backup. A package gathers every weak item through `engine.triage` and picks the best set with one exact 0/1 knapsack. It also reports what an even split of the time would keep.
- **Policy guide**: `docs/ADDING_A_POLICY.md`, with the contract and a milk-carton example.

None of them has a backend, makes a network request, or changes `packages/engine/` or `packages/shell/`.

Live sites (from the README):

| Site | URL |
|---|---|
| Study Dungeon | https://decay-engine-study-dungeon.netlify.app |
| Policy Lab | https://decay-engine-lab.netlify.app |
| Life Triage | https://decay-engine-life-triage-app.netlify.app |

## Architecture

```
                         @decay-engine/engine (unchanged, public API only)
                 ┌───────────────┬──────────────────┬──────────────────────┐
                 │               │                  │                      │
 Study Dungeon   │   Policy Lab  │   packages/      │   apps/life-triage   │
 memoryPolicy ───┤   new Function│   life-triage    │   readBackupFiles ───┤
 policy-select   │   checkPolicy │   lifeTriage()   │   loadBackup         │
 (one policy per │   DecayEngine │   engine.triage  │   sampleSources      │
  page load)     │   InMemory    │   only           │   studyDungeonPolicy │
                 │               │                  │   ghostedPolicy      │
                 └───────────────┴──────────────────┴──────────────────────┘
 docs/ADDING_A_POLICY.md: the contract and the milk example (same rules as Policy Lab's milk preset)
```

| Feature | Package name | Steps in `scripts/check.sh` | Netlify |
|---|---|---|---|
| Memory model | part of `@decay-engine/study-dungeon` | "typecheck app", "test app", "build app" | the Study Dungeon site |
| Policy Lab | `@decay-engine/policy-lab` | "typecheck policy-lab", "test policy-lab", "build policy-lab" | `apps/policy-lab/netlify.toml` |
| Life Triage (package) | `@decay-engine/life-triage` | "typecheck life-triage", "test life-triage" | none |
| Life Triage (app) | `@decay-engine/life-triage-app` | "typecheck lt app", "test lt app", "build lt app" | `apps/life-triage/netlify.toml` |
| Guide | none | tested by `apps/policy-lab/src/guide.test.ts` | none |

Key decisions:

- **One policy per page load.** Study Dungeon builds its engine once in `main.tsx` through `createEngine()`, which calls `activePolicy()`. Changing the model saves the choice and reloads the page. Both policies share one data shape, so a saved Crypt loads under either.
- **Policy Lab has no sandbox.** The text runs in the page's own scope, with no worker, no iframe and no time limit. The page says so in plain words (Requirement 7).
- **Life Triage reads only.** It builds engines from backup snapshots on an adapter whose `save` does nothing, and calls only `triage`.
- **No new dependencies.** Adding jsdom or Testing Library would change `pnpm-lock.yaml`, and Netlify installs with a frozen lockfile. So the two new apps' page tests render with `react-dom/server` in Node, and interactions are tested through pure functions that the Apps use unchanged.

## Components and Interfaces

### Memory model (`apps/study-dungeon/src/`)

| File | Role | Session 79 change |
|---|---|---|
| `policy-memory.ts` | `memoryPolicy`, `grownHalfLife`, constants `FIRST_DIFFICULTY`, `DEFAULT_DIFFICULTY` (5), `MIN_DIFFICULTY` (1), `MAX_DIFFICULTY` (10), `LAPSE_SHARE` (0.4), `SPACING_GAIN` (1.6) | none |
| `policy-select.ts` | `ModelName`, `MODEL_KEY`, `readModel`, `saveModel`, `policyFor`, `activePolicy` | none |
| `components/MemoryModelToggle.tsx` | the switch (`role="switch"`), its label and its help text (`aria-describedby`) | none |
| `wording.ts` | `memoryModelText` | help text says hand-picked, not FSRS, not fitted; `notSaved`; new `fightResultText(model)` |
| `components/FightDialog.tsx` | the fight | optional `model` prop (default `"doubling"`); result text and right-answer quip from `fightResultText` |
| `App.tsx` | renders the switch inside `ResetData`, passes `model` to the fight | reloads through the `reload` prop; announces `notSaved` instead of reloading when the save fails |
| `engine-instance.ts`, `backup.ts` | build their engines with `activePolicy()` | none |
| `policy.ts` | `FactPolicyData.difficulty?: number` | none |

`readModel` returns `"memory"` only for the exact string `"memory"`. Anything else, or a throwing storage, gives `"doubling"`. `saveModel(storage, "memory")` sets the key and `saveModel(storage, "doubling")` removes it. Both return `false` when storage throws.

Fight texts by model:

| Key | doubling | memory |
|---|---|---|
| correct | "Correct! Health → 100, half-life doubled" | "Correct! Health → 100, half-life longer" |
| incorrect | "Incorrect. Health → 45, half-life halved" | "Incorrect. Health → 45, half-life shorter" |
| quip on a right answer | "Defeated. It sleeps twice as long now." | "Defeated. It sleeps longer now." |

The help text:

> Off: each right answer doubles a fact's half-life. On: a right answer helps more the later it comes, and hard facts gain less. The numbers are hand-picked. This is not FSRS and is not fitted to anyone's data. Your facts are kept; the page reloads.

Not designed: the model choice is not part of a backup file, so a backup restores under whatever model the restoring browser has chosen. The challenge dialog's text does not depend on the model, because it states only the half-life after the resurrection, which is true under both.

### Policy Lab (`apps/policy-lab/`)

| File | Role | Session 79 change |
|---|---|---|
| `src/lab.ts` | `DAY`, `T0` (`Date.UTC(2026, 0, 1)`), `compilePolicy`, `runLab`, `PRESETS` | `thresholds` in the result; `LAB_IMPORTANCE`, `LAB_COST_MINUTES`, `MAX_LAB_DAYS`, `MAX_FAILURES_SHOWN`; `clampHorizon`, `clampTendDay` |
| `src/text.ts` | every word on the page | new |
| `src/App.tsx` | presets, editor, inputs, result, `Chart`, footer | warning linked to the editor; lede on what `checkPolicy` checks; limits line; clamped inputs; threshold lines and state shapes; `Chart` exported |
| `src/styles.css` | the page's styles | warning, legend shapes, 44px targets |
| `index.html`, `src/main.tsx`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts` | the Vite app (Vitest in `node`) | none |

Compiling:

```ts
new Function("DAY", `"use strict"; return (${source}\n);`)(DAY)
```

The newline before `)` stops a trailing `//` comment from swallowing the closing bracket. Strict mode is not a sandbox: the code has the page's access to `window`, `localStorage`, `fetch` and everything else. It runs again on every change, through `useMemo` on the source, payload, event, tend day and days shown. After compiling, `compilePolicy` checks only that the result is an object with five functions and an object `thresholds`.

Running (`runLab`): compile, parse the payload and event as JSON, clamp the days shown to 1 to 730, `checkPolicy(policy, [payload], [event], T0)`, then:

```
engine = new DecayEngine(policy, new InMemoryAdapter(), () => `item-${++n}`)
id     = engine.addItem({ payload, importance: 2, costMinutes: 5 }, T0)
for day in 0..horizon:
  now = T0 + day × DAY
  if day == tendDay: try engine.tend(id, event, now) catch → tendError
  item = engine.view(now).find(id)
  record { day, health, state }; first non-alive day → weakDay; first dead day → deadDay
```

What `checkPolicy` (`packages/engine/src/check-policy.ts`) checks:

| Check name | What it does |
|---|---|
| `inputs` | `startTime` valid, at least one payload, `thresholds` pass `validateThresholds` (`0 < dead < weak ≤ 100`) |
| `init-json` | `init(payload, T0)` does not throw and survives a JSON round trip |
| `build-items` | builds the item `addItem` would store, and that item after `applyEvent(event)`; items that start dead are left out |
| `healthAt-range` | 0 to 100 at `T0` + 0, 1 min, 1 h, 1 day, 7, 30, 90, 365 and 3650 days |
| `healthAt-pure` | the same value twice at each of those times |
| `healthAt-never-increases` | never higher at a later sample time |

It never calls `nextDueAt` or `resurrect`. So a pass means the decay curve is well formed for the samples, not that every rule is right. The page and the guide now say this.

The chart: an SVG 640 × 220, scaled to its column. Grid lines at 0 and 100. Dashed lines at the policy's weak and dead thresholds, labelled "weak below N" and "dead below N". One segment per day, coloured by state. A circle at day 0, a triangle on the first weak day and a cross on the first dead day. A dashed "tended" line. Its accessible name is a summary, for example "Health of one item from day 0 to day 40: weak on day 4, dead on day 9." The legend shows the same three shapes before "alive", "weak" and "dead".

The colours `#7ee787` and `#ff6b6b` and the `system-ui` font are not from `design-tokens.md`. Policy Lab is not one of the apps that file covers, so this is recorded and not changed.

Presets:

| Preset | Thresholds | Rule | Payload | Event | Tend day | `checkPolicy` |
|---|---|---|---|---|---|---|
| Milk (straight line) | 40 / 10 | straight line to 0 over `shelfLifeDays`; event sets 60; never comes back | `{ "label": "Milk", "shelfLifeDays": 10 }` | `{ "kind": "freeze" }` | 5 | passes |
| Fact (half-life) | 50 / 15 | halves every half-life (from 3 days); event sets 100 and doubles it (max 180); always comes back | `{ "front": "Capital of Australia?" }` | `{ "correct": true }` | 2 | passes |
| Broken: health rises | 40 / 10 | `health × (1 − 0.9 × |sin(elapsed / 12 days)|)`, so health falls and climbs back | `{ "label": "Cursed item" }` | `{ "kind": "poke" }` | never | fails |

### Life Triage package (`packages/life-triage/src/index.ts`)

```ts
export const MAX_LIFE_BUDGET_MINUTES = 1440
export type AnyEngine = Pick<DecayEngine<any, any, any>, "triage">
export type Source = { label: string; engine: AnyEngine }
export function lifeTriage(sources: Source[], budgetMinutes: number, now: number): LifeTriageResult
```

1. Check the budget (integer 1 to 1440) and that the labels are distinct; throw otherwise.
2. For each source, `engine.triage(1, now)`. Its `picks` and `others` together are every weak item, each with the engine's `value` and `diesAt`. Candidates are sorted by label, then id.
3. One exact 0/1 knapsack over all candidates by whole minutes (strict `>`, so ties keep the earlier choice), then a walk back to recover the set.
4. Picks sorted by value per minute, then label, then id. Others sorted by `diesAt` (`null` last), then label, then id.
5. Even split: `share = floor(budget / sources.length)`. Each source with `share >= 1` gets the same knapsack over its own candidates. `evenSplitValue` is the sum.

The table holds `budget + 1` entries per candidate, so at most 1,441 bytes per candidate. Hundreds of candidates are fine. The package reads no clock and was not changed in Session 79.

### Life Triage app (`apps/life-triage/src/`)

| File | Role | Session 79 change |
|---|---|---|
| `load.ts` | `FACTS`, `FRIENDS`, `loadBackup(text)`, `sampleSources(now)` | none |
| `files.ts` | `readBackupFiles(files, existing)` | new: each read guarded; a replaced file says so |
| `text.ts` | every word on the page; `clampBudget`, `clampAhead`, `nameOf`, `fateOf`, `detailOf`, `MAX_AHEAD_DAYS` (365) | new |
| `App.tsx` | file input, sample button, budget and look-ahead, result | uses `files.ts` and `text.ts`; limits line; notes when a value is clamped; optional `now` prop |
| `styles.css` | the page's styles | 44px targets |
| `index.html`, `main.tsx`, `netlify.toml`, `package.json`, `tsconfig.json`, `vite.config.ts` | the Vite app (Vitest in `node`) | none |

`loadBackup` accepts JSON with a `snapshot`, a numeric `version` of at most 1, and `app` `"study-dungeon"` or `"ghosted"`. It builds a real engine on an adapter whose `load` returns a copy of the snapshot and whose `save` does nothing. The policies are imported from the apps' own `policy.ts` files. A Study Dungeon backup is always read with the doubling policy, because the backup does not record the model. The page says so.

Words on a row: a person "goes dark today / tomorrow / in N days" or is "not going dark within 10 years", and picks show "freshness". A fact "dies …" or is "not dying within 10 years", and picks show "health".

The limits line:

> Budget 1 to 1,440 minutes. Look ahead 0 to 365 days. Backups up to version 1; one file per app, and a later file replaces an earlier one. Study Dungeon backups are read with its default rules (each right answer doubles the half-life), even if you chose the memory model there. Anything more than 10 years away shows as not within 10 years.

Sample data: five facts (Canberra, 1989, `1/x`, Au, Jupiter) and four people (Maya, Dev, Priya, Sam), created 4 to 41 days before `now`.

### Policy guide (`docs/ADDING_A_POLICY.md`)

Five sections: the contract table, the milk example, connecting it, what the engine gives, and checking it. Session 79 changes:

- The connect example uses `importance: 2`, and a sentence states the allowed importance (1 to 3) and cost (1 to 600).
- A pointer after the milk example to Policy Lab, with the trust note.
- Section 5 says what `checkPolicy` checks, and that it does not check `nextDueAt` or `resurrect`.

## Data Models

```ts
// apps/study-dungeon/src/policy.ts (shared by both policies)
type FactPolicyData = {
  halfLifeDays: number  // 1 to 180
  difficulty?: number   // 1 to 10; kept only by the memory model, read as 5 when missing
}
type ModelName = "doubling" | "memory"
// localStorage: "decay-engine:study-dungeon:model" = "memory", or no key for doubling

// apps/policy-lab/src/lab.ts
type Sample = { day: number; health: number; state: "alive" | "weak" | "dead" }
type LabResult =
  | { ok: false; error: string }
  | {
      ok: true
      thresholds: { weak: number; dead: number }
      check: { passed: boolean; failures: string[] }
      series: Sample[]
      weakDay: number | null
      deadDay: number | null
      tendError: string | null
    }

// packages/life-triage/src/index.ts
type LifeCandidate = {
  source: string; id: string; payload: unknown
  health: number; importance: number; costMinutes: number
  value: number; diesAt: number | null
}
type LifeTriageResult = {
  picks: LifeCandidate[]; others: LifeCandidate[]
  totalValue: number; totalMinutes: number; evenSplitValue: number
}

// A backup file (both apps)
type Backup = { app: "study-dungeon" | "ghosted"; version: number; exportedAt: string; snapshot: unknown }
```

The memory model's rules:

| Member | Memory model | Doubling policy, for comparison |
|---|---|---|
| `thresholds` | weak 60, dead 10 | same |
| `init` | half-life new 2 / shaky 5 / solid 10 days; difficulty new 7 / shaky 5 / solid 3 | same half-life, no difficulty |
| `healthAt` | `health × 0.5^(max(0, now − lastEventAt) / (halfLife × DAY_MS))` | same |
| right answer | health 100; half-life `grownHalfLife(h, d, health/100)`; difficulty `d − 0.3` | health 100; half-life `2h` |
| wrong answer | health 45; half-life `0.4h`; difficulty `d + 1` | health 45; half-life `h/2` |
| clamps | half-life 1 to 180; difficulty 1 to 10 | half-life 1 to 180 |
| `nextDueAt` | `null` if dead; `now` if below 60; else `lastEventAt + h × DAY_MS × log2(health / 60)` | same |
| `resurrect` | right answer: `{ ok: true }` (policy data kept); wrong: refused | same |

```
grownHalfLife(h, d, r):
  forgotten = 1 − clamp(r, 0, 1)
  ease      = (11 − d) / 10            // 1.0 at d = 1, 0.1 at d = 10
  spacing   = e^(0.9 × forgotten) − 1  // 0 when nothing was forgotten
  growth    = 1 + 1.6 × ease × h^−0.2 × spacing × 3
  result    = clamp(h × growth, 1, 180)
```

Worked examples, by hand:

- `h = 5, d = 5, r = 0.95`: spacing ≈ 0.0460, `5^−0.2` ≈ 0.7248, growth ≈ 1.096, half-life ≈ 5.48 days.
- `h = 5, d = 5, r = 0.55`: spacing ≈ 0.4993, growth ≈ 2.042, half-life ≈ 10.21 days.
- `r = 1`: growth is exactly 1, and the half-life stays as it was.

Switching back: the doubling policy's `applyEvent` returns `{ halfLifeDays }` only. So a memory-model fact answered under the doubling policy loses its difficulty, and is read as 5 if the memory model is turned on again. This is kept as it is and pinned by a test (task 2.6). Changing it would need `policy.ts`, Claude Code's file, and the developer's decision.

## Correctness Properties

Each property runs with fixed times, never the clock (`no-fake-tests.md`). They match `requirements.md`.

- **P1 (memory model bounds):** over any run of right and wrong answers at any gaps, the half-life stays from 1 to 180 and the difficulty from 1 to 10. fast-check, default runs, in `policy-memory.test.ts` (built before this spec).
- **P2 (memory model spacing):** for any half-life in 1 to 180, difficulty in 1 to 10 and recalled shares `r1 ≤ r2`, `grownHalfLife(h, d, r1) ≥ grownHalfLife(h, d, r2) ≥ h`, capped at 180. fast-check with `{ numRuns: 200 }`.
- **P3 (Life Triage optimum):** for generated sources and budgets, the total value equals a brute force over every subset of the engines' own candidates, and the picks fit the budget. fast-check with `{ numRuns: 100 }`, after a coverage check that weak items occur from both decay shapes.
- **P4 (Life Triage against the even split):** `totalValue ≥ evenSplitValue − 1e-9`. fast-check with `{ numRuns: 100 }`.
- **P5 (Policy Lab determinism):** every preset gives equal results on two runs, for tend days and windows across 0 to 730. A fixed grid of 72 cases, not fast-check, because Policy Lab has no fast-check dependency and adding one would change the lockfile.

## Error Handling

| Where | Problem | What happens |
|---|---|---|
| Memory switch | storage throws on save | no reload, nothing saved; the live region says "This choice could not be saved in this browser, so nothing changed." |
| Memory switch | storage throws on read | the doubling policy is used |
| `memoryPolicy.init` | unknown knowledge level | throws an error that names the level |
| Policy Lab compile | syntax error or a throw | the message is shown with `role="alert"`; no chart |
| Policy Lab compile | not an object, missing function or `thresholds` | "The text must be one object…", "Missing function: init", "Missing thresholds: { weak, dead }" |
| Policy Lab inputs | bad JSON | "Payload is not valid JSON." / "Event is not valid JSON." |
| Policy Lab inputs | days or tend day out of range | clamped to 1 to 730 and 0 to 730; an empty tend day means never |
| Policy Lab run | the tend throws (for example on a dead item) | "Tend failed: …" shown; the curve is still drawn |
| Policy Lab run | any other throw from the engine or the policy | shown as the error, no chart |
| Policy Lab run | an endless loop in the user's code | not handled: the tab freezes. The warning says so |
| `lifeTriage` | budget not an integer 1 to 1440, or duplicate labels | throws; the App shows the message with `role="alert"` |
| Life Triage inputs | budget or look-ahead out of range | clamped to 1 to 1440 and 0 to 365, with a note saying which value is used |
| Life Triage files | a file cannot be read | "`<name>`: this file could not be read."; the other files still load |
| Life Triage files | not JSON, another app, a newer version, a damaged snapshot | the file is listed with the reason from `loadBackup`; the loaded sources do not change |
| Life Triage files | a second file for the same app | it replaces the first, and the note ends "(replaces the earlier file)" |

## Testing Strategy

Tests follow `testing.md` and `no-fake-tests.md`: they check behaviour, use fixed times, and catch no errors to pass. Expected values were worked by hand, not copied from output.

| Requirement | Test file | What it checks |
|---|---|---|
| 1 | `scripts/check.sh`; `packages/life-triage/src/source.test.ts` | the engine check; the package imports only `@decay-engine/engine`, reads no clock, and calls only `triage` |
| 2 | `apps/study-dungeon/src/policy-memory.test.ts` | `checkPolicy`, the curve, spacing, difficulty, a wrong answer, old facts, P1, P2, the worked examples, `nextDueAt`, `resurrect`, `init`, switching back and forth |
| 3 | `policy-memory.test.ts`; `App.memory-model.test.tsx` | selection; on and off save and reload once; a failed save gives no reload and the message |
| 4 | `components/MemoryModelToggle.test.tsx`; `components/FightDialog.model.test.tsx` | the exact help text and no research or proof words; the fight texts and half-lives under each model |
| 5, 6 | `apps/policy-lab/src/lab.test.ts` | compile errors, the presets, bad JSON, clamps, weak on day 4 and dead on day 9 for the fact preset, a tend past the window, a tend on a dead item, thresholds, P5 |
| 7, 8, 5.12, 15.2 | `apps/policy-lab/src/page.test.tsx` | the warning and its link to the editor, the `checkPolicy` text (no "sound"), the limits, the labels, the threshold lines, the chart's name and shapes |
| 9 | `packages/life-triage/src/life-triage.test.ts`; `life-triage.property.test.ts` | the brute-force case, even split, one source, determinism and errors; coverage, P3, P4, order, a three-source odd budget |
| 10 | `apps/life-triage/src/load.test.ts`; `files.test.ts` | sample data and refusals; real backups load; an unreadable file; a replaced file; a refused file changes nothing |
| 11 | `apps/policy-lab/src/guide.test.ts` | the guide's milk object compiles, passes `checkPolicy` and matches the preset; the connect example is accepted; the link and the `checkPolicy` text |
| 12, 15.3 to 15.5 | `apps/life-triage/src/text.test.ts`; `page.test.tsx` | "goes dark" for people and "dies" for facts; no banned words on any person row; clamps and notes; the limits on the page |
| 13 | each `source.test.ts`, and `memory-model.source.test.ts` | no network calls in the code; `index.html` loads nothing from another host; each scan has a self-test |
| 14 | each app's `source.test.ts` | 44px targets, a visible focus outline, no animation |

Browser checks: Kiro CLI with the Playwright MCP, on the live sites after a redeploy, a draft deploy (`netlify deploy --build`, never `--prod`) or a server the developer starts. Kiro never starts a server. Sizes 1280×800, 390×844 and 320×640, with fresh storage each run. A pass fixes nothing and records its measurements in `docs/KIRO_LOG.md`. The Netlify badge on the live sites can cover controls at the bottom right (Sessions 76 and 77). A pass records it and does not count it as an app failure.

- **Memory model** (task 2.7): the switch's name, help text and size (switch and label); turning it on reloads and keeps the facts; a right answer says "half-life longer"; turning it off; no network request.
- **Policy Lab** (task 3.6): each preset's verdict and curve; a syntax error; bad JSON; a tend on a dead item; the warning; the threshold lines and shapes; Tab order and focus rings; 44px targets; no request after load.
- **Life Triage** (task 4.6): sample data; people rows say "goes dark"; a real backup from each live app; a second file for the same app; a non-JSON file; budgets of 0 and 2000 and a look-ahead of 400; focus rings; 44px targets; no request.
- **Guide**: no browser pass; `guide.test.ts` covers it.

## Authorship

The developer settled this in Session 80 (task 7.1). Kiro wrote `apps/study-dungeon/src/policy-memory.ts`, and the developer chose its formula and constants. `.kiro/steering/authorship.md` records it as "Exception: Study Dungeon's memory model", together with the `difficulty?` field Kiro added to `policy.ts` (Claude Code's file). The `policy-reviewer` agent has not been run on the memory model yet (task 7.2).

Who chose the example rules in Policy Lab's presets and the guide's milk example is not recorded. They are examples, not app policies.
