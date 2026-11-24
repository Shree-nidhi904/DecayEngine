import { useMemo, useState } from "react"
import { PRESETS, runLab, type Sample } from "./lab"

const COLOR = { alive: "#7ee787", weak: "#ffd479", dead: "#ff6b6b" } as const

function Chart({ series, tendDay }: { series: Sample[]; tendDay: number | null }) {
  const W = 640
  const H = 220
  const last = Math.max(series.length - 1, 1)
  const x = (d: number) => 30 + (d / last) * (W - 40)
  const y = (h: number) => 10 + (1 - h / 100) * (H - 30)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Health of one item over time" className="chart">
      {[0, 50, 100].map((h) => (
        <g key={h}>
          <line x1={30} x2={W - 10} y1={y(h)} y2={y(h)} className="grid" />
          <text x={4} y={y(h) + 4} className="axis">{h}</text>
        </g>
      ))}
      {series.slice(1).map((s, i) => (
        <line key={s.day} x1={x(i)} y1={y(series[i].health)} x2={x(s.day)} y2={y(s.health)} stroke={COLOR[s.state]} strokeWidth={3} strokeLinecap="round" />
      ))}
      {tendDay !== null && tendDay <= last && (
        <g>
          <line x1={x(tendDay)} x2={x(tendDay)} y1={10} y2={H - 20} className="tend" />
          <text x={x(tendDay) + 4} y={22} className="axis">tended</text>
        </g>
      )}
      <text x={30} y={H - 4} className="axis">day 0</text>
      <text x={W - 10} y={H - 4} textAnchor="end" className="axis">day {last}</text>
    </svg>
  )
}

export function App() {
  const [presetIndex, setPresetIndex] = useState(0)
  const [source, setSource] = useState(PRESETS[0].source)
  const [payload, setPayload] = useState(PRESETS[0].payload)
  const [event, setEvent] = useState(PRESETS[0].event)
  const [tend, setTend] = useState<number | null>(PRESETS[0].tendDay)
  const [horizon, setHorizon] = useState(40)

  const result = useMemo(
    () => runLab({ source, payload, event, tendDay: tend, horizonDays: horizon }),
    [source, payload, event, tend, horizon]
  )

  function choose(i: number) {
    const p = PRESETS[i]
    setPresetIndex(i)
    setSource(p.source)
    setPayload(p.payload)
    setEvent(p.event)
    setTend(p.tendDay)
  }

  return (
    <main>
      <h1>Policy Lab</h1>
      <p className="lede">
        The engine knows nothing about milk, facts or friends. Write the decay rules below and the real engine runs them,
        unchanged. <code>checkPolicy</code> tells you if the rules are sound.
      </p>

      <div className="presets" role="group" aria-label="Example policies">
        {PRESETS.map((p, i) => (
          <button key={p.name} aria-pressed={i === presetIndex} onClick={() => choose(i)}>
            {p.name}
          </button>
        ))}
      </div>
      <p className="blurb">{PRESETS[presetIndex].blurb}</p>

      <div className="cols">
        <section>
          <label htmlFor="src">Policy (JavaScript object; <code>DAY</code> is one day in ms)</label>
          <textarea id="src" spellCheck={false} value={source} onChange={(e) => setSource(e.target.value)} rows={18} />
          <label htmlFor="pl">Item payload (JSON)</label>
          <input id="pl" value={payload} onChange={(e) => setPayload(e.target.value)} />
          <label htmlFor="ev">Event, like a review or a message (JSON)</label>
          <input id="ev" value={event} onChange={(e) => setEvent(e.target.value)} />
        </section>

        <section aria-live="polite">
          {!result.ok ? (
            <p className="error" role="alert">{result.error}</p>
          ) : (
            <>
              <p className={result.check.passed ? "verdict pass" : "verdict fail"}>
                {result.check.passed ? "checkPolicy: passed" : `checkPolicy: ${result.check.failures.length} problem${result.check.failures.length === 1 ? "" : "s"}`}
              </p>
              {!result.check.passed && (
                <ul className="failures">
                  {result.check.failures.slice(0, 5).map((f) => <li key={f}>{f}</li>)}
                  {result.check.failures.length > 5 && <li>…and {result.check.failures.length - 5} more</li>}
                </ul>
              )}
              <Chart series={result.series} tendDay={tend} />
              <p className="legend">
                <span style={{ color: COLOR.alive }}>alive</span> · <span style={{ color: COLOR.weak }}>weak</span> ·{" "}
                <span style={{ color: COLOR.dead }}>dead</span>
                {" — "}
                {result.weakDay === null ? "never weak in this window" : `weak on day ${result.weakDay}`}
                {result.deadDay === null ? ", still alive at the end" : `, dead on day ${result.deadDay}`}
              </p>
              {result.tendError && <p className="error">Tend failed: {result.tendError}</p>}
            </>
          )}
          <div className="controls">
            <label htmlFor="td">Tend on day</label>
            <input id="td" type="number" min={0} max={730} value={tend ?? ""} placeholder="never"
              onChange={(e) => setTend(e.target.value === "" ? null : Number(e.target.value))} />
            <label htmlFor="hz">Show days</label>
            <input id="hz" type="number" min={1} max={730} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} />
          </div>
        </section>
      </div>

      <footer>
        <a href="https://github.com/Shree-nidhi904/DecayEngine/blob/main/docs/ADDING_A_POLICY.md">Adding a policy</a> ·{" "}
        <a href="https://decay-engine-study-dungeon.netlify.app">Study Dungeon</a> ·{" "}
        <a href="https://decay-engine-ghosted.netlify.app">Ghosted</a>
      </footer>
    </main>
  )
}
