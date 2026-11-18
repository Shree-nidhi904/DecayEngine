import type { ReactNode } from "react";
import type { Item } from "@decay-engine/engine";

/** The three lifecycle states the shell can show. */
export type ItemState = Item<unknown, unknown>["state"];

/**
 * Colour roles the shell uses. Every app fills in all of them from its own
 * palette; shell components never use an app's own colour names.
 * Components read them as CSS variables `--shell-<role>` (see theme.ts).
 */
export interface ThemeColors {
  /** Page background. */
  bg: string;
  /** Card and panel background. */
  panel: string;
  /** Raised panel background (hover, selected). */
  panelHi: string;
  /** Borders and dividers. */
  line: string;
  /** Main text. */
  text: string;
  /** Secondary text. */
  textDim: string;
  /** Main action buttons and focus outlines. */
  accent: string;
  /** Marks alive items (always shown with an icon and text too). */
  alive: string;
  /** Marks weak items (always shown with an icon and text too). */
  weak: string;
  /** Marks dead items (always shown with an icon and text too). */
  dead: string;
}

/** Font roles the shell uses, read as `--shell-font-<role>`. */
export interface ThemeFonts {
  /** Headings and large numbers. */
  display: string;
  /** Body text. */
  body: string;
  /** Numbers, times and code. */
  mono: string;
}

/**
 * An app's skin, as fixed roles. Each app maps its palette onto these;
 * the shell only reads them.
 */
export interface ThemeProps {
  colors: ThemeColors;
  fonts: ThemeFonts;
}

/**
 * An app's wording: what lists, actions and states are called.
 * The shell never hard-codes these words.
 */
export interface WordingProps {
  /** Names of the alive, weak and dead lists. */
  lists: { alive: string; weak: string; dead: string };
  /** Button labels for tending, resurrecting, editing and removing an item. */
  actions: { tend: string; resurrect: string; edit: string; remove: string };
  /** Labels for each lifecycle state. */
  states: { alive: string; weak: string; dead: string };
}

/**
 * One icon per state, supplied by the app (inline SVG, using currentColor).
 * The shell always shows the icon next to the state's words, never colour alone.
 */
export type StateIcons = Record<ItemState, ReactNode>;
