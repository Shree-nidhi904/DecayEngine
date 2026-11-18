// The challenge of a dead fact (task 7.2, Requirement 8.6-8.9).
// Shows the question and the answer, with "I knew it" and "I forgot".
// Both call engine.resurrect(id, { kind: "review", correct }, now()), so a
// failure is recorded in history as resurrect-failed.
// Success shows "Resurrected! New half-life: X days", with X read from the
// engine after the resurrect; failure shows the outcome's reason.
// "Walk away" (and Escape) before answering closes without calling the engine.

import { useRef, useState } from "react"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import { challengeText, studyDungeonWording } from "../wording"
import { useModalDialog } from "./useModalDialog"
import "../styles/dialogs.css"

export interface ChallengeDialogProps {
  /** resurrect, and view to read the half-life afterwards. Tests pass a real engine on InMemoryAdapter. */
  engine: Pick<StudyDungeonEngine, "resurrect" | "view">
  /** The time to resurrect at. The App passes Date.now; tests pass a fixed time. */
  now: () => number
  /** The dead fact to challenge. */
  fact: Fact
  /** Called after the engine saved the outcome, so the App reads the lists again. */
  onWrite: () => void
  /** Closes the dialog (Walk away, Close and Escape). */
  onClose: () => void
}

type Result = { ok: true; halfLifeDays: number } | { ok: false; reason: string }

export function ChallengeDialog({ engine, now, fact, onWrite, onClose }: ChallengeDialogProps) {
  const ref = useModalDialog()
  const [result, setResult] = useState<Result | null>(null)
  // Guards against a second answer before React re-renders.
  const answered = useRef(false)

  function answer(correct: boolean) {
    if (answered.current) return
    answered.current = true
    const at = now()
    const outcome = engine.resurrect(fact.id, { kind: "review", correct }, at)
    onWrite()
    if (!outcome.ok) {
      setResult({ ok: false, reason: outcome.reason })
      return
    }
    const revived = engine.view(at).find((item) => item.id === fact.id)
    if (revived === undefined) {
      throw new Error(`ChallengeDialog: fact ${fact.id} is missing right after its resurrect`)
    }
    setResult({ ok: true, halfLifeDays: revived.policyData.halfLifeDays })
  }

  return (
    <dialog
      ref={ref}
      className="sd-dialog sd-challenge"
      aria-labelledby="sd-challenge-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="sd-challenge-title" className="sd-dialog-title">
        {studyDungeonWording.actions.resurrect}
      </h2>

      <p className="sd-dialog-label">{challengeText.question}</p>
      <p className="sd-dialog-question">{fact.payload.question}</p>
      <p className="sd-dialog-label">{challengeText.answer}</p>
      <p className="sd-dialog-answer">{fact.payload.answer}</p>

      <p
        role="status"
        className="sd-result"
        data-result={result === null ? undefined : result.ok ? "resurrected" : "stays-dead"}
      >
        {result === null ? "" : result.ok ? challengeText.resurrected(result.halfLifeDays) : result.reason}
      </p>

      <div className="sd-dialog-actions">
        {result === null ? (
          <>
            <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
              {challengeText.walkAway}
            </button>
            <button type="button" className="sd-button sd-button-wrong" onClick={() => answer(false)}>
              {challengeText.forgot}
            </button>
            <button type="button" className="sd-button sd-button-revive" onClick={() => answer(true)}>
              {challengeText.knewIt}
            </button>
          </>
        ) : (
          <button type="button" className="sd-button sd-button-primary" autoFocus onClick={onClose}>
            {challengeText.close}
          </button>
        )}
      </div>
    </dialog>
  )
}
