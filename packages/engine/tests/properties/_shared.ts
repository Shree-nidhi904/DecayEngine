// Helpers shared by the property tests (not a test file).
import { expect } from "vitest"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"

export const RUNS = { numRuns: 100 }

export function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code }))
}
