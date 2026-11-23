# Design Document: @decay-engine/insight (task E1)

## 1. Overview

Insight is a pure TypeScript package with three functions:

- `replay` rebuilds an item from its history in a throwaway engine and returns the replayed item, its history and its death time.
- `whatIf` does the same replay with one extra tend at time `at`, and returns the new death time next to the baseline one.
- `deathTime` asks an engine when an item dies, using `view` and `forecast`.

Everything goes through the engine's public API. Insight never computes health or a death time itself (Requirement 5.7). The policy's maths runs only inside the engine, which calls the policy.

```
caller ──item, history──▶ replay ──▶ new DecayEngine(policy, new InMemoryAdapter(), () => item.id)
                                        addItem(current payload, importance, costMinutes, createdAt)
                                        tend / resurrect per recorded entry
                                        tick(until)
                                        view(until), history(id), deathTime(...)
                          ◀── { ok, item, history, diesAt, until, skipped }
```

## 2. Package setup

### 2.1 What is copied from `packages/shell`

| File | Copied from shell | Changed for Insight, and why |
|---|---|---|
| `package.json` | `"private": true`, `"version": "0.0.0"`, `"type": "module"`, `"main"`, `"types"` and `"exports"` all pointing at `./src/index.ts` (consumed from source, no build step), scripts `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`, the same `typescript` (`^7.0.2`), `vitest` (`^5.1.0`) and `@types/node` (`^22.0.0`) versions | Name `@decay-engine/insight`. `@decay-engine/engine` is a **dependency** (`workspace:*`), not a devDependency as in shell, because Insight imports runtime values (`DecayEngine`, `InMemoryAdapter`, `DecayEngineError`, `MAX_FORECAST_HORIZON_MS`, `MAX_TIMESTAMP`), not only types. `fast-check` `^4.10.2` added as a devDependency (version from `packages/engine/package.json`). No React, `react-dom`, Testing Library or jsdom, and no `peerDependencies`. |
| `tsconfig.json` | `target` ES2022, `module` ESNext, `moduleResolution` Bundler, `types: ["node"]`, `strict`, `noEmit`, `isolatedModules`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch`, `skipLibCheck`, `include: ["src"]` | `lib: ["ES2022"]` only (as the engine has), no `DOM` and no `jsx`, because there is no UI. |
| Tests next to the code in `src/`, helpers in `src/test/` | Same layout as shell (for example `src/boundary.test.ts`) | None. |
| `src/boundary.test.ts` | The shell's approach: read every file under `src` with `readdirSync(..., { recursive: true })`, skip the test file itself, and check import specifiers with the same regex | Insight's own rules (section 7.6). Insight's tests run in Vitest's default `node` environment, so `fileURLToPath(new URL(".", import.meta.url))` works (the jsdom problem from the Ghosted P5 fix does not apply). |
| No `vitest.config.ts` | Shell has none either | None. |

### 2.2 How an app would consume it

Exactly as the apps consume the shell today: add `"@decay-engine/insight": "workspace:*"` to the app's `dependencies`. pnpm links the workspace package, and Vite and `tsc` read `./src/index.ts` through the `exports` field. On Netlify, each app's `netlify.toml` already has the app folder as base and runs `pnpm --filter @decay-engine/<app> build`; pnpm installs the whole workspace (`pnpm-workspace.yaml` includes `packages/*`), so the package is built from source with the app. No `netlify.toml` changes. **E1 adds Insight to no app** (open question 10.1).

### 2.3 Files

New:

```
packages/insight/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts                  public exports only
    types.ts                  options, results, reasons, DEATH_TIME_PRECISION_MS
    death-time.ts             deathTime
    internal.ts               JSON copy, history checks, replay engine, one-entry step
    replay.ts                 replay
    what-if.ts                whatIf
    boundary.test.ts
    death-time.test.ts
    replay.test.ts
    replay.property.test.ts   P-A, P-B and P-E for replay
    what-if.test.ts
    what-if.property.test.ts  P-B and P-E for whatIf, P-C, P-D
    test/
      fixtures.ts             T0, DAY, MINUTE, ids
      policies.ts             expPolicy, linearPolicy, crammingPolicy, payloadHalfLifePolicy, throwingPolicy
      policies.test.ts        each test policy passes checkPolicy, plus hand-worked numbers
      scenario.ts             fast-check scenario arbitrary and runScenario
      scenario.coverage.test.ts
```

Changed: `scripts/check.sh` (two steps and the header comment), `pnpm-lock.yaml` (written by `pnpm install`, not by hand), `docs/KIRO_LOG.md`.

Not changed: anything under `packages/engine/`, `packages/shell/` or `apps/`, `scripts/check-engine-unchanged.sh`, `pnpm-workspace.yaml` (already includes `packages/*`), the root `package.json` (its `pnpm -r --if-present test` picks the package up).

## 3. Public API

`src/index.ts` exports exactly these names:

```typescript
export { replay } from "./replay"
export { whatIf } from "./what-if"
export { deathTime } from "./death-time"
export { DEATH_TIME_PRECISION_MS } from "./types"
export type {
  ReplayOptions,
  ReplayResult,
  ReplayReason,
  HistoryProblem,
  SkippedEntry,
  ExtraTend,
  WhatIfOptions,
  WhatIfResult,
  WhatIfReason,
  StopPoint,
  DeathTimeOptions,
} from "./types"
```

### 3.1 Signatures

```typescript
import type { DecayEngine, DecayPolicy, HistoryEntry, Item } from "@decay-engine/engine"

export function replay<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  item: Item<Payload, PolicyData>,
  history: readonly HistoryEntry[],
  options?: ReplayOptions
): ReplayResult<Payload, PolicyData>

export function whatIf<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  item: Item<Payload, PolicyData>,
  history: readonly HistoryEntry[],
  extra: ExtraTend<Event>,
  options?: WhatIfOptions
): WhatIfResult<Payload, PolicyData>

export function deathTime<Payload, PolicyData, Event>(
  engine: DecayEngine<Payload, PolicyData, Event>,
  itemId: string,
  from: number,
  options?: DeathTimeOptions
): number | null
```

### 3.2 Types (`src/types.ts`)

```typescript
/** The engine's bisection precision (engine Requirement 17a, BISECT_PRECISION_MS, not exported by the engine). */
export const DEATH_TIME_PRECISION_MS = 60_000

export type DeathTimeOptions = { horizonMs?: number }          // default MAX_FORECAST_HORIZON_MS
export type ReplayOptions = { until?: number; horizonMs?: number }
export type WhatIfOptions = { horizonMs?: number }
export type ExtraTend<Event> = { at: number; event: Event }

export type SkippedEntry = {
  index: number                                  // position in the recorded history
  type: "edited" | "resurrect-failed"
  timestamp: number
}

export type HistoryProblem =
  | "empty" | "first-not-created" | "created-time-mismatch" | "other-item"
  | "bad-timestamp" | "out-of-order" | "second-created" | "unknown-type"

export type ReplayReason =
  | { code: "invalid-history"; problem: HistoryProblem; index: number | null }
  | { code: "invalid-item"; engineCode: string; message: string }
  | { code: "invalid-options"; option: "until" | "horizonMs"; message: string }
  | {
      code: "diverged"
      index: number
      timestamp: number
      entryType: "tended" | "resurrected"
      engineCode: "ITEM_ALREADY_DEAD" | "ITEM_NOT_DEAD" | "RESURRECT_REFUSED"
      policyReason: string | null
    }

export type ReplayResult<Payload, PolicyData> =
  | {
      ok: true
      item: Item<Payload, PolicyData>             // replay engine's view(until)
      history: HistoryEntry[]                     // replay engine's history(id)
      diesAt: number | null                       // deathTime(engine, id, until)
      until: number
      skipped: SkippedEntry[]
    }
  | { ok: false; reason: ReplayReason }

export type StopPoint = {
  index: number
  timestamp: number
  why: "next-life" | "died-before-entry"
}

export type WhatIfReason =
  | { code: "invalid-at"; message: string }
  | { code: "at-not-after-creation"; at: number; createdAt: number }
  | { code: "at-item-dead"; at: number; diedAt: number }
  | { code: "invalid-event"; message: string }
  | { code: "replay-failed"; reason: ReplayReason }

export type WhatIfResult<Payload, PolicyData> =
  | {
      ok: true
      at: number
      diesAt: number | null
      baselineDiesAt: number | null
      item: Item<Payload, PolicyData>             // what-if engine's view(last)
      history: HistoryEntry[]                     // what-if engine's history(id), no tick past last
      stoppedAt: StopPoint | null
      skipped: SkippedEntry[]
    }
  | { ok: false; reason: WhatIfReason }
```

`null` means "no value" everywhere, never `undefined` (Requirement 9.3). `DecayEngineError` messages are copied as strings; the error object is never stored.

### 3.3 Examples (also used in the README)

```typescript
const engine = new DecayEngine(policy, adapter, ids)
const now = realNow
const item = engine.view(now).find((i) => i.id === id)!
const history = engine.history(id)

const r = replay(policy, item, history, { until: now })
if (r.ok) console.log(r.diesAt, r.skipped.length)

const w = whatIf(policy, item, history, { at: item.createdAt + 4 * DAY, event: goodEvent })
if (w.ok) console.log(w.baselineDiesAt, "→", w.diesAt)
else if (w.reason.code === "at-item-dead") console.log("already dead since", w.reason.diedAt)

deathTime(engine, id, now)   // the same answer the forecast gives, or diedAt if dead
```

## 4. replay

### 4.1 Shared helpers (`src/internal.ts`, not exported from `index.ts`)

- `jsonCopy<T>(value: T): T`: `JSON.parse(JSON.stringify(value))`. Items, history entries and events are JSON-serialisable by the engine contract (`packages/engine/src/types.ts`).
- `checkHistory(item, history): ReplayReason | null`: the checks of Requirement 2.1, in that order, first problem wins. The known entry types are listed as a constant `ENTRY_TYPES` (the seven members of the `HistoryEntry` union). A `satisfies Record<HistoryEntry["type"], true>` object makes `tsc` fail if the engine's union ever differs.
- `checkTime(value: unknown): value is number`: finite, 0 to `MAX_TIMESTAMP`.
- `startReplay(policy, item): { engine } | { reason }`: creates the engine with `new InMemoryAdapter()` and `() => item.id`, then `addItem`. Catches only `DecayEngineError` with code `INVALID_TIMESTAMP`, `INVALID_ID`, `INVALID_IMPORTANCE` or `INVALID_COST_MINUTES`, around `addItem` only (Requirement 2.2).
- `step(engine, id, entry, index): ReplayReason | null`: for `tended`, `engine.tend(id, entry.event as Event, entry.timestamp)`, catching only `ITEM_ALREADY_DEAD`; for `resurrected`, `engine.resurrect(...)`, catching only `ITEM_NOT_DEAD`, and turning `{ ok: false, reason }` into `RESURRECT_REFUSED` (Requirement 3.5, 3.6). Any other error is rethrown unchanged.

The id generator is called once (one `addItem`), so `DUPLICATE_ID` cannot happen.

### 4.2 Steps

```
replay(policy, item, history, options = {}):
  item0 = jsonCopy(item); entries = jsonCopy(history)
  problem = checkHistory(item0, entries)            → { ok: false, reason: problem }
  last = entries[entries.length - 1].timestamp
  until = options.until ?? last
  if !checkTime(until) or until < last              → invalid-options "until"
  horizonMs = options.horizonMs ?? MAX_FORECAST_HORIZON_MS
  if not (finite and > 0)                           → invalid-options "horizonMs"
  start = startReplay(policy, item0)                → invalid-item
  skipped = []
  for i in 1 .. entries.length - 1:
    e = entries[i]
    tended / resurrected:  r = step(engine, id, e, i); if r → { ok: false, reason: r }
    edited / resurrect-failed: skipped.push({ index: i, type, timestamp })
    state-changed / died:  nothing
  engine.tick(until)
  return { ok: true,
           item: engine.view(until).find(id),
           history: engine.history(id),
           diesAt: deathTime(engine, id, until, { horizonMs }),
           until, skipped }
```

`tick(until)` cannot throw `TIME_WENT_BACKWARD`: every replayed call is at or before `last`, and `until >= last`.

### 4.3 How the known limits show up

- **L1**: `addItem` gets the current payload, importance and costMinutes. With a payload-dependent policy and a payload edit, the replayed `tended` health differs from the recorded one. Insight does not detect or report this (open question 10.3). An outcome test pins it (section 7.5).
- **L3**: `policyData` is never copied from the input. A resurrection's replacement comes from the replay engine's own `policy.resurrect` call, so P-A can compare the final `policyData` deeply.
- **L5, L6**: P-A compares health within 1e-9 and death times within the precision, never exactly.

## 5. whatIf

### 5.1 Steps

```
whatIf(policy, item, history, { at, event }, options = {}):
  item0, entries = jsonCopy(...)
  same history and horizonMs checks as replay       → replay-failed { reason }
  if typeof at !== "number" or !checkTime(at)       → invalid-at
  if at <= item0.createdAt                          → at-not-after-creation
  if JSON.stringify(event) is undefined or throws   → invalid-event
  ev = jsonCopy(event)

  k   = first index with entries[k].timestamp > at  (entries.length if none)
  cut = first index >= k with type "resurrected"    (entries.length if none)

  // what-if engine
  W = startReplay(policy, item0)                    → replay-failed invalid-item
  for i in 1 .. k-1: replay entry i as in 4.2       → replay-failed diverged
  v = W.view(at).find(id)
  if v.state === "dead"                             → at-item-dead { at, diedAt: v.diedAt }
  W.tend(id, ev, at); last = at
  stoppedAt = null
  for i in k .. cut-1:
    tended: try W.tend(...); last = e.timestamp
            catch ITEM_ALREADY_DEAD → stoppedAt = { i, ts, "died-before-entry" }; break
    edited / resurrect-failed: skipped.push(...)
  if stoppedAt is null and cut < entries.length: stoppedAt = { cut, ts, "next-life" }
  diesAt = deathTime(W, id, last, { horizonMs })

  // baseline engine: entries 1 .. cut-1, no extra tend
  B = startReplay(policy, item0)
  for i in 1 .. cut-1: replay entry i as in 4.2     → replay-failed diverged
  lastB = timestamp of the last tended/resurrected entry replayed, or createdAt
  baselineDiesAt = deathTime(B, id, lastB, { horizonMs })

  return { ok: true, at, diesAt, baselineDiesAt,
           item: W.view(last).find(id), history: W.history(id), stoppedAt, skipped }
```

`skipped` lists the skipped entries of both loops of the what-if engine (indices below `cut`), in recorded order.

### 5.2 Why it is built like this

- **Validity is the engine's call.** "After creation and before it died" is checked by `view(at)` after replaying everything up to `at`. No death formula is needed, and resurrections are handled: an `at` between a death and the next resurrection is dead in the view.
- **The life cut.** After the extra tend, the recorded resurrection that ends the item's death may hit a living item (`ITEM_NOT_DEAD`). In the what-if world it would not have happened. So the what-if replay stops at the first `resurrected` entry after `at`, and the result describes the life that contains `at`. The baseline uses the same cut, so `diesAt` and `baselineDiesAt` describe the same life.
- **A recorded tend on a dead item ends the life** (`died-before-entry`). This happens when the extra event shortens the life, for example a "bad" extra event. The engine saves the death before it throws, so `view(last)` and `deathTime` see it.
- **Both death times come from `deathTime` at the last call's time.** This keeps the two numbers comparable. Neither is the recorded `died` timestamp, which depends on an unrecorded settle time (L6).

## 6. Death times, precision and monotonicity

The engine's `bisectCrossing` returns the upper end of a final interval at most 60,000 ms wide. For a true crossing `c`, every engine death time `r` for it satisfies `c <= r < c + 60,000`. Two death times for the same item worked out over different intervals (for example `tick` at different times, or `view` against `forecast`) can therefore differ by less than 60,000 ms. That is why P-A and P-C compare with `DEATH_TIME_PRECISION_MS`.

### 6.1 Why `whatIf` does not promise a later death

The request said an extra good event gives a later death "because the good event resets health". That is true only when nothing after it resets health too. In both test policies a good event sets health to 100. If the life has a later recorded good tend, the health after that tend is 100 either way, so the death time is the same with or without the extra tend. The properties therefore claim:

- P-C1: never earlier than the baseline by the precision or more;
- P-C2: strictly later when no recorded `tended` entry of that life comes after `at`, and `at` is at least the precision after the life's last replayed event `L0`. Proof sketch: the baseline's true death is `L0 + T(h0)` with `h0 <= 100`, and the what-if's is `at + T(100) >= at + T(h0) >= L0 + T(h0) + 60,000`. With `r1 >= c1` and `r0 < c0 + 60,000`, `r1 > r0`.

### 6.2 Which policies keep `whatIf` monotone

Within one life, a later `at` never gives an earlier true death when all of these hold:

1. the extra event sets health to the highest value the policy allows (100);
2. for a fixed time since the last event, `healthAt` does not go down when the starting health goes up, and only `health` and `lastEventAt` decide it (`policyData` does not change how fast health falls);
3. `applyEvent` for every recorded event gives a health that does not go down when the settled health goes up.

`expPolicy` and `linearPolicy` meet all three. Insight claims nothing for the apps' policies: Study Dungeon's policy changes the half-life from the review gap (it breaks condition 2), and Ghosted's has not been analysed. With a policy outside these conditions, `whatIf` still returns whatever the engine gives, with no failure and no flag (Requirement 7.8).

### 6.3 A non-monotone test policy (`crammingPolicy`)

Thresholds `{ weak: 60, dead: 10 }`. `policyData = { lastReviewAt }`. `healthAt = max(0, health − 10 × (now − lastEventAt) / DAY)`. A `"review"` sets health to 100 if at least 1 day passed since `lastReviewAt`, otherwise it takes 30 off the settled health. Every review sets `lastReviewAt = now`. `resurrect` always succeeds with `{ lastReviewAt: now }`. `nextDueAt` returns `null`.

History: created at T0 (health 100), one `"review"` at T0 + 2 d (gap 2 d, so health 100), then `tick` at T0 + 20 d.

| Call | Health after the events | Death (true crossing, engine time within +1 min) |
|---|---|---|
| baseline | 100 at 2 d | 9 days after 2 d: (T0 + 11 d, T0 + 11 d + 1 min] |
| `at` = T0 + 0.5 d | extra: 95 − 30 = 65 at 0.5 d; recorded at 2 d: gap 1.5 d, so 100 | (T0 + 11 d, T0 + 11 d + 1 min], the same as the baseline |
| `at` = T0 + 1.5 d | extra: gap 1.5 d, so 100 at 1.5 d; recorded at 2 d: gap 0.5 d, 95 − 30 = 65 | 5.5 days after 2 d: (T0 + 7.5 d, T0 + 7.5 d + 1 min] |

So the later `at` (1.5 d) gives an earlier death than the earlier `at` (0.5 d), and earlier than the baseline. `whatIf` returns `ok: true` for both, with those numbers. `healthAt` still never increases with time, so the policy obeys the contract.

## 7. Testing

### 7.1 Test policies (`src/test/policies.ts`)

All pure, no clock. `Event = "good" | "bad"` except where noted. Each passes `checkPolicy` from `@decay-engine/engine` (`policies.test.ts`).

| Policy | Thresholds | `init` | `healthAt` | `applyEvent` | `resurrect` |
|---|---|---|---|---|---|
| `expPolicy` | 60 / 10 | `{ tends: 0, lives: 1 }` | `health × 2^(−(now − lastEventAt) / 3 d)` | good → 100, bad → `health / 2`; `tends + 1` | good → `{ ok: true, policyData: { tends: 0, lives: lives + 1 } }`, bad → `{ ok: false, reason: "wrong answer" }` |
| `linearPolicy` | 50 / 20 | same | `max(0, health − 7 × (now − lastEventAt) / DAY)` | good → 100, bad → `health − 20`; `tends + 1` | same |
| `crammingPolicy` | 60 / 10 | section 6.3 | section 6.3 | section 6.3 (`"review"`) | always ok |
| `payloadHalfLifePolicy` | 60 / 10 | `{}` | like `expPolicy`, half-life `payload.halfLifeDays` | good → 100 | always ok |
| `throwingPolicy` | 60 / 10 | `{}` | like `expPolicy` | throws `new Error("policy bug")` | always ok |

`nextDueAt` is `lastEventAt + DAY` for the first two and `null` for the others. The rate 7 per day and the 3-day half-life are chosen so that a death from a round health never falls on a whole millisecond (a crossing exactly on a threshold would make the float rounding in L5 decide the state). For `expPolicy` from 100 the true death is 3 × log2(10) ≈ 9.9658 days; for `linearPolicy` it is 80 / 7 ≈ 11.4286 days. These numbers are only in the tests, as expected values; Insight's source never computes them.

### 7.2 Scenario generator (`src/test/scenario.ts`)

```
scenarioArb = fc.record({
  policy: fc.constantFrom("exp", "linear"),
  importance: fc.integer({ min: 1, max: 3 }),
  costMinutes: fc.integer({ min: 1, max: 600 }),
  steps: fc.array(fc.record({
    gapMs: fc.integer({ min: 1, max: 6 * DAY }),
    op: fc.constantFrom("good", "bad", "tick", "view", "edit"),
  }), { maxLength: 25 }),
  tailMs: fc.integer({ min: 0, max: 20 * DAY }),
})
```

`runScenario(s)` builds an original engine (`InMemoryAdapter`, id `"item-1"`), `addItem` at `T0`, then for each step moves `t += gapMs` and:

- `good` / `bad`: reads `engine.view(t)`; if the item is dead, calls `resurrect(id, op, t)` (bad gives a `resurrect-failed` entry), otherwise `tend(id, op, t)`. The state is read first, so no error is ever caught to choose the call;
- `tick`: `engine.tick(t)` (re-bases the stored item, L5);
- `view`: `engine.view(t)` (changes nothing);
- `edit`: `engine.edit(id, { importance: next(importance), costMinutes: next(costMinutes) }, t)`, giving an `edited` entry.

It ends with `end = t + tailMs` and `engine.tick(end)`, and returns `{ policy, engine, item: view(end) entry, history, end }`.

### 7.3 Generator coverage check (`scenario.coverage.test.ts`)

Like the engine's "Generator Coverage Check": 1,000 scenarios from `fc.sample(scenarioArb, { numRuns: 1000, seed: 42 })`, each run, then these shares asserted:

| Reached | At least |
|---|---|
| item alive at `end` / weak at `end` / dead at `end` | 5% each |
| at least one `died` entry | 30% |
| at least one `resurrected` entry | 10% |
| at least one `resurrect-failed` entry | 10% |
| at least one `edited` entry | 10% |
| at least one `tick` step that changed health | 30% |
| both policies | 30% each |

If a share fails when first run, the generator mix changes (for example the op weights), never the threshold (`no-fake-tests.md`). The `whatIf` property tests add their own check: at least 20% of P-C runs meet P-C2's conditions.

### 7.4 Properties

| Property | File | Generator | Notes |
|---|---|---|---|
| P-A | `replay.property.test.ts` | `scenarioArb` | `{ until: end }`. Matches as in the requirements. |
| P-B | `replay.property.test.ts`, `what-if.property.test.ts` | `scenarioArb` (+ `at`) | Inputs deep-frozen with a recursive `Object.freeze` helper, snapshot with `JSON.stringify` first. |
| P-C1, P-C2, P-C3 | `what-if.property.test.ts` | `scenarioArb`, then `at` chosen from `replay(...)`'s lives | `at` in `(lifeStart, death − DEATH_TIME_PRECISION_MS)`, where `death` is the life's `died` entry or `replay(...).diesAt` for the last life. Half the runs pick `at` after the life's last replayed event plus the precision (P-C2 branch). For P-C3, two times in the same life, sorted. A life too short for the range is skipped with `fc.pre`; the 20% branch check (7.3) shows enough runs remain. Event `"good"`. |
| P-D | `what-if.property.test.ts` | `scenarioArb`, then `at` from the invalid ranges | `at` in `[T0 − 30 d, createdAt]`; `at` in `[died, nextResurrection)` or `[finalDeath, finalDeath + 30 d]`, using `replay(...)`'s `died` entries; and the fixed invalid values. Asserts the code and that the call did not throw (a plain call, no `try`). |
| P-E | both property files | the results above | `expect(JSON.parse(JSON.stringify(r))).toEqual(r)`, plus a check that no value in `r` is `undefined`. |

All at `{ numRuns: 100 }` or more.

### 7.5 Outcome tests

- `death-time.test.ts`: never-tended `expPolicy` item, `deathTime(engine, id, T0)` in `(T0 + 3 × log2(10) d, … + 1 min]`; the same for `linearPolicy` with 80/7 d; a dead item returns its `diedAt`; a 1-day horizon returns `null`; an unknown id throws `ITEM_NOT_FOUND`; it saves nothing (the adapter's `load()` is equal before and after).
- `replay.test.ts`:
  - every `HistoryProblem`, `invalid-item` (importance 0), both `invalid-options`;
  - a fixed history (good at T0 + 5 d, bad at T0 + 8 d, tick at T0 + 30 d) reproduces its tended healths and its death within the precision;
  - `skipped` lists an `edited` and a `resurrect-failed` entry with their indices;
  - a resurrection's replaced `policyData` (`lives: 2`) is rebuilt, and an input item with a wrong `policyData` gives the same result (L3, L7);
  - `diverged` for a recorded tend after the death (`ITEM_ALREADY_DEAD`), a resurrection of a living item (`ITEM_NOT_DEAD`) and a recorded `"bad"` resurrection (`RESURRECT_REFUSED`, `policyReason: "wrong answer"`);
  - L1: with `payloadHalfLifePolicy`, a payload edit from 3 to 10 days, then a tend: the replayed tended health differs from the recorded one and equals the health from a second engine that starts with the 10-day payload and the same tends (no formula in the test);
  - `throwingPolicy`: `replay` throws the same `Error("policy bug")`.
- `what-if.test.ts`:
  - `expPolicy`, never tended, whatIf at T0 + 5 d: `diesAt` in `(T0 + 5 d + 9.9658 d, + 1 min]`, `baselineDiesAt` in `(T0 + 9.9658 d, + 1 min]`, `stoppedAt` null;
  - `next-life` with the index of the resurrection entry;
  - a `"bad"` extra event that makes a later recorded tend find the item dead: `died-before-entry`, `diesAt` earlier than `baselineDiesAt`;
  - the `crammingPolicy` table in section 6.3;
  - each `WhatIfReason` with fixed values, including `invalid-event` for `undefined`.

### 7.6 Boundary test (`src/boundary.test.ts`)

Reads every `.ts` file under `src` except itself, and checks:

- every import specifier: none matches `(^|/)apps/`, none contains `packages/engine` or `packages/shell`, none starts with `../..`; the only `@decay-engine/*` specifier is exactly `@decay-engine/engine`; no `react` or `react-dom`;
- no `Date.now`, `new Date(`, `performance.now`, `Math.random` or `crypto` in any file (tests included);
- the library files (`index.ts`, `types.ts`, `death-time.ts`, `internal.ts`, `replay.ts`, `what-if.ts`) contain no `Math.` and no `**`, and never import from `./test/`. This is a crude but real guard for Requirement 5.7: the library has no arithmetic that could copy a policy's maths;
- the file list contains the six library files (so a renamed file cannot slip past the scan).

## 8. `scripts/check.sh`

Two new steps, after "build ghosted" and before "landing page" (the developer's placement, decided at build time):

```
step "build ghosted"      pnpm --filter @decay-engine/ghosted build
step "typecheck insight"  pnpm --filter @decay-engine/insight typecheck
step "test insight"       pnpm --filter @decay-engine/insight test
step "landing page"       bash scripts/check-site.sh
```

The header comment's step list gains "typecheck insight" and "test insight", and a line says Kiro added them for task E1 (as the Ghosted line does). The step names fit the existing `%-28s` column. Nothing else changes. `scripts/check-engine-unchanged.sh` needs no change: Insight is outside `packages/engine` and `packages/shell`.

## 9. README outline (`packages/insight/README.md`)

1. What it is (two sentences) and the rule: public engine API only, no policy maths.
2. API: `replay`, `whatIf`, `deathTime`, with the section 3.3 examples, the options and the reason codes in a table.
3. **What the engine does not record**: L1 to L7 from the requirements, each with "what replay does about it".
4. Death time precision (section 6), and why `whatIf` does not promise a later death (sections 6.1 and 6.2).
5. Tests: how to run them, the test policies, and that they are not the apps' policies.

## 10. Open questions

1. **Which app uses it first, and for what?** E1 adds Insight to no app. A likely first use is an Autopsy line in Study Dungeon or Ghosted such as "Tending on day 4 would have kept it until day 19". That would be a separate task.
2. **Replay `resurrect-failed` entries?** The request names only `tended` and `resurrected`, so they are skipped. Replaying them would add the same entries to the replayed history (useful for Autopsy's `failedResurrections`), but with the current payload a recorded failure could succeed, which would change the item. Proposed: keep skipping.
3. **Report health mismatches?** Insight could compare each replayed `tended` health with the recorded one and list the differences above 1e-9, so a caller can see when L1 made the replay wrong. Not in the request, so not specified. Proposed: add later if an app needs it.
4. **Should `whatIf` replay past the life cut?** It stops at the next recorded resurrection (section 5.2). The alternative, skipping a resurrection that hits a living item and going on, mixes two worlds. Proposed: keep the cut.
5. **`at` equal to `createdAt`.** The request says "after the item was created", so `at <= createdAt` is rejected, although the engine itself would accept a tend at `createdAt`. Confirm.
6. **`structure.md`.** The steering's folder list has no `packages/insight/`. Add one line (`packages/insight/  replay and what-if, on the engine's public API`)? Steering was not changed in this spec.
7. **`DEATH_TIME_PRECISION_MS` copies an engine constant.** The engine's `BISECT_PRECISION_MS` (60,000) is not exported, so Insight writes the number again, with a comment naming engine Requirement 17a. It is a tolerance for comparing results, not policy maths, and the engine is frozen at `engine-complete`.
