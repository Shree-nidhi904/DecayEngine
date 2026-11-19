// Study Dungeon wording: what lists, actions and states are called, and every
// label and line of text in the app's own dialogs.
// List names come from .kiro/steering/theme-and-wording.md; dialog text comes
// from .kiro/specs/study-dungeon (Requirements 5, 6 and 8, design.md).

import type { AutopsyChartSummary, WordingProps } from "@decay-engine/shell"
import type { Knowledge } from "./policy"

/** "1 day", "2 days". */
const daysText = (days: number) => `${days} ${days === 1 ? "day" : "days"}`

/** At most two decimals, trailing zeros dropped (75 → "75", 56.25 → "56.25"). */
const twoDecimals = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 })

export const studyDungeonWording = {
  lists: { alive: "Crypt", weak: "Dungeon", dead: "Graveyard" },
  actions: { tend: "Fight", resurrect: "Challenge", edit: "Edit", remove: "Remove", autopsy: "Autopsy" },
  states: { alive: "sleeping", weak: "monster", dead: "dead" },
  // The time machine (task 8.2, Requirement 11).
  timeMachine: {
    title: "Time machine",
    slider: "Days ahead",
    showing: (date: string, days: number) => (days === 0 ? `Today, ${date}` : `${date} · ${daysText(days)} ahead`),
    jump: (days: number) => `+${days} days`,
    play: "Play",
    stop: "Stop",
  },
  // The future preview banner (task 8.3, Requirement 11.3).
  preview: {
    banner: "Future preview · nothing is saved",
    backToToday: "Back to today",
  },
  // The Triage panel (task 9.1, Requirement 9).
  triage: {
    title: "Triage",
    budget: "How much time do you have?",
    minutes: (minutes: number) => `${minutes} min`,
    custom: "Other",
    customLabel: "Minutes",
    invalidBudget: (max: number) => `Enter a whole number of minutes from 1 to ${max}.`,
    run: "Triage",
    picks: "Fight these first",
    others: "Still lurking",
    empty: "No monsters in the Dungeon. Nothing needs saving right now.",
    nothingFits: "None of them fits in that time. Try more minutes.",
    valuePerMinute: (value: number) => `Worth ${twoDecimals.format(value)} per minute`,
    cost: (minutes: number) => `${minutes} min`,
    diesIn: (days: number) => (days === 0 ? "dies today" : `dies in ${daysText(days)}`),
    diesNever: "not dying within 10 years",
    startSession: "Start the session",
  },
  // The autopsy of a grave (task 10.3, Requirement 10).
  autopsy: {
    title: "Autopsy",
    epitaph: "Why it mattered",
    chartTitle: "Health over time",
    chartLabel: (s: AutopsyChartSummary) =>
      `Health from ${s.from} to ${s.to}: it started at ${Math.floor(s.startHealth)} and fell to ` +
      `${Math.floor(s.endHealth)}. ${capitalise(countText(s.right, "right answer", "right answers"))}, ` +
      `${countText(s.wrong, "wrong answer", "wrong answers")}.`,
    weakBand: (threshold: number) => `Weak below ${threshold}`,
    deadBand: (threshold: number) => `Dead below ${threshold}`,
    markRight: "Knew it",
    markWrong: "Forgot",
    cause: "Cause of death",
    close: "Close",
  },
} satisfies WordingProps

/** "no right answers", "1 right answer", "3 right answers". */
function countText(n: number, one: string, many: string): string {
  return n === 0 ? `no ${many}` : `${n} ${n === 1 ? one : many}`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Why a write button is disabled while previewing (Requirement 11.3). */
export const previewBlockedText = "Nothing is saved in a future preview. Go back to today first."

/** The fight queue started from Triage (task 9.2, Requirement 9.5). */
export const sessionText = {
  /** Shown in each fight of a session, e.g. "Fight 2 of 3". */
  progress: (position: number, total: number) => `Fight ${position} of ${total}`,
  stop: "Stop session",
  done: "Session complete.",
  skippedDied: (question: string) => `Skipped “${question}”: it died before its turn. Challenge it from the Graveyard.`,
  skippedRemoved: (question: string) => `Skipped “${question}”: it was removed before its turn.`,
  dismiss: "Close",
} as const

/** A previewed day as "8 Oct 2026". */
export function formatPreviewDate(ms: number, options: { timeZone?: string; locale?: string } = {}): string {
  const parts = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  }).formatToParts(new Date(ms))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("day")} ${part("month")} ${part("year")}`
}

/** Confirmation asked before a fact is removed (Requirement 6.1). */
export const removeConfirmText = "Remove this fact? This cannot be undone."

/** The button that dismisses the remove confirmation (Requirement 6.3). */
export const removeCancelLabel = "Cancel"

/** The add/edit fact form (Requirement 5, task 5.1). */
export const factFormText = {
  /** The button that opens the form for a new fact. */
  addEntry: "Add fact",
  addTitle: "Add a fact",
  editTitle: "Edit fact",
  question: "Question",
  answer: "Answer",
  why: "Why it matters (optional)",
  knowledge: "How well do you know it?",
  knowledgeLevels: { new: "Brand new", shaky: "Shaky", solid: "Solid" } satisfies Record<Knowledge, string>,
  importance: "Importance",
  cost: "Review cost",
  costOption: (minutes: number) => `${minutes} min`,
  /** Characters used out of the limit, e.g. "12 / 140". */
  counter: (used: number, max: number) => `${used} / ${max}`,
  submitAdd: "Add fact",
  submitEdit: "Save",
  cancel: "Cancel",
  errors: {
    questionRequired: "Write a question.",
    answerRequired: "Write the answer.",
    tooLong: (max: number) => `Use at most ${max} characters.`,
    knowledge: "Choose brand new, shaky or solid.",
    importance: "Choose an importance of 1, 2 or 3.",
    cost: "Choose a review cost of 1, 2, 3 or 5 minutes.",
  },
} as const

/** The fight with an alive or weak fact (Requirement 8.1-8.5, task 7.1). */
export const fightText = {
  question: "Question",
  answer: "Answer",
  showAnswer: "Show answer",
  walkAway: "Walk away",
  knewIt: "I knew it",
  forgot: "I forgot",
  correct: "Correct! Health → 100, half-life doubled",
  incorrect: "Incorrect. Health → 45, half-life halved",
  /** The fact died between opening the fight and answering; nothing was tended. */
  diedFirst: "This fact died before you answered. Challenge it from the Graveyard.",
  close: "Close",
} as const

/**
 * A half-life in days for display: at most two decimals, trailing zeros
 * dropped (5 → "5", 2.5 → "2.5", 1.40625 → "1.41").
 */
export function formatHalfLifeDays(days: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(days)
}

/** The first-run welcome screen (task 11.3, Requirement 13.1-13.4). */
export const firstRunText = {
  title: "Welcome to the Study Dungeon",
  intro: "Facts you are forgetting come back as monsters. Fight them to keep them alive.",
  choose: "Try it with twelve sample facts, or start with an empty Crypt.",
  loadSample: "Load sample data",
  startEmpty: "Start empty",
} as const

/** Shown in an empty list when there are no facts at all (after "Start empty"). */
export const emptyCryptPrompt = "Your Crypt has no facts yet. Use Add fact to put in your first one."

/** "Reset all data" (task 11.4, Requirement 13.6). */
export const resetText = {
  button: "Reset all data",
  confirm: "Reset all data? This cannot be undone.",
  cancel: "Cancel",
  confirmButton: "Reset",
} as const

/** The hero section (task 12.1, Requirement 12). */
export const heroText = {
  eyebrow: "Your memory today",
  weakening: (n: number) => (n === 1 ? "1 fact is weakening" : `${n} facts are weakening`),
  fightWeakest: "Fight the weakest",
  allQuiet: "All quiet in the Crypt. Every fact is sleeping soundly.",
  onlyDead: "Nothing is weakening. Your graves are waiting in the Graveyard.",
  noFacts: "No facts yet. Use Add fact to put your first one in the Crypt.",
  stats: "Your stats",
  souls: (n: number) => (n === 1 ? "soul banished" : "souls banished"),
  streak: (n: number) => (n === 1 ? "day in a row" : "days in a row"),
} as const

/**
 * What the App's polite live region says after a change (task 16.4). The
 * list is the one the fact is in afterwards, read from the engine
 * (studyDungeonWording.lists). Storage problems use storageProblemText.
 */
export const announceText = {
  added: (list: string) => `Fact added to the ${list}.`,
  saved: "Fact saved.",
  removed: "Fact removed.",
  sampleLoaded: (count: number) => `${count} sample facts loaded.`,
  fightRight: (list: string) => `You knew it. The fact is in the ${list}.`,
  fightWrong: (list: string) => `You forgot it. The fact is in the ${list}.`,
  diedFirst: (list: string) => `The fact died before you answered. It is in the ${list}.`,
  resurrected: (list: string) => `Resurrected. The fact is back in the ${list}.`,
  staysDead: (list: string) => `You got it wrong. The fact stays in the ${list}.`,
} as const

/** Landmark and region names (task 16.4). */
export const landmarkText = {
  /** The nav around the Crypt, Dungeon and Graveyard tabs. */
  lists: "Crypt, Dungeon and Graveyard",
  /** The side column: the time machine and Triage. */
  tools: "Time machine and Triage",
} as const

/** The sound setting (task 20.1, Requirement 18.1). */
export const soundText = {
  toggle: "Sound effects",
} as const

/** One step of the first-run tour. */
export type TourStepText = { title: string; body: string }

/** The first-run tour (task 11.5, Requirement 13.5): four short steps. */
export const tourText = {
  label: "Tour",
  progress: (step: number, total: number) => `Step ${step} of ${total}`,
  steps: {
    crypt: {
      title: "The Crypt",
      body: "Facts you know sleep here, each with a candle. The card says when it wakes up.",
    },
    dungeon: {
      title: "The Dungeon",
      body: "Facts you are forgetting turn into monsters. The weakest is at the top.",
    },
    fight: {
      title: "Fight",
      body: "Show the answer, then say if you knew it. A right answer puts the monster back to sleep.",
    },
    timeMachine: {
      title: "The time machine",
      body: "Slide ahead to see what dies next. Nothing is saved while you look.",
    },
  } satisfies Record<string, TourStepText>,
  back: "Back",
  next: "Next",
  done: "Done",
  skip: "Skip tour",
} as const

/** The challenge of a dead fact (Requirement 8.6-8.9, task 7.2). */
export const challengeText = {
  question: "Question",
  answer: "Answer",
  knewIt: "I knew it",
  forgot: "I forgot",
  /** Leaves without answering; nothing is recorded (same words as the fight). */
  walkAway: "Walk away",
  /** Shown on success with the fact's half-life after the resurrect. */
  resurrected: (halfLifeDays: number) =>
    `Resurrected! New half-life: ${formatHalfLifeDays(halfLifeDays)} ${halfLifeDays === 1 ? "day" : "days"}`,
  close: "Close",
} as const
