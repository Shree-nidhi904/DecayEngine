// @vitest-environment jsdom
//
// App tests for the time machine (task 8, Requirement 11) and Triage with the
// fight queue (task 9, Requirement 9). A real DecayEngine on an in-memory
// adapter that counts saves, a fixed clock moved by hand, a fake tick
// scheduler and no animation frames: never the real clock, never real timers.
// Events go through fireEvent, which is synchronous.
//
// Expected values come from the spec, not from running the code:
// - health = H × 0.5^(elapsed / half-life); new 2, shaky 5, solid 10 days (1.1-1.4)
// - alive ≥ 60, weak 10 to 60, dead < 10 (1.5)
// - triage value = (100 − health) × (1 − health / 100) × importance (product.md)

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { DecayEngine, InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { App } from "./App"
import { DAY_MS, studyDungeonPolicy, type FactPayload, type FactPolicyData, type Knowledge, type ReviewEvent } from "./policy"
import type { Scheduler } from "./ticking"
import { previewBlockedText } from "./wording"
import { T0, day } from "./test/fixtures"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { loadSampleData } from "./sample-data"
import { dockToggle, expandDock } from "./test/dock"

afterEach(cleanup)

/** InMemoryAdapter that counts saves, so a test can prove nothing was written. */
class CountingAdapter extends InMemoryAdapter {
  saves = 0
  override save(snapshot: StoredSnapshot): void {
    this.saves++
    super.save(snapshot)
  }
}

/** One interval at a time, fired by hand; mirrors ticking.test.ts. */
function fakeTickScheduler() {
  let callback: (() => void) | null = null
  let started = 0
  const scheduler: Scheduler = {
    setInterval(cb) {
      callback = cb
      started++
      return started
    },
    clearInterval() {
      callback = null
    },
  }
  return { scheduler, fire: () => callback?.(), isActive: () => callback !== null, started: () => started }
}

// The time machine's Play is not used here; a frame request is a test bug.
const noFrames: FrameScheduler = {
  request() {
    throw new Error("test bug: Play was not expected")
  },
  cancel() {},
}

function makeKit() {
  const adapter = new CountingAdapter()
  const ids: string[] = []
  const engine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(studyDungeonPolicy, adapter, () => {
    const id = ids.shift()
    if (id === undefined) throw new Error("test bug: no id queued")
    return id
  })
  const add = (id: string, knowledge: Knowledge, at: number, importance = 2, costMinutes = 2) => {
    ids.push(id)
    engine.addItem(
      { payload: { question: `Question ${id}`, answer: `Answer ${id}`, why: "", knowledge }, importance, costMinutes },
      at
    )
  }
  const ticks = fakeTickScheduler()
  let clockNow = 0
  const tickSpy = vi.spyOn(engine, "tick")

  function renderApp(at: number) {
    clockNow = at
    render(
      <App
        engine={engine}
        clock={() => clockNow}
        tickScheduler={ticks.scheduler}
        frameScheduler={noFrames}
        frameClock={() => 0}
        prefersReducedMotion={() => false}
        formatDate={(ms) => new Date(ms).toISOString().slice(0, 10)}
        defaultAnswerCheck="self"
        session={new MemoryStorage()}
      />
    )
  }
  return {
    engine,
    adapter,
    add,
    ticks,
    tickSpy,
    renderApp,
    setClock: (ms: number) => {
      clockNow = ms
    },
  }
}

const button = (name: string) => screen.getByRole("button", { name })
const tab = (list: string) => screen.getByRole("tab", { name: new RegExp(`^${list}`) })
const countOf = (list: string) => tab(list).querySelector(".sd-tab-count")!.textContent
const panelText = () => screen.getByRole("tabpanel").textContent ?? ""
const dialogs = () => screen.queryAllByRole("dialog")
const banner = () => screen.queryByText("Future preview · nothing is saved")
const showing = () => screen.getByText(/^(Today, )?\d{4}-\d{2}-\d{2}/).textContent
const slider = () => screen.getByRole("slider", { name: "Days ahead" })

/** Every button in the open list's cards. */
const cardButtons = () => within(screen.getByRole("tabpanel")).queryAllByRole("button")

/** The text of each <span> in each entry of a named list (Triage). */
const entries = (listName: string) =>
  within(screen.getByRole("list", { name: listName }))
    .getAllByRole("listitem")
    .map((li) => [...li.querySelectorAll("span")].map((s) => s.textContent))

describe("hero: the loss forecast line follows writes and ticks (task P4, Req 20.9)", () => {
  const lossLine = () => document.querySelector<HTMLElement>(".sd-hero-loss")

  it("a right answer to helicase changes the line (the version dependency)", () => {
    const kit = makeAppKit()
    loadSampleData(kit.engine, T0)
    kit.renderApp(T0)
    expect(lossLine()!.textContent).toBe("If you do nothing, in the next 7 days 1 fact weakens and 1 dies.")

    fireEvent.click(tab("Dungeon"))
    // The question is also in the Triage panel, so take the one inside a card.
    const card = screen
      .getAllByText("Enzyme that unwinds DNA?")
      .map((el) => el.closest("article"))
      .find((a): a is HTMLElement => a !== null)!
    fireEvent.click(within(card).getByRole("button", { name: "Fight" }))
    const fight = screen.getByRole("dialog", { name: "Fight" })
    fireEvent.click(within(fight).getByRole("button", { name: "Show answer" }))
    fireEvent.click(within(fight).getByRole("button", { name: "I knew it" }))

    // Health 100 and half-life 8: it weakens at 8 × 0.737 = 5.90 days and dies at 26.58 days.
    const helicase = kit.engine.view(T0).find((f) => f.payload.question === "Enzyme that unwinds DNA?")!
    expect(helicase.state).toBe("alive")
    expect(helicase.policyData.halfLifeDays).toBe(8)
    expect(lossLine()!.textContent).toBe("If you do nothing, in the next 7 days 2 facts weaken.")
  })

  it("a settle tick moves the line (the realNow dependency)", () => {
    // One solid fact added at T0 weakens at T0 + 636 738 273.36 ms.
    const kit = makeAppKit()
    kit.add("s1", "solid", T0)
    kit.renderApp(T0 + 31_878_000)
    // The crossing is 7 days + 60.3 s away.
    expect(lossLine()!.textContent).toBe("Nothing will weaken or die in the next 7 days.")

    kit.setClock(T0 + 31_998_000)
    act(() => kit.fireTick())
    // Now 7 days − 59.7 s away.
    expect(lossLine()!.textContent).toBe("If you do nothing, in the next 7 days 1 fact weakens.")
  })
})

describe("time machine: the lists follow the previewed day", () => {
  it("a solid fact added on day 0 is in the Dungeon at +30 days and the Graveyard at +34", () => {
    const kit = makeKit()
    kit.add("s1", "solid", day(0))
    kit.renderApp(day(0))
    const savesAfterMount = kit.adapter.saves

    expect(showing()).toBe("Today, 2026-10-01")
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["1", "0", "0"])

    // +30: 100 × 0.5^(30/10) = 12.5, weak (10 ≤ 12.5 < 60). Shown rounded down.
    // The jumps are in the expanded dock (task 21).
    expandDock()
    fireEvent.click(button("+30 days"))
    expect(showing()).toBe("2026-10-31 · 30 days ahead")
    expect(banner()).not.toBeNull()
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["0", "1", "0"])
    expect(panelText()).toContain("Question s1")
    expect(panelText()).toContain("Health 12")

    // +34: 100 × 0.5^3.4 ≈ 9.47, below 10: dead.
    fireEvent.change(slider(), { target: { value: String(34 * DAY_MS) } })
    expect(showing()).toBe("2026-11-04 · 34 days ahead")
    expect([countOf("Crypt"), countOf("Dungeon"), countOf("Graveyard")]).toEqual(["0", "0", "1"])
    fireEvent.click(tab("Graveyard"))
    expect(panelText()).toContain("Question s1")

    // Only previewed: the death is not saved.
    expect(kit.engine.history("s1").map((e) => e.type)).toEqual(["created"])
    expect(kit.adapter.saves).toBe(savesAfterMount)
  })
})

describe("time machine: writes are blocked while previewing", () => {
  // Today is day 10:
  // - a2, solid added day 10: alive (100); at day 17, 100 × 0.5^0.7 ≈ 61.6, still alive
  // - a1, solid added day 9: 100 × 0.5^0.1 ≈ 93.3 alive; at day 17, 0.5^0.8 ≈ 57.4 weak
  // - w1, solid added day 2: 0.5^0.8 ≈ 57.4 weak; at day 17, 0.5^1.5 ≈ 35.4 weak
  // - d1, new added day 0: 100 × 0.5^5 ≈ 3.1, dead
  function setupPreviewed() {
    const kit = makeKit()
    kit.add("a2", "solid", day(10))
    kit.add("a1", "solid", day(9))
    kit.add("w1", "solid", day(2))
    kit.add("d1", "new", day(0))
    kit.renderApp(day(10))
    // The mount tick saved w1's weak crossing and d1's death; that is the baseline.
    const before = {
      snapshot: kit.adapter.load(),
      saves: kit.adapter.saves,
      history: ["a2", "a1", "w1", "d1"].map((id) => kit.engine.history(id)),
    }
    expect(kit.tickSpy.mock.calls).toEqual([[day(10)]])
    expandDock()
    fireEvent.click(button("+7 days"))
    return { kit, before }
  }

  function expectBlocked(el: HTMLElement) {
    expect(el.getAttribute("aria-disabled")).toBe("true")
    expect(el.getAttribute("title")).toBe(previewBlockedText)
  }

  it("disables Add fact and every card button in all three lists, and they open nothing", () => {
    const { kit, before } = setupPreviewed()

    expectBlocked(button("Add fact"))
    fireEvent.click(button("Add fact"))
    expect(dialogs()).toEqual([])

    const seen: string[] = []
    for (const list of ["Crypt", "Dungeon", "Graveyard"]) {
      fireEvent.click(tab(list))
      const buttons = cardButtons()
      expect(buttons.length, list).toBeGreaterThan(0)
      for (const b of buttons) {
        seen.push(`${list}:${b.textContent}`)
        if (b.textContent === "Autopsy") {
          // Read-only (task 10.3), so it stays enabled while previewing;
          // the autopsy tests below open it.
          expect(b.hasAttribute("aria-disabled")).toBe(false)
          continue
        }
        expectBlocked(b)
        fireEvent.click(b)
        expect(dialogs(), `${list}: ${b.textContent}`).toEqual([])
      }
    }
    // Day 17: a2 in the Crypt; a1 and w1 in the Dungeon; d1 in the Graveyard.
    expect(seen).toEqual([
      "Crypt:Fight", "Crypt:Edit", "Crypt:Remove",
      "Dungeon:Fight", "Dungeon:Edit", "Dungeon:Remove",
      "Dungeon:Fight", "Dungeon:Edit", "Dungeon:Remove",
      "Graveyard:Challenge", "Graveyard:Autopsy", "Graveyard:Edit", "Graveyard:Remove",
    ])

    expect(kit.adapter.load()).toEqual(before.snapshot)
    expect(kit.adapter.saves).toBe(before.saves)
    expect(["a2", "a1", "w1", "d1"].map((id) => kit.engine.history(id))).toEqual(before.history)
  })

  it("Triage still runs on the previewed day, but Start the session is disabled", () => {
    const { kit, before } = setupPreviewed()
    // Day 17: a1 (57.4) and w1 (35.4) are weak; 2 + 2 minutes fit in 10.
    fireEvent.click(button("Triage"))
    expect(entries("Fight these first").map((e) => e[0])).toEqual(
      kit.engine.triage(10, day(17)).picks.map((p) => p.item.payload.question)
    )
    expect(entries("Fight these first")).toHaveLength(2)

    const start = button("Start the session")
    expectBlocked(start)
    fireEvent.click(start)
    expect(dialogs()).toEqual([])
    expect(kit.adapter.saves).toBe(before.saves)
  })

  it("collapsing the dock during a preview keeps the offset, the banner and the blocked writes (Req 19.4)", () => {
    const { kit, before } = setupPreviewed()
    // Today is day 10 (11 Oct); +7 days is 18 Oct.
    expect(showing()).toBe("2026-10-18 · 7 days ahead")

    fireEvent.click(dockToggle())
    expect(dockToggle().getAttribute("aria-expanded")).toBe("false")

    expect(showing()).toBe("2026-10-18 · 7 days ahead")
    expect((slider() as HTMLInputElement).value).toBe(String(7 * DAY_MS))
    expect(banner()).not.toBeNull()
    expect(button("Back to today")).toBeTruthy()
    expectBlocked(button("Add fact"))
    fireEvent.click(button("Add fact"))
    expect(dialogs()).toEqual([])

    // The slider still moves the preview while collapsed.
    fireEvent.change(slider(), { target: { value: String(8 * DAY_MS) } })
    expect(showing()).toBe("2026-10-19 · 8 days ahead")
    expect(banner()).not.toBeNull()
    expectBlocked(button("Add fact"))
    expect(kit.adapter.saves).toBe(before.saves)
  })

  it("does not tick while previewing, even when the minute comes round", () => {
    const { kit, before } = setupPreviewed()
    expect(kit.ticks.isActive()).toBe(false)
    kit.setClock(day(12))
    kit.ticks.fire()
    expect(kit.tickSpy).toHaveBeenCalledTimes(1) // only the mount tick
    expect(kit.adapter.load()).toEqual(before.snapshot)
    expect(kit.adapter.saves).toBe(before.saves)
  })

  it("Back to today removes the banner, re-enables writes, and ticks at once with the new time", () => {
    const { kit } = setupPreviewed()
    expect(banner()).not.toBeNull()
    kit.setClock(day(11))

    fireEvent.click(button("Back to today"))

    expect(banner()).toBeNull()
    expect(kit.tickSpy.mock.calls).toEqual([[day(10)], [day(11)]])
    expect(kit.ticks.isActive()).toBe(true)
    expect(kit.ticks.started()).toBe(2)
    // realNow came from that tick: the time machine shows day 11.
    expect(showing()).toBe("Today, 2026-10-12")

    expect(button("Add fact").hasAttribute("aria-disabled")).toBe(false)
    for (const list of ["Crypt", "Dungeon", "Graveyard"]) {
      fireEvent.click(tab(list))
      for (const b of cardButtons()) {
        expect(b.hasAttribute("aria-disabled"), `${list}: ${b.textContent}`).toBe(false)
        expect(b.hasAttribute("title")).toBe(false)
      }
    }
    fireEvent.click(button("Add fact"))
    expect(screen.getByRole("dialog", { name: "Add a fact" })).toBeTruthy()
  })
})

// Today is day 20. Health at day 20, value = (100 − h) × (1 − h/100) × importance:
//   id       knowledge, added   health                 imp  cost  value                 per min
//   fact-a   solid, day 0       100 × 0.5^(20/10) = 25  2    2     75 × 0.75 × 2 = 112.5  56.25
//   fact-b   shaky, day 15      100 × 0.5^(5/5)  = 50   3    1     50 × 0.5 × 3 = 75      75
//   fact-c   new, day 16        100 × 0.5^(4/2)  = 25   1    5     75 × 0.75    = 56.25   11.25
//   fact-d   solid, day 10      100 × 0.5^(10/10) = 50  1    3     50 × 0.5     = 25      8.33
//   fact-e   solid, day 19      ≈ 93.3, alive: not a candidate
//   fact-f   new, day 0         ≈ 0.1, dead: not a candidate
// Death (health below 10), from day 20:
//   fact-a: 25 × 0.5^(t/10) < 10 → t = 10 × log2(2.5) ≈ 13.22 → "dies in 14 days" (whole days, rounded up)
//   fact-b: 50 × 0.5^(t/5)  < 10 → t = 5 × log2(5)    ≈ 11.61 → 12
//   fact-c: 25 × 0.5^(t/2)  < 10 → t = 2 × log2(2.5)  ≈ 2.64  → 3
//   fact-d: 50 × 0.5^(t/10) < 10 → t = 10 × log2(5)   ≈ 23.22 → 24
// Budget 5: subsets that fit: a+b (3 min) 187.5, a+d (5) 137.5, b+d (4) 100, c (5) 56.25, ...
//   a+b+d needs 6. Best is a+b, shown by value per minute: b (75), a (56.25).
//   Others, soonest death first: c (day 22.64), d (day 43.22).
// Budget 10: all four need 11. Dropping d: a+b+c (8 min) 243.75; dropping c: a+b+d 212.5;
//   dropping b: a+c+d 193.75; dropping a: b+c+d 156.25. Best is a+b+c: b, a, c. Other: d.
function setupTriage() {
  const kit = makeKit()
  kit.add("fact-a", "solid", day(0), 2, 2)
  kit.add("fact-b", "shaky", day(15), 3, 1)
  kit.add("fact-c", "new", day(16), 1, 5)
  kit.add("fact-d", "solid", day(10), 1, 3)
  kit.add("fact-e", "solid", day(19), 3, 1)
  kit.add("fact-f", "new", day(0), 3, 1)
  kit.renderApp(day(20))
  return kit
}

describe("Triage: the worked example", () => {
  it("5 minutes picks b then a; c and d are left, soonest death first", () => {
    const kit = setupTriage()
    fireEvent.click(screen.getByRole("radio", { name: "5 min" }))
    fireEvent.click(button("Triage"))

    expect(entries("Fight these first")).toEqual([
      ["Question fact-b", "Worth 75 per minute", "1 min", "dies in 12 days"],
      ["Question fact-a", "Worth 56.25 per minute", "2 min", "dies in 14 days"],
    ])
    expect(entries("Still lurking")).toEqual([
      ["Question fact-c", "dies in 3 days"],
      ["Question fact-d", "dies in 24 days"],
    ])

    // The engine agrees with the hand-worked numbers.
    const result = kit.engine.triage(5, day(20))
    expect(result.picks.map((p) => p.item.id)).toEqual(["fact-b", "fact-a"])
    expect(result.others.map((p) => p.item.id)).toEqual(["fact-c", "fact-d"])
    expect(result.picks.map((p) => p.value)).toEqual([75, 112.5])
    expect(result.picks.map((p) => p.valuePerMinute)).toEqual([75, 56.25])
    expect(result.others[1]!.valuePerMinute).toBeCloseTo(25 / 3, 10)
  })

  it("10 minutes picks b, a and c; d is left", () => {
    const kit = setupTriage()
    fireEvent.click(button("Triage")) // 10 is the default
    expect(entries("Fight these first").map((e) => e[0])).toEqual([
      "Question fact-b",
      "Question fact-a",
      "Question fact-c",
    ])
    expect(entries("Still lurking")).toEqual([["Question fact-d", "dies in 24 days"]])
    expect(kit.engine.triage(10, day(20)).picks.map((p) => p.item.id)).toEqual(["fact-b", "fact-a", "fact-c"])
  })

  it("with no weak facts, shows the empty state and no lists", () => {
    const kit = makeKit()
    kit.add("fresh", "solid", day(0))
    kit.renderApp(day(1))
    fireEvent.click(button("Triage"))
    expect(screen.getByText("No monsters in the Dungeon. Nothing needs saving right now.")).toBeTruthy()
    expect(screen.queryByRole("list", { name: "Fight these first" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Start the session" })).toBeNull()
  })

  it("an invalid custom budget shows the error and asks the engine nothing", () => {
    const kit = setupTriage()
    const triageSpy = vi.spyOn(kit.engine, "triage")
    fireEvent.click(screen.getByRole("radio", { name: "Other" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Minutes" }), { target: { value: "1441" } })
    fireEvent.click(button("Triage"))
    expect(screen.getByRole("alert").textContent).toBe("Enter a whole number of minutes from 1 to 1440.")
    expect(triageSpy).not.toHaveBeenCalled()
  })
})

describe("Triage: the fight queue", () => {
  /** The question in the open fight, and its progress line. */
  function openFight() {
    const dialog = screen.getByRole("dialog", { name: "Fight" })
    return {
      question: dialog.querySelector(".sd-dialog-question")!.textContent,
      progress: dialog.querySelector(".sd-dialog-progress")!.textContent,
      dialog,
    }
  }

  it("fights the picks in triage order, moves on after Walk away, skips one that died, then says it is done", () => {
    const kit = setupTriage()
    fireEvent.click(button("Triage"))
    fireEvent.click(button("Start the session"))

    // 1 of 3: fact-b, answered right at day 20.
    expect(openFight()).toMatchObject({ question: "Question fact-b", progress: "Fight 1 of 3" })
    fireEvent.click(button("Show answer"))
    fireEvent.click(button("I knew it"))
    fireEvent.click(button("Close"))

    // 2 of 3: fact-a. Three days pass before walking away from it.
    expect(openFight()).toMatchObject({ question: "Question fact-a", progress: "Fight 2 of 3" })
    kit.setClock(day(23))
    fireEvent.click(button("Walk away"))

    // fact-c (new, 25 at day 20) died at day 20 + 2.64 ≈ 22.64: looked up at day 23 it is dead.
    expect(dialogs()).toEqual([])
    const done = screen.getByRole("region", { name: "Session complete." })
    expect([...done.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Session complete.",
      "Skipped “Question fact-c”: it died before its turn. Challenge it from the Graveyard.",
    ])

    // Only fact-b was tended, at the real time of its answer.
    expect(kit.engine.history("fact-b").filter((e) => e.type === "tended")).toEqual([
      { type: "tended", itemId: "fact-b", timestamp: day(20), health: 100, event: { kind: "review", correct: true } },
    ])
    expect(kit.engine.history("fact-a").some((e) => e.type === "tended")).toBe(false)
    expect(kit.engine.history("fact-c").some((e) => e.type === "tended")).toBe(false)

    fireEvent.click(button("Close"))
    expect(screen.queryByText("Session complete.")).toBeNull()
  })

  it("skips a fact removed since triage and says so", () => {
    const kit = setupTriage()
    fireEvent.click(button("Triage"))
    fireEvent.click(button("Start the session"))
    expect(openFight().question).toBe("Question fact-b")
    // Removed elsewhere while fact-b's fight is open.
    kit.engine.remove("fact-a")
    fireEvent.click(button("Walk away"))
    expect(openFight()).toMatchObject({ question: "Question fact-c", progress: "Fight 3 of 3" })
    fireEvent.click(button("Walk away"))
    expect(screen.getByText("Skipped “Question fact-a”: it was removed before its turn.")).toBeTruthy()
  })

  it("Stop session closes the fight and drops the rest of the queue", () => {
    const kit = setupTriage()
    const savesBefore = kit.adapter.saves
    fireEvent.click(button("Triage"))
    fireEvent.click(button("Start the session"))
    expect(openFight().question).toBe("Question fact-b")

    fireEvent.click(button("Stop session"))
    expect(dialogs()).toEqual([])
    expect(screen.queryByText("Session complete.")).toBeNull()
    expect(kit.adapter.saves).toBe(savesBefore)
  })

  it("a fight opened from a card is not part of a session", () => {
    setupTriage()
    fireEvent.click(tab("Dungeon"))
    fireEvent.click(cardButtons().find((b) => b.textContent === "Fight")!)
    const fight = screen.getByRole("dialog", { name: "Fight" })
    expect(fight.querySelector(".sd-dialog-progress")).toBeNull()
    expect(within(fight).queryByRole("button", { name: "Stop session" })).toBeNull()
    fireEvent.click(button("Walk away"))
    expect(dialogs()).toEqual([])
    expect(screen.queryByText("Session complete.")).toBeNull()
  })
})
