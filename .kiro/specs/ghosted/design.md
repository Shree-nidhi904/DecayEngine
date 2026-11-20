# Technical Design: Ghosted

> **Status:** Complete (parts 1 to 3). Part 1: sections 1 to 3 (Architecture, Policy contract, Shell additions). Part 2: sections 4 to 6 (Components, Window art, Sample data). Part 3: sections 7 to 9 (Testing Strategy, Engine-unchanged check, Error handling and accessibility), the Correctness Properties and the open issues.

## Overview

Ghosted is a keep-in-touch app on the Decay Engine. Each person is a window on a night street, and the light shows **connection freshness**: how recently the user was in touch. Freshness falls in a straight line from the last contact and reaches 0 at three times the person's rhythm.

Key decisions:

- **Engine unchanged.** Ghosted uses `@decay-engine/engine` exactly as it is (Requirement 29).
- **Shell plus three optional props.** The shell gains optional props for the time machine's range and jumps, the Triage budget choices and the autopsy markers (Requirements 26 to 28). When they are left out, each shell component behaves as it does today.
- **No imports from Study Dungeon.** The support modules Ghosted needs are copied into `apps/ghosted/src` and adapted (Requirement 21.1).
- **Hand-written decay rules.** The developer writes `policy.ts` and `autopsy-sentences.ts` by hand. Kiro writes only their tests.
- **One `now` for every read.** `now = realNow + previewOffsetMs`, as in Study Dungeon. Every write is blocked while `previewOffsetMs > 0`.

---

## 1. Architecture

### 1.1 File layout of `apps/ghosted`

Files marked **(dev)** are hand-written by the developer. Files marked **(copy)** are adapted copies of Study Dungeon modules (section 1.3). Everything else is new and written by Kiro.

```
apps/ghosted/
├── index.html                      # Vite entry; no remote fonts (Req 23.2, 30.2)
├── vite.config.ts                  # base "/", test.environment jsdom, test.testTimeout 20000 (Req 32.3, 32.4)
├── package.json                    # scripts dev, build, preview, test, typecheck (Req 32.1)
├── tsconfig.json                   # exists (scaffold); gains jsx and DOM lib
└── src/
    ├── policy.ts                   # (dev) ghostedPolicy and its types (section 2)
    ├── policy.test.ts              # Kiro: the scaffold's it.todo stubs become real tests (Req 5)
    ├── autopsy-sentences.ts        # (dev) generateCauseSentences (section 2.3)
    ├── autopsy-sentences.test.ts   # Kiro (Req 19.3, 19.6, property 13)
    ├── autopsy-chart.ts            # chart points and contact markers from engine.history + ghostedPolicy
    ├── engine-instance.ts          # (copy) createEngine() on LocalStorageAdapter("ghosted")
    ├── first-run.ts                # (copy) flags, RESET_KEYS, needsFirstRun, resetAllData
    ├── splash.ts                   # splash-once-per-tab flag in sessionStorage (Req 6.2)
    ├── storage-errors.ts           # (copy) classifyWriteError, classifyLoadError, createEngineSafely
    ├── write-guard.ts              # (copy) runWrite, reportWriteError
    ├── ticking.ts                  # (copy) startTicking, useSettleTicks
    ├── backup.ts                   # (copy) makeBackup, checkBackup, applyBackup
    ├── import-people.ts            # (copy of import-facts.ts) parseImport
    ├── person-form.ts              # field limits and validation shared by the form and the import
    ├── time.ts                     # DAY_MS, dayStartOf(isoDate, timeZone), wholeDaysBetween
    ├── lists.ts                    # Fading / Empty windows / Still lit order; hero target (Req 8.1, 11)
    ├── street.ts                   # houses grouped by relationship, "Others" (Req 10.2)
    ├── timeline.ts                 # dock markers: start fading / go dark within 365 days (Req 12.4)
    ├── sample-data.ts              # loadSampleData(engine, now): replay of 12 people (Req 20.3-20.8)
    ├── theme.ts                    # ghostedTheme (tokens) and ghostedShellTheme (shell roles)
    ├── wording.ts                  # every interface string, ghostedWording: WordingProps
    ├── App.tsx                     # state, now and preview, writes, dialogs, layout
    ├── Root.tsx                    # (copy) createEngineSafely + ErrorBoundary around App
    ├── main.tsx                    # @fontsource imports, renders Root
    ├── components/
    │   ├── Splash.tsx  NeonSign.tsx  Hero.tsx  GhostedTriage.tsx
    │   ├── Street.tsx  House.tsx  Window.tsx  ThreeLists.tsx
    │   ├── MoonDock.tsx            # wraps the shell TimeMachine
    │   ├── PersonCard.tsx  ReachOutDialog.tsx  ReconnectDialog.tsx
    │   ├── AddEditPersonDialog.tsx  PersonAutopsy.tsx  ForecastControl.tsx
    │   ├── PrivacyLine.tsx  BackupControls.tsx  ImportDialog.tsx  ResetData.tsx
    │   ├── ErrorBoundary.tsx       # (copy) ErrorBoundary and ProblemScreen
    │   ├── useModalDialog.ts       # (copy) open a modal <dialog>, return focus to its opener
    │   └── icons.tsx               # circle / triangle / cross state glyphs, contact marker shapes
    ├── styles/
    │   ├── tokens.css              # replaces the scaffold's skin.css (see 1.4)
    │   ├── global.css  layout.css  street.css  window.css  dock.css  dialogs.css  problem.css
    │   └── motion.css              # every animation, inside prefers-reduced-motion: no-preference
    └── test/
        ├── fixtures.ts             # T0, DAY_MS offsets, makeEngine() on InMemoryAdapter, counterIds()
        └── fake-storage.ts         # in-memory FlagStorage
```

Part 2 covers the component props. Part 3 lists the test files that are not listed here.

Files outside `apps/ghosted` that Ghosted work touches:

| File | Change | Requirement |
|---|---|---|
| `packages/shell/src/components/TimeMachine.tsx`, `TriagePanel.tsx`, `AutopsyDialog.tsx`, `types.ts`, `index.ts` | optional props only (section 3) | 26-28 |
| `packages/shell/src/components/*.range.test.tsx`, `*.budgets.test.tsx`, `*.markers.test.tsx` | new test files; existing tests untouched | 26.5, 27.4, 28.4 |
| `scripts/check.sh` | Ghosted install, typecheck, test, build | 32.2 |
| `scripts/check-engine-unchanged.sh` | new: `git diff --exit-code <approval commit> -- packages/engine` and `git status --porcelain -- packages/engine` | 29.2 |
| `README.md` | Ghosted marked as built, with its run command | 32.5 |
| `docs/KIRO_LOG.md` | one session per Kiro session | steering |

### 1.2 How app, shell and engine connect

```
                        ┌──────────────────────── apps/ghosted ────────────────────────┐
 main.tsx ─► Root ─► createEngineSafely(createEngine) ──┐                               │
                │                                        │ GhostedEngine                 │
                └─► ErrorBoundary ─► App ◄───────────────┘                               │
                                     │  realNow (clock, settle ticks)                   │
                                     │  previewOffsetMs (MoonDock)                      │
                                     │  now = realNow + previewOffsetMs                 │
                                     │  previewing = previewOffsetMs > 0                │
                                     │                                                  │
             reads at `now` ─────────┤──────── writes at clock(), only when !previewing │
   engine.view(now)                  │         runWrite(() => engine.addItem / edit /   │
   engine.triage(budget, now)        │           tend / resurrect / remove, …)          │
   engine.forecast(now, H·DAY_MS)    │                                                  │
   engine.autopsy(id, now)           │         applyBackup / loadSampleData /           │
   engine.history(id)                │           resetAllData (guarded the same way)    │
   ghostedPolicy.nextDueAt / applyEvent (pure previews)                                 │
                                     │                                                  │
   Props down (theme, wording, data, callbacks); events up                              │
                                     ▼                                                  │
   ┌───────────── packages/shell (never imports an app; engine types only) ───────────┐│
   │ Counters · TriagePanel(budgets) · TimeMachine(maxDays, jumpDays) · PreviewBanner  ││
   │ AutopsyDialog(markers, renderMarker, markerSummary) · HistoryLogViewer            ││
   └───────────────────────────────────────────────────────────────────────────────────┘│
                                     │                                                  │
                                     ▼                                                  │
   ┌────────── packages/engine (unchanged; never imports an app or the shell) ─────────┐│
   │ DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>                        ││
   │   policy: ghostedPolicy (apps/ghosted/src/policy.ts)                              ││
   │   adapter: LocalStorageAdapter("ghosted") → localStorage["decay-engine:ghosted"]  ││
   └───────────────────────────────────────────────────────────────────────────────────┘│
                        └───────────────────────────────────────────────────────────────┘
```

Rules the diagram encodes:

- The App owns the only engine. Shell components get data and callbacks through props and never call the engine themselves.
- Reads use `now`. Writes use `clock()` (the real time) and run only when `previewing` is false. Settle ticks run only when `previewing` is false (`useSettleTicks`).
- The App may call `ghostedPolicy` functions directly on an item settled by `engine.view(now)`, for example to show "Freshness 42 → 82" before a contact. These calls are pure and save nothing. The App never re-implements a formula from Requirements 1 to 4.

### 1.3 Copied and adapted Study Dungeon modules

Requirement 21.1 forbids importing from `apps/study-dungeon`, so each module below is copied. Each copy's header comment names the file it was copied from. The logic stays the same unless the "What changes" column says otherwise.

| Ghosted file | Copied from | What changes |
|---|---|---|
| `engine-instance.ts` | `engine-instance.ts` | `export type GhostedEngine = DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>`. `STORAGE_NAMESPACE = "ghosted"` (key `decay-engine:ghosted`, Req 23.1). Uses `ghostedPolicy`. `idGenerator` stays `crypto.randomUUID()`. `createEngine(): GhostedEngine` |
| `first-run.ts` | `first-run.ts` | `STARTED_FLAG = "ghosted:started"`, `ENGINE_STORAGE_KEY = "decay-engine:ghosted"`. **No** tour flag (Ghosted has no tour). **New** `OWN_PEOPLE_FLAG = "ghosted:own-people"`, set by add, import and restore, for the privacy line (Req 15.2), with `hasOwnPeople(storage)` and `markOwnPeople(storage)`. `RESET_KEYS = [ENGINE_STORAGE_KEY, STARTED_FLAG, OWN_PEOPLE_FLAG]` (Req 20.7: Ghosted's keys only). `FlagStorage`, `hasStarted`, `markStarted`, `needsFirstRun(storage, personCount)` and `resetAllData` keep their logic. `isTourDone` and `markTourDone` are dropped |
| `splash.ts` (new, same pattern) | none | `SPLASH_SEEN_FLAG = "ghosted:splash-seen"` in **sessionStorage** (once per tab, Req 6.2). `type SessionFlagStorage = Pick<Storage, "getItem" \| "setItem">`. `shouldShowSplash(session: SessionFlagStorage \| null, reducedMotion: boolean): boolean` and `markSplashSeen(session)`. This flag is not in `RESET_KEYS` |
| `storage-errors.ts` | `storage-errors.ts` | Only the `storageProblemText` sentences change ("Ghosted", "people" in place of "Study Dungeon", "facts"). `WriteProblem`, `LoadProblem`, `classifyWriteError`, `classifyLoadError`, `CORRUPT_SNAPSHOT_CODES`, `createEngineSafely` and `SafeEngine<E>` are the same |
| `write-guard.ts` | `write-guard.ts` | `reportWriteError(error, onProblem): boolean` and `runWrite(write, onProblem): boolean` are copied unchanged (anything that is not a storage problem is rethrown). **Added:** `runGatedWrite(previewing, write, onProblem): WriteOutcome`, the single gate every write goes through during a preview (section 4.2) |
| `ticking.ts` | `ticking.ts` | Copied unchanged: `TICK_INTERVAL_MS = 60_000`, `Tickable`, `Scheduler`, `startTicking(...)`, `SettleTickOptions` and `useSettleTicks(engine, previewing, onTick?, options?)` |
| `backup.ts` | `backup.ts` | `BACKUP_APP = "ghosted"`, `BACKUP_VERSION = 1`. `type Backup = { app: "ghosted"; version: number; exportedAt: string; snapshot: unknown }` (Req 21.2). `checkBackup` builds a `DecayEngine` with `ghostedPolicy` on a throwaway adapter, as today, and returns `{ ok: true; snapshot: unknown; people: number }` (was `facts`). The reasons now name the actual problem (Req 21.4): not JSON; "a backup from another app" when `app` is a different string; "not a Ghosted backup" when `app` is missing; newer version; damaged. `applyBackup(storage, snapshot)` also sets `OWN_PEOPLE_FLAG`. `makeBackup(storage, exportedAt: Date)` is unchanged |
| `import-people.ts` | `import-facts.ts` | One person per line: `name \| relationship \| rhythm days \| last contact (YYYY-MM-DD)`. Tabs and CSV still work (`splitCsv` and `fieldsOf` are copied). Relationship and date are optional. A missing date means the import time. Each line is checked with `person-form.ts` (Req 17.1, 21.6). SD's duplicate-question skip is **not** copied (see Open issues). Signature below |
| `Root.tsx` | `Root.tsx` | `createEngine: () => GhostedEngine`, and a new `session: SessionFlagStorage \| null` prop that is passed on to the App for the splash. Otherwise the same structure |
| `components/ErrorBoundary.tsx`, `styles/problem.css` | same names | Ghosted wording and tokens |
| `components/useModalDialog.ts` | same name | Copied unchanged. Part 2 covers the focus-to-content rule (Req 24.2) |

`import-people.ts` signature:

```typescript
export type ImportedPerson = {
  name: string
  relationship: string        // "" when left out
  rhythmDays: number          // integer 1..365
  lastContactAt: number       // dayStartOf(date, timeZone), or importedAt when no date
}
/** Every imported person gets these (Req 21.5); the import dialog states them. */
export const IMPORT_IMPORTANCE = 2
export const IMPORT_COST_MINUTES = 10
export type SkippedLine = { line: number; reason: string }   // 1-based line number
export type ImportResult = { people: ImportedPerson[]; skipped: SkippedLine[] }

/** Pure: no engine, no clock. `importedAt` is the real time of the import. */
export function parseImport(text: string, importedAt: number, timeZone?: string): ImportResult
```

`person-form.ts`, used by both the form and the import:

```typescript
export const NAME_MAX = 60
export const RELATIONSHIP_MAX = 40
export const RHYTHM_MIN = 1, RHYTHM_MAX = 365
export const COST_MIN = 1, COST_MAX = 600
export type PersonField = "name" | "relationship" | "rhythmDays" | "lastContact" | "importance" | "costMinutes"
export type FieldError = { field: PersonField; rule: string }      // the rule in words (Req 17.7)
export function validatePerson(input: PersonFormInput, today: number, timeZone?: string): FieldError[]
export function startsDark(rhythmDays: number, lastContactAt: number, addedAt: number): boolean
  // true when ghostedPolicy.healthAt on the provisional item is below thresholds.dead (Req 17.3);
  // calls the policy, does not repeat its formula
```

The App mirrors Study Dungeon's `App.tsx` pattern but is not copied from it: the `realNow`/`previewOffsetMs`/`previewing`/`now` state, `guardWrite = runWrite(write, showWriteProblem)`, the settle-tick handler that announces a tick's storage problem once (`tickProblemShown`), and one dialog open at a time (`OpenDialog` union).

### 1.4 The scaffold files

- `policy.ts` belongs to the developer (section 2).
- `policy.test.ts`: Kiro replaces the `it.todo` stubs with real tests. No stub is deleted without a real test taking its place.
- `skin.css` holds the hook's generic names (`--text`, `--acc`, `--good`, …). Its values are moved into `styles/tokens.css` under the Ghosted token names from `design-tokens.md` (`--bg`, `--panel`, `--panel-hi`, `--line`, `--bone`, `--dim`, `--glow`, `--flick`, `--dark`, `--sign`, `--rust`, `--mint`, `--display`, `--logo`), plus `--lit` and `--age`. `skin.css` is then deleted. The steering rule is "add no colours outside" the Ghosted section, and `--panel-hi`, `--sign` and `--mint` are missing from `skin.css`.

---

## 2. The policy (contract only)

**Authorship.** `apps/ghosted/src/autopsy-sentences.ts` is written by the developer (`authorship.md`, requirements "Authorship"); Kiro never creates, edits or "fixes" it. `apps/ghosted/src/policy.ts` is written by Kiro as a documented exception in `authorship.md`, from this section only: the rules are the developer's, set in Requirements 1 to 4 and the contract below. Kiro's tests check this contract.

### 2.1 Exported names and types of `policy.ts`

The rest of the app relies on exactly these names:

```typescript
import type { DecayPolicy, Item } from "@decay-engine/engine"

export type PersonPayload = {
  name: string           // 1-60 chars, required
  relationship: string   // 0-40 chars ("" = no tag)  ← NEW compared with the scaffold
  rhythmDays: number     // integer 1..365
  lastContactAt: number  // ms; set when adding only
}

export type PersonPolicyData = {
  lastContactAt: number  // freshness decays from this, never from item.lastEventAt
}

export type ContactEvent = { kind: "text" | "call" | "meetup" }

export type Person = Item<PersonPayload, PersonPolicyData>

export const ghostedPolicy: DecayPolicy<PersonPayload, PersonPolicyData, ContactEvent>
```

The app uses `ContactEvent["kind"]` wherever it needs the kind union, so the developer does not have to export another name.

### 2.2 Contract table (Requirements 1 to 4)

Notation: `T = 3 × item.payload.rhythmDays × DAY_MS`, with `DAY_MS = 86 400 000`. `L = item.policyData.lastContactAt`. `h = healthAt(item, now)`.

| Function | Inputs it may read | Output | Req |
|---|---|---|---|
| `thresholds` | none | `{ weak: 60, dead: 10 }` | 1.1 |
| `init(payload, now)` | `payload.lastContactAt` | `{ lastContactAt: payload.lastContactAt }` | 1.2 |
| `healthAt(item, now)` | `L`, `payload.rhythmDays`, `now`. **Never** `item.lastEventAt` or `item.health` | `elapsed = max(0, now − L)`, then `max(0, 100 × (T − elapsed) / T)`, in that order. Exactly 100 when `L > now`. Always finite and between 0 and 100 | 1.3-1.7 |
| `applyEvent(item, {kind:"text"}, now)` | `h`, `T`, `now` | `health = min(100, h + 40)`, `policyData = { lastContactAt: now − (100 − health) / 100 × T }` | 2.1 |
| `applyEvent(item, {kind:"call" \| "meetup"}, now)` | `now` | `health = 100`, `policyData = { lastContactAt: now }` | 2.2 |
| any `applyEvent` | none | `healthAt(updated, now)` equals the returned health within 1e-9, and the returned health is ≥ `h` | 2.3, 2.4 |
| `nextDueAt(item, now)` when `h ≥ 60` | `L`, `T` | `L + 2 × T / 5` (a whole number of ms for every rhythm, because `2T/5 = 103 680 000 × rhythmDays`) | 3.1 |
| `nextDueAt` when `10 ≤ h < 60` | `now` | `now` | 3.2 |
| `nextDueAt` when `item.state === "dead"` or `h < 10` | none | `null` | 3.3 |
| `resurrect(item, event, now)`, any kind | `now` | `{ ok: true, policyData: { lastContactAt: now } }`. Never `{ ok: false }` | 4.1, 4.2 |
| after a successful resurrect | none | the engine sets health to 100 (engine Req 8.5), and `healthAt` at `now` is also 100 | 4.3 |

Outcomes derived from the table, which Kiro's `policy.test.ts` checks for a 30-day rhythm (`T` = 90 days) contacted at T0 (Req 5.2-5.7):

| Day | Health | State |
|---|---|---|
| 36 | exactly 60 | alive |
| 37 | ≈ 58.9 | weak |
| 81 | exactly 10 | weak |
| 82 | ≈ 8.9 | dead (`diedAt` in (T0 + 81 d, T0 + 81 d + 1 min]) |
| text on day 45 (h = 50) | 90; `L` moves to day 36; next 60 on day 72 | alive |
| call or meet-up on day 45 | 100; weak just after day 81 | alive |
| reconnect by text on day 90 | 100, `timesResurrected` 1 | alive |

A person starts dark when `now − L > 9T/10` at add time (more than `2.7 × rhythmDays` days). The engine then records "created" and "died" at the same timestamp (engine `addItem`, Req 20.8, property 13).

### 2.3 Exported names of `autopsy-sentences.ts`

This file is hand-written by the developer. Its shape follows Study Dungeon's `generateCauseSentences`:

```typescript
import type { AutopsyReport } from "@decay-engine/engine"
import type { ContactEvent, PersonPayload } from "./policy"

export type CauseSentenceOptions = {
  timeZone?: string   // IANA zone for any date shown; defaults to the viewer's
  locale?: string     // defaults to "en-GB"
}

/**
 * Cause-of-death sentences for a person whose window went dark, in display order.
 * Req 19.3 (for example "After the last call there was no contact for 84 days,
 * about 3 times your usual rhythm."), 19.4 and 31 (wording rules), and 19.6:
 * for a person added already dark (report.lifeStartedAt === report.diedAt and
 * no tends), describe the gap from payload.lastContactAt to report.diedAt in
 * whole days (always at least 1) and never say "0 days".
 */
export function generateCauseSentences(
  report: AutopsyReport<ContactEvent>,
  payload: PersonPayload,
  options?: CauseSentenceOptions
): string[]
```

What the developer needs and the engine already provides: `report.lastTend.event.kind` (the kind of the last contact), `report.silenceMs`, `report.tends`, `report.diedAt`, `report.lifeStartedAt` and `report.timesResurrected`. `payload.rhythmDays` and `payload.lastContactAt` supply the "about N times your usual rhythm" ratio and the started-dark gap. No engine change is needed.

---

## 3. Shell additions (Requirements 26 to 28)

Each addition is an optional prop whose default keeps the current behaviour. No exported constant is renamed, removed or changed in value. Line numbers refer to the files as they are at the time of writing.

### 3.1 `TimeMachine`: range and jumps (Requirement 26)

File: `packages/shell/src/components/TimeMachine.tsx`.

New props in `TimeMachineProps` (lines 37-56):

```typescript
/** Days the slider reaches. A positive whole number; anything else uses the default. Default TIME_MACHINE_MAX_DAYS (60). */
maxDays?: number;
/** Quick jumps, in days ahead of today, shown in this order. Default TIME_MACHINE_JUMP_DAYS ([7, 14, 30]). */
jumpDays?: readonly number[];
```

Inside the component: `const maxMs = (isPositiveWholeNumber(maxDays) ? maxDays : TIME_MACHINE_MAX_DAYS) * DAY_MS`.

| Line(s) | Today | After |
|---|---|---|
| 58-60 `clampOffset(ms)` | clamps to `TIME_MACHINE_MAX_OFFSET_MS` | `clampOffset(ms, maxMs)` |
| 69-80 destructuring | none | `maxDays = TIME_MACHINE_MAX_DAYS, jumpDays = TIME_MACHINE_JUMP_DAYS` |
| 105 `change` | `clampOffset(next)` | `clampOffset(next, maxMs)` (Req 26.3: the clamp on `onChange`) |
| 110, 112, 121, 124 `play` | `TIME_MACHINE_MAX_OFFSET_MS` | `maxMs` (Req 26.3: Play's end) |
| 125, 133, 134, 148 | `clampOffset(x)` | `clampOffset(x, maxMs)` |
| 146 slider `max` | `TIME_MACHINE_MAX_OFFSET_MS` | `maxMs` (Req 26.3: the slider maximum) |
| 153 jump buttons | `TIME_MACHINE_JUMP_DAYS.map` | `jumpDays.map`, in the given order (Req 26.4). A jump beyond `maxMs` is clamped by `change`, as today |

The step (`TIME_MACHINE_STEP_MS`, 1 hour) and Play's duration (`TIME_MACHINE_PLAY_MS`, 5 s) stay as they are. The JSDoc for `onChange` changes from "0 to TIME_MACHINE_MAX_OFFSET_MS" to "0 to maxDays days".

Ghosted passes `maxDays={365}` and `jumpDays={[30, 90, 180, 365]}`, with `wording.timeMachine.jump(365)` returning "+1 year" (Req 12.1). The 365-day label comes from Ghosted's wording, so the shell holds no app words.

New test file `TimeMachine.range.test.tsx` (Req 26.5): a 365-day range and jumps of 30, 90, 180 and 365. It checks the slider's `max`, the four buttons in order and their offsets, that `onChange` is clamped at 365 days, that Play ends at 365 days (fake frames and clock), that reduced-motion Play jumps to 365 days, and that an invalid `maxDays` (0, −1, 1.5, NaN) falls back to 60.

### 3.2 `TriagePanel`: budget choices (Requirement 27)

File: `packages/shell/src/components/TriagePanel.tsx`.

New props in `TriagePanelProps` (lines 14-45):

```typescript
/**
 * Budget choices in minutes, shown in this order before "custom". Whole
 * numbers from 1 to maxBudgetMinutes, no repeats. Omitted or empty: TRIAGE_BUDGETS.
 */
budgets?: readonly number[];
/**
 * The choice selected at first when initialBudget does not apply. Ignored
 * unless it is in the list. Omitted: TRIAGE_BUDGETS[1] without `budgets`,
 * the list's first entry with `budgets`.
 */
defaultBudget?: number;
```

Inside the component:

```typescript
const custom = budgets !== undefined && budgets.length > 0
const choices = custom ? budgets : TRIAGE_BUDGETS
const fallback = defaultBudget !== undefined && choices.includes(defaultBudget)
  ? defaultBudget
  : custom ? choices[0]! : TRIAGE_BUDGETS[1]!
// Today's rule is kept when no list is given (Req 27.2); with a list, an
// initialBudget outside it counts as none and runs no triage (Req 27.3).
const initial = custom
  ? (initialBudget !== undefined && choices.includes(initialBudget) ? initialBudget : undefined)
  : initialBudget
```

| Line(s) | Today | After |
|---|---|---|
| 10 `TRIAGE_BUDGETS` | `[5, 10, 20]` | unchanged |
| 41-44 `initialBudget` JSDoc | "should be one of TRIAGE_BUDGETS" | "one of the budget choices; with `budgets`, any other value counts as none" |
| 67-78 destructuring | none | `budgets`, `defaultBudget` |
| 88-90 `choice` state | `initialBudget` if in `TRIAGE_BUDGETS`, else `TRIAGE_BUDGETS[1]` | `initial` if in `choices`, else `fallback` |
| 94 `budget` state | `initialBudget ?? null` | `initial ?? null` |
| 184 fieldset | `TRIAGE_BUDGETS.map` | `choices.map` |

**Default kept exactly.** Without `budgets`, `initial === initialBudget` and `fallback === TRIAGE_BUDGETS[1]`, which gives the same two `useState` initial values as lines 88-94 today. That includes today's quirk: an `initialBudget` outside `[5, 10, 20]` still runs triage while 10 stays selected. Applying the "counts as none" rule only when `budgets` is given is what keeps Requirement 27.2 ("exactly as today") true. See Open issue 6.

Ghosted passes `budgets={[15, 30, 60, 120]}`, `defaultBudget={30}`, `initialBudget={30}` and `maxBudgetMinutes={1440}` (engine `triage` limit) (Req 9.1).

New test file `TriagePanel.budgets.test.tsx` (Req 27.4): the choices 15, 30, 60 and 120 plus custom, in order. It checks that with no `defaultBudget` the first choice (15) is selected, that `defaultBudget={60}` selects 60, that `initialBudget={30}` runs triage once with 30, that `initialBudget={10}` (not in the list) runs nothing and selects the fallback, and that a custom budget still uses `maxBudgetMinutes`.

### 3.3 `AutopsyDialog`: contact markers (Requirement 28)

Files: `packages/shell/src/components/AutopsyDialog.tsx`, `packages/shell/src/types.ts`, `packages/shell/src/index.ts`.

New exported type (next to `AutopsyTendMark`, lines 12-16):

```typescript
/** One app-defined marker on the chart, for example a kind of contact. */
export interface AutopsyMarker {
  at: number;      // ms
  kind: string;    // the app's own key; also the data-marker attribute
  label: string;   // legend words for this kind, for example "Call"
}
```

New props in `AutopsyDialogProps` (lines 18-46):

```typescript
/**
 * App-defined markers. When given (even empty), they replace `tends`: the
 * right/wrong marks and their two legend entries are not drawn. The legend
 * shows each distinct kind once, in order of first appearance, with that
 * marker's label. Omitted: today's right/wrong marks.
 */
markers?: readonly AutopsyMarker[];
/**
 * Draws one marker's shape, centred on 0,0, about 10 units wide, in the
 * chart row and in the legend. Omitted: a filled circle for every kind.
 */
renderMarker?: (kind: string) => ReactNode;
/**
 * The markers summed up in words, for example "3 calls, 2 messages,
 * 1 meet-up". It receives one entry per legend kind, in legend order,
 * counting only the markers inside the chart's span.
 */
markerSummary?: (counts: readonly { kind: string; label: string; count: number }[]) => string;
```

New optional field on `AutopsyChartSummary` (`types.ts`, lines 79-92):

```typescript
/** markerSummary's text when the app gives markers; undefined otherwise. */
markers?: string;
```

With `markers`, `right` and `wrong` are 0 and `chartLabel` reads `summary.markers` instead (Req 28.3). The shell still builds the aria-label only through the app's `wording.autopsy.chartLabel`, so the words stay the app's.

| Line(s) | Today | After |
|---|---|---|
| 78-85 `ChartProps` | `tends` | adds `markers?`, `renderMarker?`, `markerSummary?` |
| 96-105 counts and label | right/wrong from `tends` | when `markers` is given: filter to the span, count per kind, `right: 0, wrong: 0, markers: markerSummary?.(counts)` |
| 146-151 marks | `<g data-mark="right"\|"wrong">` | when `markers` is given: `<g data-marker={kind}>` with `renderMarker(kind)` and the same guide line |
| 159-176 legend | weak, dead, right, wrong | weak and dead, then one `<li data-legend-marker={kind}>` per kind (shape plus label) instead of right/wrong |
| 192-206, 255-264 | none | destructure and pass the three props to `AutopsyChart` |
| `index.ts` line 43 | none | `export type { …, AutopsyMarker }` |

**Focus on open (Requirement 28.5, for 24.2).** One more optional prop:

```typescript
/**
 * Move focus to the dialog's content (its title) when it opens, instead of
 * the browser's default (the first button). The title gets tabindex="-1".
 * Omitted or false: exactly as today (no tabindex on the title, focus left to showModal).
 */
focusContentOnOpen?: boolean;
```

| Line(s) | Today | After |
|---|---|---|
| 192-206 destructuring | none | `focusContentOnOpen = false` |
| 208 refs | `ref` for the dialog | adds `titleRef = useRef<HTMLHeadingElement>(null)` |
| 211-224 open effect | `showModal()` (or the `open` attribute) | the same, then `if (focusContentOnOpen) titleRef.current?.focus()`. Runs once on mount, as today |
| 241 `<h2>` | `id`, `className` | adds `ref={titleRef}` and `tabIndex={focusContentOnOpen ? -1 : undefined}` |

Ghosted's `PersonAutopsy` passes `focusContentOnOpen`. Study Dungeon's `FactAutopsy` does not, so it is unchanged. Returning focus to the opener when the dialog closes stays the app's job (`useReturnFocus` in Study Dungeon, `useModalDialog` in Ghosted).

New test file `AutopsyDialog.focus.test.tsx` (Req 28.5). With `focusContentOnOpen`, `document.activeElement` is the title `h2` and it has `tabindex="-1"`. Without it, the title has no `tabindex` attribute and focus is not on it.

`tends` stays a required prop. Ghosted passes `tends={[]}` together with `markers`. `data-legend-marker` is a new attribute name, so it cannot clash with the existing `data-legend="weak" | "dead" | "right" | "wrong"`.

Ghosted passes one marker per contact in the life shown (`kind` = `"text" | "call" | "meetup"`, labels "Message", "Call" and "Meet-up"), a `renderMarker` whose shapes differ from each other and from the state glyphs (part 2, `icons.tsx`), and a `markerSummary` from `wording.ts` (Req 19.2).

New test file `AutopsyDialog.markers.test.tsx` (Req 28.4): text, call and meet-up markers. It checks one `data-marker` group per marker inside the span and none outside it, three legend entries in first-appearance order with their labels, that the right/wrong legend entries are gone, that the aria-label comes from `chartLabel` with `summary.markers === "3 calls, 2 messages, 1 meet-up"` and `right === 0`, and that the default circle is drawn when `renderMarker` is omitted.

### 3.4 Existing callers compile unchanged

Every change adds optional members to a props interface or to `AutopsyChartSummary`, or adds a new exported type. Nothing is removed or narrowed, so every existing call site and every existing `chartLabel` function still type-checks.

| Caller | Uses | Why it is unaffected |
|---|---|---|
| `apps/study-dungeon/src/components/TimeDock.tsx` | `TimeMachine`, `TIME_MACHINE_MAX_DAYS`, `belowSlider` | passes neither new prop, so the defaults apply; the constant keeps its name and value (60) |
| `apps/study-dungeon/src/App.tsx` (line 560-579) | `TriagePanel` with `initialBudget={10}`; `TIME_MACHINE_MAX_OFFSET_MS` | no `budgets`, so lines 88-94 behave as today; the constant is unchanged |
| `apps/study-dungeon/src/components/FactAutopsy.tsx` | `AutopsyDialog` with `points`, `tends` | no `markers` and no `focusContentOnOpen`, so today's right/wrong path and today's focus run |
| `apps/study-dungeon/src/wording.ts` (line 57) | `chartLabel: (s: AutopsyChartSummary) => …` | the new field is optional; the function ignores it |
| `apps/study-dungeon/src/theme.test.ts`, shell `test-fixtures.tsx`, `*.test.tsx` | the types and components above | untouched; Req 26.5, 27.4, 28.4 and 28.5 require them to pass **without modification** |

Proof: `pnpm -r typecheck`, then the shell and Study Dungeon test suites, with `git diff --exit-code` showing no change to any existing `*.test.ts(x)` file in `packages/shell` or `apps/study-dungeon`. Part 3 maps this to tasks.

### 3.5 Shell boundary test is not edited

`packages/shell/src/boundary.test.ts` stays as it is. It scans every shell `.ts`, `.tsx` and `.css` file, tests included, for Study Dungeon's colour names and words. The three new shell test files use none of those words.

Ghosted's own check goes in a **new file** inside the app, `apps/ghosted/src/shell-boundary.test.ts`. It reads (never imports) the non-test shell sources in `packages/shell/src`, meaning `*.ts`, `*.tsx` and `*.css` other than `*.test.ts(x)` and `test-fixtures.tsx`, and fails if any of them contains a Ghosted word or colour name: `Ghosted`, `Still lit`, `Fading`, `Empty windows`, `Reach out`, `Reconnect`, `flickering`, `boarded`, `meet-up`, `meetup`, `freshness`, `glow`, `flick`, `rust`, `mint`. Test files are excluded on purpose, because `test-fixtures.tsx` (line 116) and `ItemCard.test.tsx` (line 59) already contain "flickering". Every candidate word was checked against the current non-test shell sources and none appears, so the test passes at the start.

### 3.6 Primary buttons and amended Requirement 30.4

The shell already draws filled (`shell-button-primary`) buttons in two Ghosted regions:

- **Triage region:** `TriagePanel` has "Run" (line 222, always shown) and "Start the session" (line 140, shown only when there are picks). Both are shell controls, so amended 30.4 allows them. Ghosted adds no filled button of its own to this region. "Today's 5-minute action" (Req 9.4) is a quiet button.
- **Dock region:** `TimeMachine` has Play (line 165) as its filled button. `PreviewBanner`'s "Back to today" is a plain `shell-button`, not filled. `MoonDock` adds no filled button.

Every other region (hero, person card, dialogs) has exactly one filled button of the app's own, as Requirements 8.6 and 13.3 require. Part 2 lists them per component.

---

## 4. Components

### 4.1 Shared types used by the components

```typescript
import type { ForecastEntry, HistoryEntry, TriageCandidate } from "@decay-engine/engine"
import type { AutopsyMarker, ItemState } from "@decay-engine/shell"
import type { GhostedEngine } from "./engine-instance"
import type { ContactEvent, Person, PersonPayload, PersonPolicyData } from "./policy"

type ContactKind = ContactEvent["kind"]                       // "text" | "call" | "meetup"
type SectionId = "street" | "fading" | "empty" | "still"
type ShownState = ItemState | "litAgain"                     // "litAgain" = alive && timesResurrected > 0 (Req 16.2)

/** What every read-only view gets from the App, computed once per render. */
interface StreetView {
  now: number                                   // realNow + previewOffsetMs
  realNow: number
  people: readonly Person[]                     // engine.view(now)
  darkAt: ReadonlyMap<string, number>           // id → diesAt, from engine.forecast(now, MAX_FORECAST_HORIZON_MS)
  version: number                               // bumped after every write
}

/** Set while previewing; every write control shows it and ignores activation. */
type BlockedReason = string | undefined         // previewBlockedText ("Future preview · nothing is saved") or undefined
```

`shownState(person)` (`lists.ts`) gives a `ShownState`. The glyph, word and window art all read it: circle and "lit", circle and "lit again", triangle and "flickering", cross and "boarded up".

Freshness is always shown as `Math.floor(health)`, so a shown number of 60 or more means lit and 10 or more means flickering, matching `health >= weak` and `health >= dead`. Rounding would show a weak 59.6 as "60".

### 4.2 Preview flow and write blocking

```
MoonDock ── onChange(offsetMs) ──► App: setPreviewOffsetMs(offsetMs)
                                     │
                                     ├─ now        = realNow + previewOffsetMs
                                     ├─ previewing = previewOffsetMs > 0
                                     ├─ blocked    = previewing ? previewBlockedText : undefined
                                     ├─ age        = previewOffsetMs / (365 × DAY_MS)  → style --age on .gh-app
                                     ├─ people     = useMemo(() => engine.view(now), [engine, now, version])
                                     └─ darkAt     = useMemo(() => forecast map at now, [engine, now, version])
                                     │
          ┌───────────┬──────────────┼──────────────┬───────────────┬──────────────┐
          ▼           ▼              ▼              ▼               ▼              ▼
        Hero    GhostedTriage     Street       ThreeLists     ForecastControl   PersonCard /
     (people,   (engine.triage   (people)    (people, darkAt)  (engine.forecast  dialogs
      blocked)   at now, blocked)                               at now)          (blocked)
```

- **One source of `now`.** Every view gets `now` (or data computed at `now`) from the App, never from the clock. `useSettleTicks(engine, previewing, …)` stops while previewing, and "Back to today" ticks straight away, as in Study Dungeon.
- **Markers stay put during a preview.** The dock markers are computed at `realNow` (`timeline.ts`), so they mark days ahead of *today* and do not move while dragging.
- **Two layers block writes.**
  1. **Controls.** Every write control (add, edit, remove, reach out, reconnect, restore, import, load sample, start empty, reset, Triage's start) gets `blocked`. While it is set, the control stays visible and focusable, has `aria-disabled="true"` and `title={blocked}`, and its activation does nothing. This is the same pattern the shell's `ItemCard`/`TriagePanel` use. The hero's primary button follows Requirement 8.5.
  2. **The gate.** Every engine write and every storage write (`applyBackup`, `resetAllData`, `markStarted`, `markOwnPeople`) goes through the adapted `write-guard.ts`:

```typescript
export type WriteOutcome = "saved" | "blocked" | "storage-problem"

/**
 * The only way the App writes. While previewing, returns "blocked" without
 * calling `write`. Otherwise runs it through runWrite: "saved", or
 * "storage-problem" (already reported through onProblem). Other errors are rethrown.
 */
export function runGatedWrite(
  previewing: boolean,
  write: () => void,
  onProblem: (problem: WriteProblem) => void
): WriteOutcome
```

The App reads `previewing` at the moment of the call (through a ref), not from the render that opened a dialog. A write cannot slip through even if the offset changes while a dialog is open; see Open issue 2.3. Property 12 is tested against this gate and the controls together (part 3).

- **Writes use the real time.** Each write uses `clock()` (default `Date.now`), never `now`.

### 4.3 App

```typescript
export interface AppProps {
  engine: GhostedEngine
  storage: FlagStorage                         // flags; default window.localStorage (through Root)
  session: SessionFlagStorage | null           // splash flag; window.sessionStorage or null
  clock?: () => number                         // default Date.now
  tickScheduler?: Scheduler
  frameScheduler?: FrameScheduler              // passed to TimeMachine
  frameClock?: () => number
  prefersReducedMotion?: () => boolean         // default the media query
  timeZone?: string                            // dates and day starts; tests pass "UTC"
  reload?: () => void
}

type OpenDialog =
  | { kind: "add" } | { kind: "import" }
  | { kind: "edit"; person: Person }
  | { kind: "person"; id: string }             // PersonCard in a dialog (from the Street, Still lit, dock)
  | { kind: "reach-out"; person: Person }
  | { kind: "reconnect"; person: Person }
  | { kind: "autopsy"; id: string }
  | { kind: "remove"; person: Person }
  | { kind: "reset" }
  | { kind: "restore"; check: Extract<RestoreCheck, { ok: true }> }

type Session = { ids: string[]; position: number; skipped: { name: string; reason: "dark" | "removed" }[] }
```

The App owns `realNow`, `previewOffsetMs`, `version`, `openDialog`, `session`, the splash flag, the live region (`announce`) and the refs for focus (hero heading, section headings). Layout from top to bottom: atmosphere layers, `Splash` (when shown), `<header>` with `NeonSign`, `<main>` (live region, `Hero`, `GhostedTriage`, `SectionNav`, `Street`, `ThreeLists`, `ForecastControl`, the toolbar with Add a person, Import, `BackupControls` and `ResetData`, then `PrivacyLine`), then `MoonDock` fixed at the bottom. At most one dialog is open at a time.

**Triage session (Req 9.5).** This copies Study Dungeon's fight queue. `onStartSession(picks)` stores the ids in triage order and opens `ReachOutDialog` for the first one. Each person is looked up again with `engine.view(clock())` when their turn comes. Someone who has gone dark or been removed since is skipped and named in the closing message. Closing a dialog (Done, Cancel or Escape) opens the next one. "Stop session" drops the rest of the queue.

### 4.4 Component table

Each component's props are below. "Engine calls" lists the only engine methods the component may call itself. Data computed by the App is passed in as props.

#### Splash: `components/Splash.tsx`

```typescript
interface SplashProps {
  onDone: () => void          // "Walk in" or Escape; the App calls markSplashSeen and focuses the hero heading
}
```

A full-screen modal `<dialog aria-label="Ghosted">` with six `Window`s that light up one by one, the word "Ghosted" in Monoton, and one primary "Walk in" button. The word here is a `<p aria-hidden="true">`; the page's only `h1` is the header sign (Req 7.4). Focus opens on the dialog's tagline (`tabindex="-1"`, Req 24.2). The App renders it only when `shouldShowSplash(session, prefersReducedMotion())` is true, so it never renders under reduced motion. Engine calls: none. **Req 6.1-6.4, 20.2, 24.2, 25.1.**

#### NeonSign: `components/NeonSign.tsx`

```typescript
interface NeonSignProps { title: string; tagline: string }   // "Ghosted", "People you are losing touch with"
```

Renders `<h1 class="gh-sign">` in `--logo` with a `--sign` glow, and the tagline below it. The hum is CSS only (section 5.3). Engine calls: none. **Req 7.1-7.4.**

#### Hero: `components/Hero.tsx`

```typescript
interface HeroProps {
  people: readonly Person[]                  // StreetView.people (at now)
  firstRun: boolean                          // needsFirstRun(storage, people.length)
  previewDate?: string                       // set while previewing, e.g. "3 Mar 2027"
  blocked: BlockedReason
  headingRef: RefObject<HTMLHeadingElement>  // tabindex -1; focus target after the splash and as dialog fallback
  onReachOut: (person: Person) => void
  onGoTo: (section: SectionId) => void       // moves focus to that section's heading
  onLoadSample: () => void
  onStartEmpty: () => void                   // the App marks started and opens "Add a person"
  onAdd: () => void
}
```

| Case | Message (h2) | Primary (one) | Quiet |
|---|---|---|---|
| `firstRun` | "Welcome to the street." | "Load sample street" → `onLoadSample` | "Start empty" |
| N weak | "N windows are flickering" / "1 window is flickering" | "Reach out to <first name>" (the weak person with the lowest freshness, ties by id: `heroTarget` in `lists.ts`) | none |
| no weak, ≥1 dead | "Nobody is fading." | "See the empty windows" → `onGoTo("empty")` | none |
| everyone alive (≥1 person) | "Every window is lit." | "Look at the street" → `onGoTo("street")` | none |
| no people, not first run (Req 8.7, 20.9) | "No windows yet." | "Add a person" → `onAdd` | none |

It also shows the shell `Counters` with `ghostedIcons` and the counts at `now`, each with its glyph and list name (Req 8.4, 16.1 as amended). While `previewDate` is set, an eyebrow reads "Future preview · <date>" and the primary button gets `blocked` (aria-disabled with the reason, Req 8.5). Engine calls: none. **Req 8.1-8.7, 20.1, 20.2, 20.6, 20.9.**

**An empty street (Req 20.9).** With no people and the first run over, the App renders the Hero ("No windows yet.", primary "Add a person"), the toolbar (whose own "Add a person" is quiet, so the page has one filled Add button), the privacy line and the dock. It does **not** render the Street, `SectionNav`, `ThreeLists`, `ForecastControl` or `GhostedTriage`, so no empty list sits beside the hero. Once one person exists, every section returns, and an empty list shows its one line (Req 11.6).

#### GhostedTriage (TriagePanel wrapper): `components/GhostedTriage.tsx`

```typescript
interface GhostedTriageProps {
  engine: Pick<GhostedEngine, "triage">
  now: number
  version: number
  blocked: BlockedReason
  onStartSession: (picks: TriageCandidate<PersonPayload, PersonPolicyData>[]) => void
  onReachOut: (person: Person) => void       // "Today's 5-minute action"
}
```

This wraps the shell `TriagePanel` with `budgets={[15, 30, 60, 120]}`, `defaultBudget={30}`, `initialBudget={30}`, `maxBudgetMinutes={1440}`, `triage={useCallback(b => engine.triage(b, now), [engine, now, version])}`, `startDisabled={blocked !== undefined}` and `startDisabledReason={blocked}`. Above the panel is an ordered list of the three steps from `wording.ts` (Req 9.2). `renderText` shows the triangle glyph, the word "flickering" and the person's name; the shell adds worth per minute, minutes and `diesIn` → "goes dark in N days" (Req 9.3, 16.1).

"Today's 5-minute action" (Req 9.4) reads `engine.triage(1440, now)`, takes `picks` and `others` (together, every weak person), keeps those with `costMinutes ≤ 5`, and picks the highest `valuePerMinute`, ties by id. It is a **quiet** button "Reach out to <name>", because amended 30.4 makes the shell's Run the region's primary button. It is hidden when nobody qualifies. Engine calls: `triage`. **Req 9.1-9.5, 16.1, 27, 30.4.**

#### Street, House, Window: `components/Street.tsx`, `House.tsx`, `Window.tsx`

```typescript
interface StreetProps {
  people: readonly Person[]
  onOpen: (person: Person) => void          // opens { kind: "person" }
  headingRef: RefObject<HTMLHeadingElement>
  relitId?: string                          // the person just tended or reconnected: one relight flash
}
interface HouseProps { name: string; people: readonly Person[]; onOpen: StreetProps["onOpen"]; relitId?: string }
interface WindowProps {
  health: number                            // 0-100 at the time shown
  state: ShownState
  size: "street" | "card" | "dialog" | "splash"
  relight?: boolean                         // data-relight: flash once
  boards?: "on" | "falling"                 // dead: "on"; ReconnectDialog success: "falling"
}
```

`groupHouses(people): { name: string; people: Person[] }[]` (`street.ts`) groups by `payload.relationship.trim()`. An empty tag goes to "Others". Houses are sorted by name with "Others" last, and people within a house by name and then id, so every person appears exactly once (Req 10.2).

Each window is a `<button>` whose accessible name is "<name>, <state word>, freshness <n>". It contains the `Window` art (`aria-hidden`), the first name, and the glyph with the state word (Req 10.1, 10.4, 16.1). A legend shows the circle "lit", triangle "flickering" and cross "boarded up". The sentence "The light shows how recently you were in touch. It does not measure how much anyone matters." sits under the heading (Req 10.3, 10.5). `Window` is pure art: a `span.gh-pane` with `style="--lit: …"` and `data-state`, a silhouette unless dead, and boards when dead (section 5). Engine calls: none. **Req 10.1-10.5, 16.1-16.5.**

#### ThreeLists and SectionNav: `components/ThreeLists.tsx`

```typescript
interface ThreeListsProps {
  view: StreetView
  engine: Pick<GhostedEngine, "history">     // passed on to PersonCard's history link
  blocked: BlockedReason
  headingRefs: Record<"fading" | "empty" | "still", RefObject<HTMLHeadingElement>>
  onOpen: (person: Person) => void           // Still lit rows open the card in a dialog
  actions: PersonActions                     // see PersonCard
}
interface SectionNavProps {
  counts: Record<ItemState, number>
  onGoTo: (section: SectionId) => void       // focus() on the section's h2 (tabindex -1)
}
```

Three full-width sections stacked in the wireframe's order: **Fading**, **Empty windows**, **Still lit**. There are no side-by-side columns (Req 11.6, 24.7). Each has its own lighting class (`gh-plot-fading` reads `--flick`, `gh-plot-empty` reads `--dark`, `gh-plot-still` reads `--glow`) and a count badge (Req 11.4).

- **Fading**: weak people, lowest health first, ties by id (`sortFading`), each as an inline `PersonCard`.
- **Empty windows**: dead people in `engine.graveyard()` order (most recent `diedAt` first, ties by id). The order is rebuilt from `people` with the same comparator, because the graveyard reads stored state and a preview death is only in `view(now)`.
- **Still lit**: alive people sorted by `ghostedPolicy.nextDueAt(person, now)` ascending, ties by id. Each is a compact row with the glyph, word, name, relationship and "starts fading in N days" (`N = ceil((nextDueAt − now) / DAY_MS)`), and a quiet "Open" button.

An empty list shows one line in its own words, for example "Nobody is fading." (Req 11.6). `SectionNav` (in a `<nav aria-label="Sections">`) lists Street, Fading, Empty windows and Still lit with their counts (Req 11.5). Engine calls: `history` (through PersonCard). **Req 11.1-11.6, 16.1.**

#### MoonDock (wraps the shell TimeMachine): `components/MoonDock.tsx`

```typescript
interface MoonDockProps {
  today: number                               // realNow
  offsetMs: number
  onChange: (offsetMs: number) => void        // App: setPreviewOffsetMs
  markers: readonly DockMarker[]              // timeline.ts, computed at realNow
  formatDate: (ms: number) => string
  frames?: FrameScheduler; clock?: () => number; prefersReducedMotion?: () => boolean
}
// timeline.ts
type DockMarker = { id: string; name: string; type: "fades" | "dark"; at: number; day: number }  // day = ceil((at − today) / DAY_MS), 1..365
function dockMarkers(peopleToday: readonly Person[], forecastToday: ForecastEntry<PersonPayload, PersonPolicyData>[], today: number): DockMarker[]
```

Inside a `<div class="gh-dock">` fixed at the bottom:

- The moon SVG (`aria-hidden`). Its shade reads `--age`, so the moon moves across the sky in proportion to D / 365 (Req 12.3).
- The shell `TimeMachine` with `maxDays={365}`, `jumpDays={[30, 90, 180, 365]}` and `belowSlider={<MarkerTrack />}` (Req 12.1, 26).
- While `offsetMs > 0`, the shell `PreviewBanner` with "Future preview · nothing is saved" and "Back to today" (Req 12.5, 12.6).

The marker track has one `<button>` per marker, placed at `day / 365` of the track. Each shows the triangle (fades) or cross (goes dark) glyph and is named "Mira Castell starts fading on 3 March" or "Mira Castell goes dark on 3 March". Activating a marker calls `onChange(day × DAY_MS)` (Req 12.4, 16.1).

`dockMarkers` gets fade times from `ghostedPolicy.nextDueAt(person, today)` for people alive today, and dark times from `engine.forecast(today, 365 × DAY_MS)`. It keeps markers with `0 < day ≤ 365`, sorted by `at` then id. Engine calls: none (the App passes the forecast). **Req 12.1-12.7, 24.4, 25.1, 25.3, 26.**

#### PersonCard: `components/PersonCard.tsx`

```typescript
// lists.ts
function lastLoggedContactAt(history: readonly HistoryEntry[], payload: PersonPayload): number

interface PersonActions {
  onReachOut: (person: Person) => void
  onReconnect: (person: Person) => void
  onAutopsy: (person: Person) => void
  onEdit: (person: Person) => void
  onRemove: (person: Person) => void        // the App opens the confirmation; nothing is removed here
}
interface PersonCardProps extends PersonActions {
  person: Person                            // settled at now
  now: number
  darkAt: number | null                     // StreetView.darkAt.get(id) ?? null
  engine: Pick<GhostedEngine, "history">    // read when "History" is opened
  history: readonly HistoryEntry[]          // engine.history(id), memoised by the App per version: last contact and the History list
  blocked: BlockedReason
  formatDate: (ms: number) => string
  headingLevel?: 2 | 3                      // 3 inside lists, 2 inside the person dialog
}
```

The card shows:

- the name, the relationship tag, and the glyph with its word (`ShownState`: "lit again" with the circle when alive and `timesResurrected > 0`) (Req 13.1, 16.1, 16.2);
- "last contact N days ago" (Req 13.1, as amended). `N = floor((now − lastLoggedContactAt(engine.history(id), payload)) / DAY_MS)`, and "today" when N is 0. `lastLoggedContactAt` (`lists.ts`) returns the timestamp of the latest "tended" or "resurrected" entry, or `payload.lastContactAt` when there is none. It never reads `policyData.lastContactAt`, so a text sent today reads "today". The App reads each person's history once per `version` (memoised) and passes it in;
- "usual rhythm every N days";
- for weak people, "goes dark in N days" from `darkAt`;
- the `Window` (size "card");
- a health bar (`role="img"`, named "Freshness 44 of 100") with fixed marks at 60 and 10 and the words "flickering below 60, boarded up below 10" (Req 13.2).

Buttons:

- **Alive or weak:** one primary "Reach out".
- **Dead:** one primary "Reconnect" and a quiet "Autopsy". Autopsy is read-only and never blocked.
- **Always:** quiet "Edit" and "Remove", each at least 44 × 44 CSS px (`min-block-size`/`min-inline-size: 44px`).

Every write button gets `blocked` (Req 13.3, 13.4). "History" is a quiet disclosure button. It lists the contacts newest first: each "tended" or "resurrected" entry from `engine.history(id)`, with the date, kind ("Sent a message", "Had a call", "Met up"; "Reconnected" is added for resurrected entries) and "freshness N" from `entry.health` (Req 13.6). Engine calls: `history`. **Req 13.1-13.6, 16.1-16.5.**

The same card is shown in a modal "person dialog" (`PersonDialog`, the card plus Close, `useModalDialog`, focus on the card's heading) when opened from the Street, a Still lit row or the hero (Req 10.4).

#### ConfirmDialog (remove and reset): `components/ConfirmDialog.tsx`

```typescript
interface ConfirmDialogProps {
  message: string              // "Remove Mira Castell? This cannot be undone." / "Reset all data? This cannot be undone."
  confirmLabel: string         // "Remove" / "Reset all data"
  onConfirm: () => void        // App: runGatedWrite(previewing, () => engine.remove(id)) or resetAllData
  onCancel: () => void         // Cancel comes first; Escape cancels
}
```

Engine calls: none (the App removes). **Req 13.5, 20.7.**

#### ReachOutDialog: `components/ReachOutDialog.tsx`

```typescript
interface ReachOutDialogProps {
  engine: Pick<GhostedEngine, "tend" | "view">
  clock: () => number
  person: Person                                       // alive or weak when opened
  blocked: BlockedReason                               // live
  session?: { position: number; total: number; onStop: () => void }   // "Person N of M", "Stop session"
  write: (w: () => void) => WriteOutcome               // App's runGatedWrite bound to its ref and announcer
  onWrite: () => void                                  // bump version
  onResult?: (r: { kind: ContactKind; before: number; after: number } | { wentDark: true }) => void
  onClose: () => void
}
```

On open, the dialog reads the person settled at `t = clock()` (`engine.view(t)`) and works out each choice's effect with `ghostedPolicy.applyEvent(settled, { kind }, t).health`. This is pure and saves nothing. The three choices, "Sent a message", "Had a call" and "Met up", each show "Freshness 42 → 82" (Req 18.1). There is no free "mark as contacted" control (Req 18.3).

Picking one calls `write(() => engine.tend(id, { kind }, clock()))` (Req 18.2). If `tend` throws `ITEM_ALREADY_DEAD` (the person went dark since the dialog opened), the dialog says "<name>'s window went dark before you reached out." and offers Reconnect next time. Any other error is rethrown by the gate.

On success the result text replaces the choices and takes focus: "<first name> is a little brighter. Freshness 42 → 82." or "<first name> is lit again." It adds "Reach out again by <date> to keep the window lit.", using `ghostedPolicy.nextDueAt(updated, t)` on the item from `engine.view(t)` (Req 18.4).

Buttons: "Cancel" (quiet, no engine call, Req 18.5) before the pick, and the primary "Done" after it. The choices are outlined option buttons, so the dialog has one filled button at most. Focus opens on the dialog's question line (`tabindex="-1"`). Engine calls: `view`, `tend`. **Req 18.1-18.5, 9.5, 24.2, 24.3.**

#### ReconnectDialog: `components/ReconnectDialog.tsx`

```typescript
interface ReconnectDialogProps {
  engine: Pick<GhostedEngine, "resurrect">
  clock: () => number
  person: Person                                       // dead when opened
  blocked: BlockedReason
  write: (w: () => void) => WriteOutcome
  onWrite: () => void
  onResult?: (r: { ok: true; kind: ContactKind } | { ok: false; reason: string }) => void
  onClose: () => void
}
```

The dialog shows the boarded `Window` (size "dialog") and asks "Which contact happened?". The options are "Sent a message", "Had a call" and "Met up", plus a quiet "Cancel". There is no "No reply yet" (Req 14.1, 14.5, 14.6).

Picking one calls `write(() => outcome = engine.resurrect(id, { kind }, clock()))` (Req 14.2). On `{ ok: true }`, the window gets `boards="falling"` and the `relight` flash, and the text says "<first name>'s window is lit again. Freshness is 100." (Req 14.3). Under reduced motion it shows the lit window at once with the same text (Req 14.4).

`{ ok: false }` cannot come from the Ghosted policy (Req 4.2). If it does, the reason is shown as it is and nothing else happens. `ITEM_NOT_DEAD` is a bug and is rethrown. Focus opens on the question line. Engine calls: `resurrect`. **Req 14.1-14.6, 4.3, 16.5, 25.2.**

#### AddEditPersonDialog: `components/AddEditPersonDialog.tsx`

```typescript
interface AddEditPersonDialogProps {
  engine: Pick<GhostedEngine, "addItem" | "edit">
  clock: () => number
  timeZone?: string
  person?: Person                                      // omitted: add
  blocked: BlockedReason
  previewing: () => boolean                            // read on Save (gate)
  onSaved: (id: string, mode: "added" | "edited") => void   // App announces, marks own people, bumps version
  onClose: () => void
}
```

The fields follow `person-form.ts` (Req 17.1):

- name (text, 1-60);
- relationship (text, 0-40, a `<datalist>` of existing tags);
- usual rhythm (number, whole 1-365);
- last contact (`<input type="date" max={today}>`; add only);
- importance (radio 1, 2, 3);
- minutes to reach out (number, whole 1-600).

While adding, `startsDark(rhythm, dayStartOf(date, tz), clock())` updates a live hint, "This window starts dark", before saving (Req 17.3).

On Save, `validatePerson` returns field errors. Each error names its field and rule next to the field, focus moves to the first invalid field, the input is kept and nothing is saved (Req 17.7).

**Add:** `engine.addItem({ payload: { name, relationship, rhythmDays, lastContactAt: dayStartOf(date, tz) }, importance, costMinutes }, clock())` (Req 17.2).

**Edit:**

- The last contact date is shown read-only with "Log a contact to change this" (Req 17.5).
- `engine.edit(id, changes, clock())` gets only what changed: `payload: { ...person.payload, name, relationship, rhythmDays }` only when one of those three changed, and `importance`/`costMinutes` only when changed. If nothing changed, Save just closes (Req 17.4).
- After a rhythm change on a living person, the engine recomputes health, and the next render shows it (Req 17.6).

The dialog handles storage problems itself, as Study Dungeon's form does. `classifyWriteError` → `storageProblemText[problem]` shows in a `role="alert"` paragraph inside the form, which stays open with the input (Req 17.8). Other errors are rethrown. During a preview, the dialog cannot be opened (the Add and Edit buttons are blocked), and Save checks `previewing()` again. Engine calls: `addItem`, `edit`. **Req 17.1-17.8, 23.3.**

#### PersonAutopsy (AutopsyDialog wrapper): `components/PersonAutopsy.tsx`

```typescript
interface PersonAutopsyProps {
  engine: Pick<GhostedEngine, "autopsy" | "history" | "view">
  personId: string
  now: number                                          // works in a preview: autopsy settles in memory
  formatDate: (ms: number) => string
  timeZone?: string
  onClose: () => void
  onReconnect: () => void                              // App closes this and opens ReconnectDialog
  blocked: BlockedReason
}
// autopsy-chart.ts
type ContactMarker = AutopsyMarker & { kind: ContactKind }
function buildAutopsyChart(history: readonly HistoryEntry[], payload: PersonPayload, report: AutopsyReport<ContactEvent>, samples?: number):
  { points: AutopsyChartPoint[]; markers: ContactMarker[] }
```

The wrapper reads `report = engine.autopsy(id, now)`, the person from `engine.view(now)` and `engine.history(id)`. It renders the shell `AutopsyDialog` with:

- `points` and `markers` from `buildAutopsyChart`, with `tends={[]}`;
- `renderMarker` from `icons.tsx` and `markerSummary` from `wording.ts`, for example "3 calls, 2 messages, 1 meet-up";
- `causeSentences={generateCauseSentences(report, payload, { timeZone })}`;
- `thresholds={ghostedPolicy.thresholds}`;
- `focusContentOnOpen`, `onResurrect={onReconnect}`, `resurrectDisabled={blocked !== undefined}` and `resurrectDisabledReason={blocked}`.

How `buildAutopsyChart` works:

- **Replaying the life.** It replays the current life through the policy. It starts from `lifeStartedAt` with `lastContactAt` = `init(payload)` (creation) or the resurrection time. Each "tended" entry in the life is applied with `ghostedPolicy.applyEvent`. Health is then sampled with `ghostedPolicy.healthAt`, 48 steps plus the points just before and after each contact, up to `report.diedAt`.
- **Started dark.** When `lifeStartedAt === diedAt`, the line runs from `payload.lastContactAt` to `diedAt`, so the chart is never a single point.
- **Markers.** There is one marker per entry in `report.tends`, with labels "Message", "Call" and "Meet-up".

Engine calls: `autopsy`, `history`, `view`. **Req 19.1-19.6, 24.2, 28.**

#### ForecastControl: `components/ForecastControl.tsx`

```typescript
interface ForecastControlProps {
  engine: Pick<GhostedEngine, "forecast">
  now: number                                          // previewed time while previewing (Req 22.4)
  version: number
  formatDate: (ms: number) => string
}
```

Radio buttons for 7, 30 and 90 days, with 30 selected first (Req 22.1). It lists `engine.forecast(now, H × DAY_MS)` in engine order (soonest first, ties by id), each entry as "<name> goes dark on <date>" with the person's glyph and word at `now` (Req 22.2). When the list is empty it shows "Nobody goes dark in the next H days." (Req 22.3). Engine calls: `forecast`. **Req 22.1-22.4.**

#### PrivacyLine: `components/PrivacyLine.tsx`

```typescript
interface PrivacyLineProps { ownPeople: boolean }       // hasOwnPeople(storage)
```

Below the lists, it shows "Everything stays in this browser. Names here are made up." By default, or "Everything stays in this browser." once `ownPeople` is true. Adding, importing or restoring sets the flag. Engine calls: none. **Req 15.1, 15.2.**

#### BackupControls: `components/BackupControls.tsx` (copy of Study Dungeon's)

```typescript
interface BackupControlsProps {
  storage: FlagStorage
  reload: () => void
  announce: (text: string, problem?: boolean) => void
  restoreBlocked: BlockedReason                         // restore is a write; Back up still works in a preview
  today: () => Date                                     // file name: ghosted-backup-YYYY-MM-DD.json
  onRestoreChecked: (check: Extract<RestoreCheck, { ok: true }>) => void   // App opens the confirm dialog
}
```

"Back up" calls `makeBackup(storage, today())` and downloads the result through a Blob URL, which is local only. "Restore" reads a chosen file and calls `checkBackup(text)`. A failure announces the reason and changes nothing (Req 21.4). Success opens a ConfirmDialog, "Replace your street with N people from this file? This cannot be undone.". On confirm, `runGatedWrite(previewing, () => applyBackup(storage, check.snapshot))` runs, then `reload()` (Req 21.2, 21.3). Engine calls: none (`checkBackup` builds its own throwaway engine). **Req 21.1-21.4, 12.5.**

#### ImportDialog: `components/ImportDialog.tsx`

```typescript
interface ImportDialogProps {
  engine: Pick<GhostedEngine, "addItem">
  clock: () => number
  timeZone?: string
  previewing: () => boolean
  onImported: (added: number) => void                   // App announces, marks own people, bumps version
  onClose: () => void
  onWriteError?: (error: unknown) => boolean            // storage problem handled by the App
}
```

The dialog has a textarea, the line format in words, and the note "Imported people get importance 2 and 10 minutes" (Req 21.5). "Import" calls `parseImport(text, clock(), timeZone)` and then `engine.addItem({ payload, importance: IMPORT_IMPORTANCE, costMinutes: IMPORT_COST_MINUTES }, clock())` for each person, in line order. Skipped lines are listed as "Line N: <reason>" (Req 21.6).

If storage fills up part-way, the dialog stops, says how many people were added, and keeps the remaining text. Each add is its own engine save, so the added people stay. The dialog cannot be opened during a preview, and "Import" checks `previewing()` again. Engine calls: `addItem`. **Req 21.5, 21.6, 17.1, 23.3.**

#### ResetData: `components/ResetData.tsx` (copy)

```typescript
interface ResetDataProps { onConfirm: () => void; blocked: BlockedReason }
```

A quiet "Reset all data" button that opens a `ConfirmDialog`. On confirm, `resetAllData(storage, reload)` removes exactly `RESET_KEYS`. **Req 20.7.**

### 4.5 Requirement coverage by component

| Requirement | Component(s) |
|---|---|
| 6 Splash | Splash, App (splash flag) |
| 7 Header sign | NeonSign |
| 8 Hero | Hero (+ shell Counters) |
| 9 Triage | GhostedTriage (+ shell TriagePanel), App session queue, ReachOutDialog |
| 10 Street | Street, House, Window, PersonDialog |
| 11 Three lists | ThreeLists, SectionNav, PersonCard |
| 12 Dock | MoonDock (+ shell TimeMachine, PreviewBanner), App (`--age`, gate) |
| 13 Person card | PersonCard, PersonDialog, ConfirmDialog |
| 14 Reconnect | ReconnectDialog |
| 15 Privacy | PrivacyLine |
| 16 State shown three ways | Window, PersonCard, ThreeLists, Street, GhostedTriage, MoonDock, ForecastControl, Counters (list name) |
| 17 Add and edit | AddEditPersonDialog, `person-form.ts` |
| 18 Reach out | ReachOutDialog |
| 19 Autopsy | PersonAutopsy (+ shell AutopsyDialog), `autopsy-chart.ts`, `autopsy-sentences.ts` |
| 20 First run | Hero, App, `first-run.ts`, `sample-data.ts`, ResetData |
| 21 Backup and import | BackupControls, ImportDialog, `backup.ts`, `import-people.ts` |
| 22 Forecast | ForecastControl |
| 24 Keyboard and layout | every component; section 5.4 |
| 25 Reduced motion | `styles/motion.css`, Splash, ReconnectDialog |

---

## 5. Window art

### 5.1 CSS variables and where they are set

| Variable | Set on | Value | Read by |
|---|---|---|---|
| `--lit` | each `span.gh-pane` (inline style from `Window`) | `health / 100`: a number from 0 to 1 with up to 4 decimals, 0 for dead (health 0) | pane background, glow, silhouette opacity (Req 16.3, property 10) |
| `--age` | `div.gh-app` (inline style from `App`) | `previewOffsetMs / (365 × DAY_MS)`, 0 to 1 | dim overlay, street lamps, fog density, moon position (Req 12.2, 12.3) |
| `--dock-max` | `:root` in `layout.css` | `180px`; `128px` below 520px | the dock's `max-block-size`, `scroll-padding-bottom`, `<main>` bottom padding (Req 12.7) |
| tokens | `:root` in `tokens.css` | the Ghosted section of `design-tokens.md` | everything |

Window rules (`window.css`). Colours come only from the Ghosted tokens in `design-tokens.md`, including the scenery tokens taken from the wireframe (`--frame`, `--wall`, `--wall-lo`, `--wall-edge`, `--board`, `--board-lo`, `--board-2`, `--board-2-lo`, `--moon`, `--moon-shade`, `--border-hero`, `--border`, `--border-button`), with `color-mix` for transparency:

```css
.gh-pane {
  background: color-mix(in srgb, var(--glow) calc((10% + var(--lit) * 90%)), transparent);
  box-shadow: 0 0 calc(var(--lit) * 26px) color-mix(in srgb, var(--glow) calc(var(--lit) * 55%), transparent);
}
.gh-pane[data-state="weak"] {
  background: color-mix(in srgb, var(--flick) calc((15% + var(--lit) * 85%)), transparent);
  box-shadow: 0 0 calc(var(--lit) * 16px) color-mix(in srgb, var(--flick) calc(var(--lit) * 50%), transparent);
}
.gh-pane[data-state="dead"] { background: var(--bg); box-shadow: inset 0 0 14px #000; }   /* boarded, dark */
.gh-pane .gh-sil { opacity: calc(0.15 + var(--lit) * 0.6); }
.gh-pane[data-state="dead"] .gh-sil { display: none; }                                  /* no silhouette (Req 16.5) */
.gh-pane { border: 3px solid var(--frame); }                                            /* frame and mullions */
.gh-sil { fill: var(--frame); }
.gh-board:nth-child(1) { background: linear-gradient(var(--board), var(--board-lo)); }
.gh-board:nth-child(2) { background: linear-gradient(var(--board-2), var(--board-2-lo)); }
.gh-house-roof { background: var(--wall); }
.gh-house-body { background: linear-gradient(180deg, var(--wall), var(--wall-lo)); border: 1px solid var(--wall-edge); }
.gh-moon-face { fill: var(--moon); stroke: var(--border); } .gh-moon-shade { fill: var(--moon-shade); }
.gh-hero { border-color: var(--border-hero); } .gh-triage, .gh-dock-in { border-color: var(--border); }
.gh-button-quiet { border-color: var(--border-button); }
```

`Window` renders the boards (two `span.gh-board` planks) only when `state === "dead"` or `boards === "falling"`. Under reduced motion, the CSS hides falling boards at once.

Atmosphere layers (fixed, `pointer-events: none`, `aria-hidden`): dim overlay `opacity: calc(var(--age) * .4)`, vignette and fog. Street lamps get `opacity: calc(1 - var(--age) * .5)`. The moon's shade gets `transform: translateX(calc(60px - var(--age) * 52px))`.

### 5.2 States by light, glyph and word

| State (`ShownState`) | Window | Glyph (`icons.tsx`, `currentColor`) | Word | Glyph colour token |
|---|---|---|---|---|
| alive | lit warm yellow, silhouette | circle | "lit" | `--mint` |
| litAgain | lit, silhouette, one relight flash after the reconnect | circle | "lit again" | `--mint` |
| weak | orange, flickering (motion only) | triangle with a bar | "flickering" | `--flick` |
| dead | dark `--bg`, two boards, no silhouette | cross | "boarded up" | `--rust` |

Glyphs are always next to their word and wrapped in `aria-hidden`; the words are text. The shell theme mapping (`theme.ts`, `ghostedShellTheme`): `bg --bg`, `panel --panel`, `panelHi --panel-hi`, `line --line`, `text --bone`, `textDim --dim`, `accent --glow`, `alive --mint`, `weak --flick`, `dead --rust`.

Contact markers on the autopsy chart (`renderMarker`) use shapes that differ from each other and from the state glyphs: message is a small envelope (rectangle with a V), call is a filled diamond, meet-up is two overlapping dots. Each is drawn in `--sign`.

### 5.3 Animations

Every rule below lives in `styles/motion.css`, inside one `@media (prefers-reduced-motion: no-preference) { … }` block. Outside that block no `animation`, `transition` or `scroll-behavior: smooth` is declared anywhere in the app's CSS (checked by a source test, part 3). The "Reduced motion" column is what the user sees instead: the end state with no movement (Req 25.2).

| Animation | Selector | Keyframes / property | Reduced motion | Req |
|---|---|---|---|---|
| Splash light-up | `.gh-splash .gh-pane:nth-child(1..6)` | `gh-lightup .5s forwards`, delays .3, .7, 1.1, 1.4, 1.9, 2.3 s | splash not shown at all (`shouldShowSplash` false) | 6.1, 6.3 |
| Sign hum | `.gh-sign` | `gh-sign 5s infinite` (text-shadow and a brief opacity dip) | steady glow: the static `text-shadow` is declared outside the block | 7.2, 7.3 |
| Window flicker | `.gh-pane[data-state="weak"]` | `gh-flicker 2.6s infinite` (opacity 1 → .6) | steady orange pane, triangle and "flickering" | 16.4 |
| Pane light change | `.gh-pane` | `transition: background .3s, box-shadow .3s` | new light shown at once | 12.2 |
| Boards falling | `.gh-pane[data-boards="falling"] .gh-board` | `gh-boards-fall .8s forwards` (translateY 120%, rotate, fade) | boards hidden at once (`display: none` outside the block for `data-boards="falling"`) | 14.3, 14.4 |
| Relight flash | `.gh-pane[data-relight]` | `gh-relight .9s` (brightness .3 → 1.8 → 1) | none; lit state shown | 14.3, brief |
| Moths | `.gh-moths i` (3 dots beside alive Street panes) | `gh-moth 6s ease-in-out infinite` | `.gh-moths { display: none }` outside the block, `display: block` inside it | 25.1 |
| Fog drift | `.gh-fog` | `gh-fog 60s linear infinite` (background-position) | still fog | 25.1 |
| Headlights | `.gh-headlights` (a light sweep along the Street's kerb) | `gh-headlights 18s linear infinite` | not shown (`display: none` outside the block) | 25.1 |
| Moon movement | `.gh-moon-shade` | `transition: transform .3s` | moon jumps to its position | 12.3, 25.1 |
| Smooth scrolling | `html` | `scroll-behavior: smooth` | instant scrolling | 25.1 |
| Time machine Play | shell `TimeMachine` | requestAnimationFrame (shell) | jumps straight to +365 days (shell behaviour) | 25.3 |

The App's only JavaScript timers are the settle tick and the shell's Play. There is no `requestAnimationFrame`, `Element.animate` or `setTimeout`-driven motion in Ghosted. The relight flash and falling boards are CSS keyframes started by an attribute, and the attribute is removed on the element's `animationend` event (which never fires under reduced motion, where the attribute has no effect).

The wireframe's walking cat in the header is not in Requirement 25.1's list and is not built (Open issue 2.6).

### 5.4 Focus and 320px rules

Focus:

- `:focus-visible { outline: 2px solid var(--sign); outline-offset: 2px; }` applies everywhere. On lit panes the outline sits outside the pane (offset), so it is drawn against `--panel`/`--bg`, never against the yellow light (Req 24.5).
- Window buttons, marker buttons and dock controls all keep this outline.
- Dialogs focus their content (an `h2` or first paragraph with `tabindex="-1"`). The shell autopsy does the same through `focusContentOnOpen`. On close, focus returns to the opener through `useReturnFocus`, or to the hero heading when the opener is gone (Req 24.2, 24.3).
- `html { scroll-padding-bottom: calc(var(--dock-max) + 12px) }` and `main { padding-block-end: calc(var(--dock-max) + 24px) }`, with the dock limited to `max-block-size: var(--dock-max); overflow-y: auto`. A focused element can therefore never sit behind the dock (Req 12.7).

320px layout (Req 24.4, 24.7):

- The page is `max-inline-size: 1080px` with a gutter of `max(16px, env(safe-area-inset-*))`, which leaves a 288px content box at 320px.
- No fixed width, minimum width, flex basis or grid minimum above 288px. The card grid is `repeat(auto-fill, minmax(min(100%, 280px), 1fr))`, and houses are `inline-size: min(100%, var(--w))`.
- Below 520px:
  - The dock uses a 40px moon and keeps the slider.
  - `.shell-time-machine-controls` (the jumps and Play) and the preview banner's "Back to today" sit in one row with `flex-wrap: nowrap; overflow-x: auto`, so they scroll sideways inside the dock rather than the page.
  - The marker track and its tick labels are hidden, since the slider and jumps still give the same days.
- Hero, Triage and the lists stack in one column under 760px. No section has a column beside empty space at any width.

---

## 6. Sample data

`sample-data.ts` replays dated adds and contacts through the real engine, then calls `engine.tick(now)` (Req 20.3), as Study Dungeon's does.

```typescript
export type SampleStep = { daysAgo: number; kind: ContactKind; reconnect?: true }   // reconnect → engine.resurrect
export type SamplePerson = {
  name: string; relationship: string; rhythmDays: number
  importance: 1 | 2 | 3; costMinutes: number
  addedDaysAgo: number; lastContactDaysAgo: number      // payload.lastContactAt = now − lastContactDaysAgo × DAY_MS
  steps: SampleStep[]                                  // oldest first
  expected: ItemState; litAgain?: true; startsDark?: true   // checked by the tests
}
export const SAMPLE_PEOPLE: readonly SamplePerson[]
/** Adds the 12 people at their past times, replays their steps, ticks at `now`. Returns their ids. */
export function loadSampleData(engine: Pick<GhostedEngine, "addItem" | "tend" | "resurrect" | "tick">, now: number): string[]
```

### 6.1 The arithmetic used

For rhythm `r` days, `T = 3r` days. A person whose effective last contact was `a` days ago has freshness `100 × (1 − a / 3r)`, so:

- **lit** while `a ≤ 1.2r` (exactly 60 at `1.2r`);
- **flickering** while `1.2r < a ≤ 2.7r` (exactly 10 at `2.7r`);
- **dark** once `a > 2.7r`.

A **call** or **meet-up** sets `a = 0`. A **text** adds 40 freshness, which is the same as `a → max(0, a − 1.2r)`. That follows from Requirement 2.1: `L' = t − (100 − h')/100 × T`, and with `h' = h + 40` this gives `a' = a − 0.4T`. A reconnect sets `a = 0`.

Every final age keeps at least 1 day from the nearest boundary, and every contact happens while the person is not dark (otherwise `tend` would throw `ITEM_ALREADY_DEAD`). Times are whole days before `now`, so the result does not depend on the time of day.

### 6.2 The 12 people

Notation: "−60" means 60 days before `now`. `L` is `policyData.lastContactAt` and `a` is the age in days at the time named.

| # | Name | Relationship (house) | r | Imp | Min | Added (last contact given) | Steps, with the arithmetic | Age at `now`, health | State at `now` |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Priya Raman | Family | 30 | 3 | 15 | −60 (−60) | call −30 (a 30 ≤ 36, lit) → L −30; text −12 (a 18, h 80 → min(100, 120) = 100) → L −12 | 12 → **86.67** | lit; fades on day +24 (60 exactly), dark +69 |
| 2 | Sam Rivera | College | 14 | 2 | 10 | −40 (−40) | meet-up −30 (a 10) → L −30; text −18 (a 12, h 71.43 → 100) → L −18; call −5 (a 13 ≤ 16.8) → L −5 | 5 → **88.10** | lit; fades +11.8 (day 12), dark +32.8 (day 33). **All three kinds** |
| 3 | Sunita Rao | Family | 7 | 3 | 15 | −20 (−20) | call −13 (a 7 ≤ 8.4) → L −13; call −6 (a 7) → L −6 | 6 → **71.43** | lit; fades +2.4 (day 3), dark +12.9 (day 13) |
| 4 | Nia Bello | Work | 45 | 2 | 15 | −200 (−200) | call −180 → L −180; dark at −180 + 121.5 = −58.5; **reconnect** by meet-up −20 (a 160 > 121.5, so dead) → L −20, health 100 | 20 → **85.19** | **lit again** (`timesResurrected` 1); fades +34, dark +101.5 (day 102) |
| 5 | Dan Okafor | Work | 45 | 2 | **5** | −120 (−150) | at add a 30, h 77.78 (lit); text −70 (a 80, h 40.74 → 80.74; a' = 80 − 54 = 26) → L −96 | 96 → **28.89** | flickering (54 < 96 ≤ 121.5); dark +25.5 (day 26) |
| 6 | Grace Liu | Neighbours | 30 | 1 | 15 | −81 (−81) | call −51 (a 30 ≤ 36) → L −51 | 51 → **43.33** | flickering (36 < 51 ≤ 81); dark +30 |
| 7 | Meera Joshi | College | 21 | 3 | 25 | −90 (−90) | call −60 (a 30, weak, not dark: 30 ≤ 56.7) → L −60; call −35 (a 25 ≤ 25.2) → L −35 | 35 → **44.44** | flickering (25.2 < 35 ≤ 56.7); dark +21.7 (day 22) |
| 8 | Joel Kim | Work | 90 | 3 | 30 | −300 (−300) | meet-up −250 (a 50) → L −250; call −140 (a 110 ≤ 243) → L −140 | 140 → **48.15** | flickering (108 < 140 ≤ 243); dark +103 |
| 9 | Leo Marchetti | Neighbours | 60 | 1 | 20 | −400 (−400) | call −330 (a 70 ≤ 72) → L −330; text −250 (a 80, h 55.56 → 95.56; a' = 80 − 72 = 8) → L −258 | 258 > 162 → **0** | boarded up; went dark at −258 + 162 = **−96** |
| 10 | Tomas Novak | *(none)* → Others | 120 | 1 | 20 | −30 (**−400**) | none. At add a = 370 > 2.7 × 120 = 324 (health 100 × (1 − 370/360) < 0 → 0) | dead since add → **0** | boarded up; **started dark**: "created" and "died" both at −30; gap to `diedAt` 370 days ≈ 3.1 × rhythm |
| 11 | Ayesha Khan | College | 14 | 2 | 15 | −120 (−120) | meet-up −100 (a 20 ≤ 37.8) → L −100; call −70 (a 30 ≤ 37.8) → L −70 | 70 > 37.8 → **0** | boarded up; went dark at −70 + 37.8 = **−32.2** |
| 12 | Harun Aziz | Family | 21 | 2 | 20 | −200 (−210) | at add a 10 (lit); call −180 (a 30 ≤ 56.7) → L −180; text −150 (a 30, h 52.38 → 92.38; a' = 30 − 25.2 = 4.8) → L −154.8 | 154.8 > 56.7 → **0** | boarded up; went dark at −154.8 + 56.7 = **−98.1** |

How the table meets each requirement:

| Rule | Met by |
|---|---|
| ≥ 3 lit, ≥ 3 flickering, ≥ 3 boarded up (Req 20.4) | 4 lit (1-4), 4 flickering (5-8), 4 boarded up (9-12) |
| one person with every contact kind (Req 20.4) | Sam Rivera: meet-up, text, call |
| ≥ 4 rhythms between 7 and 120 (Req 20.5) | 7, 14, 21, 30, 45, 60, 90, 120 |
| all three importance levels (Req 20.5) | 3: Priya, Sunita, Meera, Joel · 2: Sam, Nia, Dan, Ayesha, Harun · 1: Grace, Leo, Tomas |
| a started-dark person (Req 20.8, 19.6) | Tomas Novak: last contact 400 days before `now`, added at −30, so 370 days > 2.7 × 120 = 324 |
| unique fictional full names (Req 20.3, steering §4) | 12 distinct names. Ten come from the wireframe's sample list; "Aunt Sunita" became Sunita Rao and the remaining one is new. No banned wording |
| "lit again" shown (Req 16.2) | Nia Bello |
| the "Others" house (Req 10.2) | Tomas Novak has no tag |

Houses on the Street: College (Ayesha, Meera, Sam), Family (Harun, Priya, Sunita), Neighbours (Grace, Leo), Work (Dan, Joel, Nia), Others (Tomas).

### 6.3 What the sample shows at `now`

These are expectations for the tests (part 3) and for the demo. Days are counted from `now`. The engine dates a crossing up to one minute **after** it happens (it bisects at 1-minute precision, and health exactly 10 or exactly 60 is still weak or lit), so a day marked "+" below means that day plus up to one minute. Tests compare timestamps within one minute and list orders, never rounded day labels.

- **Hero:** "4 windows are flickering", with the primary button "Reach out to Dan" (Dan Okafor has the lowest freshness, 28.89).
- **Fading order:** Dan 28.89, Grace 43.33, Meera 44.44, Joel 48.15.
- **Empty windows order** (most recent dark first): Tomas −30, Ayesha −32.2, Leo −96, Harun −98.1.
- **Still lit order** (soonest to fade): Sunita (3 days), Sam (12), Priya (24), Nia (34).
- **Triage at 30 minutes.** Value = (100 − h)²/100 × importance:

  | Person | Value | Per minute |
  |---|---|---|
  | Dan | 101.14 | 20.23 |
  | Meera | 92.59 | 3.70 |
  | Joel | 80.66 | 2.69 |
  | Grace | 32.11 | 2.14 |

  The best set that fits 30 minutes is Dan (5) + Meera (25), worth 193.73, so the picks are **Dan, Meera** and the others are Grace (dark on day 30+) and Joel (day 103+).
- **Today's 5-minute action:** Reach out to Dan.
- **Dock markers within 365 days:**
  - fades (health below 60): Sunita 2.4, Sam 11.8, Priya 24+, Nia 34+;
  - goes dark (health below 10), in this order: Sunita 12.9, Meera 21.7, Dan 25.5, Grace 30+, Sam 32.8, Priya 69+, Nia 101.5, Joel 103+.
- **Forecast, 30 days:** Sunita, Meera, Dan. Grace is not listed: she goes dark just after day 30, outside a 30-day horizon. With 7 days: "Nobody goes dark in the next 7 days."

Fractional days (Harun's text, the bisected death times) are given as worked out.

---

## Open issues (part 1)

These are places where the real shell, engine or requirements did not line up. Nothing was worked around by inventing API.

**Resolved**

1. **The autopsy dialog's opening focus (Req 24.2).** *Decided:* a new optional shell prop, `focusContentOnOpen` (Requirement 28.5, section 3.3). Requirement 29.4 is unchanged, because the prop sits inside Requirement 28.
2. **Counters show list names, not state words.** *Decided:* Requirement 16.1 is amended. The counters show the glyph and the list name ("Still lit", "Fading", "Empty windows"), as the shell `Counters` already does. Everywhere else shows the state word.
4. **Import has no importance or minutes.** *Decided:* Requirement 21.5 is amended. Every imported person gets importance 2 and 10 minutes (`IMPORT_IMPORTANCE`, `IMPORT_COST_MINUTES` in `import-people.ts`, section 1.3).
6. **`initialBudget` outside the list when no `budgets` is given.** *Decided:* kept exactly as today. The "counts as none" rule applies only when `budgets` is given (section 3.2).

**Still open**

3. **Slider keyboard step over 365 days.** `TIME_MACHINE_STEP_MS` is one hour, so an arrow key moves the 365-day slider one hour out of 8 760 steps. The jumps cover large moves, and no requirement sets a step size, so the design leaves it alone. A `stepMs` prop would be another shell addition and is not proposed. FYI.
5. **Duplicate names on import.** Study Dungeon's import skips a repeated question. Requirement 21.6 skips only lines that break a form rule, and the form (17.1) does not require unique names, so Ghosted imports duplicates as written. Say if duplicates should be skipped instead.
7. **`policy.ts` is still the scaffold.** Its functions throw, its thresholds are `NaN` and its payload has no `relationship`. Every policy test, the sample data and the app need the developer's version first. Kiro will not touch the file.
8. **Engine fit (FYI).** No engine misfit has been found. `addItem` already records "created" and "died" at the same time for a person who starts dark. `autopsy` returns everything the sentences need. `edit` recomputes health after a rhythm change on a living person and leaves a dead one at 0. `resurrect` sets health to 100.

## Open issues (part 2)

Places where the real code or the requirements do not fit what part 2 needs. Nothing here is solved by inventing API. Sections 4 to 6 refer to these as 2.1 to 2.8.

**Resolved**

1. **The hero with no people after "Start empty".** *Decided:* Requirement 8.7 and 20.9 added. The hero says "No windows yet." with the primary button "Add a person", and the Street, lists, forecast and Triage are not rendered until one person exists (section 4.4, Hero).
2. **"Last contact N days ago" after a text.** *Decided:* Requirement 13.1 amended. The card reads the latest "tended" or "resurrected" entry from `engine.history(id)`, else `payload.lastContactAt`, never `policyData.lastContactAt` (`lastLoggedContactAt`, section 4.4, PersonCard).
5. **Colours in the wireframe that are not tokens.** *Decided:* the scenery colours (frames, walls, boards, moon, borders) are now Ghosted tokens in `design-tokens.md`, with the wireframe's exact values (section 5.1). Three wireframe shades were not on that list and stay derived from tokens: the primary button's dark edge (`#8a6a14` → `color-mix(in srgb, var(--glow) 55%, #000)`), its text (`#1d1405` → `var(--bg)`) and the dead pane (`#0d0b14` → `var(--bg)`). See Open issues (part 3), item 1.

**Still open (FYI, no decision needed)**


3. **No way to stop the shell's Play from outside.** `TimeMachine` keeps its `playing` state inside the component and has no prop to stop it. If a write dialog were open while Play runs, the offset would keep changing behind the modal. The design does not depend on stopping it: every write checks `previewing` at the moment of the call (`runGatedWrite`, section 4.2), so nothing is saved during a preview. No shell change is proposed (Req 29.4). FYI.
4. **Rhythm edits are not in the history.** The engine's "edited" entry records which fields changed (`fieldsChanged: ["payload"]`) but not the old values. After a rhythm change, the autopsy chart replays the whole life with the *current* rhythm, and the "about N times your usual rhythm" sentence uses it too. Fixing this would need the engine to store more, which is out of scope (engine unchanged). The design accepts the approximation. **FYI. Say if the chart should start at the last "edited" entry instead.**
6. **Wireframe parts not built.** The wireframe has a walking cat in the header, a "Walk in with sound" button, a sound toggle, epitaph quotes on cards, a "Not yet" reconnect option and "Freshness is 70" after a reconnect. Requirements 25.1 and 14 and the Out of Scope section rule these out or leave them out, so they are not built. The brief's moths, fog and headlights, which the wireframe lacks, are built. FYI; this affects the side-by-side check in Req 30.5.
7. **The splash when sessionStorage cannot be used.** `shouldShowSplash(null, …)` cannot remember that the splash was seen, so Requirement 6.2 (not again after a reload in the same tab) cannot hold. The design shows the splash once per page load in that case. FYI.
8. **The `AutopsyWording` right/wrong labels.** `markRight` and `markWrong` are required fields of the shell's `AutopsyWording`, but Ghosted's chart never shows them, because `markers` replaces them. Ghosted fills them with "Message" and "Call" so the type is satisfied. FYI; no shell change.

---

## 7. Testing Strategy

Rules (`testing.md`, `no-fake-tests.md`, steering `ghosted.md` §5):

- Every test checks behaviour with fixed timestamps: `T0 = 1_700_000_000_000` (the engine's `BASE_TIME`) plus day or minute offsets. No test reads the real clock: no `Date.now()`, no argument-less `new Date()`, no fake timers seeded from real time. `app-boundary.test.ts` scans the test files for these.
- Property tests use fast-check with `{ numRuns: 100 }` or more. A failing test is never skipped, weakened or marked `todo` to make it pass. The scaffold's `it.todo` stubs in `policy.test.ts` are replaced by real tests, never deleted without one.
- Tests run under Vitest with jsdom, with `test.testTimeout` 20000 (Req 32.4). Component tests use `@testing-library/react`. Engines in tests use `InMemoryAdapter` and `counterIds()`.

### 7.1 Generators: `apps/ghosted/src/test/generators.ts`

The engine's `packages/engine/tests/generators.ts` cannot be imported: the engine package exports only `"."`, and those generators drive a fake policy. Ghosted therefore has its own generators, modelled on the engine's: whole-minute timestamps from `T0` and a command list replayed through a real engine.

```typescript
export const T0 = 1_700_000_000_000
export const MINUTE_MS = 60_000, HOUR_MS = 3_600_000, DAY_MS = 86_400_000
export const spanMs = (rhythmDays: number) => 3 * rhythmDays * DAY_MS          // T

/** Common rhythms plus any whole number of days from 1 to 365. */
export function rhythmDays(): fc.Arbitrary<number>
  // fc.oneof(fc.constantFrom(1, 7, 14, 30, 90, 365), fc.integer({ min: 1, max: 365 }))
export function contactEvent(): fc.Arbitrary<ContactEvent>                   // fc.constantFrom of the three kinds

/** A person's add: payload, importance 1-3, minutes 1-600, and how old the last contact is at add time. */
export type AddSpec = {
  name: string; relationship: string; rhythmDays: number
  importance: 1 | 2 | 3; costMinutes: number
  ageFraction: number          // of T; −0.2..1.2. Below 0 means the last contact is in the future
}
export type Step = { afterFraction: number; event: ContactEvent }    // gap of afterFraction × T (0..0.6), rounded to whole minutes
export type Scenario = { add: AddSpec; steps: Step[]; viewFraction: number }   // steps 0..6; view 0..1.2 × T after the last step

export function scenario(): fc.Arbitrary<Scenario>
/**
 * Replays a scenario on a fresh engine: addItem at T0, then for each step at its
 * time, engine.resurrect if the person is dead then (engine.view(t)), otherwise
 * engine.tend. Returns the engine, the id and `now` (the view time).
 */
export function buildScenario(s: Scenario): { engine: GhostedEngine; id: string; now: number }
/** The person as the engine shows it at `now`: engine.view(now) for the scenario's id. */
export function personAt(s: Scenario): { person: Person; now: number; engine: GhostedEngine }
export function livingPerson(): fc.Arbitrary<{ person: Person; now: number; engine: GhostedEngine }>   // filter: state !== "dead"
export function deadPerson(): fc.Arbitrary<{ person: Person; now: number; engine: GhostedEngine }>     // filter: state === "dead"
/** Started dark: last contact more than 9T/10 before the add, in whole days plus under 12 hours (see Open issue 3.3). */
export function startedDark(): fc.Arbitrary<{ rhythmDays: number; gapMs: number; addAt: number }>
  // gapDays ≥ floor(2.7 × rhythmDays) + 1, gapMs = gapDays × DAY_MS + fc.integer({ min: 0, max: 12 × HOUR_MS − 1 })
```

With `ageFraction` spread over −0.2..1.2 of T, about 43% of new people start alive, 36% weak and 21% dead. The steps and the view time then move them between states. The coverage check below proves the spread. It does not rely on this estimate.

### 7.2 Generator Coverage Check: `apps/ghosted/src/generator-coverage.test.ts`

This follows the engine's Generator Coverage Check (`packages/engine/tests/properties/generator-coverage.test.ts`).

```typescript
// Feature: ghosted, Generator coverage: lit, flickering and boarded-up people all occur often
it("generated people reach all three states", () => {
  const samples = fc.sample(scenario(), { numRuns: 300, seed: 42 })
  const counts = { alive: 0, weak: 0, dead: 0 }
  for (const s of samples) counts[personAt(s).person.state]++
  const total = counts.alive + counts.weak + counts.dead          // 300
  for (const state of ["alive", "weak", "dead"] as const)
    expect(counts[state] / total, JSON.stringify(counts)).toBeGreaterThanOrEqual(0.1)
})
```

Three more checks in the same file, each with a fixed seed:

- Every contact kind appears in at least 10% of generated steps (seed 7, 300 samples).
- At least 5% of scenarios contain a reconnect, meaning a step on a dead person (seed 9). Property 9 and "lit again" depend on this.
- Every timestamp `buildScenario` uses is `T0` plus a whole number of minutes, and the times never decrease (seed 11).

### 7.3 Correctness properties to tests

Each row is one `fc.assert(fc.property(…), { numRuns })` test, named `// Feature: ghosted, Property N: …`. Properties 1 to 9 call `ghostedPolicy` directly, and some also go through the engine. Properties 10 to 12 render components. Property 13 uses the engine and the developer's `autopsy-sentences.ts`.

| # | Property | File | Generator | numRuns | What the test asserts |
|---|---|---|---|---|---|
| 1 | Health bounds | `src/policy.properties.test.ts` | `personAt(scenario())` plus `fc.integer({ min: −10 × 365, max: 10 × 365 })` days around `now` | 200 | `ghostedPolicy.healthAt(person, t)` is finite and in [0, 100] for the generated `t`, including times before the last contact and ten years ahead |
| 2 | Purity | `src/policy.properties.test.ts` | `personAt(scenario())`, `contactEvent()` | 100 | Two calls of `healthAt`, `nextDueAt`, `applyEvent` and `resurrect` with deep-cloned equal inputs give `toEqual` results. The input item is unchanged afterwards (compared with a `structuredClone` taken before) |
| 3 | Never brighter with time | `src/policy.properties.test.ts` | `personAt(scenario())`, `fc.integer({ min: 0, max: 2 × T })` ms for `t1 − now` and again for `t2 − t1` | 200 | `healthAt(person, t2) ≤ healthAt(person, t1)` |
| 4 | Future last contact | `src/policy.properties.test.ts` | `personAt(scenario())`, then a copy with `policyData.lastContactAt = now + fc.integer({ min: 1, max: 10 years })` | 100 | `healthAt(copy, now)` is exactly `100` (`toBe(100)`) |
| 5 | Settle-safe | `src/policy.properties.test.ts` | `personAt(scenario())`, any `lastEventAt` in `T0 ± 10 years` (whole minutes), any `health` in [0, 100] | 200 | `Object.is(healthAt(changed, now), healthAt(person, now))` |
| 6 | Text adds 40 up to 100 | `src/policy.properties.test.ts` | `livingPerson()` | 200 | With `h = healthAt(person, now)`, `applyEvent(person, { kind: "text" }, now).health === Math.min(100, h + 40)`, and `healthAt` of the updated item at `now` is within 1e-9 of it. Through the engine, `engine.tend` then `engine.view(now)` gives the same health within 1e-9 |
| 7 | Call and meet-up light fully | `src/policy.properties.test.ts` | `livingPerson()`, `fc.constantFrom("call", "meetup")` | 100 | `health === 100` and `policyData.lastContactAt === now`. Through the engine, `view(now)` health is 100 |
| 8 | Next due | `src/policy.properties.test.ts` | `personAt(scenario())` | 300 | Alive: `nextDueAt === L + 2 × T / 5` exactly, `Number.isInteger(nextDueAt − L)`, `healthAt` at that time within 1e-9 of 60, and below 60 one minute later. Weak: `nextDueAt === now`. Dead (engine state): `null`. Also a raw copy with `state: "alive"` but health below 10 gives `null` (Req 3.3) |
| 9 | Reconnect always works | `src/policy.properties.test.ts` | `deadPerson()`, `contactEvent()` | 100 | `ghostedPolicy.resurrect` returns exactly `{ ok: true, policyData: { lastContactAt: now } }`. `engine.resurrect` returns `{ ok: true }`. Afterwards `view(now)` shows alive, health 100, `healthAt` 100 and `timesResurrected` one higher |
| 10 | Light follows freshness | `src/components/Window.property.test.tsx` | `personAt(scenario())` | 100 | Rendering `<Window health={person.health} state={shownState(person)} />` gives a `.gh-pane` whose `--lit` is within 5e-5 of `person.health / 100` (5.1 writes up to 4 decimals), and 0 for a dead person |
| 11 | State in three ways | `src/components/PersonCard.property.test.tsx` | `personAt(scenario())` | 100 | In the rendered `PersonCard` and in its Street window, `data-state`, the glyph (`[data-glyph="circle" \| "triangle" \| "cross"]`) and the word ("lit", "lit again", "flickering", "boarded up") all match `shownState(person)`. "lit again" appears only when alive and `timesResurrected > 0` |
| 12 | Preview never writes | `src/write-guard.properties.test.ts` (gate) and `src/App.preview.property.test.tsx` (app) | Gate: `fc.boolean()` writes in a row, `previewing: true`. App: `fc.record({ offsetMs: fc.integer({ min: HOUR_MS, max: 365 × DAY_MS }), action: fc.constantFrom(...WRITE_ACTIONS), target: fc.nat() })` on the sample street | gate 1000, app 100 | Gate: `runGatedWrite(true, write, …)` returns `"blocked"` and never calls `write`. App: after moving the dock to `offsetMs` and trying the action, `RecordingAdapter.saves === 0`, the serialised snapshot and the `FlagStorage` contents are byte-for-byte what they were, and the control is `aria-disabled` with "Future preview · nothing is saved" |
| 13 | Started dark | `src/started-dark.test.ts` | `startedDark()` | 100 | `addItem` at `addAt` with `lastContactAt = addAt − gapMs` gives a dead person. The history is `created` then `died`, both at `addAt`. `engine.autopsy(id, addAt)` has `lifeStartedAt === diedAt` and no tends. `generateCauseSentences(report, payload)` contains `${floor(gapMs / DAY_MS)} days` (never below 1) and matches no `/\b0 days\b/` |

`WRITE_ACTIONS` lists every write control from Req 12.5 and section 4.2: add, edit, remove (with confirm), reach out (each kind), reconnect (each kind), restore (with a valid backup file), import (valid text), load sample street, start empty, reset all data (with confirm), Triage's start session, today's 5-minute action and the hero's primary button. `RecordingAdapter` (`src/test/recording-adapter.ts`) wraps `InMemoryAdapter`. It counts `save` calls and keeps the last saved snapshot as a JSON string.

The app-level property 12 test renders the whole App 100 times. It sets its own per-test timeout of 120 000 ms rather than lowering `numRuns` (Open issue 3.4).

### 7.4 Policy tests: `apps/ghosted/src/policy.test.ts` (Req 1 to 5)

These are unit and outcome tests, mirroring Study Dungeon's `policy.test.ts`. They are written by Kiro against the developer's `policy.ts`.

- **Contract.** `checkPolicy(ghostedPolicy, payloads, events, T0)` passes, with `failures` equal to `[]`. The payloads have rhythms 1, 30 and 365, with the last contact at `T0` and 10 days before it. The events are all three kinds (Req 5.1). The thresholds are `{ weak: 60, dead: 10 }` (Req 1.1).
- **Functions.**
  - `init` returns `{ lastContactAt: payload.lastContactAt }`.
  - `healthAt` follows the formula at days 0, 36, 37, 81, 82 and 90 for a 30-day rhythm, gives 100 for a future last contact, and ignores `lastEventAt` and `health` (Req 1.2-1.7).
  - `applyEvent`, for each kind, follows Req 2.1 to 2.4.
  - `nextDueAt` covers each branch, including `state: "dead"` (Req 3).
  - `resurrect`, for each kind, follows Req 4.
- **Outcomes, 30-day rhythm contacted at T0, through the engine (Req 5.2-5.7):**

| Check | Expected |
|---|---|
| day 36 | alive, health `toBe(60)` |
| day 37 | weak, ≈ 58.89 (within 1e-9 of 100 × 53 / 90) |
| day 81 | weak, health `toBe(10)` |
| day 82 | dead |
| `tick` at day 90: `diedAt` | in (T0 + 81 d, T0 + 81 d + 1 min] |
| alive→weak `state-changed` entry | in (T0 + 36 d, T0 + 36 d + 1 min] |
| text on day 45 | health 90 (within 1e-9); `lastContactAt` within 1 ms of T0 + 36 d; `nextDueAt` within 1 ms of T0 + 72 d |
| call or meet-up on day 45 | health 100; after `tick` at day 90, the weak crossing in (T0 + 81 d, T0 + 81 d + 1 min] |
| dead at day 90, reconnect by text | alive, health 100, `timesResurrected` 1 |

### 7.5 Sample tests: `apps/ghosted/src/sample-data.test.ts` (Req 20.3-20.5, 20.8, section 6)

`loadSampleData(engine, NOW)` runs with `NOW = T0` on `InMemoryAdapter`. Every step happens while the person can take it, so the replay throws nothing. Each `SAMPLE_PEOPLE` row's `expected`, `litAgain` and `startsDark` match `engine.view(NOW)`. The expectations below come from section 6.3:

| Check | Expected (times within one minute unless marked exact) |
|---|---|
| counts | 4 alive, 4 weak, 4 dead; 12 unique full names |
| freshness (within 1e-9) | Priya 100 × (1 − 12/90), Sam 100 × (1 − 5/42), Sunita 100 × (1 − 6/21), Nia 100 × (1 − 20/135), Dan 100 × (1 − 96/135), Grace 100 × (1 − 51/90), Meera 100 × (1 − 35/63), Joel 100 × (1 − 140/270); the four dead at 0 |
| hero target | `heroTarget(people)` is Dan Okafor |
| Fading order | Dan, Grace, Meera, Joel |
| Empty windows order | Tomas, Ayesha, Leo, Harun |
| Still lit order | Sunita, Sam, Priya, Nia |
| `diedAt` | Tomas exactly NOW − 30 d (= `createdAt`); Ayesha in (NOW − 32.2 d, +1 min]; Leo in (NOW − 96 d, +1 min]; Harun in (NOW − 98.1 d, +1 min] |
| Nia | `timesResurrected` 1, `shownState` "litAgain" |
| Tomas | history `created` and `died` at the same timestamp; `report.lifeStartedAt === report.diedAt` |
| Sam | logged contacts include text, call and meet-up |
| rhythms, importance | ≥ 4 distinct rhythms in 7..120; importance levels {1, 2, 3} |
| `engine.triage(30, NOW)` | picks [Dan, Meera] in that order, others [Grace, Joel]; values within 1e-6 of 101.136, 92.593, 32.111, 80.658 |
| 5-minute action | Dan |
| fade markers (`nextDueAt`, exact) | Sunita NOW + 2.4 d, Sam + 11.8 d, Priya + 24 d, Nia + 34 d |
| `engine.forecast(NOW, 365 d)` order | Sunita, Meera, Dan, Grace, Sam, Priya, Nia, Joel. Each `diesAt` is within one minute after 12.9, 21.7, 25.5, 30, 32.8, 69, 101.5 and 103 days |
| `engine.forecast(NOW, 30 d)` | Sunita, Meera, Dan (Grace's `diesAt` is after NOW + 30 d) |
| `engine.forecast(NOW, 7 d)` | `[]` |

Started-dark cases are covered three times: Tomas in this file, property 13 in `started-dark.test.ts`, and a component test that the autopsy dialog of a started-dark person shows a chart line from `payload.lastContactAt` to `diedAt` (never a single point) and no "0 days".

### 7.6 Requirements to tests

Types: **U** unit, **P** property, **C** component (React Testing Library, jsdom), **I** integration (App, or engine plus modules), **M** manual. "Source" marks a unit test that reads source or CSS files. All paths are under `apps/ghosted/src/` unless they name another package.

| Req | Types | Files |
|---|---|---|
| 1 Decay policy | U, P | `policy.test.ts`; `policy.properties.test.ts` (P1, P3, P4, P5) |
| 2 Contact events | U, P | `policy.test.ts`; `policy.properties.test.ts` (P2, P6, P7) |
| 3 Next due | U, P | `policy.test.ts`; `policy.properties.test.ts` (P8) |
| 4 Reconnect | U, P | `policy.test.ts`; `policy.properties.test.ts` (P9) |
| 5 Policy outcomes | U | `policy.test.ts` (7.4) |
| 6 Splash | U, C, I | `splash.test.ts` (`shouldShowSplash` with a fake session, reduced motion, null session); `components/Splash.test.tsx` (six panes, "Walk in", Escape); `App.first-run.test.tsx` (focus to the hero heading, not again after a reload with the same session storage) |
| 7 Header sign | C, U | `components/NeonSign.test.tsx` (the only `h1`, the text, the tagline); `motion.test.ts` (source: the hum is inside `no-preference`, the static glow outside it) |
| 8 Hero | C, I | `components/Hero.test.tsx` (all five cases with their wording and plurals, exactly one filled button, counters with glyph and list name, preview eyebrow and disabled reason); `App.preview.test.tsx` (8.5) |
| 9 Triage | C, I | `components/GhostedTriage.test.tsx` (choices 15/30/60/120 plus custom, 30 selected, the three steps, pick fields, the 5-minute action quiet or hidden); `App.session.test.tsx` (9.5: the queue in order, skipping a person who went dark or was removed) |
| 10 Street | U, C | `street.test.ts` (grouping, "Others", every person exactly once, order); `components/Street.test.tsx` (window names, legend, the freshness sentence, activating a window opens the card) |
| 11 Three lists | U, C, I | `lists.test.ts` (orders and ties, "starts fading in N days"); `components/ThreeLists.test.tsx` (badges, lighting classes, empty lines); `App.test.tsx` (the section nav moves focus to the heading) |
| 12 Dock | U, C, I | `timeline.test.ts` (markers within 365 days, names); `components/MoonDock.test.tsx` (range 365, jumps 30/90/180/365, banner, Back to today); `App.preview.test.tsx` (12.2 `--age` and `view(today + D)`, 12.5, 12.6); `App.preview.property.test.tsx` (P12); `layout-css.test.ts` (source: 12.7 scroll padding) |
| 13 Person card | C, I | `components/PersonCard.test.tsx` (fields; last contact from the history, so a text today reads "today"; marks at 60 and 10; buttons per state; the 44 px rule; history newest first); `App.test.tsx` (remove only after confirm) |
| 14 Reconnect dialog | C | `components/ReconnectDialog.test.tsx` (three options and no "No reply yet"; `resurrect` with each kind; success text; Cancel calls nothing; reduced motion shows the lit window at once) |
| 15 Privacy line | C, I | `components/PrivacyLine.test.tsx`; `App.test.tsx` (the line changes after add, import and restore) |
| 16 State three ways | P, C, U | `components/Window.property.test.tsx` (P10); `components/PersonCard.property.test.tsx` (P11); `components/Window.test.tsx` (dead: boards and no silhouette); `motion.test.ts` (16.4 flicker inside `no-preference`) |
| 17 Add and edit | U, C, I | `person-form.test.ts` (each rule, `startsDark`); `components/AddEditPersonDialog.test.tsx` (the `addItem` payload, the "starts dark" hint, edit sends only changed fields, last contact read-only, invalid input kept, storage full keeps the form open); `App.test.tsx` (17.6 new freshness after a rhythm change) |
| 18 Reach out | C | `components/ReachOutDialog.test.tsx` (before and after from the policy, `tend` with each kind, no free "mark contacted", result and next date, Cancel, went dark in between) |
| 19 Autopsy | U, C, P | `autopsy-chart.test.ts` (points, markers, started-dark line); `autopsy-sentences.test.ts` (facts and wording rules, see Open issue 3.2); `components/PersonAutopsy.test.tsx` (markers, legend, summary, focus on the content, Reconnect disabled in a preview); `started-dark.test.ts` (P13) |
| 20 First run and sample | U, I | `first-run.test.ts` (`RESET_KEYS` are exactly Ghosted's keys); `sample-data.test.ts` (7.5); `App.first-run.test.tsx` (20.1, 20.2 two clicks, 20.6, 20.7, 20.9 the empty-street hero with no lists) |
| 21 Backup, restore, import | U, C | `backup.test.ts` (file shape, each refusal reason, the snapshot checked by a real engine); `import-people.test.ts` (`\|`, tab and CSV, optional fields, the import day as default date, importance 2 and 10 minutes, line numbers and reasons); `components/BackupControls.test.tsx` (confirm before replace, blocked in a preview); `components/ImportDialog.test.tsx`; `app-boundary.test.ts` (source: no import from `apps/study-dungeon`) |
| 22 Forecast | C | `components/ForecastControl.test.tsx` (7/30/90 with 30 first, `forecast(now, H × DAY_MS)`, order, empty sentence, the previewed `now`) |
| 23 Storage | U, I | `engine-instance.test.ts` (the snapshot under `decay-engine:ghosted` in jsdom's `localStorage`); `storage-errors.test.ts`; `write-guard.test.ts`; `no-network.test.ts` (source: no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or remote URLs in `src/` and `index.html`); `App.storage-errors.test.tsx` (23.3) |
| 24 Keyboard, focus, layout | I, U, M | `App.accessibility.test.tsx` (every control reachable with Tab and working with Enter and Space, dialog focus on content, focus kept inside, Escape, focus returned, every button named in words); `layout-css.test.ts` (source: no width above 288 px, the dock's sideways scroll, the focus outline); `contrast.test.ts` (24.6); manual check at 320 px (24.4, 24.7) |
| 25 Reduced motion | U, C | `motion.test.ts` (source: every `animation`, `transition` and smooth scroll inside `no-preference`; no `requestAnimationFrame`, `Element.animate` or motion timers in `src/`); `components/ReconnectDialog.test.tsx` (25.2); `components/MoonDock.test.tsx` (25.3: reduced-motion Play goes to +365 days) |
| 26 Shell time machine | C | `packages/shell/src/components/TimeMachine.range.test.tsx`; existing shell and Study Dungeon tests unchanged (section 8) |
| 27 Shell Triage budgets | C | `packages/shell/src/components/TriagePanel.budgets.test.tsx`; unchanged existing tests (section 8) |
| 28 Shell autopsy markers and focus | C | `packages/shell/src/components/AutopsyDialog.markers.test.tsx`, `AutopsyDialog.focus.test.tsx`; unchanged existing tests (section 8) |
| 29 Engine unchanged | I | `scripts/check-engine-unchanged.sh` run by `scripts/check.sh` (section 8); `shell-boundary.test.ts` (source, 3.5) |
| 30 Look and fonts | U, C, M | `tokens.test.ts` (source: every colour in the app's CSS and TSX is a Ghosted token or a `color-mix` of tokens; `@fontsource` packages in `package.json`; no `fonts.googleapis.com` or `fonts.gstatic.com`; no `<img>`, image files or icon libraries); `primary-buttons.test.tsx` (30.4: filled buttons per region in each hero case, card state and dialog); manual side-by-side at 1280 and 390 px, with screenshots (30.5) |
| 31 Wording | U | `wording.test.ts` (no "doesn't care", "ignored you" or "ghosted you" in any `wording.ts` string, including functions called with sample arguments, in any sample person, or in the autopsy sentences of the sample's dead people; "connection freshness" is used; the list and state words of 31.3) |
| 32 App runs | U, I, M | `config.test.ts` (source: the `package.json` scripts, `vite.config.ts` `testTimeout: 20000` and `base: "/"`, README run command); `scripts/check.sh` build step; manual `pnpm --filter @decay-engine/ghosted preview` served from the root (32.3) |

Contrast pairs in `contrast.test.ts` (WCAG relative luminance, ratios worked out from the tokens):

| Text | On `--bg` | On `--panel` | On `--panel-hi` | On `--wall` | Rule |
|---|---|---|---|---|---|
| `--bone` | 16.95 | 16.04 | 14.76 | 14.43 | ≥ 4.5 |
| `--dim` | 8.84 | 8.36 | 7.69 | 7.52 | ≥ 4.5 |
| `--glow`, `--flick`, `--sign`, `--rust`, `--mint` | ≥ 7.99 | ≥ 7.56 | ≥ 6.96 | ≥ 6.80 | ≥ 4.5 |
| `--dark` | 3.90 | 3.69 | 3.39 | 3.32 | large text only (≥ 3.0) |
| `--bg` on `--glow` (primary button text) | 14.36 | | | | ≥ 4.5 |

The test also checks the CSS: `--dark` is used for text only in the Empty windows heading (26 px, weight 600, large text) and never for body-size text.

---

## 8. Engine-unchanged check (Requirement 29.2)

### 8.1 Recording the approval commit

When the developer approves this spec, they record the commit once and commit the file:

```bash
git rev-parse HEAD > .kiro/specs/ghosted/approved-commit.txt
git add .kiro/specs/ghosted/approved-commit.txt && git commit -m "Record Ghosted spec approval commit"
```

The file holds one full 40-character commit hash and a newline. No script writes it. "Written once" is enforced by the check: it fails if the file has been changed by more than one commit, or if its working copy differs from the committed one.

### 8.2 `scripts/check-engine-unchanged.sh`

```bash
#!/usr/bin/env bash
# Requirement 29: packages/engine is unchanged since the Ghosted spec was
# approved, and packages/shell changed only as Requirements 26 to 28 allow.
# Exit 0: unchanged. Exit 1: a change was found. Exit 2: the check cannot run.
set -euo pipefail
cd "$(dirname "$0")/.."

file=.kiro/specs/ghosted/approved-commit.txt
if [ ! -f "$file" ]; then
  echo "check-engine-unchanged: $file is missing." >&2
  echo "Record the approval commit once: git rev-parse HEAD > $file, then commit it." >&2
  exit 2
fi
commit="$(tr -d '[:space:]' < "$file")"
if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "check-engine-unchanged: $file does not hold a full commit hash." >&2; exit 2
fi
if ! git cat-file -e "${commit}^{commit}" 2>/dev/null; then
  echo "check-engine-unchanged: commit $commit is not in this repository." >&2; exit 2
fi

# Written once: at most one commit has touched the file, and the working copy matches it.
if [ "$(git log --format=%H -- "$file" | wc -l)" -gt 1 ]; then
  echo "check-engine-unchanged: $file was changed after it was first recorded." >&2; exit 1
fi
if git ls-files --error-unmatch "$file" >/dev/null 2>&1 && ! git diff --quiet HEAD -- "$file"; then
  echo "check-engine-unchanged: $file differs from its committed version." >&2; exit 1
fi

# 29.2: committed, staged and unstaged changes to tracked engine files since the approval commit.
if ! git diff --exit-code --stat "$commit" -- packages/engine; then
  echo "packages/engine changed since $commit." >&2; exit 1
fi
# 29.2: untracked files and any other working-tree change under packages/engine.
status="$(git status --porcelain --untracked-files=all -- packages/engine)"
if [ -n "$status" ]; then
  echo "$status" >&2; echo "packages/engine has uncommitted changes." >&2; exit 1
fi

# 29.4, 26.5, 27.4, 28.4: shell changes only in these files; existing tests untouched.
allowed='^packages/shell/src/(index\.ts|types\.ts|shell\.css|components/(TimeMachine|TriagePanel|AutopsyDialog)\.tsx|components/(TimeMachine\.range|TriagePanel\.budgets|AutopsyDialog\.markers|AutopsyDialog\.focus)\.test\.tsx)$'
changed="$( { git diff --name-only "$commit" -- packages/shell; git ls-files --others --exclude-standard -- packages/shell; } | sort -u )"
outside="$(printf '%s\n' "$changed" | grep -Ev "$allowed" | grep -v '^$' || true)"
if [ -n "$outside" ]; then
  echo "packages/shell changed outside Requirements 26 to 28:" >&2; echo "$outside" >&2; exit 1
fi
if ! git diff --exit-code --stat "$commit" -- 'apps/study-dungeon/src/*.test.ts' 'apps/study-dungeon/src/*.test.tsx' 'apps/study-dungeon/src/**/*.test.ts' 'apps/study-dungeon/src/**/*.test.tsx'; then
  echo "Study Dungeon tests changed since $commit." >&2; exit 1
fi

echo "packages/engine unchanged since ${commit:0:12}; shell changes within Requirements 26 to 28."
```

What each part covers:

- `git diff <commit> -- packages/engine` compares the approval commit with the working tree. It catches later commits and staged or unstaged edits to tracked files.
- `git status --porcelain --untracked-files=all` catches new untracked files. Ignored paths such as `node_modules` are not reported by either command.
- The shell part does not edit or skip any test. It only fails when a file outside the allowed list changes, which includes every existing shell test file.

### 8.3 How `scripts/check.sh` calls it

Four lines are added to `scripts/check.sh` (Req 32.2). No existing line changes.

```bash
step "engine unchanged"   bash scripts/check-engine-unchanged.sh      # right after "install"
step "typecheck ghosted"  pnpm --filter @decay-engine/ghosted typecheck
step "test ghosted"       pnpm --filter @decay-engine/ghosted test
step "build ghosted"      pnpm --filter @decay-engine/ghosted build
```

`step` already reports any non-zero exit as `FAIL`, and `check.sh` exits 1 when any step fails. Each outcome of the new step:

- **Missing approval file:** the step prints `FAIL`, and its log says how to record the commit. `check.sh` exits non-zero. The script never creates the file itself, because a commit recorded during a later check would not be the approval commit.
- **Malformed file or unknown commit (exit 2):** also `FAIL`.
- **Engine or shell-scope change found (exit 1):** also `FAIL`.

---

## 9. Error handling and accessibility notes

### 9.1 Storage errors (Req 23.3, 17.8, 20.7)

- **At startup.** `Root` builds the engine through `createEngineSafely`.
  - A snapshot that cannot be read ("corrupt") shows the `ProblemScreen` with Reload and "Reset all data". The reset removes exactly `RESET_KEYS` and reloads (Req 20.7).
  - No usable storage ("unavailable") shows the sentence and Reload.
  - Any other error reaches the `ErrorBoundary`'s crash screen. Nothing loads half-way.
- **Writes.** Every write goes through `runGatedWrite` (section 4.2). A full quota becomes "full" and `STORAGE_UNAVAILABLE` becomes "unavailable". The App announces `storageProblemText[problem]` in its polite live region, closes the open dialog and ends any Triage session. The engine guarantees that a failed save leaves memory and storage unchanged, so the screen stays true (Req 23.3). Errors that are not storage problems are rethrown to the crash screen and never hidden.
- **The add and edit form** handles its own storage problem. It stays open with the input and shows the sentence in a `role="alert"` paragraph inside the form (Req 17.8).
- **Settle ticks.** A tick's storage problem is announced once, and again only after a later tick has saved, as in Study Dungeon's `ticking.ts` handling.
- **Engine errors that mean "too late".** `ITEM_ALREADY_DEAD` from `tend` (the person went dark while the dialog was open) is shown as a sentence in the reach-out dialog, which then offers a reconnect (section 4.4). `ITEM_NOT_DEAD` from `resurrect` and `TIME_WENT_BACKWARD` are bugs and are rethrown.

### 9.2 Import errors (Req 21.5, 21.6, 17.1, 23.3)

- Each line is checked with `person-form.ts`. A line that breaks a rule is skipped and listed as "Line N: <reason>", for example "Line 4: the rhythm must be a whole number of days from 1 to 365". Every valid line is added in order with importance 2 and 10 minutes.
- Blank lines and lines starting with `#` are ignored. Text with no valid line adds nothing and says so.
- A storage problem part-way stops the import. The dialog says how many people were added and keeps the text of the lines not yet added. Each add is its own save, so the added people stay.
- During a preview, Import is disabled with the reason, and `runGatedWrite` blocks it anyway (Req 12.5).

### 9.3 Restore errors (Req 21.2-21.4, 12.5)

- `checkBackup` names the problem and changes nothing:
  - not JSON;
  - a backup from another app (`app` is another string);
  - not a Ghosted backup (`app` missing);
  - from a newer version;
  - damaged (a real engine cannot load the snapshot).
- A valid file opens a confirmation: "Replace your street with N people from this file? This cannot be undone." Only on confirm does `applyBackup` write, and then the page reloads. Cancel and Escape change nothing.
- A storage problem during `applyBackup` is announced, and there is no reload. The old snapshot stays, because `setItem` either replaces the value or throws.
- "Back up" works during a preview, because it only reads. "Restore" is blocked.

### 9.4 Dialog focus (Req 24.2, 24.3, 6.4, 28.5)

- Every app dialog is a native modal `<dialog>` opened through `useModalDialog`. `showModal()` makes the page behind it inert, which keeps focus inside the dialog. Escape fires `cancel`, which each dialog turns into its own close action.
- On open, focus goes to the dialog's content, its heading or first paragraph with `tabindex="-1"`, never to a button (Req 24.2). The shell autopsy does the same through `focusContentOnOpen` (Req 28.5).
- On close, `useReturnFocus` gives focus back to the opener. When the opener is gone (a person removed, or a card moved to another list), focus goes to the hero heading (Req 24.3).
- Chains (Autopsy → Reconnect, the next reach-out in a Triage session, Person dialog → Edit) take over the first dialog's opener, as in Study Dungeon.
- The splash closes to the hero heading (Req 6.4). The section navigation moves focus to the chosen section's `h2` (`tabindex="-1"`, Req 11.5).

### 9.5 Focus order (Req 24.1, 24.5)

Tab order follows the DOM, which matches the visual order:

1. the header sign (not focusable);
2. inside `<main>`: the hero's primary and quiet buttons;
3. Triage (choices, custom field, Run, start, the 5-minute action);
4. the section navigation;
5. the Street windows, house by house;
6. Fading cards, Empty windows cards, Still lit rows;
7. the forecast choices;
8. the toolbar (Add a person, Import, Back up, Restore, Reset all data);
9. the dock last: the slider, the marker buttons, the jumps, Play, then Back to today in the preview banner.

The dock is fixed at the bottom on screen but last in the DOM, so it comes last in the Tab order without any `tabindex` above 0. Disabled write controls use `aria-disabled` and stay focusable with their reason as the description (Req 12.5).

The focus outline is `2px solid var(--sign)` with a 2 px offset everywhere. `--sign` has a contrast of at least 7.14 against `--bg`, `--panel`, `--panel-hi` and `--wall`, which is above the 3:1 non-text minimum (Req 24.5).

### 9.6 Dock and scroll padding (Req 12.7, 24.4)

- The dock's height is capped at `--dock-max` (180 px, or 128 px below 520 px), and it scrolls inside itself if its content is taller.
- `html { scroll-padding-bottom: calc(var(--dock-max) + 12px) }` keeps any focused or scrolled-to element above the dock, and `main` gets bottom padding of `calc(var(--dock-max) + 24px)`, so the last content can scroll clear of it.
- At 320 px the dock keeps the slider, the jumps and Back to today on one row that scrolls sideways inside the dock (Req 24.4).
- jsdom cannot measure layout, so `layout-css.test.ts` checks the rules in the CSS source. The manual check at 320, 390 and 1280 px confirms them on screen (Open issue 3.5).

---

## Correctness Properties

Each property is a fast-check test with `{ numRuns: 100 }` or more, fixed timestamps and no real clock (section 7.3). The generators reach lit, flickering and boarded-up people, as the Generator Coverage Check proves (section 7.2).

### Property 1: Health bounds
For any person and any `now`, `healthAt` is finite and between 0 and 100.
**Validates: Requirements 1.3, 1.7**

### Property 2: Purity
The same item and `now` always give the same `healthAt`, `nextDueAt`, `applyEvent` and `resurrect` results, and the item is not changed.
**Validates: Requirements 1.3, 2.1, 2.2, 3.1-3.3, 4.1 (policy purity, `engine-boundary.md`)**

### Property 3: Never brighter with time
For any person and t1 ≤ t2 with no contact between them, `healthAt(t2) ≤ healthAt(t1)`.
**Validates: Requirement 1.6**

### Property 4: Future last contact
For any `lastContactAt` later than `now`, `healthAt` is exactly 100.
**Validates: Requirement 1.5**

### Property 5: Settle-safe
Changing `item.lastEventAt` or `item.health` never changes `healthAt`.
**Validates: Requirement 1.4**

### Property 6: Text adds 40 up to 100
For any person not dead, a text gives `min(100, h + 40)`, and `healthAt` at `now` matches it within 1e-9.
**Validates: Requirements 2.1, 2.3, 2.4**

### Property 7: Call and meet-up light fully
For any person not dead, a call or meet-up gives 100.
**Validates: Requirements 2.2, 2.3, 2.4**

### Property 8: Next due
For any alive person, `nextDueAt` is `policyData.lastContactAt + 2 × T / 5` (a whole number of milliseconds after the last contact), `healthAt` at that time is 60 within 1e-9, and it is below 60 one minute later. For any weak person `nextDueAt` is `now`, and for any dead person it is `null`.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 9: Reconnect always works
For any dead person and any contact kind, `resurrect` returns `ok: true`, and afterwards the person is alive with health 100.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 10: Light follows freshness
For any person, the window's `--lit` equals `health / 100`.
**Validates: Requirement 16.3**

### Property 11: State in three ways
For any person, the rendered window and card show the glyph and the word that match its state ("lit again" for a reconnected person).
**Validates: Requirements 16.1, 16.2**

### Property 12: Preview never writes
For any time-machine offset above 0, no write action reaches the engine or storage, and stored data stays byte-for-byte the same.
**Validates: Requirements 12.5, 8.5, 19.5**

### Property 13: Started dark
For any rhythm and any last contact more than `9 × T / 10` before the add time, the person is dead at creation, with "created" and "died" at the same timestamp. The autopsy sentences name the whole-day gap from `payload.lastContactAt` to `diedAt` (at least 1 day) and never contain "0 days".
**Validates: Requirements 19.6, 20.8**

---

## Open issues (part 3)

Places where the real code or the requirements do not fit what part 3 needs. Nothing here is solved by inventing API.

1. **Policy tests fail until `policy.ts` is written.** Every scaffold function throws and its thresholds are `NaN`, so `new DecayEngine(ghostedPolicy, …)` rejects it. The policy, sample, property, autopsy and App tests will fail, not skip, until the developer writes `policy.ts` (`no-fake-tests.md`). The task list must put the developer's policy first. FYI.
2. **Exact autopsy sentences.** `autopsy-sentences.ts` is hand-written, so Kiro cannot know its exact words in advance. `autopsy-sentences.test.ts` therefore checks facts (the day counts, the kind of the last contact, the rhythm ratio, the started-dark gap) and rules (no banned words, no "0 days"). Exact-sentence tests for fixed reports, like Study Dungeon's, need the developer's wording. They would be added after the file exists, or the developer supplies the expected sentences. **Needs your decision.**
3. **The whole-day gap in Property 13 and Req 19.6.** "The whole-day gap" does not say whether it is floored or rounded. The test asserts `floor(gap / DAY_MS)`, and its generator keeps the part below a day under 12 hours, so floor and round agree for every generated case. A gap like 95.6 days is therefore not tested. **Confirm floor, or say round.**
4. **App-level Property 12 runtime.** 100 full App renders may take longer than the 20 s default (Req 32.4). The test sets its own per-test timeout of 120 s, keeping `numRuns` at 100. The cheap gate-level property runs 1000 times. **Confirm a per-test timeout is acceptable.**
5. **No layout in jsdom.** Requirements 12.7, 24.4 and 24.7 (nothing behind the dock, no sideways scroll at 320 px, no column beside empty space) cannot be measured in jsdom. They are covered by CSS source tests plus the manual check at 320, 390 and 1280 px. No browser test runner is in the stack (`tech.md`). FYI.
6. **Test dependencies not yet in `apps/ghosted/package.json`.** It lists only the engine, Vitest and TypeScript. The setup task (Req 32.1) adds `fast-check` (`^4.10.2`, the engine's version), `@testing-library/react`, `jsdom`, `react`, `react-dom`, the shell and the `@fontsource` packages. FYI.
7. **The shell-scope check.** Section 8.2 fails on any shell change outside the files of sections 3.1 to 3.3 and the four new test files. A later shell need would make it fail until the list is widened, which Req 29.4 says should stop the work and be reported anyway. **Confirm the allowed list.**
8. **The approval commit and today's working tree.** `packages/engine` currently has no uncommitted changes. The repository as a whole does (for example `docs/KIRO_LOG.md` is staged as deleted). The check looks only at `packages/engine`, `packages/shell` and Study Dungeon's tests, so the rest does not affect it. The approval commit should still be recorded before any Ghosted code task starts. FYI.
9. **Kiro log.** Steering asks for a `docs/KIRO_LOG.md` session for every Kiro session that touches Ghosted. These spec sessions were limited to `.kiro/specs/ghosted/` (and `design-tokens.md` once), so no entry was written, and the file is currently staged as deleted in git. The log needs entries for the spec sessions once it is restored. **Needs your action.**
