// Study Dungeon skin: colors and fonts.
// Values come from .kiro/steering/theme-and-wording.md (Study Dungeon palette).

import type { ThemeProps } from "@decay-engine/shell"

/** A named palette: any color and font names. What toCssVariables reads. */
export type Palette = {
  colors: Record<string, string>
  fonts: Record<string, string>
}

/** The Study Dungeon palette under its own names (used by global.css). */
export const studyDungeonTheme = {
  colors: {
    bg: "#060509",
    stone: "#110d17",
    stoneHi: "#1c1625",
    line: "#2b2235",
    bone: "#f0e6cc",
    boneDim: "#b0a694",
    ecto: "#9cf26b",
    pumpkin: "#ff8a2b",
    blood: "#ff5f77",
    moon: "#a8e6d6",
    slate: "#a9bde0",
  },
  fonts: {
    display: "'Pirata One', cursive",
    body: "'Spectral', serif",
    mono: "'IBM Plex Mono', monospace",
  },
} satisfies Palette

const palette = studyDungeonTheme.colors

/**
 * The palette mapped onto the shell's roles. Shell components only see this.
 * Candle green for alive, pumpkin for weak monsters, slate for graves.
 */
export const studyDungeonShellTheme: ThemeProps = {
  colors: {
    bg: palette.bg,
    panel: palette.stone,
    panelHi: palette.stoneHi,
    line: palette.line,
    text: palette.bone,
    textDim: palette.boneDim,
    accent: palette.pumpkin,
    alive: palette.ecto,
    weak: palette.pumpkin,
    dead: palette.slate,
  },
  fonts: { ...studyDungeonTheme.fonts },
}

/** camelCase → kebab-case, e.g. "stoneHi" → "stone-hi". */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * Maps a palette to CSS custom properties:
 * colors become `--color-<kebab key>`, fonts become `--font-<kebab key>`.
 */
export function toCssVariables(theme: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--color-${kebab(key)}`] = value
  }
  for (const [key, value] of Object.entries(theme.fonts)) {
    vars[`--font-${kebab(key)}`] = value
  }
  return vars
}

/** The Study Dungeon theme as CSS custom properties (global.css must match). */
export const cssVariables: Readonly<Record<string, string>> = toCssVariables(studyDungeonTheme)
