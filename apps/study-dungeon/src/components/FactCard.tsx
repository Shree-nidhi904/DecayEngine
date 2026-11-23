// One fact in a scene (visual pass, Pass 2). Three looks, one contract:
// - Dungeon (weak): a monster card with the creature, its urgency, the
//   epitaph, importance and minutes, the health orb and bar.
// - Crypt (alive): a sleeping creature with when it wakes.
// - Graveyard (dead): a tombstone with the epitaph and when it died.
//
// It keeps the shell ItemCard's contract, so the rest of the app and the
// tests see the same thing: an <article class="shell-item-card"> named by
// the question, a .shell-state line with the state's icon and words, and the
// buttons in the same order (action, autopsy, edit, remove). Write buttons
// are aria-disabled with a reason while previewing; Autopsy never is.
// Fight (or Challenge) is the one primary button; Edit and Remove are quiet.
//
// Written by Claude Code (Opus 5.5), outside Kiro, at the developer's request; see .kiro/steering/authorship.md.
// Changed by Kiro for task L3 (task 25.4): the optional `justChanged` and `onReacted` props.

import { useEffect, useId, useRef, type ReactNode } from "react"
import type { Fact } from "../policy"
import { DAY_MS } from "../policy"
import { creatureOf, moodOf, quipOf, urgencyOf } from "../creatures"
import { epitaphOf, formatHealth, formatWakeUp } from "../lists"
import { formatHalfLifeDays, studyDungeonWording } from "../wording"
import { studyDungeonIcons } from "./icons"
import { Creature } from "./art/Creature"
import { HealthBar, HealthOrb } from "./art/Health"
import { Tombstone } from "./art/Scenery"

export interface FactCardProps {
  /** The fact as seen at the time shown (today or the previewed day). */
  fact: Fact
  /** Its state today, when a future day is shown; used for the "alive today" tag. */
  stateToday?: Fact["state"]
  /** Health right after the last review, for the "lost" segment. */
  baseHealth?: number
  /** When an alive fact wakes up (turns weak); null for never. */
  wakeAt?: number | null
  /** The time shown, for "dead N days ago". */
  now: number
  onAction: () => void
  onAutopsy?: () => void
  onEdit: () => void
  onRemove: () => void
  /** Disables every write button (not Autopsy). */
  disabled?: boolean
  disabledReason?: string
  /**
   * Task L3 (Requirement 23.2, added by Kiro): a minute tick just moved this
   * fact. The card gets .sd-just-changed and its creature wakes (or its stone
   * drops) once (live.css). Omitted: the card is exactly as before.
   */
  justChanged?: boolean
  /** Called when that animation ends, so the App removes the class. */
  onReacted?: (id: string) => void
}

/** The two L3 animations whose end removes the marker (live.css). */
const REACTIONS = new Set(["sd-wake", "sd-grave-drop"])

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function FactCard({
  fact,
  stateToday,
  baseHealth,
  wakeAt,
  now,
  onAction,
  onAutopsy,
  onEdit,
  onRemove,
  disabled = false,
  disabledReason,
  justChanged = false,
  onReacted,
}: FactCardProps) {
  // Task L3: the end of the wake (it bubbles up from the creature) removes the
  // marker. A native listener, so it hears the unprefixed event; another
  // animation ending inside the card (a named one that is not L3's) is ignored.
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const card = cardRef.current
    if (!justChanged || card === null || onReacted === undefined) return
    const done = (event: Event) => {
      const name = (event as Event & { animationName?: unknown }).animationName
      if (typeof name === "string" && name !== "" && !REACTIONS.has(name)) return
      onReacted(fact.id)
    }
    card.addEventListener("animationend", done)
    return () => card.removeEventListener("animationend", done)
  }, [justChanged, onReacted, fact.id])
  const marker = justChanged ? " sd-just-changed" : ""
  const textId = useId()
  const reasonId = useId()
  const state = fact.state
  const creature = creatureOf(fact.id)
  const mood = moodOf(state, fact.health)
  const epitaph = epitaphOf(fact)
  const showReason = disabled && disabledReason !== undefined
  const changedSinceToday = stateToday !== undefined && stateToday !== state

  const writeButton = (label: string, className: string, onClick: () => void) => (
    <button
      type="button"
      className={className}
      aria-describedby={showReason ? `${textId} ${reasonId}` : textId}
      aria-disabled={disabled ? true : undefined}
      title={showReason ? disabledReason : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  )

  const actionLabel = state === "dead" ? studyDungeonWording.actions.resurrect : studyDungeonWording.actions.tend
  // In the Graveyard the read-only Autopsy leads; Challenge is a second step.
  const actionClass = state === "dead" ? "shell-button sd-btn sd-btn-ghost" : "shell-button shell-button-primary sd-btn sd-btn-primary"
  const actions = (
    <div className="shell-item-actions sd-card-actions">
      <div className="sd-card-main-actions">
        {writeButton(actionLabel, actionClass, onAction)}
        {onAutopsy !== undefined && (
          <button type="button" className="shell-button sd-btn sd-btn-primary" aria-describedby={textId} onClick={onAutopsy}>
            {studyDungeonWording.actions.autopsy}
          </button>
        )}
      </div>
      <div className="sd-card-quiet-actions">
        {writeButton(studyDungeonWording.actions.edit, "shell-button shell-button-quiet sd-btn-quiet", onEdit)}
        {writeButton(studyDungeonWording.actions.remove, "shell-button shell-button-quiet sd-btn-quiet", onRemove)}
      </div>
      {showReason && (
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      )}
    </div>
  )

  const stateLine = (extra?: ReactNode) => (
    <div className="sd-card-state">
      <p className="shell-state">
        <span className="shell-icon" aria-hidden="true">
          {studyDungeonIcons[state]}
        </span>
        <span className="shell-state-label">{studyDungeonWording.states[state]}</span>
      </p>
      {extra}
      {changedSinceToday && <span className="sd-pill sd-pill-was">{stateToday} today</span>}
    </div>
  )

  const question = (
    <p id={textId} className="shell-item-text sd-card-question">
      {fact.payload.question}
    </p>
  )

  const epitaphLine = epitaph !== null && <p className="sd-epitaph">“{epitaph}”</p>

  const chips = (
    <p className="sd-chips">
      <span>Importance {fact.importance} of 3</span>
      <span>about {fact.costMinutes} min</span>
      <span>Half-life {formatHalfLifeDays(fact.policyData.halfLifeDays)} days</span>
    </p>
  )

  if (state === "weak") {
    const urgency = urgencyOf(fact.health)
    const lost = baseHealth === undefined ? 0 : Math.max(0, Math.floor(baseHealth) - Math.floor(fact.health))
    return (
      <article
        ref={cardRef}
        className={`shell-item-card sd-card sd-monster${marker}`}
        data-state={state}
        data-mood={mood}
        aria-labelledby={textId}
      >
        <div className="sd-card-top">
          <Creature kind={creature.kind} mood={mood} />
          <div className="sd-card-who">
            {stateLine(
              <span className={`sd-pill${urgency.critical ? " sd-pill-crit" : ""}`}>{urgency.text}</span>
            )}
            <p className="sd-creature-name">{creature.name}</p>
            <p className="sd-quip">{quipOf(mood)}</p>
          </div>
        </div>
        {question}
        {epitaphLine}
        {chips}
        <div className="sd-life">
          <HealthOrb health={fact.health} />
          <p className="sd-life-meta">
            <b className="num">Health {formatHealth(fact.health)}</b>
            {lost > 0 && <span className="sd-lost num">−{lost} since last review</span>}
          </p>
        </div>
        <HealthBar health={fact.health} base={baseHealth} />
        {actions}
      </article>
    )
  }

  if (state === "alive") {
    return (
      <article
        ref={cardRef}
        className={`shell-item-card sd-card sd-sleeper${marker}`}
        data-state={state}
        data-mood={mood}
        aria-labelledby={textId}
      >
        <div className="sd-sleeper-art">
          <Creature kind={creature.kind} mood="sleep" className="sd-art-sm" />
          <span className="sd-zzz" aria-hidden="true">
            z z
          </span>
        </div>
        <div className="sd-sleeper-body">
          {stateLine(<span className="sd-creature-tag">{creature.name}</span>)}
          {question}
          <p className="sd-wakes num">
            {wakeAt === null || wakeAt === undefined
              ? "Sleeps soundly"
              : `Wakes ${formatWakeUp(wakeAt)}`}
            {fact.timesResurrected > 0 && <span className="sd-risen"> · risen</span>}
          </p>
          {actions}
        </div>
      </article>
    )
  }

  const daysDead = fact.diedAt === undefined ? null : Math.max(0, Math.floor((now - fact.diedAt) / DAY_MS))
  return (
    <article ref={cardRef} className={`shell-item-card sd-card sd-grave${marker}`} data-state={state} aria-labelledby={textId}>
      <Tombstone kind={creature.kind} />
      {stateLine()}
      {question}
      {epitaphLine}
      {daysDead !== null && (
        <p className="sd-died num">
          {daysDead === 0 ? "Died today" : `Died ${plural(daysDead, "day", "days")} ago`} · {creature.name}
        </p>
      )}
      {actions}
    </article>
  )
}
