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
  "sessionText.skippedDark": [[NAME]],
  "sessionText.skippedRemoved": [[NAME]],
  "sessionText.skipped": [[`${NAME} (removed)`]],
  "dockText.fades": [[NAME, DATE]],
  "dockText.dark": [[NAME, DATE]],
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
