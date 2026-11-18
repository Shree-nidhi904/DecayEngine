// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PreviewBanner } from "./PreviewBanner";
import { FIXTURE_VARIABLES, fixtureTheme, fixtureWording, otherWording, rootStyle, textOf } from "../test-fixtures";

afterEach(cleanup);

describe("PreviewBanner", () => {
  it("shows the banner words and the back button, and nothing of its own", () => {
    const html = renderToStaticMarkup(
      <PreviewBanner theme={fixtureTheme} wording={fixtureWording} onBackToToday={() => {}} />
    );
    expect(textOf(html)).toBe("PV-Banner" + "PV-Back");
    expect(html).toMatch(/^<div class="shell-preview-banner" role="status"/);
    expect(textOf(renderToStaticMarkup(
      <PreviewBanner theme={fixtureTheme} wording={otherWording} onBackToToday={() => {}} />
    ))).toBe("Just looking" + "Return");
  });

  it("sets exactly the --shell-* variables from the theme prop on its root", () => {
    const html = renderToStaticMarkup(
      <PreviewBanner theme={fixtureTheme} wording={fixtureWording} onBackToToday={() => {}} />
    );
    expect(rootStyle(html)).toEqual(FIXTURE_VARIABLES);
  });

  it("calls onBackToToday when its button is pressed", () => {
    const onBackToToday = vi.fn();
    render(<PreviewBanner theme={fixtureTheme} wording={fixtureWording} onBackToToday={onBackToToday} />);
    fireEvent.click(screen.getByRole("button", { name: "PV-Back" }));
    expect(onBackToToday).toHaveBeenCalledTimes(1);
  });
});
