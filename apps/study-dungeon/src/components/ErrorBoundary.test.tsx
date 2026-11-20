// @vitest-environment jsdom
// Tests for the error boundary and the problem screen (task 18.3).
//
// Written by - Opus 5.5 at the developer's request; see .kiro/steering/authorship.md.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { ErrorBoundary, ProblemScreen, problemScreenText } from "./ErrorBoundary"
import { storageProblemText } from "../storage-errors"

afterEach(cleanup)

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom")
  return <p>All quiet</p>
}

/** Renders a child that throws once a button is pressed, as a real crash would. */
function Harness(props: { log: (e: unknown) => void; reload: () => void; onReset?: () => void }) {
  const [explode, setExplode] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setExplode(true)}>
        break it
      </button>
      <ErrorBoundary log={props.log} reload={props.reload} onReset={props.onReset}>
        <Bomb explode={explode} />
      </ErrorBoundary>
    </>
  )
}

describe("ErrorBoundary", () => {
  it("shows its children while nothing goes wrong", () => {
    const log = vi.fn()
    render(<Harness log={log} reload={vi.fn()} />)
    expect(screen.getByText("All quiet")).toBeTruthy()
    expect(log).not.toHaveBeenCalled()
  })

  it("replaces a crash with the problem screen, logs the error, and offers reload", async () => {
    const log = vi.fn()
    const reload = vi.fn()
    // React reports caught render errors to console.error as well; keep test output clean.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
    // In development React also rethrows it through a window "error" event, which jsdom prints.
    const swallow = (event: ErrorEvent) => event.preventDefault()
    window.addEventListener("error", swallow)
    render(<Harness log={log} reload={reload} />)
    await userEvent.click(screen.getByRole("button", { name: "break it" }))
    window.removeEventListener("error", swallow)

    expect(screen.queryByText("All quiet")).toBeNull()
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByRole("heading", { name: problemScreenText.title })).toBeTruthy()
    expect(screen.getByText(problemScreenText.crashed)).toBeTruthy()
    expect(log).toHaveBeenCalledTimes(1)
    expect((log.mock.calls[0]![0] as Error).message).toBe("kaboom")

    await userEvent.click(screen.getByRole("button", { name: problemScreenText.reload }))
    expect(reload).toHaveBeenCalledTimes(1)
    // No reset offered unless the app passes one.
    expect(screen.queryByRole("button", { name: problemScreenText.reset })).toBeNull()
    quiet.mockRestore()
  })
})

describe("ProblemScreen", () => {
  it("shows the storage message it is given", () => {
    render(<ProblemScreen message={storageProblemText.corrupt} reload={vi.fn()} />)
    expect(screen.getByText(storageProblemText.corrupt)).toBeTruthy()
  })

  it("asks before resetting, and resets only on confirm", async () => {
    const onReset = vi.fn()
    render(<ProblemScreen message={storageProblemText.corrupt} reload={vi.fn()} onReset={onReset} />)
    await userEvent.click(screen.getByRole("button", { name: problemScreenText.reset }))
    expect(screen.getByText(problemScreenText.confirmReset)).toBeTruthy()
    expect(onReset).not.toHaveBeenCalled()

    // Cancel goes back without resetting; Cancel has focus first, so Enter is safe.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: problemScreenText.cancel }))
    await userEvent.keyboard("{Enter}")
    expect(onReset).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: problemScreenText.reload })).toBeTruthy()

    await userEvent.click(screen.getByRole("button", { name: problemScreenText.reset }))
    await userEvent.click(screen.getByRole("button", { name: problemScreenText.confirm }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it("can be used with the keyboard alone", async () => {
    const reload = vi.fn()
    render(<ProblemScreen message="x" reload={reload} onReset={vi.fn()} />)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: problemScreenText.reload }))
    await userEvent.keyboard("{Enter}")
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
