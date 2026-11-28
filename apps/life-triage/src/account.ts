// Optional: reading your Ghosted and Study Dungeon data from your account.
//
// Off unless the build has a sync server configured. Even then, the sync code is
// loaded only when the person opens "Load from my account" (or returns from a
// sign-in link). Reading is all it does: no write, no schedule, no delete. This
// file holds no address and makes no request itself.

import type { AccountCopy } from "@decay-engine/cloud"

/** Where a Ghosted or Study Dungeon save lives in the account. */
export const ACCOUNT_APPS = ["ghosted", "study-dungeon"] as const

export function accountConfigured(env: Record<string, unknown>): boolean {
  return (
    typeof env.VITE_SUPABASE_URL === "string" &&
    env.VITE_SUPABASE_URL !== "" &&
    typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === "string" &&
    env.VITE_SUPABASE_PUBLISHABLE_KEY !== ""
  )
}

/** Whether this page load is the return from an emailed sign-in link (a one-time code, tokens or an error in the address). */
export function returnedFromSignInLink(location: Pick<Location, "search" | "hash">): boolean {
  return /[?&]code=/.test(location.search) || /(?:^|[#&])(?:access_token|error_description|error_code)=/.test(location.hash)
}

/** What the page needs from the account: who is signed in, a sign-in link, and the saved copies. */
export interface AccountApi {
  getUser(): Promise<{ email: string } | null>
  onAuthChange(listener: (user: { email: string } | null) => void): () => void
  /** Sends a sign-in link to the address. */
  signIn(email: string): Promise<void>
  signOut(): Promise<void>
  /** The saved copy of each app, opened with the passphrase when it is encrypted. */
  readCopies(passphrase: string | null): Promise<AccountCopy[]>
}

/** Loads the sync code and connects. Null when the build has no sync server. */
export async function connectAccount(env: Record<string, unknown>): Promise<AccountApi | null> {
  if (!accountConfigured(env)) return null
  const cloud = await import("@decay-engine/cloud")
  const config = cloud.cloudConfigFromEnv(env)
  if (config === null) return null
  const client = cloud.connectToSupabase(config)
  return {
    getUser: () => client.getUser(),
    onAuthChange: (listener) => client.onAuthChange(listener),
    signIn: (email) => client.signInWithEmail(email.trim(), `${window.location.origin}/`),
    signOut: () => client.signOut(),
    readCopies: (passphrase) => cloud.readAccountCopies(client, ACCOUNT_APPS, passphrase),
  }
}
