// The hero section (tasks 12.1 and 12.2, Requirement 12).
// - Eyebrow "Your memory today".
// - Weak facts: "N facts are weakening" and "Fight the weakest", which hands
//   the lowest-health weak fact to the App (disabled while previewing).
// - No weak but some alive: the quiet-crypt message.
// - No facts: a line pointing to Add fact.
// - Stat cards: alive, weak and dead counts (the shell's Counters: icon,
//   number, list name), then souls banished and the streak.
// Counts read engine.view(now), so they follow the time machine. Souls and
// the streak are about the past, so they read the real time (realNow).

import { useMemo, type ReactNode } from "react"
import { Counters } from "@decay-engine/shell"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import { groupByState, sortDungeon } from "../lists"
import { allHistory, countSoulsBanished, currentStreak } from "../stats"
import { studyDungeonShellTheme } from "../theme"
import { heroText, studyDungeonWording } from "../wording"
import { studyDungeonIcons } from "./icons"
import "../styles/hero.css"

export interface HeroSectionProps {
  /** Read-only methods only. */
  engine: Pick<StudyDungeonEngine, "view" | "history">
  /** The time shown (today or the previewed day): the counts and the weakest fact. */
  now: number
  /** The real time: souls banished and the streak. */
  realNow: number
  /** Bumped by the App after every write, so the hero reads the engine again. */
  version: number
  /** Time zone for the streak's calendar days. Defaults to the viewer's. */
  timeZone?: string
  /** Opens the fight with this fact. */
  onFight: (fact: Fact) => void
  /** When set, "Fight the weakest" is disabled with this reason (previewing). */
  fightDisabledReason?: string
}

/** A small soul wisp for "souls banished". */
function SoulIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" data-icon="soul">
      <path
        d="M12 3c3.6 0 6 2.7 6 6.2 0 3.8-2.6 5.6-2.6 8.3 0 1.2.6 2.1 1.4 2.9-2.6.2-4.6-.9-5.4-2.5-.8 1.6-2.8 2.7-5.4 2.5.8-.8 1.4-1.7 1.4-2.9C7.4 14.8 6 13 6 9.2 6 5.7 8.4 3 12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="9.5" r="1.1" fill="currentColor" />
      <circle cx="14" cy="9.5" r="1.1" fill="currentColor" />
    </svg>
  )
}

/** A torch flame for the streak. */
function StreakIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" data-icon="streak">
      <path
        d="M12 2.5c3 3.2 5 5.9 5 9.2a5 5 0 0 1-10 0c0-1.9.8-3.4 2.1-4.8.2 1.6.9 2.6 2 3.1-.5-2.6-.1-4.9.9-7.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line x1="12" y1="17" x2="12" y2="21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function HeroSection({
  engine,
  now,
  realNow,
  version,
  timeZone,
  onFight,
  fightDisabledReason,
}: HeroSectionProps) {
  // version is a dependency on purpose: a write changes what the engine returns.
  const groups = useMemo(() => groupByState(engine.view(now)), [engine, now, version])
  const past = useMemo(() => {
    const entries = allHistory(engine, realNow)
    return {
      souls: countSoulsBanished(entries),
      streak: currentStreak(entries, realNow, timeZone === undefined ? {} : { timeZone }),
    }
  }, [engine, realNow, version, timeZone])

  const weakest = sortDungeon(groups.weak)[0]
  const total = groups.alive.length + groups.weak.length + groups.dead.length
  const fightDisabled = fightDisabledReason !== undefined

  let message: ReactNode
  if (weakest !== undefined) {
    message = (
      <>
        <p className="sd-hero-message">{heroText.weakening(groups.weak.length)}</p>
        <button
          type="button"
          className="sd-button sd-button-primary sd-hero-action"
          aria-disabled={fightDisabled ? true : undefined}
          title={fightDisabled ? fightDisabledReason : undefined}
          onClick={() => {
            if (fightDisabled) return
            onFight(weakest)
          }}
        >
          {heroText.fightWeakest}
        </button>
      </>
    )
  } else if (groups.alive.length > 0) {
    message = <p className="sd-hero-message">{heroText.allQuiet}</p>
  } else if (total === 0) {
    message = <p className="sd-hero-message">{heroText.noFacts}</p>
  } else {
    message = <p className="sd-hero-message">{heroText.onlyDead}</p>
  }

  return (
    <section className="sd-hero" aria-labelledby="sd-hero-eyebrow">
      <p id="sd-hero-eyebrow" className="sd-hero-eyebrow">
        {heroText.eyebrow}
      </p>
      {message}
      <div className="sd-hero-stats" role="group" aria-label={heroText.stats}>
        <Counters
          alive={groups.alive.length}
          weak={groups.weak.length}
          dead={groups.dead.length}
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          icons={studyDungeonIcons}
        />
        <ul className="sd-hero-past">
          <li className="sd-stat" data-stat="souls">
            <span className="sd-stat-icon" aria-hidden="true">
              <SoulIcon />
            </span>
            <span className="sd-stat-number num">{past.souls}</span>
            <span className="sd-stat-label">{heroText.souls(past.souls)}</span>
          </li>
          <li className="sd-stat" data-stat="streak">
            <span className="sd-stat-icon" aria-hidden="true">
              <StreakIcon />
            </span>
            <span className="sd-stat-number num">{past.streak}</span>
            <span className="sd-stat-label">{heroText.streak(past.streak)}</span>
          </li>
        </ul>
      </div>
    </section>
  )
}
