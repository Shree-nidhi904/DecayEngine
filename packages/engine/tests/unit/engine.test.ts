import { describe, it, expect } from "vitest"
import { DecayEngine, MAX_TIMESTAMP } from "../../src/engine"
import { DecayEngineError } from "../../src/errors"
import { bisectCrossing } from "../../src/bisection"
import type { DecayEngineErrorCode } from "../../src/errors"
import type { DecayPolicy, Item, StorageAdapter, StoredSnapshot } from "../../src/types"
import { FakePolicy } from "../fake-policy"
import type { FakeEvent, FakePayload, FakePolicyData } from "../fake-policy"

// Fixed timestamps. Tests never read the real clock.
const T0 = 1_000_000
const HOUR = 3_600_000

type FakeDecayPolicy = DecayPolicy<FakePayload, FakePolicyData, FakeEvent>

// Storage adapter that records every call, so tests can check what the engine
// loaded and whether it saved.
class RecordingAdapter implements StorageAdapter {
  loadCalls = 0
  saved: StoredSnapshot[] = []

  constructor(private readonly snapshot: unknown = null) {}

  load(): StoredSnapshot | null {
    this.loadCalls++
    return this.snapshot as StoredSnapshot | null
  }

  save(snapshot: StoredSnapshot): void {
    this.saved.push(snapshot)
  }
}

function idGenerator(): () => string {
  let n = 0
  return () => `item-${++n}`
}

// A fake policy with different thresholds: a misbehaving policy, so it is
// built from the shared fake policy rather than defined ad hoc.
function policyWithThresholds(thresholds: unknown): FakeDecayPolicy {
  const policy = new FakePolicy()
  ;(policy as unknown as { thresholds: unknown }).thresholds = thresholds
  return policy
}

function validSnapshot(): StoredSnapshot {
  return {
    schemaVersion: 1,
    items: [
      {
        id: "fact-a",
        payload: { name: "Capital of Peru" },
        policyData: { decayRate: 1 / HOUR },
        health: 90,
        state: "alive",
        createdAt: T0,
        lastEventAt: T0 + HOUR,
        timesResurrected: 0,
        importance: 2,
        costMinutes: 5,
      },
    ],
    history: [{ type: "created", itemId: "fact-a", timestamp: T0, health: 100 }],
  }
}

function expectEngineError(fn: () => unknown, code: DecayEngineErrorCode): void {
  expect(fn).toThrow(DecayEngineError)
  expect(fn).toThrow(expect.objectContaining({ code, name: "DecayEngineError" }))
}

describe("DecayEngine constructor", () => {
  describe("valid inputs", () => {
    it("creates an engine and loads from the adapter exactly once", () => {
      const adapter = new RecordingAdapter(validSnapshot())
      const engine = new DecayEngine(new FakePolicy(), adapter, idGenerator())

      expect(engine).toBeInstanceOf(DecayEngine)
      expect(adapter.loadCalls).toBe(1)
    })

    it("does not save while constructing", () => {
      const adapter = new RecordingAdapter(validSnapshot())
      new DecayEngine(new FakePolicy(), adapter, idGenerator())

      expect(adapter.saved).toEqual([])
    })

    it("starts with empty state when the adapter has no snapshot", () => {
      const adapter = new RecordingAdapter(null)
      const engine = new DecayEngine(new FakePolicy(), adapter, idGenerator())

      expect(engine).toBeInstanceOf(DecayEngine)
      expect(adapter.loadCalls).toBe(1)
      expect(adapter.saved).toEqual([])
    })

    it("accepts the tightest valid thresholds (dead just above 0, weak exactly 100)", () => {
      const policy = policyWithThresholds({ weak: 100, dead: 0.001 })
      expect(() => new DecayEngine(policy, new RecordingAdapter(), idGenerator())).not.toThrow()
    })
  })

  describe("missing parameters", () => {
    it.each([null, undefined])("throws MISSING_POLICY when policy is %s", (missing) => {
      const fn = () =>
        new DecayEngine(missing as unknown as FakeDecayPolicy, new RecordingAdapter(), idGenerator())
      expectEngineError(fn, "MISSING_POLICY")
      expect(fn).toThrow(/policy/)
    })

    it.each([null, undefined])("throws MISSING_STORAGE_ADAPTER when adapter is %s", (missing) => {
      const fn = () =>
        new DecayEngine(new FakePolicy(), missing as unknown as StorageAdapter, idGenerator())
      expectEngineError(fn, "MISSING_STORAGE_ADAPTER")
      expect(fn).toThrow(/storage adapter/)
    })

    it.each([null, undefined])("throws MISSING_ID_GENERATOR when idGenerator is %s", (missing) => {
      const fn = () =>
        new DecayEngine(
          new FakePolicy(),
          new RecordingAdapter(),
          missing as unknown as () => string
        )
      expectEngineError(fn, "MISSING_ID_GENERATOR")
      expect(fn).toThrow(/id generator/)
    })

    it("checks policy before adapter before id generator", () => {
      const noAdapter = null as unknown as StorageAdapter
      const noIds = null as unknown as () => string
      expectEngineError(
        () => new DecayEngine(null as unknown as FakeDecayPolicy, noAdapter, noIds),
        "MISSING_POLICY"
      )
      expectEngineError(
        () => new DecayEngine(new FakePolicy(), noAdapter, noIds),
        "MISSING_STORAGE_ADAPTER"
      )
    })
  })

  describe("invalid thresholds", () => {
    it.each([
      { label: "dead equal to weak", thresholds: { weak: 50, dead: 50 }, message: /less than weak/ },
      { label: "dead above weak", thresholds: { weak: 40, dead: 60 }, message: /less than weak/ },
      { label: "dead of 0", thresholds: { weak: 50, dead: 0 }, message: /positive/ },
      { label: "negative dead", thresholds: { weak: 50, dead: -5 }, message: /positive/ },
      { label: "weak above 100", thresholds: { weak: 101, dead: 20 }, message: /exceed 100/ },
      { label: "NaN weak", thresholds: { weak: NaN, dead: 20 }, message: /finite/ },
      { label: "string dead", thresholds: { weak: 50, dead: "20" }, message: /finite/ },
      { label: "missing thresholds", thresholds: undefined, message: /thresholds/ },
      { label: "null thresholds", thresholds: null, message: /thresholds/ },
    ])("throws INVALID_THRESHOLDS for $label", ({ thresholds, message }) => {
      const fn = () =>
        new DecayEngine(policyWithThresholds(thresholds), new RecordingAdapter(), idGenerator())
      expectEngineError(fn, "INVALID_THRESHOLDS")
      expect(fn).toThrow(message)
    })
  })

  describe("loading a snapshot", () => {
    it("parses the loaded snapshot rather than ignoring it: invalid item data is rejected", () => {
      const snapshot = validSnapshot()
      ;(snapshot.items[0] as unknown as Record<string, unknown>).importance = 7
      const fn = () => new DecayEngine(new FakePolicy(), new RecordingAdapter(snapshot), idGenerator())

      expectEngineError(fn, "INVALID_ITEM_DATA")
      expect(fn).toThrow(/importance/)
    })

    it("rejects a snapshot with an invalid structure", () => {
      const fn = () =>
        new DecayEngine(
          new FakePolicy(),
          new RecordingAdapter({ schemaVersion: 1, items: "nope", history: [] }),
          idGenerator()
        )
      expectEngineError(fn, "INVALID_SNAPSHOT")
    })

    it.each([0, 2, 99])(
      "throws UNSUPPORTED_SCHEMA_VERSION naming found version %i and expected version 1",
      (version) => {
        const snapshot = { ...validSnapshot(), schemaVersion: version }
        const fn = () =>
          new DecayEngine(new FakePolicy(), new RecordingAdapter(snapshot), idGenerator())

        expectEngineError(fn, "UNSUPPORTED_SCHEMA_VERSION")
        expect(fn).toThrow(new RegExp(`\\b${version}\\b`))
        expect(fn).toThrow(/expected 1/)
      }
    )

    it("propagates an error thrown by adapter.load unchanged (Requirement 12.3)", () => {
      const failure = new Error("disk unreadable")
      const adapter: StorageAdapter = {
        load: () => {
          throw failure
        },
        save: () => {},
      }
      expect(() => new DecayEngine(new FakePolicy(), adapter, idGenerator())).toThrow(failure)
    })
  })
})

// ---------------------------------------------------------------------------
// addItem and view
// ---------------------------------------------------------------------------

const MINUTE = 60_000
const PAYLOAD: FakePayload = { name: "Capital of Peru" }
type FakeItem = Item<FakePayload, FakePolicyData>

// Adapter whose save can be made to fail, for atomicity tests.
class FlakyAdapter extends RecordingAdapter {
  failSave = false
  override save(snapshot: StoredSnapshot): void {
    if (this.failSave) {
      throw new Error("quota exceeded")
    }
    super.save(snapshot)
  }
}

// Records what the engine passes to init and healthAt. init returns a
// distinctive decay rate so the test can see it was stored.
class SpyPolicy extends FakePolicy {
  initCalls: Array<{ payload: FakePayload; now: number }> = []
  healthAtCalls: Array<{ item: FakeItem; now: number }> = []

  override init(payload: FakePayload, now: number): FakePolicyData {
    this.initCalls.push({ payload, now })
    return { decayRate: 2 / HOUR }
  }

  override healthAt(item: FakeItem, now: number): number {
    this.healthAtCalls.push({ item: { ...item }, now })
    return super.healthAt(item, now)
  }
}

// Misbehaving policy: healthAt always returns the given value.
class FixedHealthPolicy extends FakePolicy {
  constructor(private readonly value: unknown) {
    super()
  }
  override healthAt(): number {
    return this.value as number
  }
}

function makeEngine(policy: FakeDecayPolicy = new FakePolicy(), adapter = new FlakyAdapter()) {
  const engine = new DecayEngine(policy, adapter, idGenerator())
  return { engine, adapter }
}

function add(engine: DecayEngine<FakePayload, FakePolicyData, FakeEvent>, now = T0): string {
  return engine.addItem({ payload: PAYLOAD, importance: 2, costMinutes: 10 }, now)
}

const INVALID_NOWS: Array<[string, unknown]> = [
  ["-1", -1],
  ["NaN", NaN],
  ["Infinity", Infinity],
  ["-Infinity", -Infinity],
  ["above the maximum timestamp", MAX_TIMESTAMP + 1],
  ["undefined", undefined],
  ["null", null],
  ["a numeric string", "1000"],
]

describe("DecayEngine.addItem", () => {
  describe("creating an item", () => {
    it("creates an item with the initial values, importance and costMinutes", () => {
      const { engine } = makeEngine()
      engine.addItem({ payload: PAYLOAD, importance: 3, costMinutes: 25 }, T0)

      const [item] = engine.view(T0)
      expect(item).toStrictEqual({
        id: "item-1",
        payload: { name: "Capital of Peru" },
        policyData: { decayRate: 1 / HOUR },
        health: 100,
        state: "alive",
        createdAt: T0,
        lastEventAt: T0,
        timesResurrected: 0,
        importance: 3,
        costMinutes: 25,
      })
    })

    it("returns the generated id, a new one per item", () => {
      const { engine } = makeEngine()
      expect(add(engine)).toBe("item-1")
      expect(add(engine)).toBe("item-2")
      expect(engine.view(T0).map((i) => i.id)).toEqual(["item-1", "item-2"])
    })

    it("calls policy.init once with the payload and now, and stores what it returns", () => {
      const policy = new SpyPolicy()
      const { engine } = makeEngine(policy)
      add(engine, T0 + HOUR)

      expect(policy.initCalls).toEqual([{ payload: PAYLOAD, now: T0 + HOUR }])
      expect(engine.view(T0 + HOUR)[0]!.policyData).toEqual({ decayRate: 2 / HOUR })
    })

    it("calls policy.healthAt on a provisional item at health 100 with all timestamps at now", () => {
      const policy = new SpyPolicy()
      const { engine } = makeEngine(policy)
      add(engine, T0)

      const first = policy.healthAtCalls[0]!
      expect(first.now).toBe(T0)
      expect(first.item).toMatchObject({
        id: "item-1",
        health: 100,
        state: "alive",
        createdAt: T0,
        lastEventAt: T0,
        timesResurrected: 0,
        policyData: { decayRate: 2 / HOUR },
      })
      expect(first.item.diedAt).toBeUndefined()
    })

    it.each([
      { start: 73.5, health: 73.5, state: "alive" },
      { start: 35, health: 35, state: "weak" },
      { start: 20, health: 20, state: "weak" },
      { start: 140, health: 100, state: "alive" },
    ])("uses healthAt's starting health $start: stores $health, state $state", ({ start, health, state }) => {
      const { engine, adapter } = makeEngine(new FixedHealthPolicy(start))
      add(engine)

      const stored = adapter.saved[0]!.items[0]!
      expect(stored.health).toBe(health)
      expect(stored.state).toBe(state)
      expect(stored.diedAt).toBeUndefined()
      expect(adapter.saved[0]!.history).toEqual([
        { type: "created", itemId: "item-1", timestamp: T0, health },
      ])
    })

    it("starts dead when starting health is below the dead threshold: health 0, diedAt = createdAt", () => {
      const { engine, adapter } = makeEngine(new FixedHealthPolicy(10))
      add(engine, T0)

      const stored = adapter.saved[0]!.items[0]!
      expect(stored).toMatchObject({ health: 0, state: "dead", createdAt: T0, diedAt: T0 })
      expect(adapter.saved[0]!.history).toEqual([
        { type: "created", itemId: "item-1", timestamp: T0, health: 10 },
        { type: "died", itemId: "item-1", timestamp: T0, health: 0 },
      ])
    })

    it("persists the item and its created entry before returning, in one save", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)

      expect(adapter.saved).toHaveLength(1)
      expect(adapter.saved[0]).toEqual({
        schemaVersion: 1,
        items: [
          {
            id: "item-1",
            payload: PAYLOAD,
            policyData: { decayRate: 1 / HOUR },
            health: 100,
            state: "alive",
            createdAt: T0,
            lastEventAt: T0,
            timesResurrected: 0,
            importance: 2,
            costMinutes: 10,
          },
        ],
        history: [{ type: "created", itemId: "item-1", timestamp: T0, health: 100 }],
      })
    })

    it("each save holds every item so far (complete snapshots)", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      add(engine, T0 + HOUR)

      expect(adapter.saved).toHaveLength(2)
      expect(adapter.saved[1]!.items.map((i) => i.id)).toEqual(["item-1", "item-2"])
      expect(adapter.saved[1]!.history.map((h) => h.itemId)).toEqual(["item-1", "item-2"])
    })

    it.each([0, MAX_TIMESTAMP])("accepts now = %i", (now) => {
      const { engine } = makeEngine()
      expect(add(engine, now)).toBe("item-1")
    })

    it.each([
      [1, 1],
      [3, 600],
    ])("accepts importance %i and costMinutes %i", (importance, costMinutes) => {
      const { engine } = makeEngine()
      engine.addItem({ payload: PAYLOAD, importance, costMinutes }, T0)
      expect(engine.view(T0)[0]).toMatchObject({ importance, costMinutes })
    })
  })

  describe("invalid input", () => {
    it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s and saves nothing", (_label, now) => {
      const { engine, adapter } = makeEngine()
      const fn = () => engine.addItem({ payload: PAYLOAD, importance: 2, costMinutes: 10 }, now as number)
      expectEngineError(fn, "INVALID_TIMESTAMP")
      expect(fn).toThrow(/addItem/)
      expect(adapter.saved).toEqual([])
    })

    it.each([0, 4, 1.5, -1, NaN, "2"])("throws INVALID_IMPORTANCE for importance %s", (importance) => {
      const { engine, adapter } = makeEngine()
      const fn = () =>
        engine.addItem({ payload: PAYLOAD, importance: importance as number, costMinutes: 10 }, T0)
      expectEngineError(fn, "INVALID_IMPORTANCE")
      expect(fn).toThrow(/importance/)
      expect(adapter.saved).toEqual([])
    })

    it.each([0, -5, 601, 2.5, NaN, "10"])("throws INVALID_COST_MINUTES for costMinutes %s", (costMinutes) => {
      const { engine, adapter } = makeEngine()
      const fn = () =>
        engine.addItem({ payload: PAYLOAD, importance: 2, costMinutes: costMinutes as number }, T0)
      expectEngineError(fn, "INVALID_COST_MINUTES")
      expect(fn).toThrow(/costMinutes/)
      expect(adapter.saved).toEqual([])
    })

    it.each([
      ["an empty string", ""],
      ["a number", 42],
      ["undefined", undefined],
      ["null", null],
    ])("throws INVALID_ID when the id generator returns %s", (_label, id) => {
      const adapter = new FlakyAdapter()
      const engine = new DecayEngine(new FakePolicy(), adapter, () => id as string)
      expectEngineError(() => add(engine), "INVALID_ID")
      expect(adapter.saved).toEqual([])
    })

    it("throws DUPLICATE_ID naming the id, and keeps the first item", () => {
      const adapter = new FlakyAdapter()
      const engine = new DecayEngine(new FakePolicy(), adapter, () => "same-id")
      add(engine, T0)

      const fn = () => add(engine, T0 + HOUR)
      expectEngineError(fn, "DUPLICATE_ID")
      expect(fn).toThrow(/same-id/)
      expect(adapter.saved).toHaveLength(1)
      expect(engine.view(T0)).toHaveLength(1)
    })

    it("throws DUPLICATE_ID against items loaded from storage", () => {
      const adapter = new FlakyAdapter(validSnapshot())
      const engine = new DecayEngine(new FakePolicy(), adapter, () => "fact-a")
      expectEngineError(() => add(engine), "DUPLICATE_ID")
    })
  })

  describe("errors leave nothing behind", () => {
    it("propagates a policy.init error unchanged and stores nothing", () => {
      const failure = new Error("init exploded")
      const policy = new FakePolicy()
      policy.init = () => {
        throw failure
      }
      const { engine, adapter } = makeEngine(policy)

      expect(() => add(engine)).toThrow(failure)
      expect(adapter.saved).toEqual([])
      expect(engine.view(T0)).toEqual([])
    })

    it("propagates a policy.healthAt error unchanged and stores nothing", () => {
      const failure = new Error("healthAt exploded")
      const policy = new FakePolicy()
      policy.healthAt = () => {
        throw failure
      }
      const { engine, adapter } = makeEngine(policy)

      expect(() => add(engine)).toThrow(failure)
      expect(adapter.saved).toEqual([])
    })

    it("throws INVALID_HEALTH naming healthAt and the value when healthAt returns NaN", () => {
      const { engine, adapter } = makeEngine(new FixedHealthPolicy(NaN))
      const fn = () => add(engine)
      expectEngineError(fn, "INVALID_HEALTH")
      expect(fn).toThrow(/healthAt.*NaN/)
      expect(adapter.saved).toEqual([])
    })

    it("propagates a storage error and does not keep the item in memory", () => {
      const { engine, adapter } = makeEngine()
      adapter.failSave = true

      expect(() => add(engine, T0)).toThrow("quota exceeded")
      expect(engine.view(T0)).toEqual([])

      // The engine is still usable once storage works again.
      adapter.failSave = false
      add(engine, T0)
      expect(engine.view(T0)).toHaveLength(1)
      expect(adapter.saved[0]!.items).toHaveLength(1)
    })
  })
})

describe("DecayEngine.view", () => {
  it("returns an empty array when there are no items", () => {
    expect(makeEngine().engine.view(T0)).toEqual([])
  })

  it("computes health at the given time and settles lastEventAt to it", () => {
    const { engine } = makeEngine()
    add(engine, T0)

    const [item] = engine.view(T0 + 10 * HOUR)
    expect(item!.health).toBeCloseTo(90, 9)
    expect(item!.state).toBe("alive")
    expect(item!.lastEventAt).toBe(T0 + 10 * HOUR)
    expect(item!.createdAt).toBe(T0)
  })

  it.each([
    { hours: 49, state: "alive" },
    { hours: 50, state: "alive" },
    { hours: 51, state: "weak" },
    { hours: 79, state: "weak" },
    { hours: 81, state: "dead" },
  ])("derives state $state after $hours hours (weak 50, dead 20, 1 per hour)", ({ hours, state }) => {
    const { engine } = makeEngine()
    add(engine, T0)
    expect(engine.view(T0 + hours * HOUR)[0]!.state).toBe(state)
  })

  it("shows an item that died as dead with health 0 and the bisected diedAt", () => {
    const { engine } = makeEngine()
    add(engine, T0)

    const [item] = engine.view(T0 + 100 * HOUR)
    expect(item!.state).toBe("dead")
    expect(item!.health).toBe(0)
    // Exact death at 80h; bisection returns at most 1 minute later
    expect(item!.diedAt).toBeGreaterThanOrEqual(T0 + 80 * HOUR)
    expect(item!.diedAt).toBeLessThanOrEqual(T0 + 80 * HOUR + MINUTE)
  })

  it("shows a stored dead item unchanged at any later time", () => {
    const { engine, adapter } = makeEngine(new FixedHealthPolicy(10))
    add(engine, T0)
    const stored = adapter.saved[0]!.items[0]

    expect(engine.view(T0 + 1000 * HOUR)).toEqual([stored])
  })

  it("does not save, and does not change the stored item", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const before = JSON.parse(JSON.stringify(adapter.saved)) as StoredSnapshot[]

    engine.view(T0 + 60 * HOUR)
    engine.view(T0 + 100 * HOUR)

    expect(adapter.saved).toEqual(before)
    // Memory is unchanged too: viewing at T0 still shows the item as created
    expect(engine.view(T0)[0]).toMatchObject({ health: 100, state: "alive", lastEventAt: T0 })
    expect(engine.view(T0)[0]!.diedAt).toBeUndefined()
  })

  it("gives equal results when called repeatedly with the same time", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    add(engine, T0 + 30 * HOUR)

    const first = engine.view(T0 + 70 * HOUR)
    const second = engine.view(T0 + 70 * HOUR)
    expect(second).toStrictEqual(first)
    expect(first.map((i) => i.state)).toEqual(["weak", "alive"])
  })

  it("returns an item as stored when now is before its lastEventAt (no error)", () => {
    const { engine } = makeEngine()
    add(engine, T0 + 10 * HOUR)

    const [item] = engine.view(T0)
    expect(item).toMatchObject({ health: 100, state: "alive", lastEventAt: T0 + 10 * HOUR })
  })

  it("returns copies: changing a returned item does not change stored data", () => {
    const { engine } = makeEngine()
    add(engine, T0)

    const [item] = engine.view(T0)
    item!.health = 1
    item!.payload.name = "changed"
    item!.policyData.decayRate = 999

    expect(engine.view(T0)[0]).toMatchObject({
      health: 100,
      payload: { name: "Capital of Peru" },
      policyData: { decayRate: 1 / HOUR },
    })
  })

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
    const { engine } = makeEngine()
    add(engine, T0)
    const fn = () => engine.view(now as number)
    expectEngineError(fn, "INVALID_TIMESTAMP")
    expect(fn).toThrow(/view/)
  })
})

// ---------------------------------------------------------------------------
// tick and tend
// ---------------------------------------------------------------------------

// Items named "frozen" never decay; everything else uses the fake policy's
// 1 health per hour.
class FrozenAwarePolicy extends FakePolicy {
  override init(payload: FakePayload, now: number): FakePolicyData {
    return payload.name === "frozen" ? { decayRate: 0 } : super.init(payload, now)
  }
}

// Records the item applyEvent receives; can be set to return custom results.
class ApplyEventSpyPolicy extends FakePolicy {
  received: FakeItem[] = []
  override applyEvent(item: FakeItem, event: FakeEvent, now: number) {
    this.received.push({ ...item })
    return super.applyEvent(item, event, now)
  }
}

type FakeEngine = DecayEngine<FakePayload, FakePolicyData, FakeEvent>

function lastSaved(adapter: RecordingAdapter): StoredSnapshot {
  const snapshot = adapter.saved[adapter.saved.length - 1]
  if (snapshot === undefined) throw new Error("test setup: nothing was saved")
  return snapshot
}

function storedItem(adapter: RecordingAdapter, id = "item-1"): Item<unknown, unknown> {
  const item = lastSaved(adapter).items.find((i) => i.id === id)
  if (item === undefined) throw new Error(`test setup: ${id} not in snapshot`)
  return item
}

function storedHistory(adapter: RecordingAdapter, id = "item-1") {
  return lastSaved(adapter).history.filter((h) => h.itemId === id)
}

function addNamed(engine: FakeEngine, name: string, now = T0): string {
  return engine.addItem({ payload: { name }, importance: 2, costMinutes: 10 }, now)
}

// Stored item as created at T0 by the fake policy, for computing expected
// bisection results independently of the engine.
function itemAsCreated(overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: "item-1",
    payload: PAYLOAD,
    policyData: { decayRate: 1 / HOUR },
    health: 100,
    state: "alive",
    createdAt: T0,
    lastEventAt: T0,
    timesResurrected: 0,
    importance: 2,
    costMinutes: 10,
    ...overrides,
  }
}

describe("DecayEngine.tick", () => {
  it("returns the number of changed items and sets their lastEventAt to now", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    add(engine, T0)

    expect(engine.tick(T0 + 10 * HOUR)).toBe(2)
    for (const id of ["item-1", "item-2"]) {
      const item = storedItem(adapter, id)
      expect(item.lastEventAt).toBe(T0 + 10 * HOUR)
      expect(item.health).toBeCloseTo(90, 9)
      expect(item.state).toBe("alive")
    }
  })

  it("does not change or count items whose health and state are unchanged", () => {
    const { engine, adapter } = makeEngine(new FrozenAwarePolicy())
    addNamed(engine, "frozen", T0)
    addNamed(engine, "decaying", T0)

    expect(engine.tick(T0 + 10 * HOUR)).toBe(1)
    expect(storedItem(adapter, "item-1")).toMatchObject({ health: 100, lastEventAt: T0 })
    expect(storedItem(adapter, "item-2").lastEventAt).toBe(T0 + 10 * HOUR)
  })

  it("saves nothing and returns 0 when nothing changed", () => {
    const { engine, adapter } = makeEngine(new FrozenAwarePolicy())
    addNamed(engine, "frozen", T0)
    const saves = adapter.saved.length

    expect(engine.tick(T0 + 10 * HOUR)).toBe(0)
    expect(adapter.saved).toHaveLength(saves)
  })

  it("returns 0 for an empty engine", () => {
    expect(makeEngine().engine.tick(T0)).toBe(0)
  })

  it("persists the changed items in one complete snapshot", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    add(engine, T0)
    const saves = adapter.saved.length

    engine.tick(T0 + 10 * HOUR)
    expect(adapter.saved).toHaveLength(saves + 1)
    expect(lastSaved(adapter).items.map((i) => i.id)).toEqual(["item-1", "item-2"])
  })

  it("records an alive -> weak change at the bisected weak crossing, not at now", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const now = T0 + 60 * HOUR

    expect(engine.tick(now)).toBe(1)
    const expectedAt = bisectCrossing(itemAsCreated(), new FakePolicy(), 50, T0, now)
    const history = storedHistory(adapter)
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({ type: "state-changed", from: "alive", to: "weak", timestamp: expectedAt })
    expect(history[1]!.health).toBeCloseTo(40, 9)
    // Exact crossing is at 50h; bisection lands at most 1 minute later
    expect(expectedAt).toBeGreaterThanOrEqual(T0 + 50 * HOUR)
    expect(expectedAt).toBeLessThanOrEqual(T0 + 50 * HOUR + MINUTE)
    expect(storedItem(adapter).state).toBe("weak")
  })

  it("records a death with the bisected diedAt between lastEventAt and now", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const now = T0 + 100 * HOUR

    engine.tick(now)
    const item = storedItem(adapter)
    const expectedDiedAt = bisectCrossing(itemAsCreated(), new FakePolicy(), 20, T0, now)

    expect(item).toMatchObject({ state: "dead", health: 0, lastEventAt: now, diedAt: expectedDiedAt })
    expect(item.diedAt).toBeGreaterThan(T0)
    expect(item.diedAt).toBeLessThan(now)
    expect(item.diedAt).toBeGreaterThanOrEqual(T0 + 80 * HOUR)
    expect(item.diedAt).toBeLessThanOrEqual(T0 + 80 * HOUR + MINUTE)
  })

  it("alive -> dead in one tick records the weak crossing, then the death, both bisected", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const now = T0 + 100 * HOUR
    engine.tick(now)

    const policy = new FakePolicy()
    expect(storedHistory(adapter)).toEqual([
      { type: "created", itemId: "item-1", timestamp: T0, health: 100 },
      {
        type: "state-changed",
        itemId: "item-1",
        timestamp: bisectCrossing(itemAsCreated(), policy, 50, T0, now),
        health: 50,
        from: "alive",
        to: "weak",
      },
      {
        type: "died",
        itemId: "item-1",
        timestamp: bisectCrossing(itemAsCreated(), policy, 20, T0, now),
        health: 0,
      },
    ])
  })

  it("weak -> dead over two ticks: bisection starts from the second tick's lastEventAt", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    engine.tick(T0 + 60 * HOUR)
    const weakItem = storedItem(adapter) as FakeItem

    engine.tick(T0 + 100 * HOUR)
    const history = storedHistory(adapter)
    expect(history.map((h) => h.type)).toEqual(["created", "state-changed", "died"])
    expect(history[2]!.timestamp).toBe(
      bisectCrossing(weakItem, new FakePolicy(), 20, T0 + 60 * HOUR, T0 + 100 * HOUR)
    )
    expect(history[2]!.timestamp).toBeGreaterThan(T0 + 60 * HOUR)
  })

  it("is idempotent: a second tick at the same time changes nothing and saves nothing", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    add(engine, T0 + HOUR)

    expect(engine.tick(T0 + 100 * HOUR)).toBe(2)
    const saves = adapter.saved.length
    const snapshot = JSON.parse(JSON.stringify(lastSaved(adapter))) as StoredSnapshot

    expect(engine.tick(T0 + 100 * HOUR)).toBe(0)
    expect(adapter.saved).toHaveLength(saves)
    expect(lastSaved(adapter)).toEqual(snapshot)
  })

  it("does not count dead items", () => {
    const { engine } = makeEngine(new FixedHealthPolicy(10))
    add(engine, T0)
    expect(engine.tick(T0 + 1000 * HOUR)).toBe(0)
  })

  it("throws TIME_WENT_BACKWARD naming both times and the item, and changes nothing", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0) // would change if ticked
    add(engine, T0 + 10 * HOUR)
    const saves = adapter.saved.length
    const now = T0 + 5 * HOUR

    const fn = () => engine.tick(now)
    expectEngineError(fn, "TIME_WENT_BACKWARD")
    expect(fn).toThrow(`now=${now} < lastEventAt=${T0 + 10 * HOUR} for item item-2`)
    expect(adapter.saved).toHaveLength(saves)
    // item-1 was not advanced in memory either
    expect(engine.view(T0)[0]!.lastEventAt).toBe(T0)
  })

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
    const { engine } = makeEngine()
    add(engine, T0)
    const fn = () => engine.tick(now as number)
    expectEngineError(fn, "INVALID_TIMESTAMP")
    expect(fn).toThrow(/tick/)
  })

  it("propagates a storage error and keeps the pre-tick state in memory and storage", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const before = JSON.parse(JSON.stringify(adapter.saved)) as StoredSnapshot[]
    adapter.failSave = true

    expect(() => engine.tick(T0 + 100 * HOUR)).toThrow("quota exceeded")
    expect(adapter.saved).toEqual(before)
    expect(engine.view(T0)[0]).toMatchObject({ state: "alive", lastEventAt: T0 })

    // Memory was not advanced, so the same tick still has work to do
    adapter.failSave = false
    expect(engine.tick(T0 + 100 * HOUR)).toBe(1)
  })
})

describe("DecayEngine.tend", () => {
  describe("applying an event", () => {
    it("settles first: applyEvent receives the settled item, not the stored one", () => {
      const policy = new ApplyEventSpyPolicy()
      const { engine } = makeEngine(policy)
      add(engine, T0)

      engine.tend("item-1", { type: "boost", amount: 5 }, T0 + 10 * HOUR)
      expect(policy.received).toHaveLength(1)
      expect(policy.received[0]!.health).toBeCloseTo(90, 9)
      expect(policy.received[0]!.lastEventAt).toBe(T0 + 10 * HOUR)
    })

    it("stores the health and policyData returned by applyEvent", () => {
      const policy = new FakePolicy()
      policy.applyEvent = () => ({ health: 77, policyData: { decayRate: 3 / HOUR } })
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)

      engine.tend("item-1", { type: "boost", amount: 0 }, T0 + HOUR)
      expect(storedItem(adapter)).toMatchObject({ health: 77, policyData: { decayRate: 3 / HOUR } })
    })

    it("sets lastEventAt to now and keeps the other fields", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.tend("item-1", { type: "boost", amount: 5 }, T0 + 10 * HOUR)

      const item = storedItem(adapter)
      expect(item).toMatchObject({
        id: "item-1",
        state: "alive",
        createdAt: T0,
        lastEventAt: T0 + 10 * HOUR,
        timesResurrected: 0,
        importance: 2,
        costMinutes: 10,
      })
      expect(item.health).toBeCloseTo(95, 9)
    })

    it("records a tended entry with the event, now and the resulting health", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const event: FakeEvent = { type: "boost", amount: 5 }
      engine.tend("item-1", event, T0 + 10 * HOUR)

      const history = storedHistory(adapter)
      expect(history).toHaveLength(2)
      expect(history[1]).toMatchObject({
        type: "tended",
        itemId: "item-1",
        timestamp: T0 + 10 * HOUR,
        event: { type: "boost", amount: 5 },
      })
      expect(history[1]!.health).toBeCloseTo(95, 9)
    })

    it("each tend is saved once", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const saves = adapter.saved.length
      engine.tend("item-1", { type: "boost", amount: 5 }, T0 + HOUR)
      expect(adapter.saved).toHaveLength(saves + 1)
    })
  })

  describe("state transitions", () => {
    it("an event that makes the item weak records state-changed at now, after tended", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.tend("item-1", { type: "damage", amount: 60 }, T0)

      expect(storedItem(adapter)).toMatchObject({ health: 40, state: "weak" })
      expect(storedHistory(adapter).slice(1)).toEqual([
        { type: "tended", itemId: "item-1", timestamp: T0, health: 40, event: { type: "damage", amount: 60 } },
        { type: "state-changed", itemId: "item-1", timestamp: T0, health: 40, from: "alive", to: "weak" },
      ])
    })

    it("an event that brings a weak item back records weak -> alive at now", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.tick(T0 + 60 * HOUR) // weak at about 40
      engine.tend("item-1", { type: "boost", amount: 30 }, T0 + 60 * HOUR)

      const item = storedItem(adapter)
      expect(item.state).toBe("alive")
      expect(item.health).toBeCloseTo(70, 9)
      const last = storedHistory(adapter).at(-1)!
      expect(last).toMatchObject({ type: "state-changed", from: "weak", to: "alive", timestamp: T0 + 60 * HOUR })
    })

    it("decay found while settling is recorded first, at its bisected time, then the tend", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const now = T0 + 60 * HOUR
      engine.tend("item-1", { type: "boost", amount: 30 }, now)

      const history = storedHistory(adapter)
      expect(history.map((h) => h.type)).toEqual(["created", "state-changed", "tended", "state-changed"])
      expect(history[1]).toMatchObject({
        from: "alive",
        to: "weak",
        timestamp: bisectCrossing(itemAsCreated(), new FakePolicy(), 50, T0, now),
      })
      expect(history[3]).toMatchObject({ from: "weak", to: "alive", timestamp: now })
      // Sorted by time
      const times = history.map((h) => h.timestamp)
      expect(times).toEqual([...times].sort((a, b) => a - b))
    })

    it("an event that kills the item sets dead, health 0, diedAt = now and records died", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const now = T0 + HOUR
      engine.tend("item-1", { type: "damage", amount: 90 }, now)

      expect(storedItem(adapter)).toMatchObject({ state: "dead", health: 0, diedAt: now, lastEventAt: now })
      expect(storedHistory(adapter).slice(1)).toEqual([
        { type: "tended", itemId: "item-1", timestamp: now, health: 0, event: { type: "damage", amount: 90 } },
        { type: "state-changed", itemId: "item-1", timestamp: now, health: 50, from: "alive", to: "weak" },
        { type: "died", itemId: "item-1", timestamp: now, health: 0 },
      ])
    })
  })

  describe("dead items", () => {
    it("if the item died while untended, saves the death and then throws ITEM_ALREADY_DEAD", () => {
      const policy = new ApplyEventSpyPolicy()
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const saves = adapter.saved.length
      const now = T0 + 100 * HOUR

      const fn = () => engine.tend("item-1", { type: "boost", amount: 50 }, now)
      expectEngineError(fn, "ITEM_ALREADY_DEAD")
      expect(fn).toThrow(/item-1/)

      // The death was saved once (the second call finds a stored dead item)
      expect(adapter.saved).toHaveLength(saves + 1)
      expect(storedItem(adapter)).toMatchObject({
        state: "dead",
        health: 0,
        lastEventAt: now,
        diedAt: bisectCrossing(itemAsCreated(), new FakePolicy(), 20, T0, now),
      })
      expect(storedHistory(adapter).map((h) => h.type)).toEqual(["created", "state-changed", "died"])
      // The event was never applied
      expect(policy.received).toEqual([])
    })

    it("throws ITEM_ALREADY_DEAD for an item already stored dead, and saves nothing", () => {
      const { engine, adapter } = makeEngine(new FixedHealthPolicy(10))
      add(engine, T0)
      const saves = adapter.saved.length

      expectEngineError(() => engine.tend("item-1", { type: "boost", amount: 50 }, T0 + HOUR), "ITEM_ALREADY_DEAD")
      expect(adapter.saved).toHaveLength(saves)
    })
  })

  describe("health from applyEvent", () => {
    it("clamps health above 100 to 100", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.tend("item-1", { type: "boost", amount: 500 }, T0 + HOUR)
      expect(storedItem(adapter)).toMatchObject({ health: 100, state: "alive" })
    })

    it("clamps health below 0 to 0 (and the item dies)", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.tend("item-1", { type: "damage", amount: 1000 }, T0 + HOUR)
      expect(storedItem(adapter)).toMatchObject({ health: 0, state: "dead" })
      expect(storedHistory(adapter).find((h) => h.type === "tended")!.health).toBe(0)
    })

    it.each([
      ["NaN", { health: NaN, policyData: { decayRate: 0 } }, /applyEvent.*NaN/],
      ["a string", { health: "high", policyData: { decayRate: 0 } }, /applyEvent.*high/],
      ["no health", { policyData: { decayRate: 0 } }, /applyEvent.*undefined/],
      ["undefined instead of a result", undefined, /applyEvent.*undefined/],
    ])("throws INVALID_HEALTH naming applyEvent when it returns %s, and saves nothing", (_label, result, message) => {
      const policy = new FakePolicy()
      policy.applyEvent = () => result as unknown as { health: number; policyData: FakePolicyData }
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const saves = adapter.saved.length

      const fn = () => engine.tend("item-1", { type: "boost", amount: 1 }, T0 + HOUR)
      expectEngineError(fn, "INVALID_HEALTH")
      expect(fn).toThrow(message)
      expect(adapter.saved).toHaveLength(saves)
    })
  })

  describe("errors", () => {
    it("throws TIME_WENT_BACKWARD naming both times, and saves nothing", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0 + 10 * HOUR)
      const saves = adapter.saved.length

      const fn = () => engine.tend("item-1", { type: "boost", amount: 1 }, T0)
      expectEngineError(fn, "TIME_WENT_BACKWARD")
      expect(fn).toThrow(`now=${T0} < lastEventAt=${T0 + 10 * HOUR} for item item-1`)
      expect(adapter.saved).toHaveLength(saves)
    })

    it("throws ITEM_NOT_FOUND naming the unknown id", () => {
      const { engine } = makeEngine()
      add(engine, T0)
      const fn = () => engine.tend("ghost-42", { type: "boost", amount: 1 }, T0)
      expectEngineError(fn, "ITEM_NOT_FOUND")
      expect(fn).toThrow(/ghost-42/)
    })

    it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
      const { engine } = makeEngine()
      add(engine, T0)
      expectEngineError(() => engine.tend("item-1", { type: "boost", amount: 1 }, now as number), "INVALID_TIMESTAMP")
    })

    it("propagates an applyEvent error unchanged and saves nothing", () => {
      const failure = new Error("bad answer format")
      const policy = new FakePolicy()
      policy.applyEvent = () => {
        throw failure
      }
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const saves = adapter.saved.length

      expect(() => engine.tend("item-1", { type: "boost", amount: 1 }, T0 + HOUR)).toThrow(failure)
      expect(adapter.saved).toHaveLength(saves)
    })

    it("propagates a storage error and leaves the item unchanged in memory", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      adapter.failSave = true

      expect(() => engine.tend("item-1", { type: "boost", amount: 5 }, T0 + HOUR)).toThrow("quota exceeded")
      expect(engine.view(T0)[0]).toMatchObject({ health: 100, lastEventAt: T0 })
    })
  })
})

// ---------------------------------------------------------------------------
// due, graveyard, history and remove
// ---------------------------------------------------------------------------

// Every living item is always due; makes due's own filtering and sorting visible.
class AlwaysDuePolicy extends FakePolicy {
  nextDueCalls: Array<{ item: FakeItem; now: number }> = []
  override nextDueAt(item: FakeItem, now: number): number | null {
    this.nextDueCalls.push({ item: { ...item }, now })
    return 0
  }
}

// Items named "never" are never due; others follow the fake policy.
class NeverDuePolicy extends FakePolicy {
  override nextDueAt(item: FakeItem, now: number): number | null {
    return item.payload.name === "never" ? null : super.nextDueAt(item, now)
  }
}

function idsFrom(ids: string[]): () => string {
  let n = 0
  return () => ids[n++] ?? `extra-${n}`
}

function engineWithIds(ids: string[], policy: FakeDecayPolicy = new FakePolicy()) {
  const adapter = new FlakyAdapter()
  const engine = new DecayEngine(policy, adapter, idsFrom(ids))
  return { engine, adapter }
}

const KILL: FakeEvent = { type: "damage", amount: 1000 }

describe("DecayEngine.due", () => {
  it("returns only items whose nextDueAt is at or before now (fake policy: weak items)", () => {
    const { engine } = makeEngine()
    add(engine, T0) // weak at 60h
    add(engine, T0 + 30 * HOUR) // still alive at 60h

    const due = engine.due(T0 + 60 * HOUR)
    expect(due.map((i) => i.id)).toEqual(["item-1"])
  })

  it("returns nothing when no item is due yet", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    expect(engine.due(T0 + 10 * HOUR)).toEqual([])
  })

  it("excludes items for which nextDueAt returns null", () => {
    const { engine } = makeEngine(new NeverDuePolicy())
    addNamed(engine, "never", T0)
    addNamed(engine, "sometimes", T0)

    expect(engine.due(T0 + 60 * HOUR).map((i) => i.id)).toEqual(["item-2"])
  })

  it("excludes items stored dead and items that are dead at now, even if the policy says due", () => {
    const policy = new AlwaysDuePolicy()
    const { engine } = makeEngine(policy)
    add(engine, T0) // dies at 80h by decay
    add(engine, T0)
    engine.tend("item-2", KILL, T0) // stored dead
    add(engine, T0 + 50 * HOUR) // alive at 90h

    expect(engine.due(T0 + 90 * HOUR).map((i) => i.id)).toEqual(["item-3"])
    // nextDueAt was only asked about the living item
    expect(policy.nextDueCalls.map((c) => c.item.id)).toEqual(["item-3"])
  })

  it("passes the settled item to nextDueAt and returns it with health at now", () => {
    const policy = new AlwaysDuePolicy()
    const { engine } = makeEngine(policy)
    add(engine, T0)
    const now = T0 + 60 * HOUR

    const [item] = engine.due(now)
    expect(item!.health).toBeCloseTo(40, 9)
    expect(item!.state).toBe("weak")
    expect(item!.lastEventAt).toBe(now)
    expect(policy.nextDueCalls).toHaveLength(1)
    expect(policy.nextDueCalls[0]!.now).toBe(now)
    expect(policy.nextDueCalls[0]!.item.health).toBeCloseTo(40, 9)
  })

  it("does not save or change stored items", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const before = JSON.parse(JSON.stringify(adapter.saved)) as StoredSnapshot[]

    engine.due(T0 + 60 * HOUR)
    engine.due(T0 + 90 * HOUR)
    expect(adapter.saved).toEqual(before)
    expect(engine.view(T0)[0]).toMatchObject({ health: 100, state: "alive", lastEventAt: T0 })
  })

  it("sorts by health ascending, then by id in plain lexicographic order", () => {
    const { engine } = engineWithIds(["zeta", "item-9", "item-10", "beta", "alpha"], new AlwaysDuePolicy())
    add(engine, T0) // zeta: 80 at 20h
    add(engine, T0 + 5 * HOUR) // item-9: 85
    add(engine, T0 + 5 * HOUR) // item-10: 85
    add(engine, T0 + 10 * HOUR) // beta: 90
    add(engine, T0 + 10 * HOUR) // alpha: 90

    expect(engine.due(T0 + 20 * HOUR).map((i) => i.id)).toEqual([
      "zeta",
      "item-10",
      "item-9",
      "alpha",
      "beta",
    ])
  })

  it("judges an item with lastEventAt after now on its stored health (no error)", () => {
    const { engine } = makeEngine(new AlwaysDuePolicy())
    add(engine, T0 + 10 * HOUR)

    const [item] = engine.due(T0)
    expect(item).toMatchObject({ health: 100, lastEventAt: T0 + 10 * HOUR })
  })

  it("returns copies", () => {
    const { engine } = makeEngine(new AlwaysDuePolicy())
    add(engine, T0)
    engine.due(T0)[0]!.payload.name = "changed"
    expect(engine.due(T0)[0]!.payload.name).toBe("Capital of Peru")
  })

  it.each([
    ["NaN", NaN],
    ["a string", "soon"],
    ["undefined", undefined],
  ])("throws naming nextDueAt and the value when the policy returns %s", (_label, value) => {
    const policy = new FakePolicy()
    policy.nextDueAt = () => value as unknown as number
    const { engine } = makeEngine(policy)
    add(engine, T0)

    const fn = () => engine.due(T0 + HOUR)
    expectEngineError(fn, "INVALID_TIMESTAMP")
    expect(fn).toThrow(new RegExp(`nextDueAt.*${String(value)}`))
  })

  it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
    const { engine } = makeEngine()
    add(engine, T0)
    expectEngineError(() => engine.due(now as number), "INVALID_TIMESTAMP")
  })
})

describe("DecayEngine.graveyard", () => {
  it("returns an empty array when no item is dead, and takes no arguments", () => {
    const { engine } = makeEngine()
    expect(engine.graveyard()).toEqual([])
    add(engine, T0)
    expect(engine.graveyard()).toEqual([])
  })

  it("returns only dead items", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    add(engine, T0)
    add(engine, T0)
    engine.tend("item-2", KILL, T0 + HOUR)

    const dead = engine.graveyard()
    expect(dead.map((i) => i.id)).toEqual(["item-2"])
    expect(dead[0]).toMatchObject({ state: "dead", health: 0, diedAt: T0 + HOUR })
  })

  it("sorts by diedAt, most recent first", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    add(engine, T0)
    add(engine, T0)
    engine.tend("item-1", KILL, T0 + 1 * HOUR)
    engine.tend("item-2", KILL, T0 + 3 * HOUR)
    engine.tend("item-3", KILL, T0 + 2 * HOUR)

    expect(engine.graveyard().map((i) => [i.id, i.diedAt])).toEqual([
      ["item-2", T0 + 3 * HOUR],
      ["item-3", T0 + 2 * HOUR],
      ["item-1", T0 + 1 * HOUR],
    ])
  })

  it("breaks diedAt ties by id ascending, whatever the insertion order", () => {
    const { engine } = engineWithIds(["b", "c", "a"])
    for (const id of ["b", "c", "a"]) {
      add(engine, T0)
      engine.tend(id, KILL, T0 + HOUR)
    }
    expect(engine.graveyard().map((i) => i.id)).toEqual(["a", "b", "c"])
  })

  it("includes items that died by decay once they are settled (tick)", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    // Not settled yet: storage still says alive
    expect(engine.graveyard()).toEqual([])

    engine.tick(T0 + 100 * HOUR)
    expect(engine.graveyard().map((i) => i.id)).toEqual(["item-1"])
  })

  it("returns copies and does not save", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    engine.tend("item-1", KILL, T0)
    const saves = adapter.saved.length

    engine.graveyard()[0]!.payload.name = "changed"
    expect(engine.graveyard()[0]!.payload.name).toBe("Capital of Peru")
    expect(adapter.saved).toHaveLength(saves)
  })
})

describe("DecayEngine.history", () => {
  it("returns only the created entry for an untended item", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    expect(engine.history("item-1")).toEqual([
      { type: "created", itemId: "item-1", timestamp: T0, health: 100 },
    ])
  })

  it("returns all entries for the item and none for other items", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    add(engine, T0)
    engine.tend("item-1", { type: "boost", amount: 5 }, T0 + 10 * HOUR)
    engine.tend("item-2", { type: "damage", amount: 60 }, T0 + 2 * HOUR)

    const history = engine.history("item-1")
    expect(history.map((h) => h.type)).toEqual(["created", "tended"])
    expect(history.every((h) => h.itemId === "item-1")).toBe(true)
    expect(engine.history("item-2").map((h) => h.type)).toEqual(["created", "tended", "state-changed"])
  })

  it("is sorted by timestamp ascending across several operations", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    engine.tend("item-1", { type: "boost", amount: 0 }, T0 + 10 * HOUR)
    engine.tick(T0 + 150 * HOUR)

    const times = engine.history("item-1").map((h) => h.timestamp)
    expect(times).toHaveLength(4) // created, tended, state-changed, died
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it("keeps the recorded order for entries with identical timestamps", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    engine.tend("item-1", KILL, T0)

    const history = engine.history("item-1")
    expect(history.map((h) => h.timestamp)).toEqual([T0, T0, T0, T0])
    expect(history.map((h) => h.type)).toEqual(["created", "tended", "state-changed", "died"])
  })

  it("returns history loaded from storage", () => {
    const engine = new DecayEngine(new FakePolicy(), new FlakyAdapter(validSnapshot()), idGenerator())
    expect(engine.history("fact-a")).toEqual([
      { type: "created", itemId: "fact-a", timestamp: T0, health: 100 },
    ])
  })

  it("returns a copy: changing it does not change stored history", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    engine.tend("item-1", { type: "boost", amount: 5 }, T0 + HOUR)

    const history = engine.history("item-1")
    history.push({ type: "died", itemId: "item-1", timestamp: T0, health: 0 })
    history[0]!.health = 1
    ;(history[1] as { event: FakeEvent }).event.amount = 999

    expect(engine.history("item-1")).toEqual([
      { type: "created", itemId: "item-1", timestamp: T0, health: 100 },
      expect.objectContaining({ type: "tended", event: { type: "boost", amount: 5 } }),
    ])
  })

  it("throws ITEM_NOT_FOUND naming the unknown id", () => {
    const { engine } = makeEngine()
    const fn = () => engine.history("ghost-42")
    expectEngineError(fn, "ITEM_NOT_FOUND")
    expect(fn).toThrow(/ghost-42/)
  })
})

describe("DecayEngine.remove", () => {
  it("deletes the item and its history in one save, leaving other items intact", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    add(engine, T0)
    engine.tend("item-1", { type: "boost", amount: 5 }, T0 + HOUR)
    const saves = adapter.saved.length
    const otherHistory = engine.history("item-2")

    engine.remove("item-1")

    expect(adapter.saved).toHaveLength(saves + 1)
    const snapshot = lastSaved(adapter)
    expect(snapshot.items.map((i) => i.id)).toEqual(["item-2"])
    expect(snapshot.history.some((h) => h.itemId === "item-1")).toBe(false)
    expect(engine.view(T0 + HOUR).map((i) => i.id)).toEqual(["item-2"])
    expect(engine.history("item-2")).toEqual(otherHistory)
  })

  it("throws ITEM_NOT_FOUND naming the unknown id, and saves nothing", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const saves = adapter.saved.length

    const fn = () => engine.remove("ghost-42")
    expectEngineError(fn, "ITEM_NOT_FOUND")
    expect(fn).toThrow(/ghost-42/)
    expect(adapter.saved).toHaveLength(saves)
  })

  it("a removed item cannot be used by tend, history or remove", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    engine.remove("item-1")

    expectEngineError(() => engine.tend("item-1", { type: "boost", amount: 1 }, T0 + HOUR), "ITEM_NOT_FOUND")
    expectEngineError(() => engine.history("item-1"), "ITEM_NOT_FOUND")
    expectEngineError(() => engine.remove("item-1"), "ITEM_NOT_FOUND")
    expect(engine.view(T0)).toEqual([])
    expect(engine.tick(T0 + 100 * HOUR)).toBe(0)
  })

  it("removes dead items too", () => {
    const { engine } = makeEngine()
    add(engine, T0)
    engine.tend("item-1", KILL, T0)
    engine.remove("item-1")
    expect(engine.graveyard()).toEqual([])
  })

  it("on a storage error, leaves storage and memory unchanged", () => {
    const { engine, adapter } = makeEngine()
    add(engine, T0)
    const before = JSON.parse(JSON.stringify(adapter.saved)) as StoredSnapshot[]
    adapter.failSave = true

    expect(() => engine.remove("item-1")).toThrow("quota exceeded")
    expect(adapter.saved).toEqual(before)
    expect(engine.view(T0).map((i) => i.id)).toEqual(["item-1"])
    expect(engine.history("item-1")).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// resurrect and edit
// ---------------------------------------------------------------------------

// Records what policy.resurrect receives; the result can be scripted.
class ResurrectSpyPolicy extends FakePolicy {
  received: Array<{ item: FakeItem; event: FakeEvent; now: number }> = []
  result: ReturnType<FakePolicy["resurrect"]> | {
    ok: true
    payload?: FakePayload
    policyData?: FakePolicyData
  } = { ok: true }

  override resurrect(item: FakeItem, event: FakeEvent, now: number) {
    this.received.push({ item: { ...item }, event, now })
    return this.result as { ok: true }
  }
}

// healthAt depends on the payload, so an edit can change health:
// "weakened" costs 55 health, "cursed" costs 90, "explode" throws.
class PayloadSensitivePolicy extends FakePolicy {
  healthAtCalls = 0
  override healthAt(item: FakeItem, now: number): number {
    this.healthAtCalls++
    const name = item.payload.name
    if (name === "explode") throw new Error("healthAt exploded")
    const penalty = name === "cursed" ? 90 : name === "weakened" ? 55 : 0
    return super.healthAt(item, now) - penalty
  }
}

const ANSWER: FakeEvent = { type: "boost", amount: 1 }

// One item, killed by an event at T0 + 1h (stored dead, diedAt = T0 + 1h).
function engineWithDeadItem(policy: FakeDecayPolicy = new FakePolicy()) {
  const { engine, adapter } = makeEngine(policy)
  add(engine, T0)
  engine.tend("item-1", KILL, T0 + HOUR)
  return { engine, adapter }
}

describe("DecayEngine.resurrect", () => {
  describe("success", () => {
    it("returns exactly { ok: true } and brings the item back alive at health 100", () => {
      const { engine, adapter } = engineWithDeadItem()
      const now = T0 + 5 * HOUR

      expect(engine.resurrect("item-1", ANSWER, now)).toStrictEqual({ ok: true })
      const item = storedItem(adapter)
      expect(item).toMatchObject({ health: 100, state: "alive", lastEventAt: now, timesResurrected: 1 })
      expect(item).not.toHaveProperty("diedAt")
    })

    it("keeps id, createdAt, importance, costMinutes, payload and policyData when the policy returns none", () => {
      const { engine, adapter } = engineWithDeadItem()
      engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)
      expect(storedItem(adapter)).toMatchObject({
        id: "item-1",
        createdAt: T0,
        importance: 2,
        costMinutes: 10,
        payload: PAYLOAD,
        policyData: { decayRate: 1 / HOUR },
      })
    })

    it("increments timesResurrected on every success", () => {
      const { engine, adapter } = engineWithDeadItem()
      engine.resurrect("item-1", ANSWER, T0 + 2 * HOUR)
      engine.tend("item-1", KILL, T0 + 3 * HOUR)
      engine.resurrect("item-1", ANSWER, T0 + 4 * HOUR)
      expect(storedItem(adapter).timesResurrected).toBe(2)
    })

    it("replaces payload and policyData when the policy returns them, without leaking them into the outcome", () => {
      const policy = new ResurrectSpyPolicy()
      policy.result = { ok: true, payload: { name: "Lima" }, policyData: { decayRate: 0.5 / HOUR } }
      const { engine, adapter } = engineWithDeadItem(policy)

      expect(engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)).toStrictEqual({ ok: true })
      expect(storedItem(adapter)).toMatchObject({
        payload: { name: "Lima" },
        policyData: { decayRate: 0.5 / HOUR },
      })
    })

    it("replaces only payload when only payload is returned", () => {
      const policy = new ResurrectSpyPolicy()
      policy.result = { ok: true, payload: { name: "Lima" } }
      const { engine, adapter } = engineWithDeadItem(policy)

      engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)
      expect(storedItem(adapter)).toMatchObject({ payload: { name: "Lima" }, policyData: { decayRate: 1 / HOUR } })
    })

    it("records a resurrected entry with the event, now and health 100", () => {
      const { engine, adapter } = engineWithDeadItem()
      const now = T0 + 5 * HOUR
      engine.resurrect("item-1", ANSWER, now)

      expect(storedHistory(adapter).at(-1)).toEqual({
        type: "resurrected",
        itemId: "item-1",
        timestamp: now,
        health: 100,
        event: ANSWER,
      })
    })

    it("passes the settled item, the event and now to policy.resurrect, once", () => {
      const policy = new ResurrectSpyPolicy()
      const { engine } = engineWithDeadItem(policy)
      engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)

      expect(policy.received).toHaveLength(1)
      expect(policy.received[0]).toMatchObject({ event: ANSWER, now: T0 + 5 * HOUR })
      expect(policy.received[0]!.item).toMatchObject({ state: "dead", diedAt: T0 + HOUR })
    })

    it("a resurrected item decays again from now", () => {
      const { engine } = engineWithDeadItem()
      const now = T0 + 5 * HOUR
      engine.resurrect("item-1", ANSWER, now)
      expect(engine.view(now + 60 * HOUR)[0]).toMatchObject({ state: "weak" })
    })
  })

  describe("settling first", () => {
    it("an item that died while untended is settled, then resurrected, all in one save", () => {
      const policy = new ResurrectSpyPolicy()
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const saves = adapter.saved.length
      const now = T0 + 100 * HOUR

      expect(engine.resurrect("item-1", ANSWER, now)).toStrictEqual({ ok: true })
      expect(adapter.saved).toHaveLength(saves + 1)

      const diedAt = bisectCrossing(itemAsCreated(), new FakePolicy(), 20, T0, now)
      expect(policy.received[0]!.item).toMatchObject({ state: "dead", health: 0, diedAt })
      expect(storedHistory(adapter).map((h) => [h.type, h.timestamp])).toEqual([
        ["created", T0],
        ["state-changed", bisectCrossing(itemAsCreated(), new FakePolicy(), 50, T0, now)],
        ["died", diedAt],
        ["resurrected", now],
      ])
      expect(storedItem(adapter)).toMatchObject({ state: "alive", health: 100 })
    })

    it("a failed resurrect still saves a death found while settling", () => {
      const policy = new FakePolicy()
      policy.setResurrectFailure(true)
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const now = T0 + 100 * HOUR

      engine.resurrect("item-1", ANSWER, now)
      expect(storedItem(adapter)).toMatchObject({
        state: "dead",
        health: 0,
        diedAt: bisectCrossing(itemAsCreated(), new FakePolicy(), 20, T0, now),
      })
      expect(storedHistory(adapter).map((h) => h.type)).toEqual([
        "created",
        "state-changed",
        "died",
        "resurrect-failed",
      ])
    })
  })

  describe("failure", () => {
    it("returns exactly { ok: false, reason } and leaves the stored item unchanged", () => {
      const policy = new FakePolicy()
      const { engine, adapter } = engineWithDeadItem(policy)
      policy.setResurrectFailure(true)
      const before = { ...storedItem(adapter) }

      expect(engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)).toStrictEqual({
        ok: false,
        reason: "Resurrection not available",
      })
      expect(storedItem(adapter)).toEqual(before)
      expect(storedItem(adapter)).toMatchObject({ state: "dead", diedAt: T0 + HOUR, lastEventAt: T0 + HOUR })
    })

    it("records a resurrect-failed entry with the event, the reason, now and health 0", () => {
      const policy = new FakePolicy()
      const { engine, adapter } = engineWithDeadItem(policy)
      policy.setResurrectFailure(true)
      const now = T0 + 5 * HOUR
      engine.resurrect("item-1", ANSWER, now)

      expect(storedHistory(adapter).at(-1)).toEqual({
        type: "resurrect-failed",
        itemId: "item-1",
        timestamp: now,
        health: 0,
        event: ANSWER,
        reason: "Resurrection not available",
      })
    })

    it("the item stays in the graveyard and can be tried again", () => {
      const policy = new FakePolicy()
      const { engine } = engineWithDeadItem(policy)
      policy.setResurrectFailure(true)
      engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)
      expect(engine.graveyard().map((i) => i.id)).toEqual(["item-1"])

      policy.setResurrectFailure(false)
      expect(engine.resurrect("item-1", ANSWER, T0 + 6 * HOUR)).toStrictEqual({ ok: true })
      expect(engine.graveyard()).toEqual([])
    })
  })

  describe("errors", () => {
    it.each([
      { label: "alive", hours: 10, state: "alive" },
      { label: "weak after settling", hours: 60, state: "weak" },
    ])("throws ITEM_NOT_DEAD for an item that is $label, without asking the policy or saving", ({ hours, state }) => {
      const policy = new ResurrectSpyPolicy()
      const { engine, adapter } = makeEngine(policy)
      add(engine, T0)
      const saves = adapter.saved.length

      const fn = () => engine.resurrect("item-1", ANSWER, T0 + hours * HOUR)
      expectEngineError(fn, "ITEM_NOT_DEAD")
      expect(fn).toThrow(new RegExp(`item-1 is ${state}`))
      expect(policy.received).toEqual([])
      expect(adapter.saved).toHaveLength(saves)
    })

    it("throws TIME_WENT_BACKWARD naming both times", () => {
      const { engine } = engineWithDeadItem()
      const fn = () => engine.resurrect("item-1", ANSWER, T0)
      expectEngineError(fn, "TIME_WENT_BACKWARD")
      expect(fn).toThrow(`now=${T0} < lastEventAt=${T0 + HOUR} for item item-1`)
    })

    it("throws ITEM_NOT_FOUND naming the unknown id", () => {
      const { engine } = engineWithDeadItem()
      const fn = () => engine.resurrect("ghost-42", ANSWER, T0 + 5 * HOUR)
      expectEngineError(fn, "ITEM_NOT_FOUND")
      expect(fn).toThrow(/ghost-42/)
    })

    it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
      const { engine } = engineWithDeadItem()
      expectEngineError(() => engine.resurrect("item-1", ANSWER, now as number), "INVALID_TIMESTAMP")
    })

    it("propagates a policy.resurrect error unchanged and saves nothing", () => {
      const failure = new Error("oracle offline")
      const policy = new FakePolicy()
      const { engine, adapter } = engineWithDeadItem(policy)
      policy.resurrect = () => {
        throw failure
      }
      const saves = adapter.saved.length

      expect(() => engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)).toThrow(failure)
      expect(adapter.saved).toHaveLength(saves)
    })

    it("propagates a storage error and keeps the item dead in memory", () => {
      const { engine, adapter } = engineWithDeadItem()
      adapter.failSave = true

      expect(() => engine.resurrect("item-1", ANSWER, T0 + 5 * HOUR)).toThrow("quota exceeded")
      expect(engine.graveyard().map((i) => i.id)).toEqual(["item-1"])
      expect(engine.history("item-1").at(-1)!.type).toBe("died")
    })
  })
})

describe("DecayEngine.edit", () => {
  describe("which fields change", () => {
    it("replaces only the provided field and lists it in the edited entry", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.edit("item-1", { importance: 3 }, T0 + HOUR)

      expect(storedItem(adapter)).toMatchObject({ importance: 3, costMinutes: 10, payload: PAYLOAD })
      expect(storedHistory(adapter).at(-1)).toMatchObject({
        type: "edited",
        itemId: "item-1",
        timestamp: T0 + HOUR,
        fieldsChanged: ["importance"],
      })
    })

    it("replaces all three fields and lists them in a fixed order", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.edit("item-1", { costMinutes: 45, payload: { name: "Capital of Chile" }, importance: 1 }, T0)

      expect(storedItem(adapter)).toMatchObject({
        payload: { name: "Capital of Chile" },
        importance: 1,
        costMinutes: 45,
      })
      expect(storedHistory(adapter).at(-1)).toMatchObject({
        fieldsChanged: ["payload", "importance", "costMinutes"],
      })
    })

    it("does not touch policyData, timesResurrected, createdAt or id", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.edit("item-1", { payload: { name: "Capital of Chile" } }, T0 + HOUR)
      expect(storedItem(adapter)).toMatchObject({
        id: "item-1",
        createdAt: T0,
        timesResurrected: 0,
        policyData: { decayRate: 1 / HOUR },
      })
    })
  })

  describe("living items", () => {
    it("recomputes health with policy.healthAt on the edited item and sets lastEventAt", () => {
      const { engine, adapter } = makeEngine(new PayloadSensitivePolicy())
      add(engine, T0)
      const now = T0 + HOUR
      engine.edit("item-1", { payload: { name: "weakened" } }, now)

      const item = storedItem(adapter)
      expect(item.health).toBeCloseTo(99 - 55, 9)
      expect(item).toMatchObject({ state: "weak", lastEventAt: now })
      const history = storedHistory(adapter)
      expect(history.slice(-2).map((h) => h.type)).toEqual(["edited", "state-changed"])
      expect(history.at(-2)!.health).toBeCloseTo(44, 9)
      expect(history.at(-1)).toMatchObject({ from: "alive", to: "weak", timestamp: now })
    })

    it("an edit that kills the item sets diedAt = now and records edited, then died", () => {
      const { engine, adapter } = makeEngine(new PayloadSensitivePolicy())
      add(engine, T0)
      const now = T0 + 5 * HOUR
      engine.edit("item-1", { payload: { name: "cursed" } }, now)

      expect(storedItem(adapter)).toMatchObject({ state: "dead", health: 0, diedAt: now, lastEventAt: now })
      expect(storedHistory(adapter).slice(1)).toEqual([
        { type: "edited", itemId: "item-1", timestamp: now, health: 0, fieldsChanged: ["payload"] },
        { type: "state-changed", itemId: "item-1", timestamp: now, health: 50, from: "alive", to: "weak" },
        { type: "died", itemId: "item-1", timestamp: now, health: 0 },
      ])
    })

    it("settles first: decay before the edit is recorded at its bisected time", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const now = T0 + 60 * HOUR
      engine.edit("item-1", { importance: 1 }, now)

      const history = storedHistory(adapter)
      expect(history.map((h) => h.type)).toEqual(["created", "state-changed", "edited"])
      expect(history[1]!.timestamp).toBe(bisectCrossing(itemAsCreated(), new FakePolicy(), 50, T0, now))
      expect(history[2]!.health).toBeCloseTo(40, 9)
      expect(storedItem(adapter)).toMatchObject({ state: "weak", lastEventAt: now })
    })
  })

  describe("dead items", () => {
    it("replaces fields without calling healthAt; health 0, dead, diedAt kept, lastEventAt = now", () => {
      const policy = new PayloadSensitivePolicy()
      const { engine, adapter } = engineWithDeadItem(policy)
      policy.healthAtCalls = 0
      const now = T0 + 5 * HOUR

      engine.edit("item-1", { payload: { name: "Capital of Chile" }, costMinutes: 30 }, now)
      expect(policy.healthAtCalls).toBe(0)
      expect(storedItem(adapter)).toMatchObject({
        payload: { name: "Capital of Chile" },
        costMinutes: 30,
        importance: 2,
        health: 0,
        state: "dead",
        diedAt: T0 + HOUR,
        lastEventAt: now,
      })
      expect(storedHistory(adapter).at(-1)).toEqual({
        type: "edited",
        itemId: "item-1",
        timestamp: now,
        health: 0,
        fieldsChanged: ["payload", "costMinutes"],
      })
    })

    it("an item that died while untended keeps its bisected diedAt through the edit", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const now = T0 + 100 * HOUR
      engine.edit("item-1", { importance: 3 }, now)

      expect(storedItem(adapter)).toMatchObject({
        state: "dead",
        importance: 3,
        diedAt: bisectCrossing(itemAsCreated(), new FakePolicy(), 20, T0, now),
      })
      expect(storedHistory(adapter).map((h) => h.type)).toEqual(["created", "state-changed", "died", "edited"])
    })
  })

  describe("validation and errors", () => {
    it.each([
      ["an empty object", {}],
      ["all fields undefined", { payload: undefined, importance: undefined, costMinutes: undefined }],
    ])("throws EDIT_REQUIRES_FIELD for %s and saves nothing", (_label, changes) => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const saves = adapter.saved.length
      expectEngineError(() => engine.edit("item-1", changes, T0 + HOUR), "EDIT_REQUIRES_FIELD")
      expect(adapter.saved).toHaveLength(saves)
    })

    it.each([0, 4, 2.5, "3"])("throws INVALID_IMPORTANCE for importance %s", (importance) => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const saves = adapter.saved.length
      const fn = () => engine.edit("item-1", { importance: importance as number }, T0 + HOUR)
      expectEngineError(fn, "INVALID_IMPORTANCE")
      expect(fn).toThrow(/edit/)
      expect(adapter.saved).toHaveLength(saves)
    })

    it.each([0, 601, 1.5, "10"])("throws INVALID_COST_MINUTES for costMinutes %s", (costMinutes) => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      const saves = adapter.saved.length
      expectEngineError(
        () => engine.edit("item-1", { costMinutes: costMinutes as number }, T0 + HOUR),
        "INVALID_COST_MINUTES"
      )
      expect(adapter.saved).toHaveLength(saves)
    })

    it("accepts the boundary values importance 1 and 3, costMinutes 1 and 600", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      engine.edit("item-1", { importance: 1, costMinutes: 600 }, T0)
      engine.edit("item-1", { importance: 3, costMinutes: 1 }, T0)
      expect(storedItem(adapter)).toMatchObject({ importance: 3, costMinutes: 1 })
    })

    it("throws TIME_WENT_BACKWARD naming both times", () => {
      const { engine } = makeEngine()
      add(engine, T0 + 10 * HOUR)
      const fn = () => engine.edit("item-1", { importance: 3 }, T0)
      expectEngineError(fn, "TIME_WENT_BACKWARD")
      expect(fn).toThrow(`now=${T0} < lastEventAt=${T0 + 10 * HOUR} for item item-1`)
    })

    it("throws ITEM_NOT_FOUND naming the unknown id", () => {
      const { engine } = makeEngine()
      const fn = () => engine.edit("ghost-42", { importance: 3 }, T0)
      expectEngineError(fn, "ITEM_NOT_FOUND")
      expect(fn).toThrow(/ghost-42/)
    })

    it.each(INVALID_NOWS)("throws INVALID_TIMESTAMP for now = %s", (_label, now) => {
      const { engine } = makeEngine()
      add(engine, T0)
      expectEngineError(() => engine.edit("item-1", { importance: 3 }, now as number), "INVALID_TIMESTAMP")
    })

    it("propagates a policy.healthAt error unchanged and saves nothing", () => {
      const { engine, adapter } = makeEngine(new PayloadSensitivePolicy())
      add(engine, T0)
      const saves = adapter.saved.length

      expect(() => engine.edit("item-1", { payload: { name: "explode" } }, T0 + HOUR)).toThrow("healthAt exploded")
      expect(adapter.saved).toHaveLength(saves)
      expect(engine.view(T0)[0]!.payload).toEqual(PAYLOAD)
    })

    it("propagates a storage error and leaves the item unchanged in memory", () => {
      const { engine, adapter } = makeEngine()
      add(engine, T0)
      adapter.failSave = true

      expect(() => engine.edit("item-1", { importance: 3 }, T0 + HOUR)).toThrow("quota exceeded")
      expect(engine.view(T0)[0]).toMatchObject({ importance: 2, lastEventAt: T0 })
    })
  })
})
