// The shapes the sync code works with. The network lives behind CloudClient,
// so everything else is plain logic that tests run against a fake.

/** What the server keeps per user and app. `body` is a backup file's text, or an encrypted envelope of it. */
export interface RemoteSnapshot {
  /** Counts pushes; the server adds one on each. */
  revision: number
  /** The server's time of the last push, ISO text. */
  updatedAt: string
  deviceId: string
  /** Whether `body` is an encrypted envelope (see crypto.ts) rather than plain backup text. */
  encrypted: boolean
  body: string
}

export interface CloudUser {
  id: string
  email: string
}

export type PushResult =
  | { ok: true; revision: number; serverTime: string }
  /** The server holds a newer revision than `expectedRevision`; nothing was written. */
  | { ok: false; reason: "conflict"; current: RemoteSnapshot | null }

export interface CloudClient {
  getUser(): Promise<CloudUser | null>
  /** Calls `listener` on sign-in and sign-out. Returns a stop function. */
  onAuthChange(listener: (user: CloudUser | null) => void): () => void
  /** Sends a sign-in link to `email`. */
  signInWithEmail(email: string, redirectTo: string): Promise<void>
  signOut(): Promise<void>
  getSnapshot(app: string): Promise<RemoteSnapshot | null>
  /** Writes only if the server's revision is still `expectedRevision` (0 when there is no row). */
  pushSnapshot(args: {
    app: string
    expectedRevision: number
    deviceId: string
    encrypted: boolean
    body: string
  }): Promise<PushResult>
  /** The server's clock, epoch ms. */
  serverTime(): Promise<number>
  /** Deletes every row of the user's, and the account. */
  deleteAccount(): Promise<void>
  /** Remembers this browser's push subscription for the user. */
  registerPush(args: { app: string; endpoint: string; p256dh: string; auth: string }): Promise<void>
  unregisterPush(endpoint: string): Promise<void>
  /**
   * Sets when the next push is due (epoch ms) and its generic text. The server may move it
   * later (24 hour limit); the time it actually holds comes back, or null when it holds none.
   */
  setPushSchedule(args: { app: string; notifyAt: number; title: string; body: string }): Promise<number | null>
  clearPushSchedule(app: string): Promise<void>
}

/** The device's side, supplied by each app from its backup.ts and storage. */
export interface LocalSide {
  /** The data as backup-file text, plus the local revision (@decay-engine/persist meta). Null text when nothing is saved. */
  read(): { text: string | null; revision: number; hasData: boolean }
  /** True when the text is a backup this app can restore (the app builds a throwaway engine from it). */
  validate(text: string): boolean
  /** Replaces the local data with the text, and returns the local revision afterwards. The app reloads after. */
  apply(text: string): { revision: number }
}

/** What the last successful sync left behind, per device. */
export interface SyncState {
  remoteRevision: number
  localRevision: number
}

export interface SyncStateStore {
  get(): SyncState | null
  set(state: SyncState | null): void
}

export class CloudError extends Error {
  readonly code: "WRONG_PASSPHRASE" | "BAD_ENVELOPE" | "NETWORK" | "NOT_CONFIGURED" | "PUSH"
  constructor(code: CloudError["code"], message: string) {
    super(message)
    this.name = "CloudError"
    this.code = code
  }
}
