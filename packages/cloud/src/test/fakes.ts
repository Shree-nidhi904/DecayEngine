import type { CloudClient, CloudUser, LocalSide, PushResult, RemoteSnapshot, SyncState, SyncStateStore } from "../types"

/** An in-memory Supabase: one user, one row per app, compare-and-set pushes. */
export class FakeServer {
  rows = new Map<string, RemoteSnapshot>()
  user: CloudUser | null = { id: "u1", email: "me@example.test" }
  down = false
  deleted = false
  clock = 1_000
  /** What the server's clock reads, in epoch ms; tests set it to simulate a device clock that is off. */
  now = 1_700_000_000_000
  /** Push subscriptions by endpoint, and the schedule per app, as the SQL functions would keep them. */
  subscriptions = new Map<string, { app: string; p256dh: string; auth: string }>()
  schedule = new Map<string, { notifyAt: number | null; title: string; body: string }>()
}

export function fakeClient(server: FakeServer): CloudClient & { listeners: Set<(u: CloudUser | null) => void>; sentLinks: string[] } {
  const listeners = new Set<(u: CloudUser | null) => void>()
  const sentLinks: string[] = []
  const guard = () => {
    if (server.down) throw new Error("network down")
  }
  return {
    listeners,
    sentLinks,
    async getUser() {
      guard()
      return server.user
    },
    onAuthChange(l) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    async signInWithEmail(email, redirectTo) {
      guard()
      sentLinks.push(`${email} -> ${redirectTo}`)
    },
    async signOut() {
      server.user = null
      listeners.forEach((l) => l(null))
    },
    async getSnapshot(app) {
      guard()
      return server.rows.get(app) ?? null
    },
    async pushSnapshot({ app, expectedRevision, deviceId, encrypted, body }): Promise<PushResult> {
      guard()
      const current = server.rows.get(app) ?? null
      if ((current?.revision ?? 0) !== expectedRevision) return { ok: false, reason: "conflict", current }
      const revision = expectedRevision + 1
      server.clock += 1000
      const updatedAt = new Date(server.clock).toISOString()
      server.rows.set(app, { revision, updatedAt, deviceId, encrypted, body })
      return { ok: true, revision, serverTime: updatedAt }
    },
    async serverTime() {
      guard()
      return server.now
    },
    async registerPush({ app, endpoint, p256dh, auth }) {
      guard()
      server.subscriptions.set(endpoint, { app, p256dh, auth })
    },
    async unregisterPush(endpoint) {
      guard()
      server.subscriptions.delete(endpoint)
    },
    async setPushSchedule({ app, notifyAt, title, body }) {
      guard()
      server.schedule.set(app, { notifyAt, title, body })
      return notifyAt
    },
    async clearPushSchedule(app) {
      guard()
      const row = server.schedule.get(app)
      if (row) row.notifyAt = null
    },
    async deleteAccount() {
      guard()
      server.rows.clear()
      server.deleted = true
      server.user = null
    },
  }
}

/** One device: a backup text, a revision that moves on every change, and its sync state. */
export class FakeDevice implements LocalSide, SyncStateStore {
  text: string | null
  revision = 0
  state: SyncState | null = null
  applied: string[] = []
  constructor(text: string | null = null) {
    this.text = text
    if (text !== null) this.revision = 1
  }
  edit(text: string) {
    this.text = text
    this.revision++
  }
  read() {
    return { text: this.text, revision: this.revision, hasData: this.text !== null }
  }
  validate(text: string) {
    try {
      return JSON.parse(text).app === "t"
    } catch {
      return false
    }
  }
  apply(text: string) {
    this.text = text
    this.revision++
    this.applied.push(text)
    return { revision: this.revision }
  }
  get() {
    return this.state
  }
  set(s: SyncState | null) {
    this.state = s
  }
}

export const backup = (items: { id: string; lastEventAt: number; note?: string }[], history: object[] = []) =>
  JSON.stringify({ app: "t", version: 1, exportedAt: "x", snapshot: { schemaVersion: 1, items, history } })
