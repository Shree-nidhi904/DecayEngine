import { describe, expect, it } from "vitest"
import { readTendId, withoutTend } from "./tend-link"

describe("tend link", () => {
  it("reads the id", () => {
    expect(readTendId("?tend=abc-123")).toBe("abc-123")
    expect(readTendId("?x=1&tend=a%20b")).toBe("a b")
  })
  it("is null without an id", () => {
    expect(readTendId("")).toBeNull()
    expect(readTendId("?tend=")).toBeNull()
    expect(readTendId("?other=1")).toBeNull()
  })
  it("removes only tend", () => {
    expect(withoutTend("?tend=abc")).toBe("")
    expect(withoutTend("?code=xyz&tend=abc")).toBe("?code=xyz")
    expect(withoutTend("?code=xyz")).toBe("?code=xyz")
  })
})
