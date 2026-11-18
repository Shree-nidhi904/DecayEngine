import { describe, it, expect } from "vitest"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import { DecayEngineError as PublicDecayEngineError } from "../../src/index"

// Every code in the DecayEngineErrorCode union. `as const satisfies` keeps the
// literal types so the exhaustiveness check below can see which codes are listed,
// while still rejecting any string that is not a real code.
const ALL_CODES = [
  "MISSING_POLICY",
  "MISSING_STORAGE_ADAPTER",
  "MISSING_ID_GENERATOR",
  "INVALID_THRESHOLDS",
  "INVALID_TIMESTAMP",
  "INVALID_HEALTH",
  "INVALID_ID",
  "DUPLICATE_ID",
  "ITEM_NOT_FOUND",
  "ITEM_ALREADY_DEAD",
  "ITEM_NOT_DEAD",
  "TIME_WENT_BACKWARD",
  "UNSUPPORTED_SCHEMA_VERSION",
  "INVALID_SNAPSHOT",
  "INVALID_ITEM_DATA",
  "INVALID_BUDGET",
  "INVALID_HORIZON",
  "AUTOPSY_REQUIRES_DEAD_ITEM",
  "INVALID_IMPORTANCE",
  "INVALID_COST_MINUTES",
  "EDIT_REQUIRES_FIELD",
  "STORAGE_UNAVAILABLE",
  "INVALID_POLICY_RESULT",
] as const satisfies readonly DecayEngineErrorCode[]

// Compile-time check: if a code is added to the union but not to ALL_CODES,
// MissingCodes is not never, the type below becomes never, and assigning true fails.
type MissingCodes = Exclude<DecayEngineErrorCode, (typeof ALL_CODES)[number]>
const allCodesListed: [MissingCodes] extends [never] ? true : never = true
void allCodesListed

describe("DecayEngineError", () => {
  const message = "tend(item-7): item does not exist"
  const err = new DecayEngineError("ITEM_NOT_FOUND", message)

  it("keeps the given message unchanged", () => {
    expect(err.message).toBe(message)
  })

  it("has name DecayEngineError", () => {
    expect(err.name).toBe("DecayEngineError")
  })

  it("formats as '<name>: <message>' when converted to a string", () => {
    expect(String(err)).toBe(`DecayEngineError: ${message}`)
    expect(err.toString()).toBe(`DecayEngineError: ${message}`)
  })

  it("has a stack trace string", () => {
    expect(typeof err.stack).toBe("string")
    expect(err.stack).toContain(message)
  })

  it("exposes the given code", () => {
    expect(err.code).toBe("ITEM_NOT_FOUND")
  })

  it("is an instance of DecayEngineError and Error", () => {
    expect(err).toBeInstanceOf(DecayEngineError)
    expect(err).toBeInstanceOf(Error)
  })

  it("can be caught by class and by message when thrown", () => {
    const thrower = () => {
      throw new DecayEngineError("TIME_WENT_BACKWARD", "tick: now 5 is before lastEventAt 10")
    }
    expect(thrower).toThrow(DecayEngineError)
    expect(thrower).toThrowError("tick: now 5 is before lastEventAt 10")
  })

  it("does not treat a plain Error as a DecayEngineError", () => {
    expect(new Error("plain")).not.toBeInstanceOf(DecayEngineError)
  })

  it("is the same class when imported from the public index", () => {
    expect(PublicDecayEngineError).toBe(DecayEngineError)
    expect(new PublicDecayEngineError("INVALID_ID", "x")).toBeInstanceOf(DecayEngineError)
  })
})

describe("DecayEngineError codes", () => {
  it("lists 23 distinct codes", () => {
    expect(ALL_CODES).toHaveLength(23)
    expect(new Set(ALL_CODES).size).toBe(23)
  })

  it.each(ALL_CODES)("can be created with code %s", (code) => {
    const msg = `test message for ${code}`
    const e = new DecayEngineError(code, msg)
    expect(e.code).toBe(code)
    expect(e.message).toBe(msg)
    expect(e.name).toBe("DecayEngineError")
    expect(e).toBeInstanceOf(DecayEngineError)
    expect(e).toBeInstanceOf(Error)
  })
})
