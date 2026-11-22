// The "Answer by" setting beside the sound switch: how a fight checks your
// answer (answer-check.ts).
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { useId } from "react"
import { ANSWER_CHECKS, type AnswerCheck } from "../answer-check"
import { answerText } from "../wording"

export function AnswerCheckSetting({ value, onChange }: { value: AnswerCheck; onChange: (check: AnswerCheck) => void }) {
  const id = useId()
  return (
    <div className="sd-answer-setting">
      <label htmlFor={id}>{answerText.setting}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value as AnswerCheck)}>
        {ANSWER_CHECKS.map((check) => (
          <option key={check} value={check}>
            {answerText.options[check]}
          </option>
        ))}
      </select>
    </div>
  )
}
