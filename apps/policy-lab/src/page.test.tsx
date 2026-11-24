// Extensions spec, tasks 3.2, 3.3, 3.4 and 3.7 (Requirements 5.12, 7, 8 and 15.2).
// Renders the page to static HTML in Node (react-dom/server), so no browser
// DOM library is needed. Checks the words and the chart's marks, not styling.

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { App, Chart } from "./App"
import { PRESETS, runLab } from "./lab"
import { labText } from "./text"

/** The visible text of some HTML: tags removed, the entities React writes decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
}

const html = renderToStaticMarkup(<App />)
const text = textOf(html)

describe("Policy Lab page", () => {
  it("warns that the text runs as code, to paste only trusted code, with no time limit, on every change", () => {
    expect(text).toContain(labText.warning)
    expect(labText.warning).toMatch(/runs as JavaScript in this tab/)
    expect(labText.warning).toMatch(/Paste only code you trust/)
    expect(labText.warning).toMatch(/every time you change it/)
    expect(labText.warning).toMatch(/can make network requests/)
    expect(labText.warning).toMatch(/no time limit/)
  })

  it("links the warning to the editor as its description", () => {
    expect(html).toMatch(/<p id="lab-warning"[^>]*>/)
    expect(html).toMatch(/<textarea id="src"[^>]*aria-describedby="lab-warning"/)
  })

  it("says what checkPolicy checks and does not, and never calls the rules sound", () => {
    expect(text).toContain(labText.checks)
    expect(labText.checks).toMatch(/does not check nextDueAt or resurrect/)
    expect(text).not.toMatch(/sound/i)
  })

  it("states the run's limits", () => {
    expect(text).toContain(
      "The item has importance 2 and costs 5 minutes. checkPolicy runs with the one payload and event above. " +
        "Tend on day 0 to 730; show 1 to 730 days. At most 5 problems are listed."
    )
  })

  it("names every control", () => {
    for (const id of ["src", "pl", "ev", "td", "hz"]) expect(html).toContain(`for="${id}"`)
    expect(html).toContain(`aria-label="${labText.presetsLabel}"`)
  })

  it("shows the milk preset's weak and dead lines, and the state words with their shapes", () => {
    expect(text).toContain("weak below 40")
    expect(text).toContain("dead below 10")
    expect(html.match(/class="legend-item"/g)?.length).toBe(3)
    expect(html).toMatch(/<circle[^>]*>/)
  })

  it("makes no claim of proof or science", () => {
    expect(text).not.toMatch(/proven|scientific|research|clinical|optimal|guarantee/i)
  })
})

describe("Chart", () => {
  it("is named by a summary, and marks the weak and dead days with a triangle and a cross", () => {
    const p = PRESETS[1]
    const r = runLab({ source: p.source, payload: p.payload, event: p.event, tendDay: null, horizonDays: 40 })
    if (!r.ok) throw new Error(r.error)
    const chart = renderToStaticMarkup(
      <Chart series={r.series} tendDay={null} thresholds={r.thresholds} weakDay={r.weakDay} deadDay={r.deadDay} />
    )
    expect(chart).toContain('aria-label="Health of one item from day 0 to day 40: weak on day 4, dead on day 9."')
    expect(chart).toContain('role="img"')
    expect(textOf(chart)).toContain("weak below 50")
    expect(textOf(chart)).toContain("dead below 15")
    // One triangle (closed path) for the weak day and one cross (two strokes) for the dead day.
    expect(chart.match(/<path d="M [^"]*Z"/g)?.length).toBe(1)
    expect(chart.match(/<path d="M [^"]* M [^"]*"/g)?.length).toBe(1)
  })
})
