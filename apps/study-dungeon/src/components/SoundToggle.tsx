// The sound setting (task 20.1, Requirement 18.1): a switch beside
// "Reset all data". Off by default; the App loads and saves the choice with
// loadSoundEnabled and saveSoundEnabled (sound.ts). A preference, not a
// write to the engine, so it also works while previewing.

import { useId } from "react"
import { soundText } from "../wording"

export interface SoundToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export function SoundToggle({ enabled, onChange }: SoundToggleProps) {
  const id = useId()
  return (
    <div className="sd-sound-toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <label htmlFor={id}>{soundText.toggle}</label>
    </div>
  )
}
