// AddEditPersonDialog (task 4.10; Req 17.1-17.8, 23.3, 24.2). A real engine
// on InMemoryAdapter at fixed times, the dialog polyfill and timeZone "UTC".
// Never the real clock.
//
// T0 is 2023-11-14 22:13:20 UTC, so "today" in the form is 2023-11-14.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { StorageAdapter } from "@decay-engine/engine"
import { AddEditPersonDialog } from "./AddEditPersonDialog"
import type { GhostedEngine } from "../engine-instance"
import type { Person, PersonPayload } from "../policy"
import { storageProblemText } from "../storage-errors"
import { personFormRules, previewBlockedText } from "../wording"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const PRIYA: PersonPayload = { name: "Priya Raman", relationship: "Family", rhythmDays: 30, lastContactAt: day(-12) }

type Options = {
  engine?: GhostedEngine
  person?: Person
  lastContactAt?: number
  previewing?: () => boolean
  relationships?: string[]
}

function setup({ engine = makeEngine(), person, lastContactAt, previewing = () => false, relationships }: Options = {}) {
  const addItem = vi.spyOn(engine, "addItem")
  const edit = vi.spyOn(engine, "edit")
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <AddEditPersonDialog
      engine={engine}
      clock={() => T0}
      timeZone="UTC"
      person={person}
      lastContactAt={lastContactAt}
      relationships={relationships}
      blocked={undefined}
      previewing={previewing}
      onSaved={onSaved}
      onClose={onClose}
    />
  )
  const dialog = screen.getByRole("dialog")
  return { engine, addItem, edit, onSaved, onClose, dialog }
}

function addPriya(engine: GhostedEngine): Person {
  const id = engine.addItem({ payload: PRIYA, importance: 2, costMinutes: 10 }, T0)
  return engine.view(T0).find((p) => p.id === id)!
}

const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label) as HTMLInputElement
const type = (dialog: HTMLElement, label: string, value: string) =>
  fireEvent.change(field(dialog, label), { target: { value } })
const save = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))

describe("Add a person (Req 17.1, 17.2)", () => {
  it("opens with focus on the title and asks for the six fields; today is the default date and the latest allowed", () => {
    const { dialog } = setup()
    expect(dialog.getAttribute("aria-labelledby")).not.toBeNull()
    const title = within(dialog).getByRole("heading", { level: 2, name: "Add a person" })
    expect(title.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(title)

    expect(field(dialog, "Name").value).toBe("")
    expect(field(dialog, "Relationship").value).toBe("")
    expect(field(dialog, "Usual rhythm in days").value).toBe("")
    const date = field(dialog, "Last contact")
    expect(date.type).toBe("date")
    expect(date.value).toBe("2023-11-14")
    expect(date.max).toBe("2023-11-14")
    expect(within(dialog).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["1", "2", "3"])
    expect(field(dialog, "Minutes it takes to reach out").value).toBe("10")
    // One filled button: Save.
    expect([...dialog.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)).toEqual(["Save"])
  })

  it("Save calls engine.addItem with the payload, importance and minutes, lastContactAt at the date's day start", () => {
    const { engine, addItem, onSaved, onClose, dialog } = setup()
    type(dialog, "Name", "  Mira Castell ")
    type(dialog, "Relationship", "Family")
    type(dialog, "Usual rhythm in days", "30")
    type(dialog, "Last contact", "2023-11-01")
    fireEvent.click(within(dialog).getByRole("radio", { name: "3" }))
    type(dialog, "Minutes it takes to reach out", "15")
    save(dialog)

    expect(addItem).toHaveBeenCalledTimes(1)
    expect(addItem).toHaveBeenCalledWith(
      {
        payload: { name: "Mira Castell", relationship: "Family", rhythmDays: 30, lastContactAt: Date.UTC(2023, 10, 1) },
        importance: 3,
        costMinutes: 15,
      },
      T0
    )
    const [saved] = engine.view(T0)
    expect(saved!.payload.name).toBe("Mira Castell")
    expect(saved!.state).toBe("alive")
    expect(onSaved).toHaveBeenCalledWith(saved!.id, "added")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("offers the existing relationship tags in a datalist, each once", () => {
    const { dialog } = setup({ relationships: ["Work", "Family", " Work ", ""] })
    const input = field(dialog, "Relationship")
    const list = document.getElementById(input.getAttribute("list")!)!
    expect([...list.querySelectorAll("option")].map((o) => o.value)).toEqual(["Family", "Work"])
  })
})

describe('"This window starts dark" before saving (Req 17.3)', () => {
  // Rhythm 10: dark once the last contact is more than 27 days before T0.
  it("shows the hint only once rhythm and date say the person starts dark", () => {
    const { dialog } = setup()
    const hint = () => within(dialog).queryByText("This window starts dark")
    expect(hint()).toBeNull()

    type(dialog, "Usual rhythm in days", "10")
    type(dialog, "Last contact", "2023-10-19") // 26 days and 22 hours before T0
    expect(hint()).toBeNull()

    type(dialog, "Last contact", "2023-10-18") // 27 days and 22 hours before T0
    expect(hint()).not.toBeNull()
    // Shown with the boarded-up glyph, not by colour alone.
    expect(hint()!.querySelector('[data-glyph="cross"]')).not.toBeNull()

    type(dialog, "Usual rhythm in days", "11")
    expect(hint()).toBeNull()
  })

  it("a person saved with the hint showing is dark from the start", () => {
    const { engine, dialog } = setup()
    type(dialog, "Name", "Tomas Novak")
    type(dialog, "Usual rhythm in days", "10")
    type(dialog, "Last contact", "2023-10-01")
    expect(within(dialog).getByText("This window starts dark")).toBeTruthy()
    save(dialog)
    expect(engine.view(T0)[0]!.state).toBe("dead")
  })
})

describe("invalid input (Req 17.7)", () => {
  it("names each field's rule next to it, keeps the input, focuses the first invalid field and saves nothing", () => {
    const { addItem, onClose, onSaved, dialog } = setup()
    type(dialog, "Name", "   ")
    type(dialog, "Usual rhythm in days", "0")
    type(dialog, "Last contact", "2023-11-15") // tomorrow
    type(dialog, "Minutes it takes to reach out", "601")
    save(dialog)

    expect(addItem).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    const name = field(dialog, "Name")
    expect(document.activeElement).toBe(name)
    const errorFor = (input: HTMLInputElement) =>
      document.getElementById(input.getAttribute("aria-describedby")!.split(" ").pop()!)?.textContent
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(errorFor(name)).toBe(personFormRules.name)
    expect(errorFor(field(dialog, "Usual rhythm in days"))).toBe(personFormRules.rhythmDays)
    expect(errorFor(field(dialog, "Last contact"))).toBe(personFormRules.lastContactFuture)
    expect(errorFor(field(dialog, "Minutes it takes to reach out"))).toBe(personFormRules.costMinutes)
    expect(field(dialog, "Relationship").getAttribute("aria-invalid")).toBe("false")

    // The input is kept as typed.
    expect(name.value).toBe("   ")
    expect(field(dialog, "Usual rhythm in days").value).toBe("0")
    expect(field(dialog, "Last contact").value).toBe("2023-11-15")
    expect(field(dialog, "Minutes it takes to reach out").value).toBe("601")
  })

  it("focus goes to the first invalid field in form order", () => {
    const { dialog } = setup()
    type(dialog, "Name", "Mira Castell")
    type(dialog, "Usual rhythm in days", "366")
    save(dialog)
    expect(document.activeElement).toBe(field(dialog, "Usual rhythm in days"))
  })
})

describe("Edit a person (Req 17.4, 17.5)", () => {
  it("shows the stored values; the last contact date is read-only with its hint", () => {
    const engine = makeEngine()
    const person = addPriya(engine)
    const { dialog } = setup({ engine, person, lastContactAt: day(-3) })

    expect(within(dialog).getByRole("heading", { level: 2, name: "Edit Priya Raman" })).toBeTruthy()
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { level: 2 }))
    expect(field(dialog, "Name").value).toBe("Priya Raman")
    expect(field(dialog, "Relationship").value).toBe("Family")
    expect(field(dialog, "Usual rhythm in days").value).toBe("30")
    expect((within(dialog).getByRole("radio", { name: "2" }) as HTMLInputElement).checked).toBe(true)
    expect(field(dialog, "Minutes it takes to reach out").value).toBe("10")

    const date = field(dialog, "Last contact")
    expect(date.readOnly).toBe(true)
    // The last logged contact (3 days before T0), not the date given when added.
    expect(date.value).toBe("2023-11-11")
    expect(document.getElementById(date.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Log a contact to change this"
    )
    // No starts-dark hint while editing.
    expect(within(dialog).queryByText("This window starts dark")).toBeNull()
  })

  it("without lastContactAt, the read-only date is the one given when the person was added", () => {
    const engine = makeEngine()
    const person = addPriya(engine)
    const { dialog } = setup({ engine, person })
    expect(field(dialog, "Last contact").value).toBe("2023-11-02")
  })

  it("sends only importance when only importance changed", () => {
    const engine = makeEngine()
    const person = addPriya(engine)
    const { edit, onSaved, onClose, dialog } = setup({ engine, person })
    fireEvent.click(within(dialog).getByRole("radio", { name: "3" }))
    save(dialog)

    expect(edit).toHaveBeenCalledTimes(1)
    expect(edit).toHaveBeenCalledWith(person.id, { importance: 3 }, T0)
    expect(engine.view(T0)[0]!.importance).toBe(3)
    expect(onSaved).toHaveBeenCalledWith(person.id, "edited")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("sends the whole payload, with the stored lastContactAt, when the rhythm changed, and minutes when they changed", () => {
    const engine = makeEngine()
    const person = addPriya(engine)
    const { edit, dialog } = setup({ engine, person, lastContactAt: day(-3) })
    type(dialog, "Usual rhythm in days", "20")
    type(dialog, "Minutes it takes to reach out", "25")
    save(dialog)

    expect(edit).toHaveBeenCalledWith(person.id, { payload: { ...PRIYA, rhythmDays: 20 }, costMinutes: 25 }, T0)
    // 12 days into a 60-day span: freshness 80 (the engine recomputes it, Req 17.6).
    expect(engine.view(T0)[0]!.health).toBeCloseTo(80, 9)
  })

  it("nothing changed: Save just closes and calls nothing", () => {
    const engine = makeEngine()
    const person = addPriya(engine)
    const { edit, onSaved, onClose, dialog } = setup({ engine, person })
    type(dialog, "Name", " Priya Raman ") // trimmed, the same name
    save(dialog)
    expect(edit).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("Cancel, Escape and the gate", () => {
  it("Cancel and Escape close without calling the engine", () => {
    const { addItem, onClose, dialog } = setup()
    type(dialog, "Name", "Mira Castell")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(addItem).not.toHaveBeenCalled()
  })

  it("Save checks previewing() again: during a preview nothing is saved and the reason is shown (Req 12.5)", () => {
    const previewing = vi.fn(() => true)
    const { engine, addItem, onSaved, onClose, dialog } = setup({ previewing })
    type(dialog, "Name", "Mira Castell")
    type(dialog, "Usual rhythm in days", "30")
    save(dialog)
    expect(previewing).toHaveBeenCalled()
    expect(addItem).not.toHaveBeenCalled()
    expect(engine.view(T0)).toEqual([])
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(within(dialog).getByRole("alert").textContent).toBe(previewBlockedText)
  })
})

describe("storage problems (Req 17.8, 23.3)", () => {
  const fullAdapter: StorageAdapter = {
    load: () => null,
    save: () => {
      throw Object.assign(new Error("quota"), { name: "QuotaExceededError" })
    },
  }

  it("a full storage keeps the form open with the input and shows the problem inside it", () => {
    const engine = makeEngine(fullAdapter)
    const { onSaved, onClose, dialog } = setup({ engine })
    type(dialog, "Name", "Mira Castell")
    type(dialog, "Usual rhythm in days", "30")
    save(dialog)

    expect(within(dialog).getByRole("alert").textContent).toBe(storageProblemText.full)
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(field(dialog, "Name").value).toBe("Mira Castell")
    expect(field(dialog, "Usual rhythm in days").value).toBe("30")
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // The engine kept nothing.
    expect(engine.view(T0)).toEqual([])
  })
})
