// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { readMeta } from "@decay-engine/persist"
import { BACKUP_APP, makeBackup } from "./backup"
import {
  SYNC_DEVICE_KEY,
  cloudConfigured,
  deviceId,
  browserPushParts,
  hasStoredSession,
  makeLocalSide,
  makeStateStore,
  returnedFromSignInLink,
  startCloud,
} from "./cloud-link"
import { ENGINE_STORAGE_KEY, RESET_KEYS, SYNC_STATE_KEY } from "./first-run"

beforeEach(() => localStorage.clear())

const snapshot = (items: object[]) => ({ schemaVersion: 1, items, history: [] })

describe("cloudConfigured", () => {
  it("needs both build values, non-empty", () => {
    expect(cloudConfigured({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBe(true)
    expect(cloudConfigured({ VITE_SUPABASE_URL: "u" })).toBe(false)
    expect(cloudConfigured({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBe(false)
    expect(cloudConfigured({})).toBe(false)
  })

  it("startCloud does nothing, and loads nothing, without a configured server", async () => {
    expect(await startCloud(localStorage, () => {}, {})).toBeNull()
  })
})

describe("hasStoredSession", () => {
  it("finds supabase-js's sign-in key, and nothing else", () => {
    expect(hasStoredSession(localStorage)).toBe(false)
    localStorage.setItem("study-dungeon:started", "1")
    localStorage.setItem("sb-abc-code-verifier", "x")
    expect(hasStoredSession(localStorage)).toBe(false)
    localStorage.setItem("sb-abcdef-auth-token", "{}")
    expect(hasStoredSession(localStorage)).toBe(true)
  })

  it("is false when storage cannot be read", () => {
    expect(
      hasStoredSession({
        length: 1,
        key: () => {
          throw new Error("blocked")
        },
      })
    ).toBe(false)
  })
})

describe("the device's side", () => {
  it("reads nothing before anything is saved", () => {
    expect(makeLocalSide(localStorage).read()).toMatchObject({ text: null, hasData: false, revision: 0 })
  })

  it("reads the backup text, whether there is data, and the persist revision", () => {
    localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot([])))
    expect(makeLocalSide(localStorage).read().hasData).toBe(false)
    localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot([{ id: "a" }])))
    localStorage.setItem(`${ENGINE_STORAGE_KEY}:meta`, JSON.stringify({ appDataVersion: 1, revision: 7, updatedAt: 1, deviceId: "d" }))
    const read = makeLocalSide(localStorage).read()
    expect(read.hasData).toBe(true)
    expect(read.revision).toBe(7)
    expect(JSON.parse(read.text!).app).toBe(BACKUP_APP)
  })

  it("validate accepts this app's backup and refuses others and junk", () => {
    const side = makeLocalSide(localStorage)
    localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot([])))
    expect(side.validate(makeBackup(localStorage, new Date(0))!)).toBe(true)
    expect(side.validate("junk")).toBe(false)
    expect(side.validate(JSON.stringify({ app: "someone-else", version: 1, snapshot: snapshot([]) }))).toBe(false)
  })

  it("apply replaces the saved data and returns a revision that moved, so other tabs go stale", () => {
    const side = makeLocalSide(localStorage)
    localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(snapshot([])))
    const text = makeBackup(localStorage, new Date(0))!
    const before = readMeta(localStorage, "study-dungeon").revision
    const incoming = JSON.stringify({ ...JSON.parse(text), snapshot: snapshot([]) })
    const { revision } = side.apply(incoming)
    expect(revision).toBe(before + 1)
    expect(() => side.apply("junk")).toThrow()
  })
})

describe("the sync note and device id", () => {
  it("roundtrips, and treats junk as no note", () => {
    const store = makeStateStore(localStorage)
    expect(store.get()).toBeNull()
    store.set({ remoteRevision: 3, localRevision: 9 })
    expect(store.get()).toEqual({ remoteRevision: 3, localRevision: 9 })
    localStorage.setItem(SYNC_STATE_KEY, '{"remoteRevision":"x"}')
    expect(store.get()).toBeNull()
    localStorage.setItem(SYNC_STATE_KEY, "{not json")
    expect(store.get()).toBeNull()
    store.set({ remoteRevision: 1, localRevision: 1 })
    store.set(null)
    expect(localStorage.getItem(SYNC_STATE_KEY)).toBeNull()
  })

  it("Reset all data clears the note but keeps the device id", () => {
    expect(RESET_KEYS).toContain(SYNC_STATE_KEY)
    expect(RESET_KEYS).not.toContain(SYNC_DEVICE_KEY)
  })

  it("the device id is made once and kept", () => {
    const first = deviceId(localStorage)
    expect(first.length).toBeGreaterThan(10)
    expect(deviceId(localStorage)).toBe(first)
  })
})

describe("returnedFromSignInLink", () => {
  it("recognises the one-time code, tokens and an error in the address, and nothing else", () => {
    expect(returnedFromSignInLink({ search: "?code=abc123", hash: "" })).toBe(true)
    expect(returnedFromSignInLink({ search: "?x=1&code=abc", hash: "" })).toBe(true)
    expect(returnedFromSignInLink({ search: "", hash: "#access_token=t&type=magiclink" })).toBe(true)
    expect(returnedFromSignInLink({ search: "", hash: "#error_description=expired" })).toBe(true)
    expect(returnedFromSignInLink({ search: "", hash: "" })).toBe(false)
    expect(returnedFromSignInLink({ search: "?encode=1", hash: "#decode=2" })).toBe(false)
  })
})

describe("browserPushParts", () => {
  it("takes the server key from the build's env, and null when it is missing or empty", () => {
    expect(browserPushParts({ VITE_VAPID_PUBLIC_KEY: "BKEY" }).vapidPublicKey).toBe("BKEY")
    expect(browserPushParts({}).vapidPublicKey).toBeNull()
    expect(browserPushParts({ VITE_VAPID_PUBLIC_KEY: "" }).vapidPublicKey).toBeNull()
  })

  it("has no push manager where there is no service worker (a dev build), instead of waiting for one", async () => {
    expect(await browserPushParts({}).manager()).toBeNull()
    const getRegistration = async () => undefined
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration } })
    expect(await browserPushParts({}).manager()).toBeNull()
    Reflect.deleteProperty(navigator, "serviceWorker")
  })

  it("hands over the registration's push manager when there is one", async () => {
    const pushManager = { marker: true }
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => ({ pushManager }) } })
    expect(await browserPushParts({}).manager()).toBe(pushManager)
    Reflect.deleteProperty(navigator, "serviceWorker")
  })

  it("reports the notification permission, or unsupported without the API", () => {
    const parts = browserPushParts({})
    expect(parts.permission.get()).toBe("unsupported") // jsdom has no Notification
  })
})
