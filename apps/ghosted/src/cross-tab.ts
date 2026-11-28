// Whether another tab changed the saved data since this tab loaded it.
// The engine loads once, so this tab cannot merge the change live; the app
// tells the user to reload (components/TabChangedBanner.tsx). Without this,
// the next save would be refused anyway (STALE_WRITE, see storage-errors.ts),
// but the user would not know why.
//

import { useEffect, useState } from "react"
import { watchForeignChanges, type StorageEventTarget } from "@decay-engine/persist"
import { STORAGE_NAMESPACE } from "./engine-instance"

/** True once another tab has changed this app's saved data. Stays true until reload. */
export function useOtherTabChange(target?: StorageEventTarget): boolean {
  const [changed, setChanged] = useState(false)
  useEffect(() => watchForeignChanges(STORAGE_NAMESPACE, () => setChanged(true), target), [target])
  return changed
}
