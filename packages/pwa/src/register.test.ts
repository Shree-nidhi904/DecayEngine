import { describe, expect, it, vi } from "vitest"
import {
  persistenceState,
  registerServiceWorker,
  requestPersistence,
  subscribeToUpdates,
  type RegistrationLike,
  type ServiceWorkerContainerLike,
} from "./register"

function fakes(opts: { controller?: unknown; waiting?: boolean } = {}) {
  const postMessage = vi.fn()
  const changeListeners: (() => void)[] = []
  let updateFound: () => void = () => {}
  let stateChange: () => void = () => {}
  const installing = {
    state: "installing",
    addEventListener: (_t: "statechange", l: () => void) => void (stateChange = l),
  }
  const registration: RegistrationLike & { installing: typeof installing | null } = {
    waiting: opts.waiting ? { postMessage } : null,
    installing: null,
    addEventListener: (_t, l) => void (updateFound = l),
  }
  const container: ServiceWorkerContainerLike = {
    controller: opts.controller ?? null,
    register: vi.fn(async () => registration),
    addEventListener: (_t, l) => void changeListeners.push(l),
  }
  return {
    container,
    postMessage,
    changeListeners,
    finishInstalling() {
      registration.installing = installing
      registration.waiting = { postMessage }
      updateFound()
      installing.state = "installed"
      stateChange()
    },
  }
}

describe("registerServiceWorker", () => {
  it("returns false without service worker support, and when registration fails", async () => {
    expect(await registerServiceWorker("/sw.js", undefined)).toBe(false)
    const f = fakes()
    ;(f.container.register as any).mockRejectedValue(new Error("nope"))
    expect(await registerServiceWorker("/sw.js", f.container)).toBe(false)
  })

  it("does not announce a first install (no controller yet)", async () => {
    const f = fakes({ controller: null })
    const seen = vi.fn()
    const stop = subscribeToUpdates(seen)
    expect(await registerServiceWorker("/sw.js", f.container, vi.fn())).toBe(true)
    f.finishInstalling()
    expect(seen).not.toHaveBeenCalled()
    stop()
  })

  it("announces an update that installed while an older worker controls the page, and applying it reloads", async () => {
    const f = fakes({ controller: {} })
    const reload = vi.fn()
    const seen = vi.fn()
    const stop = subscribeToUpdates(seen)
    await registerServiceWorker("/sw.js", f.container, reload)
    f.finishInstalling()
    expect(seen).toHaveBeenCalledTimes(1)
    seen.mock.calls[0]![0]()
    expect(f.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" })
    f.changeListeners.forEach((l) => l())
    expect(reload).toHaveBeenCalledTimes(1)
    stop()
  })

  it("tells a late subscriber about an update that is already waiting", async () => {
    const f = fakes({ controller: {}, waiting: true })
    await registerServiceWorker("/sw.js", f.container, vi.fn())
    const late = vi.fn()
    const stop = subscribeToUpdates(late)
    expect(late).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe("persistence", () => {
  it("reports unsupported, persisted and not persisted", async () => {
    expect(await persistenceState(undefined)).toBe("unsupported")
    expect(await persistenceState({})).toBe("unsupported")
    expect(await persistenceState({ persisted: async () => true })).toBe("persisted")
    expect(await persistenceState({ persisted: async () => false })).toBe("not-persisted")
    expect(
      await persistenceState({
        persisted: async () => {
          throw new Error("x")
        },
      })
    ).toBe("unsupported")
  })

  it("requestPersistence maps the browser's answer", async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe("persisted")
    expect(await requestPersistence({ persist: async () => false })).toBe("not-persisted")
    expect(await requestPersistence({})).toBe("unsupported")
  })
})
