import { useId } from "react"
import type { SpookyLevel } from "../spooky-level"
import { hauntText } from "../wording"

export function SpookyToggle({ level, onChange }: { level: SpookyLevel; onChange: (level: SpookyLevel) => void }) {
  const helpId = useId()
  const haunted = level === "haunted"
  return (
    <div className="sd-haunt-setting">
      <button
        type="button"
        className="sd-button sd-button-quiet sd-haunt-toggle"
        aria-pressed={haunted}
        aria-describedby={helpId}
        onClick={() => onChange(haunted ? "calm" : "haunted")}
      >
        {hauntText.spooky.label}
        <span aria-hidden="true"> · {haunted ? hauntText.spooky.haunted : hauntText.spooky.calm}</span>
      </button>
      <p id={helpId} className="sd-haunt-note">
        {hauntText.spooky.help}
      </p>
    </div>
  )
}
