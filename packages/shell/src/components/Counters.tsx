import type { ItemState, StateIcons, ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

export interface CountersProps {
  alive: number;
  weak: number;
  dead: number;
  theme: ThemeProps;
  wording: WordingProps;
  icons: StateIcons;
}

const STATES: readonly ItemState[] = ["alive", "weak", "dead"];

/**
 * Three badges: how many items are alive, weak and dead. Each badge shows
 * the state's icon, the count and the list's name from the wording.
 */
export function Counters({ alive, weak, dead, theme, wording, icons }: CountersProps) {
  const counts: Record<ItemState, number> = { alive, weak, dead };
  return (
    <ul className="shell-counters" style={shellStyle(theme)}>
      {STATES.map((state) => (
        <li key={state} className="shell-counter" data-state={state}>
          <span className="shell-icon" aria-hidden="true">
            {icons[state]}
          </span>
          <span className="shell-counter-count">{counts[state]}</span>
          <span className="shell-counter-label">{wording.lists[state]}</span>
        </li>
      ))}
    </ul>
  );
}
