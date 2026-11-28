// What the page does with the service worker and persistent storage.
//
// registerApp() runs once from main.tsx, in production builds only (a worker
// in dev would serve stale files). The hooks feed Root's update banner and
// storage line (components/UpdateBanner.tsx, components/PersistStatus.tsx).
//

import { useEffect, useState } from "react"
import {
  persistenceState,
  registerServiceWorker,
  requestPersistence,
  subscribeToUpdates,
  type PersistenceState,
} from "@decay-engine/pwa"

/** Registers the service worker. Does nothing outside a production build. */
export function registerApp(isProduction: boolean, baseUrl: string): void {
  if (!isProduction) return
  void registerServiceWorker(`${baseUrl}sw.js`)
}

/** The function that installs a waiting update and reloads, or null when none is waiting. */
export function useUpdateReady(): (() => void) | null {
  const [apply, setApply] = useState<(() => void) | null>(null)
  useEffect(() => subscribeToUpdates((fn) => setApply(() => fn)), [])
  return apply
}

/** Whether the browser keeps this app's data, plus a way to ask it to. */
export function usePersistence(): { state: PersistenceState | "unknown"; ask: () => void } {
  const [state, setState] = useState<PersistenceState | "unknown">("unknown")
  useEffect(() => {
    let live = true
    void persistenceState().then((s) => live && setState(s))
    return () => {
      live = false
    }
  }, [])
  return { state, ask: () => void requestPersistence().then(setState) }
}
