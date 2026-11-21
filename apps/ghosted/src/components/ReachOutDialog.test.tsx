// ReachOutDialog (task 4.8; Req 18.1-18.5, 24.2). A real engine on
// InMemoryAdapter at fixed times (T0 plus day offsets), the real gate
// (runGatedWrite) and the dialog polyfill. Never the real clock.
//
// Expected values come from the spec (Req 2, 3, 5.5), not from running the
// code. Mira: 30-day rhythm (T = 90 days), last contact 45 days before T0,
// so freshness at T0 is 100 × 45 / 90 = 50 (flickering).
// - text: min(100, 50 + 40) = 90; the last contact moves to T0 − 9 days, so
//   freshness next reaches 60 at T0 − 9 + 36 = T0 + 27 days.
// - call or meet-up: 100; the last contact is T0, so 60 again at T0 + 36 days.
// - she goes dark just after 81 days from her last contact: T0 + 36 days.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ReachOutDialog, type ReachOutResult } from "./ReachOutDialog"
import type { GhostedEngine } from "../engine-instance"
import type { ContactEvent, PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { runGatedWrite } from "../write-guard"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const MIRA: PersonPayload = { name: "Mira Castell", relationship: "College", rhythmDays: 30, lastContactAt: day(-45) }

function setup(options: { blocked?: string; openAt?: number } = {}) {
  const engine: GhostedEngine = makeEngine()
  const id = engine.addItem({ payload: MIRA, importance: 2, costMinutes: 10 }, T0)
  let now = options.openAt ?? T0
  const clock = () => now
  const person = engine.view(now).find((p) => p.id === id)!
  const tend = vi.spyOn(engine, "tend")
  const onProblem = vi.fn()
  const write = vi.fn((w: () => void) => runGatedWrite(false, w, onProblem))
  const onWrite = vi.fn()
  const onClose = vi.fn()
  const results: ReachOutResult[] = []
  render(
    <ReachOutDialog
      engine={engine}
      clock={clock}
      person={person}
      blocked={options.blocked}
      write={write}
      onWrite={onWrite}
      onResult={(r) => results.push(r)}
      onClose={onClose}
      formatDate={isoDay}
    />
  )
  const dialog = screen.getByRole("dialog", { name: "Reach out to Mira Castell" })
  return { engine, id, tend, write, onWrite, onClose, onProblem, results, dialog, setNow: (t: number) => (now = t) }
}

const choice = (dialog: HTMLElement, words: string) =>
  within(dialog).getByRole("button", { name: new RegExp(`^${words} `) })

describe("ReachOutDialog choices (Req 18.1, 18.3)", () => {
  it("offers the three contacts, each with freshness before and after from the policy", () => {
    const { dialog } = setup()
    const choices = [...dialog.querySelectorAll<HTMLButtonElement>(".gh-choice")]
    expect(choices.map((c) => [c.dataset.kind, c.querySelector(".gh-choice-kind")?.textContent, c.querySelector(".gh-choice-effect")?.textContent])).toEqual([
      ["text", "Sent a message", "Freshness 50 → 90"],
      ["call", "Had a call", "Freshness 50 → 100"],
      ["meetup", "Met up", "Freshness 50 → 100"],
    ])
    expect(choice(dialog, "Sent a message").textContent).toBe("Sent a message Freshness 50 → 90")
  })

  it("has no control that logs a contact without a kind: the only other button is Cancel", () => {
    const { dialog } = setup()
    const buttons = within(dialog).getAllByRole("button")
    const others = buttons.filter((b) => !b.classList.contains("gh-choice")).map((b) => b.textContent)
    expect(others).toEqual(["Cancel"])
    expect(within(dialog).queryByRole("checkbox")).toBeNull()
    expect(within(dialog).queryByText(/mark|contacted/i)).toBeNull()
    // No filled button before the pick.
    expect(dialog.querySelectorAll(".gh-button-primary")).toHaveLength(0)
  })

  it("opens with focus on the question line, not on a button (Req 24.2)", () => {
    const { dialog } = setup()
    const question = within(dialog).getByText("What did you do to reach Mira?")
    expect(question.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(question)
  })
})

describe("ReachOutDialog picks (Req 18.2, 18.4)", () => {
  it.each([
    ["Sent a message", "text", 90, "Mira is a little brighter. Freshness 50 → 90.", day(27)],
    ["Had a call", "call", 100, "Mira is lit again.", day(36)],
    ["Met up", "meetup", 100, "Mira is lit again.", day(36)],
  ] as const)("%s: engine.tend with %s, then the result and when to reach out next", (words, kind, health, sentence, nextAt) => {
    const { engine, id, tend, write, onWrite, results, dialog } = setup()
    fireEvent.click(choice(dialog, words))

    expect(write).toHaveBeenCalledTimes(1)
    expect(tend).toHaveBeenCalledTimes(1)
    expect(tend).toHaveBeenCalledWith(id, { kind } satisfies ContactEvent, T0)
    const after = engine.view(T0).find((p) => p.id === id)!
    expect(after.health).toBeCloseTo(health, 9)
    expect(after.state).toBe("alive")
    expect(engine.history(id).filter((e) => e.type === "tended").map((e) => e.event)).toEqual([{ kind }])
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(results).toEqual([{ kind, before: 50, after: health }])

    // The result replaces the choices and takes focus.
    const result = within(dialog).getByRole("status")
    expect(result.textContent).toBe(sentence)
    expect(document.activeElement).toBe(result)
    expect(dialog.querySelectorAll(".gh-choice")).toHaveLength(0)
    expect(within(dialog).getByText(`Reach out again by ${isoDay(nextAt)} to keep the window lit.`)).toBeTruthy()
    // One filled button after the pick: Done.
    expect([...dialog.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)).toEqual(["Done"])
  })

  it("Done closes the dialog after the pick", () => {
    const { dialog, onClose } = setup()
    fireEvent.click(choice(dialog, "Had a call"))
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

})

describe("ReachOutDialog without a contact (Req 18.5)", () => {
  it("Cancel closes without calling the engine", () => {
    const { engine, id, tend, write, onWrite, onClose, dialog } = setup()
    const before = engine.history(id)
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(tend).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(onWrite).not.toHaveBeenCalled()
    expect(engine.history(id)).toEqual(before)
  })

  it("Escape is the same as Cancel", () => {
    const { tend, onClose } = setup()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(tend).not.toHaveBeenCalled()
  })

  it("during a preview every choice is aria-disabled with the reason and logs nothing (Req 12.5)", () => {
    const { dialog, tend, write } = setup({ blocked: previewBlockedText })
    for (const words of ["Sent a message", "Had a call", "Met up"]) {
      const button = choice(dialog, words)
      expect(button.getAttribute("aria-disabled")).toBe("true")
      expect(button.getAttribute("title")).toBe(previewBlockedText)
      expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(previewBlockedText)
      fireEvent.click(button)
    }
    expect(write).not.toHaveBeenCalled()
    expect(tend).not.toHaveBeenCalled()
  })
})

describe("ReachOutDialog when the window went dark first", () => {
  it("says so when the person went dark between opening and picking; no contact is logged", () => {
    const { engine, id, tend, onWrite, results, dialog, setNow } = setup()
    // Opened at T0 (freshness 50); picked on day 40, after she went dark (just after day 36).
    setNow(day(40))
    fireEvent.click(choice(dialog, "Had a call"))

    expect(tend).toHaveBeenCalledTimes(1)
    const result = within(dialog).getByRole("status")
    expect(result.textContent).toBe("Mira Castell's window went dark before you reached out.")
    expect(document.activeElement).toBe(result)
    expect(engine.view(day(40)).find((p) => p.id === id)!.state).toBe("dead")
    expect(engine.history(id).map((e) => e.type)).not.toContain("tended")
    // The engine saved the death, so the App reads the lists again.
    expect(onWrite).toHaveBeenCalledTimes(1)
    expect(results).toEqual([{ wentDark: true }])
    expect(within(dialog).queryByText(/Reach out again by/)).toBeNull()
  })
})
