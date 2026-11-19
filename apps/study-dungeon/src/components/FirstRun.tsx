// The first-run welcome screen (task 11.3, Requirement 13.1-13.4).
// Two choices: "Load sample data" and "Start empty". The App decides when to
// show it (first-run.ts) and does the work; this only renders and reports
// the choice.

import { firstRunText } from "../wording"
import "../styles/hero.css"

export interface FirstRunProps {
  onLoadSample: () => void
  onStartEmpty: () => void
}

export function FirstRun({ onLoadSample, onStartEmpty }: FirstRunProps) {
  return (
    <section className="sd-first-run" aria-labelledby="sd-first-run-title">
      <h2 id="sd-first-run-title" className="sd-first-run-title">
        {firstRunText.title}
      </h2>
      <p>{firstRunText.intro}</p>
      <p>{firstRunText.choose}</p>
      <div className="sd-first-run-actions">
        <button type="button" className="sd-button sd-button-primary" onClick={onLoadSample}>
          {firstRunText.loadSample}
        </button>
        <button type="button" className="sd-button sd-button-quiet" onClick={onStartEmpty}>
          {firstRunText.startEmpty}
        </button>
      </div>
    </section>
  )
}
