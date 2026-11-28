// GhostedTriage (task 4.12; Req 9.1-9.4, 16.1, 27, 30.4). The sample street
// replayed through a real engine on InMemoryAdapter at NOW = T0, so the
// expectations are those of design section 6.3: at 30 minutes the picks are
// Dan (5 min, worth 20.23 per minute, dark on day 25.5) and Meera (25 min,
// 3.70 per minute, dark on day 21.7), and today's 5-minute action is Dan.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { GhostedTriage, fiveMinuteAction, type GhostedCandidate } from "./GhostedTriage"
import type { GhostedEngine } from "../engine-instance"
import type { Person, PersonPayload } from "../policy"
import { loadSampleData } from "../sample-data"
import { previewBlockedText, triageSteps } from "../wording"
import { T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const NOW = T0

function sampleEngine(): GhostedEngine {
  const engine = makeEngine()
  loadSampleData(engine, NOW)
  return engine
}

function setup(engine: GhostedEngine = sampleEngine(), blocked?: string) {
  const onStartSession = vi.fn<(picks: GhostedCandidate[]) => void>()
  const onReachOut = vi.fn<(person: Person) => void>()
  const triage = vi.spyOn(engine, "triage")
  const view = render(
    <GhostedTriage
      engine={engine}
      now={NOW}
      version={0}
      blocked={blocked}
      onStartSession={onStartSession}
      onReachOut={onReachOut}
    />
  )
  return { engine, onStartSession, onReachOut, triage, ...view }
}

const pickRows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".shell-triage-picks > li")]
const fiveMinuteButton = () => screen.queryByRole("button", { name: /^Today's 5-minute action/ })

describe("GhostedTriage: the panel (Req 9.1, 9.2, 27)", () => {
  it("offers 15, 30, 60 and 120 minutes plus the custom choice, with 30 selected", () => {
    setup()
    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(["15 min", "30 min", "60 min", "120 min", "Other"])
    expect(radios.filter((r) => r.checked).map((r) => r.closest("label")!.textContent)).toEqual(["30 min"])
  })

  it("runs triage straight away with 30 minutes at now", () => {
    const { triage } = setup()
    expect(triage).toHaveBeenCalledWith(30, NOW)
  })

  it("explains the rule in three steps, in order, above the panel, in a disclosure closed by default (Req 33.3)", () => {
    const { container } = setup()
    // The disclosure: a native <details>, closed, whose summary reads "How does this work?".
    const disclosure = container.querySelector("details")!
    expect(disclosure).not.toBeNull()
    expect(disclosure.open).toBe(false)
    expect(disclosure.hasAttribute("open")).toBe(false)
    const summary = disclosure.querySelector(":scope > summary")!
    expect(summary.textContent).toBe("How does this work?")
    // The summary is the first child, which makes it the browser's toggle.
    expect(disclosure.firstElementChild).toBe(summary)
    // The steps are inside it, named by the summary. (`hidden: true` because a
    // browser hides a closed disclosure's content.)
    const steps = screen.getByRole("list", { name: "How does this work?", hidden: true })
    expect(disclosure.contains(steps)).toBe(true)
    expect(steps.getAttribute("aria-labelledby")).toBe(summary.id)
    expect(steps.tagName).toBe("OL")
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual([...triageSteps])
    expect(triageSteps).toEqual([
      "Only fading windows are considered.",
      "The dimmer and more important the person, the more reaching out is worth.",
      "The picks give the most worth per minute that fits your time.",
    ])
    const panel = container.querySelector(".shell-triage")!
    expect(steps.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("GhostedTriage: the picks (Req 9.3, 16.1)", () => {
  it("shows each pick's glyph, word, name, worth per minute, minutes and when it goes dark", () => {
    const { container } = setup()
    const rows = pickRows(container)
    expect(rows).toHaveLength(2)

    const [dan, meera] = rows as [HTMLElement, HTMLElement]
    expect(dan.querySelector(".gh-pick-name")!.textContent).toBe("Dan Okafor")
    expect(dan.querySelector(".gh-pick-state")!.textContent!.trim()).toBe("flickering")
    expect(dan.querySelector('[data-glyph="triangle"]')).not.toBeNull()
    const danNumbers = [...dan.querySelectorAll(".shell-triage-number")].map((n) => n.textContent)
    // Dark at day 25.5 (plus up to a minute): 26 whole days, rounded up.
    expect(danNumbers).toEqual(["worth 20.2 per minute", "5 min", "goes dark in 26 days"])

    expect(meera.querySelector(".gh-pick-name")!.textContent).toBe("Meera Joshi")
    expect(meera.querySelector('[data-glyph="triangle"]')).not.toBeNull()
    const meeraNumbers = [...meera.querySelectorAll(".shell-triage-number")].map((n) => n.textContent)
    expect(meeraNumbers).toEqual(["worth 3.7 per minute", "25 min", "goes dark in 22 days"])
  })

  it("Start the session hands the picks over in the order shown", () => {
    const { onStartSession } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Start reaching out" }))
    expect(onStartSession).toHaveBeenCalledTimes(1)
    expect(onStartSession.mock.calls[0]![0].map((c) => c.item.payload.name)).toEqual(["Dan Okafor", "Meera Joshi"])
  })

  it("the one filled button is the shell's Start (the panel runs by itself); the 5-minute action is quiet (amended Req 30.4)", () => {
    const { container } = setup()
    expect([...container.querySelectorAll(".shell-button-primary")].map((b) => b.textContent)).toEqual([
      "Start reaching out",
    ])
    expect(screen.queryByRole("button", { name: "Plan" })).toBeNull()
    expect(container.querySelectorAll(".gh-button-primary")).toHaveLength(0)
    expect(fiveMinuteButton()!.className).toBe("gh-button")
  })
})

describe("GhostedTriage: today's 5-minute action (Req 9.4)", () => {
  it("names the fading person with the best worth per minute among those taking 5 minutes or less", () => {
    const { onReachOut } = setup()
    const button = fiveMinuteButton()!
    expect(button.textContent).toBe("Today's 5-minute action: Reach out to Dan")
    expect(button.querySelector('[data-glyph="triangle"]')).not.toBeNull()
    fireEvent.click(button)
    expect(onReachOut).toHaveBeenCalledTimes(1)
    expect(onReachOut.mock.calls[0]![0].payload.name).toBe("Dan Okafor")
  })

  it("looks at every fading person, not only the picks, and breaks ties by id", () => {
    const engine = makeEngine()
    const add = (name: string, costMinutes: number) => {
      const payload: PersonPayload = { name, relationship: "", rhythmDays: 30, lastContactAt: day(-60) }
      return engine.addItem({ payload, importance: 1, costMinutes }, T0)
    }
    // Same freshness and importance: the same worth, so worth per minute is set by the minutes.
    add("Ines Varga", 60) // p1: never a 5-minute action
    add("Omar Haddad", 5) // p2
    add("Kofi Mensah", 5) // p3: ties with p2
    // A 1-minute budget fits nobody, so all three are "others", none a pick.
    expect(engine.triage(1, NOW).picks).toEqual([])
    expect(fiveMinuteAction(engine, NOW)!.item.payload.name).toBe("Omar Haddad")
    setup(engine)
    expect(fiveMinuteButton()!.textContent).toBe("Today's 5-minute action: Reach out to Omar")
  })

  it("is hidden when no fading person takes 5 minutes or less", () => {
    const engine = makeEngine()
    const payload: PersonPayload = { name: "Ines Varga", relationship: "", rhythmDays: 30, lastContactAt: day(-60) }
    engine.addItem({ payload, importance: 3, costMinutes: 6 }, T0)
    setup(engine)
    expect(fiveMinuteButton()).toBeNull()
    expect(fiveMinuteAction(engine, NOW)).toBeUndefined()
  })

  it("is hidden when nobody is fading", () => {
    const engine = makeEngine()
    const payload: PersonPayload = { name: "Ines Varga", relationship: "", rhythmDays: 30, lastContactAt: day(-1) }
    engine.addItem({ payload, importance: 3, costMinutes: 1 }, T0)
    setup(engine)
    expect(fiveMinuteButton()).toBeNull()
    expect(screen.getByText("Nobody is fading.")).toBeTruthy()
  })
})

describe("GhostedTriage during a preview (Req 12.5)", () => {
  it("Start and the 5-minute action stay focusable, are aria-disabled with the reason, and do nothing", () => {
    const { onStartSession, onReachOut } = setup(sampleEngine(), previewBlockedText)
    const start = screen.getByRole("button", { name: "Start reaching out" })
    expect(start.getAttribute("aria-disabled")).toBe("true")
    expect(start.getAttribute("title")).toBe(previewBlockedText)
    fireEvent.click(start)
    expect(onStartSession).not.toHaveBeenCalled()

    const five = fiveMinuteButton()!
    expect(five.getAttribute("aria-disabled")).toBe("true")
    expect(five.getAttribute("title")).toBe(previewBlockedText)
    expect(document.getElementById(five.getAttribute("aria-describedby")!)!.textContent).toBe(previewBlockedText)
    five.focus()
    expect(document.activeElement).toBe(five)
    fireEvent.click(five)
    expect(onReachOut).not.toHaveBeenCalled()
  })

  it("triage itself still runs while previewing", () => {
    const { container } = setup(sampleEngine(), previewBlockedText)
    expect(pickRows(container)).toHaveLength(2)
  })
})

describe("GhostedTriage: what this session saves (task P5; Req 36.1, 36.6, 36.8, design section 13.8)", () => {
  const ONE = "A call or meet-up with these people keeps 1 window from going dark in the next 7 days."
  const line = () => document.querySelector<HTMLElement>(".shell-triage-note")

  /**
   * Ada Fenn: rhythm 10 (T 30 days), last contact 22 days ago: freshness 26.67, dark at T0 + 5 days,
   * and a call keeps her lit for 27 days. 20 minutes. Cy Moss: rhythm 30, last contact 50 days ago:
   * freshness 44.44, dark at T0 + 31 days. 10 minutes.
   */
  function adaAndCy(): GhostedEngine {
    const engine = makeEngine()
    const add = (name: string, rhythmDays: number, lastContactAt: number, costMinutes: number) => {
      const payload: PersonPayload = { name, relationship: "", rhythmDays, lastContactAt }
      engine.addItem({ payload, importance: 2, costMinutes }, T0)
    }
    add("Ada Fenn", 10, day(-22), 20)
    add("Cy Moss", 30, day(-50), 10)
    return engine
  }

  function choose(minutes: number) {
    fireEvent.click(screen.getByRole("radio", { name: `${minutes} min` }))
  }

  it("at 30 minutes (Ada and Cy) the line has the exact words, between the picks and Start reaching out", () => {
    const { container } = setup(adaAndCy())
    expect(pickRows(container).map((r) => r.querySelector(".gh-pick-name")!.textContent).sort()).toEqual([
      "Ada Fenn",
      "Cy Moss",
    ])
    const note = line()!
    expect(note.tagName).toBe("P")
    expect(note.textContent).toBe(ONE)
    expect(note.previousElementSibling).toBe(container.querySelector(".shell-triage-picks"))
    expect(note.nextElementSibling).toBe(screen.getByRole("button", { name: "Start reaching out" }).parentElement)
  })

  it("at 15 minutes only Cy fits and he is not at risk, so there is no line; back at 30 it returns", () => {
    const { container } = setup(adaAndCy())
    choose(15)
    expect(pickRows(container).map((r) => r.querySelector(".gh-pick-name")!.textContent)).toEqual(["Cy Moss"])
    expect(line()).toBeNull()
    choose(30)
    expect(line()!.textContent).toBe(ONE)
  })

  it("the sample street today: nobody flickering goes dark within 7 days, so there is no line", () => {
    const { container } = setup()
    expect(pickRows(container)).toHaveLength(2)
    expect(line()).toBeNull()
  })

  it("no line when nobody is fading, and none when nobody fits", () => {
    const empty = makeEngine()
    const payload: PersonPayload = { name: "Ines Varga", relationship: "", rhythmDays: 30, lastContactAt: day(-1) }
    empty.addItem({ payload, importance: 3, costMinutes: 1 }, T0)
    setup(empty)
    expect(screen.getByText("Nobody is fading.")).toBeTruthy()
    expect(line()).toBeNull()
    cleanup()

    const tooLong = makeEngine()
    const ada: PersonPayload = { name: "Ada Fenn", relationship: "", rhythmDays: 10, lastContactAt: day(-22) }
    tooLong.addItem({ payload: ada, importance: 2, costMinutes: 200 }, T0)
    setup(tooLong)
    expect(screen.getByText("Nobody fits in that time.")).toBeTruthy()
    expect(line()).toBeNull()
  })

  it("follows `now`: the sample street 15 days ahead shows the line for Meera, also while writes are blocked (Req 36.8)", () => {
    const engine = sampleEngine()
    render(
      <GhostedTriage
        engine={engine}
        now={day(15)}
        version={0}
        blocked={previewBlockedText}
        onStartSession={vi.fn()}
        onReachOut={vi.fn()}
      />
    )
    // Design section 13.7: at 30 minutes the picks are Dan and Meera; Meera goes dark 6.7 days later, and a call keeps her lit.
    expect(line()!.textContent).toBe(ONE)
    expect(screen.getByRole("button", { name: "Start reaching out" }).getAttribute("aria-disabled")).toBe("true")
  })
})
