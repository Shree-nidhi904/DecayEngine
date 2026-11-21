// "Import people" (task 5.3, design sections 4.4 ImportDialog and 9.2;
// Req 21.5, 21.6, 17.1, 23.3, 24.2, 24.3). Adapted from
// apps/study-dungeon/src/components/ImportFactsDialog.tsx; no import from
// apps/study-dungeon (Req 21.1).
//
// Paste one person per line (import-people.ts reads the line; person-form.ts
// checks it). The dialog states the format and that imported people get
// importance 2 and 10 minutes. While you type it shows how many people are
// ready and lists every skipped line as "Line N: <reason>".
//
// "Import" adds each valid line in line order with
// engine.addItem({ payload, importance: 2, costMinutes: 10 }, clock()), each
// through runGatedWrite with previewing() read at that moment, so nothing is
// added during a preview (the toolbar's Import is blocked then too). Each add
// is its own engine save. If the storage fills up part-way, the import stops:
// the people added so far stay, the dialog stays open, says how many were
// added and why it stopped, and keeps the text of every line not added yet.
// Other errors are rethrown.
//
// Changed from the copy: no knowledge choice (people have none); the fixed
// importance and minutes; line-by-line adds that can stop part-way; the
// storage problem shown inside the dialog, as the add form does (Req 17.8),
// instead of the App closing it.
//
// Focus opens on the title (tabindex -1), never on a button (Req 24.2).
// Engine calls: addItem.

import { useId, useMemo, useState, type FormEvent } from "react"
import type { GhostedEngine } from "../engine-instance"
import { IMPORT_COST_MINUTES, IMPORT_IMPORTANCE, parseImport, type ImportedPerson } from "../import-people"
import { storageProblemText } from "../storage-errors"
import { dialogText, importDialogText, importText, previewBlockedText } from "../wording"
import { runGatedWrite } from "../write-guard"
import { useModalDialog } from "./useModalDialog"
import "../styles/layout.css"
import "../styles/dialogs.css"

export interface ImportDialogProps {
  engine: Pick<GhostedEngine, "addItem">
  /** The real clock: "today" for the date rule, a missing date, and the time of each add. */
  clock: () => number
  /** Day starts of the dates. Tests pass "UTC". */
  timeZone?: string
  /** Read at the moment of Import (the gate). */
  previewing: () => boolean
  /** After people were added (also after a stop part-way): the App marks own people, bumps the version, announces. */
  onImported: (added: number) => void
  /** Cancel, Escape, and after a full import. */
  onClose: () => void
}

/** One pasted line: a person, a skipped line with its reason, or neither (blank or #). */
type Line = { raw: string; person?: ImportedPerson; skipped?: string }

/** Reads each line on its own, so every person keeps its line (for "Line N" and for what is left after a stop). */
function readLines(text: string, at: number, timeZone: string | undefined): Line[] {
  return text.split(/\r?\n/).map((raw) => {
    const { people, skipped } = parseImport(raw, at, timeZone)
    return { raw, person: people[0], skipped: skipped[0]?.reason }
  })
}

export function ImportDialog({ engine, clock, timeZone, previewing, onImported, onClose }: ImportDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const [text, setText] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const lines = useMemo(() => readLines(text, clock(), timeZone), [text, clock, timeZone])
  const ready = lines.filter((l) => l.person !== undefined).length
  const skipped = lines.flatMap((l, index) => (l.skipped === undefined ? [] : [{ line: index + 1, reason: l.skipped }]))

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const at = clock()
    const current = readLines(text, at, timeZone)
    if (!current.some((l) => l.person !== undefined)) return
    setProblem(null)

    const added = new Set<number>()
    let stoppedBy: string | null = null
    for (let index = 0; index < current.length; index++) {
      const person = current[index]!.person
      if (person === undefined) continue
      const outcome = runGatedWrite(
        previewing(),
        () => {
          engine.addItem(
            { payload: { ...person }, importance: IMPORT_IMPORTANCE, costMinutes: IMPORT_COST_MINUTES },
            at
          )
        },
        (storageProblem) => {
          stoppedBy = storageProblemText[storageProblem]
        }
      )
      if (outcome === "saved") {
        added.add(index)
        continue
      }
      if (outcome === "blocked") stoppedBy = previewBlockedText
      break
    }

    if (added.size > 0) onImported(added.size)
    if (stoppedBy === null) {
      onClose()
      return
    }
    if (added.size === 0) {
      setProblem(stoppedBy)
      return
    }
    // Keep every line not added yet, so nothing typed is lost.
    setText(current.filter((_, index) => !added.has(index)).map((l) => l.raw).join("\n"))
    setProblem(`${stoppedBy} ${importDialogText.stopped(added.size)}`)
  }

  const titleId = `${id}-title`
  const textId = `${id}-text`
  const helpId = `${id}-help`

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-import"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <form className="gh-form" noValidate onSubmit={onSubmit}>
        <h2 id={titleId} className="gh-dialog-title" tabIndex={-1} data-autofocus>
          {importDialogText.title}
        </h2>
        <div id={helpId}>
          <p className="gh-field-hint">{importText.help}</p>
          <p className="gh-field-hint">{importText.defaults(IMPORT_IMPORTANCE, IMPORT_COST_MINUTES)}</p>
        </div>
        <div className="gh-field">
          <label htmlFor={textId}>{importDialogText.label}</label>
          <textarea
            id={textId}
            rows={8}
            value={text}
            placeholder={importDialogText.placeholder}
            spellCheck={false}
            aria-describedby={helpId}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </div>
        <p className="gh-import-count" role="status">
          {importDialogText.ready(ready)}
        </p>
        {skipped.length > 0 && (
          <ul className="gh-import-skipped">
            {skipped.map((s) => (
              <li key={s.line}>{importDialogText.skipped(s.line, s.reason)}</li>
            ))}
          </ul>
        )}
        {problem !== null && (
          <p className="gh-field-error gh-save-error" role="alert">
            {problem}
          </p>
        )}
        <div className="gh-dialog-actions">
          <button type="button" className="gh-button" data-action="cancel" onClick={onClose}>
            {dialogText.cancel}
          </button>
          <button type="submit" className="gh-button gh-button-primary" data-action="import">
            {importDialogText.submit}
          </button>
        </div>
      </form>
    </dialog>
  )
}
