// Policy Lab logic: compile a policy written in the browser, check it with the
// engine's checkPolicy, and run it on the real DecayEngine over simulated time.
// Pure and clock-free: every time is passed in. Nothing here touches the engine's code.

import { DecayEngine, InMemoryAdapter, checkPolicy, type DecayPolicy } from "@decay-engine/engine"

export const DAY = 86_400_000
/** Fixed start so a run is reproducible. */
export const T0 = Date.UTC(2026, 0, 1)

export type LabPolicy = DecayPolicy<unknown, unknown, unknown>

export type Sample = { day: number; health: number; state: "alive" | "weak" | "dead" }

/** The lab item's fixed importance and cost (stated on the page, Requirement 15.2). */
export const LAB_IMPORTANCE = 2
export const LAB_COST_MINUTES = 5
/** Longest window, in days, and the last day a tend can be set on. */
export const MAX_LAB_DAYS = 730
/** How many checkPolicy problems the page lists before "…and N more". */
export const MAX_FAILURES_SHOWN = 5

/** A whole number of days shown, from 1 to MAX_LAB_DAYS (anything else is clamped; NaN gives 1). */
export function clampHorizon(days: number): number {
  return Number.isFinite(days) ? Math.min(Math.max(Math.floor(days), 1), MAX_LAB_DAYS) : 1
}

/** A tend day from 0 to MAX_LAB_DAYS, or null for never (an empty or non-number input). */
export function clampTendDay(days: number | null): number | null {
  if (days === null || !Number.isFinite(days)) return null
  return Math.min(Math.max(Math.floor(days), 0), MAX_LAB_DAYS)
}

export type LabResult =
  | { ok: false; error: string }
  | {
      ok: true
      /** The compiled policy's thresholds, for the chart's weak and dead lines. */
      thresholds: { weak: number; dead: number }
      check: { passed: boolean; failures: string[] }
      series: Sample[]
      weakDay: number | null
      deadDay: number | null
      tendError: string | null
    }

/** Turns the editor text (one object literal) into a policy. `DAY` is in scope. */
export function compilePolicy(source: string): { ok: true; policy: LabPolicy } | { ok: false; error: string } {
  try {
    const policy = new Function("DAY", `"use strict"; return (${source}\n);`)(DAY) as LabPolicy
    if (policy === null || typeof policy !== "object") return { ok: false, error: "The text must be one object, like { thresholds: ..., init() {...} }." }
    for (const k of ["init", "healthAt", "applyEvent", "nextDueAt", "resurrect"] as const) {
      if (typeof policy[k] !== "function") return { ok: false, error: `Missing function: ${k}` }
    }
    if (policy.thresholds === null || typeof policy.thresholds !== "object") return { ok: false, error: "Missing thresholds: { weak, dead }" }
    return { ok: true, policy }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function parseJson(label: string, text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: `${label} is not valid JSON.` }
  }
}

/**
 * Runs the policy: checkPolicy, then one item on a real engine. If tendDay is
 * set, the item is tended with `event` on that day. Samples health once a day.
 */
export function runLab(input: {
  source: string
  payload: string
  event: string
  tendDay: number | null
  horizonDays: number
}): LabResult {
  const compiled = compilePolicy(input.source)
  if (!compiled.ok) return compiled
  const payload = parseJson("Payload", input.payload)
  if (!payload.ok) return payload
  const event = parseJson("Event", input.event)
  if (!event.ok) return event

  const horizon = clampHorizon(input.horizonDays)
  try {
    const check = checkPolicy(compiled.policy, [payload.value], [event.value], T0)
    let n = 0
    const engine = new DecayEngine(compiled.policy, new InMemoryAdapter(), () => `item-${++n}`)
    const id = engine.addItem({ payload: payload.value, importance: LAB_IMPORTANCE, costMinutes: LAB_COST_MINUTES }, T0)
    // The engine has accepted the thresholds (its constructor checks them), so they are numbers here.
    const thresholds = { weak: compiled.policy.thresholds.weak, dead: compiled.policy.thresholds.dead }

    let tendError: string | null = null
    const series: Sample[] = []
    let weakDay: number | null = null
    let deadDay: number | null = null
    for (let day = 0; day <= horizon; day++) {
      const now = T0 + day * DAY
      if (input.tendDay !== null && day === input.tendDay) {
        try {
          engine.tend(id, event.value, now)
        } catch (e) {
          tendError = e instanceof Error ? e.message : String(e)
        }
      }
      const item = engine.view(now).find((i) => i.id === id)!
      series.push({ day, health: item.health, state: item.state })
      if (weakDay === null && item.state !== "alive") weakDay = day
      if (deadDay === null && item.state === "dead") deadDay = day
    }
    return { ok: true, thresholds, check, series, weakDay, deadDay, tendError }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export type Preset = { name: string; blurb: string; source: string; payload: string; event: string; tendDay: number | null }

export const PRESETS: Preset[] = [
  {
    name: "Milk (straight line)",
    blurb: "Loses health evenly over its shelf life. Freezing resets it. Same shape as Ghosted.",
    source: `{
  thresholds: { weak: 40, dead: 10 },
  init: () => ({}),
  // Keep health inside 0 to 100: checkPolicy rejects anything outside.
  healthAt: (item, now) =>
    Math.max(0, item.health - ((now - item.lastEventAt) / (item.payload.shelfLifeDays * DAY)) * 100),
  applyEvent: (item) => ({ health: 60, policyData: item.policyData }),
  nextDueAt: (item) =>
    item.lastEventAt + ((item.health - 40) / 100) * item.payload.shelfLifeDays * DAY,
  resurrect: () => ({ ok: false, reason: "It has gone off." }),
}`,
    payload: '{ "label": "Milk", "shelfLifeDays": 10 }',
    event: '{ "kind": "freeze" }',
    tendDay: 5,
  },
  {
    name: "Fact (half-life)",
    blurb: "Halves every half-life. A review restores it and doubles the half-life. Same shape as Study Dungeon.",
    source: `{
  thresholds: { weak: 50, dead: 15 },
  init: () => ({ halfLifeDays: 3 }),
  healthAt: (item, now) =>
    item.health * Math.pow(0.5, (now - item.lastEventAt) / (item.policyData.halfLifeDays * DAY)),
  applyEvent: (item) => ({
    health: 100,
    policyData: { halfLifeDays: Math.min(180, item.policyData.halfLifeDays * 2) },
  }),
  nextDueAt: (item) =>
    item.lastEventAt +
    Math.log2(item.health / 50) * item.policyData.halfLifeDays * DAY,
  resurrect: (item) => ({ ok: true, policyData: item.policyData }),
}`,
    payload: '{ "front": "Capital of Australia?" }',
    event: '{ "correct": true }',
    tendDay: 2,
  },
  {
    name: "Broken: health rises",
    blurb: "A deliberate bug: it falls, then recovers by itself. checkPolicy should refuse it.",
    source: `{
  thresholds: { weak: 40, dead: 10 },
  init: () => ({}),
  // Falls, then climbs back: health must never rise between events.
  healthAt: (item, now) =>
    item.health * (1 - 0.9 * Math.abs(Math.sin((now - item.lastEventAt) / DAY / 12))),
  applyEvent: (item) => ({ health: 100, policyData: item.policyData }),
  nextDueAt: () => null,
  resurrect: () => ({ ok: true }),
}`,
    payload: '{ "label": "Cursed item" }',
    event: '{ "kind": "poke" }',
    tendDay: null,
  },
]
