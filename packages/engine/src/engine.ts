// DecayEngine: the stateful wrapper around the pure modules (settle, bisection,
// serialization). Holds the policy, the storage adapter, the id generator and
// the in-memory state, and persists every change through one method.
// Source of truth: .kiro/specs/engine/design.md (Engine API, Atomic Persistence)
// and .kiro/specs/engine/requirements.md (Requirements 1, 11 and 12).
//
// The engine never reads the clock: every operation receives `now`.

import { DecayEngineError } from "./errors"
import { parseSnapshot, serializeSnapshot } from "./serialization"
import { autopsy } from "./autopsy"
import { forecast } from "./forecast"
import { settle } from "./settle"
import { triage } from "./triage"
import { applyHealth, clampHealth, deriveState, validateThresholds } from "./state-derivation"
import type {
  AutopsyReport,
  DecayPolicy,
  EngineState,
  ForecastEntry,
  HistoryEntry,
  IdGenerator,
  Item,
  ResurrectOutcome,
  StorageAdapter,
  TriageResult,
} from "./types"

// Re-exported for existing imports; defined in types.ts to avoid import cycles.
import { MAX_TIMESTAMP } from "./types"
export { MAX_TIMESTAMP }

// Deep copy. Items are JSON-serializable by contract (see types.ts).
function cloneItem<Payload, PolicyData>(
  item: Item<Payload, PolicyData>
): Item<Payload, PolicyData> {
  return JSON.parse(JSON.stringify(item)) as Item<Payload, PolicyData>
}

type ResurrectResult<Payload, PolicyData> =
  | { ok: true; payload?: Payload; policyData?: PolicyData }
  | { ok: false; reason: string }

// A malformed result is a policy bug, not a lost fight, so it is rejected
// rather than recorded as a failed resurrection.
function isResurrectResult<Payload, PolicyData>(
  value: unknown
): value is ResurrectResult<Payload, PolicyData> {
  if (typeof value !== "object" || value === null) return false
  const { ok, reason } = value as { ok?: unknown; reason?: unknown }
  return ok === true || (ok === false && typeof reason === "string")
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

// Plain lexicographic (UTF-16 code unit) order, independent of locale.
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function validateImportance(importance: unknown, operation: string): void {
  if (typeof importance !== "number" || !Number.isInteger(importance) || importance < 1 || importance > 3) {
    throw new DecayEngineError(
      "INVALID_IMPORTANCE",
      `${operation} failed: importance must be an integer from 1 to 3, got ${String(importance)}`
    )
  }
}

function validateCostMinutes(costMinutes: unknown, operation: string): void {
  if (
    typeof costMinutes !== "number" ||
    !Number.isInteger(costMinutes) ||
    costMinutes < 1 ||
    costMinutes > 600
  ) {
    throw new DecayEngineError(
      "INVALID_COST_MINUTES",
      `${operation} failed: costMinutes must be a positive integer at most 600, got ${String(costMinutes)}`
    )
  }
}

/**
 * Tracks items through alive, weak and dead using a policy supplied by the app.
 * Every operation takes the current time as `now` (milliseconds); the engine
 * never reads the clock. Every change is saved through the storage adapter
 * before memory is updated, so a failed save leaves both unchanged.
 *
 * @typeParam Payload - App data about an item; stored, never read by the engine. JSON-serializable.
 * @typeParam PolicyData - Data the policy keeps per item. JSON-serializable.
 * @typeParam Event - What the app passes to tend and resurrect. JSON-serializable.
 */
export class DecayEngine<Payload, PolicyData, Event> {
  private readonly _policy: DecayPolicy<Payload, PolicyData, Event>
  private readonly _adapter: StorageAdapter
  private readonly _idGenerator: IdGenerator
  private _state: EngineState<Payload, PolicyData>

  /**
   * Creates an engine and loads any saved snapshot from the adapter (Requirement 1).
   *
   * @param policy - The decay policy (thresholds and the five policy functions).
   * @param adapter - Where snapshots are loaded from and saved to.
   * @param idGenerator - Returns a new, unique, non-empty id for each addItem call.
   * @throws DecayEngineError MISSING_POLICY, MISSING_STORAGE_ADAPTER or
   *   MISSING_ID_GENERATOR when an argument is null or undefined.
   * @throws DecayEngineError INVALID_THRESHOLDS when policy.thresholds is not
   *   an object or breaks a threshold rule.
   * @throws DecayEngineError UNSUPPORTED_SCHEMA_VERSION, INVALID_SNAPSHOT or
   *   INVALID_ITEM_DATA when the loaded snapshot cannot be used.
   * @throws Any error thrown by adapter.load(), unchanged.
   */
  constructor(
    policy: DecayPolicy<Payload, PolicyData, Event>,
    adapter: StorageAdapter,
    idGenerator: IdGenerator
  ) {
    if (policy === null || policy === undefined) {
      throw new DecayEngineError(
        "MISSING_POLICY",
        "DecayEngine constructor failed: a policy is required"
      )
    }
    if (adapter === null || adapter === undefined) {
      throw new DecayEngineError(
        "MISSING_STORAGE_ADAPTER",
        "DecayEngine constructor failed: a storage adapter is required"
      )
    }
    if (idGenerator === null || idGenerator === undefined) {
      throw new DecayEngineError(
        "MISSING_ID_GENERATOR",
        "DecayEngine constructor failed: an id generator is required"
      )
    }

    const thresholds: unknown = policy.thresholds
    if (typeof thresholds !== "object" || thresholds === null) {
      throw new DecayEngineError(
        "INVALID_THRESHOLDS",
        "DecayEngine constructor failed: policy.thresholds must be an object with weak and dead"
      )
    }
    validateThresholds(policy.thresholds)

    this._policy = policy
    this._adapter = adapter
    this._idGenerator = idGenerator

    // Load once. Adapter errors propagate (Requirement 12.3); an unsupported
    // schemaVersion or invalid data is reported by parseSnapshot.
    const snapshot = adapter.load()
    this._state =
      snapshot === null
        ? { items: new Map(), history: new Map() }
        : parseSnapshot<Payload, PolicyData>(snapshot)
  }

  /**
   * Creates an item and returns its id (Requirement 2).
   * Starting health comes from policy.healthAt on a provisional item at health 100.
   * An item whose starting health is below the dead threshold starts dead,
   * with diedAt = createdAt = now (no bisection).
   *
   * @param params - payload (app data), importance (integer 1 to 3) and
   *   costMinutes (minutes to tend, integer 1 to 600).
   * @param now - Current time in milliseconds.
   * @returns The new item's id.
   * @throws DecayEngineError INVALID_TIMESTAMP, INVALID_IMPORTANCE or
   *   INVALID_COST_MINUTES for invalid arguments.
   * @throws DecayEngineError INVALID_ID or DUPLICATE_ID when the id generator
   *   returns an empty, non-string or already used id.
   * @throws DecayEngineError INVALID_HEALTH when policy.healthAt returns a
   *   non-finite value.
   * @throws Errors from policy.init, policy.healthAt or adapter.save, unchanged.
   *   Nothing is kept when one is thrown.
   */
  addItem(
    params: { payload: Payload; importance: number; costMinutes: number },
    now: number
  ): string {
    const op = "addItem"
    this._validateNow(now, op)

    const { payload, importance, costMinutes } = params
    validateImportance(importance, op)
    validateCostMinutes(costMinutes, op)

    const id: unknown = this._idGenerator()
    if (typeof id !== "string" || id.length === 0) {
      throw new DecayEngineError(
        "INVALID_ID",
        `${op} failed: id generator returned an invalid id ${JSON.stringify(id) ?? String(id)}; expected a non-empty string`
      )
    }
    if (this._state.items.has(id)) {
      throw new DecayEngineError("DUPLICATE_ID", `${op} failed: id generator returned duplicate id ${id}`)
    }

    // Policy errors propagate; nothing has been stored yet.
    const policyData = this._policy.init(payload, now)

    const provisional: Item<Payload, PolicyData> = {
      id,
      payload,
      policyData,
      health: 100,
      state: "alive",
      createdAt: now,
      lastEventAt: now,
      timesResurrected: 0,
      importance,
      costMinutes,
    }
    const startingHealth = clampHealth(this._policy.healthAt(provisional, now), "healthAt")
    const state = deriveState(startingHealth, this._policy.thresholds)

    const item: Item<Payload, PolicyData> = { ...provisional, health: startingHealth, state }
    const entries: HistoryEntry[] = [
      { type: "created", itemId: id, timestamp: now, health: startingHealth },
    ]
    if (state === "dead") {
      item.health = 0
      item.diedAt = now
      entries.push({ type: "died", itemId: id, timestamp: now, health: 0 })
    }

    this._persist([item], entries)
    return id
  }

  /**
   * Every item as it would be at `now` (Requirement 4). Read-only: settles each
   * item without saving it and discards the history entries. Returns copies, so
   * callers cannot change stored data through them. Items whose lastEventAt is
   * after `now` are returned as stored.
   *
   * @param now - The time to look at, in milliseconds. May be in the past or future.
   * @returns A copy of every item, settled at `now`.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError INVALID_HEALTH when policy.healthAt returns a
   *   non-finite value.
   */
  view(now: number): Item<Payload, PolicyData>[] {
    this._validateNow(now, "view")
    const result: Item<Payload, PolicyData>[] = []
    for (const item of this._state.items.values()) {
      result.push(cloneItem(settle(item, this._policy, now).item))
    }
    return result
  }

  /**
   * Advances every item to `now` and saves what changed (Requirement 5).
   * Returns the number of items whose health or state changed. Crossing times
   * in history come from settle's bisection. Throws TIME_WENT_BACKWARD, before
   * changing anything, if `now` is earlier than any item's lastEventAt.
   *
   * @param now - Current time in milliseconds.
   * @returns How many items changed.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError TIME_WENT_BACKWARD when `now` is before an item's lastEventAt.
   * @throws DecayEngineError INVALID_HEALTH when policy.healthAt returns a
   *   non-finite value.
   * @throws Errors from adapter.save, unchanged.
   */
  tick(now: number): number {
    const op = "tick"
    this._validateNow(now, op)

    // Check every item first so a backward step changes nothing.
    for (const item of this._state.items.values()) {
      this._checkNotBackward(item, now, op)
    }

    const changedItems: Item<Payload, PolicyData>[] = []
    const entries: HistoryEntry[] = []
    for (const item of this._state.items.values()) {
      const settled = settle(item, this._policy, now)
      // settle returns the stored item itself when nothing changed
      if (settled.item !== item) {
        changedItems.push(settled.item)
        entries.push(...settled.historyEntries)
      }
    }

    if (changedItems.length > 0) {
      this._persist(changedItems, entries)
    }
    return changedItems.length
  }

  /**
   * Applies an event to an item (Requirement 3). The item is settled at `now`
   * first. If it died while untended, that death is saved and ITEM_ALREADY_DEAD
   * is thrown; the event is not applied. Otherwise policy.applyEvent receives the
   * settled item, and its health (clamped) and policyData are stored.
   * Deaths caused by the event itself are dated `now` (no bisection).
   *
   * @param id - The item to tend.
   * @param event - App-defined event passed to policy.applyEvent and saved in history.
   * @param now - Current time in milliseconds.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   * @throws DecayEngineError TIME_WENT_BACKWARD when `now` is before the item's lastEventAt.
   * @throws DecayEngineError ITEM_ALREADY_DEAD when the item is dead at `now`.
   * @throws DecayEngineError INVALID_HEALTH when the policy returns a non-finite health.
   * @throws Errors from policy.applyEvent, policy.healthAt or adapter.save, unchanged.
   */
  tend(id: string, event: Event, now: number): void {
    const op = "tend"
    this._validateNow(now, op)
    const stored = this._getItem(id, op)
    this._checkNotBackward(stored, now, op)

    const settled = settle(stored, this._policy, now)
    if (settled.item.state === "dead") {
      if (settled.historyEntries.length > 0) {
        this._persist([settled.item], settled.historyEntries)
      }
      throw new DecayEngineError(
        "ITEM_ALREADY_DEAD",
        `${op} failed: item ${id} is dead and cannot be tended`
      )
    }

    const result = this._policy.applyEvent(settled.item, event, now)
    const newHealth = clampHealth(result?.health, "applyEvent")
    const { item: updated, historyEntries: transitions } = applyHealth(
      { ...settled.item, policyData: result.policyData },
      newHealth,
      now,
      this._policy.thresholds
    )

    const entries: HistoryEntry[] = [
      ...settled.historyEntries,
      { type: "tended", itemId: id, timestamp: now, health: updated.health, event },
      ...transitions,
    ]
    this._persist([updated], entries)
  }

  /**
   * Tries to bring a dead item back (Requirement 8). Synchronous. The item is
   * settled at `now` first; if it is not dead then, ITEM_NOT_DEAD is thrown and
   * nothing is saved or asked of the policy. policy.resurrect receives the
   * settled item and the event.
   * - ok: health 100, state alive, diedAt cleared, timesResurrected + 1,
   *   payload / policyData replaced when the policy returns them.
   * - not ok: the item stays as it is (dead) and a resurrect-failed entry
   *   records the event and reason.
   * A death found while settling is saved together with the outcome.
   *
   * @param id - The dead item to bring back.
   * @param event - App-defined event (for example the user's answer) passed to
   *   policy.resurrect and saved in history.
   * @param now - Current time in milliseconds.
   * @returns `{ ok: true }`, or `{ ok: false, reason }` with the policy's reason.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   * @throws DecayEngineError TIME_WENT_BACKWARD when `now` is before the item's lastEventAt.
   * @throws DecayEngineError ITEM_NOT_DEAD when the item is not dead at `now`.
   * @throws DecayEngineError INVALID_POLICY_RESULT when policy.resurrect returns
   *   anything other than `{ ok: true, ... }` or `{ ok: false, reason: string }`;
   *   nothing is saved.
   * @throws Errors from policy.resurrect or adapter.save, unchanged.
   */
  resurrect(id: string, event: Event, now: number): ResurrectOutcome {
    const op = "resurrect"
    this._validateNow(now, op)
    const stored = this._getItem(id, op)
    this._checkNotBackward(stored, now, op)

    const settled = settle(stored, this._policy, now)
    if (settled.item.state !== "dead") {
      throw new DecayEngineError(
        "ITEM_NOT_DEAD",
        `${op} failed: item ${id} is ${settled.item.state}; only dead items can be resurrected`
      )
    }

    const result: unknown = this._policy.resurrect(settled.item, event, now)
    if (!isResurrectResult<Payload, PolicyData>(result)) {
      throw new DecayEngineError(
        "INVALID_POLICY_RESULT",
        `${op} failed: policy resurrect returned invalid value ${describe(result)} for item ${id}; ` +
          `expected { ok: true } or { ok: false, reason: string }`
      )
    }

    if (result.ok) {
      const { diedAt: _cleared, ...living } = settled.item
      const revived: Item<Payload, PolicyData> = {
        ...living,
        payload: result.payload !== undefined ? result.payload : living.payload,
        policyData: result.policyData !== undefined ? result.policyData : living.policyData,
        health: 100,
        state: "alive",
        lastEventAt: now,
        timesResurrected: living.timesResurrected + 1,
      }
      this._persist(
        [revived],
        [
          ...settled.historyEntries,
          { type: "resurrected", itemId: id, timestamp: now, health: 100, event },
        ]
      )
      return { ok: true }
    }

    const reason = result.reason
    this._persist(
      [settled.item],
      [
        ...settled.historyEntries,
        { type: "resurrect-failed", itemId: id, timestamp: now, health: 0, event, reason },
      ]
    )
    return { ok: false, reason }
  }

  /**
   * Replaces some of payload, importance and costMinutes (Requirement 8a).
   * The item is settled at `now` first.
   * - Dead item: fields are replaced, health stays 0, diedAt is kept and
   *   healthAt is not called.
   * - Living item: health is recomputed with policy.healthAt on the edited item;
   *   if that kills it, diedAt is `now` (the settled item's interval is empty).
   * Records an "edited" entry listing the provided fields.
   *
   * @param id - The item to edit.
   * @param changes - At least one of payload, importance (integer 1 to 3) and
   *   costMinutes (integer 1 to 600).
   * @param now - Current time in milliseconds.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError EDIT_REQUIRES_FIELD when no field is given.
   * @throws DecayEngineError INVALID_IMPORTANCE or INVALID_COST_MINUTES for invalid values.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   * @throws DecayEngineError TIME_WENT_BACKWARD when `now` is before the item's lastEventAt.
   * @throws DecayEngineError INVALID_HEALTH when policy.healthAt returns a non-finite value.
   * @throws Errors from policy.healthAt or adapter.save, unchanged.
   */
  edit(
    id: string,
    changes: { payload?: Payload; importance?: number; costMinutes?: number },
    now: number
  ): void {
    const op = "edit"
    this._validateNow(now, op)

    const { payload, importance, costMinutes } = changes ?? {}
    const fieldsChanged: string[] = []
    if (payload !== undefined) fieldsChanged.push("payload")
    if (importance !== undefined) fieldsChanged.push("importance")
    if (costMinutes !== undefined) fieldsChanged.push("costMinutes")
    if (fieldsChanged.length === 0) {
      throw new DecayEngineError(
        "EDIT_REQUIRES_FIELD",
        `${op} failed: provide at least one of payload, importance or costMinutes for item ${id}`
      )
    }
    if (importance !== undefined) validateImportance(importance, op)
    if (costMinutes !== undefined) validateCostMinutes(costMinutes, op)

    const stored = this._getItem(id, op)
    this._checkNotBackward(stored, now, op)
    const settled = settle(stored, this._policy, now)

    const edited: Item<Payload, PolicyData> = { ...settled.item }
    if (payload !== undefined) edited.payload = payload
    if (importance !== undefined) edited.importance = importance
    if (costMinutes !== undefined) edited.costMinutes = costMinutes

    if (edited.state === "dead") {
      edited.lastEventAt = now
      this._persist(
        [edited],
        [
          ...settled.historyEntries,
          { type: "edited", itemId: id, timestamp: now, health: 0, fieldsChanged },
        ]
      )
      return
    }

    const newHealth = clampHealth(this._policy.healthAt(edited, now), "healthAt")
    const { item: updated, historyEntries: transitions } = applyHealth(
      edited,
      newHealth,
      now,
      this._policy.thresholds
    )
    this._persist(
      [updated],
      [
        ...settled.historyEntries,
        { type: "edited", itemId: id, timestamp: now, health: updated.health, fieldsChanged },
        ...transitions,
      ]
    )
  }

  /**
   * Which weak items to tend within budgetMinutes (Requirement 17b). Read-only.
   *
   * @param budgetMinutes - Minutes available, an integer from 1 to 1440.
   * @param now - Current time in milliseconds.
   * @returns `picks`: the weak items with the largest total value whose
   *   costMinutes fit the budget, by value per minute descending. `others`:
   *   the remaining weak items, soonest death first.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError INVALID_BUDGET for an invalid budgetMinutes.
   */
  triage(budgetMinutes: number, now: number): TriageResult<Payload, PolicyData> {
    this._validateNow(now, "triage")
    return triage(this._state.items.values(), budgetMinutes, this._policy, now)
  }

  /**
   * Fact-only report on how a dead item died (Requirement 17c). Read-only:
   * the item is settled in memory, so a death not yet ticked is still found.
   *
   * @param id - The dead item.
   * @param now - Current time in milliseconds.
   * @returns Facts about the item's current life and death; the app writes the words.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   * @throws DecayEngineError AUTOPSY_REQUIRES_DEAD_ITEM when the item is not dead at `now`.
   */
  autopsy(id: string, now: number): AutopsyReport<Event> {
    const op = "autopsy"
    this._validateNow(now, op)
    const item = this._getItem(id, op)
    return autopsy<Payload, PolicyData, Event>(item, this._state.history.get(id) ?? [], this._policy, now)
  }

  /**
   * Items that die within horizonMs after `now`, soonest first, ties by id
   * ascending (Requirement 17d). Read-only: items are settled in memory only.
   * view(entry.diesAt) shows each returned item dead.
   *
   * @param now - Current time in milliseconds.
   * @param horizonMs - How far ahead to look, in milliseconds; a positive finite number.
   * @returns One entry per item that dies in the horizon, with the item as
   *   settled at `now` and its diesAt (to 1-minute precision).
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError INVALID_HORIZON for an invalid horizonMs.
   */
  forecast(now: number, horizonMs: number): ForecastEntry<Payload, PolicyData>[] {
    const op = "forecast"
    this._validateNow(now, op)
    if (typeof horizonMs !== "number" || !Number.isFinite(horizonMs) || horizonMs <= 0) {
      throw new DecayEngineError(
        "INVALID_HORIZON",
        `${op} failed: horizonMs must be a positive finite number, got ${String(horizonMs)}`
      )
    }
    return forecast(this._state.items.values(), now, horizonMs, this._policy)
  }

  /**
   * Items that need attention at `now` (Requirement 6). Read-only. An item is
   * due when it is not dead at `now` and policy.nextDueAt(settled item, now)
   * is a time at or before `now`; null means never due. Sorted by health at
   * `now` ascending, then id ascending. Items whose lastEventAt is after `now`
   * are judged on their stored health (no error).
   *
   * @param now - Current time in milliseconds.
   * @returns Copies of the due items, settled at `now`.
   * @throws DecayEngineError INVALID_TIMESTAMP for an invalid `now`.
   * @throws DecayEngineError INVALID_POLICY_RESULT when policy.nextDueAt returns
   *   something other than a number or null.
   * @throws DecayEngineError INVALID_HEALTH when policy.healthAt returns a non-finite value.
   */
  due(now: number): Item<Payload, PolicyData>[] {
    this._validateNow(now, "due")
    const result: Item<Payload, PolicyData>[] = []
    for (const item of this._state.items.values()) {
      if (item.state === "dead") continue
      const settled = settle(item, this._policy, now).item
      if (settled.state === "dead") continue

      const nextDueAt: unknown = this._policy.nextDueAt(settled, now)
      if (nextDueAt === null) continue
      if (typeof nextDueAt !== "number" || Number.isNaN(nextDueAt)) {
        throw new DecayEngineError(
          "INVALID_POLICY_RESULT",
          `due failed: policy nextDueAt returned invalid value ${String(nextDueAt)} ` +
            `for item ${item.id}; expected a number or null`
        )
      }
      if (nextDueAt <= now) {
        result.push(cloneItem(settled))
      }
    }
    return result.sort((a, b) => a.health - b.health || compareIds(a.id, b.id))
  }

  /**
   * All dead items, most recent death first, ties by id ascending (Requirement 7).
   * Read-only and takes no time: an item that has decayed past death but was
   * never settled is not dead in storage yet (call tick first).
   *
   * @returns Copies of the dead items as stored.
   */
  graveyard(): Item<Payload, PolicyData>[] {
    const dead: Item<Payload, PolicyData>[] = []
    for (const item of this._state.items.values()) {
      if (item.state === "dead") dead.push(cloneItem(item))
    }
    return dead.sort((a, b) => (b.diedAt ?? 0) - (a.diedAt ?? 0) || compareIds(a.id, b.id))
  }

  /**
   * The item's history, oldest first; entries recorded at the same time keep
   * the order they were recorded in (Requirement 9). Returns a copy.
   *
   * @param id - The item whose history to return.
   * @returns A copy of the item's history entries.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   */
  history(id: string): HistoryEntry[] {
    this._getItem(id, "history")
    const entries = this._state.history.get(id) ?? []
    return JSON.parse(JSON.stringify(entries)) as HistoryEntry[]
  }

  /**
   * Deletes an item and all its history in one save (Requirement 10). If the
   * save fails, nothing changes in storage or memory.
   *
   * @param id - The item to delete.
   * @throws DecayEngineError ITEM_NOT_FOUND for an unknown id.
   * @throws Errors from adapter.save, unchanged.
   */
  remove(id: string): void {
    this._getItem(id, "remove")
    const items = new Map(this._state.items)
    const history = new Map(this._state.history)
    items.delete(id)
    history.delete(id)
    this._commit({ items, history })
  }

  // Write operations refuse to move an item back in time (Requirement 3.7, 5.6).
  private _checkNotBackward(item: Item<Payload, PolicyData>, now: number, operation: string): void {
    if (now < item.lastEventAt) {
      throw new DecayEngineError(
        "TIME_WENT_BACKWARD",
        `${operation} failed: time went backward: now=${now} < lastEventAt=${item.lastEventAt} for item ${item.id}`
      )
    }
  }

  // Throws INVALID_TIMESTAMP unless now is a finite number in [0, MAX_TIMESTAMP].
  private _validateNow(now: unknown, operation: string): asserts now is number {
    if (
      typeof now !== "number" ||
      !Number.isFinite(now) ||
      now < 0 ||
      now > MAX_TIMESTAMP
    ) {
      throw new DecayEngineError(
        "INVALID_TIMESTAMP",
        `${operation} failed: invalid timestamp now=${String(now)}; ` +
          `must be a finite number from 0 to ${MAX_TIMESTAMP}`
      )
    }
  }

  // Throws ITEM_NOT_FOUND naming the id.
  private _getItem(id: string, operation: string): Item<Payload, PolicyData> {
    const item = this._state.items.get(id)
    if (item === undefined) {
      throw new DecayEngineError("ITEM_NOT_FOUND", `${operation} failed: item ${id} not found`)
    }
    return item
  }

  // Builds the new state, saves it, and only then replaces the in-memory state.
  // A failed save throws before memory changes, so storage and memory stay in sync.
  private _persist(
    changedItems: Item<Payload, PolicyData>[],
    newHistoryEntries: HistoryEntry[]
  ): void {
    const newItems = new Map(this._state.items)
    for (const item of changedItems) {
      newItems.set(item.id, item)
    }

    const newHistory = new Map(this._state.history)
    for (const item of changedItems) {
      if (!newHistory.has(item.id)) {
        newHistory.set(item.id, [])
      }
    }
    for (const entry of newHistoryEntries) {
      const entries = newHistory.get(entry.itemId) ?? []
      newHistory.set(entry.itemId, [...entries, entry])
    }

    this._commit({ items: newItems, history: newHistory })
  }

  // Saves a complete new state, then (only if the save succeeded) adopts it.
  private _commit(engineState: EngineState<Payload, PolicyData>): void {
    this._adapter.save(serializeSnapshot(engineState))
    this._state = engineState
  }
}
