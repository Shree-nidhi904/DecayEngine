// The state behind the Sync panel: who is signed in, whether a sync is running,
// whether a conflict or a locked (encrypted) copy waits for the user. The app's
// panel only renders this and calls its methods.
//
// The passphrase lives in memory for the page's life and is never written to
// storage; after a reload the user types it again if the cloud copy is encrypted.

import type { Resolution, SyncOutcome, SyncService } from "./sync-service"
import type { PushService, PushState } from "./push-service"
import type { CloudClient, CloudUser } from "./types"

export interface SyncViewState {
  phase: "signed-out" | "signed-in"
  email: string | null
  /** A sign-in link was sent and has not been used yet. */
  linkSent: boolean
  busy: boolean
  /** The last thing worth telling the user, or null. */
  notice: { kind: "info" | "problem"; text: string } | null
  conflict: boolean
  /** The cloud copy is encrypted and needs the passphrase. */
  locked: boolean
  /** Whether a passphrase is set in this session (the next push is encrypted). */
  encrypting: boolean
  /** Epoch ms of the last sync that finished without a problem. */
  lastSyncedAt: number | null
  /** Whether notifications while the app is closed are possible and on. "unknown" until checked. */
  push: PushState | "unknown"
  /** When the next notification is due (epoch ms), null when none is scheduled, "unknown" before it is known. */
  pushNextAt: number | null | "unknown"
  /**
   * How far this device's clock is from the server's, in ms (positive: the device is ahead),
   * or null before it is measured. Informational: decay still uses the device clock.
   */
  clockSkewMs: number | null
}

export const syncNotices = {
  signInSent: "Check your email for a sign-in link. Open it in this browser.",
  synced: "Synced.",
  upToDate: "Everything is up to date.",
  conflict: "This device and the cloud both changed. Choose which to keep.",
  locked: "The cloud copy is encrypted. Enter your passphrase to sync.",
  wrongPassphrase: "That passphrase did not open the cloud copy.",
  pulled: "Loaded the cloud copy. Reloading.",
  merged: "Merged both copies. Reloading.",
  pushOn: "Notifications are on. You may get one when something starts to change, at most once a day, never between 22:00 and 08:00.",
  pushOff: "Notifications are off.",
  pushDenied: "Your browser blocks notifications for this page. Allow them in the site settings next to the address bar, then try again.",
  deleted: "Your cloud data and account are deleted. This device keeps its data.",
} as const

/** A device clock this far from the server's (ms) is worth telling the user about. */
export const CLOCK_SKEW_WARNING_MS = 2 * 60 * 1000

export interface SyncController {
  getState(): SyncViewState
  subscribe(listener: () => void): () => void
  /** Reads the current user and syncs once if signed in. Call once at startup. */
  start(): Promise<void>
  signIn(email: string): Promise<void>
  signOut(): Promise<void>
  syncNow(): Promise<void>
  resolve(choice: Resolution): Promise<void>
  /** Sets (or with null clears) the passphrase for this session, then syncs. */
  setPassphrase(passphrase: string | null): Promise<void>
  deleteCloud(): Promise<void>
  /** Turns notifications while closed on (from a click: the browser asks permission) or off. */
  enablePush(): Promise<void>
  disablePush(): Promise<void>
  /** Stops listening for sign-in changes. */
  dispose(): void
}

export interface ControllerDeps {
  client: CloudClient
  /** Built by the app once it knows the user; see main wiring. Receives the passphrase getter. */
  service: (getPassphrase: () => string | null) => SyncService
  /** Where a sign-in link brings the user back to. */
  redirectTo: string
  reload: () => void
  now?: () => number
  /** Web Push on this device. Omitted when the build or the browser has none. */
  push?: PushService
}

export function createSyncController(deps: ControllerDeps): SyncController {
  let passphrase: string | null = null
  const service = deps.service(() => passphrase)
  const now = deps.now ?? Date.now
  const listeners = new Set<() => void>()
  let state: SyncViewState = {
    phase: "signed-out",
    email: null,
    linkSent: false,
    busy: false,
    notice: null,
    conflict: false,
    locked: false,
    encrypting: false,
    lastSyncedAt: null,
    push: "unknown",
    pushNextAt: "unknown",
    clockSkewMs: null,
  }
  const set = (patch: Partial<SyncViewState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }
  const setUser = (user: CloudUser | null) =>
    set(user === null ? { phase: "signed-out", email: null } : { phase: "signed-in", email: user.email, linkSent: false })

  function show(outcome: SyncOutcome, quiet = false) {
    switch (outcome.kind) {
      case "signed-out":
        set({ phase: "signed-out", email: null, busy: false })
        return
      case "noop":
        set({ busy: false, conflict: false, locked: false, lastSyncedAt: now(), notice: quiet ? state.notice : { kind: "info", text: syncNotices.upToDate } })
        return
      case "pushed":
        set({ busy: false, conflict: false, locked: false, lastSyncedAt: now(), notice: { kind: "info", text: syncNotices.synced } })
        return
      case "pulled":
        set({ busy: false, notice: { kind: "info", text: syncNotices.pulled } })
        deps.reload()
        return
      case "merged":
        set({ busy: false, notice: { kind: "info", text: syncNotices.merged } })
        deps.reload()
        return
      case "conflict":
        set({ busy: false, conflict: true, notice: { kind: "info", text: syncNotices.conflict } })
        return
      case "locked":
        set({
          busy: false,
          locked: true,
          notice: { kind: outcome.wrongPassphrase ? "problem" : "info", text: outcome.wrongPassphrase ? syncNotices.wrongPassphrase : syncNotices.locked },
        })
        return
      case "error":
        set({ busy: false, notice: { kind: "problem", text: outcome.message } })
    }
  }

  /** Keeps the server's "next push is due" current. A failure here must never disturb a sync. */
  async function refreshPush() {
    if (deps.push === undefined) return
    try {
      set({ push: await deps.push.state() })
      await deps.push.refresh()
      set({ pushNextAt: deps.push.scheduled() ?? "unknown" })
    } catch {
      // The next sync tries again.
    }
  }

  /** Measures the device clock against the server's, using the midpoint of the round trip. */
  async function measureClock() {
    try {
      const before = now()
      const server = await deps.client.serverTime()
      const after = now()
      set({ clockSkewMs: Math.round((before + after) / 2 - server) })
    } catch {
      // Not every project has the server_time function; the warning simply stays off.
    }
  }

  async function run(work: () => Promise<SyncOutcome>, quiet = false) {
    if (state.busy) return
    set({ busy: true })
    const outcome = await work()
    show(outcome, quiet)
    if (outcome.kind !== "signed-out" && outcome.kind !== "error") await measureClock()
    if (outcome.kind === "noop" || outcome.kind === "pushed") await refreshPush()
  }

  const stopAuth = deps.client.onAuthChange(setUser)

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    async start() {
      try {
        setUser(await deps.client.getUser())
      } catch {
        return
      }
      if (state.phase === "signed-in") await run(() => service.sync(), true)
    },
    async signIn(email) {
      set({ busy: true, notice: null })
      try {
        await deps.client.signInWithEmail(email.trim(), deps.redirectTo)
        set({ busy: false, linkSent: true, notice: { kind: "info", text: syncNotices.signInSent } })
      } catch (error) {
        set({ busy: false, notice: { kind: "problem", text: error instanceof Error ? error.message : String(error) } })
      }
    },
    async signOut() {
      // Stop notifications first: after sign-out the server could no longer tell this browser to stop.
      await deps.push?.disable().catch(() => undefined)
      try {
        await deps.client.signOut()
      } catch {
        // Signing out locally is what matters; the listener below clears the state.
      }
      passphrase = null
      set({ phase: "signed-out", email: null, conflict: false, locked: false, encrypting: false, notice: null })
    },
    syncNow: () => run(() => service.sync()),
    resolve: async (choice) => {
      set({ conflict: false })
      await run(() => service.resolve(choice))
    },
    async setPassphrase(value) {
      passphrase = value === null || value === "" ? null : value
      set({ encrypting: passphrase !== null, locked: false })
      await run(() => service.sync())
    },
    async deleteCloud() {
      set({ busy: true })
      await deps.push?.disable().catch(() => undefined)
      const result = await service.deleteCloud()
      passphrase = null
      if (result.ok) {
        set({ busy: false, phase: "signed-out", email: null, conflict: false, locked: false, encrypting: false, notice: { kind: "info", text: syncNotices.deleted } })
      } else {
        set({ busy: false, notice: { kind: "problem", text: result.message } })
      }
    },
    async enablePush() {
      if (deps.push === undefined) return
      set({ busy: true })
      try {
        const result = await deps.push.enable()
        set({
          busy: false,
          push: result,
          pushNextAt: deps.push.scheduled() ?? "unknown",
          notice: { kind: result === "on" ? "info" : "problem", text: result === "on" ? syncNotices.pushOn : result === "denied" ? syncNotices.pushDenied : syncNotices.pushOff },
        })
      } catch (error) {
        set({ busy: false, notice: { kind: "problem", text: error instanceof Error ? error.message : String(error) } })
      }
    },
    async disablePush() {
      if (deps.push === undefined) return
      set({ busy: true })
      try {
        set({ busy: false, push: await deps.push.disable(), pushNextAt: "unknown", notice: { kind: "info", text: syncNotices.pushOff } })
      } catch (error) {
        set({ busy: false, notice: { kind: "problem", text: error instanceof Error ? error.message : String(error) } })
      }
    },
    dispose: stopAuth,
  }
}

/** The pieces of `window` auto sync listens to; tests pass fakes. */
export interface AutoSyncTarget {
  addEventListener(type: "visibilitychange", listener: () => void): void
  removeEventListener(type: "visibilitychange", listener: () => void): void
  isVisible(): boolean
  setInterval(listener: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/**
 * Syncs when the tab comes back into view and every `intervalMs` while open.
 * Skips while signed out, busy, or waiting on the user (a conflict or a locked copy).
 * @returns A function that stops it.
 */
export function startAutoSync(controller: SyncController, target: AutoSyncTarget, intervalMs = 120_000): () => void {
  const tick = () => {
    const s = controller.getState()
    if (s.phase !== "signed-in" || s.busy || s.conflict || s.locked) return
    void controller.syncNow()
  }
  const onVisible = () => target.isVisible() && tick()
  target.addEventListener("visibilitychange", onVisible)
  const handle = target.setInterval(tick, intervalMs)
  return () => {
    target.removeEventListener("visibilitychange", onVisible)
    target.clearInterval(handle)
  }
}

/** Auto sync on the real page: `document` for visibility, `window` for the timer. */
export function browserAutoSync(controller: SyncController, intervalMs?: number): () => void {
  const doc = (globalThis as unknown as { document: Document }).document
  const win = globalThis as unknown as { setInterval(l: () => void, ms: number): number; clearInterval(h: number): void }
  return startAutoSync(
    controller,
    {
      addEventListener: (type, listener) => doc.addEventListener(type, listener),
      removeEventListener: (type, listener) => doc.removeEventListener(type, listener),
      isVisible: () => doc.visibilityState === "visible",
      setInterval: (listener, ms) => win.setInterval(listener, ms),
      clearInterval: (handle) => win.clearInterval(handle as number),
    },
    intervalMs
  )
}
