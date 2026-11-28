// @vitest-environment jsdom
// Feedback list, point 18: the corner toast closes itself after 5 seconds; a problem stays.
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { TOAST_MS, Toast } from "./Toast"

afterEach(cleanup)

function fakeSchedule() {
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = []
  const schedule = (run: () => void, ms: number) => {
    const t = { run, ms, cancelled: false }
    timers.push(t)
    return () => {
      t.cancelled = true
    }
  }
  return { timers, schedule }
}

describe("Toast", () => {
  it("closes after 5 seconds", () => {
    const { timers, schedule } = fakeSchedule()
    let done = 0
    render(<Toast text="Backup saved as a.json." problem={false} onDone={() => done++} schedule={schedule} />)
    expect(screen.getByText("Backup saved as a.json.")).toBeTruthy()
    expect(timers.map((t) => t.ms)).toEqual([TOAST_MS])
    expect(TOAST_MS).toBe(5000)
    timers[0]!.run()
    expect(done).toBe(1)
  })

  it("keeps a problem until it is dismissed", () => {
    const { timers, schedule } = fakeSchedule()
    let done = 0
    render(<Toast text="Storage is full." problem onDone={() => done++} schedule={schedule} />)
    expect(timers).toEqual([])
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(done).toBe(1)
  })

  it("stops its timer when it goes away early", () => {
    const { timers, schedule } = fakeSchedule()
    const { unmount } = render(<Toast text="Saved." problem={false} onDone={() => {}} schedule={schedule} />)
    unmount()
    expect(timers[0]!.cancelled).toBe(true)
  })
})
