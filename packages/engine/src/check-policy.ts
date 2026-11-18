// Policy test kit: checks a DecayPolicy against the policy contract.
// Source of truth: .kiro/specs/engine/design.md (checkPolicy) and
// .kiro/specs/engine/requirements.md (Requirement 17e).
//
// Never throws: every problem, including a policy function that throws,
// is reported as a failure string "<check name>: <description>".
// Never reads the clock and uses no randomness: items and timestamps are
// built only from the samples and startTime.

import { MAX_TIMESTAMP } from "./engine"
import { clampHealth, deriveState, validateThresholds } from "./state-derivation"
import type { DecayPolicy, Item } from "./types"

// Check names used as the prefix of each failure string (Requirement 17e.7)
const CHECK_INPUTS = "inputs"
const CHECK_BUILD = "build-items"
const CHECK_RANGE = "healthAt-range"
const CHECK_PURE = "healthAt-pure"
const CHECK_NEVER_INCREASES = "healthAt-never-increases"
const CHECK_INIT_JSON = "init-json"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Times after startTime at which healthAt is sampled, in ascending order.
// They span from creation to 10 years (the engine's forecast horizon).
const SAMPLE_OFFSETS_MS = [
  0,
  MINUTE,
  HOUR,
  DAY,
  7 * DAY,
  30 * DAY,
  90 * DAY,
  365 * DAY,
  3650 * DAY,
]

type TestItem<Payload, PolicyData> = {
  label: string
  item: Item<Payload, PolicyData>
}

type CallResult<T> = { ok: true; value: T } | { ok: false; error: string }

function call<T>(fn: () => T): CallResult<T> {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: describeError(error) }
  }
}

function describeError(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return "unknown error"
  }
}

function describeValue(value: unknown): string {
  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : String(value)
  }
  if (typeof value === "string") return JSON.stringify(value)
  if (value === null) return "null"
  return typeof value
}

function isValidHealth(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 100
}

function isComparableNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value)
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function kindOf(value: object): string {
  if (Array.isArray(value)) return "array"
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto === null || proto === Object.prototype) return "object"
  const ctor = (proto as { constructor?: { name?: unknown } }).constructor
  return typeof ctor?.name === "string" && ctor.name !== "" ? `${ctor.name} object` : "non-plain object"
}

// Compares a value with its JSON round-trip. Returns null when nothing was
// lost, otherwise a description of the first difference found.
function findJsonLoss(original: unknown, parsed: unknown, path: string): string | null {
  if (typeof original === "number") {
    return Object.is(original, parsed)
      ? null
      : `${path} is ${describeValue(original)}, which JSON turns into ${describeValue(parsed)}`
  }
  if (original === null || typeof original === "string" || typeof original === "boolean") {
    return original === parsed ? null : `${path} changed in the JSON round-trip`
  }
  if (typeof original !== "object") {
    // undefined, function, symbol, bigint
    return `${path} is ${typeof original}, which JSON cannot represent`
  }

  if (Object.getOwnPropertySymbols(original).length > 0) {
    return `${path} has symbol keys, which JSON drops`
  }

  if (Array.isArray(original)) {
    if (!Array.isArray(parsed) || parsed.length !== original.length) {
      return `${path} array changed in the JSON round-trip`
    }
    if (Object.keys(original).length !== original.length) {
      return `${path} array has empty slots or extra properties, which JSON does not keep`
    }
    for (let i = 0; i < original.length; i++) {
      const loss = findJsonLoss(original[i], parsed[i], `${path}[${i}]`)
      if (loss !== null) return loss
    }
    return null
  }

  if (!isPlainObject(original)) {
    return `${path} is a ${kindOf(original)}, not a plain object`
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return `${path} changed in the JSON round-trip`
  }

  const source = original as Record<string, unknown>
  const copy = parsed as Record<string, unknown>
  const keys = Object.keys(source)
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(copy, key)) {
      return `${path}.${key} is ${describeValue(source[key])}, which JSON drops`
    }
    const loss = findJsonLoss(source[key], copy[key], `${path}.${key}`)
    if (loss !== null) return loss
  }
  if (Object.keys(copy).length !== keys.length) {
    return `${path} has different keys after the JSON round-trip`
  }
  return null
}

// Returns null if `value` survives JSON.stringify then JSON.parse unchanged.
function checkJsonRoundTrip(value: unknown, path: string): string | null {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch (error) {
    return `${path} cannot be converted to JSON: ${describeError(error)}`
  }
  if (text === undefined) {
    return `${path} is ${describeValue(value)}, which JSON cannot represent`
  }
  return findJsonLoss(value, JSON.parse(text) as unknown, path)
}

/**
 * Checks a policy against the contract (Requirement 17e).
 *
 * Test items: for each sample payload, the item addItem would store at
 * startTime (importance 1, costMinutes 1), and for each sample event, that item
 * after tend applied the event at startTime. Dead items are left out of the
 * healthAt checks, because the engine never asks healthAt about a dead item.
 *
 * Timestamps: startTime plus each offset in SAMPLE_OFFSETS_MS (0 to 10 years),
 * leaving out any past the largest valid timestamp.
 *
 * @param policy - The policy to check.
 * @param samplePayloads - At least one payload to build test items from.
 * @param sampleEvents - Events to apply to each test item (may be empty).
 * @param startTime - Creation time of the test items, in milliseconds.
 * @returns `passed` is true when there are no failures. Each failure is
 *   "<check name>: <description>". Never throws, even if the policy throws.
 */
export function checkPolicy<Payload, PolicyData, Event>(
  policy: DecayPolicy<Payload, PolicyData, Event>,
  samplePayloads: Payload[],
  sampleEvents: Event[],
  startTime: number
): { passed: boolean; failures: string[] } {
  const failures: string[] = []
  const fail = (check: string, description: string): void => {
    failures.push(`${check}: ${description}`)
  }
  const report = () => ({ passed: failures.length === 0, failures })

  // Inputs
  if (typeof policy !== "object" || policy === null) {
    fail(CHECK_INPUTS, "policy is missing")
    return report()
  }
  if (
    typeof startTime !== "number" ||
    !Number.isFinite(startTime) ||
    startTime < 0 ||
    startTime > MAX_TIMESTAMP
  ) {
    fail(
      CHECK_INPUTS,
      `startTime ${describeValue(startTime)} is not a finite number from 0 to ${MAX_TIMESTAMP}`
    )
  }
  if (!Array.isArray(samplePayloads) || samplePayloads.length === 0) {
    fail(CHECK_INPUTS, "samplePayloads must be a non-empty array")
  }
  if (!Array.isArray(sampleEvents)) {
    fail(CHECK_INPUTS, "sampleEvents must be an array")
  }
  const thresholdsCheck = call(() => {
    const thresholds: unknown = policy.thresholds
    if (typeof thresholds !== "object" || thresholds === null) {
      throw new Error("policy.thresholds must be an object with weak and dead")
    }
    validateThresholds(policy.thresholds)
    return { weak: policy.thresholds.weak, dead: policy.thresholds.dead }
  })
  if (!thresholdsCheck.ok) {
    fail(CHECK_INPUTS, `invalid thresholds: ${thresholdsCheck.error}`)
  }
  if (failures.length > 0 || !thresholdsCheck.ok) {
    return report()
  }
  const thresholds = thresholdsCheck.value

  const timestamps = SAMPLE_OFFSETS_MS.map((offset) => startTime + offset).filter(
    (t) => t <= MAX_TIMESTAMP
  )

  // init returns JSON-serializable data; build the test items
  const testItems: TestItem<Payload, PolicyData>[] = []

  samplePayloads.forEach((payload, p) => {
    const payloadLabel = `payload[${p}]`

    const initResult = call(() => policy.init(payload, startTime))
    if (!initResult.ok) {
      fail(CHECK_INIT_JSON, `init threw for ${payloadLabel}: ${initResult.error}`)
      return
    }
    const loss = checkJsonRoundTrip(initResult.value, `init(${payloadLabel})`)
    if (loss !== null) {
      fail(CHECK_INIT_JSON, loss)
    }

    // The item addItem would store (same steps as DecayEngine.addItem)
    const provisional: Item<Payload, PolicyData> = {
      id: `check-${p}`,
      payload,
      policyData: initResult.value,
      health: 100,
      state: "alive",
      createdAt: startTime,
      lastEventAt: startTime,
      timesResurrected: 0,
      importance: 1,
      costMinutes: 1,
    }
    const starting = call(() =>
      clampHealth(policy.healthAt(provisional, startTime), "healthAt")
    )
    if (!starting.ok) {
      fail(CHECK_BUILD, `could not create the item for ${payloadLabel}: ${starting.error}`)
      return
    }
    const base: Item<Payload, PolicyData> = {
      ...provisional,
      health: starting.value,
      state: deriveState(starting.value, thresholds),
    }
    if (base.state === "dead") {
      // Starts dead: the engine never calls healthAt on it again
      return
    }
    testItems.push({ label: payloadLabel, item: base })

    // The same item after tend applied each sample event at startTime
    sampleEvents.forEach((event, e) => {
      const label = `${payloadLabel} after event[${e}]`
      const applied = call(() => {
        const result = policy.applyEvent(base, event, startTime)
        return {
          health: clampHealth(result?.health, "applyEvent"),
          policyData: result.policyData,
        }
      })
      if (!applied.ok) {
        fail(CHECK_BUILD, `could not apply event for ${label}: ${applied.error}`)
        return
      }
      const state = deriveState(applied.value.health, thresholds)
      if (state === "dead") {
        // Killed by the event: the engine never calls healthAt on it again
        return
      }
      testItems.push({
        label,
        item: {
          ...base,
          id: `check-${p}-event-${e}`,
          policyData: applied.value.policyData,
          health: applied.value.health,
          state,
          lastEventAt: startTime,
        },
      })
    })
  })

  // healthAt: range, purity, and never increasing between events
  for (const { label, item } of testItems) {
    let previous: { time: number; health: number } | null = null

    for (const t of timestamps) {
      const at = `${label} at startTime + ${t - startTime} ms`

      const first = call(() => policy.healthAt(item, t))
      if (!first.ok) {
        fail(CHECK_RANGE, `healthAt threw for ${at}: ${first.error}`)
        continue
      }
      const second = call(() => policy.healthAt(item, t))

      if (!isValidHealth(first.value)) {
        fail(
          CHECK_RANGE,
          `healthAt returned ${describeValue(first.value)} for ${at}; expected a number from 0 to 100`
        )
      }

      if (!second.ok) {
        fail(CHECK_PURE, `healthAt threw on the second call for ${at}: ${second.error}`)
      } else if (!Object.is(first.value, second.value)) {
        fail(
          CHECK_PURE,
          `healthAt returned ${describeValue(first.value)} then ${describeValue(second.value)} for ${at}`
        )
      }

      if (isComparableNumber(first.value)) {
        if (previous !== null && first.value > previous.health) {
          fail(
            CHECK_NEVER_INCREASES,
            `healthAt rose from ${describeValue(previous.health)} at startTime + ` +
              `${previous.time - startTime} ms to ${describeValue(first.value)} at ` +
              `startTime + ${t - startTime} ms for ${label}`
          )
        }
        previous = { time: t, health: first.value }
      }
    }
  }

  return report()
}
