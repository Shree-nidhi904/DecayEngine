// The three lists and the section navigation (task 4.3, design section 4.4;
// Req 11.1-11.6, 16.1). Three full-width sections stacked in the
// wireframe's order: Fading, Empty windows, Still lit. No side-by-side
// columns (Req 11.6, 24.7). Each has its own light (gh-plot-fading reads
// --flick, gh-plot-empty-windows --dark, gh-plot-still --glow) and a count
// badge. Orders come from ../lists.ts. Engine calls: history only.

import { useId, useMemo, type ReactNode, type RefObject } from "react"
import type { ItemState } from "@decay-engine/shell"
import type { GhostedEngine } from "../engine-instance"
import {
  daysUntilFading,
  shownState,
  sortEmpty,
  sortFading,
  sortStillLit,
  type BlockedReason,
  type SectionId,
  type StreetView,
} from "../lists"
import type { Person } from "../policy"
import { listNames, listsText, stateWords } from "../wording"
import { StateGlyph } from "./icons"
import { PersonCard, type PersonActions } from "./PersonCard"
import { Window } from "./Window"
import "../styles/layout.css"

export type ListSection = Exclude<SectionId, "street">

export interface ThreeListsProps {
  view: StreetView
  /** Passed on to each PersonCard (its History) and read once per version for the last contact. */
  engine: Pick<GhostedEngine, "history">
  blocked: BlockedReason
  /** Each section's h2 (tabindex -1), the section navigation's focus targets. */
  headingRefs: Record<ListSection, RefObject<HTMLHeadingElement>>
  /** Still lit rows open the card in a dialog. */
  onOpen: (person: Person) => void
  actions: PersonActions
  /** Dates in the cards' history. */
  formatDate: (ms: number) => string
}

export interface SectionNavProps {
  counts: Record<ItemState, number>
  /** Moves focus to that section's heading. */
  onGoTo: (section: SectionId) => void
}

/** Street, Fading, Empty windows and Still lit, with their counts (Req 11.5). */
export function SectionNav({ counts, onGoTo }: SectionNavProps) {
  const entries: { section: SectionId; label: string; count?: number }[] = [
    { section: "street", label: listsText.street },
    { section: "fading", label: listNames.weak, count: counts.weak },
    { section: "empty", label: listNames.dead, count: counts.dead },
    { section: "still", label: listNames.alive, count: counts.alive },
  ]
  return (
    <nav className="gh-section-nav" aria-label={listsText.navLabel}>
      <ul>
        {entries.map(({ section, label, count }) => (
          <li key={section}>
            <button type="button" className="gh-button" data-section={section} onClick={() => onGoTo(section)}>
              {label}
              {count !== undefined && <span className="gh-nav-count gh-number">{count}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function ThreeLists({ view, engine, blocked, headingRefs, onOpen, actions, formatDate }: ThreeListsProps) {
  const { people, now, darkAt, version } = view

  // Each person's history, read once per version (a write changes it without changing `people`).
  const histories = useMemo(
    () => new Map(people.map((p) => [p.id, engine.history(p.id)] as const)),
    [engine, people, version]
  )
  const fading = useMemo(() => sortFading(people), [people])
  const empty = useMemo(() => sortEmpty(people), [people])
  const still = useMemo(() => sortStillLit(people, now), [people, now])

  const card = (person: Person) => (
    <li key={person.id}>
      <PersonCard
        person={person}
        now={now}
        darkAt={darkAt.get(person.id) ?? null}
        engine={engine}
        history={histories.get(person.id) ?? []}
        blocked={blocked}
        formatDate={formatDate}
        headingLevel={3}
        {...actions}
      />
    </li>
  )

  return (
    <div className="gh-lists">
      <Plot
        section="fading"
        className="gh-plot-fading"
        title={listNames.weak}
        count={fading.length}
        headingRef={headingRefs.fading}
        sub={listsText.fading.sub}
        emptyText={listsText.fading.empty}
      >
        <ul className="gh-cards">{fading.map(card)}</ul>
      </Plot>

      <Plot
        section="empty"
        className="gh-plot-empty-windows"
        title={listNames.dead}
        count={empty.length}
        headingRef={headingRefs.empty}
        sub={listsText.empty.sub}
        emptyText={listsText.empty.empty}
      >
        <ul className="gh-cards">{empty.map(card)}</ul>
      </Plot>

      <Plot
        section="still"
        className="gh-plot-still"
        title={listNames.alive}
        count={still.length}
        headingRef={headingRefs.still}
        sub={listsText.still.sub(still.length)}
        emptyText={listsText.still.empty}
      >
        <ul className="gh-rows">
          {still.map(({ person, fadesAt }) => {
            const state = shownState(person)
            const relationship = person.payload.relationship.trim()
            return (
              <li key={person.id} className="gh-row" data-state={state}>
                <div className="gh-row-who">
                  <Window health={person.health} state={state} size="card" />
                  <span className="gh-state gh-row-state" data-state={state}>
                    <StateGlyph state={state} />
                    {stateWords[state]}
                  </span>
                  <span className="gh-row-name">{person.payload.name}</span>
                  {relationship !== "" && <span className="gh-row-meta">{relationship}</span>}
                  <span className="gh-row-meta" data-fact="fades">
                    {listsText.startsFading(daysUntilFading(fadesAt, now))}
                  </span>
                </div>
                <button type="button" className="gh-button" onClick={() => onOpen(person)}>
                  {listsText.open}
                  {/* The space is outside the hidden span so the accessible name reads "Open Priya Raman". */}
                  {" "}
                  <span className="gh-visually-hidden">{person.payload.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Plot>
    </div>
  )
}

interface PlotProps {
  section: ListSection
  className: string
  title: string
  count: number
  headingRef: RefObject<HTMLHeadingElement>
  sub: string
  /** Shown instead of the list when it is empty (Req 11.6). */
  emptyText: string
  children: ReactNode
}

/** One list: a focusable heading with its count badge, a line about it, then the list or its empty line. */
function Plot({ section, className, title, count, headingRef, sub, emptyText, children }: PlotProps) {
  const headingId = useId()
  return (
    <section className={`gh-plot ${className}`} data-section={section} aria-labelledby={headingId}>
      <div className="gh-plot-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="gh-plot-title">
          {title}
        </h2>
        <span className="gh-badge" data-count={count}>
          <span aria-hidden="true">{count}</span>
          <span className="gh-visually-hidden">{listsText.count(count)}</span>
        </span>
      </div>
      <p className="gh-plot-sub">{sub}</p>
      {count === 0 ? <p className="gh-plot-empty">{emptyText}</p> : children}
    </section>
  )
}
