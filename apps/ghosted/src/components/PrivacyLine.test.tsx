// The privacy line (task 5.4; Req 15.1, 15.2).

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { PrivacyLine } from "./PrivacyLine"

afterEach(cleanup)

describe("PrivacyLine", () => {
  it("says the names are made up while the street holds no people of the user's own (Req 15.1)", () => {
    const { container } = render(<PrivacyLine ownPeople={false} />)
    expect(container.textContent).toBe("Everything stays in this browser. Names here are made up.")
  })

  it("drops the made-up sentence once the user has people of their own (Req 15.2)", () => {
    const { container } = render(<PrivacyLine ownPeople />)
    expect(container.textContent).toBe("Everything stays in this browser.")
    expect(container.textContent).not.toContain("made up")
  })
})
