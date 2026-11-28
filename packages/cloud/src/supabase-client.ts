// The real CloudClient, on supabase-js. Everything above this file works on the
// CloudClient interface; this is the only place that talks to Supabase.
//
// Server side: supabase/migrations/20261128000000_sync.sql (a snapshots table
// readable only by its owner, a push_snapshot function that compares revisions,
// and delete_my_account).
//
// Sign-in is by emailed link with PKCE: the link must be opened in the browser
// that asked for it, which the Sync panel tells the user.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { CloudError, type CloudClient, type CloudUser, type PushResult, type RemoteSnapshot } from "./types"

export interface CloudConfig {
  url: string
  /** The project's publishable key. Meant to be public; access is enforced by row-level security. */
  key: string
}

/**
 * Reads the config from Vite's env (`import.meta.env`). Null when either value
 * is missing, which keeps the whole feature off.
 */
export function cloudConfigFromEnv(env: Record<string, unknown>): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (typeof url !== "string" || typeof key !== "string" || url === "" || key === "") return null
  return { url, key }
}

interface Row {
  revision: number
  device_id: string
  encrypted: boolean
  body: string
  updated_at: string
}

const toRemote = (row: Row): RemoteSnapshot => ({
  revision: row.revision,
  updatedAt: row.updated_at,
  deviceId: row.device_id,
  encrypted: row.encrypted,
  body: row.body,
})

const toUser = (user: { id: string; email?: string | null } | null | undefined): CloudUser | null =>
  user === null || user === undefined ? null : { id: user.id, email: user.email ?? "" }

function fail(error: { message: string } | null): void {
  if (error !== null) throw new CloudError("NETWORK", error.message)
}

/** Wraps a supabase-js client. Tests pass a fake of the few methods used. */
export function cloudClientFrom(supabase: SupabaseClient): CloudClient {
  return {
    async getUser() {
      const { data, error } = await supabase.auth.getSession()
      fail(error)
      return toUser(data.session?.user)
    },

    onAuthChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },

    async signInWithEmail(email, redirectTo) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } })
      fail(error)
    },

    async signOut() {
      const { error } = await supabase.auth.signOut()
      fail(error)
    },

    async getSnapshot(app) {
      const { data, error } = await supabase
        .from("snapshots")
        .select("revision, device_id, encrypted, body, updated_at")
        .eq("app", app)
        .maybeSingle()
      fail(error)
      return data === null ? null : toRemote(data as Row)
    },

    async pushSnapshot({ app, expectedRevision, deviceId, encrypted, body }): Promise<PushResult> {
      const { data, error } = await supabase.rpc("push_snapshot", {
        p_app: app,
        p_expected_revision: expectedRevision,
        p_device_id: deviceId,
        p_encrypted: encrypted,
        p_body: body,
      })
      fail(error)
      const result = data as { ok: boolean; revision?: number; server_time?: string; current?: Row | null }
      if (result.ok) return { ok: true, revision: result.revision!, serverTime: result.server_time! }
      return { ok: false, reason: "conflict", current: result.current ? toRemote(result.current) : null }
    },

    async serverTime() {
      const { data, error } = await supabase.rpc("server_time")
      fail(error)
      const at = typeof data === "string" ? Date.parse(data) : NaN
      if (Number.isNaN(at)) throw new CloudError("NETWORK", "The server did not return its time.")
      return at
    },

    async registerPush({ app, endpoint, p256dh, auth }) {
      const { error } = await supabase.rpc("register_push", { p_app: app, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth })
      fail(error)
    },

    async unregisterPush(endpoint) {
      const { error } = await supabase.rpc("unregister_push", { p_endpoint: endpoint })
      fail(error)
    },

    async setPushSchedule({ app, notifyAt, title, body }) {
      const { data, error } = await supabase.rpc("set_push_schedule", {
        p_app: app,
        p_notify_at: new Date(notifyAt).toISOString(),
        p_title: title,
        p_body: body,
      })
      fail(error)
      // The function returns the time it kept (moved later by the 24 hour limit), or null.
      const kept = typeof data === "string" ? Date.parse(data) : NaN
      return Number.isNaN(kept) ? null : kept
    },

    async clearPushSchedule(app) {
      const { error } = await supabase.rpc("clear_push_schedule", { p_app: app })
      fail(error)
    },

    async deleteAccount() {
      const { error } = await supabase.rpc("delete_my_account")
      fail(error)
      await supabase.auth.signOut({ scope: "local" })
    },
  }
}

/** Creates the real client for a project. */
export function connectToSupabase(config: CloudConfig): CloudClient {
  return cloudClientFrom(
    createClient(config.url, config.key, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  )
}
