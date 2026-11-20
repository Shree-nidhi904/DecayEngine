// @vitest-environment jsdom
//
// TriagePanel with app-chosen budget choices (Requirement 27, design 3.2):
// choices of 15, 30, 60 and 120 plus custom, the default choice, an
// initialBudget inside and outside the list, the custom budget limit, and
// today's behaviour when no list is given. No real clock.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TriageCandidate, TriageResult } from "@decay-engine/engine";
import { TRIAGE_BUDGETS, TriagePanel, type TriagePanelProps } from "./TriagePanel";
import { fixtureItem, fixtureTheme, fixtureWording, type NoteData, type NotePayload } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);
const GHOSTED_BUDGETS = [15, 30, 60, 120] as const;

type Result = TriageResult<NotePayload, NoteData>;

const PICK: TriageCandidate<NotePayload, NoteData> = {
  item: { ...fixtureItem("weak", "Note A"), id: "a", costMinutes: 15 },
  value: 150,
  valuePerMinute: 10,
  diesAt: NOW + 4 * DAY,
};
const RESULT: Result = { picks: [PICK], others: [] };

function setup(props: Partial<TriagePanelProps<NotePayload, NoteData>> = {}) {
  const triage = vi.fn((_budget: number) => RESULT);
  render(
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
  return { triage };
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const runButton = () => screen.getByRole("button", { name: "TR-Run" });
const radioLabels = () =>
  (screen.getAllByRole("radio") as HTMLInputElement[]).map((input) => input.closest("label")!.textContent);
const checkedLabel = () =>
  (screen.getAllByRole("radio") as HTMLInputElement[])
    .filter((input) => input.checked)
    .map((input) => input.closest("label")!.textContent);
const picksShown = () => screen.queryByRole("list", { name: "TR-Picks" }) !== null;

describe("TriagePanel with budgets 15, 30, 60, 120", () => {
  it("shows the four choices plus custom, in order", () => {
    setup({ budgets: GHOSTED_BUDGETS });
    expect(radioLabels()).toEqual(["TR-Min[15]", "TR-Min[30]", "TR-Min[60]", "TR-Min[120]", "TR-Custom"]);
  });

  it("runs triage with each choice", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS });
    for (const minutes of GHOSTED_BUDGETS) {
      fireEvent.click(radio(`TR-Min[${minutes}]`));
      fireEvent.click(runButton());
    }
    expect(triage.mock.calls).toEqual([[15], [30], [60], [120]]);
    expect(picksShown()).toBe(true);
  });

  it("selects the first choice when no defaultBudget is given, and runs nothing yet", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS });
    expect(checkedLabel()).toEqual(["TR-Min[15]"]);
    expect(triage).not.toHaveBeenCalled();
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[15]]);
  });

  it("selects defaultBudget={60}", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS, defaultBudget: 60 });
    expect(checkedLabel()).toEqual(["TR-Min[60]"]);
    fireEvent.click(runButton());
    expect(triage.mock.calls).toEqual([[60]]);
  });

  it("ignores a defaultBudget that is not in the list and selects the first choice", () => {
    setup({ budgets: GHOSTED_BUDGETS, defaultBudget: 10 });
    expect(checkedLabel()).toEqual(["TR-Min[15]"]);
  });

  it("initialBudget={30} runs triage once with 30 and selects 30", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS, initialBudget: 30 });
    expect(triage.mock.calls).toEqual([[30]]);
    expect(checkedLabel()).toEqual(["TR-Min[30]"]);
    expect(picksShown()).toBe(true);
  });

  it("initialBudget={10}, not in the list, runs nothing and selects the fallback", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS, initialBudget: 10 });
    expect(triage).not.toHaveBeenCalled();
    expect(picksShown()).toBe(false);
    expect(checkedLabel()).toEqual(["TR-Min[15]"]);
  });

  it("initialBudget={10} with defaultBudget={60} runs nothing and selects 60", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS, initialBudget: 10, defaultBudget: 60 });
    expect(triage).not.toHaveBeenCalled();
    expect(checkedLabel()).toEqual(["TR-Min[60]"]);
  });

  it("a custom budget still obeys maxBudgetMinutes", () => {
    const { triage } = setup({ budgets: GHOSTED_BUDGETS, maxBudgetMinutes: 120 });
    fireEvent.click(radio("TR-Custom"));
    const field = screen.getByRole("textbox", { name: "TR-CustomLabel" });

    fireEvent.change(field, { target: { value: "121" } });
    fireEvent.click(runButton());
    expect(screen.getByRole("alert").textContent).toBe("TR-Invalid[120]");
    expect(triage).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "120" } });
    fireEvent.click(runButton());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(triage.mock.calls).toEqual([[120]]);
  });
});

describe("TriagePanel without budgets keeps today's behaviour", () => {
  it("TRIAGE_BUDGETS is still 5, 10, 20", () => {
    expect(TRIAGE_BUDGETS).toEqual([5, 10, 20]);
  });

  it("shows 5, 10, 20 plus custom with 10 selected, and runs nothing yet", () => {
    const { triage } = setup();
    expect(radioLabels()).toEqual(["TR-Min[5]", "TR-Min[10]", "TR-Min[20]", "TR-Custom"]);
    expect(checkedLabel()).toEqual(["TR-Min[10]"]);
    expect(triage).not.toHaveBeenCalled();
  });

  it("treats an empty list as no list", () => {
    setup({ budgets: [] });
    expect(radioLabels()).toEqual(["TR-Min[5]", "TR-Min[10]", "TR-Min[20]", "TR-Custom"]);
    expect(checkedLabel()).toEqual(["TR-Min[10]"]);
  });

  it("initialBudget={20} runs triage with 20 and selects 20", () => {
    const { triage } = setup({ initialBudget: 20 });
    expect(triage.mock.calls).toEqual([[20]]);
    expect(checkedLabel()).toEqual(["TR-Min[20]"]);
  });

  it("keeps today's quirk: initialBudget={15} runs triage with 15 while 10 stays selected", () => {
    const { triage } = setup({ initialBudget: 15 });
    expect(triage.mock.calls).toEqual([[15]]);
    expect(checkedLabel()).toEqual(["TR-Min[10]"]);
    expect(picksShown()).toBe(true);
  });
});
