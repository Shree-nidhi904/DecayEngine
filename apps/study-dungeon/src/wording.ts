// Study Dungeon wording: what lists, actions and states are called, and every
// label and line of text in the app's own dialogs.
// List names come from .kiro/steering/theme-and-wording.md; dialog text comes
// from .kiro/specs/study-dungeon (Requirements 5, 6 and 8, design.md).

import type { WordingProps } from "@decay-engine/shell"
import type { Knowledge } from "./policy"

export const studyDungeonWording = {
  lists: { alive: "Crypt", weak: "Dungeon", dead: "Graveyard" },
  actions: { tend: "Fight", resurrect: "Challenge", edit: "Edit", remove: "Remove" },
  states: { alive: "sleeping", weak: "monster", dead: "dead" },
} satisfies WordingProps

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
