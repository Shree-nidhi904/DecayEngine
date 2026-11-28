import { useMemo, useState } from "react"
import { lifeTriage, type Source } from "@decay-engine/life-triage"
import { sampleSources } from "./load"
import { AccountLoader } from "./AccountLoader"
import { readBackupFiles } from "./files"
import { MAX_AHEAD_DAYS, clampAhead, clampBudget, detailOf, ltText, nameOf } from "./text"

const DAY = 86_400_000

export interface AppProps {
  /** The time the page treats as now. Defaults to the clock, read once; tests pass a fixed time. */
  now?: number
}

export function App({ now: fixedNow }: AppProps = {}) {
  const [now] = useState(() => fixedNow ?? Date.now())
  const [sources, setSources] = useState<Source[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [budgetInput, setBudgetInput] = useState(30)
  const [aheadInput, setAheadInput] = useState(0)

  const budget = clampBudget(budgetInput)
  const ahead = clampAhead(aheadInput)
  const at = now + ahead.days * DAY
  const result = useMemo(() => {
    if (sources.length === 0) return null
    try {
      return lifeTriage(sources, budget.minutes, at)
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [sources, budget.minutes, at])

  async function onFiles(files: FileList | null) {
    if (!files) return
    const read = await readBackupFiles(Array.from(files), sources)
    setSources(read.sources)
    setNotes(read.notes)
  }

  return (
    <main>
      <h1>{ltText.title}</h1>
      <p className="lede">{ltText.lede}</p>
      <p id="lt-limits" className="lede">{ltText.limits}</p>

      <div className="presets">
        <label className="filebtn">
          {ltText.loadFiles}
          <input type="file" accept="application/json,.json" multiple onChange={(e) => onFiles(e.target.files)} />
        </label>
        <button type="button" onClick={() => { setSources(sampleSources(now)); setNotes([ltText.sampleLoaded]) }}>
          {ltText.sample}
        </button>
      </div>
      <AccountLoader
        existing={sources}
        onLoaded={(next, accountNotes) => {
          setSources(next)
          setNotes(accountNotes)
        }}
      />
      {notes.length > 0 && (
        <ul className="failures" aria-live="polite">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      <div className="controls">
        <label htmlFor="b">{ltText.budgetLabel}</label>
        <input id="b" type="number" min={1} max={1440} value={budgetInput} aria-describedby="lt-limits lt-budget-note"
          onChange={(e) => setBudgetInput(Number(e.target.value))} />
        <label htmlFor="a">{ltText.aheadLabel}</label>
        <input id="a" type="number" min={0} max={MAX_AHEAD_DAYS} value={aheadInput} aria-describedby="lt-limits lt-ahead-note"
          onChange={(e) => setAheadInput(Number(e.target.value))} />
      </div>
      <p id="lt-budget-note" className="legend" aria-live="polite">{budget.note ?? ""}</p>
      <p id="lt-ahead-note" className="legend" aria-live="polite">{ahead.note ?? ""}</p>

      {typeof result === "string" && <p className="error" role="alert">{result}</p>}
      {result === null && <p className="blurb">{ltText.begin}</p>}
      {result !== null && typeof result !== "string" && (
        <section aria-live="polite">
          <p className="verdict pass">
            Save {result.picks.length} of {result.picks.length + result.others.length} fading items in {result.totalMinutes} of {budget.minutes} minutes.
          </p>
          <p className="legend">
            Value kept {result.totalValue.toFixed(0)}. An even split of the time between your apps would keep {result.evenSplitValue.toFixed(0)}.
            The choice across both apps is exact, not greedy.
          </p>
          <h2>{ltText.doThese}</h2>
          <ul className="list">
            {result.picks.map((c) => (
              <li key={c.source + c.id}><span className="tag">{c.source}</span> {nameOf(c)} <span className="mut">{detailOf(c, at, true)}</span></li>
            ))}
            {result.picks.length === 0 && <li className="mut">{ltText.nothingWeak}</li>}
          </ul>
          {result.others.length > 0 && (
            <>
              <h2>{ltText.leftToFade}</h2>
              <ul className="list">
                {result.others.map((c) => (
                  <li key={c.source + c.id}><span className="tag">{c.source}</span> {nameOf(c)} <span className="mut">{detailOf(c, at, false)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  )
}
