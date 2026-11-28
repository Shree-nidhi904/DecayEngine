// Reads chosen backup files in the page (extensions spec, Requirement 10).
// Each file is read on its own: one that cannot be read is listed with a
// reason and the others still load. A second file for the same app replaces
// the first, and the note says so. Nothing is uploaded.

import type { Source } from "@decay-engine/life-triage"
import { loadBackup } from "./load"
import { ltText } from "./text"

/** What the page needs from a File: its name and its text. */
export type FileLike = { name: string; text: () => Promise<string> }

/**
 * `expected` is the box the file was dropped in. The file itself still says
 * which app it is from; when it is the other app, it is loaded as that app and
 * a note says so.
 */
export async function readBackupFiles(
  files: ReadonlyArray<FileLike>,
  existing: ReadonlyArray<Source>,
  expected?: string
): Promise<{ sources: Source[]; notes: string[]; counts: Record<string, number> }> {
  const counts: Record<string, number> = {}
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
      counts[r.label] = r.count
      notes.push(ltText.loaded(file.name, r.label, r.count, replaces))
      if (expected !== undefined && expected !== r.label) notes.push(ltText.wrongSlot(file.name, r.label))
    } else {
      notes.push(ltText.refused(file.name, r.reason))
    }
  }
  return { sources: [...next.values()], notes, counts }
}
