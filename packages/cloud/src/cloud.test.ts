import fc from "fast-check"
import { describe, expect, it, vi } from "vitest"
import type { StoredSnapshot } from "@decay-engine/engine"
import { createSyncController, startAutoSync, syncNotices, type AutoSyncTarget } from "./controller"
import { decryptText, encryptText } from "./crypto"
import { mergeBackups, mergeSnapshots } from "./merge"
import { planSync } from "./plan"
import { createSyncService } from "./sync-service"
import { backup, FakeDevice, FakeServer, fakeClient } from "./test/fakes"

const ITER = 1000 // PBKDF2 rounds are slow on purpose; tests use few.

function deviceService(server: FakeServer, device: FakeDevice, passphrase: string | null = null, id = "dev") {
  return createSyncService({
    client: fakeClient(server),
    app: "t",
    local: device,
    store: device,
    deviceId: id,
    getPassphrase: () => passphrase,
  })
}

describe("planSync", () => {
  const s = { localRevision: 3, remoteRevision: 5 }
  it.each([
    ["nothing anywhere", { localRevision: 0, localHasData: false, state: null, remoteRevision: null }, "noop"],
    ["data here, nothing in the cloud", { localRevision: 2, localHasData: true, state: null, remoteRevision: null }, "push"],
    ["empty device, cloud has data", { localRevision: 0, localHasData: false, state: null, remoteRevision: 4 }, "pull"],
    ["data both sides, never synced", { localRevision: 2, localHasData: true, state: null, remoteRevision: 4 }, "conflict"],
    ["nothing changed", { localRevision: 3, localHasData: true, state: s, remoteRevision: 5 }, "noop"],
    ["only here changed", { localRevision: 4, localHasData: true, state: s, remoteRevision: 5 }, "push"],
    ["only the cloud changed", { localRevision: 3, localHasData: true, state: s, remoteRevision: 6 }, "pull"],
    ["both changed", { localRevision: 4, localHasData: true, state: s, remoteRevision: 6 }, "conflict"],
    ["cloud emptied after a sync", { localRevision: 3, localHasData: true, state: s, remoteRevision: null }, "push"],
  ] as const)("%s -> %s", (_name, input, expected) => {
    expect(planSync(input)).toBe(expected)
  })
})

describe("mergeSnapshots", () => {
  const snap = (items: object[], history: object[] = []) => ({ schemaVersion: 1, items, history }) as unknown as StoredSnapshot
  it("keeps items from either side and the later lastEventAt when both have one", () => {
    const local = snap([{ id: "a", lastEventAt: 5, n: "local" }, { id: "only-local", lastEventAt: 1 }])
    const remote = snap([{ id: "a", lastEventAt: 9, n: "remote" }, { id: "only-remote", lastEventAt: 1 }])
    const merged = mergeSnapshots(local, remote)
    const byId = Object.fromEntries(merged.items.map((i) => [i.id, i]))
    expect(Object.keys(byId).sort()).toEqual(["a", "only-local", "only-remote"])
    expect((byId.a as unknown as { n: string }).n).toBe("remote")
  })

  it("on a tie keeps this device's copy", () => {
    const merged = mergeSnapshots(snap([{ id: "a", lastEventAt: 5, n: "local" }]), snap([{ id: "a", lastEventAt: 5, n: "remote" }]))
    expect((merged.items[0] as unknown as { n: string }).n).toBe("local")
  })

  it("unions history once per entry, in time order", () => {
    const e = (timestamp: number, type = "died") => ({ type, itemId: "a", timestamp, health: 0 })
    const merged = mergeSnapshots(snap([], [e(30), e(10)]), snap([], [e(20), e(10)]))
    expect(merged.history.map((h) => h.timestamp)).toEqual([10, 20, 30])
  })

  it("property: merging is idempotent and never loses an item id", () => {
    const items = fc.array(fc.record({ id: fc.constantFrom("a", "b", "c", "d"), lastEventAt: fc.nat(100) }), { maxLength: 6 })
    fc.assert(
      fc.property(items, items, (l, r) => {
        const dedupe = (xs: typeof l) => [...new Map(xs.map((x) => [x.id, x])).values()]
        const a = snap(dedupe(l))
        const b = snap(dedupe(r))
        const m = mergeSnapshots(a, b)
        expect(new Set(m.items.map((i) => i.id))).toEqual(new Set([...a.items, ...b.items].map((i) => i.id)))
        expect(mergeSnapshots(m, m)).toEqual(m)
      })
    )
  })

  it("mergeBackups keeps this device's wrapper and refuses unreadable or foreign files", () => {
    const out = JSON.parse(mergeBackups(backup([{ id: "a", lastEventAt: 1 }]), backup([{ id: "b", lastEventAt: 1 }]))!)
    expect(out.app).toBe("t")
    expect(out.snapshot.items).toHaveLength(2)
    expect(mergeBackups("nope", backup([]))).toBeNull()
    expect(mergeBackups(backup([]), JSON.stringify({ app: "other", snapshot: { items: [], history: [] } }))).toBeNull()
  })
})

describe("crypto", () => {
  it("roundtrips text, and each encryption differs (random salt and iv)", async () => {
    const a = await encryptText("héllo 👻", "pass", ITER)
    const b = await encryptText("héllo 👻", "pass", ITER)
    expect(a).not.toBe(b)
    expect(await decryptText(a, "pass")).toBe("héllo 👻")
  })

  it("does not contain the plaintext", async () => {
    expect(await encryptText("secret-name-Mira", "pass", ITER)).not.toContain("Mira")
  })

  it("a wrong passphrase is WRONG_PASSPHRASE; damaged or foreign text is BAD_ENVELOPE", async () => {
    const env = await encryptText("x", "right", ITER)
    await expect(decryptText(env, "wrong")).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" })
    const tampered = JSON.stringify({ ...JSON.parse(env), ct: "AAAA" + JSON.parse(env).ct.slice(4) })
    await expect(decryptText(tampered, "right")).rejects.toMatchObject({ code: "WRONG_PASSPHRASE" })
    await expect(decryptText("not json", "right")).rejects.toMatchObject({ code: "BAD_ENVELOPE" })
    await expect(decryptText(JSON.stringify({ v: 9 }), "right")).rejects.toMatchObject({ code: "BAD_ENVELOPE" })
  })
})

describe("sync service", () => {
  it("is signed-out without a user", async () => {
    const server = new FakeServer()
    server.user = null
    expect(await deviceService(server, new FakeDevice(backup([]))).sync()).toEqual({ kind: "signed-out" })
  })

  it("first device pushes, a second empty device pulls, then both are up to date", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    expect((await deviceService(server, a, null, "A").sync()).kind).toBe("pushed")
    expect(server.rows.get("t")!.revision).toBe(1)
    expect(server.rows.get("t")!.deviceId).toBe("A")

    const b = new FakeDevice(null)
    expect(await deviceService(server, b, null, "B").sync()).toEqual({ kind: "pulled" })
    expect(b.text).toBe(a.text)
    expect(await deviceService(server, b, null, "B").sync()).toEqual({ kind: "noop" })
    expect(await deviceService(server, a, null, "A").sync()).toEqual({ kind: "noop" })
  })

  it("a change on one device reaches the other", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    const b = new FakeDevice(null)
    await deviceService(server, a).sync()
    await deviceService(server, b).sync()
    a.edit(backup([{ id: "1", lastEventAt: 2 }, { id: "2", lastEventAt: 2 }]))
    expect((await deviceService(server, a).sync()).kind).toBe("pushed")
    expect((await deviceService(server, b).sync()).kind).toBe("pulled")
    expect(JSON.parse(b.text!).snapshot.items).toHaveLength(2)
  })

  it("data on both sides at first sync, or edits on both, is a conflict that changes nothing", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    await deviceService(server, a).sync()
    const b = new FakeDevice(backup([{ id: "2", lastEventAt: 1 }]))
    expect(await deviceService(server, b).sync()).toEqual({ kind: "conflict" })
    expect(b.applied).toEqual([])
    expect(server.rows.get("t")!.revision).toBe(1)

    const c = new FakeDevice(null)
    await deviceService(server, c).sync()
    a.edit(backup([{ id: "1", lastEventAt: 5 }]))
    c.edit(backup([{ id: "1", lastEventAt: 6 }]))
    await deviceService(server, a).sync()
    expect(await deviceService(server, c).sync()).toEqual({ kind: "conflict" })
  })

  it("resolve: keep this device pushes it; keep the cloud replaces local; merge combines and pushes", async () => {
    const make = async () => {
      const server = new FakeServer()
      const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
      await deviceService(server, a).sync()
      const b = new FakeDevice(backup([{ id: "2", lastEventAt: 1 }]))
      return { server, b }
    }
    {
      const { server, b } = await make()
      expect((await deviceService(server, b).resolve("local")).kind).toBe("pushed")
      expect(JSON.parse(server.rows.get("t")!.body).snapshot.items.map((i: { id: string }) => i.id)).toEqual(["2"])
    }
    {
      const { server, b } = await make()
      expect(await deviceService(server, b).resolve("cloud")).toEqual({ kind: "pulled" })
      expect(JSON.parse(b.text!).snapshot.items.map((i: { id: string }) => i.id)).toEqual(["1"])
    }
    {
      const { server, b } = await make()
      expect((await deviceService(server, b).resolve("merge")).kind).toBe("merged")
      const ids = (t: string) => JSON.parse(t).snapshot.items.map((i: { id: string }) => i.id).sort()
      expect(ids(b.text!)).toEqual(["1", "2"])
      expect(ids(server.rows.get("t")!.body)).toEqual(["1", "2"])
      // And the next sync from here finds nothing to do.
      expect(await deviceService(server, b).sync()).toEqual({ kind: "noop" })
    }
  })

  it("two devices pushing at once: the second is refused, not overwritten", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    const b = new FakeDevice(null)
    await deviceService(server, a).sync()
    await deviceService(server, b).sync()
    a.edit(backup([{ id: "1", lastEventAt: 2 }]))
    b.edit(backup([{ id: "1", lastEventAt: 3 }]))
    // B reads the cloud (revision 1), then A pushes first, then B's push arrives.
    const client = fakeClient(server)
    const staleRemote = await client.getSnapshot("t")
    await deviceService(server, a).sync()
    const late = await client.pushSnapshot({ app: "t", expectedRevision: staleRemote!.revision, deviceId: "B", encrypted: false, body: b.text! })
    expect(late.ok).toBe(false)
    expect(JSON.parse(server.rows.get("t")!.body).snapshot.items[0].lastEventAt).toBe(2)
  })

  describe("with a passphrase", () => {
    it("pushes ciphertext only, and another device pulls it with the same passphrase", async () => {
      const server = new FakeServer()
      const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1, note: "Mira Castell" }]))
      expect((await deviceService(server, a, "pw").sync()).kind).toBe("pushed")
      const row = server.rows.get("t")!
      expect(row.encrypted).toBe(true)
      expect(row.body).not.toContain("Mira")

      const b = new FakeDevice(null)
      expect(await deviceService(server, b, "pw").sync()).toEqual({ kind: "pulled" })
      expect(b.text).toBe(a.text)
    })

    it("is locked without the passphrase, wrong with a bad one, and never downgrades a push to plain text", async () => {
      const server = new FakeServer()
      const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
      await deviceService(server, a, "pw").sync()
      const b = new FakeDevice(null)
      expect(await deviceService(server, b, null).sync()).toEqual({ kind: "locked", wrongPassphrase: false })
      expect(await deviceService(server, b, "nope").sync()).toEqual({ kind: "locked", wrongPassphrase: true })
      expect(b.applied).toEqual([])

      a.edit(backup([{ id: "1", lastEventAt: 9 }]))
      expect(await deviceService(server, a, null).sync()).toEqual({ kind: "locked", wrongPassphrase: false })
      expect(server.rows.get("t")!.encrypted).toBe(true)
    })
  })

  it("turns a down network into an outcome, never a throw", async () => {
    const server = new FakeServer()
    server.down = true
    expect(await deviceService(server, new FakeDevice(backup([]))).sync()).toEqual({ kind: "error", message: "network down" })
  })

  it("refuses a cloud copy this version cannot read, without touching local data", async () => {
    const server = new FakeServer()
    server.rows.set("t", { revision: 1, updatedAt: "x", deviceId: "z", encrypted: false, body: "{garbage" })
    const b = new FakeDevice(null)
    const outcome = await deviceService(server, b).sync()
    expect(outcome.kind).toBe("error")
    expect(b.applied).toEqual([])
  })

  it("deleteCloud removes the rows and forgets the sync state; failure is reported", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    await deviceService(server, a).sync()
    expect(a.state).not.toBeNull()
    expect(await deviceService(server, a).deleteCloud()).toEqual({ ok: true })
    expect(server.rows.size).toBe(0)
    expect(a.state).toBeNull()
    server.down = true
    expect(await deviceService(server, a).deleteCloud()).toEqual({ ok: false, message: "network down" })
  })
})

describe("identical data on both sides", () => {
  it("is not a conflict at first sync, and a re-save of the same data does not bounce between devices", async () => {
    const server = new FakeServer()
    const same = [{ id: "1", lastEventAt: 1 }]
    const a = new FakeDevice(backup(same))
    await deviceService(server, a).sync()
    // A second device that already holds the same data: no conflict, nothing applied.
    const b = new FakeDevice(backup(same).replace('"exportedAt":"x"', '"exportedAt":"y"'))
    expect(await deviceService(server, b).sync()).toEqual({ kind: "noop" })
    expect(b.applied).toEqual([])
    expect(b.state).toEqual({ remoteRevision: 1, localRevision: b.revision })
    // B re-saves the same data (a revision bump only): still nothing to push or pull.
    b.edit(b.text!)
    expect(await deviceService(server, b).sync()).toEqual({ kind: "noop" })
    expect(server.rows.get("t")!.revision).toBe(1)
  })

  it("real differences are still seen", async () => {
    const server = new FakeServer()
    const a = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))
    await deviceService(server, a).sync()
    const b = new FakeDevice(backup([{ id: "1", lastEventAt: 2 }]))
    expect(await deviceService(server, b).sync()).toEqual({ kind: "conflict" })
  })
})

describe("controller", () => {
  function setup(server = new FakeServer(), device = new FakeDevice(backup([{ id: "1", lastEventAt: 1 }]))) {
    const client = fakeClient(server)
    const reload = vi.fn()
    let t = 5000
    const controller = createSyncController({
      client,
      service: (getPassphrase) => createSyncService({ client, app: "t", local: device, store: device, deviceId: "d", getPassphrase }),
      redirectTo: "https://app.test/",
      reload,
      now: () => (t += 1),
    })
    return { controller, client, server, device, reload }
  }

  it("start syncs quietly when signed in, and does nothing when signed out", async () => {
    const a = setup()
    await a.controller.start()
    expect(a.controller.getState()).toMatchObject({ phase: "signed-in", email: "me@example.test", busy: false })
    expect(a.server.rows.size).toBe(1)
    const out = new FakeServer()
    out.user = null
    const b = setup(out)
    await b.controller.start()
    expect(b.controller.getState().phase).toBe("signed-out")
    expect(out.rows.size).toBe(0)
  })

  it("signIn asks for a link to the redirect, and says so", async () => {
    const s = new FakeServer()
    s.user = null
    const { controller, client } = setup(s)
    await controller.signIn("  me@example.test ")
    expect(client.sentLinks).toEqual(["me@example.test -> https://app.test/"])
    expect(controller.getState()).toMatchObject({ linkSent: true, notice: { kind: "info", text: syncNotices.signInSent } })
  })

  it("a failed sign-in is a problem notice", async () => {
    const s = new FakeServer()
    s.user = null
    s.down = true
    const { controller } = setup(s)
    await controller.signIn("me@example.test")
    expect(controller.getState().notice).toEqual({ kind: "problem", text: "network down" })
  })

  it("follows sign-in and sign-out from the auth listener", async () => {
    const { controller, client } = setup()
    client.listeners.forEach((l) => l({ id: "u", email: "x@y.test" }))
    expect(controller.getState()).toMatchObject({ phase: "signed-in", email: "x@y.test" })
    await controller.signOut()
    expect(controller.getState()).toMatchObject({ phase: "signed-out", email: null })
  })

  it("surfaces a conflict, and resolving with the cloud reloads", async () => {
    const server = new FakeServer()
    const a = setup(server, new FakeDevice(backup([{ id: "1", lastEventAt: 1 }])))
    await a.controller.start()
    const b = setup(server, new FakeDevice(backup([{ id: "2", lastEventAt: 1 }])))
    await b.controller.start()
    expect(b.controller.getState()).toMatchObject({ conflict: true, notice: { text: syncNotices.conflict } })
    await b.controller.resolve("cloud")
    expect(b.reload).toHaveBeenCalledTimes(1)
    expect(b.controller.getState().conflict).toBe(false)
  })

  it("an encrypted cloud copy locks until the passphrase is given, never keeping it in storage", async () => {
    const server = new FakeServer()
    const a = setup(server)
    await a.controller.setPassphrase("pw")
    expect(a.controller.getState().encrypting).toBe(true)
    expect(server.rows.get("t")!.encrypted).toBe(true)

    const b = setup(server, new FakeDevice(null))
    await b.controller.start()
    expect(b.controller.getState()).toMatchObject({ locked: true, notice: { text: syncNotices.locked } })
    await b.controller.setPassphrase("wrong")
    expect(b.controller.getState().notice).toEqual({ kind: "problem", text: syncNotices.wrongPassphrase })
    await b.controller.setPassphrase("pw")
    expect(b.reload).toHaveBeenCalledTimes(1)
    expect(b.controller.getState().locked).toBe(false)
  })

  it("ignores a second sync while one is running", async () => {
    const { controller, server } = setup()
    const first = controller.syncNow()
    const second = controller.syncNow()
    await Promise.all([first, second])
    expect(server.rows.get("t")!.revision).toBe(1)
  })

  it("deleteCloud signs out and leaves this device's data alone", async () => {
    const { controller, device, server } = setup()
    await controller.start()
    const before = device.text
    await controller.deleteCloud()
    expect(server.deleted).toBe(true)
    expect(controller.getState()).toMatchObject({ phase: "signed-out", notice: { text: syncNotices.deleted } })
    expect(device.text).toBe(before)
  })
})

describe("startAutoSync", () => {
  function fakeTarget() {
    let onVis: () => void = () => {}
    let tick: () => void = () => {}
    let visible = true
    const target: AutoSyncTarget = {
      addEventListener: (_t, l) => void (onVis = l),
      removeEventListener: vi.fn(),
      isVisible: () => visible,
      setInterval: (l) => {
        tick = l
        return 7
      },
      clearInterval: vi.fn(),
    }
    return { target, fire: () => tick(), show: (v: boolean) => ((visible = v), onVis()) }
  }
  const stub = (state: Partial<ReturnType<ReturnType<typeof createSyncController>["getState"]>>) => {
    const syncNow = vi.fn(async () => {})
    const controller = { getState: () => ({ phase: "signed-in", busy: false, conflict: false, locked: false, ...state }), syncNow } as unknown as ReturnType<typeof createSyncController>
    return { controller, syncNow }
  }

  it("syncs on the interval and when the tab becomes visible, but not when hidden", () => {
    const { controller, syncNow } = stub({})
    const t = fakeTarget()
    startAutoSync(controller, t.target, 1000)
    t.fire()
    expect(syncNow).toHaveBeenCalledTimes(1)
    t.show(true)
    expect(syncNow).toHaveBeenCalledTimes(2)
    t.show(false)
    expect(syncNow).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["signed out", { phase: "signed-out" as const }],
    ["busy", { busy: true }],
    ["waiting on a conflict", { conflict: true }],
    ["locked", { locked: true }],
  ])("skips while %s", (_n, state) => {
    const { controller, syncNow } = stub(state)
    const t = fakeTarget()
    startAutoSync(controller, t.target)
    t.fire()
    expect(syncNow).not.toHaveBeenCalled()
  })

  it("the returned function stops it", () => {
    const { controller } = stub({})
    const t = fakeTarget()
    startAutoSync(controller, t.target)()
    expect(t.target.clearInterval).toHaveBeenCalledWith(7)
    expect(t.target.removeEventListener).toHaveBeenCalled()
  })
})
