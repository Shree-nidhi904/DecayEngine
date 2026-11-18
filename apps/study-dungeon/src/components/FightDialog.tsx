// The fight with an alive or weak fact (task 7.1, Requirement 8.1-8.5).
// Step 1: the question, with "Show answer" and "Walk away".
// Step 2: the answer, with "I knew it", "I forgot" and "Walk away".
// "I knew it" / "I forgot" call engine.tend(id, { kind: "review", correct }, now()).
// "Walk away" (and Escape) closes without calling the engine.
// The time comes from the injected now(), so tests never read the clock.

import { useRef, useState } from "react"
import { DecayEngineError } from "@decay-engine/engine"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import { fightText, studyDungeonWording } from "../wording"
import { useModalDialog } from "./useModalDialog"
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
  /** Closes the dialog (Walk away, Close and Escape). */
  onClose: () => void
}

type Step = "question" | "answer" | "correct" | "incorrect" | "died"

export function FightDialog({ engine, now, fact, onWrite, onClose }: FightDialogProps) {
  const ref = useModalDialog()
  const [step, setStep] = useState<Step>("question")
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
        return
      }
      throw error
    }
    onWrite()
    setStep(correct ? "correct" : "incorrect")
  }

  const done = step === "correct" || step === "incorrect" || step === "died"
  const resultText =
    step === "correct" ? fightText.correct : step === "incorrect" ? fightText.incorrect : fightText.diedFirst

  return (
    <dialog
      ref={ref}
      className="sd-dialog sd-fight"
      aria-labelledby="sd-fight-title"
      onCancel={(event) => {
        // Escape: before an answer it is the same as Walk away.
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="sd-fight-title" className="sd-dialog-title">
        {studyDungeonWording.actions.tend}
      </h2>

      <p className="sd-dialog-label">{fightText.question}</p>
      <p className="sd-dialog-question">{fact.payload.question}</p>

      {step !== "question" && (
        <>
          <p className="sd-dialog-label">{fightText.answer}</p>
          <p className="sd-dialog-answer">{fact.payload.answer}</p>
        </>
      )}

      <p role="status" className="sd-result" data-result={done ? step : undefined}>
        {done ? resultText : ""}
      </p>

      <div className="sd-dialog-actions">
        {step === "question" && (
          <>
            <button type="button" className="sd-button sd-button-quiet" onClick={onClose}>
              {fightText.walkAway}
            </button>
            <button type="button" className="sd-button sd-button-primary" onClick={() => setStep("answer")}>
              {fightText.showAnswer}
            </button>
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
