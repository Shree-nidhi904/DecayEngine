export type SpookyLevel = "haunted" | "calm"

export const SPOOKY_KEY = "ghosted:spooky"

type Readable = { getItem(key: string): string | null }
type Writable = { setItem(key: string, value: string): void }

export function readSpooky(storage: Readable): SpookyLevel {
  try {
    return storage.getItem(SPOOKY_KEY) === "calm" ? "calm" : "haunted"
  } catch {
    return "haunted"
  }
}

export function saveSpooky(storage: Writable, level: SpookyLevel): boolean {
  try {
    storage.setItem(SPOOKY_KEY, level)
    return true
  } catch {
    return false
  }
}
