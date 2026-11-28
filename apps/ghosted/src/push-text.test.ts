import { describe, expect, it } from "vitest"
import { pushNotification } from "./push-text"

describe("the notification while the app is closed", () => {
  it("uses the app's name as the title and one calm sentence as the body", () => {
    expect(pushNotification.title).toBe("Ghosted")
    expect(pushNotification.body.length).toBeLessThanOrEqual(120)
    expect(pushNotification.body.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(2)
  })

  it("names no person and no fact: the server that sends it cannot know them", () => {
    // Generic means no placeholders and nothing quoted.
    expect(pushNotification.body).not.toMatch(/[{}$"']/)
  })

  it("has no guilt, no death words and none of the banned phrases", () => {
    const text = `${pushNotification.title} ${pushNotification.body}`
    for (const word of ["dead", "die", "died", "dying", "ignored", "ghosted you", "doesn't care", "forgot", "failed", "overdue", "!"]) {
      expect(text.toLowerCase(), word).not.toContain(word)
    }
  })
})
