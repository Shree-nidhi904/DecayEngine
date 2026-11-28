// "Load from my account (optional)": sign in by email, then read your Ghosted and
// Study Dungeon saves into the page, the same way a backup file is read. It only
// reads; nothing is written to the account. Renders nothing unless the build has a
// sync server configured.

import { useEffect, useRef, useState } from "react"
import type { AccountCopy } from "@decay-engine/cloud"
import type { Source } from "@decay-engine/life-triage"
import { ACCOUNT_APPS, accountConfigured, connectAccount, returnedFromSignInLink, type AccountApi } from "./account"
import { readBackupFiles } from "./files"
import { FACTS, FRIENDS } from "./load"

export const accountText = {
  summary: "Load from my account (optional)",
  intro:
    "If you sync Study Dungeon or Ghosted, you can load that data here instead of exporting files. Signing in sends your email address to the sync service. Loading only reads; nothing is written to your account.",
  loading: "Loading…",
  failed: "The account could not be reached. Try again later.",
  emailLabel: "Email address",
  sendLink: "Send sign-in link",
  linkSent: "Check your email for a sign-in link. Open it in this browser.",
  signedInAs: (email: string) => `Signed in as ${email}.`,
  load: "Load my Study Dungeon and Ghosted data",
  signOut: "Sign out",
  passphraseLabel: "Passphrase (for an encrypted copy)",
  needPassphrase: (label: string) => `${label} is encrypted. Enter your passphrase and load again.`,
  wrongPassphrase: (label: string) => `That passphrase did not open ${label}.`,
  empty: (label: string) => `Nothing saved for ${label} in your account.`,
} as const

const LABELS: Record<string, string> = { ghosted: FRIENDS, "study-dungeon": FACTS }

/** The notes for copies that gave nothing to load, and the files for those that did. */
export function copiesToFiles(copies: readonly AccountCopy[]): { files: { name: string; text: () => Promise<string> }[]; notes: string[]; needsPassphrase: boolean } {
  const files: { name: string; text: () => Promise<string> }[] = []
  const notes: string[] = []
  let needsPassphrase = false
  for (const copy of copies) {
    const label = LABELS[copy.app] ?? copy.app
    if (copy.status === "ok") {
      files.push({ name: `your account (${label})`, text: async () => copy.text })
    } else if (copy.status === "empty") {
      notes.push(accountText.empty(label))
    } else {
      needsPassphrase = true
      notes.push(copy.wrong ? accountText.wrongPassphrase(label) : accountText.needPassphrase(label))
    }
  }
  return { files, notes, needsPassphrase }
}

export interface AccountLoaderProps {
  existing: readonly Source[]
  /** Called with the sources now loaded and a note for each thing that happened. */
  onLoaded: (sources: Source[], notes: string[]) => void
  /** The build's env. Defaults to import.meta.env. */
  env?: Record<string, unknown>
  /** Connects to the account. Tests pass a fake. */
  connect?: (env: Record<string, unknown>) => Promise<AccountApi | null>
  /** Whether this load is the return from a sign-in link. Tests pass a fake. */
  returnedFromLink?: () => boolean
}

export function AccountLoader({
  existing,
  onLoaded,
  env = import.meta.env,
  connect = connectAccount,
  // Static rendering in Node has no window: then it is not a return from a link.
  returnedFromLink = () => typeof window !== "undefined" && returnedFromSignInLink(window.location),
}: AccountLoaderProps) {
  const configured = accountConfigured(env)
  const [fromLink] = useState(() => returnedFromLink())
  const [open, setOpen] = useState(fromLink)
  const [api, setApi] = useState<AccountApi | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle")
  const [email, setEmail] = useState<string | null>(null)
  const [address, setAddress] = useState("")
  const [passphrase, setPassphrase] = useState("")
  const [asked, setAsked] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const load = () => {
    if (started.current) return
    started.current = true
    setState("loading")
    connect(env).then(
      async (connected) => {
        if (connected === null) return setState("failed")
        connected.onAuthChange((user) => setEmail(user?.email ?? null))
        setApi(connected)
        setEmail((await connected.getUser())?.email ?? null)
        setState("idle")
      },
      () => setState("failed")
    )
  }

  useEffect(() => {
    if (configured && fromLink) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!configured) return null

  async function loadMine() {
    if (api === null) return
    setBusy(true)
    try {
      const { files, notes, needsPassphrase } = copiesToFiles(await api.readCopies(passphrase === "" ? null : passphrase))
      const read = await readBackupFiles(files, existing)
      setAsked(needsPassphrase)
      onLoaded(read.sources, [...read.notes, ...notes])
    } catch {
      onLoaded([...existing], [accountText.failed])
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      className="account"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
        if (event.currentTarget.open) load()
      }}
    >
      <summary>{accountText.summary}</summary>
      {state === "loading" && <p>{accountText.loading}</p>}
      {state === "failed" && <p role="alert">{accountText.failed}</p>}
      {api !== null && email === null && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            api.signIn(address).then(
              () => setMessage(accountText.linkSent),
              (error: unknown) => setMessage(error instanceof Error ? error.message : String(error))
            ).finally(() => setBusy(false))
          }}
        >
          <p className="legend">{accountText.intro}</p>
          <label htmlFor="acct-email">{accountText.emailLabel}</label>
          <input id="acct-email" type="email" required autoComplete="email" value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
          <button type="submit" disabled={busy}>{accountText.sendLink}</button>
        </form>
      )}
      {api !== null && email !== null && (
        <div>
          <p>{accountText.signedInAs(email)}</p>
          {asked && (
            <>
              <label htmlFor="acct-pass">{accountText.passphraseLabel}</label>
              <input id="acct-pass" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />
            </>
          )}
          <div className="presets">
            <button type="button" disabled={busy} onClick={() => void loadMine()}>{accountText.load}</button>
            <button type="button" onClick={() => void api.signOut()}>{accountText.signOut}</button>
          </div>
        </div>
      )}
      {message !== null && <p role="status" aria-live="polite">{message}</p>}
    </details>
  )
}

export { ACCOUNT_APPS }
