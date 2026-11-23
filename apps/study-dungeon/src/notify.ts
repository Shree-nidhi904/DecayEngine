// Notifications while the tab is open (task L5, Requirement 24, design
// "Notifications While the Tab Is Open"). The same rule as Ghosted's
// notify.ts, in Study Dungeon's names (no import between apps).
//
// One more reader of L3's tick result: the notice that liveNotice builds
// (live-changes.ts) is the only source of the words, so a change that is
// notified is the same change the toast shows, in the same sentence. No new
// change detection and no sentence written out here.
//
// shouldNotify is the whole rule, as a pure function. The rest are thin
// helpers around the browser's Notification API, which the App receives as a
// prop (tests pass a fake class). No clock, no network: the icon is the tab
// signal's data URL. The setting follows sound.ts's pattern ("on"/"off" in
// the App's storage, every throw caught).

import type { FlagStorage } from "./first-run"
import type { LiveNotice } from "./live-changes"
import { badgeIcon } from "./tab-signal"
import { headerText } from "./wording"

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

/** Everything the decision depends on (Requirement 24.5). */
export type NotifyInput = {
  enabled: boolean
  /** Notification.permission, or "unsupported" when there is no Notification API. */
  permission: NotifyPermission | "unsupported"
  visibility: "visible" | "hidden"
  previewing: boolean
  /** The first tick at mount or after "Back to today": it only records the states. */
  firstTick: boolean
  /** The tick has a notice (a reported change). */
  hasChange: boolean
}

export type NotifySettingState = "unsupported" | "off" | "on" | "denied" | "blocked"

/** Where the setting is kept, beside the sound setting: "on" or "off". */
export const NOTIFY_SETTING_KEY = "study-dungeon:notify"

/** Every notification has this tag, so a later one replaces the earlier one (Requirement 24.6). */
export const NOTIFY_TAG = "study-dungeon-live"

/** Whether this tick shows a notification: all six conditions, and nothing else. */
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
    title: headerText.title,
    options: { body: notice.text, tag: NOTIFY_TAG, icon: badgeIcon(notice.worst), silent: true },
  }
}

/**
 * Shows one notification. A click brings the tab forward and closes it; it
 * changes no data. A constructor that throws (some phones allow
 * notifications only from a service worker) shows nothing: false.
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

/** Whether the user turned the setting on. Off when missing, unknown or unreadable. */
export function readNotifyEnabled(storage: FlagStorage): boolean {
  try {
    return storage.getItem(NOTIFY_SETTING_KEY) === "on"
  } catch {
    return false
  }
}

/** Saves the choice. False when the storage threw: the choice then lasts until the page closes. */
export function saveNotifyEnabled(storage: FlagStorage, enabled: boolean): boolean {
  try {
    storage.setItem(NOTIFY_SETTING_KEY, enabled ? "on" : "off")
    return true
  } catch {
    return false
  }
}

/** The browser's Notification class, or null when there is none. */
export function browserNotificationApi(): NotificationApi | null {
  const api = (globalThis as { Notification?: unknown }).Notification
  return typeof api === "function" ? (api as NotificationApi) : null
}
