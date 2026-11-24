// Reads chosen backup files in the page (extensions spec, Requirement 10).
// Each file is read on its own: one that cannot be read is listed with a
// reason and the others still load. A second file for the same app replaces
// the first, and the note says so. Nothing is uploaded.

import type { Source } from "@decay-engine/life-triage"
import { loadBackup } from "./load"
import { ltText } from "./text"

/** What the page needs from a File: its name and its text. */
export type FileLike = { name: string; text: () => Promise<string> }

export async function readBackupFiles(
  files: ReadonlyArray<FileLike>,
  existing: ReadonlyArray<Source>
): Promise<{ sources: Source[]; notes: string[] }> {
  const next = new Map(existing.map((s) => [s.label, s]))
  const notes: string[] = []
  for (const file of files) {
    let text: string
    try {
      text = await file.text()
    } catch {
      notes.push(ltText.unreadable(file.name))
      continue
    }
    const r = loadBackup(text)
    if (r.ok) {
      const replaces = next.has(r.label)
      next.set(r.label, { label: r.label, engine: r.engine })
      notes.push(ltText.loaded(file.name, r.label, r.count, replaces))
    } else {
      notes.push(ltText.refused(file.name, r.reason))
    }
  }
  return { sources: [...next.values()], notes }
}
