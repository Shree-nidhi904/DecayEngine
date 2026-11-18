# @decay-engine/engine

A small TypeScript engine that tracks the lifecycle of any item: **alive → weak → dead → resurrected**.

The engine doesn't know what an item is. Each app supplies a **decay policy** that says how an item loses health and whether it can come back. The engine does the rest:

- Health (0-100) and state for every item, at any time you ask about
- A due list and a graveyard
- A history log for every item
- **Triage**: "I have N minutes. What should I save?" Picks the weak items with the most value per minute that fit the time budget.
- **Autopsy**: facts about how a dead item died, read from its history
- **Forecast**: which items die in the next N days
- **checkPolicy**: a test kit that checks a policy against the contract

The engine never reads the clock. Every call takes the current time as `now` (milliseconds), so you can look at any moment, past or future. It has no runtime dependencies and no UI code.

## Installation

The package is not published yet. Inside this monorepo, add it as a workspace dependency:

```json
"dependencies": { "@decay-engine/engine": "workspace:*" }
```

## Quick start

A plant loses 10 health a day and is fully restored by watering.

```ts
import { DecayEngine, InMemoryAdapter, checkPolicy } from "@decay-engine/engine"
import type { DecayPolicy } from "@decay-engine/engine"

const DAY = 24 * 60 * 60 * 1000

type Plant = { name: string }
type PlantData = { lossPerDay: number }
type PlantEvent = { type: "water" }

const plantPolicy: DecayPolicy<Plant, PlantData, PlantEvent> = {
  thresholds: { weak: 50, dead: 10 },

  init: () => ({ lossPerDay: 10 }),

  // Loses lossPerDay health per day since the last event, kept within 0-100.
  healthAt: (item, now) => {
    const days = (now - item.lastEventAt) / DAY
    return Math.min(100, Math.max(0, item.health - item.policyData.lossPerDay * days))
  },

  applyEvent: (item) => ({ health: 100, policyData: item.policyData }),

  // Due when it would reach the weak threshold.
  nextDueAt: (item) =>
    item.lastEventAt + ((item.health - 50) / item.policyData.lossPerDay) * DAY,

  resurrect: () => ({ ok: true }),
}

// Check the policy before using it.
const T0 = 1_700_000_000_000 // any fixed start time
checkPolicy(plantPolicy, [{ name: "Fern" }], [{ type: "water" }], T0)
// -> { passed: true, failures: [] }

let next = 0
const engine = new DecayEngine(plantPolicy, new InMemoryAdapter(), () => `plant-${++next}`)

const fern = engine.addItem({ payload: { name: "Fern" }, importance: 1, costMinutes: 5 }, T0)

engine.view(T0 + 3 * DAY)        // fern: health 70, alive
engine.view(T0 + 6 * DAY)        // fern: health 40, weak
engine.forecast(T0, 10 * DAY)    // fern dies just after day 9
engine.triage(15, T0 + 6 * DAY)  // picks: [fern], value (100 - 40) x (1 - 0.4) x 1 = 36

engine.tend(fern, { type: "water" }, T0 + 6 * DAY)   // health 100 again

engine.tick(T0 + 16 * DAY)       // forgotten: dies just after day 15
engine.graveyard()               // [fern]
engine.autopsy(fern, T0 + 16 * DAY)
// -> lastTend at day 6, wentWeakAt just after day 11, diedAt just after day 15

engine.resurrect(fern, { type: "water" }, T0 + 16 * DAY)  // { ok: true }, health 100
```

In a browser app, use `new LocalStorageAdapter("my-app")` instead of `InMemoryAdapter` to keep data across reloads.

This example also runs as a test in `tests/unit/exports.test.ts`.

## Writing a policy

A policy answers six questions:

| Field | Question |
|---|---|
| `thresholds: { weak, dead }` | What health counts as weak and dead? (0 < dead < weak ≤ 100) |
| `init(payload, now)` | What policy data does a new item start with? |
| `healthAt(item, now)` | How healthy is it now? |
| `applyEvent(item, event, now)` | Something happened. What are the new health and policy data? |
| `nextDueAt(item, now)` | When should the user look at it again? (`null` for never) |
| `resurrect(item, event, now)` | Can a dead item come back? |

Rules:

- Every function is pure and synchronous. No clock reads, no side effects, no async.
- `healthAt` must never increase with time between events.
- Payload, policy data and events must be JSON-serializable.

State comes from health: **alive** when health ≥ weak, **weak** when dead ≤ health < weak, **dead** when health < dead.

## API reference

Every public function, class and type has JSDoc in the source:

- `DecayEngine`: [`src/engine.ts`](src/engine.ts). Methods: `addItem`, `view`, `tick`, `tend`, `resurrect`, `edit`, `due`, `graveyard`, `history`, `remove`, `triage`, `autopsy`, `forecast`.
- Types (`Item`, `DecayPolicy`, `HistoryEntry`, `TriageResult`, `AutopsyReport`, `ForecastEntry` and others): [`src/types.ts`](src/types.ts)
- Errors: [`src/errors.ts`](src/errors.ts). Every error the engine throws is a `DecayEngineError`; check its `code`.
- Storage: [`src/storage/`](src/storage/)
- `checkPolicy`: [`src/check-policy.ts`](src/check-policy.ts)
- `deriveState`, `validateThresholds`: [`src/state-derivation.ts`](src/state-derivation.ts)

Full specification: [`.kiro/specs/engine/`](../../.kiro/specs/engine/) (requirements, design and tasks).

## Tests

```sh
pnpm test             # all tests
pnpm test:unit
pnpm test:properties  # fast-check property tests
pnpm test:coverage
pnpm typecheck
```

## Who wrote what

- **The developer** wrote the `DecayEngine` class (`src/engine.ts`), Triage (`src/triage.ts`), Autopsy (`src/autopsy.ts`), the property-test generators and property tests (`tests/generators.ts`, `tests/properties/`) and the boundary test (`tests/unit/boundary.test.ts`).
- **Kiro** wrote the rest of the engine: types, errors, state derivation, settle, bisection, serialization, the storage adapters, `checkPolicy`, forecast, and the unit tests for those modules.
- The decay rules in each app's policy are written by hand.

See [`.kiro/steering/authorship.md`](../../.kiro/steering/authorship.md) and [`docs/KIRO_LOG.md`](../../docs/KIRO_LOG.md).

## Project

This package is part of Decay Engine, a monorepo with three apps built on it (Study Dungeon, Ghosted and Expiry Reaper). See the [project root](../../).
