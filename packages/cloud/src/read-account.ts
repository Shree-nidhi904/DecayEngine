// Reads the signed-in user's saved copies, and nothing else. Used by Life
// Triage, which only looks at the data: it never writes, schedules or deletes.

import { decryptText } from "./crypto"
import { CloudError, type CloudClient } from "./types"

export type AccountCopy =
  | { app: string; status: "ok"; text: string }
  /** The account holds nothing for this app. */
  | { app: string; status: "empty" }
  /** Encrypted, and there is no passphrase (wrong: false) or it was wrong (wrong: true). */
  | { app: string; status: "locked"; wrong: boolean }

/**
 * Fetches the backup text of each app. An encrypted copy is opened with
 * `passphrase`. Network failures are thrown; everything else is a result.
 */
export async function readAccountCopies(client: CloudClient, apps: readonly string[], passphrase: string | null): Promise<AccountCopy[]> {
  const copies: AccountCopy[] = []
  for (const app of apps) {
    const remote = await client.getSnapshot(app)
    if (remote === null) {
      copies.push({ app, status: "empty" })
    } else if (!remote.encrypted) {
      copies.push({ app, status: "ok", text: remote.body })
    } else if (passphrase === null || passphrase === "") {
      copies.push({ app, status: "locked", wrong: false })
    } else {
      try {
        copies.push({ app, status: "ok", text: await decryptText(remote.body, passphrase) })
      } catch (error) {
        if (error instanceof CloudError && error.code === "WRONG_PASSPHRASE") copies.push({ app, status: "locked", wrong: true })
        else throw error
      }
    }
  }
  return copies
}
