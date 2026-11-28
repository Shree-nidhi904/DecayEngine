// Page-side helpers: register the service worker, tell the app when an update
// is waiting, and ask the browser to keep the app's data.
//
// Everything is looked up on the injected `navigator`, so tests pass fakes.
// Nothing here runs unless the app calls it; apps call registerServiceWorker
// only in production builds.

export interface ServiceWorkerContainerLike {
  register(url: string): Promise<RegistrationLike>
  controller: unknown
  addEventListener(type: "controllerchange", listener: () => void): void
}

export interface RegistrationLike {
  waiting: { postMessage(message: unknown): void } | null
  installing: { state: string; addEventListener(type: "statechange", l: () => void): void } | null
  addEventListener(type: "updatefound", listener: () => void): void
}

type Listener = (applyUpdate: () => void) => void
const listeners = new Set<Listener>()
let pending: (() => void) | null = null

/** Calls `listener` with an `applyUpdate` function whenever an update is ready (also if one already is). */
export function subscribeToUpdates(listener: Listener): () => void {
  listeners.add(listener)
  if (pending !== null) listener(pending)
  return () => void listeners.delete(listener)
}

function announce(registration: RegistrationLike, container: ServiceWorkerContainerLike, reload: () => void): void {
  const waiting = registration.waiting
  if (waiting === null) return
  container.addEventListener("controllerchange", reload)
  pending = () => waiting.postMessage({ type: "SKIP_WAITING" })
  listeners.forEach((l) => l(pending!))
}

/**
 * Registers `swUrl`. A worker that finishes installing while another one
 * already controls the page is an update; it waits until applyUpdate runs.
 * @returns false when service workers are not supported or registration failed.
 */
export async function registerServiceWorker(
  swUrl: string,
  container: ServiceWorkerContainerLike | undefined = (globalThis.navigator as { serviceWorker?: ServiceWorkerContainerLike } | undefined)?.serviceWorker,
  reload: () => void = () => (globalThis as unknown as { location: { reload(): void } }).location.reload()
): Promise<boolean> {
  if (container === undefined) return false
  try {
    const registration = await container.register(swUrl)
    announce(registration, container, reload)
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && container.controller !== null) announce(registration, container, reload)
      })
    })
    return true
  } catch {
    return false
  }
}

export interface StorageManagerLike {
  persisted?(): Promise<boolean>
  persist?(): Promise<boolean>
}

export type PersistenceState = "persisted" | "not-persisted" | "unsupported"

/** Whether the browser has promised not to clear this site's data under storage pressure. */
export async function persistenceState(
  storage: StorageManagerLike | undefined = (globalThis.navigator as { storage?: StorageManagerLike } | undefined)?.storage
): Promise<PersistenceState> {
  if (storage?.persisted === undefined) return "unsupported"
  try {
    return (await storage.persisted()) ? "persisted" : "not-persisted"
  } catch {
    return "unsupported"
  }
}

/**
 * Asks the browser to keep the data. Call it from a click: Firefox shows a
 * prompt, and Chromium decides from how much the site is used or installed.
 */
export async function requestPersistence(
  storage: StorageManagerLike | undefined = (globalThis.navigator as { storage?: StorageManagerLike } | undefined)?.storage
): Promise<PersistenceState> {
  if (storage?.persist === undefined) return "unsupported"
  try {
    return (await storage.persist()) ? "persisted" : "not-persisted"
  } catch {
    return "unsupported"
  }
}
