import { describe, expect, it } from "vitest"
import {
  MAX_PER_RUN,
  RETRY_MS,
  payloadFor,
  sameSecret,
  sendDuePushes,
  type Deps,
  type DueRow,
  type SendResult,
  type Subscription,
} from "../../../supabase/functions/_shared/due-pushes"

const NOW = 1_800_000_000_000
const row = (user: string, app = "ghosted"): DueRow => ({ user_id: user, app, title: "Ghosted", body: "Something changed." })
const sub = (id: string): Subscription => ({ id, endpoint: `https://push.test/${id}`, p256dh: "k", auth: "a" })

function setup(opts: { due: DueRow[]; subs: Record<string, Subscription[]>; results?: Record<string, SendResult>; throwFor?: string }) {
  const log = { sent: [] as string[], payloads: [] as string[], deleted: [] as string[], finished: [] as unknown[], retried: [] as unknown[] }
  const deps: Deps = {
    now: () => NOW,
    fetchDue: async () => opts.due,
    fetchSubscriptions: async (u) => {
      if (u === opts.throwFor) throw new Error("db down")
      return opts.subs[u] ?? []
    },
    send: async (s, payload) => {
      log.sent.push(s.id)
      log.payloads.push(payload)
      return opts.results?.[s.id] ?? { ok: true }
    },
    deleteSubscription: async (id) => void log.deleted.push(id),
    finish: async (u, a, delivered, now) => void log.finished.push([u, a, delivered, now]),
    retryAt: async (u, a, at) => void log.retried.push([u, a, at]),
  }
  return { deps, log }
}

describe("sendDuePushes", () => {
  it("sends to every subscribed browser and records the delivery for the 24 hour limit", async () => {
    const { deps, log } = setup({ due: [row("u1")], subs: { u1: [sub("a"), sub("b")] } })
    expect(await sendDuePushes(deps)).toEqual({ due: 1, delivered: 1, removed: 0, retried: 0 })
    expect(log.sent).toEqual(["a", "b"])
    expect(log.finished).toEqual([["u1", "ghosted", true, NOW]])
  })

  it("the payload is only the generic title, body and a per-app tag", () => {
    expect(JSON.parse(payloadFor(row("u1")))).toEqual({ title: "Ghosted", body: "Something changed.", tag: "ghosted-due" })
    expect(Object.keys(JSON.parse(payloadFor(row("u1", "study-dungeon")))).sort()).toEqual(["body", "tag", "title"])
  })

  it("deletes subscriptions the push service says are gone, and still counts a delivery to the others", async () => {
    const { deps, log } = setup({
      due: [row("u1")],
      subs: { u1: [sub("old"), sub("ok")] },
      results: { old: { ok: false, gone: true } },
    })
    expect(await sendDuePushes(deps)).toEqual({ due: 1, delivered: 1, removed: 1, retried: 0 })
    expect(log.deleted).toEqual(["old"])
  })

  it("clears the due time, without counting a send, when nothing is subscribed or all are gone", async () => {
    const none = setup({ due: [row("u1")], subs: {} })
    expect(await sendDuePushes(none.deps)).toMatchObject({ delivered: 0, retried: 0 })
    expect(none.log.finished).toEqual([["u1", "ghosted", false, NOW]])
    const gone = setup({ due: [row("u2")], subs: { u2: [sub("x")] }, results: { x: { ok: false, gone: true } } })
    await sendDuePushes(gone.deps)
    expect(gone.log.finished).toEqual([["u2", "ghosted", false, NOW]])
    expect(gone.log.deleted).toEqual(["x"])
  })

  it("a temporary failure retries in five minutes and neither clears nor counts it", async () => {
    const { deps, log } = setup({ due: [row("u1")], subs: { u1: [sub("a")] }, results: { a: { ok: false, gone: false } } })
    expect(await sendDuePushes(deps)).toEqual({ due: 1, delivered: 0, removed: 0, retried: 1 })
    expect(log.retried).toEqual([["u1", "ghosted", NOW + RETRY_MS]])
    expect(log.finished).toEqual([])
  })

  it("one user's failure does not stop the next", async () => {
    const { deps, log } = setup({ due: [row("bad"), row("u2")], subs: { u2: [sub("z")] }, throwFor: "bad" })
    expect((await sendDuePushes(deps)).delivered).toBe(1)
    expect(log.sent).toEqual(["z"])
  })

  it("does nothing when nothing is due, and asks for a bounded batch", async () => {
    let asked = 0
    const { deps } = setup({ due: [], subs: {} })
    deps.fetchDue = async (limit) => ((asked = limit), [])
    expect(await sendDuePushes(deps)).toEqual({ due: 0, delivered: 0, removed: 0, retried: 0 })
    expect(asked).toBe(MAX_PER_RUN)
  })
})

describe("sameSecret", () => {
  it("accepts only an identical non-empty secret", () => {
    expect(sameSecret("abc123", "abc123")).toBe(true)
    expect(sameSecret("abc123", "abc124")).toBe(false)
    expect(sameSecret("abc", "abc123")).toBe(false)
    expect(sameSecret("", "")).toBe(false)
  })
})
