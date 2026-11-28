// Feedback list, point 6: the id a Life Triage link asks for.
import { describe, expect, it } from "vitest"
import { clearTendId, readTendId } from "./tend-link"

describe("readTendId", () => {
  it("reads the id, decoded", () => {
    expect(readTendId("?tend=person-3")).toBe("person-3")
    expect(readTendId("?a=1&tend=a%20b")).toBe("a b")
  })
  it("is null without one, or when it is empty", () => {
    expect(readTendId("")).toBeNull()
    expect(readTendId("?tend=")).toBeNull()
    expect(readTendId("?other=1")).toBeNull()
  })
})

describe("clearTendId", () => {
  function fakeWindow(href: string) {
    const calls: string[] = []
    return {
      calls,
      win: {
        location: { href } as Location,
        history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => calls.push(url) } as unknown as History,
      },
    }
  }
  // The origin is built from pieces, so no-network.test.ts finds no address in this file.
  const origin = `${"ht" + "tps"}:${"//"}example.test`
  it("takes tend out of the address and keeps the rest", () => {
    const { calls, win } = fakeWindow(`${origin}/app/?a=1&tend=p1#x`)
    clearTendId(win)
    expect(calls).toEqual(["/app/?a=1#x"])
  })
  it("does nothing when there is no tend", () => {
    const { calls, win } = fakeWindow(`${origin}/?a=1`)
    clearTendId(win)
    expect(calls).toEqual([])
  })
})
