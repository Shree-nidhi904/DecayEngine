// Whether the time dock is expanded, remembered for the tab (task 21.1,
// design "Compact Time Dock", Remembered for the session; Req 19.5).
//
// The flag lives in sessionStorage, through the App's `session` prop. It is
// a view choice, not data, so it is never in localStorage and "Reset all
// data" does not touch it (first-run.ts, RESET_KEYS).
//
// - No value, or no usable storage: collapsed.
// - A read or a write that throws is ignored: the choice then lasts as React
//   state until the page closes.

/** The part of sessionStorage the dock flag needs. window.sessionStorage fits it. */
export type SessionFlagStorage = Pick<Storage, "getItem" | "setItem">

/** "1" while expanded, "0" while collapsed. */
export const DOCK_EXPANDED_FLAG = "study-dungeon.dock-expanded"

export function readDockExpanded(session: SessionFlagStorage | null): boolean {
  if (session === null) return false
  try {
    return session.getItem(DOCK_EXPANDED_FLAG) === "1"
  } catch {
    return false
  }
}

export function writeDockExpanded(session: SessionFlagStorage | null, expanded: boolean): void {
  if (session === null) return
  try {
    session.setItem(DOCK_EXPANDED_FLAG, expanded ? "1" : "0")
  } catch {
    // Not saved: the choice lasts until the page closes. No user data is involved.
  }
}

/**
 * The browser's sessionStorage, or null when it cannot be reached (some
 * privacy settings throw on the property read itself).
 */
export function browserSessionStorage(): SessionFlagStorage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}
