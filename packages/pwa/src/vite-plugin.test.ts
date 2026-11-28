import { describe, expect, it } from "vitest"
import { pwa, shouldPrecache } from "./vite-plugin"

describe("pwa vite plugin", () => {
  const plugin = pwa({
    name: "Ghosted",
    shortName: "Ghosted",
    description: "d",
    themeColor: "#100e1a",
    backgroundColor: "#07060d",
    extraPrecache: ["icons/icon-192.png"],
  }) as any

  it("emits a manifest and a worker that precaches the bundle, and nothing for source maps", () => {
    plugin.configResolved({ base: "/" })
    const emitted: { fileName: string; source: string }[] = []
    plugin.generateBundle.call({ emitFile: (f: any) => emitted.push(f) }, {}, {
      "index.html": {},
      "assets/index-abc.js": {},
      "assets/index-abc.js.map": {},
    })
    expect(emitted.map((e) => e.fileName).sort()).toEqual(["manifest.webmanifest", "sw.js"])
    const sw = emitted.find((e) => e.fileName === "sw.js")!.source
    expect(sw).toContain("/assets/index-abc.js")
    expect(sw).toContain("/icons/icon-192.png")
    expect(sw).not.toContain("index-abc.js.map")
    expect(JSON.parse(emitted.find((e) => e.fileName === "manifest.webmanifest")!.source).start_url).toBe("/")
  })

  it("names the cache after the file list, so a new build gets a new cache", () => {
    const build = (files: string[]) => {
      let sw = ""
      plugin.configResolved({ base: "/" })
      plugin.generateBundle.call({ emitFile: (f: any) => f.fileName === "sw.js" && (sw = f.source) }, {}, Object.fromEntries(files.map((f) => [f, {}])))
      return /decay-engine-[0-9a-f]{12}/.exec(sw)![0]
    }
    expect(build(["a.js"])).toBe(build(["a.js"]))
    expect(build(["a.js"])).not.toBe(build(["b.js"]))
  })

  it("links the manifest and theme colour in the page, with relative paths only", () => {
    plugin.configResolved({ base: "/" })
    const tags = plugin.transformIndexHtml()
    expect(JSON.stringify(tags)).toContain("/manifest.webmanifest")
    expect(JSON.stringify(tags)).toContain("#100e1a")
    expect(JSON.stringify(tags)).not.toMatch(/https?:\/\//)
  })
})

describe("shouldPrecache", () => {
  it("keeps code, styles and Latin WOFF2 fonts; drops WOFF copies and other scripts' subsets", () => {
    expect(shouldPrecache("assets/index-abc.js")).toBe(true)
    expect(shouldPrecache("assets/index-abc.css")).toBe(true)
    expect(shouldPrecache("index.html")).toBe(true)
    expect(shouldPrecache("assets/spectral-latin-400-normal-abc.woff2")).toBe(true)
    expect(shouldPrecache("assets/spectral-latin-400-normal-abc.woff")).toBe(false)
    expect(shouldPrecache("assets/spectral-cyrillic-400-normal-abc.woff2")).toBe(false)
    expect(shouldPrecache("assets/spectral-latin-ext-400-normal-abc.woff2")).toBe(false)
  })
})
