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
import { listNames, listsText, stateWords, tabsText } from "../wording"
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
  /** Task L3 (Req 38.2): the ids a minute tick just moved; their cards react once. */
  justChanged?: ReadonlySet<string>
  /** Called when a card's reaction ends. */
  onReacted?: (id: string) => void
  /**
   * Feedback list, point 23: show only this list, as the panel of ListTabs.
   * Omitted: all three lists, stacked (as before).
   */
  selected?: ListSection
}

/** The tab order, as the lists were stacked: Fading, Empty windows, Still lit. */
export const TAB_ORDER: readonly ListSection[] = ["fading", "empty", "still"]

/** The first list with someone in it; Fading when every list is empty. */
export function firstOpenTab(counts: Record<ItemState, number>): ListSection {
  if (counts.weak > 0) return "fading"
  if (counts.dead > 0) return "empty"
  if (counts.alive > 0) return "still"
  return "fading"
}

/** The tab's id and its panel's id, so each names the other. */
export const tabId = (section: ListSection) => `gh-tab-${section}`
export const panelId = (section: ListSection) => `gh-tabpanel-${section}`

export interface ListTabsProps {
  counts: Record<ItemState, number>
  selected: ListSection
  onSelect: (section: ListSection) => void
}

/**
 * The three lists as tabs (feedback list, point 23; WAI-ARIA tabs): one list at a
 * time. Each tab shows the state's glyph, its name and its count. Arrow keys,
 * Home and End move between tabs and select them.
 */
export function ListTabs({ counts, selected, onSelect }: ListTabsProps) {
  const entries: { section: ListSection; state: ItemState; label: string; count: number }[] = [
    { section: "fading", state: "weak", label: listNames.weak, count: counts.weak },
    { section: "empty", state: "dead", label: listNames.dead, count: counts.dead },
    { section: "still", state: "alive", label: listNames.alive, count: counts.alive },
  ]
  const move = (from: ListSection, key: string) => {
    const i = TAB_ORDER.indexOf(from)
    const next =
      key === "ArrowRight" ? TAB_ORDER[(i + 1) % 3] : key === "ArrowLeft" ? TAB_ORDER[(i + 2) % 3] : key === "Home" ? TAB_ORDER[0] : key === "End" ? TAB_ORDER[2] : undefined
    if (next === undefined) return false
    onSelect(next)
    document.getElementById(tabId(next))?.focus()
    return true
  }
  return (
    <div className="gh-tabs" role="tablist" aria-label={tabsText.label}>
      {entries.map(({ section, state, label, count }) => (
        <button
          key={section}
          id={tabId(section)}
          type="button"
          role="tab"
          className="gh-tab"
          data-section={section}
          data-state={state}
          aria-selected={selected === section}
          aria-controls={panelId(section)}
          tabIndex={selected === section ? 0 : -1}
          onClick={() => onSelect(section)}
          onKeyDown={(event) => {
            if (move(section, event.key)) event.preventDefault()
          }}
        >
          <StateGlyph state={state} />
          <span>{label}</span>
          <span className="gh-nav-count gh-number">{count}</span>
          <span className="gh-visually-hidden">, {listsText.count(count)}</span>
        </button>
      ))}
    </div>
  )
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

export function ThreeLists({
  view,
  engine,
  blocked,
  headingRefs,
  onOpen,
  actions,
  formatDate,
  justChanged,
  onReacted,
  selected,
}: ThreeListsProps) {
  /** Whether a list is shown: every list without tabs, only the chosen one with them. */
  const shows = (section: ListSection) => selected === undefined || selected === section
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
        justChanged={justChanged?.has(person.id) === true}
        onReacted={onReacted}
        {...actions}
      />
    </li>
  )

  return (
    <div className="gh-lists" data-tabbed={selected === undefined ? undefined : ""}>
      {shows("fading") && (
      <Plot
        tabbed={selected !== undefined}
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
      )}

      {shows("empty") && (
      <Plot
        tabbed={selected !== undefined}
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
      )}

      {shows("still") && (
      <Plot
        tabbed={selected !== undefined}
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
      )}
    </div>
  )
}

interface PlotProps {
  /** Shown as the panel of its tab (ListTabs). */
  tabbed?: boolean
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
function Plot({ tabbed = false, section, className, title, count, headingRef, sub, emptyText, children }: PlotProps) {
  const headingId = useId()
  return (
    <section
      className={`gh-plot ${className}`}
      data-section={section}
      aria-labelledby={headingId}
      {...(tabbed ? { id: panelId(section), role: "tabpanel" } : {})}
    >
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
