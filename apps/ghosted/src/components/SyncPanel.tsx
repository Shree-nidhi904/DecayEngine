// "Sync across devices (optional)": sign in by email, sync, settle conflicts, an
// optional passphrase that encrypts the cloud copy, and deleting the cloud copy.
// It renders nothing unless the build has a sync server configured, and loads
// the sync code only when opened (or when an earlier visit left a sign-in).
// See cloud-link.ts and @decay-engine/cloud.
//

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { SyncController, Viewable } from "@decay-engine/cloud"
import { cloudConfigured, hasStoredSession, returnedFromSignInLink, startCloud, type CloudHandle } from "../cloud-link"
import type { FlagStorage } from "../first-run"
import "../styles/sync.css"

/**
 * A device clock this far from the server's (ms) is worth a warning. The same number as
 * CLOCK_SKEW_WARNING_MS in @decay-engine/cloud, which is not imported here so the main
 * bundle stays free of the sync code.
 */
export const CLOCK_WARNING_MS = 2 * 60 * 1000

export const syncText = {
  summary: "Sync across devices (optional)",
  intro: "Ghosted keeps everything in this browser. Sign in with your email to keep a copy in the cloud and use it on other devices. Nothing is sent until you do.",
  loading: "Loading…",
  failed: "Sync could not be loaded. Try again later.",
  emailLabel: "Email address",
  sendLink: "Send sign-in link",
  signedInAs: (email: string) => `Signed in as ${email}.`,
  lastSynced: (time: string) => `Last synced ${time}.`,
  syncNow: "Sync now",
  signOut: "Sign out",
  conflictTitle: "Both copies changed. Which one do you keep?",
  keepDevice: "Keep this device",
  keepCloud: "Keep the cloud copy",
  merge: "Merge both",
  mergeNote: "Merge keeps everything from both. Anything you removed on one side comes back.",
  passphraseLabel: "Passphrase (optional)",
  usePassphrase: "Use passphrase",
  passphraseNote: "With a passphrase, the cloud holds only scrambled text that nobody else can read. If you forget it, the cloud copy cannot be opened; this device keeps its data.",
  encrypting: "The cloud copy is encrypted with your passphrase.",
  deleteCloud: "Delete my cloud data and account",
  deleteSure: "Delete everything in the cloud and your account? This device keeps its data.",
  deleteConfirm: "Yes, delete",
  clockOff: (minutes: number, direction: "ahead" | "behind") =>
    `Your device's clock is about ${minutes} minute${minutes === 1 ? "" : "s"} ${direction} of the server's. Decay is counted from your device's clock, so things may fade early or late until it is corrected.`,
  pushTitle: "Notify me even when this tab is closed",
  pushOn: "Turn off",
  pushOff: "Turn on",
  pushNext: (when: string) => `Next notification, if nothing changes before then: ${when}.`,
  pushNone: "Nothing is about to change in the next 30 days, so no notification is scheduled.",
  pushNote: "The cloud only learns when to nudge you, never who or what it is about. You get at most one a day, and never between 22:00 and 08:00.",
  pushBlocked: "Your browser blocks notifications for this page. Allow them in the site settings next to the address bar to use this.",
  pushUnsupported: "Notifications while closed need the installed app from the live site, and a browser that supports them.",
  cancel: "Cancel",
} as const

export interface SyncPanelProps {
  storage: FlagStorage
  reload: () => void
  /** The app's engine, so the next notification can be worked out on this device. */
  engine?: Viewable
  /** The build's env. Defaults to import.meta.env. */
  env?: Record<string, unknown>
  /** Loads the sync code. Tests pass a fake. */
  start?: typeof startCloud
  /** Whether an earlier visit left a sign-in. Tests pass a fake. */
  signedInBefore?: () => boolean
  /** Whether this load is the return from a sign-in link. Tests pass a fake. */
  returnedFromLink?: () => boolean
  /**
   * Inside the Profile sheet (feedback list, points 7, 17 and 21): no fold, the
   * body is always shown, and the sync code loads when `active` first turns
   * true (or at startup after an earlier sign-in, as before).
   */
  bare?: boolean
  /** Whether the Profile sheet is open. Only read when `bare`. */
  active?: boolean
  /** Told who is signed in (null when nobody is), so the top-right button can read "Profile". */
  onAccount?: (email: string | null) => void
  /** Called once at startup when this load is the return from a sign-in link, so the Profile can open. */
  onReturnedFromLink?: () => void
  /** Shown instead of nothing when the build has no sync server (bare only). */
  notConfigured?: string
}

export function SyncPanel({
  storage,
  reload,
  engine,
  env = import.meta.env,
  start = startCloud,
  signedInBefore = () => hasStoredSession(window.localStorage),
  returnedFromLink = () => returnedFromSignInLink(window.location),
  bare = false,
  active = false,
  onAccount,
  onReturnedFromLink,
  notConfigured,
}: SyncPanelProps) {
  const configured = cloudConfigured(env)
  const [handle, setHandle] = useState<CloudHandle | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle")
  const started = useRef(false)
  // Read once, at the start: the sign-in code is removed from the address soon after.
  const [fromLink] = useState(() => returnedFromLink())
  // Open on the return from a sign-in link, so the result is visible without another click.
  const [open, setOpen] = useState(fromLink)

  const load = () => {
    if (started.current) return
    started.current = true
    setState("loading")
    start(storage, reload, env, engine).then(
      (h) => {
        setHandle(h)
        setState(h === null ? "failed" : "idle")
      },
      () => setState("failed")
    )
  }

  useEffect(() => {
    if (configured && (fromLink || signedInBefore())) load()
    if (configured && fromLink) onReturnedFromLink?.()
    return () => handle?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // In the sheet: load when it is first opened.
  useEffect(() => {
    if (bare && active && configured) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bare, active, configured])

  if (!configured) return bare && notConfigured !== undefined ? <p className="gh-sheet-note">{notConfigured}</p> : null
  if (bare) {
    return (
      <div className="gh-sync gh-sync-bare">
        {state === "loading" && <p>{syncText.loading}</p>}
        {state === "failed" && <p role="alert">{syncText.failed}</p>}
        {handle !== null && <SyncBody controller={handle.controller} onAccount={onAccount} />}
      </div>
    )
  }
  return (
    <details className="gh-sync" open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        if (event.currentTarget.open) load()
      }}
    >
      <summary>{syncText.summary}</summary>
      {state === "loading" && <p>{syncText.loading}</p>}
      {state === "failed" && <p role="alert">{syncText.failed}</p>}
      {handle !== null && <SyncBody controller={handle.controller} onAccount={onAccount} />}
    </details>
  )
}

function SyncBody({ controller, onAccount }: { controller: SyncController; onAccount?: (email: string | null) => void }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState)
  const signedInEmail = s.phase === "signed-out" ? null : (s.email ?? "")
  useEffect(() => {
    onAccount?.(signedInEmail)
  }, [onAccount, signedInEmail])
  const [email, setEmail] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="gh-sync-body">
      {s.notice !== null && (
        <p role={s.notice.kind === "problem" ? "alert" : "status"} className="gh-sync-notice">
          {s.notice.text}
        </p>
      )}

      {s.phase === "signed-out" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void controller.signIn(email)
          }}
        >
          <p>{syncText.intro}</p>
          <label>
            {syncText.emailLabel}
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <button type="submit" disabled={s.busy}>
            {syncText.sendLink}
          </button>
        </form>
      ) : (
        <>
          <p>{syncText.signedInAs(s.email ?? "")}</p>
          {s.lastSyncedAt !== null && <p>{syncText.lastSynced(new Date(s.lastSyncedAt).toLocaleString())}</p>}
          {s.clockSkewMs !== null && Math.abs(s.clockSkewMs) > CLOCK_WARNING_MS && (
            <p role="status" className="gh-sync-notice">
              {syncText.clockOff(Math.round(Math.abs(s.clockSkewMs) / 60000), s.clockSkewMs > 0 ? "ahead" : "behind")}
            </p>
          )}
          <div className="gh-sync-row">
            <button type="button" disabled={s.busy} onClick={() => void controller.syncNow()}>
              {syncText.syncNow}
            </button>
            <button type="button" onClick={() => void controller.signOut()}>
              {syncText.signOut}
            </button>
          </div>

          {s.conflict && (
            <div role="group" aria-label={syncText.conflictTitle}>
              <p>{syncText.conflictTitle}</p>
              <div className="gh-sync-row">
                <button type="button" onClick={() => void controller.resolve("local")}>
                  {syncText.keepDevice}
                </button>
                <button type="button" onClick={() => void controller.resolve("cloud")}>
                  {syncText.keepCloud}
                </button>
                <button type="button" onClick={() => void controller.resolve("merge")}>
                  {syncText.merge}
                </button>
              </div>
              <p className="gh-sync-small">{syncText.mergeNote}</p>
            </div>
          )}

          <div role="group" aria-label={syncText.pushTitle}>
            <p>{syncText.pushTitle}</p>
            {s.push === "on" && (
              <button type="button" disabled={s.busy} onClick={() => void controller.disablePush()}>
                {syncText.pushOn}
              </button>
            )}
            {s.push === "on" && s.pushNextAt !== "unknown" && (
              <p className="gh-sync-small" role="status">
                {s.pushNextAt === null ? syncText.pushNone : syncText.pushNext(new Date(s.pushNextAt).toLocaleString())}
              </p>
            )}
            {s.push === "off" && (
              <button type="button" disabled={s.busy} onClick={() => void controller.enablePush()}>
                {syncText.pushOff}
              </button>
            )}
            {s.push === "denied" && <p className="gh-sync-small">{syncText.pushBlocked}</p>}
            {s.push === "unsupported" && <p className="gh-sync-small">{syncText.pushUnsupported}</p>}
            <p className="gh-sync-small">{syncText.pushNote}</p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void controller.setPassphrase(passphrase)
              setPassphrase("")
            }}
          >
            <label>
              {syncText.passphraseLabel}
              <input type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />
            </label>
            <button type="submit" disabled={s.busy || passphrase === ""}>
              {syncText.usePassphrase}
            </button>
            <p className="gh-sync-small">{s.encrypting ? syncText.encrypting : syncText.passphraseNote}</p>
          </form>

          {confirmingDelete ? (
            <div role="group" aria-label={syncText.deleteSure}>
              <p>{syncText.deleteSure}</p>
              <div className="gh-sync-row">
                <button type="button" onClick={() => setConfirmingDelete(false)}>
                  {syncText.cancel}
                </button>
                <button type="button" onClick={() => void controller.deleteCloud()}>
                  {syncText.deleteConfirm}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)}>
              {syncText.deleteCloud}
            </button>
          )}
        </>
      )}
    </div>
  )
}
