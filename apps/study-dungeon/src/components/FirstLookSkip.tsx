// "Skip the preview" (task L6, Requirement 25.7). Shown at the top of the
// dock's own box while the first look plays, in the slot the live-change
// toast uses, so it covers nothing. A quiet native button: the dock's filled
// button stays the shell's Play. It never takes focus by itself.

import { firstLookText } from "../wording"
import "../styles/first-look.css"

export interface FirstLookSkipProps {
  onSkip: () => void
}

export function FirstLookSkip({ onSkip }: FirstLookSkipProps) {
  return (
    <div className="sd-first-look">
      <button type="button" className="sd-button sd-button-quiet sd-first-look-skip" onClick={onSkip}>
        {firstLookText.skip}
      </button>
    </div>
  )
}
