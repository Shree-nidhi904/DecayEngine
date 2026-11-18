// Shared fixtures for the dialog tests: a real DecayEngine on InMemoryAdapter
// with ids chosen by the test, and fixed times. Never the real clock.

import { DecayEngine, InMemoryAdapter } from "@decay-engine/engine"
import {
  DAY_MS,
  studyDungeonPolicy,
  type Fact,
  type FactPayload,
  type FactPolicyData,
  type Knowledge,
  type ReviewEvent,
} from "../policy"

export const T0 = Date.UTC(2026, 9, 1) // 1 Oct 2026 00:00 UTC, fixed
export const day = (n: number) => T0 + n * DAY_MS

export type TestEngine = DecayEngine<FactPayload, FactPolicyData, ReviewEvent>

/** An engine whose ids are taken from a queue, in addItem order. */
export function makeEngine() {
  const queue: string[] = []
  const engine: TestEngine = new DecayEngine<FactPayload, FactPolicyData, ReviewEvent>(
    studyDungeonPolicy,
    new InMemoryAdapter(),
    () => {
      const id = queue.shift()
      if (id === undefined) throw new Error("test bug: no id queued")
      return id
    }
  )
  /** Queues the next id; for tests that add facts through a dialog. */
  const nextId = (id: string) => queue.push(id)
  const add = (
    id: string,
    knowledge: Knowledge,
    at: number,
    extra: { question?: string; answer?: string; why?: string; importance?: number; costMinutes?: number } = {}
  ) => {
    queue.push(id)
    return engine.addItem(
      {
        payload: {
          question: extra.question ?? `Question ${id}`,
          answer: extra.answer ?? `Answer ${id}`,
          why: extra.why ?? "",
          knowledge,
        },
        importance: extra.importance ?? 2,
        costMinutes: extra.costMinutes ?? 2,
      },
      at
    )
  }
  /** The fact as engine.view(at) shows it; fails the test if it is missing. */
  const viewOf = (id: string, at: number): Fact => {
    const fact = engine.view(at).find((f) => f.id === id)
    if (fact === undefined) throw new Error(`test bug: no fact ${id}`)
    return fact
  }
  return { engine, add, nextId, viewOf }
}
