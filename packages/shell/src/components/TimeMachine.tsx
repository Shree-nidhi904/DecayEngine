import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ThemeProps, WordingProps } from "../types";
import { shellStyle } from "../theme";
import "../shell.css";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** How far ahead the time machine reaches: 60 days. */
export const TIME_MACHINE_MAX_DAYS = 60;
/** The largest offset, in milliseconds. */
export const TIME_MACHINE_MAX_OFFSET_MS = TIME_MACHINE_MAX_DAYS * DAY_MS;
/** The quick jumps, in days ahead of today. */
export const TIME_MACHINE_JUMP_DAYS: readonly number[] = [7, 14, 30];
/** How long Play takes to reach the end. */
export const TIME_MACHINE_PLAY_MS = 5_000;
/** Slider step, and what Play rounds each frame's offset to. */
export const TIME_MACHINE_STEP_MS = HOUR_MS;

/** Schedules animation frames. The default uses requestAnimationFrame; tests pass a fake one. */
export interface FrameScheduler {
  request(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

const browserFrames: FrameScheduler = {
  request: (callback) => globalThis.requestAnimationFrame(() => callback()),
  cancel: (handle) => globalThis.cancelAnimationFrame(handle as number),
};

const browserClock = () => globalThis.performance.now();

const browserPrefersReducedMotion = () =>
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface TimeMachineProps {
  /** Today's time in ms: the start of the slider. */
  today: number;
  /** How far ahead of today is shown, in ms (0 = today). Controlled by the app. */
  offsetMs: number;
  /** Called with the new offset, from 0 to maxDays days. */
  onChange: (offsetMs: number) => void;
  /** Formats the previewed time (today + offsetMs) for display. Supplied by the app. */
  formatDate: (ms: number) => string;
  theme: ThemeProps;
  wording: WordingProps;
  /** Animation frames for Play. Defaults to requestAnimationFrame. */
  frames?: FrameScheduler;
  /** A clock in ms for Play's timing. Defaults to performance.now. */
  clock?: () => number;
  /** Whether the user asked for reduced motion. Defaults to the prefers-reduced-motion media query. */
  prefersReducedMotion?: () => boolean;
  /** Optional app content shown right under the slider (for example a timeline of predicted changes). */
  belowSlider?: ReactNode;
  /** Days the slider reaches. A positive whole number; anything else uses the default. Default TIME_MACHINE_MAX_DAYS (60). */
  maxDays?: number;
  /** Quick jumps, in days ahead of today, shown in this order. Default TIME_MACHINE_JUMP_DAYS ([7, 14, 30]). */
  jumpDays?: readonly number[];
}

function isPositiveWholeNumber(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function clampOffset(ms: number, maxMs: number): number {
  return Math.min(maxMs, Math.max(0, ms));
}

/**
 * A slider from today to +maxDays days (default 60), quick jumps (default
 * +7, +14, +30) and Play. Play moves the offset from where it is to the end
 * over 5 seconds; pressing it again stops. With reduced motion, Play jumps
 * straight to the end. Moving the slider or using a quick jump stops a
 * running Play. Quick jumps are always available; one beyond the range is
 * clamped to the end. Every label comes from wording.timeMachine.
 */
export function TimeMachine({
  today,
  offsetMs,
  onChange,
  formatDate,
  theme,
  wording,
  frames = browserFrames,
  clock = browserClock,
  prefersReducedMotion = browserPrefersReducedMotion,
  belowSlider,
  maxDays = TIME_MACHINE_MAX_DAYS,
  jumpDays = TIME_MACHINE_JUMP_DAYS,
}: TimeMachineProps) {
  const text = wording.timeMachine;
  const maxMs = (isPositiveWholeNumber(maxDays) ? maxDays : TIME_MACHINE_MAX_DAYS) * DAY_MS;
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<{ handle: unknown } | null>(null);
  // The latest props, so a running animation never calls a stale onChange.
  const latest = useRef({ onChange, frames });
  latest.current = { onChange, frames };

  function cancelFrame() {
    if (frameRef.current !== null) {
      latest.current.frames.cancel(frameRef.current.handle);
      frameRef.current = null;
    }
  }

  // Stop the animation when the component goes away.
  useEffect(() => cancelFrame, []);

  function stop() {
    cancelFrame();
    setPlaying(false);
  }

  function change(next: number) {
    stop();
    onChange(clampOffset(next, maxMs));
  }

  function play() {
    // At the end already: play again from today.
    const from = offsetMs >= maxMs ? 0 : clampOffset(offsetMs, maxMs);
    if (prefersReducedMotion()) {
      onChange(maxMs);
      return;
    }
    const startedAt = clock();
    const step = () => {
      const progress = Math.min(1, Math.max(0, (clock() - startedAt) / TIME_MACHINE_PLAY_MS));
      if (progress >= 1) {
        frameRef.current = null;
        setPlaying(false);
        latest.current.onChange(maxMs);
        return;
      }
      const raw = from + (maxMs - from) * progress;
      latest.current.onChange(clampOffset(Math.round(raw / TIME_MACHINE_STEP_MS) * TIME_MACHINE_STEP_MS, maxMs));
      frameRef.current = { handle: latest.current.frames.request(step) };
    };
    setPlaying(true);
    if (from !== offsetMs) onChange(from);
    frameRef.current = { handle: frames.request(step) };
  }

  const days = Math.floor(clampOffset(offsetMs, maxMs) / DAY_MS);
  const showing = text.showing(formatDate(today + clampOffset(offsetMs, maxMs)), days);

  return (
    <section className="shell-time-machine" style={shellStyle(theme)} aria-label={text.title}>
      <h2 className="shell-time-machine-title">{text.title}</h2>
      <p className="shell-time-machine-showing">{showing}</p>
      <input
        type="range"
        className="shell-time-machine-slider"
        aria-label={text.slider}
        aria-valuetext={showing}
        min={0}
        max={maxMs}
        step={TIME_MACHINE_STEP_MS}
        value={clampOffset(offsetMs, maxMs)}
        onChange={(event) => change(Number(event.currentTarget.value))}
      />
      {belowSlider}
      <div className="shell-time-machine-controls">
        {jumpDays.map((jump) => (
          <button
            key={jump}
            type="button"
            className="shell-button shell-button-quiet"
            onClick={() => change(jump * DAY_MS)}
          >
            {text.jump(jump)}
          </button>
        ))}
        <button
          type="button"
          className="shell-button shell-button-primary"
          onClick={playing ? stop : play}
        >
          {playing ? text.stop : text.play}
        </button>
      </div>
    </section>
  );
}
