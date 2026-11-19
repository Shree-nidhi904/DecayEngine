// @vitest-environment jsdom
//
// TriagePanel interaction: choosing a budget, custom budget validation (an
// invalid one shows an error and never calls triage), the results, the empty
// state, and Start the session (enabled and disabled).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { TriageCandidate, TriageResult } from "@decay-engine/engine";
import { TriagePanel, type TriagePanelProps } from "./TriagePanel";
import { fixtureItem, fixtureTheme, fixtureWording, type NoteData, type NotePayload } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);

type Candidate = TriageCandidate<NotePayload, NoteData>;
type Result = TriageResult<NotePayload, NoteData>;

function candidate(id: string, title: string, costMinutes: number, valuePerMinute: number, diesAt: number | null): Candidate {
  const item = { ...fixtureItem("weak", title), id, costMinutes };
  return { item, value: valuePerMinute * costMinutes, valuePerMinute, diesAt };
}

// diesAt 2.5 days ahead → "3" (rounded up); 12 days exactly → 12; null → never.
const PICK_A = candidate("a", "Note A", 1, 75, NOW + 2.5 * DAY);
const PICK_B = candidate("b", "Note B", 2, 56.25, NOW + 12 * DAY);
const OTHER_C = candidate("c", "Note C", 5, 11.25, NOW + 23.2 * DAY);
const OTHER_D = candidate("d", "Note D", 3, 8, null);
const FULL: Result = { picks: [PICK_A, PICK_B], others: [OTHER_C, OTHER_D] };

function setup(props: Partial<TriagePanelProps<NotePayload, NoteData>> = {}, result: Result = FULL) {
  const triage = vi.fn((_budget: number) => result);
  const onStartSession = vi.fn();
  const view = render(
    <TriagePanel<NotePayload, NoteData>
      theme={fixtureTheme}
      wording={fixtureWording}
      triage={triage}
      now={NOW}
      maxBudgetMinutes={1440}
      renderText={(item) => item.payload.title}
      onStartSession={onStartSession}
      {...props}
    />
  );
  return { triage, onStartSession, view };
}

const radio = (name: string) => screen.getByRole("radio", { name });
const runButton = () => screen.getByRole("button", { name: "TR-Run" });
const customField = () => screen.getByRole("textbox", { name: "TR-CustomLabel" });
const itemsOf = (listName: string) =>
  within(screen.getByRole("list", { name: listName }))
    .getAllByRole("listitem")
    .map((li) => [...li.querySelectorAll("span")].map((s) => s.textContent));

describe("TriagePanel budgets", () => {
  it("runs with 10 minutes by default", () => {
    const { triage } = setup();
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[10]]);
  });

  it("runs with the budget chosen: 5, then 20", () => {
    const { triage } = setup();
    fireEvent.click(radio("TR-Min[5]"));
    fireEvent.click(runButton());
    fireEvent.click(radio("TR-Min[20]"));
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[5], [20]]);
  });

  it("runs with a valid custom number", () => {
    const { triage } = setup();
    fireEvent.click(radio("TR-Custom"));
    fireEvent.change(customField(), { target: { value: "15" } });
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[15]]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an invalid custom number shows the error and never calls triage", () => {
    const { triage } = setup();
    fireEvent.click(radio("TR-Custom"));
    for (const value of ["", "0", "-3", "2.5", "abc", "1441"]) {
      fireEvent.change(customField(), { target: { value } });
      fireEvent.click(runButton());
      expect(screen.getByRole("alert").textContent, JSON.stringify(value)).toBe("TR-Invalid[1440]");
      expect(customField().getAttribute("aria-invalid")).toBe("true");
    }
    expect(triage).not.toHaveBeenCalled();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("an invalid custom number clears earlier results; a valid one clears the error", () => {
    const { triage } = setup();
    fireEvent.click(runButton());
    expect(screen.getByRole("list", { name: "TR-Picks" })).toBeTruthy();

    fireEvent.click(radio("TR-Custom"));
    fireEvent.change(customField(), { target: { value: "x" } });
    fireEvent.click(runButton());
    expect(screen.queryByRole("list")).toBeNull();
    expect(triage).toHaveBeenCalledTimes(1);

    fireEvent.change(customField(), { target: { value: "8" } });
    fireEvent.click(runButton());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(triage.mock.calls).toEqual([[10], [8]]);
  });

  it("uses the max it is given", () => {
    const { triage } = setup({ maxBudgetMinutes: 30 });
    fireEvent.click(radio("TR-Custom"));
    fireEvent.change(customField(), { target: { value: "31" } });
    fireEvent.click(runButton());
    expect(screen.getByRole("alert").textContent).toBe("TR-Invalid[30]");
    fireEvent.change(customField(), { target: { value: "30" } });
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[30]]);
  });
});

describe("TriagePanel results", () => {
  it("shows each pick's text, value per minute, cost and days until death, in the order given", () => {
    setup();
    fireEvent.click(runButton());
    expect(itemsOf("TR-Picks")).toEqual([
      ["Note A", "TR-VPM[75]", "TR-Cost[1]", "TR-Dies[3]"],
      ["Note B", "TR-VPM[56.25]", "TR-Cost[2]", "TR-Dies[12]"],
    ]);
  });

  it("shows each other weak item's text and days until death, and a null diesAt as never", () => {
    setup();
    fireEvent.click(runButton());
    expect(itemsOf("TR-Others")).toEqual([
      ["Note C", "TR-Dies[24]"],
      ["Note D", "TR-DiesNever"],
    ]);
  });

  it("shows the empty state instead of lists when there are no weak items", () => {
    setup({}, { picks: [], others: [] });
    fireEvent.click(runButton());
    expect(screen.getByText("TR-Empty")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("TR-Picks")).toBeNull();
    expect(screen.queryByRole("button", { name: "TR-Start" })).toBeNull();
  });

  it("says nothing fits when weak items exist but none is picked, and offers no start", () => {
    setup({}, { picks: [], others: [OTHER_C] });
    fireEvent.click(runButton());
    expect(screen.getByText("TR-NothingFits")).toBeTruthy();
    expect(itemsOf("TR-Others")).toEqual([["Note C", "TR-Dies[24]"]]);
    expect(screen.queryByRole("button", { name: "TR-Start" })).toBeNull();
  });

  it("works the result out again when the triage function changes (a new now)", () => {
    const later: Result = { picks: [PICK_B], others: [] };
    const { view, triage } = setup();
    fireEvent.click(radio("TR-Min[5]"));
    fireEvent.click(runButton());
    const next = vi.fn((_budget: number) => later);
    view.rerender(
      <TriagePanel<NotePayload, NoteData>
        theme={fixtureTheme}
        wording={fixtureWording}
        triage={next}
        now={NOW + DAY}
        maxBudgetMinutes={1440}
        renderText={(item) => item.payload.title}
        onStartSession={() => {}}
      />
    );
    expect(triage.mock.calls).toEqual([[5]]);
    expect(next.mock.calls).toEqual([[5]]);
    // One day later, 12 days becomes 11.
    expect(itemsOf("TR-Picks")).toEqual([["Note B", "TR-VPM[56.25]", "TR-Cost[2]", "TR-Dies[11]"]]);
  });
});

describe("TriagePanel Start the session", () => {
  it("passes the picks, in order, to onStartSession", () => {
    const { onStartSession } = setup();
    fireEvent.click(runButton());
    fireEvent.click(screen.getByRole("button", { name: "TR-Start" }));
    expect(onStartSession).toHaveBeenCalledTimes(1);
    expect(onStartSession.mock.calls[0]![0].map((c: Candidate) => c.item.id)).toEqual(["a", "b"]);
  });

  it("when disabled, stays visible with the reason and does nothing; triage still runs", () => {
    const { onStartSession, triage } = setup({ startDisabled: true, startDisabledReason: "Reason-Text" });
    fireEvent.click(runButton());
    expect(triage).toHaveBeenCalledTimes(1);
    const start = screen.getByRole("button", { name: "TR-Start" });
    expect(start.getAttribute("aria-disabled")).toBe("true");
    expect(start.getAttribute("title")).toBe("Reason-Text");
    expect(document.getElementById(start.getAttribute("aria-describedby")!)?.textContent).toBe("Reason-Text");
    fireEvent.click(start);
    expect(onStartSession).not.toHaveBeenCalled();
  });

  it("when enabled, is not aria-disabled and has no title", () => {
    setup();
    fireEvent.click(runButton());
    const start = screen.getByRole("button", { name: "TR-Start" });
    expect(start.hasAttribute("aria-disabled")).toBe(false);
    expect(start.hasAttribute("title")).toBe(false);
  });
});

describe("TriagePanel initialBudget", () => {
  it("runs straight away with that budget selected", () => {
    const calls: number[] = []
    render(
      <TriagePanel
        theme={fixtureTheme}
        wording={fixtureWording}
        triage={(minutes) => {
          calls.push(minutes)
          return { picks: [], others: [] }
        }}
        now={0}
        maxBudgetMinutes={1440}
        renderText={() => "x"}
        onStartSession={() => {}}
        initialBudget={20}
      />
    )
    expect(calls).toEqual([20])
    expect((screen.getByRole("radio", { name: fixtureWording.triage.minutes(20) }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(fixtureWording.triage.empty)).toBeTruthy()
  })
})
