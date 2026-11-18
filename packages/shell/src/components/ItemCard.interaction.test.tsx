// @vitest-environment jsdom
//
// ItemCard clicks: enabled buttons call their handler; disabled ones call nothing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemCard } from "./ItemCard";
import { fixtureIcons, fixtureItem, fixtureTheme, fixtureWording, type NoteData, type NotePayload } from "../test-fixtures";

afterEach(cleanup);

function setup(disabled: boolean) {
  const handlers = { onAction: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn() };
  render(
    <ItemCard<NotePayload, NoteData>
      item={fixtureItem("weak")}
      state="weak"
      theme={fixtureTheme}
      wording={fixtureWording}
      icons={fixtureIcons}
      renderText={(item) => item.payload.title}
      disabled={disabled}
      disabledReason="Reason-Text"
      {...handlers}
    />
  );
  return handlers;
}

const button = (name: string) => screen.getByRole("button", { name });

describe("ItemCard clicks", () => {
  it("calls each handler once when enabled", () => {
    const { onAction, onEdit, onRemove } = setup(false);
    fireEvent.click(button("Tend-Word"));
    fireEvent.click(button("Edit-Word"));
    fireEvent.click(button("Remove-Word"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("calls nothing when disabled, though the buttons are still there and focusable", () => {
    const { onAction, onEdit, onRemove } = setup(true);
    for (const name of ["Tend-Word", "Edit-Word", "Remove-Word"]) {
      const b = button(name);
      b.focus();
      expect(document.activeElement).toBe(b);
      fireEvent.click(b);
    }
    expect(onAction).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("gives each disabled button the reason as part of its description", () => {
    setup(true);
    const b = button("Tend-Word");
    const ids = b.getAttribute("aria-describedby")!.split(" ");
    const described = ids.map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["A note", "Reason-Text"]);
  });
});
