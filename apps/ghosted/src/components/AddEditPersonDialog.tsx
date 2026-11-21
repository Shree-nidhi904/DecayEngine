// Add or edit a person (task 4.10, design section 4.4 AddEditPersonDialog;
// Req 17.1-17.8, 23.3, 24.2, 24.3). Modelled on Study Dungeon's
// AddEditFactDialog, not imported from it (Req 21.1).
//
// The fields and their rules are person-form.ts (validatePerson): name,
// relationship, usual rhythm, last contact (add only), importance and
// minutes. While adding, startsDark (which calls the policy) drives the live
// hint "This window starts dark" before saving (Req 17.3).
//
// Save checks every field. Each error names its field and rule next to the
// field, focus moves to the first invalid field, the input is kept and
// nothing is saved (Req 17.7).
//
// - Add: engine.addItem({ payload, importance, costMinutes }, clock()) with
//   payload.lastContactAt = dayStartOf(date, timeZone) (Req 17.2).
// - Edit: engine.edit(id, changes, clock()) with only what changed: the
//   payload only when name, relationship or rhythm changed, importance and
//   costMinutes only when changed. Nothing changed: Save just closes
//   (Req 17.4). The last contact date is read-only, with "Log a contact to
//   change this" (Req 17.5).
//
// Every save goes through runGatedWrite with previewing() read at that
// moment, so nothing is saved during a preview. A storage problem is shown
// inside the form in a role="alert" paragraph, and the form stays open with
// the input (Req 17.8). Other errors are rethrown.
//
// Focus opens on the title (tabindex -1), never on a button (Req 24.2).

import { useId, useMemo, useRef, useState, type FormEvent } from "react"
import type { GhostedEngine } from "../engine-instance"
import type { BlockedReason } from "../lists"
import { isoDateAt, parseWholeNumber, startsDark, validatePerson, type FieldError, type PersonField, type PersonFormInput } from "../person-form"
import type { Person, PersonPayload } from "../policy"
import { storageProblemText } from "../storage-errors"
import { dayStartOf } from "../time"
import { dialogText, personFormText, previewBlockedText } from "../wording"
import { runGatedWrite } from "../write-guard"
import { StateGlyph } from "./icons"
import { useModalDialog } from "./useModalDialog"
import "../styles/layout.css"
import "../styles/dialogs.css"

export interface AddEditPersonDialogProps {
  engine: Pick<GhostedEngine, "addItem" | "edit">
  /** The real clock: today's date, the starts-dark hint and the time of the save. */
  clock: () => number
  /** Dates and day starts. Tests pass "UTC". */
  timeZone?: string
  /** Omitted: add. */
  person?: Person
  /**
   * Edit only: the last contact the user logged (lastLoggedContactAt), shown
   * read-only. Defaults to the date given when the person was added.
   */
  lastContactAt?: number
  /** Existing relationship tags, offered in a datalist. */
  relationships?: readonly string[]
  /** Set while previewing. The App never opens the form then; Save checks previewing() too. */
  blocked: BlockedReason
  /** Read at the moment of Save (the gate). */
  previewing: () => boolean
  /** After a save: the App announces, marks own people (add) and bumps the version. */
  onSaved: (id: string, mode: "added" | "edited") => void
  /** Cancel, Escape, and after a save. */
  onClose: () => void
}

const FIELD_ORDER: readonly PersonField[] = ["name", "relationship", "rhythmDays", "lastContact", "importance", "costMinutes"]

/** A new person's starting values. Importance 2 and 10 minutes, the same defaults as the import. */
function newInput(today: string): PersonFormInput {
  return { name: "", relationship: "", rhythmDays: "", lastContact: today, importance: 2, costMinutes: "10" }
}

function inputOf(person: Person, lastContact: string): PersonFormInput {
  return {
    name: person.payload.name,
    relationship: person.payload.relationship,
    rhythmDays: String(person.payload.rhythmDays),
    lastContact,
    importance: person.importance,
    costMinutes: String(person.costMinutes),
  }
}

export function AddEditPersonDialog({
  engine,
  clock,
  timeZone,
  person,
  lastContactAt,
  relationships = [],
  blocked,
  previewing,
  onSaved,
  onClose,
}: AddEditPersonDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const editing = person !== undefined
  // Today's date, read once when the form opens.
  const [today] = useState(() => isoDateAt(clock(), timeZone))
  const lockedDate = person !== undefined ? isoDateAt(lastContactAt ?? person.payload.lastContactAt, timeZone) : ""
  const [input, setInput] = useState<PersonFormInput>(() =>
    person !== undefined ? inputOf(person, lockedDate) : newInput(today)
  )
  const [errors, setErrors] = useState<readonly FieldError[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const fieldRefs = useRef<Partial<Record<PersonField, HTMLInputElement | null>>>({})

  const fieldId = (field: PersonField) => `${id}-${field}`
  const errorId = (field: PersonField) => `${id}-${field}-error`
  const errorOf = (field: PersonField) => errors.find((e) => e.field === field)
  const set = <K extends keyof PersonFormInput>(field: K, value: PersonFormInput[K]) =>
    setInput((v) => ({ ...v, [field]: value }))

  // The live hint (Req 17.3), only while adding and only once rhythm and date are valid.
  const darkAtStart = useMemo(() => {
    if (editing) return false
    const problems = validatePerson(input, clock(), timeZone)
    if (problems.some((e) => e.field === "rhythmDays" || e.field === "lastContact")) return false
    return startsDark(parseWholeNumber(input.rhythmDays)!, dayStartOf(input.lastContact.trim(), timeZone), clock())
  }, [editing, input, clock, timeZone])

  const tags = useMemo(
    () => [...new Set(relationships.map((r) => r.trim()).filter((r) => r !== ""))].sort(),
    [relationships]
  )

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const at = clock()
    // Editing never checks the date against today again: it is not editable.
    const found = validatePerson(input, at, timeZone).filter((e) => !(editing && e.field === "lastContact"))
    setErrors(found)
    if (found.length > 0) {
      const first = FIELD_ORDER.find((field) => found.some((e) => e.field === field))!
      fieldRefs.current[first]?.focus()
      return
    }

    const name = input.name.trim()
    const relationship = input.relationship.trim()
    const rhythmDays = parseWholeNumber(input.rhythmDays)!
    const costMinutes = parseWholeNumber(input.costMinutes)!
    const importance = input.importance

    let savedId = person?.id ?? ""
    let write: () => void
    if (person === undefined) {
      const payload: PersonPayload = {
        name,
        relationship,
        rhythmDays,
        lastContactAt: dayStartOf(input.lastContact.trim(), timeZone),
      }
      write = () => {
        savedId = engine.addItem({ payload, importance, costMinutes }, at)
      }
    } else {
      const changes: { payload?: PersonPayload; importance?: number; costMinutes?: number } = {}
      const old = person.payload
      if (name !== old.name || relationship !== old.relationship || rhythmDays !== old.rhythmDays) {
        changes.payload = { ...old, name, relationship, rhythmDays }
      }
      if (importance !== person.importance) changes.importance = importance
      if (costMinutes !== person.costMinutes) changes.costMinutes = costMinutes
      if (Object.keys(changes).length === 0) {
        onClose()
        return
      }
      write = () => engine.edit(person.id, changes, at)
    }

    setSaveError(null)
    const outcome = runGatedWrite(previewing(), write, (problem) => setSaveError(storageProblemText[problem]))
    if (outcome === "blocked") {
      setSaveError(blocked ?? previewBlockedText)
      return
    }
    if (outcome === "storage-problem") return
    onSaved(savedId, editing ? "edited" : "added")
    onClose()
  }

  const describedBy = (field: PersonField, ...extra: string[]) => {
    const ids = [...extra, errorOf(field) === undefined ? "" : errorId(field)].filter((s) => s !== "")
    return ids.length === 0 ? undefined : ids.join(" ")
  }
  const errorText = (field: PersonField) => {
    const error = errorOf(field)
    return error === undefined ? null : (
      <p id={errorId(field)} className="gh-field-error">
        {error.rule}
      </p>
    )
  }
  const register = (field: PersonField) => (el: HTMLInputElement | null) => {
    fieldRefs.current[field] = el
  }

  const titleId = `${id}-title`
  const lockedHintId = `${id}-locked`
  const tagListId = `${id}-tags`

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-person-form"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <form className="gh-form" noValidate onSubmit={onSubmit}>
        <h2 id={titleId} className="gh-dialog-title" tabIndex={-1} data-autofocus>
          {person !== undefined ? personFormText.editTitle(person.payload.name) : personFormText.addTitle}
        </h2>

        <div className="gh-field">
          <label htmlFor={fieldId("name")}>{personFormText.name}</label>
          <input
            ref={register("name")}
            id={fieldId("name")}
            type="text"
            autoComplete="off"
            value={input.name}
            aria-invalid={errorOf("name") !== undefined}
            aria-describedby={describedBy("name")}
            onChange={(e) => set("name", e.target.value)}
          />
          {errorText("name")}
        </div>

        <div className="gh-field">
          <label htmlFor={fieldId("relationship")}>{personFormText.relationship}</label>
          <input
            ref={register("relationship")}
            id={fieldId("relationship")}
            type="text"
            autoComplete="off"
            list={tags.length > 0 ? tagListId : undefined}
            value={input.relationship}
            aria-invalid={errorOf("relationship") !== undefined}
            aria-describedby={describedBy("relationship")}
            onChange={(e) => set("relationship", e.target.value)}
          />
          {tags.length > 0 && (
            <datalist id={tagListId}>
              {tags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          )}
          {errorText("relationship")}
        </div>

        <div className="gh-field-row">
          <div className="gh-field">
            <label htmlFor={fieldId("rhythmDays")}>{personFormText.rhythm}</label>
            <input
              ref={register("rhythmDays")}
              id={fieldId("rhythmDays")}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={input.rhythmDays}
              aria-invalid={errorOf("rhythmDays") !== undefined}
              aria-describedby={describedBy("rhythmDays")}
              onChange={(e) => set("rhythmDays", e.target.value)}
            />
            {errorText("rhythmDays")}
          </div>

          <div className="gh-field">
            <label htmlFor={fieldId("lastContact")}>{personFormText.lastContact}</label>
            {editing ? (
              <>
                <input
                  id={fieldId("lastContact")}
                  type="date"
                  readOnly
                  value={lockedDate}
                  aria-describedby={lockedHintId}
                />
                <p id={lockedHintId} className="gh-field-hint">
                  {personFormText.lastContactLocked}
                </p>
              </>
            ) : (
              <>
                <input
                  ref={register("lastContact")}
                  id={fieldId("lastContact")}
                  type="date"
                  max={today}
                  value={input.lastContact}
                  aria-invalid={errorOf("lastContact") !== undefined}
                  aria-describedby={describedBy("lastContact")}
                  onChange={(e) => set("lastContact", e.target.value)}
                />
                {errorText("lastContact")}
              </>
            )}
          </div>
        </div>

        {!editing && (
          <div aria-live="polite" data-hint="starts-dark">
            {darkAtStart && (
              <p className="gh-field-warning">
                <StateGlyph state="dead" />
                {personFormText.startsDark}
              </p>
            )}
          </div>
        )}

        <div className="gh-field-row">
          <fieldset className="gh-field" aria-describedby={describedBy("importance")}>
            <legend>{personFormText.importance}</legend>
            <div className="gh-radios">
              {[1, 2, 3].map((level) => (
                <label key={level} className="gh-radio">
                  <input
                    ref={level === 1 ? register("importance") : undefined}
                    type="radio"
                    name={`${id}-importance`}
                    value={level}
                    checked={input.importance === level}
                    onChange={() => set("importance", level)}
                  />
                  {level}
                </label>
              ))}
            </div>
            {errorText("importance")}
          </fieldset>

          <div className="gh-field">
            <label htmlFor={fieldId("costMinutes")}>{personFormText.costMinutes}</label>
            <input
              ref={register("costMinutes")}
              id={fieldId("costMinutes")}
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              step={1}
              value={input.costMinutes}
              aria-invalid={errorOf("costMinutes") !== undefined}
              aria-describedby={describedBy("costMinutes")}
              onChange={(e) => set("costMinutes", e.target.value)}
            />
            {errorText("costMinutes")}
          </div>
        </div>

        {saveError !== null && (
          <p className="gh-field-error gh-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="gh-dialog-actions">
          <button type="button" className="gh-button" data-action="cancel" onClick={onClose}>
            {dialogText.cancel}
          </button>
          <button type="submit" className="gh-button gh-button-primary" data-action="save">
            {personFormText.save}
          </button>
        </div>
      </form>
    </dialog>
  )
}
