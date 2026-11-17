# Technical Design: Decay Engine

## Overview

The Decay Engine is a pure TypeScript lifecycle management library that tracks items through states of alive, weak, and dead. It is a zero-dependency runtime package with a policy-driven architecture: applications supply a `DecayPolicy` object that defines how items decay and can be resurrected, while the engine enforces lifecycle rules, manages state transitions, maintains queues, records history, and persists data through a storage adapter.

The engine knows nothing about what an item represents. All application-specific logic lives in the policy. This separation allows the same engine to power a spaced-repetition study app (Study Dungeon), a keep-in-touch app (Ghosted), or an expiry tracker (Expiry Reaper) without modification.

**Key Design Principles:**
- **Time as an argument**: The engine never reads the clock. Every function that needs time accepts a `now` parameter (milliseconds since Unix epoch).
- **Pure settle logic**: One pure function computes an item's state at any time. No duplicated state calculation.
- **Synchronous everything**: Every engine operation is synchronous. Every write builds a new snapshot, saves it once, and only then updates memory. A failed save leaves storage and memory unchanged.
- **Policy purity**: All policy functions (`init`, `healthAt`, `applyEvent`, `nextDueAt`, `resurrect`) are pure and synchronous. `healthAt` never increases with time between events; bisection relies on this.
- **JSON-serializable data**: Payload, PolicyData, and Event types must be JSON-serializable (no functions, symbols, undefined as values, NaN, Infinity, or negative zero).
- **No runtime dependencies**: The engine is pure TypeScript with no external runtime dependencies.

## Architecture

### Package Structure

```
packages/engine/
├── src/
│   ├── types.ts              # Item, DecayPolicy, storage interfaces, history types, triage/autopsy/forecast types
│   ├── errors.ts             # Single DecayEngineError class with error codes
│   ├── state-derivation.ts   # Pure functions: deriveState, validateThresholds
│   ├── settle.ts             # Pure settle function used by all operations
│   ├── bisection.ts          # Binary search for death timing and weak crossings
│   ├── triage.ts             # Knapsack algorithm for optimal item selection
│   ├── autopsy.ts            # Cause-of-death analysis from history
│   ├── forecast.ts           # Death prediction within time horizon
│   ├── serialization.ts      # Parse and validate storage format
│   ├── storage/
│   │   ├── interface.ts      # StorageAdapter interface
│   │   ├── memory.ts         # In-memory adapter for testing
│   │   └── local-storage.ts  # Browser localStorage adapter (only file that touches browser APIs)
│   ├── engine.ts             # DecayEngine class implementation
│   ├── check-policy.ts       # Policy validation function
│   └── index.ts              # Public API exports
├── tests/
│   ├── fake-policy.ts        # Fake policy for property-based tests
│   ├── unit/                 # Unit tests for each module
│   └── properties/           # Property-based tests with fast-check
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Module Responsibilities

**types.ts**: Defines all TypeScript types and interfaces:
- `Item<Payload, PolicyData>`
- `DecayPolicy<Payload, PolicyData, Event>`
- `StorageAdapter` interface
- `EngineState<Payload, PolicyData>`: in-memory state with Maps
- `StoredSnapshot`: JSON-serializable snapshot passed to storage adapter
- `HistoryEntry` discriminated union (7 types)
- `TriageCandidate`, `TriageResult`, `AutopsyReport`, `ForecastEntry`, `ResurrectOutcome`

**errors.ts**: Single `DecayEngineError` class extending `Error` with a `code` property for programmatic error handling.

**state-derivation.ts**: Pure functions that compute state from health and thresholds:
- `deriveState(health, thresholds)`: Returns "alive", "weak", or "dead"
- `validateThresholds(thresholds)`: Validates threshold configuration
- `applyHealth(item, newHealth, now, thresholds)`: Takes an item, a new health value, a timestamp, and thresholds, and returns the updated item plus any state-changed or died history entries. Used by both settle and tend to ensure death and state-change logic exists in one place.

**settle.ts**: The core pure function that computes an item's health and state at a given time:
- `settle<Payload, PolicyData>(item, policy, now)`: Returns `{ item, historyEntries }`
- Used by tick, tend, resurrect, edit, view, and due
- If `now` is earlier than `item.lastEventAt`, returns the item unchanged (view and due use this behavior; write operations throw TIME_WENT_BACKWARD)
- Otherwise, updates health via `policy.healthAt`, uses `applyHealth` to derive state and generate history, sets `lastEventAt` to `now` whenever health or state changes

**bisection.ts**: Binary search for threshold crossing times:
- `bisectCrossing(item, policy, threshold, fromTime, toTime)`: Finds when health first drops below `threshold`, to 1-minute precision. Used for both the weak and the dead threshold
- `findDeathAfter(item, policy, fromTime, toTime)`: Returns `null` if the item is still not dead at `toTime`, otherwise `bisectCrossing` for the dead threshold. Used by triage and forecast
- Returns upper end of final interval (earliest checked time at which health is already below the threshold)
- Relies on policy invariant: healthAt never increases with time between events

**triage.ts**: Optimal item selection within time budget:
- `triage(items, budgetMinutes, policy, now)`: Returns TriageResult with picks and others
- Computes value and valuePerMinute for each weak item
- Uses exact 0/1 knapsack algorithm over integer minutes
- Determines diesAt for each candidate via bisection up to MAX_FORECAST_HORIZON_MS

**autopsy.ts**: Cause-of-death analysis:
- `autopsy(item, history, policy, now)`: Returns AutopsyReport with facts only
- Settles item in memory without persisting
- Extracts facts from history: wentWeakAt, lastTend, silenceMs, tends, failedResurrections
- Defines "this life" as period from most recent resurrection (or creation) to death

**forecast.ts**: Death prediction:
- `forecast(items, now, horizonMs, policy)`: Returns array of ForecastEntry objects
- Computes health at `now` for all non-dead items
- Uses bisection to find diesAt for each item up to `now + horizonMs`
- Returns only items with diesAt within horizon, sorted by diesAt ascending

**serialization.ts**: Parses and validates stored data, and converts between in-memory and storage formats:
- `parseSnapshot<Payload, PolicyData>(data)`: Validates and returns typed EngineState from StoredSnapshot
- `validateItem(item)`: Deep validation of item structure and field constraints
- `serializeSnapshot(engineState)`: Converts EngineState to StoredSnapshot for storage

**storage/**: Adapter interface and implementations:
- `interface.ts`: `StorageAdapter` with `load()` and `save(snapshot)` methods
- `memory.ts`: In-memory map that stores and returns deep copies, ensuring callers cannot modify stored data through references
- `local-storage.ts`: Browser localStorage, takes namespace parameter

**engine.ts**: The `DecayEngine` class that orchestrates all operations:
- Constructor: validates policy, loads snapshot
- Public methods: addItem, tend, view, tick, due, graveyard, resurrect, edit, history, remove, triage, autopsy, forecast
- Private methods: `_persist`, `_validateNow`, `_getItem`
- `addItem`, `tend`, `tick`, `edit`, `resurrect`, and `remove` are synchronous

**index.ts**: Exports the public API surface: `DecayEngine`, `DecayEngineError`, `StorageAdapter`, `checkPolicy`, `MAX_FORECAST_HORIZON_MS` constant, and all type definitions.

### Data Flow

**Read operations** (view, due, graveyard, history):
1. Load items from in-memory state (populated from storage at construction)
2. Compute derived values (health at time, due status)
3. Return copies, never references to stored items

**Read-only analysis operations** (triage, autopsy, forecast):
1. Settle items at `now` in memory (same `settle` as view)
2. Compute the result from settled items and history
3. Never call `_persist`

**Write operations** (addItem, tend, tick, edit, resurrect, remove):
1. Validate inputs
2. Settle item(s) if needed (compute current state)
3. Apply changes to create new snapshot (for resurrect, call `policy.resurrect` synchronously first)
4. Save snapshot via adapter (synchronous, throws on failure)
5. Update in-memory state only after successful save
6. Return result

**Error handling**:
- Policy errors propagate to caller
- Storage errors propagate to caller
- Validation errors throw `DecayEngineError` with specific code
- Failed saves leave storage and memory unchanged

## Components and Interfaces

### Core Types

```typescript
// types.ts

type Item<Payload, PolicyData> = {
  id: string
  payload: Payload              // Must be JSON-serializable
  policyData: PolicyData        // Must be JSON-serializable
  health: number                // 0..100, as of lastEventAt
  state: "alive" | "weak" | "dead"
  createdAt: number
  lastEventAt: number
  diedAt?: number
  timesResurrected: number
  importance: number            // 1..3, user-set
  costMinutes: number           // positive integer, at most 600
}

interface DecayPolicy<Payload, PolicyData, Event> {
  thresholds: { weak: number; dead: number }
  init(payload: Payload, now: number): PolicyData
  healthAt(item: Item<Payload, PolicyData>, now: number): number
  applyEvent(item: Item<Payload, PolicyData>, event: Event, now: number): { 
    health: number
    policyData: PolicyData 
  }
  nextDueAt(item: Item<Payload, PolicyData>, now: number): number | null
  resurrect(item: Item<Payload, PolicyData>, event: Event, now: number):
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
}

// Event type must be JSON-serializable (constraint on app-defined Event)

type TriageCandidate<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  value: number
  valuePerMinute: number
  diesAt: number | null
}

type TriageResult<Payload, PolicyData> = {
  picks: TriageCandidate<Payload, PolicyData>[]
  others: TriageCandidate<Payload, PolicyData>[]
}

type AutopsyReport<Event> = {
  createdAt: number
  diedAt: number
  wentWeakAt: number | null
  lifeStartedAt: number
  lastTend: { at: number; event: Event } | null
  silenceMs: number
  tends: Array<{ at: number; event: Event; gapBeforeMs: number | null }>
  timesResurrected: number
  failedResurrections: number
}

type ForecastEntry<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  diesAt: number
}

// Returned by engine.resurrect so the app can tell a won fight from a lost one
type ResurrectOutcome = { ok: true } | { ok: false; reason: string }

// Constants
const MAX_FORECAST_HORIZON_MS = 315360000000 // 10 years in milliseconds

type HistoryEntry = 
  | {
      type: "created"
      itemId: string
      timestamp: number
      health: number
    }
  | {
      type: "tended"
      itemId: string
      timestamp: number
      health: number
      event: unknown
    }
  | {
      type: "state-changed"
      itemId: string
      timestamp: number
      health: number
      from: "alive" | "weak" | "dead"
      to: "alive" | "weak" | "dead"
    }
  | {
      type: "died"
      itemId: string
      timestamp: number
      health: number
    }
  | {
      type: "resurrected"
      itemId: string
      timestamp: number
      health: number
      event: unknown
    }
  | {
      type: "resurrect-failed"
      itemId: string
      timestamp: number
      health: number
      event: unknown
      reason: string
    }
  | {
      type: "edited"
      itemId: string
      timestamp: number
      health: number
      fieldsChanged: string[]
    }

// In-memory state representation
type EngineState<Payload, PolicyData> = {
  items: Map<string, Item<Payload, PolicyData>>
  history: Map<string, HistoryEntry[]>
}

// Storage representation (JSON-serializable)
type StoredSnapshot = {
  schemaVersion: number
  items: Array<Item<unknown, unknown>>
  history: Array<HistoryEntry>
}

interface StorageAdapter {
  load(): StoredSnapshot | null
  save(snapshot: StoredSnapshot): void
}

// ID generator is a plain function
type IdGenerator = () => string
```

### Storage Adapter Interface

The adapter interface is synchronous and works on complete snapshots:

```typescript
interface StorageAdapter {
  /**
   * Load the complete snapshot from storage.
   * Returns null if no snapshot exists.
   * Throws if storage is corrupt or inaccessible.
   */
  load(): StoredSnapshot | null
  
  /**
   * Save the complete snapshot to storage.
   * Replaces any existing snapshot atomically.
   * Throws if save fails.
   */
  save(snapshot: StoredSnapshot): void
}
```

**StoredSnapshot format**:
- `schemaVersion`: number (currently 1)
- `items`: Array of Item objects (all item fields are JSON-serializable)
- `history`: Array of HistoryEntry objects (all fields are JSON-serializable)

**EngineState format** (in-memory only):
- `items`: Map<string, Item<Payload, PolicyData>>
- `history`: Map<string, HistoryEntry[]>

**Conversion**:
- When loading: `parseSnapshot` converts StoredSnapshot to EngineState
- When saving: `serializeSnapshot` converts EngineState to StoredSnapshot

**Implementation notes:**
- Adapter methods are synchronous
- `load()` returns `null` if no snapshot exists (first run)
- `save()` must be atomic: either complete success or complete failure
- Adapter throws on error; engine propagates to caller
- The engine validates and types the data after loading

**Provided implementations:**

1. **InMemoryAdapter** (`storage/memory.ts`):
   - Stores snapshot in a private variable
   - Returns deep copies on load, stores deep copies on save
   - Callers cannot modify stored data through references
   - Used for testing
   - No persistence across process restarts

2. **LocalStorageAdapter** (`storage/local-storage.ts`):
   - Persists to browser `localStorage`
   - Constructor: `new LocalStorageAdapter(namespace: string)`
   - Storage key: `decay-engine:${namespace}`
   - Only file in the package that imports browser APIs
   - Serializes snapshot to JSON string
   - Returns `null` if key doesn't exist

### Settle Function

The settle function is the heart of the engine. It is a pure function that computes an item's health and state at a given time, returning the updated item and any history entries for state transitions:

```typescript
// settle.ts

type SettleResult<Payload, PolicyData> = {
  item: Item<Payload, PolicyData>
  historyEntries: HistoryEntry[]
}

function settle<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  now: number
): SettleResult<Payload, PolicyData> {
  // If already dead, return unchanged
  if (item.state === "dead") {
    return { item, historyEntries: [] }
  }
  
  // If now is earlier than lastEventAt, return unchanged
  // (Used by view and due; write operations will throw TIME_WENT_BACKWARD)
  if (now < item.lastEventAt) {
    return { item, historyEntries: [] }
  }
  
  // Compute health at now
  const computedHealth = policy.healthAt(item, now)
  const clampedHealth = clampHealth(computedHealth)
  
  // If health unchanged, return unchanged
  if (clampedHealth === item.health) {
    return { item, historyEntries: [] }
  }
  
  // Find when thresholds were actually crossed (Requirement 17a).
  // Bisection runs on the STORED item (before settling), over [item.lastEventAt, now],
  // because the stored item is what healthAt decays from.
  const newState = deriveState(clampedHealth, policy.thresholds)
  const crossings: Crossings = {}
  if (item.state === "alive" && newState !== "alive") {
    crossings.weakAt = bisectCrossing(item, policy, policy.thresholds.weak, item.lastEventAt, now)
  }
  if (newState === "dead") {
    crossings.deadAt = bisectCrossing(item, policy, policy.thresholds.dead, item.lastEventAt, now)
  }
  
  // Health changed: use applyHealth to compute new state and history
  const { item: updatedItem, historyEntries } = applyHealth(
    item,
    clampedHealth,
    now,
    policy.thresholds,
    crossings
  )
  
  return { item: updatedItem, historyEntries }
}
```

**Usage across engine operations:**

- **view(now)**: Calls settle for each item, returns the computed item, discards history
- **due(now)**: Calls settle for each non-dead item, uses computed health for filtering and sorting
- **tick(now)**: Calls settle for each item, saves items where health or state changed, records history
- **tend(id, event, now)**: Calls settle first to compute current state, throws if `now < lastEventAt`, throws if dead, then applies event
- **edit(id, changes, now)**: Calls settle first, then replaces fields (and recomputes health only if not dead)
- **resurrect(id, event, now)**: Calls settle first, throws if `now < lastEventAt`, confirms item is dead before calling policy.resurrect
- **triage, autopsy, forecast**: Call settle in memory only, like view

**Key properties:**
- Pure function: same inputs always produce same output
- No side effects: no storage writes, no policy calls except `healthAt`
- Returns unchanged if `now < lastEventAt` (allows view and due to work with earlier times)
- Returns unchanged if already dead
- Returns unchanged if health unchanged
- Uses `applyHealth` to derive state and generate history when health changes

### State Derivation

State is deterministically computed from health and thresholds:

```typescript
// state-derivation.ts

function deriveState(
  health: number,
  thresholds: { weak: number; dead: number }
): "alive" | "weak" | "dead" {
  if (health >= thresholds.weak) {
    return "alive"
  }
  if (health >= thresholds.dead) {
    return "weak"
  }
  return "dead"
}

function validateThresholds(thresholds: { weak: number; dead: number }): void {
  if (typeof thresholds.weak !== "number" || typeof thresholds.dead !== "number") {
    throw new DecayEngineError("INVALID_THRESHOLDS", "Thresholds must be numbers")
  }
  if (thresholds.dead <= 0) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "dead threshold must be positive")
  }
  if (thresholds.weak > 100) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "weak threshold cannot exceed 100")
  }
  if (thresholds.dead >= thresholds.weak) {
    throw new DecayEngineError("INVALID_THRESHOLDS", "dead threshold must be less than weak threshold")
  }
}

function clampHealth(health: unknown): number {
  if (typeof health !== "number" || !isFinite(health)) {
    throw new DecayEngineError("INVALID_HEALTH", "Health must be a finite number")
  }
  if (health > 100) return 100
  if (health < 0) return 0
  return health
}

// When thresholds were crossed. Settle fills these from bisection.
// Event-caused changes (tend, edit) leave them empty, so the crossing time is `now`.
type Crossings = { weakAt?: number; deadAt?: number }

function applyHealth<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  newHealth: number,
  now: number,
  thresholds: { weak: number; dead: number },
  crossings: Crossings = {}
): { item: Item<Payload, PolicyData>; historyEntries: HistoryEntry[] } {
  // Derive new state from health
  const oldState = item.state
  const newState = deriveState(newHealth, thresholds)
  
  // Build updated item with new health, state, and lastEventAt
  // (lastEventAt is always `now`: stored health is health as of lastEventAt)
  const updatedItem = {
    ...item,
    health: newHealth,
    state: newState,
    lastEventAt: now
  }
  
  const historyEntries: HistoryEntry[] = []
  
  // Record state transition if state changed
  if (oldState !== newState) {
    if (newState === "dead") {
      const diedAt = crossings.deadAt ?? now
      // Alive straight to dead (for example, the user was away for weeks):
      // still record the weak crossing first, so Autopsy can report wentWeakAt
      if (oldState === "alive") {
        historyEntries.push({
          type: "state-changed",
          itemId: item.id,
          timestamp: crossings.weakAt ?? diedAt,
          health: thresholds.weak,
          from: "alive",
          to: "weak"
        })
      }
      // Item died: set diedAt, clamp health to 0, record "died"
      updatedItem.diedAt = diedAt
      updatedItem.health = 0
      historyEntries.push({
        type: "died",
        itemId: item.id,
        timestamp: diedAt,
        health: 0
      })
    } else {
      // State changed but not to dead: record "state-changed"
      historyEntries.push({
        type: "state-changed",
        itemId: item.id,
        timestamp: newState === "weak" ? (crossings.weakAt ?? now) : now,
        health: newHealth,
        from: oldState,
        to: newState
      })
    }
  }
  
  return { item: updatedItem, historyEntries }
}
```

**State derivation rules** (Requirement 14):
1. health ≥ policy.thresholds.weak → "alive"
2. policy.thresholds.dead ≤ health < policy.thresholds.weak → "weak"
3. health < policy.thresholds.dead → "dead" (and health clamped to 0)

**Threshold constraints**:
- 0 < policy.thresholds.dead < policy.thresholds.weak ≤ 100
- Validated at engine construction

**applyHealth function**:
- Takes an item, a new health value, a timestamp, and thresholds
- Returns the updated item and any state-changed or died history entries
- Used by settle, tend and edit to ensure death and state-change logic exists in one place
- When state transitions to "dead", sets health to 0 and records diedAt (the bisected crossing time from settle, or `now` for an event-caused death)
- When an item goes from alive straight to dead, records the alive→weak "state-changed" entry first, then "died"
- When state changes between alive/weak, records state-changed history
- `lastEventAt` is always `now`, so the invariant `diedAt ≤ lastEventAt` holds

### Error Handling

Single error class with programmatic error codes:

```typescript
// errors.ts

class DecayEngineError extends Error {
  constructor(
    public readonly code: DecayEngineErrorCode,
    message: string
  ) {
    super(message)
    this.name = "DecayEngineError"
  }
}

type DecayEngineErrorCode =
  | "MISSING_POLICY"
  | "MISSING_STORAGE_ADAPTER"
  | "MISSING_ID_GENERATOR"
  | "INVALID_THRESHOLDS"
  | "INVALID_TIMESTAMP"
  | "INVALID_HEALTH"
  | "INVALID_ID"
  | "DUPLICATE_ID"
  | "ITEM_NOT_FOUND"
  | "ITEM_ALREADY_DEAD"
  | "ITEM_NOT_DEAD"
  | "TIME_WENT_BACKWARD"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_SNAPSHOT"
  | "INVALID_ITEM_DATA"
  | "INVALID_BUDGET"
  | "INVALID_HORIZON"
  | "AUTOPSY_REQUIRES_DEAD_ITEM"
  | "INVALID_IMPORTANCE"
  | "INVALID_COST_MINUTES"
  | "EDIT_REQUIRES_FIELD"
```

**Error message requirements** (Requirement 17):
- Include operation name and what went wrong
- Include item ID when relevant
- Include both lastEventAt and provided now when time goes backward
- Include function name and return value when policy returns invalid value

### Death Timing with Bisection

The engine determines the exact moment an item died using binary search:

```typescript
// bisection.ts

const BISECT_PRECISION_MS = 60000 // 1 minute

// Precondition: health at toTime is already below threshold.
function bisectCrossing<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  threshold: number,
  fromTime: number,
  toTime: number
): number {
  // Binary search between fromTime and toTime to find when health drops below threshold
  // Returns the earliest checked time at which health is already below it (upper end of final interval)
  
  let left = fromTime
  let right = toTime
  
  while (right - left > BISECT_PRECISION_MS) {
    const mid = Math.floor((left + right) / 2)
    const health = clampHealth(policy.healthAt(item, mid))
    
    if (health < threshold) {
      // Already below at mid, search earlier
      right = mid
    } else {
      // Still at or above at mid, search later
      left = mid
    }
  }
  
  // Return the upper end: the earliest checked time at which health is already below
  return right
}

// For triage and forecast: when will this (settled, not dead) item die?
function findDeathAfter<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  policy: DecayPolicy<Payload, PolicyData, unknown>,
  fromTime: number,
  toTime: number
): number | null {
  const healthAtEnd = clampHealth(policy.healthAt(item, toTime))
  if (healthAtEnd >= policy.thresholds.dead) {
    return null // does not die within the window
  }
  return bisectCrossing(item, policy, policy.thresholds.dead, fromTime, toTime)
}
```

**Usage**:
- In `settle`, when health has fallen below a threshold between the item's lastEventAt and `now`: `bisectCrossing(storedItem, policy, threshold, storedItem.lastEventAt, now)`, once for the weak threshold (if the item was alive) and once for the dead threshold (if it is now dead). The results are passed to `applyHealth` as `crossings`
- Bisection always uses the stored item (before settling). The settled item has lastEventAt = now, so it cannot be used to look back in time
- In triage: `findDeathAfter(settledItem, policy, now, now + MAX_FORECAST_HORIZON_MS)`
- In forecast: `findDeathAfter(settledItem, policy, now, now + horizonMs)`
- Event-caused changes (tend, edit) do not bisect: the crossing time is `now`
- Exception: If item starts dead at creation (addItem computes starting health < dead threshold), then `diedAt = createdAt` (no bisection)

**Relies on policy invariant**: `policy.healthAt` never increases with time between events for the same item. This ensures that if health is below threshold at time T, it remains below threshold for all times > T.

**Precision**: 1 minute (60000 milliseconds). The final interval is [left, right] where right - left ≤ 60000.

**Return value**: Always returns `right` (the upper end of the final interval), which is the earliest checked time at which the condition is already met. This ensures `view(diedAt)` always shows the item as dead.

### Atomic Persistence

Every operation that changes data builds a new snapshot, saves it, and only then updates memory:

```typescript
// Inside DecayEngine class

private _state: EngineState<Payload, PolicyData>

private _persist(
  changedItems: Item<Payload, PolicyData>[],
  newHistoryEntries: HistoryEntry[]
): void {
  // Build new engine state
  const newItems = new Map(this._state.items)
  for (const item of changedItems) {
    newItems.set(item.id, item)
  }
  
  const newHistory = new Map(this._state.history)
  for (const entry of newHistoryEntries) {
    const entries = newHistory.get(entry.itemId) ?? []
    newHistory.set(entry.itemId, [...entries, entry])
  }
  
  const engineState: EngineState<Payload, PolicyData> = {
    items: newItems,
    history: newHistory
  }
  
  // Convert to storage format
  const storedSnapshot = serializeSnapshot(engineState)
  
  // Save to storage (throws on failure)
  this._adapter.save(storedSnapshot)
  
  // Update in-memory state only after successful save
  this._state = engineState
}
```

**Properties**:
- Failed save throws error before memory is updated
- Storage and memory stay in sync
- Every write operation uses this single method
- Synchronous: no async/await
- Converts between EngineState (Maps) and StoredSnapshot (arrays) before saving

## Data Models

### Item Structure

An item is the core entity tracked by the engine:

```typescript
type Item<Payload, PolicyData> = {
  id: string                    // Unique identifier (generated)
  payload: Payload              // App-specific data (must be JSON-serializable)
  policyData: PolicyData        // Policy-maintained state (must be JSON-serializable)
  health: number                // 0..100, as of lastEventAt
  state: "alive" | "weak" | "dead"
  createdAt: number             // Timestamp when item was created
  lastEventAt: number           // Timestamp of last health change
  diedAt?: number               // Timestamp when item died (only for dead items)
  timesResurrected: number      // Count of successful resurrections
  importance: number            // 1..3, set by the user, used by Triage
  costMinutes: number           // Minutes to tend, set by the user, used by Triage
}
```

**Field semantics**:
- `health`: Always 0..100, represents health as of `lastEventAt`
- `state`: Derived from health and thresholds, never set directly
- `lastEventAt`: Updated whenever health or state changes
- `diedAt`: Set when state becomes "dead", cleared on resurrection
- `payload` and `policyData`: Opaque to engine, never inspected, must be JSON-serializable (no functions, symbols, undefined as values, NaN, Infinity, or negative zero)

**Invariants**:
- health ∈ [0, 100]
- state matches health and thresholds per derivation rules
- If state is "dead", then diedAt is defined and health is 0
- diedAt ≥ lastEventAt before death (diedAt is greater than or equal to the item's last event timestamp before death)
- diedAt ≤ lastEventAt (the stored lastEventAt is the moment the death was detected, or later)
- createdAt ≤ lastEventAt
- importance ∈ [1, 2, 3]
- costMinutes is a positive integer ≤ 600

### History Structure

History is a time-ordered log of events per item:

```typescript
type HistoryEntry = 
  | { type: "created"; itemId: string; timestamp: number; health: number }
  | { type: "tended"; itemId: string; timestamp: number; health: number; event: unknown }
  | { type: "state-changed"; itemId: string; timestamp: number; health: number; from: "alive" | "weak" | "dead"; to: "alive" | "weak" | "dead" }
  | { type: "died"; itemId: string; timestamp: number; health: number }
  | { type: "resurrected"; itemId: string; timestamp: number; health: number; event: unknown }
  | { type: "resurrect-failed"; itemId: string; timestamp: number; health: number; event: unknown; reason: string }
  | { type: "edited"; itemId: string; timestamp: number; health: number; fieldsChanged: string[] }
```

**Common fields**:
- `type`: Discriminant for union
- `itemId`: Item this entry belongs to
- `timestamp`: When the event occurred (milliseconds since epoch)
- `health`: Item's health after the event

**Type-specific fields**:
- `tended`: includes `event` (app-defined)
- `state-changed`: includes `from` and `to` states
- `resurrected`: includes `event`
- `resurrect-failed`: includes `event` and `reason` string
- `edited`: includes `fieldsChanged` (names of the fields that were replaced)

**Storage**:
- History stored as `Map<string, HistoryEntry[]>` (item ID → entries)
- Entries always sorted by timestamp ascending
- Entries with identical timestamps preserve insertion order

### Snapshot Structure

A snapshot is the complete serializable state of the engine:

**EngineState** (in-memory):
```typescript
type EngineState<Payload, PolicyData> = {
  items: Map<string, Item<Payload, PolicyData>>
  history: Map<string, HistoryEntry[]>
}
```

**StoredSnapshot** (passed to storage adapter):
```typescript
type StoredSnapshot = {
  schemaVersion: number
  items: Array<Item<unknown, unknown>>        // All items
  history: Array<HistoryEntry>                // All history entries (flat)
}
```

**Format notes**:
- EngineState uses Maps for efficient lookup in memory
- StoredSnapshot uses arrays for JSON serialization
- `schemaVersion`: Currently 1, for future migrations
- StoredSnapshot contains only JSON-safe values (no NaN, Infinity, negative zero, functions, symbols, or undefined as values)
- Contains all items and all history
- Self-contained: can reconstruct entire engine state

**Validation** (Requirement 15):
- Required fields present
- Field types correct (id is string, health is number, etc.)
- Health in range 0..100
- State is one of "alive", "weak", "dead"
- Timestamps are finite non-negative numbers
- timesResurrected is non-negative integer
- importance is integer 1-3
- costMinutes is positive integer ≤ 600
- If state is "dead", diedAt is defined

## Correctness Properties

The engine's correctness is verified with property-based tests using fast-check. Each test runs a minimum of 100 iterations with generated inputs.

### Test Tag Format

Each property test includes a comment tag:

```typescript
// Feature: engine, Property 1: Health is always between 0 and 100 inclusive
it("health bounds", () => {
  fc.assert(fc.property(generators.commandSequence(), generators.offset(), (commands, offset) => {
    // test body
  }), { numRuns: 100 })
})
```

### Fake Policy for Testing

The fake policy implements time-based linear decay for testing:

```typescript
// tests/fake-policy.ts

type FakePayload = { name: string }
type FakePolicyData = { decayRate: number }  // Health lost per millisecond (default: 1 per hour)
type FakeEvent = 
  | { type: "boost"; amount: number }
  | { type: "damage"; amount: number }

class FakePolicy implements DecayPolicy<FakePayload, FakePolicyData, FakeEvent> {
  thresholds = { weak: 50, dead: 20 }
  
  private _resurrectShouldFail = false
  
  setResurrectFailure(shouldFail: boolean): void {
    this._resurrectShouldFail = shouldFail
  }
  
  init(payload: FakePayload, now: number): FakePolicyData {
    // 1 health per hour: alive for 50 hours, weak until 80 hours, then dead.
    // Sized in hours so that bisection (1-minute precision) is actually exercised.
    return { decayRate: 1 / 3_600_000 }
  }
  
  healthAt(item: Item<FakePayload, FakePolicyData>, now: number): number {
    const elapsed = now - item.lastEventAt
    const decay = item.policyData.decayRate * elapsed
    return item.health - decay
  }
  
  applyEvent(
    item: Item<FakePayload, FakePolicyData>, 
    event: FakeEvent, 
    now: number
  ): { health: number; policyData: FakePolicyData } {
    let newHealth = item.health
    
    if (event.type === "boost") {
      newHealth += event.amount
    } else if (event.type === "damage") {
      newHealth -= event.amount
    }
    
    return { health: newHealth, policyData: item.policyData }
  }
  
  nextDueAt(item: Item<FakePayload, FakePolicyData>, now: number): number | null {
    // Due when health would reach weak threshold
    const currentHealth = this.healthAt(item, now)
    if (currentHealth < this.thresholds.weak) {
      return now  // Already due
    }
    
    const timeUntilWeak = (currentHealth - this.thresholds.weak) / item.policyData.decayRate
    return now + timeUntilWeak
  }
  
  resurrect(
    item: Item<FakePayload, FakePolicyData>, 
    event: FakeEvent,
    now: number
  ): { ok: true } | { ok: false; reason: string } {
    if (this._resurrectShouldFail) {
      return { ok: false, reason: "Resurrection not available" }
    }
    return { ok: true }
  }
}
```

**Characteristics**:
- Linear decay: health decreases by `decayRate * elapsed_ms` (1 health per hour by default, so with thresholds 50/20 an untended item goes weak after 50 hours and dies after 80 hours)
- Events: "boost" adds health, "damage" subtracts health
- Due calculation: computes time until weak threshold
- Configurable resurrect: can be set to succeed or fail
- Never reads the clock
- healthAt never increases with time between events (policy invariant)
- All types (FakePayload, FakePolicyData, FakeEvent) are JSON-serializable

### Property 1: Health Bounds

For any item and any timestamp, the item's health after settling is between 0 and 100 inclusive.

**Validates: Requirements 18.1, 13**

**Generators**:
- `fc.commands()`: Generates sequences of engine operations (addItem, tend, tick) that build valid items
- `fc.integer({ min: baseTime, max: baseTime + 120 * HOUR_MS })`: Timestamps as baseTime plus bounded offsets

**Test**:
```typescript
// Feature: engine, Property 1: Health is always between 0 and 100 inclusive
fc.assert(fc.property(
  generators.commandSequence(),
  generators.timestamp(),
  (commands, now) => {
    const engine = new DecayEngine(fakePolicy, new InMemoryAdapter(), () => generateId())
    
    // Execute commands to build items
    for (const cmd of commands) {
      cmd.execute(engine)
    }
    
    // Settle all items and check health
    const items = engine.view(now)
    for (const item of items) {
      expect(item.health).toBeGreaterThanOrEqual(0)
      expect(item.health).toBeLessThanOrEqual(100)
    }
  }
), { numRuns: 100 })
```

### Property 2: State Matches Health

For any item and any timestamp, after settling the item's state always matches its health according to the three derivation rules.

**Validates: Requirements 18.2, 14**

**Generators**:
- `fc.commands()`: Generates sequences of engine operations that build valid items
- `fc.integer({ min: baseTime, max: baseTime + 120 * HOUR_MS })`: Timestamps as baseTime plus bounded offsets

**Test**:
```typescript
// Feature: engine, Property 2: State always matches health and thresholds
fc.assert(fc.property(
  generators.commandSequence(),
  generators.timestamp(),
  (commands, now) => {
    const engine = new DecayEngine(fakePolicy, new InMemoryAdapter(), () => generateId())
    
    // Execute commands to build items
    for (const cmd of commands) {
      cmd.execute(engine)
    }
    
    // Check all items
    const items = engine.view(now)
    for (const item of items) {
      const expectedState = deriveState(item.health, fakePolicy.thresholds)
      expect(item.state).toBe(expectedState)
    }
  }
), { numRuns: 100 })
```

### Property 3: Dead Items Not in Due Queue

For any timestamp, a dead item is never returned by due(now).

**Validates: Requirements 18.3, 6**

**Generators**:
- `fc.commands()`: Generates sequences of engine operations that produce alive, weak, and dead items
- `fc.integer({ min: baseTime, max: baseTime + 120 * HOUR_MS })`: Timestamps sized so all states occur often
- Outcome spread is verified once, by the Generator Coverage Check below

**Test**:
```typescript
// Feature: engine, Property 3: Dead items never appear in due queue
fc.assert(fc.property(
  generators.commandSequence(),
  generators.timestamp(),
  (commands, now) => {
    const engine = new DecayEngine(fakePolicy, new InMemoryAdapter(), () => generateId())
    
    // Execute commands
    for (const cmd of commands) {
      cmd.execute(engine)
    }
    
    const dueItems = engine.due(now)
    
    // Assert property
    for (const item of dueItems) {
      expect(item.state).not.toBe("dead")
    }
  }
), { numRuns: 100 })
```

### Property 4: View Does Not Change Storage

For any timestamp, calling view(now) multiple times never changes stored data.

**Validates: Requirements 18.4, 4.6**

**Generators**:
- `fc.commands()`: Generates sequences of engine operations
- `fc.array(generators.timestamp())`: Multiple timestamps

**Test**:
```typescript
// Feature: engine, Property 4: View never changes stored data
fc.assert(fc.property(
  generators.commandSequence(),
  fc.array(generators.timestamp(), { minLength: 1, maxLength: 5 }),
  (commands, timestamps) => {
    const adapter = new InMemoryAdapter()
    const engine = new DecayEngine(fakePolicy, adapter, () => generateId())
    
    // Build items
    for (const cmd of commands) {
      cmd.execute(engine)
    }
    
    // Capture initial state
    const beforeSnapshot = adapter.load()
    
    // Call view multiple times
    for (const ts of timestamps) {
      engine.view(ts)
    }
    
    // Verify storage unchanged
    const afterSnapshot = adapter.load()
    expect(afterSnapshot).toEqual(beforeSnapshot)
  }
), { numRuns: 100 })
```

### Property 5: Tick Idempotence

For any timestamp at or after the latest generated operation, calling tick(now) twice with the same timestamp makes no changes the second time.

**Validates: Requirements 18.5, 5.5**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations with non-decreasing timestamps
- `generators.offset()`: A non-negative offset added to the latest command timestamp, so `now` is never earlier than any item's lastEventAt

**Test**:
```typescript
// Feature: engine, Property 5: Tick is idempotent for the same timestamp
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  (commands, offset) => {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    engine.tick(now)
    const count2 = engine.tick(now)
    
    expect(count2).toBe(0)  // No items changed on second tick
  }
), { numRuns: 100 })
```

### Property 6: Resurrect Yields Alive State

For any dead item, a successful resurrect always yields an item with state "alive" and health 100.

**Validates: Requirements 18.6, 8.5**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations that leave some items dead
- `generators.offset()`: Offset added to the latest command timestamp

**Test**:
```typescript
// Feature: engine, Property 6: Successful resurrect always yields alive with health 100
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  generators.event(),
  (commands, offset, event) => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(false)
    const { engine } = buildEngine(commands, { policy })
    const now = latestTimestamp(commands) + offset
    
    // Settle everything so the graveyard reflects `now`
    engine.tick(now)
    
    for (const item of engine.graveyard()) {
      engine.resurrect(item.id, event, now)
      
      const resurrected = engine.view(now).find(i => i.id === item.id)
      
      expect(resurrected.state).toBe("alive")
      expect(resurrected.health).toBe(100)
      expect(resurrected.diedAt).toBeUndefined()
    }
  }
), { numRuns: 100 })
```

### Property 7: History Time Order

For any item, history entries are always sorted by timestamp in ascending order.

**Validates: Requirements 18.7, 9.1**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations (addItem, tend, tick, edit)
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.boolean()`: Whether the resurrect attempts succeed or fail, so both "resurrected" and "resurrect-failed" entries are covered
- `generators.event()`: Events for tend and resurrect operations

**Test**:
```typescript
// Feature: engine, Property 7: History entries always in time order
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  fc.boolean(),
  generators.event(),
  (commands, offset, resurrectFails, event) => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(resurrectFails)
    const { engine } = buildEngine(commands, { policy })
    
    // No real clock: the latest time comes from the generated commands
    const now = latestTimestamp(commands) + offset
    
    // Add death and resurrect entries to the history
    engine.tick(now)
    for (const item of engine.graveyard()) {
      engine.resurrect(item.id, event, now)
    }
    
    for (const item of engine.view(now)) {
      const history = engine.history(item.id)
      
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp)
      }
    }
  }
), { numRuns: 100 })
```

### Property 8: Tend Never Succeeds on Dead Items

For any item whose health at now is below policy.thresholds.dead, tend throws an error with code ITEM_ALREADY_DEAD.

**Validates: Requirements 18.8, 3.3**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations that leave some items dead or about to die
- `generators.event()`: Random fake events
- `generators.offset()`: Offset added to the latest command timestamp. Because `now` is never earlier than lastEventAt, the error under test cannot be masked by TIME_WENT_BACKWARD

**Test**:
```typescript
// Feature: engine, Property 8: Tend never succeeds when settled item is dead
fc.assert(fc.property(
  generators.commandSequence(),
  generators.event(),
  generators.offset(),
  (commands, event, offset) => {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    // Items that are dead at `now`, including ones not yet settled in storage
    const deadIds = engine.view(now).filter(i => i.state === "dead").map(i => i.id)
    
    for (const id of deadIds) {
      let caught: unknown
      try {
        engine.tend(id, event, now)
      } catch (error) {
        caught = error
      }
      
      expect(caught).toBeInstanceOf(DecayEngineError)
      expect((caught as DecayEngineError).code).toBe("ITEM_ALREADY_DEAD")
    }
  }
), { numRuns: 100 })
```

### Property 9: Time Splitting Equivalence

For any item with no events between t1 and t2, calling tick(t1) then view(t2) produces the same health and state as calling view(t2) directly, except when rounding would place the two paths on opposite sides of a threshold.

**Validates: Requirements 18.9**

**Why the threshold exception**: The fake policy uses floating-point arithmetic (decay = rate × elapsed). When health is computed in one step (view(t2) directly) versus two steps (tick(t1) then view(t2)), rounding can put the two results on opposite sides of a threshold, producing different states even though the health values are within tolerance.

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations
- Two `generators.offset()` values: t1 is the latest command timestamp plus the first offset, and t2 is t1 plus the second, so latest <= t1 <= t2 always holds and tick never throws TIME_WENT_BACKWARD

**Test**:
```typescript
// Feature: engine, Property 9: Splitting time makes no difference (away from thresholds)
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  generators.offset(),
  (commands, offset1, offset2) => {
    const t1 = latestTimestamp(commands) + offset1
    const t2 = t1 + offset2
    
    // Build the starting state once and copy it for both paths
    const { adapter } = buildEngine(commands)
    const snapshot = adapter.load()
    
    // Path 1: tick(t1) then view(t2)
    const adapterA = new InMemoryAdapter()
    if (snapshot) adapterA.save(snapshot)
    const engineA = new DecayEngine(new FakePolicy(), adapterA, counterIds())
    engineA.tick(t1)
    const viewA = engineA.view(t2)
    
    // Path 2: view(t2) directly
    const adapterB = new InMemoryAdapter()
    if (snapshot) adapterB.save(snapshot)
    const engineB = new DecayEngine(new FakePolicy(), adapterB, counterIds())
    const viewB = engineB.view(t2)
    
    const tolerance = 0.0001
    const thresholds = new FakePolicy().thresholds
    const nearThreshold = (h: number) =>
      Math.abs(h - thresholds.weak) < tolerance ||
      Math.abs(h - thresholds.dead) < tolerance
    
    for (const itemA of viewA) {
      const itemB = viewB.find(i => i.id === itemA.id)
      
      // Skip the whole case if any item sits on a threshold edge
      fc.pre(!nearThreshold(itemA.health) && !nearThreshold(itemB.health))
      
      expect(Math.abs(itemA.health - itemB.health)).toBeLessThan(tolerance)
      expect(itemA.state).toBe(itemB.state)
    }
  }
), { numRuns: 100 })
```

### Property 10: Round-Trip Serialization

For any engine state built from valid operations, saving it as JSON text and loading it into a new engine produces the same items and the same history.

**Validates: Requirements 15.6, 15.7**

**What this must exercise**: the real path used by the local storage adapter. That is `serializeSnapshot`, then `JSON.stringify`, then `JSON.parse`, then `parseSnapshot` with its validation (run by the engine constructor). Saving and reloading through the in-memory adapter alone is not enough, because it only copies objects and never runs this code.

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations that build valid items with JSON-safe values
- `generators.offset()`: Offset added to the latest command timestamp

**Test**:
```typescript
// Feature: engine, Property 10: Serialization round-trip preserves data
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  (commands, offset) => {
    const { engine: original, adapter } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    // The snapshot the engine saved (produced by serializeSnapshot)
    const saved = adapter.load()
    fc.pre(saved !== null)
    
    // Through JSON text and back, as the local storage adapter does
    const reloaded = JSON.parse(JSON.stringify(saved))
    expect(reloaded).toEqual(saved)
    
    // A new engine built from the reloaded snapshot (runs parseSnapshot and validation)
    const adapter2 = new InMemoryAdapter()
    adapter2.save(reloaded)
    const restored = new DecayEngine(new FakePolicy(), adapter2, counterIds())
    
    // Same items and same history
    expect(restored.view(now)).toEqual(original.view(now))
    for (const item of original.view(now)) {
      expect(restored.history(item.id)).toEqual(original.history(item.id))
    }
  }
), { numRuns: 100 })
```

### Generator Coverage Check

A property test is only useful if its generated cases reach the outcomes it is meant to check. One separate test verifies this for the shared generators, so the individual properties do not need their own distribution code.

`fc.statistics` is not used inside properties. It is a standalone reporting function that takes a generator and a classifier and prints a summary; it does not take a condition and a label, and it asserts nothing.

**Test** (`tests/properties/generator-coverage.test.ts`):
```typescript
// Feature: engine, Generator coverage: alive, weak and dead outcomes all occur often
it("generated scenarios reach all three states", () => {
  const samples = fc.sample(
    fc.tuple(generators.commandSequence(), generators.offset()),
    { numRuns: 300, seed: 42 }
  )
  
  const counts = { alive: 0, weak: 0, dead: 0 }
  
  for (const [commands, offset] of samples) {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    for (const item of engine.view(now)) {
      counts[item.state]++
    }
  }
  
  const total = counts.alive + counts.weak + counts.dead
  expect(total).toBeGreaterThan(0)
  
  // Each state makes up at least 10% of all generated items
  expect(counts.alive / total).toBeGreaterThanOrEqual(0.1)
  expect(counts.weak / total).toBeGreaterThanOrEqual(0.1)
  expect(counts.dead / total).toBeGreaterThanOrEqual(0.1)
})
```

A fixed seed keeps this check stable between runs. If the generators are changed and one state drops below 10%, this test fails and the generator sizing is adjusted.

### Outcome Tests with Real Policies

Outcome tests check that the engine, driven by a real policy, produces hand-calculated results ("dies on day 34 if never reviewed").

**Where they live**: with each app's policy, in `apps/<app>/src/policy.test.ts`, not in `packages/engine`. Two rules force this. The engine must never import an app (engine-boundary steering), and the real decay rules are hand-written by the developer inside each app (authorship steering). Each app's policy test file also runs `checkPolicy` on that policy. The engine package itself tests against the fake policy only, plus one engine-level outcome test for Triage (see Testing Strategy).

**Reference rules** (from the "four questions" table in `docs/Decay Engine Home Wireframe.html`). All three use thresholds weak = 60, dead = 10. These are the rules the outcome tests check; the developer writes the actual policy code.

1. **Study Dungeon** (halves every half-life since the last review):
   `health = item.health × 0.5 ^ ((now − item.lastEventAt) / halfLife)`.
   `halfLife` is evolving state in policyData (right answer: back to 100 and the half-life doubles; wrong answer: drops to 45 and the half-life halves). The first half-life comes from the payload ("how well do you know it"). Because this decays from `item.health` and `item.lastEventAt`, it is safe when settle moves lastEventAt forward.
2. **Ghosted** (straight line, reaching 0 at three times the usual rhythm):
   `health = max(0, 100 × (1 − (now − policyData.lastContactAt) / (3 × rhythm)))`, with `rhythm` from `payload.rhythmDays`.
   It must decay from `lastContactAt`, never from `item.lastEventAt`: settle moves lastEventAt forward on every tick, so a formula based on it would jump back to 100 after each tick. A quick text (+40) is stored by moving `lastContactAt` forward to the time that gives the new health; a call or meet-up sets it to `now`.
3. **Expiry Reaper** (date-based with a warning window):
   100 while more than the warning window is left; `10 + 90 × (timeLeft / warningWindow)` inside the window; 0 on or after the date.
   `expiresAt` and `warningDays` are user settings in the payload (so `edit` can change them). Renewing stores a new end date in policyData (`renewedUntil`).

**Expected outcomes for an untended item created on day 0** (health in brackets). The day before each change is included on purpose: health exactly equal to a threshold still counts as the better state (`health >= weak` is alive, `health >= dead` is weak).

| App | Setup | Last alive day | First weak day | Last weak day | First dead day | Exact death time (bisection) |
|-----|-------|----------------|----------------|---------------|----------------|------------------------------|
| Study Dungeon | half-life 10 days | 7 (61.6) | 8 (57.4) | 33 (10.2) | 34 (9.5) | 10 × log2(10) ≈ 33.22 days |
| Ghosted | 30-day rhythm, last contact day 0 | 36 (exactly 60) | 37 (58.9) | 81 (exactly 10) | 82 (8.9) | just after 81 days |
| Expiry Reaper | expires day 40, 30-day window | 23 (61) | 24 (58) | 39 (13) | 40 (0) | exactly day 40 |

**Bisection checks**: after `tick` at day 90 on an untended item, `diedAt` (and the "died" entry) lies within 1 minute after the exact death time in the table, never before it. The alive→weak "state-changed" entry lies within 1 minute after the first moment health dropped below 60. Autopsy's `wentWeakAt` equals that entry's timestamp.

**Example** (`apps/ghosted/src/policy.test.ts`):

```typescript
it("30-day rhythm, no contact: weak after day 36, dark after day 81", () => {
  const engine = new DecayEngine(ghostedPolicy, new InMemoryAdapter(), counterIds())
  const id = engine.addItem({
    payload: { name: "Meera Joshi", rhythmDays: 30, lastContactAt: T0 },
    importance: 2,
    costMinutes: 15
  }, T0)

  expect(stateAt(engine, id, T0 + 36 * DAY_MS)).toBe("alive") // exactly 60
  expect(stateAt(engine, id, T0 + 37 * DAY_MS)).toBe("weak")
  expect(stateAt(engine, id, T0 + 81 * DAY_MS)).toBe("weak")  // exactly 10
  expect(stateAt(engine, id, T0 + 82 * DAY_MS)).toBe("dead")

  engine.tick(T0 + 90 * DAY_MS)
  const diedAt = engine.graveyard()[0].diedAt!
  expect(diedAt).toBeGreaterThan(T0 + 81 * DAY_MS)
  expect(diedAt).toBeLessThanOrEqual(T0 + 81 * DAY_MS + 60_000)
})
```

`stateAt` is a small test helper that returns the item's state from `engine.view(t)`.

### Property 12: Triage Only Picks Weak Items

For any budget and timestamp, triage never picks an item that is alive (health ≥ weak threshold) or dead (health < dead threshold) at that time.

**Validates: Requirements 18.12, 17b.10**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations that produce items across all states
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.integer({ min: 1, max: 1440 })`: Budget in minutes

**Test**:
```typescript
// Feature: engine, Property 12: Triage never picks alive or dead items
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  fc.integer({ min: 1, max: 1440 }),
  (commands, offset, budgetMinutes) => {
    const policy = new FakePolicy()
    const { engine } = buildEngine(commands, { policy })
    const now = latestTimestamp(commands) + offset
    
    const result = engine.triage(budgetMinutes, now)
    
    // candidate.item is the item as settled at `now`
    for (const candidate of result.picks) {
      const item = candidate.item
      expect(item.health).toBeGreaterThanOrEqual(policy.thresholds.dead)
      expect(item.health).toBeLessThan(policy.thresholds.weak)
    }
  }
), { numRuns: 100 })
```

### Property 13: Triage Respects Budget

For any budget and timestamp, the total costMinutes of all picked items never exceeds the budget.

**Validates: Requirements 18.13, 17b.6**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.integer({ min: 1, max: 1440 })`: Budget in minutes

**Test**:
```typescript
// Feature: engine, Property 13: Total costMinutes never exceeds budget
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  fc.integer({ min: 1, max: 1440 }),
  (commands, offset, budgetMinutes) => {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    const result = engine.triage(budgetMinutes, now)
    
    const totalCost = result.picks.reduce((sum, c) => sum + c.item.costMinutes, 0)
    expect(totalCost).toBeLessThanOrEqual(budgetMinutes)
  }
), { numRuns: 100 })
```

### Property 14: Triage Optimality for Small Cases

For candidate sets of 10 or fewer items, triage's total value equals the brute-force optimal total value within tolerance.

**Validates: Requirements 18.14, 17b.6**

**Generators**:
- `generators.smallCommandSequence()`: Operations that produce at most 10 weak items
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.integer({ min: 1, max: 1440 })`: Budget in minutes

**Test**:
```typescript
// Feature: engine, Property 14: Triage optimal for small cases
fc.assert(fc.property(
  generators.smallCommandSequence(),
  generators.offset(),
  fc.integer({ min: 1, max: 1440 }),
  (commands, offset, budgetMinutes) => {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    const result = engine.triage(budgetMinutes, now)
    
    // Only check when we have 10 or fewer weak items
    const weakCount = [...result.picks, ...result.others].length
    fc.pre(weakCount <= 10)
    
    const triageValue = result.picks.reduce((sum, c) => sum + c.value, 0)
    const bruteForceValue = computeBruteForceOptimal([...result.picks, ...result.others], budgetMinutes)
    
    expect(Math.abs(triageValue - bruteForceValue)).toBeLessThan(1e-9)
  }
), { numRuns: 100 })
```

### Property 15: DiedAt Lies Between Events

For any item that dies, the recorded diedAt timestamp lies between the item's previous lastEventAt and the `now` at which death was detected.

**Validates: Requirements 18.15, 17a.6**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations
- `generators.offset()`: Offset added to the latest command timestamp

**Test**:
```typescript
// Feature: engine, Property 15: diedAt lies between previous lastEventAt and detection time
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  (commands, offset) => {
    const { engine, adapter } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    // Stored state before the tick (read from storage, not from view,
    // because view would already show the settled death)
    const before = new Map(
      (adapter.load()?.items ?? []).map(i => [i.id, i])
    )
    
    engine.tick(now)
    
    for (const item of engine.graveyard()) {
      const stored = before.get(item.id)!
      // Only items that died in THIS tick. Items that were already dead
      // have a stored lastEventAt that is later than their diedAt.
      if (stored.state === "dead") continue
      
      expect(item.diedAt).toBeGreaterThanOrEqual(stored.lastEventAt)
      expect(item.diedAt).toBeLessThanOrEqual(now)
    }
  }
), { numRuns: 100 })
```

### Property 16: Read-Only Operations Never Change Storage

For any sequence of autopsy, triage, and forecast calls, stored data remains unchanged.

**Validates: Requirements 18.16, 17b.1, 17c.1, 17d.1**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.array(fc.integer({ min: 1, max: 1440 }))`: Multiple budgets for triage
- `fc.array(fc.integer({ min: 1000, max: 100000000 }))`: Multiple horizons for forecast

**Test**:
```typescript
// Feature: engine, Property 16: autopsy, triage, forecast never change storage
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  fc.array(fc.integer({ min: 1, max: 1440 }), { maxLength: 5 }),
  fc.array(fc.integer({ min: 1000, max: 100000000 }), { maxLength: 5 }),
  (commands, offset, budgets, horizons) => {
    const adapter = new InMemoryAdapter()
    const { engine } = buildEngine(commands, { adapter })
    const now = latestTimestamp(commands) + offset
    
    // Capture initial state
    const beforeSnapshot = adapter.load()
    
    // Call read-only operations
    for (const budget of budgets) {
      engine.triage(budget, now)
    }
    for (const horizon of horizons) {
      engine.forecast(now, horizon)
    }
    for (const item of engine.graveyard()) {
      try {
        engine.autopsy(item.id, now)
      } catch {
        // Item might not be dead at `now`
      }
    }
    
    // Verify storage unchanged
    const afterSnapshot = adapter.load()
    expect(afterSnapshot).toEqual(beforeSnapshot)
  }
), { numRuns: 100 })
```

### Property 17: Forecast Consistency with View

For any item forecast to die at time T, calling view(T) shows that item as dead.

**Validates: Requirements 18.17, 17d.7**

**Generators**:
- `generators.commandSequence()`: Synchronous engine operations
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.integer({ min: 1000, max: 100000000 })`: Horizon in milliseconds

**Test**:
```typescript
// Feature: engine, Property 17: forecast consistency with view
fc.assert(fc.property(
  generators.commandSequence(),
  generators.offset(),
  fc.integer({ min: 1000, max: 100000000 }),
  (commands, offset, horizonMs) => {
    const { engine } = buildEngine(commands)
    const now = latestTimestamp(commands) + offset
    
    const forecast = engine.forecast(now, horizonMs)
    
    for (const entry of forecast) {
      const viewAtDeath = engine.view(entry.diesAt)
      const item = viewAtDeath.find(i => i.id === entry.item.id)
      
      expect(item).toBeDefined()
      expect(item.state).toBe("dead")
    }
  }
), { numRuns: 100 })
```

## Error Handling

### Error Codes

The engine uses a single `DecayEngineError` class with the following codes:

| Code | Thrown When |
|------|-------------|
| `MISSING_POLICY` | Engine constructed without a policy |
| `MISSING_STORAGE_ADAPTER` | Engine constructed without a storage adapter |
| `MISSING_ID_GENERATOR` | Engine constructed without an ID generator |
| `INVALID_THRESHOLDS` | Policy thresholds violate constraints |
| `INVALID_TIMESTAMP` | Timestamp is negative, NaN, Infinity, or out of range |
| `INVALID_HEALTH` | Policy returns non-numeric or non-finite health |
| `INVALID_ID` | ID generator returns empty string or non-string |
| `DUPLICATE_ID` | ID generator returns an ID that already exists |
| `ITEM_NOT_FOUND` | Operation references unknown item ID |
| `ITEM_ALREADY_DEAD` | tend called on item that is dead after settling |
| `ITEM_NOT_DEAD` | resurrect called on item that is not dead after settling |
| `TIME_WENT_BACKWARD` | Operation called with now < item.lastEventAt |
| `UNSUPPORTED_SCHEMA_VERSION` | Snapshot has unknown schemaVersion |
| `INVALID_SNAPSHOT` | Snapshot structure is invalid |
| `INVALID_ITEM_DATA` | Item deserialization finds invalid field values |
| `INVALID_BUDGET` | budgetMinutes not integer 1-1440 |
| `INVALID_HORIZON` | horizonMs not positive |
| `AUTOPSY_REQUIRES_DEAD_ITEM` | autopsy called on item not dead at `now` |
| `INVALID_IMPORTANCE` | importance not integer 1-3 |
| `INVALID_COST_MINUTES` | costMinutes not positive integer or > 600 |
| `EDIT_REQUIRES_FIELD` | edit called with no fields provided |

### Error Messages

Error messages follow these conventions:
- Include operation name: "addItem failed: ..."
- Include item ID when relevant: "Item abc123 not found"
- Include both timestamps when time goes backward: "Time went backward: now=1000 < lastEventAt=2000 for item abc123"
- Include policy function name and return value: "policy.healthAt returned non-numeric value: undefined"

### Error Propagation

- **Policy errors**: Propagated to caller without catching
- **Storage errors**: Propagated to caller without catching
- **Validation errors**: Wrapped in `DecayEngineError` with appropriate code
- **State unchanged on error**: If an operation throws, storage and memory remain in pre-operation state

## Testing Strategy

### Unit Tests

**Coverage**:
- Every public method of `DecayEngine`
- Every function in `state-derivation.ts`, `settle.ts`, `serialization.ts`
- Both storage adapter implementations
- Error class and all error codes

**Test organization**:
- `tests/unit/engine.test.ts`: Engine methods
- `tests/unit/settle.test.ts`: Settle function
- `tests/unit/state-derivation.test.ts`: State derivation and validation
- `tests/unit/bisection.test.ts`: Binary search algorithms
- `tests/unit/triage.test.ts`: Knapsack algorithm and candidate selection
- `tests/unit/autopsy.test.ts`: Cause-of-death analysis
- `tests/unit/forecast.test.ts`: Death prediction
- `tests/unit/check-policy.test.ts`: Policy validation function
- `tests/unit/serialization.test.ts`: Parse and validate
- `tests/unit/storage/memory.test.ts`: In-memory adapter
- `tests/unit/storage/local-storage.test.ts`: localStorage adapter (with mocked localStorage)
- `tests/unit/errors.test.ts`: Error class

**Example-based tests**:
- Specific scenarios: adding first item, tending alive item, resurrecting dead item
- Edge cases: empty string from ID generator, health exactly at threshold, multiple items dying in same tick
- Error conditions: unknown item, time backward, dead item tend
- Boundary values: health 0, 100, exactly at weak/dead thresholds

### Property-Based Tests

**Tool**: fast-check

**Configuration**:
- Minimum 100 iterations per property (via `{ numRuns: 100 }`)
- Each property references its design property in a comment tag
- Tag format: `// Feature: engine, Property N: <statement>`

**Generators and helpers** (`tests/generators.ts`):
- `commandSequence()`: Generates sequences of synchronous engine operations (addItem with random importance 1-3 and costMinutes 1-60, tend, tick, edit) that build valid items. Timestamps within a sequence never decrease and advance in whole minutes, with gaps of up to several hours, so that bisection is exercised. resurrect is not part of the sequence; Properties 6 and 7 call it explicitly after a tick
- `smallCommandSequence()`: Like `commandSequence()` but adds at most 10 items (used by Property 14)
- Command execution ignores one expected error, ITEM_ALREADY_DEAD (a generated tend can target an item that has already died). Every other error propagates and fails the test
- `offset()`: A non-negative bounded integer. Tests compute `now` as `latestTimestamp(commands) + offset`, so `now` is never earlier than any item's lastEventAt and no property can fail with TIME_WENT_BACKWARD by accident
- `offset()` and `timestamp()` are measured in whole minutes, up to about 120 hours, matching the fake policy's 1-health-per-hour decay (`HOUR_MS = 3_600_000`)
- `timestamp()`: Valid timestamps as baseTime plus bounded offsets. Used only for view and due, which accept any time
- `event()`: Fake events (boost or damage with random amounts, JSON-safe values)
- `latestTimestamp(commands)`: The largest timestamp in a sequence, or baseTime for an empty sequence
- `buildEngine(commands, options?)`: Creates an engine with a fake policy (or the one passed in), an in-memory adapter and a counter-based ID generator, runs the commands, and returns `{ engine, adapter }`
- `counterIds()`: A deterministic `() => string` ID generator
- Offsets and the fake decay rate are sized so that alive, weak and dead outcomes all occur often. The Generator Coverage Check enforces this
- Items are built by executing real engine operations, not by generating random field values
- All generated numbers are JSON-safe: no NaN, no Infinity, no negative zero
- Generated items always satisfy invariants: state matches health and thresholds, dead items have diedAt and health 0, createdAt ≤ lastEventAt

**Test organization**:
- `tests/properties/health-and-state.test.ts`: Properties 1, 2
- `tests/properties/due-queue.test.ts`: Property 3
- `tests/properties/view.test.ts`: Property 4
- `tests/properties/tick.test.ts`: Properties 5, 9
- `tests/properties/resurrect.test.ts`: Property 6
- `tests/properties/history.test.ts`: Property 7
- `tests/properties/tend.test.ts`: Property 8
- `tests/properties/serialization.test.ts`: Property 10
- `tests/properties/triage.test.ts`: Properties 12, 13, 14
- `tests/properties/timing.test.ts`: Property 15
- `tests/properties/read-only.test.ts`: Property 16
- `tests/properties/forecast.test.ts`: Property 17
- `tests/properties/generator-coverage.test.ts`: Generator Coverage Check

**Distribution checks**:
- One dedicated test, the Generator Coverage Check, samples the shared generators with a fixed seed and asserts that alive, weak and dead items each make up at least 10% of generated items
- Individual properties contain no distribution code, and `fc.statistics` is not called inside any property

**Async properties**:
- Removed: resurrect is now synchronous
- All properties use `fc.property` (synchronous)

### Outcome Tests

**Real-policy outcome tests** live in each app, not in the engine package (see "Outcome Tests with Real Policies" above):
- `apps/study-dungeon/src/policy.test.ts`
- `apps/ghosted/src/policy.test.ts`
- `apps/expiry-reaper/src/policy.test.ts`

They are written when each app's policy is written, use the expected-outcomes table above, check bisection accuracy, and run `checkPolicy` on the policy.

**Engine-level Triage outcome test** (`tests/unit/triage.test.ts`): a worked example with the fake policy. Four weak items with known health, importance and costMinutes, and a 20-minute budget; the test asserts exactly which items are picked, their order, and the minutes used. The expected answer is worked out by hand in a comment in the test.

### Integration Tests

Not applicable: the engine has no external dependencies. Unit, property, and outcome tests provide complete coverage.

### Test Execution

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run property tests only
pnpm test:properties

# Run with coverage
pnpm test:coverage
```

## Engine API

### Constructor

```typescript
class DecayEngine<Payload, PolicyData, Event> {
  constructor(
    policy: DecayPolicy<Payload, PolicyData, Event>,
    adapter: StorageAdapter,
    idGenerator: () => string
  )
}
```

**Behavior**:
- Validates policy thresholds
- Throws if policy, adapter, or idGenerator is null/undefined
- Loads snapshot from adapter
- Throws if schemaVersion is unsupported
- Initializes empty state if no snapshot exists

**Throws**:
- `DecayEngineError` with code `"MISSING_POLICY"` if policy is null/undefined
- `DecayEngineError` with code `"MISSING_STORAGE_ADAPTER"` if adapter is null/undefined
- `DecayEngineError` with code `"MISSING_ID_GENERATOR"` if idGenerator is null/undefined
- `DecayEngineError` with code `"INVALID_THRESHOLDS"` if thresholds violate constraints
- `DecayEngineError` with code `"UNSUPPORTED_SCHEMA_VERSION"` if snapshot version is unknown

### addItem

```typescript
addItem(params: { payload: Payload; importance: number; costMinutes: number }, now: number): string
```

**Behavior**:
- Generates unique ID using idGenerator
- Validates importance (must be integer 1-3) and costMinutes (must be positive integer ≤ 600)
- Creates provisional item with health 100, state "alive", lastEventAt = createdAt = now
- Calls `policy.init(payload, now)` to initialize policyData
- Calls `policy.healthAt(provisionalItem, now)` to compute starting health
- Derives state from starting health using state derivation rules
- If starting health < dead threshold: sets state to "dead", diedAt to createdAt (no bisection), health to 0
- Persists item to storage (synchronous)
- Records "created" history entry (and "died" entry if item starts dead)
- Returns item ID

**Returns**: Item ID (string)

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"INVALID_IMPORTANCE"` if importance is not an integer 1-3
- `DecayEngineError` with code `"INVALID_COST_MINUTES"` if costMinutes is not a positive integer or > 600
- `DecayEngineError` with code `"INVALID_ID"` if ID generator returns invalid value
- `DecayEngineError` with code `"DUPLICATE_ID"` if ID already exists
- Propagates errors from `policy.init`, `policy.healthAt`, or storage adapter

### tend

```typescript
tend(id: string, event: Event, now: number): void
```

**Behavior**:
- Settles item at `now` (computes current health and state)
- Throws if `now < item.lastEventAt`
- Throws if item is dead after settling
- Calls `policy.applyEvent(item, event, now)`
- Updates health and policyData from policy result
- Clamps health to [0, 100]
- Uses `applyHealth` to derive new state and generate history
- Records death if health drops below dead threshold
- Persists changes to storage (synchronous)
- Records "tended" and any transition history entries

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- `DecayEngineError` with code `"TIME_WENT_BACKWARD"` if now < item.lastEventAt
- `DecayEngineError` with code `"ITEM_ALREADY_DEAD"` if item is dead after settling
- `DecayEngineError` with code `"INVALID_HEALTH"` if policy returns non-numeric health
- Propagates errors from `policy.applyEvent` or storage adapter

### view

```typescript
view(now: number): Item<Payload, PolicyData>[]
```

**Behavior**:
- For each item, computes health and state at `now` via settle
- If `now < item.lastEventAt`, returns item as stored (no error)
- Returns array of item copies (never references to stored items)
- Does not modify storage
- Does not update lastEventAt

**Returns**: Array of items as they would appear at `now`

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid

### tick

```typescript
tick(now: number): number
```

**Behavior**:
- For each item, settles at `now`
- Throws if `now < item.lastEventAt` for any item
- Identifies items where health or state changed
- Updates lastEventAt to `now` for changed items
- Persists changed items to storage (synchronous)
- Records state transition history entries
- Returns count of modified items

**Returns**: Number of items that changed

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"TIME_WENT_BACKWARD"` if now < any item.lastEventAt
- Propagates errors from storage adapter

### due

```typescript
due(now: number): Item<Payload, PolicyData>[]
```

**Behavior**:
- For each non-dead item, computes health at `now`
- If `now < item.lastEventAt`, uses stored health (no error)
- Calls `policy.nextDueAt(item, now)`
- Includes item if nextDueAt ≤ now and health ≥ dead threshold
- Sorts by health ascending, then by ID ascending
- Returns copies, never stored references
- Does not modify storage

**Returns**: Array of due items sorted by urgency

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid

### graveyard

```typescript
graveyard(): Item<Payload, PolicyData>[]
```

**Behavior**:
- Returns all items where state is "dead"
- Sorts by diedAt descending, then by ID ascending
- Returns copies, never stored references
- Does not modify storage

**Returns**: Array of dead items sorted by death time (most recent first)

**Throws**: Never

### resurrect

```typescript
resurrect(id: string, event: Event, now: number): ResurrectOutcome
```

**Behavior**:
- Settles item at `now` (computes current health and state)
- Throws if `now < item.lastEventAt`
- Throws if item is not dead after settling
- Calls `policy.resurrect(item, event, now)` (synchronous)
- If success: sets health to 100, state to "alive", clears diedAt, increments timesResurrected, updates payload and policyData if provided, records "resurrected" history
- If failure: preserves item unchanged, records "resurrect-failed" history (with the event and reason)
- Persists changes to storage (synchronous)
- Returns `{ ok: true }` or `{ ok: false, reason }`, so the app can tell a won fight from a lost one

**Returns**: ResurrectOutcome

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- `DecayEngineError` with code `"TIME_WENT_BACKWARD"` if now < item.lastEventAt
- `DecayEngineError` with code `"ITEM_NOT_DEAD"` if item is not dead after settling
- Propagates errors from `policy.resurrect` or storage adapter

### history

```typescript
history(id: string): HistoryEntry[]
```

**Behavior**:
- Returns all history entries for item
- Sorted by timestamp ascending
- Returns copy of history array

**Returns**: Array of history entries

**Throws**:
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist

### remove

```typescript
remove(id: string): void
```

**Behavior**:
- Deletes item and all its history atomically
- Either both succeed or both fail (no partial state)
- Persists changes to storage (synchronous)

**Throws**:
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- Propagates errors from storage adapter

### edit

```typescript
edit(id: string, changes: { payload?: Payload; importance?: number; costMinutes?: number }, now: number): void
```

**Behavior**:
- Settles item at `now` (computes current health and state)
- Throws if `now < item.lastEventAt`
- Throws if no fields provided (all undefined)
- Validates importance (1-3 integer) and costMinutes (positive integer ≤ 600) if provided
- If settled item is dead:
  - Replaces only provided fields
  - Leaves health at 0, state as "dead", diedAt unchanged
  - Does NOT call policy.healthAt to recompute health
  - Sets lastEventAt to `now`
  - Records "edited" history with array of changed field names
- If settled item is not dead:
  - Replaces only provided fields
  - Calls `policy.healthAt(item, now)` to recompute health
  - Derives state from new health using state derivation rules
  - Uses bisection if health drops below dead threshold to determine diedAt
  - Sets lastEventAt to `now`
  - Records "edited" history (and "died" if death occurs)
- Persists changes to storage (synchronous)

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- `DecayEngineError` with code `"TIME_WENT_BACKWARD"` if now < item.lastEventAt
- `DecayEngineError` with code `"EDIT_REQUIRES_FIELD"` if all fields are undefined
- `DecayEngineError` with code `"INVALID_IMPORTANCE"` if importance provided but not integer 1-3
- `DecayEngineError` with code `"INVALID_COST_MINUTES"` if costMinutes provided but not positive integer ≤ 600
- Propagates errors from `policy.healthAt` or storage adapter

### triage

```typescript
triage(budgetMinutes: number, now: number): TriageResult<Payload, PolicyData>
```

**Behavior**:
- Read-only: does not modify stored items or history
- Validates budgetMinutes (must be integer 1-1440)
- Computes candidates: all items whose health at `now` is ≥ dead threshold AND < weak threshold (weak items)
- For each candidate:
  - Computes value = (100 - health) × (1 - health / 100) × importance
  - Computes valuePerMinute = value / costMinutes
  - Determines diesAt via bisection (searching forward from `now` up to MAX_FORECAST_HORIZON_MS), or null if doesn't die in horizon
- Selects subset of candidates using exact 0/1 knapsack algorithm over integer minutes
- Returns picks (sorted by valuePerMinute descending, ties by id ascending) and others (sorted by diesAt ascending with nulls last, ties by id ascending)

**Returns**: TriageResult with picks and others arrays

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"INVALID_BUDGET"` if budgetMinutes not integer 1-1440

### autopsy

```typescript
autopsy(id: string, now: number): AutopsyReport<Event>
```

**Behavior**:
- Read-only: settles item at `now` in memory without persisting
- Throws if item health at `now` is ≥ dead threshold (not dead)
- Returns fact-only report with no interpretations:
  - createdAt, diedAt (from item)
  - wentWeakAt: most recent alive→weak crossing before death in current life, or null
  - lifeStartedAt: createdAt if never resurrected, else most recent resurrection timestamp
  - lastTend: most recent "tended" entry in current life with timestamp and event, or null
  - silenceMs: milliseconds from lastTend.at (or lifeStartedAt if never tended) to diedAt
  - tends: all "tended" entries in current life with timestamps, events, and gapBeforeMs
  - timesResurrected (from item)
  - failedResurrections: count of "resurrect-failed" entries in full history

**Returns**: AutopsyReport

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- `DecayEngineError` with code `"AUTOPSY_REQUIRES_DEAD_ITEM"` if item not dead at `now`

### forecast

```typescript
forecast(now: number, horizonMs: number): ForecastEntry<Payload, PolicyData>[]
```

**Behavior**:
- Read-only: does not modify stored items or history
- Validates horizonMs (must be positive number)
- Computes health at `now` for all items using policy.healthAt
- For each non-dead item (health ≥ dead threshold):
  - Determines diesAt via bisection searching forward from `now` up to `now + horizonMs`
- Returns only items with diesAt not null and diesAt ≤ now + horizonMs
- Sorted by diesAt ascending (soonest first), ties by id ascending

**Returns**: Array of ForecastEntry objects

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"INVALID_HORIZON"` if horizonMs not positive

### checkPolicy

```typescript
function checkPolicy<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  samplePayloads: Payload[],
  sampleEvents: Event[],
  startTime: number
): { passed: boolean; failures: string[] }
```

**Behavior** (exported standalone function, not a method):
- Builds test items and timestamps deterministically from provided samples
- Does not use randomness or read system clock
- Verifies:
  1. policy.healthAt returns number 0-100 for all test cases
  2. policy.healthAt is pure (same inputs → same output)
  3. policy.healthAt never increases with time between events (for any item and t1 < t2 with no events: healthAt(item, t2) ≤ healthAt(item, t1))
  4. policy.init returns JSON-serializable data (round-trips through JSON)
- Returns report with passed flag and array of failure descriptions

**Returns**: Check report object

**Throws**: Never (reports failures in return value)

## Purity and Boundaries

### No Clock Reading

**Hard rule**: No file in `packages/engine` reads the system clock.

**Prohibited calls**:
- `Date.now()`
- `new Date()`
- `performance.now()`
- Any method that reads system time

**Enforcement**:
- All time-dependent functions accept `now` parameter
- Linter rule (if available) to detect clock reads
- Code review checks
- Property tests use fake policy with no clock access

### Browser API Boundary

**Hard rule**: Only `storage/local-storage.ts` imports browser APIs.

**Prohibited elsewhere**:
- `window`
- `localStorage`
- `sessionStorage`
- `document`
- Any DOM or browser-specific API

**Enforcement**:
- Import boundaries checked in code review
- Unit tests for localStorage adapter mock the browser API
- Engine and other modules have no browser imports

### No Runtime Dependencies

The engine has **zero runtime dependencies**. Only development dependencies:

```json
{
  "dependencies": {},
  "devDependencies": {
    "typescript": "current stable version",
    "vitest": "current stable version",
    "fast-check": "current stable version"
  }
}
```

**Note**: The current stable versions of TypeScript, Vitest, and fast-check are installed when the package is created. Do not pin old major versions.

**Rationale**:
- Keeps package small
- Reduces security surface
- Makes engine embeddable anywhere
- No version conflicts with consuming apps

## Design Interpretations and Clarifications

The following requirements needed interpretation during design:

### 1. Settle Before Tend (Requirement 3.1-3.3)

**Requirement**: "WHEN tend(id, event, now) is called, THE engine SHALL first settle the item at `now`... IF settling finds that the item has died, THEN THE engine SHALL save that death and its history entry to storage, and then throw an error."

**Interpretation**: Settle is called, and if it produces death history, that history is persisted before throwing the error. This means a tend call can partially succeed (settling changes are saved) but still throw (event is not applied). This design ensures no item can be tended while in a dead state, even if it just died.

### 2. Settle Before Resurrect (Requirement 8.1-8.3)

**Requirement**: "WHEN I call resurrect(id, event, now), THE engine SHALL first settle the item at `now`... WHEN I call resurrect(id, event, now), THE engine SHALL check that the item's state is 'dead' after settling before calling policy.resurrect."

**Interpretation**: Similar to tend, resurrect must settle first. If settling produces history entries (e.g., state-changed from alive to dead), those are persisted along with the resurrection result. This ensures we always check the most current state.

### 3. View and Due Do Not Persist Settle Results (Requirement 4, 6)

**Requirement**: "WHEN computing the view of an item... return a view object... without modifying lastEventAt, diedAt, or any stored fields" and "WHEN I call due(now)... compute the health of each non-dead item at `now`... without persisting any changes."

**Interpretation**: View and due call settle to compute health and state, but discard the history entries and do not save the settled item. The settle function is pure, so it can be used for read-only operations.

### 4. Health and LastEventAt Coupling (Requirement 14.8-14.9)

**Requirement**: "THE stored health SHALL always represent the health as of lastEventAt" and "WHENEVER the engine stores a new health value... THE engine SHALL also set lastEventAt to `now`."

**Interpretation**: These requirements are enforced in the settle function. If health or state changes, settle sets lastEventAt to `now`. If neither changes, lastEventAt is not modified. This creates an invariant: `stored_health == policy.healthAt(item, item.lastEventAt)`.

### 5. Tick Modifications (Requirement 5.1-5.2)

**Requirement**: "for each item where health has changed OR state has changed, THE engine SHALL set lastEventAt to `now`, persist that item to storage... IF tick finds an item's health and state unchanged at `now`, THEN THE engine SHALL NOT modify that item's lastEventAt or persist that item."

**Interpretation**: Tick only persists items where settle changed something. This is an optimization to avoid rewriting unchanged items. The settle function naturally handles this by returning the item unchanged if health and state are the same.

### 6. Synchronous Resurrect (Requirement 8)

**Requirement**: policy.resurrect is synchronous and receives the event.

**Interpretation**: With no backend, nothing in a resurrection needs to wait, so the earlier resurrection lock and the RESURRECTION_IN_PROGRESS error are gone. The event (for example, the answer in Study Dungeon) is passed to the policy, recorded in the history entry, and the engine returns the outcome to the caller.

### 7. Atomic Remove (Requirement 10.1)

**Requirement**: "THE engine SHALL delete the item and all its history entries atomically such that either both succeed or both fail with no partial state persisted."

**Interpretation**: The `_persist` method is used, which builds a new snapshot with the item and its history removed, saves it, and only then updates memory. If save fails, neither storage nor memory are modified.

### 8. History Entry Order for Same Timestamp (Requirement 9.9)

**Requirement**: "WHEN multiple history entries have identical timestamps, THE engine SHALL preserve the order in which the events were recorded."

**Interpretation**: History is stored as an array. When multiple entries are added in a single operation (e.g., settle produces state-changed, then tend adds tended), they are appended in that order. JavaScript arrays preserve insertion order.

### 9. Serialization Round-Trip (Requirement 15.6-15.7)

**Requirement**: "WHEN an item is serialized and then deserialized, THEN the resulting item SHALL be deeply equal to the original... THE parser SHALL satisfy the round-trip property for all items with valid field values and types."

**Interpretation**: This is Property 10 in the property-based tests. Deep equality means all fields have identical values and types. The serialization format is JSON, which handles all item field types (string, number, boolean, undefined).

### 10. Time Splitting Equivalence Tolerance (Requirement 18.9)

**Requirement**: "calling tick(t1) then view(t2) produces the same health as calling view(t2) directly... within floating-point tolerance."

**Interpretation**: The fake policy uses floating-point arithmetic (decay = rate * elapsed). JavaScript floating-point operations have rounding error. Tests use a tolerance of 0.0001 for health comparisons. In practice, the engine stores health as-is without additional rounding.
