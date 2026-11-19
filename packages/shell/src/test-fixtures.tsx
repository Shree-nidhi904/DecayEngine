// Shared fixtures for the shell's tests. Deliberately neutral: no app's
// colours, fonts or words, so a test passes only if the component reads them
// from its props.

import type { Item } from "@decay-engine/engine";
import type { ItemState, StateIcons, ThemeProps, WordingProps } from "./types";

export const fixtureTheme: ThemeProps = {
  colors: {
    bg: "#000001",
    panel: "#000002",
    panelHi: "#000003",
    line: "#000004",
    text: "#000005",
    textDim: "#000006",
    accent: "#000007",
    alive: "#000008",
    weak: "#000009",
    dead: "#00000a",
  },
  fonts: {
    display: "FixtureDisplay, serif",
    body: "FixtureBody, serif",
    mono: "FixtureMono, monospace",
  },
};

/** The CSS variables fixtureTheme must produce, written out by hand. */
export const FIXTURE_VARIABLES: Record<string, string> = {
  "--shell-bg": "#000001",
  "--shell-panel": "#000002",
  "--shell-panel-hi": "#000003",
  "--shell-line": "#000004",
  "--shell-text": "#000005",
  "--shell-text-dim": "#000006",
  "--shell-accent": "#000007",
  "--shell-alive": "#000008",
  "--shell-weak": "#000009",
  "--shell-dead": "#00000a",
  "--shell-font-display": "FixtureDisplay, serif",
  "--shell-font-body": "FixtureBody, serif",
  "--shell-font-mono": "FixtureMono, monospace",
};

/** A second theme that differs in every role, to show the values follow the prop. */
export const otherTheme: ThemeProps = {
  colors: {
    bg: "#ffff01",
    panel: "#ffff02",
    panelHi: "#ffff03",
    line: "#ffff04",
    text: "#ffff05",
    textDim: "#ffff06",
    accent: "#ffff07",
    alive: "#ffff08",
    weak: "#ffff09",
    dead: "#ffff0a",
  },
  fonts: { display: "OtherDisplay", body: "OtherBody", mono: "OtherMono" },
};

export const fixtureWording: WordingProps = {
  lists: { alive: "List-A", weak: "List-W", dead: "List-D" },
  actions: {
    tend: "Tend-Word",
    resurrect: "Revive-Word",
    edit: "Edit-Word",
    remove: "Remove-Word",
    autopsy: "Autopsy-Word",
  },
  states: { alive: "State-A", weak: "State-W", dead: "State-D" },
  timeMachine: {
    title: "TM-Title",
    slider: "TM-Slider",
    showing: (date, days) => `TM-Showing[${date}|${days}]`,
    jump: (days) => `TM-Jump[${days}]`,
    play: "TM-Play",
    stop: "TM-Stop",
  },
  preview: { banner: "PV-Banner", backToToday: "PV-Back" },
  triage: {
    title: "TR-Title",
    budget: "TR-Budget",
    minutes: (minutes) => `TR-Min[${minutes}]`,
    custom: "TR-Custom",
    customLabel: "TR-CustomLabel",
    invalidBudget: (max) => `TR-Invalid[${max}]`,
    run: "TR-Run",
    picks: "TR-Picks",
    others: "TR-Others",
    empty: "TR-Empty",
    nothingFits: "TR-NothingFits",
    valuePerMinute: (value) => `TR-VPM[${value}]`,
    cost: (minutes) => `TR-Cost[${minutes}]`,
    diesIn: (days) => `TR-Dies[${days}]`,
    diesNever: "TR-DiesNever",
    startSession: "TR-Start",
  },
  autopsy: {
    title: "AU-Title",
    epitaph: "AU-Epitaph",
    chartTitle: "AU-Chart",
    chartLabel: (s) => `AU-Label[${s.from}|${s.to}|${s.startHealth}|${s.endHealth}|${s.right}|${s.wrong}]`,
    weakBand: (threshold) => `AU-Weak[${threshold}]`,
    deadBand: (threshold) => `AU-Dead[${threshold}]`,
    markRight: "AU-Right",
    markWrong: "AU-Wrong",
    cause: "AU-Cause",
    close: "AU-Close",
  },
};

export const otherWording: WordingProps = {
  lists: { alive: "Lit", weak: "Dim", dead: "Dark" },
  actions: { tend: "Call", resurrect: "Rekindle", edit: "Rewrite", remove: "Forget", autopsy: "Inquest" },
  states: { alive: "glowing", weak: "flickering", dead: "out" },
  timeMachine: {
    title: "Look ahead",
    slider: "Days to skip",
    showing: (date, days) => `${date} after ${days}`,
    jump: (days) => `skip ${days}`,
    play: "Run",
    stop: "Halt",
  },
  preview: { banner: "Just looking", backToToday: "Return" },
  triage: {
    title: "Rescue",
    budget: "Spare time",
    minutes: (minutes) => `${minutes} minutes`,
    custom: "My own",
    customLabel: "How long",
    invalidBudget: (max) => `1 to ${max} only`,
    run: "Plan",
    picks: "Do these",
    others: "Later",
    empty: "All bright",
    nothingFits: "Too short",
    valuePerMinute: (value) => `${value} each minute`,
    cost: (minutes) => `takes ${minutes}`,
    diesIn: (days) => `gone in ${days}`,
    diesNever: "stays",
    startSession: "Go",
  },
  autopsy: {
    title: "Inquest",
    epitaph: "In memory",
    chartTitle: "Brightness",
    chartLabel: (s) => `From ${s.from} to ${s.to}`,
    weakBand: (threshold) => `dim under ${threshold}`,
    deadBand: (threshold) => `dark under ${threshold}`,
    markRight: "Answered",
    markWrong: "Missed",
    cause: "Why it went out",
    close: "Done",
  },
};

export const fixtureIcons: StateIcons = {
  alive: <svg data-icon="icon-alive" />,
  weak: <svg data-icon="icon-weak" />,
  dead: <svg data-icon="icon-dead" />,
};

export const STATES: readonly ItemState[] = ["alive", "weak", "dead"];

export type NotePayload = { title: string };
export type NoteData = { n: number };

export function fixtureItem(state: ItemState, title = "A note"): Item<NotePayload, NoteData> {
  return {
    id: `note-${state}`,
    payload: { title },
    policyData: { n: 1 },
    health: state === "alive" ? 80 : state === "weak" ? 30 : 0,
    state,
    createdAt: 1_000,
    lastEventAt: 2_000,
    ...(state === "dead" ? { diedAt: 2_000 } : {}),
    timesResurrected: 0,
    importance: 2,
    costMinutes: 3,
  };
}

/** The style attribute of the first (root) element, as name → value. */
export function rootStyle(html: string): Record<string, string> {
  const match = html.match(/^<[a-z]+\b[^>]*?\sstyle="([^"]*)"/);
  if (match === null) throw new Error(`root element has no style attribute: ${html.slice(0, 120)}`);
  const vars: Record<string, string> = {};
  for (const part of match[1]!.split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    vars[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return vars;
}

/** The text a reader sees: tags removed. */
export function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
