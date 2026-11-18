import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { HistoryEntry } from "@decay-engine/engine";
import { HistoryLogViewer, type HistoryLogViewerProps } from "./HistoryLogViewer";
import { FIXTURE_VARIABLES, fixtureTheme, otherTheme, rootStyle, textOf } from "../test-fixtures";

const T = Date.UTC(2026, 9, 1); // 1 Oct 2026 00:00 UTC, fixed
const HOUR = 3_600_000;

// Given out of order on purpose. "created" and "edited" share a timestamp,
// and "created" comes first in the input.
const ENTRIES: HistoryEntry[] = [
  { type: "tended", itemId: "x", timestamp: T + 2 * HOUR, health: 100, event: { correct: true } },
  { type: "created", itemId: "x", timestamp: T, health: 100 },
  { type: "died", itemId: "x", timestamp: T + 5 * HOUR, health: 0 },
  { type: "edited", itemId: "x", timestamp: T, health: 100, fieldsChanged: ["payload"] },
];

const describeEntry = (entry: HistoryEntry) => `words for ${entry.type}`;
const formatTimestamp = (ms: number) => `t+${(ms - T) / HOUR}h`;

function render(props: Partial<HistoryLogViewerProps> = {}): string {
  return renderToStaticMarkup(
    <HistoryLogViewer
      entries={ENTRIES}
      theme={fixtureTheme}
      describe={describeEntry}
      formatTimestamp={formatTimestamp}
      {...props}
    />
  );
}

/** Each <li> as [data-type, text]. */
function rows(html: string): [string, string][] {
  return [...html.matchAll(/<li class="shell-history-entry" data-type="([^"]+)">([\s\S]*?)<\/li>/g)].map(
    (m) => [m[1]!, textOf(m[2]!)]
  );
}

describe("HistoryLogViewer", () => {
  it("lists entries oldest first, keeping the given order for equal timestamps", () => {
    expect(rows(render()).map(([type]) => type)).toEqual(["created", "edited", "tended", "died"]);
  });

  it("does not reorder the array it is given", () => {
    const before = ENTRIES.map((e) => e.type);
    render();
    expect(ENTRIES.map((e) => e.type)).toEqual(before);
  });

  it("shows each entry as formatTimestamp's time and describe's words", () => {
    expect(rows(render())).toEqual([
      ["created", "t+0h" + "words for created"],
      ["edited", "t+0h" + "words for edited"],
      ["tended", "t+2h" + "words for tended"],
      ["died", "t+5h" + "words for died"],
    ]);
  });

  it("passes the whole entry to describe", () => {
    const html = render({
      describe: (e) => (e.type === "edited" ? `changed ${e.fieldsChanged.join(",")}` : `health ${e.health}`),
    });
    expect(rows(html).map(([, text]) => text)).toEqual([
      "t+0hhealth 100",
      "t+0hchanged payload",
      "t+2hhealth 100",
      "t+5hhealth 0",
    ]);
  });

  it("gives each time a machine-readable dateTime", () => {
    const html = render();
    // HTML attribute names are case-insensitive; React may write dateTime or datetime.
    expect(html).toMatch(/<time class="shell-history-time" datetime="2026-10-01T00:00:00\.000Z">t\+0h<\/time>/i);
    expect(html).toMatch(/<time class="shell-history-time" datetime="2026-10-01T05:00:00\.000Z">t\+5h<\/time>/i);
  });

  it("shows no words of its own, even with no entries", () => {
    const html = render({ entries: [] });
    expect(rows(html)).toEqual([]);
    expect(textOf(html)).toBe("");
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(render())).toEqual(FIXTURE_VARIABLES);
    expect(rootStyle(render({ theme: otherTheme }))["--shell-text"]).toBe("#ffff05");
  });
});
