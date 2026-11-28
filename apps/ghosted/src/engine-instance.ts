// Copied from apps/study-dungeon/src/engine-instance.ts (Ghosted design
// section 1.3). Changed: the Ghosted policy and types, and the namespace
// "ghosted". No import from apps/study-dungeon (Req 21.1).
//
// createEngine() builds the engine and loads any saved snapshot from
// localStorage under "decay-engine:ghosted" (Req 23.1). Loading can fail (a
// damaged snapshot, or no localStorage), so it is a function, not a value
// built at import: Root calls it through createEngineSafely
// (storage-errors.ts) and shows the problem screen instead of a blank page.
// It does not tick; settling is started by useSettleTicks (see ticking.ts).

import { DecayEngine, type IdGenerator } from "@decay-engine/engine"
import { VersionedAdapter } from "@decay-engine/persist"
import { ghostedPolicy, type ContactEvent, type PersonPayload, type PersonPolicyData } from "./policy"

export type GhostedEngine = DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>

export const idGenerator: IdGenerator = () => crypto.randomUUID()

/** The namespace VersionedAdapter stores under (same key as LocalStorageAdapter would) ("decay-engine:ghosted"). */
export const STORAGE_NAMESPACE = "ghosted"

/** Builds the engine on localStorage. Throws if the saved snapshot cannot be loaded. */
export function createEngine(): GhostedEngine {
  return new DecayEngine<PersonPayload, PersonPolicyData, ContactEvent>(
    ghostedPolicy,
    new VersionedAdapter(STORAGE_NAMESPACE),
    idGenerator
  )
}
