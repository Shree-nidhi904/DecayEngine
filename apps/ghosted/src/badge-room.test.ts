// Room for Netlify's injected "Powered by Netlify" badge (194×64 px, fixed
// bottom right, takes clicks), found in the live P2 pass. Source checks.

import { describe, expect, it } from "vitest"
import { styleText } from "./test/css-rules"

const read = styleText

describe("room for Netlify's badge", () => {
  it("lifts the dock by --badge-room (72px) and keeps that room under the page", () => {
    const dock = read("dock.css")
    expect(dock).toMatch(/:root\s*\{\s*--badge-room:\s*72px/)
    expect(dock).toMatch(/\.gh-dock\s*\{[^}]*inset-block-end:\s*var\(--badge-room, 0px\)/)
    const layout = read("layout.css")
    expect(layout).toMatch(/padding-block-end:\s*calc\(var\(--dock-h, var\(--dock-max\)\) \+ var\(--badge-room, 0px\) \+ 24px\)/)
    expect(layout).toMatch(/scroll-padding-bottom:\s*calc\(var\(--dock-h, var\(--dock-max\)\) \+ var\(--badge-room, 0px\) \+ 12px\)/)
  })
})
