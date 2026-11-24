import { useMemo, useState } from "react"
import { PRESETS, clampHorizon, clampTendDay, runLab, type Sample, MAX_FAILURES_SHOWN, MAX_LAB_DAYS } from "./lab"
import { labText } from "./text"

const COLOR = { alive: "#7ee787", weak: "#ffd479", dead: "#ff6b6b" } as const

type State = keyof typeof COLOR

/** The state's shape (circle, triangle, cross), so state is never shown by colour alone. */
function Shape({ state, x, y, size = 6 }: { state: State; x: number; y: number; size?: number }) {
  const s = size
  if (state === "alive") return <circle cx={x} cy={y} r={s} fill="none" stroke={COLOR.alive} strokeWidth={2} />
  if (state === "weak") {
    return (
      <path d={`M ${x} ${y - s} L ${x + s} ${y + s} L ${x - s} ${y + s} Z`} fill="none" stroke={COLOR.weak} strokeWidth={2} />
    )
  }
  return (
    <path d={`M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x + s} ${y - s} L ${x - s} ${y + s}`} stroke={COLOR.dead} strokeWidth={2} />
  )
}

function LegendItem({ state }: { state: State }) {
  return (
    <span className="legend-item">
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false">
        <Shape state={state} x={8} y={8} size={5} />
      </svg>{" "}
      <span style={{ color: COLOR[state] }}>{labText.states[state]}</span>
    </span>
  )
}

export function Chart({
  series,
  tendDay,
  thresholds,
  weakDay,
  deadDay,
}: {
  series: Sample[]
  tendDay: number | null
  thresholds: { weak: number; dead: number }
  weakDay: number | null
  deadDay: number | null
}) {
  const W = 640
  const H = 220
  const last = Math.max(series.length - 1, 1)
  const x = (d: number) => 30 + (d / last) * (W - 40)
  const y = (h: number) => 10 + (1 - h / 100) * (H - 30)
  const at = (day: number | null) => (day === null ? undefined : series.find((s) => s.day === day))
  const weakPoint = at(weakDay)
  const deadPoint = at(deadDay)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={labText.chartSummary(series.length - 1, weakDay, deadDay)}
      className="chart"
    >
      {[0, 100].map((h) => (
        <g key={h}>
          <line x1={30} x2={W - 10} y1={y(h)} y2={y(h)} className="grid" />
          <text x={4} y={y(h) + 4} className="axis">{h}</text>
        </g>
      ))}
      <g className="threshold" data-threshold="weak">
        <line x1={30} x2={W - 10} y1={y(thresholds.weak)} y2={y(thresholds.weak)} stroke={COLOR.weak} />
        <text x={W - 12} y={y(thresholds.weak) - 4} textAnchor="end" className="axis">{labText.weakLine(thresholds.weak)}</text>
      </g>
      <g className="threshold" data-threshold="dead">
        <line x1={30} x2={W - 10} y1={y(thresholds.dead)} y2={y(thresholds.dead)} stroke={COLOR.dead} />
        <text x={W - 12} y={y(thresholds.dead) - 4} textAnchor="end" className="axis">{labText.deadLine(thresholds.dead)}</text>
      </g>
      {series.slice(1).map((s, i) => (
        <line key={s.day} x1={x(i)} y1={y(series[i].health)} x2={x(s.day)} y2={y(s.health)} stroke={COLOR[s.state]} strokeWidth={3} strokeLinecap="round" />
      ))}
      {series.length > 0 && <Shape state={series[0].state} x={x(0)} y={y(series[0].health)} />}
      {weakPoint !== undefined && weakPoint.state === "weak" && <Shape state="weak" x={x(weakPoint.day)} y={y(weakPoint.health)} />}
      {deadPoint !== undefined && <Shape state="dead" x={x(deadPoint.day)} y={y(deadPoint.health)} />}
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
      <h1>{labText.title}</h1>
      <p className="lede">{labText.lede}</p>
      <p className="lede">{labText.checks}</p>

      <div className="presets" role="group" aria-label={labText.presetsLabel}>
        {PRESETS.map((p, i) => (
          <button key={p.name} type="button" aria-pressed={i === presetIndex} onClick={() => choose(i)}>
            {p.name}
          </button>
        ))}
      </div>
      <p className="blurb">{PRESETS[presetIndex].blurb}</p>

      <div className="cols">
        <section>
          <p id="lab-warning" className="warn">{labText.warning}</p>
          <label htmlFor="src">{labText.editorLabel}</label>
          <textarea
            id="src"
            spellCheck={false}
            aria-describedby="lab-warning"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={18}
          />
          <label htmlFor="pl">{labText.payloadLabel}</label>
          <input id="pl" value={payload} onChange={(e) => setPayload(e.target.value)} />
          <label htmlFor="ev">{labText.eventLabel}</label>
          <input id="ev" value={event} onChange={(e) => setEvent(e.target.value)} />
          <p id="lab-limits" className="legend">{labText.limits}</p>
        </section>

        <section aria-live="polite">
          {!result.ok ? (
            <p className="error" role="alert">{result.error}</p>
          ) : (
            <>
              <p className={result.check.passed ? "verdict pass" : "verdict fail"}>
                {result.check.passed ? labText.passed : labText.problems(result.check.failures.length)}
              </p>
              {!result.check.passed && (
                <ul className="failures">
                  {result.check.failures.slice(0, MAX_FAILURES_SHOWN).map((f) => <li key={f}>{f}</li>)}
                  {result.check.failures.length > MAX_FAILURES_SHOWN && (
                    <li>{labText.more(result.check.failures.length - MAX_FAILURES_SHOWN)}</li>
                  )}
                </ul>
              )}
              <Chart
                series={result.series}
                tendDay={tend}
                thresholds={result.thresholds}
                weakDay={result.weakDay}
                deadDay={result.deadDay}
              />
              <p className="legend">
                <LegendItem state="alive" /> · <LegendItem state="weak" /> · <LegendItem state="dead" />
                {" — "}
                {labText.weakDay(result.weakDay)}, {labText.deadDay(result.deadDay)}
              </p>
              {result.tendError && <p className="error">{labText.tendFailed(result.tendError)}</p>}
            </>
          )}
          <div className="controls">
            <label htmlFor="td">{labText.tendLabel}</label>
            <input id="td" type="number" min={0} max={MAX_LAB_DAYS} value={tend ?? ""} placeholder="never" aria-describedby="lab-limits"
              onChange={(e) => setTend(e.target.value === "" ? null : clampTendDay(Number(e.target.value)))} />
            <label htmlFor="hz">{labText.horizonLabel}</label>
            <input id="hz" type="number" min={1} max={MAX_LAB_DAYS} value={horizon} aria-describedby="lab-limits"
              onChange={(e) => setHorizon(clampHorizon(Number(e.target.value)))} />
          </div>
        </section>
      </div>

      <footer>
        <a href="https://github.com/Shree-nidhi904/DecayEngine/blob/main/docs/ADDING_A_POLICY.md">Adding a policy</a> ·{" "}
        <a href="https://decay-engine-study-dungeon.netlify.app">Study Dungeon</a> ·{" "}
        <a href="https://decay-engine-ghosted.netlify.app">Ghosted</a> ·{" "}
        <a href="https://decay-engine-life-triage-app.netlify.app">Life Triage</a>
      </footer>
    </main>
  )
}
