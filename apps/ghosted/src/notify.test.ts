// The notification rule and its helpers (task L5, Req 39, design section 16.5).
// A fake Notification class and a fake permission; a real engine on
// InMemoryAdapter for the notices, at fixed times (never the real clock).

import { describe, expect, it } from "vitest"
import { liveNotice, type LiveNotice } from "./live-changes"
import {
  NOTIFY_SETTING_KEY,
  NOTIFY_TAG,
  browserNotificationApi,
  notificationFor,
  notifySettingState,
  readNotifyEnabled,
  saveNotifyEnabled,
  shouldNotify,
  showNotification,
  type NotifyInput,
} from "./notify"
import type { PersonPayload } from "./policy"
import { diffStates, snapshotStates } from "./state-changes"
import { badgeIcon } from "./tab-signal"
import { FakeStorage } from "./test/fake-storage"
import { fakeNotifications, throwingStorage } from "./test/fake-notification"
import { MINUTE_MS, T0, day, makeEngine } from "./test/fixtures"

/** The notice of the tick from just before T0 + 12 days to just after, for these people (rhythm 10: they flicker at day 12). */
function noticeFor(names: [name: string, importance: number][]): LiveNotice {
  const engine = makeEngine()
  for (const [name, importance] of names) {
    const payload: PersonPayload = { name, relationship: "", rhythmDays: 10, lastContactAt: T0 }
    engine.addItem({ payload, importance, costMinutes: 10 }, T0)
  }
  const before = snapshotStates(engine.view(day(12) - MINUTE_MS))
  const seen = engine.view(day(12) + MINUTE_MS)
  const notice = liveNotice(diffStates(before, snapshotStates(seen)), seen)
  expect(notice).not.toBeNull()
  return notice!
}

const ALL_ON: NotifyInput = {
  enabled: true,
  permission: "granted",
  visibility: "hidden",
  previewing: false,
  firstTick: false,
  hasChange: true,
}

describe("shouldNotify (Req 39.5)", () => {
  it("over every combination, only the one with all six conditions is true", () => {
    const trues: NotifyInput[] = []
    let count = 0
    for (const enabled of [false, true])
      for (const permission of ["unsupported", "default", "granted", "denied"] as const)
        for (const visibility of ["visible", "hidden"] as const)
          for (const previewing of [false, true])
            for (const firstTick of [false, true])
              for (const hasChange of [false, true]) {
                count++
                const input = { enabled, permission, visibility, previewing, firstTick, hasChange }
                if (shouldNotify(input)) trues.push(input)
              }
    expect(count).toBe(128)
    expect(trues).toEqual([ALL_ON])
  })

  it.each([
    ["the setting is off", { enabled: false }],
    ["there is no Notification API", { permission: "unsupported" }],
    ["the permission was never given", { permission: "default" }],
    ["the permission is denied", { permission: "denied" }],
    ["the tab is visible (only the toast shows)", { visibility: "visible" }],
    ["the time machine looks ahead", { previewing: true }],
    ["it is the first tick at mount or after Back to today", { firstTick: true }],
    ["the tick changed nothing", { hasChange: false }],
  ] as const)("is false when %s", (_, change) => {
    expect(shouldNotify({ ...ALL_ON, ...change })).toBe(false)
  })
})

describe("notifySettingState (Req 39.3)", () => {
  it("unsupported without an API, whatever the setting", () => {
    expect(notifySettingState(null, false)).toBe("unsupported")
    expect(notifySettingState(null, true)).toBe("unsupported")
  })

  it("on only with the permission granted; blocked when the setting is on without it", () => {
    expect(notifySettingState(fakeNotifications("granted").api, true)).toBe("on")
    expect(notifySettingState(fakeNotifications("denied").api, true)).toBe("blocked")
    expect(notifySettingState(fakeNotifications("default").api, true)).toBe("blocked")
  })

  it("denied when the setting is off and the browser denied it; otherwise off", () => {
    expect(notifySettingState(fakeNotifications("denied").api, false)).toBe("denied")
    expect(notifySettingState(fakeNotifications("default").api, false)).toBe("off")
    expect(notifySettingState(fakeNotifications("granted").api, false)).toBe("off")
  })
})

describe("notificationFor: the toast's words (Req 39.6)", () => {
  it.each([
    [[["Mira Castell", 2]], "Mira Castell's window started to flicker."],
    [[["Mira Castell", 2], ["Dan Okafor", 1]], "Mira Castell's and Dan Okafor's windows started to flicker."],
    [[["Mira Castell", 2], ["Ana Ruiz", 3], ["Dan Okafor", 1]], "3 windows started to flicker, Ana Ruiz's among them."],
  ] as [[string, number][], string][])("%j: the body is the notice's text, the same string the toast shows", (people, sentence) => {
    const notice = noticeFor(people)
    expect(notice.text).toBe(sentence)
    const { title, options } = notificationFor(notice)
    expect(title).toBe("Ghosted")
    expect(options.body).toBe(notice.text)
  })

  it("one tag for every notification, silent, no vibration, the tab signal's data-URL icon", () => {
    const notice = noticeFor([["Mira Castell", 2]])
    const { options } = notificationFor(notice)
    expect(NOTIFY_TAG).toBe("ghosted-live")
    expect(options.tag).toBe(NOTIFY_TAG)
    expect(options.silent).toBe(true)
    expect("vibrate" in options).toBe(false)
    expect("requireInteraction" in options).toBe(false)
    expect(options.icon).toBe(badgeIcon("weak"))
    expect(options.icon!.startsWith("data:image/svg+xml,")).toBe(true)
    expect(Object.keys(options).sort()).toEqual(["body", "icon", "silent", "tag"])
  })

  it("the icon shows the cross when a window went dark", () => {
    const notice: LiveNotice = { ...noticeFor([["Mira Castell", 2]]), worst: "dead" }
    expect(notificationFor(notice).options.icon).toBe(badgeIcon("dead"))
  })
})

describe("showNotification (Req 39.6, 39.7, 39.10)", () => {
  it("makes exactly one notification; a click focuses the tab and closes it", () => {
    const fake = fakeNotifications("granted")
    const notice = noticeFor([["Mira Castell", 2]])
    let focused = 0
    expect(showNotification(fake.api, notice, () => focused++)).toBe(true)
    expect(fake.shown).toHaveLength(1)
    const shown = fake.shown[0]!
    expect(shown.title).toBe("Ghosted")
    expect(shown.options).toEqual(notificationFor(notice).options)
    expect(focused).toBe(0)
    expect(shown.closed).toBe(false)

    shown.onclick!(new Event("click"))
    expect(focused).toBe(1)
    expect(shown.closed).toBe(true)
    // Nothing else was made, and no permission was asked.
    expect(fake.shown).toHaveLength(1)
    expect(fake.requests()).toBe(0)
  })

  it("a constructor that throws (notifications only from a service worker) shows nothing and returns false", () => {
    const fake = fakeNotifications("granted", { throws: true })
    expect(showNotification(fake.api, noticeFor([["Mira Castell", 2]]), () => {})).toBe(false)
    expect(fake.shown).toHaveLength(0)
  })
})

describe("the setting in storage (Req 39.4)", () => {
  it("is off when missing, on only for the word on", () => {
    expect(readNotifyEnabled(new FakeStorage())).toBe(false)
    expect(readNotifyEnabled(new FakeStorage({ [NOTIFY_SETTING_KEY]: "on" }))).toBe(true)
    expect(readNotifyEnabled(new FakeStorage({ [NOTIFY_SETTING_KEY]: "off" }))).toBe(false)
    expect(readNotifyEnabled(new FakeStorage({ [NOTIFY_SETTING_KEY]: "yes" }))).toBe(false)
  })

  it("is kept under ghosted:notify and read back after a reload (a new read of the same storage)", () => {
    expect(NOTIFY_SETTING_KEY).toBe("ghosted:notify")
    const storage = new FakeStorage()
    expect(saveNotifyEnabled(storage, true)).toBe(true)
    expect(storage.getItem(NOTIFY_SETTING_KEY)).toBe("on")
    expect(readNotifyEnabled(storage)).toBe(true)
    expect(saveNotifyEnabled(storage, false)).toBe(true)
    expect(readNotifyEnabled(storage)).toBe(false)
  })

  it("a storage that throws reads as off and reports a failed save, without throwing", () => {
    expect(readNotifyEnabled(throwingStorage)).toBe(false)
    expect(saveNotifyEnabled(throwingStorage, true)).toBe(false)
  })
})

describe("browserNotificationApi", () => {
  it("is null where there is no Notification API (jsdom)", () => {
    expect("Notification" in globalThis).toBe(false)
    expect(browserNotificationApi()).toBeNull()
  })
})
