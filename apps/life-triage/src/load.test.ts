import { describe, expect, it } from "vitest"
import { lifeTriage } from "@decay-engine/life-triage"
import { loadBackup, sampleSources } from "./load"

const NOW = Date.UTC(2026, 10, 24)

describe("sample data", () => {
  it("has weak items in both sources, and the combined pick draws on both", () => {
    const s = sampleSources(NOW)
    const all = lifeTriage(s, 1440, NOW)
    const labels = new Set([...all.picks, ...all.others].map((c) => c.source))
    expect(labels).toEqual(new Set(["Study Dungeon", "Ghosted"]))
    const r = lifeTriage(s, 40, NOW)
    expect(r.totalMinutes).toBeLessThanOrEqual(40)
    expect(r.totalValue).toBeGreaterThanOrEqual(r.evenSplitValue)
  })
})

describe("loadBackup", () => {
  it("refuses non-JSON, other files and newer versions", () => {
    expect(loadBackup("{").ok).toBe(false)
    expect(loadBackup('{"app":"other","version":1,"snapshot":{}}').ok).toBe(false)
    expect(loadBackup('{"app":"ghosted","version":9,"snapshot":{}}').ok).toBe(false)
    expect(loadBackup("[]").ok).toBe(false)
  })
  it("loads an empty snapshot-less file as damaged, not a crash", () => {
    expect(loadBackup('{"app":"ghosted","version":1,"snapshot":{"nope":1}}').ok).toBe(false)
  })
})
