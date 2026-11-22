// ImportDialog (task 5.3; Req 21.5, 21.6, 17.1, 23.3, 24.2, design section
// 9.2). A real engine on InMemoryAdapter (or an adapter that fills up) at
// fixed times, the dialog polyfill and timeZone "UTC". Never the real clock.
//
// T0 is 2023-11-14 22:13:20 UTC.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { ImportDialog } from "./ImportDialog"
import type { GhostedEngine } from "../engine-instance"
import { storageProblemText } from "../storage-errors"
import { personFormRules, previewBlockedText } from "../wording"
import { T0, makeEngine } from "../test/fixtures"

afterEach(cleanup)

/** Saves the first `room` snapshots, then throws the browser's quota error. */
class FillingAdapter extends InMemoryAdapter {
  saves = 0
  private readonly room: number
  constructor(room: number) {
    super()
    this.room = room
  }
  override save(snapshot: StoredSnapshot): void {
    if (this.saves >= this.room) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" })
    this.saves++
    super.save(snapshot)
  }
}

function setup({ engine = makeEngine(), previewing = () => false }: { engine?: GhostedEngine; previewing?: () => boolean } = {}) {
  const addItem = vi.spyOn(engine, "addItem")
  const onImported = vi.fn()
  const onClose = vi.fn()
  render(
    <ImportDialog
      engine={engine}
      clock={() => T0}
      timeZone="UTC"
      previewing={previewing}
      onImported={onImported}
      onClose={onClose}
    />
  )
  const dialog = screen.getByRole("dialog", { name: "Import people" })
  const textarea = within(dialog).getByLabelText("People, one per line") as HTMLTextAreaElement
  const paste = (text: string) => fireEvent.change(textarea, { target: { value: text } })
  const importNow = () => fireEvent.click(within(dialog).getByRole("button", { name: "Import" }))
  return { engine, addItem, onImported, onClose, dialog, textarea, paste, importNow }
}

const names = (engine: GhostedEngine) => engine.view(T0).map((p) => p.payload.name)

describe("the dialog (Req 21.5, 24.2)", () => {
  it("opens with focus on its title, states the format and the importance and minutes every import gets", () => {
    const { dialog } = setup()
    const title = within(dialog).getByRole("heading", { level: 2, name: "Import people" })
    expect(title.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(title)
    expect(dialog.textContent).toContain("One person per line: name | relationship | rhythm days | last contact (YYYY-MM-DD)")
    expect(within(dialog).getByText("Imported people get importance 2 and 10 minutes.")).toBeTruthy()
    // One filled button: Import.
    expect([...dialog.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)).toEqual(["Import"])
  })
})

describe("importing (Req 21.5, 21.6)", () => {
  const TEXT = [
    "Mira Castell | Cousin | 30 | 2023-10-02",
    "# a comment",
    "",
    "Tomas Reyes | | 0",
    "Ana Ruiz\tWork\t14",
    "Leo Park, Neighbours, 60",
  ].join("\n")

  it("lists every skipped line with its 1-based number and reason before anything is added", () => {
    const { dialog, paste, addItem } = setup()
    paste(TEXT)
    expect(within(dialog).getByRole("status").textContent).toBe("3 people ready to import.")
    const skipped = [...dialog.querySelectorAll(".gh-import-skipped li")].map((li) => li.textContent)
    expect(skipped).toEqual([`Line 4: ${personFormRules.rhythmDays}`])
    expect(addItem).not.toHaveBeenCalled()
  })

  it("adds the valid lines in line order, with importance 2, 10 minutes and the real time", () => {
    const { engine, addItem, onImported, onClose, paste, importNow } = setup()
    paste(TEXT)
    importNow()

    expect(addItem.mock.calls).toEqual([
      [
        {
          payload: { name: "Mira Castell", relationship: "Cousin", rhythmDays: 30, lastContactAt: Date.UTC(2023, 9, 2) },
          importance: 2,
          costMinutes: 10,
        },
        T0,
      ],
      // No date: the import time.
      [{ payload: { name: "Ana Ruiz", relationship: "Work", rhythmDays: 14, lastContactAt: T0 }, importance: 2, costMinutes: 10 }, T0],
      [
        { payload: { name: "Leo Park", relationship: "Neighbours", rhythmDays: 60, lastContactAt: T0 }, importance: 2, costMinutes: 10 },
        T0,
      ],
    ])
    expect(names(engine)).toEqual(["Mira Castell", "Ana Ruiz", "Leo Park"])
    expect(onImported.mock.calls).toEqual([[3]])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("text with no valid line adds nothing and says so", () => {
    const { dialog, addItem, onImported, onClose, paste, importNow } = setup()
    paste("# only a comment\nTomas Reyes | | 0")
    expect(within(dialog).getByRole("status").textContent).toBe("No valid lines yet.")
    importNow()
    expect(addItem).not.toHaveBeenCalled()
    expect(onImported).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe("a storage problem part-way (Req 23.3, design section 9.2)", () => {
  it("keeps the people added so far, stays open, says why and keeps the lines not yet added", () => {
    const engine = makeEngine(new FillingAdapter(1))
    const { dialog, textarea, onImported, onClose, paste, importNow } = setup({ engine })
    paste(["Mira Castell | Cousin | 30", "Ana Ruiz | Work | 14", "Leo Park | | 60"].join("\n"))
    importNow()

    expect(names(engine)).toEqual(["Mira Castell"])
    expect(onImported.mock.calls).toEqual([[1]])
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(within(dialog).getByRole("alert").textContent).toBe(
      `${storageProblemText.full} Stopped after 1 person. The lines not yet added are still here.`
    )
    expect(textarea.value).toBe("Ana Ruiz | Work | 14\nLeo Park | | 60")
    expect(within(dialog).getByRole("status").textContent).toBe("2 people ready to import.")
  })

  it("full from the first line: nothing added, the text kept as it was", () => {
    const engine = makeEngine(new FillingAdapter(0))
    const { textarea, dialog, onImported, paste, importNow } = setup({ engine })
    const text = "Mira Castell | Cousin | 30\nAna Ruiz | Work | 14"
    paste(text)
    importNow()
    expect(names(engine)).toEqual([])
    expect(onImported).not.toHaveBeenCalled()
    expect(within(dialog).getByRole("alert").textContent).toBe(storageProblemText.full)
    expect(textarea.value).toBe(text)
  })
})

describe("Cancel, Escape and the gate", () => {
  it("Cancel and Escape close without adding anyone", () => {
    const { addItem, onClose, dialog, paste } = setup()
    paste("Mira Castell | Cousin | 30")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(addItem).not.toHaveBeenCalled()
  })

  it("Import checks previewing() again: during a preview nothing is added and the reason is shown (Req 12.5)", () => {
    const previewing = vi.fn(() => true)
    const { engine, addItem, onImported, onClose, dialog, textarea, paste, importNow } = setup({ previewing })
    paste("Mira Castell | Cousin | 30")
    importNow()
    expect(previewing).toHaveBeenCalled()
    expect(addItem).not.toHaveBeenCalled()
    expect(engine.view(T0)).toEqual([])
    expect(onImported).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(within(dialog).getByRole("alert").textContent).toBe(previewBlockedText)
    expect(textarea.value).toBe("Mira Castell | Cousin | 30")
  })
})

describe("repeated people are skipped, with a reason (task P6, written by Claude Code, outside Kiro)", () => {
  it("skips a line that repeats an earlier line in the paste, and adds the first", () => {
    const { engine, dialog, paste, importNow } = setup()
    paste(["Mira Castell | Cousin | 30", "Ana Ruiz | Work | 14", "mira castell | cousin | 21"].join("\n"))
    expect(within(dialog).getByRole("status").textContent).toBe("2 people ready to import.")
    expect([...dialog.querySelectorAll(".gh-import-skipped li")].map((li) => li.textContent)).toEqual([
      "Line 3: same name and relationship as line 1",
    ])
    importNow()
    expect(names(engine)).toEqual(["Mira Castell", "Ana Ruiz"])
  })

  it("skips someone already on the street, so pasting the same list twice adds no one", () => {
    const first = setup()
    first.paste("Mira Castell | Cousin | 30\nAna Ruiz | Work | 14")
    first.importNow()
    cleanup()

    const again = setup({ engine: first.engine })
    again.addItem.mockClear() // the same engine, so the spy still holds the first import's calls
    again.paste("Mira Castell | Cousin | 30\nAna Ruiz | Work | 14")
    expect([...again.dialog.querySelectorAll(".gh-import-skipped li")].map((li) => li.textContent)).toEqual([
      "Line 1: already on your street (same name and relationship)",
      "Line 2: already on your street (same name and relationship)",
    ])
    expect(again.addItem).not.toHaveBeenCalled()
    expect(names(again.engine)).toEqual(["Mira Castell", "Ana Ruiz"])
  })

  it("still adds two people with the same name and different relationships", () => {
    const { engine, paste, importNow } = setup()
    paste("Sam Lee | Cousin | 30\nSam Lee | Work | 14")
    importNow()
    expect(names(engine)).toEqual(["Sam Lee", "Sam Lee"])
  })
})
