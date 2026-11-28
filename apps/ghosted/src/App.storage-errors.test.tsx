// Storage problems in the App (task 5.6; design section 9.1; Req 23.3, 17.8).
//
// A full quota or an unavailable storage during a write is announced in the
// polite live region, the open dialog closes, a Triage session ends, and the
// screen keeps showing the unchanged state: the engine saves before it
// changes memory, so a failed save leaves both as they were. A settle tick's
// problem is announced once, and again only after a later tick has saved.
// An error that is not a storage problem reaches the crash screen.
//
// The add form and the import keep their storage problem inside the dialog
// (Req 17.8); those cases are in AddEditPersonDialog.test.tsx and
// ImportDialog.test.tsx.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { DecayEngineError, InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import { ANNOUNCER_ID, App } from "./App"
import { Root } from "./Root"
import { makeBackup } from "./backup"
import { windowName } from "./components/House"
import type { GhostedEngine } from "./engine-instance"
import { ENGINE_STORAGE_KEY, STARTED_FLAG } from "./first-run"
import type { PersonPayload } from "./policy"
import { loadSampleData } from "./sample-data"
import { storageProblemText, type WriteProblem } from "./storage-errors"
import type { Scheduler } from "./ticking"
import { problemScreenText } from "./wording"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, MINUTE_MS, T0, makeEngine } from "./test/fixtures"
import { regionOrList } from "./test/ui"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

/** What a browser throws when the quota is full. */
const quotaFull = () => Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" })
/** What the engine's adapter throws when localStorage cannot be used. */
const unavailable = () => new DecayEngineError("STORAGE_UNAVAILABLE", "localStorage cannot be used")

const PROBLEMS: readonly [WriteProblem, () => unknown][] = [
  ["full", quotaFull],
  ["unavailable", unavailable],
]

/** An InMemoryAdapter whose save throws while `failWith` is set. */
class SwitchableAdapter extends InMemoryAdapter {
  failWith: (() => unknown) | null = null
  override save(snapshot: StoredSnapshot): void {
    if (this.failWith !== null) throw this.failWith()
    super.save(snapshot)
  }
}

/** A FakeStorage whose setItem throws while `failWith` is set. */
class SwitchableStorage extends FakeStorage {
  failWith: (() => unknown) | null = null
  override setItem(key: string, value: string): void {
    if (this.failWith !== null) throw this.failWith()
    super.setItem(key, value)
  }
}

function renderApp(options: { sample?: boolean; storage?: FakeStorage; reload?: () => void } = {}) {
  const adapter = new SwitchableAdapter()
  const engine = makeEngine(adapter)
  if (options.sample !== false) loadSampleData(engine, T0)
  const storage = options.storage ?? new FakeStorage(options.sample === false ? {} : { [STARTED_FLAG]: "1" })
  render(
    <App
      engine={engine}
      storage={storage}
      session={null}
      clock={() => T0}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => true}
      timeZone="UTC"
      reload={options.reload}
    />
  )
  return { engine, adapter, storage }
}

const announcer = () => document.getElementById(ANNOUNCER_ID)!
const openDialog = () => document.querySelector("dialog[open]")
const card = (list: string, name: string) =>
  within(regionOrList(list)).getByRole("article", { name })
const streetNames = () => [...document.querySelectorAll("button.gh-win")].map((b) => b.getAttribute("aria-label")).sort()

/** The engine's people and their histories, as JSON: what must not change. */
function engineState(engine: GhostedEngine): string {
  const people = engine.view(T0)
  return JSON.stringify({ people, history: people.map((p) => engine.history(p.id)) })
}

function expectProblemAnnounced(problem: WriteProblem) {
  expect(announcer().textContent).toBe(storageProblemText[problem])
  expect(announcer().hasAttribute("data-problem")).toBe(true)
}

describe.each(PROBLEMS)("App: storage %s during a write (Req 23.3)", (problem, makeError) => {
  it("reach out: announced, the dialog closes, nothing changes", () => {
    const { engine, adapter } = renderApp()
    const before = engineState(engine)
    const street = streetNames()
    fireEvent.click(within(card("Fading", "Dan Okafor")).getByRole("button", { name: "Reach out" }))
    adapter.failWith = makeError

    fireEvent.click(openDialog()!.querySelector<HTMLElement>('.gh-choice[data-kind="call"]')!)

    expectProblemAnnounced(problem)
    expect(openDialog()).toBeNull()
    expect(engineState(engine)).toBe(before)
    expect(streetNames()).toEqual(street)
    expect(screen.getByRole("button", { name: windowName(engine.view(T0).find((p) => p.payload.name === "Dan Okafor")!) })).toBeTruthy()
  })

  it("reconnect: announced, the dialog closes, the window stays boarded up", () => {
    const { engine, adapter } = renderApp()
    const before = engineState(engine)
    fireEvent.click(within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Reconnect" }))
    adapter.failWith = makeError

    fireEvent.click(openDialog()!.querySelector<HTMLElement>('.gh-choice[data-kind="meetup"]')!)

    expectProblemAnnounced(problem)
    expect(openDialog()).toBeNull()
    expect(engineState(engine)).toBe(before)
    expect(card("Empty windows", "Leo Marchetti")).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Leo Marchetti, boarded up, freshness 0$/ })).toBeTruthy()
  })

  it("remove: announced, the confirmation closes, the person stays", () => {
    const { engine, adapter } = renderApp()
    const before = engineState(engine)
    fireEvent.click(within(card("Fading", "Dan Okafor")).getByRole("button", { name: "Remove" }))
    adapter.failWith = makeError

    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove Dan Okafor? This cannot be undone." })).getByRole("button", { name: "Remove" }))

    expectProblemAnnounced(problem)
    expect(openDialog()).toBeNull()
    expect(engineState(engine)).toBe(before)
    expect(card("Fading", "Dan Okafor")).toBeTruthy()
  })

  it("loading the sample street: announced, nobody added, still the first run", () => {
    const { engine, adapter, storage } = renderApp({ sample: false })
    adapter.failWith = makeError

    fireEvent.click(screen.getByRole("button", { name: "Load sample street" }))

    expectProblemAnnounced(problem)
    expect(engine.view(T0)).toEqual([])
    expect(storage.getItem(STARTED_FLAG)).toBeNull()
    expect(within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!.textContent).toBe(
      "Welcome to the street."
    )
  })

  it("restore: announced, the confirmation closes, nothing is replaced and the page does not reload", async () => {
    const other = new InMemoryAdapter()
    const otherEngine = makeEngine(other)
    const payload: PersonPayload = { name: "Ana Ruiz", relationship: "", rhythmDays: 14, lastContactAt: T0 - 3 * DAY_MS }
    otherEngine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
    const backup = makeBackup(new FakeStorage({ [ENGINE_STORAGE_KEY]: JSON.stringify(other.load()) }), new Date(T0))!

    const storage = new SwitchableStorage({ [STARTED_FLAG]: "1" })
    const reload = vi.fn()
    const { engine } = renderApp({ storage, reload })
    const before = engineState(engine)
    const flags = storage.snapshot()

    const input = document.querySelector<HTMLInputElement>('input[data-input="restore"]')!
    fireEvent.change(input, { target: { files: [new File([backup], "ghosted-backup.json", { type: "application/json" })] } })
    const dialog = await screen.findByRole("dialog", {
      name: "Replace your street with 1 person from this file? This cannot be undone.",
    })
    storage.failWith = makeError
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace my street" }))

    expectProblemAnnounced(problem)
    expect(openDialog()).toBeNull()
    expect(reload).not.toHaveBeenCalled()
    expect(storage.snapshot()).toEqual(flags)
    expect(engineState(engine)).toBe(before)
    expect(streetNames()).toHaveLength(12)
  })

  it("a Triage session ends: no next Reach out dialog opens", () => {
    const { engine, adapter } = renderApp()
    const before = engineState(engine)
    fireEvent.click(
      within(document.querySelector<HTMLElement>(".gh-triage")!).getByRole("button", { name: "Start reaching out" })
    )
    // The picks at 30 minutes are Dan, then Meera (design section 6.3).
    const first = screen.getByRole("dialog", { name: "Reach out to Dan Okafor" })
    expect(within(first).getByText("Person 1 of 2")).toBeTruthy()
    adapter.failWith = makeError

    fireEvent.click(first.querySelector<HTMLElement>('.gh-choice[data-kind="text"]')!)

    expectProblemAnnounced(problem)
    expect(openDialog()).toBeNull()
    expect(screen.queryByRole("dialog", { name: "Reach out to Meera Joshi" })).toBeNull()
    expect(engineState(engine)).toBe(before)
  })
})

describe("App: a settle tick's storage problem (design section 9.1)", () => {
  it("is announced once, and again only after a later tick has saved", () => {
    let tick: (() => void) | null = null
    const scheduler: Scheduler = {
      setInterval: (callback) => {
        tick = callback
        return 1
      },
      clearInterval: () => {
        tick = null
      },
    }
    let t = T0
    const clock = () => t
    const fire = () => act(() => tick!())

    const adapter = new SwitchableAdapter()
    const engine = makeEngine(adapter)
    // Dark after 2.7 days (rhythm 1) and after 5.4 days (rhythm 2), from a contact at T0.
    for (const [name, rhythmDays] of [
      ["Mira Castell", 1],
      ["Ana Ruiz", 2],
    ] as const) {
      engine.addItem({ payload: { name, relationship: "", rhythmDays, lastContactAt: T0 }, importance: 2, costMinutes: 10 }, T0)
    }
    render(
      <App
        engine={engine}
        storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
        session={null}
        clock={clock}
        tickScheduler={scheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
      />
    )
    expect(announcer().textContent).toBe("")

    const died = (id: string) => engine.history(id).some((entry) => entry.type === "died")

    // Mira goes dark; saving it fails, so the engine keeps no death either.
    adapter.failWith = quotaFull
    t = T0 + 3 * DAY_MS
    fire()
    expectProblemAnnounced("full")
    const first = announcer().querySelector("p")
    expect(first).not.toBeNull()
    expect(died("p1")).toBe(false)

    // Still failing: not said again (the same announcement stays).
    t += MINUTE_MS
    fire()
    expect(announcer().querySelector("p")).toBe(first)
    expect(died("p1")).toBe(false)

    // Storage works again: the tick saves Mira's death, and nothing new is said.
    adapter.failWith = null
    t += MINUTE_MS
    fire()
    expect(announcer().querySelector("p")).toBe(first)
    expect(died("p1")).toBe(true)
    expect(died("p2")).toBe(false)

    // A later failure is said again: a new announcement.
    adapter.failWith = quotaFull
    t = T0 + 6 * DAY_MS
    fire()
    expectProblemAnnounced("full")
    expect(announcer().querySelector("p")).not.toBe(first)
  })
})

describe("Root: an error that is not a storage problem (design section 9.1)", () => {
  it("reaches the crash screen and is logged, never hidden", () => {
    const failure = new TypeError("a bug in a tick")
    const engine = makeEngine()
    engine.tick = () => {
      throw failure
    }
    const log = vi.fn()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      render(
        <Root
          createEngine={() => engine}
          storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
          session={null}
          reload={vi.fn()}
          log={log}
          appProps={{ clock: () => T0, tickScheduler: idleScheduler, prefersReducedMotion: () => true, timeZone: "UTC" }}
        />
      )
    } finally {
      consoleError.mockRestore()
    }
    const screenAlert = screen.getByRole("alert")
    expect(within(screenAlert).getByRole("heading", { level: 1 }).textContent).toBe(problemScreenText.title)
    expect(screenAlert.textContent).toContain(problemScreenText.crashed)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toBe(failure)
    // The App is gone: no live region, no street.
    expect(document.getElementById(ANNOUNCER_ID)).toBeNull()
  })
})
