// @vitest-environment jsdom
//
// Tests for the add/edit fact form (tasks 5.1 and 5.2, Requirement 5).
// A real DecayEngine on InMemoryAdapter, fixed times through the injected
// now(); never the clock.
//
// Expected values come from the spec, not from running the code:
// - first half-life: new 2, shaky 5, solid 10 days (Requirement 1.2-1.4)
// - health = H × 0.5^(elapsed / half-life) (1.1)
// - editing hides knowledge and passes the stored value through (task 5.1)

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fieldHelpText } from "../wording"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddEditFactDialog } from "./AddEditFactDialog"
import type { Fact } from "../policy"
import { day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function setup(at: number, fact?: Fact, kit = makeEngine()) {
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <AddEditFactDialog engine={kit.engine} now={() => at} fact={fact} onSaved={onSaved} onClose={onClose} />
  )
  return { ...kit, onSaved, onClose, user: userEvent.setup() }
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement

describe("AddEditFactDialog: adding", () => {
  it("adds the fact through engine.addItem with every field the user chose", async () => {
    const kit = makeEngine()
    kit.nextId("added")
    const { user, engine, onSaved, onClose } = setup(day(0), undefined, kit)

    await user.type(input("Question"), "What is the capital of Peru?")
    await user.type(input("Answer"), "Lima")
    await user.type(input("Why it matters (optional)"), "Ships sail there")
    await user.click(screen.getByRole("radio", { name: "Solid" }))
    await user.selectOptions(select("Importance"), "3")
    await user.selectOptions(select("Review cost"), "5")
    await user.click(screen.getByRole("button", { name: "Add fact" }))

    const items = engine.view(day(0))
    expect(items).toHaveLength(1)
    const fact = items[0]!
    expect(fact.id).toBe("added")
    expect(fact.payload).toEqual({
      question: "What is the capital of Peru?",
      answer: "Lima",
      why: "Ships sail there",
      knowledge: "solid",
    })
    expect(fact.importance).toBe(3)
    expect(fact.costMinutes).toBe(5)
    expect(fact.policyData.halfLifeDays).toBe(10) // solid → 10 days
    expect(fact.createdAt).toBe(day(0))
    expect(fact.health).toBe(100)
    expect(onSaved).toHaveBeenCalledWith("added")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("starts as brand new (half-life 2) with importance 2 and cost 2 when left alone", async () => {
    const kit = makeEngine()
    kit.nextId("plain")
    const { user, engine } = setup(day(0), undefined, kit)
    expect((screen.getByRole("radio", { name: "Brand new" }) as HTMLInputElement).checked).toBe(true)

    await user.type(input("Question"), "Q")
    await user.type(input("Answer"), "A")
    await user.click(screen.getByRole("button", { name: "Add fact" }))

    const fact = engine.view(day(0))[0]!
    expect(fact.payload).toEqual({ question: "Q", answer: "A", why: "", knowledge: "new" })
    expect(fact.policyData.halfLifeDays).toBe(2)
    expect(fact.importance).toBe(2)
    expect(fact.costMinutes).toBe(2)
  })

  it("offers importance 1-3 and review costs of 1, 2, 3 and 5 minutes", () => {
    setup(day(0))
    const values = (s: HTMLSelectElement) => [...s.options].map((o) => o.value)
    expect(values(select("Importance"))).toEqual(["1", "2", "3"])
    expect(values(select("Review cost"))).toEqual(["1", "2", "3", "5"])
  })

  // Feedback list, point 13: an (i) beside Importance and Review cost, by keyboard and touch.
  it.each([
    ["Importance", "What is importance?", "importance"],
    ["Review cost", "What is review cost?", "cost"],
  ] as const)("the (i) beside %s opens and closes its note, and the field points to it while open", async (field, buttonName, key) => {
    const { user } = setup(day(0))
    const info = screen.getByRole("button", { name: buttonName })
    const note = document.getElementById(info.getAttribute("aria-controls")!)!
    expect(note.textContent).toBe(fieldHelpText[key])
    expect(note.hidden).toBe(true)
    expect(info.getAttribute("aria-expanded")).toBe("false")
    expect(select(field).getAttribute("aria-describedby")).toBeNull()
    info.focus()
    await user.keyboard("{Enter}")
    expect(info.getAttribute("aria-expanded")).toBe("true")
    expect(note.hidden).toBe(false)
    expect(select(field).getAttribute("aria-describedby")).toBe(note.id)
    await user.click(info)
    expect(note.hidden).toBe(true)
    expect(select(field).getAttribute("aria-describedby")).toBeNull()
  })

  it("the (i) never saves or closes the form", async () => {
    const { user, engine, onSaved, onClose } = setup(day(0))
    await user.click(screen.getByRole("button", { name: "What is importance?" }))
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(engine.view(day(0))).toEqual([])
  })

  it("refuses to save without a question and an answer, and says why", async () => {
    const { user, engine, onSaved, onClose } = setup(day(0))
    await user.click(screen.getByRole("button", { name: "Add fact" }))

    expect(engine.view(day(0))).toEqual([])
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText("Write a question.")).toBeTruthy()
    expect(screen.getByText("Write the answer.")).toBeTruthy()
    expect(input("Question").getAttribute("aria-invalid")).toBe("true")
  })

  it("does not let more than 140 characters into the question", async () => {
    const { user } = setup(day(0))
    await user.type(input("Question"), "q".repeat(141))
    expect(input("Question").value).toHaveLength(140)
    expect(screen.getByText("140 / 140")).toBeTruthy()
  })

  it("Cancel closes without adding anything", async () => {
    const { user, engine, onSaved, onClose } = setup(day(0))
    await user.type(input("Question"), "Q")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(engine.view(day(0))).toEqual([])
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("AddEditFactDialog: editing", () => {
  // A "solid" fact, so a slip to the form's default ("new") would show.
  function editSetup() {
    const kit = makeEngine()
    kit.add("e1", "solid", day(0), { question: "Old question", answer: "Old answer", why: "Old why" })
    const fact = kit.viewOf("e1", day(1))
    return { ...setup(day(1), fact, kit), fact }
  }

  it("hides the knowledge field and fills in the stored values", () => {
    editSetup()
    expect(screen.queryAllByRole("radio")).toEqual([])
    expect(screen.queryByText("How well do you know it?")).toBeNull()
    expect(input("Question").value).toBe("Old question")
    expect(input("Answer").value).toBe("Old answer")
    expect(input("Why it matters (optional)").value).toBe("Old why")
    expect(select("Importance").value).toBe("2")
    expect(select("Review cost").value).toBe("2")
  })

  it("saves through engine.edit and leaves knowledge and the half-life unchanged", async () => {
    const { user, engine, viewOf, onSaved, onClose } = editSetup()
    await user.clear(input("Question"))
    await user.type(input("Question"), "New question")
    await user.selectOptions(select("Importance"), "1")
    await user.selectOptions(select("Review cost"), "3")
    await user.click(screen.getByRole("button", { name: "Save" }))

    const after = viewOf("e1", day(1))
    expect(after.payload).toEqual({
      question: "New question",
      answer: "Old answer",
      why: "Old why",
      knowledge: "solid",
    })
    expect(after.importance).toBe(1)
    expect(after.costMinutes).toBe(3)
    expect(after.policyData.halfLifeDays).toBe(10)

    const last = engine.history("e1").at(-1)
    expect(last).toMatchObject({
      type: "edited",
      itemId: "e1",
      timestamp: day(1),
      fieldsChanged: ["payload", "importance", "costMinutes"],
    })
    // Editing does not review: health keeps decaying, 100 × 0.5^(1/10) ≈ 93.3.
    expect(last?.health).toBeCloseTo(100 * 0.5 ** 0.1, 9)
    expect(engine.history("e1").some((e) => e.type === "tended")).toBe(false)
    expect(onSaved).toHaveBeenCalledWith("e1")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("refuses to save an emptied answer and leaves the fact as it was", async () => {
    const { user, engine, viewOf, onSaved } = editSetup()
    const before = engine.history("e1")
    await user.clear(input("Answer"))
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByText("Write the answer.")).toBeTruthy()
    expect(viewOf("e1", day(1)).payload.answer).toBe("Old answer")
    expect(engine.history("e1")).toEqual(before)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
