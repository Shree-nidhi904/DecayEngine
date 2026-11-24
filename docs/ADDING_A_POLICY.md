# Adding a policy

The engine knows nothing about facts or friends. An app gives it one object, a `DecayPolicy`, and the engine does the rest. Study Dungeon (exponential decay) and Ghosted (straight-line decay) are two such objects over the same unchanged engine.

## 1. The contract

Defined in [packages/engine/src/types.ts](../packages/engine/src/types.ts):

| Member | Job |
|---|---|
| `thresholds` | `{ weak, dead }`: health ≥ weak is alive, between is weak, below dead is dead. `0 < dead < weak ≤ 100` |
| `init(payload, now)` | Starting policy data for a new item |
| `healthAt(item, now)` | Health at `now`. Must never rise between events |
| `applyEvent(item, event, now)` | New health and policy data after the user tends the item |
| `nextDueAt(item, now)` | When it next needs attention, or `null` |
| `resurrect(item, event, now)` | `{ ok: true }` or `{ ok: false, reason }` for a dead item |

All of it is pure and synchronous: no clock reads, no side effects. Time is always passed in.

## 2. An example: a carton of milk

```ts
import type { DecayPolicy } from "@decay-engine/engine"

const DAY = 86_400_000

type Milk = { label: string; shelfLifeDays: number }
type MilkData = Record<string, never>
type Event = { kind: "freeze" }

export const milkPolicy: DecayPolicy<Milk, MilkData, Event> = {
  thresholds: { weak: 40, dead: 10 },
  init: () => ({}),
  // Straight line from the stored health to zero over the shelf life.
  healthAt: (item, now) =>
    Math.max(0, item.health - ((now - item.lastEventAt) / (item.payload.shelfLifeDays * DAY)) * 100),
  // Freezing resets freshness to 60.
  applyEvent: (item) => ({ health: 60, policyData: item.policyData }),
  // Due when health reaches the weak line.
  nextDueAt: (item) =>
    item.lastEventAt + ((item.health - 40) / 100) * item.payload.shelfLifeDays * DAY,
  // Spoiled milk stays spoiled.
  resurrect: () => ({ ok: false, reason: "It has gone off." }),
}
```

To see it run, paste the object (from `{` to `}`, without the types) into [Policy Lab](https://decay-engine-lab.netlify.app). Its "Milk (straight line)" example is this policy. The page runs the text as JavaScript in your browser, so paste only code you trust.

## 3. Connect it

```ts
import { DecayEngine, LocalStorageAdapter } from "@decay-engine/engine"

const engine = new DecayEngine(milkPolicy, new LocalStorageAdapter("milk"), () => crypto.randomUUID())
const id = engine.addItem({ payload: { label: "Milk", shelfLifeDays: 7 }, importance: 2, costMinutes: 1 }, Date.now())
engine.view(Date.now())
```

Ghosted does exactly this in [apps/ghosted/src/engine-instance.ts](../apps/ghosted/src/engine-instance.ts).

`importance` is a whole number from 1 to 3 and `costMinutes` a whole number from 1 to 600. Anything else makes `addItem` throw (`INVALID_IMPORTANCE`, `INVALID_COST_MINUTES`).

## 4. What you get without writing it

States and settling, the due queue and graveyard, per-item history, `triage(budgetMinutes, now)` (the exact best set for a time budget), `autopsy`, `forecast`, JSON snapshots and storage adapters. On top of the public API, `@decay-engine/insight` adds `replay`, `whatIf` and `deathTime`.

## 5. Check it

`checkPolicy(policy, samplePayloads, sampleEvents, startTime)` returns `{ passed, failures }` and never throws. It checks the thresholds, that `init` returns data that survives JSON, and the health curve of each sample item (and of each item after each sample event): from 0 to 100, the same answer twice, and never rising, at nine times from `startTime` to 10 years later. It does not check `nextDueAt` or `resurrect`, so test those yourself. A pass means the decay curve is well formed for your samples, not that every rule is right.

Then prove you did not touch the engine:

```bash
bash scripts/check-engine-unchanged.sh
```

It compares `packages/engine` with the `engine-complete` tag (the commit before either app existed). Only whole-line comments may differ; any other change exits 1. `scripts/check.sh` runs it with everything else.
