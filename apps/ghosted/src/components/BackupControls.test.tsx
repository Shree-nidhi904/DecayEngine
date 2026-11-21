// BackupControls and the restore confirmation (task 5.3; Req 21.2-21.4,
// 12.5, design section 9.3). The component on its own with an in-memory
// FlagStorage and a fake download, then the App for the confirmation, which
// the App owns: a real engine on InMemoryAdapter, a fixed clock, a tick
// scheduler that never fires, and real File objects read by the component's
// FileReader. Never the real clock.

import "../test/dialog-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { App } from "../App"
import { makeBackup } from "../backup"
import { ENGINE_STORAGE_KEY, OWN_PEOPLE_FLAG, STARTED_FLAG } from "../first-run"
import type { PersonPayload } from "../policy"
import type { Scheduler } from "../ticking"
import { backupRefusals, previewBlockedText } from "../wording"
import { BackupControls } from "./BackupControls"
import { FakeStorage } from "../test/fake-storage"
import { DAY_MS, T0, day, makeEngine } from "../test/fixtures"
import { RecordingAdapter } from "../test/recording-adapter"

afterEach(cleanup)

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

/** A real engine snapshot with these people, as LocalStorageAdapter would store it. */
function snapshotWith(names: string[]): string {
  const adapter = new RecordingAdapter()
  const engine = makeEngine(adapter)
  for (const name of names) {
    const payload: PersonPayload = { name, relationship: "Family", rhythmDays: 30, lastContactAt: day(-10) }
    engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
  }
  return adapter.lastSnapshotJson!
}

/** A backup file's text holding these people. */
function backupWith(names: string[]): string {
  return makeBackup(new FakeStorage({ [ENGINE_STORAGE_KEY]: snapshotWith(names) }), new Date(T0))!
}

const fileOf = (text: string) => new File([text], "ghosted-backup.json", { type: "application/json" })

function chooseFile(container: HTMLElement, text: string) {
  const input = container.querySelector<HTMLInputElement>('input[data-input="restore"]')!
  fireEvent.change(input, { target: { files: [fileOf(text)] } })
}

function setupControls({ stored, blocked }: { stored?: string; blocked?: string } = {}) {
  const storage = new FakeStorage(stored === undefined ? {} : { [ENGINE_STORAGE_KEY]: stored })
  const announce = vi.fn()
  const onRestoreChecked = vi.fn()
  const download = vi.fn()
  const result = render(
    <BackupControls
      storage={storage}
      announce={announce}
      restoreBlocked={blocked}
      today={() => new Date(T0)}
      timeZone="UTC"
      onRestoreChecked={onRestoreChecked}
      download={download}
    />
  )
  return { ...result, storage, announce, onRestoreChecked, download }
}

describe("Back up (Req 21.2)", () => {
  it("downloads ghosted-backup-YYYY-MM-DD.json holding the stored snapshot", () => {
    const stored = snapshotWith(["Mira Castell"])
    const { download, announce } = setupControls({ stored })
    fireEvent.click(screen.getByRole("button", { name: "Back up" }))

    expect(download).toHaveBeenCalledTimes(1)
    const [name, text] = download.mock.calls[0]! as [string, string]
    // T0 is 14 November 2023 in UTC.
    expect(name).toBe("ghosted-backup-2023-11-14.json")
    expect(JSON.parse(text)).toEqual({
      app: "ghosted",
      version: 1,
      exportedAt: new Date(T0).toISOString(),
      snapshot: JSON.parse(stored),
    })
    expect(announce).toHaveBeenCalledWith("Backup saved as ghosted-backup-2023-11-14.json.")
  })

  it("with nothing saved yet, downloads nothing and says so", () => {
    const { download, announce } = setupControls()
    fireEvent.click(screen.getByRole("button", { name: "Back up" }))
    expect(download).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith("There is nothing to back up yet.")
  })

  it("is not blocked in a preview: it only reads", () => {
    const { download } = setupControls({ stored: snapshotWith(["Mira Castell"]), blocked: previewBlockedText })
    const backUp = screen.getByRole("button", { name: "Back up" })
    expect(backUp.hasAttribute("aria-disabled")).toBe(false)
    fireEvent.click(backUp)
    expect(download).toHaveBeenCalledTimes(1)
  })
})

describe("Restore: checking the file (Req 21.3, 21.4)", () => {
  it("a file that is not JSON is refused with its reason, and nothing changes", async () => {
    const stored = snapshotWith(["Mira Castell"])
    const { container, storage, announce, onRestoreChecked } = setupControls({ stored })
    const before = storage.snapshot()
    chooseFile(container, "not json at all")
    await waitFor(() => expect(announce).toHaveBeenCalledWith(backupRefusals.notJson, true))
    expect(onRestoreChecked).not.toHaveBeenCalled()
    expect(storage.snapshot()).toEqual(before)
  })

  it("a backup from another app is refused with its reason", async () => {
    const { container, announce, onRestoreChecked } = setupControls()
    const other = JSON.stringify({ app: "study-dungeon", version: 1, exportedAt: "x", snapshot: {} })
    chooseFile(container, other)
    await waitFor(() => expect(announce).toHaveBeenCalledWith(backupRefusals.otherApp, true))
    expect(onRestoreChecked).not.toHaveBeenCalled()
  })

  it("a backup from a newer version is refused with its reason", async () => {
    const { container, announce, onRestoreChecked } = setupControls()
    const newer = JSON.stringify({ ...JSON.parse(backupWith(["Mira Castell"])), version: 2 })
    chooseFile(container, newer)
    await waitFor(() => expect(announce).toHaveBeenCalledWith(backupRefusals.newerVersion, true))
    expect(onRestoreChecked).not.toHaveBeenCalled()
  })

  it("a good file is handed on with its people count, and nothing is replaced yet", async () => {
    const stored = snapshotWith(["Mira Castell"])
    const { container, storage, announce, onRestoreChecked } = setupControls({ stored })
    const text = backupWith(["Ana Ruiz", "Leo Park"])
    chooseFile(container, text)
    await waitFor(() => expect(onRestoreChecked).toHaveBeenCalledTimes(1))
    expect(onRestoreChecked).toHaveBeenCalledWith({ ok: true, snapshot: JSON.parse(text).snapshot, people: 2 })
    expect(storage.getItem(ENGINE_STORAGE_KEY)).toBe(stored)
    expect(announce).not.toHaveBeenCalled()
  })
})

describe("Restore during a preview (Req 12.5)", () => {
  it("stays visible and focusable, says why, and opens no file picker", () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, "click")
    const { container, onRestoreChecked } = setupControls({ blocked: previewBlockedText })
    const restore = screen.getByRole("button", { name: "Restore" })
    expect(restore.getAttribute("aria-disabled")).toBe("true")
    expect(restore.getAttribute("title")).toBe(previewBlockedText)
    expect(document.getElementById(restore.getAttribute("aria-describedby")!)!.textContent).toBe(previewBlockedText)
    restore.focus()
    expect(document.activeElement).toBe(restore)
    fireEvent.click(restore)
    expect(pick).not.toHaveBeenCalled()
    // Even a file chosen some other way is ignored.
    chooseFile(container, backupWith(["Ana Ruiz"]))
    expect(onRestoreChecked).not.toHaveBeenCalled()
    pick.mockRestore()
  })

  it("not blocked: Restore opens the file picker", () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    setupControls()
    const restore = screen.getByRole("button", { name: "Restore" })
    expect(restore.hasAttribute("aria-disabled")).toBe(false)
    fireEvent.click(restore)
    expect(pick).toHaveBeenCalledTimes(1)
    pick.mockRestore()
  })
})

describe("Restore in the App: confirm before replacing (Req 21.3, design section 9.3)", () => {
  const OLD = snapshotWith(["Mira Castell"])

  function renderApp() {
    const storage = new FakeStorage({ [STARTED_FLAG]: "1", [ENGINE_STORAGE_KEY]: OLD })
    const reload = vi.fn()
    const engine = makeEngine()
    const payload: PersonPayload = { name: "Mira Castell", relationship: "", rhythmDays: 30, lastContactAt: day(-10) }
    engine.addItem({ payload, importance: 2, costMinutes: 10 }, T0)
    const result = render(
      <App
        engine={engine}
        storage={storage}
        session={null}
        clock={() => T0}
        tickScheduler={idleScheduler}
        prefersReducedMotion={() => true}
        timeZone="UTC"
        reload={reload}
      />
    )
    return { ...result, storage, reload }
  }

  const QUESTION = "Replace your street with 2 people from this file? This cannot be undone."

  it("asks first, with focus on the question; Cancel and Escape replace nothing and do not reload", async () => {
    const { container, storage, reload } = renderApp()
    const before = storage.snapshot()
    const text = backupWith(["Ana Ruiz", "Leo Park"])

    chooseFile(container, text)
    let dialog = await screen.findByRole("dialog", { name: QUESTION })
    expect(document.activeElement).toBe(within(dialog).getByText(QUESTION))
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("dialog")).toBeNull()

    chooseFile(container, text)
    dialog = await screen.findByRole("dialog", { name: QUESTION })
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()

    expect(storage.snapshot()).toEqual(before)
    expect(reload).not.toHaveBeenCalled()
  })

  it("confirming replaces the stored street with the file's snapshot, then reloads", async () => {
    const { container, storage, reload } = renderApp()
    const text = backupWith(["Ana Ruiz", "Leo Park"])
    chooseFile(container, text)
    const dialog = await screen.findByRole("dialog", { name: QUESTION })
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace my street" }))

    expect(JSON.parse(storage.getItem(ENGINE_STORAGE_KEY)!)).toEqual(JSON.parse(text).snapshot)
    expect(storage.getItem(OWN_PEOPLE_FLAG)).not.toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("a one-person file asks about 1 person", async () => {
    const { container } = renderApp()
    chooseFile(container, backupWith(["Ana Ruiz"]))
    expect(
      await screen.findByRole("dialog", { name: "Replace your street with 1 person from this file? This cannot be undone." })
    ).toBeTruthy()
  })

  it("during a preview Restore is blocked with the reason, and Back up is not", () => {
    renderApp()
    fireEvent.click(screen.getByRole("button", { name: "+30 days" }))
    const toolbar = screen.getByRole("button", { name: "Back up" }).parentElement!
    const restore = within(toolbar).getByRole("button", { name: "Restore" })
    expect(restore.getAttribute("aria-disabled")).toBe("true")
    expect(restore.getAttribute("title")).toBe(previewBlockedText)
    expect(within(toolbar).getByRole("button", { name: "Back up" }).hasAttribute("aria-disabled")).toBe(false)
    // The preview is 30 days ahead.
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(String(30 * DAY_MS))
  })
})
