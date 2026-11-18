// The app's single DecayEngine instance.
// Source of truth: .kiro/specs/study-dungeon/requirements.md (Requirement 14)
// and design.md (Application Lifecycle).
//
// Importing this module builds the engine and loads any saved snapshot from
// localStorage under "decay-engine:study-dungeon". It does not tick; settling
// is started by useSettleTicks (see ticking.ts).

import { DecayEngine, LocalStorageAdapter, type IdGenerator } from "@decay-engine/engine"
import {
  studyDungeonPolicy,
  type FactPayload,
  type FactPolicyData,
  type ReviewEvent,
} from "./policy"

export type StudyDungeonEngine = DecayEngine<FactPayload, FactPolicyData, ReviewEvent>

export const idGenerator: IdGenerator = () => crypto.randomUUID()

export const adapter = new LocalStorageAdapter("study-dungeon")

export const engine: StudyDungeonEngine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
  studyDungeonPolicy,
  adapter,
  idGenerator
)
