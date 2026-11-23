# Requirements Document: @decay-engine/insight (task E1)

## Introduction

`@decay-engine/insight` is a small replay library. It rebuilds an item from its history log in a throwaway `DecayEngine` on an `InMemoryAdapter`, and answers "what if I had tended it once more, at time `at`?". It is built only on the engine's public API (`packages/engine/src/index.ts`): `DecayEngine`, `InMemoryAdapter`, `DecayEngineError`, `MAX_FORECAST_HORIZON_MS`, `MAX_TIMESTAMP` and the exported types. It changes no file under `packages/engine/`, so `scripts/check-engine-unchanged.sh` keeps passing and the "engine unchanged" proof stays true.

The library never repeats a policy's maths. Every health value and every death time it returns comes from the engine (`addItem`, `tend`, `resurrect`, `tick`, `view`, `forecast`), which calls the app's policy.

No app uses the package in E1. It is set up the way `packages/shell` is, so an app can add it later as a `workspace:*` dependency and build it from source, in dev and on Netlify, with no extra config.

## Glossary

- **Insight**: the package `@decay-engine/insight` in `packages/insight/`.
- **Recorded history**: the `HistoryEntry[]` the caller passes in, normally from `engine.history(id)`.
- **Input item**: the `Item` the caller passes in, normally from `engine.view(now)`.
- **Replay engine**: a new `DecayEngine` that Insight creates for one call, with a new `InMemoryAdapter` and an id generator that returns the input item's id. It is never returned and never saved anywhere else.
- **Replayed entry**: a recorded entry that Insight turns into an engine call: `created` (to `addItem`), `tended` (to `tend`) and `resurrected` (to `resurrect`).
- **Skipped entry**: a recorded `edited` or `resurrect-failed` entry. Insight does not turn it into a call and lists it in the result.
- **Derived entry**: a recorded `state-changed` or `died` entry. The engine writes these itself, so the replay engine writes its own and Insight ignores the recorded ones as input.
- **Life**: the span from creation, or from a `resurrected` entry, up to the next death. An item that is resurrected twice has three lives.
- **Death time**: when the engine says an item dies, to the engine's 1-minute precision (engine Requirement 17a). It comes from `view` (for an item that is already dead, its `diedAt`) or `forecast` (for one that is not).
- **Extra tend**: the one tend that `whatIf` inserts, at time `at`, with the caller's event.
- **Baseline**: the same replay as a `whatIf` call, with no extra tend.
- **Precision**: `DEATH_TIME_PRECISION_MS` = 60,000 ms. The engine's bisection returns the upper end of a final interval at most 1 minute wide, so two death times for the same true crossing, worked out over different intervals, can differ by less than this.

## What the history does not record (known limits)

The engine's history log was designed for Autopsy, not for replay. These limits come from the log, not from Insight. Insight states them in its README (Requirement 10) and works around them as described here. None of them is fixed by changing the engine.

- **L1. No payload at creation, no old values on edit.** The `created` entry has no payload, and an `edited` entry lists only `fieldsChanged`, never the old values. So the replay starts from the input item's **current** `payload`, `importance` and `costMinutes`, and `policy.init` runs on the current payload at `createdAt`. If the policy's maths reads the payload (for example a half-life stored in it) or `importance` / `costMinutes`, and they were edited, replayed health can differ from the recorded health. Edits are listed as skipped entries, never re-applied.
- **L2. Events are `unknown`.** `tended`, `resurrected` and `resurrect-failed` entries store the event as `unknown`. Insight passes it back to the policy unchanged, cast to the policy's `Event` type. Only the app's policy decides what it means. Insight never reads, checks or compares an event.
- **L3. Replaced policyData and payload on resurrection.** `policy.resurrect` may return a new `policyData` (and a new `payload`), and the history does not record either. Insight never copies the input item's `policyData`: it rebuilds it from `policy.init` and the replayed events. At a `resurrected` entry it calls `engine.resurrect` with the recorded event, so the pure policy computes the replacement again from the replayed item. The result matches the original as long as the replayed item matches at that moment. A replaced **payload** cannot be undone: before a resurrection that replaced it, the replay already uses the later (current) payload (L1).
- **L4. Failed resurrections and edits are not replayed.** A `resurrect-failed` entry changes no health, and replaying it with the current payload could even succeed. An `edited` entry cannot be replayed (L1). Both are listed as skipped entries.
- **L5. Ticks and views are not recorded.** A `tick` that changed health without a state change writes no history entry, but it re-bases the stored item (new `health` and `lastEventAt`). The replay does not see those ticks. With a policy that obeys the contract this changes nothing but floating-point rounding, so replayed health matches recorded health to within 1e-9, not exactly.
- **L6. Death times depend on when the engine looked.** The engine dates a death by bisecting between the stored item's `lastEventAt` and the time it settled the item. That settle time is not recorded. The replay settles at other times, so a replayed death time matches the recorded one to within the precision (under 60,000 ms), not exactly.
- **L7. The input item's other fields are ignored.** `health`, `state`, `lastEventAt`, `diedAt`, `timesResurrected` and `policyData` of the input item are not read. Only `id`, `createdAt`, `payload`, `importance` and `costMinutes` are.

## Requirements

### Requirement 1: Package and boundary

**User Story:** As the developer, I want Insight to be a separate package that only uses the engine's public API, so that the engine-unchanged proof stays true.

#### Acceptance Criteria

1. THE Insight package SHALL live in `packages/insight/`, be named `@decay-engine/insight`, and export its public API from `src/index.ts` through the `main`, `types` and `exports` fields, as `packages/shell` does.
2. THE Insight package SHALL import from `@decay-engine/engine` only, and only through the package name (never a relative path into `packages/engine`, never a deep path such as `@decay-engine/engine/src/...`).
3. THE Insight package SHALL NOT import from `apps/`, `@decay-engine/shell`, any other `@decay-engine/*` package, React, or any UI library.
4. THE Insight package SHALL NOT read the clock (`Date.now`, an argument-less `new Date()`, `performance.now`) or use randomness (`Math.random`, `crypto`) in any file under `packages/insight/src`, tests included. Every time is a parameter.
5. THE work for E1 SHALL change no file under `packages/engine/`, and `scripts/check-engine-unchanged.sh` SHALL still exit 0 after it.
6. THE Insight package SHALL have no runtime dependency other than `@decay-engine/engine`.

### Requirement 2: replay, input checks

**User Story:** As an app author, I want replay to tell me when the history I pass in cannot be replayed, instead of throwing or returning nonsense.

#### Acceptance Criteria

1. WHEN `replay(policy, item, history, options?)` is called, THE function SHALL check the history before creating an engine, and return `{ ok: false, reason }` with `reason.code === "invalid-history"` and the first problem found, in this order:
   - `"empty"`: the history has no entries (`index` null);
   - `"first-not-created"`: entry 0 is not a `created` entry;
   - `"created-time-mismatch"`: entry 0's timestamp is not `item.createdAt`;
   - `"other-item"`: an entry's `itemId` is not `item.id`;
   - `"bad-timestamp"`: an entry's timestamp is not a finite number from 0 to `MAX_TIMESTAMP`;
   - `"out-of-order"`: an entry's timestamp is earlier than the one before it;
   - `"second-created"`: a `created` entry after entry 0;
   - `"unknown-type"`: an entry type not in the engine's `HistoryEntry` union.
2. WHEN `addItem` on the replay engine throws a `DecayEngineError` with code `INVALID_TIMESTAMP`, `INVALID_ID`, `INVALID_IMPORTANCE` or `INVALID_COST_MINUTES`, THE function SHALL return `reason.code === "invalid-item"` with the engine's code and message.
3. WHEN `options.until` is given and is not a finite number from 0 to `MAX_TIMESTAMP`, or is earlier than the last entry's timestamp, THE function SHALL return `reason.code === "invalid-options"` with `option: "until"`.
4. WHEN `options.horizonMs` is given and is not a positive finite number, THE function SHALL return `reason.code === "invalid-options"` with `option: "horizonMs"`.

### Requirement 3: replay, rebuilding the item

**User Story:** As an app author, I want to rebuild an item from its own history, so that I can show or test what the engine would do with it.

#### Acceptance Criteria

1. THE function SHALL create one replay engine: `new DecayEngine(policy, new InMemoryAdapter(), idGenerator)`, where `idGenerator` returns `item.id`. It SHALL call `addItem({ payload, importance, costMinutes }, item.createdAt)` with JSON copies of the input item's current values (L1).
2. THEN, for each entry in recorded order, THE function SHALL call `engine.tend(item.id, entry.event, entry.timestamp)` for a `tended` entry and `engine.resurrect(item.id, entry.event, entry.timestamp)` for a `resurrected` entry, passing the recorded event unchanged (L2).
3. THE function SHALL NOT turn `edited` or `resurrect-failed` entries into calls. It SHALL list each in `skipped` as `{ index, type, timestamp }`, in recorded order (L1, L4).
4. THE function SHALL ignore recorded `state-changed` and `died` entries as input. The replay engine writes its own.
5. WHEN `engine.tend` throws `ITEM_ALREADY_DEAD`, or `engine.resurrect` throws `ITEM_NOT_DEAD`, THE function SHALL stop and return `reason.code === "diverged"` with the entry's `index`, `timestamp`, `entryType`, the engine's code as `engineCode`, and `policyReason: null`.
6. WHEN `engine.resurrect` returns `{ ok: false, reason }` for a recorded `resurrected` entry, THE function SHALL stop and return `reason.code === "diverged"` with `engineCode: "RESURRECT_REFUSED"` and the policy's reason as `policyReason`.
7. AFTER the last entry, THE function SHALL call `engine.tick(until)`, where `until` is `options.until` or, by default, the last entry's timestamp, so the replayed history holds the deaths and state changes up to `until`.
8. THE function SHALL never copy the input item's `policyData`. A replaced `policyData` at a resurrection SHALL come from the replay engine's own call to `policy.resurrect` (L3).

### Requirement 4: replay, the result

**User Story:** As an app author, I want the replayed item, its history and its death time in one plain object.

#### Acceptance Criteria

1. ON success THE function SHALL return `{ ok: true, item, history, diesAt, until, skipped }`, where `item` is the replay engine's `view(until)` entry for `item.id`, and `history` is `engine.history(item.id)`.
2. `diesAt` SHALL be `deathTime(engine, item.id, until, { horizonMs })` (Requirement 5), with `horizonMs` defaulting to `MAX_FORECAST_HORIZON_MS`.
3. The replayed item and history SHALL use the input item's id.

### Requirement 5: deathTime, the death time from the engine

**User Story:** As an app author, I want the death time of an item in any engine, worked out by the engine and not by a copy of the policy's formula.

#### Acceptance Criteria

1. `deathTime(engine, itemId, from, options?)` SHALL first call `engine.history(itemId)`, so an unknown id throws the engine's `ITEM_NOT_FOUND`.
2. WHEN `engine.view(from)` shows the item dead, THE function SHALL return that item's `diedAt`.
3. OTHERWISE THE function SHALL return the `diesAt` of the item's entry in `engine.forecast(from, horizonMs)`, or `null` when the item has no entry (it does not die within the horizon).
4. `horizonMs` SHALL default to `MAX_FORECAST_HORIZON_MS` (10 years).
5. THE function SHALL be read-only: it calls only `history`, `view` and `forecast`, which save nothing.
6. THE function SHALL let the engine's errors through unchanged (`INVALID_TIMESTAMP`, `INVALID_HORIZON`, `ITEM_NOT_FOUND`, policy errors). It is the low-level helper for a caller that has its own engine; `replay` and `whatIf` validate first, so they never trigger these.
7. No file in Insight SHALL compute health or a death time with arithmetic on policy values. Death times come from `view` or `forecast` only.

### Requirement 6: whatIf, checking `at` and the event

**User Story:** As an app author, I want to ask "what if I had tended this at `at`?", and get a typed reason, not an exception, when `at` makes no sense.

#### Acceptance Criteria

1. `whatIf(policy, item, history, { at, event }, options?)` SHALL first run the same history and option checks as `replay` (Requirement 2). A problem SHALL be returned as `reason.code === "replay-failed"` with the replay reason inside.
2. WHEN `at` is not a number, not finite, below 0 or above `MAX_TIMESTAMP`, THE function SHALL return `reason.code === "invalid-at"`.
3. WHEN `at <= item.createdAt`, THE function SHALL return `reason.code === "at-not-after-creation"` with `at` and `createdAt`.
4. WHEN `JSON.stringify(event)` returns `undefined` (the event is `undefined`, a function or a symbol) or throws, THE function SHALL return `reason.code === "invalid-event"`.
5. THE function SHALL replay every recorded entry with a timestamp at or before `at`, in order, as in Requirement 3 (no tick). WHEN `engine.view(at)` then shows the item dead, THE function SHALL return `reason.code === "at-item-dead"` with `at` and the viewed item's `diedAt`. This covers an `at` between a death and the next resurrection and an `at` after the final death. Validity is decided by the engine, not by a formula.
6. THE function SHALL never throw for any of the cases above. An error thrown by the policy itself, or an engine error that means the policy broke the contract (`INVALID_HEALTH`, `INVALID_POLICY_RESULT`, `INVALID_THRESHOLDS`), SHALL be let through unchanged (Requirement 8).

### Requirement 7: whatIf, the extra tend and the result

**User Story:** As an app author, I want the new death time, the old one, and the replayed item, so that I can say "tending on day 4 would have kept it until day 19".

#### Acceptance Criteria

1. AFTER the checks in Requirement 6, THE function SHALL call `engine.tend(item.id, event, at)` once, after every recorded entry at or before `at` (an entry at exactly `at` comes first).
2. THEN it SHALL replay the rest of the life that contains `at`: recorded `tended` entries after `at`, up to but not including the first recorded `resurrected` entry after `at`. That entry and everything after it SHALL not be replayed, and `stoppedAt` SHALL be `{ index, timestamp, why: "next-life" }`. In the what-if world that resurrection may not happen, because the item may no longer be dead.
3. WHEN a recorded `tended` entry after `at` finds the what-if item dead (`ITEM_ALREADY_DEAD`), THE function SHALL stop there, without returning a failure, and set `stoppedAt` to `{ index, timestamp, why: "died-before-entry" }`. In the what-if world that tend could not have happened.
4. `stoppedAt` SHALL be `null` when every recorded entry after `at` was replayed.
5. `diesAt` SHALL be `deathTime(engine, item.id, last, { horizonMs })`, where `last` is the timestamp of the last engine call the function made (the extra tend or a later replayed tend).
6. `baselineDiesAt` SHALL be worked out the same way in a second replay engine with the same entries and the same cut-off, but without the extra tend. Both numbers therefore come from the same engine operations and are comparable.
7. ON success THE function SHALL return `{ ok: true, at, diesAt, baselineDiesAt, item, history, stoppedAt, skipped }`, where `item` is the what-if engine's `view(last)` entry, and `history` is its `engine.history(item.id)`. The function does not tick past `last`, so a death after `last` is in `diesAt` and not in `history`.
8. THE function SHALL return whatever the engine gives. It SHALL NOT clamp, reorder or flag `diesAt` against `baselineDiesAt` or against other calls. With a policy whose tends can shorten a life (Requirement 9.6), `diesAt` may be earlier than `baselineDiesAt`, and a later `at` may give an earlier `diesAt`.

### Requirement 8: errors

**User Story:** As an app author, I want problems with my input as values and bugs in my policy as exceptions.

#### Acceptance Criteria

1. `replay` and `whatIf` SHALL return every input problem listed in Requirements 2, 3.5, 3.6 and 6 as `{ ok: false, reason }`, never as a thrown error.
2. They SHALL catch only `DecayEngineError` instances with the codes named in those requirements, and only around the engine call that can raise them. Every other error SHALL be let through unchanged.
3. Every `reason` SHALL be a plain object with a string `code`, and only strings, numbers, `null` and nested plain objects as values (no `Error` instance, no `undefined`).

### Requirement 9: purity, determinism and JSON

**User Story:** As an app author, I want replay to be safe to call anywhere, including from render code.

#### Acceptance Criteria

1. `replay` and `whatIf` SHALL NOT change the input item, the input history or the event. They SHALL work on JSON copies.
2. The same inputs SHALL give deeply equal results.
3. Every result, success or failure, SHALL survive `JSON.parse(JSON.stringify(result))` deeply equal. No key holds `undefined`, `NaN`, `Infinity` or `-0`; "no value" is `null`.
4. The functions SHALL keep no state between calls, and each replay engine SHALL be used for one call only.
5. Each function SHALL be synchronous.
6. THE design SHALL state which policies keep `whatIf` monotone in `at`, and the tests SHALL include a policy that is not (Property P-C3).

### Requirement 10: README

**User Story:** As someone reading the package, I want to know what replay can and cannot rebuild.

#### Acceptance Criteria

1. `packages/insight/README.md` SHALL describe the API (the three functions, the options, the result and reason types) with one short example each.
2. It SHALL have a section titled "What the engine does not record", listing L1 to L7 in plain words, and saying what replay does about each.
3. It SHALL say that death times have 1-minute precision and why two of them can differ by less than a minute.
4. It SHALL say that `whatIf` does not promise a later death, with the reasons in design section 6.

### Requirement 11: checks

**User Story:** As the developer, I want Insight in the one-command check.

#### Acceptance Criteria

1. `scripts/check.sh` SHALL run `pnpm --filter @decay-engine/insight typecheck` as step "typecheck insight" and `pnpm --filter @decay-engine/insight test` as step "test insight".
2. Its header comment SHALL list the two steps and say Kiro added them for task E1.
3. No other step in `scripts/check.sh` SHALL change.

### Requirement 12: log

1. THE work SHALL be logged in `docs/KIRO_LOG.md` as a new session, in the existing format.

## Correctness properties

Every property runs with fast-check at `{ numRuns: 100 }` or more, against small test policies defined in `packages/insight/src/test/policies.ts` (a package cannot import an app's policy): one exponential (`expPolicy`) and one linear (`linearPolicy`), and, for P-C3 only, a non-monotone one (`crammingPolicy`). Histories come from a real `DecayEngine` driven by a generated scenario (design section 7.2). Times start at the constant `T0` = 1,793,491,200,000 (1 Nov 2026, 00:00 UTC), never the clock.

- **P-A. Replay reproduces the recorded history.** For a scenario run on an original engine and ended with `tick(end)`, `replay(policy, original item, original history, { until: end })` returns `ok: true`, and:
  - the replayed `tended` entries match the recorded ones one to one: same timestamps, deeply equal events, health within 1e-9 (L5);
  - the replayed `resurrected` entries match one to one (timestamps, events, health 100);
  - the replayed `died` entries match one to one, each timestamp within `DEATH_TIME_PRECISION_MS` of the recorded one (L6);
  - the final item has the same `state`, `timesResurrected`, `payload` and deeply equal `policyData` (L3), and health within 1e-9 unless dead;
  - `diesAt` is within the precision of the original's death time: its `diedAt` if dead at `end`, otherwise `deathTime(originalEngine, id, end)`.
- **P-B. Replay is deterministic and changes nothing.** With the input item, history and event deep-frozen and a JSON snapshot taken first, two calls of `replay` (and of `whatIf`) give deeply equal results, and the inputs still equal their snapshots.
- **P-C. whatIf with a good event.** The good event (`"good"`) sets health to 100 in both test policies. For a valid `at`, inside a life, strictly after its start and more than the precision before the baseline death:
  - **P-C1 (never earlier, beyond precision):** `diesAt > baselineDiesAt − DEATH_TIME_PRECISION_MS` (`null` counts as later than any time).
  - **P-C2 (strictly later when nothing else resets):** when no recorded `tended` entry of that life comes after `at`, and `at` is at least the precision after the life's last replayed event before it, `diesAt > baselineDiesAt`.
  - **P-C3 (monotone):** for two valid times `a1 < a2` in the same life, `whatIf(a2).diesAt > whatIf(a1).diesAt − DEATH_TIME_PRECISION_MS`.
  - **Not claimed:** that the death is strictly later for every valid `at`. When a later recorded tend also resets health to 100, the extra tend before it changes nothing (design section 6.1).
  - **Non-monotone policy:** with `crammingPolicy`, an outcome test shows `whatIf` returning a later `at` with an earlier death, and an `at` whose death is earlier than the baseline, with no failure and no flag (Requirement 7.8).
- **P-D. Invalid `at` gives a typed reason.** `whatIf` returns, and never throws:
  - `"at-not-after-creation"` for `at <= createdAt`;
  - `"at-item-dead"` for `at` at or after a `died` entry of `replay(...)` and before the next resurrection, and for `at` at or after the final death, with `diedAt` within `DEATH_TIME_PRECISION_MS` of that `died` entry (the two bisections run over different intervals, L6);
  - `"invalid-at"` for `NaN`, `±Infinity`, `-1`, `MAX_TIMESTAMP + 1` and a non-number.
- **P-E. Results are JSON.** Every result from P-A to P-D survives a JSON round trip deeply equal (Requirement 9.3).
