#!/usr/bin/env node
// Checks that the optional sync code stays out of every app's DEFAULT bundle.
//
// Each app's dist/index.html names the files the page loads at once: the entry
// script and any modulepreload links. None of those may contain the Supabase
// client, and at least one OTHER file in dist/assets must (the lazy chunk), so the
// check cannot pass just because the split stopped working or the markers changed.
//
// Run after the builds:  node scripts/check-bundles.mjs [dist-dir ...]
// With no arguments it checks apps/{study-dungeon,ghosted,life-triage}/dist.
// Exit 0: all fine. Exit 1: a default bundle holds sync code, or no lazy chunk has it.
// Exit 2: a dist folder is missing (build first).
//

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

/** Names that only the Supabase client (and not the apps' own code) contains. */
export const MARKERS = ["GoTrueClient", "PostgrestClient", "@supabase/supabase-js"]

/** The JS files index.html loads straight away: module scripts and modulepreload links. */
export function eagerScripts(html) {
  const found = new Set()
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    const isScript = /^<script\b/.test(tag) && /\btype="module"/.test(tag)
    const isPreload = /^<link\b/.test(tag) && /\brel="modulepreload"/.test(tag)
    if (!isScript && !isPreload) continue
    const ref = /\b(?:src|href)="([^"]+)"/.exec(tag)?.[1]
    if (ref && /\.m?js$/.test(ref) && !/^https?:/.test(ref)) found.add(ref.replace(/^\//, ""))
  }
  return [...found]
}

export const holdsSyncCode = (text) => MARKERS.some((m) => text.includes(m))

/** Returns a list of problems for one dist folder (empty when fine). */
export function checkDist(dist) {
  const problems = []
  const html = readFileSync(join(dist, "index.html"), "utf8")
  const eager = eagerScripts(html)
  if (eager.length === 0) return [`${dist}: index.html loads no module script`]
  for (const file of eager) {
    if (holdsSyncCode(readFileSync(join(dist, file), "utf8"))) problems.push(`${dist}: default bundle ${file} contains the sync client`)
  }
  const assets = join(dist, "assets")
  const lazy = readdirSync(assets).filter((f) => f.endsWith(".js") && !eager.includes(`assets/${f}`))
  if (!lazy.some((f) => holdsSyncCode(readFileSync(join(assets, f), "utf8")))) {
    problems.push(`${dist}: no separate chunk holds the sync client (the lazy split is gone, or the markers changed)`)
  }
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(new URL("..", import.meta.url).pathname)
  const dirs = process.argv.length > 2 ? process.argv.slice(2) : ["study-dungeon", "ghosted", "life-triage"].map((a) => join(root, "apps", a, "dist"))
  let failed = false
  for (const dir of dirs) {
    if (!existsSync(join(dir, "index.html"))) {
      console.error(`${dir}: not built`)
      process.exit(2)
    }
    const problems = checkDist(dir)
    for (const p of problems) console.error(p)
    if (problems.length > 0) failed = true
  }
  console.log(failed ? "sync code found in a default bundle" : `default bundles are free of the sync client (${dirs.length} apps, lazy chunk present in each)`)
  process.exit(failed ? 1 : 0)
}
