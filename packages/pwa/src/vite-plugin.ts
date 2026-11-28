// Vite plugin: at build time, writes manifest.webmanifest and sw.js (with the
// build's file list), and links the manifest and theme colour in index.html.
// In dev nothing is emitted and no worker is registered.
//
// Imports end in .ts because vite.config.ts is loaded by Node itself, which
// does not guess extensions.

import { createHash } from "node:crypto"
import type { Plugin } from "vite"
import { buildManifest, type ManifestOptions } from "./manifest.ts"
import { serviceWorkerSource } from "./sw-source.ts"

export type PwaPluginOptions = Omit<ManifestOptions, "base"> & {
  /** Extra same-origin files to precache, such as the icons (paths from the site root). */
  extraPrecache?: string[]
}

/**
 * Fonts ship as many subsets in two formats; only the Latin WOFF2 files are
 * stored at install. Any other font is stored the first time it is used.
 */
export function shouldPrecache(file: string): boolean {
  if (/\.woff$/.test(file)) return false
  if (/\.woff2$/.test(file)) return /-latin-\d/.test(file)
  return true
}

export function pwa(options: PwaPluginOptions): Plugin {
  let base = "/"
  return {
    name: "decay-engine-pwa",
    apply: "build",
    configResolved(config) {
      base = config.base.endsWith("/") ? config.base : `${config.base}/`
    },
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: `${base}manifest.webmanifest` }, injectTo: "head" },
        { tag: "meta", attrs: { name: "theme-color", content: options.themeColor }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: `${base}icons/apple-touch-icon.png` }, injectTo: "head" },
      ]
    },
    generateBundle(_outputOptions, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith(".map") && shouldPrecache(name))
      const precache = [
        base,
        `${base}manifest.webmanifest`,
        ...files.map((name) => `${base}${name}`),
        ...(options.extraPrecache ?? []).map((path) => `${base}${path.replace(/^\//, "")}`),
      ]
      const unique = [...new Set(precache)]
      const version = createHash("sha256").update(unique.join("\n")).digest("hex").slice(0, 12)
      const { extraPrecache: _extra, ...manifestOptions } = options
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: JSON.stringify(buildManifest({ ...manifestOptions, base }), null, 2),
      })
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: serviceWorkerSource({ version, precache: unique, fallback: base }),
      })
    },
  }
}
