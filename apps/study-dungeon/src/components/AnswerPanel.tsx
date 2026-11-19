// The part of a fight or challenge where you give your answer, when the
// answer is checked for you (answer-check.ts): pick one of the options, or
// type it. After an answer the options stay on screen, marked right and
// wrong, so you can see what the answer was.
//
// Written by Claude Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { useId, useState, type FormEvent } from "react"
import { checkTyped } from "../answer-check"
import { answerText } from "../wording"

export interface AnswerPanelProps {
  /** The options, when picking; null means type the answer. */
  choices: string[] | null
  /** The right answer. */
  answer: string
  /** Called once, with whether the answer was right. */
  onAnswer: (correct: boolean) => void
  /** True once answered (the panel then only shows what happened). */
  answered: boolean
}

export function AnswerPanel({ choices, answer, onAnswer, answered }: AnswerPanelProps) {
  const inputId = useId()
  const hintId = useId()

  const [picked, setPicked] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const [submitted, setSubmitted] = useState<string | null>(null)

  if (choices !== null) {
    const pick = (option: string) => {
      if (answered) return
      setPicked(option)
      onAnswer(option === answer)
    }
    return (
      // The group takes focus first, so a stray Enter answers nothing.
      // A-D or 1-4 pick an option; Tab moves through them as buttons.
      <div
        className="sd-options"
        role="group"
        aria-label={answerText.choose}
        aria-describedby={hintId}
        tabIndex={-1}
        data-autofocus=""
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return
          const key = event.key.toLowerCase()
          const index = "abcd".includes(key) && key.length === 1 ? "abcd".indexOf(key) : "1234".indexOf(key)
          if (index < 0 || index >= choices.length || key === "") return
          event.preventDefault()
          pick(choices[index]!)
        }}
      >
        <p id={hintId} className="sd-options-hint">
          {answerText.keysHint}
        </p>
        {choices.map((option, index) => {
          const mark = !answered ? undefined : option === answer ? "right" : option === picked ? "wrong" : "other"
          return (
            <button
              key={option}
              type="button"
              className="sd-choice-option"
              data-mark={mark}
              disabled={answered}
              onClick={() => pick(option)}
            >
              <span className="sd-choice-key" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="sd-choice-text">{option}</span>
              {mark === "right" && <span className="sd-choice-verdict">{answerText.rightMark}</span>}
              {mark === "wrong" && <span className="sd-choice-verdict">{answerText.wrongMark}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (answered || typed.trim() === "") return
    setSubmitted(typed)
    onAnswer(checkTyped(typed, answer))
  }

  return (
    <form className="sd-typed" onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="sd-dialog-label">
        {answerText.typeLabel}
      </label>
      <div className="sd-typed-row">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={typed}
          readOnly={answered}
          onChange={(event) => setTyped(event.currentTarget.value)}
        />
        {!answered && (
          <button type="submit" className="sd-button sd-button-primary" disabled={typed.trim() === ""}>
            {answerText.check}
          </button>
        )}
      </div>
      {answered && submitted !== null && (
        <p className="sd-typed-note">{answerText.youWrote(submitted)}</p>
      )}
    </form>
  )
}
