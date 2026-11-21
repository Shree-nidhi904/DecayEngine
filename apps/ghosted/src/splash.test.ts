// The splash's once-per-tab flag (task 4.14; Req 6.2, 6.3, design open issue
// 2.7). A fake session storage; no real clock.

import { afterEach, describe, expect, it } from "vitest"
import { SPLASH_SEEN_FLAG, markSplashSeen, mediaPrefersReducedMotion, shouldShowSplash, type SessionFlagStorage } from "./splash"
import { RESET_KEYS } from "./first-run"
import { FakeStorage } from "./test/fake-storage"

describe("shouldShowSplash", () => {
  it("shows the splash in a new tab, and not again once it was seen in that tab (Req 6.2)", () => {
    const session = new FakeStorage()
    expect(shouldShowSplash(session, false)).toBe(true)
    markSplashSeen(session)
    expect(session.getItem(SPLASH_SEEN_FLAG)).toBe("1")
    expect(shouldShowSplash(session, false)).toBe(false)
    // Another tab has its own session storage.
    expect(shouldShowSplash(new FakeStorage(), false)).toBe(true)
  })

  it("never shows it under reduced motion, seen or not (Req 6.3)", () => {
    expect(shouldShowSplash(new FakeStorage(), true)).toBe(false)
    expect(shouldShowSplash(new FakeStorage({ [SPLASH_SEEN_FLAG]: "1" }), true)).toBe(false)
    expect(shouldShowSplash(null, true)).toBe(false)
  })

  it("without session storage (null), shows it on every page load, since nothing can be remembered", () => {
    expect(shouldShowSplash(null, false)).toBe(true)
    markSplashSeen(null)
    expect(shouldShowSplash(null, false)).toBe(true)
  })

  it("a session storage that refuses the write leaves the splash to show again, and throws nothing", () => {
    const refusing: SessionFlagStorage = {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error("quota"), { name: "QuotaExceededError" })
      },
    }
    expect(() => markSplashSeen(refusing)).not.toThrow()
    expect(shouldShowSplash(refusing, false)).toBe(true)
  })

  it("the flag is not data: Reset all data leaves it alone", () => {
    expect(RESET_KEYS).not.toContain(SPLASH_SEEN_FLAG)
  })
})

describe("mediaPrefersReducedMotion", () => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia")
  afterEach(() => {
    if (original === undefined) delete (window as { matchMedia?: unknown }).matchMedia
    else Object.defineProperty(window, "matchMedia", original)
  })

  function stubMatchMedia(reduce: boolean) {
    const queries: string[] = []
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => {
        queries.push(query)
        return { matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query }
      },
    })
    return queries
  }

  it("reads the prefers-reduced-motion media query", () => {
    const queries = stubMatchMedia(true)
    expect(mediaPrefersReducedMotion()).toBe(true)
    stubMatchMedia(false)
    expect(mediaPrefersReducedMotion()).toBe(false)
    expect(queries).toEqual(["(prefers-reduced-motion: reduce)"])
  })

  it("treats motion as unwanted where matchMedia does not exist", () => {
    delete (window as { matchMedia?: unknown }).matchMedia
    expect(typeof window.matchMedia).toBe("undefined")
    expect(mediaPrefersReducedMotion()).toBe(true)
  })
})
