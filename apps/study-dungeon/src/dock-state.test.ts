// The time dock's expanded flag (task 21.1; Req 19.5).

import { describe, expect, it } from "vitest"
import {
  DOCK_EXPANDED_FLAG,
  browserSessionStorage,
  readDockExpanded,
  writeDockExpanded,
  type SessionFlagStorage,
} from "./dock-state"
import { RESET_KEYS } from "./first-run"

/** A sessionStorage stand-in backed by a Map; `entries()` shows what is stored. */
class FakeSession implements SessionFlagStorage {
  private readonly map: Map<string, string>
  constructor(initial: Record<string, string> = {}) {
    this.map = new Map(Object.entries(initial))
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  entries(): Record<string, string> {
    return Object.fromEntries(this.map)
  }
}

/** A storage whose every call throws, like a blocked sessionStorage. */
const throwing: SessionFlagStorage = {
  getItem: () => {
    throw new Error("blocked")
  },
  setItem: () => {
    throw new Error("blocked")
  },
}

describe("the dock's expanded flag", () => {
  it('is kept under "study-dungeon.dock-expanded", and is not one of the keys "Reset all data" clears', () => {
    expect(DOCK_EXPANDED_FLAG).toBe("study-dungeon.dock-expanded")
    expect(RESET_KEYS).not.toContain(DOCK_EXPANDED_FLAG)
  })

  it("reads collapsed with no value", () => {
    expect(readDockExpanded(new FakeSession())).toBe(false)
  })

  it('writes "1" and "0", and reads back what was written', () => {
    const session = new FakeSession()
    writeDockExpanded(session, true)
    expect(session.entries()).toEqual({ [DOCK_EXPANDED_FLAG]: "1" })
    expect(readDockExpanded(session)).toBe(true)
    writeDockExpanded(session, false)
    expect(session.entries()).toEqual({ [DOCK_EXPANDED_FLAG]: "0" })
    expect(readDockExpanded(session)).toBe(false)
  })

  it('reads anything other than "1" as collapsed', () => {
    expect(readDockExpanded(new FakeSession({ [DOCK_EXPANDED_FLAG]: "true" }))).toBe(false)
    expect(readDockExpanded(new FakeSession({ [DOCK_EXPANDED_FLAG]: "" }))).toBe(false)
    expect(readDockExpanded(new FakeSession({ [DOCK_EXPANDED_FLAG]: "0" }))).toBe(false)
  })

  it("with no storage (null): reads collapsed and writes nothing, without throwing", () => {
    expect(readDockExpanded(null)).toBe(false)
    expect(() => writeDockExpanded(null, true)).not.toThrow()
  })

  it("with a storage that throws: reads collapsed, and a write fails quietly", () => {
    expect(readDockExpanded(throwing)).toBe(false)
    expect(() => writeDockExpanded(throwing, true)).not.toThrow()
  })
})

describe("browserSessionStorage", () => {
  it("returns null when reading sessionStorage throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError")
      },
    })
    try {
      expect(browserSessionStorage()).toBeNull()
    } finally {
      if (descriptor === undefined) delete (globalThis as { sessionStorage?: unknown }).sessionStorage
      else Object.defineProperty(globalThis, "sessionStorage", descriptor)
    }
  })

  it("returns the storage that is there", () => {
    const fake = new FakeSession()
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: fake })
    try {
      expect(browserSessionStorage()).toBe(fake)
    } finally {
      if (descriptor === undefined) delete (globalThis as { sessionStorage?: unknown }).sessionStorage
      else Object.defineProperty(globalThis, "sessionStorage", descriptor)
    }
  })
})
