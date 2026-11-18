import { describe, it, expect } from "vitest"
import { shellCssVariables } from "@decay-engine/shell"
import { studyDungeonTheme, studyDungeonShellTheme, cssVariables, toCssVariables } from "./theme"
import {
  challengeText,
  fightText,
  formatHalfLifeDays,
  formatPreviewDate,
  previewBlockedText,
  removeCancelLabel,
  removeConfirmText,
  sessionText,
  studyDungeonWording,
} from "./wording"

// Study Dungeon palette, copied from .kiro/steering/theme-and-wording.md.
const STEERING_PALETTE: Record<string, string> = {
  "--bg": "#060509",
  "--stone": "#110d17",
  "--stone-hi": "#1c1625",
  "--line": "#2b2235",
  "--bone": "#f0e6cc",
  "--bone-dim": "#b0a694",
  "--ecto": "#9cf26b",
  "--pumpkin": "#ff8a2b",
  "--blood": "#ff5f77",
  "--moon": "#a8e6d6",
  "--slate": "#a9bde0",
}

const EXPECTED_VARIABLES: Record<string, string> = {
  "--color-bg": "#060509",
  "--color-stone": "#110d17",
  "--color-stone-hi": "#1c1625",
  "--color-line": "#2b2235",
  "--color-bone": "#f0e6cc",
  "--color-bone-dim": "#b0a694",
  "--color-ecto": "#9cf26b",
  "--color-pumpkin": "#ff8a2b",
  "--color-blood": "#ff5f77",
  "--color-moon": "#a8e6d6",
  "--color-slate": "#a9bde0",
  "--font-display": "'Pirata One', cursive",
  "--font-body": "'Spectral', serif",
  "--font-mono": "'IBM Plex Mono', monospace",
}

describe("studyDungeonTheme", () => {
  it("has exactly the steering palette, no more and no less", () => {
    const asSteering: Record<string, string> = {}
    for (const [key, value] of Object.entries(studyDungeonTheme.colors)) {
      asSteering[`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value
    }
    expect(asSteering).toEqual(STEERING_PALETTE)
  })

  it("uses Pirata One, Spectral and IBM Plex Mono", () => {
    expect(studyDungeonTheme.fonts).toEqual({
      display: "'Pirata One', cursive",
      body: "'Spectral', serif",
      mono: "'IBM Plex Mono', monospace",
    })
  })
})

describe("cssVariables", () => {
  it("produces exactly the 14 agreed names with the right values", () => {
    expect(Object.keys(cssVariables).sort()).toEqual(Object.keys(EXPECTED_VARIABLES).sort())
    expect(cssVariables).toEqual(EXPECTED_VARIABLES)
  })

  it("maps camelCase keys to kebab-case names", () => {
    expect(cssVariables["--color-bone-dim"]).toBe("#b0a694")
    expect(cssVariables["--color-stone-hi"]).toBe("#1c1625")
    expect(cssVariables["--font-display"]).toContain("Pirata One")
  })

  it("follows the theme it is given", () => {
    const vars = toCssVariables({ colors: { panelHi: "#123456" }, fonts: { body: "serif" } })
    expect(vars).toEqual({ "--color-panel-hi": "#123456", "--font-body": "serif" })
  })
})

describe("studyDungeonShellTheme", () => {
  // The agreed mapping (round 3): panel = stone, panelHi = stoneHi,
  // text = bone, textDim = boneDim, accent = pumpkin, alive = ecto,
  // weak = pumpkin, dead = slate; bg and line keep their names.
  // Hex values copied from the steering palette above.
  it("fills every shell colour role with the agreed Study Dungeon colour", () => {
    expect(studyDungeonShellTheme.colors).toEqual({
      bg: "#060509",
      panel: "#110d17",
      panelHi: "#1c1625",
      line: "#2b2235",
      text: "#f0e6cc",
      textDim: "#b0a694",
      accent: "#ff8a2b",
      alive: "#9cf26b",
      weak: "#ff8a2b",
      dead: "#a9bde0",
    })
  })

  it("takes each role from the palette entry it is mapped to", () => {
    const p = studyDungeonTheme.colors
    const roles = studyDungeonShellTheme.colors
    expect(roles.bg).toBe(p.bg)
    expect(roles.panel).toBe(p.stone)
    expect(roles.panelHi).toBe(p.stoneHi)
    expect(roles.line).toBe(p.line)
    expect(roles.text).toBe(p.bone)
    expect(roles.textDim).toBe(p.boneDim)
    expect(roles.accent).toBe(p.pumpkin)
    expect(roles.alive).toBe(p.ecto)
    expect(roles.weak).toBe(p.pumpkin)
    expect(roles.dead).toBe(p.slate)
  })

  it("uses the same three fonts as the palette", () => {
    expect(studyDungeonShellTheme.fonts).toEqual({
      display: "'Pirata One', cursive",
      body: "'Spectral', serif",
      mono: "'IBM Plex Mono', monospace",
    })
  })

  it("becomes these --shell-* variables in shell components", () => {
    expect(shellCssVariables(studyDungeonShellTheme)).toEqual({
      "--shell-bg": "#060509",
      "--shell-panel": "#110d17",
      "--shell-panel-hi": "#1c1625",
      "--shell-line": "#2b2235",
      "--shell-text": "#f0e6cc",
      "--shell-text-dim": "#b0a694",
      "--shell-accent": "#ff8a2b",
      "--shell-alive": "#9cf26b",
      "--shell-weak": "#ff8a2b",
      "--shell-dead": "#a9bde0",
      "--shell-font-display": "'Pirata One', cursive",
      "--shell-font-body": "'Spectral', serif",
      "--shell-font-mono": "'IBM Plex Mono', monospace",
    })
  })
})

describe("studyDungeonWording", () => {
  it("names the lists Crypt, Dungeon and Graveyard", () => {
    expect(studyDungeonWording.lists).toEqual({ alive: "Crypt", weak: "Dungeon", dead: "Graveyard" })
  })

  it("names the actions Fight, Challenge, Edit and Remove", () => {
    expect(studyDungeonWording.actions).toEqual({
      tend: "Fight",
      resurrect: "Challenge",
      edit: "Edit",
      remove: "Remove",
    })
  })

  it("asks the remove confirmation in the words of Requirement 6.1", () => {
    expect(removeConfirmText).toBe("Remove this fact? This cannot be undone.")
    expect(removeCancelLabel).toBe("Cancel")
  })

  it("names the states sleeping, monster and dead", () => {
    expect(studyDungeonWording.states).toEqual({ alive: "sleeping", weak: "monster", dead: "dead" })
  })
})

describe("time machine, preview and triage text", () => {
  // Words from Requirement 9 and 11 and tasks 8-9.
  it("uses the banner and button words of Requirement 11.3 and 11.4", () => {
    expect(studyDungeonWording.preview).toEqual({
      banner: "Future preview · nothing is saved",
      backToToday: "Back to today",
    })
    expect(previewBlockedText).toBe("Nothing is saved in a future preview. Go back to today first.")
  })

  it("labels the quick jumps +7, +14, +30 days and says which day is shown", () => {
    const tm = studyDungeonWording.timeMachine
    expect([7, 14, 30].map(tm.jump)).toEqual(["+7 days", "+14 days", "+30 days"])
    expect(tm.showing("1 Oct 2026", 0)).toBe("Today, 1 Oct 2026")
    expect(tm.showing("2 Oct 2026", 1)).toBe("2 Oct 2026 · 1 day ahead")
    expect(tm.showing("31 Oct 2026", 30)).toBe("31 Oct 2026 · 30 days ahead")
  })

  it("says dies in N days, with today and one day spelled out", () => {
    const t = studyDungeonWording.triage
    expect(t.diesIn(0)).toBe("dies today")
    expect(t.diesIn(1)).toBe("dies in 1 day")
    expect(t.diesIn(24)).toBe("dies in 24 days")
    expect(t.diesNever).toBe("not dying within 10 years")
  })

  it("shows value per minute with at most two decimals, and Start the session", () => {
    const t = studyDungeonWording.triage
    expect(t.valuePerMinute(75)).toBe("Worth 75 per minute")
    expect(t.valuePerMinute(56.25)).toBe("Worth 56.25 per minute")
    expect(t.valuePerMinute(25 / 3)).toBe("Worth 8.33 per minute")
    expect(t.minutes(5)).toBe("5 min")
    expect(t.startSession).toBe("Start the session")
  })

  it("formats a previewed day as day, short month and year", () => {
    expect(formatPreviewDate(Date.UTC(2026, 9, 31, 12), { timeZone: "UTC" })).toBe("31 Oct 2026")
    expect(formatPreviewDate(Date.UTC(2026, 9, 31, 23), { timeZone: "Asia/Kolkata" })).toBe("1 Nov 2026")
  })

  it("names the session's progress, stop and skips", () => {
    expect(sessionText.progress(2, 3)).toBe("Fight 2 of 3")
    expect(sessionText.stop).toBe("Stop session")
    expect(sessionText.skippedDied("Q")).toBe("Skipped “Q”: it died before its turn. Challenge it from the Graveyard.")
    expect(sessionText.skippedRemoved("Q")).toBe("Skipped “Q”: it was removed before its turn.")
  })
})

describe("fight and challenge text", () => {
  // Words from Requirement 8 and design.md (Fight Dialog, Challenge Dialog).
  it("labels the fight buttons as Requirement 8.1-8.5 does", () => {
    expect(fightText.showAnswer).toBe("Show answer")
    expect(fightText.walkAway).toBe("Walk away")
    expect(fightText.knewIt).toBe("I knew it")
    expect(fightText.forgot).toBe("I forgot")
    expect(challengeText.knewIt).toBe("I knew it")
    expect(challengeText.forgot).toBe("I forgot")
  })

  it("states the fight results in the words of task 7.1", () => {
    expect(fightText.correct).toBe("Correct! Health → 100, half-life doubled")
    expect(fightText.incorrect).toBe("Incorrect. Health → 45, half-life halved")
  })

  it("states a resurrection with the new half-life in days", () => {
    expect(challengeText.resurrected(20)).toBe("Resurrected! New half-life: 20 days")
    expect(challengeText.resurrected(2.5)).toBe("Resurrected! New half-life: 2.5 days")
    expect(challengeText.resurrected(1)).toBe("Resurrected! New half-life: 1 day")
  })

  it("shows a half-life with at most two decimals", () => {
    // 180 halved four times is 11.25, five times 5.625, six times 2.8125.
    expect(formatHalfLifeDays(180)).toBe("180")
    expect(formatHalfLifeDays(11.25)).toBe("11.25")
    expect(formatHalfLifeDays(5.625)).toBe("5.63")
    expect(formatHalfLifeDays(2.8125)).toBe("2.81")
  })
})
