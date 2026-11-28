import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { cloudClientFrom, cloudConfigFromEnv } from "./supabase-client"

const row = { revision: 3, device_id: "d", encrypted: true, body: "b", updated_at: "2026-11-28T00:00:00Z" }

function fakeSupabase(opts: { rpc?: unknown; select?: unknown; error?: { message: string } | null; session?: unknown } = {}) {
  const calls: Record<string, unknown[]> = { rpc: [], eq: [], signInWithOtp: [], signOut: [] }
  const error = opts.error ?? null
  const unsubscribe = vi.fn()
  let authCb: (e: string, s: unknown) => void = () => {}
  const sb = {
    auth: {
      getSession: async () => ({ data: { session: opts.session ?? null }, error }),
      onAuthStateChange: (cb: typeof authCb) => {
        authCb = cb
        return { data: { subscription: { unsubscribe } } }
      },
      signInWithOtp: async (a: unknown) => (calls.signInWithOtp.push(a), { error }),
      signOut: async (a?: unknown) => (calls.signOut.push(a), { error }),
    },
    from: () => ({
      select: () => ({ eq: (c: string, v: string) => (calls.eq.push([c, v]), { maybeSingle: async () => ({ data: opts.select ?? null, error }) }) }),
    }),
    rpc: async (name: string, args?: unknown) => (calls.rpc.push([name, args]), { data: opts.rpc ?? null, error }),
  }
  return { client: cloudClientFrom(sb as unknown as SupabaseClient), calls, fire: (s: unknown) => authCb("SIGNED_IN", s), unsubscribe }
}

describe("cloudConfigFromEnv", () => {
  it("needs both values, as text", () => {
    expect(cloudConfigFromEnv({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toEqual({ url: "u", key: "k" })
    expect(cloudConfigFromEnv({ VITE_SUPABASE_URL: "u" })).toBeNull()
    expect(cloudConfigFromEnv({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBeNull()
    expect(cloudConfigFromEnv({})).toBeNull()
  })
})

describe("serverTime", () => {
  it("returns the server's clock as epoch ms, and refuses an answer that is not a time", async () => {
    expect(await fakeSupabase({ rpc: "2026-11-28T10:00:00+00:00" }).client.serverTime()).toBe(Date.UTC(2026, 10, 28, 10, 0))
    await expect(fakeSupabase({ rpc: null }).client.serverTime()).rejects.toMatchObject({ code: "NETWORK" })
    await expect(fakeSupabase({ error: { message: "no such function" } }).client.serverTime()).rejects.toThrow("no such function")
  })
})

describe("push functions", () => {
  it("calls the four SQL functions with the right arguments", async () => {
    const f = fakeSupabase()
    await f.client.registerPush({ app: "ghosted", endpoint: "e", p256dh: "p", auth: "a" })
    await f.client.unregisterPush("e")
    await f.client.setPushSchedule({ app: "ghosted", notifyAt: Date.UTC(2026, 10, 28, 8, 0), title: "T", body: "B" })
    await f.client.clearPushSchedule("ghosted")
    expect(f.calls.rpc).toEqual([
      ["register_push", { p_app: "ghosted", p_endpoint: "e", p_p256dh: "p", p_auth: "a" }],
      ["unregister_push", { p_endpoint: "e" }],
      ["set_push_schedule", { p_app: "ghosted", p_notify_at: "2026-11-28T08:00:00.000Z", p_title: "T", p_body: "B" }],
      ["clear_push_schedule", { p_app: "ghosted" }],
    ])
  })

  it("setPushSchedule returns the time the server kept, or null", async () => {
    const kept = fakeSupabase({ rpc: "2026-11-29T08:00:00+00:00" })
    expect(await kept.client.setPushSchedule({ app: "a", notifyAt: 1, title: "T", body: "B" })).toBe(Date.UTC(2026, 10, 29, 8, 0))
    const none = fakeSupabase({ rpc: null })
    expect(await none.client.setPushSchedule({ app: "a", notifyAt: 1, title: "T", body: "B" })).toBeNull()
  })

  it("a server error is thrown", async () => {
    await expect(fakeSupabase({ error: { message: "nope" } }).client.registerPush({ app: "a", endpoint: "e", p256dh: "p", auth: "a" })).rejects.toThrow("nope")
  })
})

describe("cloudClientFrom", () => {
  it("reads the user from the stored session, with no email as empty text", async () => {
    expect(await fakeSupabase().client.getUser()).toBeNull()
    expect(await fakeSupabase({ session: { user: { id: "u", email: "a@b.test" } } }).client.getUser()).toEqual({ id: "u", email: "a@b.test" })
    expect(await fakeSupabase({ session: { user: { id: "u" } } }).client.getUser()).toEqual({ id: "u", email: "" })
  })

  it("passes auth changes on, and stops listening", () => {
    const f = fakeSupabase()
    const seen = vi.fn()
    const stop = f.client.onAuthChange(seen)
    f.fire({ user: { id: "u", email: "a@b.test" } })
    f.fire(null)
    expect(seen.mock.calls).toEqual([[{ id: "u", email: "a@b.test" }], [null]])
    stop()
    expect(f.unsubscribe).toHaveBeenCalled()
  })

  it("asks for a sign-in link to the given address", async () => {
    const f = fakeSupabase()
    await f.client.signInWithEmail("a@b.test", "https://app.test/")
    expect(f.calls.signInWithOtp).toEqual([{ email: "a@b.test", options: { emailRedirectTo: "https://app.test/", shouldCreateUser: true } }])
  })

  it("maps a row to a snapshot, and no row to null; the app column is the filter", async () => {
    const f = fakeSupabase({ select: row })
    expect(await f.client.getSnapshot("ghosted")).toEqual({ revision: 3, updatedAt: row.updated_at, deviceId: "d", encrypted: true, body: "b" })
    expect(f.calls.eq).toEqual([["app", "ghosted"]])
    expect(await fakeSupabase().client.getSnapshot("ghosted")).toBeNull()
  })

  it("pushSnapshot calls the function with the compare revision, and maps both answers", async () => {
    const ok = fakeSupabase({ rpc: { ok: true, revision: 4, server_time: "t" } })
    expect(await ok.client.pushSnapshot({ app: "a", expectedRevision: 3, deviceId: "d", encrypted: false, body: "x" })).toEqual({ ok: true, revision: 4, serverTime: "t" })
    expect(ok.calls.rpc).toEqual([["push_snapshot", { p_app: "a", p_expected_revision: 3, p_device_id: "d", p_encrypted: false, p_body: "x" }]])
    const no = fakeSupabase({ rpc: { ok: false, current: row } })
    expect(await no.client.pushSnapshot({ app: "a", expectedRevision: 1, deviceId: "d", encrypted: false, body: "x" })).toMatchObject({ ok: false, reason: "conflict", current: { revision: 3 } })
    const empty = fakeSupabase({ rpc: { ok: false, current: null } })
    expect(await empty.client.pushSnapshot({ app: "a", expectedRevision: 1, deviceId: "d", encrypted: false, body: "x" })).toEqual({ ok: false, reason: "conflict", current: null })
  })

  it("turns a server error into a thrown CloudError", async () => {
    const f = fakeSupabase({ error: { message: "boom" } })
    await expect(f.client.getSnapshot("a")).rejects.toMatchObject({ code: "NETWORK", message: "boom" })
    await expect(f.client.pushSnapshot({ app: "a", expectedRevision: 0, deviceId: "d", encrypted: false, body: "x" })).rejects.toThrow("boom")
  })

  it("deleteAccount calls the function, then forgets the session on this device", async () => {
    const f = fakeSupabase()
    await f.client.deleteAccount()
    expect(f.calls.rpc).toEqual([["delete_my_account", undefined]])
    expect(f.calls.signOut).toEqual([{ scope: "local" }])
  })
})
