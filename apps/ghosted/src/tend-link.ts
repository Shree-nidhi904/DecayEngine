// `?tend=<id>` from a Life Triage link (feedback list, point 6). Reads the id
// from the address and takes it out again, so a reload does not reopen it.

/** The id in `?tend=`, or null when there is none or it is empty. */
export function readTendId(search: string): string | null {
  const id = new URLSearchParams(search).get("tend")
  return id === null || id.trim() === "" ? null : id
}

/** Removes `tend` from the address without a reload or a new history entry. */
export function clearTendId(win: Pick<Window, "location" | "history">): void {
  const url = new URL(win.location.href)
  if (!url.searchParams.has("tend")) return
  url.searchParams.delete("tend")
  win.history.replaceState(win.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}
