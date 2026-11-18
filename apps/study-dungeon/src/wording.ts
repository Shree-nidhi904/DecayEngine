// Study Dungeon wording: what lists, actions and states are called, and every
// label and line of text in the app's own dialogs.
// List names come from .kiro/steering/theme-and-wording.md; dialog text comes
// from .kiro/specs/study-dungeon (Requirements 5, 6 and 8, design.md).

import type { WordingProps } from "@decay-engine/shell"
import type { Knowledge } from "./policy"

/** "1 day", "2 days". */
const daysText = (days: number) => `${days} ${days === 1 ? "day" : "days"}`

/** At most two decimals, trailing zeros dropped (75 → "75", 56.25 → "56.25"). */
const twoDecimals = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 })

export const studyDungeonWording = {
  lists: { alive: "Crypt", weak: "Dungeon", dead: "Graveyard" },
  actions: { tend: "Fight", resurrect: "Challenge", edit: "Edit", remove: "Remove" },
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
} satisfies WordingProps

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
