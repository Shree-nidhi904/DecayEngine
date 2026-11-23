// Fixed times and helpers for Insight's tests. Tests never read the clock:
// every time is T0 plus an offset.

import type { HistoryEntry, Item } from "@decay-engine/engine"

/** 1 Nov 2026, 00:00 UTC, in milliseconds. */
export const T0 = 1_793_491_200_000
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export const ITEM_ID = "item-1"

/** Calls fn and returns what it threw. Fails the test if it did not throw. */
export function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error("expected the call to throw, but it returned")
}

/** Freezes a value and everything inside it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

/**
 * The path of the first value JSON cannot keep as it is (undefined, NaN,
 * Infinity, -0, a function, a symbol, a non-plain object), or null.
 */
export function findNonJson(value: unknown, path = "result"): string | null {
  if (value === undefined) return `${path} is undefined`
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `${path} is ${String(value)}`
    if (Object.is(value, -0)) return `${path} is -0`
    return null
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return null
  if (typeof value !== "object") return `${path} is a ${typeof value}`
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNonJson(value[i], `${path}[${i}]`)
      if (found !== null) return found
    }
    return null
  }
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return `${path} is not a plain object`
  for (const [key, inner] of Object.entries(value)) {
    const found = findNonJson(inner, `${path}.${key}`)
    if (found !== null) return found
  }
  return null
}

/** Entries of one type, typed. */
export function entriesOf<T extends HistoryEntry["type"]>(
  history: readonly HistoryEntry[],
  type: T
): Extract<HistoryEntry, { type: T }>[] {
  return history.filter((e): e is Extract<HistoryEntry, { type: T }> => e.type === type)
}

/** Index of the first entry of a type at a timestamp, for expected `skipped` and `stoppedAt` values. */
export function indexOf(history: readonly HistoryEntry[], type: HistoryEntry["type"], timestamp: number): number {
  const index = history.findIndex((e) => e.type === type && e.timestamp === timestamp)
  if (index === -1) throw new Error(`no ${type} entry at ${timestamp}`)
  return index
}

/** A hand-built item, for histories written out in a test. */
export function makeItem<Payload, PolicyData>(
  payload: Payload,
  policyData: PolicyData,
  overrides: Partial<Item<Payload, PolicyData>> = {}
): Item<Payload, PolicyData> {
  return {
    id: ITEM_ID,
    payload,
    policyData,
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 10,
    ...overrides,
  }
}
