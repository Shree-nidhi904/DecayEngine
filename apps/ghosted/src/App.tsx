// The Ghosted App frame (task 2.8, design sections 1.2, 4.2 and 4.3).
//
// It mirrors Study Dungeon's App.tsx pattern but is not copied from it. The
// App owns the only engine, the time (`realNow`, `previewOffsetMs`, `now`),
// the `version` bumped after every write, the one open dialog, the Triage
// session and the polite live region. Every write goes through
// `runGatedWrite`, which reads `previewing` from a ref at the moment of the
// call, so nothing is saved during a preview (Open issue 2.3).
//
// Layout: the splash (task 4.14, once per tab, never under reduced motion),
// <header> with the neon sign, the page's one h1 (task 4.14), <main> (live
// region first, then the hero, task 4.5; the Street, task 4.4, straight after
// the hero so it is on the first screen (task L1, Req 33); the section
// navigation; Triage, task 4.12; the three lists, task 4.3; then the forecast,
// the toolbar and the privacy line) and a dock slot. With no people (the first
// run, or after "Start empty") only the hero, the toolbar and the privacy
// line are shown, so no empty list sits beside the hero (Req 20.9). The
// open dialog is also exposed as data-dialog on .gh-app.
//
// Task 5.1: the moon-clock dock comes after <main>, so it is last in the Tab
// order. It sets the preview offset; `--age` (offset / 365 days) goes on
// .gh-app, where the dim layer and the moon read it, and every view reads at
// `now`. Its markers are worked out at the real time. "Back to today" sets
// the offset to 0, and useSettleTicks then ticks straight away. Task L2: the
// dock starts collapsed and keeps its expanded choice in the same
// sessionStorage as the splash flag (the `session` prop). Task 5.2:
// the forecast after the lists. Task 5.3: "Import people", "Back up" and
// "Restore" in the toolbar; an import and a restore mark the people as the
// user's own (the restore through applyBackup), which changes the privacy line.
// Task P4: the hero's loss forecast line, worked out at the real time and
// hidden while previewing and on the first run.
//
// Dialogs (tasks 4.6 to 4.12): the confirmation before Remove, the person
// dialog, Reach out (alone or in a Triage session), Reconnect, Add and Edit,
// and the autopsy (which hands over to Reconnect); "Reset all data" in the
// toolbar opens its own confirmation (ResetData). Each dialog returns focus
// to its opener; when the opener is gone (a removed person's card), focus
// goes to the hero heading (Req 24.3).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { MAX_FORECAST_HORIZON_MS } from "@decay-engine/engine"
import type { FrameScheduler } from "@decay-engine/shell"
import { applyBackup, type RestoreCheck } from "./backup"
import { AddEditPersonDialog } from "./components/AddEditPersonDialog"
import { BackupControls } from "./components/BackupControls"
import { ConfirmDialog } from "./components/ConfirmDialog"
import { ForecastControl } from "./components/ForecastControl"
import { GhostedTriage, type GhostedCandidate } from "./components/GhostedTriage"
import { Hero } from "./components/Hero"
import { ImportDialog } from "./components/ImportDialog"
import { MoonDock } from "./components/MoonDock"
import type { PersonActions } from "./components/PersonCard"
import { NeonSign } from "./components/NeonSign"
import { PersonAutopsy } from "./components/PersonAutopsy"
import { PersonDialog } from "./components/PersonDialog"
import { PrivacyLine } from "./components/PrivacyLine"
import { ReachOutDialog } from "./components/ReachOutDialog"
import { ReconnectDialog } from "./components/ReconnectDialog"
import { ResetData } from "./components/ResetData"
import { Street } from "./components/Street"
import { Splash } from "./components/Splash"
import { SectionNav, ThreeLists, type ListSection } from "./components/ThreeLists"
import type { GhostedEngine } from "./engine-instance"
import { hasOwnPeople, markOwnPeople, markStarted, needsFirstRun, resetAllData, type FlagStorage } from "./first-run"
import { lastLoggedContactAt, stateCounts, type SectionId, type StreetView } from "./lists"
import { LOSS_FORECAST_DAYS, lossForecast } from "./loss-forecast"
import type { Person } from "./policy"
import { loadSampleData } from "./sample-data"
import { markSplashSeen, mediaPrefersReducedMotion, shouldShowSplash, type SessionFlagStorage } from "./splash"
import { classifyWriteError, storageProblemText, type WriteProblem } from "./storage-errors"
import { useSettleTicks, type Scheduler } from "./ticking"
import { CLOCK_BEHIND_NOTICE_MS, clockBehindText, heldClock } from "./clock-guard"
import { DAY_MS } from "./time"
import { DOCK_DAYS, dockMarkers } from "./timeline"
import {
  appText,
  backupText,
  importDialogText,
  personFormText,
  previewBlockedText,
  removeText,
  sessionText,
  toolbarText,
} from "./wording"
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

/** The page's own reload, used after "Reset all data" when no reload is given. */
const reloadPage = () => window.location.reload()

export function App({
  engine,
  storage,
  session: splashStorage,
  clock: clockProp = Date.now,
  tickScheduler,
  frameScheduler,
  frameClock,
  prefersReducedMotion = mediaPrefersReducedMotion,
  timeZone,
  reload = reloadPage,
}: AppProps) {
  // The clock never runs behind the newest saved event (clock-guard.ts): the engine refuses a
  // write dated before one it holds, so a device clock that moved back would crash every tick.
  const clock = useMemo(() => heldClock(clockProp, engine), [clockProp, engine])

  // The clock, refreshed by every settle tick below.
  const [realNow, setRealNow] = useState(() => clock())

  // The splash (task 4.14, Req 6): once per tab, never under reduced motion.
  // It is marked seen as soon as it shows, so a reload in the same tab skips
  // it even if it was never dismissed (Req 6.2). (`splashStorage` is the
  // `session` prop; `session` below is the Triage session.)
  const [showSplash, setShowSplash] = useState(() => shouldShowSplash(splashStorage, prefersReducedMotion()))
  const [splashClosed, setSplashClosed] = useState(false)
  useEffect(() => {
    if (showSplash) markSplashSeen(splashStorage)
  }, [showSplash, splashStorage])
  const closeSplash = useCallback(() => {
    markSplashSeen(splashStorage)
    setShowSplash(false)
    setSplashClosed(true)
  }, [splashStorage])

  // Set by the dock (task 5.1). 0 is today; above 0 is a preview, and every
  // write is blocked. Never compare `now` with the clock to decide this.
  const [previewOffsetMs, setPreviewOffsetMs] = useState(0)
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

  // The one open dialog, and the Triage session's queue.
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  // The names of a session's picks, kept from its start so a person removed
  // since can still be named in the closing message.
  const sessionNames = useRef(new Map<string, string>())

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
  // The dock's markers mark days ahead of today, so they are read at the real
  // time and stay put while the slider moves (design section 4.2).
  const markers = useMemo(
    () => dockMarkers(engine.view(realNow), engine.forecast(realNow, DOCK_DAYS * DAY_MS), realNow),
    [engine, realNow, version]
  )
  // The hero's loss forecast line (task P4, Req 35, design section 12.4): at
  // the real time, again after every write (`version`) and every settle tick
  // (`realNow`). Its own 7-day forecast, so the 7-day boundary is exact
  // (design section 12.1). It stores nothing.
  const loss = useMemo(
    () => lossForecast(engine.view(realNow), engine.forecast(realNow, LOSS_FORECAST_DAYS * DAY_MS), realNow),
    [engine, realNow, version]
  )

  // The flags are read again after every write (`version`): the first-run
  // buttons set "started", and add, import and restore set "own people".
  const firstRun = useMemo(() => needsFirstRun(storage, people.length), [storage, people.length, version])
  const ownPeople = useMemo(() => hasOwnPeople(storage), [storage, version])

  // The hero's heading: the focus target after the splash and when a dialog's opener is gone.
  const heroHeading = useRef<HTMLHeadingElement>(null)
  // The Street's and each list's heading, focused by the section navigation (Req 11.5).
  const streetHeading = useRef<HTMLHeadingElement>(null)
  const fadingHeading = useRef<HTMLHeadingElement>(null)
  const emptyHeading = useRef<HTMLHeadingElement>(null)
  const stillHeading = useRef<HTMLHeadingElement>(null)
  const headingRefs = useMemo(
    () => ({ fading: fadingHeading, empty: emptyHeading, still: stillHeading }),
    []
  )
  const goTo = useCallback(
    (section: SectionId) => {
      if (section === "street") streetHeading.current?.focus()
      else headingRefs[section as ListSection].current?.focus()
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

  const closeDialog = useCallback(() => setOpenDialog(null), [])

  // The Triage session (task 4.12, Req 9.5, design section 4.3): a Reach out
  // dialog for each pick in triage order. Each person is looked up again at
  // the real time when their turn comes; someone who went dark or was
  // removed since is skipped and named in the closing message. Closing a
  // dialog (Done, Cancel or Escape) opens the next one; "Stop session" drops
  // the rest. The next dialog renders while focus is still inside the last
  // one, so it takes over the opener (the Start button), as in Study Dungeon.
  const finishSession = useCallback(
    (skipped: Session["skipped"]) => {
      setSession(null)
      setOpenDialog(null)
      const names = skipped.map((s) =>
        s.reason === "dark" ? sessionText.skippedDark(s.name) : sessionText.skippedRemoved(s.name)
      )
      announce(names.length === 0 ? sessionText.finished : `${sessionText.finished} ${sessionText.skipped(names.join(", "))}`)
    },
    [announce]
  )
  /** Opens the first person from `from.position` on who can still be reached, or ends the session. */
  const runSession = useCallback(
    (from: Session) => {
      const current = engine.view(clock())
      const skipped = [...from.skipped]
      for (let position = from.position; position < from.ids.length; position++) {
        const id = from.ids[position]!
        const person = current.find((p) => p.id === id)
        const name = sessionNames.current.get(id) ?? person?.payload.name ?? id
        if (person === undefined) {
          skipped.push({ name, reason: "removed" })
        } else if (person.state === "dead") {
          skipped.push({ name, reason: "dark" })
        } else {
          setSession({ ids: from.ids, position, skipped })
          setOpenDialog({ kind: "reach-out", person })
          return
        }
      }
      finishSession(skipped)
    },
    [engine, clock, finishSession]
  )
  const startSession = useCallback(
    (picks: GhostedCandidate[]) => {
      sessionNames.current = new Map(picks.map((p) => [p.item.id, p.item.payload.name] as const))
      runSession({ ids: picks.map((p) => p.item.id), position: 0, skipped: [] })
    },
    [runSession]
  )
  const nextInSession = useCallback(() => {
    if (session === null) setOpenDialog(null)
    else runSession({ ...session, position: session.position + 1 })
  }, [session, runSession])
  const stopSession = useCallback(() => {
    setSession(null)
    setOpenDialog(null)
  }, [])

  // Autopsy → Reconnect (task 4.11, Req 19.5): the reconnect dialog replaces
  // the autopsy and takes over its opener. Disabled during a preview, and
  // the gate blocks the reconnect anyway.
  const autopsyId = openDialog?.kind === "autopsy" ? openDialog.id : undefined
  const reconnectFromAutopsy = useCallback(() => {
    if (autopsyId === undefined || previewingRef.current) return
    const person = engine.view(clock()).find((p) => p.id === autopsyId)
    if (person === undefined || person.state !== "dead") setOpenDialog(null)
    else setOpenDialog({ kind: "reconnect", person })
  }, [autopsyId, engine, clock])

  // When the last dialog closes, useModalDialog gives focus back to its
  // opener. If the opener is gone (the card of a removed person), nothing has
  // focus: the hero heading takes it (Req 24.3, design section 9.4). Chains
  // (person dialog → Reach out) never pass through "no dialog", so they keep
  // the first opener. The dialog's own cleanup runs before this effect.
  const hadDialog = useRef(false)
  useEffect(() => {
    if (openDialog !== null) {
      hadDialog.current = true
      return
    }
    if (!hadDialog.current) return
    hadDialog.current = false
    const active = document.activeElement
    if (active === null || active === document.body) heroHeading.current?.focus()
  }, [openDialog])

  // "Walk in" or Escape on the splash: focus goes to the hero heading (Req 6.4).
  // This runs after the splash's own cleanup, which had no opener to return to.
  useEffect(() => {
    if (splashClosed) heroHeading.current?.focus()
  }, [splashClosed])

  // Remove only after the confirmation, through the gate (Req 13.5, 12.5).
  const confirmRemove = useCallback(
    (person: Person) => {
      const outcome = write(() => engine.remove(person.id))
      // A storage problem has already closed the dialog and said why.
      if (outcome !== "storage-problem") setOpenDialog(null)
      if (outcome === "blocked") announce(previewBlockedText)
    },
    [write, engine, announce]
  )

  // Reset all data: exactly RESET_KEYS, then a reload that starts the first run again (Req 20.7).
  const confirmReset = useCallback(() => {
    const outcome = write(() => resetAllData(storage, reload))
    if (outcome === "blocked") announce(previewBlockedText)
  }, [write, storage, reload, announce])

  // The person dialog shows the person as the engine has them at `now`.
  const dialogPerson =
    openDialog?.kind === "person" ? people.find((p) => p.id === openDialog.id) : undefined
  const dialogHistory = useMemo(
    () => (dialogPerson === undefined ? [] : engine.history(dialogPerson.id)),
    [engine, dialogPerson?.id, version]
  )

  // First run (Req 20.1, 20.6). Both buttons set the "started" flag, through
  // the gate like every other write. The sample is replayed at the real time,
  // which then becomes realNow, so the street is shown as it was just saved.
  const loadSample = useCallback(() => {
    const at = clock()
    const outcome = write(() => {
      loadSampleData(engine, at)
      markStarted(storage)
    })
    if (outcome === "saved") setRealNow(at)
  }, [clock, write, engine, storage])
  // "Start empty" opens "Add a person" (task 4.10).
  const startEmpty = useCallback(() => {
    if (write(() => markStarted(storage)) === "saved") setOpenDialog({ kind: "add" })
  }, [write, storage])
  const openAdd = useCallback(() => setOpenDialog({ kind: "add" }), [])

  // Add and edit (task 4.10, Req 17). The form writes through its own gate
  // and keeps a storage problem inside itself (Req 17.8); after a save the
  // App announces it, and an add marks the people as the user's own, which
  // changes the privacy line (Req 15.2).
  const isPreviewing = useCallback(() => previewingRef.current, [])
  const personSaved = useCallback(
    (id: string, mode: "added" | "edited") => {
      const name = engine.view(clock()).find((p) => p.id === id)?.payload.name ?? ""
      bumpVersion()
      // A storage problem with the flag is announced by the gate instead.
      if (mode === "added" && write(() => markOwnPeople(storage)) === "storage-problem") return
      announce(mode === "added" ? personFormText.added(name) : personFormText.edited(name))
    },
    [engine, clock, bumpVersion, write, storage, announce]
  )
  const relationships = useMemo(() => people.map((p) => p.payload.relationship), [people])
  const editPerson = openDialog?.kind === "edit" ? openDialog.person : undefined
  const editLastContactAt = useMemo(
    () => (editPerson === undefined ? undefined : lastLoggedContactAt(engine.history(editPerson.id), editPerson.payload)),
    [engine, editPerson, version]
  )

  // Import (task 5.3, Req 21.5, 21.6). The dialog adds each person through its
  // own gate and keeps a storage problem inside itself, with the lines not yet
  // added. After any add the people are the user's own (Req 15.2). The flag
  // goes through the gate too; a storage problem with it is only announced,
  // so an import that stopped part-way keeps its dialog and text open.
  const openImport = useCallback(() => setOpenDialog({ kind: "import" }), [])
  const peopleImported = useCallback(
    (added: number) => {
      bumpVersion()
      const outcome = runGatedWrite(previewingRef.current, () => markOwnPeople(storage), (problem) =>
        announce(storageProblemText[problem], true)
      )
      if (outcome === "saved") announce(importDialogText.imported(added))
    },
    [bumpVersion, storage, announce]
  )

  // Restore (task 5.3, Req 21.2, 21.3, design section 9.3): BackupControls
  // checked the file; this asks first, then replaces the stored street through
  // the gate (applyBackup also marks the people as the user's own) and reloads.
  // A storage problem is announced and nothing reloads.
  const restoreChecked = useCallback(
    (check: Extract<RestoreCheck, { ok: true }>) => setOpenDialog({ kind: "restore", check }),
    []
  )
  const confirmRestore = useCallback(
    (check: Extract<RestoreCheck, { ok: true }>) => {
      const outcome = write(() => applyBackup(storage, check.snapshot))
      if (outcome === "saved") {
        setOpenDialog(null)
        reload()
      } else if (outcome === "blocked") {
        setOpenDialog(null)
        announce(previewBlockedText)
      }
    },
    [write, storage, reload, announce]
  )
  const today = useCallback(() => new Date(clock()), [clock])

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
  const clockNoticeShown = useRef(false)
  const handleTick = useCallback(
    (at: number) => {
      if (!tickFailed.current) tickProblemShown.current = false
      tickFailed.current = false
      // Held behind the real clock by a saved event from the future: say so once.
      if (at - clockProp() > CLOCK_BEHIND_NOTICE_MS && !clockNoticeShown.current) {
        clockNoticeShown.current = true
        announce(clockBehindText, true)
      }
      setRealNow(at)
    },
    [announce, clockProp]
  )
  useSettleTicks(engine, previewing, handleTick, {
    getNow: clock,
    scheduler: tickScheduler,
    onError: handleTickError,
  })

  const age = Math.min(1, previewOffsetMs / AGE_SPAN_MS)
  const appStyle = { "--age": age.toFixed(4) } as CSSProperties

  return (
    <div
      className="gh-app"
      style={appStyle}
      data-previewing={previewing ? "" : undefined}
      data-dialog={openDialog?.kind}
    >
      {/* The street dims as the dock looks ahead (dock.css reads --age). */}
      <div className="gh-age-dim" aria-hidden="true" />
      {showSplash && <Splash onDone={closeSplash} />}
      <header className="gh-header">
        <NeonSign title={appText.name} tagline={appText.tagline} />
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
        <Hero
          people={people}
          firstRun={firstRun}
          previewDate={previewing ? formatDate(now) : undefined}
          blocked={blocked}
          headingRef={heroHeading}
          onReachOut={actions.onReachOut}
          onGoTo={goTo}
          onLoadSample={loadSample}
          onStartEmpty={startEmpty}
          onAdd={openAdd}
          loss={previewing || firstRun ? undefined : loss}
        />
        {people.length > 0 && (
          <>
            <Street people={people} onOpen={openPerson} headingRef={streetHeading} />
            <SectionNav counts={counts} onGoTo={goTo} />
            <GhostedTriage
              engine={engine}
              now={now}
              version={version}
              blocked={blocked}
              onStartSession={startSession}
              onReachOut={actions.onReachOut}
            />
            <ThreeLists
              view={view}
              engine={engine}
              blocked={blocked}
              headingRefs={headingRefs}
              onOpen={openPerson}
              actions={actions}
              formatDate={formatDate}
            />
            <ForecastControl engine={engine} now={now} version={version} formatDate={formatDate} />
          </>
        )}
        <div className="gh-toolbar">
          {/* Quiet: the hero holds the page's filled "Add a person" on an empty street. */}
          <button
            type="button"
            className="gh-button"
            data-action="add"
            aria-disabled={blocked !== undefined ? "true" : undefined}
            title={blocked}
            onClick={blocked !== undefined ? undefined : openAdd}
          >
            {toolbarText.addPerson}
          </button>
          <button
            type="button"
            className="gh-button"
            data-action="import"
            aria-disabled={blocked !== undefined ? "true" : undefined}
            title={blocked}
            onClick={blocked !== undefined ? undefined : openImport}
          >
            {importDialogText.open}
          </button>
          <BackupControls
            storage={storage}
            announce={announce}
            restoreBlocked={blocked}
            today={today}
            timeZone={timeZone}
            onRestoreChecked={restoreChecked}
          />
          <ResetData onConfirm={confirmReset} blocked={blocked} />
        </div>
        <PrivacyLine ownPeople={ownPeople} />
      </main>
      <MoonDock
        today={realNow}
        offsetMs={previewOffsetMs}
        onChange={setPreviewOffsetMs}
        markers={markers}
        formatDate={formatDate}
        timeZone={timeZone}
        frames={frameScheduler}
        clock={frameClock}
        prefersReducedMotion={prefersReducedMotion}
        session={splashStorage}
      />

      {openDialog?.kind === "import" && (
        <ImportDialog
          engine={engine}
          clock={clock}
          timeZone={timeZone}
          previewing={isPreviewing}
          onImported={peopleImported}
          onClose={closeDialog}
        />
      )}
      {openDialog?.kind === "restore" && (
        <ConfirmDialog
          message={backupText.confirm(openDialog.check.people)}
          confirmLabel={backupText.confirmLabel}
          onConfirm={() => confirmRestore(openDialog.check)}
          onCancel={closeDialog}
        />
      )}

      {(openDialog?.kind === "add" || editPerson !== undefined) && (
        <AddEditPersonDialog
          key={editPerson?.id ?? "add"}
          engine={engine}
          clock={clock}
          timeZone={timeZone}
          person={editPerson}
          lastContactAt={editLastContactAt}
          relationships={relationships}
          blocked={blocked}
          previewing={isPreviewing}
          onSaved={personSaved}
          onClose={closeDialog}
        />
      )}
      {openDialog?.kind === "remove" && (
        <ConfirmDialog
          message={removeText.confirm(openDialog.person.payload.name)}
          confirmLabel={removeText.confirmLabel}
          onConfirm={() => confirmRemove(openDialog.person)}
          onCancel={closeDialog}
        />
      )}
      {dialogPerson !== undefined && (
        <PersonDialog
          person={dialogPerson}
          now={now}
          darkAt={darkAt.get(dialogPerson.id) ?? null}
          engine={engine}
          history={dialogHistory}
          blocked={blocked}
          formatDate={formatDate}
          actions={actions}
          onClose={closeDialog}
        />
      )}
      {openDialog?.kind === "reach-out" && (
        <ReachOutDialog
          key={session === null ? openDialog.person.id : `${openDialog.person.id}@${session.position}`}
          engine={engine}
          clock={clock}
          person={openDialog.person}
          blocked={blocked}
          session={
            session === null
              ? undefined
              : { position: session.position + 1, total: session.ids.length, onStop: stopSession }
          }
          write={write}
          onWrite={bumpVersion}
          onClose={session === null ? closeDialog : nextInSession}
          formatDate={formatDate}
        />
      )}
      {autopsyId !== undefined && (
        <PersonAutopsy
          key={autopsyId}
          engine={engine}
          personId={autopsyId}
          now={now}
          formatDate={formatDate}
          timeZone={timeZone}
          onClose={closeDialog}
          onReconnect={reconnectFromAutopsy}
          blocked={blocked}
        />
      )}
      {openDialog?.kind === "reconnect" && (
        <ReconnectDialog
          key={openDialog.person.id}
          engine={engine}
          clock={clock}
          person={openDialog.person}
          blocked={blocked}
          write={write}
          onWrite={bumpVersion}
          onClose={closeDialog}
        />
      )}
    </div>
  )
}
