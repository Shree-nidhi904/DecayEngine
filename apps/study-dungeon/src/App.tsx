import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import {
  PreviewBanner,
  TIME_MACHINE_MAX_OFFSET_MS,
  TriagePanel,
  type FrameScheduler,
} from "@decay-engine/shell"
import type { TriageCandidate } from "@decay-engine/engine"
import type { StudyDungeonEngine } from "./engine-instance"
import { useSettleTicks, type Scheduler } from "./ticking"
import type { Fact, FactPayload, FactPolicyData } from "./policy"
import { ThreeLists, type FactAction } from "./components/ThreeLists"
import { AddEditFactDialog } from "./components/AddEditFactDialog"
import { FightDialog, type FightResult } from "./components/FightDialog"
import { ChallengeDialog, type ChallengeResult } from "./components/ChallengeDialog"
import { FactAutopsy } from "./components/FactAutopsy"
import { FirstRun } from "./components/FirstRun"
import { HeroSection } from "./components/HeroSection"
import { ResetData } from "./components/ResetData"
import { SoundToggle } from "./components/SoundToggle"
import { Tour } from "./components/Tour"
import { TimeDock } from "./components/TimeDock"
import { Creature } from "./components/art/Creature"
import { Atmosphere, Bats, Torch } from "./components/art/Scenery"
import { creatureOf, moodOf } from "./creatures"
import { loadSampleData } from "./sample-data"
import {
  hasStarted,
  isTourDone,
  markStarted,
  markTourDone,
  needsFirstRun,
  resetAllData,
  type FlagStorage,
} from "./first-run"
import { classifyWriteError, storageProblemText, type WriteProblem } from "./storage-errors"
import { reportWriteError, runWrite } from "./write-guard"
import { createSoundPlayer, loadSoundEnabled, saveSoundEnabled, type AudioContextLike } from "./sound"
import { studyDungeonShellTheme } from "./theme"
import {
  announceText,
  factFormText,
  formatPreviewDate,
  headerText,
  landmarkText,
  previewBlockedText,
  sessionText,
  studyDungeonWording,
} from "./wording"
import "./styles/dialogs.css"
import "./styles/app.css"
import "./styles/world.css"
import "./styles/dock.css"
import "./styles/animations.css"
import "./styles/layout.css"

/** engine.triage accepts budgets from 1 to 1440 minutes (engine Requirement 17b). */
export const TRIAGE_MAX_BUDGET_MINUTES = 1440

/** The id of the polite live region that announces changes and storage problems (task 16.4). */
export const ANNOUNCER_ID = "sd-announcer"

export interface AppProps {
  /** The app's engine. Root passes the localStorage one; tests pass one on InMemoryAdapter. */
  engine: StudyDungeonEngine
  /**
   * The real clock. Every write and every settle tick uses it, never the
   * preview time. Defaults to Date.now; tests pass a fixed time.
   */
  clock?: () => number
  /** The settle-tick interval scheduler. Defaults to setInterval. */
  tickScheduler?: Scheduler
  /** Animation frames for the time machine's Play. Defaults to requestAnimationFrame. */
  frameScheduler?: FrameScheduler
  /** Clock for Play's timing. Defaults to performance.now. */
  frameClock?: () => number
  /** Whether the user asked for reduced motion. Defaults to the media query. */
  prefersReducedMotion?: () => boolean
  /** Formats the previewed day. Defaults to "8 Oct 2026" in the viewer's time zone. */
  formatDate?: (ms: number) => string
  /**
   * Where the first-run and tour flags and the sound setting live, and what
   * "Reset all data" clears. Defaults to window.localStorage; tests pass an
   * in-memory fake.
   */
  storage?: FlagStorage
  /** Reloads the page after a reset. Defaults to window.location.reload. */
  reload?: () => void
  /** Time zone for the streak's days and the autopsy's dates. Defaults to the viewer's. */
  timeZone?: string
  /**
   * Makes the Web Audio context for sound effects, on the first sound played.
   * Defaults to the browser's AudioContext; tests pass a fake that records tones.
   */
  createAudioContext?: () => AudioContextLike | null
}

/** The one dialog open at a time, if any. */
type OpenDialog =
  | { kind: "add" }
  | { kind: "edit"; fact: Fact }
  | { kind: "fight"; fact: Fact }
  | { kind: "challenge"; fact: Fact }
  | { kind: "autopsy"; factId: string }

/** A fact queued by "Start the session", with its question for the completion message. */
type SessionEntry = { id: string; question: string }

/** A queued fact that could not be fought when its turn came. */
type Skipped = { question: string; reason: "died" | "removed" }

/** The fight queue: the picks in triage order, and which one is being fought. */
type Session = { entries: SessionEntry[]; position: number; skipped: Skipped[] }

/** What the live region says. `id` changes every time, so the same words are read again. */
type Announcement = { id: number; text: string; problem: boolean }

const defaultFormatDate = (ms: number) => formatPreviewDate(ms)
const browserReload = () => window.location.reload()

export function App({
  engine,
  clock = Date.now,
  tickScheduler,
  frameScheduler,
  frameClock,
  prefersReducedMotion,
  formatDate = defaultFormatDate,
  storage = window.localStorage,
  reload = browserReload,
  timeZone,
  createAudioContext,
}: AppProps) {
  // Every write uses the real time (design.md, Normal Mode). The app may read
  // the clock; the engine never does.
  const writeNow = clock

  // The clock, refreshed by every settle tick below.
  const [realNow, setRealNow] = useState(() => clock())

  // Set by the time machine. 0 means today; above 0 is a future preview, and
  // every write is blocked. Never compare now with the clock to decide this.
  const [previewOffsetMs, setPreviewOffsetMs] = useState(0)
  const previewing = previewOffsetMs > 0
  const now = realNow + previewOffsetMs

  // Bumped after every write, so the lists and triage read the engine again.
  const [version, setVersion] = useState(0)
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), [])

  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const closeDialog = useCallback(() => setDialog(null), [])

  const [session, setSession] = useState<Session | null>(null)
  // What the last finished session skipped; null when no message is shown.
  const [sessionDone, setSessionDone] = useState<Skipped[] | null>(null)

  // The polite live region (task 16.4): state changes and storage problems.
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const announce = useCallback(
    (text: string, problem = false) => setAnnouncement((a) => ({ id: (a?.id ?? 0) + 1, text, problem })),
    []
  )

  // Focused after the tour, which has no opener to go back to.
  const mainRef = useRef<HTMLElement>(null)

  // Sound effects (task 20): off by default, saved in storage. One player
  // for the whole app; it reads the setting on every play.
  const [soundOn, setSoundOn] = useState(() => loadSoundEnabled(storage))
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn
  const [sound] = useState(() =>
    createSoundPlayer({
      isEnabled: () => soundOnRef.current,
      ...(createAudioContext === undefined ? {} : { createContext: createAudioContext }),
    })
  )
  const changeSound = useCallback(
    (enabled: boolean) => {
      soundOnRef.current = enabled
      setSoundOn(enabled)
      saveSoundEnabled(storage, enabled)
    },
    [storage]
  )

  /**
   * Every write's errors end up here (task 18.3, write-guard.ts). A storage
   * problem (quota full, storage unavailable) is shown in the live region,
   * and the open dialog and any Triage session are closed: the engine saved
   * nothing and changed nothing, so the app keeps working. Any other error
   * is rethrown by the caller.
   */
  const showWriteProblem = useCallback(
    (problem: WriteProblem) => {
      setSession(null)
      setDialog(null)
      announce(storageProblemText[problem], true)
    },
    [announce]
  )

  /** Given to the dialogs: true when the error was a storage problem and has been shown. */
  const handleWriteError = useCallback(
    (error: unknown): boolean => reportWriteError(error, showWriteProblem),
    [showWriteProblem]
  )

  /** Runs one of the App's own writes; storage problems are shown, anything else is rethrown. */
  const guardWrite = useCallback((write: () => void): boolean => runWrite(write, showWriteProblem), [showWriteProblem])

  /** The name of the list a fact is in now, at the real time; undefined if it is gone. */
  const listOf = useCallback(
    (id: string) => {
      const fact = engine.view(writeNow()).find((f) => f.id === id)
      return fact === undefined ? undefined : studyDungeonWording.lists[fact.state]
    },
    [engine, writeNow]
  )

  // Ticks on mount and every minute while not previewing; each tick's time
  // becomes the new realNow, so reads and saved settling use the same moment.
  // "Back to today" turns previewing off, which ticks again straight away.
  // A tick saves deaths and weak crossings, so it can hit a full storage too
  // (task 18.3). Say so once, not every minute; say it again only after a
  // tick has saved successfully in between. Other errors are bugs: rethrown.
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
  const handleTick = useCallback((now: number) => {
    if (!tickFailed.current) tickProblemShown.current = false
    tickFailed.current = false
    setRealNow(now)
  }, [])
  useSettleTicks(engine, previewing, handleTick, {
    getNow: clock,
    scheduler: tickScheduler,
    onError: handleTickError,
  })

  // First run (task 11.3): only when the started flag is missing and there
  // are no facts. Decided once, at mount.
  const [firstRun, setFirstRun] = useState(() => needsFirstRun(storage, engine.view(realNow).length))

  // The tour (task 11.5): offered right after first run, once.
  const [touring, setTouring] = useState(false)

  // Facts from before the flag existed: set the flag and skip first run.
  useEffect(() => {
    if (!firstRun && !hasStarted(storage)) markStarted(storage)
  }, [firstRun, storage])

  /** Leaves first run and starts the tour unless it was done before. */
  const finishFirstRun = useCallback(() => {
    setFirstRun(false)
    if (!isTourDone(storage)) setTouring(true)
  }, [storage])

  const loadSample = useCallback(() => {
    const at = writeNow()
    let count = 0
    const ok = guardWrite(() => {
      count = loadSampleData(engine, at).length
      markStarted(storage)
    })
    // Whatever was replayed before a failure is saved; show it.
    setRealNow(at)
    bumpVersion()
    if (!ok) return
    finishFirstRun()
    announce(announceText.sampleLoaded(count))
  }, [engine, writeNow, storage, bumpVersion, guardWrite, finishFirstRun, announce])

  const startEmpty = useCallback(() => {
    if (!guardWrite(() => markStarted(storage))) return
    finishFirstRun()
  }, [storage, guardWrite, finishFirstRun])

  const endTour = useCallback(() => {
    setTouring(false)
    // A preference: if it cannot be saved, the tour may simply show again.
    try {
      markTourDone(storage)
    } catch (error) {
      if (classifyWriteError(error) === null) throw error
    }
    mainRef.current?.focus()
  }, [storage])

  // Reset (task 11.4): blocked while previewing, like every write.
  const reset = useCallback(() => {
    if (previewing) return
    resetAllData(storage, reload)
  }, [previewing, storage, reload])

  const openAutopsy = useCallback((fact: Fact) => setDialog({ kind: "autopsy", factId: fact.id }), [])

  // Challenge from inside the autopsy: closes it and opens the challenge.
  const challengeFromAutopsy = useCallback(
    (fact: Fact) => {
      if (previewing) return
      setDialog({ kind: "challenge", fact })
    },
    [previewing]
  )

  const fightWeakest = useCallback(
    (fact: Fact) => {
      if (previewing) return
      setDialog({ kind: "fight", fact })
    },
    [previewing]
  )

  const handleRemove = useCallback(
    (id: string) => {
      if (previewing) return
      if (!guardWrite(() => engine.remove(id))) return
      bumpVersion()
      announce(announceText.removed)
    },
    [engine, previewing, bumpVersion, guardWrite, announce]
  )

  const handleAction = useCallback(
    (fact: Fact, action: FactAction) => {
      if (previewing) return
      setDialog(action === "tend" ? { kind: "fight", fact } : { kind: "challenge", fact })
    },
    [previewing]
  )

  const handleEdit = useCallback(
    (fact: Fact) => {
      if (previewing) return
      setDialog({ kind: "edit", fact })
    },
    [previewing]
  )

  const announceAdded = useCallback(
    (id: string) => {
      const list = listOf(id)
      if (list !== undefined) announce(announceText.added(list))
    },
    [listOf, announce]
  )

  const announceFight = useCallback(
    (id: string, result: FightResult) => {
      const list = listOf(id)
      if (list === undefined) return
      announce(
        result === "correct"
          ? announceText.fightRight(list)
          : result === "incorrect"
            ? announceText.fightWrong(list)
            : announceText.diedFirst(list)
      )
    },
    [listOf, announce]
  )

  const announceChallenge = useCallback(
    (id: string, result: ChallengeResult) => {
      const list = listOf(id)
      if (list === undefined) return
      announce(result.ok ? announceText.resurrected(list) : announceText.staysDead(list))
    },
    [listOf, announce]
  )

  // Triage is a read, so it runs at `now`, preview included. version is a
  // dependency on purpose: a write changes the result without changing now.
  const runTriage = useCallback((budgetMinutes: number) => engine.triage(budgetMinutes, now), [engine, now, version])

  /**
   * Opens the fight for the first entry from `start` on that can still be
   * fought. Each fact is looked up fresh at the real time when its turn
   * comes; one that died or was removed since triage is skipped and noted.
   * With nothing left, the session ends with the completion message.
   */
  const openSessionFight = useCallback(
    (entries: SessionEntry[], start: number, skippedSoFar: Skipped[]) => {
      const facts = engine.view(writeNow())
      const skipped = [...skippedSoFar]
      for (let position = start; position < entries.length; position++) {
        const entry = entries[position]!
        const fact = facts.find((f) => f.id === entry.id)
        if (fact === undefined) {
          skipped.push({ question: entry.question, reason: "removed" })
          continue
        }
        if (fact.state === "dead") {
          skipped.push({ question: fact.payload.question, reason: "died" })
          continue
        }
        setSession({ entries, position, skipped })
        setDialog({ kind: "fight", fact })
        return
      }
      setSession(null)
      setDialog(null)
      setSessionDone(skipped)
    },
    [engine, writeNow]
  )

  const startSession = useCallback(
    (picks: TriageCandidate<FactPayload, FactPolicyData>[]) => {
      if (previewing) return
      setSessionDone(null)
      const entries = picks.map((pick) => ({ id: pick.item.id, question: pick.item.payload.question }))
      openSessionFight(entries, 0, [])
    },
    [previewing, openSessionFight]
  )

  const stopSession = useCallback(() => {
    setSession(null)
    setDialog(null)
  }, [])

  // Closing a fight (Walk away, Close or Escape) moves a session on to the next pick.
  const closeFight = useCallback(() => {
    if (session === null) {
      setDialog(null)
      return
    }
    openSessionFight(session.entries, session.position + 1, session.skipped)
  }, [session, openSessionFight])

  // 0 today, 1 at +60 days: ages the room (torches dim, fog and cobwebs).
  const age = Math.min(1, previewOffsetMs / TIME_MACHINE_MAX_OFFSET_MS)
  const worldStyle = { "--age": age.toFixed(3) } as CSSProperties

  return (
    <div className="sd-world" style={worldStyle} data-previewing={previewing ? "" : undefined}>
      <Atmosphere />
      {previewing && (
        <PreviewBanner
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          onBackToToday={() => setPreviewOffsetMs(0)}
        />
      )}
      <header className="sd-header">
        <Torch className="sd-header-torch" />
        <div className="sd-title">
          <h1>{headerText.title}</h1>
          <p className="sd-tagline">{headerText.tagline}</p>
        </div>
        <Torch className="sd-header-torch" />
        <Bats />
      </header>
      <main ref={mainRef} className="sd-app" tabIndex={-1}>
        {/* Always on the page, so screen readers hear every change. */}
        <div
          id={ANNOUNCER_ID}
          className="sd-announcer"
          aria-live="polite"
          aria-atomic="true"
          data-problem={announcement?.problem === true ? "" : undefined}
        >
          {announcement !== null && <p key={announcement.id}>{announcement.text}</p>}
        </div>

        {firstRun ? (
          <FirstRun onLoadSample={loadSample} onStartEmpty={startEmpty} />
        ) : (
          <>
            <HeroSection
              engine={engine}
              now={now}
              realNow={realNow}
              version={version}
              timeZone={timeZone}
              onFight={fightWeakest}
              fightDisabledReason={previewing ? previewBlockedText : undefined}
              previewDate={previewing ? formatDate(now) : undefined}
            />

            <div className="sd-layout">
              <div className="sd-layout-main">
                <div className="sd-toolbar">
                  <button
                    type="button"
                    className="sd-button sd-button-add"
                    aria-disabled={previewing ? true : undefined}
                    title={previewing ? previewBlockedText : undefined}
                    onClick={() => {
                      if (previewing) return
                      setDialog({ kind: "add" })
                    }}
                  >
                    {factFormText.addEntry}
                  </button>
                </div>

                {sessionDone !== null && (
                  <section className="sd-session-done" aria-label={sessionText.done}>
                    <div role="status">
                      <p className="sd-session-done-title">{sessionText.done}</p>
                      {sessionDone.map((skip, index) => (
                        <p key={index} className="sd-session-skipped">
                          {skip.reason === "died"
                            ? sessionText.skippedDied(skip.question)
                            : sessionText.skippedRemoved(skip.question)}
                        </p>
                      ))}
                    </div>
                    <button type="button" className="sd-button sd-button-quiet" onClick={() => setSessionDone(null)}>
                      {sessionText.dismiss}
                    </button>
                  </section>
                )}

                <ThreeLists
                  engine={engine}
                  now={now}
                  realNow={realNow}
                  version={version}
                  onAction={handleAction}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                  onAutopsy={openAutopsy}
                  writesDisabledReason={previewing ? previewBlockedText : undefined}
                />
              </div>

              <div className="sd-layout-side" role="group" aria-label={landmarkText.tools}>
                <TriagePanel<FactPayload, FactPolicyData>
                  theme={studyDungeonShellTheme}
                  wording={studyDungeonWording}
                  triage={runTriage}
                  now={now}
                  maxBudgetMinutes={TRIAGE_MAX_BUDGET_MINUTES}
                  renderText={(item) => {
                    const creature = creatureOf(item.id)
                    return (
                      <>
                        <Creature kind={creature.kind} mood={moodOf(item.state, item.health)} className="sd-art-xs" />
                        {item.payload.question}
                      </>
                    )
                  }}
                  onStartSession={startSession}
                  startDisabled={previewing}
                  startDisabledReason={previewing ? previewBlockedText : undefined}
                />
              </div>
            </div>

            <ResetData onConfirm={reset} disabledReason={previewing ? previewBlockedText : undefined}>
              <SoundToggle enabled={soundOn} onChange={changeSound} />
            </ResetData>
          </>
        )}

        {touring && !firstRun && <Tour onDone={endTour} />}

        {dialog?.kind === "add" && (
          <AddEditFactDialog
            engine={engine}
            now={writeNow}
            onSaved={(id) => {
              bumpVersion()
              announceAdded(id)
            }}
            onClose={closeDialog}
            onWriteError={handleWriteError}
          />
        )}
        {dialog?.kind === "edit" && (
          <AddEditFactDialog
            key={dialog.fact.id}
            engine={engine}
            now={writeNow}
            fact={dialog.fact}
            onSaved={() => {
              bumpVersion()
              announce(announceText.saved)
            }}
            onClose={closeDialog}
            onWriteError={handleWriteError}
          />
        )}
        {dialog?.kind === "fight" && (
          <FightDialog
            key={`${dialog.fact.id}-${session?.position ?? "single"}`}
            engine={engine}
            now={writeNow}
            fact={dialog.fact}
            onWrite={bumpVersion}
            onClose={closeFight}
            session={
              session === null
                ? undefined
                : { position: session.position + 1, total: session.entries.length, onStop: stopSession }
            }
            sound={sound}
            onResult={(result) => announceFight(dialog.fact.id, result)}
            onWriteError={handleWriteError}
          />
        )}
        {dialog?.kind === "autopsy" && (
          <FactAutopsy
            key={dialog.factId}
            engine={engine}
            factId={dialog.factId}
            now={now}
            formatDate={formatDate}
            timeZone={timeZone}
            onClose={closeDialog}
            onChallenge={challengeFromAutopsy}
            challengeDisabledReason={previewing ? previewBlockedText : undefined}
          />
        )}
        {dialog?.kind === "challenge" && (
          <ChallengeDialog
            key={dialog.fact.id}
            engine={engine}
            now={writeNow}
            fact={dialog.fact}
            onWrite={bumpVersion}
            onClose={closeDialog}
            sound={sound}
            onResult={(result) => announceChallenge(dialog.fact.id, result)}
            onWriteError={handleWriteError}
          />
        )}
      </main>

      {!firstRun && (
        <TimeDock
          engine={engine}
          realNow={realNow}
          offsetMs={previewOffsetMs}
          onChange={setPreviewOffsetMs}
          formatDate={formatDate}
          version={version}
          frames={frameScheduler}
          clock={frameClock}
          prefersReducedMotion={prefersReducedMotion}
        />
      )}
    </div>
  )
}
