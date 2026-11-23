// @vitest-environment jsdom
//
// Live state changes in the App (task L3, Requirement 23, design "Live State
// Changes", Tests).
//
// A real engine on InMemoryAdapter, a hand-moved clock and the App's fake
// tick scheduler (as test/app-kit.tsx): each `tickAt(t)` is one minute tick
// at t. A solid fact (half-life 10 days, health 100 at T0) is in the Crypt
// until T0 + 7.37 days (health 60), in the Dungeon after it, and in the
// Graveyard after T0 + 33.22 days (health 10). Day 7: 61.6, day 8: 57.4,
// day 33: 10.2, day 34: 9.5.

import "./test/dialog-polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { ANNOUNCER_ID, App } from "./App"
import { creatureOf } from "./creatures"
import { DAY_MS, studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { badgeIcon } from "./tab-signal"
import type { Scheduler } from "./ticking"
import { MemoryStorage } from "./test/app-kit"
import { T0, day } from "./test/fixtures"

const MINUTE_MS = 60_000

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  document.title = "Study Dungeon"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  for (const link of document.querySelectorAll('link[rel~="icon"]')) link.remove()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

const noFrames: FrameScheduler = {
  request() {
    throw new Error("test bug: Play was not expected")
  },
  cancel() {},
}

type Spec = [id: string, importance: number]

function renderLive(options: { start: number; facts?: Spec[]; reducedMotion?: boolean }) {
  const queue: string[] = []
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, new InMemoryAdapter(), () => {
    const id = queue.shift()
    if (id === undefined) throw new Error("test bug: no id queued")
    return id
  })
  for (const [id, importance] of options.facts ?? [["f1", 2]]) {
    queue.push(id)
    engine.addItem(
      { payload: { question: `Question ${id}`, answer: `Answer ${id}`, why: "", knowledge: "solid" }, importance, costMinutes: 2 },
      T0
    )
  }
  const time = { at: options.start }
  let callback: (() => void) | null = null
  const scheduler: Scheduler = {
    setInterval(cb) {
      callback = cb
      return 1
    },
    clearInterval() {
      callback = null
    },
  }
  render(
    <App
      engine={engine}
      clock={() => time.at}
      tickScheduler={scheduler}
      frameScheduler={noFrames}
      frameClock={() => 0}
      prefersReducedMotion={() => options.reducedMotion === true}
      formatDate={(ms) => new Date(ms).toISOString().slice(0, 10)}
      storage={new MemoryStorage({ "study-dungeon:started": "1" })}
      timeZone="UTC"
      defaultAnswerCheck="self"
      session={new MemoryStorage()}
    />
  )
  const tickAt = (at: number) => {
    time.at = at
    expect(callback, "the minute tick is running").not.toBeNull()
    act(() => callback!())
  }
  return { engine, time, tickAt, ticking: () => callback !== null }
}

const announcer = () => document.getElementById(ANNOUNCER_ID)!
const toasts = () => [...document.querySelectorAll<HTMLElement>(".sd-toast")]
const toastText = () => toasts()[0]?.querySelector(".sd-toast-text")?.textContent ?? null
const openTab = (list: "Crypt" | "Dungeon" | "Graveyard") =>
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${list}`) }))
const card = (id: string) => screen.getByRole("article", { name: `Question ${id}` })
const marked = () => [...document.querySelectorAll<HTMLElement>(".sd-card.sd-just-changed")]
const LIVE = '[aria-live], [role="status"], [role="alert"], [role="log"]'
const FOCUSABLE = "button, a[href], input, select, textarea, summary, [tabindex]"

describe("App: a minute tick that moves a fact (Requirement 23.1-23.4)", () => {
  it("Crypt to Dungeon: one toast, said once, the creature wakes, the marker goes when that ends", () => {
    const { engine, tickAt } = renderLive({ start: day(7) })
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    const gaze = creatureOf("f1").name
    const words = `${gaze} just weakened.`

    tickAt(day(8))

    expect(engine.view(day(8))[0]!.state).toBe("weak")
    expect(toasts()).toHaveLength(1)
    expect(toastText()).toBe(words)
    // Said once, through the one live region; the toast's own copy is hidden from screen readers.
    expect(announcer().textContent).toBe(words)
    expect(announcer().querySelector("p")!.className).toBe("sd-visually-hidden")
    expect(toasts()[0]!.querySelector(".sd-toast-text")!.getAttribute("aria-hidden")).toBe("true")
    // The toast sits at the top of the dock, inside it.
    expect(document.querySelector(".sd-dock")!.firstElementChild).toBe(toasts()[0])

    // The Dungeon tab is open by default: the card's creature wakes.
    expect(card("f1").classList.contains("sd-just-changed")).toBe(true)
    const creature = card("f1").querySelector(".sd-card-top > :first-child")
    expect(creature).not.toBeNull()
    // Another named animation ending inside the card (the grave's hover wiggle) does not count.
    const other = new Event("animationend", { bubbles: true })
    Object.defineProperty(other, "animationName", { value: "sd-wiggle" })
    act(() => {
      creature!.dispatchEvent(other)
    })
    expect(card("f1").classList.contains("sd-just-changed")).toBe(true)
    // The wake's own end does.
    const wakeEnd = new Event("animationend", { bubbles: true })
    Object.defineProperty(wakeEnd, "animationName", { value: "sd-wake" })
    act(() => {
      creature!.dispatchEvent(wakeEnd)
    })
    expect(card("f1").classList.contains("sd-just-changed")).toBe(false)

    fireEvent.animationEnd(toasts()[0]!)
    expect(toasts()).toHaveLength(0)
    expect(document.title).toBe("Study Dungeon")
  })

  it("Dungeon to Graveyard on a later tick; exactly health 10.2 is still weak", () => {
    const { tickAt } = renderLive({ start: day(7) })
    const gaze = creatureOf("f1").name
    tickAt(day(8))
    tickAt(day(33))
    expect(toasts()).toHaveLength(0)
    openTab("Graveyard")
    tickAt(day(34))
    expect(toastText()).toBe(`${gaze} just died and went to the Graveyard.`)
    expect(announcer().textContent).toBe(`${gaze} just died and went to the Graveyard.`)
    expect(card("f1").classList.contains("sd-just-changed")).toBe(true)
  })

  it("Crypt to Graveyard in one tick", () => {
    const { tickAt } = renderLive({ start: day(7) })
    tickAt(day(40))
    expect(toastText()).toBe(`${creatureOf("f1").name} just died in its sleep and went to the Graveyard.`)
  })

  it("several facts in one tick give one combined toast, naming the most important", () => {
    const { tickAt } = renderLive({
      start: day(7),
      facts: [
        ["f1", 2],
        ["f2", 3],
        ["f3", 1],
      ],
    })
    tickAt(day(8))
    expect(toasts()).toHaveLength(1)
    const words = `3 facts weakened, ${creatureOf("f2").name}'s among them.`
    expect(toastText()).toBe(words)
    expect(announcer().textContent).toBe(words)
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

describe("App: when there is no toast (Requirement 23.9)", () => {
  it("never on the first tick at mount, even when a fact died while the tab was closed", () => {
    setVisibility("hidden")
    renderLive({ start: day(40) })
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    expect(marked()).toHaveLength(0)
    expect(document.title).toBe("Study Dungeon")
  })

  it("never while previewing, never on the first tick after Back to today; the next real change still shows", () => {
    const { time, tickAt, ticking } = renderLive({ start: day(7) })
    fireEvent.change(screen.getByRole("slider"), { target: { value: String(30 * DAY_MS) } })
    expect(ticking()).toBe(false)
    expect(toasts()).toHaveLength(0)
    expect(marked()).toHaveLength(0)

    // The real clock passes the weakening meanwhile. Back to today ticks at once; that tick only records.
    time.at = day(8)
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))
    expect(ticking()).toBe(true)
    expect(card("f1").getAttribute("data-state")).toBe("weak")
    expect(toasts()).toHaveLength(0)
    expect(announcer().textContent).toBe("")
    expect(marked()).toHaveLength(0)

    tickAt(day(34))
    expect(toastText()).toBe(`${creatureOf("f1").name} just died and went to the Graveyard.`)
  })

  it("never for the user's own change: a wrong answer that sends a sleeping fact to the Dungeon", () => {
    const { tickAt } = renderLive({ start: day(1) })
    openTab("Crypt")
    fireEvent.click(within(card("f1")).getByRole("button", { name: "Fight" }))
    const fight = screen.getByRole("dialog")
    fireEvent.click(within(fight).getByRole("button", { name: "Show answer" }))
    fireEvent.click(within(fight).getByRole("button", { name: "I forgot" }))
    // A wrong answer sets health to 45 (the Dungeon) and halves the half-life to 5 days.
    tickAt(day(1) + MINUTE_MS)
    expect(toasts()).toHaveLength(0)
    expect(marked()).toHaveLength(0)

    // Time still moves it: 45 × 0.5^(t / 5) is below 10 after 10.85 days, and that is reported.
    tickAt(day(12))
    expect(toastText()).toBe(`${creatureOf("f1").name} just died and went to the Graveyard.`)
  })
})

describe("App: reduced motion (Requirement 23.2, 23.4)", () => {
  it("the toast and the words, but no card marker; the toast stays until the next tick", () => {
    const { tickAt } = renderLive({ start: day(7), reducedMotion: true })
    tickAt(day(8))
    const words = `${creatureOf("f1").name} just weakened.`
    expect(toastText()).toBe(words)
    expect(announcer().textContent).toBe(words)
    expect(card("f1").classList.contains("sd-just-changed")).toBe(false)
    expect(marked()).toHaveLength(0)
    tickAt(day(8) + MINUTE_MS)
    expect(toasts()).toHaveLength(0)
  })
})

describe("App: the tab title and favicon (Requirement 23.6, 23.7)", () => {
  it("count the changes while hidden, and reset on visibilitychange", () => {
    const { tickAt } = renderLive({ start: day(7) })
    act(() => setVisibility("hidden"))

    tickAt(day(8))
    expect(document.title).toBe("(1) Study Dungeon")
    const link = () => document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    expect(link()!.getAttribute("href")).toBe(badgeIcon("weak"))
    expect(link()!.getAttribute("title")).toBe("(1) Study Dungeon")

    tickAt(day(34))
    expect(document.title).toBe("(2) Study Dungeon")
    expect(link()!.getAttribute("href")).toBe(badgeIcon("dead"))

    act(() => setVisibility("visible"))
    expect(document.title).toBe("Study Dungeon")
    // index.html has no favicon link, so the one added while counting is gone again.
    expect(link()).toBeNull()
  })

  it("shows (9+) for ten facts in one hidden tick", () => {
    const facts: Spec[] = Array.from({ length: 10 }, (_, i) => [`f${i + 1}`, 2])
    const { tickAt } = renderLive({ start: day(7), facts })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(document.title).toBe("(9+) Study Dungeon")
  })
})

describe("App: accessibility of the toast (Requirement 23.5)", () => {
  it("adds no live region, takes no focus, and only its quiet Dismiss button is in the Tab order", () => {
    const { tickAt } = renderLive({ start: day(7) })
    const liveBefore = document.querySelectorAll(LIVE).length
    expect([...document.querySelectorAll(LIVE)]).toContain(announcer())
    const add = screen.getAllByRole("button", { name: "Add fact" })[0]!
    add.focus()

    tickAt(day(8))

    const toast = toasts()[0]!
    expect(document.activeElement).toBe(add)
    expect(document.querySelectorAll(LIVE)).toHaveLength(liveBefore)
    expect(toast.matches(LIVE)).toBe(false)
    expect(toast.querySelectorAll(LIVE)).toHaveLength(0)
    expect(toast.hasAttribute("tabindex")).toBe(false)
    const dismiss = within(toast).getByRole("button", { name: "Dismiss" })
    expect([...toast.querySelectorAll<HTMLElement>(FOCUSABLE)]).toEqual([dismiss])
    // Quiet: Play stays the dock's only filled button.
    expect(dismiss.className).toBe("sd-button sd-button-quiet sd-toast-dismiss")
    expect(dismiss.className).not.toMatch(/primary/)
  })

  it("Dismiss removes it; focus that was on Dismiss goes to <main>", () => {
    const { tickAt } = renderLive({ start: day(7) })
    tickAt(day(8))
    const dismiss = within(toasts()[0]!).getByRole("button", { name: "Dismiss" })
    dismiss.focus()
    fireEvent.click(dismiss)
    expect(toasts()).toHaveLength(0)
    expect(document.activeElement).toBe(screen.getByRole("main"))
  })
})
