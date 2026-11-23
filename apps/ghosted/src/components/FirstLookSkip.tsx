// "Skip the preview" (task L6, Req 40.7, design 17.4). Shown at the top of
// the dock's own box while the first look plays, in the slot the live-change
// toast uses, so it covers nothing. A quiet native button: the dock's filled
// button stays the shell's Play. It never takes focus by itself.

import { firstLookText } from "../wording"
import "../styles/first-look.css"

export interface FirstLookSkipProps {
  onSkip: () => void
}

export function FirstLookSkip({ onSkip }: FirstLookSkipProps) {
  return (
    <div className="gh-first-look">
      <button type="button" className="gh-button gh-first-look-skip" onClick={onSkip}>
        {firstLookText.skip}
      </button>
    </div>
  )
}
