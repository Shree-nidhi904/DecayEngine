// The privacy line (task 5.4; Req 15.1, 15.2).

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { PrivacyLine, syncedPrivacyNote } from "./PrivacyLine"

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

  it("adds that a copy is kept in the account only while signed in to sync (amendment to Req 15)", () => {
    const signedIn = render(<PrivacyLine ownPeople signedIn />)
    expect(signedIn.container.textContent).toBe(`Everything stays in this browser. ${syncedPrivacyNote}`)
    cleanup()
    const out = render(<PrivacyLine ownPeople signedIn={false} />)
    expect(out.container.textContent).toBe("Everything stays in this browser.")
  })

  it("finds a stored sign-in by itself, and says nothing extra without one", () => {
    localStorage.clear()
    expect(render(<PrivacyLine ownPeople />).container.textContent).toBe("Everything stays in this browser.")
    cleanup()
    localStorage.setItem("sb-abcdef-auth-token", "{}")
    expect(render(<PrivacyLine ownPeople />).container.textContent).toContain(syncedPrivacyNote)
    localStorage.clear()
  })

  it("keeps the made-up sentence in front of the note while the street is sample data", () => {
    const { container } = render(<PrivacyLine ownPeople={false} signedIn />)
    expect(container.textContent).toBe(`Everything stays in this browser. Names here are made up. ${syncedPrivacyNote}`)
  })
})
