// Every Ghosted interface string, in one place (task 2.3; Requirement 31).
//
// The light is connection freshness: how recently the user was in touch.
// Nothing here measures or judges how much anyone cares (theme-and-wording.md,
// steering ghosted.md section 1). Later tasks add their strings here.

import type { AutopsyChartSummary, WordingProps } from "@decay-engine/shell"
import type { ContactEvent } from "./policy"

export type ContactKind = ContactEvent["kind"]

/** The app's name and the header sign's tagline (Req 7.1). */
export const appText = {
  name: "Ghosted",
  tagline: "People you are losing touch with",
} as const

/** What the light means, in the words Requirement 31.1 asks for. */
export const freshnessText = {
  meaning: "The light shows connection freshness: how recently you were in touch.",
  // Under the Street heading (Req 10.5, design section 4.4).
  streetNote: "The light shows how recently you were in touch. It does not measure how much anyone matters.",
} as const

/** The three lists (theme-and-wording.md, Req 31.3). */
export const listNames = {
  alive: "Still lit",
  weak: "Fading",
  dead: "Empty windows",
} as const

/** The state words shown next to each glyph (Req 16.1, 16.2). */
export const stateWords = {
  alive: "lit",
  litAgain: "lit again",
  weak: "flickering",
  dead: "boarded up",
} as const

/** The three contacts, as the user picks them (Req 14.1, 18.1). */
export const contactChoice: Readonly<Record<ContactKind, string>> = {
  text: "Sent a message",
  call: "Had a call",
  meetup: "Met up",
}

/** One contact kind as a legend label on the autopsy chart (design section 4.4, PersonAutopsy). */
export const contactLabel: Readonly<Record<ContactKind, string>> = {
  text: "Message",
  call: "Call",
  meetup: "Meet-up",
}

const contactCountWords: Readonly<Record<ContactKind, readonly [string, string]>> = {
  text: ["message", "messages"],
  call: ["call", "calls"],
  meetup: ["meet-up", "meet-ups"],
}

function isContactKind(kind: string): kind is ContactKind {
  return kind === "text" || kind === "call" || kind === "meetup"
}

/**
 * The autopsy chart's markers in words, for the shell's markerSummary, for
 * example "3 calls, 2 messages, 1 meet-up". Kinds come in the order given
 * (the legend's). With no markers: "no contacts logged".
 */
export function markerSummary(counts: readonly { kind: string; label: string; count: number }[]): string {
  const parts = counts
    .filter((c) => c.count > 0)
    .map(({ kind, label, count }) => {
      const words = isContactKind(kind) ? contactCountWords[kind] : [label.toLowerCase(), label.toLowerCase()]
      return `${count} ${count === 1 ? words[0] : words[1]}`
    })
  return parts.length === 0 ? "no contacts logged" : parts.join(", ")
}

/** The three Triage steps shown above the panel (Req 9.2). */
export const triageSteps: readonly string[] = [
  "Only fading windows are considered.",
  "The dimmer and more important the person, the more reaching out is worth.",
  "The picks give the most worth per minute that fits your time.",
]

/**
 * The rule each person-form field breaks, in words (Req 17.7). person-form.ts
 * returns these, the form shows them next to the field, and the import uses
 * them as the reason a line was skipped (Req 21.6).
 */
export const personFormRules = {
  name: "the name must be 1 to 60 characters",
  relationship: "the relationship must be at most 40 characters",
  rhythmDays: "the rhythm must be a whole number of days from 1 to 365",
  lastContactDate: "the last contact must be a date (YYYY-MM-DD)",
  lastContactFuture: "the last contact cannot be later than today",
  importance: "the importance must be 1, 2 or 3",
  costMinutes: "the minutes must be a whole number from 1 to 600",
} as const

/** The import's words (Req 21.5, 21.6). The dialog itself comes in task 5.3. */
export const importText = {
  help: 'One person per line: name | relationship | rhythm days | last contact (YYYY-MM-DD); leave the relationship or the date empty, as in "Mira | | 30" (tabs and CSV work too).',
  defaults: (importance: number, minutes: number) =>
    `Imported people get importance ${importance} and ${minutes} minutes.`,
  rhythmMissing:
    "expected name | relationship | rhythm days | last contact (YYYY-MM-DD), the rhythm is required",
  tooManyFields: "expected name | relationship | rhythm days | last contact (YYYY-MM-DD), there are more than 4 fields",
} as const

/** Why a backup file was refused (Req 21.4, design section 9.3). */
export const backupRefusals = {
  notJson: "This file is not a Ghosted backup (it is not JSON).",
  otherApp: "This is a backup from another app.",
  notGhosted: "This file is not a Ghosted backup.",
  newerVersion: "This backup is from a newer version of the app.",
  damaged: "This backup is damaged and cannot be loaded.",
} as const

/** The problem screen: a crash, or a storage problem at startup (components/ErrorBoundary.tsx). */
export const problemScreenText = {
  title: "Something went wrong on the street",
  crashed: "Ghosted hit an unexpected error. Your saved people are not changed by this. Reloading usually fixes it.",
  reload: "Reload",
  reset: "Reset all data",
  confirmReset: "Reset all data? This cannot be undone.",
  confirm: "Reset",
  cancel: "Cancel",
} as const

/** Shown on every blocked write control while the time machine looks ahead (Req 12.5). */
export const previewBlockedText = "Future preview · nothing is saved"

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`)

/** "+30 days", …, and "+1 year" for 365 (Req 12.1). */
function jumpLabel(n: number): string {
  return n === 365 ? "+1 year" : `+${days(n)}`
}

/** The autopsy chart summed up in words: its aria-label. */
function chartLabel(s: AutopsyChartSummary): string {
  const contacts = s.markers ?? "no contacts logged"
  return (
    `Freshness from ${s.from} to ${s.to}: it started at ${Math.floor(s.startHealth)} ` +
    `and fell to ${Math.floor(s.endHealth)}. Contacts: ${contacts}.`
  )
}

/** The words the shell components show, under the shell's WordingProps. */
export const ghostedWording: WordingProps = {
  lists: { ...listNames },
  actions: {
    tend: "Reach out",
    resurrect: "Reconnect",
    edit: "Edit",
    remove: "Remove",
    autopsy: "Autopsy",
  },
  states: { alive: stateWords.alive, weak: stateWords.weak, dead: stateWords.dead },
  timeMachine: {
    title: "Moon clock",
    slider: "Days ahead",
    showing: (date, n) => (n === 0 ? `Today, ${date}` : `${date}, ${days(n)} ahead`),
    jump: jumpLabel,
    play: "Play the year",
    stop: "Stop",
  },
  preview: { banner: previewBlockedText, backToToday: "Back to today" },
  triage: {
    title: "Who to reach out to",
    budget: "Time you have",
    minutes: (n) => `${n} min`,
    custom: "Other",
    customLabel: "Minutes",
    invalidBudget: (max) => `Enter a whole number of minutes from 1 to ${max}.`,
    run: "Plan",
    picks: "Reach out to these",
    others: "Also fading",
    empty: "Nobody is fading.",
    nothingFits: "Nobody fits in that time.",
    valuePerMinute: (value) => `worth ${value.toFixed(1)} per minute`,
    cost: (n) => `${n} min`,
    diesIn: (n) => (n === 0 ? "goes dark today" : `goes dark in ${days(n)}`),
    diesNever: "not going dark",
    startSession: "Start reaching out",
  },
  autopsy: {
    title: "How the window went dark",
    epitaph: "Why they matter",
    chartTitle: "Freshness over time",
    chartLabel,
    weakBand: (t) => `Flickering below ${t}`,
    deadBand: (t) => `Boarded up below ${t}`,
    // Required by the shell's type but never shown: Ghosted passes markers,
    // which replace the right/wrong marks (design open issue 2.8).
    markRight: "Message",
    markWrong: "Call",
    cause: "What happened",
    close: "Close",
  },
}

/** The person card (task 4.2, Req 13, design section 4.4 PersonCard). */
export const cardText = {
  /** "Last contact today", "Last contact 1 day ago", "Last contact 23 days ago" (Req 13.1). */
  lastContact: (daysAgo: number) =>
    daysAgo <= 0 ? "Last contact today" : `Last contact ${days(daysAgo)} ago`,
  rhythm: (rhythmDays: number) => `Usual rhythm every ${days(rhythmDays)}`,
  /** For a fading person: whole days until the window goes dark. */
  goesDark: (n: number) => (n === 0 ? "Goes dark today" : `Goes dark in ${days(n)}`),
  /** The health bar's accessible name (Req 13.2). */
  freshness: (n: number) => `Freshness ${n} of 100`,
  /** The words under the health bar's two marks. */
  barKey: (weak: number, dead: number) => `flickering below ${weak}, boarded up below ${dead}`,
  reachOut: "Reach out",
  reconnect: "Reconnect",
  autopsy: "Autopsy",
  edit: "Edit",
  remove: "Remove",
  history: "History",
  historyEmpty: "No contacts logged yet.",
  /** Added to a history entry that brought the window back. */
  reconnected: "reconnected",
  historyFreshness: (n: number) => `freshness ${n}`,
} as const

/** The three lists and the section navigation (task 4.3, Req 11). */
export const listsText = {
  navLabel: "Sections",
  street: "Street",
  /** The count badge, read out with its noun. */
  count: (n: number) => (n === 1 ? "1 person" : `${n} people`),
  fading: {
    sub: "Past their usual rhythm. Weakest first.",
    empty: "Nobody is fading.",
  },
  empty: {
    sub: "These windows went dark. Read the autopsy, then decide whether to reconnect.",
    empty: "No empty windows.",
  },
  still: {
    sub: (n: number) => `${n} within their rhythm.`,
    empty: "No window is lit right now.",
  },
  startsFading: (n: number) => (n === 0 ? "starts fading today" : `starts fading in ${days(n)}`),
  open: "Open",
} as const
