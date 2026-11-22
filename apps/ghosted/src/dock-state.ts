// Whether the moon dock is expanded, remembered for the tab (task L2, design
// section 11.2; Req 34.5).
//
// The flag lives in sessionStorage, through the App's `session` prop, like
// the splash flag (splash.ts). It is a view choice, not data, so it is never
// in localStorage and "Reset all data" does not touch it (first-run.ts,
// RESET_KEYS).
//
// - No value, or no usable storage: collapsed.
// - A read or a write that throws is ignored: the choice then lasts as React
//   state until the page closes.

import type { SessionFlagStorage } from "./splash"

/** "1" while expanded, "0" while collapsed. */
export const DOCK_EXPANDED_FLAG = "ghosted.dock-expanded"

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
