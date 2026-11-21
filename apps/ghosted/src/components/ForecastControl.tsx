// The forecast control (task 5.2, design section 4.4 ForecastControl;
// Req 22.1-22.4, 16.1): who goes dark within 7, 30 or 90 days.
//
// Three radio choices with 30 selected first. The list is
// engine.forecast(now, H × DAY_MS) in the engine's order (soonest first,
// ties by id), each entry as "<name> goes dark on <date>" with the person's
// glyph and state word at `now`. With nobody in the horizon it says "Nobody
// goes dark in the next H days." During a preview `now` is the previewed
// time, so the forecast looks ahead from the day shown (Req 22.4).
//
// Read only: it never writes, so it is not blocked during a preview.
// Engine calls: forecast.

import { useId, useMemo, useState } from "react"
import type { GhostedEngine } from "../engine-instance"
import { shownState } from "../lists"
import { DAY_MS } from "../time"
import { forecastText, stateWords } from "../wording"
import { StateGlyph } from "./icons"
import "../styles/layout.css"

/** The horizons offered, in days, in this order (Req 22.1). */
export const FORECAST_HORIZONS: readonly number[] = [7, 30, 90]
/** Selected first (Req 22.1). */
export const FORECAST_DEFAULT_DAYS = 30

export interface ForecastControlProps {
  engine: Pick<GhostedEngine, "forecast">
  /** The time shown: the previewed time while previewing (Req 22.4). */
  now: number
  /** Bumped after every write, so the forecast is read again. */
  version: number
  /** "14 Nov 2023". */
  formatDate: (ms: number) => string
}

export function ForecastControl({ engine, now, version, formatDate }: ForecastControlProps) {
  const id = useId()
  const titleId = `${id}-title`
  const [days, setDays] = useState(FORECAST_DEFAULT_DAYS)
  // `version` is a dependency on purpose: a write changes the forecast at the same `now`.
  const entries = useMemo(() => engine.forecast(now, days * DAY_MS), [engine, now, version, days])

  return (
    <section className="gh-forecast" aria-labelledby={titleId}>
      <h2 id={titleId} className="gh-forecast-title">
        {forecastText.title}
      </h2>
      <fieldset className="gh-forecast-horizons">
        <legend>{forecastText.horizonLabel}</legend>
        {FORECAST_HORIZONS.map((n) => (
          <label key={n} className="gh-forecast-choice">
            <input
              type="radio"
              name={`${id}-horizon`}
              value={n}
              checked={days === n}
              onChange={() => setDays(n)}
            />
            {forecastText.horizon(n)}
          </label>
        ))}
      </fieldset>
      <div aria-live="polite">
        {entries.length === 0 ? (
          <p className="gh-forecast-empty">{forecastText.nobody(days)}</p>
        ) : (
          <ol className="gh-forecast-list">
            {entries.map(({ item, diesAt }) => {
              const state = shownState(item)
              return (
                <li key={item.id} className="gh-forecast-entry" data-state={state}>
                  <span className="gh-state" data-state={state}>
                    <StateGlyph state={state} /> {stateWords[state]}
                  </span>
                  <span className="gh-forecast-text">{forecastText.entry(item.payload.name, formatDate(diesAt))}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
