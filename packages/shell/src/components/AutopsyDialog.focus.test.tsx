// @vitest-environment jsdom
//
// AutopsyDialog focus on open (Requirement 28.5, design 3.3 "Focus on open"):
// with focusContentOnOpen the title h2 takes focus and has tabindex="-1";
// without it (omitted or false) the title has no tabindex and never takes
// focus, as today. Fixed times, never the clock.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AutopsyDialog, type AutopsyDialogProps } from "./AutopsyDialog";
import { fixtureIcons, fixtureTheme, fixtureWording } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // fixed, never the clock

function props(overrides: Partial<AutopsyDialogProps> = {}): AutopsyDialogProps {
  return {
    theme: fixtureTheme,
    wording: fixtureWording,
    icons: fixtureIcons,
    epitaph: "Epitaph-Text",
    causeSentences: ["Sentence-One."],
    points: [
      { at: T0, health: 100 },
      { at: T0 + 7 * DAY, health: 9.99 },
    ],
    tends: [],
    thresholds: { weak: 60, dead: 10 },
    formatDate: (ms) => `D${(ms - T0) / DAY}`,
    onClose: () => {},
    onResurrect: () => {},
    ...overrides,
  };
}

const title = () => screen.getByRole("heading", { level: 2, name: "AU-Title" });

describe("AutopsyDialog focusContentOnOpen", () => {
  it("moves focus to the title when the dialog opens, and makes it focusable by script only", () => {
    render(<AutopsyDialog {...props({ focusContentOnOpen: true })} />);
    expect(document.activeElement).toBe(title());
    expect(title().getAttribute("tabindex")).toBe("-1");
    // Not the first button: the content comes first.
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Revive-Word" }));
  });

  it("works without a chart or an epitaph too", () => {
    render(<AutopsyDialog {...props({ focusContentOnOpen: true, points: [], epitaph: undefined })} />);
    expect(document.activeElement).toBe(title());
  });
});

describe("AutopsyDialog without focusContentOnOpen keeps today's focus", () => {
  for (const [name, overrides] of [
    ["omitted", {}],
    ["false", { focusContentOnOpen: false }],
  ] as const) {
    it(`${name}: the title has no tabindex and does not take focus`, () => {
      render(<AutopsyDialog {...props(overrides)} />);
      expect(title().hasAttribute("tabindex")).toBe(false);
      expect(document.activeElement).not.toBe(title());
      expect(title().contains(document.activeElement)).toBe(false);
    });
  }

  it("omitted and false give the same markup", () => {
    // useId gives each mount new ids, so they are blanked before comparing.
    const html = (container: HTMLElement) => container.innerHTML.replace(/:r\w+:/g, "ID");
    const omitted = html(render(<AutopsyDialog {...props()} />).container);
    cleanup();
    const off = html(render(<AutopsyDialog {...props({ focusContentOnOpen: false })} />).container);
    expect(off).toBe(omitted);
  });
});
