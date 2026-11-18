// Opens a native <dialog> as a modal while the component is mounted, the same
// way ConfirmRemoveDialog does: focus stays inside it, and Escape fires
// "cancel", which each dialog turns into its own close action.

import { useEffect, useRef } from "react"

export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (!dialog.open) dialog.showModal()
    // close() fires "close", not "cancel", so this never calls onCancel.
    return () => dialog.close()
  }, [])
  return ref
}
