# Requirements Document

## Introduction

The Decay Engine is a pure TypeScript library that tracks the lifecycle of any item through states of alive, weak, and dead. Apps integrate by supplying a decay policy that defines how items lose health and can be resurrected. The engine enforces lifecycle rules, manages state transitions, maintains due queues and a graveyard, records history, and persists data through a storage adapter—all without knowing what an item represents.

## Glossary

- **Engine**: The core lifecycle management system that orchestrates item state transitions
- **Item**: A tracked entity with health, state, timestamps, and app-specific payload and policy data
- **Policy**: A contract object supplied by an app that defines health calculation, event handling, due dates, and resurrection logic
- **Payload**: App-specific data about an item that the engine stores but never interprets
- **PolicyData**: App-specific state maintained by the policy and stored by the engine
- **Health**: A number from 0 to 100 representing an item's current vitality
- **State**: One of "alive", "weak", or "dead" derived from health and thresholds
- **Threshold**: Numeric boundaries (weak and dead) that determine state transitions
- **Event**: An app-defined occurrence that affects an item's health and policy data
- **Storage_Adapter**: An interface for persisting and retrieving items and history
- **History**: A time-ordered log of all events affecting an item
- **Graveyard**: The collection of dead items
- **Due_Queue**: Items that need attention according to their policy's nextDueAt
- **Time_Machine**: The capability to view or modify state at any point in time by passing `now` as an argument

## Type Contract

```typescript
type Item<Payload, PolicyData> = {
  id: string
  payload: Payload
  policyData: PolicyData
  health: number            // 0..100, as of lastEventAt
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
  applyEvent(item: Item<Payload, PolicyData>, event: Event, now: number): { health: number; policyData: PolicyData }
  nextDueAt(item: Item<Payload, PolicyData>, now: number): number | null
  resurrect(item: Item<Payload, PolicyData>, now: number): Promise<
    | { ok: true; payload?: Payload; policyData?: PolicyData }
    | { ok: false; reason: string }
  >
}
```

## Requirements

### Requirement 1: Engine Initialization

**User Story:** As a developer, I want to create an engine instance from a policy, storage adapter, and id generator, so that I can start tracking items with app-specific logic.

#### Acceptance Criteria

1. WHEN creating a DecayEngine instance with a DecayPolicy, storage adapter, and ID generator, THE DecayEngine constructor SHALL return an instance that uses the provided policy for all lifecycle calculations, the provided adapter for all persistence operations, and the provided generator for all ID creation operations.
2. IF the provided policy parameter is null or undefined, THEN THE DecayEngine constructor SHALL throw an error indicating that a policy is required.
3. IF the provided storage adapter parameter is null or undefined, THEN THE DecayEngine constructor SHALL throw an error indicating that a storage adapter is required.
4. IF the provided ID generator parameter is null or undefined, THEN THE DecayEngine constructor SHALL throw an error indicating that an ID generator is required.
5. IF the provided policy has a policy.thresholds.dead value greater than or equal to its policy.thresholds.weak value, THEN THE DecayEngine constructor SHALL throw an error indicating invalid threshold ordering.
6. IF the provided policy has a policy.thresholds.dead value less than or equal to 0, THEN THE DecayEngine constructor SHALL throw an error indicating that policy.thresholds.dead must be positive.
7. IF the provided policy has a policy.thresholds.weak value greater than 100, THEN THE DecayEngine constructor SHALL throw an error indicating that policy.thresholds.weak exceeds maximum.
8. WHEN the DecayEngine constructor validates policy thresholds, THE constructor SHALL check that policy.thresholds.weak is a number, policy.thresholds.dead is a number, and policy.thresholds.dead is less than policy.thresholds.weak.
9. WHERE the engine package is a pure TypeScript library, THE DecayEngine constructor SHALL NOT import from apps/, packages/shell/, React, or any UI library.
10. WHEN the DecayEngine is created, THE engine SHALL load the snapshot from the storage adapter.
11. IF there is no snapshot in the storage adapter, THEN THE engine SHALL start with an empty state containing no items and no history.
12. IF the loaded snapshot contains a schemaVersion that is not supported by the engine, THEN THE engine SHALL throw an error naming the found version and the expected version.

### Requirement 2: Add Items

**User Story:** As a developer, I want to add a new item to the engine, so that its lifecycle can be tracked.

#### Acceptance Criteria

1. WHEN addItem(payload, now) is called, THE engine SHALL generate a unique ID, store the provided payload, call policy.init(payload, now) and store the returned value in policyData, set health to 100, set state to "alive", set createdAt and lastEventAt to `now`, set timesResurrected to 0, and leave diedAt undefined.
2. WHEN the engine creates a new item, THEN THE engine SHALL persist the item via the storage adapter before returning.
3. WHEN the engine creates a new item, THEN THE engine SHALL record a history entry of type "created" with the item id, timestamp `now`, and health value 100.
4. WHEN addItem completes successfully, THEN THE engine SHALL return the item's unique ID as a string.
5. IF policy.init(payload, now) throws an error, THEN THE engine SHALL propagate the error without creating the item or modifying storage.
6. IF the storage adapter fails to persist the item, THEN THE engine SHALL propagate the error and SHALL NOT retain the item in memory.

### Requirement 3: Tend Items

**User Story:** As a developer, I want to record that an event happened to an item, so that its health and state can be updated.

#### Acceptance Criteria

1. WHEN tend(id, event, now) is called, THE engine SHALL first settle the item at `now` using policy.healthAt exactly as tick would for that one item, including state derivation and recording a death if health falls below policy.thresholds.dead.
2. IF settling finds that the item has died, THEN THE engine SHALL save that death and its history entry to storage, and then throw an error indicating that dead items cannot be tended.
3. IF after settling the item is dead, THEN THE engine SHALL throw an error indicating that dead items cannot be tended.
4. WHEN tend(id, event, now) is called on a settled item with state "alive" or "weak", THE engine SHALL call policy.applyEvent(item, event, now), store the returned health and policyData, set lastEventAt to now, and record a history entry of type "tended" containing the item id, the event, timestamp now, and resulting health.
5. WHEN tend updates an item's health, THE engine SHALL recompute state using the three state derivation rules from Requirement 14.
6. WHEN an item's health drops below policy.thresholds.dead during tend, THE engine SHALL set state to "dead", set diedAt to now, set health to 0, and record a history entry of type "died" with the item id, timestamp now, and health 0.
7. IF tend is called with now less than the item's lastEventAt, THEN THE engine SHALL throw an error indicating that time cannot go backward.
8. IF tend is called with an item ID that does not exist, THEN THE engine SHALL throw an error indicating that the item does not exist.
9. WHEN policy.applyEvent returns a health value greater than 100, THE engine SHALL store health as 100.
10. WHEN policy.applyEvent returns a health value less than 0, THE engine SHALL store health as 0.
11. IF policy.applyEvent returns a non-numeric health value, THEN THE engine SHALL throw an error indicating invalid health type.

### Requirement 4: View Items at a Point in Time

**User Story:** As a developer, I want to see how all items would look at a specific time without modifying storage, so that I can preview future states.

#### Acceptance Criteria

1. WHEN view(now) is called with timestamp now, THE engine SHALL retrieve all items from storage and return an array containing the computed view of each item as it would appear at that timestamp.
2. IF the timestamp now is null, undefined, negative, or non-numeric, THEN THE engine SHALL throw an error as specified in Requirement 11.3.
3. WHEN computing the view of an item where state is not "dead", THE engine SHALL call policy.healthAt(item, now) to compute health at the given timestamp, derive the state from the computed health and policy.thresholds, and return a view object containing the computed health and state without modifying lastEventAt, diedAt, or any stored fields.
4. WHEN computing the view of an item where state is "dead", THE engine SHALL return a view object containing health 0, state "dead", the original diedAt timestamp, and all other item fields unchanged from storage.
5. WHEN deriving state from computed health in a view, THE engine SHALL apply the three state derivation rules from Requirement 14.
6. WHEN view(now) is called multiple times with any timestamp values, THE engine SHALL ensure that all items in storage remain byte-for-byte identical to their state before the first view call, such that reading the same item ID from storage before and after view operations returns objects with identical field values.

### Requirement 5: Tick the Clock

**User Story:** As a developer, I want to advance all items to a specific time and save state changes, so that the system reflects the passage of time.

#### Acceptance Criteria

1. WHEN I call tick(now), THE engine SHALL compute the view at `now` as if calling view(now), and for each item where health has changed OR state has changed, THE engine SHALL set lastEventAt to `now`, persist that item to storage, and record history entries for state transitions, and finally return the count of items modified.
2. IF tick finds an item's health and state unchanged at `now`, THEN THE engine SHALL NOT modify that item's lastEventAt or persist that item.
3. WHEN an item's health drops below policy.thresholds.dead during tick, THE engine SHALL set state to "dead", set diedAt to `now`, set health to 0, and record a history entry of type "died" with the item id, timestamp `now`, and health 0.
4. WHEN an item's state changes between "alive" and "weak" in either direction during tick, THE engine SHALL record a history entry of type "state-changed" with the item id, timestamp `now`, the health after the change, and the from and to states.
5. WHEN I call tick(now1) followed by tick(now1) with the same timestamp, THE engine SHALL detect no changes and write no history entries.
6. IF an item has lastEventAt = T and I call tick with now < T, THEN THE engine SHALL throw an error indicating that time cannot go backward.
7. IF storage persistence fails during tick, THEN THE engine SHALL throw an error indicating the persistence failure, preserve the pre-tick state in memory, and leave storage unchanged.

### Requirement 6: Due Queue

**User Story:** As a developer, I want to retrieve items that need attention at a given time, so that the app can prompt the user to act.

#### Acceptance Criteria

1. WHEN I call due(now) with timestamp `now`, THE engine SHALL compute the health of each non-dead item at `now` using policy.healthAt without persisting any changes.
2. WHEN I call due(now) with timestamp `now`, THE engine SHALL return an array containing only items where the item's health at `now` is greater than or equal to policy.thresholds.dead AND policy.nextDueAt(item, now) returns a timestamp less than or equal to `now`.
3. WHEN due(now) returns an array with 2 or more items, THE engine SHALL sort the array by health at `now` in ascending order, with items of equal health ordered by their item ID in ascending lexicographic order.
4. IF policy.nextDueAt(item, now) returns null for an item, THEN THE engine SHALL exclude that item from the array returned by due(now).

### Requirement 7: Graveyard

**User Story:** As a developer, I want to retrieve all dead items, so that the app can display them for potential resurrection.

#### Acceptance Criteria

1. WHEN I call graveyard(), THEN the engine SHALL return an array containing all items where state is "dead" and only items where state is "dead".
2. WHEN multiple dead items exist, THEN the engine SHALL sort the returned array by diedAt in descending order such that items with larger diedAt timestamps appear before items with smaller diedAt timestamps.
3. WHEN no dead items exist, THEN the engine SHALL return an empty array with length 0.
4. WHEN dead items have identical diedAt timestamps, THEN the engine SHALL preserve deterministic ordering by sorting secondarily by item identifier in ascending order.
5. WHEN graveyard() is called with no arguments, THEN the engine SHALL return results without throwing an error or requiring parameters.

### Requirement 8: Resurrect Items

**User Story:** As a developer, I want to attempt to bring a dead item back to life, so that it can re-enter the lifecycle.

#### Acceptance Criteria

1. WHEN I call resurrect(id, now), THE engine SHALL first settle the item at `now` using policy.healthAt exactly as tick would for that one item, including state derivation and recording a death if health falls below policy.thresholds.dead.
2. WHEN I call resurrect(id, now), THE engine SHALL check that the item's state is "dead" after settling before calling policy.resurrect.
3. IF the item's state is not "dead" after settling, THEN THE engine SHALL throw an error indicating that only dead items can be resurrected without calling policy.resurrect.
4. WHILE a resurrect call for an item is waiting on policy.resurrect to complete, IF a second resurrect call is made for the same item, THEN THE engine SHALL throw an error indicating that a resurrection is already in progress for this item.
5. WHEN I call resurrect(id, now) on a dead item AND policy.resurrect(item, now) returns { ok: true }, THE engine SHALL set health to 100, set state to "alive", clear diedAt, increment timesResurrected by 1, set lastEventAt to now, replace the item's payload with any returned payload, replace the item's policyData with any returned policyData, and record a history entry of type "resurrected" with the item id, timestamp equal to now, and health 100.
6. WHEN I call resurrect(id, now) on a dead item AND policy.resurrect(item, now) returns { ok: false, reason }, THE engine SHALL preserve the item's current health, state, diedAt, timesResurrected, lastEventAt, payload, and policyData without modification, and record a history entry of type "resurrect-failed" with the item id, timestamp equal to now, health 0, and the reason value.
7. IF resurrect is called with now less than the item's lastEventAt, THEN THE engine SHALL throw an error indicating that time cannot go backward.
8. IF resurrect is called with an unknown item ID, THEN THE engine SHALL throw an error indicating that the item does not exist.

### Requirement 9: Item History

**User Story:** As a developer, I want to retrieve the complete history of an item, so that I can show the user what happened over time.

#### Acceptance Criteria

1. WHEN history(id) is called with a valid item ID, THE engine SHALL return an array of all history entries for that item, sorted by timestamp from oldest to newest.
2. IF an item has never been tended, resurrected, or transitioned states, THEN THE engine SHALL return an array containing only the "created" entry when history(id) is called for that item.
3. IF history(id) is called with an unknown item ID, THEN THE engine SHALL throw an Error with a message indicating the item does not exist.
4. THE history entry SHALL contain a type field (string), an item id field (string), a timestamp field (number representing milliseconds since epoch), a health field (number), and type-specific data.
5. THE type field SHALL be one of: "created", "tended", "state-changed", "died", "resurrected", "resurrect-failed".
6. THE "tended" history entry SHALL include the event that was applied.
7. THE "state-changed" history entry SHALL include from and to state fields.
8. THE "resurrect-failed" history entry SHALL include the reason field.
9. WHEN multiple history entries have identical timestamps, THE engine SHALL preserve the order in which the events were recorded.

### Requirement 10: Remove Items

**User Story:** As a developer, I want to delete an item and its history, so that I can remove items that are no longer needed.

#### Acceptance Criteria

1. WHEN remove(id) is called with a valid item ID, THE engine SHALL delete the item and all its history entries atomically such that either both succeed or both fail with no partial state persisted.
2. IF remove(id) is called with an unknown item ID, THEN THE engine SHALL throw an Error with a message indicating the item does not exist.
3. IF any engine function that takes an item ID (tend, resurrect, history, or remove) is called with an item ID that has been successfully removed, THEN THE engine SHALL throw an Error with a message indicating the item does not exist.

### Requirement 11: Time Handling

**User Story:** As a developer, I want the engine to accept time as an argument rather than reading the clock, so that I can test and preview time-dependent behavior.

#### Acceptance Criteria

1. WHEN the engine performs health calculations, event processing, or scheduling operations, THEN it SHALL accept a numeric `now` parameter representing milliseconds since Unix epoch (January 1, 1970 00:00:00 UTC).
2. WHERE the engine package is implemented, THE engine SHALL NOT call Date.now(), new Date(), performance.now(), or any method that reads system time.
3. WHEN a `now` parameter is less than 0, greater than 8640000000000000 (maximum valid JavaScript timestamp), NaN, Infinity, or undefined, THEN the engine SHALL throw an error indicating invalid timestamp.
4. WHERE engine functions accept a `now` parameter, those functions SHALL use only the provided `now` value for all time comparisons, calculations, and state transitions.

### Requirement 12: Storage Adapter Interface

**User Story:** As a developer, I want the engine to persist data through an adapter interface, so that storage can be swapped without changing engine code.

#### Acceptance Criteria

1. WHEN I create a DecayEngine instance with a storage adapter, THEN the engine SHALL use the adapter for all persistence operations.
2. WHERE the storage adapter interface is defined, it SHALL be synchronous and work on complete snapshots, with methods to load a snapshot and save a snapshot, where a snapshot contains the schema version, all items, and all history.
3. IF a storage adapter method throws an error, THEN the engine SHALL propagate that error to the caller without catching it.
4. WHERE the browser localStorage implementation is created, it SHALL be isolated in a separate module that is the only file allowed to import browser APIs.
5. WHEN the storage adapter persists data, THEN it SHALL include a schemaVersion field as an integer in the snapshot.
6. WHEN any engine operation changes data, THE engine SHALL save one complete snapshot, such that a failed save leaves the previous snapshot intact.
7. THE engine SHALL provide two storage adapter implementations: an in-memory adapter for testing and an adapter that persists to browser localStorage.
8. WHERE the localStorage adapter is used, it SHALL accept a namespace string parameter and use that namespace in its storage key, so that each app can maintain separate data.

### Requirement 13: Health Clamping and Validation

**User Story:** As a developer, I want the engine to enforce health constraints, so that policy bugs cannot corrupt item state.

#### Acceptance Criteria

1. WHEN a policy function returns a health value greater than 100, THEN the engine SHALL clamp the value to 100 before storing it.
2. WHEN a policy function returns a health value less than 0, THEN the engine SHALL clamp the value to 0 before storing it.
3. WHEN a policy function returns NaN, Infinity, -Infinity, null, undefined, or any non-number type as health, THEN the engine SHALL throw an error indicating that health must be a finite number.
4. WHEN a policy function returns a numeric health value, THEN the engine SHALL accept both integers and floating-point numbers between 0 and 100 inclusive.
5. WHEN I query an item's health at any time, THEN the stored value SHALL always be a finite number between 0 and 100 inclusive.

### Requirement 14: State Derivation

**User Story:** As a developer, I want item state to be automatically derived from health and thresholds, so that state transitions happen consistently.

#### Acceptance Criteria

1. WHEN an item's health is greater than or equal to policy.thresholds.weak, THEN the engine SHALL set the item's state to "alive".
2. WHEN an item's health is less than policy.thresholds.weak and greater than or equal to policy.thresholds.dead, THEN the engine SHALL set the item's state to "weak".
3. WHEN an item's health is less than policy.thresholds.dead, THEN the engine SHALL set the item's state to "dead" and set the stored health to 0.
4. WHEN an item transitions to "dead" state, THEN the engine SHALL record the current time as the diedAt timestamp.
5. THE policy SHALL define health as a numeric value in the range 0 to 100.
6. THE policy SHALL define policy.thresholds.dead and policy.thresholds.weak such that 0 < policy.thresholds.dead < policy.thresholds.weak <= 100.
7. IF the policy provides thresholds outside the constraint 0 < policy.thresholds.dead < policy.thresholds.weak <= 100, THEN the engine SHALL throw an error indicating invalid threshold configuration.
8. THE stored health SHALL always represent the health as of lastEventAt.
9. WHENEVER the engine stores a new health value for an item (in tick, in settling, in tend, in resurrect), THE engine SHALL also set lastEventAt to `now`.

### Requirement 15: Parser for Storage Schema

**User Story:** As a developer, I want the storage adapter to parse persisted data into item objects, so that the engine can load saved state.

#### Acceptance Criteria

1. WHEN serializing an item, THEN the engine SHALL produce a format that includes all fields: id, payload, policyData, health, state, createdAt, lastEventAt, diedAt, and timesResurrected.
2. WHEN deserializing an item, THEN the engine SHALL validate that required fields (id, payload, policyData, health, state, createdAt, lastEventAt, timesResurrected) exist.
3. WHEN deserializing an item, THEN the engine SHALL validate that id is a non-empty string, health is a number in range 0 to 100, state is one of "alive", "weak", or "dead", createdAt, lastEventAt, and diedAt (if present) are finite numbers greater than or equal to 0, timesResurrected is a non-negative integer, and diedAt is either a finite number greater than or equal to 0 or undefined.
4. IF deserialization validation fails, THEN the engine SHALL throw an error indicating which field failed validation.
5. IF deserializing an item with state "dead" and diedAt undefined, THEN the engine SHALL throw an error indicating missing diedAt for dead item.
6. WHEN an item is serialized and then deserialized, THEN the resulting item SHALL be deeply equal to the original, where deep equality means all fields have identical values and types.
7. WHERE property-based testing is used, THEN the parser SHALL satisfy the round-trip property for all items with valid field values and types.

### Requirement 16: ID Generation

**User Story:** As a developer, I want the engine to generate unique item identifiers, so that items can be referenced consistently.

#### Acceptance Criteria

1. WHEN the engine creates a new item, THEN it SHALL call the provided ID generator to produce a unique string identifier.
2. IF the ID generator returns a non-string or empty string, THEN the engine SHALL throw an error indicating invalid ID generator return value.
3. IF the ID generator returns an id that already exists in the engine, THEN the engine SHALL throw an error indicating duplicate ID.
4. WHERE an ID generator implementation is provided, THEN it SHALL guarantee uniqueness across all items in the engine instance.

### Requirement 17: Error Handling

**User Story:** As a developer, I want clear error messages when operations fail, so that I can diagnose problems quickly.

#### Acceptance Criteria

1. WHEN the engine throws an error, THEN the error message SHALL include the operation name and a description of what went wrong.
2. WHEN an error relates to a specific item, THEN the error message SHALL include the item ID.
3. WHEN an unknown item ID is referenced, THEN the error message SHALL include the ID that was not found.
4. WHEN time goes backward, THEN the error message SHALL include the item's lastEventAt value and the invalid now value provided.
5. WHEN a policy function returns an invalid value, THEN the error message SHALL include the function name and the invalid return value.

### Requirement 18: Correctness Properties

**User Story:** As a developer, I want the engine to be verified with property-based tests, so that I can trust its correctness.

#### Acceptance Criteria

1. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that health is always between 0 and 100 inclusive.
2. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that state always matches health and policy.thresholds according to the three rules in Requirement 14.
3. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that a dead item is never returned by due(now).
4. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that view(now) never changes stored data.
5. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that tick is idempotent for the same `now` value.
6. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that a successful resurrect always yields an item with state "alive" and health 100.
7. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that history entries are always in time order (sorted by timestamp ascending).
8. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that tend never succeeds on an item whose health at `now` is below policy.thresholds.dead.
9. WHERE property-based testing with fast-check is used, THE test suite SHALL verify that splitting time makes no difference: for an item with no events between times t1 and t2, calling tick(t1) then view(t2) produces the same health as calling view(t2) directly, for any t1 <= t2, within floating-point tolerance.
10. WHERE the fake policy used in property-based tests is implemented, it SHALL include time-based decay computed from item.health and item.lastEventAt.
11. WHERE property-based tests are implemented, THE tests SHALL use a fake policy and SHALL NOT use the real clock.
