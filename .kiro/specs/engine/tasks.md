# Implementation Plan: Decay Engine

## Overview

This plan implements a pure TypeScript lifecycle management library that tracks items through alive, weak, and dead states. The implementation follows a policy-driven architecture where all app-specific logic lives in policies while the engine enforces lifecycle rules, manages state transitions, maintains queues, records history, and persists data through storage adapters.

The implementation builds incrementally: types and core pure functions first, then storage adapters, then the engine class with synchronous operations, and finally async resurrection. Testing tasks are required sub-tasks throughout: per the testing steering document, a change is not done until its tests pass.

## Tasks

- [ ] 1. Set up project structure and foundational types
  - Create the workspace root files if they do not exist: `pnpm-workspace.yaml` (covering `packages/*`, `apps/*` and `templates/*`) and a private root `package.json` with a `test` script that runs the tests of every package
  - Create `packages/engine/` directory structure
  - Set up `package.json` with TypeScript, Vitest, the Vitest coverage provider and fast-check as devDependencies (use current stable versions), and the scripts `test`, `test:unit`, `test:properties` and `test:coverage`
  - Create `tsconfig.json` with strict mode enabled
  - Create `vitest.config.ts` for test configuration
  - Create `src/types.ts` with all TypeScript types and interfaces: `Item<Payload, PolicyData>`, `DecayPolicy<Payload, PolicyData, Event>`, `HistoryEntry` discriminated union (6 types), `EngineState<Payload, PolicyData>`, `StoredSnapshot`, `StorageAdapter` interface, `IdGenerator` type
  - Create `src/index.ts` as the main export file
  - _Requirements: 1, 11, 12, 16_

- [ ] 2. Implement error handling
  - [ ] 2.1 Create error class with error codes
    - Create `src/errors.ts`
    - Implement `DecayEngineError` class extending `Error` with `code` property
    - Define `DecayEngineErrorCode` type with all 16 error codes listed in the design
    - Export error class and type from `src/index.ts`
    - _Requirements: 17_
  
  - [ ] 2.2 Write unit tests for error class
    - Create `tests/unit/errors.test.ts`
    - Test error message formatting, code property, instanceof checks
    - Test all error codes can be created
    - _Requirements: 17_

- [ ] 3. Implement state derivation functions
  - [ ] 3.1 Create pure state derivation functions
    - Create `src/state-derivation.ts`
    - Implement `deriveState(health, thresholds)` function
    - Implement `validateThresholds(thresholds)` function with all 4 validation rules
    - Implement `clampHealth(health)` function with validation
    - Implement `applyHealth(item, newHealth, now, thresholds)` function that returns updated item and history entries
    - Export only `deriveState` and `validateThresholds` from `src/index.ts`. `clampHealth` and `applyHealth` are internal
    - _Requirements: 13, 14_
  
  - [ ] 3.2 Write unit tests for state derivation
    - Create `tests/unit/state-derivation.test.ts`
    - Test `deriveState` with health at boundaries (weak threshold, dead threshold, above, below, exact values)
    - Test `validateThresholds` with valid and invalid threshold configurations
    - Test `clampHealth` with values below 0, above 100, at boundaries, NaN, Infinity
    - Test `applyHealth` for all state transitions (alive→weak, weak→dead, alive→dead, weak→alive)
    - Test death recording (diedAt set, health clamped to 0, "died" history entry)
    - _Requirements: 13, 14_

- [ ] 4. Implement settle function
  - [ ] 4.1 Create pure settle function
    - Create `src/settle.ts`
    - Implement `settle<Payload, PolicyData>(item, policy, now)` function
    - Handle already-dead items (return unchanged)
    - Handle `now < lastEventAt` (return unchanged for read operations)
    - Call `policy.healthAt(item, now)` to compute health
    - Use `clampHealth` to validate and clamp health
    - Use `applyHealth` to derive state and generate history
    - Return `SettleResult` with updated item and history entries
    - Do not export `settle` from `src/index.ts`. It is internal; tests import it from `src/settle.ts`
    - _Requirements: 3, 4, 5, 8, 14_
  
  - [ ] 4.2 Write unit tests for settle function
    - Create `tests/unit/settle.test.ts`
    - Use the fake policy from `tests/fake-policy.ts` (task 18.1, which runs before this task)
    - Test settle with dead items (returns unchanged)
    - Test settle with `now < lastEventAt` (returns unchanged)
    - Test settle with unchanged health (returns unchanged)
    - Test settle with health decrease (updates item and generates history)
    - Test settle with state transitions (generates correct history entries)
    - Test settle with item dying (sets diedAt, clamps health to 0)
    - _Requirements: 3, 4, 5, 8, 14_

- [ ] 5. Implement serialization and validation
  - [ ] 5.1 Create serialization module
    - Create `src/serialization.ts`
    - Implement `parseSnapshot<Payload, PolicyData>(data)` function
    - Implement `validateItem(item)` function with all field validations
    - Implement `serializeSnapshot(engineState)` function
    - Validate required fields, field types, health range, state values, timestamps, timesResurrected
    - Validate dead items have diedAt defined
    - Convert between `EngineState` (Maps) and `StoredSnapshot` (arrays)
    - Do not export these functions from `src/index.ts`. They are internal; tests import them from `src/serialization.ts`
    - _Requirements: 15_
  
  - [ ] 5.2 Write unit tests for serialization
    - Create `tests/unit/serialization.test.ts`
    - Test `validateItem` with valid items
    - Test `validateItem` with missing required fields
    - Test `validateItem` with invalid field types
    - Test `validateItem` with health out of range
    - Test `validateItem` with invalid state values
    - Test `validateItem` with dead items missing diedAt
    - Test `parseSnapshot` with valid snapshots
    - Test `parseSnapshot` with invalid snapshots
    - Test `serializeSnapshot` conversion from Maps to arrays
    - Test round-trip: serializeSnapshot → parseSnapshot produces same data
    - _Requirements: 15_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement storage adapters
  - [ ] 7.1 Create storage adapter interface file
    - Create `src/storage/interface.ts`
    - Define `StorageAdapter` interface with `load()` and `save(snapshot)` methods
    - Export interface from `src/index.ts`
    - _Requirements: 12_
  
  - [ ] 7.2 Implement in-memory storage adapter
    - Create `src/storage/memory.ts`
    - Implement `InMemoryAdapter` class with private storage variable
    - Implement `load()` method that returns deep copy of stored snapshot
    - Implement `save(snapshot)` method that stores deep copy of snapshot
    - Export class from `src/index.ts`
    - _Requirements: 12.7_
  
  - [ ] 7.3 Write unit tests for in-memory adapter
    - Create `tests/unit/storage/memory.test.ts`
    - Test load returns null when empty
    - Test save then load returns same data
    - Test load returns deep copy (modifications don't affect stored data)
    - Test save stores deep copy (modifications don't affect stored data)
    - Test multiple save operations (last save wins)
    - _Requirements: 12.7_
  
  - [ ] 7.4 Implement localStorage storage adapter
    - Create `src/storage/local-storage.ts`
    - Implement `LocalStorageAdapter` class with namespace parameter
    - Implement `load()` method that reads from localStorage, parses JSON, returns null if key doesn't exist
    - Implement `save(snapshot)` method that serializes to JSON and writes to localStorage
    - Use storage key format: `decay-engine:${namespace}`
    - This is the ONLY file that imports browser APIs
    - Export class from `src/index.ts`
    - _Requirements: 12.4, 12.7, 12.8_
  
  - [ ] 7.5 Write unit tests for localStorage adapter
    - Create `tests/unit/storage/local-storage.test.ts`
    - Mock localStorage API
    - Test load returns null when key doesn't exist
    - Test save then load returns same data
    - Test namespace is used in storage key
    - Test JSON serialization round-trip
    - Test error handling for storage failures
    - _Requirements: 12.4, 12.7, 12.8_

- [ ] 8. Implement DecayEngine class - constructor and helpers
  - [ ] 8.1 Create DecayEngine class with constructor
    - Create `src/engine.ts`
    - Implement `DecayEngine<Payload, PolicyData, Event>` class
    - Implement constructor that accepts policy, adapter, and idGenerator
    - Validate all three parameters are provided (throw errors for missing)
    - Validate policy thresholds using `validateThresholds`
    - Load snapshot from adapter via `load()`
    - Parse snapshot using `parseSnapshot` or initialize empty state
    - Throw error for unsupported schema versions
    - Store policy, adapter, idGenerator, and state as private fields
    - Initialize resurrection lock set as private field
    - Export class from `src/index.ts`
    - _Requirements: 1_
  
  - [ ] 8.2 Implement helper methods
    - Implement `_validateNow(now)` private method with timestamp validation
    - Implement `_getItem(id)` private method that throws ITEM_NOT_FOUND
    - Implement `_persist(changedItems, newHistoryEntries)` private method
    - In `_persist`: build new Maps, convert to StoredSnapshot via `serializeSnapshot`, save via adapter, update in-memory state only after successful save
    - _Requirements: 1, 11, 12_
  
  - [ ] 8.3 Write unit tests for constructor
    - Create `tests/unit/engine.test.ts`
    - Use the fake policy from `tests/fake-policy.ts` for this and all later engine unit tests. Do not define other ad hoc policies unless a test needs a policy that misbehaves (for example one returning NaN)
    - Test constructor with valid inputs creates engine
    - Test constructor throws MISSING_POLICY when policy is null/undefined
    - Test constructor throws MISSING_STORAGE_ADAPTER when adapter is null/undefined
    - Test constructor throws MISSING_ID_GENERATOR when idGenerator is null/undefined
    - Test constructor throws INVALID_THRESHOLDS for invalid threshold configurations
    - Test constructor loads existing snapshot from adapter
    - Test constructor starts with empty state when no snapshot exists
    - Test constructor throws UNSUPPORTED_SCHEMA_VERSION for unknown versions
    - _Requirements: 1_

- [ ] 9. Implement DecayEngine - addItem
  - [ ] 9.1 Implement addItem method
    - Implement `addItem(payload, now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - Generate ID using idGenerator, validate it's a non-empty string
    - Check for duplicate ID, throw DUPLICATE_ID if exists
    - Call `policy.init(payload, now)` to get policyData
    - Create item with health 100, state "alive", all timestamps set to now, timesResurrected 0
    - Create "created" history entry
    - Persist via `_persist`
    - Return item ID
    - _Requirements: 2, 16_
  
  - [ ] 9.2 Write unit tests for addItem
    - Test addItem creates item with correct initial values
    - Test addItem calls policy.init and stores returned policyData
    - Test addItem persists item to storage before returning
    - Test addItem records "created" history entry
    - Test addItem returns generated ID
    - Test addItem throws INVALID_TIMESTAMP for invalid now
    - Test addItem throws INVALID_ID for empty string ID
    - Test addItem throws DUPLICATE_ID when ID already exists
    - Test addItem propagates policy.init errors
    - Test addItem propagates storage errors without retaining item in memory
    - _Requirements: 2, 16_

- [ ] 10. Implement DecayEngine - view
  - [ ] 10.1 Implement view method
    - Implement `view(now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - For each item in state, call `settle(item, policy, now)`
    - Return array of settled items (copies, not references)
    - Do not call `_persist` (read-only operation)
    - _Requirements: 4_
  
  - [ ] 10.2 Write unit tests for view
    - Test view computes health at given timestamp
    - Test view derives state correctly (alive, weak, dead)
    - Test view does not modify storage (verify with adapter)
    - Test view does not modify lastEventAt
    - Test view called multiple times returns consistent results
    - Test view with `now < lastEventAt` returns item as stored
    - Test view throws INVALID_TIMESTAMP for invalid now
    - _Requirements: 4_

- [ ] 11. Implement DecayEngine - tick
  - [ ] 11.1 Implement tick method
    - Implement `tick(now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - For each item, call `settle(item, policy, now)`
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt` for any item
    - Collect items where health or state changed
    - Collect all history entries from settling
    - Persist changed items and history via `_persist`
    - Return count of changed items
    - _Requirements: 5_
  
  - [ ] 11.2 Write unit tests for tick
    - Test tick updates lastEventAt for changed items
    - Test tick does not update lastEventAt for unchanged items
    - Test tick persists changed items to storage
    - Test tick records "died" history for items that die
    - Test tick records "state-changed" history for alive↔weak transitions
    - Test tick returns count of modified items
    - Test tick with same timestamp twice returns 0 second time (idempotence)
    - Test tick throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test tick throws INVALID_TIMESTAMP for invalid now
    - Test tick error leaves storage unchanged
    - _Requirements: 5_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all tests pass for core read/write operations
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement DecayEngine - tend
  - [ ] 13.1 Implement tend method
    - Implement `tend(id, event, now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - Get item using `_getItem`
    - Call `settle(item, policy, now)` to compute current state
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt`
    - If settle generated history (item died), persist it before throwing
    - Throw ITEM_ALREADY_DEAD if settled item is dead
    - Call `policy.applyEvent(settledItem, event, now)` with the settled item, never the stored one, to get new health and policyData
    - Validate and clamp health using `clampHealth`
    - Use `applyHealth` on the settled item to derive state and generate history entries
    - Create "tended" history entry with event
    - Persist updated item and all history entries via `_persist`
    - _Requirements: 3_
  
  - [ ] 13.2 Write unit tests for tend
    - Test tend settles item first before applying event, and that policy.applyEvent receives the settled health, not the stored health
    - Test tend updates health and policyData from policy.applyEvent
    - Test tend updates lastEventAt to now
    - Test tend records "tended" history entry with event
    - Test tend detects state transitions and records history
    - Test tend detects death and records "died" history
    - Test tend throws ITEM_ALREADY_DEAD if item dies during settle
    - Test tend persists death from settle before throwing ITEM_ALREADY_DEAD
    - Test tend throws ITEM_ALREADY_DEAD if settled item is dead
    - Test tend throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test tend throws ITEM_NOT_FOUND for unknown item
    - Test tend throws INVALID_HEALTH for non-numeric health from policy
    - Test tend clamps health above 100 to 100
    - Test tend clamps health below 0 to 0
    - Test tend propagates policy.applyEvent errors
    - _Requirements: 3_

- [ ] 14. Implement DecayEngine - due and graveyard
  - [ ] 14.1 Implement due method
    - Implement `due(now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - For each non-dead item, call `settle(item, policy, now)` to compute health
    - Call `policy.nextDueAt(settledItem, now)` with the settled item for each item
    - Filter items where nextDueAt ≤ now and health ≥ policy.thresholds.dead
    - Exclude items where nextDueAt returns null
    - Sort by health ascending, then by ID ascending
    - Return copies, not references
    - Do not call `_persist` (read-only operation)
    - _Requirements: 6_
  
  - [ ] 14.2 Implement graveyard method
    - Implement `graveyard()` method in `src/engine.ts`
    - Filter items where state is "dead"
    - Sort by diedAt descending, then by ID ascending
    - Return copies, not references
    - _Requirements: 7_
  
  - [ ] 14.3 Write unit tests for due
    - Test due returns only items where nextDueAt ≤ now
    - Test due excludes items where nextDueAt returns null
    - Test due excludes dead items
    - Test due computes health at now without persisting
    - Test due sorts by health ascending, then ID ascending
    - Test due throws INVALID_TIMESTAMP for invalid now
    - Test due with `now < lastEventAt` uses stored health
    - _Requirements: 6_
  
  - [ ] 14.4 Write unit tests for graveyard
    - Test graveyard returns only dead items
    - Test graveyard returns empty array when no dead items
    - Test graveyard sorts by diedAt descending, then ID ascending
    - Test graveyard with identical diedAt values preserves deterministic order
    - Test graveyard requires no arguments
    - _Requirements: 7_

- [ ] 15. Implement DecayEngine - history and remove
  - [ ] 15.1 Implement history method
    - Implement `history(id)` method in `src/engine.ts`
    - Get item using `_getItem` (throws ITEM_NOT_FOUND)
    - Get history entries from state.history Map
    - Return copy of history array (already sorted by timestamp)
    - _Requirements: 9_
  
  - [ ] 15.2 Implement remove method
    - Implement `remove(id)` method in `src/engine.ts`
    - Get item using `_getItem` (throws ITEM_NOT_FOUND)
    - Check if resurrection is in progress, throw RESURRECTION_IN_PROGRESS if so
    - Build new state with item and its history removed
    - Persist via adapter (save entire snapshot atomically)
    - Update in-memory state only after successful save
    - _Requirements: 10_
  
  - [ ] 15.3 Write unit tests for history
    - Test history returns all entries for an item
    - Test history returns only "created" entry for untended items
    - Test history entries are sorted by timestamp ascending
    - Test history preserves order for identical timestamps
    - Test history throws ITEM_NOT_FOUND for unknown item
    - Test history returns copy (modifications don't affect stored history)
    - _Requirements: 9_
  
  - [ ] 15.4 Write unit tests for remove
    - Test remove deletes item and its history atomically
    - Test remove throws ITEM_NOT_FOUND for unknown item
    - Test remove throws RESURRECTION_IN_PROGRESS if resurrection pending
    - Test removed item cannot be accessed by other operations
    - Test remove error leaves storage unchanged
    - _Requirements: 10_

- [ ] 16. Implement DecayEngine - resurrect (async)
  - [ ] 16.1 Implement resurrect method
    - Implement `async resurrect(id, now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - Get item using `_getItem`
    - Call `settle(item, policy, now)`
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt`
    - Throw ITEM_NOT_DEAD if settled item is not dead
    - Check resurrection lock, throw RESURRECTION_IN_PROGRESS if locked
    - Add item ID to resurrection lock set
    - In try block: call `await policy.resurrect(settledItem, now)` with the settled item
    - Check if item still exists (throw ITEM_NOT_FOUND if removed during resurrection)
    - If result.ok is true: set health to 100, state to "alive", clear diedAt, increment timesResurrected, update payload/policyData if provided, record "resurrected" history
    - If result.ok is false: preserve item unchanged, record "resurrect-failed" history with reason
    - Persist changes (including any settle history) via `_persist`
    - In finally block: remove item ID from resurrection lock set
    - _Requirements: 8_
  
  - [ ] 16.2 Write unit tests for resurrect
    - Test resurrect settles item first
    - Test resurrect on successful policy.resurrect sets health to 100, state to "alive"
    - Test resurrect clears diedAt on success
    - Test resurrect increments timesResurrected on success
    - Test resurrect updates payload when provided by policy
    - Test resurrect updates policyData when provided by policy
    - Test resurrect records "resurrected" history on success
    - Test resurrect preserves item on policy failure
    - Test resurrect records "resurrect-failed" history with reason on failure
    - Test resurrect throws ITEM_NOT_DEAD if settled item is not dead
    - Test resurrect throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test resurrect throws ITEM_NOT_FOUND for unknown item
    - Test resurrect throws RESURRECTION_IN_PROGRESS for concurrent resurrect
    - Test resurrect throws ITEM_NOT_FOUND if item removed during resurrection
    - Test resurrect releases lock even when policy.resurrect throws
    - Test resurrect propagates policy.resurrect errors
    - _Requirements: 8_

- [ ] 17. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Create fake policy for testing
  - Run this task early, straight after task 3: the settle and engine unit tests depend on it (see the dependency graph)
  - [ ] 18.1 Implement fake policy
    - Create `tests/fake-policy.ts`
    - Define `FakePayload`, `FakePolicyData`, `FakeEvent` types (all JSON-serializable)
    - Implement `FakePolicy` class with time-based linear decay
    - Implement `init` method returning initial decay rate
    - Implement `healthAt` method: compute decay from lastEventAt to now
    - Implement `applyEvent` method: handle "boost" and "damage" events
    - Implement `nextDueAt` method: compute time until weak threshold
    - Implement `resurrect` method: configurable success/failure with `setResurrectFailure`
    - Thresholds: weak = 50, dead = 20
    - Never read the clock (use only the `now` parameter)
    - _Requirements: 18.10, 18.11_
  
  - [ ] 18.2 Write unit tests for fake policy
    - Test fake policy never reads the clock
    - Test healthAt computes linear decay correctly
    - Test applyEvent handles boost events
    - Test applyEvent handles damage events
    - Test nextDueAt computes correct due time
    - Test resurrect returns success when configured
    - Test resurrect returns failure when configured
    - _Requirements: 18.10, 18.11_

- [ ] 19. Create property-based test generators
  - [ ] 19.1 Implement test generators and helpers
    - Create `tests/generators.ts`
    - Implement `commandSequence()`: generates sequences of addItem, tend, tick commands with non-decreasing timestamps
    - Implement command execution that ignores ITEM_ALREADY_DEAD errors
    - Implement `offset()`: non-negative bounded integer generator
    - Implement `timestamp()`: valid timestamp generator (baseTime + offset)
    - Implement `event()`: fake event generator (boost/damage with JSON-safe values)
    - Implement `latestTimestamp(commands)`: returns max timestamp from sequence
    - Implement `buildEngine(commands, options?)`: creates engine, runs commands, returns engine and adapter
    - Implement `counterIds()`: deterministic ID generator
    - Size generators so alive, weak, and dead outcomes all occur often
    - Generate only JSON-safe numbers (no NaN, Infinity, negative zero)
    - _Requirements: 18_
  
  - [ ] 19.2 Write generator coverage check
    - Create `tests/properties/generator-coverage.test.ts`
    - Sample generators 300 times with fixed seed
    - Count alive, weak, and dead items
    - Assert each state makes up at least 10% of generated items
    - _Requirements: 18_

- [ ] 20. Implement property-based tests - health and state
  - [ ] 20.1 Write Property 1: Health bounds
    - Create `tests/properties/health-and-state.test.ts`
    - Implement property: for any command sequence and timestamp, all item health values are in [0, 100]
    - Generate command sequences and offsets
    - Build engine, execute commands, call view(now)
    - Assert all health values are >= 0 and <= 100
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 1: Health is always between 0 and 100 inclusive`
    - _Requirements: 18.1, 13_
  
  - [ ] 20.2 Write Property 2: State matches health
    - Implement property: for any command sequence and timestamp, all item states match health and thresholds
    - Generate command sequences and offsets
    - Build engine, execute commands, call view(now)
    - For each item, compute expected state using `deriveState`
    - Assert actual state matches expected state
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 2: State always matches health and thresholds`
    - _Requirements: 18.2, 14_

- [ ] 21. Implement property-based tests - due and view
  - [ ] 21.1 Write Property 3: Dead items not in due queue
    - Create `tests/properties/due-queue.test.ts`
    - Implement property: for any command sequence and timestamp, due(now) never returns dead items
    - Generate command sequences and offsets
    - Build engine, execute commands, call due(now)
    - Assert no returned item has state "dead"
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 3: Dead items never appear in due queue`
    - _Requirements: 18.3, 6_
  
  - [ ] 21.2 Write Property 4: View does not change storage
    - Create `tests/properties/view.test.ts`
    - Implement property: calling view multiple times never changes stored data
    - Generate command sequences and array of timestamps
    - Build engine with accessible adapter, execute commands
    - Capture snapshot before views
    - Call view multiple times with different timestamps
    - Capture snapshot after views
    - Assert snapshots are deeply equal
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 4: View never changes stored data`
    - _Requirements: 18.4, 4.6_

- [ ] 22. Implement property-based tests - tick
  - [ ] 22.1 Write Property 5: Tick idempotence
    - Create `tests/properties/tick.test.ts`
    - Implement property: calling tick(now) twice with same timestamp makes no changes second time
    - Generate command sequences and offset
    - Build engine, execute commands
    - Compute now = latestTimestamp + offset (so now >= all lastEventAt values)
    - Call tick(now) twice
    - Assert second tick returns 0 (no changes)
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 5: Tick is idempotent for the same timestamp`
    - _Requirements: 18.5, 5.5_
  
  - [ ] 22.2 Write Property 9: Time splitting equivalence
    - Implement property: tick(t1) then view(t2) produces same result as view(t2) directly
    - Generate command sequences and two offsets
    - Compute t1 = latestTimestamp + offset1, t2 = t1 + offset2
    - Build starting state once, copy for two paths
    - Path A: tick(t1) then view(t2)
    - Path B: view(t2) directly
    - For each item, check health within tolerance and state matches
    - Skip cases where any item is near a threshold (tolerance = 0.0001)
    - Use `fc.pre()` to skip threshold cases
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 9: Splitting time makes no difference (away from thresholds)`
    - _Requirements: 18.9_

- [ ] 23. Implement property-based tests - resurrect and history
  - [ ] 23.1 Write Property 6: Resurrect yields alive state
    - Create `tests/properties/resurrect.test.ts`
    - Implement async property: successful resurrect always yields alive with health 100
    - Generate command sequences and offset
    - Build engine with fake policy configured for success
    - Compute now, call tick(now) to settle all items
    - For each dead item in graveyard, call resurrect
    - Assert resurrected item has state "alive", health 100, diedAt undefined
    - Use `fc.asyncProperty` and `await fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 6: Successful resurrect always yields alive with health 100`
    - _Requirements: 18.6, 8.5_
  
  - [ ] 23.2 Write Property 7: History time order
    - Create `tests/properties/history.test.ts`
    - Implement async property: history entries are always sorted by timestamp ascending
    - Generate command sequences, offset, and boolean for resurrect success/failure
    - Build engine with fake policy configured per boolean
    - Execute commands, tick to settle, resurrect dead items
    - For each item, get history and assert timestamps are non-decreasing
    - Use `fc.asyncProperty` and `await fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 7: History entries always in time order`
    - _Requirements: 18.7, 9.1_

- [ ] 24. Implement property-based tests - tend and serialization
  - [ ] 24.1 Write Property 8: Tend never succeeds on dead items
    - Create `tests/properties/tend.test.ts`
    - Implement property: tend throws ITEM_ALREADY_DEAD when settled item is dead
    - Generate command sequences, event, and offset
    - Build engine, execute commands
    - Compute now, get dead items via view(now)
    - For each dead item, attempt tend and catch error
    - Assert error is DecayEngineError with code ITEM_ALREADY_DEAD
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 8: Tend never succeeds when settled item is dead`
    - _Requirements: 18.8, 3.3_
  
  - [ ] 24.2 Write Property 10: Round-trip serialization
    - Create `tests/properties/serialization.test.ts`
    - Implement property: saving as JSON and loading produces same state
    - Generate command sequences and offset
    - Build engine, execute commands
    - Get saved snapshot from adapter
    - Round-trip through JSON: JSON.stringify then JSON.parse
    - Build new engine from reloaded snapshot
    - Assert view(now) and history for all items are deeply equal
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 10: Serialization round-trip preserves data`
    - _Requirements: 15.6, 15.7_

  - [ ] 24.3 Write boundary tests for the engine-boundary steering rules
    - Create `tests/unit/boundary.test.ts`
    - Read every file under `src/` as text
    - Assert no file contains `Date.now`, `new Date` or `performance.now`
    - Assert no file other than `src/storage/local-storage.ts` references `localStorage`, `sessionStorage`, `window` or `document`
    - Assert no file imports from `apps/`, `packages/shell`, `react` or any package outside the engine
    - Assert `package.json` has no runtime `dependencies`
    - _Requirements: 1.9, 11.2, 12.4_

- [ ] 25. Final checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all tests pass (unit and property-based)
  - Run `pnpm test:coverage` to check coverage
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 26. Finalize package exports and documentation
  - [ ] 26.1 Finalize src/index.ts exports
    - Export `DecayEngine` class
    - Export `DecayEngineError` class and `DecayEngineErrorCode` type
    - Export `StorageAdapter` interface, `InMemoryAdapter`, `LocalStorageAdapter`
    - Export all type definitions from types.ts
    - Export public functions: `deriveState`, `validateThresholds`
    - Do not export internal functions (settle, serialize, etc.)
    - _Requirements: All_
  
  - [ ] 26.2 Add JSDoc comments to public API
    - Add JSDoc comments to `DecayEngine` class and all public methods
    - Add JSDoc comments to `DecayPolicy` interface and all methods
    - Add JSDoc comments to `Item` type and all fields
    - Add JSDoc comments to `StorageAdapter` interface
    - Add JSDoc comments to exported types
    - Include @param, @returns, @throws tags
    - _Requirements: All_
  
  - [ ] 26.3 Create package README
    - Create `packages/engine/README.md`
    - Include library overview and key features
    - Include installation instructions (once published)
    - Include quick start example with a simple policy
    - Include API reference links
    - Include link to main project documentation
    - _Requirements: All_

## Notes

- No task is optional. Every unit test and property-based test task must be completed; do not skip, weaken or delete a test to make a task pass. If a test fails, fix the code, or stop and report if the test itself looks wrong
- Each implementation task references specific requirements for traceability
- Property-based tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- The engine has zero runtime dependencies (only dev dependencies for TypeScript, Vitest, and fast-check)
- Only `src/storage/local-storage.ts` imports browser APIs
- The engine never reads the clock - all time comes from `now` parameters
- Checkpoints ensure incremental validation of core functionality

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "18.1"] },
    { "id": 2, "tasks": ["3.2", "4.1", "18.2"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["7.1", "7.2"] },
    { "id": 6, "tasks": ["7.3", "7.4"] },
    { "id": 7, "tasks": ["7.5", "8.1"] },
    { "id": 8, "tasks": ["8.2"] },
    { "id": 9, "tasks": ["8.3", "9.1"] },
    { "id": 10, "tasks": ["9.2", "10.1"] },
    { "id": 11, "tasks": ["10.2", "11.1"] },
    { "id": 12, "tasks": ["11.2", "13.1"] },
    { "id": 13, "tasks": ["13.2", "14.1", "14.2"] },
    { "id": 14, "tasks": ["14.3", "14.4", "15.1", "15.2"] },
    { "id": 15, "tasks": ["15.3", "15.4", "16.1"] },
    { "id": 16, "tasks": ["16.2"] },
    { "id": 17, "tasks": ["19.1"] },
    { "id": 18, "tasks": ["19.2", "20.1"] },
    { "id": 19, "tasks": ["20.2", "21.1"] },
    { "id": 20, "tasks": ["21.2", "22.1"] },
    { "id": 21, "tasks": ["22.2", "23.1"] },
    { "id": 22, "tasks": ["23.2", "24.1"] },
    { "id": 23, "tasks": ["24.2", "24.3"] },
    { "id": 24, "tasks": ["26.1"] },
    { "id": 25, "tasks": ["26.2", "26.3"] }
  ]
}
```
