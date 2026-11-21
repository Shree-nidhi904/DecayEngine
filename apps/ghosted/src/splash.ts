// The splash's once-per-tab flag (task 4.14, design sections 1.3 and 4.4;
// Req 6.2, 6.3).
//
// The flag lives in sessionStorage, so it lasts for the tab: a reload in the
// same tab shows no splash, a new tab shows it again. It is not data, so
// "Reset all data" does not touch it (first-run.ts, RESET_KEYS).
//
// - Reduced motion: never shown (Req 6.3).
// - No usable sessionStorage (null): shown once per page load, because there
//   is nowhere to remember it (design open issue 2.7).

/** The part of sessionStorage the splash flag needs. window.sessionStorage fits it. */
export type SessionFlagStorage = Pick<Storage, "getItem" | "setItem">

/** Set in sessionStorage once the splash has been shown or dismissed in this tab. */
export const SPLASH_SEEN_FLAG = "ghosted:splash-seen"

export function shouldShowSplash(session: SessionFlagStorage | null, prefersReducedMotion: boolean): boolean {
  if (prefersReducedMotion) return false
  if (session === null) return true
  return session.getItem(SPLASH_SEEN_FLAG) === null
}

/**
 * Remembers that the splash was shown in this tab. If sessionStorage refuses
 * the write (full, or blocked), the splash simply shows again after a reload,
 * as when there is no sessionStorage at all: nothing else depends on it.
 */
export function markSplashSeen(session: SessionFlagStorage | null): void {
  if (session === null) return
  try {
    session.setItem(SPLASH_SEEN_FLAG, "1")
  } catch {
    // Not saved: see above. No user data is involved.
  }
}

/** Whether the user asked for reduced motion. Without matchMedia, motion is treated as unwanted. */
export function mediaPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}
