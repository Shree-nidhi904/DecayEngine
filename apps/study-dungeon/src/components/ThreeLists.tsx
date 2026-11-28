// The Crypt, the Dungeon and the Graveyard (task 6.1), with remove (task 6.3),
// the Edit button for the add/edit form (task 5.1) and, on graves, the
// Autopsy button (task 10.3).
// Reads everything through engine.view(now); grouping and sorting live in
// ../lists.ts so they can be tested without a browser.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { StudyDungeonEngine } from "../engine-instance"
import type { Fact } from "../policy"
import { buildLists, lastReviewHealth, type FactState } from "../lists"
import { emptyCryptPrompt, landmarkText, sceneText, studyDungeonWording } from "../wording"
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog"
import { FactCard } from "./FactCard"
import { previewCrossings } from "../preview-crossings"
import { Torch, Tree } from "./art/Scenery"
import { Embers, Fireflies, Motes } from "./art/Particles"
import { PeacefulYard } from "./art/Scenery"
import "../styles/lists.css"

/** What a card's main button asks for: Fight (tend) or Challenge (resurrect). */
export type FactAction = "tend" | "resurrect"

export interface ThreeListsProps {
  /** Only reads are used: the lists never write. history is optional (the "lost" segment). */
  engine: Pick<StudyDungeonEngine, "view"> & Partial<Pick<StudyDungeonEngine, "history">>
  /** The time to show (today, or a previewed day once the time machine exists). */
  now: number
  /** Today's real time. When it differs from now, cards say which state a fact is in today. */
  realNow?: number
  /** Bumped by the App after every write, so the lists are read again. */
  version: number
  onAction: (fact: Fact, action: FactAction) => void
  /** Opens the edit form for a fact. */
  onEdit: (fact: Fact) => void
  /** Called after the user confirms removal. */
  onRemove: (id: string) => void
  /**
   * Opens a grave's autopsy. Graves get an Autopsy button only when given.
   * Read-only, so it stays enabled while writes are disabled.
   */
  onAutopsy?: (fact: Fact) => void
  /**
   * When set, every card's buttons are disabled with this reason (the time
   * machine is previewing). They stay visible and say why.
   */
  writesDisabledReason?: string
  /** Task L3 (Requirement 23.2): the ids a minute tick just moved; their cards react once. */
  justChanged?: ReadonlySet<string>
  /** Called when a card's reaction ends. */
  onReacted?: (id: string) => void
  /**
   * Feedback list, point 11: asks for a list to be shown. Each new `n` selects `state`
   * ("Fight the weakest" shows the Dungeon).
   */
  show?: { state: FactState; n: number }
}

const TABS: readonly FactState[] = ["alive", "weak", "dead"]

export function ThreeLists({
  engine,
  now,
  realNow,
  version,
  onAction,
  onEdit,
  onRemove,
  onAutopsy,
  writesDisabledReason,
  justChanged,
  onReacted,
  show,
}: ThreeListsProps) {
  const writesDisabled = writesDisabledReason !== undefined
  const [selected, setSelected] = useState<FactState>("weak")
  useEffect(() => {
    if (show !== undefined && show.n > 0) setSelected(show.state)
  }, [show?.n]) // eslint-disable-line react-hooks/exhaustive-deps
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

  // Each fact's state today, only while a future day is shown.
  const statesToday = useMemo(() => {
    if (realNow === undefined || realNow === now) return null
    return new Map(engine.view(realNow).map((f) => [f.id, f.state] as const))
  }, [engine, realNow, now, version])

  const crossed = useMemo(
    () => (realNow === undefined || realNow === now ? null : previewCrossings(engine.view(realNow), engine.view(now))),
    [engine, realNow, now, version]
  )

  // Health right after each weak fact's last review, read with the lists so a
  // fact removed since then is never looked up.
  const baseHealths = useMemo(() => {
    const map = new Map<string, number>()
    if (engine.history === undefined) return map
    for (const fact of lists.dungeon) {
      const base = lastReviewHealth(engine.history(fact.id))
      if (base !== undefined) map.set(fact.id, base)
    }
    return map
  }, [engine, lists])

  const card = (fact: Fact, wakeAt?: number | null) => (
    <li key={fact.id}>
      <FactCard
        fact={fact}
        now={now}
        wakeAt={wakeAt}
        stateToday={statesToday?.get(fact.id)}
        baseHealth={baseHealths.get(fact.id)}
        onAction={() => onAction(fact, fact.state === "dead" ? "resurrect" : "tend")}
        onAutopsy={fact.state === "dead" && onAutopsy !== undefined ? () => onAutopsy(fact) : undefined}
        onEdit={() => onEdit(fact)}
        onRemove={() => setRemoving(fact)}
        disabled={writesDisabled}
        disabledReason={writesDisabledReason}
        justChanged={justChanged?.has(fact.id) === true}
        onReacted={onReacted}
        crossed={crossed?.get(fact.id)}
      />
    </li>
  )

  const items =
    selected === "alive"
      ? lists.crypt.map(({ fact, wakeAt }) => card(fact, wakeAt))
      : selected === "weak"
        ? lists.dungeon.map((fact) => card(fact))
        : lists.graveyard.map((fact) => card(fact))

  const scene = sceneText[selected]

  return (
    <section className="sd-lists" aria-label="Your facts">
      {/* Landmark for the list tabs (task 16.4). */}
      <nav aria-label={landmarkText.lists}>
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
      </nav>

      <div
        role="tabpanel"
        id={`sd-panel-${selected}`}
        aria-labelledby={`sd-tab-${selected}`}
        className="sd-panel sd-scene"
        data-scene={selected}
        tabIndex={0}
      >
        {selected === "weak" && (
          <>
            <Torch className="sd-wall-torch sd-wall-torch-left" />
            <Torch className="sd-wall-torch sd-wall-torch-right" />
          </>
        )}
        {selected === "dead" && <Tree />}
        {selected === "weak" ? <Embers /> : selected === "alive" ? <Motes /> : <Fireflies />}
        <div className="sd-scene-glow" aria-hidden="true" />
        <h2 className="sd-scene-title">{scene.title}</h2>
        <p className="sd-scene-sub">{scene.sub}</p>
        {items.length === 0 ? (
          <div className="sd-scene-empty">
            <p className="sd-empty">The {studyDungeonWording.lists[selected]} is empty.</p>
            {counts.alive + counts.weak + counts.dead === 0 && <p className="sd-empty">{emptyCryptPrompt}</p>}
            {counts.alive + counts.weak + counts.dead > 0 && (
              <p className="sd-empty sd-empty-hint">{scene.emptyHint}</p>
            )}
            {selected === "dead" && <PeacefulYard />}
          </div>
        ) : (
          <ul className="sd-cards" data-scene={selected}>
            {items}
          </ul>
        )}
        <div className="sd-scene-floor" aria-hidden="true" />
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
