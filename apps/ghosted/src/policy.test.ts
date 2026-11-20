// Tests for the Ghosted policy. SCAFFOLD ONLY.
// Created by the "Scaffold a new decay policy" hook.
//
// Every test is `it.todo`, so the run reports them as unfinished instead of
// passing on empty bodies (.kiro/steering/no-fake-tests.md). Fill them in once
// the developer has written policy.ts. Use fixed timestamps, never the real
// clock; property tests keep { numRuns: 100 } or more, and their generators
// must reach alive, weak and dead people.
import { describe, it } from "vitest"

describe("ghostedPolicy: properties", () => {
  it.todo("health stays within 0-100 for any person and time")
  it.todo("same input at the same moment gives the same output (healthAt, applyEvent, nextDueAt, resurrect)")
  it.todo("healthAt never increases with time between events")
  it.todo("passes checkPolicy from @decay-engine/engine")
})

describe("ghostedPolicy: outcomes", () => {
  // Expected values from the reference table in .kiro/specs/engine/design.md
  // (30-day rhythm, last contact day 0): alive day 36 (exactly 60), weak day 37,
  // weak day 81 (exactly 10), dead day 82, diedAt within 1 minute after day 81.
  it.todo("30-day rhythm, never tended: dies on day 82 (diedAt just after day 81)")
})
