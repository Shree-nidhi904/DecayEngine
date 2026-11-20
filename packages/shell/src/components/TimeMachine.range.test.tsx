// @vitest-environment jsdom
//
// TimeMachine with an app-chosen range and jump list (Requirement 26): a
// 365-day range with jumps of 30, 90, 180 and 365 days, the clamp on
// onChange, Play's end, reduced-motion Play, and the fallback to 60 days for
// an invalid range. Frames and clock are injected; no real clock or timers.

import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  TIME_MACHINE_JUMP_DAYS,
  TIME_MACHINE_MAX_DAYS,
  TIME_MACHINE_MAX_OFFSET_MS,
  TimeMachine,
  type FrameScheduler,
} from "./TimeMachine";
import { fixtureTheme, fixtureWording } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const TODAY = 1_700_000_000_000;

/** Frames run only when the test says so. */
function fakeFrames() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const frames: FrameScheduler = {
    request(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      pending.delete(handle as number);
    },
  };
  const runFrame = () => {
    const first = [...pending.entries()][0];
    if (first === undefined) throw new Error("test bug: no frame pending");
    pending.delete(first[0]);
    act(() => first[1]());
  };
  return { frames, runFrame, pendingCount: () => pending.size };
}

type Options = {
  maxDays?: number;
  jumpDays?: readonly number[];
  start?: number;
  reducedMotion?: boolean;
};

/** The app side: holds the offset and records every onChange. */
function setup(options: Options = {}) {
  const fake = fakeFrames();
  let clockMs = 0;
  const seen: number[] = [];
  function Harness() {
    const [offset, setOffset] = useState(options.start ?? 0);
    return (
      <TimeMachine
        today={TODAY}
        offsetMs={offset}
        onChange={(ms) => {
          seen.push(ms);
          setOffset(ms);
        }}
        formatDate={(ms) => `D${(ms - TODAY) / DAY}`}
        theme={fixtureTheme}
        wording={fixtureWording}
        frames={fake.frames}
        clock={() => clockMs}
        prefersReducedMotion={() => options.reducedMotion ?? false}
        {...("maxDays" in options ? { maxDays: options.maxDays } : {})}
        {...("jumpDays" in options ? { jumpDays: options.jumpDays } : {})}
      />
    );
  }
  render(<Harness />);
  return {
    ...fake,
    seen,
    setClock: (ms: number) => {
      clockMs = ms;
    },
  };
}

const YEAR = { maxDays: 365, jumpDays: [30, 90, 180, 365] } as const;

const slider = () => screen.getByRole("slider", { name: "TM-Slider" }) as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name });
const jumpLabels = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((label) => label.startsWith("TM-Jump"));
const showing = () => screen.getByText(/^TM-Showing/).textContent;

describe("TimeMachine with a 365-day range and jumps of 30, 90, 180 and 365", () => {
  it("the slider reaches exactly 365 days", () => {
    setup(YEAR);
    expect(slider().max).toBe(String(365 * DAY));
    expect(slider().min).toBe("0");
  });

  it("shows one jump button per entry, in the given order", () => {
    setup(YEAR);
    expect(jumpLabels()).toEqual(["TM-Jump[30]", "TM-Jump[90]", "TM-Jump[180]", "TM-Jump[365]"]);
  });

  it("each jump sets the offset to exactly that many days", () => {
    const { seen } = setup(YEAR);
    fireEvent.click(button("TM-Jump[30]"));
    fireEvent.click(button("TM-Jump[90]"));
    fireEvent.click(button("TM-Jump[180]"));
    fireEvent.click(button("TM-Jump[365]"));
    expect(seen).toEqual([30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY]);
    expect(showing()).toBe("TM-Showing[D365|365]");
  });

  it("the slider can move past the default 60 days", () => {
    const { seen } = setup(YEAR);
    fireEvent.change(slider(), { target: { value: String(200 * DAY) } });
    expect(seen).toEqual([200 * DAY]);
    expect(showing()).toBe("TM-Showing[D200|200]");
  });

  it("onChange is clamped at 365 days: a jump beyond the range reports 365 days", () => {
    const { seen } = setup({ maxDays: 365, jumpDays: [30, 400] });
    fireEvent.click(button("TM-Jump[400]"));
    expect(seen).toEqual([365 * DAY]);
  });

  it("an offset prop beyond the range is shown as the end of the range", () => {
    setup({ ...YEAR, start: 500 * DAY });
    expect(slider().value).toBe(String(365 * DAY));
    expect(showing()).toBe("TM-Showing[D365|365]");
  });

  it("Play runs from today to 365 days over 5 seconds and ends at 365 days", () => {
    const { seen, runFrame, pendingCount, setClock } = setup(YEAR);
    setClock(0);
    fireEvent.click(button("TM-Play"));
    setClock(2_500); // half of 5 s → 182.5 days, a whole number of hours
    runFrame();
    expect(seen).toEqual([182.5 * DAY]);
    setClock(5_000);
    runFrame();
    expect(seen).toEqual([182.5 * DAY, 365 * DAY]);
    expect(pendingCount()).toBe(0);
    expect(button("TM-Play")).toBeTruthy();
  });

  it("at 365 days already, Play runs again from today", () => {
    const { seen, runFrame, setClock } = setup({ ...YEAR, start: 365 * DAY });
    setClock(0);
    fireEvent.click(button("TM-Play"));
    expect(seen).toEqual([0]);
    setClock(5_000);
    runFrame();
    expect(seen).toEqual([0, 365 * DAY]);
  });

  it("from 60 days (the old end), Play keeps going instead of restarting", () => {
    const { seen, runFrame, setClock } = setup({ ...YEAR, start: 60 * DAY });
    setClock(0);
    fireEvent.click(button("TM-Play"));
    expect(seen).toEqual([]); // no restart from today
    setClock(5_000);
    runFrame();
    expect(seen).toEqual([365 * DAY]);
  });

  it("with reduced motion, Play jumps straight to 365 days with no frames", () => {
    const { seen, pendingCount } = setup({ ...YEAR, reducedMotion: true });
    fireEvent.click(button("TM-Play"));
    expect(seen).toEqual([365 * DAY]);
    expect(pendingCount()).toBe(0);
    expect(showing()).toBe("TM-Showing[D365|365]");
  });
});

describe("TimeMachine falls back to 60 days for an invalid range", () => {
  for (const maxDays of [0, -1, 1.5, Number.NaN]) {
    it(`maxDays ${String(maxDays)} gives a 60-day slider, clamp and Play end`, () => {
      const { seen } = setup({ maxDays, jumpDays: [30, 90], reducedMotion: true });
      expect(slider().max).toBe(String(60 * DAY));
      fireEvent.click(button("TM-Jump[90]"));
      expect(seen).toEqual([60 * DAY]);
      fireEvent.click(button("TM-Play"));
      expect(seen).toEqual([60 * DAY, 60 * DAY]);
    });
  }
});

describe("TimeMachine defaults are unchanged", () => {
  it("the exported constants keep their values", () => {
    expect(TIME_MACHINE_MAX_DAYS).toBe(60);
    expect(TIME_MACHINE_MAX_OFFSET_MS).toBe(60 * DAY);
    expect(TIME_MACHINE_JUMP_DAYS).toEqual([7, 14, 30]);
  });

  it("without the new props: a 60-day slider, jumps 7, 14 and 30, and a clamp at 60 days", () => {
    const { seen } = setup({ reducedMotion: true });
    expect(slider().max).toBe(String(60 * DAY));
    expect(jumpLabels()).toEqual(["TM-Jump[7]", "TM-Jump[14]", "TM-Jump[30]"]);
    fireEvent.click(button("TM-Play"));
    expect(seen).toEqual([60 * DAY]);
  });

  it("a jump list alone keeps the 60-day range", () => {
    const { seen } = setup({ jumpDays: [90] });
    expect(slider().max).toBe(String(60 * DAY));
    fireEvent.click(button("TM-Jump[90]"));
    expect(seen).toEqual([60 * DAY]);
  });
});
