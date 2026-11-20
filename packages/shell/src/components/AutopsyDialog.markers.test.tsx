// @vitest-environment jsdom
//
// AutopsyDialog with app-defined markers (Requirement 28.1-28.4, design 3.3):
// text, call and meetup markers with their shapes, legend entries and the
// chart's accessible summary, the default circle when no renderMarker is
// given, and today's right/wrong marks when no markers are given. Markup
// through renderToStaticMarkup; fixed times, never the clock.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AutopsyDialog,
  type AutopsyChartPoint,
  type AutopsyDialogProps,
  type AutopsyMarker,
  type AutopsyTendMark,
} from "./AutopsyDialog";
import type { AutopsyChartSummary, WordingProps } from "../types";
import { fixtureIcons, fixtureTheme, fixtureWording, textOf } from "../test-fixtures";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // fixed, never the clock
const formatDate = (ms: number) => `D${(ms - T0) / DAY}`;

// A life of 7 days; the plot runs from x 6 to 314, so 44 per day, and the
// marker row sits at y = 6 + 140 + 14 = 160.
const POINTS: AutopsyChartPoint[] = [
  { at: T0, health: 100 },
  { at: T0 + 7 * DAY, health: 9.99 },
];
const TENDS: AutopsyTendMark[] = [
  { at: T0 + DAY, correct: true },
  { at: T0 + 3 * DAY, correct: false },
];

const LABELS = { call: "Call", text: "Message", meetup: "Meet-up" } as const;
const marker = (kind: keyof typeof LABELS, day: number): AutopsyMarker => ({
  at: T0 + day * DAY,
  kind,
  label: LABELS[kind],
});

// Inside the span: 3 calls, 2 texts and 1 meetup; first appearance call, text, meetup.
// Outside the span: one call a day before and one meetup a day after.
const MARKERS: AutopsyMarker[] = [
  marker("call", 0.5),
  marker("text", 1),
  marker("meetup", 2),
  marker("call", 3),
  marker("text", 4),
  marker("call", 5),
  marker("call", -1),
  marker("meetup", 8),
];

// One distinct shape per kind, so a test can tell which renderer output landed where.
const SHAPES = { call: "rect", text: "path", meetup: "polygon" } as const;
function renderMarker(kind: string) {
  if (kind === "call") return <rect x={-4} y={-4} width={8} height={8} />;
  if (kind === "text") return <path d="M-5,0L5,0" />;
  return <polygon points="0,-5 5,5 -5,5" />;
}

const PLURALS: Record<string, string> = { call: "calls", text: "messages", meetup: "meet-ups" };
function markerSummary(counts: readonly { kind: string; label: string; count: number }[]): string {
  return counts
    .map(({ kind, label, count }) => `${count} ${count === 1 ? label.toLowerCase() : PLURALS[kind]}`)
    .join(", ");
}

/** A wording whose chartLabel records its summary and shows the markers text. */
function recordingWording() {
  const chartLabel = vi.fn(
    (s: AutopsyChartSummary) => `MK-Label[${s.markers ?? "none"}|${s.right}|${s.wrong}]`
  );
  const wording: WordingProps = { ...fixtureWording, autopsy: { ...fixtureWording.autopsy, chartLabel } };
  return { wording, chartLabel };
}

function props(overrides: Partial<AutopsyDialogProps> = {}): AutopsyDialogProps {
  return {
    theme: fixtureTheme,
    wording: fixtureWording,
    icons: fixtureIcons,
    epitaph: "Epitaph-Text",
    causeSentences: ["Sentence-One."],
    points: POINTS,
    tends: [],
    thresholds: { weak: 60, dead: 10 },
    formatDate,
    onClose: () => {},
    ...overrides,
  };
}

const markup = (overrides: Partial<AutopsyDialogProps> = {}) =>
  renderToStaticMarkup(<AutopsyDialog {...props(overrides)} />);

function markerGroups(html: string): { kind: string; transform: string; shape: string }[] {
  return [...html.matchAll(/<g data-marker="(\w+)" transform="([^"]+)">([\s\S]*?)<\/g>/g)].map((m) => ({
    kind: m[1]!,
    transform: m[2]!,
    // The drawn shape: the element after the dashed guide line.
    shape: m[3]!.replace(/<line\b[^>]*>(<\/line>)?/, "").match(/<(\w+)\b/)![1]!,
  }));
}

function markerLegend(html: string): { kind: string; text: string; shape: string }[] {
  return [...html.matchAll(/<li data-legend-marker="(\w+)">([\s\S]*?)<\/li>/g)].map((m) => ({
    kind: m[1]!,
    text: textOf(m[2]!),
    shape: m[2]!.match(/<svg\b[^>]*>\s*<(\w+)\b/)![1]!,
  }));
}

const ariaLabel = (html: string) => html.match(/<svg class="shell-autopsy-svg"[^>]*aria-label="([^"]*)"/)![1];

describe("AutopsyDialog with text, call and meetup markers", () => {
  it("draws one group per marker inside the span, in order, with the app's shape, and none outside it", () => {
    expect(markerGroups(markup({ markers: MARKERS, renderMarker }))).toEqual([
      { kind: "call", transform: "translate(28,160)", shape: SHAPES.call },
      { kind: "text", transform: "translate(50,160)", shape: SHAPES.text },
      { kind: "meetup", transform: "translate(94,160)", shape: SHAPES.meetup },
      { kind: "call", transform: "translate(138,160)", shape: SHAPES.call },
      { kind: "text", transform: "translate(182,160)", shape: SHAPES.text },
      { kind: "call", transform: "translate(226,160)", shape: SHAPES.call },
    ]);
  });

  it("lists each kind once in the legend, in order of first appearance, with its label and shape", () => {
    const html = markup({ markers: MARKERS, renderMarker });
    expect(markerLegend(html)).toEqual([
      { kind: "call", text: "Call", shape: SHAPES.call },
      { kind: "text", text: "Message", shape: SHAPES.text },
      { kind: "meetup", text: "Meet-up", shape: SHAPES.meetup },
    ]);
    // The weak and dead bands stay in the legend, before the markers.
    const keys = [...html.matchAll(/<li data-legend(?:-marker)?="(\w+)">/g)].map((m) => m[1]);
    expect(keys).toEqual(["weak", "dead", "call", "text", "meetup"]);
  });

  it("replaces the right/wrong marks and legend entries, even when tends are given", () => {
    const html = markup({ markers: MARKERS, renderMarker, tends: TENDS });
    expect(html).not.toContain("data-mark=");
    expect(html).not.toContain('data-legend="right"');
    expect(html).not.toContain('data-legend="wrong"');
    expect(textOf(html)).not.toContain("AU-Right");
    expect(textOf(html)).not.toContain("AU-Wrong");
  });

  it("builds the aria-label through chartLabel with the markers text and right 0, wrong 0", () => {
    const { wording, chartLabel } = recordingWording();
    const html = markup({ wording, markers: MARKERS, renderMarker, markerSummary, tends: TENDS });
    expect(chartLabel).toHaveBeenCalledTimes(1);
    const summary = chartLabel.mock.calls[0]![0];
    expect(summary).toEqual({
      from: "D0",
      to: "D7",
      startHealth: 100,
      endHealth: 9.99,
      right: 0,
      wrong: 0,
      markers: "3 calls, 2 messages, 1 meet-up",
    });
    expect(ariaLabel(html)).toBe("MK-Label[3 calls, 2 messages, 1 meet-up|0|0]");
  });

  it("gives markerSummary one count per legend kind, in legend order, counting only the span", () => {
    const summary = vi.fn(markerSummary);
    markup({ markers: MARKERS, renderMarker, markerSummary: summary });
    expect(summary.mock.calls).toEqual([
      [
        [
          { kind: "call", label: "Call", count: 3 },
          { kind: "text", label: "Message", count: 2 },
          { kind: "meetup", label: "Meet-up", count: 1 },
        ],
      ],
    ]);
  });

  it("leaves summary.markers undefined when no markerSummary is given", () => {
    const { wording, chartLabel } = recordingWording();
    markup({ wording, markers: MARKERS, renderMarker });
    expect(chartLabel.mock.calls[0]![0].markers).toBeUndefined();
    expect(chartLabel.mock.calls[0]![0].right).toBe(0);
  });

  it("gives no legend entry and no count to a kind whose markers are all outside the span", () => {
    // Two calls inside the span; the only texts are a day before and a day after it.
    const markers = [marker("text", -1), marker("call", 2), marker("call", 4), marker("text", 8)];
    const summary = vi.fn(markerSummary);
    const html = markup({ markers, renderMarker, markerSummary: summary });
    expect(markerLegend(html).map((l) => l.kind)).toEqual(["call"]);
    expect(html).not.toContain('data-legend-marker="text"');
    expect(html).not.toContain('data-marker="text"');
    expect(summary.mock.calls).toEqual([[[{ kind: "call", label: "Call", count: 2 }]]]);
  });

  it("draws a filled circle for every kind when renderMarker is omitted", () => {
    const html = markup({ markers: MARKERS });
    const groups = markerGroups(html);
    expect(groups.map((g) => g.kind)).toEqual(["call", "text", "meetup", "call", "text", "call"]);
    expect(groups.every((g) => g.shape === "circle")).toBe(true);
    expect(markerLegend(html).map((l) => [l.kind, l.text, l.shape])).toEqual([
      ["call", "Call", "circle"],
      ["text", "Message", "circle"],
      ["meetup", "Meet-up", "circle"],
    ]);
    expect(html).toContain('<circle r="5" class="shell-autopsy-marker-default" fill="currentColor"></circle>');
  });

  it("an empty markers list still replaces the tends: no marks and no marker legend", () => {
    const html = markup({ markers: [], tends: TENDS });
    expect(html).not.toContain("data-mark=");
    expect(html).not.toContain("data-marker=");
    expect(html).not.toContain("data-legend-marker=");
    expect(html).not.toContain('data-legend="right"');
  });
});

describe("AutopsyDialog without markers keeps today's behaviour", () => {
  it("draws the right/wrong marks and their legend, and no marker groups", () => {
    const html = markup({ tends: TENDS });
    const marks = [...html.matchAll(/<g data-mark="(right|wrong)" transform="([^"]+)">/g)].map((m) => [m[1], m[2]]);
    expect(marks).toEqual([
      ["right", "translate(50,160)"],
      ["wrong", "translate(138,160)"],
    ]);
    const keys = [...html.matchAll(/<li data-legend="(\w+)">/g)].map((m) => m[1]);
    expect(keys).toEqual(["weak", "dead", "right", "wrong"]);
    expect(html).not.toContain("data-marker=");
    expect(html).not.toContain("data-legend-marker=");
  });

  it("passes chartLabel the same summary as today, with no markers field", () => {
    const { wording, chartLabel } = recordingWording();
    markup({ wording, tends: TENDS, renderMarker, markerSummary });
    expect(chartLabel.mock.calls).toEqual([
      [{ from: "D0", to: "D7", startHealth: 100, endHealth: 9.99, right: 1, wrong: 1 }],
    ]);
    expect("markers" in chartLabel.mock.calls[0]![0]).toBe(false);
  });

  it("ignores renderMarker and markerSummary when no markers are given", () => {
    const summary = vi.fn(markerSummary);
    const html = markup({ tends: TENDS, renderMarker, markerSummary: summary });
    expect(summary).not.toHaveBeenCalled();
    expect(html).toBe(markup({ tends: TENDS }));
    expect(ariaLabel(html)).toBe("AU-Label[D0|D7|100|9.99|1|1]");
  });
});
