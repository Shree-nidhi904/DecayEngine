// Extensions spec, tasks 4.3 and 5.2 (Requirements 10.1, 14.1 and 15.3).
// Renders the page to static HTML in Node (react-dom/server) with a fixed
// time, so no browser DOM library and no clock are needed. Checks the words
// and the labels shown before anything is loaded.

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { App } from "./App"
import { ltText } from "./text"

const NOW = Date.UTC(2026, 10, 24)

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
}

const html = renderToStaticMarkup(<App now={NOW} />)
const text = textOf(html)

describe("Life Triage page", () => {
  it("says nothing is uploaded and states every limit", () => {
    expect(text).toContain("Nothing is uploaded; the files are read in this page.")
    expect(text).toContain(ltText.limits)
  })

  it("labels the budget and look-ahead inputs and ties them to the limits", () => {
    expect(html).toContain('for="b"')
    expect(html).toContain('for="a"')
    expect(html).toMatch(/<input id="b"[^>]*aria-describedby="lt-limits lt-budget-note"/)
    expect(html).toMatch(/<input id="a"[^>]*max="365"[^>]*aria-describedby="lt-limits lt-ahead-note"/)
  })

  it("has one box per app, each taking .json files", () => {
    expect(text).toContain(ltText.slotFacts)
    expect(text).toContain(ltText.slotFriends)
    expect(html).toMatch(/<input id="slot-facts" type="file" accept="application\/json,.json" multiple/)
    expect(html).toMatch(/<input id="slot-friends" type="file" accept="application\/json,.json" multiple/)
    expect(html.match(/No file yet \(.json\)/g)?.length).toBe(2)
  })
  it("keeps the limits in a details fold", () => {
    expect(html).toMatch(/<details class="details"><summary>Details and limits<\/summary><p id="lt-limits"/)
  })
  it("names the file control and the sample button", () => {
    expect(text).toContain(ltText.loadFiles)
    expect(html).toMatch(/<button type="button"[^>]*>Use sample data<\/button>/)
  })

  it("asks to load something first, with no error", () => {
    expect(text).toContain(ltText.begin)
    expect(html).not.toContain('role="alert"')
  })
})
