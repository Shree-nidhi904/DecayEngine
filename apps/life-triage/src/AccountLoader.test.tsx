// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AccountCopy } from "@decay-engine/cloud"
import type { Source } from "@decay-engine/life-triage"
import { AccountLoader, accountText, copiesToFiles } from "./AccountLoader"
import type { AccountApi } from "./account"
import { sampleSources } from "./load"

afterEach(cleanup)

const ENV = { VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" }
const NOW = Date.UTC(2026, 10, 28)

/** A real backup file's text for each app, made from the sample engines. */
function backupText(app: "ghosted" | "study-dungeon"): string {
  const source = sampleSources(NOW).find((s) => s.label === (app === "ghosted" ? "Ghosted" : "Study Dungeon"))!
  // The snapshot the engine would save: read it back through a recording adapter is not possible here,
  // so build the file the way the apps do from the sample engine's own view of itself.
  const items = (source.engine as unknown as { _state: { items: Map<string, unknown>; history: Map<string, unknown[]> } })._state
  const snapshot = { schemaVersion: 1, items: [...items.items.values()], history: [...items.history.values()].flat() }
  return JSON.stringify({ app, version: 1, exportedAt: "x", snapshot })
}

function fakeApi(opts: { user?: { email: string } | null; copies?: AccountCopy[]; fail?: boolean } = {}) {
  let listener: (u: { email: string } | null) => void = () => {}
  const calls = { signIn: [] as string[], read: [] as (string | null)[], signOut: 0 }
  const api: AccountApi = {
    getUser: async () => opts.user ?? null,
    onAuthChange: (l) => ((listener = l), () => {}),
    signIn: async (e) => void calls.signIn.push(e),
    signOut: async () => void calls.signOut++,
    readCopies: async (p) => {
      calls.read.push(p)
      if (opts.fail) throw new Error("down")
      return opts.copies ?? []
    },
  }
  return { api, calls, auth: (u: { email: string } | null) => listener(u) }
}

function renderLoader(f: ReturnType<typeof fakeApi>, extra: object = {}) {
  const onLoaded = vi.fn()
  const connect = vi.fn(async () => f.api)
  render(<AccountLoader existing={[]} onLoaded={onLoaded} env={ENV} connect={connect} returnedFromLink={() => false} {...extra} />)
  return { onLoaded, connect }
}

const openIt = async () => {
  const details = screen.getByText(accountText.summary).closest("details")!
  details.open = true
  fireEvent(details, new Event("toggle"))
}

describe("AccountLoader", () => {
  it("renders nothing, and never connects, when the build has no server", () => {
    const connect = vi.fn()
    const { container } = render(<AccountLoader existing={[]} onLoaded={vi.fn()} env={{}} connect={connect} returnedFromLink={() => true} />)
    expect(container.textContent).toBe("")
    expect(connect).not.toHaveBeenCalled()
  })

  it("is closed and connects to nothing until opened", () => {
    const { connect } = renderLoader(fakeApi())
    expect(screen.getByText(accountText.summary)).toBeTruthy()
    expect(connect).not.toHaveBeenCalled()
  })

  it("says what signing in sends, and offers a sign-in link by email once opened", async () => {
    const f = fakeApi()
    renderLoader(f)
    await openIt()
    await screen.findByLabelText(accountText.emailLabel)
    expect(screen.getByText(/sends your email address/)).toBeTruthy()
    expect(screen.getByText(/nothing is written to your account/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(accountText.emailLabel), { target: { value: "me@example.test" } })
    fireEvent.click(screen.getByRole("button", { name: accountText.sendLink }))
    await screen.findByText(accountText.linkSent)
    expect(f.calls.signIn).toEqual(["me@example.test"])
  })

  it("returning from a sign-in link opens it and connects at once", async () => {
    const { connect } = renderLoader(fakeApi({ user: { email: "me@example.test" } }), { returnedFromLink: () => true })
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1))
    expect(screen.getByText(accountText.summary).closest("details")!.open).toBe(true)
    await screen.findByText(accountText.signedInAs("me@example.test"))
  })

  it("signed in: loads both saves through the same reader as files, replacing nothing it was not asked to", async () => {
    const f = fakeApi({
      user: { email: "me@example.test" },
      copies: [
        { app: "ghosted", status: "ok", text: backupText("ghosted") },
        { app: "study-dungeon", status: "ok", text: backupText("study-dungeon") },
      ],
    })
    const { onLoaded } = renderLoader(f)
    await openIt()
    fireEvent.click(await screen.findByRole("button", { name: accountText.load }))
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1))
    const [sources, notes] = onLoaded.mock.calls[0] as [Source[], string[]]
    expect(sources.map((s) => s.label).sort()).toEqual(["Ghosted", "Study Dungeon"])
    expect(notes.join(" ")).toContain("your account (Ghosted)")
    expect(f.calls.read).toEqual([null])
  })

  it("an app with nothing saved is said so, and the other still loads", async () => {
    const f = fakeApi({
      user: { email: "me@example.test" },
      copies: [{ app: "ghosted", status: "ok", text: backupText("ghosted") }, { app: "study-dungeon", status: "empty" }],
    })
    const { onLoaded } = renderLoader(f)
    await openIt()
    fireEvent.click(await screen.findByRole("button", { name: accountText.load }))
    await waitFor(() => expect(onLoaded).toHaveBeenCalled())
    const [sources, notes] = onLoaded.mock.calls[0] as [Source[], string[]]
    expect(sources.map((s) => s.label)).toEqual(["Ghosted"])
    expect(notes).toContain(accountText.empty("Study Dungeon"))
  })

  it("an encrypted copy asks for the passphrase, then sends it", async () => {
    const f = fakeApi({ user: { email: "me@example.test" }, copies: [{ app: "ghosted", status: "locked", wrong: false }] })
    const { onLoaded } = renderLoader(f)
    await openIt()
    fireEvent.click(await screen.findByRole("button", { name: accountText.load }))
    await screen.findByLabelText(accountText.passphraseLabel)
    expect((onLoaded.mock.calls[0] as [Source[], string[]])[1]).toContain(accountText.needPassphrase("Ghosted"))
    fireEvent.change(screen.getByLabelText(accountText.passphraseLabel), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: accountText.load }))
    await waitFor(() => expect(f.calls.read).toEqual([null, "pw"]))
  })

  it("a failed read keeps what was already loaded and says so", async () => {
    const existing = sampleSources(NOW)
    const f = fakeApi({ user: { email: "me@example.test" }, fail: true })
    const { onLoaded } = renderLoader(f, { existing })
    await openIt()
    fireEvent.click(await screen.findByRole("button", { name: accountText.load }))
    await waitFor(() => expect(onLoaded).toHaveBeenCalled())
    const [sources, notes] = onLoaded.mock.calls[0] as [Source[], string[]]
    expect(sources).toHaveLength(existing.length)
    expect(notes).toEqual([accountText.failed])
  })

  it("shows a failure when the sync code cannot be loaded", async () => {
    render(<AccountLoader existing={[]} onLoaded={vi.fn()} env={ENV} connect={async () => Promise.reject(new Error("chunk"))} returnedFromLink={() => true} />)
    expect((await screen.findByRole("alert")).textContent).toBe(accountText.failed)
  })

  it("sign out is offered, and it never offers anything that writes", async () => {
    const f = fakeApi({ user: { email: "me@example.test" } })
    renderLoader(f)
    await openIt()
    fireEvent.click(await screen.findByRole("button", { name: accountText.signOut }))
    expect(f.calls.signOut).toBe(1)
    const labels = screen.getAllByRole("button").map((b) => b.textContent)
    expect(labels.join(" ")).not.toMatch(/delete|save|upload|sync now/i)
  })
})

describe("copiesToFiles", () => {
  it("names each loaded file after the account, and notes empty and locked copies", async () => {
    const out = copiesToFiles([
      { app: "ghosted", status: "ok", text: "T" },
      { app: "study-dungeon", status: "locked", wrong: true },
      { app: "other", status: "empty" },
    ])
    expect(out.files.map((f) => f.name)).toEqual(["your account (Ghosted)"])
    expect(await out.files[0]!.text()).toBe("T")
    expect(out.notes).toEqual([accountText.wrongPassphrase("Study Dungeon"), accountText.empty("other")])
    expect(out.needsPassphrase).toBe(true)
  })
})
