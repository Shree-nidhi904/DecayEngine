// The notification setting (task L5, Req 39.1-39.4, 39.9, design sections
// 16.3 and 16.4), with a fake Notification class and a fake permission.

import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import type { NotificationApi } from "../notify"
import { fakeNotifications } from "../test/fake-notification"
import { notifyText } from "../wording"
import { NotifySetting } from "./NotifySetting"

afterEach(cleanup)

const LABEL = "Notify me about changes while this tab is open"
const LIMIT = "There is no server, so nothing can notify you when this tab is closed or the computer is asleep."
const PRIVACY = "A notification shows only what is already on this page, and nothing is sent anywhere."

/** The setting as the App holds it: the choice in state, every change recorded, every announcement recorded. */
function renderSetting(api: NotificationApi | null, options: { enabled?: boolean; saved?: boolean } = {}) {
  const changes: boolean[] = []
  const said: string[] = []
  function Host() {
    const [enabled, setEnabled] = useState(options.enabled ?? false)
    return (
      <NotifySetting
        api={api}
        enabled={enabled}
        saved={options.saved ?? true}
        onChange={(on) => {
          changes.push(on)
          setEnabled(on)
        }}
        announce={(text) => said.push(text)}
      />
    )
  }
  const view = render(<Host />)
  return { changes, said, view }
}

const theSwitch = () => screen.getByRole("switch", { name: LABEL })
const notes = () => [...document.querySelectorAll(".gh-notify-note")].map((p) => p.textContent)

describe("the words (design 16.4)", () => {
  it("are exactly these", () => {
    expect(notifyText.label).toBe(LABEL)
    expect(notifyText.limit).toBe(LIMIT)
    expect(notifyText.privacy).toBe(PRIVACY)
    expect(notifyText.unsupported).toBe("This browser cannot show notifications, so this setting is not available here.")
    expect(notifyText.on).toBe(
      "On: when a window changes while this tab is in the background, your browser shows a notification."
    )
    expect(notifyText.denied).toBe(
      "Your browser blocks notifications for this page; to allow them, open the site settings by the address bar."
    )
    expect(notifyText.blocked).toBe(
      "This is on, but your browser is blocking notifications for this page, so none are shown; allow them in the site settings by the address bar, or turn this off."
    )
    expect(notifyText.notSaved).toBe("This choice cannot be saved in this browser, so it lasts until the page is closed.")
  })
})

describe("each state (Req 39.3)", () => {
  it("unsupported: no switch, one sentence", () => {
    renderSetting(null)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(document.querySelectorAll(".gh-notify button")).toHaveLength(0)
    expect(notes()).toEqual([notifyText.unsupported])
  })

  it("off: the switch, Off, the limit and the privacy note", () => {
    renderSetting(fakeNotifications("default").api)
    const sw = theSwitch()
    expect(sw.getAttribute("aria-checked")).toBe("false")
    expect(sw.querySelector(".gh-notify-state")!.textContent).toBe("Off")
    expect(notes()).toEqual([LIMIT, PRIVACY])
  })

  it("on: On, the on sentence first", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true })
    const sw = theSwitch()
    expect(sw.getAttribute("aria-checked")).toBe("true")
    expect(sw.querySelector(".gh-notify-state")!.textContent).toBe("On")
    expect(notes()).toEqual([notifyText.on, LIMIT, PRIVACY])
  })

  it("denied: the switch stays, with the sentence on how to allow it", () => {
    renderSetting(fakeNotifications("denied").api)
    expect(theSwitch().getAttribute("aria-checked")).toBe("false")
    expect(notes()).toEqual([notifyText.denied, LIMIT, PRIVACY])
  })

  it("blocked: on, but the browser does not allow it", () => {
    renderSetting(fakeNotifications("denied").api, { enabled: true })
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    expect(notes()).toEqual([notifyText.blocked, LIMIT, PRIVACY])
  })

  it("not saved: one more sentence when the last save threw", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true, saved: false })
    expect(notes()).toEqual([notifyText.on, notifyText.notSaved, LIMIT, PRIVACY])
  })
})

describe("the control (Req 39.1, 39.9)", () => {
  it("is a real button with the switch role, named by its label, in the Tab order, quiet, described by the sentences", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true })
    const sw = theSwitch()
    expect(sw.tagName).toBe("BUTTON")
    expect(sw.getAttribute("type")).toBe("button")
    expect(sw.hasAttribute("tabindex")).toBe(false)
    expect(sw.hasAttribute("disabled")).toBe(false)
    expect(sw.hasAttribute("aria-disabled")).toBe(false)
    expect(sw.classList.contains("gh-button")).toBe(true)
    expect(sw.classList.contains("gh-button-primary")).toBe(false)
    sw.focus()
    expect(document.activeElement).toBe(sw)
    const described = sw
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)!.textContent)
    expect(described).toEqual([notifyText.on, LIMIT, PRIVACY])
    // No live region of its own.
    expect(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0)
  })
})

describe("the permission request happens only on the click (Req 39.2)", () => {
  it("never at render, nor on a re-render", () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    const { view } = renderSetting(fake.api)
    view.rerender(<></>)
    renderSetting(fake.api)
    expect(fake.requests()).toBe(0)
  })

  it("from default, one click asks once; granted turns it on", async () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(changes).toEqual([true])
    expect(said).toEqual([])
    expect(theSwitch().getAttribute("aria-checked")).toBe("true")
    expect(notes()[0]).toBe(notifyText.on)
  })

  it("from default, denied leaves it off and says how to allow it; the next click does not ask again", async () => {
    const fake = fakeNotifications("default", { answer: "denied" })
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(changes).toEqual([])
    expect(said).toEqual([notifyText.denied])
    expect(notes()[0]).toBe(notifyText.denied)

    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(said).toEqual([notifyText.denied, notifyText.denied])
    expect(changes).toEqual([])
  })

  it("from default, a closed prompt leaves it off and says nothing", async () => {
    const fake = fakeNotifications("default")
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(changes).toEqual([])
    expect(said).toEqual([])
    expect(theSwitch().getAttribute("aria-checked")).toBe("false")
  })

  it("a second click while the request is pending does not ask again", async () => {
    const fake = fakeNotifications("default", { answer: "granted", hold: true })
    const { changes } = renderSetting(fake.api)
    fireEvent.click(theSwitch())
    fireEvent.click(theSwitch())
    fireEvent.click(theSwitch())
    expect(fake.requests()).toBe(1)
    await act(async () => {
      fake.answerHeld()
    })
    expect(changes).toEqual([true])
  })

  it("already granted: on at once, no request", () => {
    const fake = fakeNotifications("granted")
    const { changes } = renderSetting(fake.api)
    fireEvent.click(theSwitch())
    expect(fake.requests()).toBe(0)
    expect(changes).toEqual([true])
  })

  it("already denied: no request, the sentence once more", () => {
    const fake = fakeNotifications("denied")
    const { changes, said } = renderSetting(fake.api)
    fireEvent.click(theSwitch())
    expect(fake.requests()).toBe(0)
    expect(changes).toEqual([])
    expect(said).toEqual([notifyText.denied])
  })

  it("turning it off never asks, also from blocked", () => {
    const fake = fakeNotifications("denied")
    const { changes } = renderSetting(fake.api, { enabled: true })
    fireEvent.click(theSwitch())
    expect(fake.requests()).toBe(0)
    expect(changes).toEqual([false])
    expect(notes()[0]).toBe(notifyText.denied)
  })

  it("reads the permission when it renders, so a choice changed in the browser shows (here: rendered again)", () => {
    const fake = fakeNotifications("denied")
    renderSetting(fake.api)
    expect(notes()[0]).toBe(notifyText.denied)
    fake.setPermission("default")
    cleanup()
    renderSetting(fake.api)
    expect(notes()).toEqual([LIMIT, PRIVACY])
  })
})
