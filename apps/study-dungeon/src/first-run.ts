// First run and reset (tasks 11.3 and 11.4, Requirement 13).
//
// First run is shown while the flag "study-dungeon:started" is missing.
// (Checking for zero facts would show it again forever after "Start empty".)
// Both first-run buttons set the flag. The tour (task 11.5) follows first
// run once and sets its own flag. Reset removes exactly this app's engine
// snapshot and both flags, then reloads, so first run and the tour show again.
//
// The storage is injected (the App defaults to window.localStorage), so
// tests use an in-memory fake.

/** Set once the user has chosen "Load sample data" or "Start empty". */
export const STARTED_FLAG = "study-dungeon:started"

/** Where LocalStorageAdapter("study-dungeon") keeps the snapshot (Requirement 14.4). */
export const ENGINE_STORAGE_KEY = "decay-engine:study-dungeon"

/** Set once the first-run tour (task 11.5) has been finished or skipped. */
export const TOUR_DONE_FLAG = "study-dungeon:tour-done"

/**
 * Every key "Reset all data" removes: the snapshot, the first-run flag and
 * the tour flag. The sound setting (sound.ts) is a preference for this
 * browser, not data, so it is kept.
 */
export const RESET_KEYS: readonly string[] = [ENGINE_STORAGE_KEY, STARTED_FLAG, TOUR_DONE_FLAG]

/** The part of Storage the app uses. window.localStorage fits it. */
export type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function hasStarted(storage: FlagStorage): boolean {
  return storage.getItem(STARTED_FLAG) !== null
}

export function markStarted(storage: FlagStorage): void {
  storage.setItem(STARTED_FLAG, "1")
}

/**
 * Whether to show first run: the flag is missing and the engine holds no
 * facts. Facts with a missing flag are data from before the flag existed;
 * first run is skipped for them, so sample facts never land on real ones.
 */
export function needsFirstRun(storage: FlagStorage, factCount: number): boolean {
  return !hasStarted(storage) && factCount === 0
}

/** Whether the tour has been finished or skipped. */
export function isTourDone(storage: FlagStorage): boolean {
  return storage.getItem(TOUR_DONE_FLAG) !== null
}

export function markTourDone(storage: FlagStorage): void {
  storage.setItem(TOUR_DONE_FLAG, "1")
}

/** Removes exactly RESET_KEYS, then reloads. */
export function resetAllData(storage: FlagStorage, reload: () => void): void {
  for (const key of RESET_KEYS) storage.removeItem(key)
  reload()
}
