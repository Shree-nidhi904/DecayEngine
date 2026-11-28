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

/** The three Triage steps, in the "How does this work?" disclosure above the panel (Req 9.2, 33.3). */
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
  // Task P6: a line that repeats a person (same name and relationship), in the paste or already on the street.
  repeatsLine: (line: number) => `same name and relationship as line ${line}`,
  alreadyOnStreet: "already on your street (same name and relationship)",
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

/** The Street (task 4.4, Req 10). The note under the heading is freshnessText.streetNote. */
export const streetText = {
  title: "The Street",
  /** The house for people without a relationship tag (Req 10.2). */
  others: "Others",
} as const

/** The hero (task 4.5, Req 8, design section 4.4 Hero). */
export const heroText = {
  welcome: "Welcome to the street.",
  /** "1 window is flickering", "4 windows are flickering" (Req 8.1). */
  flickering: (n: number) => (n === 1 ? "1 window is flickering" : `${n} windows are flickering`),
  nobodyFading: "Nobody is fading.",
  allLit: "Every window is lit.",
  noWindows: "No windows yet.",
  loadSample: "Load sample street",
  startEmpty: "Start empty",
  reachOutTo: (firstName: string) => `Reach out to ${firstName}`,
  seeEmpty: "See the empty windows",
  lookAtStreet: "Look at the street",
  addPerson: "Add a person",
  /** The eyebrow while the time machine looks ahead (Req 8.5). */
  previewEyebrow: (date: string) => `Future preview · ${date}`,
  /**
   * The loss forecast line under the hero heading (task P4, Req 35, design
   * section 12.3). Windows start to flicker and go dark; never "die" or
   * "dead". "The next 7 days" is a rolling window, never "this week". The
   * noun follows the first count shown; the verb after "and" agrees with the
   * second count.
   */
  lossForecast: (fade: number, dark: number) => {
    if (fade === 0 && dark === 0) return "No window will start to flicker or go dark in the next 7 days."
    const windows = (n: number) => (n === 1 ? "1 window" : `${n} windows`)
    const flicker = (n: number) => (n === 1 ? "starts to flicker" : "start to flicker")
    const goDark = (n: number) => (n === 1 ? "goes dark" : "go dark")
    const start = "If you do nothing, in the next 7 days"
    if (dark === 0) return `${start} ${windows(fade)} ${flicker(fade)}.`
    if (fade === 0) return `${start} ${windows(dark)} ${goDark(dark)}.`
    return `${start} ${windows(fade)} ${flicker(fade)} and ${dark} ${goDark(dark)}.`
  },
} as const

/** The privacy line below the lists (Req 15). */
export const privacyText = {
  sample: "Everything stays in this browser. Names here are made up.",
  own: "Everything stays in this browser.",
} as const

/** Buttons shared by the dialogs (tasks 4.6 to 4.9). */
export const dialogText = {
  cancel: "Cancel",
  close: "Close",
  done: "Done",
} as const

/** Removing a person (task 4.6, Req 13.5). */
export const removeText = {
  confirm: (name: string) => `Remove ${name}? This cannot be undone.`,
  confirmLabel: "Remove",
} as const

/** Reset all data (task 4.6, Req 20.7). */
export const resetText = {
  button: "Reset all data",
  confirm: "Reset all data? This cannot be undone.",
  confirmLabel: "Reset all data",
} as const

/** The Reach out dialog (task 4.8, Req 18, design section 4.4 ReachOutDialog). */
export const reachOutText = {
  title: (name: string) => `Reach out to ${name}`,
  question: (firstName: string) => `What did you do to reach ${firstName}?`,
  /** Each choice's effect, from the policy (Req 18.1). */
  effect: (before: number, after: number) => `Freshness ${before} → ${after}`,
  brighter: (firstName: string, before: number, after: number) =>
    `${firstName} is a little brighter. Freshness ${before} → ${after}.`,
  litAgain: (firstName: string) => `${firstName} is lit again.`,
  nextBy: (date: string) => `Reach out again by ${date} to keep the window lit.`,
  wentDark: (name: string) => `${name}'s window went dark before you reached out.`,
  /** In a Triage session (Req 9.5). */
  progress: (position: number, total: number) => `Person ${position} of ${total}`,
  stopSession: "Stop session",
} as const

/** The Reconnect dialog (task 4.9, Req 14). */
export const reconnectText = {
  title: (name: string) => `Reconnect with ${name}`,
  question: "Which contact happened?",
  success: (firstName: string) => `${firstName}'s window is lit again. Freshness is 100.`,
} as const

/** Add and edit a person (task 4.10, Req 17). The rules themselves are personFormRules. */
export const personFormText = {
  addTitle: "Add a person",
  editTitle: (name: string) => `Edit ${name}`,
  name: "Name",
  relationship: "Relationship",
  rhythm: "Usual rhythm in days",
  lastContact: "Last contact",
  /** Under the read-only date in the edit form (Req 17.5). */
  lastContactLocked: "Log a contact to change this",
  importance: "Importance",
  costMinutes: "Minutes it takes to reach out",
  /** The live hint while adding (Req 17.3). */
  startsDark: "This window starts dark",
  save: "Save",
  /** Announced by the App after a save. */
  added: (name: string) => `${name} was added to the street.`,
  edited: (name: string) => `${name} was saved.`,
} as const

/** The toolbar under the lists (design section 4.3). */
export const toolbarText = {
  addPerson: "Add a person",
} as const

/** The Triage panel's own words around the shell panel (task 4.12, Req 9.2, 9.4). */
export const triageText = {
  /** The summary of the closed disclosure that holds the three steps (Req 9.2 as amended, 33.3). */
  howItWorks: "How does this work?",
  /** The quiet button (Req 9.4): "Today's 5-minute action: Reach out to Dan". */
  fiveMinute: (firstName: string) => `Today's 5-minute action: Reach out to ${firstName}`,
  /**
   * The line under the picks (task P5, Req 36, design section 13.5): how many
   * picks would go dark in the next 7 days and a call or meet-up keeps lit.
   * Called only with n ≥ 1 (no line for 0). It names the contact because a
   * text may not keep the window lit. Never "die" or "dead".
   */
  saves: (n: number) =>
    `A call or meet-up with these people keeps ${n === 1 ? "1 window" : `${n} windows`} from going dark in the next 7 days.`,
} as const

/**
 * The rescue line in the autopsy (task R1, Req 37, design section 14): what
 * one call, when the window started to flicker, would have given. `on` and
 * `until` are dates already formatted by rescue-sentence.ts; `n` is at least
 * 1. Neutral words: the light is kept on; never "die", "dead" or "late".
 */
export const rescueText = {
  sentence: (on: string, until: string, n: number) =>
    `A call on ${on}, when the window started to flicker, would have kept the light on until ${until}, ${days(n)} longer.`,
} as const

/** The Triage session (Req 9.5, design section 4.3). */
export const sessionText = {
  finished: "Session finished.",
  /** One skipped person in the closing message. */
  skippedDark: (name: string) => `${name} (the window went dark)`,
  skippedRemoved: (name: string) => `${name} (removed)`,
  skipped: (list: string) => `Skipped: ${list}.`,
} as const

/** The splash (task 4.14, Req 6). The word "Ghosted" is appText.name. */
export const splashText = {
  /** Ported from the wireframe's splash line. */
  tagline: "Some windows are going dark. Let's see whose.",
  walkIn: "Walk in",
} as const

/**
 * The moon-clock dock (task 5.1, Req 12.4). The time machine's own words
 * (title, slider, jumps, Play) are ghostedWording.timeMachine, and the banner
 * is ghostedWording.preview.
 */
export const dockText = {
  /** The marker track's group name. */
  markers: "Who fades and goes dark in the next year",
  /** A marker's accessible name: "Mira Castell starts fading on 3 March". */
  fades: (name: string, date: string) => `${name} starts fading on ${date}`,
  /** A marker's accessible name: "Mira Castell goes dark on 3 March". */
  dark: (name: string, date: string) => `${name} goes dark on ${date}`,
  /** Under the track, from the wireframe (hidden from screen readers; the slider says the date). */
  ticks: ["Today", "3 months", "6 months", "9 months", "1 year"],
  /** The toggle that expands and collapses the dock (task L2, Req 34.3). The same in both states and in both apps. */
  toggle: "Coming up",
  /** In the collapsed bar only (Req 34.11). */
  hint: "Drag to look ahead",
  /** The screen-reader list of every marker (Req 34.6). */
  markerList: "Who fades and goes dark next",
  /** A marker's short label (Req 34.6): "Mira Castell starts fading in 12 days". */
  fadesIn: (name: string, n: number) => `${name} starts fading in ${days(n)}`,
  /** A marker's short label (Req 34.6): "Mira Castell goes dark in 12 days". */
  darkIn: (name: string, n: number) => `${name} goes dark in ${days(n)}`,
} as const

/** The forecast control (task 5.2, Req 22). */
export const forecastText = {
  title: "Forecast",
  horizonLabel: "Look ahead",
  horizon: (n: number) => days(n),
  /** "<name> goes dark on <date>" (Req 22.2). */
  entry: (name: string, date: string) => `${name} goes dark on ${date}`,
  /** Req 22.3. */
  nobody: (n: number) => `Nobody goes dark in the next ${days(n)}.`,
} as const

/** Back up and restore (task 5.3, Req 21.2-21.4). The refusal reasons are backupRefusals. */
export const backupText = {
  backUp: "Back up",
  restore: "Restore",
  fileName: (isoDate: string) => `ghosted-backup-${isoDate}.json`,
  nothing: "There is nothing to back up yet.",
  saved: (fileName: string) => `Backup saved as ${fileName}.`,
  /** Before anything is replaced (design section 9.3). */
  confirm: (n: number) =>
    `Replace your street with ${n === 1 ? "1 person" : `${n} people`} from this file? This cannot be undone.`,
  confirmLabel: "Replace my street",
} as const

/** The import dialog (task 5.3, Req 21.5, 21.6). The format and the defaults are importText. */
export const importDialogText = {
  open: "Import people",
  title: "Import people",
  label: "People, one per line",
  placeholder: "Mira Castell | Cousin | 30 | 2023-10-02",
  ready: (n: number) =>
    n === 0 ? "No valid lines yet." : n === 1 ? "1 person ready to import." : `${n} people ready to import.`,
  /** One skipped line (Req 21.6). */
  skipped: (line: number, reason: string) => `Line ${line}: ${reason}`,
  submit: "Import",
  /** Announced by the App after an import. */
  imported: (n: number) => (n === 1 ? "1 person was added to the street." : `${n} people were added to the street.`),
  /** After a storage problem part-way (design section 9.2). */
  stopped: (added: number) =>
    `Stopped after ${added === 1 ? "1 person" : `${added} people`}. The lines not yet added are still here.`,
} as const

/**
 * Live state changes (task L3, Req 38, design section 15.4): the short
 * message after a minute tick moved windows on its own. A window "starts to
 * flicker" or "goes dark"; never "die" or "dead" for a person, and nothing
 * that blames either person. `kind` is from live-changes.ts.
 */
export type LiveKind = "flicker" | "dark" | "darkFromLit"

const liveVerb: Readonly<Record<LiveKind, string>> = {
  flicker: "started to flicker",
  dark: "went dark",
  darkFromLit: "went from lit to dark",
}

export const liveText = {
  /** One window: "Mira Castell's window started to flicker." */
  one: (kind: LiveKind, name: string) => `${name}'s window ${liveVerb[kind]}.`,
  /**
   * Two windows, the more important first. The same kind of change (a lit to
   * dark one counts as going dark): "Mira Castell's and Dan Okafor's windows
   * went dark." Two kinds: "Mira Castell's window went dark and Dan
   * Okafor's started to flicker."
   */
  two: (first: { kind: LiveKind; name: string }, second: { kind: LiveKind; name: string }) => {
    const group = (kind: LiveKind) => (kind === "flicker" ? "flicker" : "dark")
    if (group(first.kind) === group(second.kind)) {
      const verb = group(first.kind) === "flicker" ? liveVerb.flicker : liveVerb.dark
      return `${first.name}'s and ${second.name}'s windows ${verb}.`
    }
    return `${first.name}'s window ${liveVerb[first.kind]} and ${second.name}'s ${liveVerb[second.kind]}.`
  },
  /**
   * Three or more windows, naming the most important one: "3 windows started
   * to flicker, Mira Castell's among them." `flicker` and `dark` are counts.
   */
  many: (flicker: number, dark: number, name: string) => {
    const windows = (n: number) => (n === 1 ? "1 window" : `${n} windows`)
    if (dark === 0) return `${windows(flicker)} ${liveVerb.flicker}, ${name}'s among them.`
    if (flicker === 0) return `${windows(dark)} ${liveVerb.dark}, ${name}'s among them.`
    return `${windows(flicker)} ${liveVerb.flicker} and ${dark} ${liveVerb.dark}, ${name}'s among them.`
  },
  /** The message's only control. */
  dismiss: "Dismiss",
  /** The tab title while the tab was hidden: "(2) Ghosted", "(9+) Ghosted" (Req 38.6). */
  title: (count: number, base: string) => (count <= 0 ? base : `(${count > 9 ? "9+" : count}) ${base}`),
} as const

/**
 * Notifications while the tab is open (task L5, Req 39, design section 16.4).
 * The notification itself uses appText.name as its title and the liveText
 * sentence as its body, so no sentence about a window is written here. No
 * "die" or "dead", and no guilt words.
 */
export const notifyText = {
  label: "Notify me about changes while this tab is open",
  /** The switch's visible state word. */
  stateOn: "On",
  stateOff: "Off",
  /** The setting box's accessible name. */
  region: "Notifications",
  unsupported: "This browser cannot show notifications, so this setting is not available here.",
  on: "On: when a window changes while this tab is in the background, your browser shows a notification.",
  denied: "Your browser blocks notifications for this page; to allow them, open the site settings by the address bar.",
  blocked:
    "This is on, but your browser is blocking notifications for this page, so none are shown; allow them in the site settings by the address bar, or turn this off.",
  notSaved: "This choice cannot be saved in this browser, so it lasts until the page is closed.",
  /** The honest limit (Req 39.3). */
  limit: "There is no server, so nothing can notify you when this tab is closed or the computer is asleep.",
  /** Privacy (Req 39.9). */
  privacy: "A notification shows only what is already on this page, and nothing is sent anywhere.",
} as const

/** The first ten seconds (task L6, Req 40, design section 17.5). */
export const firstLookText = {
  /** The one button while the first look plays. */
  skip: "Skip the preview",
  /** Said once, through the live region, when it starts (Req 40.9). */
  announce: "Showing the next 30 days. Nothing is saved.",
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

export const wispText = {
  name: "Wisp",
  firstRun: [
    "Boo! I'm Wisp. Load the sample street and I'll show you around.",
    "Psst. Load the sample street. I've been lonely out here.",
  ],
  empty: [
    "An empty street. Even I find that spooky. Add a person to light a window.",
    "No windows yet. Add someone you'd like to keep in touch with.",
  ],
  lit: [
    "Every window is lit. Suspiciously cosy. Drag the moon to peek ahead.",
    "All lit. I've got nothing to haunt. Drag the moon and see who fades first.",
  ],
  fading: [
    "A few windows are flickering. One message fixes that. Tap Reach out.",
    "Flicker, flicker. Somebody's light is low. Reach out while it's warm.",
    "I can see a window going dim. A two-line text counts. Reach out.",
  ],
  grim: [
    "Okay, now it's properly spooky out here. Try a Séance: pick a few minutes below.",
    "So many dim windows. Start small: reach out to the first one.",
  ],
  dark: [
    "Some windows went dark. Read the autopsy, then decide if you'd like to reconnect.",
    "Boarded-up windows can be opened again. Look at the empty windows.",
  ],
  previewCalm: [
    "Peeking into the future, are we? It looks fine so far. Drag further.",
    "Nothing changes while you look ahead. Keep dragging, I dare you.",
  ],
  previewUneasy: [
    "Ooh, the street is getting dim out there. Back to today to fix it.",
    "See the flicker spreading? That's the street if you do nothing. Back to today.",
  ],
  previewDark: [
    "Ooh. Windows went dark in this future. Spooky. Fixable, though: back to today.",
    "That's what silence looks like. Go back to today and reach out first.",
  ],
} as const

/** The haunt pass's other words (Req 3-9). */
export const hauntText = {
  /** The street pulse under the hero heading, said in words as well as drawn. */
  pulseLabel: "Street pulse",
  pulse: { calm: "steady", uneasy: "uneasy", grim: "faint" },
  /** The reconnect ritual's stamp (Req 4.1). */
  litAgainStamp: "Lit again",
  spooky: {
    label: "Spooky level",
    haunted: "Haunted",
    calm: "Calm",
    help: "Calm turns off lightning, the flashlight and the drifting extras. Windows still flicker and go dark.",
    notSaved: "This choice cannot be saved in this browser, so it lasts until the page is closed.",
  },
  sound: {
    label: "Sound",
    help: "Soft sounds when a window lights or goes dark. Made in your browser; off until you turn it on.",
  },
  share: {
    button: "Share a card",
    names: "Include first names",
    title: "My street tonight",
    privacy: "Made on your device. Nothing is uploaded.",
    footer: "Ghosted · built on Decay Engine",
    made: "Your street card is downloading.",
    failed: "This browser could not make the card.",
  },
} as const

/** The top-right buttons and the two sheets (feedback list, points 7, 17, 20 and 21). */
export const topBarText = {
  label: "Menu",
  home: "Home",
  settings: "Settings",
  sync: "Sync",
  syncHint: "Sync across devices",
  profile: "Profile",
  signedInAs: (email: string) => `Signed in as ${email}`,
  settingsTitle: "Settings",
  profileTitle: "Profile",
  close: "Close",
  syncOff: "Sync is not set up for this copy of Ghosted. Everything stays in this browser.",
  activityTitle: "Activity",
  activityNote: "Every change, newest first. Once you sync, this includes your other devices.",
  activityEmpty: "Nothing has happened yet.",
} as const

/**
 * The activity history (feedback list, point 17): one line per history entry.
 * A window flickers, goes dark or is lit again; never "die" or "dead", and
 * nothing that blames either person.
 */
export const activityText = {
  created: (name: string) => `Added ${name}`,
  contact: (name: string, kind: ContactKind | undefined) =>
    kind === "call" ? `Had a call with ${name}` : kind === "meetup" ? `Met up with ${name}` : `Sent ${name} a message`,
  flicker: (name: string) => `${name}'s window started to flicker`,
  lit: (name: string) => `${name}'s window is lit again`,
  dark: (name: string) => `${name}'s window went dark`,
  reconnected: (name: string) => `Reconnected with ${name}`,
  reconnectFailed: (name: string) => `A reconnect with ${name} did not go through`,
  edited: (name: string) => `Edited ${name}`,
  removedPerson: "someone since removed",
} as const

/** The (i) notes beside the person form's fields (feedback list, point 13). */
export const fieldHelpText = {
  importance:
    "How much keeping in touch with this person matters to you: 1 a little, 3 a lot. When time is short, Triage suggests the important ones first.",
  cost: "About how many minutes reaching out usually takes: a quick message, or a long call. Triage uses it to fit people into the time you have.",
  rhythm: "How often you are usually in touch. The window starts to flicker a little after this many days with no contact.",
  show: (field: string) => `What is ${field.toLowerCase()}?`,
} as const

/** The tabs over the three lists (feedback list, point 23). */
export const tabsText = {
  label: "Lists",
} as const

/** The moon-clock bar's own buttons (feedback list, points 16 and 22). */
export const barText = {
  backToNow: "Back to now",
} as const

/** Opening a person from a Life Triage link, `?tend=<id>` (feedback list, point 6). */
export const tendLinkText = {
  missing: "That person is not on this device.",
} as const

/** The "?" help tour (Nov 28): one part of the page lit at a time, with what to do there. */
export const helpTourText = {
  wording: {
    open: "Show me around",
    next: "Next",
    back: "Back",
    done: "Done",
    progress: "Step {n} of {total}",
  },
  steps: [
    { selector: ".gh-topbar", title: "The top bar", text: "Home goes to the landing page. Settings holds notifications, backup, restore and reset. Sync keeps your people on all your devices." },
    { selector: ".gh-hero", title: "Who needs you first", text: "This names the window that is fading fastest. Press the button to reach out to them." },
    { selector: ".gh-street", title: "Your street", text: "Each house is a person. A lit window is someone you have kept in touch with; a dark one is fading." },
    { selector: ".gh-toolbar", title: "Add a person", text: "Add someone, say how often you want to be in touch, and Ghosted tells you when they start to fade." },
    { selector: ".gh-tabs", title: "Three lists", text: "Fading, Empty windows and Still lit: switch between them to see who is where." },
    { selector: ".gh-dock", title: "Moon clock", text: "Drag the slider or press Play to see who will fade in the next year. Nothing is saved while you look. Use Back to now to return." },
  ],
} as const
