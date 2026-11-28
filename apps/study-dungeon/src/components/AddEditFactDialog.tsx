// Add or edit a fact (tasks 5.1 and 5.2, Requirement 5).
// - Add: engine.addItem({ payload, importance, costMinutes }, now())
// - Edit: engine.edit(id, { payload, importance, costMinutes }, now()). The
//   knowledge field is not shown; the stored value is passed through unchanged.
// Validation is the pure validateFactForm in ../fact-form.ts. The time comes
// from the injected now(), so tests never read the clock.

import { useId, useState, type FormEvent } from "react"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import {
  ANSWER_MAX,
  COST_OPTIONS,
  IMPORTANCE_OPTIONS,
  KNOWLEDGE_LEVELS,
  QUESTION_MAX,
  WHY_MAX,
  validateFactForm,
  type FactFormErrors,
  type FactFormField,
  type FactFormValues,
} from "../fact-form"
import { factFormText, fieldHelpText } from "../wording"
import { InfoHint } from "./InfoHint"
import { classifyWriteError, storageProblemText } from "../storage-errors"
import { useModalDialog } from "./useModalDialog"
import "../styles/dialogs.css"

export interface AddEditFactDialogProps {
  /** Only addItem and edit are used. Tests pass a real engine on InMemoryAdapter. */
  engine: Pick<StudyDungeonEngine, "addItem" | "edit">
  /** The time to save with. The App passes Date.now; tests pass a fixed time. */
  now: () => number
  /** The fact to edit. Omit it to add a new fact. */
  fact?: Fact
  /** Called after a successful save with the fact's id, before onClose. */
  onSaved: (id: string) => void
  /** Closes the dialog (after a save, on Cancel and on Escape). */
  onClose: () => void
  /**
   * Given any error from engine.addItem or engine.edit. Returns true when the
   * App handled it (a storage problem: the App shows it and closes the
   * dialog); anything else is rethrown.
   */
  onWriteError?: (error: unknown) => boolean
}

const NEW_FACT: FactFormValues = {
  question: "",
  answer: "",
  why: "",
  knowledge: "new",
  importance: 2,
  costMinutes: 2,
}

function valuesOf(fact: Fact): FactFormValues {
  return {
    question: fact.payload.question,
    answer: fact.payload.answer,
    why: fact.payload.why,
    knowledge: fact.payload.knowledge,
    importance: fact.importance,
    costMinutes: fact.costMinutes,
  }
}

export function AddEditFactDialog({ engine, now, fact, onSaved, onClose, onWriteError }: AddEditFactDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const editing = fact !== undefined
  const [values, setValues] = useState<FactFormValues>(() => (fact !== undefined ? valuesOf(fact) : NEW_FACT))
  const [errors, setErrors] = useState<FactFormErrors>({})
  // A storage problem on save (task 18.3). Shown inside the form, which stays
  // open with what was typed: the page behind a modal dialog is inert, so an
  // announcement there may not be heard, and the fix ("remove a fact, try
  // again") should not cost the user their text.
  const [saveError, setSaveError] = useState<string | null>(null)

  const [importanceHelp, setImportanceHelp] = useState(false)
  const [costHelp, setCostHelp] = useState(false)
  const fieldId = (field: FactFormField | "importance-help" | "cost-help") => `${id}-${field}`
  const errorId = (field: FactFormField) => `${id}-${field}-error`
  const set = <K extends FactFormField>(field: K, value: FactFormValues[K]) =>
    setValues((v) => ({ ...v, [field]: value }))

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // When editing, knowledge is never read from the form: the stored value goes through.
    const checked = validateFactForm(fact !== undefined ? { ...values, knowledge: fact.payload.knowledge } : values)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setSaveError(null)
    let savedId: string
    try {
      if (fact !== undefined) {
        engine.edit(fact.id, checked.fact, now())
        savedId = fact.id
      } else {
        savedId = engine.addItem(checked.fact, now())
      }
    } catch (error) {
      // Nothing was saved (the engine guarantees it).
      const problem = classifyWriteError(error)
      if (problem !== null) {
        setSaveError(storageProblemText[problem])
        return
      }
      if (onWriteError?.(error) === true) return
      throw error
    }
    onSaved(savedId)
    onClose()
  }

  // Props shared by every input that can fail validation.
  const describedBy = (field: FactFormField, extra?: string) => {
    const ids = [extra, errors[field] === undefined ? undefined : errorId(field)].filter(Boolean)
    return ids.length === 0 ? undefined : ids.join(" ")
  }
  const errorText = (field: FactFormField) =>
    errors[field] === undefined ? null : (
      <p id={errorId(field)} className="sd-field-error">
        {errors[field]}
      </p>
    )

  const textField = (field: "question" | "answer" | "why", label: string, max: number, required: boolean) => (
    <div className="sd-field">
      <label htmlFor={fieldId(field)}>{label}</label>
      <input
        id={fieldId(field)}
        type="text"
        value={values[field]}
        maxLength={max}
        required={required}
        aria-invalid={errors[field] !== undefined}
        aria-describedby={describedBy(field, `${fieldId(field)}-count`)}
        onChange={(e) => set(field, e.target.value)}
      />
      <span id={`${fieldId(field)}-count`} className="sd-field-count num">
        {factFormText.counter(values[field].length, max)}
      </span>
      {errorText(field)}
    </div>
  )

  return (
    <dialog
      ref={ref}
      className="sd-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <form noValidate onSubmit={onSubmit}>
        <h2 id={`${id}-title`} className="sd-dialog-title">
          {editing ? factFormText.editTitle : factFormText.addTitle}
        </h2>

        {textField("question", factFormText.question, QUESTION_MAX, true)}
        {textField("answer", factFormText.answer, ANSWER_MAX, true)}
        {textField("why", factFormText.why, WHY_MAX, false)}

        {!editing && (
          <fieldset className="sd-field sd-choices" aria-describedby={describedBy("knowledge")}>
            <legend>{factFormText.knowledge}</legend>
            {KNOWLEDGE_LEVELS.map((level) => (
              <label key={level} className="sd-choice">
                <input
                  type="radio"
                  name={`${id}-knowledge`}
                  value={level}
                  checked={values.knowledge === level}
                  onChange={() => set("knowledge", level)}
                />
                {factFormText.knowledgeLevels[level]}
              </label>
            ))}
            {errorText("knowledge")}
          </fieldset>
        )}

        <div className="sd-field-row">
          <div className="sd-field">
            <div className="sd-field-label-row">
              <label htmlFor={fieldId("importance")}>{factFormText.importance}</label>
              <InfoHint
                buttonLabel={fieldHelpText.show(factFormText.importance)}
                note={fieldHelpText.importance}
                noteId={fieldId("importance-help")}
                onToggle={setImportanceHelp}
              />
            </div>
            <select
              id={fieldId("importance")}
              value={String(values.importance)}
              aria-invalid={errors.importance !== undefined}
              aria-describedby={describedBy("importance", importanceHelp ? fieldId("importance-help") : undefined)}
              onChange={(e) => set("importance", Number(e.target.value))}
            >
              {IMPORTANCE_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            {errorText("importance")}
          </div>
          <div className="sd-field">
            <div className="sd-field-label-row">
              <label htmlFor={fieldId("costMinutes")}>{factFormText.cost}</label>
              <InfoHint
                buttonLabel={fieldHelpText.show(factFormText.cost)}
                note={fieldHelpText.cost}
                noteId={fieldId("cost-help")}
                onToggle={setCostHelp}
              />
            </div>
            <select
              id={fieldId("costMinutes")}
              value={String(values.costMinutes)}
              aria-invalid={errors.costMinutes !== undefined}
              aria-describedby={describedBy("costMinutes", costHelp ? fieldId("cost-help") : undefined)}
              onChange={(e) => set("costMinutes", Number(e.target.value))}
            >
              {COST_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  {factFormText.costOption(n)}
                </option>
              ))}
            </select>
            {errorText("costMinutes")}
          </div>
        </div>

        {saveError !== null && (
          <p className="sd-field-error sd-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="sd-dialog-actions">
          <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
            {factFormText.cancel}
          </button>
          <button type="submit" className="sd-button sd-button-primary">
            {editing ? factFormText.submitEdit : factFormText.submitAdd}
          </button>
        </div>
      </form>
    </dialog>
  )
}
