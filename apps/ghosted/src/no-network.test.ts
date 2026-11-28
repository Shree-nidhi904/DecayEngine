// No network (task 2.9; Req 23.2, 30.2): no network API call and no remote URL
// anywhere in src/ or index.html. The one allowed URL is the SVG namespace,
// which inline SVG needs and which the browser never fetches. Files are read
// as text, never imported. Every pattern is built from pieces, so this file
// never matches its own checks.

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { APP_DIR, listFiles, readText, SRC_DIR } from "./test/source-files"

const fetchCall = new RegExp(`\\b${"fet" + "ch"}\\s*\\(`)
const networkWords = ["XMLHttp" + "Request", "Web" + "Socket", "send" + "Beacon"].map(
  (word) => new RegExp(`\\b${word}\\b`)
)
const urlPattern = new RegExp(`\\b(?:${"ht" + "tps?"}|${"w" + "ss?"}):\\/\\/[^\\s"'\`)<>]+`, "g")
const ALLOWED_URL_PREFIX = "http:" + "//www.w3.org/"
/**
 * Feedback list, point 20: the Home button links to the project's landing page.
 * A link is followed only when the person clicks it; nothing is fetched. Only
 * this exact address is allowed (components/TopBar.tsx, HOME_URL).
 */
const ALLOWED_LINK = "ht" + "tps://decay-engine.pages.dev/"

/** Every network problem in `text`, as short descriptions. */
function problemsIn(text: string): string[] {
  const problems: string[] = []
  if (fetchCall.test(text)) problems.push("network call")
  for (const word of networkWords) if (word.test(text)) problems.push(`uses ${word.source}`)
  for (const [url] of text.matchAll(urlPattern)) {
    if (!url.startsWith(ALLOWED_URL_PREFIX) && url !== ALLOWED_LINK) problems.push(`remote URL ${url}`)
  }
  return problems
}

describe("the check catches what it looks for", () => {
  it("finds planted calls and URLs, and allows the SVG namespace", () => {
    expect(problemsIn(`await ${"fet" + "ch"}("/x")`)).toEqual(["network call"])
    expect(problemsIn(`new ${"Web" + "Socket"}(u)`)).toHaveLength(1)
    expect(problemsIn(`src="${"ht" + "tps"}://fonts.example.com/a.css"`)).toEqual([
      `remote URL ${"ht" + "tps"}://fonts.example.com/a.css`,
    ])
    expect(problemsIn(`url(${"ht" + "tp"}://cdn.example.com/x.png)`)).toHaveLength(1)
    expect(problemsIn(`xmlns="${ALLOWED_URL_PREFIX}2000/svg"`)).toEqual([])
  })

  it("allows only the landing page's exact address as a link, and still catches a fetch to it", () => {
    expect(problemsIn(`href="${ALLOWED_LINK}"`)).toEqual([])
    expect(problemsIn(`href="${ALLOWED_LINK}x.js"`)).toHaveLength(1)
    expect(problemsIn(`href="${"ht" + "tps"}://decay-engine.pages.dev.evil.example/"`)).toHaveLength(1)
    expect(problemsIn(`${"fet" + "ch"}("${ALLOWED_LINK}")`)).toEqual(["network call"])
  })
})

describe("no network", () => {
  const files = listFiles(SRC_DIR, (rel) => /\.(ts|tsx|css)$/.test(rel))

  it("reads every source and style file", () => {
    expect(files).toContain("main.tsx")
    expect(files).toContain("styles/tokens.css")
  })

  it("no file in src/ calls the network or names a remote URL", () => {
    const found = files.flatMap((rel) => problemsIn(readText(join(SRC_DIR, rel))).map((p) => `${rel}: ${p}`))
    expect(found).toEqual([])
  })

  it("index.html loads nothing from another origin", () => {
    const html = readText(join(APP_DIR, "index.html"))
    expect(html).toContain('src="/src/main.tsx"')
    expect(problemsIn(html)).toEqual([])
  })
})
