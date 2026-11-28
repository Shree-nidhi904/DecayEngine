// `?tend=<id>` (feedback list, point 6): Life Triage links to a fact with this
// parameter, and the app opens that fact. Pure; main.tsx does the reading and
// the address change.

/** The id in `?tend=<id>`, or null when there is none or it is empty. */
export function readTendId(search: string): string | null {
  const id = new URLSearchParams(search).get("tend")
  return id === null || id === "" ? null : id
}

/** The same address without `tend`, so reloading the page does not open the fact again. Other parameters stay. */
export function withoutTend(search: string): string {
  const params = new URLSearchParams(search)
  params.delete("tend")
  const rest = params.toString()
  return rest === "" ? "" : `?${rest}`
}
