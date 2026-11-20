// Copied from apps/study-dungeon/src/components/useModalDialog.ts (Ghosted
// design section 1.3). The code is unchanged; only the comments' examples
// name Ghosted's dialogs. No import from apps/study-dungeon (Req 21.1).
//
// Opens a native <dialog> as a modal while the component is mounted: focus
// stays inside it, and Escape fires "cancel", which each dialog turns into
// its own close action. When the dialog goes away, focus goes back to the
// button that opened it.

import { useEffect, useRef, useState } from "react"

/** One open dialog and the element to give focus back to when it closes. */
type FocusEntry = { opener: HTMLElement | null }

/** The dialogs open now, oldest first. */
const openDialogs: FocusEntry[] = []

function focusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}

/**
 * Remembers the focused element when the component first renders (the button
 * that opened it) and focuses it again when the component unmounts, if it is
 * still on the page.
 *
 * When one dialog opens another (Autopsy → Reconnect, or the next reach-out
 * of a Triage session), focus is inside the old dialog at that moment. The
 * new one then takes over the old one's opener, so closing it returns focus
 * to the button on the page that started the chain.
 */
export function useReturnFocus(): void {
  const [entry] = useState<FocusEntry>(() => {
    let opener = focusedElement()
    const current = openDialogs[openDialogs.length - 1]
    if (opener !== null && opener.closest("dialog") !== null && current !== undefined) opener = current.opener
    return { opener }
  })

  useEffect(() => {
    openDialogs.push(entry)
    return () => {
      const index = openDialogs.lastIndexOf(entry)
      if (index !== -1) openDialogs.splice(index, 1)
      if (entry.opener !== null && entry.opener.isConnected) entry.opener.focus()
    }
  }, [entry])
}

export function useModalDialog() {
  useReturnFocus()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (!dialog.open) dialog.showModal()
    // A part of the dialog can ask to be focused first (data-autofocus), for
    // example the answer options, so a stray Enter does not press a button.
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    // close() fires "close", not "cancel", so this never calls onCancel.
    return () => dialog.close()
  }, [])
  return ref
}
