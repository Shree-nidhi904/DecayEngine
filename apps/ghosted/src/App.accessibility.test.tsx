// Keyboard and focus in the App (task 5.7; design sections 9.4 and 9.5;
// Req 24.1, 24.2, 24.3, 12.5). The sample street on a real engine, a fixed
// clock and a tick scheduler that never fires.
//
// jsdom has no Tab key and does not turn Enter or Space into a click, so
// Req 24.1 is checked through what makes both work in a browser: every
// control is a native button or form field, takes focus, and none is taken
// out of the Tab order (no positive tabindex, no tabindex -1 on a control,
// no disabled control). Native buttons are activated by Enter and Space.
// Hover is never the only cue: every :hover rule in the app's CSS has a
// matching :focus-visible rule.
//
// Each dialog is opened with showModal (which makes the page behind it
// inert, so focus stays inside), opens with focus on its content, closes on
// Escape and gives focus back to its opener, or to the hero heading when the
// opener is gone.

import "./test/dialog-polyfill"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { App } from "./App"
import { STARTED_FLAG } from "./first-run"
import { loadSampleData } from "./sample-data"
import type { Scheduler } from "./ticking"
import { previewBlockedText } from "./wording"
import { stripComments } from "./test/css"
import { FakeStorage } from "./test/fake-storage"
import { DAY_MS, T0, makeEngine } from "./test/fixtures"
import { listFiles, readText, SRC_DIR } from "./test/source-files"
import { regionOrList, openSettings } from "./test/ui"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const idleScheduler: Scheduler = { setInterval: () => 1, clearInterval: () => {} }

function renderSample() {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  render(
    <App
      engine={engine}
      storage={new FakeStorage({ [STARTED_FLAG]: "1" })}
      session={null}
      clock={() => T0}
      tickScheduler={idleScheduler}
      prefersReducedMotion={() => true}
      timeZone="UTC"
    />
  )
  return engine
}

// `summary`: the Triage "How does this work?" disclosure (task L1, Req 33.3). A
// native <summary> is focusable and opens on Enter and Space, like a button.
const CONTROLS = "button, summary, input, select, textarea, a[href], [role='button'], [role='link'], [contenteditable]"
const openDialog = () => document.querySelector<HTMLDialogElement>("dialog[open]")
/** The dock starts collapsed (task L2, Req 34.1): expand it, as a user would, before using a jump. */
function jumpAhead90Days() {
  fireEvent.click(screen.getByRole("button", { name: "Coming up" }))
  fireEvent.click(screen.getByRole("button", { name: "+90 days" }))
}
const heroHeading = () => within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!
const region = regionOrList
const card = (list: string, name: string) => within(region(list)).getByRole("article", { name })

/** The restore input is hidden on purpose: the Restore button opens it. */
const isHiddenFileInput = (el: Element) => el instanceof HTMLInputElement && el.type === "file" && el.hidden

/** A button's accessible name, as a screen reader reads it (aria-label, aria-labelledby, then its text). */
function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute("aria-label")
  if (label !== null) return label
  const labelledBy = el.getAttribute("aria-labelledby")
  if (labelledBy !== null) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
  }
  return el.textContent ?? ""
}

/** Every control on the page now. */
// A sheet that is closed stays mounted but is not on the screen, so its controls are not reachable until it opens
// (the tests below open each sheet and check its controls too).
const controls = () =>
  [...document.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (el) => !isHiddenFileInput(el) && el.closest("dialog:not([open])") === null
  )

function expectReachable(where: string) {
  const all = controls()
  expect(all.length, where).toBeGreaterThan(30)
  for (const el of all) {
    const what = `${where}: ${el.tagName.toLowerCase()} "${accessibleName(el).trim()}"`
    expect(["BUTTON", "SUMMARY", "INPUT", "SELECT", "TEXTAREA", "A"], what).toContain(el.tagName)
    expect(el.hasAttribute("disabled"), what).toBe(false)
    const tabindex = el.getAttribute("tabindex")
    if (el.getAttribute("role") === "tab") {
      // The list tabs (feedback list, point 23) use WAI-ARIA's roving tabindex: the selected tab is in the Tab
      // order, the others are reached with the arrow keys. They still take focus.
      const selected = el.getAttribute("aria-selected") === "true"
      expect(tabindex, `${what} (tab, selected: ${selected})`).toBe(selected ? "0" : "-1")
    } else {
      expect(tabindex === null || Number(tabindex) === 0, `${what} tabindex ${tabindex}`).toBe(true)
    }
    el.focus()
    expect(document.activeElement, what).toBe(el)
  }
  // Nothing anywhere jumps the Tab order (design section 9.5).
  const positive = [...document.querySelectorAll("[tabindex]")].filter((el) => Number(el.getAttribute("tabindex")) > 0)
  expect(positive).toEqual([])
  // tabindex -1 only on content that dialogs and the lists' headings focus, and on the tabs that are not selected.
  const selectedTabs = document.querySelectorAll("[role='tab'][aria-selected='true']")
  if (document.querySelector("[role='tab']") !== null) expect(selectedTabs, `${where}: one selected tab`).toHaveLength(1)
  for (const el of document.querySelectorAll("[tabindex='-1']")) {
    if (isHiddenFileInput(el) || el.getAttribute("role") === "tab") continue
    expect(["H1", "H2", "H3", "P"], `${where}: tabindex -1 on ${el.tagName}`).toContain(el.tagName)
  }
}

function expectNamed(where: string) {
  for (const button of document.querySelectorAll<HTMLElement>("button, summary")) {
    const name = accessibleName(button).trim()
    expect(name, `${where}: a button with no name in words (${button.outerHTML.slice(0, 80)})`).toMatch(/\p{L}{2,}/u)
  }
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea, select")) {
    if (isHiddenFileInput(field)) continue
    const labelled =
      (field.getAttribute("aria-label") ?? "").trim() !== "" ||
      field.getAttribute("aria-labelledby") !== null ||
      (field.labels !== null && [...field.labels].some((l) => (l.textContent ?? "").trim() !== ""))
    expect(labelled, `${where}: ${field.outerHTML.slice(0, 80)} has no label`).toBe(true)
  }
}

describe("App: the Settings and Profile sheets work from the keyboard (feedback list, point 7)", () => {
  it.each([
    ["Settings", openSettings, 5],
    // With no sync server in this build the Profile holds its Close button and the activity list.
    ["Profile", () => fireEvent.click(screen.getByRole("button", { name: /^(Sync|Profile)$/ })), 1],
  ] as const)("%s: open, every control in it is native, named, focusable and in the Tab order", (name, open, atLeast) => {
    renderSample()
    open()
    const sheet = screen.getByRole("dialog", { name })
    expect(sheet.hasAttribute("open")).toBe(true)
    expect(controls().filter((el) => sheet.contains(el)).length).toBeGreaterThanOrEqual(atLeast)
    expectReachable(`${name} open`)
    expectNamed(`${name} open`)
  })
})

describe("App: every control works from the keyboard (Req 24.1)", () => {
  it("on today's street: native controls, all focusable, none out of the Tab order", () => {
    renderSample()
    // The Triage disclosure's summary is one of the controls checked (Req 33.3).
    expect(controls().filter((el) => el.tagName === "SUMMARY").map((el) => el.textContent)).toEqual([
      "How does this work?",
    ])
    expectReachable("today")
  })

  it("during a preview too: the blocked write controls stay in the Tab order", () => {
    renderSample()
    jumpAhead90Days()
    expectReachable("preview")
  })

  it("the dock's toggle is a native button with aria-expanded and a name in words, collapsed and expanded (task L2, Req 34.3)", () => {
    renderSample()
    const toggle = screen.getByRole("button", { name: "Coming up" })
    expect(controls()).toContain(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expectReachable("collapsed dock")
    fireEvent.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(accessibleName(toggle).trim()).toBe("Coming up")
    expectReachable("expanded dock")
    expectNamed("expanded dock")
  })

  it("every button has a name in words and every field a label, today and in a preview", () => {
    renderSample()
    expectNamed("today")
    jumpAhead90Days()
    expectNamed("preview")
  })

  it("hover is never the only cue: each :hover rule has a matching :focus-visible rule in the app's CSS", () => {
    const missing: string[] = []
    for (const rel of listFiles(join(SRC_DIR, "styles"), (r) => r.endsWith(".css"))) {
      const css = stripComments(readText(join(SRC_DIR, "styles", rel)))
      for (const [, selectorList] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        const selectors = selectorList!.split(",").map((s) => s.trim())
        for (const selector of selectors.filter((s) => s.includes(":hover"))) {
          const focus = ["focus-visible", "focus", "focus-within"].map((f) => selector.replace(/:hover/g, `:${f}`))
          if (!focus.some((f) => selectors.includes(f))) missing.push(`${rel}: ${selector}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe("App: the hero's loss forecast line (task P4, Req 35.10)", () => {
  it("is not inside any live region and is not in the Tab order", () => {
    renderSample()
    const line = document.querySelector<HTMLElement>(".gh-hero-loss")!
    expect(line.textContent).toBe("If you do nothing, in the next 7 days 1 window starts to flicker.")
    expect(line.closest("[aria-live]")).toBeNull()
    expect(line.closest("[role='status'], [role='alert']")).toBeNull()
    expect(line.hasAttribute("tabindex")).toBe(false)
    expect(controls()).not.toContain(line)
    expect(controls().some((el) => line.contains(el))).toBe(false)
  })
})

describe("App: the Triage saves line (task P5, Req 36.9)", () => {
  it("is a plain paragraph, not inside any live region and not in the Tab order", () => {
    renderSample()
    // 15 days ahead, where the line shows at 30 minutes (design section 13.7).
    fireEvent.change(screen.getByRole("slider"), { target: { value: String(15 * DAY_MS) } })
    const line = document.querySelector<HTMLElement>(".gh-triage .shell-triage-note")!
    expect(line.tagName).toBe("P")
    expect(line.textContent).toBe("A call or meet-up with these people keeps 1 window from going dark in the next 7 days.")
    expect(line.closest("[aria-live]")).toBeNull()
    expect(line.closest("[role='status'], [role='alert']")).toBeNull()
    expect(line.hasAttribute("role")).toBe(false)
    expect(line.hasAttribute("tabindex")).toBe(false)
    expect(controls()).not.toContain(line)
    expect(controls().some((el) => line.contains(el))).toBe(false)
    // Every control still passes the keyboard checks with the line on the page.
    expectReachable("preview 15 days ahead, with the saves line")
  })
})

describe("App: the autopsy's rescue line (task R1, Req 37.8)", () => {
  it("is the second plain paragraph, not in a live region and not focusable; focus still opens on the title", () => {
    renderSample()
    fireEvent.click(within(card("Empty windows", "Ayesha Khan")).getByRole("button", { name: "Autopsy" }))
    const dialog = openDialog()!
    const paragraphs = [...dialog.querySelectorAll<HTMLElement>(".shell-autopsy-sentence")]
    const line = paragraphs[1]!
    expect(line.tagName).toBe("P")
    expect(line.textContent).toMatch(/^A call on .+, when the window started to flicker, would have kept the light on until .+, 16 days longer\.$/)
    expect(line.closest("[aria-live]")).toBeNull()
    expect(line.closest("[role='status'], [role='alert']")).toBeNull()
    expect(line.hasAttribute("role")).toBe(false)
    expect(line.hasAttribute("tabindex")).toBe(false)
    expect(controls()).not.toContain(line)
    expect(controls().some((el) => line.contains(el))).toBe(false)
    // Req 28.5: the title has focus, not the line.
    expect(document.activeElement?.tagName).toBe("H2")
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it("Tomas Novak, who started dark, has no rescue line", () => {
    renderSample()
    fireEvent.click(within(card("Empty windows", "Tomas Novak")).getByRole("button", { name: "Autopsy" }))
    const texts = [...openDialog()!.querySelectorAll(".shell-autopsy-sentence")].map((p) => p.textContent ?? "")
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some((t) => t.startsWith("A call on"))).toBe(false)
  })
})

describe("App: dialogs (Req 24.2, 24.3)", () => {
  type Opener = { name: string; opener: () => HTMLElement }
  const OPENERS: readonly Opener[] = [
    { name: "a Street window → the person dialog", opener: () => screen.getByRole("button", { name: /^Dan Okafor, flickering/ }) },
    { name: "a Still lit row's Open → the person dialog", opener: () => within(region("Still lit")).getByRole("button", { name: "Open Sunita Rao" }) },
    { name: "Reach out", opener: () => within(card("Fading", "Dan Okafor")).getByRole("button", { name: "Reach out" }) },
    { name: "Reconnect", opener: () => within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Reconnect" }) },
    { name: "Autopsy", opener: () => within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Autopsy" }) },
    { name: "Edit", opener: () => within(card("Fading", "Grace Liu")).getByRole("button", { name: "Edit" }) },
    { name: "Remove", opener: () => within(card("Fading", "Grace Liu")).getByRole("button", { name: "Remove" }) },
    { name: "Add a person", opener: () => screen.getByRole("button", { name: "Add a person" }) },
  ]

  it.each(OPENERS)("$name: opens as a modal with focus on its content, Escape closes it, focus returns", ({ opener }) => {
    renderSample()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal")
    const button = opener()
    button.focus()
    fireEvent.click(button)

    const dialog = openDialog()
    expect(dialog).not.toBeNull()
    expect(showModal).toHaveBeenCalledTimes(1)
    const focused = document.activeElement as HTMLElement
    expect(dialog!.contains(focused)).toBe(true)
    // Its content (a heading or the first line), never a button or a field.
    expect(["H2", "P"]).toContain(focused.tagName)
    expect(focused.getAttribute("tabindex")).toBe("-1")
    expect((focused.textContent ?? "").trim()).not.toBe("")

    fireEvent.keyDown(focused, { key: "Escape" })

    expect(openDialog()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it("Import people is gone from the page (feedback list, point 24)", () => {
    renderSample()
    expect(screen.queryByRole("button", { name: "Import people" })).toBeNull()
  })

  it("Reset all data, in the Settings sheet: its confirmation opens as a modal with focus on its content, Escape closes only it, focus returns", () => {
    renderSample()
    openSettings()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal")
    const button = screen.getByRole("button", { name: "Reset all data" })
    button.focus()
    fireEvent.click(button)

    expect(showModal).toHaveBeenCalledTimes(1)
    const confirm = screen.getByRole("dialog", { name: "Reset all data? This cannot be undone." })
    const focused = document.activeElement as HTMLElement
    expect(confirm.contains(focused)).toBe(true)
    expect(["H2", "P"]).toContain(focused.tagName)
    expect(focused.getAttribute("tabindex")).toBe("-1")

    fireEvent.keyDown(focused, { key: "Escape" })

    expect(screen.queryByRole("dialog", { name: "Reset all data? This cannot be undone." })).toBeNull()
    // The sheet under it stays open, and focus is back on the button that asked.
    expect(document.getElementById("gh-settings")!.hasAttribute("open")).toBe(true)
    expect(document.activeElement).toBe(button)
  })

  it("a dialog that removes its opener's card gives focus to the hero heading", () => {
    const engine = renderSample()
    const reconnect = within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Reconnect" })
    reconnect.focus()
    fireEvent.click(reconnect)
    const dialog = screen.getByRole("dialog", { name: "Reconnect with Leo Marchetti" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Had a call" }))
    // The result takes focus inside the dialog.
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }))

    expect(engine.view(T0).find((p) => p.payload.name === "Leo Marchetti")!.state).toBe("alive")
    // Leo moved to Still lit, so the Reconnect button that opened the dialog is gone.
    expect(reconnect.isConnected).toBe(false)
    expect(document.activeElement).toBe(heroHeading())
  })
})

describe("App: blocked write controls during a preview (Req 12.5)", () => {
  it("stay focusable, say why in their description, and do nothing when activated", () => {
    renderSample()
    jumpAhead90Days()
    // Restore and Reset all data are in the Settings sheet; they take focus only while it is open.
    openSettings()
    const blocked = [...document.querySelectorAll<HTMLElement>('[aria-disabled="true"]')]
    expect(blocked.length).toBeGreaterThan(10)
    for (const el of blocked) {
      const what = accessibleName(el).trim()
      expect(el.tagName, what).toBe("BUTTON")
      el.focus()
      expect(document.activeElement, what).toBe(el)
      expect(el.getAttribute("title"), what).toBe(previewBlockedText)
      fireEvent.click(el)
      // The blocked control opened nothing: the only open dialog is the Settings sheet the test opened.
      expect([...document.querySelectorAll("dialog[open]")].map((d) => d.id), what).toEqual(["gh-settings"])
    }
  })
})
