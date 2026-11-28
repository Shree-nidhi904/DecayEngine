// Supabase Edge Function: sends the Web Push notifications that are due.
// Called every minute by pg_cron (see the SQL in docs/PUSH_SETUP.md), with the
// header x-cron-secret. Deploy with:
//   npx supabase functions deploy send-due-pushes --no-verify-jwt
// (the secret header is the check; the gateway's JWT check is off so the cron
// job does not need a user token).
//
// Secrets it reads (npx supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase itself.
//
// The logic is in ../_shared/due-pushes.ts, which has tests.

import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import { sameSecret, sendDuePushes, type Deps } from "../_shared/due-pushes.ts"

const env = (name: string): string => Deno.env.get(name) ?? ""

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 })
  if (!sameSecret(request.headers.get("x-cron-secret") ?? "", env("CRON_SECRET"))) {
    return new Response("unauthorized", { status: 401 })
  }

  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } })
  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"))

  const check = <T>(result: { data: T | null; error: { message: string } | null }): T => {
    if (result.error) throw new Error(result.error.message)
    return result.data as T
  }

  const deps: Deps = {
    now: () => Date.now(),
    fetchDue: async (limit) =>
      check(
        await db
          .from("push_schedule")
          .select("user_id, app, title, body")
          .lte("notify_at", new Date().toISOString())
          .order("notify_at", { ascending: true })
          .limit(limit)
      ) ?? [],
    fetchSubscriptions: async (userId, app) =>
      check(await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).eq("app", app)) ?? [],
    send: async (subscription, payload) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: "normal" }
        )
        return { ok: true }
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        return { ok: false, gone: status === 404 || status === 410 }
      }
    },
    deleteSubscription: async (id) => void check(await db.from("push_subscriptions").delete().eq("id", id)),
    finish: async (userId, app, delivered, now) =>
      void check(
        await db
          .from("push_schedule")
          .update(delivered ? { notify_at: null, last_sent_at: new Date(now).toISOString() } : { notify_at: null })
          .eq("user_id", userId)
          .eq("app", app)
      ),
    retryAt: async (userId, app, at) =>
      void check(await db.from("push_schedule").update({ notify_at: new Date(at).toISOString() }).eq("user_id", userId).eq("app", app)),
  }

  const summary = await sendDuePushes(deps)
  return new Response(JSON.stringify(summary), { headers: { "Content-Type": "application/json" } })
})
