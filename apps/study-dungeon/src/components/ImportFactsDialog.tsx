// "Import facts": paste many facts at once (import-facts.ts), choose how well
// you know them, see what will be added and what is skipped, then add them
// all with engine.addItem at the real time.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { useId, useMemo, useState, type FormEvent } from "react"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Knowledge } from "../policy"
import { KNOWLEDGE_LEVELS } from "../fact-form"
import { parseImport } from "../import-facts"
import { factFormText, importText } from "../wording"
import { useModalDialog } from "./useModalDialog"
import "../styles/dialogs.css"

export interface ImportFactsDialogProps {
  engine: Pick<StudyDungeonEngine, "addItem">
  now: () => number
  /** Called once after adding, with how many were added. */
  onImported: (count: number) => void
  onClose: () => void
  /** Storage problems: true when the App handled it (the dialog then stays quiet). */
  onWriteError?: (error: unknown) => boolean
}

export function ImportFactsDialog({ engine, now, onImported, onClose, onWriteError }: ImportFactsDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const [text, setText] = useState("")
  const [knowledge, setKnowledge] = useState<Knowledge>("new")
  const parsed = useMemo(() => parseImport(text), [text])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (parsed.facts.length === 0) return
    const at = now()
    let added = 0
    try {
      for (const fact of parsed.facts) {
        engine.addItem({ payload: { ...fact, knowledge }, importance: 2, costMinutes: 2 }, at)
        added++
      }
    } catch (error) {
      if (added > 0) onImported(added)
      if (onWriteError?.(error) === true) return
      throw error
    }
    onImported(added)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="sd-dialog sd-import"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <form noValidate onSubmit={submit}>
        <h2 id={`${id}-title`} className="sd-dialog-title">
          {importText.title}
        </h2>
        <p className="sd-import-help">{importText.help}</p>
        <div className="sd-field">
          <label htmlFor={`${id}-text`}>{importText.label}</label>
          <textarea
            id={`${id}-text`}
            rows={8}
            value={text}
            placeholder={importText.placeholder}
            spellCheck={false}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </div>
        <fieldset className="sd-field sd-choices">
          <legend>{factFormText.knowledge}</legend>
          {KNOWLEDGE_LEVELS.map((level) => (
            <label key={level} className="sd-choice">
              <input
                type="radio"
                name={`${id}-knowledge`}
                value={level}
                checked={knowledge === level}
                onChange={() => setKnowledge(level)}
              />
              {factFormText.knowledgeLevels[level]}
            </label>
          ))}
        </fieldset>
        <p className="sd-import-count" role="status">
          {importText.ready(parsed.facts.length)}
        </p>
        {parsed.skipped.length > 0 && (
          <ul className="sd-import-skipped">
            {parsed.skipped.slice(0, 5).map((s) => (
              <li key={s.line}>{importText.skipped(s.line, s.reason)}</li>
            ))}
            {parsed.skipped.length > 5 && <li>{importText.more(parsed.skipped.length - 5)}</li>}
          </ul>
        )}
        <div className="sd-dialog-actions">
          <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
            {factFormText.cancel}
          </button>
          <button type="submit" className="sd-button sd-button-primary" disabled={parsed.facts.length === 0}>
            {importText.submit(parsed.facts.length)}
          </button>
        </div>
      </form>
    </dialog>
  )
}
