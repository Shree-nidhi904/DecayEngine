import { describe, it, expect } from "vitest"
import { autopsy } from "../../src/autopsy"
import { bisectCrossing } from "../../src/bisection"
import { DecayEngine } from "../../src/engine"
import { DecayEngineError } from "../../src/errors"
import type { DecayEngineErrorCode } from "../../src/errors"
import { InMemoryAdapter } from "../../src/storage/memory"
import type { HistoryEntry, Item } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakeEvent, FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000

// Fake policy: weak below 50, dead below 20, 1 health per hour.
type FakeItem = Item<FakePayload, FakePolicyData>
const KILL: FakeEvent = { type: "damage", amount: 1000 }
const REVIEW: FakeEvent = { type: "boost", amount: 0 }

function makeEngine(policy = new FakePolicy()) {
  const adapter = new InMemoryAdapter()
  let n = 0
  const engine = new DecayEngine(policy, adapter, () => `item-${++n}`)
  const id = engine.addItem({ payload: { name: "Capital of Peru" }, importance: 2, costMinutes: 5 }, T0)
  return { engine, adapter, policy, id }
}

// The item as created at T0, for computing expected bisection results.
const AS_CREATED: FakeItem = {
  id: "item-1",
  payload: { name: "Capital of Peru" },
  policyData: { decayRate: 1 / HOUR },
  health: 100,
  state: "alive",
  createdAt: T0,
  lastEventAt: T0,
  timesResurrected: 0,
  importance: 2,
  costMinutes: 5,
}

function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code }))
}

describe("DecayEngine.autopsy", () => {
  describe("an item that died untended", () => {
    it("reports every fact for an item never tended and never ticked (settled in memory)", () => {
      const { engine, id } = makeEngine()
      const now = T0 + 100 * HOUR
      const policy = new FakePolicy()

      const diedAt = bisectCrossing(AS_CREATED, policy, 20, T0, now)
      const wentWeakAt = bisectCrossing(AS_CREATED, policy, 50, T0, now)
      expect(engine.autopsy(id, now)).toStrictEqual({
        createdAt: T0,
        diedAt,
        wentWeakAt,
        lifeStartedAt: T0,
        lastTend: null,
        silenceMs: diedAt - T0,
        tends: [],
        timesResurrected: 0,
        failedResurrections: 0,
      })
    })

    it("does not save the death it found", () => {
      const { engine, adapter, id } = makeEngine()
      const before = adapter.load()

      engine.autopsy(id, T0 + 100 * HOUR)
      expect(adapter.load()).toEqual(before)
      expect(engine.graveyard()).toEqual([])
      expect(engine.history(id).map((h) => h.type)).toEqual(["created"])
    })

    it("gives the same report before and after the death is ticked", () => {
      const { engine, id } = makeEngine()
      const report = engine.autopsy(id, T0 + 100 * HOUR)
      engine.tick(T0 + 100 * HOUR)
      expect(engine.autopsy(id, T0 + 200 * HOUR)).toStrictEqual(report)
    })

    it("alive straight to dead in one tick still reports wentWeakAt", () => {
      const { engine, id } = makeEngine()
      const now = T0 + 100 * HOUR
      engine.tick(now)

      expect(engine.autopsy(id, now).wentWeakAt).toBe(bisectCrossing(AS_CREATED, new FakePolicy(), 50, T0, now))
    })
  })

  describe("tends", () => {
    it("lists this life's tends with gaps, the last tend, and the silence before death", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, REVIEW, T0 + 10 * HOUR) // 90
      const second: FakeEvent = { type: "boost", amount: 5 }
      engine.tend(id, second, T0 + 30 * HOUR) // 70 + 5 = 75: weak at 55h, dead at 85h
      const report = engine.autopsy(id, T0 + 200 * HOUR)

      expect(report.tends).toEqual([
        { at: T0 + 10 * HOUR, event: REVIEW, gapBeforeMs: 10 * HOUR },
        { at: T0 + 30 * HOUR, event: second, gapBeforeMs: 20 * HOUR },
      ])
      expect(report.lastTend).toEqual({ at: T0 + 30 * HOUR, event: second })
      expect(report.silenceMs).toBe(report.diedAt - (T0 + 30 * HOUR))
      expect(report.diedAt).toBeGreaterThanOrEqual(T0 + 85 * HOUR)
      expect(report.diedAt).toBeLessThanOrEqual(T0 + 85 * HOUR + 60_000)
    })

    it("a fatal tend is the last tend, with zero silence", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, KILL, T0 + 3 * HOUR)
      const report = engine.autopsy(id, T0 + 4 * HOUR)

      expect(report).toMatchObject({
        diedAt: T0 + 3 * HOUR,
        lastTend: { at: T0 + 3 * HOUR, event: KILL },
        silenceMs: 0,
        wentWeakAt: T0 + 3 * HOUR,
      })
    })
  })

  describe("wentWeakAt", () => {
    it("is the most recent alive -> weak crossing when the item recovered and went weak again", () => {
      const { engine, id } = makeEngine()
      engine.tick(T0 + 60 * HOUR) // weak at about 50h, health 40
      engine.tend(id, { type: "boost", amount: 30 }, T0 + 60 * HOUR) // 70: alive again
      const report = engine.autopsy(id, T0 + 200 * HOUR) // weak again at 80h, dead at 110h

      expect(report.wentWeakAt).toBeGreaterThanOrEqual(T0 + 80 * HOUR)
      expect(report.wentWeakAt).toBeLessThanOrEqual(T0 + 80 * HOUR + 60_000)
    })

    it("is null for an item that was weak from creation", () => {
      const item: FakeItem = { ...AS_CREATED, health: 0, state: "dead", diedAt: T0 + 15 * HOUR, lastEventAt: T0 + 15 * HOUR }
      const history: HistoryEntry[] = [
        { type: "created", itemId: "item-1", timestamp: T0, health: 35 },
        { type: "died", itemId: "item-1", timestamp: T0 + 15 * HOUR, health: 0 },
      ]
      expect(autopsy(item, history, new FakePolicy(), T0 + 20 * HOUR).wentWeakAt).toBeNull()
    })

    it("is null when the item went weak, recovered, and died without going weak again", () => {
      const item: FakeItem = { ...AS_CREATED, health: 0, state: "dead", diedAt: T0 + 9 * HOUR, lastEventAt: T0 + 9 * HOUR }
      const history: HistoryEntry[] = [
        { type: "created", itemId: "item-1", timestamp: T0, health: 100 },
        { type: "state-changed", itemId: "item-1", timestamp: T0 + 2 * HOUR, health: 45, from: "alive", to: "weak" },
        { type: "state-changed", itemId: "item-1", timestamp: T0 + 5 * HOUR, health: 80, from: "weak", to: "alive" },
        { type: "died", itemId: "item-1", timestamp: T0 + 9 * HOUR, health: 0 },
      ]
      expect(autopsy(item, history, new FakePolicy(), T0 + 10 * HOUR).wentWeakAt).toBeNull()
    })
  })

  describe("resurrections", () => {
    it("starts this life at the most recent resurrection; earlier tends do not count", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, REVIEW, T0 + HOUR) // previous life
      engine.tend(id, KILL, T0 + 2 * HOUR) // previous life, dies
      engine.resurrect(id, REVIEW, T0 + 3 * HOUR) // health 100
      engine.tend(id, REVIEW, T0 + 4 * HOUR) // 99: weak at 53h, dead at 83h
      const report = engine.autopsy(id, T0 + 300 * HOUR)

      expect(report.lifeStartedAt).toBe(T0 + 3 * HOUR)
      expect(report.createdAt).toBe(T0)
      expect(report.timesResurrected).toBe(1)
      expect(report.tends).toEqual([{ at: T0 + 4 * HOUR, event: REVIEW, gapBeforeMs: HOUR }])
      expect(report.wentWeakAt).toBeGreaterThanOrEqual(T0 + 53 * HOUR)
      expect(report.diedAt).toBeGreaterThanOrEqual(T0 + 83 * HOUR)
    })

    it("a resurrected item that is never tended reports silence from the resurrection", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, KILL, T0 + HOUR)
      engine.resurrect(id, REVIEW, T0 + 2 * HOUR)
      const report = engine.autopsy(id, T0 + 300 * HOUR)

      expect(report.lastTend).toBeNull()
      expect(report.tends).toEqual([])
      expect(report.silenceMs).toBe(report.diedAt - (T0 + 2 * HOUR))
    })

    it("counts failed resurrections across the whole history, including after the last death", () => {
      const policy = new FakePolicy()
      const { engine, id } = makeEngine(policy)
      engine.tend(id, KILL, T0 + HOUR)
      policy.setResurrectFailure(true)
      engine.resurrect(id, REVIEW, T0 + 2 * HOUR)
      engine.resurrect(id, REVIEW, T0 + 3 * HOUR)
      policy.setResurrectFailure(false)
      engine.resurrect(id, REVIEW, T0 + 4 * HOUR)
      engine.tend(id, KILL, T0 + 5 * HOUR)
      policy.setResurrectFailure(true)
      engine.resurrect(id, REVIEW, T0 + 6 * HOUR)

      const report = engine.autopsy(id, T0 + 7 * HOUR)
      expect(report.failedResurrections).toBe(3)
      expect(report.timesResurrected).toBe(1)
      expect(report.lifeStartedAt).toBe(T0 + 4 * HOUR)
      expect(report.diedAt).toBe(T0 + 5 * HOUR)
      // Entries after the death (the failed attempt at 6h) are not part of this life
      expect(report.tends).toEqual([{ at: T0 + 5 * HOUR, event: KILL, gapBeforeMs: HOUR }])
    })

    it("tells apart a resurrection and a death recorded at the same moment", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, KILL, T0 + HOUR)
      engine.resurrect(id, REVIEW, T0 + 2 * HOUR)
      engine.tend(id, KILL, T0 + 2 * HOUR)

      expect(engine.autopsy(id, T0 + 3 * HOUR)).toMatchObject({
        lifeStartedAt: T0 + 2 * HOUR,
        diedAt: T0 + 2 * HOUR,
        tends: [{ at: T0 + 2 * HOUR, event: KILL, gapBeforeMs: 0 }],
        silenceMs: 0,
        wentWeakAt: T0 + 2 * HOUR,
      })
    })
  })

  describe("errors", () => {
    it.each([
      { label: "alive", hours: 10 },
      { label: "weak", hours: 60 },
      { label: "exactly at the dead threshold", hours: 80 },
    ])("throws AUTOPSY_REQUIRES_DEAD_ITEM for an item that is $label at now", ({ hours }) => {
      const { engine, id } = makeEngine()
      const fn = () => engine.autopsy(id, T0 + hours * HOUR)
      expectEngineError(fn, "AUTOPSY_REQUIRES_DEAD_ITEM")
      expect(fn).toThrow(/item-1/)
    })

    it("throws AUTOPSY_REQUIRES_DEAD_ITEM after a successful resurrection", () => {
      const { engine, id } = makeEngine()
      engine.tend(id, KILL, T0 + HOUR)
      engine.resurrect(id, REVIEW, T0 + 2 * HOUR)
      expectEngineError(() => engine.autopsy(id, T0 + 3 * HOUR), "AUTOPSY_REQUIRES_DEAD_ITEM")
    })

    it("throws ITEM_NOT_FOUND naming the id, and INVALID_TIMESTAMP for a bad now", () => {
      const { engine, id } = makeEngine()
      const fn = () => engine.autopsy("ghost-42", T0)
      expectEngineError(fn, "ITEM_NOT_FOUND")
      expect(fn).toThrow(/ghost-42/)
      expectEngineError(() => engine.autopsy(id, -1), "INVALID_TIMESTAMP")
    })
  })

  describe("the pure function", () => {
    it("does not change the item or history it is given", () => {
      const item = { ...AS_CREATED }
      const history: HistoryEntry[] = [{ type: "created", itemId: "item-1", timestamp: T0, health: 100 }]
      const before = JSON.parse(JSON.stringify({ item, history })) as unknown

      autopsy(item, history, new FakePolicy(), T0 + 100 * HOUR)
      expect({ item, history }).toEqual(before)
    })
  })
})
