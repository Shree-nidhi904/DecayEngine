// Shell boundary: reads every source file in packages/shell/src and fails if
// the shell imports an app, imports the engine for anything but types, or
// mentions one app's colour names or words. The shell gets all of those
// from props (ThemeProps roles, WordingProps, StateIcons).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const THIS_FILE = "boundary.test.ts";

const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => /\.(ts|tsx|css)$/.test(f))
  .filter((f) => f.replace(/\\/g, "/") !== THIS_FILE)
  .map((f) => ({ name: f, text: readFileSync(join(SRC, f), "utf8") }));

// Study Dungeon's palette names (theme-and-wording.md) and its list,
// action and state words (src/wording.ts in the app). "lurking" is the
// Triage heading for weak facts not picked (round 5). Round 6 adds the
// autopsy legend's "Forgot" and the hero's "souls banished" and
// "weakening"; the autopsy dialog must take them from the wording.
const APP_COLOUR_NAMES = ["stone", "stoneHi", "bone", "boneDim", "ecto", "pumpkin", "blood", "moon", "slate"];
const APP_WORDS = [
  "Crypt",
  "Dungeon",
  "Graveyard",
  "Fight",
  "Challenge",
  "sleeping",
  "monster",
  "lurking",
  "forgot",
  "souls",
  "banished",
  "weakening",
];

function importSpecifiers(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]!);
}

describe("shell boundary", () => {
  it("finds the shell's source files", () => {
    const names = files.map((f) => f.name.replace(/\\/g, "/"));
    expect(names).toEqual(
      expect.arrayContaining([
        "types.ts",
        "theme.ts",
        "shell.css",
        "components/Counters.tsx",
        "components/ItemCard.tsx",
        "components/HistoryLogViewer.tsx",
        "components/TimeMachine.tsx",
        "components/PreviewBanner.tsx",
        "components/TriagePanel.tsx",
        "components/AutopsyDialog.tsx",
      ])
    );
  });

  it("never imports an app or another workspace package except the engine", () => {
    for (const { name, text } of files) {
      for (const spec of importSpecifiers(text)) {
        expect(spec, `${name} imports ${spec}`).not.toMatch(/(^|\/)apps\//);
        if (spec.startsWith("@decay-engine/")) {
          expect(spec, `${name} imports ${spec}`).toBe("@decay-engine/engine");
        }
      }
    }
  });

  it("imports the engine for types only", () => {
    for (const { name, text } of files) {
      const statements = [
        ...text.matchAll(/\b(import|export)\b([^;]*?)\bfrom\s*["']@decay-engine\/engine["']/g),
      ];
      for (const s of statements) {
        expect(s[2], `${name}: ${s[0]}`).toMatch(/^\s*type\b/);
      }
    }
  });

  it("never names an app colour", () => {
    const pattern = new RegExp(`\\b(${APP_COLOUR_NAMES.join("|")})\\b`, "i");
    for (const { name, text } of files) {
      expect(text.match(pattern)?.[0], `${name} names an app colour`).toBeUndefined();
    }
  });

  it("never hard-codes an app's list, action or state words", () => {
    const pattern = new RegExp(`\\b(${APP_WORDS.join("|")})\\b`, "i");
    for (const { name, text } of files) {
      expect(text.match(pattern)?.[0], `${name} hard-codes an app word`).toBeUndefined();
    }
  });
});
