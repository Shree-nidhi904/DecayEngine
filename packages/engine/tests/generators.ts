// Shared fast-check generators and helpers for the property tests.
// Source of truth: .kiro/specs/engine/design.md (Testing Strategy, Property-Based
// Tests: Generators and helpers).
//
// Items are built by running real engine operations, never by generating
// field values. Timestamps never decrease and advance in whole minutes.
// The fake policy loses 1 health per hour (weak below 50, dead below 20), so
// gaps of up to 6 hours and offsets of up to 120 hours reach alive, weak and
// dead items often; tests/properties/generator-coverage.test.ts enforces it.

import fc from "fast-check"
import { DecayEngine } from "../src/engine"
import { DecayEngineError } from "../src/errors"
import { InMemoryAdapter } from "../src/storage/memory"
import { FakePolicy } from "./fake-policy"
import type { FakeEvent, FakePayload, FakePolicyData } from "./fake-policy"

export const HOUR_MS = 3_600_000
export const MINUTE_MS = 60_000
// Fixed base time (2023-11-14). Tests never read the real clock.
export const BASE_TIME = 1_700_000_000_000

export type FakeEngine = DecayEngine<FakePayload, FakePolicyData, FakeEvent>

export type Command =
  | { kind: "add"; at: number; importance: number; costMinutes: number; name: string }
  | { kind: "tend"; at: number; target: number; event: FakeEvent }
  | { kind: "tick"; at: number }
  | { kind: "edit"; at: number; target: number; importance?: number; costMinutes?: number; name?: string }

// Event amounts are small integers: JSON-safe, and large enough that a
// damage event sometimes kills.
export function event(): fc.Arbitrary<FakeEvent> {
  return fc.oneof(
    fc.record({ type: fc.constant("boost" as const), amount: fc.integer({ min: 0, max: 40 }) }),
    fc.record({ type: fc.constant("damage" as const), amount: fc.integer({ min: 0, max: 60 }) })
  )
}

const name = fc.constantFrom("Capital of Peru", "Boiling point", "Ohm's law", "Krebs cycle")

// A command without its time; `gap` is minutes since the previous command.
const step = fc.oneof(
  { weight: 4, arbitrary: fc.record({
    kind: fc.constant("add" as const),
    gap: fc.integer({ min: 0, max: 360 }),
    importance: fc.integer({ min: 1, max: 3 }),
    costMinutes: fc.integer({ min: 1, max: 60 }),
    name,
  }) },
  { weight: 3, arbitrary: fc.record({
    kind: fc.constant("tend" as const),
    gap: fc.integer({ min: 0, max: 360 }),
    target: fc.nat(),
    event: event(),
  }) },
  { weight: 1, arbitrary: fc.record({
    kind: fc.constant("tick" as const),
    gap: fc.integer({ min: 0, max: 360 }),
  }) },
  { weight: 1, arbitrary: fc.record(
    {
      kind: fc.constant("edit" as const),
      gap: fc.integer({ min: 0, max: 360 }),
      target: fc.nat(),
      importance: fc.integer({ min: 1, max: 3 }),
      costMinutes: fc.integer({ min: 1, max: 60 }),
      name,
    },
    // edit needs at least one field; requiredKeys keeps `importance`
    { requiredKeys: ["kind", "gap", "target", "importance"] }
  ) }
)

type Step = typeof step extends fc.Arbitrary<infer S> ? S : never

function withTimes(steps: Step[]): Command[] {
  let at = BASE_TIME
  return steps.map((s) => {
    at += s.gap * MINUTE_MS
    const { gap: _gap, ...rest } = s
    return { ...rest, at } as Command
  })
}

/** Engine operations with non-decreasing timestamps. */
export function commandSequence(): fc.Arbitrary<Command[]> {
  return fc.array(step, { minLength: 1, maxLength: 30 }).map(withTimes)
}

/** Like commandSequence, but adds at most 10 items (Property 14). */
export function smallCommandSequence(): fc.Arbitrary<Command[]> {
  return fc
    .array(step, { minLength: 1, maxLength: 30 })
    .filter((steps) => steps.filter((s) => s.kind === "add").length <= 10)
    .map(withTimes)
}

/** Whole minutes, 0 to 120 hours. Add it to latestTimestamp so `now` never goes backward. */
export function offset(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 120 * 60 }).map((minutes) => minutes * MINUTE_MS)
}

/** Any valid time near the generated sequences. For view and due only. */
export function timestamp(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 240 * 60 }).map((minutes) => BASE_TIME + minutes * MINUTE_MS)
}

export function latestTimestamp(commands: readonly Command[]): number {
  return commands.reduce((latest, c) => Math.max(latest, c.at), BASE_TIME)
}

export function counterIds(): () => string {
  let n = 0
  return () => `item-${String(++n).padStart(3, "0")}`
}

// The one expected error: a generated tend can target an item that has died.
function ignoringAlreadyDead(run: () => void): void {
  try {
    run()
  } catch (error) {
    if (error instanceof DecayEngineError && error.code === "ITEM_ALREADY_DEAD") return
    throw error
  }
}

export function runCommands(engine: FakeEngine, commands: readonly Command[]): string[] {
  const ids: string[] = []
  for (const c of commands) {
    switch (c.kind) {
      case "add":
        ids.push(
          engine.addItem({ payload: { name: c.name }, importance: c.importance, costMinutes: c.costMinutes }, c.at)
        )
        break
      case "tend": {
        if (ids.length === 0) break
        const id = ids[c.target % ids.length]!
        ignoringAlreadyDead(() => engine.tend(id, c.event, c.at))
        break
      }
      case "tick":
        engine.tick(c.at)
        break
      case "edit": {
        if (ids.length === 0) break
        const changes: { payload?: FakePayload; importance?: number; costMinutes?: number } = {}
        if (c.name !== undefined) changes.payload = { name: c.name }
        if (c.importance !== undefined) changes.importance = c.importance
        if (c.costMinutes !== undefined) changes.costMinutes = c.costMinutes
        engine.edit(ids[c.target % ids.length]!, changes, c.at)
        break
      }
    }
  }
  return ids
}

/** A fresh engine (fake policy unless given), in-memory adapter and counter ids, with the commands run. */
export function buildEngine(
  commands: readonly Command[],
  options: { policy?: FakePolicy } = {}
): { engine: FakeEngine; adapter: InMemoryAdapter; policy: FakePolicy } {
  const policy = options.policy ?? new FakePolicy()
  const adapter = new InMemoryAdapter()
  const engine: FakeEngine = new DecayEngine(policy, adapter, counterIds())
  runCommands(engine, commands)
  return { engine, adapter, policy }
}
