import { describe, expect, it } from "vitest"
import { serviceWorkerSource } from "./sw-source"

type Handler = (event: any) => void

/** Runs the generated worker against an in-memory Cache Storage and network. */
function boot(opts: { precache: string[]; online?: { value: boolean }; files?: Record<string, string>; version?: string }) {
  const handlers: Record<string, Handler> = {}
  const stores = new Map<string, Map<string, string>>()
  const online = opts.online ?? { value: true }
  const files = opts.files ?? {}
  const calls = { skipWaiting: 0, claim: 0, fetched: [] as string[], notifications: [] as { title: string; options: any }[], focused: 0, opened: [] as string[] }
  const windows: any[] = []
  const key = (r: any) => (typeof r === "string" ? r : r.url)
  const openCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => store.set(new URL(u, "https://x.test").href, files[u] ?? "")),
      put: async (r: any, res: any) => void store.set(new URL(key(r), "https://x.test").href, res.body),
    }
  }
  const caches = {
    open: async (n: string) => openCache(n),
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: any) => {
      for (const store of stores.values()) {
        const hit = store.get(new URL(key(r), "https://x.test").href)
        if (hit !== undefined) return { body: hit, cached: true }
      }
      return undefined
    },
  }
  const fetchFn = async (r: any) => {
    calls.fetched.push(r.url)
    if (!online.value) throw new TypeError("offline")
    const body = files[new URL(r.url).pathname] ?? "net"
    return { ok: true, body, clone: () => ({ ok: true, body }) }
  }
  const self = {
    location: { origin: "https://x.test" },
    addEventListener: (t: string, h: Handler) => void (handlers[t] = h),
    skipWaiting: () => void calls.skipWaiting++,
    registration: {
      scope: "https://x.test/",
      showNotification: async (title: string, options: any) => void calls.notifications.push({ title, options }),
    },
    clients: {
      claim: async () => void calls.claim++,
      matchAll: async () => windows,
      openWindow: async (url: string) => void calls.opened.push(url),
    },
  }
  const source = serviceWorkerSource({ version: opts.version ?? "v1", precache: opts.precache, fallback: "/" })
  new Function("self", "caches", "fetch", "Response", "URL", source)(self, caches, fetchFn, { error: () => "error" }, URL)
  const run = async (type: string, event: any) => {
    let p: Promise<any> | undefined
    handlers[type]!({ ...event, waitUntil: (x: Promise<any>) => (p = x), respondWith: (x: Promise<any>) => (p = x) })
    return p === undefined ? undefined : await p
  }
  return { run, stores, calls, online, handlers, windows }
}

const req = (path: string, extra: object = {}) => ({ url: `https://x.test${path}`, method: "GET", mode: "cors", ...extra })

describe("service worker source", () => {
  it("is valid JavaScript and names the cache for the build", () => {
    const { stores, run } = boot({ precache: ["/"], version: "abc" })
    return run("install", {}).then(() => expect([...stores.keys()]).toEqual(["decay-engine-abc"]))
  })

  it("install stores the whole precache list", async () => {
    const { run, stores } = boot({ precache: ["/", "/assets/a.js", "/assets/b.css"] })
    await run("install", {})
    expect([...stores.get("decay-engine-v1")!.keys()]).toEqual([
      "https://x.test/",
      "https://x.test/assets/a.js",
      "https://x.test/assets/b.css",
    ])
  })

  it("activate removes older decay-engine caches only, then claims pages", async () => {
    const { run, stores, calls } = boot({ precache: ["/"] })
    await run("install", {})
    stores.set("decay-engine-old", new Map())
    stores.set("someone-elses-cache", new Map())
    await run("activate", {})
    expect([...stores.keys()].sort()).toEqual(["decay-engine-v1", "someone-elses-cache"])
    expect(calls.claim).toBe(1)
  })

  it("does not take over until the page asks (SKIP_WAITING)", async () => {
    const { run, calls } = boot({ precache: ["/"] })
    await run("install", {})
    expect(calls.skipWaiting).toBe(0)
    await run("message", { data: { type: "SKIP_WAITING" } })
    expect(calls.skipWaiting).toBe(1)
    await run("message", { data: { type: "other" } })
    expect(calls.skipWaiting).toBe(1)
  })

  it("serves a page load from the network, and from the stored page when offline", async () => {
    const online = { value: true }
    const { run } = boot({ precache: ["/"], online, files: { "/": "<html>fresh</html>" } })
    await run("install", {})
    const nav = req("/", { mode: "navigate" })
    expect((await run("fetch", { request: nav })).body).toBe("<html>fresh</html>")
    online.value = false
    expect((await run("fetch", { request: nav })).body).toBe("<html>fresh</html>")
  })

  it("serves build files from the cache without touching the network", async () => {
    const { run, calls } = boot({ precache: ["/assets/a.js"], files: { "/assets/a.js": "code" } })
    await run("install", {})
    const hit = await run("fetch", { request: req("/assets/a.js") })
    expect(hit.body).toBe("code")
    expect(calls.fetched).toEqual([])
  })

  it("ignores other origins and non-GET requests", () => {
    const { handlers } = boot({ precache: ["/"] })
    let responded = false
    const event = (request: object) => ({ request, respondWith: () => void (responded = true) })
    handlers.fetch!(event({ url: "https://elsewhere.test/x.js", method: "GET", mode: "cors" }))
    handlers.fetch!(event(req("/api", { method: "POST" })))
    expect(responded).toBe(false)
  })

  it("makes no network request of its own at install or activate", async () => {
    const { run, calls } = boot({ precache: ["/", "/assets/a.js"] })
    await run("install", {})
    await run("activate", {})
    expect(calls.fetched).toEqual([])
  })
})

describe("service worker push", () => {
  const push = (data: unknown) => ({ data: { json: () => data } })

  it("shows the notification the message describes, with the app's icon", async () => {
    const { run, calls } = boot({ precache: ["/"] })
    await run("push", push({ title: "Ghosted", body: "Something changed.", tag: "ghosted-due" }))
    expect(calls.notifications).toEqual([
      {
        title: "Ghosted",
        options: {
          body: "Something changed.",
          tag: "ghosted-due",
          icon: "https://x.test/icons/icon-192.png",
          badge: "https://x.test/icons/icon-192.png",
          renotify: true,
        },
      },
    ])
  })

  it("a replacement with the same tag alerts again instead of swapping in silently", async () => {
    const { run, calls } = boot({ precache: ["/"] })
    await run("push", push({ title: "T", body: "One", tag: "same" }))
    await run("push", push({ title: "T", body: "Two", tag: "same" }))
    expect(calls.notifications.map((n) => [n.options.tag, n.options.renotify])).toEqual([["same", true], ["same", true]])
  })

  it("falls back to plain words for a message with no usable text, or text that is not JSON", async () => {
    const { run, calls } = boot({ precache: ["/"] })
    await run("push", push({ title: 5, body: null }))
    await run("push", { data: { json: () => { throw new Error("not json") } } })
    await run("push", { data: null })
    expect(calls.notifications.map((n) => n.title)).toEqual(["Decay Engine", "Decay Engine", "Decay Engine"])
    expect(calls.notifications[0]!.options.body).toBe("Open the app to take a look.")
  })

  it("shows nothing while the app is already on screen", async () => {
    const { run, calls, windows } = boot({ precache: ["/"] })
    windows.push({ visibilityState: "visible" })
    await run("push", push({ title: "T", body: "B" }))
    expect(calls.notifications).toEqual([])
    windows[0].visibilityState = "hidden"
    await run("push", push({ title: "T", body: "B" }))
    expect(calls.notifications).toHaveLength(1)
  })

  it("a click closes it and focuses an open window, or opens the app when there is none", async () => {
    const { run, calls, windows } = boot({ precache: ["/"] })
    let closed = 0
    await run("notificationclick", { notification: { close: () => void closed++ } })
    expect(closed).toBe(1)
    expect(calls.opened).toEqual(["https://x.test/"])
    let focused = 0
    windows.push({ focus: async () => void focused++ })
    await run("notificationclick", { notification: { close: () => {} } })
    expect(focused).toBe(1)
    expect(calls.opened).toHaveLength(1)
  })

  it("makes no network request", async () => {
    const { run, calls } = boot({ precache: ["/"] })
    await run("push", push({ title: "T", body: "B" }))
    await run("notificationclick", { notification: { close: () => {} } })
    expect(calls.fetched).toEqual([])
  })
})
