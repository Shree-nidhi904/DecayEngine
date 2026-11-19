// @vitest-environment jsdom
//
// AutopsyDialog: markup through renderToStaticMarkup, clicks and Escape
// through @testing-library/react. Neutral fixture theme and wording, fixed
// times; never the clock.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AUTOPSY_CHART_HEIGHT,
  AUTOPSY_CHART_WIDTH,
  AutopsyDialog,
  type AutopsyChartPoint,
  type AutopsyDialogProps,
  type AutopsyTendMark,
} from "./AutopsyDialog";
import { FIXTURE_VARIABLES, fixtureIcons, fixtureTheme, fixtureWording, otherWording, rootStyle, textOf } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // fixed, never the clock

// Shows a time as whole days after T0, so a test can see which time was formatted.
const formatDate = (ms: number) => `D${(ms - T0) / DAY}`;

// A life of 7 days: tended right on day 1 (70.71 → 100), wrong on day 3
// (70.71 → 45), dead on day 7 (just under 10). Two points at the same time
// draw the jump of a tend.
const POINTS: AutopsyChartPoint[] = [
  { at: T0, health: 100 },
  { at: T0 + DAY, health: 70.71 },
  { at: T0 + DAY, health: 100 },
  { at: T0 + 3 * DAY, health: 70.71 },
  { at: T0 + 3 * DAY, health: 45 },
  { at: T0 + 7 * DAY, health: 9.99 },
];
const TENDS: AutopsyTendMark[] = [
  { at: T0 + DAY, correct: true },
  { at: T0 + 3 * DAY, correct: false },
];
const SENTENCES = ["Sentence-One.", "Sentence-Two.", "Sentence-Three."];

function props(overrides: Partial<AutopsyDialogProps> = {}): AutopsyDialogProps {
  return {
    theme: fixtureTheme,
    wording: fixtureWording,
    icons: fixtureIcons,
    epitaph: "Epitaph-Text",
    causeSentences: SENTENCES,
    points: POINTS,
    tends: TENDS,
    thresholds: { weak: 60, dead: 10 },
    formatDate,
    onClose: () => {},
    ...overrides,
  };
}

const markup = (overrides: Partial<AutopsyDialogProps> = {}) =>
  renderToStaticMarkup(<AutopsyDialog {...props(overrides)} />);

function svgTag(html: string): string {
  return html.match(/<svg class="shell-autopsy-svg"[^>]*>/)![0];
}

function band(html: string, which: "weak" | "dead"): { y: string; height: string } {
  // The band inside the chart (x 6, width 308), not the small one in the legend.
  const match = html.match(
    new RegExp(`<rect class="shell-autopsy-band" data-band="${which}" x="6" y="([^"]+)" width="308" height="([^"]+)"`)
  )!;
  return { y: match[1]!, height: match[2]! };
}

function marks(html: string): { kind: string; transform: string; shape: string }[] {
  return [...html.matchAll(/<g data-mark="(right|wrong)" transform="([^"]+)">([\s\S]*?)<\/g>/g)].map((m) => ({
    kind: m[1]!,
    transform: m[2]!,
    // The drawn shape: the element after the dashed guide line.
    shape: m[3]!.match(/<(circle|path)\b/)![1]!,
  }));
}

describe("AutopsyDialog markup", () => {
  it("shows the epitaph under its label, then the chart, then the sentences in order", () => {
    const html = markup();
    expect(html).toContain('<p class="shell-autopsy-label">AU-Epitaph</p>');
    expect(html).toContain('<blockquote class="shell-autopsy-epitaph-text">Epitaph-Text</blockquote>');
    const sentences = [...html.matchAll(/<p class="shell-autopsy-sentence">([^<]*)<\/p>/g)].map((m) => m[1]);
    expect(sentences).toEqual(["Sentence-One.", "Sentence-Two.", "Sentence-Three."]);
    expect(html.indexOf("Epitaph-Text")).toBeLessThan(html.indexOf("shell-autopsy-svg"));
    expect(html.indexOf("shell-autopsy-svg")).toBeLessThan(html.indexOf("Sentence-One."));
  });

  it("leaves the epitaph out when it is missing or blank", () => {
    for (const epitaph of [undefined, "", "   "]) {
      const html = markup({ epitaph });
      expect(html).not.toContain("shell-autopsy-epitaph");
      expect(html).not.toContain("AU-Epitaph");
    }
  });

  it("sums the chart up in its aria-label, through wording.autopsy.chartLabel", () => {
    // From day 0 to day 7, health 100 to 9.99, one right tend and one wrong.
    const tag = svgTag(markup());
    expect(tag).toContain('role="img"');
    expect(tag).toContain('aria-label="AU-Label[D0|D7|100|9.99|1|1]"');
    expect(tag).toContain(`viewBox="0 0 ${AUTOPSY_CHART_WIDTH} ${AUTOPSY_CHART_HEIGHT}"`);
    expect(svgTag(markup({ wording: otherWording }))).toContain('aria-label="From D0 to D7"');
  });

  it("draws the health line across the plot, with a jump at each tend", () => {
    // Plot: x from 6 to 314 (width 308) over 7 days, so 44 per day;
    // y = 6 + (1 − health / 100) × 140.
    //   day 0: x 6;  day 1: 6 + 44 = 50;  day 3: 6 + 132 = 138;  day 7: 314
    //   health 100 → 6;  70.71 → 6 + 41.006 = 47.01;  45 → 6 + 77 = 83;  9.99 → 6 + 126.014 = 132.01
    const line = markup().match(/<polyline class="shell-autopsy-line" points="([^"]+)"/)![1];
    expect(line).toBe("6,6 50,47.01 50,6 138,47.01 138,83 314,132.01");
  });

  it("marks each tend by shape: a circle when right, a cross when wrong", () => {
    // Marks sit in the row under the plot: y = 6 + 140 + 14 = 160; x as the line.
    expect(marks(markup())).toEqual([
      { kind: "right", transform: "translate(50,160)", shape: "circle" },
      { kind: "wrong", transform: "translate(138,160)", shape: "path" },
    ]);
  });

  it("names both mark shapes and both bands in the legend, in words", () => {
    const html = markup();
    const legend = [...html.matchAll(/<li data-legend="(\w+)">([\s\S]*?)<\/li>/g)].map((m) => ({
      key: m[1],
      text: textOf(m[2]!),
      shape: m[2]!.match(/<(circle|path|rect)\b/)![1],
    }));
    expect(legend).toEqual([
      { key: "weak", text: "AU-Weak[60]", shape: "rect" },
      { key: "dead", text: "AU-Dead[10]", shape: "rect" },
      { key: "right", text: "AU-Right", shape: "circle" },
      { key: "wrong", text: "AU-Wrong", shape: "path" },
    ]);
  });

  it("shades the weak and dead bands from the thresholds it is given", () => {
    // weak 60 / dead 10: weak band from y(60) = 62 to y(10) = 132; dead band from 132 to y(0) = 146.
    expect(band(markup(), "weak")).toEqual({ y: "62", height: "70" });
    expect(band(markup(), "dead")).toEqual({ y: "132", height: "14" });
    // weak 50 / dead 20: y(50) = 76, y(20) = 118.
    const other = markup({ thresholds: { weak: 50, dead: 20 } });
    expect(band(other, "weak")).toEqual({ y: "76", height: "42" });
    expect(band(other, "dead")).toEqual({ y: "118", height: "28" });
    expect(textOf(other)).toContain("AU-Weak[50]");
    expect(textOf(other)).toContain("AU-Dead[20]");
  });

  it("draws no mark for a tend outside the line's time span", () => {
    const html = markup({ tends: [...TENDS, { at: T0 - DAY, correct: true }, { at: T0 + 8 * DAY, correct: false }] });
    expect(marks(html).map((m) => m.kind)).toEqual(["right", "wrong"]);
    expect(svgTag(html)).toContain("|1|1]");
  });

  it("contains no words of its own: every visible word comes from the props", () => {
    const html = markup({ onResurrect: () => {} });
    expect(textOf(html)).toBe(
      "AU-Title" +
        "AU-Epitaph" +
        "Epitaph-Text" +
        "AU-Chart" +
        "D0" +
        "D7" +
        "AU-Weak[60]" +
        "AU-Dead[10]" +
        "AU-Right" +
        "AU-Wrong" +
        "AU-Cause" +
        "Sentence-One." +
        "Sentence-Two." +
        "Sentence-Three." +
        "Revive-Word" +
        "AU-Close"
    );
    expect(html).toContain('<svg data-icon="icon-dead"></svg>');
  });

  it("has no resurrect button without onResurrect", () => {
    const html = markup();
    const labels = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1]!));
    expect(labels).toEqual(["AU-Close"]);
  });

  it("disables the resurrect button with its reason, keeping it visible and focusable", () => {
    const html = markup({ onResurrect: () => {}, resurrectDisabled: true, resurrectDisabledReason: "Reason-Text" });
    const tag = html.match(/<button\b[^>]*>Revive-Word<\/button>/)![0];
    expect(tag).toContain('aria-disabled="true"');
    expect(tag).toContain('title="Reason-Text"');
    expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
    const reasonId = html.match(/<span id="([^"]+)" hidden="">Reason-Text<\/span>/)![1];
    expect(tag).toContain(`aria-describedby="${reasonId}"`);
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(markup())).toEqual(FIXTURE_VARIABLES);
  });
});

describe("AutopsyDialog behaviour", () => {
  it("the close button and Escape call onClose", () => {
    const onClose = vi.fn();
    render(<AutopsyDialog {...props({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: "AU-Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole("dialog", { name: "AU-Title" }), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("the resurrect button calls onResurrect when enabled", () => {
    const onResurrect = vi.fn();
    render(<AutopsyDialog {...props({ onResurrect })} />);
    fireEvent.click(screen.getByRole("button", { name: "Revive-Word" }));
    expect(onResurrect).toHaveBeenCalledTimes(1);
  });

  it("a disabled resurrect button ignores clicks", () => {
    const onResurrect = vi.fn();
    render(
      <AutopsyDialog {...props({ onResurrect, resurrectDisabled: true, resurrectDisabledReason: "Reason-Text" })} />
    );
    const button = screen.getByRole("button", { name: "Revive-Word" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onResurrect).not.toHaveBeenCalled();
  });
});
