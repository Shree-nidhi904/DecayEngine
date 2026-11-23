// Wording (task 5.8; Req 31.1, 31.2, 31.3; steering ghosted.md section 1).
//
// Every interface string in wording.ts (every function called with sample
// arguments), the storage sentences, every sample person, and the autopsy
// sentences of the sample's dark windows: none blames or judges anyone. The
// light is described as connection freshness, and the list and state words
// of Requirement 31.3 are used.
//
// The banned phrases are built from pieces, so this file never contains them.

import { describe, expect, it } from "vitest"
import type { AutopsyChartSummary } from "@decay-engine/shell"
import { generateCauseSentences } from "./autopsy-sentences"
import { generateRescueSentence } from "./rescue-sentence"
import { SAMPLE_PEOPLE, loadSampleData } from "./sample-data"
import { storageProblemText } from "./storage-errors"
import * as wording from "./wording"
import { T0, makeEngine } from "./test/fixtures"

const BANNED: readonly RegExp[] = [
  new RegExp(`doesn['’]t ${"ca" + "re"}`, "i"),
  new RegExp(`${"igno" + "red"} you`, "i"),
  new RegExp(`${"ghost" + "ed"} you`, "i"),
  // The light never measures how much someone cares (Req 31.1).
  new RegExp(`how much (?:someone|anyone|they|he|she) ${"ca" + "res"}`, "i"),
]

const NAME = "Mira Castell"
const FIRST = "Mira"
const DATE = "3 March"

const SUMMARY = {
  from: "14 Oct 2023",
  to: "14 Nov 2023",
  startHealth: 100,
  endHealth: 9.4,
  right: 0,
  wrong: 0,
  markers: "3 calls, 2 messages, 1 meet-up",
} as unknown as AutopsyChartSummary

const COUNTS = [
  { kind: "call", label: "Call", count: 3 },
  { kind: "text", label: "Message", count: 2 },
  { kind: "meetup", label: "Meet-up", count: 1 },
]

/**
 * Every function in wording.ts, by its path, with the sample calls to make.
 * A function missing here fails the coverage test below, so a new string
 * function cannot slip past this check.
 */
const SAMPLE_CALLS: Readonly<Record<string, readonly unknown[][]>> = {
  markerSummary: [[COUNTS], [[]]],
  "importText.defaults": [[2, 10]],
  "importText.repeatsLine": [[1], [12]],
  "ghostedWording.timeMachine.showing": [["14 Nov 2023", 0], ["3 Mar 2024", 1], ["3 Mar 2024", 90]],
  "ghostedWording.timeMachine.jump": [[30], [90], [180], [365], [1]],
  "ghostedWording.triage.minutes": [[15]],
  "ghostedWording.triage.invalidBudget": [[1440]],
  "ghostedWording.triage.valuePerMinute": [[3.7]],
  "ghostedWording.triage.cost": [[5]],
  "ghostedWording.triage.diesIn": [[0], [1], [26]],
  "ghostedWording.autopsy.chartLabel": [[SUMMARY], [{ ...SUMMARY, markers: undefined }]],
  "ghostedWording.autopsy.weakBand": [[60]],
  "ghostedWording.autopsy.deadBand": [[10]],
  "cardText.lastContact": [[0], [1], [23]],
  "cardText.rhythm": [[1], [30]],
  "cardText.goesDark": [[0], [1], [4]],
  "cardText.freshness": [[44]],
  "cardText.barKey": [[60, 10]],
  "cardText.historyFreshness": [[80]],
  "heroText.flickering": [[1], [4]],
  "heroText.reachOutTo": [["Dan"]],
  "heroText.previewEyebrow": [["3 Mar 2027"]],
  "heroText.lossForecast": [[0, 0], [1, 0], [3, 0], [0, 1], [0, 2], [1, 1], [2, 1], [3, 2]],
  "removeText.confirm": [[NAME]],
  "reachOutText.title": [[NAME]],
  "reachOutText.question": [[FIRST]],
  "reachOutText.effect": [[42, 82]],
  "reachOutText.brighter": [[FIRST, 42, 82]],
  "reachOutText.litAgain": [[FIRST]],
  "reachOutText.nextBy": [[DATE]],
  "reachOutText.wentDark": [[NAME]],
  "reachOutText.progress": [[1, 2]],
  "reconnectText.title": [[NAME]],
  "reconnectText.success": [[FIRST]],
  "personFormText.editTitle": [[NAME]],
  "personFormText.added": [[NAME]],
  "personFormText.edited": [[NAME]],
  "triageText.fiveMinute": [["Dan"]],
  "triageText.saves": [[1], [2], [3]],
  "rescueText.sentence": [["9 Oct 2026", "16 Nov 2026", 16], ["9 Oct 2026", "11 Oct 2026", 1]],
  "sessionText.skippedDark": [[NAME]],
  "sessionText.skippedRemoved": [[NAME]],
  "sessionText.skipped": [[`${NAME} (removed)`]],
  "dockText.fades": [[NAME, DATE]],
  "dockText.dark": [[NAME, DATE]],
  "dockText.fadesIn": [[NAME, 1], [NAME, 12]],
  "dockText.darkIn": [[NAME, 1], [NAME, 12]],
  "forecastText.horizon": [[7], [30], [90]],
  "forecastText.entry": [[NAME, DATE]],
  "forecastText.nobody": [[7], [1]],
  "backupText.fileName": [["2023-11-14"]],
  "backupText.saved": [["ghosted-backup-2023-11-14.json"]],
  "backupText.confirm": [[1], [12]],
  "importDialogText.ready": [[0], [1], [3]],
  "importDialogText.skipped": [[4, wording.personFormRules.rhythmDays]],
  "importDialogText.imported": [[1], [2]],
  "importDialogText.stopped": [[1], [2]],
  "listsText.count": [[1], [4]],
  "listsText.still.sub": [[3]],
  "listsText.startsFading": [[0], [1], [5]],
  "liveText.one": [["flicker", NAME], ["dark", NAME], ["darkFromLit", NAME]],
  "liveText.two": [
    [{ kind: "flicker", name: NAME }, { kind: "flicker", name: "Dan Okafor" }],
    [{ kind: "dark", name: NAME }, { kind: "darkFromLit", name: "Dan Okafor" }],
    [{ kind: "dark", name: NAME }, { kind: "flicker", name: "Dan Okafor" }],
    [{ kind: "darkFromLit", name: NAME }, { kind: "flicker", name: "Dan Okafor" }],
  ],
  "liveText.many": [[3, 0, NAME], [0, 3, NAME], [2, 1, NAME], [1, 2, NAME]],
  "liveText.title": [[0, "Ghosted"], [2, "Ghosted"], [10, "Ghosted"]],
}

type Found = { strings: { path: string; text: string }[]; functions: string[] }

/** Every string and every function under `value`, with its path. */
function walk(value: unknown, path: string, found: Found): void {
  if (typeof value === "string") {
    found.strings.push({ path, text: value })
  } else if (typeof value === "function") {
    found.functions.push(path)
    for (const args of SAMPLE_CALLS[path] ?? []) {
      walk((value as (...a: unknown[]) => unknown)(...args), `${path}(${args.map((a) => JSON.stringify(a)).join(", ")})`, found)
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, found))
  } else if (typeof value === "object" && value !== null) {
    for (const [key, v] of Object.entries(value)) walk(v, path === "" ? key : `${path}.${key}`, found)
  }
}

const found: Found = { strings: [], functions: [] }
walk(wording, "", found)
walk(storageProblemText, "storageProblemText", found)

/** The sample's autopsy sentences, from a real engine at T0. */
function sampleSentences(): { name: string; text: string }[] {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  return engine
    .view(T0)
    .filter((p) => p.state === "dead")
    .flatMap((p) =>
      generateCauseSentences(engine.autopsy(p.id, T0), p.payload, { timeZone: "UTC" }).map((text) => ({
        name: p.payload.name,
        text,
      }))
    )
}

const banned = (text: string) => BANNED.filter((pattern) => pattern.test(text)).map((p) => p.source)

describe("wording.ts", () => {
  it("every function in wording.ts is called with sample arguments here", () => {
    expect(found.functions.filter((path) => SAMPLE_CALLS[path] === undefined)).toEqual([])
    expect(Object.keys(SAMPLE_CALLS).filter((path) => !found.functions.includes(path))).toEqual([])
    // The walk reaches the words, not just the names.
    expect(found.strings.length).toBeGreaterThan(100)
    expect(found.strings.some((s) => s.text === "Remove Mira Castell? This cannot be undone.")).toBe(true)
  })

  it("no interface string contains a banned phrase (Req 31.2)", () => {
    const hits = found.strings.flatMap((s) => banned(s.text).map((b) => `${s.path}: ${s.text} (${b})`))
    expect(hits).toEqual([])
  })

  it('describes the light as "connection freshness" (Req 31.1)', () => {
    const uses = found.strings.filter((s) => /\bconnection freshness\b/i.test(s.text))
    expect(uses.map((s) => s.path)).toContain("freshnessText.meaning")
  })

  it('uses "fading", "went dark", "still lit" and "empty windows" (Req 31.3)', () => {
    for (const word of ["fading", "went dark", "still lit", "empty windows"]) {
      expect(
        found.strings.some((s) => s.text.toLowerCase().includes(word)),
        word
      ).toBe(true)
    }
    expect(wording.listNames).toEqual({ alive: "Still lit", weak: "Fading", dead: "Empty windows" })
    expect(wording.stateWords).toEqual({ alive: "lit", litAgain: "lit again", weak: "flickering", dead: "boarded up" })
  })

  it('the dock\'s toggle reads "Coming up" and its collapsed hint "Drag to look ahead" (task L2, Req 34.3, 34.11)', () => {
    expect(wording.dockText.toggle).toBe("Coming up")
    expect(wording.dockText.hint).toBe("Drag to look ahead")
    expect(wording.dockText.markerList).toBe("Who fades and goes dark next")
    // The short marker labels, with "1 day" and "N days".
    expect(wording.dockText.fadesIn(NAME, 1)).toBe("Mira Castell starts fading in 1 day")
    expect(wording.dockText.darkIn(NAME, 12)).toBe("Mira Castell goes dark in 12 days")
    // The banned-phrase scan above reached all four.
    for (const path of ["dockText.toggle", "dockText.hint", "dockText.markerList"]) {
      expect(found.strings.map((s) => s.path)).toContain(path)
    }
    for (const call of ['dockText.fadesIn("Mira Castell", 12)', 'dockText.darkIn("Mira Castell", 12)']) {
      expect(found.strings.map((s) => s.path)).toContain(call)
    }
  })
})

describe("the loss forecast line (task P4, Req 35.6, 35.11)", () => {
  const lines = () => found.strings.filter((s) => s.path.startsWith("heroText.lossForecast("))

  it("the banned-phrase scan above reached every sample call", () => {
    expect(lines().map((s) => s.path)).toEqual([
      "heroText.lossForecast(0, 0)",
      "heroText.lossForecast(1, 0)",
      "heroText.lossForecast(3, 0)",
      "heroText.lossForecast(0, 1)",
      "heroText.lossForecast(0, 2)",
      "heroText.lossForecast(1, 1)",
      "heroText.lossForecast(2, 1)",
      "heroText.lossForecast(3, 2)",
    ])
  })

  it('never says "die", "dies", "died", "dying" or "dead": windows start to flicker and go dark', () => {
    const hits = lines().filter((s) => /\b(die|dies|died|dying|dead)\b/i.test(s.text))
    expect(hits).toEqual([])
  })

  it('says "in the next 7 days", never "this week"', () => {
    for (const s of lines()) {
      expect(s.text, s.path).toContain("in the next 7 days")
      expect(s.text, s.path).not.toMatch(/\bthis week\b/i)
    }
  })

  it("has the exact words for zero, one and many windows", () => {
    expect(wording.heroText.lossForecast(0, 0)).toBe("No window will start to flicker or go dark in the next 7 days.")
    expect(wording.heroText.lossForecast(1, 0)).toBe("If you do nothing, in the next 7 days 1 window starts to flicker.")
    expect(wording.heroText.lossForecast(3, 2)).toBe(
      "If you do nothing, in the next 7 days 3 windows start to flicker and 2 go dark."
    )
  })
})

describe("the Triage saves line (task P5, Req 36.5)", () => {
  const lines = () => found.strings.filter((s) => s.path.startsWith("triageText.saves("))

  it("the banned-phrase scan above reached every sample call", () => {
    expect(lines().map((s) => s.path)).toEqual(["triageText.saves(1)", "triageText.saves(2)", "triageText.saves(3)"])
  })

  it('never says "die", "dies", "died", "dying" or "dead": windows go dark', () => {
    const hits = lines().filter((s) => /\b(die|dies|died|dying|dead)\b/i.test(s.text))
    expect(hits).toEqual([])
  })

  it('says "in the next 7 days", never "this week", and names the contact it assumes', () => {
    for (const s of lines()) {
      expect(s.text, s.path).toContain("in the next 7 days")
      expect(s.text, s.path).not.toMatch(/\bthis week\b/i)
      expect(s.text, s.path).toMatch(/^A call or meet-up /)
    }
  })

  it("has the exact words for one and many windows", () => {
    expect(wording.triageText.saves(1)).toBe(
      "A call or meet-up with these people keeps 1 window from going dark in the next 7 days."
    )
    expect(wording.triageText.saves(3)).toBe(
      "A call or meet-up with these people keeps 3 windows from going dark in the next 7 days."
    )
  })
})

describe("the rescue line (task R1, Req 37.7)", () => {
  const NEVER = /\b(die|dies|died|dying|dead|late|later|should)\b/i
  const lines = () => found.strings.filter((s) => s.path.startsWith("rescueText.sentence("))

  it("the banned-phrase scan above reached both sample calls", () => {
    expect(lines().map((s) => s.path)).toEqual([
      'rescueText.sentence("9 Oct 2026", "16 Nov 2026", 16)',
      'rescueText.sentence("9 Oct 2026", "11 Oct 2026", 1)',
    ])
  })

  it('never says "die", "dead", "late", "later" or "should"', () => {
    expect(lines().filter((s) => NEVER.test(s.text))).toEqual([])
  })

  it("has the exact words for 16 days and for 1 day", () => {
    expect(wording.rescueText.sentence("9 Oct 2026", "16 Nov 2026", 16)).toBe(
      "A call on 9 Oct 2026, when the window started to flicker, would have kept the light on until 16 Nov 2026, 16 days longer."
    )
    expect(wording.rescueText.sentence("9 Oct 2026", "11 Oct 2026", 1)).toBe(
      "A call on 9 Oct 2026, when the window started to flicker, would have kept the light on until 11 Oct 2026, 1 day longer."
    )
  })

  it("the rescue lines of the sample's dark windows pass the same checks; Tomas, who started dark, has none", () => {
    const engine = makeEngine()
    loadSampleData(engine, T0)
    const dark = engine.view(T0).filter((p) => p.state === "dead")
    const rescue = dark.map((p) => ({
      name: p.payload.name,
      text: generateRescueSentence(p, engine.history(p.id), engine.autopsy(p.id, T0), { timeZone: "UTC" }),
    }))
    expect(rescue.filter((r) => r.text === null).map((r) => r.name)).toEqual(["Tomas Novak"])
    const shown = rescue.filter((r): r is { name: string; text: string } => r.text !== null)
    expect(new Set(shown.map((r) => r.name))).toEqual(new Set(["Leo Marchetti", "Ayesha Khan", "Harun Aziz"]))
    expect(shown.flatMap((r) => banned(r.text).map((b) => `${r.name}: ${r.text} (${b})`))).toEqual([])
    expect(shown.filter((r) => NEVER.test(r.text))).toEqual([])
  })
})

describe("the live-change message and tab title (task L3, Req 38.3, 38.6)", () => {
  const lines = () => found.strings.filter((s) => /^liveText\.(one|two|many)\(/.test(s.path))

  it("the banned-phrase scan above reached every sample call", () => {
    expect(lines()).toHaveLength(11)
  })

  it('never says "die" or "dead" for a person, and judges nobody', () => {
    expect(lines().filter((s) => /\b(die|dies|died|dying|dead)\b/i.test(s.text))).toEqual([])
    expect(lines().filter((s) => /\b(should|forgot|neglect\w*|fault|failed)\b/i.test(s.text))).toEqual([])
  })

  it("has the exact words for one, two and many windows", () => {
    expect(wording.liveText.one("flicker", NAME)).toBe("Mira Castell's window started to flicker.")
    expect(wording.liveText.one("dark", NAME)).toBe("Mira Castell's window went dark.")
    expect(wording.liveText.one("darkFromLit", NAME)).toBe("Mira Castell's window went from lit to dark.")
    expect(wording.liveText.two({ kind: "flicker", name: NAME }, { kind: "flicker", name: "Dan Okafor" })).toBe(
      "Mira Castell's and Dan Okafor's windows started to flicker."
    )
    expect(wording.liveText.two({ kind: "dark", name: NAME }, { kind: "darkFromLit", name: "Dan Okafor" })).toBe(
      "Mira Castell's and Dan Okafor's windows went dark."
    )
    expect(wording.liveText.two({ kind: "dark", name: NAME }, { kind: "flicker", name: "Dan Okafor" })).toBe(
      "Mira Castell's window went dark and Dan Okafor's started to flicker."
    )
    expect(wording.liveText.many(3, 0, NAME)).toBe("3 windows started to flicker, Mira Castell's among them.")
    expect(wording.liveText.many(0, 3, NAME)).toBe("3 windows went dark, Mira Castell's among them.")
    expect(wording.liveText.many(2, 1, NAME)).toBe("2 windows started to flicker and 1 went dark, Mira Castell's among them.")
    expect(wording.liveText.dismiss).toBe("Dismiss")
  })

  it("the tab title: the plain title at 0, (n) up to 9, (9+) above", () => {
    expect(wording.liveText.title(0, "Ghosted")).toBe("Ghosted")
    expect(wording.liveText.title(2, "Ghosted")).toBe("(2) Ghosted")
    expect(wording.liveText.title(9, "Ghosted")).toBe("(9) Ghosted")
    expect(wording.liveText.title(10, "Ghosted")).toBe("(9+) Ghosted")
  })
})

describe("the notification setting (task L5, Req 39.3, 39.8)", () => {
  const lines = () => found.strings.filter((s) => s.path.startsWith("notifyText."))

  it("the banned-phrase scan above reached every sentence", () => {
    expect(lines().map((s) => s.path)).toEqual([
      "notifyText.label",
      "notifyText.stateOn",
      "notifyText.stateOff",
      "notifyText.region",
      "notifyText.unsupported",
      "notifyText.on",
      "notifyText.denied",
      "notifyText.blocked",
      "notifyText.notSaved",
      "notifyText.limit",
      "notifyText.privacy",
    ])
  })

  it('never says "die" or "dead", and has no guilt words', () => {
    expect(lines().filter((s) => /\b(die|dies|died|dying|dead)\b/i.test(s.text))).toEqual([])
    expect(lines().filter((s) => /\b(forgot|forget|overdue|late|later|should|neglect\w*|fault|failed)\b/i.test(s.text))).toEqual([])
  })

  it("has the exact label, limit and privacy sentence", () => {
    expect(wording.notifyText.label).toBe("Notify me about changes while this tab is open")
    expect(wording.notifyText.limit).toBe(
      "There is no server, so nothing can notify you when this tab is closed or the computer is asleep."
    )
    expect(wording.notifyText.privacy).toBe(
      "A notification shows only what is already on this page, and nothing is sent anywhere."
    )
    expect(wording.notifyText.stateOn).toBe("On")
    expect(wording.notifyText.stateOff).toBe("Off")
  })
})

describe("sample data and autopsy sentences", () => {
  it("no sample person contains a banned phrase (Req 31.2)", () => {
    expect(SAMPLE_PEOPLE).toHaveLength(12)
    const hits = SAMPLE_PEOPLE.flatMap((p) => banned(JSON.stringify(p)).map((b) => `${p.name} (${b})`))
    expect(hits).toEqual([])
  })

  it("the autopsy sentences of the sample's dark windows contain no banned phrase (Req 31.2, 19.4)", () => {
    const sentences = sampleSentences()
    // All four boarded-up people get sentences.
    expect(new Set(sentences.map((s) => s.name))).toEqual(
      new Set(["Leo Marchetti", "Tomas Novak", "Ayesha Khan", "Harun Aziz"])
    )
    const hits = sentences.flatMap((s) => banned(s.text).map((b) => `${s.name}: ${s.text} (${b})`))
    expect(hits).toEqual([])
  })

  it("the check finds the phrases it looks for", () => {
    expect(banned(`She ${"doesn't"} ${"ca" + "re"}.`)).toHaveLength(1)
    expect(banned(`They ${"igno" + "red"} you.`)).toHaveLength(1)
    expect(banned(`Mira ${"ghost" + "ed"} you`)).toHaveLength(1)
    expect(banned(`how much someone ${"ca" + "res"}`)).toHaveLength(1)
    expect(banned("Mira's window went dark.")).toEqual([])
  })
})
