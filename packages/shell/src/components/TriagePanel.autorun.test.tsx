// @vitest-environment jsdom
// The optional `autoRun` prop (feedback list, point 12): no run button, and a
// budget runs as soon as it is chosen. Without the prop, today's panel.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TriageResult } from "@decay-engine/engine";
import { TriagePanel, type TriagePanelProps } from "./TriagePanel";
import { fixtureTheme, fixtureWording, type NoteData, type NotePayload } from "../test-fixtures";

const NOW = Date.UTC(2026, 9, 1);
const EMPTY: TriageResult<NotePayload, NoteData> = { picks: [], others: [] };

afterEach(cleanup);

function panel(props: Partial<TriagePanelProps<NotePayload, NoteData>>, calls: number[]) {
  return render(
    <TriagePanel<NotePayload, NoteData>
      theme={fixtureTheme}
      wording={fixtureWording}
      triage={(minutes) => {
        calls.push(minutes);
        return EMPTY;
      }}
      now={NOW}
      maxBudgetMinutes={1440}
      renderText={(item) => item.payload.title}
      onStartSession={() => {}}
      {...props}
    />
  );
}

describe("TriagePanel autoRun", () => {
  it("has no run button with autoRun, and keeps it without", () => {
    panel({ autoRun: true }, []);
    expect(screen.queryByRole("button", { name: "TR-Run" })).toBeNull();
    cleanup();
    panel({}, []);
    expect(screen.getByRole("button", { name: "TR-Run" })).toBeTruthy();
  });

  it("runs triage as soon as a budget is chosen", () => {
    const calls: number[] = [];
    panel({ autoRun: true }, calls);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[20]" }));
    expect(calls).toEqual([20]);
    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[5]" }));
    expect(calls).toEqual([20, 5]);
  });

  it("runs a valid custom budget while typing, and says so when it is not one", () => {
    const calls: number[] = [];
    panel({ autoRun: true }, calls);
    fireEvent.click(screen.getByRole("radio", { name: "TR-Custom" }));
    const box = screen.getByLabelText("TR-CustomLabel");
    fireEvent.change(box, { target: { value: "45" } });
    expect(calls).toEqual([45]);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(box, { target: { value: "abc" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(calls).toEqual([45]);
  });

  it("without autoRun, choosing a budget runs nothing until the button is pressed", () => {
    const calls: number[] = [];
    panel({}, calls);
    fireEvent.click(screen.getByRole("radio", { name: "TR-Min[20]" }));
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "TR-Run" }));
    expect(calls).toEqual([20]);
  });
});
