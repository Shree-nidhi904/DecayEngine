// The memory-model setting: a switch beside the sound switch. Chooses which decay
// policy the app runs (policy-select.ts). The App saves the choice and reloads,
// because the engine is built once with one policy.

import { useId } from "react"
import { memoryModelText } from "../wording"

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
    </div>
  )
}
