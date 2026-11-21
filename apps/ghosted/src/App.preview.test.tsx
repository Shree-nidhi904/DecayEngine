// The preview in the App (task 5.5; Req 12.2, 12.5, 12.6, 8.5, 19.5). The
// sample street on a real engine, a fixed clock and a tick scheduler that
// never fires. Moving the dock 30 days ahead must show engine.view(today +
// 30 days) everywhere, set --age to 30 / 365, show the banner and block every
// write control with its reason; "Back to today" undoes all of it.
//
// The expected views are read from the same engine at the previewed time
// and put through the app's own ordering and naming helpers, so this checks
// that each view reads `now`, not how the policy computes freshness (that is
// policy.test.ts).

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { App } from "./App"
import { windowName } from "./components/House"
import { STARTED_FLAG } from "./first-run"
import { shownFreshness, sortEmpty, sortFading, sortStillLit, stateCounts } from "./lists"
import type { Person } from "./policy"
import { loadSampleData } from "./sample-data"
import type { Scheduler } from "./ticking"
import { cardText, heroText, previewBlockedText } from "./wording"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"
import { RecordingAdapter } from "./test/recording-adapter"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }
const D = 30
const PREVIEW_AT = T0 + D * DAY_MS

function renderSample() {
  const adapter = new RecordingAdapter()
  const engine = makeEngine(adapter)
  loadSampleData(engine, T0)
  const storage = new FakeStorage({ [STARTED_FLAG]: "1" })
  const { container } = render(
    <App
      engine={engine}
      storage={storage}
      session={null}
      clock={() => T0}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => true}
      timeZone="UTC"
    />
  )
  return { engine, adapter, storage, app: container.querySelector<HTMLElement>(".gh-app")! }
}

const region = (name: string) => screen.getByRole("region", { name })
const heroHeading = () => within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!

/** What the hero must say for these people (design section 4.4, the hero's cases). */
function heroMessage(people: readonly Person[]): string {
  const counts = stateCounts(people)
  if (counts.weak > 0) return heroText.flickering(counts.weak)
  if (counts.dead > 0) return heroText.nobodyFading
  return heroText.allLit
}

/** The Street's window names, sorted. */
const streetNames = () =>
  [...region("The Street").querySelectorAll<HTMLElement>("button.gh-win")].map((b) => b.getAttribute("aria-label")).sort()

const cardNames = (list: string) => [...region(list).querySelectorAll(".gh-card-name")].map((h) => h.textContent)

/** Every write control on the page outside dialogs (design section 4.2). */
function writeControls(): HTMLElement[] {
  const found = [
    ...document.querySelectorAll<HTMLElement>(
      '.gh-toolbar button[data-action="add"], .gh-toolbar button[data-action="import"], ' +
        '.gh-toolbar button[data-action="restore"], .gh-toolbar button[data-action="reset"], ' +
        '.gh-lists button[data-action="reach-out"], .gh-lists button[data-action="reconnect"], ' +
        '.gh-lists button[data-action="edit"], .gh-lists button[data-action="remove"], ' +
        "[data-hero-action], .gh-triage button[data-action=\"five-minute\"]"
    ),
  ]
  const start = within(document.querySelector<HTMLElement>(".gh-triage")!).queryByRole("button", {
    name: "Start reaching out",
  })
  if (start !== null) found.push(start)
  return found
}

describe("App: a preview 30 days ahead (Req 12.2, 12.5, 12.6)", () => {
  it("shows engine.view(today + 30 days) in the hero, the Street, the lists and the cards", () => {
    const { engine } = renderSample()
    const ahead = engine.view(PREVIEW_AT)
    // The preview really is a different street from today's.
    expect(streetNames()).toEqual(engine.view(T0).map(windowName).sort())
    expect(ahead.map(windowName).sort()).not.toEqual(streetNames())

    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))

    expect(heroHeading().textContent).toBe(heroMessage(ahead))
    // T0 is 14 Nov 2023 (UTC), so 30 days later is 14 Dec 2023.
    expect(screen.getByText(heroText.previewEyebrow("14 Dec 2023"))).toBeTruthy()
    expect(streetNames()).toEqual(ahead.map(windowName).sort())
    expect(cardNames("Fading")).toEqual(sortFading(ahead).map((p) => p.payload.name))
    expect(cardNames("Empty windows")).toEqual(sortEmpty(ahead).map((p) => p.payload.name))
    expect(within(region("Still lit")).queryAllByRole("button", { name: /^Open / }).map((b) => b.textContent)).toEqual(
      sortStillLit(ahead, PREVIEW_AT).map((r) => `Open ${r.person.payload.name}`)
    )
    // Each card's freshness is the previewed one.
    const byName = new Map(ahead.map((p) => [p.payload.name, p] as const))
    const cards = [...document.querySelectorAll<HTMLElement>(".gh-lists article.gh-card")]
    expect(cards.length).toBe(sortFading(ahead).length + sortEmpty(ahead).length)
    for (const card of cards) {
      const person = byName.get(card.querySelector(".gh-card-name")!.textContent!)!
      expect(card.querySelector(".gh-bar")!.getAttribute("aria-label")).toBe(cardText.freshness(shownFreshness(person.health)))
    }
  })

  it("sets --age to 30 / 365 and shows the banner", () => {
    const { app } = renderSample()
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    expect(app.style.getPropertyValue("--age")).toBe((30 / 365).toFixed(4))
    const dock = document.querySelector<HTMLElement>(".gh-dock")!
    expect(within(dock).getByRole("status").textContent).toContain(previewBlockedText)
    expect(within(dock).getByRole("button", { name: "Back to today" })).toBeTruthy()
  })

  it('every write control is aria-disabled with "Future preview · nothing is saved", and stays focusable', () => {
    const { adapter } = renderSample()
    const saves = adapter.saves
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))

    const controls = writeControls()
    // Toolbar (4), hero (1), Triage's start, and every card's write buttons.
    expect(controls.length).toBeGreaterThanOrEqual(4 + 1 + 1 + 3 * 4)
    for (const control of controls) {
      const label = control.textContent ?? ""
      expect(control.getAttribute("aria-disabled"), label).toBe("true")
      expect(control.getAttribute("title"), label).toBe(previewBlockedText)
      expect(control.hasAttribute("disabled"), label).toBe(false)
      control.focus()
      expect(document.activeElement, label).toBe(control)
    }
    expect(adapter.saves).toBe(saves)
  })

  it("the autopsy still opens in a preview, with its Reconnect disabled and the reason (Req 19.5)", () => {
    renderSample()
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    // Leo Marchetti has been dark since 96 days before today.
    const leo = within(region("Empty windows")).getByRole("article", { name: "Leo Marchetti" })
    fireEvent.click(within(leo).getByRole("button", { name: "Autopsy" }))
    const report = screen.getByRole("dialog", { name: "How the window went dark" })
    const reconnect = within(report).getByRole("button", { name: "Reconnect" })
    expect(reconnect.getAttribute("aria-disabled")).toBe("true")
    expect(reconnect.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(reconnect)
    expect(screen.queryByRole("dialog", { name: /^Reconnect with / })).toBeNull()
  })

  it("Back to today shows today's street again and re-enables every write control", () => {
    const { engine, app } = renderSample()
    const today = engine.view(T0)
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    expect(document.querySelectorAll('[aria-disabled="true"]').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))

    expect(app.style.getPropertyValue("--age")).toBe("0.0000")
    expect(app.hasAttribute("data-previewing")).toBe(false)
    expect(screen.queryByText(/^Future preview · /)).toBeNull()
    expect(heroHeading().textContent).toBe(heroMessage(today))
    expect(streetNames()).toEqual(today.map(windowName).sort())
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0)
    for (const control of writeControls()) {
      expect(control.hasAttribute("title"), control.textContent ?? "").toBe(false)
    }
    // Writes work again: the toolbar's Add opens its form.
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }))
    expect(screen.getByRole("dialog", { name: "Add a person" })).toBeTruthy()
  })
})
