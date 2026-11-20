// Shared test fixtures (design section 1.1): fixed times and a real
// DecayEngine with the Ghosted policy on InMemoryAdapter. Never the real clock.

import { DecayEngine, InMemoryAdapter, type IdGenerator, type StorageAdapter } from "@decay-engine/engine"
import type { GhostedEngine } from "../engine-instance"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "../policy"

/** The engine's BASE_TIME: 2023-11-14 22:13:20 UTC. */
export const T0 = 1_700_000_000_000
export const MINUTE_MS = 60_000
export const DAY_MS = 86_400_000

/** T0 plus `n` days. */
export const day = (n: number) => T0 + n * DAY_MS

/** Ids "p1", "p2", … in call order (with another prefix when given). */
export function counterIds(prefix = "p"): IdGenerator {
  let n = 0
  return () => `${prefix}${++n}`
}

/** A real Ghosted engine on the given adapter (a fresh InMemoryAdapter by default). */
export function makeEngine(adapter: StorageAdapter = new InMemoryAdapter(), ids: IdGenerator = counterIds()): GhostedEngine {
  return new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(ghostedPolicy, adapter, ids)
}
