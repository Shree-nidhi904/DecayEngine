// @vitest-environment jsdom
// The clock guard (clock-guard.ts), written by Claude Code, outside Kiro, at the developer's request.
// The crash it fixes: a device clock behind the newest saved event made every tick throw TIME_WENT_BACKWARD.

import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup } from "@testing-library/react"
import { CLOCK_BEHIND_NOTICE_MS, clockBehindText, heldClock } from "./clock-guard"
import { makeAppKit } from "./test/app-kit"

afterEach(cleanup)

const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1)

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
  it("never returns a time before an earlier answer from the same real clock", () => {
    let now = 1000
    const clock = heldClock(() => now, engineWith(400))
    const first = clock()
    now = 800 // the device clock moved back, but not behind any saved event
    expect(clock()).toBeLessThanOrEqual(first) // it follows the real clock: only saved events are protected
  })
})

describe("App with a device clock behind a saved event", () => {
  it("mounts and ticks without throwing, and says so once", () => {
    const kit = makeAppKit()
    kit.add("s1", "solid", T0 + 10 * DAY) // saved "in the future" of the device clock
    expect(() => kit.renderApp(T0)).not.toThrow()
    expect(document.body.textContent).toContain(clockBehindText)

    // A later tick, still behind: no crash, and the message is not repeated.
    expect(() => act(() => kit.fireTick())).not.toThrow()
    expect(document.body.textContent!.split(clockBehindText).length - 1).toBe(1)

    // The clock catches up: a tick is fine again.
    kit.setClock(T0 + 11 * DAY)
    expect(() => act(() => kit.fireTick())).not.toThrow()
  })

  it("stays quiet when the clock is only a little behind (jitter)", () => {
    const kit = makeAppKit()
    kit.add("s1", "solid", T0 + CLOCK_BEHIND_NOTICE_MS - 1)
    kit.renderApp(T0)
    expect(document.body.textContent).not.toContain(clockBehindText)
  })
})
