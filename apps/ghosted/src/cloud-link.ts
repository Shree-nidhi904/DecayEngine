// The device's side of optional cloud sync: how this app's data is read and
// replaced for the sync service, where the sync bookkeeping is kept, and how
// the sync code is loaded.
//
// Sync is OFF unless the build has a Supabase project configured
// (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY), and even then the
// @decay-engine/cloud code is loaded only when the user opens the Sync panel or
// already signed in on an earlier visit. Until then the app makes no network
// request, as before. This file holds no address and makes no request itself.
//

import type { LocalSide, PushDeps, PushManagerLike, SyncController, SyncState, SyncStateStore, Viewable } from "@decay-engine/cloud"
import { readMeta } from "@decay-engine/persist"
import { BACKUP_APP, applyBackup, checkBackup, makeBackup } from "./backup"
import { STORAGE_NAMESPACE } from "./engine-instance"
import { SYNC_STATE_KEY, type FlagStorage } from "./first-run"
import { pushNotification } from "./push-text"

/** A random id for this browser, sent with each push so devices can be told apart. */
export const SYNC_DEVICE_KEY = "ghosted:sync-device"

/** Whether this build has a sync server configured. Reads only the build's env. */
export function cloudConfigured(env: Record<string, unknown>): boolean {
  return typeof env.VITE_SUPABASE_URL === "string" && env.VITE_SUPABASE_URL !== "" &&
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === "string" && env.VITE_SUPABASE_PUBLISHABLE_KEY !== ""
}

/** Whether an earlier visit left a sign-in (supabase-js keeps it under a key like sb-<project>-auth-token). */
export function hasStoredSession(storage: Pick<Storage, "length" | "key">): boolean {
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null && key.startsWith("sb-") && key.endsWith("-auth-token")) return true
    }
  } catch {
    // Blocked storage: no stored sign-in.
  }
  return false
}

/**
 * Whether this page load is the return from an emailed sign-in link: the address
 * carries a one-time code (PKCE) or tokens/an error in the hash. The sync code
 * must be started right away then, or the code is never exchanged for a sign-in.
 */
export function returnedFromSignInLink(location: Pick<Location, "search" | "hash">): boolean {
  return /[?&]code=/.test(location.search) || /(?:^|[#&])(?:access_token|error_description|error_code)=/.test(location.hash)
}

export function makeLocalSide(storage: FlagStorage): LocalSide {
  return {
    read() {
      const text = makeBackup(storage, new Date())
      let hasData = false
      if (text !== null) {
        try {
          hasData = ((JSON.parse(text) as { snapshot?: { items?: unknown[] } }).snapshot?.items?.length ?? 0) > 0
        } catch {
          hasData = false
        }
      }
      return { text, revision: readMeta(storage, STORAGE_NAMESPACE).revision, hasData }
    },
    validate: (text) => checkBackup(text).ok,
    apply(text) {
      const check = checkBackup(text)
      if (!check.ok) throw new Error(check.reason)
      applyBackup(storage, check.snapshot)
      return { revision: readMeta(storage, STORAGE_NAMESPACE).revision }
    },
  }
}

export function makeStateStore(storage: FlagStorage): SyncStateStore {
  return {
    get() {
      try {
        const text = storage.getItem(SYNC_STATE_KEY)
        if (text === null) return null
        const value = JSON.parse(text) as Partial<SyncState>
        return Number.isInteger(value.remoteRevision) && Number.isInteger(value.localRevision) ? (value as SyncState) : null
      } catch {
        return null
      }
    },
    set(state) {
      try {
        if (state === null) storage.removeItem(SYNC_STATE_KEY)
        else storage.setItem(SYNC_STATE_KEY, JSON.stringify(state))
      } catch {
        // Without the note, the next sync is treated as a first one: safe, just asks more.
      }
    },
  }
}

export function deviceId(storage: FlagStorage): string {
  try {
    const existing = storage.getItem(SYNC_DEVICE_KEY)
    if (existing !== null && existing !== "") return existing
    const id = crypto.randomUUID()
    storage.setItem(SYNC_DEVICE_KEY, id)
    return id
  } catch {
    return "unknown-device"
  }
}

/** The browser's side of Web Push, or nulls where it has none (no worker in a dev build, no Notification API). */
export function browserPushParts(env: Record<string, unknown>): Pick<PushDeps, "vapidPublicKey" | "manager" | "permission"> {
  const vapid = env.VITE_VAPID_PUBLIC_KEY
  const api = (globalThis as { Notification?: { permission: NotificationPermission; requestPermission(): Promise<NotificationPermission> } }).Notification
  return {
    vapidPublicKey: typeof vapid === "string" && vapid !== "" ? vapid : null,
    // getRegistration resolves to undefined when there is no worker, where ready would wait forever.
    manager: async () => {
      const container = typeof navigator === "undefined" ? undefined : navigator.serviceWorker
      const registration = await container?.getRegistration()
      // The browser's PushManager is wider than the slice the sync code uses.
      return (registration?.pushManager as unknown as PushManagerLike | undefined) ?? null
    },
    permission: {
      get: () => (api === undefined ? "unsupported" : api.permission),
      request: async () => (api === undefined ? "denied" : api.requestPermission()),
    },
  }
}

export interface CloudHandle {
  controller: SyncController
  stop: () => void
}

/**
 * Loads the sync code and starts it. Null when the build has no sync server.
 * @param env - The build's env (import.meta.env).
 */
export async function startCloud(
  storage: FlagStorage,
  reload: () => void,
  env: Record<string, unknown>,
  engine?: Viewable
): Promise<CloudHandle | null> {
  if (!cloudConfigured(env)) return null
  const cloud = await import("@decay-engine/cloud")
  const config = cloud.cloudConfigFromEnv(env)
  if (config === null) return null
  const client = cloud.connectToSupabase(config)
  const push =
    engine === undefined
      ? undefined
      : cloud.createPushService({
          client,
          app: BACKUP_APP,
          ...browserPushParts(env),
          // When the next window or fact changes, with quiet hours applied; null when nothing will.
          plan: () => cloud.planPush(engine, Date.now(), new Date().getTimezoneOffset()),
          text: pushNotification,
        })
  const controller = cloud.createSyncController({
    client,
    push,
    redirectTo: `${window.location.origin}/`,
    reload,
    service: (getPassphrase) =>
      cloud.createSyncService({
        client,
        app: BACKUP_APP,
        local: makeLocalSide(storage),
        store: makeStateStore(storage),
        deviceId: deviceId(storage),
        getPassphrase,
      }),
  })
  void controller.start()
  // The timer and the visibility listener live in the cloud package, not in the app's source.
  const stopAuto = cloud.browserAutoSync(controller)
  return {
    controller,
    stop: () => {
      stopAuto()
      controller.dispose()
    },
  }
}
