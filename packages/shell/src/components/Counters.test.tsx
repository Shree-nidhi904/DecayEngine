import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Counters } from "./Counters";
import {
  FIXTURE_VARIABLES,
  fixtureIcons,
  fixtureTheme,
  fixtureWording,
  otherTheme,
  otherWording,
  rootStyle,
  STATES,
  textOf,
} from "../test-fixtures";
import type { ItemState } from "../types";

function badge(html: string, state: ItemState): string {
  const match = html.match(new RegExp(`<li class="shell-counter" data-state="${state}">([\\s\\S]*?)</li>`));
  if (match === null) throw new Error(`no badge for ${state} in ${html}`);
  return match[1]!;
}

const render = (props: Partial<Parameters<typeof Counters>[0]> = {}) =>
  renderToStaticMarkup(
    <Counters
      alive={4}
      weak={2}
      dead={7}
      theme={fixtureTheme}
      wording={fixtureWording}
      icons={fixtureIcons}
      {...props}
    />
  );

describe("Counters", () => {
  it("shows one badge per state, in the order alive, weak, dead", () => {
    const html = render();
    const order = [...html.matchAll(/data-state="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["alive", "weak", "dead"]);
  });

  it("puts each count next to its own list name", () => {
    const html = render();
    expect(textOf(badge(html, "alive"))).toBe("4List-A");
    expect(textOf(badge(html, "weak"))).toBe("2List-W");
    expect(textOf(badge(html, "dead"))).toBe("7List-D");
  });

  it("shows a zero count as 0", () => {
    const html = render({ alive: 0, weak: 0, dead: 0 });
    for (const state of STATES) {
      expect(badge(html, state)).toContain('<span class="shell-counter-count">0</span>');
    }
  });

  it("takes every label from the wording prop", () => {
    const html = render({ wording: otherWording });
    expect(textOf(badge(html, "alive"))).toBe("4Lit");
    expect(textOf(badge(html, "weak"))).toBe("2Dim");
    expect(textOf(badge(html, "dead"))).toBe("7Dark");
    for (const word of Object.values(fixtureWording.lists)) {
      expect(html).not.toContain(word);
    }
  });

  it("shows each state's icon, hidden from screen readers, beside the words", () => {
    const html = render();
    for (const state of STATES) {
      const part = badge(html, state);
      expect(part).toContain(
        `<span class="shell-icon" aria-hidden="true"><svg data-icon="icon-${state}"></svg></span>`
      );
      expect(part).toContain(`<span class="shell-counter-label">${fixtureWording.lists[state]}</span>`);
      // No other state's icon in this badge.
      for (const other of STATES.filter((s) => s !== state)) {
        expect(part).not.toContain(`icon-${other}`);
      }
    }
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(render())).toEqual(FIXTURE_VARIABLES);
    const other = rootStyle(render({ theme: otherTheme }));
    expect(other["--shell-alive"]).toBe("#ffff08");
    expect(other["--shell-font-mono"]).toBe("OtherMono");
  });
});
