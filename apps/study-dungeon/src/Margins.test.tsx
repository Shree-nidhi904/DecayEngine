// @vitest-environment jsdom
//
// The side margins and the background (feedback list, points 9 and 19): decoration
// only, hidden from assistive technology, CSS only, shown on wide screens only,
// and nothing moves outside the no-preference block.

import "./test/dialog-polyfill"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { Margins } from "./components/Margins"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"

afterEach(cleanup)

const css = readFileSync(`${process.cwd()}/src/styles/backdrop.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

describe("Margins", () => {
  it("renders two aria-hidden sides with no text, link, button or image", () => {
    const { container } = render(<Margins />)
    const sides = container.querySelectorAll(".sd-margin")
    expect(sides).toHaveLength(2)
    sides.forEach((side) => expect(side.getAttribute("aria-hidden")).toBe("true"))
    expect(container.textContent).toBe("")
    expect(container.querySelector("a, button, img, input, svg")).toBeNull()
  })

  it("is part of the app, and adds nothing the accessibility tree can reach", () => {
    const kit = makeAppKit()
    kit.add("f1", "solid", day(0))
    kit.renderApp(day(1))
    expect(document.querySelectorAll(".sd-margin")).toHaveLength(2)
    expect(screen.queryAllByRole("img")).toEqual([])
  })
})

describe("backdrop.css", () => {
  it("shows the margins only from 1280px up, and hides them below", () => {
    expect(css).toMatch(/\.sd-margin\s*\{\s*display:\s*none;?\s*\}/)
    expect(css).toMatch(/@media \(min-width: 1280px\)\s*\{[\s\S]*?\.sd-margin\s*\{[^}]*display:\s*block/)
    expect(css).toMatch(/\.sd-margin\s*\{[^}]*pointer-events:\s*none/)
  })

  it("leaves the page's own width free: a margin is at most the room beside 1080px", () => {
    expect(css).toContain("calc((100vw - 1080px) / 2 - 16px)")
  })

  it("moves only inside the no-preference block", () => {
    // Remove every @media block whose condition says no-preference, matching braces.
    let outside = css
    for (;;) {
      const at = outside.search(/@media[^{]*prefers-reduced-motion: no-preference[^{]*\{/)
      if (at === -1) break
      let depth = 0
      let end = outside.indexOf("{", at)
      for (; end < outside.length; end++) {
        if (outside[end] === "{") depth++
        else if (outside[end] === "}" && --depth === 0) break
      }
      outside = outside.slice(0, at) + outside.slice(end + 1)
    }
    expect(outside).not.toMatch(/animation\s*:/)
    expect(outside).not.toMatch(/@keyframes/)
    expect(css).toMatch(/animation\s*:/)
  })

  it("uses no outside image, font or link", () => {
    // The one inline SVG tile is allowed (it names the SVG namespace); nothing else may.
    const withoutTile = css.replace(/url\("data:image\/svg\+xml[^"]*"\)/, "")
    expect(withoutTile).not.toMatch(/https?:/i)
    expect(withoutTile).not.toMatch(/url\(/)
    expect(css.match(/url\(/g)).toHaveLength(1)
  })
})
