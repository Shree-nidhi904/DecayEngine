import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeMachine, TIME_MACHINE_MAX_OFFSET_MS, type TimeMachineProps } from "./TimeMachine";
import { FIXTURE_VARIABLES, fixtureTheme, fixtureWording, otherTheme, otherWording, rootStyle, textOf } from "../test-fixtures";

const DAY = 86_400_000;
const TODAY = Date.UTC(2026, 9, 1); // fixed, never the clock

// Shows the time as whole days after TODAY, so a test can see which time was formatted.
const formatDate = (ms: number) => `D${(ms - TODAY) / DAY}`;

function render(props: Partial<TimeMachineProps> = {}): string {
  return renderToStaticMarkup(
    <TimeMachine
      today={TODAY}
      offsetMs={0}
      onChange={() => {}}
      formatDate={formatDate}
      theme={fixtureTheme}
      wording={fixtureWording}
      {...props}
    />
  );
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1]!));
}

function slider(html: string): string {
  return html.match(/<input\b[^>]*>/)![0];
}

describe("TimeMachine markup", () => {
  it("is a slider from 0 to 60 days in one-hour steps, holding the offset prop", () => {
    expect(TIME_MACHINE_MAX_OFFSET_MS).toBe(60 * DAY);
    const tag = slider(render({ offsetMs: 7 * DAY }));
    expect(tag).toContain('type="range"');
    expect(tag).toContain('min="0"');
    expect(tag).toContain(`max="${60 * DAY}"`);
    expect(tag).toContain('step="3600000"');
    expect(tag).toContain(`value="${7 * DAY}"`);
    expect(tag).toContain('aria-label="TM-Slider"');
  });

  it("shows today + offset through formatDate, with whole days ahead", () => {
    expect(textOf(render({ offsetMs: 0 }))).toContain("TM-Showing[D0|0]");
    expect(textOf(render({ offsetMs: 14 * DAY }))).toContain("TM-Showing[D14|14]");
    // 2.5 days ahead counts as 2 whole days; the date is still formatted from the exact time.
    expect(textOf(render({ offsetMs: 2.5 * DAY }))).toContain("TM-Showing[D2.5|2]");
    // The slider reads the same line to screen readers.
    expect(slider(render({ offsetMs: 14 * DAY }))).toContain('aria-valuetext="TM-Showing[D14|14]"');
  });

  it("has the quick jumps +7, +14, +30 and Play, labelled from the wording, at any offset", () => {
    for (const offsetMs of [0, 30 * DAY, 60 * DAY]) {
      expect(buttons(render({ offsetMs }))).toEqual(["TM-Jump[7]", "TM-Jump[14]", "TM-Jump[30]", "TM-Play"]);
      // Always available: none is disabled.
      expect(render({ offsetMs })).not.toMatch(/disabled/);
    }
    expect(buttons(render({ wording: otherWording }))).toEqual(["skip 7", "skip 14", "skip 30", "Run"]);
  });

  it("contains no words of its own", () => {
    expect(textOf(render({ offsetMs: DAY }))).toBe(
      "TM-Title" + "TM-Showing[D1|1]" + "TM-Jump[7]" + "TM-Jump[14]" + "TM-Jump[30]" + "TM-Play"
    );
    expect(render()).toContain('aria-label="TM-Title"');
  });

  it("keeps a shown offset within 0 to 60 days", () => {
    expect(slider(render({ offsetMs: 90 * DAY }))).toContain(`value="${60 * DAY}"`);
    expect(slider(render({ offsetMs: -DAY }))).toContain('value="0"');
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(render())).toEqual(FIXTURE_VARIABLES);
    expect(rootStyle(render({ theme: otherTheme }))["--shell-accent"]).toBe("#ffff07");
  });
});
