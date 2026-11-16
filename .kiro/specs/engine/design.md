# Technical Design: Decay Engine

## Overview

The Decay Engine is a pure TypeScript lifecycle management library that tracks items through states of alive, weak, and dead. It is a zero-dependency runtime package with a policy-driven architecture: applications supply a `DecayPolicy` object that defines how items decay and can be resurrected, while the engine enforces lifecycle rules, manages state transitions, maintains queues, records history, and persists data through a storage adapter.

The engine knows nothing about what an item represents. All application-specific logic lives in the policy. This separation allows the same engine to power a link checker, a spaced-repetition study app, or an expiry tracker without modification.

**Key Design Principles:**
- **Time as an argument**: The engine never reads the clock. Every function that needs time accepts a `now` parameter (milliseconds since Unix epoch).
- **Pure settle logic**: One pure function computes an item's state at any time. No duplicated state calculation.
- **Synchronous persistence**: All operations except resurrect are synchronous. Every operation builds a new snapshot, saves it once, and only then updates memory. A failed save leaves storage and memory unchanged.
- **Policy purity**: The three core policy functions (`healthAt`, `applyEvent`, `nextDueAt`) are pure. Only `resurrect` is async and may have side effects.
- **JSON-serializable data**: Payload, PolicyData, and Event types must be JSON-serializable (no functions, symbols, undefined as values, NaN, Infinity, or negative zero).
- **No runtime dependencies**: The engine is pure TypeScript with no external runtime dependencies.

## Architecture

### Package Structure

```
packages/engine/
├── src/
│   ├── types.ts              # Item, DecayPolicy, storage interfaces, history types
│   ├── errors.ts             # Single DecayEngineError class with error codes
│   ├── state-derivation.ts   # Pure functions: deriveState, validateThresholds
│   ├── settle.ts             # Pure settle function used by all operations
│   ├── serialization.ts      # Parse and validate storage format
│   ├── storage/
│   │   ├── interface.ts      # StorageAdapter interface
│   │   ├── memory.ts         # In-memory adapter for testing
│   │   └── local-storage.ts  # Browser localStorage adapter (only file that touches browser APIs)
│   ├── engine.ts             # DecayEngine class implementation
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
- `HistoryEntry` discriminated union (6 types)

**errors.ts**: Single `DecayEngineError` class extending `Error` with a `code` property for programmatic error handling.

**state-derivation.ts**: Pure functions that compute state from health and thresholds:
- `deriveState(health, thresholds)`: Returns "alive", "weak", or "dead"
- `validateThresholds(thresholds)`: Validates threshold configuration
- `applyHealth(item, newHealth, now, thresholds)`: Takes an item, a new health value, a timestamp, and thresholds, and returns the updated item plus any state-changed or died history entries. Used by both settle and tend to ensure death and state-change logic exists in one place.

**settle.ts**: The core pure function that computes an item's health and state at a given time:
- `settle<Payload, PolicyData>(item, policy, now)`: Returns `{ item, historyEntries }`
- Used by tick, tend, resurrect, view, and due
- If `now` is earlier than `item.lastEventAt`, returns the item unchanged (view and due use this behavior; write operations throw TIME_WENT_BACKWARD)
- Otherwise, updates health via `policy.healthAt`, uses `applyHealth` to derive state and generate history, sets `lastEventAt` to `now` whenever health or state changes

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
- Public methods: addItem, tend, view, tick, due, graveyard, resurrect, history, remove
- Private methods: `_persist`, `_validateNow`, `_getItem`
- Resurrection lock tracking: `Set<string>` of item IDs currently being resurrected
- `addItem`, `tend`, `tick`, and `remove` are synchronous
- Only `resurrect` is async (because `policy.resurrect` is async)

**index.ts**: Exports the public API surface: `DecayEngine`, `DecayEngineError`, `StorageAdapter`, and all type definitions.

### Data Flow

**Read operations** (view, due, graveyard, history):
1. Load items from in-memory state (populated from storage at construction)
2. Compute derived values (health at time, due status)
3. Return copies, never references to stored items

**Write operations** (addItem, tend, tick, remove):
1. Validate inputs
2. Settle item(s) if needed (compute current state)
3. Apply changes to create new snapshot
4. Save snapshot via adapter (synchronous, throws on failure)
5. Update in-memory state only after successful save
6. Return result

**Async write operation** (resurrect):
1. Validate inputs and settle item
2. Acquire resurrection lock
3. Call `policy.resurrect` (async, may throw)
4. If item was removed during resurrection, throw ITEM_NOT_FOUND and persist nothing
5. Build new snapshot based on result
6. Save snapshot via adapter (synchronous, throws on failure)
7. Update in-memory state only after successful save
8. Release lock in finally block

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
  resurrect(item: Item<Payload, PolicyData>, now: number): Promise<
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
  >
}

// Event type must be JSON-serializable (constraint on app-defined Event)

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
    }
  | {
      type: "resurrect-failed"
      itemId: string
      timestamp: number
      health: number
      reason: string
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
  
  // Health changed: use applyHealth to compute new state and history
  const { item: updatedItem, historyEntries } = applyHealth(
    item,
    clampedHealth,
    now,
    policy.thresholds
  )
  
  return { item: updatedItem, historyEntries }
}
```

**Usage across engine operations:**

- **view(now)**: Calls settle for each item, returns the computed item, discards history
- **due(now)**: Calls settle for each non-dead item, uses computed health for filtering and sorting
- **tick(now)**: Calls settle for each item, saves items where health or state changed, records history
- **tend(id, event, now)**: Calls settle first to compute current state, throws if `now < lastEventAt`, throws if dead, then applies event
- **resurrect(id, now)**: Calls settle first, throws if `now < lastEventAt`, confirms item is dead before calling policy.resurrect

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

function applyHealth<Payload, PolicyData>(
  item: Item<Payload, PolicyData>,
  newHealth: number,
  now: number,
  thresholds: { weak: number; dead: number }
): { item: Item<Payload, PolicyData>; historyEntries: HistoryEntry[] } {
  // Derive new state from health
  const oldState = item.state
  const newState = deriveState(newHealth, thresholds)
  
  // Build updated item with new health, state, and lastEventAt
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
      // Item died: set diedAt, clamp health to 0, record "died"
      updatedItem.diedAt = now
      updatedItem.health = 0
      historyEntries.push({
        type: "died",
        itemId: item.id,
        timestamp: now,
        health: 0
      })
    } else {
      // State changed but not to dead: record "state-changed"
      historyEntries.push({
        type: "state-changed",
        itemId: item.id,
        timestamp: now,
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
- Used by both settle and tend to ensure death and state-change logic exists in one place
- When state transitions to "dead", sets health to 0 and records diedAt
- When state changes between alive/weak, records state-changed history

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
  | "RESURRECTION_IN_PROGRESS"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_SNAPSHOT"
  | "INVALID_ITEM_DATA"
```

**Error message requirements** (Requirement 17):
- Include operation name and what went wrong
- Include item ID when relevant
- Include both lastEventAt and provided now when time goes backward
- Include function name and return value when policy returns invalid value

### Resurrection Lock

The engine prevents concurrent resurrection of the same item using an in-memory Set:

```typescript
// Inside DecayEngine class

private _resurrectionsInProgress = new Set<string>()

async resurrect(id: string, now: number): Promise<void> {
  this._validateNow(now)
  
  // Get item and settle it
  const storedItem = this._getItem(id)
  const { item: settledItem, historyEntries: settleHistory } = settle(storedItem, this._policy, now)
  
  // Throw if time went backward
  if (now < storedItem.lastEventAt) {
    throw new DecayEngineError("TIME_WENT_BACKWARD", `Time went backward: now=${now} < lastEventAt=${storedItem.lastEventAt} for item ${id}`)
  }
  
  // Check that item is dead after settling
  if (settledItem.state !== "dead") {
    throw new DecayEngineError("ITEM_NOT_DEAD", `Item ${id} is ${settledItem.state}, not dead`)
  }
  
  // Check if resurrection already in progress
  if (this._resurrectionsInProgress.has(id)) {
    throw new DecayEngineError("RESURRECTION_IN_PROGRESS", `Resurrection already in progress for item ${id}`)
  }
  
  // Lock this item
  this._resurrectionsInProgress.add(id)
  
  try {
    // Call policy.resurrect (may throw)
    const result = await this._policy.resurrect(settledItem, now)
    
    // Check if item still exists (could have been removed during resurrection)
    if (!this._state.items.has(id)) {
      throw new DecayEngineError("ITEM_NOT_FOUND", `Item ${id} not found`)
    }
    
    if (result.ok) {
      // Success: update item and record history
      const resurrectedItem: Item<Payload, PolicyData> = {
        ...settledItem,
        health: 100,
        state: "alive",
        diedAt: undefined,
        timesResurrected: settledItem.timesResurrected + 1,
        lastEventAt: now,
        payload: result.payload ?? settledItem.payload,
        policyData: result.policyData ?? settledItem.policyData
      }
      
      const historyEntry: HistoryEntry = {
        type: "resurrected",
        itemId: id,
        timestamp: now,
        health: 100
      }
      
      // Persist: settle history + resurrection history
      this._persist([resurrectedItem], [...settleHistory, historyEntry])
    } else {
      // Failure: record failure, don't change item
      const historyEntry: HistoryEntry = {
        type: "resurrect-failed",
        itemId: id,
        timestamp: now,
        health: 0,
        reason: result.reason
      }
      
      // If settle changed the item, persist those changes
      if (settleHistory.length > 0) {
        this._persist([settledItem], [...settleHistory, historyEntry])
      } else {
        // Only persist the failure history
        this._persist([], [historyEntry])
      }
    }
  } finally {
    // Always release lock, even if policy.resurrect throws
    this._resurrectionsInProgress.delete(id)
  }
}
```

**Lock behavior**:
- Lock acquired before calling `policy.resurrect`
- Lock released in finally block (always runs)
- Concurrent resurrect attempts on same item throw `RESURRECTION_IN_PROGRESS`
- Lock is per-item, not global
- Lock is in-memory only (not persisted)
- If item is removed during resurrection, throw `ITEM_NOT_FOUND` and persist nothing

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
- lastEventAt ≤ diedAt (if diedAt is defined)
- createdAt ≤ lastEventAt

### History Structure

History is a time-ordered log of events per item:

```typescript
type HistoryEntry = 
  | { type: "created"; itemId: string; timestamp: number; health: number }
  | { type: "tended"; itemId: string; timestamp: number; health: number; event: unknown }
  | { type: "state-changed"; itemId: string; timestamp: number; health: number; from: "alive" | "weak" | "dead"; to: "alive" | "weak" | "dead" }
  | { type: "died"; itemId: string; timestamp: number; health: number }
  | { type: "resurrected"; itemId: string; timestamp: number; health: number }
  | { type: "resurrect-failed"; itemId: string; timestamp: number; health: number; reason: string }
```

**Common fields**:
- `type`: Discriminant for union
- `itemId`: Item this entry belongs to
- `timestamp`: When the event occurred (milliseconds since epoch)
- `health`: Item's health after the event

**Type-specific fields**:
- `tended`: includes `event` (app-defined)
- `state-changed`: includes `from` and `to` states
- `resurrect-failed`: includes `reason` string

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
type FakePolicyData = { decayRate: number }  // Health lost per millisecond
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
    return { decayRate: 0.01 }  // Loses 0.01 health per ms by default
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
  
  async resurrect(
    item: Item<FakePayload, FakePolicyData>, 
    now: number
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this._resurrectShouldFail) {
      return { ok: false, reason: "Resurrection not available" }
    }
    return { ok: true }
  }
}
```

**Characteristics**:
- Linear decay: health decreases by `decayRate * elapsed_ms`
- Events: "boost" adds health, "damage" subtracts health
- Due calculation: computes time until weak threshold
- Configurable resurrect: can be set to succeed or fail
- Never reads the clock
- All types (FakePayload, FakePolicyData, FakeEvent) are JSON-serializable

### Property 1: Health Bounds

For any item and any timestamp, the item's health after settling is between 0 and 100 inclusive.

**Validates: Requirements 18.1, 13**

**Generators**:
- `fc.commands()`: Generates sequences of engine operations (addItem, tend, tick) that build valid items
- `fc.integer({ min: baseTime, max: baseTime + 10000 })`: Timestamps as baseTime plus bounded offsets

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
- `fc.integer({ min: baseTime, max: baseTime + 10000 })`: Timestamps as baseTime plus bounded offsets

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
- `fc.integer({ min: baseTime, max: baseTime + 10000 })`: Timestamps sized so all states occur often
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

**Async note**: resurrect is asynchronous, so this property uses `fc.asyncProperty` and the assertion is awaited. A synchronous `fc.property` cannot wait for an async body, so its checks would not be evaluated correctly.

**Test**:
```typescript
// Feature: engine, Property 6: Successful resurrect always yields alive with health 100
await fc.assert(fc.asyncProperty(
  generators.commandSequence(),
  generators.offset(),
  async (commands, offset) => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(false)
    const { engine } = buildEngine(commands, { policy })
    const now = latestTimestamp(commands) + offset
    
    // Settle everything so the graveyard reflects `now`
    engine.tick(now)
    
    for (const item of engine.graveyard()) {
      await engine.resurrect(item.id, now)
      
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
- `generators.commandSequence()`: Synchronous engine operations (addItem, tend, tick)
- `generators.offset()`: Offset added to the latest command timestamp
- `fc.boolean()`: Whether the resurrect attempts succeed or fail, so both "resurrected" and "resurrect-failed" entries are covered

**Test**:
```typescript
// Feature: engine, Property 7: History entries always in time order
await fc.assert(fc.asyncProperty(
  generators.commandSequence(),
  generators.offset(),
  fc.boolean(),
  async (commands, offset, resurrectFails) => {
    const policy = new FakePolicy()
    policy.setResurrectFailure(resurrectFails)
    const { engine } = buildEngine(commands, { policy })
    
    // No real clock: the latest time comes from the generated commands
    const now = latestTimestamp(commands) + offset
    
    // Add death and resurrect entries to the history
    engine.tick(now)
    for (const item of engine.graveyard()) {
      await engine.resurrect(item.id, now)
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
| `RESURRECTION_IN_PROGRESS` | resurrect called while another resurrect is pending |
| `UNSUPPORTED_SCHEMA_VERSION` | Snapshot has unknown schemaVersion |
| `INVALID_SNAPSHOT` | Snapshot structure is invalid |
| `INVALID_ITEM_DATA` | Item deserialization finds invalid field values |

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
- `commandSequence()`: Generates sequences of synchronous engine operations (addItem, tend, tick) that build valid items. Timestamps within a sequence never decrease. resurrect is asynchronous and is not part of the sequence; Properties 6 and 7 call it explicitly
- Command execution ignores one expected error, ITEM_ALREADY_DEAD (a generated tend can target an item that has already died). Every other error propagates and fails the test
- `offset()`: A non-negative bounded integer. Tests compute `now` as `latestTimestamp(commands) + offset`, so `now` is never earlier than any item's lastEventAt and no property can fail with TIME_WENT_BACKWARD by accident
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
- `tests/properties/generator-coverage.test.ts`: Generator Coverage Check

**Distribution checks**:
- One dedicated test, the Generator Coverage Check, samples the shared generators with a fixed seed and asserts that alive, weak and dead items each make up at least 10% of generated items
- Individual properties contain no distribution code, and `fc.statistics` is not called inside any property

**Async properties**:
- Properties that call resurrect (6 and 7) use `fc.asyncProperty` and `await fc.assert(...)`
- All other properties are synchronous and use `fc.property`

### Integration Tests

Not applicable: the engine has no external dependencies. Unit and property tests provide complete coverage.

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
addItem(payload: Payload, now: number): string
```

**Behavior**:
- Generates unique ID using idGenerator
- Creates item with health 100, state "alive"
- Calls `policy.init(payload, now)` to initialize policyData
- Persists item to storage (synchronous)
- Records "created" history entry
- Returns item ID

**Returns**: Item ID (string)

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"INVALID_ID"` if ID generator returns invalid value
- `DecayEngineError` with code `"DUPLICATE_ID"` if ID already exists
- Propagates errors from `policy.init` or storage adapter

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
async resurrect(id: string, now: number): Promise<void>
```

**Behavior**:
- Settles item at `now`
- Throws if `now < item.lastEventAt`
- Throws if item is not dead after settling
- Throws if resurrection already in progress for this item
- Acquires resurrection lock for item
- Calls `policy.resurrect(item, now)` (async)
- Checks if item still exists (throws if removed during resurrection)
- If success: sets health to 100, state to "alive", clears diedAt, increments timesResurrected, updates payload and policyData if provided, records "resurrected" history
- If failure: preserves item unchanged, records "resurrect-failed" history
- Releases lock in finally block (always)
- Persists changes to storage (synchronous, after async policy call)

**Throws**:
- `DecayEngineError` with code `"INVALID_TIMESTAMP"` if now is invalid
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist (before or after policy call)
- `DecayEngineError` with code `"TIME_WENT_BACKWARD"` if now < item.lastEventAt
- `DecayEngineError` with code `"ITEM_NOT_DEAD"` if item is not dead after settling
- `DecayEngineError` with code `"RESURRECTION_IN_PROGRESS"` if resurrection already pending
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
- Throws if a resurrection is in progress for this item
- Deletes item and all its history atomically
- Either both succeed or both fail (no partial state)
- Persists changes to storage (synchronous)

**Throws**:
- `DecayEngineError` with code `"ITEM_NOT_FOUND"` if item doesn't exist
- `DecayEngineError` with code `"RESURRECTION_IN_PROGRESS"` if resurrection is pending for this item
- Propagates errors from storage adapter

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

**Requirement**: "WHEN I call resurrect(id, now), THE engine SHALL first settle the item at `now`... WHEN I call resurrect(id, now), THE engine SHALL check that the item's state is 'dead' after settling before calling policy.resurrect."

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

### 6. Resurrection Lock Lifetime (Requirement 8.4)

**Requirement**: "WHILE a resurrect call for an item is waiting on policy.resurrect to complete, IF a second resurrect call is made for the same item, THEN THE engine SHALL throw an error."

**Interpretation**: Lock is acquired before calling `policy.resurrect` and released in a finally block. This ensures the lock is released even if policy.resurrect throws. Lock is not persisted; it only prevents concurrent resurrections in a single engine instance.

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
