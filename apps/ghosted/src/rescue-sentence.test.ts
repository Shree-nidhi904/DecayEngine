// Rescue Point (task R1, task 11.3; Req 37, design section 14.10). Real
// engines on InMemoryAdapter with ghostedPolicy, fixed times (T0 plus day
// offsets), time zone "UTC". Never the real clock.
//
// Expected values are worked from the policy (design 14.5): T = 3 × rhythm
// days; a window flickers 0.4 T after its last contact and goes dark 0.9 T
// after it; a call at the first flicker keeps it lit 0.4 T = 1.2 × rhythm
// days longer. The engine dates each crossing up to one minute late.

import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { AutopsyReport } from "@decay-engine/engine"
import { DEATH_TIME_PRECISION_MS as P, whatIf } from "@decay-engine/insight"
import { generateCauseSentences } from "./autopsy-sentences"
import type { GhostedEngine } from "./engine-instance"
import { ghostedPolicy, type ContactEvent, type Person, type PersonPayload } from "./policy"
import {
  RESCUE_EVENT,
  generateRescueSentence,
  rescueDateFormatter,
  rescuePoint,
  rescueSentence,
  withRescue,
} from "./rescue-sentence"
import { loadSampleData } from "./sample-data"
import { DAY_MS, T0, day, makeEngine } from "./test/fixtures"
import { readText, SRC_DIR } from "./test/source-files"

const UTC = { timeZone: "UTC" }

const payload = (rhythmDays: number, lastContactAt: number, name = "Mira Castell"): PersonPayload => ({
  name,
  relationship: "Work",
  rhythmDays,
  lastContactAt,
})

/** Adds one person at `addAt` and returns the engine and the id. */
function addPerson(p: PersonPayload, addAt = T0): { engine: GhostedEngine; id: string } {
  const engine = makeEngine()
  const id = engine.addItem({ payload: p, importance: 2, costMinutes: 10 }, addAt)
  return { engine, id }
}

/** The dark person at `at`, its history and its autopsy report. */
function partsAt(engine: GhostedEngine, id: string, at: number) {
  const person = engine.view(at).find((x) => x.id === id) as Person
  expect(person.state).toBe("dead")
  return { person, history: engine.history(id), report: engine.autopsy(id, at) }
}

/** The whatIf the module makes, called again here. */
function whatIfAtWeak(person: Person, history: ReturnType<GhostedEngine["history"]>, at: number) {
  return whatIf(ghostedPolicy, person, history, { at, event: { kind: "call" } })
}

/** Ines, as in components/PersonAutopsy.test.tsx: r 30, contacts on days 10 to 60, dark just after day 141. */
function ines() {
  const { engine, id } = addPerson(payload(30, T0, "Ines Varga"))
  const contacts: [number, ContactEvent["kind"]][] = [
    [10, "call"],
    [20, "text"],
    [30, "call"],
    [40, "text"],
    [50, "meetup"],
    [60, "call"],
  ]
  for (const [d, kind] of contacts) engine.tend(id, { kind }, day(d))
  return { engine, id, ...partsAt(engine, id, day(150)) }
}

describe("rescueSentence: the words (Req 37.1, 37.6)", () => {
  it("has the exact words, with the year on both dates", () => {
    const point = { at: Date.UTC(2026, 9, 9, 12), until: Date.UTC(2026, 10, 16, 12), extraDays: 16 }
    expect(rescueSentence(point, UTC)).toBe(
      "A call on 9 Oct 2026, when the window started to flicker, would have kept the light on until 16 Nov 2026, 16 days longer."
    )
  })

  it('says "1 day longer" for one day', () => {
    const point = { at: Date.UTC(2026, 9, 9, 12), until: Date.UTC(2026, 9, 11, 12), extraDays: 1 }
    expect(rescueSentence(point, UTC)).toBe(
      "A call on 9 Oct 2026, when the window started to flicker, would have kept the light on until 11 Oct 2026, 1 day longer."
    )
  })

  it("formats dates exactly as the cause sentences of autopsy-sentences.ts do, in two locales", () => {
    const { person, report } = ines()
    expect(report.wentWeakAt).not.toBeNull()
    for (const options of [UTC, { timeZone: "UTC", locale: "en-US" }]) {
      const causes = generateCauseSentences(report, person.payload, options)
      const fading = causes.map((s) => /^The window started fading on (.+)\.$/.exec(s)?.[1]).find((d) => d !== undefined)
      const dark = causes.map((s) => /^It went dark on (.+)\.$/.exec(s)?.[1]).find((d) => d !== undefined)
      const date = rescueDateFormatter(options)
      expect(fading, JSON.stringify(options)).toBe(date(report.wentWeakAt!))
      expect(dark, JSON.stringify(options)).toBe(date(report.diedAt))
    }
  })
})

describe("rescuePoint: a line is shown", () => {
  it("Ines (r 30): the call at day 96 keeps the light on 36 days longer", () => {
    const { person, history, report } = ines()
    // Her last call is on day 60, so the window flickers 36 days later.
    expect(report.wentWeakAt).toBeGreaterThan(day(96))
    expect(report.wentWeakAt).toBeLessThanOrEqual(day(96) + P)
    expect(generateRescueSentence(person, history, report, UTC)).toBe(
      "A call on 18 Feb 2024, when the window started to flicker, would have kept the light on until 9 May 2024, 36 days longer."
    )
  })

  it("uses whatIf's own numbers: at, diesAt as the end, and floor((diesAt − baselineDiesAt + P) / DAY_MS)", () => {
    const { person, history, report } = ines()
    const w = whatIfAtWeak(person, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(rescuePoint(person, history, report)).toEqual({
      at: w.at,
      until: w.diesAt,
      extraDays: Math.floor((w.diesAt! - w.baselineDiesAt! + P) / DAY_MS),
    })
    expect(w.at).toBe(report.wentWeakAt)
  })

  it("a 1-day rhythm gives 1 day (1.2 days)", () => {
    const { engine, id } = addPerson(payload(1, T0))
    const { person, history, report } = partsAt(engine, id, day(5))
    expect(report.wentWeakAt).toBeGreaterThan(T0 + 1.2 * DAY_MS)
    expect(report.wentWeakAt).toBeLessThanOrEqual(T0 + 1.2 * DAY_MS + P)
    const point = rescuePoint(person, history, report)!
    expect(point.extraDays).toBe(1)
    expect(rescueSentence(point, UTC).endsWith(", 1 day longer.")).toBe(true)
  })

  it("texts after the first flicker: the call still gives 0.4 T (12 days for r 10)", () => {
    // r 10 (T 30 d): flickers at 12 d. A text at 25 d: 16.67 → 56.67, still flickering. Dark at 39 d.
    const { engine, id } = addPerson(payload(10, T0))
    engine.tend(id, { kind: "text" }, day(25))
    const { person, history, report } = partsAt(engine, id, day(60))
    expect(report.wentWeakAt).toBeLessThan(day(25))
    expect(report.tends.map((t) => [t.at, t.event.kind])).toEqual([[day(25), "text"]])
    const w = whatIfAtWeak(person, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(Math.abs(w.diesAt! - report.diedAt - 12 * DAY_MS)).toBeLessThanOrEqual(2 * P)
    expect(rescuePoint(person, history, report)!.extraDays).toBe(12)
  })

  it("lit again, then dark again: the line names the flicker of the current life", () => {
    // r 10: dark at 27 d; reconnected by a text at 30 d; flickers at 42 d, dark at 57 d.
    const { engine, id } = addPerson(payload(10, T0))
    expect(engine.resurrect(id, { kind: "text" }, day(30))).toEqual({ ok: true })
    const { person, history, report } = partsAt(engine, id, day(60))
    expect(report.timesResurrected).toBe(1)
    const point = rescuePoint(person, history, report)!
    expect(point.at).toBeGreaterThan(day(42))
    expect(point.at).toBeLessThanOrEqual(day(42) + P)
    expect(point.extraDays).toBe(12)
  })

  it("a rhythm edit with no contact before it replays exactly, so the line shows", () => {
    // r 30 contacted at T0, edited to r 10 at 5 d: flickers at 12 d, dark at 27 d, as replayed with r 10 throughout.
    const p = payload(30, T0)
    const { engine, id } = addPerson(p)
    engine.edit(id, { payload: { ...p, rhythmDays: 10 } }, day(5))
    const { person, history, report } = partsAt(engine, id, day(40))
    const w = whatIfAtWeak(person, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(Math.abs(w.baselineDiesAt! - report.diedAt)).toBeLessThanOrEqual(P)
    expect(rescuePoint(person, history, report)!.extraDays).toBe(12)
  })

  it("a darkening seen only in a preview: the line shows and nothing is stored", () => {
    const { engine, id } = addPerson(payload(30, T0))
    const { person, history, report } = partsAt(engine, id, day(90))
    expect(rescuePoint(person, history, report)!.extraDays).toBe(36)
    expect(engine.history(id).map((e) => e.type)).toEqual(["created"])
  })
})

describe("rescuePoint: no line (Req 37.3)", () => {
  it("started dark: wentWeakAt is null", () => {
    const { engine, id } = addPerson(payload(30, day(-100)))
    const { person, history, report } = partsAt(engine, id, T0)
    expect(report.wentWeakAt).toBeNull()
    expect(rescuePoint(person, history, report)).toBeNull()
    expect(generateRescueSentence(person, history, report, UTC)).toBeNull()
  })

  it("added already flickering: wentWeakAt is null", () => {
    // r 30, last contact 50 days before the add: freshness 44.4, dark at 31 d.
    const { engine, id } = addPerson(payload(30, day(-50)))
    expect(engine.view(T0)[0]!.state).toBe("weak")
    const { person, history, report } = partsAt(engine, id, day(40))
    expect(report.wentWeakAt).toBeNull()
    expect(rescuePoint(person, history, report)).toBeNull()
  })

  it("a rhythm edit after a text: the replay cannot reproduce the history, so whatIf fails", () => {
    // r 30; a text at 40 d (55.6 → 95.6, last contact 36 d); edited to r 10 at 41 d; really dark at 63 d.
    // Replayed with r 10 throughout, the window is dark at 27 d, before the text.
    const p = payload(30, T0)
    const { engine, id } = addPerson(p)
    engine.tend(id, { kind: "text" }, day(40))
    engine.edit(id, { payload: { ...p, rhythmDays: 10 } }, day(41))
    const { person, history, report } = partsAt(engine, id, day(100))
    expect(report.wentWeakAt).not.toBeNull()
    const w = whatIfAtWeak(person, history, report.wentWeakAt!)
    expect(w.ok).toBe(false)
    if (w.ok) return
    expect(w.reason.code).toBe("replay-failed")
    expect(rescuePoint(person, history, report)).toBeNull()
  })

  it("the same person without the edit gets a line", () => {
    const { engine, id } = addPerson(payload(30, T0))
    engine.tend(id, { kind: "text" }, day(40))
    const { person, history, report } = partsAt(engine, id, day(130))
    expect(rescuePoint(person, history, report)!.extraDays).toBe(36)
  })

  it("whatIf returns ok: false (a history without its created entry)", () => {
    const { person, history, report } = ines()
    const broken = history.slice(1)
    const w = whatIfAtWeak(person, broken, report.wentWeakAt!)
    expect(w.ok).toBe(false)
    expect(rescuePoint(person, broken, report)).toBeNull()
  })

  it("stoppedAt is set (a what-if at an earlier life's flicker stops at the next reconnect)", () => {
    // r 10: flickers at 12 d, dark at 27 d, reconnected at 30 d, dark again at 57 d.
    const { engine, id } = addPerson(payload(10, T0))
    engine.resurrect(id, { kind: "text" }, day(30))
    const { person, history, report } = partsAt(engine, id, day(60))
    const firstWeak = history.find((e) => e.type === "state-changed" && e.from === "alive" && e.to === "weak")!
    const firstDeath = history.find((e) => e.type === "died")!
    expect(firstWeak.timestamp).toBeLessThan(day(30))
    const earlier: AutopsyReport<ContactEvent> = { ...report, wentWeakAt: firstWeak.timestamp, diedAt: firstDeath.timestamp }
    const w = whatIfAtWeak(person, history, firstWeak.timestamp)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    expect(w.stoppedAt?.why).toBe("next-life")
    expect(rescuePoint(person, history, earlier)).toBeNull()
  })

  it("the replay guard: a line at exactly P from the real darkening, none at P + 1 ms", () => {
    const { person, history, report } = ines()
    const w = whatIfAtWeak(person, history, report.wentWeakAt!)
    expect(w.ok).toBe(true)
    if (!w.ok) return
    const base = w.baselineDiesAt!
    expect(rescuePoint(person, history, { ...report, diedAt: base + P })).not.toBeNull()
    expect(rescuePoint(person, history, { ...report, diedAt: base - P })).not.toBeNull()
    expect(rescuePoint(person, history, { ...report, diedAt: base + P + 1 })).toBeNull()
    expect(rescuePoint(person, history, { ...report, diedAt: base - P - 1 })).toBeNull()
  })
})

describe("withRescue (Req 37.8)", () => {
  it("puts the rescue line second, straight after the cause", () => {
    expect(withRescue(["a", "b", "c"], "r")).toEqual(["a", "r", "b", "c"])
    expect(withRescue([], "r")).toEqual(["r"])
  })

  it("returns the cause sentences themselves when there is no line", () => {
    const causes = ["a", "b"]
    expect(withRescue(causes, null)).toBe(causes)
  })
})

describe("the module (Req 37.2, 37.11)", () => {
  it("assumes a call", () => {
    expect(RESCUE_EVENT).toEqual({ kind: "call" })
  })

  it("never reads the clock", () => {
    const D = "Date"
    const source = readText(join(SRC_DIR, "rescue-sentence.ts"))
    expect(new RegExp(`\\b${D}\\s*\\.\\s*now\\s*\\(`).test(source)).toBe(false)
    expect(new RegExp(`\\bnew\\s+${D}\\s*\\(\\s*\\)`).test(source)).toBe(false)
    expect(/performance\s*\.\s*now/.test(source)).toBe(false)
  })
})

describe("the sample street (design section 14.9)", () => {
  const LINE =
    /^A call on \d{1,2} \S+ \d{4}, when the window started to flicker, would have kept the light on until \d{1,2} \S+ \d{4}, (\d+) days? longer\.$/

  it("Ayesha 16, Harun 25 and Leo 72 days; Tomas, who started dark, has no line", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    const lines = new Map<string, string | null>()
    for (const p of engine.view(T0).filter((x) => x.state === "dead")) {
      lines.set(p.payload.name, generateRescueSentence(p, engine.history(p.id), engine.autopsy(p.id, T0), UTC))
    }
    const days = (name: string) => Number(LINE.exec(lines.get(name) ?? "")?.[1])
    expect([...lines.keys()].sort()).toEqual(["Ayesha Khan", "Harun Aziz", "Leo Marchetti", "Tomas Novak"])
    expect(days("Ayesha Khan")).toBe(16)
    expect(days("Harun Aziz")).toBe(25)
    expect(days("Leo Marchetti")).toBe(72)
    expect(lines.get("Tomas Novak")).toBeNull()
  })
})
