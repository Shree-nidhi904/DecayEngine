// The memory-model setting: a switch beside the sound switch. Chooses which decay
// policy the app runs (policy-select.ts). The App saves the choice and reloads,
// because the engine is built once with one policy.

import { useId } from "react"
import { memoryModelText } from "../wording"
import { DEFAULT_DIFFICULTY as MIDDLE_DIFFICULTY, grownHalfLife } from "../policy-memory"

/** The fact in the worked example. The default policy doubles it; grownHalfLife is the developer's own formula. */
const EXAMPLE_DAYS = 10

export interface MemoryModelToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export function MemoryModelToggle({ enabled, onChange }: MemoryModelToggleProps) {
  const id = useId()
  const helpId = useId()
  return (
    <div className="sd-sound-toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={helpId}
        checked={enabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <label htmlFor={id}>{memoryModelText.toggle}</label>
      <p id={helpId} className="sd-notify-note">{memoryModelText.help}</p>
      {/* Feedback list, point 15: the two rules side by side, in plain words. The current one is marked. */}
      <div className="sd-model-compare">
        <div className="sd-model-col" data-current={enabled ? undefined : ""}>
          <p className="sd-model-title">{memoryModelText.standardTitle}</p>
          <ul>{memoryModelText.standard.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
        <div className="sd-model-col" data-current={enabled ? "" : undefined}>
          <p className="sd-model-title">{memoryModelText.memoryTitle}</p>
          <ul>{memoryModelText.memory.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      </div>
      <div className="sd-model-example">
        <p className="sd-model-title">{memoryModelText.exampleTitle}</p>
        <ul>
          <li>{memoryModelText.exampleStandard(EXAMPLE_DAYS * 2)}</li>
          <li>{memoryModelText.exampleLate(Math.round(grownHalfLife(EXAMPLE_DAYS, MIDDLE_DIFFICULTY, 0.4)))}</li>
          <li>{memoryModelText.exampleEarly(Math.round(grownHalfLife(EXAMPLE_DAYS, MIDDLE_DIFFICULTY, 0.95)))}</li>
        </ul>
      </div>
      <p className="sd-notify-note">{memoryModelText.honest}</p>
    </div>
  )
}
