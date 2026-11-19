// What the App does with an error from a write (task 18.3): addItem, edit,
// tend, resurrect, remove, loading the sample data, and the first-run flag.
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
