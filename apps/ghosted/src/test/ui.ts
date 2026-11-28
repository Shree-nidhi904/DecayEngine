// Test helpers for the app's layout after the feedback list: the three lists are
// tabs (one panel at a time, point 23) and the settings are in a side sheet (point 7).

import { fireEvent, screen, within } from "@testing-library/react"

const LIST_NAMES = ["Fading", "Empty windows", "Still lit"]

/** Whether `name` is one of the three lists. */
export const isListName = (name: string) => LIST_NAMES.includes(name)

/**
 * The panel of one list, by its name. Selects that list's tab first when another is showing,
 * as a person would, so a test can look at any of the three.
 */
export function listPanel(name: string): HTMLElement {
  const tab = screen.queryByRole("tab", { name: new RegExp(`^${name}`) })
  if (tab !== null && tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab)
  return screen.getByRole("tabpanel", { name })
}

/** A region by name: a list's panel through its tab, anything else as a plain region. */
export function regionOrList(name: string): HTMLElement {
  return isListName(name) ? listPanel(name) : screen.getByRole("region", { name })
}

/** Opens the Settings sheet, where the spooky level, sound, share card, notifications, Back up, Restore and Reset are. */
export function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
}

/** Closes the Settings sheet with its own Close button. */
export function closeSettings(): void {
  fireEvent.click(within(document.getElementById("gh-settings")!).getByRole("button", { name: "Close" }))
}
