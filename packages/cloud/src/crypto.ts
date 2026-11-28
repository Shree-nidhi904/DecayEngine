// Optional end-to-end encryption of the synced text with a passphrase the
// server never sees. AES-256-GCM; the key is derived with PBKDF2 (SHA-256,
// 600,000 rounds) from the passphrase and a random salt kept in the envelope.
//
// A wrong passphrase fails GCM's check and is reported as WRONG_PASSPHRASE, so
// it is told apart from damaged data (BAD_ENVELOPE). There is no recovery for a
// forgotten passphrase: the cloud copy stays unreadable. Local data is unaffected.

import { CloudError } from "./types"

const ITERATIONS = 600_000
const VERSION = 1

interface Envelope {
  v: number
  salt: string
  iv: string
  ct: string
}

const subtle = () => (globalThis as unknown as { crypto: Crypto }).crypto.subtle
const random = (n: number) => (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(n))

function toBase64(bytes: Uint8Array): string {
  let text = ""
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text)
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"])
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

/** Encrypts `text`; the result is a JSON string safe to store as the snapshot body. */
export async function encryptText(text: string, passphrase: string, iterations: number = ITERATIONS): Promise<string> {
  const salt = random(16)
  const iv = random(12)
  const key = await deriveKey(passphrase, salt, iterations)
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(text))
  )
  const envelope: Envelope & { iter?: number } = { v: VERSION, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) }
  if (iterations !== ITERATIONS) envelope.iter = iterations
  return JSON.stringify(envelope)
}

/** @throws CloudError WRONG_PASSPHRASE, or BAD_ENVELOPE for text that is not an envelope. */
export async function decryptText(body: string, passphrase: string): Promise<string> {
  let envelope: Envelope & { iter?: number }
  try {
    envelope = JSON.parse(body) as Envelope & { iter?: number }
    if (envelope.v !== VERSION || typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.ct !== "string") {
      throw new Error("shape")
    }
  } catch {
    throw new CloudError("BAD_ENVELOPE", "The cloud copy is not a valid encrypted envelope")
  }
  try {
    const key = await deriveKey(passphrase, fromBase64(envelope.salt), envelope.iter ?? ITERATIONS)
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) as BufferSource }, key, fromBase64(envelope.ct) as BufferSource)
    return new TextDecoder().decode(plain)
  } catch {
    throw new CloudError("WRONG_PASSPHRASE", "That passphrase does not open the cloud copy")
  }
}
