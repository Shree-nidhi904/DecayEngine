// @vitest-environment jsdom
//
// TriagePanel's optional line under the picks (Ghosted Requirement 36.11,
// design section 13.2): the `picksNote` prop. Without it the panel renders
// exactly as before; with it, a plain <p class="shell-triage-note"> sits
// straight after the picks list and straight before the start button, only
// while there are picks and the text is not empty. Placeholder words only,
// as in the other shell tests. No real clock.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TriageCandidate, TriageResult } from "@decay-engine/engine";
import { TriagePanel, type TriagePanelProps } from "./TriagePanel";
import { fixtureItem, fixtureTheme, fixtureWording, type NoteData, type NotePayload } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);

type Candidate = TriageCandidate<NotePayload, NoteData>;
type Result = TriageResult<NotePayload, NoteData>;

function candidate(id: string, title: string, valuePerMinute: number): Candidate {
  return {
    item: { ...fixtureItem("weak", title), id },
    value: valuePerMinute * 3,
    valuePerMinute,
    diesAt: NOW + 4 * DAY,
  };
}

const A = candidate("a", "Note A", 10);
const B = candidate("b", "Note B", 5);
const TWO_PICKS: Result = { picks: [A, B], others: [] };
const ONE_PICK: Result = { picks: [B], others: [A] };
const NOTHING_FITS: Result = { picks: [], others: [A] };
const EMPTY: Result = { picks: [], others: [] };

type Props = Partial<TriagePanelProps<NotePayload, NoteData>>;

function setup(props: Props = {}, results: (budget: number) => Result = () => TWO_PICKS) {
  const triage = vi.fn(results);
  const view = render(
    <TriagePanel<NotePayload, NoteData>
      theme={fixtureTheme}
      wording={fixtureWording}
      triage={triage}
      now={NOW}
      maxBudgetMinutes={1440}
      renderText={(item) => item.payload.title}
      onStartSession={vi.fn()}
      {...props}
    />
  );
  return { triage, ...view };
}

const note = () => document.querySelector<HTMLElement>(".shell-triage-note");
const picksList = () => screen.getByRole("list", { name: "TR-Picks" });
const startButton = () => screen.getByRole("button", { name: "TR-Start" });
const runButton = () => screen.getByRole("button", { name: "TR-Run" });
/** Markup with the useId values taken out: each render gets new ids, so only the rest is compared. */
const withoutIds = (html: string) =>
  html.replace(/\b(id|for|name|aria-labelledby|aria-describedby)="[^"]*"/g, '$1="?"');
const lastPicks = (fn: { mock: { calls: Candidate[][][] } }) => fn.mock.calls[fn.mock.calls.length - 1]![0]!;
/** Everything in the panel that takes part in the Tab order. */
const tabStops = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]")].filter(
    (el) => el.getAttribute("tabindex") !== "-1"
  );

describe("TriagePanel without picksNote keeps today's output", () => {
  it("shows no line, and renders the same children as with a picksNote that returns null", () => {
    const without = setup({ initialBudget: 10 });
    expect(note()).toBeNull();
    const before = withoutIds(without.container.innerHTML);
    expect(before).toContain("TR-Start");
    cleanup();

    const withNull = setup({ initialBudget: 10, picksNote: () => null });
    expect(note()).toBeNull();
    expect(withoutIds(withNull.container.innerHTML)).toBe(before);
  });
});

describe("TriagePanel with picksNote", () => {
  it("shows the text in a <p> straight after the picks list and straight before the start button's wrapper", () => {
    const picksNote = vi.fn((_picks: Candidate[]) => "TR-Note");
    setup({ initialBudget: 10, picksNote });
    const line = note()!;
    expect(line).not.toBeNull();
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe("TR-Note");
    expect(line.previousElementSibling).toBe(picksList());
    expect(line.nextElementSibling).toBe(startButton().parentElement);
    // Called with the picks in the order shown.
    expect(picksNote).toHaveBeenCalled();
    expect(lastPicks(picksNote).map((c) => c.item.id)).toEqual(["a", "b"]);
  });

  it("the line and the picks list are both direct children of the panel, so the panel's gap spaces them", () => {
    const { container } = setup({ initialBudget: 10, picksNote: () => "TR-Note" });
    const panel = container.querySelector<HTMLElement>(".shell-triage")!;
    expect(note()!.parentElement).toBe(panel);
    expect(picksList().parentElement).toBe(panel);
    expect(startButton().parentElement!.parentElement).toBe(panel);
  });

  it("renders no <p> when it returns null or an empty string", () => {
    setup({ initialBudget: 10, picksNote: () => null });
    expect(note()).toBeNull();
    cleanup();
    setup({ initialBudget: 10, picksNote: () => "" });
    expect(note()).toBeNull();
    expect(document.querySelectorAll(".shell-triage p")).toHaveLength(0);
  });

  it("is not called, and nothing renders, before the first run", () => {
    const picksNote = vi.fn(() => "TR-Note");
    const { triage } = setup({ picksNote });
    expect(triage).not.toHaveBeenCalled();
    expect(picksNote).not.toHaveBeenCalled();
    expect(note()).toBeNull();
  });

  it("is not called when nothing fits the budget", () => {
    const picksNote = vi.fn(() => "TR-Note");
    setup({ initialBudget: 10, picksNote }, () => NOTHING_FITS);
    expect(screen.getByText("TR-NothingFits")).toBeTruthy();
    expect(picksNote).not.toHaveBeenCalled();
    expect(note()).toBeNull();
  });

  it("is not called when there are no weak items at all", () => {
    const picksNote = vi.fn(() => "TR-Note");
    setup({ initialBudget: 10, picksNote }, () => EMPTY);
    expect(screen.getByText("TR-Empty")).toBeTruthy();
    expect(picksNote).not.toHaveBeenCalled();
    expect(note()).toBeNull();
  });

  it("follows the budget: another budget and Run call it with the new picks, and the text follows", () => {
    const picksNote = vi.fn((picks: Candidate[]) => `TR-Note[${picks.map((c) => c.item.id).join(",")}]`);
    setup({ initialBudget: 10, picksNote }, (budget) => (budget === 5 ? ONE_PICK : TWO_PICKS));
    expect(note()!.textContent).toBe("TR-Note[a,b]");

    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[5]" }));
    fireEvent.click(runButton());
    expect(note()!.textContent).toBe("TR-Note[b]");
    expect(lastPicks(picksNote).map((c) => c.item.id)).toEqual(["b"]);

    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[20]" }));
    fireEvent.click(runButton());
    expect(note()!.textContent).toBe("TR-Note[a,b]");
  });

  it("goes away when the next run has no picks", () => {
    setup({ initialBudget: 10, picksNote: () => "TR-Note" }, (budget) => (budget === 5 ? NOTHING_FITS : TWO_PICKS));
    expect(note()).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[5]" }));
    fireEvent.click(runButton());
    expect(note()).toBeNull();
  });

  it("is a plain paragraph: no aria-live, role, id or tabindex, and no live region around it", () => {
    setup({ initialBudget: 10, picksNote: () => "TR-Note" });
    const line = note()!;
    for (const attribute of ["aria-live", "role", "id", "tabindex"]) {
      expect(line.hasAttribute(attribute), attribute).toBe(false);
    }
    expect(line.closest("[aria-live], [role='status'], [role='alert']")).toBeNull();
  });

  it("adds no Tab stop: the panel's Tab stops are the same with and without it", () => {
    const without = setup({ initialBudget: 10 });
    const before = tabStops(without.container).map((el) => withoutIds(el.outerHTML));
    expect(before.length).toBeGreaterThan(0);
    cleanup();
    const withNote = setup({ initialBudget: 10, picksNote: () => "TR-Note" });
    const after = tabStops(withNote.container);
    expect(after.map((el) => withoutIds(el.outerHTML))).toEqual(before);
    expect(after).not.toContain(note());
  });
});

describe("shell.css: the line's spacing comes from the panel's gap", () => {
  const css = readFileSync(join(process.cwd(), "src", "shell.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );

  /** The declarations of the rule whose whole selector is `selector`. */
  function declarations(selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    expect(match, `a rule for ${selector}`).not.toBeNull();
    const decls = new Map<string, string>();
    for (const part of match![1]!.split(";")) {
      const colon = part.indexOf(":");
      if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    }
    return decls;
  }

  it(".shell-triage-note has margin 0 and the dim text colour", () => {
    const decls = declarations(".shell-triage-note");
    expect(decls.get("margin")).toBe("0");
    expect(decls.get("color")).toBe("var(--shell-text-dim)");
  });

  it(".shell-triage is a flex column with a 0.75rem (12px) gap", () => {
    const decls = declarations(".shell-triage");
    expect(decls.get("display")).toBe("flex");
    expect(decls.get("flex-direction")).toBe("column");
    expect(decls.get("gap")).toBe("0.75rem");
  });

  it("no rule hides the line or gives it a negative margin", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.includes(".shell-triage-note"));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, , body] of rules) {
      expect(body).not.toMatch(/display\s*:\s*none/);
      expect(body).not.toMatch(/visibility\s*:\s*hidden/);
      expect(body).not.toMatch(/margin[a-z-]*\s*:\s*[^;]*-\d/);
    }
  });
});
