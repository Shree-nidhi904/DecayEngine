// Web Push on the device: ask permission, subscribe this browser, tell the
// server where to send, and keep the server's "next push is due at" up to date.
//
// Everything browser-specific is passed in (the push manager, the permission
// API, the clock), so this is tested without a browser. The server is told only
// a time and a generic title and body; the app computes the time (plan) from its
// own data, so what is in the data never leaves the device.

import { CloudError, type CloudClient } from "./types"

export type PushState = "unsupported" | "denied" | "off" | "on"

export interface PushSubscriptionLike {
  endpoint: string
  toJSON(): { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  unsubscribe(): Promise<boolean>
}

export interface PushManagerLike {
  getSubscription(): Promise<PushSubscriptionLike | null>
  subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<PushSubscriptionLike>
}

export type PermissionValue = "default" | "granted" | "denied"

export interface PushDeps {
  client: CloudClient
  app: string
  /** The VAPID public key (base64url), or null when the build has none. */
  vapidPublicKey: string | null
  /** The service worker registration's push manager, or null when there is no worker. */
  manager: () => Promise<PushManagerLike | null>
  permission: { get(): PermissionValue | "unsupported"; request(): Promise<PermissionValue> }
  /** When the next push should go out (quiet hours applied), or null for none. */
  plan: () => { at: number } | null
  /** The generic notification text. It names no person and no fact. */
  text: { title: string; body: string }
}

export interface PushService {
  state(): Promise<PushState>
  /** Must be called from a click: the permission prompt needs one. */
  enable(): Promise<PushState>
  disable(): Promise<PushState>
  /** Sends the latest due time to the server when it changed. Does nothing unless push is on. */
  refresh(): Promise<void>
  /**
   * When the server holds the next push for this device (epoch ms), null when none is
   * scheduled, undefined before anything is known. Reflects the 24 hour limit.
   */
  scheduled(): number | null | undefined
}

/** A base64url string as bytes, the form pushManager.subscribe wants for the server key. */
export function urlBase64ToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function createPushService(deps: PushDeps): PushService {
  /** What the server was last told, so an unchanged time is not sent again. */
  let uploaded: number | "none" | null = null
  let kept: number | null | undefined

  async function state(): Promise<PushState> {
    const permission = deps.permission.get()
    if (deps.vapidPublicKey === null || permission === "unsupported") return "unsupported"
    const manager = await deps.manager()
    if (manager === null) return "unsupported"
    if (permission === "denied") return "denied"
    if (permission === "granted" && (await manager.getSubscription()) !== null) return "on"
    return "off"
  }

  async function refresh(): Promise<void> {
    if ((await state()) !== "on") return
    const plan = deps.plan()
    if (plan === null) {
      if (uploaded === "none") return
      await deps.client.clearPushSchedule(deps.app)
      uploaded = "none"
      kept = null
      return
    }
    if (uploaded === plan.at) return
    kept = await deps.client.setPushSchedule({ app: deps.app, notifyAt: plan.at, title: deps.text.title, body: deps.text.body })
    uploaded = plan.at
  }

  return {
    state,
    refresh,
    scheduled: () => kept,

    async enable() {
      const current = await state()
      if (current === "unsupported" || current === "denied") return current
      const manager = (await deps.manager())!
      let permission = deps.permission.get()
      if (permission === "default") permission = await deps.permission.request()
      if (permission !== "granted") return permission === "denied" ? "denied" : "off"
      const subscription =
        (await manager.getSubscription()) ??
        (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(deps.vapidPublicKey!) }))
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new CloudError("PUSH", "The browser gave an incomplete push subscription.")
      }
      await deps.client.registerPush({ app: deps.app, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth })
      uploaded = null
      await refresh()
      return "on"
    },

    async disable() {
      const manager = await deps.manager()
      const subscription = manager === null ? null : await manager.getSubscription()
      if (subscription !== null) {
        await deps.client.unregisterPush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      await deps.client.clearPushSchedule(deps.app)
      uploaded = null
      kept = undefined
      return state()
    },
  }
}
