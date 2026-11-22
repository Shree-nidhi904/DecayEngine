// The dock's expanded flag (task L2, design section 11.2; Req 34.5).

import { describe, expect, it } from "vitest"
import { DOCK_EXPANDED_FLAG, readDockExpanded, writeDockExpanded } from "./dock-state"
import { RESET_KEYS } from "./first-run"
import type { SessionFlagStorage } from "./splash"
import { FakeStorage } from "./test/fake-storage"

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
  it('is kept under "ghosted.dock-expanded", and is not one of the keys "Reset all data" clears', () => {
    expect(DOCK_EXPANDED_FLAG).toBe("ghosted.dock-expanded")
    expect(RESET_KEYS).not.toContain(DOCK_EXPANDED_FLAG)
  })

  it("reads collapsed with no value", () => {
    expect(readDockExpanded(new FakeStorage())).toBe(false)
  })

  it('writes "1" and "0", and reads back what was written', () => {
    const session = new FakeStorage()
    writeDockExpanded(session, true)
    expect(session.snapshot()).toEqual({ [DOCK_EXPANDED_FLAG]: "1" })
    expect(readDockExpanded(session)).toBe(true)
    writeDockExpanded(session, false)
    expect(session.snapshot()).toEqual({ [DOCK_EXPANDED_FLAG]: "0" })
    expect(readDockExpanded(session)).toBe(false)
  })

  it("reads anything other than \"1\" as collapsed", () => {
    expect(readDockExpanded(new FakeStorage({ [DOCK_EXPANDED_FLAG]: "true" }))).toBe(false)
    expect(readDockExpanded(new FakeStorage({ [DOCK_EXPANDED_FLAG]: "" }))).toBe(false)
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
