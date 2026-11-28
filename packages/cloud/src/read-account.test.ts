import { describe, expect, it } from "vitest"
import { encryptText } from "./crypto"
import { readAccountCopies } from "./read-account"
import { FakeServer, fakeClient } from "./test/fakes"

const row = (body: string, encrypted = false) => ({ revision: 1, updatedAt: "x", deviceId: "d", encrypted, body })

describe("readAccountCopies", () => {
  it("returns the plain text of each app, and empty for an app with nothing saved", async () => {
    const server = new FakeServer()
    server.rows.set("ghosted", row("GHOSTED-BACKUP"))
    const out = await readAccountCopies(fakeClient(server), ["ghosted", "study-dungeon"], null)
    expect(out).toEqual([
      { app: "ghosted", status: "ok", text: "GHOSTED-BACKUP" },
      { app: "study-dungeon", status: "empty" },
    ])
  })

  it("opens an encrypted copy with the passphrase", async () => {
    const server = new FakeServer()
    server.rows.set("ghosted", row(await encryptText("SECRET-BACKUP", "pw", 1000), true))
    // PBKDF2 rounds are stored in the envelope, so a low-round test envelope opens normally.
    expect(await readAccountCopies(fakeClient(server), ["ghosted"], "pw")).toEqual([{ app: "ghosted", status: "ok", text: "SECRET-BACKUP" }])
  })

  it("a missing or wrong passphrase is a locked result, never a throw, and tells the two apart", async () => {
    const server = new FakeServer()
    server.rows.set("ghosted", row(await encryptText("x", "right", 1000), true))
    const client = fakeClient(server)
    expect(await readAccountCopies(client, ["ghosted"], null)).toEqual([{ app: "ghosted", status: "locked", wrong: false }])
    expect(await readAccountCopies(client, ["ghosted"], "")).toEqual([{ app: "ghosted", status: "locked", wrong: false }])
    expect(await readAccountCopies(client, ["ghosted"], "wrong")).toEqual([{ app: "ghosted", status: "locked", wrong: true }])
  })

  it("one locked app does not hide the other", async () => {
    const server = new FakeServer()
    server.rows.set("ghosted", row(await encryptText("x", "right", 1000), true))
    server.rows.set("study-dungeon", row("PLAIN"))
    const out = await readAccountCopies(fakeClient(server), ["ghosted", "study-dungeon"], null)
    expect(out.map((c) => c.status)).toEqual(["locked", "ok"])
  })

  it("a network failure is thrown, and it only ever reads", async () => {
    const server = new FakeServer()
    server.down = true
    await expect(readAccountCopies(fakeClient(server), ["ghosted"], null)).rejects.toThrow("network down")
    const ok = new FakeServer()
    await readAccountCopies(fakeClient(ok), ["ghosted", "study-dungeon"], null)
    expect(ok.rows.size).toBe(0)
    expect(ok.subscriptions.size).toBe(0)
  })
})
