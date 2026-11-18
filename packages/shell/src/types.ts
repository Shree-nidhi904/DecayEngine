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
  /** The time machine (TimeMachine). */
  timeMachine: TimeMachineWording;
  /** The future preview banner (PreviewBanner). */
  preview: PreviewWording;
  /** The Triage panel (TriagePanel). */
  triage: TriageWording;
}

/** Labels for the time machine. */
export interface TimeMachineWording {
  /** Heading and accessible name of the time machine. */
  title: string;
  /** Accessible name of the slider. */
  slider: string;
  /**
   * The line that says which day is shown. `date` is already formatted by the
   * app; `days` is whole days ahead of today (0 for today).
   */
  showing: (date: string, days: number) => string;
  /** A quick jump button, for example "+7 days". */
  jump: (days: number) => string;
  /** The button that starts the animation. */
  play: string;
  /** The same button while the animation runs. */
  stop: string;
}

/** Labels for the future preview banner. */
export interface PreviewWording {
  /** The banner text, for example "Future preview · nothing is saved". */
  banner: string;
  /** The button that returns to today. */
  backToToday: string;
}

/** Labels for the Triage panel. */
export interface TriageWording {
  /** Heading of the panel. */
  title: string;
  /** Legend of the budget choices. */
  budget: string;
  /** A budget choice, for example "10 min". */
  minutes: (minutes: number) => string;
  /** The choice that lets the user type a number. */
  custom: string;
  /** Label of the custom minutes field. */
  customLabel: string;
  /** Shown when the custom number is not a whole number from 1 to max. */
  invalidBudget: (max: number) => string;
  /** The button that runs triage. */
  run: string;
  /** Heading of the picks. */
  picks: string;
  /** Heading of the weak items not picked. */
  others: string;
  /** Shown instead of the lists when there are no weak items. */
  empty: string;
  /** Shown instead of the picks when weak items exist but none fits the budget. */
  nothingFits: string;
  /** A pick's value per minute. */
  valuePerMinute: (value: number) => string;
  /** A pick's cost in minutes. */
  cost: (minutes: number) => string;
  /** Whole days until the item dies if left alone (0 means today). */
  diesIn: (days: number) => string;
  /** Shown when the item does not die within the engine's 10-year search. */
  diesNever: string;
  /** The button that starts tending the picks in order. */
  startSession: string;
}

/**
 * One icon per state, supplied by the app (inline SVG, using currentColor).
 * The shell always shows the icon next to the state's words, never colour alone.
 */
export type StateIcons = Record<ItemState, ReactNode>;
