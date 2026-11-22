// Shared helper for tests that use the time dock's jumps, Play or markers
// (task 21.4). The dock starts collapsed (Req 19.1), so these tests open it
// with its "Coming up" toggle first, as a user would, and check that it did.

import { expect } from "vitest"
import { fireEvent, screen } from "@testing-library/react"

/** The dock's toggle, found by its visible name. */
export const dockToggle = () => screen.getByRole("button", { name: "Coming up" })

/** Expands the collapsed dock with its toggle and checks that it is now expanded. */
export function expandDock(): void {
  const toggle = dockToggle()
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(toggle)
  expect(toggle.getAttribute("aria-expanded")).toBe("true")
  expect(document.querySelector(".sd-dock")!.hasAttribute("data-open")).toBe(true)
}
