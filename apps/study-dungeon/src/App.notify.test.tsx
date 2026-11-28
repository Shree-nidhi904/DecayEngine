// @vitest-environment jsdom
//
// Notifications while the tab is open, in the App (task L5, Requirement 24).
// A real engine on InMemoryAdapter, a hand-moved clock and the fake tick
// scheduler of app-kit, plus a fake Notification class. A solid fact
// (half-life 10) added at T0 is alive until T0 + 7.37 days, weak until
// T0 + 33.22 days, then dead.

import "./test/dialog-polyfill"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { STARTED_FLAG } from "./first-run"
import { NOTIFY_SETTING_KEY, NOTIFY_TAG } from "./notify"
import { MemoryStorage, makeAppKit, openSettings } from "./test/app-kit"
import { expandDock } from "./test/dock"
import { fakeNotifications, throwingStorage, type FakeNotifications } from "./test/fake-notification"
import { T0, day } from "./test/fixtures"
import { announced, announcer } from "./test/round7-helpers"
import { notifyText } from "./wording"

const LABEL = "Notify me about changes while this tab is open"
const LIVE = '[aria-live], [role="status"], [role="alert"], [role="log"]'

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

const onStorage = () => new MemoryStorage({ [STARTED_FLAG]: "1", [NOTIFY_SETTING_KEY]: "on" })

function setup(options: {
  fake: FakeNotifications | null
  storage?: MemoryStorage
  ids?: string[]
  start?: number
  focusWindow?: () => void
}) {
  const kit = makeAppKit(options.storage ?? new MemoryStorage({ [STARTED_FLAG]: "1" }), {
    notifications: options.fake === null ? null : options.fake.api,
    ...(options.focusWindow === undefined ? {} : { focusWindow: options.focusWindow }),
  })
  for (const id of options.ids ?? ["a"]) kit.add(id, "solid", T0)
  const view = kit.renderApp(options.start ?? day(7))
  openSettings()
  const tickAt = (at: number) => {
    kit.setClock(at)
    act(() => kit.fireTick())
  }
  return { kit, view, tickAt }
}

const theSwitch = () => screen.getByRole("switch", { name: LABEL }) as HTMLInputElement

describe("App: when a notification is shown (Requirement 24.5, 24.6)", () => {
  it("on, granted and hidden: one per tick, with the words the live region says, and the tag", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = setup({ fake, storage: onStorage() })
    expect(theSwitch().checked).toBe(true)
    act(() => setVisibility("hidden"))

    tickAt(day(8))
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.title).toBe("Study Dungeon")
    expect(fake.shown[0]!.options!.body).toMatch(/ just weakened\.$/)
    expect(fake.shown[0]!.options!.body).toBe(announced())
    expect(fake.shown[0]!.options!.tag).toBe(NOTIFY_TAG)
    expect(fake.shown[0]!.options!.silent).toBe(true)

    tickAt(day(20))
    expect(fake.shown).toHaveLength(1)

    tickAt(day(34))
    expect(fake.shown).toHaveLength(2)
    expect(fake.shown[1]!.options!.body).toMatch(/ just died and went to the Graveyard\.$/)
    expect(fake.shown[1]!.options!.body).toBe(announced())
    expect(fake.shown.map((n) => n.options!.tag)).toEqual([NOTIFY_TAG, NOTIFY_TAG])
    expect(fake.requests()).toBe(0)
  })

  it("three facts in one tick: one combined notification", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = setup({ fake, storage: onStorage(), ids: ["a", "b", "c"] })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.options!.body).toMatch(/^3 facts weakened, .+'s among them\.$/)
    expect(fake.shown[0]!.options!.body).toBe(announced())
  })
})

describe("App: when no notification is shown (Requirement 24.5)", () => {
  it("the tab is visible: only the toast and the live region", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = setup({ fake, storage: onStorage() })
    tickAt(day(8))
    expect(announced()).toMatch(/ just weakened\.$/)
    expect(fake.shown).toHaveLength(0)
  })

  it.each([
    ["the setting is off (the default)", () => new MemoryStorage({ [STARTED_FLAG]: "1" }), "granted"],
    ["the permission is denied", onStorage, "denied"],
    ["the permission was never given", onStorage, "default"],
  ] as const)("%s", (_, storage, permission) => {
    const fake = fakeNotifications(permission)
    const { tickAt } = setup({ fake, storage: storage() })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(announced()).toMatch(/ just weakened\.$/)
    expect(fake.shown).toHaveLength(0)
    expect(fake.requests()).toBe(0)
  })

  it("the first tick at mount, even for a fact that died while the tab was closed", () => {
    const fake = fakeNotifications("granted")
    setVisibility("hidden")
    setup({ fake, storage: onStorage(), start: day(40) })
    expect(fake.shown).toHaveLength(0)
  })

  it("in a preview, and on the first tick after Back to today", () => {
    const fake = fakeNotifications("granted")
    const { kit, tickAt } = setup({ fake, storage: onStorage() })
    act(() => setVisibility("hidden"))
    expandDock()
    fireEvent.click(screen.getByRole("button", { name: "+7 days" }))
    expect(fake.shown).toHaveLength(0)
    kit.setClock(day(8))
    fireEvent.click(screen.getByRole("button", { name: "Back to today" }))
    expect(fake.shown).toHaveLength(0)
    tickAt(day(34))
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.options!.body).toMatch(/ just died and went to the Graveyard\.$/)
  })

  it("unsupported: no switch, one sentence, and the tick still works", () => {
    const { tickAt } = setup({ fake: null, storage: onStorage() })
    expect(screen.queryByRole("switch", { name: LABEL })).toBeNull()
    expect(screen.getByText(notifyText.unsupported)).toBeTruthy()
    tickAt(day(8))
    expect(announced()).toMatch(/ just weakened\.$/)
  })

  it("a constructor that throws: the tick carries on, with the live region and the tab title", () => {
    const fake = fakeNotifications("granted", { throws: true })
    const { tickAt } = setup({ fake, storage: onStorage() })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(fake.shown).toHaveLength(0)
    expect(announced()).toMatch(/ just weakened\.$/)
    expect(document.title).toBe("(1) Study Dungeon")
  })
})

describe("App: the permission is asked only on the change (Requirement 24.2)", () => {
  it("never at mount or on a tick; once on the change that turns it on", async () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    const { kit, tickAt } = setup({ fake })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(fake.requests()).toBe(0)
    expect(fake.shown).toHaveLength(0)

    act(() => setVisibility("visible"))
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(theSwitch().checked).toBe(true)
    expect(kit.storage.entries()[NOTIFY_SETTING_KEY]).toBe("on")

    act(() => setVisibility("hidden"))
    tickAt(day(34))
    expect(fake.requests()).toBe(1)
    expect(fake.shown).toHaveLength(1)
  })

  it("denied: the sentence goes through the one live region; the next change does not ask", async () => {
    const fake = fakeNotifications("default", { answer: "denied" })
    setup({ fake })
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(announced()).toBe(notifyText.denied)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(theSwitch().checked).toBe(false)
  })
})

describe("App: the setting is stored (Requirement 24.4)", () => {
  it("survives a reload, and is not touched until used", () => {
    const fake = fakeNotifications("granted")
    const { kit, view } = setup({ fake })
    expect(kit.storage.entries()[NOTIFY_SETTING_KEY]).toBeUndefined()
    fireEvent.click(theSwitch())
    expect(kit.storage.entries()[NOTIFY_SETTING_KEY]).toBe("on")
    view.unmount()
    kit.renderApp(day(7))
    openSettings()
    expect(theSwitch().checked).toBe(true)
  })

  it("a storage that throws on the setting: the app renders, the switch works and says it is not saved", () => {
    const flags = new MemoryStorage({ [STARTED_FLAG]: "1" })
    // Only the notification key throws, so the rest of the app keeps its flags.
    const storage = Object.assign(Object.create(MemoryStorage.prototype) as MemoryStorage, {
      getItem: (key: string) => (key === NOTIFY_SETTING_KEY ? throwingStorage.getItem() : flags.getItem(key)),
      setItem: (key: string, value: string) =>
        key === NOTIFY_SETTING_KEY ? throwingStorage.setItem() : flags.setItem(key, value),
      removeItem: (key: string) => flags.removeItem(key),
      entries: () => flags.entries(),
    })
    const fake = fakeNotifications("granted")
    const { tickAt } = setup({ fake, storage })
    expect(theSwitch().checked).toBe(false)
    fireEvent.click(theSwitch())
    expect(theSwitch().checked).toBe(true)
    expect(screen.getByText(notifyText.notSaved)).toBeTruthy()
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(fake.shown).toHaveLength(1)
  })
})

describe("App: a click on a notification (Requirement 24.7)", () => {
  it("focuses the tab and closes it; no data changes and no dialog opens", () => {
    const fake = fakeNotifications("granted")
    let focused = 0
    const { kit, tickAt } = setup({ fake, storage: onStorage(), focusWindow: () => focused++ })
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    const before = JSON.stringify([kit.engine.view(day(8)), kit.engine.history("a")])
    act(() => fake.shown[0]!.onclick!(new Event("click")))
    expect(focused).toBe(1)
    expect(fake.shown[0]!.closed).toBe(true)
    expect(JSON.stringify([kit.engine.view(day(8)), kit.engine.history("a")])).toBe(before)
    // The Settings sheet is open (setup opened it); nothing else is.
    expect(screen.queryAllByRole("dialog").filter((d) => d.id !== "sd-settings-sheet")).toEqual([])
  })
})

describe("App: the setting's place and accessibility (Requirement 24.1, 24.9, 24.12)", () => {
  it("sits in the settings row after the sound switch; one live region; a tick moves no focus", () => {
    const fake = fakeNotifications("granted")
    const { tickAt } = setup({ fake, storage: onStorage() })
    const settings = screen.getByRole("button", { name: "Reset all data" }).parentElement!
    const sound = screen.getByRole("switch", { name: "Sound effects" })
    const sw = theSwitch()
    expect(settings.contains(sw)).toBe(true)
    expect(sound.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sw.hasAttribute("tabindex")).toBe(false)
    expect(sw.disabled).toBe(false)

    const liveBefore = document.querySelectorAll(LIVE).length
    sw.focus()
    act(() => setVisibility("hidden"))
    tickAt(day(8))
    expect(fake.shown).toHaveLength(1)
    expect(document.activeElement).toBe(sw)
    expect(document.querySelectorAll(LIVE)).toHaveLength(liveBefore)
    expect([...document.querySelectorAll(LIVE)]).toContain(announcer())
  })

  it("works in a preview: a preference, like the sound switch", () => {
    const fake = fakeNotifications("granted")
    const { kit } = setup({ fake })
    expandDock()
    fireEvent.click(screen.getByRole("button", { name: "+7 days" }))
    expect(theSwitch().disabled).toBe(false)
    fireEvent.click(theSwitch())
    expect(theSwitch().checked).toBe(true)
    expect(kit.storage.entries()[NOTIFY_SETTING_KEY]).toBe("on")
  })
})
