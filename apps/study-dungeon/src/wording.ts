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
  /** Beside the Add fact button. */
  addHint: "Every fact you add becomes a creature. Forget it and it comes for you.",
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
  /**
   * The loss forecast line under the hero heading (task P4, Requirement 20,
   * design "Loss Forecast Line", Wording). "The next 7 days" is a rolling
   * window, never "this week". The noun follows the first count shown; the
   * verb after "and" agrees with the second count.
   */
  lossForecast: (weaken: number, die: number) => {
    if (weaken === 0 && die === 0) return "Nothing will weaken or die in the next 7 days."
    const facts = (n: number) => (n === 1 ? "1 fact" : `${n} facts`)
    const weakens = (n: number) => (n === 1 ? "weakens" : "weaken")
    const dies = (n: number) => (n === 1 ? "dies" : "die")
    const start = "If you do nothing, in the next 7 days"
    if (die === 0) return `${start} ${facts(weaken)} ${weakens(weaken)}.`
    if (weaken === 0) return `${start} ${facts(die)} ${dies(die)}.`
    return `${start} ${facts(weaken)} ${weakens(weaken)} and ${die} ${dies(die)}.`
  },
} as const

/**
 * The line under the Triage picks (task P5, Requirement 21, design "What This
 * Session Saves", Wording). Called only with n ≥ 1: with no saved pick there
 * is no line (Req 21.6). "These" points at "Fight these first"; "the next 7
 * days" is the same rolling window as the hero's line, never "this week".
 * A separate object, because studyDungeonWording.triage is the shell's shape.
 */
export const triageNoteText = {
  saves: (n: number) =>
    `Answering these right saves ${n} ${n === 1 ? "fact" : "facts"} that would die in the next 7 days.`,
} as const

/**
 * The rescue line in the autopsy (task R1, Requirement 22, design "Rescue
 * Point"): what one right review, when the fact went weak, would have given.
 * `on` and `until` are dates already formatted by rescue-sentence.ts; `n` is
 * at least 1.
 */
export const rescueText = {
  sentence: (on: string, until: string, n: number) =>
    `A review on ${on}, when it went weak, would have kept it alive until ${until}, ${daysText(n)} longer.`,
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
  /** The side column: Triage. The time machine is in the dock at the bottom. */
  tools: "Triage",
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

/** The three scenes (visual pass, Pass 1): a heading and one line under it. */
export const sceneText = {
  weak: {
    title: "The Dungeon",
    sub: "Weak facts, weakest first. Face them before they die.",
    emptyHint: "The dungeon is quiet. Drag the candle forward to see what is coming.",
  },
  alive: {
    title: "The Crypt",
    sub: "Healthy facts, asleep. Each shows when it will wake.",
    emptyHint: "No one sleeps here yet. Win a fight and the creature comes here to rest.",
  },
  dead: {
    title: "The Graveyard",
    sub: "Forgotten for too long. Challenge a grave to bring it back.",
    emptyHint: "Not a single grave. Nothing has been forgotten for good. Keep it that way.",
  },
} as const

/** The page header (visual pass, Pass 1). */
export const headerText = {
  title: "Study Dungeon",
  tagline: "What you forget will come for you",
} as const

/** Extra hero lines (visual pass, Pass 3). */
export const heroExtraText = {
  /** The eyebrow while a future day is shown. */
  previewEyebrow: (date: string) => `Future preview · ${date}`,
  /** Put before the message while previewing: "In 18 days: ". */
  inDays: (days: number) => `In ${days} ${days === 1 ? "day" : "days"}: `,
  /** The forecast against today: "4 will weaken, 3 will die. Nothing is saved." */
  forecast: (weaken: number, die: number) => {
    const bits: string[] = []
    if (weaken > 0) bits.push(`${weaken} will weaken`)
    if (die > 0) bits.push(`${die} will die`)
    return bits.length === 0
      ? "No new changes by then. This is a preview, nothing is saved."
      : `Compared with today, ${bits.join(" and ")}. This is a preview, nothing is saved.`
  },
  /** Under "N facts are weakening" today. */
  startWith: (name: string, health: string) => `Start with ${name}. It has ${health} health left.`,
  rank: "Rank",
  rankProgress: "Progress to the next rank",
  nextRank: (souls: number, title: string) => `${souls} more ${souls === 1 ? "soul" : "souls"} to ${title}`,
  topRank: "The highest rank. The dungeon fears you.",
} as const

/** The time dock's timeline (visual pass, Pass 3). */
export const timelineText = {
  markers: "Predicted changes",
  marker: (day: number, name: string, kind: "weak" | "dead") =>
    `Day ${day}: ${name} ${kind === "weak" ? "weakens" : "dies"}`,
  next: "Next:",
  event: (name: string, kind: "weak" | "dead", inDays: number) =>
    `${name} ${kind === "weak" ? "weakens" : "dies"} in ${inDays}d`,
  none: (maxDays: number) => `No more changes in the next ${maxDays} days.`,
  empty: "Nothing to predict yet.",
  ticks: ["Today", "15d", "30d", "45d", "60d"],
  /** The dock's toggle (task 21.1, Req 19.3): the same words in both states, and in both apps. */
  toggle: "Coming up",
  /** Shown in the collapsed dock only (Req 19.12). */
  hint: "Drag to look ahead",
} as const

/** Answering in a fight or a challenge when the answer is checked (answer-check.ts). */
export const answerText = {
  choose: "Choose the answer",
  keysHint: "Press A to D, or click.",
  typeLabel: "Your answer",
  check: "Check",
  youWrote: (typed: string) => `You wrote: “${typed}”`,
  rightMark: "right",
  wrongMark: "your pick",
  setting: "Answer by",
  fewFacts: "There are too few other facts to pick from, so type this one.",
  options: { choices: "Picking from four", typed: "Typing it", self: "Trust me (show the answer)" },
  sleepsUntil: (date: string) => `It sleeps until ${date}. Next time it will sleep even longer.`,
} as const

/** The explainer beside Triage (the raid planner). */
export const raidText = {
  title: "Short on time? Plan a raid.",
  steps: [
    "Pick how many minutes you have.",
    "Triage picks the weak facts that save the most memory in that time: the most important and the closest to dying first.",
    "Press Start the session to fight them one after another.",
  ],
  note: "Facts you skip keep fading. Still lurking shows when each one dies.",
} as const

/** A fight in a Triage session, after right answers in a row. */
export const comboText = (n: number) => `Combo ×${n}`

/** The entrance doors (DoorSplash). */
export const doorText = {
  title: "Study Dungeon",
  line: "Knock, if you dare. What you forget is waiting inside.",
  enter: "Enter the dungeon",
} as const

/** "Today's raid": the five-minute session in one click. */
export const dailyRaidText = {
  button: "Start today's 5-minute raid",
  hint: "One click: Triage for 5 minutes, then fight the picks.",
  nothing: "Nothing needs saving right now. Come back when a fact weakens.",
} as const

/** "Import facts" (ImportFactsDialog). */
export const importText = {
  button: "Import facts",
  title: "Import facts",
  help: "One fact per line: question | answer | why it matters (optional). Rows pasted from a spreadsheet work too.",
  label: "Your facts",
  placeholder: "Capital of Peru? | Lima | Geography quiz\nPowerhouse of the cell? | Mitochondrion",
  ready: (n: number) => (n === 0 ? "No facts to add yet." : `${n} ${n === 1 ? "fact" : "facts"} ready to add.`),
  skipped: (line: number, reason: string) => `Line ${line} skipped: ${reason}.`,
  more: (n: number) => `…and ${n} more skipped.`,
  submit: (n: number) => (n === 0 ? "Add facts" : `Add ${n} ${n === 1 ? "fact" : "facts"}`),
  done: (n: number) => `${n} ${n === 1 ? "fact" : "facts"} imported into the Crypt.`,
} as const

/** Back up and restore (BackupControls). */
export const backupText = {
  backUp: "Back up",
  restore: "Restore",
  saved: "Backup downloaded. Keep the file somewhere safe.",
  nothing: "Nothing to back up yet.",
  confirm: (n: number) =>
    `Replace everything with this backup (${n} ${n === 1 ? "fact" : "facts"})? Your current facts will be lost.`,
  confirmButton: "Replace",
  cancel: "Cancel",
  failed: "The backup could not be saved here. Storage may be full.",
} as const

/**
 * Live state changes (task L3, Requirement 23, design "Live State Changes",
 * Wording): the short message after a minute tick moved facts on its own.
 * `name` is the creature's name (creatureOf(id).name). A fact's creature
 * wakes when it weakens (Crypt to Dungeon); a fact that dies goes to the
 * Graveyard, from the Dungeon or, in one tick, straight from the Crypt
 * ("in its sleep"). `kind` is from live-changes.ts. The list name comes from
 * studyDungeonWording.lists, so "Graveyard" is written once.
 */
export type LiveKind = "wake" | "die" | "dieAsleep"

const graveyard = () => studyDungeonWording.lists.dead

/** The verb after "just" for one fact, or after "and" for a second one. */
const liveVerb = (kind: LiveKind): string =>
  kind === "wake"
    ? "weakened"
    : kind === "die"
      ? `died and went to the ${graveyard()}`
      : `died in its sleep and went to the ${graveyard()}`

/** The shorter verb for the second of two different changes. */
const liveVerbShort = (kind: LiveKind): string =>
  kind === "wake" ? "weakened" : kind === "die" ? `went to the ${graveyard()}` : `went to the ${graveyard()} in its sleep`

export const liveText = {
  /** One fact: "Gaze just weakened.", "Gaze just died and went to the Graveyard." */
  one: (kind: LiveKind, name: string) => `${name} just ${liveVerb(kind)}.`,
  /**
   * Two facts, the more important first. The same kind of change (dying in
   * its sleep counts as dying): "Gaze and Wisp just died and went to the
   * Graveyard." Two kinds: "Gaze just weakened and Wisp went to the Graveyard."
   */
  two: (first: { kind: LiveKind; name: string }, second: { kind: LiveKind; name: string }) => {
    const group = (kind: LiveKind): LiveKind => (kind === "wake" ? "wake" : "die")
    if (group(first.kind) === group(second.kind)) {
      return `${first.name} and ${second.name} just ${liveVerb(group(first.kind))}.`
    }
    return `${first.name} just ${liveVerbShort(first.kind)} and ${second.name} ${liveVerbShort(second.kind)}.`
  },
  /**
   * Three or more facts, naming the most important one: "3 facts weakened,
   * Gaze's among them." `weakened` and `died` are counts.
   */
  many: (weakened: number, died: number, name: string) => {
    const facts = (n: number) => (n === 1 ? "1 fact" : `${n} facts`)
    if (died === 0) return `${facts(weakened)} weakened, ${name}'s among them.`
    if (weakened === 0) return `${facts(died)} went to the ${graveyard()}, ${name}'s among them.`
    return `${facts(weakened)} weakened and ${died} went to the ${graveyard()}, ${name}'s among them.`
  },
  /** The message's only control. */
  dismiss: "Dismiss",
  /** The tab title while the tab was hidden: "(2) Study Dungeon", "(9+) Study Dungeon" (Requirement 23.6). */
  title: (count: number, base: string) => (count <= 0 ? base : `(${count > 9 ? "9+" : count}) ${base}`),
} as const

/**
 * Notifications while the tab is open (task L5, Requirement 24, design
 * "Notifications While the Tab Is Open", Wording). The notification itself
 * uses headerText.title and the liveText sentence, so no sentence about a
 * fact is written here. No guilt words.
 */
export const notifyText = {
  label: "Notify me about changes while this tab is open",
  unsupported: "This browser cannot show notifications, so this setting is not available here.",
  on: "On: when a fact changes while this tab is in the background, your browser shows a notification.",
  denied: "Your browser blocks notifications for this page; to allow them, open the site settings by the address bar.",
  blocked:
    "This is on, but your browser is blocking notifications for this page, so none are shown; allow them in the site settings by the address bar, or turn this off.",
  notSaved: "This choice cannot be saved in this browser, so it lasts until the page is closed.",
  /** The honest limit (Requirement 24.3). */
  limit: "There is no server, so nothing can notify you when this tab is closed or the computer is asleep.",
  /** Privacy (Requirement 24.9). */
  privacy: "A notification shows only what is already on this page, and nothing is sent anywhere.",
} as const

/** The first ten seconds (task L6, Requirement 25, design "The First Ten Seconds", Wording). */
export const firstLookText = {
  /** The one button while the first look plays. */
  skip: "Skip the preview",
  /** Said once, through the live region, when it starts (Requirement 25.9). */
  announce: "Showing the next 30 days. Nothing is saved.",
} as const
