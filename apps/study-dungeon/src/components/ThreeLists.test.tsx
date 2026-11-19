// @vitest-environment jsdom
//
// Tests that the cards' buttons reach the App with the right fact
// (tasks 5.1, 7.1 and 7.2). A real DecayEngine on InMemoryAdapter at fixed
// times; never the clock.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThreeLists } from "./ThreeLists"
import { day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

function setup() {
  const kit = makeEngine()
  // Day 8: "solid" is 100 × 0.5^(8/10) ≈ 57.4 (weak); "new" is 100 × 0.5^4 = 6.25 (dead).
  kit.add("weak-1", "solid", day(0))
  kit.add("dead-1", "new", day(0))
  const handlers = { onAction: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() }
  render(<ThreeLists engine={kit.engine} now={day(8)} version={0} {...handlers} />)
  return { ...handlers, user: userEvent.setup() }
}

describe("ThreeLists card buttons", () => {
  it("Edit on a card calls onEdit with that fact, and nothing else", async () => {
    const { user, onAction, onEdit, onRemove } = setup()
    // The Dungeon tab is selected first.
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]![0].id).toBe("weak-1")
    expect(onAction).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("Fight on a weak card asks for a tend", async () => {
    const { user, onAction } = setup()
    await user.click(screen.getByRole("button", { name: "Fight" }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![0].id).toBe("weak-1")
    expect(onAction.mock.calls[0]![1]).toBe("tend")
  })

  it("only graves get an Autopsy button, and it hands that fact to onAutopsy", async () => {
    const kit = makeEngine()
    kit.add("weak-1", "solid", day(0))
    kit.add("dead-1", "new", day(0))
    const onAutopsy = vi.fn()
    const user = userEvent.setup()
    render(
      <ThreeLists engine={kit.engine} now={day(8)} version={0} onAction={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onAutopsy={onAutopsy} />
    )
    // Dungeon first: no Autopsy on a weak fact.
    expect(screen.queryByRole("button", { name: "Autopsy" })).toBeNull()
    await user.click(screen.getByRole("tab", { name: /Graveyard/ }))
    await user.click(screen.getByRole("button", { name: "Autopsy" }))
    expect(onAutopsy).toHaveBeenCalledTimes(1)
    expect(onAutopsy.mock.calls[0]![0].id).toBe("dead-1")
  })

  it("keeps Autopsy enabled and working while writes are disabled", async () => {
    const kit = makeEngine()
    kit.add("dead-1", "new", day(0))
    const onAction = vi.fn()
    const onAutopsy = vi.fn()
    const user = userEvent.setup()
    render(
      <ThreeLists
        engine={kit.engine}
        now={day(8)}
        version={0}
        onAction={onAction}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onAutopsy={onAutopsy}
        writesDisabledReason="Reason-Text"
      />
    )
    await user.click(screen.getByRole("tab", { name: /Graveyard/ }))
    const autopsy = screen.getByRole("button", { name: "Autopsy" })
    expect(autopsy.hasAttribute("aria-disabled")).toBe(false)
    expect(screen.getByRole("button", { name: "Challenge" }).getAttribute("aria-disabled")).toBe("true")
    await user.click(autopsy)
    await user.click(screen.getByRole("button", { name: "Challenge" }))
    expect(onAutopsy).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  it("asks for the first fact when there are no facts at all", () => {
    const kit = makeEngine()
    render(<ThreeLists engine={kit.engine} now={day(0)} version={0} onAction={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText("Your Crypt has no facts yet. Use Add fact to put in your first one.")).toBeTruthy()
  })

  it("does not ask for a first fact when another list has facts", () => {
    const kit = makeEngine()
    kit.add("dead-1", "new", day(0))
    render(<ThreeLists engine={kit.engine} now={day(8)} version={0} onAction={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    // The Dungeon is empty, but the Graveyard is not.
    expect(screen.getByText("The Dungeon is empty.")).toBeTruthy()
    expect(screen.queryByText(/Use Add fact/)).toBeNull()
  })

  it("Challenge on a grave asks for a resurrect", async () => {
    const { user, onAction } = setup()
    await user.click(screen.getByRole("tab", { name: /Graveyard/ }))
    await user.click(screen.getByRole("button", { name: "Challenge" }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![0].id).toBe("dead-1")
    expect(onAction.mock.calls[0]![1]).toBe("resurrect")
  })
})
