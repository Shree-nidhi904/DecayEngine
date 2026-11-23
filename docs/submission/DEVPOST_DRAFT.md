# Devpost text, draft

Written for: the Kiroween 2026 judges and anyone reading the project page cold. Fill each section into the matching Devpost field. Lines marked **[IF BUILT]** must be deleted unless the feature is in the live apps on submission day. Lines marked **[CHECK]** hold a number that moves; confirm it on the last day.

**Category:** Skeleton Crew
**Live:** https://decay-engine-landing.netlify.app (the start page), https://decay-engine-study-dungeon.netlify.app, https://decay-engine-ghosted.netlify.app
**Source:** https://github.com/Shree-nidhi904/DecayEngine

---

## Tagline (one line)

One engine for things that fade. It shows what you will lose, helps you decide what to save, and tells you what died and why.

## Inspiration

Everything that matters fades if you ignore it: facts you studied, friendships you keep meaning to call. Reminder apps treat all of it as a date. We wanted the opposite: a real **health** value for every item that falls over time, so an app can say what will be lost and when, to the minute, and why something already died.

## What it does

Decay Engine is a small library for anything that loses strength over time. Two apps run on it, with two very different rules.

**Study Dungeon.** Facts you study become monsters in a torch-lit dungeon. A right answer restores a fact and doubles how long you will remember it; a wrong one halves it. The hero says what is at risk right now.

**Ghosted.** A street of windows, one per person. A light shows how recently you were in touch, and a call or a meet-up relights it. It never claims a light measures how much someone matters, and the app never calls a person "dead".

Both apps do the same four things, because the engine does them:

- **Predict.** A time machine moves the whole app forward, so you can see next week today. Nothing is saved while you look. Each hero says what you lose in the next 7 days if you do nothing.
- **Prioritise.** "I have 20 minutes." Triage picks the best set to tend, with an exact answer (an exact knapsack, not a greedy guess), and says how many picks this session keeps alive past the next 7 days.
- **Explain.** When something dies, a plain-language autopsy says what happened and when. Facts only, never blame.
- **Bring back.** Dead things can be resurrected under each app's own rules.

**[IF BUILT]** **Rescue Point.** Each autopsy ends with a what-if, replayed from the real history: "A review on 14 Nov, when it first went weak, would have kept it alive until 9 Jan."

Everything runs in your browser. No account, no server, no network calls, and a test checks that.

## How we built it

**One engine, one policy and one skin per app.** The engine knows nothing about what an item is. An app gives it a decay policy (six small pure functions) and a look. The engine never reads a clock and never touches the browser; both rules are enforced by tests that read the source.

**The Skeleton Crew proof.** Ghosted was built on the engine with **zero changes** to `packages/engine`. A script in the check suite compares the engine against a tag set before either app existed, and fails on any changed line that is not a comment. It runs on every check.

**Built with Kiro.** Specs first, for the engine and both apps (requirements, then design, then tasks, with a review after each), steering files that Kiro loads on every prompt, three hooks, a read-only custom agent that reviews an app's decay policy against the contract, two MCP servers (Context7 for docs, Playwright to measure the real layout in a browser), Kiro CLI for checks, and the Netlify power for the deploy. **[CHECK]** About 3 in 4 lines of code were written in Kiro, and the rest by a second tool (Claude Code) at our request, each file labelled in a header comment and in `.kiro/steering/authorship.md`. `docs/KIRO_WRITEUP.md` has the session-by-session record, including the mistakes.

**Tested.** **[CHECK]** Over 2,200 tests: the engine's 17 correctness properties run at least 100 times each, and Ghosted has property suites for its decay rule, windows and write guard.

## Challenges we ran into

- **Kiro's shell did not work on our setup** (Kiro on Windows, the project in WSL). Kiro wrote the files and we ran each check in WSL. Later we split the work: Kiro built spec tasks with file edits only, and Kiro CLI measured the result in a real browser and stopped on failure instead of fixing it.
- **Spec review caught bugs before code existed**: "dead" redefined as "health reaches 0" in four places, an app that would have blocked every action in preview mode because it compared times to the live clock, and a float error that would have killed a person a day early.
- **Layout bugs unit tests cannot see.** Browser measurements found a time dock covering the first row of windows, a button clipped by 2.5px, and a clock that moved backwards and crashed every tick. Each is fixed and recorded in the log.
- **Honest limits.** Study Dungeon's schedule is a simple half-life rule, not a validated model of memory. At 320px wide, Ghosted's first row of windows sits below the fold.

## Accomplishments that we're proud of

- A reuse claim that is **checked, not asserted**: a second app, a completely different decay rule, and the engine unchanged.
- A product that tells you something real: not "you have a reminder", but "if you do nothing, 3 facts weaken and 2 die in the next 7 days, and this 20-minute session saves 2 of them".
- A project log with every session, the credits it used, the mistakes, and which tool wrote what.

## What we learned

- Reviewing the spec costs far less than reviewing the code, and it catches the worst bugs.
- A passing test suite proves little until a deliberate bug makes it fail.
- Keep building and measuring apart: a run told to measure and stop gave numbers we could trust.

## What's next

A third app is one policy and one skin away; the scaffold hook and the policy reviewer are there for it. A real validated memory model for Study Dungeon, and optional reminders while the tab is open.

## Built with

TypeScript, React, Vite, fast-check, Vitest, Playwright, Netlify, **Kiro** (specs, steering, hooks, a custom agent, MCP, Kiro CLI, powers)

## Bonus prize notes (fill on submission day)

- **Blog post** (third-party platform, mentions Kiroween 2026): URL **[TO ADD]**
- **Social post** starting `#KiroweenHackathon26`: URL **[TO ADD]**
- Student and 2025 Kiroween registration details, if eligible: **[YOU DECIDE]**
