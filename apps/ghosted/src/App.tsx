// The Ghosted App frame (task 2.8, design sections 1.2, 4.2 and 4.3).
//
// It mirrors Study Dungeon's App.tsx pattern but is not copied from it. The
// App owns the only engine, the time (`realNow`, `previewOffsetMs`, `now`),
// the `version` bumped after every write, the one open dialog, the Triage
// session and the polite live region. Every write goes through
// `runGatedWrite`, which reads `previewing` from a ref at the moment of the
// call, so nothing is saved during a preview (Open issue 2.3).
//
// Layout: <header>, <main> (live region first, then the section navigation
// and the three lists, task 4.3) and a dock slot. The header holds a plain h1
// until NeonSign replaces it (task 4.14). The hero, Triage, Street, forecast,
// toolbar, privacy line, dialogs and the dock are wired in by later tasks.

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import type { RestoreCheck } from "./backup"
import type { PersonActions } from "./components/PersonCard"
import { SectionNav, ThreeLists, type ListSection } from "./components/ThreeLists"
import type { GhostedEngine } from "./engine-instance"
import type { FlagStorage } from "./first-run"
import { stateCounts, type SectionId, type StreetView } from "./lists"
import type { Person } from "./policy"
import type { SessionFlagStorage } from "./splash"
import { classifyWriteError, storageProblemText, type WriteProblem } from "./storage-errors"
import { useSettleTicks, type Scheduler } from "./ticking"
import { DAY_MS } from "./time"
import { appText, previewBlockedText } from "./wording"
import { runGatedWrite, type WriteOutcome } from "./write-guard"
import "./styles/layout.css"

/** The id of the polite live region that announces changes and storage problems. */
export const ANNOUNCER_ID = "gh-announcer"

/** The dock's full range: --age is the preview offset over one year (Req 12.2). */
const AGE_SPAN_MS = 365 * DAY_MS

export interface AppProps {
  /** The app's engine. Root passes the localStorage one; tests pass one on InMemoryAdapter. */
  engine: GhostedEngine
  /** Flags, and what "Reset all data" clears. Root passes window.localStorage. */
  storage: FlagStorage
  /** The splash flag's storage: window.sessionStorage, or null when it cannot be used. */
  session: SessionFlagStorage | null
  /** The real clock. Every write and every settle tick uses it, never the preview time. Default Date.now. */
  clock?: () => number
  /** The settle-tick interval scheduler. Defaults to setInterval. */
  tickScheduler?: Scheduler
  /** Animation frames for the time machine's Play (passed to TimeMachine). */
  frameScheduler?: FrameScheduler
  /** Clock for Play's timing. */
  frameClock?: () => number
  /** Whether the user asked for reduced motion. Defaults to the media query. */
  prefersReducedMotion?: () => boolean
  /** Time zone for dates and day starts. Tests pass "UTC". */
  timeZone?: string
  /** Reloads the page after a reset or a restore. */
  reload?: () => void
}

/** The one dialog open at a time, if any (design section 4.3). */
export type OpenDialog =
  | { kind: "add" }
  | { kind: "import" }
  | { kind: "edit"; person: Person }
  | { kind: "person"; id: string }
  | { kind: "reach-out"; person: Person }
  | { kind: "reconnect"; person: Person }
  | { kind: "autopsy"; id: string }
  | { kind: "remove"; person: Person }
  | { kind: "reset" }
  | { kind: "restore"; check: Extract<RestoreCheck, { ok: true }> }

/** The Triage session queue (Req 9.5, design section 4.3). */
export type Session = { ids: string[]; position: number; skipped: { name: string; reason: "dark" | "removed" }[] }

/** What the live region says. `id` changes every time, so the same words are read again. */
type Announcement = { id: number; text: string; problem: boolean }

/** "14 Nov 2023" in the given time zone (the viewer's when omitted). */
function makeDateFormatter(timeZone: string | undefined): (ms: number) => string {
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone === undefined ? {} : { timeZone }),
  })
  return (ms) => format.format(ms)
}

export function App({ engine, clock = Date.now, tickScheduler, timeZone }: AppProps) {
  // The clock, refreshed by every settle tick below.
  const [realNow, setRealNow] = useState(() => clock())

  // Set by the dock (task 5.1). 0 is today; above 0 is a preview, and every
  // write is blocked. Never compare `now` with the clock to decide this.
  const [previewOffsetMs] = useState(0)
  const previewing = previewOffsetMs > 0
  // Every read uses `now`; every write uses clock() (design section 4.2).
  const now = realNow + previewOffsetMs
  const blocked = previewing ? previewBlockedText : undefined

  // Read by runGatedWrite at the moment of each write, not from the render
  // that opened a dialog.
  const previewingRef = useRef(previewing)
  previewingRef.current = previewing

  // Bumped after every write, so the views read the engine again.
  const [version, setVersion] = useState(0)
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  // The dialogs are wired in by later tasks (4.6 onward); the actions already
  // name the dialog they open.
  const [, setOpenDialog] = useState<OpenDialog | null>(null)
  const [, setSession] = useState<Session | null>(null)

  // Every read view at `now` (design section 4.2). `version` is a dependency
  // on purpose: a write changes what the engine returns without changing now.
  const people = useMemo(() => engine.view(now), [engine, now, version])
  const darkAt = useMemo(
    () => new Map(engine.forecast(now, MAX_FORECAST_HORIZON_MS).map((e) => [e.item.id, e.diesAt] as const)),
    [engine, now, version]
  )
  const view: StreetView = useMemo(
    () => ({ now, realNow, people, darkAt, version }),
    [now, realNow, people, darkAt, version]
  )
  const counts = useMemo(() => stateCounts(people), [people])
  const formatDate = useMemo(() => makeDateFormatter(timeZone), [timeZone])

  // Each list's heading, focused by the section navigation (Req 11.5).
  const fadingHeading = useRef<HTMLHeadingElement>(null)
  const emptyHeading = useRef<HTMLHeadingElement>(null)
  const stillHeading = useRef<HTMLHeadingElement>(null)
  const headingRefs = useMemo(
    () => ({ fading: fadingHeading, empty: emptyHeading, still: stillHeading }),
    []
  )
  const goTo = useCallback(
    (section: SectionId) => {
      // The Street and its heading come with task 4.4; until then there is nothing to focus.
      if (section === "street") return
      headingRefs[section as ListSection].current?.focus()
    },
    [headingRefs]
  )

  const actions: PersonActions = useMemo(
    () => ({
      onReachOut: (person) => setOpenDialog({ kind: "reach-out", person }),
      onReconnect: (person) => setOpenDialog({ kind: "reconnect", person }),
      onAutopsy: (person) => setOpenDialog({ kind: "autopsy", id: person.id }),
      onEdit: (person) => setOpenDialog({ kind: "edit", person }),
      onRemove: (person) => setOpenDialog({ kind: "remove", person }),
    }),
    []
  )
  const openPerson = useCallback((person: Person) => setOpenDialog({ kind: "person", id: person.id }), [])

  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const announce = useCallback(
    (text: string, problem = false) => setAnnouncement((a) => ({ id: (a?.id ?? 0) + 1, text, problem })),
    []
  )

  /**
   * A write's storage problem (quota full, storage unavailable): announced,
   * and the open dialog and any Triage session are closed. The engine saved
   * and changed nothing, so the screen stays true (Req 23.3).
   */
  const showWriteProblem = useCallback(
    (problem: WriteProblem) => {
      setSession(null)
      setOpenDialog(null)
      announce(storageProblemText[problem], true)
    },
    [announce]
  )

  /** The only way the App writes (design section 4.2). Bumps `version` after a save. */
  const write = useCallback(
    (run: () => void): WriteOutcome => {
      const outcome = runGatedWrite(previewingRef.current, run, showWriteProblem)
      if (outcome === "saved") bumpVersion()
      return outcome
    },
    [showWriteProblem, bumpVersion]
  )
  void write

  // Ticks on mount and every minute while not previewing; each tick's time
  // becomes realNow. A tick can hit a full storage too: say so once, and
  // again only after a later tick has saved. Other errors are bugs: rethrown.
  const tickProblemShown = useRef(false)
  const tickFailed = useRef(false)
  const handleTickError = useCallback(
    (error: unknown) => {
      const problem = classifyWriteError(error)
      if (problem === null) throw error
      tickFailed.current = true
      if (tickProblemShown.current) return
      tickProblemShown.current = true
      announce(storageProblemText[problem], true)
    },
    [announce]
  )
  // Called after every tick, failed or not (startTicking calls onError first).
  const handleTick = useCallback((at: number) => {
    if (!tickFailed.current) tickProblemShown.current = false
    tickFailed.current = false
    setRealNow(at)
  }, [])
  useSettleTicks(engine, previewing, handleTick, {
    getNow: clock,
    scheduler: tickScheduler,
    onError: handleTickError,
  })

  const age = Math.min(1, previewOffsetMs / AGE_SPAN_MS)
  const appStyle = { "--age": age.toFixed(4) } as CSSProperties

  return (
    <div className="gh-app" style={appStyle} data-previewing={previewing ? "" : undefined}>
      <header className="gh-header">
        <h1>{appText.name}</h1>
        <p className="gh-tagline">{appText.tagline}</p>
      </header>
      <main className="gh-main">
        {/* Always on the page, so screen readers hear every change. */}
        <div
          id={ANNOUNCER_ID}
          className="gh-announcer"
          aria-live="polite"
          aria-atomic="true"
          data-problem={announcement?.problem === true ? "" : undefined}
        >
          {announcement !== null && <p key={announcement.id}>{announcement.text}</p>}
        </div>
        <SectionNav counts={counts} onGoTo={goTo} />
        <ThreeLists
          view={view}
          engine={engine}
          blocked={blocked}
          headingRefs={headingRefs}
          onOpen={openPerson}
          actions={actions}
          formatDate={formatDate}
        />
      </main>
      <div className="gh-dock-slot" />
    </div>
  )
}
