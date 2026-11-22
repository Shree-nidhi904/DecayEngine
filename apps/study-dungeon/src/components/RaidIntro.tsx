// What Triage is for, in three steps, beside the Triage panel. A queue of
// small creatures waits at the door. Decoration plus plain words.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.

import { dailyRaidText, raidText } from "../wording"
import { Creature } from "./art/Creature"

export interface RaidIntroProps {
  /** Runs Triage for 5 minutes and starts the session. */
  onDailyRaid: () => void
  /** Set while previewing: the button stays visible, says why, and does nothing. */
  disabledReason?: string
}

export function RaidIntro({ onDailyRaid, disabledReason }: RaidIntroProps) {
  const disabled = disabledReason !== undefined
  return (
    <div className="sd-raid-intro">
      <h2 className="sd-raid-title">{raidText.title}</h2>
      <div className="sd-daily">
        <button
          type="button"
          className="sd-button sd-button-primary sd-daily-button"
          aria-disabled={disabled ? true : undefined}
          title={disabled ? disabledReason : undefined}
          onClick={() => {
            if (!disabled) onDailyRaid()
          }}
        >
          {dailyRaidText.button}
        </button>
        <p className="sd-daily-hint">{dailyRaidText.hint}</p>
      </div>
      <ol className="sd-raid-steps">
        {raidText.steps.map((step, i) => (
          <li key={i}>
            <span className="sd-raid-num" aria-hidden="true">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="sd-raid-note">{raidText.note}</p>
      <div className="sd-raid-queue" aria-hidden="true">
        <Creature kind="eye" mood="worried" className="sd-art-sm" />
        <Creature kind="imp" mood="feral" className="sd-art-sm" />
        <Creature kind="bat" mood="worried" className="sd-art-sm" />
        <Creature kind="slime" mood="feral" className="sd-art-sm" />
      </div>
    </div>
  )
}
