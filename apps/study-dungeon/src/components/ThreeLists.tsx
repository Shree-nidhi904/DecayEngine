// The Crypt, the Dungeon and the Graveyard (task 6.1), with remove (task 6.3)
// and the Edit button for the add/edit form (task 5.1).
// Reads everything through engine.view(now); grouping and sorting live in
// ../lists.ts so they can be tested without a browser.

import { useMemo, useRef, useState, type KeyboardEvent } from "react"
import { ItemCard } from "@decay-engine/shell"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import { buildLists, epitaphOf, formatHealth, formatWakeUp, type FactState } from "../lists"
import { studyDungeonShellTheme } from "../theme"
import { studyDungeonWording } from "../wording"
import { studyDungeonIcons } from "./icons"
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog"
import "../styles/lists.css"

/** What a card's main button asks for: Fight (tend) or Challenge (resurrect). */
export type FactAction = "tend" | "resurrect"

export interface ThreeListsProps {
  /** Only view is used: the lists never write. */
  engine: Pick<StudyDungeonEngine, "view">
  /** The time to show (today, or a previewed day once the time machine exists). */
  now: number
  /** Bumped by the App after every write, so the lists are read again. */
  version: number
  onAction: (fact: Fact, action: FactAction) => void
  /** Opens the edit form for a fact. */
  onEdit: (fact: Fact) => void
  /** Called after the user confirms removal. */
  onRemove: (id: string) => void
}

const TABS: readonly FactState[] = ["alive", "weak", "dead"]

export function ThreeLists({ engine, now, version, onAction, onEdit, onRemove }: ThreeListsProps) {
  const [selected, setSelected] = useState<FactState>("weak")
  const [removing, setRemoving] = useState<Fact | null>(null)
  const tabRefs = useRef<Record<FactState, HTMLButtonElement | null>>({ alive: null, weak: null, dead: null })

  // version is a dependency on purpose: a write changes what view(now) returns
  // without changing now.
  const lists = useMemo(() => buildLists(engine.view(now), now), [engine, now, version])

  const counts: Record<FactState, number> = {
    alive: lists.crypt.length,
    weak: lists.dungeon.length,
    dead: lists.graveyard.length,
  }

  // Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern).
  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(selected)
    let next: number | null = null
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = TABS.length - 1
    if (next === null) return
    event.preventDefault()
    const state = TABS[next]!
    setSelected(state)
    tabRefs.current[state]?.focus()
  }

  const card = (fact: Fact, detail: string | null) => (
    <li key={fact.id}>
      <ItemCard
        item={fact}
        state={fact.state}
        theme={studyDungeonShellTheme}
        wording={studyDungeonWording}
        icons={studyDungeonIcons}
        renderText={(f) => f.payload.question}
        renderDetail={() => detail}
        onAction={() => onAction(fact, fact.state === "dead" ? "resurrect" : "tend")}
        onEdit={() => onEdit(fact)}
        onRemove={() => setRemoving(fact)}
      />
    </li>
  )

  const items =
    selected === "alive"
      ? lists.crypt.map(({ fact, wakeAt }) => card(fact, wakeAt === null ? null : `Wakes ${formatWakeUp(wakeAt)}`))
      : selected === "weak"
        ? lists.dungeon.map((fact) => card(fact, `Health ${formatHealth(fact.health)}`))
        : lists.graveyard.map((fact) => {
            const epitaph = epitaphOf(fact)
            return card(fact, epitaph === null ? null : `“${epitaph}”`)
          })

  return (
    <section className="sd-lists" aria-label="Your facts">
      <div role="tablist" aria-label="Lists" className="sd-tabs" onKeyDown={onTabKeyDown}>
        {TABS.map((state) => (
          <button
            key={state}
            ref={(el) => {
              tabRefs.current[state] = el
            }}
            type="button"
            role="tab"
            id={`sd-tab-${state}`}
            aria-selected={selected === state}
            aria-controls={`sd-panel-${state}`}
            tabIndex={selected === state ? 0 : -1}
            className="sd-tab"
            data-state={state}
            onClick={() => setSelected(state)}
          >
            {studyDungeonWording.lists[state]}
            <span className="sd-tab-count num">{counts[state]}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`sd-panel-${selected}`}
        aria-labelledby={`sd-tab-${selected}`}
        className="sd-panel"
        tabIndex={0}
      >
        {items.length === 0 ? (
          <p className="sd-empty">The {studyDungeonWording.lists[selected]} is empty.</p>
        ) : (
          <ul className="sd-cards">{items}</ul>
        )}
      </div>

      {removing !== null && (
        <ConfirmRemoveDialog
          question={removing.payload.question}
          onConfirm={() => {
            onRemove(removing.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  )
}
