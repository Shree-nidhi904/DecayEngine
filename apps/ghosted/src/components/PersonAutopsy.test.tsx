// PersonAutopsy (task 4.11; Req 19.1-19.6, 24.2, 24.3, 28). A real engine on
// InMemoryAdapter at fixed times, the shell AutopsyDialog, the dialog
// polyfill and timeZone "UTC". Never the real clock.
//
// Ines: 30-day rhythm (dark 81 days after the last contact), added at T0 with
// a contact that day, then a call on day 10, a text on 20, a call on 30, a
// text on 40, a meet-up on 50 and a call on 60. Her window goes dark just
// after day 141. Tomas was dark when added: his last contact was 100 days
// before T0.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState } from "react"
import { PersonAutopsy } from "./PersonAutopsy"
import { generateCauseSentences } from "../autopsy-sentences"
import type { GhostedEngine } from "../engine-instance"
import type { ContactEvent, PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const INES: PersonPayload = { name: "Ines Varga", relationship: "Work", rhythmDays: 30, lastContactAt: T0 }
const TOMAS: PersonPayload = { name: "Tomas Novak", relationship: "", rhythmDays: 30, lastContactAt: day(-100) }
const CONTACTS: [number, ContactEvent["kind"]][] = [
  [10, "call"],
  [20, "text"],
  [30, "call"],
  [40, "text"],
  [50, "meetup"],
  [60, "call"],
]
const AT = day(150)

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function makeStreet() {
  const engine: GhostedEngine = makeEngine()
  const ines = engine.addItem({ payload: INES, importance: 2, costMinutes: 10 }, T0)
  for (const [d, kind] of CONTACTS) engine.tend(ines, { kind }, day(d))
  const tomas = engine.addItem({ payload: TOMAS, importance: 1, costMinutes: 20 }, T0)
  // Added on day 145 with a contact that day: still lit on day 150.
  const lit = engine.addItem(
    { payload: { ...INES, name: "Omar Haddad", lastContactAt: day(145) }, importance: 1, costMinutes: 5 },
    day(145)
  )
  return { engine, ines, tomas, lit }
}

function setup(personId: (s: ReturnType<typeof makeStreet>) => string, blocked?: string) {
  const street = makeStreet()
  const onClose = vi.fn()
  const onReconnect = vi.fn()
  const id = personId(street)
  render(
    <PersonAutopsy
      engine={street.engine}
      personId={id}
      now={AT}
      formatDate={isoDate}
      timeZone="UTC"
      onClose={onClose}
      onReconnect={onReconnect}
      blocked={blocked}
    />
  )
  return { ...street, id, onClose, onReconnect }
}

const chart = (dialog: HTMLElement) => dialog.querySelector<SVGElement>("svg[role='img']")!
const linePoints = (dialog: HTMLElement) =>
  dialog.querySelector(".shell-autopsy-line")!.getAttribute("points")!.trim().split(/\s+/)

describe("PersonAutopsy: a window that went dark after contacts", () => {
  it("opens the shell dialog with focus on its title (Req 24.2, 28.5)", () => {
    setup((s) => s.ines)
    const dialog = screen.getByRole("dialog", { name: "How the window went dark" })
    const title = within(dialog).getByRole("heading", { level: 2 })
    expect(title.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(title)
  })

  it("draws one marker per contact inside the chart and a legend entry per kind, in order of first appearance", () => {
    setup((s) => s.ines)
    const dialog = screen.getByRole("dialog")
    const groups = [...chart(dialog).querySelectorAll("[data-marker]")]
    expect(groups.map((g) => g.getAttribute("data-marker"))).toEqual(["call", "text", "call", "text", "meetup", "call"])
    // Each kind has its own shape (icons.tsx), not the shell's default circle.
    expect(groups.map((g) => g.querySelector(".gh-marker")!.getAttribute("data-shape"))).toEqual([
      "diamond",
      "envelope",
      "diamond",
      "envelope",
      "two-dots",
      "diamond",
    ])
    const legend = [...dialog.querySelectorAll("[data-legend-marker]")]
    expect(legend.map((li) => [li.getAttribute("data-legend-marker"), li.textContent])).toEqual([
      ["call", "Call"],
      ["text", "Message"],
      ["meetup", "Meet-up"],
    ])
    // The markers replace the right/wrong marks.
    expect(dialog.querySelector('[data-legend="right"], [data-legend="wrong"], [data-mark]')).toBeNull()
  })

  it("sums the chart up in words, with the contacts counted (Req 28.3)", () => {
    setup((s) => s.ines)
    const label = chart(screen.getByRole("dialog")).getAttribute("aria-label")!
    expect(label).toMatch(/^Freshness from 2023-11-14 to 2024-04-03: /)
    expect(label).toContain("it started at 100 and fell to 9.")
    expect(label).toContain("Contacts: 3 calls, 2 messages, 1 meet-up.")
  })

  it("shows the cause-of-death sentences from autopsy-sentences.ts, in order (Req 19.3)", () => {
    const { engine, id } = setup((s) => s.ines)
    const expected = generateCauseSentences(engine.autopsy(id, AT), INES, { timeZone: "UTC" })
    const shown = [...screen.getByRole("dialog").querySelectorAll(".shell-autopsy-sentence")].map((p) => p.textContent)
    expect(shown).toEqual(expected)
    expect(shown[0]).toBe("After the last call there was no contact for 81 days, about 2.7 times your usual rhythm.")
  })

  it("Reconnect asks the App to open the reconnect dialog", () => {
    const { onReconnect, onClose } = setup((s) => s.ines)
    const reconnect = within(screen.getByRole("dialog")).getByRole("button", { name: "Reconnect" })
    expect(reconnect.hasAttribute("aria-disabled")).toBe(false)
    fireEvent.click(reconnect)
    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("during a preview, Reconnect stays focusable but is disabled with the reason (Req 19.5)", () => {
    const { onReconnect } = setup((s) => s.ines, previewBlockedText)
    const reconnect = within(screen.getByRole("dialog")).getByRole("button", { name: "Reconnect" })
    expect(reconnect.getAttribute("aria-disabled")).toBe("true")
    expect(reconnect.getAttribute("title")).toBe(previewBlockedText)
    expect(document.getElementById(reconnect.getAttribute("aria-describedby")!)!.textContent).toBe(previewBlockedText)
    reconnect.focus()
    expect(document.activeElement).toBe(reconnect)
    fireEvent.click(reconnect)
    expect(onReconnect).not.toHaveBeenCalled()
  })

  it("Close and Escape call onClose", () => {
    const { onClose } = setup((s) => s.ines)
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe("PersonAutopsy: a person who was dark when added (Req 19.6)", () => {
  it("draws a line, not a single point, and never says 0 days", () => {
    setup((s) => s.tomas)
    const dialog = screen.getByRole("dialog")
    const points = linePoints(dialog)
    expect(points.length).toBeGreaterThan(2)
    expect(new Set(points).size).toBe(points.length)
    expect(points[0]!.split(",")[0]).not.toBe(points[points.length - 1]!.split(",")[0])
    expect(dialog.textContent).not.toMatch(/\b0 days\b/)
    expect(dialog.textContent).toContain("Already dark when added: no contact for 100 days")
    // No contacts in this life: no marker and no marker legend entry.
    expect(dialog.querySelectorAll("[data-marker], [data-legend-marker]")).toHaveLength(0)
    expect(chart(dialog).getAttribute("aria-label")).toContain("Contacts: no contacts logged.")
  })
})

describe("PersonAutopsy: a window still lit", () => {
  it("shows no autopsy", () => {
    setup((s) => s.lit)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("PersonAutopsy: focus goes back to the opener (Req 24.3)", () => {
  function Harness({ engine, id }: { engine: GhostedEngine; id: string }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Autopsy
        </button>
        {open && (
          <PersonAutopsy
            engine={engine}
            personId={id}
            now={AT}
            formatDate={isoDate}
            timeZone="UTC"
            onClose={() => setOpen(false)}
            onReconnect={() => {}}
            blocked={undefined}
          />
        )}
      </>
    )
  }

  it("Escape closes the dialog and returns focus to the button that opened it", () => {
    const { engine, ines } = makeStreet()
    render(<Harness engine={engine} id={ines} />)
    const opener = screen.getByRole("button", { name: "Autopsy" })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).not.toBe(opener)
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
