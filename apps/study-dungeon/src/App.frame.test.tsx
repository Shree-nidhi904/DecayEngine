// @vitest-environment jsdom
//
// The frame (feedback list, points 6, 7, 17, 18 and 20): the Home, Settings and
// Sync/Profile buttons, the activity history in the Profile sheet, the corner
// toast after a backup, and `?tend=<id>`. A real DecayEngine on InMemoryAdapter,
// fixed times, fake timers, a fake sync controller.

import "./test/dialog-polyfill"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SyncController, SyncViewState } from "@decay-engine/cloud"
import { closeSettings, makeAppKit, openProfile, openSettings } from "./test/app-kit"
import { day } from "./test/fixtures"
import { MemoryStorage } from "./test/app-kit"
import { ENGINE_STORAGE_KEY } from "./first-run"
import { HOME_URL } from "./components/TopBar"
import { CORNER_TOAST_MS } from "./components/CornerToast"
import { backupText, tendLinkText, topBarText } from "./wording"
import type { CloudHandle } from "./cloud-link"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const ENV = { VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" }

function fakeController(initial: Partial<SyncViewState>): SyncController {
  const state: SyncViewState = {
    phase: "signed-out", email: null, linkSent: false, busy: false, notice: null, conflict: false, locked: false,
    encrypting: false, lastSyncedAt: null, push: "unknown", pushNextAt: "unknown", clockSkewMs: null, ...initial,
  }
  const noop = async () => {}
  return {
    getState: () => state, subscribe: () => () => {}, start: noop, signIn: noop, signOut: noop, syncNow: noop,
    resolve: noop, setPassphrase: noop, deleteCloud: noop, enablePush: noop, disablePush: noop, dispose: () => {},
  }
}

describe("the top right buttons", () => {
  it("Home links to the landing page", () => {
    const kit = makeAppKit()
    kit.renderApp(day(0))
    const home = screen.getByRole("link", { name: "Home" })
    expect(home.getAttribute("href")).toBe("https://decay-engine.pages.dev/")
    expect(HOME_URL).toBe("https://decay-engine.pages.dev/")
  })

  it("signed out and with no sync server: the button reads Sync, and the Profile says sync is off", () => {
    const kit = makeAppKit()
    kit.renderApp(day(0))
    expect(screen.queryByRole("button", { name: "Profile" })).toBeNull()
    openProfile()
    const sheet = within(screen.getByRole("dialog", { name: "Profile" }))
    expect(sheet.getByText(topBarText.syncOff)).toBeTruthy()
  })

  it("signed in: the button reads Profile, and the Profile shows who", async () => {
    const controller = fakeController({ phase: "signed-in", email: "me@example.test" })
    const start = vi.fn(async (): Promise<CloudHandle | null> => ({ controller, stop: () => {} }))
    const kit = makeAppKit(undefined, { syncProps: { env: ENV, start, signedInBefore: () => true, returnedFromLink: () => false } })
    kit.renderApp(day(0))
    await waitFor(() => expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy())
    expect(start).toHaveBeenCalledTimes(1)
    openProfile()
    expect(within(screen.getByRole("dialog", { name: "Profile" })).getByText("Signed in as me@example.test.")).toBeTruthy()
  })

  it("signing out turns the button back to Sync", async () => {
    const listeners = new Set<() => void>()
    const base = fakeController({})
    // A new object only when the state changes, as useSyncExternalStore needs.
    let current: SyncViewState = { ...base.getState(), phase: "signed-in", email: "me@example.test" }
    const controller: SyncController = {
      ...base,
      getState: () => current,
      subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    }
    const start = async (): Promise<CloudHandle | null> => ({ controller, stop: () => {} })
    const kit = makeAppKit(undefined, { syncProps: { env: ENV, start, signedInBefore: () => true, returnedFromLink: () => false } })
    kit.renderApp(day(0))
    await screen.findByRole("button", { name: "Profile" })
    act(() => {
      current = { ...current, phase: "signed-out", email: null }
      listeners.forEach((l) => l())
    })
    expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy()
  })
})

describe("the Profile's activity history", () => {
  it("lists what happened, newest first, with the fact's own words", () => {
    const kit = makeAppKit()
    kit.add("f1", "solid", day(0))
    kit.engine.tend("f1", { kind: "review", correct: true }, day(1))
    kit.renderApp(day(2))
    openProfile()
    const sheet = within(screen.getByRole("dialog", { name: "Profile" }))
    const items = sheet.getAllByRole("listitem").map((li) => li.textContent ?? "")
    expect(items).toHaveLength(2)
    expect(items[0]).toContain("Fought “Question f1”: right answer")
    expect(items[1]).toContain("Added “Question f1”")
    // The times are the engine's own, shown as given by formatTime.
    expect(items[0]).toContain(new Date(day(1)).toISOString().slice(0, 16).replace("T", " "))
  })

  it("says so when nothing has happened", () => {
    const kit = makeAppKit()
    kit.renderApp(day(0))
    openProfile()
    expect(within(screen.getByRole("dialog", { name: "Profile" })).getByText(topBarText.activityEmpty)).toBeTruthy()
  })
})

/** A storage that already holds a saved snapshot, which is what "Back up" copies. */
const withSnapshot = () =>
  new MemoryStorage({ "study-dungeon:started": "1", [ENGINE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, items: [], history: [] }) })

describe("the corner toast after a backup (point 18)", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }))
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shows the words in the corner with a bar, then closes itself after five seconds", () => {
    const kit = makeAppKit(withSnapshot())
    kit.add("f1", "solid", day(0))
    vi.useFakeTimers()
    kit.renderApp(day(1))
    openSettings()
    fireEvent.click(screen.getByRole("button", { name: backupText.backUp }))
    const toast = document.querySelector(".sd-corner-toast")!
    expect(toast.textContent).toContain(backupText.saved)
    expect(toast.querySelector(".sd-corner-toast-bar")).not.toBeNull()
    // Settings stays open; the toast is a popover in the top layer, so it is never behind the backdrop.
    expect(document.getElementById("sd-settings-sheet")!.hasAttribute("open")).toBe(true)
    act(() => vi.advanceTimersByTime(CORNER_TOAST_MS - 1))
    expect(document.querySelector(".sd-corner-toast")).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(document.querySelector(".sd-corner-toast")).toBeNull()
  })

  it("closes at once with Close, and the words are also read by the live region", () => {
    const kit = makeAppKit(withSnapshot())
    kit.add("f1", "solid", day(0))
    kit.renderApp(day(1))
    openSettings()
    fireEvent.click(screen.getByRole("button", { name: backupText.backUp }))
    expect(document.getElementById("sd-announcer")!.textContent).toBe(backupText.saved)
    fireEvent.click(within(document.querySelector<HTMLElement>(".sd-corner-toast")!).getByRole("button", { name: "Dismiss" }))
    expect(document.querySelector(".sd-corner-toast")).toBeNull()
  })

  it("closeSettings still works when the sheet is open (kit helper)", () => {
    const kit = makeAppKit()
    kit.renderApp(day(0))
    openSettings()
    closeSettings()
    expect(document.getElementById("sd-settings-sheet")!.hasAttribute("open")).toBe(false)
  })
})

describe("?tend=<id> (point 6)", () => {
  it("opens the fight for a weak fact, once", () => {
    const kit = makeAppKit(undefined, { tendId: "w" })
    kit.add("w", "solid", day(0))
    kit.renderApp(day(10)) // solid: half-life 10 days, health 50 at day 10, weak
    expect(screen.getByRole("dialog", { name: "Fight" })).toBeTruthy()
    expect(within(screen.getByRole("dialog", { name: "Fight" })).getByText("Question w")).toBeTruthy()
  })

  it("an id that is not here: the app opens normally and says so", () => {
    const kit = makeAppKit(undefined, { tendId: "nope" })
    kit.add("w", "solid", day(0))
    kit.renderApp(day(10))
    expect(screen.queryByRole("dialog", { name: "Fight" })).toBeNull()
    expect(document.querySelector(".sd-corner-toast")!.textContent).toContain(tendLinkText.missing)
    expect(screen.getByRole("tab", { name: /^Dungeon/ })).toBeTruthy()
  })

  it("a dead fact says it is in the Graveyard and opens no fight", () => {
    const kit = makeAppKit(undefined, { tendId: "d" })
    kit.add("d", "new", day(0))
    kit.renderApp(day(40))
    expect(screen.queryByRole("dialog", { name: "Fight" })).toBeNull()
    expect(document.querySelector(".sd-corner-toast")!.textContent).toContain(tendLinkText.dead)
  })

  it("no id: nothing opens and no message", () => {
    const kit = makeAppKit()
    kit.add("w", "solid", day(0))
    kit.renderApp(day(10))
    expect(screen.queryByRole("dialog", { name: "Fight" })).toBeNull()
    expect(document.querySelector(".sd-corner-toast")).toBeNull()
  })
})
