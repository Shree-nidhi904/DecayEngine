// The Triage session in the App (task 4.12; Req 9.5, design section 4.3).
// The sample street replayed through a real engine on InMemoryAdapter at T0,
// an in-memory FlagStorage, a clock the test moves by hand and a tick
// scheduler that never fires. At 30 minutes the picks are Dan Okafor, then
// Meera Joshi (design section 6.3); Meera goes dark on day 21.7 and Dan on
// day 25.5 if nobody reaches out.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import type { GhostedEngine } from "./engine-instance"
import { STARTED_FLAG } from "./first-run"
import { loadSampleData } from "./sample-data"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { T0, day, makeEngine } from "./test/fixtures"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

function setup() {
  const engine: GhostedEngine = makeEngine()
  loadSampleData(engine, T0)
  const idOf = (name: string) => engine.view(T0).find((p) => p.payload.name === name)!.id
  let time = T0
  const clock = () => time
  const tend = vi.spyOn(engine, "tend")
  render(
    <App
      engine={engine}
      storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
      session={null}
      clock={clock}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => true}
      timeZone="UTC"
    />
  )
  const start = screen.getByRole("button", { name: "Start reaching out" })
  return {
    engine,
    idOf,
    tend,
    start,
    setTime: (t: number) => {
      time = t
    },
  }
}

/** Focuses and activates Start, as a keyboard user would. */
function startSession(start: HTMLElement) {
  start.focus()
  fireEvent.click(start)
}

const openDialog = () => screen.getByRole("dialog")
const announced = () => document.getElementById(ANNOUNCER_ID)!.textContent

describe("App: a Triage session (Req 9.5)", () => {
  it("opens the Reach out dialog for each pick in order, then closes with a message", () => {
    const { engine, idOf, tend, start } = setup()
    startSession(start)

    let dialog = openDialog()
    expect(dialog.getAttribute("aria-labelledby")).not.toBeNull()
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Reach out to Dan Okafor")
    expect(within(dialog).getByText("Person 1 of 2")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: /^Had a call/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))

    dialog = openDialog()
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe("Reach out to Meera Joshi")
    expect(within(dialog).getByText("Person 2 of 2")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: /^Sent a message/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(tend.mock.calls).toEqual([
      [idOf("Dan Okafor"), { kind: "call" }, T0],
      [idOf("Meera Joshi"), { kind: "text" }, T0],
    ])
    expect(engine.view(T0).find((p) => p.payload.name === "Dan Okafor")!.health).toBe(100)
    expect(announced()).toBe("Session finished.")
  })

  it("Cancel and Escape also move on to the next person", () => {
    const { tend, start } = setup()
    startSession(start)
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Cancel" }))
    expect(within(openDialog()).getByRole("heading", { level: 2 }).textContent).toBe("Reach out to Meera Joshi")
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(tend).not.toHaveBeenCalled()
    // Nothing changed, so the Start button is still there and gets focus back.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Start reaching out" }))
  })

  it("Stop session drops the rest of the queue", () => {
    const { tend, start } = setup()
    startSession(start)
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Stop session" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(tend).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(start)
  })

  it("skips a person who went dark since the session started, and names them at the end", () => {
    const { tend, start, setTime } = setup()
    startSession(start)
    expect(within(openDialog()).getByRole("heading", { level: 2 }).textContent).toBe("Reach out to Dan Okafor")
    // Day 22: Meera's window went dark on day 21.7; Dan's is still flickering.
    setTime(day(22))
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(tend).not.toHaveBeenCalled()
    expect(announced()).toBe("Session finished. Skipped: Meera Joshi (the window went dark).")
  })

  it("skips a person who was removed since the session started, and names them at the end", () => {
    const { engine, idOf, start } = setup()
    startSession(start)
    engine.remove(idOf("Meera Joshi"))
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(announced()).toBe("Session finished. Skipped: Meera Joshi (removed).")
  })

  it("a first pick who went dark before the start is skipped and the next one opens", () => {
    const { start, setTime } = setup()
    // Day 26: Dan (dark on day 25.5) and Meera (day 21.7) are both dark at the real time.
    setTime(day(26))
    startSession(start)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(announced()).toBe(
      "Session finished. Skipped: Dan Okafor (the window went dark), Meera Joshi (the window went dark)."
    )
  })
})
