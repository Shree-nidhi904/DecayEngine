// The app's DecayEngine.
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirement 14)
// and design.md (Application Lifecycle).
//
// createEngine() builds the engine and loads any saved snapshot from
// localStorage under "decay-engine:study-dungeon". Loading can fail (a
// damaged snapshot, or no localStorage), so it is a function, not a value
// built at import: main.tsx calls it through createEngineSafely
// (storage-errors.ts) and shows the problem screen instead of a blank page.
// It does not tick; settling is started by useSettleTicks (see ticking.ts).

import { DecayEngine, LocalStorageAdapter, type IdGenerator } from "@decay-engine/engine"
import {
  type FactPayload,
  type FactPolicyData,
  type ReviewEvent,
} from "./policy"
import { activePolicy } from "./policy-select"

export type StudyDungeonEngine = DecayEngine<FactPayload, FactPolicyData, ReviewEvent>

export const idGenerator: IdGenerator = () => crypto.randomUUID()

/** The namespace LocalStorageAdapter stores under ("decay-engine:study-dungeon"). */
export const STORAGE_NAMESPACE = "study-dungeon"

/** Builds the engine on localStorage. Throws if the saved snapshot cannot be loaded. */
export function createEngine(): StudyDungeonEngine {
  return new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    activePolicy(),
    new LocalStorageAdapter(STORAGE_NAMESPACE),
    idGenerator
  )
}
