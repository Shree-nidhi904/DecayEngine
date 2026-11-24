// Life Triage's words and limits, in one place so tests can check them
// (extensions spec, Requirements 10, 12 and 15.3 to 15.5).
// Ghosted's wording rules apply to every row with a person on it: connection
// freshness, "goes dark", never "dies" or "dead", and nothing that blames
// either person.

import { MAX_LIFE_BUDGET_MINUTES, type LifeCandidate } from "@decay-engine/life-triage"
import { FRIENDS } from "./load"

const DAY = 86_400_000

/** The furthest the page looks ahead, in days. */
export const MAX_AHEAD_DAYS = 365

export const ltText = {
  title: "Life Triage",
  lede:
    "One time budget for everything that is fading: facts and friends together. Study Dungeon and Ghosted keep your data in " +
    "separate browser storage, so export a backup from each and load them here. Nothing is uploaded; the files are read in this page.",
  limits:
    `Budget 1 to 1,440 minutes. Look ahead 0 to ${MAX_AHEAD_DAYS} days. Backups up to version 1; one file per app, and a later file ` +
    "replaces an earlier one. Study Dungeon backups are read with its default rules (each right answer doubles the half-life), " +
    "even if you chose the memory model there. Anything more than 10 years away shows as not within 10 years.",
  loadFiles: "Load backup files",
  sample: "Use sample data",
  sampleLoaded: "Sample facts and people",
  budgetLabel: "I have (minutes)",
  aheadLabel: "Looking ahead (days)",
  begin: "Load a backup or use the sample data to begin.",
  doThese: "Do these",
  leftToFade: "Left to fade",
  nothingWeak: "Nothing is fading yet at this time.",
  budgetNote: (minutes: number) => `Using ${minutes} ${minutes === 1 ? "minute" : "minutes"} (1 to 1,440).`,
  aheadNote: (days: number) => `Using ${days} ${days === 1 ? "day" : "days"} ahead (0 to ${MAX_AHEAD_DAYS}).`,
  unreadable: (file: string) => `${file}: this file could not be read.`,
  loaded: (file: string, label: string, count: number, replaces: boolean) =>
    `${file}: ${label}, ${count} item${count === 1 ? "" : "s"}${replaces ? " (replaces the earlier file)" : ""}`,
  refused: (file: string, reason: string) => `${file}: ${reason}`,
} as const

/** The budget the page uses for a typed value, and a note when it is not what was typed. */
export function clampBudget(raw: number): { minutes: number; note: string | null } {
  const minutes = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), MAX_LIFE_BUDGET_MINUTES) : 1
  return { minutes, note: minutes === raw ? null : ltText.budgetNote(minutes) }
}

/** The look-ahead the page uses for a typed value, and a note when it is not what was typed. */
export function clampAhead(raw: number): { days: number; note: string | null } {
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 0), MAX_AHEAD_DAYS) : 0
  return { days, note: days === raw ? null : ltText.aheadNote(days) }
}

/** A row's name: the fact's question or the person's name. */
export function nameOf(c: LifeCandidate): string {
  const p = c.payload as { question?: string; name?: string }
  return p.question ?? p.name ?? c.id
}

const isPerson = (c: LifeCandidate) => c.source === FRIENDS

/** When the item is lost: "goes dark in 3 days" for a person, "dies in 3 days" for a fact. */
export function fateOf(c: LifeCandidate, now: number): string {
  const verb = isPerson(c) ? "goes dark" : "dies"
  if (c.diesAt === null) return isPerson(c) ? "not going dark within 10 years" : "not dying within 10 years"
  const days = Math.max(0, Math.ceil((c.diesAt - now) / DAY))
  return days === 0 ? `${verb} today` : days === 1 ? `${verb} tomorrow` : `${verb} in ${days} days`
}

/** The muted detail after a row's name. Picks also show health (freshness for a person). */
export function detailOf(c: LifeCandidate, now: number, picked: boolean): string {
  const level = picked ? ` · ${isPerson(c) ? "freshness" : "health"} ${c.health.toFixed(0)}` : ""
  return `${c.costMinutes} min${level} · ${fateOf(c, now)}`
}
