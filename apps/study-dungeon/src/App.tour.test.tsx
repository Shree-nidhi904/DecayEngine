// @vitest-environment jsdom
//
// The first-run tour (task 11.5, Requirement 13.5): four steps (the Crypt,
// the Dungeon, Fight, the time machine) right after first run, shown once,
// skippable and usable with the keyboard alone. The "done" flag is
// "study-dungeon:tour-done" in the same injected storage as the first-run
// flag, and "Reset all data" removes it.
//
// A real DecayEngine on InMemoryAdapter, the in-memory storage from app-kit,
// fixed times. Keys are pressed with user-event (no delays, no timers).

import "./test/dialog-polyfill"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryStorage, makeAppKit } from "./test/app-kit"
import { day } from "./test/fixtures"
import { TOUR_TARGET_ATTRIBUTE } from "./components/Tour"
import { RESET_KEYS, STARTED_FLAG, TOUR_DONE_FLAG, ENGINE_STORAGE_KEY } from "./first-run"
import { SOUND_SETTING_KEY } from "./sound"

afterEach(cleanup)

const button = (name: string) => screen.getByRole("button", { name })
const tour = () => screen.queryByRole("complementary", { name: "Tour" })
const stepTitle = () => tour()!.querySelector("h2")!.textContent
const stepProgress = () => tour()!.querySelector(".sd-tour-progress")!.textContent
/** The elements the current step outlines. */
const outlined = () => [...document.querySelectorAll(`[${TOUR_TARGET_ATTRIBUTE}]`)]

describe("the tour", () => {
  it("follows Load sample data and walks through four steps with Enter and Space alone", async () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Load sample data"))
    const user = userEvent.setup({ delay: null })

    // Step 1: the Crypt tab is outlined, and focus is on Next.
    expect(stepProgress()).toBe("Step 1 of 4")
    expect(stepTitle()).toBe("The Crypt")
    expect(outlined()).toEqual([document.getElementById("sd-tab-alive")])
    expect(document.activeElement).toBe(button("Next"))

    await user.keyboard("{Enter}")
    expect(stepProgress()).toBe("Step 2 of 4")
    expect(stepTitle()).toBe("The Dungeon")
    expect(outlined()).toEqual([document.getElementById("sd-tab-weak")])

    // The sample has 4 weak facts, so the hero offers "Fight the weakest".
    await user.keyboard(" ")
    expect(stepTitle()).toBe("Fight")
    expect(outlined()).toEqual([button("Fight the weakest")])

    await user.keyboard("{Enter}")
    expect(stepTitle()).toBe("The time machine")
    expect(outlined()).toEqual([document.querySelector(".shell-time-machine")])
    expect(document.activeElement).toBe(button("Done"))

    // Not done yet: only the first-run flag is stored.
    expect(kit.storage.entries()).toEqual({ [STARTED_FLAG]: "1" })

    await user.keyboard("{Enter}")
    expect(tour()).toBeNull()
    expect(outlined()).toEqual([])
    expect(kit.storage.entries()).toEqual({ [STARTED_FLAG]: "1", [TOUR_DONE_FLAG]: "1" })
    // Focus goes to the page, not lost on a removed button.
    expect(document.activeElement).toBe(screen.getByRole("main"))
  })

  it("Back returns to the previous step", async () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    fireEvent.click(button("Next"))
    expect(stepTitle()).toBe("The Dungeon")
    fireEvent.click(button("Back"))
    expect(stepTitle()).toBe("The Crypt")
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull()
  })

  it("Start empty: the Fight step has nothing to outline and still shows its words", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    fireEvent.click(button("Next"))
    fireEvent.click(button("Next"))
    expect(stepTitle()).toBe("Fight")
    expect(outlined()).toEqual([])
    expect(tour()!.textContent).toContain("Show the answer, then say if you knew it.")
  })

  it("Escape skips it and saves the flag", async () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    const user = userEvent.setup({ delay: null })
    expect(tour()).not.toBeNull()

    await user.keyboard("{Escape}")

    expect(tour()).toBeNull()
    expect(kit.storage.entries()).toEqual({ [STARTED_FLAG]: "1", [TOUR_DONE_FLAG]: "1" })
  })

  it("Skip tour is reached with Shift+Tab from Next and pressed with Enter", async () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    const user = userEvent.setup({ delay: null })

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(button("Skip tour"))
    await user.keyboard("{Enter}")

    expect(tour()).toBeNull()
    expect(kit.storage.entries()[TOUR_DONE_FLAG]).toBe("1")
  })

  it("is shown once: after it is done, a new visit shows neither first run nor the tour", () => {
    const kit = makeAppKit(new MemoryStorage())
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    fireEvent.click(button("Skip tour"))
    cleanup()

    kit.renderApp(day(61))
    expect(screen.queryByRole("heading", { name: "Welcome to the Study Dungeon" })).toBeNull()
    expect(tour()).toBeNull()
  })

  it("is not shown to someone who did it before, even after first run", () => {
    const kit = makeAppKit(new MemoryStorage({ [TOUR_DONE_FLAG]: "1" }))
    kit.renderApp(day(60))
    fireEvent.click(button("Start empty"))
    expect(tour()).toBeNull()
  })

  it("is not shown on a normal visit (first run already done)", () => {
    const kit = makeAppKit() // started flag set
    kit.add("a", "solid", day(0))
    kit.renderApp(day(1))
    expect(tour()).toBeNull()
  })
})

describe("Reset all data and the tour flag", () => {
  it("RESET_KEYS are the snapshot, the first-run flag and the tour flag", () => {
    expect(RESET_KEYS).toEqual([ENGINE_STORAGE_KEY, STARTED_FLAG, TOUR_DONE_FLAG])
  })

  it("reset removes the tour flag (so first run and the tour come back) and keeps the sound setting", () => {
    const storage = new MemoryStorage({
      [STARTED_FLAG]: "1",
      [TOUR_DONE_FLAG]: "1",
      [ENGINE_STORAGE_KEY]: "{}",
      [SOUND_SETTING_KEY]: "on",
      unrelated: "keep me",
    })
    const kit = makeAppKit(storage)
    kit.add("a", "solid", day(0))
    kit.renderApp(day(1))
    fireEvent.click(button("Reset all data"))
    fireEvent.click(button("Reset"))
    expect(storage.entries()).toEqual({ [SOUND_SETTING_KEY]: "on", unrelated: "keep me" })
    expect(kit.reload).toHaveBeenCalledTimes(1)
  })
})
