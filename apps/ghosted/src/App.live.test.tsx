// Live state changes in the App (task L3, Req 38, design section 15.8).
//
// A real engine on InMemoryAdapter, a fixed clock moved by hand and the
// App's fake tick scheduler: each `tickAt(t)` is one minute tick at t. The
// person is Mira Castell, rhythm 10 days (T = 30 days), last contact T0:
// lit until exactly T0 + 12 days (freshness 60), flickering after it, still
// flickering at exactly T0 + 27 days (freshness 10), dark after it.

import "./test/dialog-polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import { STARTED_FLAG } from "./first-run"
import type { PersonPayload } from "./policy"
import { SPLASH_SEEN_FLAG } from "./splash"
import { badgeIcon } from "./tab-signal"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"

const BASE_HREF = "data:image/svg+xml,base"
const FLICKER = "Mira Castell's window started to flicker."
const DARK = "Mira Castell's window went dark."

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  // As index.html: the title and the favicon link.
  document.title = "Ghosted"
  const link = document.createElement("link")
  link.rel = "icon"
  link.setAttribute("href", BASE_HREF)
  document.head.appendChild(link)
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  for (const link of document.querySelectorAll('link[rel~="icon"]')) link.remove()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

type Someone = [name: string, rhythmDays: number, importance: number]

function renderLive(options: { start: number; people?: Someone[]; reducedMotion?: boolean }) {
  const engine = makeEngine()
  for (const [name, rhythmDays, importance] of options.people ?? [["Mira Castell", 10, 2]]) {
    const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt: T0 }
    engine.addItem({ payload, importance, costMinutes: 10 }, T0)
  }
  const time = { at: options.start }
  const clock = () => time.at
  let callback: (() => void) | null = null
  const scheduler: Scheduler = {
    setInterval: (cb) => {
      callback = cb
      return 1
    },
    clearInterval: () => {
      callback = null
    },
  }
  render(
    <App
      engine={engine}
      storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
      session={new FakeStorage({ [SPLASH_SEEN_FLAG]: "1" })}
      clock={clock}
      tickScheduler={scheduler}
      prefersReducedMotion={() => options.reducedMotion === true}
      timeZone="UTC"
    />
  )
  /** One minute tick at `at`. */
  const tickAt = (at: number) => {
    time.at = at
    expect(callback, "the minute tick is running").not.toBeNull()
    act(() => callback!())
  }
  return { engine, time, tickAt, ticking: () => callback !== null }
}

const announcer = () => document.getElementById(ANNOUNCER_ID)!
const toasts = () => [...document.querySelectorAll<HTMLElement>(".gh-toast")]
const toastText = () => toasts()[0]?.querySelector(".gh-toast-text")?.textContent ?? null
/** A card in Fading or Empty windows (Still lit has rows, not cards). */
const card = (list: "Fading" | "Empty windows", name: string) =>
  within(screen.getByRole("region", { name: list })).getByRole("article", { name })
const stillLit = (name: string) =>
  within(screen.getByRole("region", { name: "Still lit" })).getByRole("button", { name: `Open ${name}` })
const marked = () => [...document.querySelectorAll<HTMLElement>(".gh-card.gh-just-changed")]
const LIVE = '[aria-live], [role="status"], [role="alert"], [role="log"]'
const FOCUSABLE = "button, a[href], input, select, textarea, summary, [tabindex]"
const expandDock = () => fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
const heroHeading = () => within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!

describe("App: a minute tick that moves a window (Req 38.1-38.4)", () => {
  it("lit to flickering: one toast, said once, the card's window flickers out, the marker goes when that ends", () => {
    const { engine, tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    // The tick at mount only records the states.
    expect(stillLit("Mira Castell")).toBeTruthy()
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")

    tickAt(day(12) + MINUTE_MS)

    expect(engine.view(day(12) + MINUTE_MS)[0]!.state).toBe("weak")
    expect(toasts()).toHaveLength(1)
    expect(toastText()).toBe(FLICKER)
    // Said once, through the one live region; the toast's own copy is hidden from screen readers.
    expect(announcer().textContent).toBe(FLICKER)
    expect(announcer().querySelector("p")!.className).toBe("gh-visually-hidden")
    expect(toasts()[0]!.querySelector(".gh-toast-text")!.getAttribute("aria-hidden")).toBe("true")
    // The toast sits at the top of the dock, inside it.
    expect(document.querySelector(".gh-dock")!.firstElementChild).toBe(toasts()[0])

    // The card, now in Fading, reacts once.
    const mira = card("Fading", "Mira Castell")
    expect(mira.classList.contains("gh-just-changed")).toBe(true)
    const pane = mira.querySelector(".gh-pane")
    expect(pane).not.toBeNull()
    fireEvent.animationEnd(pane!)
    expect(card("Fading", "Mira Castell").classList.contains("gh-just-changed")).toBe(false)

    // The toast's fade-out ends: it is gone.
    fireEvent.animationEnd(toasts()[0]!)
    expect(toasts()).toHaveLength(0)
    // The tab is visible: the title never changed.
    expect(document.title).toBe("Ghosted")
  })

  it("flickering to dark, a later tick: the card in Empty windows reacts", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    tickAt(day(12) + MINUTE_MS)
    expect(toastText()).toBe(FLICKER)
    // Exactly freshness 10 at T0 + 27 days: still flickering, so no new message, and the old one is cleared.
    tickAt(day(27))
    expect(toasts()).toHaveLength(0)
    expect(marked()).toHaveLength(0)
    tickAt(day(27) + MINUTE_MS)
    expect(toastText()).toBe(DARK)
    expect(announcer().textContent).toBe(DARK)
    expect(card("Empty windows", "Mira Castell").classList.contains("gh-just-changed")).toBe(true)
  })

  it("lit to dark in one step (the tab slept through the flicker)", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    tickAt(day(28))
    expect(toastText()).toBe("Mira Castell's window went from lit to dark.")
    expect(marked()).toEqual([card("Empty windows", "Mira Castell")])
  })

  it("several windows in one tick give one combined toast, naming the most important", () => {
    const { tickAt } = renderLive({
      start: day(12) - MINUTE_MS,
      people: [
        ["Mira Castell", 10, 2],
        ["Ana Ruiz", 10, 3],
        ["Dan Okafor", 10, 1],
      ],
    })
    tickAt(day(12) + MINUTE_MS)
    expect(toasts()).toHaveLength(1)
    expect(toastText()).toBe("3 windows started to flicker, Ana Ruiz's among them.")
    expect(announcer().textContent).toBe("3 windows started to flicker, Ana Ruiz's among them.")
    expect(marked()).toHaveLength(3)
  })

  it("a tick with no change adds nothing", () => {
    const { tickAt } = renderLive({ start: day(1) })
    tickAt(day(1) + MINUTE_MS)
    tickAt(day(2))
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    expect(marked()).toHaveLength(0)
  })
})

describe("App: when there is no toast (Req 38.1)", () => {
  it("never on the first tick at mount, even when a window went dark while the tab was closed", () => {
    setVisibility("hidden")
    renderLive({ start: day(30) })
    expect(card("Empty windows", "Mira Castell")).toBeTruthy()
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    expect(marked()).toHaveLength(0)
    expect(document.title).toBe("Ghosted")
  })

  it("never while previewing, never on the first tick after Back to today; the next real change still shows", () => {
    const { time, tickAt, ticking } = renderLive({ start: day(12) - MINUTE_MS })
    expandDock()
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    // No minute tick runs during a preview, and the previewed dark window is not a change.
    expect(ticking()).toBe(false)
    expect(card("Empty windows", "Mira Castell")).toBeTruthy()
    expect(toasts()).toHaveLength(0)
    expect(marked()).toHaveLength(0)

    // Meanwhile the real clock passes the flicker. Back to today ticks at once; that tick only records.
    time.at = day(12) + MINUTE_MS
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))
    expect(ticking()).toBe(true)
    expect(card("Fading", "Mira Castell")).toBeTruthy()
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    expect(marked()).toHaveLength(0)

    tickAt(day(27) + MINUTE_MS)
    expect(toastText()).toBe(DARK)
  })

  it("never for the user's own change: an edit that makes the window flicker", () => {
    const { tickAt } = renderLive({ start: day(5), people: [["Mira Castell", 30, 2]] })
    // Rhythm 30 (T = 90 days) at day 5: freshness 94.4, lit.
    fireEvent.click(stillLit("Mira Castell"))
    fireEvent.click(within(screen.getByRole("dialog", { name: "Mira Castell" })).getByRole("button", { name: "Edit" }))
    const form = screen.getByRole("dialog", { name: "Edit Mira Castell" })
    fireEvent.change(within(form).getByLabelText("Usual rhythm in days"), { target: { value: "2" } })
    fireEvent.click(within(form).getByRole("button", { name: "Save" }))
    // Rhythm 2 (T = 6 days) at day 5: freshness 16.7, flickering at once.
    expect(card("Fading", "Mira Castell")).toBeTruthy()
    expect(announcer().textContent).toBe("Mira Castell was saved.")

    tickAt(day(5) + MINUTE_MS)
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("Mira Castell was saved.")
    expect(marked()).toHaveLength(0)

    // Time still moves her: dark after 5.4 days, and that is reported.
    tickAt(day(5) + DAY_MS / 2)
    expect(toastText()).toBe(DARK)
  })
})

describe("App: reduced motion (Req 38.2, 38.4)", () => {
  it("the toast and the words, but no card marker; the toast stays until the next tick", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS, reducedMotion: true })
    tickAt(day(12) + MINUTE_MS)
    expect(toastText()).toBe(FLICKER)
    expect(announcer().textContent).toBe(FLICKER)
    expect(card("Fading", "Mira Castell").classList.contains("gh-just-changed")).toBe(false)
    expect(marked()).toHaveLength(0)

    tickAt(day(12) + 2 * MINUTE_MS)
    expect(toasts()).toHaveLength(0)
  })
})

describe("App: the tab title and favicon (Req 38.6, 38.7)", () => {
  it("count the changes while hidden, and reset on visibilitychange", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!
    act(() => setVisibility("hidden"))

    tickAt(day(12) + MINUTE_MS)
    expect(document.title).toBe("(1) Ghosted")
    expect(link.getAttribute("href")).toBe(badgeIcon("weak"))
    expect(link.getAttribute("title")).toBe("(1) Ghosted")

    tickAt(day(27) + MINUTE_MS)
    expect(document.title).toBe("(2) Ghosted")
    expect(link.getAttribute("href")).toBe(badgeIcon("dead"))

    act(() => setVisibility("visible"))
    expect(document.title).toBe("Ghosted")
    expect(link.getAttribute("href")).toBe(BASE_HREF)
    expect(link.hasAttribute("title")).toBe(false)
  })

  it("shows (9+) for ten windows in one hidden tick", () => {
    const people: Someone[] = Array.from({ length: 10 }, (_, i) => [`Person ${String.fromCharCode(65 + i)}`, 10, 2])
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS, people })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(document.title).toBe("(9+) Ghosted")
    expect(toastText()).toBe("10 windows started to flicker, Person A's among them.")
  })
})

describe("App: accessibility of the toast (Req 38.5)", () => {
  it("adds no live region, takes no focus, and only its Dismiss button is in the Tab order", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    const liveBefore = document.querySelectorAll(LIVE).length
    expect([...document.querySelectorAll(LIVE)]).toContain(announcer())
    const add = document.querySelector<HTMLElement>('.gh-toolbar [data-action="add"]')!
    add.focus()

    tickAt(day(12) + MINUTE_MS)

    const toast = toasts()[0]!
    expect(document.activeElement).toBe(add)
    expect(document.querySelectorAll(LIVE)).toHaveLength(liveBefore)
    expect(toast.matches(LIVE)).toBe(false)
    expect(toast.querySelectorAll(LIVE)).toHaveLength(0)
    expect(toast.hasAttribute("tabindex")).toBe(false)
    const focusable = [...toast.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const dismiss = within(toast).getByRole("button", { name: "Dismiss" })
    expect(focusable).toEqual([dismiss])
    expect(dismiss.className).toBe("gh-button gh-toast-dismiss")
  })

  it("Dismiss removes it; focus that was on Dismiss goes to the hero heading", () => {
    const { tickAt } = renderLive({ start: day(12) - MINUTE_MS })
    tickAt(day(12) + MINUTE_MS)
    const dismiss = within(toasts()[0]!).getByRole("button", { name: "Dismiss" })
    dismiss.focus()
    fireEvent.click(dismiss)
    expect(toasts()).toHaveLength(0)
    expect(document.activeElement).toBe(heroHeading())
  })
})
