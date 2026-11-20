// An InMemoryAdapter that counts save calls and keeps the last saved snapshot
// as a JSON string (design section 7.3, Property 12): a test can check that
// nothing was saved, and that the stored data is byte-for-byte unchanged.

import { InMemoryAdapter, type StoredSnapshot } from "@decay-engine/engine"

export class RecordingAdapter extends InMemoryAdapter {
  /** How many times save was called. */
  saves = 0
  /** The last saved snapshot as JSON, or null before the first save. */
  lastSnapshotJson: string | null = null

  override save(snapshot: StoredSnapshot): void {
    this.saves++
    super.save(snapshot)
    this.lastSnapshotJson = JSON.stringify(snapshot)
  }
}
