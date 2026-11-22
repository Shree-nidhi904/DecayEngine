// @vitest-environment jsdom
//
// Features added after the visual pass: today's 5-minute raid, bulk import,
// unique creature names. Through the App, a real engine on InMemoryAdapter.
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { expandDock } from "./test/dock"
import { previewBlockedText } from "./wording"

afterEach(cleanup)

const button = (name: string | RegExp) => screen.getByRole("button", { name })

describe("today's raid", () => {
  it("one click runs Triage for 5 minutes and opens the first fight of the session", () => {
    const kit = makeAppKit()
    kit.add("w1", "solid", day(0)) // day 8: 57.4, weak, 2 minutes
    kit.add("w2", "solid", day(0))
    kit.add("w3", "solid", day(0))
    kit.renderApp(day(8))
    fireEvent.click(button("Start today's 5-minute raid"))
    const fight = screen.getByRole("dialog", { name: "Fight" })
    // 5 minutes fit two of the three 2-minute facts.
    expect(fight.querySelector(".sd-dialog-progress")!.textContent).toBe("Fight 1 of 2")
  })

  it("says so when nothing needs saving", () => {
    const kit = makeAppKit()
    kit.add("a1", "solid", day(8))
    kit.renderApp(day(8))
    fireEvent.click(button("Start today's 5-minute raid"))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByText("Nothing needs saving right now. Come back when a fact weakens.")).toBeTruthy()
  })

  it("is blocked while previewing", () => {
    const kit = makeAppKit()
    kit.add("w1", "solid", day(0))
    kit.renderApp(day(8))
    // The jumps are in the expanded dock (task 21.4, changed by Kiro).
    expandDock()
    fireEvent.click(button("+7 days"))
    const raid = button("Start today's 5-minute raid")
    expect(raid.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(raid)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("import facts", () => {
  it("adds every good line as a new fact, says how many, and skips the rest", () => {
    const kit = makeAppKit()
    kit.renderApp(day(1))
    fireEvent.click(button("Import facts"))
    const dialog = screen.getByRole("dialog", { name: "Import facts" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Your facts" }), {
      target: { value: "Capital of Peru? | Lima | Quiz\nno answer here\nPowerhouse of the cell? | Mitochondrion" },
    })
    expect(within(dialog).getByText("2 facts ready to add.")).toBeTruthy()
    expect(within(dialog).getByText("Line 2 skipped: needs a question and an answer, split by |.")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 2 facts" }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(kit.engine.view(day(1)).map((f) => [f.payload.question, f.payload.answer, f.payload.why])).toEqual([
      ["Capital of Peru?", "Lima", "Quiz"],
      ["Powerhouse of the cell?", "Mitochondrion", ""],
    ])
    expect(screen.getByText("2 facts imported into the Crypt.")).toBeTruthy()
  })
})

describe("creature names", () => {
  it("no two cards share a name", () => {
    const kit = makeAppKit()
    for (let i = 0; i < 12; i++) kit.add(`w${i}`, "solid", day(0))
    kit.renderApp(day(8))
    const names = [...document.querySelectorAll(".sd-creature-name")].map((el) => el.textContent)
    expect(names).toHaveLength(12)
    expect(new Set(names).size).toBe(12)
  })
})
