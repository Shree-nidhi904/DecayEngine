# Architecture

```
decay-engine/
  packages/
    engine/              the core: states, policy contract, Triage, Autopsy, forecast, history
    shell/               the shared frame: counters, item card, history, Triage panel, time machine
    insight/             replay and what-if on the engine's public API (Rescue Point)
    life-triage/         one Triage budget across several engines, on the public API
    persist/ pwa/ cloud/ optional storage, install and sync code, loaded on request
  apps/
    study-dungeon/       app 1
    ghosted/             app 2, built on the unchanged engine
    policy-lab/          write a policy in the browser and run it on the engine
    life-triage/         plan one budget across Study Dungeon and Ghosted
  scripts/               check.sh, the engine-unchanged check, the bundle check
  docs/                  design notes, the Kiro log and write-up, the submission drafts
  .kiro/                 Kiro specs, steering, hooks, a custom agent and a power
```

## Rules

- The engine never imports an app, the shell or a browser API (outside one storage adapter), and has no runtime dependencies.
- Time is an input to every engine function, never read from a clock.
- The shell is shared UI. Changes to it for one app must be optional and off by default, so the other app is unchanged.
- Optional packages (`persist`, `pwa`, `cloud`) are loaded on request, so a default build makes no network request.

## Shell additions made for Ghosted

| Shell component | Optional addition |
|---|---|
| `TimeMachine` | `maxDays` and `jumpDays` |
| `TriagePanel` | `budgets` and `defaultBudget` |
| `AutopsyDialog` | `markers`, `renderMarker`, `markerSummary` and `focusContentOnOpen` |

## More

- Writing a policy: [ADDING_A_POLICY.md](ADDING_A_POLICY.md)
- Cloud sync: [CLOUD.md](CLOUD.md) and [PUSH_SETUP.md](PUSH_SETUP.md)
- Tests: [TESTING.md](TESTING.md)
