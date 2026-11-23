// @vitest-environment jsdom
//
// The notification setting (task L5, Requirement 24.1-24.4, 24.9), with a
// fake Notification class and a fake permission.

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
  render(<Host />)
  return { changes, said }
}

const theSwitch = () => screen.getByRole("switch", { name: LABEL }) as HTMLInputElement
const notes = () => [...document.querySelectorAll(".sd-notify-note")].map((p) => p.textContent)

describe("each state and its words (Requirement 24.3)", () => {
  it("unsupported: no switch, one sentence", () => {
    renderSetting(null)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(notes()).toEqual(["This browser cannot show notifications, so this setting is not available here."])
  })

  it("off: the limit and the privacy note", () => {
    renderSetting(fakeNotifications("default").api)
    expect(theSwitch().checked).toBe(false)
    expect(notes()).toEqual([LIMIT, PRIVACY])
  })

  it("on", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true })
    expect(theSwitch().checked).toBe(true)
    expect(notes()).toEqual([
      "On: when a fact changes while this tab is in the background, your browser shows a notification.",
      LIMIT,
      PRIVACY,
    ])
  })

  it("denied", () => {
    renderSetting(fakeNotifications("denied").api)
    expect(notes()).toEqual([
      "Your browser blocks notifications for this page; to allow them, open the site settings by the address bar.",
      LIMIT,
      PRIVACY,
    ])
  })

  it("blocked", () => {
    renderSetting(fakeNotifications("denied").api, { enabled: true })
    expect(theSwitch().checked).toBe(true)
    expect(notes()).toEqual([
      "This is on, but your browser is blocking notifications for this page, so none are shown; allow them in the site settings by the address bar, or turn this off.",
      LIMIT,
      PRIVACY,
    ])
  })

  it("not saved", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true, saved: false })
    expect(notes()).toEqual([
      notifyText.on,
      "This choice cannot be saved in this browser, so it lasts until the page is closed.",
      LIMIT,
      PRIVACY,
    ])
  })
})

describe("the control (Requirement 24.1, 24.9)", () => {
  it("is a real checkbox with the switch role and a label, in the Tab order, described by the sentences", () => {
    renderSetting(fakeNotifications("granted").api, { enabled: true })
    const sw = theSwitch()
    expect(sw.tagName).toBe("INPUT")
    expect(sw.type).toBe("checkbox")
    expect(sw.labels![0]!.textContent).toBe(LABEL)
    expect(sw.hasAttribute("tabindex")).toBe(false)
    expect(sw.disabled).toBe(false)
    sw.focus()
    expect(document.activeElement).toBe(sw)
    const described = sw
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)!.textContent)
    expect(described).toEqual([notifyText.on, LIMIT, PRIVACY])
    expect(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0)
  })
})

describe("the permission request happens only on the change (Requirement 24.2)", () => {
  it("never at render", () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    renderSetting(fake.api)
    expect(fake.requests()).toBe(0)
  })

  it("from default: asked once; granted turns it on", async () => {
    const fake = fakeNotifications("default", { answer: "granted" })
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(changes).toEqual([true])
    expect(said).toEqual([])
    expect(theSwitch().checked).toBe(true)
  })

  it("from default: denied leaves it off and says how to allow it; the next change does not ask", async () => {
    const fake = fakeNotifications("default", { answer: "denied" })
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(theSwitch().checked).toBe(false)
    expect(said).toEqual([notifyText.denied])
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(said).toEqual([notifyText.denied, notifyText.denied])
    expect(changes).toEqual([])
  })

  it("a closed prompt leaves it off and says nothing", async () => {
    const fake = fakeNotifications("default")
    const { changes, said } = renderSetting(fake.api)
    await act(async () => {
      fireEvent.click(theSwitch())
    })
    expect(fake.requests()).toBe(1)
    expect(changes).toEqual([])
    expect(said).toEqual([])
    expect(theSwitch().checked).toBe(false)
  })

  it("a second change while the request is pending does not ask again", async () => {
    const fake = fakeNotifications("default", { answer: "granted", hold: true })
    const { changes } = renderSetting(fake.api)
    fireEvent.click(theSwitch())
    fireEvent.click(theSwitch())
    expect(fake.requests()).toBe(1)
    await act(async () => {
      fake.answerHeld()
    })
    expect(changes).toEqual([true])
  })

  it("already granted: on at once; already denied: no request; turning off never asks", () => {
    const granted = fakeNotifications("granted")
    const first = renderSetting(granted.api)
    fireEvent.click(theSwitch())
    expect(granted.requests()).toBe(0)
    expect(first.changes).toEqual([true])
    fireEvent.click(theSwitch())
    expect(first.changes).toEqual([true, false])
    expect(granted.requests()).toBe(0)
    cleanup()

    const denied = fakeNotifications("denied")
    const second = renderSetting(denied.api)
    fireEvent.click(theSwitch())
    expect(denied.requests()).toBe(0)
    expect(second.said).toEqual([notifyText.denied])
  })
})
