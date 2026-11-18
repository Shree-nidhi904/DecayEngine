import type { HistoryEntry } from "@decay-engine/engine";
import type { ThemeProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

export interface HistoryLogViewerProps {
  entries: readonly HistoryEntry[];
  theme: ThemeProps;
  /** Turns an entry into words, for example "Fought: knew it". Supplied by the app. */
  describe: (entry: HistoryEntry) => string;
  /** Formats an entry's timestamp (ms) for display. Supplied by the app. */
  formatTimestamp: (ms: number) => string;
}

/**
 * An item's history, oldest first. Entries with the same timestamp keep the
 * order they were given in. Every word comes from describe and formatTimestamp.
 */
export function HistoryLogViewer({ entries, theme, describe, formatTimestamp }: HistoryLogViewerProps) {
  // Array.prototype.sort is stable, so equal timestamps keep their order.
  const ordered = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  return (
    <ol className="shell-history" style={shellStyle(theme)}>
      {ordered.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} className="shell-history-entry" data-type={entry.type}>
          <time className="shell-history-time" dateTime={new Date(entry.timestamp).toISOString()}>
            {formatTimestamp(entry.timestamp)}
          </time>
          <span className="shell-history-words">{describe(entry)}</span>
        </li>
      ))}
    </ol>
  );
}
