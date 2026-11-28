import { describe, expect, it, vi } from "vitest"
import { watchForeignChanges, type StorageEventTarget } from "./watch"

function fakeTarget() {
  const listeners = new Set<(e: { key: string | null }) => void>()
  const target: StorageEventTarget = {
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
  }
  const fire = (key: string | null) => listeners.forEach((l) => l({ key }))
  return { target, fire, listeners }
}

describe("watchForeignChanges", () => {
  it("fires for the snapshot key, the meta key, and a full clear", () => {
    const { target, fire } = fakeTarget()
    const onChange = vi.fn()
    watchForeignChanges("t", onChange, target)
    fire("decay-engine:t")
    fire("decay-engine:t:meta")
    fire(null)
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it("ignores other keys, including another app's snapshot", () => {
    const { target, fire } = fakeTarget()
    const onChange = vi.fn()
    watchForeignChanges("t", onChange, target)
    fire("decay-engine:other")
    fire("t:started")
    fire("decay-engine:t:corrupt-5")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("stops when the returned function is called", () => {
    const { target, fire, listeners } = fakeTarget()
    const onChange = vi.fn()
    const stop = watchForeignChanges("t", onChange, target)
    stop()
    fire("decay-engine:t")
    expect(onChange).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })
})
