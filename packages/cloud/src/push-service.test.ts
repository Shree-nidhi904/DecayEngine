import { describe, expect, it, vi } from "vitest"
import { CLOCK_SKEW_WARNING_MS, createSyncController, syncNotices } from "./controller"
import { createPushService, urlBase64ToBytes, type PermissionValue, type PushManagerLike, type PushSubscriptionLike } from "./push-service"
import { createSyncService } from "./sync-service"
import { backup, FakeDevice, FakeServer, fakeClient } from "./test/fakes"

function fakeManager(opts: { existing?: boolean; keys?: boolean } = {}) {
  let current: PushSubscriptionLike | null = null
  const make = (): PushSubscriptionLike => ({
    endpoint: "https://push.test/endpoint-1",
    toJSON: () => ({ endpoint: "https://push.test/endpoint-1", keys: opts.keys === false ? {} : { p256dh: "P", auth: "A" } }),
    unsubscribe: vi.fn(async () => ((current = null), true)),
  })
  if (opts.existing) current = make()
  const subscribe = vi.fn(async () => (current = make()))
  const manager: PushManagerLike = { getSubscription: async () => current, subscribe }
  return { manager, subscribe, current: () => current }
}

function setup(opts: { permission?: PermissionValue | "unsupported"; request?: PermissionValue; plan?: { at: number } | null; vapid?: string | null; existing?: boolean; keys?: boolean; noManager?: boolean } = {}) {
  const server = new FakeServer()
  const client = fakeClient(server)
  const m = fakeManager({ existing: opts.existing, keys: opts.keys })
  let permission: PermissionValue | "unsupported" = opts.permission ?? "default"
  let plan = opts.plan === undefined ? { at: 5000 } : opts.plan
  const request = vi.fn(async () => {
    permission = opts.request ?? "granted"
    return permission as PermissionValue
  })
  const service = createPushService({
    client,
    app: "t",
    vapidPublicKey: opts.vapid === undefined ? "BAAA-_w" : opts.vapid,
    manager: async () => (opts.noManager ? null : m.manager),
    permission: { get: () => permission, request },
    plan: () => plan,
    text: { title: "T", body: "Something changed." },
  })
  return { service, server, m, request, setPlan: (p: { at: number } | null) => (plan = p), client }
}

describe("urlBase64ToBytes", () => {
  it("decodes base64url, with or without padding", () => {
    expect([...urlBase64ToBytes("AQID")]).toEqual([1, 2, 3])
    expect([...urlBase64ToBytes("-_8")]).toEqual([251, 255])
  })
})

describe("push service state", () => {
  it("is unsupported without a key, a worker, or a notification API", async () => {
    expect(await setup({ vapid: null }).service.state()).toBe("unsupported")
    expect(await setup({ noManager: true }).service.state()).toBe("unsupported")
    expect(await setup({ permission: "unsupported" }).service.state()).toBe("unsupported")
  })

  it("is denied when the browser blocks, off with no subscription, on with permission and a subscription", async () => {
    expect(await setup({ permission: "denied" }).service.state()).toBe("denied")
    expect(await setup({ permission: "granted" }).service.state()).toBe("off")
    expect(await setup({ permission: "granted", existing: true }).service.state()).toBe("on")
    expect(await setup({ permission: "default", existing: true }).service.state()).toBe("off")
  })
})

describe("enable", () => {
  it("asks permission, subscribes with the server key, registers the browser, and uploads the due time", async () => {
    const t = setup()
    expect(await t.service.enable()).toBe("on")
    expect(t.request).toHaveBeenCalledTimes(1)
    expect(t.m.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(t.server.subscriptions.get("https://push.test/endpoint-1")).toEqual({ app: "t", p256dh: "P", auth: "A" })
    expect(t.server.schedule.get("t")).toEqual({ notifyAt: 5000, title: "T", body: "Something changed." })
  })

  it("does not ask again once permission is granted, and reuses an existing subscription", async () => {
    const t = setup({ permission: "granted", existing: true })
    await t.service.enable()
    expect(t.request).not.toHaveBeenCalled()
    expect(t.m.subscribe).not.toHaveBeenCalled()
  })

  it("stops quietly at a refusal, registering nothing", async () => {
    const t = setup({ request: "denied" })
    expect(await t.service.enable()).toBe("denied")
    expect(t.server.subscriptions.size).toBe(0)
    const dismissed = setup({ request: "default" })
    expect(await dismissed.service.enable()).toBe("off")
    expect(dismissed.server.subscriptions.size).toBe(0)
  })

  it("does nothing when unsupported or already blocked", async () => {
    const t = setup({ vapid: null })
    expect(await t.service.enable()).toBe("unsupported")
    expect(t.request).not.toHaveBeenCalled()
    expect(await setup({ permission: "denied" }).service.enable()).toBe("denied")
  })

  it("an incomplete subscription is an error and registers nothing", async () => {
    const t = setup({ keys: false })
    await expect(t.service.enable()).rejects.toMatchObject({ code: "PUSH" })
    expect(t.server.subscriptions.size).toBe(0)
  })
})

describe("refresh", () => {
  it("does nothing while off", async () => {
    const t = setup()
    await t.service.refresh()
    expect(t.server.schedule.size).toBe(0)
  })

  it("sends a changed time once, skips an unchanged one, and clears when nothing will change", async () => {
    const t = setup({ permission: "granted", existing: true })
    const spy = vi.spyOn(t.client, "setPushSchedule")
    await t.service.refresh()
    await t.service.refresh()
    expect(spy).toHaveBeenCalledTimes(1)
    t.setPlan({ at: 9000 })
    await t.service.refresh()
    expect(spy).toHaveBeenCalledTimes(2)
    t.setPlan(null)
    await t.service.refresh()
    await t.service.refresh()
    expect(t.server.schedule.get("t")!.notifyAt).toBeNull()
  })

  it("reports when the server holds the next push, null when none, and what the server moved it to", async () => {
    const t = setup({ permission: "granted", existing: true })
    expect(t.service.scheduled()).toBeUndefined()
    await t.service.refresh()
    expect(t.service.scheduled()).toBe(5000)
    // The server's 24 hour limit may hold a push later than asked; what it says is what counts.
    const moved = setup({ permission: "granted", existing: true })
    moved.client.setPushSchedule = async () => 99_000
    await moved.service.refresh()
    expect(moved.service.scheduled()).toBe(99_000)
    t.setPlan(null)
    await t.service.refresh()
    expect(t.service.scheduled()).toBeNull()
  })

  it("the text sent names nobody and nothing", async () => {
    const t = setup({ permission: "granted", existing: true })
    await t.service.refresh()
    expect(JSON.stringify(t.server.schedule.get("t"))).not.toMatch(/Mira|Castell/)
  })
})

describe("disable", () => {
  it("unregisters this browser, unsubscribes, and clears the schedule", async () => {
    const t = setup()
    await t.service.enable()
    expect(await t.service.disable()).toBe("off")
    expect(t.server.subscriptions.size).toBe(0)
    expect(t.server.schedule.get("t")!.notifyAt).toBeNull()
    expect(t.m.current()).toBeNull()
  })
})

describe("controller with push", () => {
  function withPush(permission: PermissionValue = "default") {
    const t = setup({ permission })
    const device = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    const controller = createSyncController({
      client: t.client,
      redirectTo: "https://app.test/",
      reload: vi.fn(),
      push: t.service,
      service: (getPassphrase) => createSyncService({ client: t.client, app: "t", local: device, store: device, deviceId: "d", getPassphrase }),
    })
    return { ...t, controller }
  }

  it("start reports the push state without turning anything on", async () => {
    const t = withPush()
    await t.controller.start()
    expect(t.controller.getState().push).toBe("off")
    expect(t.server.subscriptions.size).toBe(0)
  })

  it("enablePush turns it on with the explanatory notice, and a later sync refreshes the due time", async () => {
    const t = withPush()
    await t.controller.start()
    await t.controller.enablePush()
    expect(t.controller.getState()).toMatchObject({ push: "on", pushNextAt: 5000, notice: { kind: "info", text: syncNotices.pushOn } })
    t.setPlan({ at: 777 })
    await t.controller.syncNow()
    expect(t.server.schedule.get("t")!.notifyAt).toBe(777)
  })

  it("a blocked browser gets the how-to-allow notice", async () => {
    const t = withPush("denied")
    await t.controller.start()
    await t.controller.enablePush()
    expect(t.controller.getState()).toMatchObject({ push: "denied", notice: { kind: "problem", text: syncNotices.pushDenied } })
  })

  it("a push problem never breaks a sync", async () => {
    const t = withPush("granted")
    await t.controller.start()
    t.service.refresh = async () => {
      throw new Error("boom")
    }
    await t.controller.syncNow()
    expect(t.controller.getState().notice).not.toMatchObject({ kind: "problem" })
  })

  it("signing out and deleting the cloud copy both turn notifications off first", async () => {
    const a = withPush()
    await a.controller.start()
    await a.controller.enablePush()
    await a.controller.signOut()
    expect(a.server.subscriptions.size).toBe(0)
    const b = withPush()
    await b.controller.start()
    await b.controller.enablePush()
    await b.controller.deleteCloud()
    expect(b.server.subscriptions.size).toBe(0)
  })
})

describe("clock against the server", () => {
  function clocked(deviceNow: number, serverNow: number) {
    const server = new FakeServer()
    server.now = serverNow
    const client = fakeClient(server)
    const device = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    const controller = createSyncController({
      client,
      redirectTo: "https://app.test/",
      reload: vi.fn(),
      now: () => deviceNow,
      service: (getPassphrase) => createSyncService({ client, app: "t", local: device, store: device, deviceId: "d", getPassphrase }),
    })
    return { controller, server }
  }

  it("is null before any sync", () => {
    expect(clocked(0, 0).controller.getState().clockSkewMs).toBeNull()
  })

  it("measures how far the device is ahead (positive) or behind (negative) the server", async () => {
    const ahead = clocked(1_700_000_600_000, 1_700_000_000_000)
    await ahead.controller.start()
    expect(ahead.controller.getState().clockSkewMs).toBe(600_000)
    const behind = clocked(1_700_000_000_000 - 90_000, 1_700_000_000_000)
    await behind.controller.start()
    expect(behind.controller.getState().clockSkewMs).toBe(-90_000)
  })

  it("is about zero when the clocks agree, below the warning threshold", async () => {
    const t = clocked(1_700_000_000_000, 1_700_000_000_000)
    await t.controller.start()
    expect(Math.abs(t.controller.getState().clockSkewMs!)).toBeLessThan(CLOCK_SKEW_WARNING_MS)
  })

  it("a project without the server_time function just leaves it unmeasured, and the sync still works", async () => {
    const t = clocked(1, 1)
    const client = fakeClient(t.server)
    client.serverTime = async () => {
      throw new Error("function not found")
    }
    const device = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    const controller = createSyncController({
      client,
      redirectTo: "x",
      reload: vi.fn(),
      service: (g) => createSyncService({ client, app: "t", local: device, store: device, deviceId: "d", getPassphrase: g }),
    })
    await controller.start()
    expect(controller.getState().clockSkewMs).toBeNull()
    expect(t.server.rows.size).toBe(1)
  })
})
