// The time dock's timeline (visual pass, Pass 3). A real engine at fixed
// times. Expected days come from the policy maths:
//   solid (half-life 10): weak at 10 × log2(100/60) ≈ 7.37 days → day 8,
//                         dead at 10 × log2(100/10) ≈ 33.2 days → day 34
//   new (half-life 2):    weak at ≈ 1.47 days → day 2, dead at ≈ 6.64 → day 7

import { describe, expect, it } from "vitest"
import { DAY_MS } from "./policy"
import { timelineEvents, upcoming } from "./timeline"
import { day, makeEngine } from "./test/fixtures"
import { creatureOf } from "./creatures"

function setup() {
  const kit = makeEngine()
  kit.add("s1", "solid", day(0))
  kit.add("n1", "new", day(0))
  const now = day(0)
  return timelineEvents(kit.engine.view(now), kit.engine.forecast(now, 60 * DAY_MS), now, 60)
}

describe("timelineEvents", () => {
  it("lists weak crossings and deaths by day, soonest first", () => {
    const events = setup()
    expect(events.map((e) => [e.id, e.kind, e.day])).toEqual([
      ["n1", "weak", 2],
      ["n1", "dead", 7],
      ["s1", "weak", 8],
      ["s1", "dead", 34],
    ])
    expect(events[0]!.name).toBe(creatureOf("n1").name)
  })

  it("leaves out anything beyond the horizon", () => {
    const kit = makeEngine()
    kit.add("s1", "solid", day(0))
    const now = day(0)
    const events = timelineEvents(kit.engine.view(now), kit.engine.forecast(now, 20 * DAY_MS), now, 20)
    expect(events.map((e) => e.day)).toEqual([8])
  })
})

describe("upcoming", () => {
  it("shows the next events after the day being previewed", () => {
    const events = setup()
    expect(upcoming(events, 0).map((e) => e.day)).toEqual([2, 7, 8])
    expect(upcoming(events, 7).map((e) => e.day)).toEqual([8, 34])
    expect(upcoming(events, 40)).toEqual([])
  })
})
