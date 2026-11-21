// ForecastControl (task 5.2; Req 22.1-22.4, 16.1). The sample street replayed
// through a real engine on InMemoryAdapter at T0 (design section 6.3: within
// 30 days Sunita, Meera and Dan go dark; Grace just after day 30, so she is
// not listed; nobody within 7 days). Dates in UTC. Never the real clock.

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ForecastControl } from "./ForecastControl"
import type { GhostedEngine } from "../engine-instance"
import { loadSampleData } from "../sample-data"
import { DAY_MS, T0, day, makeEngine } from "../test/fixtures"

afterEach(cleanup)

const format = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const formatDate = (ms: number) => format.format(ms)

function setup(now = T0, engine: GhostedEngine = sampleEngine()) {
  const forecast = vi.spyOn(engine, "forecast")
  const result = render(<ForecastControl engine={engine} now={now} version={0} formatDate={formatDate} />)
  const region = screen.getByRole("region", { name: "Forecast" })
  return { ...result, engine, forecast, region }
}

function sampleEngine(): GhostedEngine {
  const engine = makeEngine()
  loadSampleData(engine, T0)
  return engine
}

const entries = (region: HTMLElement) => [...region.querySelectorAll<HTMLElement>(".gh-forecast-entry")]
const entryNames = (region: HTMLElement) =>
  entries(region).map((li) => li.querySelector(".gh-forecast-text")!.textContent!.replace(/ goes dark on .*$/, ""))
const choose = (region: HTMLElement, label: string) => fireEvent.click(within(region).getByRole("radio", { name: label }))

describe("the horizons (Req 22.1)", () => {
  it("offers 7, 30 and 90 days, in that order, with 30 selected", () => {
    const { region } = setup()
    const radios = within(region).getAllByRole("radio") as HTMLInputElement[]
    expect(radios.map((r) => r.labels![0]!.textContent)).toEqual(["7 days", "30 days", "90 days"])
    expect(radios.map((r) => r.checked)).toEqual([false, true, false])
    expect(within(region).getByRole("group", { name: "Look ahead" })).toBeTruthy()
  })
})

describe("the list (Req 22.2, 16.1)", () => {
  it("at 30 days: Sunita, Meera and Dan, soonest first, each going dark on the engine's date", () => {
    const { region, engine, forecast } = setup()
    expect(forecast).toHaveBeenLastCalledWith(T0, 30 * DAY_MS)
    expect(entryNames(region)).toEqual(["Sunita Rao", "Meera Joshi", "Dan Okafor"])
    const expected = engine.forecast(T0, 30 * DAY_MS)
    expect(entries(region).map((li) => li.querySelector(".gh-forecast-text")!.textContent)).toEqual(
      expected.map((e) => `${e.item.payload.name} goes dark on ${formatDate(e.diesAt)}`)
    )
    // Grace goes dark just after day 30, so she is outside the horizon.
    expect(region.textContent).not.toContain("Grace Liu")
  })

  it("each entry shows the glyph and the state word at now", () => {
    const { region } = setup()
    const shown = entries(region).map((li) => [
      li.querySelector("[data-glyph]")!.getAttribute("data-glyph"),
      li.querySelector(".gh-state")!.textContent!.trim(),
    ])
    // Sunita is still lit today; Meera and Dan are flickering.
    expect(shown).toEqual([
      ["circle", "lit"],
      ["triangle", "flickering"],
      ["triangle", "flickering"],
    ])
  })

  it("at 90 days the list grows, in the engine's order", () => {
    const { region, forecast } = setup()
    choose(region, "90 days")
    expect(forecast).toHaveBeenLastCalledWith(T0, 90 * DAY_MS)
    expect(entryNames(region)).toEqual(["Sunita Rao", "Meera Joshi", "Dan Okafor", "Grace Liu", "Sam Rivera", "Priya Raman"])
  })
})

describe("nobody in the horizon (Req 22.3)", () => {
  it('at 7 days: "Nobody goes dark in the next 7 days."', () => {
    const { region, forecast } = setup()
    choose(region, "7 days")
    expect(forecast).toHaveBeenLastCalledWith(T0, 7 * DAY_MS)
    expect(entries(region)).toEqual([])
    expect(within(region).getByText("Nobody goes dark in the next 7 days.")).toBeTruthy()
  })

  it("an empty street says so for the default horizon", () => {
    const { region } = setup(T0, makeEngine())
    expect(within(region).getByText("Nobody goes dark in the next 30 days.")).toBeTruthy()
  })
})

describe("during a preview (Req 22.4)", () => {
  it("looks ahead from the previewed time, with the states at that time", () => {
    // Ten days ahead, 7 days: only Sunita (dark on day 12.9), by then flickering.
    const { region, forecast } = setup(day(10))
    choose(region, "7 days")
    expect(forecast).toHaveBeenLastCalledWith(day(10), 7 * DAY_MS)
    expect(entryNames(region)).toEqual(["Sunita Rao"])
    expect(entries(region)[0]!.querySelector(".gh-state")!.textContent!.trim()).toBe("flickering")
  })
})

describe("after a write", () => {
  it("reads the forecast again when the version changes", () => {
    const engine = sampleEngine()
    const { region, rerender } = setup(T0, engine)
    const dan = engine.view(T0).find((p) => p.payload.name === "Dan Okafor")!
    engine.tend(dan.id, { kind: "call" }, T0)
    rerender(<ForecastControl engine={engine} now={T0} version={1} formatDate={formatDate} />)
    expect(entryNames(region)).toEqual(["Sunita Rao", "Meera Joshi"])
  })
})
