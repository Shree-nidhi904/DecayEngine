# Implementation Plan: Ghosted

## Overview

Ghosted is a keep-in-touch app built on the Decay Engine. Each person is a window on a night street, and the light shows connection freshness: it falls in a straight line from the last contact and reaches 0 at three times the person's rhythm. A text adds 40, a call or meet-up lights the window fully, and a dark window comes back fully lit on a reconnect.

The plan runs in seven groups. Each group ends with a checkpoint task that runs `bash scripts/check.sh`. **The developer runs every checkpoint in WSL, because Kiro's shell cannot run commands on this setup.**

- **0. Policy and sentences:** `policy.ts` is written by Kiro (0.2, done); `autopsy-sentences.ts` was written by Claude Code outside Kiro (0.3, done).
- **A. Shell additions:** three optional props, each with its own new test file (design section 3).
- **B. App skeleton and checks:** package, Vite and React entry, fonts, copied modules, the engine-unchanged check.
- **C. Policy tests:** generators, coverage check, outcome tests, properties (design section 7).
- **D. Components, sample data and window art.**
- **E. Dock, forecast, backup, import, first run, wording and contrast tests, README.**
- **F. Final checkpoint:** full check, manual checks, screenshots.

**Authorship.** `apps/ghosted/src/autopsy-sentences.ts` was written by Claude Code at the developer's request, outside Kiro (`authorship.md`); Kiro never creates, edits or "fixes" it. `apps/ghosted/src/policy.ts` is written by Kiro (task 0.2) as a documented exception in `authorship.md`, from Requirements 1 to 4 and design section 2.2 only. Kiro also writes their tests, plus the shell additions, the UI, the app glue, the styles and the checks. If a test seems to need either file changed, Kiro stops and reports it.

**Engine.** No task changes `packages/engine/`. If one seems to need it, stop and report it (`engine-boundary.md`, Requirement 29.3).

## Tasks

- [x] 0. Policy and sentences (0.2 is written by Kiro; 0.3 by Claude Code outside Kiro)
  - [x] 0.1 Engine-unchanged baseline (no task needed)
    - Dropped: the check derives the "before" state from git history (design section 8.1), so nothing is recorded and nothing has to be done before other tasks start
    - _Requirements: 29.2_

  - [x] 0.2 Write the Ghosted policy (KIRO, from the spec; documented exception in `authorship.md`)
    - Replace the scaffold `apps/ghosted/src/policy.ts` (today every function throws and the thresholds are `NaN`)
    - Add `relationship: string` to `PersonPayload` (0-40 chars, `""` = no tag), as in the Type Contract
    - Export exactly the names in design section 2.1: `PersonPayload`, `PersonPolicyData`, `ContactEvent`, `Person`, `ghostedPolicy`
    - Implement the contract table in design section 2.2: thresholds `{ weak: 60, dead: 10 }`; `init`; straight-line `healthAt` that never reads `item.lastEventAt` or `item.health`; text `min(100, h + 40)` with `lastContactAt = now − (100 − health) / 100 × T`; call and meet-up 100 with `lastContactAt = now`; `nextDueAt` as `L + 2 × T / 5`, `now` or `null`; `resurrect` always `{ ok: true, policyData: { lastContactAt: now } }`
    - _Requirements: 1, 2, 3, 4_

  - [x] 0.3 Write the cause-of-death sentences (written by Claude Code at the developer's request, outside Kiro)
    - Create `apps/ghosted/src/autopsy-sentences.ts` with `generateCauseSentences(report, payload, options?)` and `CauseSentenceOptions`, as in design section 2.3
    - Sentences such as "After the last call there was no contact for 84 days, about 3 times your usual rhythm."
    - For a person added already dark (`report.lifeStartedAt === report.diedAt`, no tends): the whole-day gap from `payload.lastContactAt` to `report.diedAt`, at least 1 day, never "0 days". Open issue 3.3 (floor or round) is the developer's call; task 3.6 tests floor unless told otherwise
    - Ghosted wording rules: no "doesn't care", "ignored you", "ghosted you", nothing that blames either person
    - Optional, for open issue 3.2: give Kiro the expected sentences for two or three fixed reports, so task 3.6 can add exact-sentence tests as Study Dungeon has
    - _Requirements: 19.3, 19.4, 19.6, 31.1, 31.2_

  - [x] 0.4 Checkpoint: developer tasks done
    - The developer runs `bash scripts/check.sh` in WSL; every existing step passes (Ghosted is not in `check.sh` until task 2.10)
    - Also run `pnpm --filter @decay-engine/ghosted typecheck`; the new `policy.ts` and `autopsy-sentences.ts` type-check
    - **What waits for this group:** group A needs nothing before it. Every test in groups B to F that builds an engine with `ghostedPolicy` (tasks 2.4, 2.6, 2.7 and everything in C, D and E) waits for 0.2. Tasks 3.6, 4.11 and 5.8 also wait for 0.3. Until then those tests fail, they are not skipped (`no-fake-tests.md`, design open issue 3.1)

- [x] 1. Group A: Shell additions (each an optional prop whose default keeps today's behaviour)
  - [x] 1.1 TimeMachine: range and jumps
    - Edit `packages/shell/src/components/TimeMachine.tsx` only as in the table in design section 3.1: optional `maxDays` and `jumpDays`; `maxMs` used by the slider `max`, Play's end and every `clampOffset` call; jump buttons from `jumpDays` in the given order; an invalid `maxDays` (0, −1, 1.5, NaN) falls back to 60
    - Keep every exported constant's name and value (`TIME_MACHINE_MAX_DAYS`, `TIME_MACHINE_JUMP_DAYS`, `TIME_MACHINE_MAX_OFFSET_MS`, `TIME_MACHINE_STEP_MS`, `TIME_MACHINE_PLAY_MS`)
    - Create `packages/shell/src/components/TimeMachine.range.test.tsx`: slider `max` for 365 days; buttons 30, 90, 180, 365 in order with their offsets; `onChange` clamped at 365 days; Play ends at 365 days with fake frames and a fake clock; reduced-motion Play jumps to 365 days; the invalid-`maxDays` fallbacks
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x] 1.2 TriagePanel: budget choices
    - Edit `packages/shell/src/components/TriagePanel.tsx` only as in design section 3.2: optional `budgets` and `defaultBudget`; `choices`, `fallback` and `initial` exactly as the design's code block; without `budgets` the two `useState` initial values are the same as today (including today's quirk with an `initialBudget` outside `[5, 10, 20]`)
    - `TRIAGE_BUDGETS` stays `[5, 10, 20]`
    - Create `packages/shell/src/components/TriagePanel.budgets.test.tsx`: 15, 30, 60, 120 plus custom, in order; no `defaultBudget` selects 15; `defaultBudget={60}` selects 60; `initialBudget={30}` runs triage once with 30; `initialBudget={10}` runs nothing and selects the fallback; a custom budget still obeys `maxBudgetMinutes`
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

  - [x] 1.3 AutopsyDialog: contact markers
    - Edit `packages/shell/src/components/AutopsyDialog.tsx`, `packages/shell/src/types.ts` and `packages/shell/src/index.ts` only as in design section 3.3: new `AutopsyMarker` type; optional `markers`, `renderMarker`, `markerSummary`; optional `markers` field on `AutopsyChartSummary`; `data-marker={kind}` groups; one `data-legend-marker={kind}` entry per kind in first-appearance order; right/wrong marks and legend entries not drawn when `markers` is given
    - `tends` stays required
    - Create `packages/shell/src/components/AutopsyDialog.markers.test.tsx`: one `data-marker` group per marker inside the span and none outside it; three legend entries with their labels; no right/wrong legend entries; the aria-label built by `chartLabel` with `summary.markers === "3 calls, 2 messages, 1 meet-up"` and `right === 0`; the default circle when `renderMarker` is omitted
    - _Requirements: 28.1, 28.2, 28.3, 28.4_

  - [x] 1.4 AutopsyDialog: focus on the content
    - Edit `packages/shell/src/components/AutopsyDialog.tsx`: optional `focusContentOnOpen` (default `false`), `titleRef` on the `h2`, `tabIndex={-1}` only when the prop is set, focus after `showModal()` (design section 3.3, "Focus on open")
    - Create `packages/shell/src/components/AutopsyDialog.focus.test.tsx`: with the prop, `document.activeElement` is the title `h2` and it has `tabindex="-1"`; without it, the title has no `tabindex` and does not have focus
    - _Requirements: 28.5, 24.2_

  - [x] 1.5 Checkpoint: shell additions
    - The developer runs `bash scripts/check.sh` in WSL; every step passes, including the existing shell and Study Dungeon tests
    - The developer also runs `pnpm -r typecheck`
    - `bash scripts/check.sh` includes the "engine unchanged" step (design section 8): it fails on any change under `packages/engine` and on any shell file outside Requirements 26 to 28, including every existing shell test. The four new test files are the only new shell tests
    - If an existing test fails, fix the shell change, never the test (design section 3.4)
    - _Requirements: 26.5, 27.4, 28.4, 28.5, 29.4_

- [x] 2. Group B: App skeleton and checks
  - [x] 2.1 Package, Vite and HTML entry
    - Edit `apps/ghosted/package.json`: scripts `dev`, `build`, `preview`, `test`, `typecheck`, modelled on `apps/study-dungeon/package.json`; dependencies `@decay-engine/engine`, `@decay-engine/shell`, `react`, `react-dom`, `@fontsource/monoton`, `@fontsource/josefin-sans`, `@fontsource/spectral`, `@fontsource/ibm-plex-mono`; dev dependencies `fast-check` (`^4.10.2`), `@testing-library/react`, `jsdom`, `@vitejs/plugin-react`, the React types, `typescript`, `vitest` (versions as Study Dungeon's)
    - Edit `apps/ghosted/tsconfig.json`: `jsx` and the DOM lib, strict mode kept
    - Create `apps/ghosted/vite.config.ts`: `base: "/"`, React plugin, `test.environment: "jsdom"`, `test.testTimeout: 20000`
    - Create `apps/ghosted/index.html`: title "Ghosted", root element, no remote font links, no remote URLs
    - _Requirements: 32.1, 32.3, 32.4, 23.2, 30.2_

  - [x] 2.2 Fonts, tokens and theme
    - Create `apps/ghosted/src/styles/tokens.css` with every Ghosted token from `design-tokens.md` (including the scenery tokens), plus `--lit` and `--age`. Then delete the scaffold `apps/ghosted/src/skin.css` (design section 1.4)
    - Create `apps/ghosted/src/styles/global.css`: base page styles, Spectral body text, IBM Plex Mono labels, `:focus-visible` outline in `--sign` (design section 5.4)
    - Create `apps/ghosted/src/theme.ts`: `ghostedTheme` (tokens) and `ghostedShellTheme`, the shell role mapping in design section 5.2
    - In `apps/ghosted/src/main.tsx` (task 2.8) import the four `@fontsource` packages; no font is loaded from `fonts.googleapis.com` or `fonts.gstatic.com`
    - _Requirements: 30.1, 30.2, 30.3, 24.5_

  - [x] 2.3 Wording and time helpers
    - Create `apps/ghosted/src/wording.ts`: every interface string in one place, and `ghostedWording` for the shell's `WordingProps`. It includes the list names (Still lit, Fading, Empty windows), the state words (lit, lit again, flickering, boarded up), `timeMachine.jump(365)` → "+1 year", the Triage steps, `markerSummary`, and `markRight`/`markWrong` filled with "Message"/"Call" (design open issue 2.8). Later tasks add their strings here
    - Create `apps/ghosted/src/time.ts` (`DAY_MS`, `dayStartOf(isoDate, timeZone)`, `wholeDaysBetween`) and `apps/ghosted/src/time.test.ts` with fixed timestamps and `timeZone: "UTC"`
    - _Requirements: 31.1, 31.3, 16.1, 12.1_

  - [x] 2.4 Copy the engine instance, storage errors, write guard and ticking
    - Create, each with a header comment naming the Study Dungeon file it was copied from (design section 1.3): `apps/ghosted/src/engine-instance.ts` (`GhostedEngine`, namespace `"ghosted"`), `storage-errors.ts` (Ghosted sentences only), `write-guard.ts` (copied, plus `runGatedWrite(previewing, write, onProblem): WriteOutcome`, design section 4.2), `ticking.ts` (unchanged)
    - Create the tests: `engine-instance.test.ts` (snapshot under `decay-engine:ghosted` in jsdom's `localStorage`), `storage-errors.test.ts`, `write-guard.test.ts` (`runGatedWrite` returns "blocked" without calling `write`, "saved", "storage-problem", and rethrows other errors), `ticking.test.ts`
    - No import from `apps/study-dungeon`
    - _Requirements: 23.1, 23.3, 12.5, 21.1_

  - [x] 2.5 Copy the first-run flags
    - Create `apps/ghosted/src/first-run.ts` as in design section 1.3: `STARTED_FLAG`, `ENGINE_STORAGE_KEY`, new `OWN_PEOPLE_FLAG` with `hasOwnPeople` and `markOwnPeople`, `RESET_KEYS` exactly Ghosted's three keys, `needsFirstRun`, `resetAllData`; no tour flags
    - Create `apps/ghosted/src/test/fake-storage.ts` (in-memory `FlagStorage`) and `apps/ghosted/src/first-run.test.ts`: `RESET_KEYS` are exactly Ghosted's keys; reset leaves other apps' keys alone; `needsFirstRun` after "Start empty" with no people is false
    - _Requirements: 20.7, 15.2_

  - [x] 2.6 Person form rules
    - Create `apps/ghosted/src/person-form.ts` as in design section 1.3: the limits, `PersonField`, `FieldError`, `validatePerson`, and `startsDark`, which calls `ghostedPolicy.healthAt` on the provisional item and never repeats its formula
    - Create `apps/ghosted/src/person-form.test.ts`: each rule at and beyond its limit (name 1-60, relationship 0-40, rhythm whole 1-365, last contact not after today, importance 1-3, minutes whole 1-600), each error naming its field and rule; `startsDark` false at exactly `2.7 × rhythm` days and true one minute later
    - _Requirements: 17.1, 17.3, 17.7_

  - [x] 2.7 Copy backup and import modules
    - Create `apps/ghosted/src/backup.ts` (copy of `backup.ts`, design section 1.3): `{ app: "ghosted", version: 1, exportedAt, snapshot }`; `checkBackup` builds a real engine with `ghostedPolicy` on a throwaway adapter; the reasons not JSON, another app, not a Ghosted backup, newer version, damaged; `applyBackup` also sets `OWN_PEOPLE_FLAG`
    - Create `apps/ghosted/src/import-people.ts` (copy of `import-facts.ts`): signature in design section 1.3, `IMPORT_IMPORTANCE = 2`, `IMPORT_COST_MINUTES = 10`, lines checked with `person-form.ts`, blank and `#` lines ignored, no duplicate-name skip (design open issue 1.5)
    - Create `apps/ghosted/src/backup.test.ts` (file shape, each refusal reason, a damaged snapshot refused by the real engine, nothing changed on refusal) and `apps/ghosted/src/import-people.test.ts` (`|`, tab and CSV; optional relationship and date; the import day as the default date; importance 2 and 10 minutes; 1-based line numbers with reasons; valid lines kept)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 17.1_

  - [x] 2.8 Root, crash screen, dialogs hook and the App frame
    - Create `apps/ghosted/src/Root.tsx` (copy, plus the `session` prop), `src/components/ErrorBoundary.tsx` and `src/styles/problem.css` (copies, Ghosted wording and tokens), `src/components/useModalDialog.ts` (copied unchanged), `src/main.tsx` (fonts, renders `Root`)
    - Create `apps/ghosted/src/App.tsx` with the frame from design section 4.3: `AppProps`; `realNow`, `previewOffsetMs`, `previewing`, `now`; the `previewing` ref read by every write through `runGatedWrite`; `useSettleTicks` with the once-per-problem tick handler; `version`; the `OpenDialog` union (one dialog at a time); the polite live region; `<header>`, `<main>` and a dock slot. Components are wired in by later tasks
    - Create `apps/ghosted/src/test/fixtures.ts` (`T0 = 1_700_000_000_000`, day offsets, `makeEngine()` on `InMemoryAdapter`, `counterIds()`) and `src/test/recording-adapter.ts` (counts `save` calls, keeps the last snapshot as JSON)
    - Create `apps/ghosted/src/Root.test.tsx`: a corrupt snapshot shows the problem screen with Reload and Reset; no usable storage shows its sentence; another error reaches the crash screen
    - _Requirements: 32.1, 23.3, 24.2, 24.3_

  - [x] 2.9 Boundary and source checks
    - Create `apps/ghosted/src/shell-boundary.test.ts` exactly as design section 3.5 (reads, never imports, the non-test shell sources; fails on any Ghosted word or colour name)
    - Create `apps/ghosted/src/app-boundary.test.ts`: no import from `apps/study-dungeon`; no `Date.now()`, argument-less `new Date()` or real-time fake timers in any Ghosted test file
    - Create `apps/ghosted/src/no-network.test.ts`: no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or remote URLs in `src/` and `index.html`
    - Create `apps/ghosted/src/config.test.ts`: the five `package.json` scripts, the four `@fontsource` dependencies, `vite.config.ts` `testTimeout: 20000` and `base: "/"` (the README check is added in task 5.10)
    - _Requirements: 21.1, 23.2, 29.4, 30.2, 32.1, 32.3, 32.4_

  - [x] 2.10 Ghosted steps in the check script
    - `scripts/check-engine-unchanged.sh` and the "engine unchanged" step in `scripts/check.sh` already exist (written and tested outside Kiro, design section 8.2). Do not rewrite them
    - Add the three Ghosted steps from design section 8.3 to `scripts/check.sh`: "typecheck ghosted", "test ghosted", "build ghosted". No existing line changes
    - Add a short test or script note proving the Ghosted steps fail the script when a Ghosted step fails (design section 7)
    - _Requirements: 29.1, 29.2, 29.4, 32.2_

  - [x] 2.11 Checkpoint: app skeleton
    - The developer runs `bash scripts/check.sh` in WSL. Every step passes, including the four new ones, and "engine unchanged" prints its success line
    - The developer runs `pnpm --filter @decay-engine/ghosted dev` once: the empty frame renders, and the browser's Network tab shows no request to another origin
    - _Requirements: 29.2, 32.1, 32.2, 23.2_

- [x] 3. Group C: Policy tests (wait for task 0.2; task 3.6 also waits for 0.3)
  - [x] 3.1 Generators
    - Create `apps/ghosted/src/test/generators.ts` as design section 7.1: `T0`, `MINUTE_MS`, `HOUR_MS`, `DAY_MS`, `spanMs`, `rhythmDays()`, `contactEvent()`, `AddSpec`, `Step`, `Scenario`, `scenario()`, `buildScenario`, `personAt`, `livingPerson()`, `deadPerson()`, `startedDark()`. All times are `T0` plus whole minutes; a step on a dead person is a reconnect
    - _Requirements: 5.8_

  - [x] 3.2 Generator coverage check
    - Create `apps/ghosted/src/generator-coverage.test.ts` with the four checks in design section 7.2: each state at least 10% of 300 people (seed 42); each contact kind at least 10% of steps (seed 7); at least 5% of scenarios contain a reconnect (seed 9); whole-minute, non-decreasing times (seed 11)
    - If a check fails, fix the generator, never the threshold
    - _Requirements: 5.8_

  - [x] 3.3 Policy unit and outcome tests
    - Replace each `it.todo` stub in `apps/ghosted/src/policy.test.ts` with a real test; no stub is deleted without one taking its place (design section 1.4)
    - Contract: `checkPolicy(ghostedPolicy, payloads, events, T0)` with rhythms 1, 30, 365, last contact at `T0` and 10 days before, all three kinds, `failures` equal to `[]`; thresholds `{ weak: 60, dead: 10 }`
    - Functions: `init`; `healthAt` at days 0, 36, 37, 81, 82, 90 for a 30-day rhythm, 100 for a future last contact, unaffected by `lastEventAt` and `health`; `applyEvent` per kind; every `nextDueAt` branch, including `state: "dead"`; `resurrect` per kind
    - Outcomes through the engine: every row of the table in design section 7.4 (day 36 `toBe(60)`, day 37 within 1e-9 of 100 × 53 / 90, day 81 `toBe(10)`, day 82 dead, `diedAt` and the alive→weak entry within one minute after the crossing, the text and call cases on day 45, the reconnect on day 90)
    - If an expected value fails, stop and report it to the developer. Never change the expected value, and never touch `policy.ts`
    - _Requirements: 1.1-1.7, 2.1-2.4, 3.1-3.3, 4.1-4.3, 5.1-5.8_

  - [x] 3.4 Properties 1 to 9
    - Create `apps/ghosted/src/policy.properties.test.ts` with one `fc.assert` per row 1 to 9 of the table in design section 7.3, each named `// Feature: ghosted, Property N: …`, with that row's generator and `numRuns` (200, 100, 200, 100, 200, 200, 100, 300, 100)
    - _Requirements: 1.3-1.7, 2.1-2.4, 3.1-3.3, 4.1-4.3_

  - [x] 3.5 Property 12 at the gate
    - Create `apps/ghosted/src/write-guard.properties.test.ts`: any sequence of writes with `previewing: true` returns "blocked" and never calls `write`, `{ numRuns: 1000 }` (the app-level half is task 5.5)
    - _Requirements: 12.5_

  - [x] 3.6 Autopsy sentence tests and Property 13
    - Create `apps/ghosted/src/autopsy-sentences.test.ts`: reports built through the real engine (`InMemoryAdapter`, fixed times, `timeZone: "UTC"`). It checks facts and rules (design open issue 3.2): the day counts, the kind of the last contact, the rhythm ratio, the started-dark gap, no banned words, no "0 days". Exact-sentence tests are added only if the developer supplies the expected sentences (task 0.3)
    - Create `apps/ghosted/src/started-dark.test.ts`: Property 13 with `startedDark()`, `{ numRuns: 100 }`, asserting row 13 of design section 7.3 (dead at creation; `created` then `died` at `addAt`; `lifeStartedAt === diedAt` and no tends; the sentences contain `${floor(gapMs / DAY_MS)} days` and never match `/\b0 days\b/`)
    - Do not edit `autopsy-sentences.ts`. If a test shows a bug, stop and report it
    - _Requirements: 19.3, 19.4, 19.6, 20.8, 31.2_

  - [x] 3.7 Checkpoint: policy tests
    - The developer runs `bash scripts/check.sh` in WSL; every step passes
    - **Where the other properties live:** Properties 10 and 11 render components, so they are written with the Window and PersonCard (tasks 4.1 and 4.2). The app-level half of Property 12 needs every write control, so it is task 5.5. The sample expectations of design section 7.5 need `sample-data.ts`, so they are task 4.13. Each test comes right after the code it checks, so every checkpoint can pass
    - _Requirements: 1, 2, 3, 4, 5_

- [x] 4. Group D: Components, sample data and window art
  - [x] 4.1 State glyphs, window and house art
    - Create `apps/ghosted/src/components/icons.tsx`: circle, triangle and cross state glyphs (`data-glyph`, `aria-hidden`, `currentColor`) and the contact marker shapes (envelope, diamond, two dots) from design section 5.2
    - Create `apps/ghosted/src/components/Window.tsx` (`WindowProps`, `--lit = health / 100` to 4 decimals, `data-state`, silhouette unless dead, two boards when dead or falling) and `apps/ghosted/src/components/House.tsx` (house roof and body around its windows)
    - Create `apps/ghosted/src/styles/window.css` and `apps/ghosted/src/styles/street.css` from design section 5.1, colours from tokens only
    - Create `apps/ghosted/src/styles/motion.css` with one `@media (prefers-reduced-motion: no-preference)` block: window flicker, pane light transition, boards falling, relight flash (design section 5.3). Static end states go outside the block
    - Create `apps/ghosted/src/lists.ts` with `shownState(person)` (`litAgain` when alive and `timesResurrected > 0`)
    - Create `apps/ghosted/src/components/Window.test.tsx` (dead: boards, no silhouette; weak: `data-state="weak"`) and `apps/ghosted/src/components/Window.property.test.tsx` (Property 10, `{ numRuns: 100 }`: `--lit` within 5e-5 of `health / 100`, 0 when dead)
    - _Requirements: 16.1, 16.3, 16.4, 16.5, 25.1, 30.3_

  - [x] 4.2 PersonCard
    - Create `apps/ghosted/src/components/PersonCard.tsx` with `PersonActions` and `PersonCardProps` from design section 4.4: name, relationship, glyph and word; "last contact N days ago" or "today"; "usual rhythm every N days"; "goes dark in N days" when weak; the window; the health bar named "Freshness N of 100" with marks at 60 and 10; buttons per state; Edit and Remove quiet and at least 44 × 44 px; the History disclosure, newest first
    - Add `lastLoggedContactAt(history, payload)` to `apps/ghosted/src/lists.ts`; it never reads `policyData.lastContactAt`
    - Freshness is shown as `Math.floor(health)`
    - Create `apps/ghosted/src/components/PersonCard.test.tsx` (each field; a text sent today reads "today"; marks at 60 and 10; Reach out for alive and weak, Reconnect and Autopsy for dead; the 44 px rule in the CSS; history order and words; write buttons `aria-disabled` with the reason when `blocked`) and `apps/ghosted/src/components/PersonCard.property.test.tsx` (Property 11, `{ numRuns: 100 }`)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 16.1, 16.2_

  - [x] 4.3 The three lists and section navigation
    - Create `apps/ghosted/src/components/ThreeLists.tsx` with `ThreeListsProps` and `SectionNavProps`: Fading, Empty windows and Still lit stacked full width, each with its lighting class and count badge; the Still lit rows with "starts fading in N days" and a quiet Open; one line in the list's own words when a list is empty
    - Add `sortFading`, the graveyard order rebuilt from `people`, the Still lit order by `ghostedPolicy.nextDueAt`, and `heroTarget` to `apps/ghosted/src/lists.ts`
    - Create `apps/ghosted/src/styles/layout.css` (page width, gutters, card grid with `minmax(min(100%, 280px), 1fr)`, single column under 760px)
    - Wire the lists and the nav into `apps/ghosted/src/App.tsx` with focusable section headings
    - Create `apps/ghosted/src/lists.test.ts` (each order and its ties by id, "starts fading in N days", `heroTarget`), `apps/ghosted/src/components/ThreeLists.test.tsx` (badges, lighting classes, empty lines) and `apps/ghosted/src/App.test.tsx` (the nav moves focus to the section's heading)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 24.7_

  - [x] 4.4 The Street
    - Create `apps/ghosted/src/street.ts` (`groupHouses`: by trimmed relationship, "Others" last, people by name then id) and `apps/ghosted/src/components/Street.tsx` (window buttons named "<name>, <state word>, freshness <n>"; the legend; the sentence that the light shows how recently you were in touch and does not measure how much anyone matters)
    - Add moths, fog and headlights to `apps/ghosted/src/styles/motion.css`, hidden outside the motion block
    - Wire the Street into `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/street.test.ts` (grouping, "Others", every person exactly once, order) and `apps/ghosted/src/components/Street.test.tsx` (names, legend glyphs and words, the sentence, activation calls `onOpen`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 16.1, 25.1_

  - [x] 4.5 Hero
    - Create `apps/ghosted/src/components/Hero.tsx` with `HeroProps` and the five cases in the table in design section 4.4, the shell `Counters` with Ghosted glyphs and list names, and the preview eyebrow with the primary button blocked
    - Wire it into `apps/ghosted/src/App.tsx`; with no people after the first run, the App renders only the hero, the toolbar, the privacy line and the dock (design section 4.4, "An empty street")
    - Create `apps/ghosted/src/components/Hero.test.tsx`: every case with its wording and plurals ("1 window is flickering"), exactly one filled button in each case, counters with glyph and list name, the preview eyebrow and the disabled reason
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 16.1, 20.1, 20.9_

  - [x] 4.6 Confirm dialog and remove
    - Create `apps/ghosted/src/components/ConfirmDialog.tsx` (Cancel first, Escape cancels, focus on the message) and `apps/ghosted/src/styles/dialogs.css`
    - Wire Remove in `apps/ghosted/src/App.tsx`: "Remove <name>? This cannot be undone.", `engine.remove` only on confirm, through `runGatedWrite`
    - Create `apps/ghosted/src/components/ConfirmDialog.test.tsx` and add to `apps/ghosted/src/App.test.tsx`: Cancel and Escape remove nothing; confirm removes; focus goes to the hero heading when the opener is gone
    - _Requirements: 13.5, 24.2, 24.3_
    - **Added from task 5.4:** ResetData (quiet button, "Reset all data? This cannot be undone.", `resetAllData` removes exactly `RESET_KEYS`, then reload) needs this ConfirmDialog. Create `components/ResetData.tsx` and its tests here, wire it into `App.tsx`, and add the reset cases to `App.first-run.test.tsx` (clears only Ghosted's keys; restarts the first run)

  - [x] 4.7 Person dialog
    - Create `apps/ghosted/src/components/PersonDialog.tsx`: the PersonCard (heading level 2) in a modal `<dialog>` with Close, through `useModalDialog`, focus on the card's heading
    - Wire it into `apps/ghosted/src/App.tsx` for the Street windows and the Still lit rows
    - Create `apps/ghosted/src/components/PersonDialog.test.tsx`: opens with focus on the heading, Escape closes, focus returns to the window that opened it
    - _Requirements: 10.4, 24.2, 24.3_

  - [x] 4.8 Reach out dialog
    - Create `apps/ghosted/src/components/ReachOutDialog.tsx` with `ReachOutDialogProps` from design section 4.4: three choices showing "Freshness a → b" from `ghostedPolicy.applyEvent` on the item from `engine.view(clock())`; `engine.tend` through `write`; the result sentence and "Reach out again by <date>…"; Cancel calls nothing; the "went dark before you reached out" case for `ITEM_ALREADY_DEAD`; one filled button at most
    - Wire it into `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/components/ReachOutDialog.test.tsx`: before and after values for each kind, `tend` called with each kind, no control that logs a contact without a kind, the result and next date, Cancel, the went-dark case, focus on the question line
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 24.2_

  - [x] 4.9 Reconnect dialog
    - Create `apps/ghosted/src/components/ReconnectDialog.tsx` with `ReconnectDialogProps`: the boarded window, "Which contact happened?", three options and Cancel, no "No reply yet"; `engine.resurrect` through `write`; boards falling, the relight flash and "<first name>'s window is lit again. Freshness is 100."
    - Wire it into `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/components/ReconnectDialog.test.tsx`: the three options and no "No reply yet"; `resurrect` with each kind; the success text; Cancel calls nothing; under reduced motion the lit window shows at once with the same text
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 4.3, 16.5, 25.2_

  - [x] 4.10 Add and edit a person
    - Create `apps/ghosted/src/components/AddEditPersonDialog.tsx` with `AddEditPersonDialogProps` from design section 4.4: the six fields from `person-form.ts`; the live "This window starts dark" hint; errors that name the field and rule, keep the input and focus the first invalid field; `addItem` with `lastContactAt` from `dayStartOf`; `edit` with only the changed fields; the read-only last contact date with "Log a contact to change this"; storage problems shown inside the form, which stays open; Save checks `previewing()` again
    - Wire "Add a person" and Edit into `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/components/AddEditPersonDialog.test.tsx` (the `addItem` payload, the hint, edit sends only changed fields, nothing sent when nothing changed, read-only date, invalid input kept, storage full keeps the form open) and add to `apps/ghosted/src/App.test.tsx` (a rhythm change shows the new freshness right after saving)
    - **Note from task 5.4 (done before this task):** "Start empty" today only marks the app as started and sets the open dialog to `{ kind: "add" }`, and `App.first-run.test.tsx` checks exactly that (through `data-dialog="add"` on `.gh-app`). This task must add the assertion "Start empty opens the Add dialog" to `apps/ghosted/src/App.first-run.test.tsx`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 23.3_
    - **Added from task 5.4:** also add the privacy-line case for an add (see 5.3)

  - [x] 4.11 Autopsy (waits for task 0.3)
    - Create `apps/ghosted/src/autopsy-chart.ts` (`buildAutopsyChart`: replay of the current life through `ghostedPolicy`, 48 samples plus points around each contact, a line from `payload.lastContactAt` to `diedAt` for a person who started dark, one marker per tend labelled "Message", "Call" or "Meet-up")
    - Create `apps/ghosted/src/components/PersonAutopsy.tsx`: the shell `AutopsyDialog` with `tends={[]}`, `markers`, `renderMarker`, `markerSummary`, `generateCauseSentences(report, payload, { timeZone })`, `focusContentOnOpen`, and Reconnect blocked during a preview
    - Wire Autopsy → Reconnect into `apps/ghosted/src/App.tsx` (the reconnect dialog takes over the autopsy's opener)
    - Create `apps/ghosted/src/autopsy-chart.test.ts` (points, markers, the started-dark line is never a single point) and `apps/ghosted/src/components/PersonAutopsy.test.tsx` (markers and legend, the summary, focus on the title, Reconnect disabled in a preview, a started-dark person shows a line and no "0 days")
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 24.2, 28_

  - [x] 4.12 Triage panel and session
    - Create `apps/ghosted/src/components/GhostedTriage.tsx` with `GhostedTriageProps` from design section 4.4: the shell `TriagePanel` with `budgets={[15, 30, 60, 120]}`, `defaultBudget={30}`, `initialBudget={30}`, `maxBudgetMinutes={1440}`; the three steps; pick text with glyph, word and name; the quiet "Today's 5-minute action" button, hidden when nobody qualifies
    - Add the session queue to `apps/ghosted/src/App.tsx` (design section 4.3): Reach out dialogs in pick order, each person looked up again, a dark or removed person skipped and named, "Stop session"
    - Create `apps/ghosted/src/components/GhostedTriage.test.tsx` (choices plus custom with 30 selected, the steps, the pick fields, "goes dark in N days", the 5-minute action quiet or hidden, Start blocked in a preview) and `apps/ghosted/src/App.session.test.tsx` (the queue in order, skipping a person who went dark or was removed)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 16.1, 27, 30.4_

  - [x] 4.13 Sample data
    - Create `apps/ghosted/src/sample-data.ts`: `SampleStep`, `SamplePerson`, `SAMPLE_PEOPLE` exactly as the 12 rows of design section 6.2, and `loadSampleData(engine, now)`, which replays adds, contacts and reconnects at whole days before `now`, then ticks at `now`
    - Create `apps/ghosted/src/sample-data.test.ts` with every row of the table in design section 7.5 (counts, freshness values within 1e-9, hero target, the three list orders, `diedAt` values, Nia lit again, Tomas started dark, Sam's three kinds, rhythms and importance levels, triage at 30 minutes, the 5-minute action, fade markers, forecast at 365, 30 and 7 days)
    - If the replay gives a different result from section 6.3, stop and report it. Never change an expected value to match
    - _Requirements: 20.3, 20.4, 20.5, 20.8, 16.2, 10.2_

  - [x] 4.14 Splash and neon sign
    - Create `apps/ghosted/src/components/NeonSign.tsx` (the page's only `h1`, "Ghosted" in `--logo` with the `--sign` glow, the tagline "People you are losing touch with") and wire it into the header in `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/splash.ts` (`SPLASH_SEEN_FLAG` in sessionStorage, `shouldShowSplash`, `markSplashSeen`) and `apps/ghosted/src/components/Splash.tsx` (six windows lighting one by one, the word as `<p aria-hidden="true">`, one primary "Walk in", focus on the tagline, Escape closes)
    - Add the sign hum and the splash light-up to `apps/ghosted/src/styles/motion.css`; the static glow sits outside the motion block
    - Wire the splash into `apps/ghosted/src/App.tsx`: shown only when `shouldShowSplash(session, prefersReducedMotion())`; closing marks it seen and focuses the hero heading
    - Create `apps/ghosted/src/components/NeonSign.test.tsx`, `apps/ghosted/src/splash.test.ts` (fake session, reduced motion, `null` session) and `apps/ghosted/src/components/Splash.test.tsx` (six panes, Walk in, Escape)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 24.2, 25.1_
    - **Added from task 5.4:** add to `App.first-run.test.tsx` the splash cases: a loaded sample street in two clicks from first load ("Walk in", then "Load sample street"), focus moves to the hero heading after the splash, and no splash after a reload in the same tab

  - [x] 4.15 Checkpoint: components
    - The developer runs `bash scripts/check.sh` in WSL; every step passes
    - The developer runs `pnpm --filter @decay-engine/ghosted dev` and looks at the splash, the street, a card and each dialog once

- [x] 5. Group E: Dock, forecast, backup, import, first run, wording and contrast, README
  - [x] 5.1 Moon-clock dock
    - Create `apps/ghosted/src/timeline.ts` (`DockMarker`, `dockMarkers` at `realNow`: fade times from `ghostedPolicy.nextDueAt`, dark times from `engine.forecast(today, 365 × DAY_MS)`, `0 < day ≤ 365`, sorted by time then id)
    - Create `apps/ghosted/src/components/MoonDock.tsx` (`MoonDockProps`: moon SVG reading `--age`, the shell `TimeMachine` with `maxDays={365}` and `jumpDays={[30, 90, 180, 365]}`, the marker track as `belowSlider` with named marker buttons, the shell `PreviewBanner` while previewing) and `apps/ghosted/src/styles/dock.css` (fixed at the bottom, `--dock-max`, sideways scroll below 520px)
    - Wire the dock into `apps/ghosted/src/App.tsx`: `--age` on `.gh-app`, every view at `now`, "Back to today" resets the offset and ticks; add `scroll-padding-bottom` and the `main` padding to `layout.css`; add the moon transition to `motion.css`
    - Create `apps/ghosted/src/timeline.test.ts` (markers within 365 days, names such as "Mira Castell goes dark on 3 March") and `apps/ghosted/src/components/MoonDock.test.tsx` (range 365, the four jumps with "+1 year", the banner, Back to today, reduced-motion Play goes to +365 days)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 16.1, 24.4, 25.1, 25.3, 26_

  - [x] 5.2 Forecast control
    - Create `apps/ghosted/src/components/ForecastControl.tsx`: 7, 30 and 90 days with 30 first; `engine.forecast(now, H × DAY_MS)` in engine order, each as "<name> goes dark on <date>" with glyph and word; "Nobody goes dark in the next H days." when empty; the previewed `now` while previewing
    - Wire it into `apps/ghosted/src/App.tsx`
    - Create `apps/ghosted/src/components/ForecastControl.test.tsx` covering each of those points
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 16.1_

  - [x] 5.3 Backup, restore and import controls
    - Create `apps/ghosted/src/components/BackupControls.tsx` (copy of Study Dungeon's: Back up as `ghosted-backup-YYYY-MM-DD.json`, works in a preview; Restore checked by `checkBackup`, a refusal announced with nothing changed, "Replace your street with N people from this file? This cannot be undone." before `applyBackup` through `runGatedWrite`, then reload) and `apps/ghosted/src/components/ImportDialog.tsx` (textarea, the format in words, "Imported people get importance 2 and 10 minutes", skipped lines listed as "Line N: <reason>", a storage problem part-way keeps the remaining text)
    - Wire both into the toolbar in `apps/ghosted/src/App.tsx`; add, import and restore set `OWN_PEOPLE_FLAG`
    - Create `apps/ghosted/src/components/BackupControls.test.tsx` (confirm before replace, Cancel changes nothing, Restore blocked in a preview, Back up not blocked) and `apps/ghosted/src/components/ImportDialog.test.tsx` (people added in line order, skipped lines reported, partial import on a full storage)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 12.5, 23.3_
    - **Added from task 5.4:** add to `App.test.tsx` the case that the privacy line changes to "Everything stays in this browser." after an add (task 4.10), an import and a restore

  - [x] 5.4 First run, reset and privacy line (partly done in run 6; the reset, splash and privacy-after-add parts are noted under 4.6, 4.14, 4.10 and 5.3)
    - Wire the first run into `apps/ghosted/src/App.tsx`: land on the hero; "Load sample street" calls `loadSampleData(engine, clock())` through `runGatedWrite`; "Start empty" marks started and opens "Add a person"
    - Create `apps/ghosted/src/components/ResetData.tsx` (quiet button, "Reset all data? This cannot be undone.", `resetAllData` removes exactly `RESET_KEYS`, then reload) and `apps/ghosted/src/components/PrivacyLine.tsx` (the two sentences of Requirement 15)
    - Create `apps/ghosted/src/App.first-run.test.tsx` (lands on the hero; a loaded sample street in two clicks from first load, and in one when the splash is skipped; Start empty opens Add; reset clears only Ghosted's keys and restarts the first run; the empty-street hero with no lists; after the splash, focus is on the hero heading and the splash does not return after a reload with the same session storage) and `apps/ghosted/src/components/PrivacyLine.test.tsx`; add to `apps/ghosted/src/App.test.tsx` that the privacy line changes after add, import and restore
    - _Requirements: 20.1, 20.2, 20.6, 20.7, 20.9, 15.1, 15.2, 6.2, 6.4_

  - [x] 5.5 Preview never writes (Property 12, app level)
    - Create `apps/ghosted/src/App.preview.test.tsx`: moving the dock to D days shows `engine.view(today + D)` in the hero, Street, lists and cards and sets `--age` to D / 365; the banner shows; every write control is `aria-disabled` with "Future preview · nothing is saved"; Back to today re-enables them
    - Create `apps/ghosted/src/App.preview.property.test.tsx`: `WRITE_ACTIONS` from design section 7.3 on the sample street with `RecordingAdapter`, `{ numRuns: 100 }`; after each action, zero saves, the snapshot and `FlagStorage` byte-for-byte unchanged. It sets its own per-test timeout of 120 000 ms and keeps `numRuns` at 100 (design open issue 3.4)
    - _Requirements: 12.2, 12.5, 12.6, 8.5, 19.5_

  - [x] 5.6 Storage problems in the App
    - Create `apps/ghosted/src/App.storage-errors.test.tsx`: a full or unavailable storage on tend, reconnect, remove, sample load and restore is announced, the open dialog closes, a Triage session ends, and the screen still shows the unchanged state; a tick's problem is announced once until a later tick saves; a non-storage error reaches the crash screen
    - Fix `apps/ghosted/src/App.tsx` if a case fails
    - _Requirements: 23.3, 17.8_

  - [x] 5.7 Keyboard and focus
    - Create `apps/ghosted/src/App.accessibility.test.tsx`: every control reachable with Tab and working with Enter and Space; each dialog focuses its content, keeps focus inside, closes on Escape and returns focus to its opener or the hero heading; every button has a name in words; disabled write controls stay focusable with their reason
    - _Requirements: 24.1, 24.2, 24.3, 12.5_

  - [x] 5.8 Wording and contrast tests (wording test waits for task 0.3)
    - Create `apps/ghosted/src/wording.test.ts`: no "doesn't care", "ignored you" or "ghosted you" (any case) in any `wording.ts` string (functions called with sample arguments), any sample person, or the autopsy sentences of the sample's dead people; "connection freshness" is used; the list and state words of Requirement 31.3 are present
    - Create `apps/ghosted/src/contrast.test.ts` with the pairs and ratios of the table in design section 7.6, and the check that `--dark` text is used only in the Empty windows heading
    - _Requirements: 31.1, 31.2, 31.3, 24.6_

  - [x] 5.9 Look, motion and layout source tests
    - Create `apps/ghosted/src/tokens.test.ts` (every colour in the app's CSS and TSX is a Ghosted token or a `color-mix` of tokens; no remote font hosts; no `<img>`, image files or icon libraries), `apps/ghosted/src/motion.test.ts` (every `animation`, `transition` and smooth scroll inside `no-preference`; no `requestAnimationFrame`, `Element.animate` or motion timers in `src/`), `apps/ghosted/src/layout-css.test.ts` (no width above 288px, the dock's sideways scroll, the scroll padding, the focus outline) and `apps/ghosted/src/primary-buttons.test.tsx` (filled buttons per region in each hero case, card state and dialog, as in design section 3.6)
    - If a test finds a real problem, fix the CSS or component, never the test
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 25.1, 25.2, 16.4, 12.7, 24.4, 24.5, 24.7, 7.2, 7.3_

  - [x] 5.10 README
    - Edit `README.md`: Ghosted described as built, with its run command `pnpm --filter @decay-engine/ghosted dev`
    - Add the README check to `apps/ghosted/src/config.test.ts`
    - _Requirements: 32.5_

  - [x] 5.11 Checkpoint: dock, data and checks
    - The developer runs `bash scripts/check.sh` in WSL; every step passes

- [x] 6. Group F: Final checkpoint
  - [x] 6.1 Full check
    - The developer runs `bash scripts/check.sh` in WSL. Every step passes, and "engine unchanged" prints its success line
    - `git status` shows no change under `packages/engine/`; the existing shell and Study Dungeon tests pass without edits to their assertions
    - _Requirements: 29.1, 29.2, 29.4, 32.2_

  - [x] 6.2 Manual checks
    - Requirement 30.5: side by side with `docs/design/ghosted-wireframe.html` at 1280px and 390px, the same street, windows, sign and dock (the parts left out on purpose are listed in design open issue 2.6)
    - At 320px: no horizontal page scroll; the dock still shows the slider, Back to today and the jumps, scrolling sideways inside the dock if needed; no column beside empty space
    - Keyboard only: the whole flow from the splash to a reconnect, with a visible focus outline everywhere and nothing hidden behind the dock
    - Reduced motion on: no splash, steady sign and windows, end states at once, Play jumps to +365 days
    - `pnpm --filter @decay-engine/ghosted build`, then `preview`: the bundle works from the site root, and the Network tab shows no request to another origin
    - _Requirements: 30.5, 24.1, 24.4, 24.5, 24.7, 12.7, 25.1, 25.2, 25.3, 32.3, 23.2_

  - [x] 6.3 Screenshots
    - Take screenshots of the 1280px and 390px side-by-side checks, the 320px dock, a reconnect and an autopsy, and save them in `docs/screenshots/`
    - Crop the account email out of every screenshot before saving it
    - Record the file names in the matching `docs/KIRO_LOG.md` session
    - _Requirements: 30.5_

## Notes

- **Module not written by Kiro.** `autopsy-sentences.ts` was written by Claude Code outside Kiro (task 0.3); Kiro writes only its tests and never edits it. `policy.ts` is written by Kiro in task 0.2 as a documented exception; after that, Kiro changes it only through a task that names it, and if a test seems to need a change Kiro stops and reports it.
- **Checkpoints.** The developer runs every `bash scripts/check.sh` in WSL. A Kiro task is done when its tests prove the behaviour; the checkpoint confirms the whole suite.
- **Optional tasks.** Study Dungeon's plan marks no task with `*`, so none is marked here. Its only cut-first task (sound) is out of scope for Ghosted.
- **Shell scope.** Only the files in task 1.1 to 1.4 change in `packages/shell/`. Task 2.10's check fails on any other shell change; if one seems needed, stop and report it (Requirement 29.4).
- **Engine.** No task touches `packages/engine/`.
- **Tests.** Fixed `T0` plus offsets, never the real clock; property tests at `{ numRuns: 100 }` or more; never skip, weaken or change an expected value to make a test pass.
- **Kiro log.** Every Kiro session on these tasks adds a session to `docs/KIRO_LOG.md` in the existing format (`authorship.md`).
- **Open decisions that affect tasks** (design open issues): 3.2 exact autopsy sentences (task 3.6 tests facts and rules until the developer supplies sentences); 3.3 floor or round for the whole-day gap (task 3.6 tests floor); 3.4 the 120 s per-test timeout (task 5.5); 3.7 the allowed shell file list (task 2.10); 1.5 duplicate names on import (task 2.7 imports duplicates as written).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0.1"] },
    { "id": 1, "tasks": ["0.2", "0.3", "1.1", "1.2", "1.3"] },
    { "id": 2, "tasks": ["0.4", "1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 6, "tasks": ["2.7", "2.8", "2.9", "2.10"] },
    { "id": 7, "tasks": ["2.11"] },
    { "id": 8, "tasks": ["3.1", "3.5"] },
    { "id": 9, "tasks": ["3.2", "3.3", "3.4", "3.6"] },
    { "id": 10, "tasks": ["3.7"] },
    { "id": 11, "tasks": ["4.1"] },
    { "id": 12, "tasks": ["4.2"] },
    { "id": 13, "tasks": ["4.3", "4.4"] },
    { "id": 14, "tasks": ["4.5", "4.6", "4.7"] },
    { "id": 15, "tasks": ["4.8", "4.9", "4.10"] },
    { "id": 16, "tasks": ["4.11", "4.12", "4.13"] },
    { "id": 17, "tasks": ["4.14"] },
    { "id": 18, "tasks": ["4.15"] },
    { "id": 19, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 20, "tasks": ["5.4"] },
    { "id": 21, "tasks": ["5.5", "5.6", "5.7", "5.8", "5.9", "5.10"] },
    { "id": 22, "tasks": ["5.11"] },
    { "id": 23, "tasks": ["6.1"] },
    { "id": 24, "tasks": ["6.2"] },
    { "id": 25, "tasks": ["6.3"] }
  ]
}
```
