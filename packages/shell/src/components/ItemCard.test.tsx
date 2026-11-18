import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ItemCard, type ItemCardProps } from "./ItemCard";
import {
  FIXTURE_VARIABLES,
  fixtureIcons,
  fixtureItem,
  fixtureTheme,
  fixtureWording,
  otherTheme,
  otherWording,
  rootStyle,
  STATES,
  textOf,
  type NoteData,
  type NotePayload,
} from "../test-fixtures";
import type { ItemState } from "../types";

const noop = () => {};

function render(state: ItemState, props: Partial<ItemCardProps<NotePayload, NoteData>> = {}): string {
  return renderToStaticMarkup(
    <ItemCard<NotePayload, NoteData>
      item={fixtureItem(state, "What is the note?")}
      state={state}
      theme={fixtureTheme}
      wording={fixtureWording}
      icons={fixtureIcons}
      renderText={(item) => item.payload.title}
      {...props}
    />
  );
}

/** Text of every <button>, in order. */
function buttons(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => textOf(m[1]!));
}

describe("ItemCard", () => {
  it("shows each state as its icon and its words, and marks the card with the state", () => {
    for (const state of STATES) {
      const html = render(state);
      expect(html).toMatch(new RegExp(`^<article class="shell-item-card" data-state="${state}"`));
      expect(html).toContain(
        `<p class="shell-state"><span class="shell-icon" aria-hidden="true"><svg data-icon="icon-${state}"></svg></span>` +
          `<span class="shell-state-label">${fixtureWording.states[state]}</span></p>`
      );
      for (const other of STATES.filter((s) => s !== state)) {
        expect(html).not.toContain(`icon-${other}`);
        expect(html).not.toContain(fixtureWording.states[other]);
      }
    }
  });

  it("takes the state words from the wording prop", () => {
    expect(textOf(render("alive", { wording: otherWording }))).toContain("glowing");
    expect(textOf(render("weak", { wording: otherWording }))).toContain("flickering");
    expect(textOf(render("dead", { wording: otherWording }))).toContain("out");
  });

  it("labels the action wording.actions.tend for alive and weak items", () => {
    expect(buttons(render("alive", { onAction: noop }))).toEqual(["Tend-Word"]);
    expect(buttons(render("weak", { onAction: noop }))).toEqual(["Tend-Word"]);
    expect(buttons(render("weak", { onAction: noop, wording: otherWording }))).toEqual(["Call"]);
  });

  it("labels the action wording.actions.resurrect for dead items", () => {
    expect(buttons(render("dead", { onAction: noop }))).toEqual(["Revive-Word"]);
    expect(buttons(render("dead", { onAction: noop, wording: otherWording }))).toEqual(["Rekindle"]);
  });

  it("shows a remove button labelled wording.actions.remove only when onRemove is given", () => {
    expect(buttons(render("alive", { onAction: noop, onRemove: noop }))).toEqual(["Tend-Word", "Remove-Word"]);
    expect(buttons(render("dead", { onRemove: noop, wording: otherWording }))).toEqual(["Forget"]);
    expect(buttons(render("alive", { onAction: noop }))).toEqual(["Tend-Word"]);
  });

  it("shows an edit button labelled wording.actions.edit only when onEdit is given", () => {
    expect(buttons(render("alive", { onAction: noop, onEdit: noop }))).toEqual(["Tend-Word", "Edit-Word"]);
    expect(buttons(render("dead", { onEdit: noop, wording: otherWording }))).toEqual(["Rewrite"]);
    expect(buttons(render("weak", { onAction: noop, onRemove: noop }))).not.toContain("Edit-Word");
  });

  it("orders the buttons action, edit, remove", () => {
    expect(buttons(render("weak", { onAction: noop, onEdit: noop, onRemove: noop }))).toEqual([
      "Tend-Word",
      "Edit-Word",
      "Remove-Word",
    ]);
    expect(buttons(render("dead", { onAction: noop, onEdit: noop, onRemove: noop }))).toEqual([
      "Revive-Word",
      "Edit-Word",
      "Remove-Word",
    ]);
  });

  it("makes the edit button a plain button described by the item's text", () => {
    const html = render("alive", { onEdit: noop });
    const textId = html.match(/<p id="([^"]+)" class="shell-item-text">/)?.[1];
    expect(textId).toBeDefined();
    const tags = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('type="button"');
    expect(tags[0]).toContain(`aria-describedby="${textId}"`);
  });

  it("shows no buttons when neither onAction nor onRemove is given", () => {
    const html = render("weak");
    expect(buttons(html)).toEqual([]);
    expect(html).not.toContain("shell-item-actions");
  });

  it("makes every button a plain button, described by the item's text", () => {
    const html = render("alive", { onAction: noop, onRemove: noop });
    const textId = html.match(/<p id="([^"]+)" class="shell-item-text">/)?.[1];
    expect(textId).toBeDefined();
    const tags = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain('type="button"');
      expect(tag).toContain(`aria-describedby="${textId}"`);
    }
    expect(html).toContain(`aria-labelledby="${textId}"`);
  });

  it("shows the text from renderText, given the item", () => {
    const html = render("alive", { renderText: (item) => `${item.id}: ${item.payload.title}` });
    expect(html).toMatch(/<p id="[^"]+" class="shell-item-text">note-alive: What is the note\?<\/p>/);
  });

  it("shows the detail from renderDetail, and no detail block without it", () => {
    const withDetail = render("weak", { renderDetail: (item) => `health ${item.health}` });
    expect(withDetail).toContain('<div class="shell-item-detail">health 30</div>');
    expect(render("weak")).not.toContain("shell-item-detail");
    expect(render("weak", { renderDetail: () => null })).not.toContain("shell-item-detail");
  });

  it("contains no words of its own: every visible word comes from the props", () => {
    const html = render("dead", { onAction: noop, onRemove: noop, renderDetail: () => "Detail-Text" });
    expect(textOf(html)).toBe("State-D" + "What is the note?" + "Detail-Text" + "Revive-Word" + "Remove-Word");
    const withEdit = render("alive", { onAction: noop, onEdit: noop, onRemove: noop });
    expect(textOf(withEdit)).toBe("State-A" + "What is the note?" + "Tend-Word" + "Edit-Word" + "Remove-Word");
  });

  it("disabled keeps every button and its label, marks each aria-disabled and titles it with the reason", () => {
    const html = render("weak", {
      onAction: noop,
      onEdit: noop,
      onRemove: noop,
      disabled: true,
      disabledReason: "Reason-Text",
    });
    expect(buttons(html)).toEqual(["Tend-Word", "Edit-Word", "Remove-Word"]);
    const tags = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(3);
    for (const tag of tags) {
      expect(tag).toContain('aria-disabled="true"');
      expect(tag).toContain('title="Reason-Text"');
      // Not the native attribute: the buttons stay focusable so the reason can be read.
      expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it("disabled describes each button by the item's text and the reason", () => {
    const html = render("dead", { onAction: noop, disabled: true, disabledReason: "Reason-Text" });
    const textId = html.match(/<p id="([^"]+)" class="shell-item-text">/)?.[1];
    const reason = html.match(/<span id="([^"]+)" hidden="">Reason-Text<\/span>/);
    expect(textId).toBeDefined();
    expect(reason).not.toBeNull();
    const tag = html.match(/<button\b[^>]*>/)![0];
    expect(tag).toContain(`aria-describedby="${textId} ${reason![1]}"`);
  });

  it("without disabled, no button is aria-disabled or titled and no reason is rendered", () => {
    const html = render("alive", { onAction: noop, onEdit: noop, onRemove: noop, disabledReason: "Reason-Text" });
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("Reason-Text");
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    expect(rootStyle(render("alive"))).toEqual(FIXTURE_VARIABLES);
    const other = rootStyle(render("dead", { theme: otherTheme }));
    expect(other["--shell-dead"]).toBe("#ffff0a");
    expect(other["--shell-accent"]).toBe("#ffff07");
  });
});
