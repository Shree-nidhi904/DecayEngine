# Implementation Plan: Decay Engine

## Overview

This plan implements a pure TypeScript lifecycle management library that tracks items through alive, weak, and dead states. The implementation follows a policy-driven architecture where all app-specific logic lives in policies while the engine enforces lifecycle rules, manages state transitions, maintains queues, records history, and persists data through storage adapters.

The implementation builds incrementally: types and core pure functions first, then bisection for precise timing, then storage adapters, then the engine class with all synchronous operations, then triage/autopsy/forecast/checkPolicy features. Testing tasks are required sub-tasks throughout: per the testing steering document, a change is not done until its tests pass.

## Tasks

- [x] 1. Set up project structure and foundational types
  - Create the workspace root files if they do not exist: `pnpm-workspace.yaml` (covering `packages/*` and `apps/*`) and a private root `package.json` with a `test` script that runs the tests of every package
  - Create `packages/engine/` directory structure
  - Set up `package.json` with TypeScript, Vitest, the Vitest coverage provider and fast-check as devDependencies (use current stable versions), and the scripts `test`, `test:unit`, `test:properties` and `test:coverage`
  - Create `tsconfig.json` with strict mode enabled
  - Create `vitest.config.ts` for test configuration
  - Create `src/types.ts` with all TypeScript types and interfaces: `Item<Payload, PolicyData>` (including importance and costMinutes fields), `DecayPolicy<Payload, PolicyData, Event>`, `HistoryEntry` discriminated union (7 types: created, tended, state-changed, died, resurrected, resurrect-failed, edited), `EngineState<Payload, PolicyData>`, `StoredSnapshot`, `StorageAdapter` interface, `IdGenerator` type, `TriageCandidate`, `TriageResult`, `AutopsyReport`, `ForecastEntry`, `ResurrectOutcome`, and constant `MAX_FORECAST_HORIZON_MS = 315360000000`
  - Create `src/index.ts` as the main export file
  - _Requirements: 1, 11, 12, 16, 17b, 17c, 17d_

- [x] 2. Implement error handling
  - [x] 2.1 Create error class with error codes
    - Create `src/errors.ts`
    - Implement `DecayEngineError` class extending `Error` with `code` property
    - Define `DecayEngineErrorCode` type with all 21 error codes: MISSING_POLICY, MISSING_STORAGE_ADAPTER, MISSING_ID_GENERATOR, INVALID_THRESHOLDS, INVALID_TIMESTAMP, INVALID_HEALTH, INVALID_ID, DUPLICATE_ID, ITEM_NOT_FOUND, ITEM_ALREADY_DEAD, ITEM_NOT_DEAD, TIME_WENT_BACKWARD, UNSUPPORTED_SCHEMA_VERSION, INVALID_SNAPSHOT, INVALID_ITEM_DATA, INVALID_BUDGET, INVALID_HORIZON, AUTOPSY_REQUIRES_DEAD_ITEM, INVALID_IMPORTANCE, INVALID_COST_MINUTES, EDIT_REQUIRES_FIELD
    - Export error class and type from `src/index.ts`
    - _Requirements: 17_
  
  - [x] 2.2 Write unit tests for error class
    - Create `tests/unit/errors.test.ts`
    - Test error message formatting, code property, instanceof checks
    - Test all error codes can be created
    - _Requirements: 17_

- [x] 3. Implement state derivation functions
  - [x] 3.1 Create pure state derivation functions
    - Create `src/state-derivation.ts`
    - Implement `deriveState(health, thresholds)` function
    - Implement `validateThresholds(thresholds)` function with all 4 validation rules
    - Implement `clampHealth(health)` function with validation
    - Implement `applyHealth(item, newHealth, now, thresholds, crossings = {})` function that returns updated item and history entries. `crossings.weakAt` and `crossings.deadAt` are the bisected crossing times from settle; when missing, `now` is used (event-caused changes). An item going from alive straight to dead gets an alive→weak "state-changed" entry before the "died" entry (see design, State Derivation)
    - Export only `deriveState` and `validateThresholds` from `src/index.ts`. `clampHealth` and `applyHealth` are internal
    - _Requirements: 13, 14_
  
  - [x] 3.2 Write unit tests for state derivation
    - Create `tests/unit/state-derivation.test.ts`
    - Test `deriveState` with health at boundaries (weak threshold, dead threshold, above, below, exact values)
    - Test `validateThresholds` with valid and invalid threshold configurations
    - Test `clampHealth` with values below 0, above 100, at boundaries, NaN, Infinity
    - Test `applyHealth` for all state transitions (alive→weak, weak→dead, alive→dead, weak→alive)
    - Test death recording (diedAt set, health clamped to 0, "died" history entry)
    - Test `applyHealth` uses `crossings.deadAt` and `crossings.weakAt` for diedAt and entry timestamps when given, and `now` when not
    - Test alive→dead records "state-changed" (alive→weak) then "died", in that order
    - _Requirements: 13, 14, 17a_

- [x] 4. Implement settle function
  - [x] 4.1 Create pure settle function
    - Create `src/settle.ts`
    - Implement `settle<Payload, PolicyData>(item, policy, now)` function
    - Handle already-dead items (return unchanged)
    - Handle `now < lastEventAt` (return unchanged for read operations)
    - Runs after task 5 (bisection), which it depends on
    - Call `policy.healthAt(item, now)` to compute health
    - Use `clampHealth` to validate and clamp health
    - If a threshold was crossed, call `bisectCrossing` on the STORED item over `[item.lastEventAt, now]`: for the weak threshold if the item was alive, and for the dead threshold if it is now dead. Pass the results to `applyHealth` as `crossings`
    - Use `applyHealth` to derive state and generate history
    - Return `SettleResult` with updated item and history entries
    - Do not export `settle` from `src/index.ts`. It is internal; tests import it from `src/settle.ts`
    - _Requirements: 3, 4, 5, 8, 8a, 14, 17a_
  
  - [x] 4.2 Write unit tests for settle function
    - Create `tests/unit/settle.test.ts`
    - Use the fake policy from `tests/fake-policy.ts` (task 20.1, which runs before this task)
    - Test settle with dead items (returns unchanged)
    - Test settle with `now < lastEventAt` (returns unchanged)
    - Test settle with unchanged health (returns unchanged)
    - Test settle with health decrease (updates item and generates history)
    - Test settle with state transitions (generates correct history entries)
    - Test settle with item dying (sets diedAt, clamps health to 0)
    - Test settle stamps "died" and "state-changed" entries with the bisected crossing times, not `now`, and that diedAt ≤ the returned lastEventAt
    - Test an item untended for 100 hours (fake policy) settles with a "state-changed" entry at about 50 hours and a "died" entry at about 80 hours, each within 1 minute after the exact time
    - _Requirements: 3, 4, 5, 8, 8a, 14_

- [x] 5. Implement bisection module
  - [x] 5.1 Create bisection functions
    - Create `src/bisection.ts`
    - Define constant `BISECT_PRECISION_MS = 60000` (1 minute)
    - Run this task before task 4 (settle uses it; see the dependency graph)
    - Implement `bisectCrossing<Payload, PolicyData>(item, policy, threshold, fromTime, toTime)`: binary search to 1-minute precision for when health first drops below `threshold`. Precondition: health at `toTime` is already below it
    - Implement `findDeathAfter<Payload, PolicyData>(item, policy, fromTime, toTime)`: returns `null` if health at `toTime` is still at or above the dead threshold, otherwise `bisectCrossing` for the dead threshold
    - Return upper end of final interval (earliest time condition is already met)
    - Rely on policy invariant: healthAt never increases with time between events
    - Do not export these functions from `src/index.ts`. They are internal; tests import them from `src/bisection.ts`
    - _Requirements: 17a_
  
  - [x] 5.2 Write unit tests for bisection functions
    - Create `tests/unit/bisection.test.ts`
    - Use the fake policy from `tests/fake-policy.ts`
    - Test bisectCrossing finds the dead-threshold crossing within 1 minute after the exact time, never before it
    - Test bisectCrossing finds the weak-threshold crossing the same way
    - Test bisectCrossing when fromTime and toTime are less than 1 minute apart (returns toTime)
    - Test findDeathAfter returns null when the item is still not dead at toTime
    - Test findDeathAfter returns the crossing time when the item dies inside the window
    - Test bisection returns upper end of final interval
    - Test view(bisectedTime) shows item in expected state
    - _Requirements: 17a_

- [x] 6. Implement serialization and validation
  - [x] 6.1 Create serialization module
    - Create `src/serialization.ts`
    - Implement `parseSnapshot<Payload, PolicyData>(data)` function
    - Implement `validateItem(item)` function with all field validations
    - Implement `serializeSnapshot(engineState)` function
    - Validate required fields, field types, health range, state values, timestamps, timesResurrected, importance (1-3), costMinutes (positive integer ≤ 600)
    - Validate dead items have diedAt defined
    - Convert between `EngineState` (Maps) and `StoredSnapshot` (arrays)
    - Do not export these functions from `src/index.ts`. They are internal; tests import them from `src/serialization.ts`
    - _Requirements: 15_
  
  - [x] 6.2 Write unit tests for serialization
    - Create `tests/unit/serialization.test.ts`
    - Test `validateItem` with valid items
    - Test `validateItem` with missing required fields
    - Test `validateItem` with invalid field types
    - Test `validateItem` with health out of range
    - Test `validateItem` with invalid state values
    - Test `validateItem` with dead items missing diedAt
    - Test `validateItem` with invalid importance (not 1-3)
    - Test `validateItem` with invalid costMinutes (not positive or > 600)
    - Test `parseSnapshot` with valid snapshots
    - Test `parseSnapshot` with invalid snapshots
    - Test `serializeSnapshot` conversion from Maps to arrays
    - Test round-trip: serializeSnapshot → parseSnapshot produces same data
    - _Requirements: 15_

- [x] 7. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement storage adapters
  - [x] 8.1 Create storage adapter interface file
    - Create `src/storage/interface.ts`
    - Define `StorageAdapter` interface with `load()` and `save(snapshot)` methods
    - Export interface from `src/index.ts`
    - _Requirements: 12_
  
  - [x] 8.2 Implement in-memory storage adapter
    - Create `src/storage/memory.ts`
    - Implement `InMemoryAdapter` class with private storage variable
    - Implement `load()` method that returns deep copy of stored snapshot
    - Implement `save(snapshot)` method that stores deep copy of snapshot
    - Export class from `src/index.ts`
    - _Requirements: 12.7_
  
  - [x] 8.3 Write unit tests for in-memory adapter
    - Create `tests/unit/storage/memory.test.ts`
    - Test load returns null when empty
    - Test save then load returns same data
    - Test load returns deep copy (modifications don't affect stored data)
    - Test save stores deep copy (modifications don't affect stored data)
    - Test multiple save operations (last save wins)
    - _Requirements: 12.7_
  
  - [x] 8.4 Implement localStorage storage adapter
    - Create `src/storage/local-storage.ts`
    - Implement `LocalStorageAdapter` class with namespace parameter
    - Implement `load()` method that reads from localStorage, parses JSON, returns null if key doesn't exist
    - Implement `save(snapshot)` method that serializes to JSON and writes to localStorage
    - Use storage key format: `decay-engine:${namespace}`
    - This is the ONLY file that imports browser APIs
    - Export class from `src/index.ts`
    - _Requirements: 12.4, 12.7, 12.8_
  
  - [x] 8.5 Write unit tests for localStorage adapter
    - Create `tests/unit/storage/local-storage.test.ts`
    - Mock localStorage API
    - Test load returns null when key doesn't exist
    - Test save then load returns same data
    - Test namespace is used in storage key
    - Test JSON serialization round-trip
    - Test error handling for storage failures
    - _Requirements: 12.4, 12.7, 12.8_

- [x] 9. Implement DecayEngine class - constructor and helpers
  - [x] 9.1 Create DecayEngine class with constructor
    - Create `src/engine.ts`
    - Implement `DecayEngine<Payload, PolicyData, Event>` class
    - Implement constructor that accepts policy, adapter, and idGenerator
    - Validate all three parameters are provided (throw errors for missing)
    - Validate policy thresholds using `validateThresholds`
    - Load snapshot from adapter via `load()`
    - Parse snapshot using `parseSnapshot` or initialize empty state
    - Throw error for unsupported schema versions
    - Store policy, adapter, idGenerator, and state as private fields
    - Do NOT initialize resurrection lock set (resurrection is synchronous)
    - Export class from `src/index.ts`
    - _Requirements: 1_
  
  - [x] 9.2 Implement helper methods
    - Implement `_validateNow(now)` private method with timestamp validation
    - Implement `_getItem(id)` private method that throws ITEM_NOT_FOUND
    - Implement `_persist(changedItems, newHistoryEntries)` private method
    - In `_persist`: build new Maps, convert to StoredSnapshot via `serializeSnapshot`, save via adapter, update in-memory state only after successful save
    - _Requirements: 1, 11, 12_
  
  - [x] 9.3 Write unit tests for constructor
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

- [x] 10. Implement DecayEngine - addItem
  - [x] 10.1 Implement addItem method
    - Implement `addItem({ payload, importance, costMinutes }, now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - Validate importance is integer 1-3, throw INVALID_IMPORTANCE if not
    - Validate costMinutes is positive integer ≤ 600, throw INVALID_COST_MINUTES if not
    - Generate ID using idGenerator, validate it's a non-empty string
    - Check for duplicate ID, throw DUPLICATE_ID if exists
    - Call `policy.init(payload, now)` to get policyData
    - Create provisional item with health 100, state "alive", all timestamps set to now, timesResurrected 0, importance, costMinutes
    - Call `policy.healthAt(provisionalItem, now)` to compute starting health
    - Use `clampHealth` to validate and clamp starting health
    - Use `deriveState` to derive state from starting health
    - If state is "dead", set diedAt to createdAt (no bisection for starting dead), set health to 0
    - Create "created" history entry (and "died" entry if item starts dead)
    - Persist via `_persist`
    - Return item ID
    - _Requirements: 2, 16_
  
  - [x] 10.2 Write unit tests for addItem
    - Test addItem creates item with correct initial values including importance and costMinutes
    - Test addItem calls policy.init and stores returned policyData
    - Test addItem calls policy.healthAt to compute starting health
    - Test addItem with starting health < dead threshold starts dead with diedAt = createdAt
    - Test addItem persists item to storage before returning
    - Test addItem records "created" history entry (and "died" if starts dead)
    - Test addItem returns generated ID
    - Test addItem throws INVALID_TIMESTAMP for invalid now
    - Test addItem throws INVALID_IMPORTANCE for invalid importance
    - Test addItem throws INVALID_COST_MINUTES for invalid costMinutes
    - Test addItem throws INVALID_ID for empty string ID
    - Test addItem throws DUPLICATE_ID when ID already exists
    - Test addItem propagates policy.init errors
    - Test addItem propagates policy.healthAt errors
    - Test addItem propagates storage errors without retaining item in memory
    - _Requirements: 2, 16_

- [x] 11. Implement DecayEngine - view
  - [x] 11.1 Implement view method
    - Implement `view(now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - For each item in state, call `settle(item, policy, now)`
    - Return array of settled items (copies, not references)
    - Do not call `_persist` (read-only operation)
    - _Requirements: 4_
  
  - [x] 11.2 Write unit tests for view
    - Test view computes health at given timestamp
    - Test view derives state correctly (alive, weak, dead)
    - Test view does not modify storage (verify with adapter)
    - Test view does not modify lastEventAt
    - Test view called multiple times returns consistent results
    - Test view with `now < lastEventAt` returns item as stored
    - Test view throws INVALID_TIMESTAMP for invalid now
    - _Requirements: 4_

- [x] 12. Implement DecayEngine - tick
  - [x] 12.1 Implement tick method
    - Implement `tick(now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - For each item, call `settle(item, policy, now)`
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt` for any item
    - Bisected crossing times come from `settle` (task 4); tick does not call bisection itself
    - Collect items where health or state changed
    - Collect all history entries from settling (with bisected timestamps for died and state-changed entries)
    - Persist changed items and history via `_persist`
    - Return count of changed items
    - _Requirements: 5, 17a_
  
  - [x] 12.2 Write unit tests for tick
    - Test tick updates lastEventAt for changed items
    - Test tick does not update lastEventAt for unchanged items
    - Test tick persists changed items to storage
    - Test tick uses bisection for diedAt (verify diedAt is between lastEventAt and now)
    - Test tick uses bisection for state-changed timestamps
    - Test tick records "died" history with bisected timestamp for items that die
    - Test tick records "state-changed" history with bisected timestamp for alive↔weak transitions
    - Test tick returns count of modified items
    - Test tick with same timestamp twice returns 0 second time (idempotence)
    - Test tick throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test tick throws INVALID_TIMESTAMP for invalid now
    - Test tick error leaves storage unchanged
    - _Requirements: 5, 17a_

- [x] 13. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all tests pass for core read/write operations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement DecayEngine - tend
  - [x] 14.1 Implement tend method
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
  
  - [x] 14.2 Write unit tests for tend
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

- [x] 15. Implement DecayEngine - due and graveyard
  - [x] 15.1 Implement due method
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
  
  - [x] 15.2 Implement graveyard method
    - Implement `graveyard()` method in `src/engine.ts`
    - Filter items where state is "dead"
    - Sort by diedAt descending, then by ID ascending
    - Return copies, not references
    - _Requirements: 7_
  
  - [x] 15.3 Write unit tests for due
    - Test due returns only items where nextDueAt ≤ now
    - Test due excludes items where nextDueAt returns null
    - Test due excludes dead items
    - Test due computes health at now without persisting
    - Test due sorts by health ascending, then ID ascending
    - Test due throws INVALID_TIMESTAMP for invalid now
    - Test due with `now < lastEventAt` uses stored health
    - _Requirements: 6_
  
  - [x] 15.4 Write unit tests for graveyard
    - Test graveyard returns only dead items
    - Test graveyard returns empty array when no dead items
    - Test graveyard sorts by diedAt descending, then ID ascending
    - Test graveyard with identical diedAt values preserves deterministic order
    - Test graveyard requires no arguments
    - _Requirements: 7_

- [x] 16. Implement DecayEngine - history and remove
  - [x] 16.1 Implement history method
    - Implement `history(id)` method in `src/engine.ts`
    - Get item using `_getItem` (throws ITEM_NOT_FOUND)
    - Get history entries from state.history Map
    - Return copy of history array (already sorted by timestamp)
    - _Requirements: 9_
  
  - [x] 16.2 Implement remove method
    - Implement `remove(id)` method in `src/engine.ts`
    - Get item using `_getItem` (throws ITEM_NOT_FOUND)
    - Build new state with item and its history removed
    - Persist via adapter (save entire snapshot atomically)
    - Update in-memory state only after successful save
    - _Requirements: 10_
  
  - [x] 16.3 Write unit tests for history
    - Test history returns all entries for an item
    - Test history returns only "created" entry for untended items
    - Test history entries are sorted by timestamp ascending
    - Test history preserves order for identical timestamps
    - Test history throws ITEM_NOT_FOUND for unknown item
    - Test history returns copy (modifications don't affect stored history)
    - _Requirements: 9_
  
  - [x] 16.4 Write unit tests for remove
    - Test remove deletes item and its history atomically
    - Test remove throws ITEM_NOT_FOUND for unknown item
    - Test removed item cannot be accessed by other operations
    - Test remove error leaves storage unchanged
    - _Requirements: 10_

- [x] 17. Implement DecayEngine - resurrect (synchronous)
  - [x] 17.1 Implement resurrect method
    - Implement `resurrect(id, event, now)` method in `src/engine.ts` (synchronous, no async)
    - Validate `now` using `_validateNow`
    - Get item using `_getItem`
    - Call `settle(item, policy, now)`
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt`
    - Throw ITEM_NOT_DEAD if settled item is not dead
    - Call `policy.resurrect(settledItem, event, now)` synchronously with the settled item
    - If result.ok is true: set health to 100, state to "alive", clear diedAt, increment timesResurrected, update payload/policyData if provided, record "resurrected" history with the event
    - If result.ok is false: preserve item unchanged, record "resurrect-failed" history with the event and reason
    - Persist changes (including any settle history) via `_persist`
    - Return `{ ok: true }` or `{ ok: false, reason }` (ResurrectOutcome)
    - _Requirements: 8_
  
  - [x] 17.2 Write unit tests for resurrect
    - Test resurrect settles item first
    - Test resurrect on successful policy.resurrect sets health to 100, state to "alive"
    - Test resurrect clears diedAt on success
    - Test resurrect increments timesResurrected on success
    - Test resurrect updates payload when provided by policy
    - Test resurrect updates policyData when provided by policy
    - Test resurrect records "resurrected" history on success
    - Test resurrect preserves item on policy failure
    - Test resurrect records "resurrect-failed" history with event and reason on failure
    - Test resurrect returns { ok: true } on success and { ok: false, reason } on failure
    - Test resurrect throws ITEM_NOT_DEAD if settled item is not dead
    - Test resurrect throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test resurrect throws ITEM_NOT_FOUND for unknown item
    - Test resurrect propagates policy.resurrect errors
    - _Requirements: 8_

- [x] 18. Implement DecayEngine - edit
  - [x] 18.1 Implement edit method
    - Implement `edit(id, { payload?, importance?, costMinutes? }, now)` method in `src/engine.ts`
    - Validate `now` using `_validateNow`
    - Throw EDIT_REQUIRES_FIELD if all fields are undefined
    - Validate importance (1-3 integer) if provided, throw INVALID_IMPORTANCE if not
    - Validate costMinutes (positive integer ≤ 600) if provided, throw INVALID_COST_MINUTES if not
    - Get item using `_getItem`
    - Call `settle(item, policy, now)` to compute current state
    - Throw TIME_WENT_BACKWARD if `now < item.lastEventAt`
    - If settled item is dead: replace only provided fields, leave health at 0, state as "dead", diedAt unchanged, do NOT call policy.healthAt, set lastEventAt to `now`, record "edited" history with array of changed field names
    - If settled item is not dead: replace only provided fields, call `policy.healthAt(item, now)` to recompute health, use `clampHealth` and `deriveState`, pass the result to `applyHealth` with no crossings (an edit-caused death happens at `now`; any earlier death was already found by settle), set lastEventAt to `now`, record "edited" history (and "died" if death occurs)
    - Persist changes via `_persist`
    - _Requirements: 8a_
  
  - [x] 18.2 Write unit tests for edit
    - Test edit on dead item does not recompute health
    - Test edit on dead item replaces only provided fields
    - Test edit on non-dead item recomputes health via policy.healthAt
    - Test edit on non-dead item that dies because of the edit records diedAt = now
    - Test edit validates importance and costMinutes when provided
    - Test edit throws EDIT_REQUIRES_FIELD when no fields provided
    - Test edit throws INVALID_IMPORTANCE for invalid importance
    - Test edit throws INVALID_COST_MINUTES for invalid costMinutes
    - Test edit throws TIME_WENT_BACKWARD when now < lastEventAt
    - Test edit throws ITEM_NOT_FOUND for unknown item
    - Test edit records "edited" history with array of changed field names
    - Test edit records "died" history when item dies during edit
    - Test edit propagates policy.healthAt errors
    - _Requirements: 8a_

- [x] 19. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Create fake policy for testing
  - Run this task early, straight after task 3: the settle and engine unit tests depend on it (see the dependency graph)
  - [x] 20.1 Implement fake policy
    - Create `tests/fake-policy.ts`
    - Define `FakePayload`, `FakePolicyData`, `FakeEvent` types (all JSON-serializable)
    - Implement `FakePolicy` class with time-based linear decay
    - Implement `init` method returning initial decay rate of 1 health per hour (`1 / 3_600_000` per ms), so bisection at 1-minute precision is exercised
    - Implement `healthAt` method: compute decay from lastEventAt to now
    - Implement `applyEvent` method: handle "boost" and "damage" events
    - Implement `nextDueAt` method: compute time until weak threshold
    - Implement `resurrect` method synchronously (no async): configurable success/failure with `setResurrectFailure`
    - Thresholds: weak = 50, dead = 20
    - Never read the clock (use only the `now` parameter)
    - _Requirements: 18.10, 18.11_
  
  - [x] 20.2 Write unit tests for fake policy
    - Test fake policy never reads the clock
    - Test healthAt computes linear decay correctly
    - Test applyEvent handles boost events
    - Test applyEvent handles damage events
    - Test nextDueAt computes correct due time
    - Test resurrect returns success when configured (synchronous)
    - Test resurrect returns failure when configured (synchronous)
    - _Requirements: 18.10, 18.11_

- [x] 21. Implement triage feature
  - [x] 21.1 Implement triage algorithm (WRITTEN BY CLAUDE CODE at the developer's request; originally planned as hand-written)
    - Create `src/triage.ts`
    - Implement `triage<Payload, PolicyData>(items, budgetMinutes, policy, now)` function
    - Filter candidates: items with health ≥ dead threshold AND < weak threshold at `now`
    - For each candidate: compute value = (100 - health) × (1 - health / 100) × importance
    - For each candidate: compute valuePerMinute = value / costMinutes
    - For each candidate: use `findDeathAfter(settledItem, policy, now, now + MAX_FORECAST_HORIZON_MS)` to determine diesAt (null if it does not die)
    - Implement exact 0/1 knapsack algorithm over integer minutes to maximize total value
    - Sort picks by valuePerMinute descending, ties by id ascending
    - Sort others by diesAt ascending (nulls last), ties by id ascending
    - Return TriageResult with picks and others
    - Internal: do not export from `src/index.ts` (the public API is `engine.triage`, task 25)
    - _Requirements: 17b_
  
  - [x] 21.2 Write unit tests for triage
    - Create `tests/unit/triage.test.ts`
    - Test triage only considers weak items (health in [dead, weak) range)
    - Test triage respects budget (total costMinutes of picks ≤ budgetMinutes)
    - Test triage computes value and valuePerMinute correctly
    - Test triage sorts picks by valuePerMinute descending
    - Test triage sorts others by diesAt ascending with nulls last
    - Test triage uses knapsack to maximize value
    - Test triage is deterministic (same inputs produce same output)
    - Test triage when every weak item costs more than the budget returns empty picks (all in others)
    - Worked example: four weak items with known health, importance and costMinutes and a 20-minute budget; assert exactly which items are picked, their order and the minutes used. Work the expected answer out by hand in a comment in the test
    - Test triage with no weak items returns empty picks and others
    - _Requirements: 17b_

- [x] 22. Implement autopsy feature
  - [x] 22.1 Implement autopsy analysis (WRITTEN BY CLAUDE CODE at the developer's request; originally planned as hand-written)
    - Create `src/autopsy.ts`
    - Implement `autopsy<Payload, PolicyData, Event>(item, history, policy, now)` function
    - Settle item at `now` in memory without persisting
    - Throw AUTOPSY_REQUIRES_DEAD_ITEM if health ≥ dead threshold
    - Define "this life" as period from most recent resurrection (or creation) to death
    - Extract from history: lifeStartedAt, wentWeakAt (most recent alive→weak before death in current life), lastTend, tends array with gapBeforeMs
    - Compute silenceMs from lastTend.at (or lifeStartedAt) to diedAt
    - Count failedResurrections from full history
    - Return AutopsyReport with facts only (no interpretations)
    - Internal: do not export from `src/index.ts` (the public API is `engine.autopsy`, task 25)
    - _Requirements: 17c_
  
  - [x] 22.2 Write unit tests for autopsy
    - Create `tests/unit/autopsy.test.ts`
    - Test autopsy settles item in memory without persisting
    - Test autopsy throws AUTOPSY_REQUIRES_DEAD_ITEM for non-dead items
    - Test autopsy computes wentWeakAt correctly (or null)
    - Test autopsy identifies lifeStartedAt (creation or last resurrection)
    - Test autopsy identifies lastTend and tends array
    - Test autopsy computes silenceMs correctly
    - Test autopsy counts failedResurrections
    - Test autopsy with never-tended item (lastTend is null)
    - Test autopsy with resurrected item (lifeStartedAt is resurrection time)
    - Test autopsy for an item that went from alive straight to dead in one tick still reports wentWeakAt (from the state-changed entry)
    - _Requirements: 17c_

- [x] 23. Implement forecast feature
  - [x] 23.1 Implement forecast prediction
    - Create `src/forecast.ts`
    - Implement `forecast<Payload, PolicyData>(items, now, horizonMs, policy)` function
    - Compute health at `now` for all items using policy.healthAt
    - For each non-dead item (health ≥ dead threshold), use `findDeathAfter(settledItem, policy, now, now + horizonMs)` to find diesAt
    - Include only items with diesAt not null and diesAt ≤ now + horizonMs
    - Sort by diesAt ascending, ties by id ascending
    - Return array of ForecastEntry objects
    - Internal: do not export from `src/index.ts` (the public API is `engine.forecast`, task 25)
    - _Requirements: 17d_
  
  - [x] 23.2 Write unit tests for forecast
    - Create `tests/unit/forecast.test.ts`
    - Test forecast excludes items already dead at `now`
    - Test forecast uses bisection to find diesAt
    - Test forecast includes only items dying within horizonMs
    - Test forecast sorts by diesAt ascending
    - Test engine.forecast with horizon 0 throws INVALID_HORIZON (task 25.2)
    - Test forecast with no items dying in horizon returns empty array
    - Test forecast consistency: view(entry.diesAt) shows item dead
    - _Requirements: 17d_

- [x] 24. Implement checkPolicy feature
  - [x] 24.1 Implement policy validation function
    - Create `src/check-policy.ts`
    - Implement `checkPolicy<Payload, PolicyData, Event>(policy, samplePayloads, sampleEvents, startTime)` function
    - Build test items and timestamps deterministically from samples (no randomness, no clock)
    - Verify policy.healthAt returns number 0-100 for all test cases
    - Verify policy.healthAt is pure (same inputs → same output when called multiple times)
    - Verify policy.healthAt never increases with time between events (for any item and t1 < t2: healthAt(item, t2) ≤ healthAt(item, t1))
    - Verify policy.init returns JSON-serializable data (round-trips through JSON)
    - Return report with passed flag and array of failure descriptions
    - Export function from `src/index.ts`
    - _Requirements: 17e_
  
  - [x] 24.2 Write unit tests for checkPolicy
    - Create `tests/unit/check-policy.test.ts`
    - Test checkPolicy with valid policy returns passed=true
    - Test checkPolicy detects healthAt returning values outside [0, 100]
    - Test checkPolicy detects healthAt not being pure
    - Test checkPolicy detects healthAt increasing with time
    - Test checkPolicy detects policy.init returning non-JSON-serializable data
    - Test checkPolicy is deterministic (same inputs produce same report)
    - Test checkPolicy never reads the clock
    - _Requirements: 17e_

- [x] 25. Integrate triage, autopsy, forecast into DecayEngine
  - [x] 25.1 Add methods to DecayEngine class
    - Add `triage(budgetMinutes, now)` method to `src/engine.ts`
    - Add `autopsy(id, now)` method to `src/engine.ts`
    - Add `forecast(now, horizonMs)` method to `src/engine.ts`
    - Validate budgetMinutes (integer 1-1440), throw INVALID_BUDGET if not
    - Validate horizonMs (positive number), throw INVALID_HORIZON if not
    - Call internal triage/autopsy/forecast functions with engine state
    - All three methods are read-only (do not persist)
    - _Requirements: 17b, 17c, 17d_
  
  - [x] 25.2 Write integration tests for DecayEngine triage/autopsy/forecast
    - Test engine.triage respects budget and selects weak items
    - Test engine.autopsy throws for non-dead items
    - Test engine.forecast predicts deaths within horizon
    - Test all three operations are read-only (verify storage unchanged)
    - Test triage/autopsy/forecast throw appropriate errors for invalid inputs
    - _Requirements: 17b, 17c, 17d_

- [x] 26. Checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 27. Create property-based test generators
  - [x] 27.1 Implement test generators and helpers
    - Create `tests/generators.ts`
    - Implement `commandSequence()`: generates sequences of addItem (random importance 1-3, costMinutes 1-60), tend, tick and edit commands with non-decreasing timestamps that advance in whole minutes, with gaps of up to several hours
    - Implement `smallCommandSequence()`: like `commandSequence()` but adds at most 10 items (Property 14)
    - Implement command execution that ignores ITEM_ALREADY_DEAD errors
    - Implement `offset()`: non-negative whole number of minutes, up to about 120 hours, matching the fake policy's 1-health-per-hour decay
    - Implement `timestamp()`: valid timestamp generator (baseTime + offset)
    - Implement `event()`: fake event generator (boost/damage with JSON-safe values)
    - Implement `latestTimestamp(commands)`: returns max timestamp from sequence
    - Implement `buildEngine(commands, options?)`: creates engine, runs commands, returns engine and adapter
    - Implement `counterIds()`: deterministic ID generator
    - Size generators so alive, weak, and dead outcomes all occur often
    - Generate only JSON-safe numbers (no NaN, Infinity, negative zero)
    - _Requirements: 18_
  
  - [x] 27.2 Write generator coverage check
    - Create `tests/properties/generator-coverage.test.ts`
    - Sample generators 300 times with fixed seed
    - Count alive, weak, and dead items
    - Assert each state makes up at least 10% of generated items
    - _Requirements: 18_

- [x] 28. Implement property-based tests - health and state
  - [x] 28.1 Write Property 1: Health bounds
    - Create `tests/properties/health-and-state.test.ts`
    - Implement property: for any command sequence and timestamp, all item health values are in [0, 100]
    - Generate command sequences and offsets
    - Build engine, execute commands, call view(now)
    - Assert all health values are >= 0 and <= 100
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 1: Health is always between 0 and 100 inclusive`
    - _Requirements: 18.1, 13_
  
  - [x] 28.2 Write Property 2: State matches health
    - Implement property: for any command sequence and timestamp, all item states match health and thresholds
    - Generate command sequences and offsets
    - Build engine, execute commands, call view(now)
    - For each item, compute expected state using `deriveState`
    - Assert actual state matches expected state
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 2: State always matches health and thresholds`
    - _Requirements: 18.2, 14_

- [x] 29. Implement property-based tests - due and view
  - [x] 29.1 Write Property 3: Dead items not in due queue
    - Create `tests/properties/due-queue.test.ts`
    - Implement property: for any command sequence and timestamp, due(now) never returns dead items
    - Generate command sequences and offsets
    - Build engine, execute commands, call due(now)
    - Assert no returned item has state "dead"
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 3: Dead items never appear in due queue`
    - _Requirements: 18.3, 6_
  
  - [x] 29.2 Write Property 4: View does not change storage
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

- [x] 30. Implement property-based tests - tick
  - [x] 30.1 Write Property 5: Tick idempotence
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
  
  - [x] 30.2 Write Property 9: Time splitting equivalence
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

- [x] 31. Implement property-based tests - resurrect and history
  - [x] 31.1 Write Property 6: Resurrect yields alive state (synchronous)
    - Create `tests/properties/resurrect.test.ts`
    - Implement property: successful resurrect always yields alive with health 100
    - Generate command sequences, offset, and event
    - Build engine with fake policy configured for success
    - Compute now, call tick(now) to settle all items
    - For each dead item in graveyard, call resurrect (synchronous)
    - Assert resurrected item has state "alive", health 100, diedAt undefined
    - Use `fc.assert` with `{ numRuns: 100 }` (synchronous property, not asyncProperty)
    - Tag: `// Feature: engine, Property 6: Successful resurrect always yields alive with health 100`
    - _Requirements: 18.6, 8.5_
  
  - [x] 31.2 Write Property 7: History time order (synchronous)
    - Create `tests/properties/history.test.ts`
    - Implement property: history entries are always sorted by timestamp ascending
    - Generate command sequences, offset, and boolean for resurrect success/failure
    - Build engine with fake policy configured per boolean
    - Execute commands, tick to settle, resurrect dead items (synchronous)
    - For each item, get history and assert timestamps are non-decreasing
    - Use `fc.assert` with `{ numRuns: 100 }` (synchronous property, not asyncProperty)
    - Tag: `// Feature: engine, Property 7: History entries always in time order`
    - _Requirements: 18.7, 9.1_

- [x] 32. Implement property-based tests - tend and serialization
  - [x] 32.1 Write Property 8: Tend never succeeds on dead items
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
  
  - [x] 32.2 Write Property 10: Round-trip serialization
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

  - [x] 32.3 Write boundary tests for the engine-boundary steering rules
    - Create `tests/unit/boundary.test.ts`
    - Read every file under `src/` as text
    - Assert no file contains `Date.now`, `new Date` or `performance.now`
    - Assert no file other than `src/storage/local-storage.ts` references `localStorage`, `sessionStorage`, `window` or `document`
    - Assert no file imports from `apps/`, `packages/shell`, `react` or any package outside the engine
    - Assert `package.json` has no runtime `dependencies`
    - _Requirements: 1.9, 11.2, 12.4_

- [x] 33. Implement property-based tests - triage
  - [x] 33.1 Write Property 12: Triage only picks weak items
    - Create `tests/properties/triage.test.ts`
    - Implement property: triage never picks alive or dead items
    - Generate command sequences, offset, and budgetMinutes
    - Build engine, execute commands
    - Call triage(budgetMinutes, now)
    - Assert all picks have health ≥ dead threshold AND < weak threshold
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 12: Triage never picks alive or dead items`
    - _Requirements: 18.12, 17b.10_
  
  - [x] 33.2 Write Property 13: Triage respects budget
    - Implement property: total costMinutes of picks never exceeds budget
    - Generate command sequences, offset, and budgetMinutes
    - Build engine, execute commands
    - Call triage(budgetMinutes, now)
    - Assert sum of picks' costMinutes ≤ budgetMinutes
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 13: Total costMinutes never exceeds budget`
    - _Requirements: 18.13, 17b.6_
  
  - [x] 33.3 Write Property 14: Triage optimality for small cases
    - Implement property: for ≤10 weak items, triage equals brute-force optimal
    - Generate small command sequences (≤10 weak items), offset, and budgetMinutes
    - Build engine, execute commands
    - Call triage and compute brute-force optimal
    - Assert triage value equals brute-force value within 1e-9 tolerance
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 14: Triage optimal for small cases`
    - _Requirements: 18.14, 17b.6_

- [x] 34. Implement property-based tests - timing and read-only ops
  - [x] 34.1 Write Property 15: DiedAt lies between events
    - Create `tests/properties/timing.test.ts`
    - Implement property: diedAt is between previous lastEventAt and detection time
    - Generate command sequences and offset
    - Build engine, execute commands
    - Record the stored items before tick by reading `adapter.load()` (not view, which already shows the settled death)
    - Call tick(now)
    - For each dead item that was NOT dead before the tick, assert diedAt ≥ its stored lastEventAt AND diedAt ≤ now. Skip items that were already dead: their stored lastEventAt is later than their diedAt
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 15: diedAt lies between previous lastEventAt and detection time`
    - _Requirements: 18.15, 17a.6_
  
  - [x] 34.2 Write Property 16: Read-only operations never change storage
    - Create `tests/properties/read-only.test.ts`
    - Implement property: autopsy, triage, forecast never change stored data
    - Generate command sequences, offset, budgets array, horizons array
    - Build engine with accessible adapter, execute commands
    - Capture snapshot before read-only operations
    - Call triage, forecast, autopsy multiple times
    - Capture snapshot after
    - Assert snapshots are deeply equal
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 16: autopsy, triage, forecast never change storage`
    - _Requirements: 18.16, 17b.1, 17c.1, 17d.1_

- [x] 35. Implement property-based tests - forecast consistency
  - [x] 35.1 Write Property 17: Forecast consistency with view
    - Create `tests/properties/forecast.test.ts`
    - Implement property: item forecast to die at T is dead when view(T) called
    - Generate command sequences, offset, and horizonMs
    - Build engine, execute commands
    - Call forecast(now, horizonMs)
    - For each forecast entry, call view(entry.diesAt)
    - Assert item is dead in view result
    - Use `fc.assert` with `{ numRuns: 100 }`
    - Tag: `// Feature: engine, Property 17: forecast consistency with view`
    - _Requirements: 18.17, 17d.7_

- [x] 36. Final checkpoint - Ensure all tests pass
  - Run `pnpm test` and verify all tests pass (unit and property-based)
  - Run `pnpm test:coverage` to check coverage
  - Ensure all tests pass, ask the user if questions arise.

- [x] 37. Finalize package exports and documentation
  - [x] 37.1 Finalize src/index.ts exports
    - Export `DecayEngine` class
    - Export `DecayEngineError` class and `DecayEngineErrorCode` type
    - Export `StorageAdapter` interface, `InMemoryAdapter`, `LocalStorageAdapter`
    - Export all type definitions from types.ts
    - Export public functions: `deriveState`, `validateThresholds`, `checkPolicy`
    - Export constant: `MAX_FORECAST_HORIZON_MS`
    - Do not export internal functions (settle, bisection, serialize, triage/autopsy/forecast internal functions)
    - _Requirements: All_
  
  - [x] 37.2 Add JSDoc comments to public API
    - Add JSDoc comments to `DecayEngine` class and all public methods
    - Add JSDoc comments to `DecayPolicy` interface and all methods
    - Add JSDoc comments to `Item` type and all fields
    - Add JSDoc comments to `StorageAdapter` interface
    - Add JSDoc comments to exported types
    - Include @param, @returns, @throws tags
    - _Requirements: All_
  
  - [x] 37.3 Create package README
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
- Resurrection is synchronous (no async/await, no resurrection lock) and returns its outcome
- Outcome tests with the three real policies live in each app (`apps/<app>/src/policy.test.ts`), not here: the engine must never import an app
- Triage and autopsy (tasks 21-22) and the DecayEngine class (tasks 9-19) were written by Claude Code; see `.kiro/steering/authorship.md`
- Checkpoints ensure incremental validation of core functionality

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "20.1"] },
    { "id": 2, "tasks": ["3.2", "5.1", "20.2"] },
    { "id": 3, "tasks": ["5.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4"] },
    { "id": 8, "tasks": ["8.5", "9.1"] },
    { "id": 9, "tasks": ["9.2"] },
    { "id": 10, "tasks": ["9.3", "10.1"] },
    { "id": 11, "tasks": ["10.2", "11.1"] },
    { "id": 12, "tasks": ["11.2", "12.1"] },
    { "id": 13, "tasks": ["12.2", "14.1"] },
    { "id": 14, "tasks": ["14.2", "15.1", "15.2"] },
    { "id": 15, "tasks": ["15.3", "15.4", "16.1", "16.2"] },
    { "id": 16, "tasks": ["16.3", "16.4", "17.1"] },
    { "id": 17, "tasks": ["17.2", "18.1"] },
    { "id": 18, "tasks": ["18.2", "21.1"] },
    { "id": 19, "tasks": ["21.2", "22.1"] },
    { "id": 20, "tasks": ["22.2", "23.1"] },
    { "id": 21, "tasks": ["23.2", "24.1"] },
    { "id": 22, "tasks": ["24.2", "25.1"] },
    { "id": 23, "tasks": ["25.2"] },
    { "id": 24, "tasks": ["27.1"] },
    { "id": 25, "tasks": ["27.2", "28.1"] },
    { "id": 26, "tasks": ["28.2", "29.1"] },
    { "id": 27, "tasks": ["29.2", "30.1"] },
    { "id": 28, "tasks": ["30.2", "31.1"] },
    { "id": 29, "tasks": ["31.2", "32.1"] },
    { "id": 30, "tasks": ["32.2", "32.3", "33.1"] },
    { "id": 31, "tasks": ["33.2", "33.3", "34.1"] },
    { "id": 32, "tasks": ["34.2", "35.1"] },
    { "id": 33, "tasks": ["37.1"] },
    { "id": 34, "tasks": ["37.2", "37.3"] }
  ]
}
```
