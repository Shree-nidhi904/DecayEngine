// Copied from apps/study-dungeon/src/first-run.ts (Ghosted design section
// 1.3). Changed: Ghosted's keys; no tour flag (Ghosted has no tour); new
// OWN_PEOPLE_FLAG for the privacy line (Req 15.2). No import from
// apps/study-dungeon (Req 21.1).
//
// First run is shown while the flag "ghosted:started" is missing and there
// are no people. (Checking for zero people alone would show it again forever
// after "Start empty".) Both first-run buttons set the flag. Reset removes
// exactly Ghosted's three keys, then reloads, so first run shows again
// (Req 20.7).
//
// The storage is injected (the App defaults to window.localStorage), so tests
// use an in-memory fake.

/** Set once the user has chosen "Load sample street" or "Start empty". */
export const STARTED_FLAG = "ghosted:started"

/** Where LocalStorageAdapter("ghosted") keeps the snapshot (Req 23.1). */
export const ENGINE_STORAGE_KEY = "decay-engine:ghosted"

/**
 * Set once the user adds, imports or restores people of their own. The
 * privacy line then stops saying the names are made up (Req 15.2).
 */
export const OWN_PEOPLE_FLAG = "ghosted:own-people"

/**
 * Every key "Reset all data" removes: Ghosted's keys only (Req 20.7). The
 * splash flag lives in sessionStorage and is not data, so it is not here.
 */
export const RESET_KEYS: readonly string[] = [ENGINE_STORAGE_KEY, STARTED_FLAG, OWN_PEOPLE_FLAG]

/** The part of Storage the app uses. window.localStorage fits it. */
export type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function hasStarted(storage: FlagStorage): boolean {
  return storage.getItem(STARTED_FLAG) !== null
}

export function markStarted(storage: FlagStorage): void {
  storage.setItem(STARTED_FLAG, "1")
}

/** Whether the user has added, imported or restored people of their own. */
export function hasOwnPeople(storage: FlagStorage): boolean {
  return storage.getItem(OWN_PEOPLE_FLAG) !== null
}

export function markOwnPeople(storage: FlagStorage): void {
  storage.setItem(OWN_PEOPLE_FLAG, "1")
}

/**
 * Whether to show first run: the flag is missing and the engine holds no
 * people. People with a missing flag are data from before the flag existed;
 * first run is skipped for them, so sample people never land on real ones.
 */
export function needsFirstRun(storage: FlagStorage, personCount: number): boolean {
  return !hasStarted(storage) && personCount === 0
}

/** Removes exactly RESET_KEYS, then reloads. */
export function resetAllData(storage: FlagStorage, reload: () => void): void {
  for (const key of RESET_KEYS) storage.removeItem(key)
  reload()
}
