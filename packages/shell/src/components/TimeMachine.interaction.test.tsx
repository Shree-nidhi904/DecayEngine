// @vitest-environment jsdom
//
// TimeMachine interaction: the slider, the quick jumps, Play driven frame by
// frame through an injected frame scheduler and clock, Stop, and the
// reduced-motion jump. No real clock and no real timers.

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimeMachine, type FrameScheduler } from "./TimeMachine";
import { fixtureTheme, fixtureWording } from "../test-fixtures";

afterEach(cleanup);

const DAY = 86_400_000;
const TODAY = Date.UTC(2026, 9, 1);

/** Frames run only when the test says so. */
function fakeFrames() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const cancelled: unknown[] = [];
  const frames: FrameScheduler = {
    request(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      cancelled.push(handle);
      pending.delete(handle as number);
    },
  };
  /** Runs the one pending frame. Fails if there is none. */
  const runFrame = () => {
    const first = [...pending.entries()][0];
    if (first === undefined) throw new Error("test bug: no frame pending");
    pending.delete(first[0]);
    act(() => first[1]());
  };
  return { frames, runFrame, pendingCount: () => pending.size, cancelled };
}

/** The app side: holds the offset and records every onChange. */
function setup(options: { start?: number; reducedMotion?: boolean } = {}) {
  const fake = fakeFrames();
  let clockMs = 1_000;
  const seen: number[] = [];
  const reducedMotion = vi.fn(() => options.reducedMotion ?? false);
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
        prefersReducedMotion={reducedMotion}
      />
    );
  }
  const view = render(<Harness />);
  return {
    ...fake,
    view,
    seen,
    reducedMotion,
    setClock: (ms: number) => {
      clockMs = ms;
    },
  };
}

const slider = () => screen.getByRole("slider", { name: "TM-Slider" }) as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name });
const showing = () => screen.getByText(/^TM-Showing/).textContent;

describe("TimeMachine slider and quick jumps", () => {
  it("moving the slider reports the new offset and shows that day", () => {
    const { seen } = setup();
    fireEvent.change(slider(), { target: { value: String(34 * DAY) } });
    expect(seen).toEqual([34 * DAY]);
    expect(slider().value).toBe(String(34 * DAY));
    expect(showing()).toBe("TM-Showing[D34|34]");
  });

  it("+7, +14 and +30 set the offset to exactly that many days", () => {
    const { seen } = setup();
    fireEvent.click(button("TM-Jump[7]"));
    fireEvent.click(button("TM-Jump[14]"));
    fireEvent.click(button("TM-Jump[30]"));
    expect(seen).toEqual([7 * DAY, 14 * DAY, 30 * DAY]);
    expect(showing()).toBe("TM-Showing[D30|30]");
  });

  it("the quick jumps also work from a later offset (always available)", () => {
    const { seen } = setup({ start: 45 * DAY });
    fireEvent.click(button("TM-Jump[7]"));
    expect(seen).toEqual([7 * DAY]);
  });
});

describe("TimeMachine Play", () => {
  it("animates from today to +60 days over 5 seconds, one frame at a time", () => {
    const { seen, runFrame, pendingCount, setClock } = setup();
    setClock(1_000);
    fireEvent.click(button("TM-Play"));
    expect(button("TM-Stop")).toBeTruthy();
    expect(pendingCount()).toBe(1);
    expect(seen).toEqual([]); // nothing moves until the first frame

    setClock(1_000 + 1_250); // a quarter of 5 s → 15 days
    runFrame();
    setClock(1_000 + 2_500); // half → 30 days
    runFrame();
    expect(seen).toEqual([15 * DAY, 30 * DAY]);
    expect(showing()).toBe("TM-Showing[D30|30]");
    expect(pendingCount()).toBe(1);

    setClock(1_000 + 5_000); // the end
    runFrame();
    expect(seen).toEqual([15 * DAY, 30 * DAY, 60 * DAY]);
    expect(pendingCount()).toBe(0); // finished: no more frames
    expect(button("TM-Play")).toBeTruthy();
  });

  it("starts from the current offset: from +30, half-way is +45", () => {
    const { seen, runFrame, setClock } = setup({ start: 30 * DAY });
    setClock(0);
    fireEvent.click(button("TM-Play"));
    setClock(2_500);
    runFrame();
    expect(seen).toEqual([45 * DAY]);
  });

  it("rounds each frame to whole hours", () => {
    const { seen, runFrame, setClock } = setup();
    setClock(0);
    fireEvent.click(button("TM-Play"));
    // 1 ms of 5000 is 1440 h / 5000 = 0.288 h, which rounds to 0 h.
    setClock(1);
    runFrame();
    // 3 ms is 0.864 h, which rounds to 1 h.
    setClock(3);
    runFrame();
    expect(seen).toEqual([0, 3_600_000]);
  });

  it("pressing it again stops: the pending frame is cancelled and the offset stays", () => {
    const { seen, runFrame, pendingCount, setClock, cancelled } = setup();
    setClock(0);
    fireEvent.click(button("TM-Play"));
    setClock(2_500);
    runFrame();
    expect(seen).toEqual([30 * DAY]);

    fireEvent.click(button("TM-Stop"));
    expect(pendingCount()).toBe(0);
    expect(cancelled).toHaveLength(1);
    expect(button("TM-Play")).toBeTruthy();
    expect(seen).toEqual([30 * DAY]);
    expect(showing()).toBe("TM-Showing[D30|30]");
  });

  it("moving the slider while playing stops the animation", () => {
    const { seen, pendingCount, setClock } = setup();
    setClock(0);
    fireEvent.click(button("TM-Play"));
    fireEvent.change(slider(), { target: { value: String(3 * DAY) } });
    expect(pendingCount()).toBe(0);
    expect(seen).toEqual([3 * DAY]);
    expect(button("TM-Play")).toBeTruthy();
  });

  it("a quick jump while playing stops the animation", () => {
    const { seen, pendingCount, setClock } = setup();
    setClock(0);
    fireEvent.click(button("TM-Play"));
    fireEvent.click(button("TM-Jump[14]"));
    expect(pendingCount()).toBe(0);
    expect(seen).toEqual([14 * DAY]);
  });

  it("at +60 already, Play runs again from today", () => {
    const { seen, runFrame, setClock } = setup({ start: 60 * DAY });
    setClock(0);
    fireEvent.click(button("TM-Play"));
    expect(seen).toEqual([0]);
    setClock(2_500);
    runFrame();
    expect(seen).toEqual([0, 30 * DAY]);
  });

  it("unmounting while playing cancels the pending frame", () => {
    const { view, pendingCount, setClock } = setup();
    setClock(0);
    fireEvent.click(button("TM-Play"));
    expect(pendingCount()).toBe(1);
    view.unmount();
    expect(pendingCount()).toBe(0);
  });
});

describe("TimeMachine Play with reduced motion", () => {
  it("jumps straight to +60 days with no frames", () => {
    const { seen, pendingCount, reducedMotion } = setup({ reducedMotion: true });
    fireEvent.click(button("TM-Play"));
    expect(reducedMotion).toHaveBeenCalled();
    expect(seen).toEqual([60 * DAY]);
    expect(pendingCount()).toBe(0);
    expect(showing()).toBe("TM-Showing[D60|60]");
    expect(button("TM-Play")).toBeTruthy();
  });

  it("reads the preference when Play is pressed, not only once", () => {
    const { reducedMotion } = setup({ reducedMotion: true });
    fireEvent.click(button("TM-Play"));
    fireEvent.click(button("TM-Play"));
    expect(reducedMotion).toHaveBeenCalledTimes(2);
  });
});
