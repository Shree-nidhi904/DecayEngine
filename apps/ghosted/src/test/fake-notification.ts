// A fake of the browser's Notification class and its permission (task L5,
// design section 16.5). It records every notification made and every
// permission request, and answers a request with `answer` (or leaves the
// permission as it is when the user closes the prompt: `answer` undefined).

import type { NotificationApi, NotifyPermission } from "../notify"

export type FakeShown = {
  title: string
  options: NotificationOptions | undefined
  onclick: ((event: Event) => void) | null
  closed: boolean
}

export type FakeNotifications = {
  api: NotificationApi
  /** Every notification made, in order. */
  shown: FakeShown[]
  /** How many times requestPermission was called. */
  requests: () => number
  /** Changes the permission, as the user would in the browser's site settings. */
  setPermission: (permission: NotifyPermission) => void
  /** With `hold`: lets the pending request answer now. */
  answerHeld: () => void
}

export function fakeNotifications(
  permission: NotifyPermission,
  options: { answer?: NotifyPermission; throws?: boolean; hold?: boolean } = {}
): FakeNotifications {
  const shown: FakeShown[] = []
  let requests = 0
  let current = permission
  let release: (() => void) | null = null

  class FakeNotification {
    static get permission(): NotifyPermission {
      return current
    }
    static requestPermission(): Promise<NotifyPermission> {
      requests++
      const settle = () => {
        if (options.answer !== undefined) current = options.answer
      }
      if (options.hold === true) {
        return new Promise((resolve) => {
          release = () => {
            settle()
            resolve(current)
          }
        })
      }
      settle()
      return Promise.resolve(current)
    }
    title: string
    options: NotificationOptions | undefined
    onclick: ((event: Event) => void) | null = null
    closed = false
    constructor(title: string, notificationOptions?: NotificationOptions) {
      if (options.throws === true) throw new TypeError("Illegal constructor")
      this.title = title
      this.options = notificationOptions
      shown.push(this)
    }
    close() {
      this.closed = true
    }
  }

  return {
    api: FakeNotification as unknown as NotificationApi,
    shown,
    requests: () => requests,
    setPermission: (p) => {
      current = p
    },
    answerHeld: () => {
      const held = release
      release = null
      held?.()
    },
  }
}

/** A storage whose every call throws, as a browser with storage blocked. */
export const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("SecurityError: storage is blocked")
  },
  setItem: (): void => {
    throw new Error("QuotaExceededError")
  },
  removeItem: (): void => {
    throw new Error("SecurityError: storage is blocked")
  },
}
