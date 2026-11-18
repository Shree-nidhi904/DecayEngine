import { useCallback, useState } from "react"
import {
  PreviewBanner,
  TimeMachine,
  TriagePanel,
  type FrameScheduler,
} from "@decay-engine/shell"
import type { TriageCandidate } from "@decay-engine/engine"
import type { StudyDungeonEngine } from "./engine-instance"
import { useSettleTicks, type Scheduler } from "./ticking"
import type { Fact, FactPayload, FactPolicyData } from "./policy"
import { ThreeLists, type FactAction } from "./components/ThreeLists"
import { AddEditFactDialog } from "./components/AddEditFactDialog"
import { FightDialog } from "./components/FightDialog"
import { ChallengeDialog } from "./components/ChallengeDialog"
import { studyDungeonShellTheme } from "./theme"
import {
  factFormText,
  formatPreviewDate,
  previewBlockedText,
  sessionText,
  studyDungeonWording,
} from "./wording"
import "./styles/dialogs.css"
import "./styles/app.css"

/** engine.triage accepts budgets from 1 to 1440 minutes (engine Requirement 17b). */
export const TRIAGE_MAX_BUDGET_MINUTES = 1440

export interface AppProps {
  /** The app's engine. main.tsx passes the localStorage one; tests pass one on InMemoryAdapter. */
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
}

/** The one dialog open at a time, if any. */
type OpenDialog =
  | { kind: "add" }
  | { kind: "edit"; fact: Fact }
  | { kind: "fight"; fact: Fact }
  | { kind: "challenge"; fact: Fact }

/** A fact queued by "Start the session", with its question for the completion message. */
type SessionEntry = { id: string; question: string }

/** A queued fact that could not be fought when its turn came. */
type Skipped = { question: string; reason: "died" | "removed" }

/** The fight queue: the picks in triage order, and which one is being fought. */
type Session = { entries: SessionEntry[]; position: number; skipped: Skipped[] }

const defaultFormatDate = (ms: number) => formatPreviewDate(ms)

export function App({
  engine,
  clock = Date.now,
  tickScheduler,
  frameScheduler,
  frameClock,
  prefersReducedMotion,
  formatDate = defaultFormatDate,
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

  // Ticks on mount and every minute while not previewing; each tick's time
  // becomes the new realNow, so reads and saved settling use the same moment.
  // "Back to today" turns previewing off, which ticks again straight away.
  useSettleTicks(engine, previewing, setRealNow, { getNow: clock, scheduler: tickScheduler })

  const handleRemove = useCallback(
    (id: string) => {
      if (previewing) return
      engine.remove(id)
      bumpVersion()
    },
    [engine, previewing, bumpVersion]
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

  return (
    <>
      {previewing && (
        <PreviewBanner
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          onBackToToday={() => setPreviewOffsetMs(0)}
        />
      )}
      <main className="sd-app">
        <h1>Study Dungeon</h1>
        <p>Facts you are forgetting come back as monsters.</p>

        <TimeMachine
          today={realNow}
          offsetMs={previewOffsetMs}
          onChange={setPreviewOffsetMs}
          formatDate={formatDate}
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          frames={frameScheduler}
          clock={frameClock}
          prefersReducedMotion={prefersReducedMotion}
        />

        <div className="sd-toolbar">
          <button
            type="button"
            className="sd-button sd-button-primary"
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
                  {skip.reason === "died" ? sessionText.skippedDied(skip.question) : sessionText.skippedRemoved(skip.question)}
                </p>
              ))}
            </div>
            <button type="button" className="sd-button sd-button-quiet" onClick={() => setSessionDone(null)}>
              {sessionText.dismiss}
            </button>
          </section>
        )}

        <TriagePanel<FactPayload, FactPolicyData>
          theme={studyDungeonShellTheme}
          wording={studyDungeonWording}
          triage={runTriage}
          now={now}
          maxBudgetMinutes={TRIAGE_MAX_BUDGET_MINUTES}
          renderText={(item) => item.payload.question}
          onStartSession={startSession}
          startDisabled={previewing}
          startDisabledReason={previewing ? previewBlockedText : undefined}
        />

        <ThreeLists
          engine={engine}
          now={now}
          version={version}
          onAction={handleAction}
          onEdit={handleEdit}
          onRemove={handleRemove}
          writesDisabledReason={previewing ? previewBlockedText : undefined}
        />

        {dialog?.kind === "add" && (
          <AddEditFactDialog engine={engine} now={writeNow} onSaved={bumpVersion} onClose={closeDialog} />
        )}
        {dialog?.kind === "edit" && (
          <AddEditFactDialog
            key={dialog.fact.id}
            engine={engine}
            now={writeNow}
            fact={dialog.fact}
            onSaved={bumpVersion}
            onClose={closeDialog}
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
          />
        )}
      </main>
    </>
  )
}
