import type { CSSProperties } from "react";
import type { ThemeColors, ThemeFonts, ThemeProps } from "./types";

/** CSS variable name for each colour role. */
const COLOR_VARIABLES: Record<keyof ThemeColors, string> = {
  bg: "--shell-bg",
  panel: "--shell-panel",
  panelHi: "--shell-panel-hi",
  line: "--shell-line",
  text: "--shell-text",
  textDim: "--shell-text-dim",
  accent: "--shell-accent",
  alive: "--shell-alive",
  weak: "--shell-weak",
  dead: "--shell-dead",
};

/** CSS variable name for each font role. */
const FONT_VARIABLES: Record<keyof ThemeFonts, string> = {
  display: "--shell-font-display",
  body: "--shell-font-body",
  mono: "--shell-font-mono",
};

/**
 * The theme's roles as CSS custom properties: `--shell-<role>` for colours
 * and `--shell-font-<role>` for fonts. Only the roles are read; any other
 * key on the theme object is ignored.
 */
export function shellCssVariables(theme: ThemeProps): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of Object.keys(COLOR_VARIABLES) as (keyof ThemeColors)[]) {
    vars[COLOR_VARIABLES[role]] = theme.colors[role];
  }
  for (const role of Object.keys(FONT_VARIABLES) as (keyof ThemeFonts)[]) {
    vars[FONT_VARIABLES[role]] = theme.fonts[role];
  }
  return vars;
}

/** shellCssVariables as a React style object, for a component's root element. */
export function shellStyle(theme: ThemeProps): CSSProperties {
  return shellCssVariables(theme) as CSSProperties;
}
