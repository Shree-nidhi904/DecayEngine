// The Profile's activity history (feedback list, point 17). Read at the real
// time; after a sync the engine's history holds every device's changes.
import { activityLines } from "../activity"
import type { GhostedEngine } from "../engine-instance"
import { topBarText } from "../wording"

export interface ActivityLogProps {
  engine: Pick<GhostedEngine, "view" | "history">
  /** The real time, never a preview. */
  now: number
  formatTime: (ms: number) => string
}

export function ActivityLog({ engine, now, formatTime }: ActivityLogProps) {
  const people = engine.view(now)
  const names = new Map(people.map((p) => [p.id, p.payload.name] as const))
  const entries = people.flatMap((p) => engine.history(p.id))
  const lines = activityLines(entries, (id) => names.get(id), now)
  return (
    <section className="gh-activity" aria-labelledby="gh-activity-title">
      <h3 id="gh-activity-title" className="gh-sheet-subtitle">
        {topBarText.activityTitle}
      </h3>
      <p className="gh-sheet-note">{topBarText.activityNote}</p>
      {lines.length === 0 ? (
        <p className="gh-sheet-note">{topBarText.activityEmpty}</p>
      ) : (
        <ol className="gh-activity-list">
          {lines.map((line) => (
            <li key={line.key}>
              <time dateTime={new Date(line.at).toISOString()} className="gh-number">
                {formatTime(line.at)}
              </time>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
