import { useMemo, useState } from "react"
import { lifeTriage, type Source } from "@decay-engine/life-triage"
import { FACTS, FRIENDS, sampleSources } from "./load"
import { tendLink } from "./links"
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
  const [counts, setCounts] = useState<Record<string, number>>({})
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

  async function onFiles(files: FileList | null, expected?: string) {
    if (!files) return
    const read = await readBackupFiles(Array.from(files), sources, expected)
    setSources(read.sources)
    setNotes(read.notes)
    setCounts((old) => ({ ...old, ...read.counts }))
  }

  return (
    <main>
      <header className="lt-head">
        <h1>{ltText.title}</h1>
        <p className="lede">{ltText.lede}</p>
        <p className="lede lede-small">{ltText.howTo} {ltText.privacy}</p>
      </header>
      <section className="lt-panel" aria-label={ltText.title}>
      <div className="slots">
        {[FACTS, FRIENDS].map((label) => {
          const loaded = sources.find((x) => x.label === label)
          const slotId = label === FACTS ? "slot-facts" : "slot-friends"
          return (
            <label key={label} className={loaded ? "slot filebtn filled" : "slot filebtn"} htmlFor={slotId}>
              <span className="slot-name">{label === FACTS ? ltText.slotFacts : ltText.slotFriends}</span>
              <span className="slot-state">
                {loaded ? ltText.slotLoaded(counts[label]) : ltText.slotEmpty}
              </span>
              <span className="slot-action">{ltText.loadFiles}</span>
              <input id={slotId} type="file" accept="application/json,.json" multiple
                onChange={(e) => { void onFiles(e.target.files, label); e.target.value = "" }} />
            </label>
          )
        })}
      </div>
      <div className="presets">
        <button type="button" onClick={() => { setSources(sampleSources(now)); setCounts({}); setNotes([ltText.sampleLoaded]) }}>
          {ltText.sample}
        </button>
      </div>
      <details className="details">
        <summary>{ltText.detailsLabel}</summary>
        <p id="lt-limits" className="legend">{ltText.limits}</p>
      </details>
      <AccountLoader
        existing={sources}
        onLoaded={(next, accountNotes) => {
          setSources(next)
          setCounts({})
          setNotes(accountNotes)
        }}
      />
      {notes.length > 0 && (
        <ul className="failures" aria-live="polite">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      </section>
      <section className="lt-panel">
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
      </section>

      {typeof result === "string" && <p className="error" role="alert">{result}</p>}
      {result === null && <p className="blurb">{ltText.begin}</p>}
      {result !== null && typeof result !== "string" && (
        <section className="lt-panel lt-result" aria-live="polite">
          <p className="verdict pass">
            {ltText.summary(result.picks.length, result.picks.length + result.others.length, result.totalMinutes, budget.minutes)}
          </p>
          <p className="legend">{ltText.versusEven(result.totalValue, result.evenSplitValue)}</p>
          <div className="lt-cols">
          <div className="lt-col lt-col-do">
          <h2>{ltText.doThese}</h2>
          <ul className="list">
            {result.picks.map((c) => (
              <li key={c.source + c.id} className="pick">
                <span><span className="tag">{c.source}</span> {nameOf(c)} <span className="mut">{detailOf(c, at, true)}</span></span>
                {tendLink(c.source, c.id) !== null && (
                  <a className="tend" href={tendLink(c.source, c.id) ?? undefined} target="_blank" rel="noopener">
                    {ltText.open(c.source)} <span aria-hidden="true">→</span>
                  </a>
                )}
              </li>
            ))}
            {result.picks.length === 0 && <li className="mut">{ltText.nothingWeak}</li>}
          </ul>
          </div>
          {result.others.length > 0 && (
            <div className="lt-col lt-col-fade">
              <h2>{ltText.leftToFade}</h2>
              <ul className="list">
                {result.others.map((c) => (
                  <li key={c.source + c.id}><span className="tag">{c.source}</span> {nameOf(c)} <span className="mut">{detailOf(c, at, false)}</span></li>
                ))}
              </ul>
            </div>
          )}
          </div>
        </section>
      )}
    </main>
  )
}
