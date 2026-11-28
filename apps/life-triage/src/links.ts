// Links from a "Do these" row to the app the item lives in. Each app opens the
// item named by `?tend=<id>` (the ids are the same, since the backup is a copy
// of that app's own data). A link is not a request: the page fetches nothing.
import { FACTS, FRIENDS } from "./load"

export const APP_URL: Readonly<Record<string, string>> = {
  [FACTS]: "https://decay-engine-study-dungeon.pages.dev/",
  [FRIENDS]: "https://decay-engine-ghosted.pages.dev/",
}

/** The address that opens one item in its own app, or null for an unknown source. */
export function tendLink(source: string, id: string): string | null {
  const base = APP_URL[source]
  return base === undefined ? null : `${base}?tend=${encodeURIComponent(id)}`
}
