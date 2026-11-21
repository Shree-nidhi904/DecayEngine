// Reconnect a dark window (task 4.9, design section 4.4 ReconnectDialog;
// Req 14.1-14.6, 4.3, 16.5, 24.2, 25.2). Modelled on Study Dungeon's
// ChallengeDialog, not imported from it (Req 21.1).
//
// The dialog shows the boarded window and asks "Which contact happened?":
// "Sent a message", "Had a call" or "Met up", plus a quiet Cancel. There is
// no "No reply yet": the policy has no event kind for it (Req 14.5).
//
// Picking one calls write(() => engine.resurrect(id, { kind }, clock())).
// On { ok: true } the window is lit again (state "litAgain", health 100, as
// the engine sets it, Req 4.3), its boards get data-boards="falling" and the
// relight flash, and the text says "<first name>'s window is lit again.
// Freshness is 100." The boards falling and the flash run only inside
// prefers-reduced-motion: no-preference (motion.css); under reduced motion
// the static rule hides the falling boards at once, so the lit window and
// the same text show straight away (Req 14.4, 25.2).
//
// { ok: false } cannot come from the Ghosted policy (Req 4.2); if it does,
// its reason is shown as it is. ITEM_NOT_DEAD is a bug and is rethrown (the
// App's write rethrows every error that is not a storage problem).
// Focus opens on the question line, then moves to the result.

import { useEffect, useId, useRef, useState } from "react"
import type { GhostedEngine } from "../engine-instance"
import { firstName, type BlockedReason } from "../lists"
import type { ContactEvent, Person } from "../policy"
import { contactChoice, dialogText, reconnectText } from "../wording"
import type { WriteOutcome } from "../write-guard"
import { useModalDialog } from "./useModalDialog"
import { Window } from "./Window"
import "../styles/layout.css"
import "../styles/dialogs.css"

type ContactKind = ContactEvent["kind"]

/** The options, in the order the user sees them (Req 14.1). */
const KINDS: readonly ContactKind[] = ["text", "call", "meetup"]

export type ReconnectResult = { ok: true; kind: ContactKind } | { ok: false; reason: string }

export interface ReconnectDialogProps {
  engine: Pick<GhostedEngine, "resurrect">
  /** The real clock: the time of the reconnect. */
  clock: () => number
  /** Dead when opened. */
  person: Person
  /** Live: set while previewing; every option shows it and does nothing. */
  blocked: BlockedReason
  /** The App's runGatedWrite, bound to its preview ref and its announcer. */
  write: (w: () => void) => WriteOutcome
  /** Called after the engine saved the reconnect (or its refusal). */
  onWrite: () => void
  onResult?: (result: ReconnectResult) => void
  /** Cancel, Done and Escape. */
  onClose: () => void
}

type Step = { step: "choose" } | { step: "lit" } | { step: "refused"; reason: string }

export function ReconnectDialog({ engine, clock, person, blocked, write, onWrite, onResult, onClose }: ReconnectDialogProps) {
  const ref = useModalDialog()
  const id = useId()
  const titleId = `${id}-title`
  const blockedId = `${id}-blocked`
  const resultRef = useRef<HTMLParagraphElement>(null)
  const [state, setState] = useState<Step>({ step: "choose" })
  // Guards against a second pick before React re-renders.
  const picked = useRef(false)

  const name = person.payload.name
  const first = firstName(name)

  useEffect(() => {
    if (state.step !== "choose") resultRef.current?.focus()
  }, [state.step])

  function pick(kind: ContactKind) {
    if (blocked !== undefined || picked.current) return
    picked.current = true
    const box: { result?: ReturnType<GhostedEngine["resurrect"]> } = {}
    const outcome = write(() => {
      box.result = engine.resurrect(person.id, { kind }, clock())
    })
    const done = box.result
    if (outcome !== "saved" || done === undefined) {
      // Blocked by a preview, or a storage problem the App has reported: nothing changed.
      picked.current = false
      return
    }
    // Saved either way: the reconnect, or the engine's "resurrect-failed" entry.
    onWrite()
    if (done.ok) {
      setState({ step: "lit" })
      onResult?.({ ok: true, kind })
    } else {
      setState({ step: "refused", reason: done.reason })
      onResult?.({ ok: false, reason: done.reason })
    }
  }

  const lit = state.step === "lit"

  return (
    <dialog
      ref={ref}
      className="gh-dialog gh-reconnect"
      aria-labelledby={titleId}
      data-step={state.step}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id={titleId} className="gh-dialog-title">
        {reconnectText.title(name)}
      </h2>
      <div className="gh-dialog-art">
        {lit ? (
          <Window health={100} state="litAgain" size="dialog" boards="falling" relight />
        ) : (
          <Window health={0} state="dead" size="dialog" />
        )}
      </div>

      {state.step === "choose" && (
        <>
          <p className="gh-dialog-question" tabIndex={-1} data-autofocus>
            {reconnectText.question}
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
                  <span className="gh-choice-kind">{contactChoice[kind]}</span>
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
        <p ref={resultRef} role="status" className="gh-dialog-result" tabIndex={-1} data-autofocus>
          {lit ? reconnectText.success(first) : state.step === "refused" ? state.reason : ""}
        </p>
      )}

      <div className="gh-dialog-actions">
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
