// @vitest-environment jsdom
//
// Extensions spec, Requirement 3 (task 2.4): the memory-model switch in the
// App. A saved choice reloads the page through the App's `reload` prop; a
// choice that cannot be saved changes nothing and says so. In-memory storage,
// a reload spy and fixed times from the app kit: never the real clock.

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { ANNOUNCER_ID } from "./App"
import { MODEL_KEY } from "./policy-select"
import { memoryModelText } from "./wording"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { T0 } from "./test/fixtures"

afterEach(cleanup)

/** Storage whose writes and removals of the model key throw, like a full or blocked storage. */
class ModelBlockedStorage extends MemoryStorage {
  override setItem(key: string, value: string): void {
    if (key === MODEL_KEY) throw new Error("QuotaExceededError")
    super.setItem(key, value)
  }
  override removeItem(key: string): void {
    if (key === MODEL_KEY) throw new Error("QuotaExceededError")
    super.removeItem(key)
  }
}

const memorySwitch = () => screen.getByRole("switch", { name: "Memory model" }) as HTMLInputElement

describe("App: the memory-model switch", () => {
  it("is off when nothing is saved, and turning it on saves 'memory' and reloads once", () => {
    const kit = makeAppKit()
    kit.add("f1", "shaky", T0)
    kit.renderApp(T0)
    expect(memorySwitch().checked).toBe(false)
    fireEvent.click(memorySwitch())
    expect(kit.storage.getItem(MODEL_KEY)).toBe("memory")
    expect(kit.reload).toHaveBeenCalledTimes(1)
  })

  it("is on when 'memory' is saved, and turning it off removes the key and reloads once", () => {
    const kit = makeAppKit(new MemoryStorage({ "study-dungeon:started": "1", [MODEL_KEY]: "memory" }))
    kit.add("f1", "shaky", T0)
    kit.renderApp(T0)
    expect(memorySwitch().checked).toBe(true)
    fireEvent.click(memorySwitch())
    expect(kit.storage.getItem(MODEL_KEY)).toBeNull()
    expect(kit.reload).toHaveBeenCalledTimes(1)
  })

  it("when the choice cannot be saved: no reload, nothing saved, and the live region says so", () => {
    const kit = makeAppKit(new ModelBlockedStorage({ "study-dungeon:started": "1" }))
    kit.add("f1", "shaky", T0)
    kit.renderApp(T0)
    fireEvent.click(memorySwitch())
    expect(kit.reload).not.toHaveBeenCalled()
    expect(kit.storage.getItem(MODEL_KEY)).toBeNull()
    expect(document.getElementById(ANNOUNCER_ID)?.textContent).toBe(memoryModelText.notSaved)
  })
})
