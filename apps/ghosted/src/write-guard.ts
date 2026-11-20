// Copied from apps/study-dungeon/src/write-guard.ts (Ghosted design
// section 1.3). reportWriteError and runWrite are unchanged. Added:
// runGatedWrite, the single gate every write goes through (design section
// 4.2). No import from apps/study-dungeon (Req 21.1).
//
// A storage problem (classifyWriteError: quota full, storage unavailable) is
// reported, so the App can show storageProblemText in its live region and
// keep working: the engine guarantees a failed save changes nothing.
// Anything else is a bug and is rethrown, never hidden.

import { classifyWriteError, type WriteProblem } from "./storage-errors"

/** Reports a storage problem and returns true; returns false for any other error. */
export function reportWriteError(error: unknown, onProblem: (problem: WriteProblem) => void): boolean {
  const problem = classifyWriteError(error)
  if (problem === null) return false
  onProblem(problem)
  return true
}

/**
 * Runs one write. Returns true when it finished, false when it failed with a
 * storage problem (already reported). Rethrows every other error.
 */
export function runWrite(write: () => void, onProblem: (problem: WriteProblem) => void): boolean {
  try {
    write()
    return true
  } catch (error) {
    if (reportWriteError(error, onProblem)) return false
    throw error
  }
}

export type WriteOutcome = "saved" | "blocked" | "storage-problem"

/**
 * The only way the App writes. While previewing, returns "blocked" without
 * calling `write`. Otherwise runs it through runWrite: "saved", or
 * "storage-problem" (already reported through onProblem). Other errors are rethrown.
 */
export function runGatedWrite(
  previewing: boolean,
  write: () => void,
  onProblem: (problem: WriteProblem) => void
): WriteOutcome {
  if (previewing) return "blocked"
  return runWrite(write, onProblem) ? "saved" : "storage-problem"
}
