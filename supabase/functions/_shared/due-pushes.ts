// What the scheduled function does, with the database and the push service
// passed in, so it runs the same under Deno (send-due-pushes/index.ts) and under
// the tests in packages/cloud. No imports: nothing here is specific to Deno.
//
// For each user and app with a push due:
// - no subscribed browser: the due time is cleared (nothing to send to);
// - at least one send worked: the due time is cleared and last_sent_at is set,
//   which is what the 24-hour limit in set_push_schedule reads;
// - subscriptions the push service reports gone (404 or 410) are deleted;
// - only temporary failures: the push is tried again in RETRY_MS.

export interface DueRow {
  user_id: string
  app: string
  title: string
  body: string
}

export interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult = { ok: true } | { ok: false; gone: boolean }

export interface Deps {
  now(): number
  /** Rows with notify_at at or before now, oldest first. */
  fetchDue(limit: number): Promise<DueRow[]>
  fetchSubscriptions(userId: string, app: string): Promise<Subscription[]>
  send(subscription: Subscription, payload: string): Promise<SendResult>
  deleteSubscription(id: string): Promise<void>
  /** Clears notify_at; sets last_sent_at to `now` when `delivered`. */
  finish(userId: string, app: string, delivered: boolean, now: number): Promise<void>
  retryAt(userId: string, app: string, at: number): Promise<void>
}

export interface Summary {
  due: number
  delivered: number
  removed: number
  retried: number
}

export const RETRY_MS = 5 * 60 * 1000
export const MAX_PER_RUN = 200

/** The text of the notification the service worker shows: title, body, and a tag so a newer one replaces an older. */
export function payloadFor(row: DueRow): string {
  return JSON.stringify({ title: row.title, body: row.body, tag: `${row.app}-due` })
}

export async function sendDuePushes(deps: Deps): Promise<Summary> {
  const summary: Summary = { due: 0, delivered: 0, removed: 0, retried: 0 }
  const rows = await deps.fetchDue(MAX_PER_RUN)
  summary.due = rows.length
  for (const row of rows) {
    try {
      const subscriptions = await deps.fetchSubscriptions(row.user_id, row.app)
      let delivered = 0
      let transient = 0
      const payload = payloadFor(row)
      for (const subscription of subscriptions) {
        const result = await deps.send(subscription, payload)
        if (result.ok) {
          delivered++
        } else if (result.gone) {
          await deps.deleteSubscription(subscription.id)
          summary.removed++
        } else {
          transient++
        }
      }
      const now = deps.now()
      if (delivered > 0) {
        await deps.finish(row.user_id, row.app, true, now)
        summary.delivered++
      } else if (transient > 0) {
        await deps.retryAt(row.user_id, row.app, now + RETRY_MS)
        summary.retried++
      } else {
        await deps.finish(row.user_id, row.app, false, now)
      }
    } catch {
      // One user's trouble must not stop the others; the row stays due and is tried next minute.
    }
  }
  return summary
}

/** Compares two strings in time that does not depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
