# Testing

Moved here from the README. `bash scripts/check.sh` runs everything below and the same script runs in CI on every push.

## Kinds of test

| Kind | What it checks | Example |
|---|---|---|
| Unit | One engine or UI operation | `settle` clamps health to 0 to 100 |
| Property (fast-check) | A rule over many generated inputs | Triage never exceeds the budget and equals the brute-force optimum |
| Outcome | An exact result worked out by hand | A Ghosted contact with a 30-day rhythm is exactly 60 on day 36, exactly 10 on day 81, and dark just after |
| Source checks | Rules about the code itself | The engine imports no app, reads no clock, and has no runtime dependency |
| Whole-app | The App as a user meets it | A preview never saves anything (a property test over every write control) |
| Build and bundle | The monorepo as shipped | Production builds, and the default bundles contain no network code |

## Engine rules checked by property tests

- Health is always between 0 and 100.
- A dead item never appears in the due list.
- The same input at the same moment gives the same answer.
- Triage never goes over your time budget, and finds the best possible set.
- Looking into the future (view, Triage, Autopsy, forecast) never changes saved data.

Each generator has a coverage test, so a property cannot pass only because it never generated the interesting cases. (One such test caught a fast-check 4 change that had left Life Triage's generator producing mostly brand-new items.)

## Source checks in the apps

- No import from another app.
- No network in an app's own source (the optional sync code is a separate package loaded on request).
- No clock in the tests.
- Colours from the app's tokens only, and contrast checked.
- Motion only behind `prefers-reduced-motion`.
- A 320px layout.
- The wording rules (for example, a light never claims to measure how much someone matters).

## The engine-unchanged check

`scripts/check-engine-unchanged.sh` compares `packages/engine` with the `engine-complete` tag. Changes to `src/` and `tests/` are allowed only if every changed line is a whole-line comment. Every other file must be byte-for-byte the same, and any untracked file under the engine fails. The shell is checked against an allow-list from the Ghosted spec.
