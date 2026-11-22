// The Triage panel (task 4.12, design section 4.4 GhostedTriage; Req 9.1-9.5,
// 16.1, 27, 30.4): "I have N minutes. Who should I reach first?"
//
// It wraps the shell TriagePanel with Ghosted's budget choices (15, 30, 60
// and 120 minutes plus custom, 30 selected and run at once) and the engine's
// triage at `now`. Above the panel, the rule in three steps (Req 9.2), inside
// a native <details> closed by default, so the form and the picks are seen
// first (task L1, Req 33.3). Each
// pick shows the triangle glyph, the word "flickering" and the name; the
// shell adds worth per minute, minutes and "goes dark in N days" (Req 9.3).
//
// "Today's 5-minute action" (Req 9.4) reads engine.triage(1440, now): of
// every fading person (picks and others together) whose minutes are 5 or
// less, the one with the best worth per minute, ties by id. It is a quiet
// button: the shell's Run and Start buttons are this region's filled ones
// (amended Req 30.4). Hidden when nobody qualifies. Reaching out is a write,
// so during a preview it is aria-disabled with the reason, like Start.
//
// Engine calls: triage.

import { useCallback, useId, useMemo } from "react"
import type { Item, TriageCandidate } from "@decay-engine/engine"
import { TriagePanel } from "@decay-engine/shell"
import type { GhostedEngine } from "../engine-instance"
import { compareIds, firstName, type BlockedReason } from "../lists"
import type { Person, PersonPayload, PersonPolicyData } from "../policy"
import { ghostedShellTheme } from "../theme"
import { ghostedWording, stateWords, triageSteps, triageText } from "../wording"
import { StateGlyph } from "./icons"
import "../styles/layout.css"

/** The budget choices in minutes (Req 9.1, 27). */
export const GHOSTED_BUDGETS: readonly number[] = [15, 30, 60, 120]
/** Selected and run when the panel first shows. */
export const GHOSTED_DEFAULT_BUDGET = 30
/** The engine's largest budget: a whole day. */
export const GHOSTED_MAX_BUDGET = 1440
/** The 5-minute action's limit (Req 9.4). */
export const FIVE_MINUTES = 5

export type GhostedCandidate = TriageCandidate<PersonPayload, PersonPolicyData>

export interface GhostedTriageProps {
  engine: Pick<GhostedEngine, "triage">
  now: number
  /** Bumped after every write, so triage runs again. */
  version: number
  blocked: BlockedReason
  /** Start the session with the picks, in the order shown (Req 9.5). */
  onStartSession: (picks: GhostedCandidate[]) => void
  /** "Today's 5-minute action". */
  onReachOut: (person: Person) => void
}

/**
 * The fading person for "Today's 5-minute action": minutes at most 5, the
 * best worth per minute, ties by id. Undefined when nobody qualifies.
 */
export function fiveMinuteAction(engine: Pick<GhostedEngine, "triage">, now: number): GhostedCandidate | undefined {
  const { picks, others } = engine.triage(GHOSTED_MAX_BUDGET, now)
  return [...picks, ...others]
    .filter((c) => c.item.costMinutes <= FIVE_MINUTES)
    .sort((a, b) => b.valuePerMinute - a.valuePerMinute || compareIds(a.item.id, b.item.id))[0]
}

/** A pick's text: glyph, state word and name (Req 9.3, 16.1). */
function PickText({ item }: { item: Item<PersonPayload, PersonPolicyData> }) {
  return (
    <span className="gh-pick" data-state={item.state}>
      <span className="gh-pick-state">
        <StateGlyph state={item.state} /> {stateWords[item.state]}
      </span>{" "}
      <span className="gh-pick-name">{item.payload.name}</span>
    </span>
  )
}

export function GhostedTriage({ engine, now, version, blocked, onStartSession, onReachOut }: GhostedTriageProps) {
  const id = useId()
  const stepsId = `${id}-steps`
  const blockedId = `${id}-blocked`

  // `version` is a dependency on purpose: a write changes what triage returns at the same `now`.
  const triage = useCallback((budget: number) => engine.triage(budget, now), [engine, now, version])
  const action = useMemo(() => fiveMinuteAction(engine, now), [engine, now, version])
  const renderText = useCallback((item: Item<PersonPayload, PersonPolicyData>) => <PickText item={item} />, [])

  return (
    <div className="gh-triage">
      <details className="gh-triage-how">
        <summary id={stepsId} className="gh-triage-steps-title">
          {triageText.howItWorks}
        </summary>
        <ol className="gh-triage-steps" aria-labelledby={stepsId}>
          {triageSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <TriagePanel
        theme={ghostedShellTheme}
        wording={ghostedWording}
        triage={triage}
        now={now}
        maxBudgetMinutes={GHOSTED_MAX_BUDGET}
        renderText={renderText}
        onStartSession={onStartSession}
        startDisabled={blocked !== undefined}
        startDisabledReason={blocked}
        initialBudget={GHOSTED_DEFAULT_BUDGET}
        budgets={GHOSTED_BUDGETS}
        defaultBudget={GHOSTED_DEFAULT_BUDGET}
      />
      {action !== undefined && (
        <div className="gh-triage-five">
          <button
            type="button"
            className="gh-button"
            data-action="five-minute"
            aria-disabled={blocked !== undefined ? "true" : undefined}
            aria-describedby={blocked !== undefined ? blockedId : undefined}
            title={blocked}
            onClick={blocked !== undefined ? undefined : () => onReachOut(action.item)}
          >
            <StateGlyph state={action.item.state} />
            <span>{triageText.fiveMinute(firstName(action.item.payload.name))}</span>
          </button>
          {blocked !== undefined && (
            <p id={blockedId} className="gh-triage-blocked">
              {blocked}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
