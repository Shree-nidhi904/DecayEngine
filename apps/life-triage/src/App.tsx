import { useMemo, useState } from "react"
import { lifeTriage, type LifeCandidate, type Source } from "@decay-engine/life-triage"
import { loadBackup, sampleSources } from "./load"

const DAY = 86_400_000

function name(c: LifeCandidate): string {
  const p = c.payload as { question?: string; name?: string }
  return p.question ?? p.name ?? c.id
}

function dies(c: LifeCandidate, now: number): string {
  if (c.diesAt === null) return "not within 10 years"
  const days = Math.max(0, Math.ceil((c.diesAt - now) / DAY))
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
}

export function App() {
  const [now] = useState(() => Date.now())
  const [sources, setSources] = useState<Source[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [budget, setBudget] = useState(30)
  const [ahead, setAhead] = useState(0)

  const at = now + ahead * DAY
  const result = useMemo(() => {
    if (sources.length === 0) return null
    try {
      return lifeTriage(sources, Math.min(Math.max(Math.floor(budget) || 1, 1), 1440), at)
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [sources, budget, at])

  async function onFiles(files: FileList | null) {
    if (!files) return
    const next = new Map(sources.map((s) => [s.label, s]))
    const msgs: string[] = []
    for (const f of Array.from(files)) {
      const r = loadBackup(await f.text())
      if (r.ok) {
        next.set(r.label, { label: r.label, engine: r.engine })
        msgs.push(`${f.name}: ${r.label}, ${r.count} item${r.count === 1 ? "" : "s"}`)
      } else msgs.push(`${f.name}: ${r.reason}`)
    }
    setSources([...next.values()])
    setNotes(msgs)
  }

  return (
    <main>
      <h1>Life Triage</h1>
      <p className="lede">
        One time budget for everything that is fading: facts and friends together. Study Dungeon and Ghosted keep your data in
        separate browser storage, so export a backup from each and load them here. Nothing is uploaded; the files are read in this page.
      </p>

      <div className="presets">
        <label className="filebtn">
          Load backup files
          <input type="file" accept="application/json,.json" multiple onChange={(e) => onFiles(e.target.files)} />
        </label>
        <button onClick={() => { setSources(sampleSources(now)); setNotes(["Sample facts and people"]) }}>Use sample data</button>
      </div>
      {notes.length > 0 && <ul className="failures" aria-live="polite">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      <div className="controls">
        <label htmlFor="b">I have (minutes)</label>
        <input id="b" type="number" min={1} max={1440} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        <label htmlFor="a">Looking ahead (days)</label>
        <input id="a" type="number" min={0} max={365} value={ahead} onChange={(e) => setAhead(Math.max(0, Number(e.target.value) || 0))} />
      </div>

      {typeof result === "string" && <p className="error" role="alert">{result}</p>}
      {result === null && <p className="blurb">Load a backup or use the sample data to begin.</p>}
      {result !== null && typeof result !== "string" && (
        <section aria-live="polite">
          <p className="verdict pass">
            Save {result.picks.length} of {result.picks.length + result.others.length} fading items in {result.totalMinutes} of {budget} minutes.
          </p>
          <p className="legend">
            Value kept {result.totalValue.toFixed(0)}. An even split of the time between your apps would keep {result.evenSplitValue.toFixed(0)}.
            The choice across both apps is exact, not greedy.
          </p>
          <h2>Do these</h2>
          <ul className="list">
            {result.picks.map((c) => (
              <li key={c.source + c.id}><span className="tag">{c.source}</span> {name(c)} <span className="mut">{c.costMinutes} min · health {c.health.toFixed(0)} · dies {dies(c, at)}</span></li>
            ))}
            {result.picks.length === 0 && <li className="mut">Nothing is weak yet at this time.</li>}
          </ul>
          {result.others.length > 0 && (
            <>
              <h2>Left to fade</h2>
              <ul className="list">
                {result.others.map((c) => (
                  <li key={c.source + c.id}><span className="tag">{c.source}</span> {name(c)} <span className="mut">{c.costMinutes} min · dies {dies(c, at)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  )
}
