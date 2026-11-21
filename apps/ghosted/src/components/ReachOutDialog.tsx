// Reach out logs a real action (task 4.8, design section 4.4 ReachOutDialog;
// Req 18.1-18.5, 9.5, 24.2, 24.3). Modelled on Study Dungeon's FightDialog,
// not imported from it (Req 21.1).
//
// On open, the person is read settled at t = clock() (engine.view(t)), and
// each choice's effect comes from ghostedPolicy.applyEvent on that item:
// pure, nothing saved, no formula repeated here. The three choices, "Sent a
// message", "Had a call" and "Met up", each show "Freshness a → b". There is
// no control that logs a contact without one of them (Req 18.3).
//
// Picking one calls write(() => engine.tend(id, { kind }, clock())). The
// App's write is runGatedWrite: blocked while previewing, a storage problem
// is reported by the App (which closes this dialog), anything else is
// rethrown. If the window went dark since the dialog opened, tend throws
// ITEM_ALREADY_DEAD after saving the death: the dialog says so, and the card
// offers Reconnect next time.
//
// Focus opens on the question line (tabindex -1), then moves to the result.
// Cancel (quiet) before the pick, Done (the one filled button) after it;
// Escape does the same as either.

import { useEffect, useId, useRef, useState } from "react"
import { DecayEngineError } from "@decay-engine/engine"
import type { GhostedEngine } from "../engine-instance"
import { firstName, shownFreshness, type BlockedReason } from "../lists"
import { ghostedPolicy, type ContactEvent, type Person } from "../policy"
import { contactChoice, dialogText, reachOutText } from "../wording"
import type { WriteOutcome } from "../write-guard"
import { useModalDialog } from "./useModalDialog"
import "../styles/layout.css"
import "../styles/dialogs.css"

type ContactKind = ContactEvent["kind"]

/** The choices, in the order the user sees them (Req 18.1). */
const KINDS: readonly ContactKind[] = ["text", "call", "meetup"]

export type ReachOutResult = { kind: ContactKind; before: number; after: number } | { wentDark: true }

export interface ReachOutDialogProps {
  engine: Pick<GhostedEngine, "tend" | "view">
  /** The real clock: the time read on open and the time of the tend. */
  clock: () => number
  /** Alive or weak when opened. */
  person: Person
  /** Live: set while previewing; every choice shows it and does nothing. */
  blocked: BlockedReason
  /** In a Triage session: "Person N of M" and "Stop session" (Req 9.5). */
  session?: { position: number; total: number; onStop: () => void }
  /** The App's runGatedWrite, bound to its preview ref and its announcer. */
  write: (w: () => void) => WriteOutcome
  /** Called after the engine saved something (a contact, or the death found at the pick). */
  onWrite: () => void
  onResult?: (result: ReachOutResult) => void
  /** Cancel, Done, Close and Escape. */
  onClose: () => void
  /** "Reach out again by <date>": the App's date formatter. */
  formatDate: (ms: number) => string
}

type Preview = { before: number; after: Record<ContactKind, number> }

type Step =
  | { step: "choose" }
  | { step: "done"; kind: ContactKind; before: number; after: number; nextAt: number | null }
  | { step: "dark" }

/** The person settled at t, with each contact's effect from the policy. Null when not found or dark. */
function previewAt(engine: Pick<GhostedEngine, "view">, id: string, t: number): Preview | null {
  const settled = engine.view(t).find((p) => p.id === id)
  if (settled === undefined || settled.state === "dead") return null
  const after = {} as Record<ContactKind, number>
  for (const kind of KINDS) after[kind] = shownFreshness(ghostedPolicy.applyEvent(settled, { kind }, t).health)
  return { before: shownFreshness(settled.health), after }
}

export function ReachOutDialog({
  engine,
  clock,
  person,
  blocked,
  session,
  write,
  onWrite,
  onResult,
  onClose,
  formatDate,
}: ReachOutDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const titleId = `${id}-title`
  const blockedId = `${id}-blocked`
  const resultRef = useRef<HTMLParagraphElement>(null)
  // Read once, when the dialog opens.
  const [preview] = useState(() => previewAt(engine, person.id, clock()))
  const [state, setState] = useState<Step>(() => (preview === null ? { step: "dark" } : { step: "choose" }))
  // Guards against a second pick before React re-renders.
  const picked = useRef(false)

  const name = person.payload.name
  const first = firstName(name)

  // The result takes focus when it replaces the choices.
  useEffect(() => {
    if (state.step !== "choose") resultRef.current?.focus()
  }, [state.step])

  function pick(kind: ContactKind) {
    if (blocked !== undefined || picked.current || preview === null) return
    picked.current = true
    const at = clock()
    let outcome: WriteOutcome
    try {
      outcome = write(() => engine.tend(person.id, { kind }, at))
    } catch (error) {
      // The window went dark between opening and picking. The engine saved
      // the death and logged no contact.
      if (error instanceof DecayEngineError && error.code === "ITEM_ALREADY_DEAD") {
        onWrite()
        setState({ step: "dark" })
        onResult?.({ wentDark: true })
        return
      }
      throw error
    }
    if (outcome !== "saved") {
      // Blocked by a preview, or a storage problem the App has reported: nothing changed.
      picked.current = false
      return
    }
    onWrite()
    const updated = engine.view(at).find((p) => p.id === person.id)
    const after = updated === undefined ? preview.after[kind] : shownFreshness(updated.health)
    const nextAt = updated === undefined ? null : ghostedPolicy.nextDueAt(updated, at)
    setState({ step: "done", kind, before: preview.before, after, nextAt })
    onResult?.({ kind, before: preview.before, after })
  }

  const resultText =
    state.step === "dark"
      ? reachOutText.wentDark(name)
      : state.step === "done"
        ? state.kind === "text"
          ? reachOutText.brighter(first, state.before, state.after)
          : reachOutText.litAgain(first)
        : ""

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-reach-out"
      aria-labelledby={titleId}
      data-step={state.step}
      onCancel={(event) => {
        // Escape: Cancel before the pick, Done after it.
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id={titleId} className="gh-dialog-title">
        {reachOutText.title(name)}
      </h2>
      {session !== undefined && (
        <p className="gh-dialog-progress">{reachOutText.progress(session.position, session.total)}</p>
      )}

      {state.step === "choose" && preview !== null && (
        <>
          <p className="gh-dialog-question" tabIndex={-1} data-autofocus>
            {reachOutText.question(first)}
          </p>
          <ul className="gh-choices">
            {KINDS.map((kind) => (
              <li key={kind}>
                <button
                  type="button"
                  className="gh-choice"
                  data-kind={kind}
                  aria-disabled={blocked !== undefined ? "true" : undefined}
                  aria-describedby={blocked !== undefined ? blockedId : undefined}
                  title={blocked}
                  onClick={() => pick(kind)}
                >
                  <span className="gh-choice-kind">{contactChoice[kind]}</span>{" "}
                  <span className="gh-choice-effect gh-number">
                    {reachOutText.effect(preview.before, preview.after[kind])}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {blocked !== undefined && (
            <p id={blockedId} className="gh-dialog-blocked">
              {blocked}
            </p>
          )}
        </>
      )}

      {state.step !== "choose" && (
        <>
          <p ref={resultRef} role="status" className="gh-dialog-result" tabIndex={-1} data-autofocus>
            {resultText}
          </p>
          {state.step === "done" && state.nextAt !== null && (
            <p className="gh-dialog-more">{reachOutText.nextBy(formatDate(state.nextAt))}</p>
          )}
        </>
      )}

      <div className="gh-dialog-actions">
        {session !== undefined && (
          <button type="button" className="gh-button" data-action="stop" onClick={session.onStop}>
            {reachOutText.stopSession}
          </button>
        )}
        {state.step === "choose" ? (
          <button type="button" className="gh-button" data-action="cancel" onClick={onClose}>
            {dialogText.cancel}
          </button>
        ) : (
          <button type="button" className="gh-button gh-button-primary" data-action="done" onClick={onClose}>
            {dialogText.done}
          </button>
        )}
      </div>
    </dialog>
  )
}
