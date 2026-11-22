// The clock guard (clock-guard.ts), written by Claude Code, outside Kiro, at the developer's request.
// The crash it fixes: a device clock behind the newest saved event made every tick throw TIME_WENT_BACKWARD.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { App } from "./App"
import { CLOCK_BEHIND_NOTICE_MS, clockBehindText, heldClock } from "./clock-guard"
import type { Scheduler } from "./ticking"
import type { PersonPayload } from "./policy"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

describe("heldClock", () => {
  const engineWith = (...lastEventAts: number[]) => ({ view: () => lastEventAts.map((lastEventAt) => ({ lastEventAt })) })

  it("is the real clock when no saved event is later", () => {
    expect(heldClock(() => 500, engineWith(100, 400))()).toBe(500)
  })
  it("is the newest saved event when the real clock is behind it", () => {
    expect(heldClock(() => 500, engineWith(100, 900))()).toBe(900)
  })
  it("is the real clock with no items at all", () => {
    expect(heldClock(() => 500, engineWith())()).toBe(500)
  })
  it("follows the real clock again once it catches up", () => {
    let now = 500
    const clock = heldClock(() => now, engineWith(900))
    expect(clock()).toBe(900)
    now = 1200
    expect(clock()).toBe(1200)
  })
})

describe("App with a device clock behind a saved event", () => {
  const person = (name: string): PersonPayload => ({ name, relationship: "", rhythmDays: 30, lastContactAt: T0 + 10 * DAY_MS })

  it("mounts without throwing and says so", () => {
    const engine = makeEngine()
    engine.addItem({ payload: person("Dan Okafor"), importance: 2, costMinutes: 10 }, T0 + 10 * DAY_MS)
    expect(() =>
      render(<App engine={engine} storage={new FakeStorage()} session={null} clock={() => T0} tickScheduler={idleScheduler} timeZone="UTC" />)
    ).not.toThrow()
    expect(document.body.textContent).toContain(clockBehindText)
  })

  it("stays quiet when the clock is only a little behind (jitter)", () => {
    const engine = makeEngine()
    engine.addItem({ payload: person("Dan Okafor"), importance: 2, costMinutes: 10 }, T0 + CLOCK_BEHIND_NOTICE_MS - 1)
    render(<App engine={engine} storage={new FakeStorage()} session={null} clock={() => T0} tickScheduler={idleScheduler} timeZone="UTC" />)
    expect(document.body.textContent).not.toContain(clockBehindText)
  })
})
