// The tab title and favicon while the tab is hidden (task L3, Req 38.6,
// 38.7, design section 15.6). jsdom's own document; its visibilityState is
// set per test with a property on the document and removed afterwards.

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { badgeIcon, titleWithCount, useTabSignal } from "./tab-signal"

const BASE_HREF = "data:image/svg+xml,base"

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

function iconLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
}

beforeEach(() => {
  document.title = "Ghosted"
  const link = document.createElement("link")
  link.rel = "icon"
  link.setAttribute("href", BASE_HREF)
  document.head.appendChild(link)
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  for (const link of iconLinks()) link.remove()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

describe("titleWithCount", () => {
  it("is the title itself at 0, then (n), and (9+) above 9", () => {
    expect(titleWithCount(0, "Ghosted")).toBe("Ghosted")
    expect(titleWithCount(1, "Ghosted")).toBe("(1) Ghosted")
    expect(titleWithCount(2, "Ghosted")).toBe("(2) Ghosted")
    expect(titleWithCount(9, "Ghosted")).toBe("(9) Ghosted")
    expect(titleWithCount(10, "Ghosted")).toBe("(9+) Ghosted")
    expect(titleWithCount(250, "Ghosted")).toBe("(9+) Ghosted")
  })
})

describe("badgeIcon", () => {
  const svgOf = (url: string) => decodeURIComponent(url.slice("data:image/svg+xml,".length))

  it("is an SVG data URL: nothing is fetched", () => {
    for (const kind of ["weak", "dead"] as const) {
      const url = badgeIcon(kind)
      expect(url.startsWith("data:image/svg+xml,")).toBe(true)
      // The only URL inside is the SVG namespace, which is never fetched.
      expect(svgOf(url).match(/https?:\/\/[^'"\s]+/g)).toEqual(["http://www.w3.org/2000/svg"])
    }
  })

  it("keeps the base icon and adds a shape, not only a colour: a triangle for flickering, a cross for dark", () => {
    const weak = svgOf(badgeIcon("weak"))
    const dead = svgOf(badgeIcon("dead"))
    for (const svg of [weak, dead]) {
      expect(svg).toContain("<rect x='11' y='8' width='10' height='16' rx='1' fill='#ffd479'/>")
    }
    // The triangle: a closed path with three points, filled --flick.
    expect(weak).toMatch(/<path d='M24 2 L30 13 L18 13 Z' fill='#ff9a4a'\/>/)
    // The cross: two strokes in --rust.
    expect(dead).toMatch(/<path d='M19\.5 3\.5 L28\.5 12\.5 M28\.5 3\.5 L19\.5 12\.5' stroke='#ff7a7a'/)
    expect(weak).not.toBe(dead)
  })
})

describe("useTabSignal", () => {
  it("counts nothing while the tab is visible", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => result.current.record(2, "weak"))
    expect(document.title).toBe("Ghosted")
    expect(iconLinks()[0]!.getAttribute("href")).toBe(BASE_HREF)
  })

  it("while hidden: the count in the title and a badge on the favicon, with the title as its text", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(1) Ghosted")
    const link = iconLinks()[0]!
    expect(link.getAttribute("href")).toBe(badgeIcon("weak"))
    expect(link.getAttribute("title")).toBe("(1) Ghosted")

    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(2) Ghosted")
    // A window going dark turns the badge into the cross, and it stays a cross.
    act(() => result.current.record(1, "dead"))
    expect(link.getAttribute("href")).toBe(badgeIcon("dead"))
    act(() => result.current.record(1, "weak"))
    expect(link.getAttribute("href")).toBe(badgeIcon("dead"))
    expect(document.title).toBe("(4) Ghosted")
    expect(iconLinks()).toHaveLength(1)
  })

  it("shows (9+) above 9", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(9, "weak"))
    expect(document.title).toBe("(9) Ghosted")
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(9+) Ghosted")
  })

  it("becoming visible clears the count and puts the title and favicon back exactly", () => {
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(3, "dead"))
    expect(document.title).toBe("(3) Ghosted")

    act(() => setVisibility("visible"))
    expect(document.title).toBe("Ghosted")
    const link = iconLinks()[0]!
    expect(link.getAttribute("href")).toBe(BASE_HREF)
    expect(link.hasAttribute("title")).toBe(false)

    // Counting starts again from 0 the next time the tab is hidden.
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "weak"))
    expect(document.title).toBe("(1) Ghosted")
    expect(link.getAttribute("href")).toBe(badgeIcon("weak"))
  })

  it("unmounting puts the title and favicon back", () => {
    const { result, unmount } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(2, "weak"))
    unmount()
    expect(document.title).toBe("Ghosted")
    expect(iconLinks()[0]!.getAttribute("href")).toBe(BASE_HREF)
  })

  it("without a favicon link, it adds one while counting and removes it after", () => {
    for (const link of iconLinks()) link.remove()
    const { result } = renderHook(() => useTabSignal())
    act(() => setVisibility("hidden"))
    act(() => result.current.record(1, "dead"))
    expect(iconLinks()).toHaveLength(1)
    expect(iconLinks()[0]!.getAttribute("href")).toBe(badgeIcon("dead"))
    act(() => setVisibility("visible"))
    expect(iconLinks()).toHaveLength(0)
    expect(document.title).toBe("Ghosted")
  })
})
