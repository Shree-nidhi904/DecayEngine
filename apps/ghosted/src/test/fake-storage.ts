// An in-memory FlagStorage for tests (design section 1.1). It records every
// removeItem call, so a test can check exactly which keys a reset touched.

import type { FlagStorage } from "../first-run"

export class FakeStorage implements FlagStorage {
  private readonly data = new Map<string, string>()
  /** Every key passed to removeItem, in call order. */
  readonly removed: string[] = []

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value)
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }

  removeItem(key: string): void {
    this.removed.push(key)
    this.data.delete(key)
  }

  /** Everything stored, sorted by key, for exact comparisons. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.data.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  }
}
