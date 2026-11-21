// NeonSign (task 4.14; Req 7.1-7.4). The markup in jsdom, and the CSS
// source for what jsdom cannot show: the font, the glow and where the hum
// runs.

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { NeonSign } from "./NeonSign"
import { MOTION_DECLARATION, motionBlocks, outsideMotionBlocks, readStyle, ruleBody, stripComments } from "../test/css"

afterEach(cleanup)

describe("NeonSign", () => {
  it('renders "Ghosted" as an h1 with the tagline below it (Req 7.1, 7.4)', () => {
    render(<NeonSign title="Ghosted" tagline="People you are losing touch with" />)
    const sign = screen.getByRole("heading", { level: 1 })
    expect(sign.textContent).toBe("Ghosted")
    expect(sign.className).toBe("gh-sign")
    const tagline = screen.getByText("People you are losing touch with")
    expect(tagline.tagName).toBe("P")
    expect(sign.compareDocumentPosition(tagline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("NeonSign styles", () => {
  const sign = readStyle("sign.css")
  const motion = readStyle("motion.css")

  it("the sign is in Monoton (--logo) and glows in --sign outside any motion block, so it glows when steady (Req 7.1, 7.3)", () => {
    const body = ruleBody(outsideMotionBlocks(sign), ".gh-sign")
    expect(body).toBeDefined()
    expect(body).toMatch(/font-family:\s*var\(--logo\)/)
    expect(body).toMatch(/color:\s*var\(--sign\)/)
    expect(body).toMatch(/text-shadow:[^;]*var\(--sign\)/)
  })

  it("sign.css moves nothing: no animation, transition or keyframes", () => {
    expect(stripComments(sign)).not.toMatch(/prefers-reduced-motion/)
    expect(outsideMotionBlocks(sign)).not.toMatch(MOTION_DECLARATION)
  })

  it("the hum runs only inside prefers-reduced-motion: no-preference (Req 7.2, 7.3)", () => {
    const inside = motionBlocks(motion).join("\n")
    expect(inside).toMatch(/\.gh-sign\s*\{[^}]*animation:\s*gh-sign\s+5s\s+infinite/)
    expect(inside).toMatch(/@keyframes gh-sign\b/)
    expect(outsideMotionBlocks(motion)).not.toMatch(/gh-sign/)
  })
})
