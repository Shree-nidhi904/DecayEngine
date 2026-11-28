// Look: tokens, fonts and art (task 5.9; Req 30.1, 30.2, 30.3; steering
// ghosted.md section 3, design-tokens.md).
//
// - styles/tokens.css holds exactly the Ghosted tokens of design-tokens.md,
//   and theme.ts the same values.
// - Every colour in the app's CSS is a token (var(--…)), a color-mix of
//   tokens, transparent or currentColor. The only literal is #000, which
//   design-tokens.md's shell rules name for the hard card shadow (and which
//   the design uses for the primary button's darker edge).
// - Every colour in the app's TS and TSX is a token value (theme.ts), #000
//   or currentColor.
// - The fonts come from the @fontsource packages; nothing names the Google
//   font hosts. The art is CSS and inline SVG: no <img>, no image files, no
//   url() in the CSS, no icon library.
// Files are read as text, never imported (except theme.ts, whose values are compared).

import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { ghostedTheme } from "./theme"
import { allRules, styleFiles, styleText } from "./test/css-rules"
import { APP_DIR, REPO_DIR, SRC_DIR, listFiles, readText } from "./test/source-files"

/** `--name: value` pairs in a CSS text, in order. */
function customProperties(css: string): Map<string, string> {
  return new Map([...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

/** The Ghosted section of design-tokens.md. */
function steeringTokens(): Map<string, string> {
  const text = readText(join(REPO_DIR, ".kiro", "steering", "design-tokens.md"))
  const start = text.indexOf("## Ghosted")
  expect(start, "design-tokens.md has a Ghosted section").toBeGreaterThan(-1)
  const end = text.indexOf("\n## ", start + 1)
  const section = text.slice(start, end === -1 ? undefined : end).replace(/\/\*[\s\S]*?\*\//g, "")
  return customProperties(section)
}

const TOKENS_CSS = customProperties(styleText("tokens.css"))
/** Set at run time; their resting values are in tokens.css too. */
const RUNTIME = ["lit", "age"]
const TOKEN_HEXES = new Set([...TOKENS_CSS.values()].filter((v) => /^#[0-9a-f]{6}$/i.test(v)).map((v) => v.toLowerCase()))

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/
const NAMED_COLOURS =
  /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|brown|beige|ivory|violet|indigo|crimson|coral|salmon|khaki|tomato)(?![\w-])/i

/** Declarations whose value can hold a colour. */
const COLOUR_PROPERTY = /^(?:color|background(?:-color|-image)?|border(?:-[a-z-]+)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|text-decoration(?:-color)?|filter|--[a-z0-9-]+)$/

const appSources = listFiles(SRC_DIR, (rel) => /\.(ts|tsx)$/.test(rel) && !/\.test\.tsx?$/.test(rel) && !rel.startsWith("test/"))

describe("tokens (Req 30.1)", () => {
  it("tokens.css holds exactly the Ghosted tokens of design-tokens.md, plus --lit and --age", () => {
    const steering = steeringTokens()
    expect(steering.size).toBeGreaterThanOrEqual(27)
    const own = new Map([...TOKENS_CSS].filter(([name]) => !RUNTIME.includes(name)))
    expect(Object.fromEntries(own)).toEqual(Object.fromEntries(steering))
    expect(TOKENS_CSS.get("lit")).toBe("1")
    expect(TOKENS_CSS.get("age")).toBe("0")
  })

  it("theme.ts has the same colours as tokens.css", () => {
    for (const [name, hex] of Object.entries(ghostedTheme.colors)) {
      expect(TOKENS_CSS.get(name), name).toBe(hex)
    }
    expect(Object.keys(ghostedTheme.colors).sort()).toEqual([...TOKENS_CSS.keys()].filter((n) => TOKEN_HEXES.has(TOKENS_CSS.get(n)!.toLowerCase())).sort())
  })

  it("every colour in the app's CSS is a token, a color-mix of tokens, transparent or currentColor", () => {
    const problems: string[] = []
    for (const rule of allRules()) {
      if (rule.file === "tokens.css") continue
      for (const [property, value] of rule.decls) {
        if (!COLOUR_PROPERTY.test(property)) continue
        const where = `${rule.file} ${rule.selectors.join(", ")} { ${property}: ${value} }`
        for (const [hex] of value.matchAll(HEX)) if (hex.toLowerCase() !== "#000") problems.push(`${where}: ${hex}`)
        if (COLOUR_FUNCTION.test(value)) problems.push(`${where}: a colour function`)
        if (NAMED_COLOURS.test(value)) problems.push(`${where}: a named colour`)
      }
    }
    expect(problems).toEqual([])
  })

  it("every var() in the app's CSS is a token or a property the app sets itself", () => {
    const declared = new Set<string>()
    for (const file of styleFiles()) for (const name of customProperties(styleText(file)).keys()) declared.add(name)
    // Set inline from the components (style={{ "--lit": … }}).
    for (const rel of appSources) {
      for (const [, name] of readText(join(SRC_DIR, rel)).matchAll(/["']--([a-z0-9-]+)["']/g)) declared.add(name!)
    }
    const unknown: string[] = []
    for (const file of styleFiles()) {
      for (const [, name] of styleText(file).matchAll(/var\(\s*--([a-z0-9-]+)/g)) {
        if (!declared.has(name!)) unknown.push(`${file}: --${name}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it("every colour in the app's TS and TSX is a token value, #000 or currentColor", () => {
    const problems: string[] = []
    for (const rel of appSources) {
      const text = readText(join(SRC_DIR, rel))
      for (const [hex] of text.matchAll(HEX)) {
        const lower = hex.toLowerCase()
        if (lower !== "#000" && !TOKEN_HEXES.has(lower)) problems.push(`${rel}: ${hex}`)
      }
      if (COLOUR_FUNCTION.test(text)) problems.push(`${rel}: a colour function`)
    }
    expect(problems).toEqual([])
  })

  it("the checks catch what they look for", () => {
    expect("color: #ff0000".match(HEX)).toEqual(["#ff0000"])
    expect(COLOUR_FUNCTION.test("rgba(0, 0, 0, .5)")).toBe(true)
    expect(NAMED_COLOURS.test("1px solid white")).toBe(true)
    expect(NAMED_COLOURS.test("var(--panel-hi)")).toBe(false)
    expect(COLOUR_PROPERTY.test("border-bottom")).toBe(true)
  })
})

describe("fonts (Req 30.2)", () => {
  const HOSTS = ["fonts." + "googleapis.com", "fonts." + "gstatic.com"]

  it("main.tsx bundles the four fonts from @fontsource", () => {
    const main = readText(join(SRC_DIR, "main.tsx"))
    for (const font of ["monoton", "josefin-sans", "spectral", "ibm-plex-mono"]) {
      expect(main, font).toMatch(new RegExp(`import\\s+["']@fontsource/${font}/`))
    }
  })

  it("nothing in src/, index.html or vite.config.ts names the Google font hosts", () => {
    const files = [
      ...listFiles(
        SRC_DIR,
        (rel) => /\.(ts|tsx|css|html)$/.test(rel) && !/\.test\.tsx?$/.test(rel) && !rel.startsWith("test/")
      ).map((rel) => join(SRC_DIR, rel)),
      join(APP_DIR, "index.html"),
      join(APP_DIR, "vite.config.ts"),
    ]
    const found = files.flatMap((path) => HOSTS.filter((host) => readText(path).includes(host)).map((h) => `${path}: ${h}`))
    expect(found).toEqual([])
  })
})

describe("art: CSS and inline SVG only (Req 30.3)", () => {
  it("no <img> in the components or index.html", () => {
    const files = listFiles(SRC_DIR, (rel) => rel.endsWith(".tsx") && !rel.endsWith(".test.tsx"))
    const found = files.filter((rel) => /<img\b/i.test(readText(join(SRC_DIR, rel))))
    expect(found).toEqual([])
    expect(readText(join(APP_DIR, "index.html"))).not.toMatch(/<img\b/i)
  })

  // The one exception: public/icons/ holds the install icons named in the web
  // app manifest (and the iOS home-screen icon). A browser will only offer to
  // install an app whose manifest points at image files, so these cannot be
  // CSS or inline SVG. They are not drawn in the app; nothing in src/ uses them.
  it("no image files in the app, except the install icons in public/icons/", () => {
    const images = listFiles(
      APP_DIR,
      (rel) =>
        !rel.startsWith("dist/") &&
        !rel.startsWith("public/icons/") &&
        /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)$/i.test(rel)
    )
    expect(images).toEqual([])
  })

  it("no url() in the app's CSS: nothing is drawn from a file", () => {
    const found = styleFiles().filter((file) => /\burl\(/i.test(styleText(file)))
    expect(found).toEqual([])
  })

  it("no icon library in package.json or in any import", () => {
    const pkg = JSON.parse(readText(join(APP_DIR, "package.json"))) as Record<string, Record<string, string> | undefined>
    const deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    const ICONS = /icon|lucide|fontawesome|heroicons|feather|phosphor|tabler/i
    expect(deps.filter((d) => ICONS.test(d))).toEqual([])
    const imports = appSources.flatMap((rel) =>
      [...readText(join(SRC_DIR, rel)).matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]!).filter((s) => ICONS.test(s) && !s.startsWith("."))
    )
    expect(imports).toEqual([])
  })
})
