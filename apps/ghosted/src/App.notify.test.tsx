// Notifications while the tab is open, in the App (task L5, Req 39, design
// section 16.5). The real engine, fixed clock and fake tick scheduler of
// App.live.test.tsx, plus a fake Notification class. Mira Castell, rhythm 10
// days, last contact T0: lit until T0 + 12 days, flickering after it, dark
// after T0 + 27 days.

import "./test/dialog-polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ANNOUNCER_ID, App } from "./App"
import { STARTED_FLAG, type FlagStorage } from "./first-run"
import { NOTIFY_SETTING_KEY, NOTIFY_TAG } from "./notify"
import type { PersonPayload } from "./policy"
import { SPLASH_SEEN_FLAG } from "./splash"
import type { Scheduler } from "./ticking"
import { FakeStorage } from "./test/fake-storage"
import { fakeNotifications, throwingStorage, type FakeNotifications } from "./test/fake-notification"
import { MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"
import { notifyText } from "./wording"
import { openSettings } from "./test/ui"

const LABEL = "Notify me about changes while this tab is open"
const FLICKER = "Mira Castell's window started to flicker."
const DARK = "Mira Castell's window went dark."
const LIVE = '[aria-live], [role="status"], [role="alert"], [role="log"]'

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  document.title = "Ghosted"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  for (const link of document.querySelectorAll('link[rel~="icon"]')) link.remove()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

type Someone = [name: string, rhythmDays: number, importance: number]

function renderApp(options: {
  start: number
  fake: FakeNotifications | null
  storage?: FlagStorage
  people?: Someone[]
  focusWindow?: () => void
}) {
  const engine = makeEngine()
  for (const [name, rhythmDays, importance] of options.people ?? [["Mira Castell", 10, 2]]) {
    const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt: T0 }
    engine.addItem({ payload, importance, costMinutes: 10 }, T0)
  }
  const time = { at: options.start }
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
  const storage = options.storage ?? new FakeStorage({ [STARTED_FLAG]: "1" })
  const props = {
    engine,
    storage,
    session: new FakeStorage({ [SPLASH_SEEN_FLAG]: "1" }),
    clock: () => time.at,
    tickScheduler: scheduler,
    prefersReducedMotion: () => true,
    timeZone: "UTC",
    notifications: options.fake === null ? null : options.fake.api,
    ...(options.focusWindow === undefined ? {} : { focusWindow: options.focusWindow }),
  }
  const view = render(<App {...props} />)
  // The setting is in the Settings sheet (feedback list, point 7).
  openSettings()
  const tickAt = (at: number) => {
    time.at = at
    expect(callback, "the minute tick is running").not.toBeNull()
    act(() => callback!())
  }
  return { engine, time, tickAt, storage, view, props }
}

const theSwitch = () => screen.getByRole("switch", { name: LABEL })
const toastText = () => document.querySelector(".gh-toast .gh-toast-text")?.textContent ?? null
const announcer = () => document.getElementById(ANNOUNCER_ID)!
const onStorage = () => new FakeStorage({ [STARTED_FLAG]: "1", [NOTIFY_SETTING_KEY]: "on" })

describe("App: when a notification is shown (Req 39.5, 39.6)", () => {
  it("on, granted and hidden: one notification per tick, with the toast's words and the tag", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: onStorage() })
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    act(() => setVisibility("hidden"))

    tickAt(day(12) + MINUTE_MS)
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.title).toBe("Ghosted")
    expect(fake.shown[0]!.options!.body).toBe(FLICKER)
    // The same change, the same words: the toast and the live region say exactly this.
    expect(toastText()).toBe(FLICKER)
    expect(announcer().textContent).toBe(FLICKER)
    expect(fake.shown[0]!.options!.tag).toBe(NOTIFY_TAG)
    expect(fake.shown[0]!.options!.silent).toBe(true)

    // A tick with no change: nothing new.
    tickAt(day(20))
    expect(fake.shown).toHaveLength(1)

    // The next change has the same tag, so the browser replaces the first.
    tickAt(day(27) + MINUTE_MS)
    expect(fake.shown).toHaveLength(2)
    expect(fake.shown[1]!.options!.body).toBe(DARK)
    expect(fake.shown.map((n) => n.options!.tag)).toEqual([NOTIFY_TAG, NOTIFY_TAG])
    expect(fake.requests()).toBe(0)
  })

  it("three windows in one tick: one combined notification, as the toast", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = renderApp({
      start: day(12) - MINUTE_MS,
      fake,
      storage: onStorage(),
      people: [
        ["Mira Castell", 10, 2],
        ["Ana Ruiz", 10, 3],
        ["Dan Okafor", 10, 1],
      ],
    })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.options!.body).toBe("3 windows started to flicker, Ana Ruiz's among them.")
    expect(fake.shown[0]!.options!.body).toBe(toastText())
  })
})

describe("App: when no notification is shown (Req 39.5)", () => {
  it("the tab is visible: only the toast", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: onStorage() })
    tickAt(day(12) + MINUTE_MS)
    expect(toastText()).toBe(FLICKER)
    expect(fake.shown).toHaveLength(0)
  })

  it.each([
    ["the setting is off (the default)", () => new FakeStorage({ [STARTED_FLAG]: "1" }), "granted"],
    ["the permission is denied", onStorage, "denied"],
    ["the permission was never given", onStorage, "default"],
  ] as const)("%s", (_, storage, permission) => {
    const fake = fakeNotifications(permission)
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: storage() })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(toastText()).toBe(FLICKER)
    expect(fake.shown).toHaveLength(0)
    expect(fake.requests()).toBe(0)
  })

  it("the first tick at mount, even for a window that went dark while the tab was closed", () => {
    const fake = fakeNotifications("granted")
    setVisibility("hidden")
    renderApp({ start: day(30), fake, storage: onStorage() })
    expect(fake.shown).toHaveLength(0)
  })

  it("in a preview, and on the first tick after Back to now", () => {
    const fake = fakeNotifications("granted")
    const { time, tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: onStorage() })
    act(() => setVisibility("hidden"))
    fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    expect(fake.shown).toHaveLength(0)
    time.at = day(12) + MINUTE_MS
    fireEvent.click(screen.getByRole("button", { name: "Back to now" }))
    expect(fake.shown).toHaveLength(0)
    // The next real change is notified.
    tickAt(day(27) + MINUTE_MS)
    expect(fake.shown.map((n) => n.options!.body)).toEqual([DARK])
  })

  it("unsupported: no switch, and ticks still run with the toast", () => {
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake: null, storage: onStorage() })
    expect(screen.queryByRole("switch")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Notifications" })).getByText(notifyText.unsupported)).toBeTruthy()
    tickAt(day(12) + MINUTE_MS)
    expect(toastText()).toBe(FLICKER)
  })

  it("a constructor that throws: the tick carries on, with the toast and the tab title", () => {
    const fake = fakeNotifications("granted", { throws: true })
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: onStorage() })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(fake.shown).toHaveLength(0)
    expect(toastText()).toBe(FLICKER)
    expect(document.title).toBe("(1) Ghosted")
  })
})

describe("App: the permission is asked only on the click (Req 39.2)", () => {
  it("never at mount or on a tick; once on the click that turns it on", async () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    const { tickAt, storage } = renderApp({ start: day(12) - MINUTE_MS, fake })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(fake.requests()).toBe(0)
    expect(fake.shown).toHaveLength(0)

    act(() => setVisibility("visible"))
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    expect(storage.getItem(NOTIFY_SETTING_KEY)).toBe("on")

    act(() => setVisibility("hidden"))
    tickAt(day(27) + MINUTE_MS)
    expect(fake.requests()).toBe(1)
    expect(fake.shown.map((n) => n.options!.body)).toEqual([DARK])
  })

  it("denied: the sentence goes through the one live region; a second click does not ask", async () => {
    const fake = fakeNotifications("default", { answer: "denied" })
    renderApp({ start: day(1), fake })
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(announcer().textContent).toBe(notifyText.denied)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(theSwitch().getAttribute("aria-checked")).toBe("false")
  })
})

describe("App: the setting is stored (Req 39.4)", () => {
  it("survives a reload: a new App on the same storage starts with it on", () => {
    const fake = fakeNotifications("granted")
    const { view, storage, props } = renderApp({ start: day(1), fake })
    expect(theSwitch().getAttribute("aria-checked")).toBe("false")
    fireEvent.click(theSwitch())
    expect(storage.getItem(NOTIFY_SETTING_KEY)).toBe("on")
    view.unmount()
    render(<App {...props} />)
    openSettings()
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    // Off again, and stored.
    fireEvent.click(theSwitch())
    expect(storage.getItem(NOTIFY_SETTING_KEY)).toBe("off")
  })

  it("a storage that throws on the setting: the app renders, the switch still works and says it is not saved", () => {
    const flags = new FakeStorage({ [STARTED_FLAG]: "1" })
    // Only the notification key throws, so the rest of the app keeps its flags.
    const storage: FlagStorage = {
      getItem: (key) => (key === NOTIFY_SETTING_KEY ? throwingStorage.getItem() : flags.getItem(key)),
      setItem: (key, value) => (key === NOTIFY_SETTING_KEY ? throwingStorage.setItem() : flags.setItem(key, value)),
      removeItem: (key) => flags.removeItem(key),
    }
    const fake = fakeNotifications("granted")
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage })
    expect(theSwitch().getAttribute("aria-checked")).toBe("false")
    fireEvent.click(theSwitch())
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText(notifyText.notSaved)).toBeTruthy()
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(fake.shown).toHaveLength(1)
  })
})

describe("App: a click on a notification (Req 39.7)", () => {
  it("focuses the tab and closes the notification; no data changes and no dialog opens", () => {
    const fake = fakeNotifications("granted")
    let focused = 0
    const { tickAt, engine } = renderApp({
      start: day(12) - MINUTE_MS,
      fake,
      storage: onStorage(),
      focusWindow: () => focused++,
    })
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    const before = JSON.stringify([engine.view(day(12) + MINUTE_MS), engine.history(engine.view(day(12))[0]!.id)])
    act(() => fake.shown[0]!.onclick!(new Event("click")))
    expect(focused).toBe(1)
    expect(fake.shown[0]!.closed).toBe(true)
    expect(JSON.stringify([engine.view(day(12) + MINUTE_MS), engine.history(engine.view(day(12))[0]!.id)])).toBe(before)
    // Only the Settings sheet, which the test opened, is open: the click opened no dialog of its own.
    expect([...document.querySelectorAll("dialog[open]")].map((d) => d.id)).toEqual(["gh-settings"])
  })
})

describe("App: accessibility of the setting (Req 39.1, 39.9)", () => {
  it("a real labelled switch in the Tab order, quiet, in the Settings sheet; one live region; a tick moves no focus", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = renderApp({ start: day(12) - MINUTE_MS, fake, storage: onStorage() })
    const liveElementsBefore = [...document.querySelectorAll(LIVE)]
    const liveBefore = liveElementsBefore.length
    const sw = theSwitch()
    expect(sw.tagName).toBe("BUTTON")
    expect(sw.hasAttribute("tabindex")).toBe(false)
    expect(sw.hasAttribute("disabled")).toBe(false)
    expect(sw.matches(".gh-button-primary, .shell-button-primary")).toBe(false)
    // In the Settings sheet (feedback list, point 7), no longer under the toolbar.
    expect(sw.closest("#gh-settings")).not.toBeNull()
    expect(sw.closest(".gh-notify")).not.toBeNull()
    expect(document.querySelector(".gh-toolbar")!.nextElementSibling?.classList.contains("gh-notify")).not.toBe(true)

    sw.focus()
    act(() => setVisibility("hidden"))
    tickAt(day(12) + MINUTE_MS)
    expect(fake.shown).toHaveLength(1)
    expect(document.activeElement).toBe(sw)
    expect(document.querySelectorAll(LIVE)).toHaveLength(liveBefore)
    // The same live regions as before the tick: the announcer and the page's one other polite region; L5 adds none.
    expect([...document.querySelectorAll(LIVE)]).toEqual(liveElementsBefore)
    expect(liveElementsBefore).toContain(announcer())
  })

  it("works in a preview: a preference, not a write (Req 39.12)", () => {
    const fake = fakeNotifications("granted")
    const { storage } = renderApp({ start: day(1), fake })
    fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    expect(theSwitch().hasAttribute("aria-disabled")).toBe(false)
    fireEvent.click(theSwitch())
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    expect(storage.getItem(NOTIFY_SETTING_KEY)).toBe("on")
  })
})
