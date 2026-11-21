// The dock's marker track staggers close markers over up to three rows
// (cosmetic follow-up to task 5.1; Req 12.4, 16.1). On the sample street the
// first month holds eight markers within 31 days; on one row their glyphs
// overlap. The row is layout only: each marker keeps its day, its place
// along the track (--at), its glyph and its accessible name.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, within } from "@testing-library/react"
import { MoonDock } from "./components/MoonDock"
import { loadSampleData } from "./sample-data"
import {
  DOCK_DAYS,
  MARKER_MIN_GAP_DAYS,
  MARKER_ROWS,
  dockMarkers,
  makeDayFormatter,
  markerLabel,
  markerRows,
  type DockMarker,
} from "./timeline"
import { firstRule, rulesOf, styleText } from "./test/css-rules"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"

afterEach(cleanup)

function sampleMarkers(): DockMarker[] {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  return dockMarkers(engine.view(T0), engine.forecast(T0, DOCK_DAYS * DAY_MS), T0)
}

/** Markers on the given days, in order, all of one person (only `day` matters to the rows). */
const onDays = (days: number[]): DockMarker[] =>
  days.map((day, i) => ({ id: `p${i}`, name: `Person ${i}`, type: "dark", at: T0 + day * DAY_MS, day }))

describe("markerRows", () => {
  it("leaves markers that are far apart on the first row", () => {
    expect(markerRows(onDays([5, 40, 90, 200]))).toEqual([0, 0, 0, 0])
    expect(markerRows([])).toEqual([])
  })

  it("moves a marker to the next row when it is closer than the gap to the last one on a row", () => {
    expect(MARKER_MIN_GAP_DAYS).toBe(9)
    expect(markerRows(onDays([3, 12, 13, 22]))).toEqual([0, 0, 1, 0])
    expect(markerRows(onDays([1, 2, 3]))).toEqual([0, 1, 2])
  })

  it("with all three rows taken, uses the row whose last marker is furthest back", () => {
    expect(MARKER_ROWS).toBe(3)
    expect(markerRows(onDays([1, 2, 3, 4]))).toEqual([0, 1, 2, 0])
    expect(markerRows(onDays([1, 5, 6, 7]))).toEqual([0, 1, 2, 0])
  })

  it("on the sample street: never more than three rows, and two markers share a row closer than the gap only when every row was taken", () => {
    const markers = sampleMarkers()
    const before = JSON.stringify(markers)
    const rows = markerRows(markers)
    expect(JSON.stringify(markers)).toBe(before) // the markers are not changed
    expect(rows).toHaveLength(markers.length)
    expect(new Set(rows).size).toBeGreaterThan(1)
    for (const row of rows) expect([0, 1, 2]).toContain(row)

    const last: (number | undefined)[] = [undefined, undefined, undefined]
    markers.forEach((marker, i) => {
      const row = rows[i]!
      const previous = last[row]
      if (previous !== undefined && marker.day - previous < MARKER_MIN_GAP_DAYS) {
        // Crowded: no row had room, and the one used had the oldest last marker.
        for (const other of last) expect(other !== undefined && marker.day - other < MARKER_MIN_GAP_DAYS).toBe(true)
        expect(previous).toBe(Math.min(...(last as number[])))
      }
      last[row] = marker.day
    })
  })
})

describe("MoonDock with staggered markers", () => {
  it("puts each marker on its row and the track's row count on the track, keeping day, place and name", () => {
    const markers = sampleMarkers()
    const rows = markerRows(markers)
    const { container } = render(
      <MoonDock
        today={T0}
        offsetMs={0}
        onChange={() => {}}
        markers={markers}
        formatDate={(ms) => String(ms)}
        timeZone="UTC"
        frames={{ request: () => 0, cancel: () => {} }}
        clock={() => 0}
        prefersReducedMotion={() => true}
      />
    )
    const track = within(container).getByRole("group", { name: "Who fades and goes dark in the next year" })
    expect(track.getAttribute("data-rows")).toBe(String(Math.max(...rows) + 1))
    const formatDay = makeDayFormatter("UTC")
    const buttons = within(track).getAllByRole("button")
    expect(buttons).toHaveLength(markers.length)
    buttons.forEach((button, i) => {
      const marker = markers[i]!
      expect(button.getAttribute("data-row")).toBe(String(rows[i]))
      expect(button.getAttribute("data-day")).toBe(String(marker.day))
      expect(button.style.getPropertyValue("--at")).toBe(String(marker.day / DOCK_DAYS))
      expect(button.getAttribute("aria-label")).toBe(markerLabel(marker, formatDay))
      expect(button.querySelector(`[data-glyph="${marker.type === "fades" ? "triangle" : "cross"}"]`)).not.toBeNull()
    })
  })

  it("with no markers, the track has one row", () => {
    const { container } = render(
      <MoonDock today={T0} offsetMs={0} onChange={() => {}} markers={[]} formatDate={String} prefersReducedMotion={() => true} />
    )
    expect(container.querySelector(".gh-dock-track")!.getAttribute("data-rows")).toBe("1")
  })
})

describe("dock.css: the rows (source check: jsdom does not lay out)", () => {
  const rules = rulesOf(styleText("dock.css"), "dock.css")
  const decl = (selector: string, property: string) => firstRule(rules, "dock.css", selector).decls.get(property)

  it("a 24px track per row, and rows 24px apart, matching the 22px markers", () => {
    expect(decl(".gh-dock-track", "block-size")).toBe("24px")
    expect(decl('.gh-dock-track[data-rows="2"]', "block-size")).toBe("48px")
    expect(decl('.gh-dock-track[data-rows="3"]', "block-size")).toBe("72px")
    expect(decl(".gh-dock-mark", "block-size")).toBe("22px")
    expect(decl(".gh-dock-mark", "inset-block-start")).toBe("0")
    expect(decl('.gh-dock-mark[data-row="1"]', "inset-block-start")).toBe("24px")
    expect(decl('.gh-dock-mark[data-row="2"]', "inset-block-start")).toBe("48px")
  })

  it("a row moves a marker only up and down: its place along the track stays day / 365", () => {
    for (const selector of ['.gh-dock-mark[data-row="1"]', '.gh-dock-mark[data-row="2"]']) {
      const decls = firstRule(rules, "dock.css", selector).decls
      expect([...decls.keys()], selector).toEqual(["inset-block-start"])
    }
    expect(decl(".gh-dock-mark", "inset-inline-start")).toBe("calc(8px + (100% - 16px) * var(--at, 0))")
  })
})
