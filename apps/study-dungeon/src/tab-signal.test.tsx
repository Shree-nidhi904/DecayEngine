// @vitest-environment jsdom
//
// The tab title and favicon while the tab is hidden (task L3, Requirement
// 23.6, 23.7). jsdom's own document; its visibilityState is set per test
// with a property on the document and removed afterwards. Study Dungeon's
// index.html has no favicon link, so most cases start without one.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { badgeIcon, titleWithCount, useTabSignal } from "./tab-signal"

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

const iconLinks = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
const svgOf = (url: string) => decodeURIComponent(url.slice("data:image/svg+xml,".length))

beforeEach(() => {
  document.title = "Study Dungeon"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  for (const link of iconLinks()) link.remove()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

describe("titleWithCount", () => {
  it("is the title itself at 0, then (n), and (9+) above 9", () => {
    expect(titleWithCount(0, "Study Dungeon")).toBe("Study Dungeon")
    expect(titleWithCount(1, "Study Dungeon")).toBe("(1) Study Dungeon")
    expect(titleWithCount(2, "Study Dungeon")).toBe("(2) Study Dungeon")
    expect(titleWithCount(9, "Study Dungeon")).toBe("(9) Study Dungeon")
    expect(titleWithCount(10, "Study Dungeon")).toBe("(9+) Study Dungeon")
    expect(titleWithCount(250, "Study Dungeon")).toBe("(9+) Study Dungeon")
  })
})

describe("badgeIcon", () => {
  it("is an SVG data URL whose only URL is the SVG namespace: nothing is fetched", () => {
    for (const kind of ["weak", "dead"] as const) {
      const url = badgeIcon(kind)
      expect(url.startsWith("data:image/svg+xml,")).toBe(true)
      expect(svgOf(url).match(/https?:\/\/[^'"\s]+/g)).toEqual(["http://www.w3.org/2000/svg"])
    }
  })

  it("draws the candle and adds a shape, not only a colour: a triangle for weakened, a cross for died", () => {
    const weak = svgOf(badgeIcon("weak"))
    const dead = svgOf(badgeIcon("dead"))
    for (const svg of [weak, dead]) {
      // The stone tile, the wax and the flame, in token colours.
      expect(svg).toContain("<rect width='32' height='32' rx='6' fill='#110d17'/>")
      expect(svg).toContain("fill='#f0e6cc'")
    }
    expect(weak).toMatch(/<path d='M24 2 L30 13 L18 13 Z' fill='#ff8a2b'\/>/)
    expect(dead).toMatch(/<path d='M19\.5 3\.5 L28\.5 12\.5 M28\.5 3\.5 L19\.5 12\.5' stroke='#ff5f77'/)
    expect(weak).not.toBe(dead)
  })
})

describe("useTabSignal", () => {
  it("counts nothing while the tab is visible, and adds no link", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => result.current.record(2, "weak"))
    expect(document.title).toBe("Study Dungeon")
    expect(iconLinks()).toHaveLength(0)
  })

  it("while hidden: the count in the title and the badged icon, with the title as its text; the cross stays", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(1) Study Dungeon")
    expect(iconLinks()).toHaveLength(1)
    const link = iconLinks()[0]!
    expect(link.getAttribute("href")).toBe(badgeIcon("weak"))
    expect(link.getAttribute("title")).toBe("(1) Study Dungeon")

    act(() => result.current.record(1, "dead"))
    expect(link.getAttribute("href")).toBe(badgeIcon("dead"))
    act(() => result.current.record(1, "weak"))
    expect(link.getAttribute("href")).toBe(badgeIcon("dead"))
    expect(document.title).toBe("(3) Study Dungeon")
    expect(iconLinks()).toHaveLength(1)
  })

  it("shows (9+) above 9", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(9, "weak"))
    expect(document.title).toBe("(9) Study Dungeon")
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(9+) Study Dungeon")
  })

  it("becoming visible clears the count, restores the title exactly and removes the added link", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(3, "dead"))
    act(() => setVisibility("visible"))
    expect(document.title).toBe("Study Dungeon")
    expect(iconLinks()).toHaveLength(0)
    // Counting starts again from 0 the next time.
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(1) Study Dungeon")
  })

  it("unmounting puts the title back and removes the added link", () => {
    const { result, unmount } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(2, "weak"))
    unmount()
    expect(document.title).toBe("Study Dungeon")
    expect(iconLinks()).toHaveLength(0)
  })

  it("a page that has a favicon link gets its href swapped and put back exactly", () => {
    const link = document.createElement("link")
    link.rel = "icon"
    link.setAttribute("href", "data:image/svg+xml,base")
    document.head.appendChild(link)
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "weak"))
    expect(iconLinks()).toEqual([link])
    expect(link.getAttribute("href")).toBe(badgeIcon("weak"))
    act(() => setVisibility("visible"))
    expect(link.getAttribute("href")).toBe("data:image/svg+xml,base")
    expect(link.hasAttribute("title")).toBe(false)
  })
})
