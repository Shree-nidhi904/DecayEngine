// One person's card (task 4.2, design section 4.4; Req 13, 16.1-16.5).
// Ported from the wireframe's .card: the window, the state by glyph and
// word, the name and relationship, the facts, a health bar with marks at 60
// and 10, then one primary button and quiet ones.
//
// "Last contact" comes from the logged history (lastLoggedContactAt), never
// from policyData.lastContactAt, so a text sent today reads "today". Every
// write button gets `blocked` while previewing: it stays visible and
// focusable, is aria-disabled with the reason, and its activation does
// nothing (design section 4.2). Autopsy and History only read, so they never
// are blocked.

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import type { HistoryEntry } from "@decay-engine/engine"
import { daysUntil } from "@decay-engine/shell"
import type { GhostedEngine } from "../engine-instance"
import { lastLoggedContactAt, shownFreshness, shownState } from "../lists"
import { ghostedPolicy, type ContactEvent, type Person } from "../policy"
import { wholeDaysBetween } from "../time"
import { cardText, contactChoice, stateWords } from "../wording"
import { StateGlyph } from "./icons"
import { Window } from "./Window"
import "../styles/layout.css"

export interface PersonActions {
  onReachOut: (person: Person) => void
  onReconnect: (person: Person) => void
  onAutopsy: (person: Person) => void
  onEdit: (person: Person) => void
  /** The App opens the confirmation; nothing is removed here. */
  onRemove: (person: Person) => void
}

export interface PersonCardProps extends PersonActions {
  /** Settled at `now`. */
  person: Person
  now: number
  /** When the window goes dark if left alone (StreetView.darkAt), or null. */
  darkAt: number | null
  /** Read when "History" is opened. */
  engine: Pick<GhostedEngine, "history">
  /** engine.history(id), read once per version by the caller: the last contact. */
  history: readonly HistoryEntry[]
  /** Set while previewing: every write button shows it and ignores activation. */
  blocked: string | undefined
  formatDate: (ms: number) => string
  /** 3 inside the lists, 2 inside the person dialog. */
  headingLevel?: 2 | 3
  /**
   * Inside the person dialog: the heading gets tabindex -1 and data-autofocus,
   * so useModalDialog moves focus to it when the dialog opens (Req 24.2).
   */
  focusHeading?: boolean
  /**
   * Task L3 (Req 38.2): a minute tick just moved this person. The card gets
   * .gh-just-changed, and its window flickers out once (motion.css).
   */
  justChanged?: boolean
  /** Called when that animation ends, so the App removes the class. */
  onReacted?: (id: string) => void
}

type ContactKind = ContactEvent["kind"]

function contactKindOf(event: unknown): ContactKind | null {
  const kind = (event as { kind?: unknown } | null)?.kind
  return kind === "text" || kind === "call" || kind === "meetup" ? kind : null
}

export function PersonCard({
  person,
  now,
  darkAt,
  engine,
  history,
  blocked,
  formatDate,
  headingLevel = 3,
  focusHeading = false,
  justChanged = false,
  onReacted,
  onReachOut,
  onReconnect,
  onAutopsy,
  onEdit,
  onRemove,
}: PersonCardProps) {
  const id = useId()
  const headingId = `${id}-name`
  const blockedId = `${id}-blocked`
  const historyId = `${id}-history`
  const [historyOpen, setHistoryOpen] = useState(false)

  // Task L3: the end of the window's flicker-out (it bubbles up from the pane)
  // removes the marker. A native listener, so it hears the unprefixed event.
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const card = cardRef.current
    if (!justChanged || card === null || onReacted === undefined) return
    const done = () => onReacted(person.id)
    card.addEventListener("animationend", done)
    return () => card.removeEventListener("animationend", done)
  }, [justChanged, onReacted, person.id])

  const state = shownState(person)
  const dead = person.state === "dead"
  const freshness = shownFreshness(person.health)
  const { weak, dead: deadMark } = ghostedPolicy.thresholds
  const daysAgo = Math.max(0, wholeDaysBetween(lastLoggedContactAt(history, person.payload), now))
  const Heading = headingLevel === 2 ? "h2" : "h3"

  /** A write button: active, or aria-disabled with the reason while previewing. */
  const writeButton = (label: string, onActivate: () => void, primary: boolean, action: string): ReactNode => {
    const className = primary ? "gh-button gh-button-primary" : "gh-button"
    if (blocked === undefined) {
      return (
        <button type="button" className={className} data-action={action} onClick={onActivate}>
          {label}
        </button>
      )
    }
    return (
      <button
        type="button"
        className={className}
        data-action={action}
        aria-disabled="true"
        aria-describedby={blockedId}
        title={blocked}
        onClick={() => {}}
      >
        {label}
      </button>
    )
  }

  const relationship = person.payload.relationship.trim()

  return (
    <article
      ref={cardRef}
      className={justChanged ? "gh-card gh-just-changed" : "gh-card"}
      data-state={state}
      aria-labelledby={headingId}
    >
      {dead && (
        <svg className="gh-card-web" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
          <path d="M44 0L14 30M44 0L24 40M44 0L4 18M44 0L34 44M44 0L0 8" />
          <path d="M36 0q2 8 8 8M26 0q3 16 18 18M16 0q4 24 28 28" />
        </svg>
      )}
      <div className="gh-card-top">
        <Window health={person.health} state={state} size="card" />
        <div className="gh-card-who">
          <p className="gh-state gh-card-state" data-state={state}>
            <StateGlyph state={state} />
            {stateWords[state]}
          </p>
          <Heading
            id={headingId}
            className="gh-card-name"
            tabIndex={focusHeading ? -1 : undefined}
            data-autofocus={focusHeading ? "" : undefined}
          >
            {person.payload.name}
          </Heading>
          {relationship !== "" && <p className="gh-card-rel">{relationship}</p>}
        </div>
      </div>

      <ul className="gh-card-facts">
        <li data-fact="last-contact">{cardText.lastContact(daysAgo)}</li>
        <li data-fact="rhythm">{cardText.rhythm(person.payload.rhythmDays)}</li>
        {person.state === "weak" && darkAt !== null && (
          <li data-fact="goes-dark" className="gh-card-hot">
            {cardText.goesDark(daysUntil(darkAt, now))}
          </li>
        )}
      </ul>

      <div className="gh-bar" role="img" aria-label={cardText.freshness(freshness)} data-state={state}>
        <span className="gh-bar-fill" style={{ width: `${Math.max(0, Math.min(100, person.health))}%` }} />
        <span className="gh-bar-mark" data-mark="weak" style={{ left: `${weak}%` }} />
        <span className="gh-bar-mark" data-mark="dead" style={{ left: `${deadMark}%` }} />
      </div>
      <p className="gh-bar-key">{cardText.barKey(weak, deadMark)}</p>

      {/* The primary button has the first row to itself; the quiet ones share the next, equal widths (layout.css). */}
      <div className="gh-card-actions">
        {dead
          ? writeButton(cardText.reconnect, () => onReconnect(person), true, "reconnect")
          : writeButton(cardText.reachOut, () => onReachOut(person), true, "reach-out")}
        <div className="gh-card-quiet" data-count={dead ? 4 : 3}>
          {dead && (
            <button type="button" className="gh-button" data-action="autopsy" onClick={() => onAutopsy(person)}>
              {cardText.autopsy}
            </button>
          )}
          {writeButton(cardText.edit, () => onEdit(person), false, "edit")}
          {writeButton(cardText.remove, () => onRemove(person), false, "remove")}
          <button
            type="button"
            className="gh-button"
            data-action="history"
            aria-expanded={historyOpen}
            aria-controls={historyId}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {cardText.history}
          </button>
        </div>
      </div>
      {blocked !== undefined && (
        <p id={blockedId} className="gh-card-blocked">
          {blocked}
        </p>
      )}

      <div id={historyId} hidden={!historyOpen}>
        {historyOpen && <ContactHistory entries={engine.history(person.id)} formatDate={formatDate} />}
      </div>
    </article>
  )
}

/** The logged contacts, newest first, with date, kind and freshness after each (Req 13.6). */
function ContactHistory({ entries, formatDate }: { entries: readonly HistoryEntry[]; formatDate: (ms: number) => string }) {
  const contacts = entries
    .filter((e): e is Extract<HistoryEntry, { type: "tended" | "resurrected" }> => e.type === "tended" || e.type === "resurrected")
    .slice()
    .reverse()
  if (contacts.length === 0) return <p className="gh-card-history-empty">{cardText.historyEmpty}</p>
  return (
    <ol className="gh-card-history">
      {contacts.map((entry, i) => {
        const kind = contactKindOf(entry.event)
        const words = kind === null ? "" : contactChoice[kind]
        return (
          <li key={`${entry.timestamp}-${i}`} data-entry={entry.type}>
            <span className="gh-number">{formatDate(entry.timestamp)}</span>
            <span>
              {words}
              {entry.type === "resurrected" ? ` (${cardText.reconnected})` : ""}
            </span>
            <span className="gh-number">{cardText.historyFreshness(shownFreshness(entry.health))}</span>
          </li>
        )
      })}
    </ol>
  )
}
