// The preview in the App (task 5.5; Req 12.2, 12.5, 12.6, 8.5, 19.5). The
// sample street on a real engine, a fixed clock and a tick scheduler that
// never fires. Moving the dock 30 days ahead must show engine.view(today +
// 30 days) everywhere, set --age to 30 / 365, show the banner and block every
// write control with its reason; "Back to now" undoes all of it.
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
import { regionOrList, listPanel, openSettings } from "./test/ui"

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

const region = regionOrList

/** Moves the dock 30 days ahead with its jump. The dock starts collapsed (task L2), so it is expanded first, as a user would. */
function jumpAhead() {
  fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
  fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
}
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

/**
 * Runs `check` on every write control on the page outside dialogs (design section 4.2), and returns how many there
 * were: the toolbar's Add a person, Restore and Reset all data (in the Settings sheet, feedback list point 7), the
 * hero's, Triage's, and every card's buttons. The lists show one at a time (point 23), so the Fading and Empty
 * windows cards are checked while their own tab is showing.
 */
function eachWriteControl(check: (control: HTMLElement) => void): number {
  // Restore and Reset can only take focus while their sheet is open.
  if (document.querySelector("#gh-settings[open]") === null) openSettings()
  let count = 0
  const run = (selector: string) =>
    document.querySelectorAll<HTMLElement>(selector).forEach((control) => {
      count += 1
      check(control)
    })
  run(
    '.gh-toolbar button[data-action="add"], #gh-settings button[data-action="restore"], ' +
      '#gh-settings button[data-action="reset"], [data-hero-action], .gh-triage button[data-action="five-minute"]'
  )
  const start = within(document.querySelector<HTMLElement>(".gh-triage")!).queryByRole("button", {
    name: "Start reaching out",
  })
  if (start !== null) {
    count += 1
    check(start)
  }
  for (const list of ["Fading", "Empty windows"]) {
    listPanel(list)
    run(
      '.gh-lists button[data-action="reach-out"], .gh-lists button[data-action="reconnect"], ' +
        '.gh-lists button[data-action="edit"], .gh-lists button[data-action="remove"]'
    )
  }
  return count
}

describe("App: a preview 30 days ahead (Req 12.2, 12.5, 12.6)", () => {
  it("shows engine.view(today + 30 days) in the hero, the Street, the lists and the cards", () => {
    const { engine } = renderSample()
    const ahead = engine.view(PREVIEW_AT)
    // The preview really is a different street from today's.
    expect(streetNames()).toEqual(engine.view(T0).map(windowName).sort())
    expect(ahead.map(windowName).sort()).not.toEqual(streetNames())

    jumpAhead()

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
    // One list shows at a time (feedback list, point 23): collect the cards of Fading, then Empty windows.
    const cards = ["Fading", "Empty windows"].flatMap((list) => [...listPanel(list).querySelectorAll<HTMLElement>("article.gh-card")])
    expect(cards.length).toBe(sortFading(ahead).length + sortEmpty(ahead).length)
    for (const card of cards) {
      const person = byName.get(card.querySelector(".gh-card-name")!.textContent!)!
      expect(card.querySelector(".gh-bar")!.getAttribute("aria-label")).toBe(cardText.freshness(shownFreshness(person.health)))
    }
  })

  it("sets --age to 30 / 365 and shows the banner", () => {
    const { app } = renderSample()
    jumpAhead()
    expect(app.style.getPropertyValue("--age")).toBe((30 / 365).toFixed(4))
    const dock = document.querySelector<HTMLElement>(".gh-dock")!
    expect(within(dock).getByRole("status").textContent).toContain(previewBlockedText)
    expect(within(dock).getByRole("button", { name: "Back to now" })).toBeTruthy()
  })

  it('every write control is aria-disabled with "Future preview · nothing is saved", and stays focusable', () => {
    const { adapter } = renderSample()
    const saves = adapter.saves
    jumpAhead()

    const count = eachWriteControl((control) => {
      const label = control.textContent ?? ""
      expect(control.getAttribute("aria-disabled"), label).toBe("true")
      expect(control.getAttribute("title"), label).toBe(previewBlockedText)
      expect(control.hasAttribute("disabled"), label).toBe(false)
      control.focus()
      expect(document.activeElement, label).toBe(control)
    })
    // Add a person, Restore and Reset (3), hero (1), Triage's start, and every card's write buttons.
    expect(count).toBeGreaterThanOrEqual(3 + 1 + 1 + 3 * 4)
    expect(adapter.saves).toBe(saves)
  })

  it("the autopsy still opens in a preview, with its Reconnect disabled and the reason (Req 19.5)", () => {
    renderSample()
    jumpAhead()
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

  it("the loss forecast line is gone while previewing and back with the same words after Back to now (task P4, Req 35.7)", () => {
    renderSample()
    const line = () => document.querySelector<HTMLElement>(".gh-hero-loss")
    // Today's sample street: Sunita starts to flicker at +2.4 days (design section 12.5).
    const today = heroText.lossForecast(1, 0)
    expect(line()!.textContent).toBe(today)

    jumpAhead()

    expect(line()).toBeNull()
    expect(screen.getByText(heroText.previewEyebrow("14 Dec 2023"))).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Back to now" }))

    expect(line()!.textContent).toBe(today)
    expect(heroHeading().nextElementSibling).toBe(line())
  })

  it("the Triage saves line follows the previewed picks: 15 days ahead it shows at 30 minutes, while Start stays blocked (task P5, Req 36.8)", () => {
    renderSample()
    const triage = () => document.querySelector<HTMLElement>(".gh-triage")!
    const line = () => triage().querySelector<HTMLElement>(".shell-triage-note")
    const ONE = "A call or meet-up with these people keeps 1 window from going dark in the next 7 days."
    // Today nobody flickering goes dark within 7 days (design section 13.7).
    expect(line()).toBeNull()

    // 15 days ahead with the slider (it works while the dock is collapsed, Req 34.4).
    fireEvent.change(screen.getByRole("slider"), { target: { value: String(15 * DAY_MS) } })
    // 30 minutes: Dan and Meera; Meera goes dark 6.7 days later, and a call keeps her lit.
    expect(line()!.textContent).toBe(ONE)
    const start = within(triage()).getByRole("button", { name: "Start reaching out" })
    expect(start.getAttribute("aria-disabled")).toBe("true")
    expect(start.getAttribute("title")).toBe(previewBlockedText)

    // 15 minutes: Dan and Sam, neither at risk.
    fireEvent.click(within(triage()).getByRole("radio", { name: "15 min" }))
    expect(line()).toBeNull()
    fireEvent.click(within(triage()).getByRole("radio", { name: "30 min" }))
    expect(line()!.textContent).toBe(ONE)

    fireEvent.click(screen.getByRole("button", { name: "Back to now" }))
    expect(line()).toBeNull()
  })

  it("Back to now shows today's street again and re-enables every write control", () => {
    const { engine, app } = renderSample()
    const today = engine.view(T0)
    jumpAhead()
    expect(document.querySelectorAll('[aria-disabled="true"]').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Back to now" }))

    expect(app.style.getPropertyValue("--age")).toBe("0.0000")
    expect(app.hasAttribute("data-previewing")).toBe(false)
    expect(screen.queryByText(/^Future preview · /)).toBeNull()
    expect(heroHeading().textContent).toBe(heroMessage(today))
    expect(streetNames()).toEqual(today.map(windowName).sort())
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0)
    const count = eachWriteControl((control) => {
      expect(control.hasAttribute("title"), control.textContent ?? "").toBe(false)
    })
    expect(count).toBeGreaterThanOrEqual(3 + 1 + 1 + 3 * 4)
    // Writes work again: the toolbar's Add opens its form.
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }))
    expect(screen.getByRole("dialog", { name: "Add a person" })).toBeTruthy()
  })
})
