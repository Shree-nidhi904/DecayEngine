// One sync, end to end, against an injected client and an injected local side.
//
// sync() looks at the cloud and the device, asks planSync what to do, and does
// it: push the device's data, pull the cloud's, or stop at a conflict for the
// user to settle with resolve(). It never throws; every failure is an outcome.
//
// Writes to the cloud are compare-and-set on the revision (CloudClient.pushSnapshot),
// so two devices pushing at once cannot overwrite each other: the second one gets
// a conflict. With a passphrase, the text is encrypted before it leaves the device.

import { decryptText, encryptText } from "./crypto"
import { mergeBackups, sameBackupData } from "./merge"
import { planSync } from "./plan"
import { CloudError, type CloudClient, type LocalSide, type RemoteSnapshot, type SyncStateStore } from "./types"

export type SyncOutcome =
  | { kind: "signed-out" }
  | { kind: "noop" }
  | { kind: "pushed"; revision: number; serverTime: string }
  /** The cloud's data replaced this device's; the app should reload. */
  | { kind: "pulled" }
  /** Both sides changed. Call resolve("local" | "cloud" | "merge"). */
  | { kind: "conflict" }
  /** The cloud copy is encrypted and there is no (or a wrong) passphrase. */
  | { kind: "locked"; wrongPassphrase: boolean }
  /** Merged, applied here, and pushed; the app should reload. */
  | { kind: "merged"; revision: number; serverTime: string }
  | { kind: "error"; message: string }

export type Resolution = "local" | "cloud" | "merge"

export interface SyncServiceDeps {
  client: CloudClient
  /** "ghosted" or "study-dungeon". */
  app: string
  local: LocalSide
  store: SyncStateStore
  deviceId: string
  /** The passphrase, if the user set one this session. Not stored anywhere. */
  getPassphrase: () => string | null
}

export interface SyncService {
  sync(): Promise<SyncOutcome>
  resolve(choice: Resolution): Promise<SyncOutcome>
  /** Deletes the cloud data and the account, and forgets the sync state. */
  deleteCloud(): Promise<{ ok: true } | { ok: false; message: string }>
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createSyncService(deps: SyncServiceDeps): SyncService {
  const { client, app, local, store, deviceId, getPassphrase } = deps

  async function openRemote(remote: RemoteSnapshot): Promise<string | SyncOutcome> {
    if (!remote.encrypted) return remote.body
    const passphrase = getPassphrase()
    if (passphrase === null) return { kind: "locked", wrongPassphrase: false }
    try {
      return await decryptText(remote.body, passphrase)
    } catch (error) {
      if (error instanceof CloudError && error.code === "WRONG_PASSPHRASE") return { kind: "locked", wrongPassphrase: true }
      return { kind: "error", message: messageOf(error) }
    }
  }

  async function push(remote: RemoteSnapshot | null, text: string, localRevision: number): Promise<SyncOutcome> {
    const passphrase = getPassphrase()
    // Never quietly turn an encrypted cloud copy into a plain one.
    if (remote?.encrypted && passphrase === null) return { kind: "locked", wrongPassphrase: false }
    const encrypted = passphrase !== null
    const body = encrypted ? await encryptText(text, passphrase) : text
    const result = await client.pushSnapshot({ app, expectedRevision: remote?.revision ?? 0, deviceId, encrypted, body })
    if (!result.ok) return { kind: "conflict" }
    store.set({ remoteRevision: result.revision, localRevision })
    return { kind: "pushed", revision: result.revision, serverTime: result.serverTime }
  }

  async function pull(remote: RemoteSnapshot): Promise<SyncOutcome> {
    const text = await openRemote(remote)
    if (typeof text !== "string") return text
    if (!local.validate(text)) return { kind: "error", message: "The cloud copy cannot be read by this version of the app." }
    const { revision } = local.apply(text)
    store.set({ remoteRevision: remote.revision, localRevision: revision })
    return { kind: "pulled" }
  }

  async function guarded(run: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
    try {
      return await run()
    } catch (error) {
      if (error instanceof CloudError && error.code === "WRONG_PASSPHRASE") return { kind: "locked", wrongPassphrase: true }
      return { kind: "error", message: messageOf(error) }
    }
  }

  return {
    sync: () =>
      guarded(async () => {
        if ((await client.getUser()) === null) return { kind: "signed-out" }
        const remote = await client.getSnapshot(app)
        const current = local.read()
        const plan = planSync({
          localRevision: current.revision,
          localHasData: current.hasData,
          state: store.get(),
          remoteRevision: remote?.revision ?? null,
        })
        if (plan === "noop") return { kind: "noop" }
        // Same data on both sides (a first sync of identical copies, or a reload that only
        // re-saved what the other device already had): just note it, so devices do not
        // keep pulling and pushing the same content back and forth.
        if (remote !== null && current.text !== null) {
          const remoteText = remote.encrypted && getPassphrase() === null ? null : await openRemote(remote)
          if (typeof remoteText === "string" && sameBackupData(current.text, remoteText)) {
            store.set({ remoteRevision: remote.revision, localRevision: current.revision })
            return { kind: "noop" }
          }
        }
        if (plan === "conflict") return { kind: "conflict" }
        if (plan === "pull") return pull(remote!)
        if (current.text === null) return { kind: "noop" }
        return push(remote, current.text, current.revision)
      }),

    resolve: (choice) =>
      guarded(async () => {
        if ((await client.getUser()) === null) return { kind: "signed-out" }
        const remote = await client.getSnapshot(app)
        const current = local.read()
        if (choice === "cloud") {
          return remote === null ? { kind: "error", message: "There is no cloud copy to take." } : pull(remote)
        }
        if (current.text === null) return { kind: "error", message: "There is nothing on this device to keep." }
        if (choice === "local" || remote === null) return push(remote, current.text, current.revision)

        const remoteText = await openRemote(remote)
        if (typeof remoteText !== "string") return remoteText
        const merged = mergeBackups(current.text, remoteText)
        if (merged === null || !local.validate(merged)) {
          return { kind: "error", message: "The two copies could not be merged. Keep one of them instead." }
        }
        const { revision } = local.apply(merged)
        const pushed = await push(remote, merged, revision)
        return pushed.kind === "pushed" ? { kind: "merged", revision: pushed.revision, serverTime: pushed.serverTime } : pushed
      }),

    async deleteCloud() {
      try {
        await client.deleteAccount()
        store.set(null)
        return { ok: true }
      } catch (error) {
        return { ok: false, message: messageOf(error) }
      }
    },
  }
}
