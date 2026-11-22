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
import { T0, makeEngine } from "./test/fixtures"
import { listFiles, readText, SRC_DIR } from "./test/source-files"

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
const heroHeading = () => within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })[0]!
const region = (name: string) => screen.getByRole("region", { name })
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
const controls = () => [...document.querySelectorAll<HTMLElement>(CONTROLS)].filter((el) => !isHiddenFileInput(el))

function expectReachable(where: string) {
  const all = controls()
  expect(all.length, where).toBeGreaterThan(30)
  for (const el of all) {
    const what = `${where}: ${el.tagName.toLowerCase()} "${accessibleName(el).trim()}"`
    expect(["BUTTON", "SUMMARY", "INPUT", "SELECT", "TEXTAREA", "A"], what).toContain(el.tagName)
    expect(el.hasAttribute("disabled"), what).toBe(false)
    const tabindex = el.getAttribute("tabindex")
    expect(tabindex === null || Number(tabindex) === 0, `${what} tabindex ${tabindex}`).toBe(true)
    el.focus()
    expect(document.activeElement, what).toBe(el)
  }
  // Nothing anywhere jumps the Tab order (design section 9.5).
  const positive = [...document.querySelectorAll("[tabindex]")].filter((el) => Number(el.getAttribute("tabindex")) > 0)
  expect(positive).toEqual([])
  // tabindex -1 only on content that dialogs and the section navigation focus, never on a control.
  for (const el of document.querySelectorAll("[tabindex='-1']")) {
    if (isHiddenFileInput(el)) continue
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
    fireEvent.click(screen.getByRole("button", { name: "+90 days" }))
    expectReachable("preview")
  })

  it("every button has a name in words and every field a label, today and in a preview", () => {
    renderSample()
    expectNamed("today")
    fireEvent.click(screen.getByRole("button", { name: "+90 days" }))
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

describe("App: dialogs (Req 24.2, 24.3)", () => {
  type Opener = { name: string; opener: () => HTMLElement }
  const OPENERS: readonly Opener[] = [
    { name: "a Street window → the person dialog", opener: () => screen.getByRole("button", { name: /^Dan Okafor, flickering/ }) },
    { name: "a Still lit row's Open → the person dialog", opener: () => screen.getByRole("button", { name: "Open Sunita Rao" }) },
    { name: "Reach out", opener: () => within(card("Fading", "Dan Okafor")).getByRole("button", { name: "Reach out" }) },
    { name: "Reconnect", opener: () => within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Reconnect" }) },
    { name: "Autopsy", opener: () => within(card("Empty windows", "Leo Marchetti")).getByRole("button", { name: "Autopsy" }) },
    { name: "Edit", opener: () => within(card("Fading", "Grace Liu")).getByRole("button", { name: "Edit" }) },
    { name: "Remove", opener: () => within(card("Fading", "Grace Liu")).getByRole("button", { name: "Remove" }) },
    { name: "Add a person", opener: () => screen.getByRole("button", { name: "Add a person" }) },
    { name: "Import people", opener: () => screen.getByRole("button", { name: "Import people" }) },
    { name: "Reset all data", opener: () => screen.getByRole("button", { name: "Reset all data" }) },
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
    fireEvent.click(screen.getByRole("button", { name: "+90 days" }))
    const blocked = [...document.querySelectorAll<HTMLElement>('[aria-disabled="true"]')]
    expect(blocked.length).toBeGreaterThan(10)
    for (const el of blocked) {
      const what = accessibleName(el).trim()
      expect(el.tagName, what).toBe("BUTTON")
      el.focus()
      expect(document.activeElement, what).toBe(el)
      expect(el.getAttribute("title"), what).toBe(previewBlockedText)
      fireEvent.click(el)
      expect(openDialog(), what).toBeNull()
    }
  })
})
