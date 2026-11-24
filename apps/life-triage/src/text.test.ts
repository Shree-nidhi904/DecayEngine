// Extensions spec, tasks 4.2 and 4.3 (Requirements 12.2, 12.3 and 15.3 to 15.5).
// Fixed times, never the clock.

import { describe, expect, it } from "vitest"
import { lifeTriage, type LifeCandidate } from "@decay-engine/life-triage"
import { FACTS, FRIENDS, sampleSources } from "./load"
import { clampAhead, clampBudget, detailOf, fateOf, ltText, nameOf } from "./text"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 24)

const cand = (source: string, diesAt: number | null): LifeCandidate => ({
  source,
  id: "x",
  payload: {},
  health: 40,
  importance: 2,
  costMinutes: 5,
  value: 1,
  diesAt,
})

/** Words Ghosted never uses about a person (ghosted.md, theme-and-wording.md). */
const NOT_FOR_PEOPLE = /\bdie\b|\bdies\b|\bdied\b|\bdying\b|\bdead\b|doesn't care|ignored you|ghosted you/i

describe("limits", () => {
  it("budget: whole minutes from 1 to 1,440, with a note when the typed value is not used", () => {
    expect(clampBudget(30)).toEqual({ minutes: 30, note: null })
    expect(clampBudget(0)).toEqual({ minutes: 1, note: "Using 1 minute (1 to 1,440)." })
    expect(clampBudget(2000)).toEqual({ minutes: 1440, note: "Using 1440 minutes (1 to 1,440)." })
    expect(clampBudget(12.5)).toEqual({ minutes: 12, note: "Using 12 minutes (1 to 1,440)." })
    expect(clampBudget(Number.NaN).minutes).toBe(1)
  })

  it("look-ahead: whole days from 0 to 365, with a note when the typed value is not used", () => {
    expect(clampAhead(10)).toEqual({ days: 10, note: null })
    expect(clampAhead(400)).toEqual({ days: 365, note: "Using 365 days ahead (0 to 365)." })
    expect(clampAhead(-2)).toEqual({ days: 0, note: "Using 0 days ahead (0 to 365)." })
  })

  it("the page states every limit", () => {
    expect(ltText.limits).toContain("Budget 1 to 1,440 minutes.")
    expect(ltText.limits).toContain("Look ahead 0 to 365 days.")
    expect(ltText.limits).toContain("Backups up to version 1; one file per app, and a later file replaces an earlier one.")
    expect(ltText.limits).toContain("Study Dungeon backups are read with its default rules")
    expect(ltText.limits).toContain("even if you chose the memory model there")
    expect(ltText.limits).toContain("not within 10 years")
    expect(ltText.lede).toContain("Nothing is uploaded; the files are read in this page.")
  })
})

describe("when an item is lost", () => {
  it("a person goes dark; a fact dies", () => {
    expect(fateOf(cand(FRIENDS, NOW + 2.5 * DAY), NOW)).toBe("goes dark in 3 days")
    expect(fateOf(cand(FRIENDS, NOW + 0.5 * DAY), NOW)).toBe("goes dark tomorrow")
    expect(fateOf(cand(FRIENDS, NOW), NOW)).toBe("goes dark today")
    expect(fateOf(cand(FRIENDS, null), NOW)).toBe("not going dark within 10 years")
    expect(fateOf(cand(FACTS, NOW + 2.5 * DAY), NOW)).toBe("dies in 3 days")
    expect(fateOf(cand(FACTS, NOW), NOW)).toBe("dies today")
    expect(fateOf(cand(FACTS, null), NOW)).toBe("not dying within 10 years")
  })

  it("picks show freshness for a person and health for a fact", () => {
    expect(detailOf(cand(FRIENDS, NOW + 3 * DAY), NOW, true)).toBe("5 min · freshness 40 · goes dark in 3 days")
    expect(detailOf(cand(FACTS, NOW + 3 * DAY), NOW, true)).toBe("5 min · health 40 · dies in 3 days")
    expect(detailOf(cand(FACTS, NOW + 3 * DAY), NOW, false)).toBe("5 min · dies in 3 days")
  })

  it("on the sample, no row with a person uses words Ghosted never uses", () => {
    const r = lifeTriage(sampleSources(NOW), 40, NOW)
    const rows = [...r.picks.map((c) => ({ c, picked: true })), ...r.others.map((c) => ({ c, picked: false }))]
    const people = rows.filter(({ c }) => c.source === FRIENDS)
    expect(people.length).toBeGreaterThan(0)
    for (const { c, picked } of people) {
      const line = `${c.source} ${nameOf(c)} ${detailOf(c, NOW, picked)}`
      expect(line).not.toMatch(NOT_FOR_PEOPLE)
      expect(line).toMatch(/goes dark|not going dark/)
    }
    for (const { c, picked } of rows.filter(({ c }) => c.source === FACTS)) {
      expect(detailOf(c, NOW, picked)).toMatch(/dies|not dying/)
    }
  })

  it("no page text claims proof or science", () => {
    for (const t of Object.values(ltText)) {
      if (typeof t === "string") expect(t).not.toMatch(/proven|scientific|research|clinical|optimal|guarantee/i)
    }
  })
})
