// Reads source files as text for the source checks (task 2.9): the files are
// never imported, only read. Paths come from this file's own location, so the
// checks work from any working directory.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

// import.meta.url is passed as a string: in the jsdom test environment `new URL(...)` is
// jsdom's own URL class, which Node's fileURLToPath rejects ("The URL must be of scheme file").
const HERE = dirname(fileURLToPath(import.meta.url))
/** apps/ghosted/src */
export const SRC_DIR = resolve(HERE, "..")
/** apps/ghosted */
export const APP_DIR = resolve(HERE, "../..")
/** The repository root. */
export const REPO_DIR = resolve(HERE, "../../../..")

/** Every file under `dir` (recursively, skipping node_modules) for which `keep(relativePath)` is true, sorted. Paths use "/". */
export function listFiles(dir: string, keep: (relativePath: string) => boolean): string[] {
  const found: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        const rel = relative(dir, full).split(sep).join("/")
        if (keep(rel)) found.push(rel)
      }
    }
  }
  walk(dir)
  return found.sort()
}

export function readText(path: string): string {
  return readFileSync(path, "utf8")
}

/** 1-based line numbers of `text` whose content matches `pattern` (a non-global RegExp). */
export function matchingLines(text: string, pattern: RegExp): number[] {
  return text
    .split(/\r?\n/)
    .flatMap((line, index) => (pattern.test(line) ? [index + 1] : []))
}
