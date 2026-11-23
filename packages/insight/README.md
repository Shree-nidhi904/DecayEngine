# @decay-engine/insight

Replay and "what if" for Decay Engine items. Insight rebuilds an item from its history log in a throwaway `DecayEngine` on an `InMemoryAdapter`, and answers "what if it had been tended once more, at time `at`?".

It uses only the engine's public API (`DecayEngine`, `InMemoryAdapter`, `DecayEngineError`, `MAX_FORECAST_HORIZON_MS`, `MAX_TIMESTAMP` and the exported types) and changes nothing in `packages/engine`. It never repeats a policy's maths: every health value and death time comes from the engine, which calls your policy. A boundary test rejects `Math.` and `**` in the library files.

No app uses it yet (task E1). An app adds `"@decay-engine/insight": "workspace:*"` to its dependencies and consumes it from source, as it does the shell.

## API

### `replay(policy, item, history, options?)`

Creates a new engine, calls `addItem` at `item.createdAt` with the item's current payload, importance and costMinutes, then `tend` or `resurrect` for each recorded `tended` or `resurrected` entry, with the recorded event and timestamp, then `tick(until)`.

```ts
import { replay } from "@decay-engine/insight"

const item = engine.view(now).find((i) => i.id === id)!
const r = replay(policy, item, engine.history(id), { until: now })
if (r.ok) {
  r.item      // the replayed item at `until`
  r.history   // the replayed history
  r.diesAt    // death time, or null if it does not die within the horizon
  r.skipped   // edited and resurrect-failed entries, not replayed
}
```

Options: `until` (default: the last entry's timestamp; it cannot be earlier) and `horizonMs` (default `MAX_FORECAST_HORIZON_MS`, 10 years).

### `whatIf(policy, item, history, { at, event }, options?)`

The same replay with one extra tend at `at`. It returns the death of the life that contains `at` (`diesAt`), next to the same life's death without the extra tend (`baselineDiesAt`). It stops at the next recorded resurrection (`stoppedAt.why === "next-life"`), because in the what-if world that resurrection may not happen. If a later recorded tend finds the what-if item already dead, it stops there (`"died-before-entry"`).

```ts
import { whatIf } from "@decay-engine/insight"

const w = whatIf(policy, item, history, { at: item.createdAt + 4 * DAY, event: goodEvent })
if (w.ok) console.log(w.baselineDiesAt, "→", w.diesAt)
else if (w.reason.code === "at-item-dead") console.log("dead since", w.reason.diedAt)
```

`at` must be strictly after `createdAt` and at a time when the item is not dead. The engine decides that: Insight replays everything up to `at` and asks `view(at)`.

### `deathTime(engine, itemId, from, options?)`

When an engine says the item dies: its `diedAt` if `view(from)` shows it dead, otherwise its `diesAt` in `forecast(from, horizonMs)`, otherwise `null`. Read-only. Unlike `replay` and `whatIf`, it lets the engine's errors through (for example `ITEM_NOT_FOUND`).

```ts
import { deathTime } from "@decay-engine/insight"

deathTime(engine, id, now)
```

### Reasons

`replay` and `whatIf` never throw for bad input. They return `{ ok: false, reason }`:

| `reason.code` | From | Meaning |
|---|---|---|
| `invalid-history` | replay | The history cannot be replayed; `problem` is `empty`, `first-not-created`, `created-time-mismatch`, `other-item`, `bad-timestamp`, `out-of-order`, `second-created` or `unknown-type`, and `index` is the entry. |
| `invalid-item` | replay | `addItem` refused the item; `engineCode` is the engine's code. |
| `invalid-options` | replay | `until` or `horizonMs` is not valid. |
| `diverged` | replay | The replayed item was not in the state a recorded entry needs: `ITEM_ALREADY_DEAD`, `ITEM_NOT_DEAD`, or `RESURRECT_REFUSED` with the policy's reason. |
| `invalid-at` | whatIf | `at` is not a finite number from 0 to `MAX_TIMESTAMP`. |
| `at-not-after-creation` | whatIf | `at` is at or before `createdAt`. |
| `at-item-dead` | whatIf | The item is dead at `at`; `diedAt` says since when. |
| `invalid-event` | whatIf | The event cannot be written as JSON. |
| `replay-failed` | whatIf | One of the replay reasons above, inside `reason`. |

An error thrown by your policy, or an engine error that means the policy broke the contract (`INVALID_HEALTH`, `INVALID_POLICY_RESULT`, `INVALID_THRESHOLDS`), goes through unchanged. Every result is plain JSON.

## What the engine does not record

The history log was built for Autopsy, not for replay. These gaps come from the log, and Insight works around them as follows.

1. **No payload at creation, no old values on edit.** The `created` entry has no payload, and an `edited` entry lists only the names of the fields that changed. So the replay starts from the item's current payload, importance and costMinutes. If your policy's maths reads them and they were edited, replayed health can differ from the recorded health. Edits are listed in `skipped` and not re-applied. Insight does not report the difference.
2. **Events are `unknown`.** Insight passes each recorded event back to your policy unchanged. Only your policy decides what it means.
3. **Replaced policyData and payload on resurrection.** The history does not record what `policy.resurrect` returned. Insight never copies the input item's policyData: it rebuilds it from `init` and the replayed events, and at a resurrection your policy computes the replacement again. A replaced payload cannot be undone: before that resurrection, the replay already uses the later payload.
4. **Failed resurrections and edits are not replayed.** A `resurrect-failed` entry changes no health, and with the current payload it might even succeed. Both kinds are listed in `skipped`.
5. **Ticks and views are not recorded.** A tick that changed health without a state change writes no entry, but it re-bases the stored item. The replay does not see it, so replayed health matches recorded health to within floating-point rounding (1e-9), not exactly.
6. **Death times depend on when the engine looked.** The engine dates a death by bisecting between the stored item's last event and the time it settled the item, and that time is not recorded. Replayed death times match recorded ones to within one minute, not exactly.
7. **The input item's other fields are ignored.** Only `id`, `createdAt`, `payload`, `importance` and `costMinutes` are read. `health`, `state`, `lastEventAt`, `diedAt`, `timesResurrected` and `policyData` are not.

## Death time precision

The engine finds a death by bisection and returns the end of a final interval at most one minute wide (`DEATH_TIME_PRECISION_MS`, 60,000 ms, the same value as the engine's own precision). Two death times for the same item, worked out over different intervals, can differ by up to a minute.

## `whatIf` does not promise a later death

An extra good tend does not always make the item live longer:

- If a later recorded tend also resets health to full, the extra tend before it changes nothing, so the death time stays the same.
- With some policies a tend can shorten a life. For example, a review too soon after the last one might count as cramming and take health off. Then `diesAt` can be earlier than `baselineDiesAt`, and a later `at` can give an earlier death.

`whatIf` returns whatever the engine gives, with no flag. In the tests, a later `at` in the same life never gives an earlier death, to within a minute, when all of these hold:

1. The extra event sets health to the maximum.
2. Health falls in a way that depends only on the health and the time since the last event.
3. Every recorded event's result does not go down when the health before it goes up.

## Tests

```
pnpm --filter @decay-engine/insight typecheck
pnpm --filter @decay-engine/insight test
```

Both also run in `scripts/check.sh`. The tests use small policies defined in `src/test/policies.ts` (an exponential one, a linear one, a "cramming" one that breaks monotonicity, one that reads its half-life from the payload, and one that throws), not the apps' policies, because a package cannot import an app. Histories come from a real engine driven by a fast-check scenario generator (`src/test/scenario.ts`), with a coverage check. The properties (P-A to P-E in `.kiro/specs/insight/requirements.md`) run at 100 cases or more.
