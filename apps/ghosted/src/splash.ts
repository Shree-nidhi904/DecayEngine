// The splash's once-per-tab flag (design section 1.3, Req 6.2).
//
// Only the storage type for now: Root and the App pass the session storage
// through (task 2.8). SPLASH_SEEN_FLAG, shouldShowSplash and markSplashSeen
// are added with the splash itself in task 4.14.

/** The part of sessionStorage the splash flag needs. window.sessionStorage fits it. */
export type SessionFlagStorage = Pick<Storage, "getItem" | "setItem">
