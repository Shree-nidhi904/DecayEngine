// Policy Lab's words, in one place so tests can check them (extensions spec,
// Requirements 5.12, 7, 8 and 15.2). Plain and short; no claim that
// checkPolicy proves a policy right.

import { LAB_COST_MINUTES, LAB_IMPORTANCE, MAX_FAILURES_SHOWN, MAX_LAB_DAYS } from "./lab"

function weakDay(day: number | null): string {
  return day === null ? "never weak in this window" : `weak on day ${day}`
}

function deadDay(day: number | null): string {
  return day === null ? "still alive at the end" : `dead on day ${day}`
}

export const labText = {
  title: "Policy Lab",
  lede:
    "The engine knows nothing about milk, facts or friends. Write the decay rules below and the real engine runs them, unchanged.",
  /** What checkPolicy covers, and what it does not (Requirement 5.12). */
  checks:
    "checkPolicy checks the thresholds, init, and the health curve (0 to 100, the same answer twice, never rising) at nine times up to 10 years. It does not check nextDueAt or resurrect.",
  /** Shown above the editor and linked to it (Requirement 7). */
  warning:
    "This text runs as JavaScript in this tab, with this page's access, every time you change it. Paste only code you trust. " +
    "Code you paste can make network requests; this page makes none. There is no time limit, so an endless loop freezes the tab.",
  /** The run's fixed settings and ranges (Requirement 15.2). */
  limits:
    `The item has importance ${LAB_IMPORTANCE} and costs ${LAB_COST_MINUTES} minutes. checkPolicy runs with the one payload and event above. ` +
    `Tend on day 0 to ${MAX_LAB_DAYS}; show 1 to ${MAX_LAB_DAYS} days. At most ${MAX_FAILURES_SHOWN} problems are listed.`,
  editorLabel: "Policy (JavaScript object; DAY is one day in ms)",
  presetsLabel: "Example policies",
  payloadLabel: "Item payload (JSON)",
  eventLabel: "Event, like a review or a message (JSON)",
  tendLabel: "Tend on day",
  horizonLabel: "Show days",
  passed: "checkPolicy: passed",
  problems: (n: number) => `checkPolicy: ${n} problem${n === 1 ? "" : "s"}`,
  more: (n: number) => `…and ${n} more`,
  tendFailed: (message: string) => `Tend failed: ${message}`,
  weakLine: (h: number) => `weak below ${h}`,
  deadLine: (h: number) => `dead below ${h}`,
  states: { alive: "alive", weak: "weak", dead: "dead" },
  weakDay,
  deadDay,
  /** The chart's accessible name: a summary of the curve. */
  chartSummary: (lastDay: number, weak: number | null, dead: number | null): string =>
    `Health of one item from day 0 to day ${lastDay}: ${weakDay(weak)}, ${deadDay(dead)}.`,
} as const
