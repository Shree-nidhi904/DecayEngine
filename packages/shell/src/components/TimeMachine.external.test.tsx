// @vitest-environment jsdom
//
// The app moves the date while Play runs ("Back to today"): Play must stop and
// stay stopped. Found on the live Ghosted site: the animation kept going from
// +80 to +365 days after "Back to today". Frames and clock are injected.

import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimeMachine, type FrameScheduler } from "./TimeMachine";
import { fixtureTheme, fixtureWording } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

describe("TimeMachine, Play and an outside change", () => {
  it("stops Play when the app sets the offset back to 0, and no later frame moves it", () => {
    const pending = new Map<number, () => void>();
    let next = 1;
    const frames: FrameScheduler = {
      request(cb) { const h = next++; pending.set(h, cb); return h; },
      cancel(h) { pending.delete(h as number); },
    };
    let clockMs = 0;
    let setOffsetOutside: (ms: number) => void = () => {};
    const seen: number[] = [];
    function Harness() {
      const [offset, setOffset] = useState(0);
      setOffsetOutside = setOffset;
      return (
        <TimeMachine
          today={TODAY}
          offsetMs={offset}
          onChange={(ms) => { seen.push(ms); setOffset(ms); }}
          formatDate={(ms) => `D${(ms - TODAY) / DAY}`}
          theme={fixtureTheme}
          wording={fixtureWording}
          frames={frames}
          clock={() => clockMs}
          prefersReducedMotion={() => false}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: fixtureWording.timeMachine.play }));
    clockMs = 2_500;
    const [handle, first] = [...pending.entries()][0]!;
    pending.delete(handle);
    act(() => first());
    expect(seen[seen.length - 1]).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: fixtureWording.timeMachine.stop })).toBeTruthy();

    // The app's own "Back to today".
    act(() => setOffsetOutside(0));
    expect(screen.getByRole("button", { name: fixtureWording.timeMachine.play })).toBeTruthy();
    expect(pending.size).toBe(0);
    expect(screen.getByRole("slider")).toHaveProperty("value", "0");
  });
});
