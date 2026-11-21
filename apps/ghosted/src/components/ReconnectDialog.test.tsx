// ReconnectDialog (task 4.9; Req 14.1-14.6, 4.3, 16.5, 25.2). A real engine
// on InMemoryAdapter at fixed times, the real gate (runGatedWrite) and the
// dialog polyfill. Never the real clock.
//
// Leo: 30-day rhythm, last contact 90 days before T0, so he is dark when
// added at T0 (90 > 2.7 × 30). A reconnect of any kind brings him back at
// health 100 with timesResurrected 1 (Req 4.1, 4.3).

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ReconnectDialog, type ReconnectResult } from "./ReconnectDialog"
import type { GhostedEngine } from "../engine-instance"
import type { ContactEvent, PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { runGatedWrite } from "../write-guard"
import { outsideMotionBlocks, motionBlocks, readStyle } from "../test/css"
import { litOf } from "../test/dom"
import { SRC_DIR, readText } from "../test/source-files"
import { join } from "node:path"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const LEO: PersonPayload = { name: "Leo Marchetti", relationship: "Neighbours", rhythmDays: 30, lastContactAt: day(-90) }

function setup(blocked?: string) {
  const engine: GhostedEngine = makeEngine()
  const id = engine.addItem({ payload: LEO, importance: 1, costMinutes: 20 }, T0)
  const person = engine.view(T0).find((p) => p.id === id)!
  const resurrect = vi.spyOn(engine, "resurrect")
  const write = vi.fn((w: () => void) => runGatedWrite(false, w, () => {}))
  const onWrite = vi.fn()
  const onClose = vi.fn()
  const results: ReconnectResult[] = []
  render(
    <ReconnectDialog
      engine={engine}
      clock={() => T0}
      person={person}
      blocked={blocked}
      write={write}
      onWrite={onWrite}
      onResult={(r) => results.push(r)}
      onClose={onClose}
    />
  )
  const dialog = screen.getByRole("dialog", { name: "Reconnect with Leo Marchetti" })
  return { engine, id, person, resurrect, write, onWrite, onClose, results, dialog }
}

const pane = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>(".gh-pane")!

describe("ReconnectDialog before the pick (Req 14.1, 14.5, 14.6)", () => {
  it("shows the boarded window and asks which contact happened, with focus on the question", () => {
    const { person, dialog } = setup()
    expect(person.state).toBe("dead")
    const art = pane(dialog)
    expect(art.dataset.state).toBe("dead")
    expect(art.dataset.boards).toBe("on")
    expect(art.querySelectorAll(".gh-board")).toHaveLength(2)
    expect(litOf(art)).toBe("0")

    const question = within(dialog).getByText("Which contact happened?")
    expect(question.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(question)
  })

  it('offers "Sent a message", "Had a call", "Met up" and Cancel, and never "No reply yet"', () => {
    const { dialog } = setup()
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Sent a message",
      "Had a call",
      "Met up",
      "Cancel",
    ])
    expect(within(dialog).queryByText(/no reply/i)).toBeNull()
    expect(dialog.querySelectorAll(".gh-button-primary")).toHaveLength(0)
  })

  it("Cancel closes without calling the engine", () => {
    const { engine, id, resurrect, write, onWrite, onClose, dialog } = setup()
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(resurrect).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(onWrite).not.toHaveBeenCalled()
    expect(engine.view(T0).find((p) => p.id === id)!.state).toBe("dead")
  })

  it("Escape is the same as Cancel", () => {
    const { resurrect, onClose } = setup()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(resurrect).not.toHaveBeenCalled()
  })

  it("during a preview every option is aria-disabled with the reason and reconnects nobody (Req 12.5)", () => {
    const { dialog, resurrect, write } = setup(previewBlockedText)
    for (const name of ["Sent a message", "Had a call", "Met up"]) {
      const button = within(dialog).getByRole("button", { name })
      expect(button.getAttribute("aria-disabled")).toBe("true")
      expect(button.getAttribute("title")).toBe(previewBlockedText)
      expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(previewBlockedText)
      fireEvent.click(button)
    }
    expect(write).not.toHaveBeenCalled()
    expect(resurrect).not.toHaveBeenCalled()
  })
})

describe("ReconnectDialog picks (Req 14.2, 14.3, 4.3)", () => {
  it.each([
    ["Sent a message", "text"],
    ["Had a call", "call"],
    ["Met up", "meetup"],
  ] as const)("%s: engine.resurrect with %s, and the window is lit again", (name, kind) => {
    const { engine, id, resurrect, write, onWrite, results, dialog } = setup()
    fireEvent.click(within(dialog).getByRole("button", { name }))

    expect(write).toHaveBeenCalledTimes(1)
    expect(resurrect).toHaveBeenCalledTimes(1)
    expect(resurrect).toHaveBeenCalledWith(id, { kind } satisfies ContactEvent, T0)
    const after = engine.view(T0).find((p) => p.id === id)!
    expect(after.state).toBe("alive")
    expect(after.health).toBe(100)
    expect(after.timesResurrected).toBe(1)
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(results).toEqual([{ ok: true, kind }])

    const result = within(dialog).getByRole("status")
    expect(result.textContent).toBe("Leo's window is lit again. Freshness is 100.")
    expect(document.activeElement).toBe(result)
    // The boards fall away and the light comes back.
    const art = pane(dialog)
    expect(art.dataset.state).toBe("litAgain")
    expect(art.dataset.boards).toBe("falling")
    expect(art.hasAttribute("data-relight")).toBe(true)
    expect(litOf(art)).toBe("1.0000")
    expect(art.querySelector(".gh-sil")).not.toBeNull()
    // No more options; Done is the one filled button.
    expect(within(dialog).queryByRole("button", { name: "Had a call" })).toBeNull()
    expect([...dialog.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)).toEqual(["Done"])
  })

  it("Done closes the dialog after the reconnect", () => {
    const { dialog, onClose } = setup()
    fireEvent.click(within(dialog).getByRole("button", { name: "Met up" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("ReconnectDialog under reduced motion (Req 14.4, 25.2)", () => {
  const motion = readStyle("motion.css")

  it("the lit window and the same text show at once, with no timer or animation to wait for", () => {
    vi.useFakeTimers({ now: T0 })
    try {
      const { dialog } = setup()
      fireEvent.click(within(dialog).getByRole("button", { name: "Had a call" }))
      // No timer is advanced anywhere in this test: the end state is already on the page.
      // (React's own scheduler may hold timers under the fake clock, so the count is not
      // checked; the component's source is checked for timers in the next test.)
      expect(within(dialog).getByRole("status").textContent).toBe("Leo's window is lit again. Freshness is 100.")
      expect(pane(dialog).dataset.state).toBe("litAgain")
      expect(litOf(pane(dialog))).toBe("1.0000")
    } finally {
      vi.useRealTimers()
    }
  })

  it("the dialog's source schedules no timer or animation frame of its own", () => {
    const source = readText(join(SRC_DIR, "components", "ReconnectDialog.tsx"))
    const code = source.split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n")
    expect(code).not.toMatch(/\b(setTimeout|setInterval|requestAnimationFrame)\b/)
  })

  it("outside the motion block the falling boards are hidden at once; the fall and the flash run only inside it", () => {
    const outside = outsideMotionBlocks(motion)
    expect(outside).toMatch(/\.gh-pane\[data-boards="falling"\] \.gh-boards\s*\{\s*display:\s*none;?\s*\}/)
    expect(outside).not.toMatch(/gh-boards-fall|gh-relight/)
    const inside = motionBlocks(motion).join("\n")
    expect(inside).toMatch(/\.gh-pane\[data-boards="falling"\] \.gh-board\s*\{[^}]*animation:\s*gh-boards-fall/)
    expect(inside).toMatch(/\.gh-pane\[data-relight\]\s*\{[^}]*animation:\s*gh-relight/)
  })
})
