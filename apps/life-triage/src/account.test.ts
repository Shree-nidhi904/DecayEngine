import { describe, expect, it } from "vitest"
import { ACCOUNT_APPS, accountConfigured, connectAccount, returnedFromSignInLink } from "./account"

describe("accountConfigured", () => {
  it("needs both build values, non-empty", () => {
    expect(accountConfigured({ VITE_SUPABASE_URL: "u", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBe(true)
    expect(accountConfigured({ VITE_SUPABASE_URL: "u" })).toBe(false)
    expect(accountConfigured({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "k" })).toBe(false)
    expect(accountConfigured({})).toBe(false)
  })

  it("connectAccount does nothing, and loads nothing, without a server configured", async () => {
    expect(await connectAccount({})).toBeNull()
  })

  it("reads both apps' saves", () => {
    expect([...ACCOUNT_APPS]).toEqual(["ghosted", "study-dungeon"])
  })
})

describe("returnedFromSignInLink", () => {
  it("recognises the one-time code, tokens and an error, and nothing else", () => {
    expect(returnedFromSignInLink({ search: "?code=abc", hash: "" })).toBe(true)
    expect(returnedFromSignInLink({ search: "", hash: "#access_token=t" })).toBe(true)
    expect(returnedFromSignInLink({ search: "", hash: "#error_description=expired" })).toBe(true)
    expect(returnedFromSignInLink({ search: "?x=1", hash: "#top" })).toBe(false)
  })
})
