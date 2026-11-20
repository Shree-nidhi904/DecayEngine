import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Item, TriageCandidate, TriageResult } from "@decay-engine/engine";
import type { ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

const DAY_MS = 86_400_000;

/** The fixed budget choices, in minutes. "Custom" is offered as well. */
export const TRIAGE_BUDGETS: readonly number[] = [5, 10, 20];

type Choice = number | "custom";

export interface TriagePanelProps<Payload, PolicyData> {
  theme: ThemeProps;
  wording: WordingProps;
  /**
   * Runs triage for a budget. The app passes a function that calls
   * engine.triage(budgetMinutes, now); the panel never imports the engine.
   * Called only with a valid budget. When this function changes (a new `now`
   * or a write), the shown result is worked out again.
   */
  triage: (budgetMinutes: number) => TriageResult<Payload, PolicyData>;
  /** The time triage looks at, used to turn diesAt into days. */
  now: number;
  /** The largest budget the app's triage accepts. */
  maxBudgetMinutes: number;
  /** The item's text (the shell knows nothing about the payload). */
  renderText: (item: Item<Payload, PolicyData>) => ReactNode;
  /** Starts tending the picks, in the order shown. */
  onStartSession: (picks: TriageCandidate<Payload, PolicyData>[]) => void;
  /**
   * Disables the start button (for example while previewing). It stays
   * visible and focusable, is marked aria-disabled, and ignores clicks.
   * Triage itself still runs.
   */
  startDisabled?: boolean;
  /** Why the start button is disabled: shown as its title and read as its description. */
  startDisabledReason?: string;
  /**
   * Run straight away with this budget (one of the budget choices; with
   * `budgets`, any other value counts as none), so the panel is never empty.
   * Omitted: nothing runs until the user asks.
   */
  initialBudget?: number;
  /**
   * Budget choices in minutes, shown in this order before "custom". Whole
   * numbers from 1 to maxBudgetMinutes, no repeats. Omitted or empty: TRIAGE_BUDGETS.
   */
  budgets?: readonly number[];
  /**
   * The choice selected at first when initialBudget does not apply. Ignored
   * unless it is in the list. Omitted: TRIAGE_BUDGETS[1] without `budgets`,
   * the list's first entry with `budgets`.
   */
  defaultBudget?: number;
}

/** Whole days from `now` to `diesAt`, rounded up, never below 0. */
export function daysUntil(diesAt: number, now: number): number {
  return Math.max(0, Math.ceil((diesAt - now) / DAY_MS));
}

/** A custom budget: a whole number from 1 to max, or null. */
export function parseBudget(text: string, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= 1 && minutes <= max ? minutes : null;
}

/**
 * "I have N minutes. What should I save?" The user picks 5, 10, 20 or a
 * custom number of minutes and presses wording.triage.run. The panel then
 * shows the picks (text, value per minute, cost, days until death) and the
 * other weak items (days until death), or wording.triage.empty when there
 * are no weak items. An invalid custom budget shows an error and runs nothing.
 */
export function TriagePanel<Payload, PolicyData>({
  theme,
  wording,
  triage,
  now,
  maxBudgetMinutes,
  renderText,
  onStartSession,
  startDisabled = false,
  startDisabledReason,
  initialBudget,
  budgets,
  defaultBudget,
}: TriagePanelProps<Payload, PolicyData>) {
  const text = wording.triage;
  const ids = {
    title: useId(),
    custom: useId(),
    error: useId(),
    picks: useId(),
    others: useId(),
    reason: useId(),
  };
  const custom = budgets !== undefined && budgets.length > 0;
  const choices = custom ? budgets : TRIAGE_BUDGETS;
  const fallback =
    defaultBudget !== undefined && choices.includes(defaultBudget)
      ? defaultBudget
      : custom
        ? choices[0]!
        : TRIAGE_BUDGETS[1]!;
  // Today's rule is kept when no list is given (Req 27.2); with a list, an
  // initialBudget outside it counts as none and runs no triage (Req 27.3).
  const initial = custom
    ? initialBudget !== undefined && choices.includes(initialBudget)
      ? initialBudget
      : undefined
    : initialBudget;
  const [choice, setChoice] = useState<Choice>(
    initial !== undefined && choices.includes(initial) ? initial : fallback
  );
  const [customText, setCustomText] = useState("");
  const [invalid, setInvalid] = useState(false);
  // The budget of the last valid run, or null before the first one.
  const [budget, setBudget] = useState<number | null>(initial ?? null);

  const result = useMemo(() => (budget === null ? null : triage(budget)), [triage, budget]);

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = choice === "custom" ? parseBudget(customText, maxBudgetMinutes) : choice;
    if (minutes === null) {
      setInvalid(true);
      setBudget(null);
      return;
    }
    setInvalid(false);
    setBudget(minutes);
  }

  const dies = (diesAt: number | null) => (diesAt === null ? text.diesNever : text.diesIn(daysUntil(diesAt, now)));
  const showReason = startDisabled && startDisabledReason !== undefined;

  let results: ReactNode = null;
  if (result !== null) {
    if (result.picks.length === 0 && result.others.length === 0) {
      results = <p className="shell-triage-empty">{text.empty}</p>;
    } else {
      results = (
        <>
          <h3 id={ids.picks} className="shell-triage-heading">
            {text.picks}
          </h3>
          {result.picks.length === 0 ? (
            <p className="shell-triage-empty">{text.nothingFits}</p>
          ) : (
            <>
              <ol className="shell-triage-list shell-triage-picks" aria-labelledby={ids.picks}>
                {result.picks.map((pick) => (
                  <li key={pick.item.id} className="shell-triage-entry">
                    <span className="shell-triage-text">{renderText(pick.item)}</span>
                    <span className="shell-triage-number">{text.valuePerMinute(pick.valuePerMinute)}</span>
                    <span className="shell-triage-number">{text.cost(pick.item.costMinutes)}</span>
                    <span className="shell-triage-number">{dies(pick.diesAt)}</span>
                  </li>
                ))}
              </ol>
              <div>
                <button
                  type="button"
                  className="shell-button shell-button-primary"
                  aria-disabled={startDisabled ? true : undefined}
                  aria-describedby={showReason ? ids.reason : undefined}
                  title={showReason ? startDisabledReason : undefined}
                  onClick={startDisabled ? undefined : () => onStartSession(result.picks)}
                >
                  {text.startSession}
                </button>
                {showReason && (
                  <span id={ids.reason} hidden>
                    {startDisabledReason}
                  </span>
                )}
              </div>
            </>
          )}
          {result.others.length > 0 && (
            <>
              <h3 id={ids.others} className="shell-triage-heading">
                {text.others}
              </h3>
              <ul className="shell-triage-list shell-triage-others" aria-labelledby={ids.others}>
                {result.others.map((other) => (
                  <li key={other.item.id} className="shell-triage-entry">
                    <span className="shell-triage-text">{renderText(other.item)}</span>
                    <span className="shell-triage-number">{dies(other.diesAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    }
  }

  return (
    <section className="shell-triage" style={shellStyle(theme)} aria-labelledby={ids.title}>
      <h2 id={ids.title} className="shell-triage-title">
        {text.title}
      </h2>
      <form className="shell-triage-form" onSubmit={run} noValidate>
        <fieldset className="shell-triage-budget">
          <legend>{text.budget}</legend>
          {choices.map((minutes) => (
            <label key={minutes} className="shell-triage-choice">
              <input
                type="radio"
                name={ids.title}
                checked={choice === minutes}
                onChange={() => {
                  setChoice(minutes);
                  setInvalid(false);
                }}
              />
              {text.minutes(minutes)}
            </label>
          ))}
          <label className="shell-triage-choice">
            <input
              type="radio"
              name={ids.title}
              checked={choice === "custom"}
              onChange={() => setChoice("custom")}
            />
            {text.custom}
          </label>
        </fieldset>
        {choice === "custom" && (
          <div className="shell-triage-custom">
            <label htmlFor={ids.custom}>{text.customLabel}</label>
            <input
              id={ids.custom}
              type="text"
              inputMode="numeric"
              value={customText}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={invalid ? ids.error : undefined}
              onChange={(event) => setCustomText(event.currentTarget.value)}
            />
          </div>
        )}
        <button type="submit" className="shell-button shell-button-primary">
          {text.run}
        </button>
      </form>
      {invalid && (
        <p id={ids.error} className="shell-triage-error" role="alert">
          {text.invalidBudget(maxBudgetMinutes)}
        </p>
      )}
      {results}
    </section>
  );
}
