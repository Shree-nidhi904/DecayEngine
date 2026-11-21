// Copied from apps/study-dungeon/src/test/dialog-polyfill.ts (Ghosted design
// section 1.3 pattern). No import from apps/study-dungeon (Req 21.1). Only
// the global flag's name changes.
//
// jsdom has HTMLDialogElement and its `open` attribute, but not showModal()
// or close(). The dialogs call both, so the jsdom tests add minimal versions:
// showModal() sets `open` and close() removes it. Focus trapping and the
// backdrop are not emulated; the tests only check what the dialogs do.
// Only defined when missing, so a jsdom that has them uses its own.
//
// Escape: in a browser, Escape on a modal dialog fires a cancelable "cancel"
// event on it and closes it unless that is prevented. jsdom does not, so a
// keydown listener does the same for the most recently opened modal dialog,
// letting tests press Escape instead of faking "cancel". It ignores a keydown
// that something already handled (defaultPrevented).

const proto = HTMLDialogElement.prototype

if (typeof proto.showModal !== "function") {
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
}

if (typeof proto.close !== "function") {
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open")
  }
}

/** Modal dialogs opened with showModal, oldest first. */
const modals: HTMLDialogElement[] = []

const flag = "__ghEscapeEmulation"
const marked = globalThis as { [flag]?: boolean }

if (marked[flag] !== true) {
  marked[flag] = true
  const showModal = proto.showModal
  const close = proto.close

  proto.showModal = function trackedShowModal(this: HTMLDialogElement) {
    showModal.call(this)
    modals.push(this)
  }

  proto.close = function trackedClose(this: HTMLDialogElement, returnValue?: string) {
    close.call(this, returnValue)
    const index = modals.lastIndexOf(this)
    if (index !== -1) modals.splice(index, 1)
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return
    const top = [...modals].reverse().find((dialog) => dialog.isConnected && dialog.open)
    if (top === undefined) return
    const cancel = new Event("cancel", { cancelable: true })
    if (top.dispatchEvent(cancel)) top.close()
  })
}

export {}
