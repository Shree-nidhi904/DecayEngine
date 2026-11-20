// Ghosted skin: colours and fonts.
// Values come from the Ghosted section of .kiro/steering/design-tokens.md and
// must match styles/tokens.css. The shell role mapping is design section 5.2.

import type { ThemeProps } from "@decay-engine/shell"

/** Every Ghosted token under its own name (the CSS variable without "--"). */
export const ghostedTheme = {
  colors: {
    bg: "#07060d",
    panel: "#100e1a",
    "panel-hi": "#1a1727",
    line: "#2a2640",
    bone: "#efe9f5",
    dim: "#aea8c4",
    glow: "#ffd479",
    flick: "#ff9a4a",
    dark: "#6d6a86",
    sign: "#ff7ab8",
    rust: "#ff7a7a",
    mint: "#8fe3c4",
    // Scenery, from the wireframe (exact values)
    frame: "#0a0812",
    wall: "#1d1733",
    "wall-lo": "#151128",
    "wall-edge": "#2c2548",
    board: "#7a6252",
    "board-lo": "#5c483c",
    "board-2": "#725b4c",
    "board-2-lo": "#54413a",
    moon: "#ece6ff",
    "moon-shade": "#0e0b18",
    "border-hero": "#4a3a66",
    border: "#44406a",
    "border-button": "#3a3560",
  },
  fonts: {
    display: '"Josefin Sans", sans-serif',
    logo: '"Monoton", sans-serif',
    body: '"Spectral", Georgia, serif',
    mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  },
} as const

const c = ghostedTheme.colors

/**
 * The tokens mapped onto the shell's roles (design section 5.2). Shell
 * components only see this: mint for lit, flick for flickering, rust for
 * boarded up, glow for the accent.
 */
export const ghostedShellTheme: ThemeProps = {
  colors: {
    bg: c.bg,
    panel: c.panel,
    panelHi: c["panel-hi"],
    line: c.line,
    text: c.bone,
    textDim: c.dim,
    accent: c.glow,
    alive: c.mint,
    weak: c.flick,
    dead: c.rust,
  },
  fonts: {
    display: ghostedTheme.fonts.display,
    body: ghostedTheme.fonts.body,
    mono: ghostedTheme.fonts.mono,
  },
}
