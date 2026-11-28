import type { StorageLike } from "../storage"

/** A Map-backed localStorage stand-in. Set `failWritesTo` to a key to make its setItem throw a quota error. */
export class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>()
  failWritesTo: string | null = null

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (key === this.failWritesTo) {
      const error = new Error("quota")
      error.name = "QuotaExceededError"
      throw error
    }
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

export function snap(n: number) {
  return { schemaVersion: 1, items: [], history: [] as never[], n }
}
