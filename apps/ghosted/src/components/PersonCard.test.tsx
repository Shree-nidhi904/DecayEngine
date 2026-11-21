// PersonCard (task 4.2; Req 13.1-13.4, 13.6, 16.1, 16.2, 12.5). People are
// built through the real engine at fixed times (T0 plus day offsets); dates
// are shown with a fixed UTC formatter. The 44px rule is checked in the CSS
// source, because jsdom does not lay out.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import { PersonCard, type PersonActions } from "./PersonCard"
import type { GhostedEngine } from "../engine-instance"
import type { Person, PersonPayload } from "../policy"
import { previewBlockedText } from "../wording"
import { T0, day, makeEngine } from "../test/fixtures"
import { readStyle, ruleBody, stripComments } from "../test/css"

afterEach(cleanup)

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function payload(over: Partial<PersonPayload> = {}): PersonPayload {
  return { name: "Mira Castell", relationship: "College", rhythmDays: 30, lastContactAt: T0, ...over }
}

// No return type: the inferred mock type is assignable to PersonActions and keeps `.mock` for the assertions.
function actions() {
  return { onReachOut: vi.fn(), onReconnect: vi.fn(), onAutopsy: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() }
}

/** Renders the card of person `id` as the engine shows it at `now`. */
function renderCard(
  engine: GhostedEngine,
  id: string,
  now = T0,
  extra: { blocked?: string; headingLevel?: 2 | 3; acts?: PersonActions } = {}
) {
  const person = engine.view(now).find((p) => p.id === id)!
  const darkAt = engine.forecast(now, MAX_FORECAST_HORIZON_MS).find((e) => e.item.id === id)?.diesAt ?? null
  const acts = extra.acts ?? actions()
  const result = render(
    <PersonCard
      person={person}
      now={now}
      darkAt={darkAt}
      engine={engine}
      history={engine.history(id)}
      blocked={extra.blocked}
      formatDate={isoDay}
      headingLevel={extra.headingLevel}
      {...acts}
    />
  )
  return { ...result, person, acts }
}

function add(engine: GhostedEngine, over: Partial<PersonPayload> = {}, at = T0): string {
  return engine.addItem({ payload: payload(over), importance: 2, costMinutes: 10 }, at)
}

const fact = (container: HTMLElement, name: string) => container.querySelector(`[data-fact="${name}"]`)?.textContent

describe("PersonCard fields (Req 13.1, 16.1)", () => {
  it("shows the name, relationship, state glyph and word, last contact, rhythm, the window and the bar", () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-12) })
    const { container } = renderCard(engine, id)

    expect(screen.getByRole("heading", { level: 3, name: "Mira Castell" })).toBeTruthy()
    expect(container.querySelector(".gh-card-rel")?.textContent).toBe("College")
    const stateLine = container.querySelector(".gh-card-state")!
    expect(stateLine.textContent).toBe("lit")
    expect(stateLine.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("circle")
    expect(fact(container, "last-contact")).toBe("Last contact 12 days ago")
    expect(fact(container, "rhythm")).toBe("Usual rhythm every 30 days")
    expect(container.querySelector('.gh-pane[data-size="card"]')?.getAttribute("data-state")).toBe("alive")
    // 100 × 78 / 90 = 86.7, shown rounded down.
    expect(screen.getByRole("img", { name: "Freshness 86 of 100" })).toBeTruthy()
    expect(fact(container, "goes-dark")).toBeUndefined()
  })

  it("leaves out an empty relationship", () => {
    const engine = makeEngine()
    const id = add(engine, { relationship: "  " })
    const { container } = renderCard(engine, id)
    expect(container.querySelector(".gh-card-rel")).toBeNull()
  })

  it('a text sent today reads "today", although the policy moves its last contact back in time', () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-50) }) // weak, freshness 44.4
    engine.tend(id, { kind: "text" }, T0) // 84.4: policyData.lastContactAt is now about 14 days ago
    const { container, person } = renderCard(engine, id)
    expect(person.policyData.lastContactAt).toBeLessThan(day(-13))
    expect(fact(container, "last-contact")).toBe("Last contact today")
  })

  it('one day ago reads "1 day ago", and with no contact logged the date given at the add is used', () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-1) })
    const { container } = renderCard(engine, id)
    expect(fact(container, "last-contact")).toBe("Last contact 1 day ago")
  })

  it("a fading person: flickering with the triangle, and when the window goes dark", () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-50) })
    const { container } = renderCard(engine, id)
    const stateLine = container.querySelector(".gh-card-state")!
    expect(stateLine.textContent).toBe("flickering")
    expect(stateLine.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("triangle")
    // Dark just after 81 days from the last contact: 31 days and under a minute from now, rounded up (shell daysUntil).
    expect(fact(container, "goes-dark")).toBe("Goes dark in 32 days")
    expect(screen.getByRole("img", { name: "Freshness 44 of 100" })).toBeTruthy()
  })

  it('a reconnected person reads "lit again" with the circle (Req 16.2)', () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-90) }) // dark from the start
    engine.resurrect(id, { kind: "call" }, T0)
    const { container } = renderCard(engine, id)
    const stateLine = container.querySelector(".gh-card-state")!
    expect(stateLine.textContent).toBe("lit again")
    expect(stateLine.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("circle")
    expect(container.querySelector(".gh-card")?.getAttribute("data-state")).toBe("litAgain")
  })

  it("uses an h2 inside the person dialog", () => {
    const engine = makeEngine()
    const id = add(engine)
    renderCard(engine, id, T0, { headingLevel: 2 })
    expect(screen.getByRole("heading", { level: 2, name: "Mira Castell" })).toBeTruthy()
  })
})

describe("PersonCard health bar (Req 13.2)", () => {
  it("has marks at 60 and 10, says what they mean, and is never shown without the window", () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-50) })
    const { container } = renderCard(engine, id)
    const bar = screen.getByRole("img", { name: "Freshness 44 of 100" })
    const marks = [...bar.querySelectorAll<HTMLElement>("[data-mark]")].map((m) => [m.dataset.mark, m.style.left])
    expect(marks).toEqual([
      ["weak", "60%"],
      ["dead", "10%"],
    ])
    expect(container.querySelector(".gh-bar-key")?.textContent).toBe("flickering below 60, boarded up below 10")
    expect(container.querySelector(".gh-pane")).not.toBeNull()
  })
})

describe("PersonCard buttons (Req 13.3, 13.4)", () => {
  it("lit or flickering: one primary Reach out, then quiet Edit, Remove and History", () => {
    for (const lastContactAt of [T0, day(-50)]) {
      const engine = makeEngine()
      const id = add(engine, { lastContactAt })
      const { container, acts, person, unmount } = renderCard(engine, id)
      const primaries = [...container.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)
      expect(primaries).toEqual(["Reach out"])
      expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Autopsy" })).toBeNull()

      fireEvent.click(screen.getByRole("button", { name: "Reach out" }))
      fireEvent.click(screen.getByRole("button", { name: "Edit" }))
      fireEvent.click(screen.getByRole("button", { name: "Remove" }))
      expect(acts.onReachOut).toHaveBeenCalledWith(person)
      expect(acts.onEdit).toHaveBeenCalledWith(person)
      expect(acts.onRemove).toHaveBeenCalledWith(person)
      unmount()
    }
  })

  it("boarded up: one primary Reconnect and a quiet Autopsy, and no Reach out", () => {
    const engine = makeEngine()
    const id = add(engine, { lastContactAt: day(-90) })
    const { container, acts, person } = renderCard(engine, id)
    expect([...container.querySelectorAll(".gh-button-primary")].map((b) => b.textContent)).toEqual(["Reconnect"])
    expect(screen.queryByRole("button", { name: "Reach out" })).toBeNull()
    const autopsy = screen.getByRole("button", { name: "Autopsy" })
    expect(autopsy.className).not.toContain("gh-button-primary")

    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }))
    fireEvent.click(autopsy)
    expect(acts.onReconnect).toHaveBeenCalledWith(person)
    expect(acts.onAutopsy).toHaveBeenCalledWith(person)
  })

  it("Edit and Remove are quiet buttons whose CSS gives at least a 44 × 44 px target", () => {
    const engine = makeEngine()
    const id = add(engine)
    renderCard(engine, id)
    for (const name of ["Edit", "Remove"]) {
      const button = screen.getByRole("button", { name })
      expect(button.className).toBe("gh-button")
    }
    const rule = ruleBody(readStyle("layout.css"), ".gh-button")!
    expect(rule).toMatch(/min-inline-size:\s*44px/)
    expect(rule).toMatch(/min-block-size:\s*44px/)
  })

  it("the global focus outline is not switched off anywhere in the card's CSS (Req 24.5)", () => {
    const css = readStyle("layout.css") + readStyle("window.css") + readStyle("street.css")
    expect(css).not.toMatch(/outline\s*:\s*(?:none|0)\b/)
    expect(readStyle("global.css")).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--sign\)/)
  })
})

describe("PersonCard button rows (Req 13.3, 13.4; CSS source checks: jsdom does not lay out)", () => {
  const css = stripComments(readStyle("layout.css"))
  const columnsOf = (body: string | undefined) => {
    const value = /grid-template-columns:\s*([^;]+)/.exec(body ?? "")?.[1] ?? ""
    const repeat = /repeat\(\s*(\d+)/.exec(value)
    return repeat !== null ? Number(repeat[1]) : value.match(/minmax\(/g)?.length ?? 0
  }

  it("the primary has the first row to itself and every quiet button sits in the row group below", () => {
    for (const [lastContactAt, primary, quiet] of [
      [T0, "Reach out", ["Edit", "Remove", "History"]],
      [day(-90), "Reconnect", ["Autopsy", "Edit", "Remove", "History"]],
    ] as const) {
      const engine = makeEngine()
      const id = add(engine, { lastContactAt })
      const { container, unmount } = renderCard(engine, id)
      const actions = container.querySelector<HTMLElement>(".gh-card-actions")!
      const [first, second, ...rest] = [...actions.children]
      expect(rest).toEqual([])
      expect(first!.textContent).toBe(primary)
      expect(first!.className).toContain("gh-button-primary")
      expect(second!.className).toBe("gh-card-quiet")
      const buttons = [...second!.querySelectorAll("button")]
      expect(buttons.map((b) => b.textContent)).toEqual(quiet)
      expect(buttons.every((b) => b.className === "gh-button")).toBe(true)
      expect(second!.getAttribute("data-count")).toBe(String(quiet.length))
      unmount()
    }
  })

  it("the primary spans the card's width on its own row", () => {
    expect(columnsOf(ruleBody(css, ".gh-card-actions"))).toBe(1)
    expect(ruleBody(css, ".gh-card-actions")).toMatch(/display:\s*grid/)
    expect(ruleBody(css, ".gh-card-actions > .gh-button-primary")).toMatch(/inline-size:\s*100%/)
  })

  it("the quiet buttons are equal widths and wrap evenly: no layout leaves one button alone on a row", () => {
    const quiet = ruleBody(css, ".gh-card-quiet")!
    expect(quiet).toMatch(/display:\s*grid/)
    expect(quiet).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)

    const container = /@container\s*\(\s*min-width:\s*(\d+)px\s*\)\s*\{([\s\S]*?\})\s*\}/.exec(css)
    expect(container).not.toBeNull()
    const wide = container![2]!

    // Every column count each set of buttons can get, narrow and wide.
    const layouts: Record<3 | 4, number[]> = {
      3: [columnsOf(quiet), columnsOf(ruleBody(wide, '.gh-card-quiet[data-count="3"]'))],
      4: [columnsOf(ruleBody(css, '.gh-card-quiet[data-count="4"]'))],
    }
    expect(layouts).toEqual({ 3: [1, 3], 4: [2] })
    for (const [count, columnCounts] of Object.entries(layouts)) {
      for (const columns of columnCounts) {
        const lastRow = Number(count) % columns
        expect(lastRow, `${count} buttons in ${columns} columns`).toBe(0)
      }
    }
    // Equal widths: every column is minmax(0, 1fr), and each button fills its cell.
    expect(css).not.toMatch(/\.gh-card-quiet[^{]*\{[^}]*grid-template-columns:[^;]*(?:auto|px|max-content)/)
    expect(ruleBody(css, ".gh-card-quiet .gh-button")).toMatch(/inline-size:\s*100%/)

    // Three in a row only once three of the widest label fit: "HISTORY" or
    // "AUTOPSY", 7 characters at 13px mono (0.6em advance) with 0.1em spacing,
    // plus 8px padding and a 1px border each side, and two 8px gaps.
    const button = ruleBody(css, ".gh-button")!
    expect(button).toMatch(/font-size:\s*13px/)
    expect(button).toMatch(/letter-spacing:\s*0\.1em/)
    const widest = 7 * (0.6 * 13 + 0.1 * 13) + 2 * 8 + 2 * 1
    expect(Number(container![1])).toBeGreaterThanOrEqual(3 * widest + 2 * 8)
  })

  it("quiet labels never break inside a word, and every card button keeps a 44 × 44 px target", () => {
    const quietButton = ruleBody(css, ".gh-card-quiet .gh-button")!
    expect(quietButton).toMatch(/overflow-wrap:\s*normal/)
    expect(quietButton).toMatch(/word-break:\s*normal/)
    expect(quietButton).toMatch(/hyphens:\s*none/)
    // Nothing for the card's buttons lowers the minimums set on .gh-button.
    expect(quietButton).not.toMatch(/min-(?:inline|block)-size|(?:^|[\s;])(?:block-size|height)\s*:/)
    const button = ruleBody(css, ".gh-button")!
    expect(button).toMatch(/min-inline-size:\s*44px/)
    expect(button).toMatch(/min-block-size:\s*44px/)
  })
})

describe("PersonCard during a preview (Req 12.5)", () => {
  it("every write button is aria-disabled with the reason and does nothing; Autopsy and History still work", () => {
    const engine = makeEngine()
    const lit = add(engine)
    const dark = add(engine, { lastContactAt: day(-90) })

    for (const [id, writes] of [
      [lit, ["Reach out", "Edit", "Remove"]],
      [dark, ["Reconnect", "Edit", "Remove"]],
    ] as const) {
      const acts = actions()
      const { unmount } = renderCard(engine, id, T0, { blocked: previewBlockedText, acts })
      for (const name of writes) {
        const button = screen.getByRole("button", { name })
        expect(button.getAttribute("aria-disabled")).toBe("true")
        expect(button.getAttribute("title")).toBe(previewBlockedText)
        const describedBy = button.getAttribute("aria-describedby")!
        expect(document.getElementById(describedBy)?.textContent).toBe(previewBlockedText)
        fireEvent.click(button)
      }
      expect(acts.onReachOut).not.toHaveBeenCalled()
      expect(acts.onReconnect).not.toHaveBeenCalled()
      expect(acts.onEdit).not.toHaveBeenCalled()
      expect(acts.onRemove).not.toHaveBeenCalled()

      const history = screen.getByRole("button", { name: "History" })
      expect(history.hasAttribute("aria-disabled")).toBe(false)
      if (id === dark) {
        fireEvent.click(screen.getByRole("button", { name: "Autopsy" }))
        expect(acts.onAutopsy).toHaveBeenCalledTimes(1)
      }
      unmount()
    }
  })

  it("without a preview no button is aria-disabled", () => {
    const engine = makeEngine()
    const id = add(engine)
    renderCard(engine, id)
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-disabled"))).toEqual([])
  })
})

describe("PersonCard history (Req 13.6)", () => {
  it("lists the logged contacts newest first with date, kind and freshness after each", () => {
    const engine = makeEngine()
    // 14-day rhythm (T = 42 days). Call on day −30 (freshness 76 → 100); text on
    // day −10 (age 20: 52.4 → 92.4).
    const id = add(engine, { rhythmDays: 14, lastContactAt: day(-40) }, day(-40))
    engine.tend(id, { kind: "call" }, day(-30))
    engine.tend(id, { kind: "text" }, day(-10))
    const { container } = renderCard(engine, id)

    const toggle = screen.getByRole("button", { name: "History" })
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(panel.hidden).toBe(true)

    fireEvent.click(toggle)

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(panel.hidden).toBe(false)
    const rows = within(panel).getAllByRole("listitem").map((li) => [...li.children].map((c) => c.textContent))
    expect(rows).toEqual([
      ["2023-11-04", "Sent a message", "freshness 92"],
      ["2023-10-15", "Had a call", "freshness 100"],
    ])
    expect(fact(container, "last-contact")).toBe("Last contact 10 days ago")

    fireEvent.click(toggle)
    expect(panel.hidden).toBe(true)
  })

  it("marks a reconnect, and says when nothing was logged", () => {
    const engine = makeEngine()
    const quiet = add(engine)
    const back = add(engine, { lastContactAt: day(-90) })
    engine.resurrect(back, { kind: "meetup" }, day(1))

    const first = renderCard(engine, quiet, day(1))
    fireEvent.click(screen.getByRole("button", { name: "History" }))
    expect(first.container.querySelector(".gh-card-history-empty")?.textContent).toBe("No contacts logged yet.")
    first.unmount()

    renderCard(engine, back, day(1))
    fireEvent.click(screen.getByRole("button", { name: "History" }))
    const rows = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-entry"))
    expect(rows.map((li) => [li.dataset.entry, [...li.children].map((c) => c.textContent)])).toEqual([
      ["resurrected", ["2023-11-15", "Met up (reconnected)", "freshness 100"]],
    ])
  })
})

describe("PersonCard reads the person it is given", () => {
  it("shows the state at the time given, not today's (a preview day)", () => {
    const engine = makeEngine()
    const id = add(engine) // lit today, flickering from day 37, dark after day 81
    const { container } = renderCard(engine, id, day(40))
    expect(container.querySelector(".gh-card")?.getAttribute("data-state")).toBe("weak")
    expect(fact(container, "last-contact")).toBe("Last contact 40 days ago")
  })

  it("passes the exact person object to every action", () => {
    const engine = makeEngine()
    const id = add(engine)
    const acts = actions()
    const { person } = renderCard(engine, id, T0, { acts })
    fireEvent.click(screen.getByRole("button", { name: "Reach out" }))
    const given = acts.onReachOut.mock.calls[0]![0] as Person
    expect(given).toBe(person)
  })
})
