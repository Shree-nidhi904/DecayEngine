// jsdom has HTMLDialogElement and its `open` attribute, but not showModal()
// or close(). The dialogs call both, so the jsdom tests add minimal versions:
// showModal() sets `open` and close() removes it. Focus trapping and the
// backdrop are not emulated; the tests only check what the dialogs do.
// Only defined when missing, so a jsdom that has them uses its own.

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

export {}
