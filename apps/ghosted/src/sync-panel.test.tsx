// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { SyncController, SyncViewState } from "@decay-engine/cloud"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SyncPanel, syncText } from "./components/SyncPanel"
import type { CloudHandle } from "./cloud-link"

afterEach(cleanup)

const ENV = { VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" }

const base: SyncViewState = {
  phase: "signed-out",
  email: null,
  linkSent: false,
  busy: false,
  notice: null,
  conflict: false,
  locked: false,
  encrypting: false,
  lastSyncedAt: null,
  push: "unknown",
  pushNextAt: "unknown",
  clockSkewMs: null,
}

function fakeController(initial: Partial<SyncViewState> = {}) {
  let state: SyncViewState = { ...base, ...initial }
  const listeners = new Set<() => void>()
  const calls: Record<string, unknown[][]> = {}
  const rec = (name: string) => async (...args: unknown[]) => void (calls[name] ??= []).push(args)
  const controller: SyncController = {
    getState: () => state,
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    start: rec("start"),
    signIn: rec("signIn"),
    signOut: rec("signOut"),
    syncNow: rec("syncNow"),
    resolve: rec("resolve"),
    setPassphrase: rec("setPassphrase"),
    deleteCloud: rec("deleteCloud"),
    enablePush: rec("enablePush"),
    disablePush: rec("disablePush"),
    dispose: () => {},
  }
  const set = (patch: Partial<SyncViewState>) => act(() => ((state = { ...state, ...patch }), listeners.forEach((l) => l())))
  return { controller, calls, set }
}

function open(extra: object = {}, c = fakeController()) {
  const stop = vi.fn()
  const start = vi.fn(async (): Promise<CloudHandle | null> => ({ controller: c.controller, stop }))
  render(<SyncPanel storage={localStorage} reload={() => {}} env={ENV} start={start} signedInBefore={() => false} {...extra} />)
  return { start, stop, c }
}

describe("SyncPanel clock warning", () => {
  const show = async (clockSkewMs: number | null) => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test", clockSkewMs })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    await screen.findByText(syncText.signOut)
  }

  it("says nothing when the clocks agree, or before it is measured", async () => {
    await show(30_000)
    expect(screen.queryByText(/clock is about/)).toBeNull()
    cleanup()
    await show(null)
    expect(screen.queryByText(/clock is about/)).toBeNull()
  })

  it("warns when the device is ahead or behind by more than two minutes, in whole minutes", async () => {
    await show(10 * 60_000)
    expect(screen.getByText(syncText.clockOff(10, "ahead"))).toBeTruthy()
    cleanup()
    await show(-61 * 60_000)
    expect(screen.getByText(syncText.clockOff(61, "behind"))).toBeTruthy()
  })

  it("is worded for one minute and does not blame the person", () => {
    expect(syncText.clockOff(1, "ahead")).toContain("1 minute ahead")
    expect(syncText.clockOff(5, "behind")).toContain("5 minutes behind")
    expect(syncText.clockOff(5, "behind")).not.toMatch(/you |your fault|wrong/i)
  })
})

describe("SyncPanel notifications while closed", () => {
  const openSignedIn = async (push: SyncViewState["push"]) => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test", push })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    await screen.findByText(syncText.pushTitle)
    return c
  }

  it("off: offers Turn on, and only a click asks", async () => {
    const c = await openSignedIn("off")
    expect(c.calls.enablePush).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: syncText.pushOff }))
    expect(c.calls.enablePush).toHaveLength(1)
    expect(screen.getByText(syncText.pushNote)).toBeTruthy()
  })

  it("on: offers Turn off", async () => {
    const c = await openSignedIn("on")
    fireEvent.click(screen.getByRole("button", { name: syncText.pushOn }))
    expect(c.calls.disablePush).toHaveLength(1)
    expect(screen.queryByRole("button", { name: syncText.pushOff })).toBeNull()
  })

  it("on: says when the next notification is due, or that none is scheduled and why", async () => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test", push: "on", pushNextAt: Date.UTC(2026, 10, 29, 8, 0) })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    await screen.findByText(syncText.pushTitle)
    expect(screen.getByText(syncText.pushNext(new Date(Date.UTC(2026, 10, 29, 8, 0)).toLocaleString()))).toBeTruthy()
    await c.set({ pushNextAt: null })
    expect(screen.getByText(syncText.pushNone)).toBeTruthy()
    await c.set({ pushNextAt: "unknown" })
    expect(screen.queryByText(syncText.pushNone)).toBeNull()
  })

  it("blocked and unsupported: explain, with no button", async () => {
    await openSignedIn("denied")
    expect(screen.getByText(syncText.pushBlocked)).toBeTruthy()
    expect(screen.queryByRole("button", { name: syncText.pushOff })).toBeNull()
    cleanup()
    await openSignedIn("unsupported")
    expect(screen.getByText(syncText.pushUnsupported)).toBeTruthy()
  })

  it("the note promises only what the server does: a time, never what it is about", () => {
    expect(syncText.pushNote).toMatch(/never who or what/)
    expect(syncText.pushNote).toMatch(/at most one a day/)
  })
})

describe("SyncPanel", () => {
  it("renders nothing, and never loads the sync code, when the build has no server", () => {
    const start = vi.fn()
    const { container } = render(<SyncPanel storage={localStorage} reload={() => {}} env={{}} start={start} signedInBefore={() => true} />)
    expect(container.textContent).toBe("")
    expect(start).not.toHaveBeenCalled()
  })

  it("is closed and loads nothing until opened", () => {
    const { start } = open()
    expect(screen.getByText(syncText.summary)).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })

  it("loads once when opened, then offers sign-in by email", async () => {
    const { start, c } = open()
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    fireEvent(details, new Event("toggle"))
    await screen.findByLabelText(syncText.emailLabel)
    expect(start).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText(syncText.emailLabel), { target: { value: "me@example.test" } })
    fireEvent.click(screen.getByRole("button", { name: syncText.sendLink }))
    expect(c.calls.signIn).toEqual([["me@example.test"]])
  })

  it("returning from a sign-in link opens the panel and loads the sync code at once", async () => {
    const { start } = open({ returnedFromLink: () => true })
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    expect(screen.getByText(syncText.summary).closest("details")!.open).toBe(true)
  })

  it("loads at startup when an earlier visit left a sign-in", async () => {
    const { start } = open({ signedInBefore: () => true })
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  })

  it("shows a problem when the sync code cannot be loaded", async () => {
    const start = vi.fn(async () => {
      throw new Error("chunk failed")
    })
    render(<SyncPanel storage={localStorage} reload={() => {}} env={ENV} start={start} signedInBefore={() => true} />)
    expect((await screen.findByRole("alert")).textContent).toBe(syncText.failed)
  })

  it("signed in: shows who, syncs, signs out", async () => {
    const c = fakeController({ phase: "signed-in", email: "me@example.test", lastSyncedAt: 1_700_000_000_000 })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    await screen.findByText(syncText.signedInAs("me@example.test"))
    fireEvent.click(screen.getByRole("button", { name: syncText.syncNow }))
    fireEvent.click(screen.getByRole("button", { name: syncText.signOut }))
    expect(c.calls.syncNow).toHaveLength(1)
    expect(c.calls.signOut).toHaveLength(1)
  })

  it("a conflict offers the three choices and the merge warning", async () => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test", conflict: true })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    await screen.findByText(syncText.conflictTitle)
    fireEvent.click(screen.getByRole("button", { name: syncText.keepDevice }))
    fireEvent.click(screen.getByRole("button", { name: syncText.keepCloud }))
    fireEvent.click(screen.getByRole("button", { name: syncText.merge }))
    expect(c.calls.resolve).toEqual([["local"], ["cloud"], ["merge"]])
    expect(screen.getByText(syncText.mergeNote)).toBeTruthy()
  })

  it("the passphrase is sent once and cleared from the box, with the no-recovery warning shown", async () => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test" })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    const box = (await screen.findByLabelText(syncText.passphraseLabel)) as HTMLInputElement
    expect(screen.getByText(syncText.passphraseNote)).toBeTruthy()
    fireEvent.change(box, { target: { value: "correct horse" } })
    fireEvent.click(screen.getByRole("button", { name: syncText.usePassphrase }))
    expect(c.calls.setPassphrase).toEqual([["correct horse"]])
    expect(box.value).toBe("")
    await c.set({ encrypting: true })
    expect(screen.getByText(syncText.encrypting)).toBeTruthy()
  })

  it("deleting the cloud copy asks first, and Cancel does nothing", async () => {
    const c = fakeController({ phase: "signed-in", email: "x@y.test" })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    fireEvent.click(await screen.findByRole("button", { name: syncText.deleteCloud }))
    expect(c.calls.deleteCloud).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: syncText.cancel }))
    expect(c.calls.deleteCloud).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: syncText.deleteCloud }))
    fireEvent.click(screen.getByRole("button", { name: syncText.deleteConfirm }))
    expect(c.calls.deleteCloud).toHaveLength(1)
  })

  it("shows a problem notice as an alert", async () => {
    const c = fakeController({ phase: "signed-out", notice: { kind: "problem", text: "boom" } })
    open({}, c)
    const details = screen.getByText(syncText.summary).closest("details")!
    details.open = true
    fireEvent(details, new Event("toggle"))
    expect((await screen.findByRole("alert")).textContent).toBe("boom")
  })
})
