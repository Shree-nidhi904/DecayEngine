// WCAG AA contrast for the Study Dungeon palette (task 16.3, Requirement 15).
// Computes the WCAG 2.x contrast ratio for every text colour the app and the
// shell use, on every background they use, so a palette change that breaks
// readability fails here instead of being checked by eye.
//
// AA needs 4.5:1 for normal text. Every pair below is held to 4.5:1, so the
// result does not depend on font size.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { describe, expect, it } from "vitest"
import { studyDungeonShellTheme, studyDungeonTheme } from "./theme"

/** WCAG 2.x relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (match === null) throw new Error(`not a #rrggbb colour: ${hex}`)
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => {
    const c = parseInt(part!, 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio, 1 to 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const AA = 4.5

describe("contrast formula", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrast("#123456", "#123456")).toBeCloseTo(1, 5)
    // #767676 on white is the classic lightest grey that passes AA (≈ 4.54);
    // #777777 just fails (≈ 4.48).
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(AA)
    expect(contrast("#777777", "#ffffff")).toBeLessThan(AA)
  })

  it("is symmetric", () => {
    expect(contrast("#ff8a2b", "#060509")).toBeCloseTo(contrast("#060509", "#ff8a2b"), 10)
  })
})

describe("Study Dungeon palette meets WCAG AA", () => {
  const roles = studyDungeonShellTheme.colors
  const palette = studyDungeonTheme.colors
  const backgrounds = { bg: roles.bg, panel: roles.panel, panelHi: roles.panelHi }

  // Text colours the shell uses (by role) and the app uses directly
  // (blood for wrong answers, moon for the time machine).
  const textColours = {
    text: roles.text,
    textDim: roles.textDim,
    accent: roles.accent,
    alive: roles.alive,
    weak: roles.weak,
    dead: roles.dead,
    blood: palette.blood,
    moon: palette.moon,
  }

  for (const [fgName, fg] of Object.entries(textColours)) {
    for (const [bgName, bg] of Object.entries(backgrounds)) {
      it(`${fgName} text on ${bgName} is at least ${AA}:1`, () => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA)
      })
    }
  }

  // Filled buttons in dialogs.css: dark bg text on a coloured fill.
  const fills = { pumpkin: palette.pumpkin, ecto: palette.ecto, slate: palette.slate }
  for (const [fillName, fill] of Object.entries(fills)) {
    it(`bg text on a ${fillName} button is at least ${AA}:1`, () => {
      expect(contrast(palette.bg, fill)).toBeGreaterThanOrEqual(AA)
    })
  }

  it("gives bone on bg about 16.4:1 (the spec's 14.6:1 is a typo)", () => {
    expect(contrast(palette.bone, palette.bg)).toBeCloseTo(16.35, 1)
  })
})
