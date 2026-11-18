import { useEffect, useRef, useState } from "react";
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
  /** Called with the new offset, from 0 to TIME_MACHINE_MAX_OFFSET_MS. */
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
}

function clampOffset(ms: number): number {
  return Math.min(TIME_MACHINE_MAX_OFFSET_MS, Math.max(0, ms));
}

/**
 * A slider from today to +60 days, quick jumps (+7, +14, +30) and Play.
 * Play moves the offset from where it is to +60 days over 5 seconds; pressing
 * it again stops. With reduced motion, Play jumps straight to +60 days.
 * Moving the slider or using a quick jump stops a running Play. Quick jumps
 * are always available. Every label comes from wording.timeMachine.
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
}: TimeMachineProps) {
  const text = wording.timeMachine;
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
    onChange(clampOffset(next));
  }

  function play() {
    // At the end already: play again from today.
    const from = offsetMs >= TIME_MACHINE_MAX_OFFSET_MS ? 0 : clampOffset(offsetMs);
    if (prefersReducedMotion()) {
      onChange(TIME_MACHINE_MAX_OFFSET_MS);
      return;
    }
    const startedAt = clock();
    const step = () => {
      const progress = Math.min(1, Math.max(0, (clock() - startedAt) / TIME_MACHINE_PLAY_MS));
      if (progress >= 1) {
        frameRef.current = null;
        setPlaying(false);
        latest.current.onChange(TIME_MACHINE_MAX_OFFSET_MS);
        return;
      }
      const raw = from + (TIME_MACHINE_MAX_OFFSET_MS - from) * progress;
      latest.current.onChange(clampOffset(Math.round(raw / TIME_MACHINE_STEP_MS) * TIME_MACHINE_STEP_MS));
      frameRef.current = { handle: latest.current.frames.request(step) };
    };
    setPlaying(true);
    if (from !== offsetMs) onChange(from);
    frameRef.current = { handle: frames.request(step) };
  }

  const days = Math.floor(clampOffset(offsetMs) / DAY_MS);
  const showing = text.showing(formatDate(today + clampOffset(offsetMs)), days);

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
        max={TIME_MACHINE_MAX_OFFSET_MS}
        step={TIME_MACHINE_STEP_MS}
        value={clampOffset(offsetMs)}
        onChange={(event) => change(Number(event.currentTarget.value))}
      />
      <div className="shell-time-machine-controls">
        {TIME_MACHINE_JUMP_DAYS.map((jumpDays) => (
          <button
            key={jumpDays}
            type="button"
            className="shell-button shell-button-quiet"
            onClick={() => change(jumpDays * DAY_MS)}
          >
            {text.jump(jumpDays)}
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
