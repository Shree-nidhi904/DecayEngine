import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TriageResult } from "@decay-engine/engine";
import { TriagePanel, TRIAGE_BUDGETS, daysUntil, parseBudget, type TriagePanelProps } from "./TriagePanel";
import {
  FIXTURE_VARIABLES,
  fixtureTheme,
  fixtureWording,
  otherTheme,
  otherWording,
  rootStyle,
  textOf,
  type NoteData,
  type NotePayload,
} from "../test-fixtures";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);
const EMPTY: TriageResult<NotePayload, NoteData> = { picks: [], others: [] };

function render(props: Partial<TriagePanelProps<NotePayload, NoteData>> = {}): string {
  return renderToStaticMarkup(
    <TriagePanel<NotePayload, NoteData>
      theme={fixtureTheme}
      wording={fixtureWording}
      triage={() => EMPTY}
      now={NOW}
      maxBudgetMinutes={1440}
      renderText={(item) => item.payload.title}
      onStartSession={() => {}}
      {...props}
    />
  );
}

describe("TriagePanel markup before a run", () => {
  it("offers 5, 10 and 20 minutes and a custom choice, with 10 chosen", () => {
    expect(TRIAGE_BUDGETS).toEqual([5, 10, 20]);
    const html = render();
    const labels = [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((m) => textOf(m[1]!));
    expect(labels).toEqual(["TR-Min[5]", "TR-Min[10]", "TR-Min[20]", "TR-Custom"]);
    const radios = [...html.matchAll(/<input type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(4);
    expect(radios.map((r) => r.includes('checked=""'))).toEqual([false, true, false, false]);
  });

  it("shows only the title, the choices and the run button: no results, no custom field yet", () => {
    expect(textOf(render())).toBe(
      "TR-Title" + "TR-Budget" + "TR-Min[5]" + "TR-Min[10]" + "TR-Min[20]" + "TR-Custom" + "TR-Run"
    );
    expect(render()).not.toContain("TR-CustomLabel");
  });

  it("does not run triage before the run button is pressed", () => {
    let calls = 0;
    render({
      triage: () => {
        calls++;
        return EMPTY;
      },
    });
    expect(calls).toBe(0);
  });

  it("takes every word from the wording prop", () => {
    expect(textOf(render({ wording: otherWording }))).toBe(
      "Rescue" + "Spare time" + "5 minutes" + "10 minutes" + "20 minutes" + "My own" + "Plan"
    );
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(render())).toEqual(FIXTURE_VARIABLES);
    expect(rootStyle(render({ theme: otherTheme }))["--shell-panel"]).toBe("#ffff02");
  });
});

describe("daysUntil", () => {
  it("counts whole days, rounding a part day up, and never below 0", () => {
    expect(daysUntil(NOW + 3 * DAY, NOW)).toBe(3);
    expect(daysUntil(NOW + 2.64 * DAY, NOW)).toBe(3);
    expect(daysUntil(NOW + 1, NOW)).toBe(1);
    expect(daysUntil(NOW, NOW)).toBe(0);
    expect(daysUntil(NOW - DAY, NOW)).toBe(0);
  });
});

describe("parseBudget", () => {
  it("accepts a whole number from 1 to max, with spaces around it", () => {
    expect(parseBudget("1", 1440)).toBe(1);
    expect(parseBudget(" 15 ", 1440)).toBe(15);
    expect(parseBudget("1440", 1440)).toBe(1440);
  });

  it("rejects anything else", () => {
    for (const text of ["", " ", "0", "-3", "2.5", "1e2", "abc", "12abc", "1441", "+5"]) {
      expect(parseBudget(text, 1440), JSON.stringify(text)).toBeNull();
    }
  });
});
