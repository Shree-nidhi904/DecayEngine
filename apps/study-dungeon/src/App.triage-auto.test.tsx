// @vitest-environment jsdom
//
// Feedback list, point 12: there is no Triage button; the picks show as soon as a
// budget is chosen. Weak facts at day 10: w1 solid (health 50, 2 min each), w2 shaky (health 57.4).

import "./test/dialog-polyfill"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"

afterEach(cleanup)

describe("Triage runs by itself", () => {
  it("has no run button, and shows the picks at once, then again when the budget changes", () => {
    const kit = makeAppKit()
    kit.add("w1", "solid", day(0))
    kit.add("w2", "shaky", day(6))
    kit.renderApp(day(10))
    expect(screen.queryByRole("button", { name: "Triage" })).toBeNull()
    const picks = () => screen.getByRole("list", { name: "Fight these first" }).querySelectorAll("li").length
    // The default 10 minutes fits both (2 minutes each).
    expect(picks()).toBe(2)
    fireEvent.click(screen.getByRole("radio", { name: "5 min" }))
    expect(picks()).toBe(2)
    fireEvent.click(screen.getByRole("radio", { name: "Other" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Minutes" }), { target: { value: "2" } })
    expect(picks()).toBe(1)
  })
})
