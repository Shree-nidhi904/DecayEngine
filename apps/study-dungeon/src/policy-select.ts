// Which decay policy the app runs: the default doubling policy, or the memory
// model (policy-memory.ts). A preference saved in storage, read once when the
// engine is built; changing it reloads the page. Both policies share one data
// shape, so switching never breaks saved facts.

import type { DecayPolicy } from "@decay-engine/engine"
import { studyDungeonPolicy, type FactPayload, type FactPolicyData, type ReviewEvent } from "./policy"
import { memoryPolicy } from "./policy-memory"

export type ModelName = "doubling" | "memory"
export const MODEL_KEY = "decay-engine:study-dungeon:model"

type Reader = Pick<Storage, "getItem">
type Writer = Pick<Storage, "setItem" | "removeItem">

export function readModel(storage: Reader | undefined = safeStorage()): ModelName {
  try {
    return storage?.getItem(MODEL_KEY) === "memory" ? "memory" : "doubling"
  } catch {
    return "doubling"
  }
}

/** Saves the choice. False when storage threw. */
export function saveModel(storage: Writer, model: ModelName): boolean {
  try {
    if (model === "memory") storage.setItem(MODEL_KEY, "memory")
    else storage.removeItem(MODEL_KEY)
    return true
  } catch {
    return false
  }
}

export function policyFor(model: ModelName): DecayPolicy<FactPayload, FactPolicyData, ReviewEvent> {
  return model === "memory" ? memoryPolicy : studyDungeonPolicy
}

/** The policy chosen in storage (the doubling policy when nothing is saved). */
export function activePolicy(): DecayPolicy<FactPayload, FactPolicyData, ReviewEvent> {
  return policyFor(readModel())
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage
  } catch {
    return undefined
  }
}
