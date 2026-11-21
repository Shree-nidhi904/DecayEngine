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

  it("explains the rule in three steps, in order, above the panel", () => {
    const { container } = setup()
    const steps = screen.getByRole("list", { name: "How the picks are made" })
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

  it("the filled buttons are the shell's Run and Start; the 5-minute action is quiet (amended Req 30.4)", () => {
    const { container } = setup()
    expect([...container.querySelectorAll(".shell-button-primary")].map((b) => b.textContent)).toEqual([
      "Plan",
      "Start reaching out",
    ])
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
