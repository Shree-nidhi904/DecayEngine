// Decides what a sync should do, from three facts: did this device change
// since the last sync, did the cloud change since the last sync, and is there
// anything on either side. Pure.

import type { SyncState } from "./types"

export type SyncPlan = "noop" | "push" | "pull" | "conflict"

export interface PlanInput {
  /** The local revision now (@decay-engine/persist meta). */
  localRevision: number
  localHasData: boolean
  /** Null on a device that has never synced. */
  state: SyncState | null
  /** The cloud's current revision, or null when it holds nothing. */
  remoteRevision: number | null
}

export function planSync({ localRevision, localHasData, state, remoteRevision }: PlanInput): SyncPlan {
  if (remoteRevision === null) return localHasData ? "push" : "noop"
  if (state === null) {
    // First sync here. With nothing local, just take the cloud's data; with data on
    // both sides, only the user can say which wins.
    return localHasData ? "conflict" : "pull"
  }
  const localChanged = localRevision !== state.localRevision
  const remoteChanged = remoteRevision !== state.remoteRevision
  if (localChanged && remoteChanged) return "conflict"
  if (localChanged) return "push"
  if (remoteChanged) return "pull"
  return "noop"
}
