// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PersistError, VersionedAdapter, type StorageLike } from "@decay-engine/persist"
import type { StoredSnapshot } from "@decay-engine/engine"
import { applyBackup } from "./backup"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TabChangedBanner, tabChangedText } from "./components/TabChangedBanner"
import { useOtherTabChange } from "./cross-tab"
import { STORAGE_NAMESPACE } from "./engine-instance"
import { classifyWriteError, storageProblemText } from "./storage-errors"

afterEach(cleanup)

function Probe({ reload }: { reload: () => void }) {
  const changed = useOtherTabChange()
  return changed ? <TabChangedBanner reload={reload} /> : <p>quiet</p>
}

const storageEvent = (key: string | null) => act(() => void window.dispatchEvent(new StorageEvent("storage", { key })))

describe("another tab changing the saved data", () => {
  it("shows the banner when the snapshot or meta key changes, and Reload reloads", () => {
    const reload = vi.fn()
    render(<Probe reload={reload} />)
    expect(screen.getByText("quiet")).toBeTruthy()
    storageEvent("decay-engine:ghosted:meta")
    expect(screen.getByRole("status").textContent).toContain(tabChangedText.message)
    fireEvent.click(screen.getByRole("button", { name: tabChangedText.reload }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("ignores another app's keys and the app's flags", () => {
    render(<Probe reload={vi.fn()} />)
    storageEvent("decay-engine:other-app")
    storageEvent("ghosted:started")
    expect(screen.getByText("quiet")).toBeTruthy()
  })

  it("the banner names the app", () => {
    expect(tabChangedText.message).toContain("Ghosted")
  })
})

describe("a save refused because another tab wrote first", () => {
  it("is a write problem with its own sentence", () => {
    const error = new PersistError("STALE_WRITE", "stale")
    expect(classifyWriteError(error)).toBe("stale")
    expect(storageProblemText.stale).toContain("Reload")
  })

  it("other persist errors are not write problems", () => {
    expect(classifyWriteError(new PersistError("MIGRATION_FAILED", "x"))).toBeNull()
  })
})

describe("restoring a backup while another tab is open", () => {
  it("makes the open tab's next save fail instead of overwriting the restore", () => {
    const data = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
    const tab = new VersionedAdapter(STORAGE_NAMESPACE, { storage })
    tab.load()
    tab.save({ schemaVersion: 1, items: [], history: [] } as StoredSnapshot)

    const restored = { schemaVersion: 1, items: [], history: [], marker: "restored" }
    applyBackup(storage, restored)

    expect(() => tab.save({ schemaVersion: 1, items: [], history: [] } as StoredSnapshot)).toThrow(PersistError)
    expect(JSON.parse(data.get(`decay-engine:${STORAGE_NAMESPACE}`)!).marker).toBe("restored")
  })
})
