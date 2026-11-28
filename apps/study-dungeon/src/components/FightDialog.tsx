// The fight with an alive or weak fact (task 7.1, Requirement 8.1-8.5).
// Step 1: the question, with "Show answer" and "Walk away".
// Step 2: the answer, with "I knew it", "I forgot" and "Walk away".
// "I knew it" / "I forgot" call engine.tend(id, { kind: "review", correct }, now()).
// "Walk away" (and Escape) closes without calling the engine.
// The time comes from the injected now(), so tests never read the clock.
// The sound player and the error handler are injected too (tasks 20.2, 18.3).
// The `model` prop and the result texts from fightResultText were added by
// Kiro for the extensions spec (task 2.3).

import { useRef, useState } from "react"
import { DecayEngineError } from "@decay-engine/engine"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import type { SoundPlayer } from "../sound"
import { comboText, fightResultText, fightText, sessionText, studyDungeonWording } from "../wording"
import type { ModelName } from "../policy-select"
import { Sparks } from "./art/Particles"
import { hauntText } from "../wording"
import { useModalDialog } from "./useModalDialog"
import { DialogFoe } from "./DialogFoe"
import { AnswerPanel } from "./AnswerPanel"
import type { AnswerCheck } from "../answer-check"
import { moodOf, quipOf } from "../creatures"
import "../styles/dialogs.css"

export interface FightDialogProps {
  /** Only tend is used. Tests pass a real engine on InMemoryAdapter. */
  engine: Pick<StudyDungeonEngine, "tend">
  /** The time to tend at. The App passes Date.now; tests pass a fixed time. */
  now: () => number
  /** The fact to fight: alive or weak when the fight was opened. */
  fact: Fact
  /** Called after the engine saved something, so the App reads the lists again. */
  onWrite: () => void
  /** Closes the dialog (Walk away, Close and Escape). In a session this moves to the next fight. */
  onClose: () => void
  /**
   * Set when the fight is part of a Triage session (task 9.2): shows
   * "Fight N of M" and a "Stop session" button that ends the whole queue.
   */
  session?: { position: number; total: number; onStop: () => void }
  /**
   * Plays "right" after a right answer and "wrong" after a wrong one (task
   * 20.2). The App passes its one player, which stays silent while sound is
   * off; tests pass a fake. No sound when omitted.
   */
  sound?: SoundPlayer
  /** Told how the fight ended, after the engine saved it; the App announces it. */
  onResult?: (result: FightResult) => void
  /**
   * Given any error from engine.tend except a death before the answer. Returns
   * true when the App handled it (a storage problem: the App shows it and
   * closes the dialog); anything else is rethrown.
   */
  onWriteError?: (error: unknown) => boolean
  /**
   * How the answer is checked (answer-check.ts). "self" (the default here)
   * is the honour system: Show answer, then I knew it or I forgot. The App
   * passes the user's setting.
   */
  check?: AnswerCheck
  /** The options when check is "choices"; null or omitted means type the answer. */
  choices?: string[] | null
  /** After a right answer: a line saying when the fact wakes again, e.g. "It sleeps until 25 Nov 2026." */
  sleepsUntil?: () => string | null
  /** Right answers in a row in this Triage session, counting this one once answered. */
  combo?: number
  /**
   * Which policy is running (policy-select.ts), so the result text is true
   * for it (extensions spec, Requirement 4.2). Defaults to "doubling".
   */
  model?: ModelName
}

/** How a fight ended: answered right, answered wrong, or the fact died first. */
export type FightResult = "correct" | "incorrect" | "died"

/** A right answer this soon after the fight opens is a critical hit (haunt pass). */
export const CRIT_MS = 6_000

type Step = "question" | "answer" | FightResult

export function FightDialog({
  engine,
  now,
  fact,
  onWrite,
  onClose,
  session,
  sound,
  onResult,
  onWriteError,
  check = "self",
  choices = null,
  sleepsUntil,
  combo = 0,
  model = "doubling",
}: FightDialogProps) {
  const results = fightResultText(model)
  const ref = useModalDialog()
  const [step, setStep] = useState<Step>("question")
  const [sleepLine, setSleepLine] = useState<string | null>(null)
  const [openedAt] = useState(() => now())
  const [crit, setCrit] = useState(false)
  const checked = check !== "self"
  // Guards against a second answer before React re-renders.
  const answered = useRef(false)

  function answer(correct: boolean) {
    if (answered.current) return
    answered.current = true
    try {
      engine.tend(fact.id, { kind: "review", correct }, now())
    } catch (error) {
      // The fact died between opening the fight and answering. The engine
      // saved the death and tended nothing; the fact now needs a challenge.
      if (error instanceof DecayEngineError && error.code === "ITEM_ALREADY_DEAD") {
        onWrite()
        setStep("died")
        onResult?.("died")
        return
      }
      // Nothing was saved (the engine guarantees it), so no sound and no result.
      if (onWriteError?.(error) === true) return
      throw error
    }
    onWrite()
    sound?.play(correct ? "right" : "wrong")
    const result: FightResult = correct ? "correct" : "incorrect"
    if (correct) setSleepLine(sleepsUntil?.() ?? null)
    if (correct) setCrit(now() - openedAt <= CRIT_MS)
    setStep(result)
    onResult?.(result)
  }

  const done = step === "correct" || step === "incorrect" || step === "died"
  const resultText =
    step === "correct" ? results.correct : step === "incorrect" ? results.incorrect : fightText.diedFirst

  return (
    <dialog
      ref={ref}
      className="sd-dialog sd-fight"
      data-result={done ? step : undefined}
      aria-labelledby="sd-fight-title"
      onCancel={(event) => {
        // Escape: before an answer it is the same as Walk away.
        event.preventDefault()
        onClose()
      }}
    >
      <div className="sd-dialog-head">
        <h2 id="sd-fight-title" className="sd-dialog-title">
          {studyDungeonWording.actions.tend}
        </h2>
        <DialogFoe
          fact={fact}
          mood={step === "correct" ? "happy" : step === "incorrect" || step === "died" ? "feral" : moodOf(fact.state, fact.health)}
          quip={
            step === "correct"
              ? results.quipRight
              : step === "incorrect"
                ? "It got stronger. You will face it again sooner."
                : quipOf(moodOf(fact.state, fact.health))
          }
          fx={step === "correct" ? "squish" : step === "incorrect" ? "lunge" : "popin"}
        />
      </div>

      {session !== undefined && (
        <p className="sd-dialog-progress num">{sessionText.progress(session.position, session.total)}</p>
      )}

      <p className="sd-dialog-label">{fightText.question}</p>
      <p className="sd-dialog-question">{fact.payload.question}</p>

      {checked && step !== "answer" && (
        <AnswerPanel
          choices={check === "choices" ? choices : null}
          explainTyped={check === "choices" && choices === null}
          answer={fact.payload.answer}
          answered={done}
          onAnswer={answer}
        />
      )}

      {step !== "question" && !(checked && check === "choices" && choices !== null) && (
        <>
          <p className="sd-dialog-label">{fightText.answer}</p>
          <p className="sd-dialog-answer">{fact.payload.answer}</p>
        </>
      )}

      <p role="status" className="sd-result" data-result={done ? step : undefined}>
        {done ? resultText : ""}
      </p>
      {step === "correct" && sleepLine !== null && <p className="sd-result-more">{sleepLine}</p>}
      {step === "correct" && combo >= 2 && <p className="sd-combo">{comboText(combo)}</p>}
      {step === "correct" && <Sparks color="#ff8a2b" />}
      {step === "correct" && crit && (
        <p className="sd-crit" aria-hidden="true">
          {hauntText.critical}
        </p>
      )}
      {step === "incorrect" && (
        <p className="sd-damage" aria-hidden="true">
          Miss!
        </p>
      )}

      <div className="sd-dialog-actions">
        {session !== undefined && (
          <button type="button" className="sd-button sd-button-quiet sd-button-stop" onClick={session.onStop}>
            {sessionText.stop}
          </button>
        )}
        {step === "question" && (
          <>
            <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
              {fightText.walkAway}
            </button>
            {!checked && (
              <button type="button" className="sd-button sd-button-primary" onClick={() => setStep("answer")}>
                {fightText.showAnswer}
              </button>
            )}
          </>
        )}
        {step === "answer" && (
          <>
            <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
              {fightText.walkAway}
            </button>
            <button type="button" className="sd-button sd-button-wrong" onClick={() => answer(false)}>
              {fightText.forgot}
            </button>
            <button type="button" className="sd-button sd-button-right" autoFocus onClick={() => answer(true)}>
              {fightText.knewIt}
            </button>
          </>
        )}
        {done && (
          <button type="button" className="sd-button sd-button-primary" autoFocus onClick={onClose}>
            {fightText.close}
          </button>
        )}
      </div>
    </dialog>
  )
}
