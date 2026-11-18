import { describe, expect, it } from "vitest";
import { shellCssVariables, shellStyle } from "./theme";
import { FIXTURE_VARIABLES, fixtureTheme } from "./test-fixtures";
import type { ThemeProps } from "./types";

describe("shellCssVariables", () => {
  it("maps every colour and font role to its --shell-* name", () => {
    expect(shellCssVariables(fixtureTheme)).toEqual(FIXTURE_VARIABLES);
  });

  it("reads only the roles, ignoring any other key on the theme object", () => {
    const withExtra = {
      colors: { ...fixtureTheme.colors, extra: "#123456" },
      fonts: { ...fixtureTheme.fonts, fancy: "Fancy" },
    } as ThemeProps;
    expect(shellCssVariables(withExtra)).toEqual(FIXTURE_VARIABLES);
  });

  it("returns the same variables as a style object", () => {
    expect(shellStyle(fixtureTheme)).toEqual(FIXTURE_VARIABLES);
  });
});
