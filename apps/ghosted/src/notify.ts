// Notifications while the tab is open (task L5, Req 39, design section 16).
//
// One more reader of L3's tick result: the notice that liveNotice builds
// (live-changes.ts) is the only source of the words, so a change that is
// notified is the same change the toast shows, in the same sentence. There
// is no new change detection here and no sentence written out.
//
// shouldNotify is the whole rule, as a pure function. The rest are thin
// helpers around the browser's Notification API, which the App receives as a
// prop (tests pass a fake class). Nothing here reads the clock or the
// network: the icon is the tab signal's data URL.
//
// The setting is a preference kept under NOTIFY_SETTING_KEY in the App's
// storage (the FlagStorage the first-run flags use). Every read and write
// catches a throwing storage: a preference is not worth breaking the app.

import type { FlagStorage } from "./first-run"
import type { LiveNotice } from "./live-changes"
import { badgeIcon } from "./tab-signal"
import { appText } from "./wording"

export type NotifyPermission = "default" | "granted" | "denied"

/** The part of a Notification the app uses. */
export interface NotificationLike {
  onclick: ((event: Event) => void) | null
  close(): void
}

/** The part of the browser's Notification class the app uses. */
export interface NotificationApi {
  readonly permission: NotifyPermission
  /** Old Safari takes a callback and returns nothing; every other browser returns a promise. */
  requestPermission(): Promise<NotifyPermission> | void
  new (title: string, options?: NotificationOptions): NotificationLike
}

/** Everything the decision depends on (Req 39.5). */
export type NotifyInput = {
  /** The user's setting. */
  enabled: boolean
  /** Notification.permission, or "unsupported" when there is no Notification API. */
  permission: NotifyPermission | "unsupported"
  /** document.visibilityState. */
  visibility: "visible" | "hidden"
  /** The time machine looks ahead. */
  previewing: boolean
  /** The first tick at mount or after "Back to today": it only records the states. */
  firstTick: boolean
  /** The tick has a notice (a reported change). */
  hasChange: boolean
}

/** What the setting shows (Req 39.3, design 16.4). */
export type NotifySettingState = "unsupported" | "off" | "on" | "denied" | "blocked"

/** Where the setting is kept: "on" or "off" (Req 39.4). */
export const NOTIFY_SETTING_KEY = "ghosted:notify"

/** Every notification has this tag, so a later one replaces the earlier one (Req 39.6). */
export const NOTIFY_TAG = "ghosted-live"

/** Whether this tick shows a notification: all six conditions, and nothing else (Req 39.5). */
export function shouldNotify(input: NotifyInput): boolean {
  return (
    input.enabled &&
    input.permission === "granted" &&
    input.visibility === "hidden" &&
    !input.previewing &&
    !input.firstTick &&
    input.hasChange
  )
}

/** The setting's state from the API (null: unsupported) and the user's choice. */
export function notifySettingState(api: NotificationApi | null, enabled: boolean): NotifySettingState {
  if (api === null) return "unsupported"
  if (enabled) return api.permission === "granted" ? "on" : "blocked"
  return api.permission === "denied" ? "denied" : "off"
}

/** The notification for a tick's notice: the toast's words, no sound, no vibration, a data-URL icon. */
export function notificationFor(notice: LiveNotice): { title: string; options: NotificationOptions } {
  return {
    title: appText.name,
    options: { body: notice.text, tag: NOTIFY_TAG, icon: badgeIcon(notice.worst), silent: true },
  }
}

/**
 * Shows one notification for `notice`. A click brings the tab forward and
 * closes it; it changes no data. Some browsers (on phones) allow
 * notifications only from a service worker and throw here: then nothing is
 * shown and false is returned (Req 39.10).
 */
export function showNotification(api: NotificationApi, notice: LiveNotice, focus: () => void): boolean {
  const { title, options } = notificationFor(notice)
  try {
    const shown = new api(title, options)
    shown.onclick = () => {
      focus()
      shown.close()
    }
    return true
  } catch {
    return false
  }
}

/** Whether the user turned the setting on. Off when it is missing, unknown or cannot be read. */
export function readNotifyEnabled(storage: FlagStorage): boolean {
  try {
    return storage.getItem(NOTIFY_SETTING_KEY) === "on"
  } catch {
    return false
  }
}

/** Saves the choice. Returns false when the storage threw: the choice then lasts until the page closes. */
export function saveNotifyEnabled(storage: FlagStorage, enabled: boolean): boolean {
  try {
    storage.setItem(NOTIFY_SETTING_KEY, enabled ? "on" : "off")
    return true
  } catch {
    return false
  }
}

/** The browser's Notification class, or null when there is none (Req 39.3, unsupported). */
export function browserNotificationApi(): NotificationApi | null {
  const api = (globalThis as { Notification?: unknown }).Notification
  return typeof api === "function" ? (api as NotificationApi) : null
}
