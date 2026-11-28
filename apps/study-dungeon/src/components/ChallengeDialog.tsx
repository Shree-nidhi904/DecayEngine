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
import type { SoundPlayer } from "../sound"
import { challengeText, studyDungeonWording } from "../wording"
import { useModalDialog } from "./useModalDialog"
import { useFocusResult } from "./useFocusResult"
import { DialogFoe } from "./DialogFoe"
import { AnswerPanel } from "./AnswerPanel"
import { Sparks } from "./art/Particles"
import { Ritual } from "./Haunt"
import type { AnswerCheck } from "../answer-check"
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
  /**
   * Plays "revive" after a successful challenge and "wrong" after a failed
   * one (task 20.2). The App passes its one player, which stays silent while
   * sound is off; tests pass a fake. No sound when omitted.
   */
  sound?: SoundPlayer
  /** Told how the challenge ended, after the engine saved it; the App announces it. */
  onResult?: (result: ChallengeResult) => void
  /**
   * Given any error from engine.resurrect. Returns true when the App handled
   * it (a storage problem: the App shows it and closes the dialog); anything
   * else is rethrown.
   */
  onWriteError?: (error: unknown) => boolean
  /** How the answer is checked (answer-check.ts). "self" (the default here) shows the answer and asks. */
  check?: AnswerCheck
  /** The options when check is "choices"; null or omitted means type the answer. */
  choices?: string[] | null
}

/** How a challenge ended: back with this half-life, or still dead and why. */
export type ChallengeResult = { ok: true; halfLifeDays: number } | { ok: false; reason: string }

export function ChallengeDialog({
  engine,
  now,
  fact,
  onWrite,
  onClose,
  sound,
  onResult,
  onWriteError,
  check = "self",
  choices = null,
}: ChallengeDialogProps) {
  const checked = check !== "self"
  const ref = useModalDialog()
  const [result, setResult] = useState<ChallengeResult | null>(null)
  const resultRef = useFocusResult(result !== null)
  // Guards against a second answer before React re-renders.
  const answered = useRef(false)

  function answer(correct: boolean) {
    if (answered.current) return
    answered.current = true
    const at = now()
    let outcome: ReturnType<ChallengeDialogProps["engine"]["resurrect"]>
    try {
      outcome = engine.resurrect(fact.id, { kind: "review", correct }, at)
    } catch (error) {
      // Nothing was saved (the engine guarantees it), so no sound and no result.
      if (onWriteError?.(error) === true) return
      throw error
    }
    onWrite()
    if (!outcome.ok) {
      sound?.play("wrong")
      const failed: ChallengeResult = { ok: false, reason: outcome.reason }
      setResult(failed)
      onResult?.(failed)
      return
    }
    const revived = engine.view(at).find((item) => item.id === fact.id)
    if (revived === undefined) {
      throw new Error(`ChallengeDialog: fact ${fact.id} is missing right after its resurrect`)
    }
    sound?.play("revive")
    const back: ChallengeResult = { ok: true, halfLifeDays: revived.policyData.halfLifeDays }
    setResult(back)
    onResult?.(back)
  }

  return (
    <dialog
      ref={ref}
      className="sd-dialog sd-challenge"
      data-result={result === null ? undefined : result.ok ? "resurrected" : "stays-dead"}
      aria-labelledby="sd-challenge-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="sd-dialog-head">
        <h2 id="sd-challenge-title" className="sd-dialog-title">
          {studyDungeonWording.actions.resurrect}
        </h2>
        <DialogFoe
          fact={fact}
          mood={result?.ok === true ? "happy" : "feral"}
          quip={
            result === null
              ? "You let me rot. Prove you still know it."
              : result.ok
                ? "You brought me back. Now rebuild the memory."
                : "The grave holds me. Try again when you remember."
          }
          fx={result === null ? "popin" : result.ok ? "rise" : "lunge"}
        />
        {/* Haunt pass (Req 4): the rune ring, the spirits and the stamp. Art only; the result line says it. */}
        {result?.ok === true && <Ritual />}
      </div>

      <p className="sd-dialog-label">{challengeText.question}</p>
      <p className="sd-dialog-question">{fact.payload.question}</p>
      {checked && (
        <AnswerPanel
          choices={check === "choices" ? choices : null}
          explainTyped={check === "choices" && choices === null}
          answer={fact.payload.answer}
          answered={result !== null}
          onAnswer={answer}
        />
      )}
      {(!checked || (result !== null && !(check === "choices" && choices !== null))) && (
        <>
          <p className="sd-dialog-label">{challengeText.answer}</p>
          <p className="sd-dialog-answer">{fact.payload.answer}</p>
        </>
      )}

      <p
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="sd-result"
        data-result={result === null ? undefined : result.ok ? "resurrected" : "stays-dead"}
      >
        {result === null ? "" : result.ok ? challengeText.resurrected(result.halfLifeDays) : result.reason}
      </p>
      {result?.ok === true && <Sparks color="#9cf26b" />}

      <div className="sd-dialog-actions">
        {result === null ? (
          <>
            <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
              {challengeText.walkAway}
            </button>
            {!checked && (
              <>
                <button type="button" className="sd-button sd-button-wrong" onClick={() => answer(false)}>
                  {challengeText.forgot}
                </button>
                <button type="button" className="sd-button sd-button-revive" onClick={() => answer(true)}>
                  {challengeText.knewIt}
                </button>
              </>
            )}
          </>
        ) : (
          <button type="button" className="sd-button sd-button-primary" onClick={onClose}>
            {challengeText.close}
          </button>
        )}
      </div>
    </dialog>
  )
}
