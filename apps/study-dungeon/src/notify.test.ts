// @vitest-environment jsdom
//
// The notification rule and its helpers (task L5, Requirement 24). A fake
// Notification class and a fake permission; a real engine on InMemoryAdapter
// for the notices, at fixed times (never the real clock). A solid fact
// (half-life 10) is alive until T0 + 7.37 days and weak after it.

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
import { diffStates, snapshotStates } from "./state-changes"
import { badgeIcon } from "./tab-signal"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { fakeNotifications, throwingStorage } from "./test/fake-notification"
import { T0, day } from "./test/fixtures"

/** The notice of the tick from day 7 to day 8 for these facts (each id is its creature's name here). */
function noticeFor(ids: string[]): LiveNotice {
  const kit = makeAppKit()
  for (const id of ids) kit.add(id, "solid", T0)
  const before = snapshotStates(kit.engine.view(day(7)))
  const seen = kit.engine.view(day(8))
  const notice = liveNotice(diffStates(before, snapshotStates(seen)), seen, (id) => id)
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

describe("shouldNotify (Requirement 24.5)", () => {
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

describe("notifySettingState (Requirement 24.3)", () => {
  it("covers every state", () => {
    expect(notifySettingState(null, false)).toBe("unsupported")
    expect(notifySettingState(null, true)).toBe("unsupported")
    expect(notifySettingState(fakeNotifications("granted").api, true)).toBe("on")
    expect(notifySettingState(fakeNotifications("denied").api, true)).toBe("blocked")
    expect(notifySettingState(fakeNotifications("default").api, true)).toBe("blocked")
    expect(notifySettingState(fakeNotifications("denied").api, false)).toBe("denied")
    expect(notifySettingState(fakeNotifications("default").api, false)).toBe("off")
    expect(notifySettingState(fakeNotifications("granted").api, false)).toBe("off")
  })
})

describe("notificationFor: the toast's words (Requirement 24.6)", () => {
  it.each([
    [["Gaze"], "Gaze just weakened."],
    [["Gaze", "Wisp"], "Gaze and Wisp just weakened."],
    [["Gaze", "Wisp", "Mire"], "3 facts weakened, Gaze's among them."],
  ] as [string[], string][])("%j: the body is the notice's text", (ids, sentence) => {
    const notice = noticeFor(ids)
    expect(notice.text).toBe(sentence)
    const { title, options } = notificationFor(notice)
    expect(title).toBe("Study Dungeon")
    expect(options.body).toBe(notice.text)
  })

  it("one tag, silent, no vibration, the tab signal's data-URL icon", () => {
    const { options } = notificationFor(noticeFor(["Gaze"]))
    expect(NOTIFY_TAG).toBe("study-dungeon-live")
    expect(options.tag).toBe(NOTIFY_TAG)
    expect(options.silent).toBe(true)
    expect("vibrate" in options).toBe(false)
    expect(options.icon).toBe(badgeIcon("weak"))
    expect(options.icon!.startsWith("data:image/svg+xml,")).toBe(true)
    expect(Object.keys(options).sort()).toEqual(["body", "icon", "silent", "tag"])
  })
})

describe("showNotification (Requirement 24.6, 24.7, 24.10)", () => {
  it("makes exactly one notification; a click focuses the tab and closes it", () => {
    const fake = fakeNotifications("granted")
    const notice = noticeFor(["Gaze"])
    let focused = 0
    expect(showNotification(fake.api, notice, () => focused++)).toBe(true)
    expect(fake.shown).toHaveLength(1)
    expect(fake.shown[0]!.title).toBe("Study Dungeon")
    expect(fake.shown[0]!.options).toEqual(notificationFor(notice).options)
    fake.shown[0]!.onclick!(new Event("click"))
    expect(focused).toBe(1)
    expect(fake.shown[0]!.closed).toBe(true)
    expect(fake.requests()).toBe(0)
  })

  it("a constructor that throws shows nothing and returns false", () => {
    const fake = fakeNotifications("granted", { throws: true })
    expect(showNotification(fake.api, noticeFor(["Gaze"]), () => {})).toBe(false)
    expect(fake.shown).toHaveLength(0)
  })
})

describe("the setting in storage (Requirement 24.4)", () => {
  it("is off when missing, on only for the word on", () => {
    expect(readNotifyEnabled(new MemoryStorage())).toBe(false)
    expect(readNotifyEnabled(new MemoryStorage({ [NOTIFY_SETTING_KEY]: "on" }))).toBe(true)
    expect(readNotifyEnabled(new MemoryStorage({ [NOTIFY_SETTING_KEY]: "off" }))).toBe(false)
    expect(readNotifyEnabled(new MemoryStorage({ [NOTIFY_SETTING_KEY]: "yes" }))).toBe(false)
  })

  it("is kept under study-dungeon:notify and read back after a reload", () => {
    expect(NOTIFY_SETTING_KEY).toBe("study-dungeon:notify")
    const storage = new MemoryStorage()
    expect(saveNotifyEnabled(storage, true)).toBe(true)
    expect(storage.entries()).toEqual({ [NOTIFY_SETTING_KEY]: "on" })
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
