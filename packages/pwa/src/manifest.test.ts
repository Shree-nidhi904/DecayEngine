import { describe, expect, it } from "vitest"
import { buildManifest } from "./manifest"

const options = {
  name: "Ghosted",
  shortName: "Ghosted",
  description: "d",
  themeColor: "#100e1a",
  backgroundColor: "#07060d",
}

describe("buildManifest", () => {
  it("is installable: name, standalone display, start_url inside scope, 192 and 512 icons, one maskable", () => {
    const m = buildManifest(options)
    expect(m.display).toBe("standalone")
    expect(m.start_url.startsWith(m.scope)).toBe(true)
    const sizes = m.icons.filter((i) => i.purpose === "any").map((i) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]))
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true)
  })

  it("prefixes every path with the base", () => {
    const m = buildManifest({ ...options, base: "/app/" })
    expect(m.start_url).toBe("/app/")
    expect(m.icons.every((i) => i.src.startsWith("/app/icons/"))).toBe(true)
  })

  it("contains no absolute URL", () => {
    expect(JSON.stringify(buildManifest(options))).not.toMatch(/https?:\/\//)
  })
})
