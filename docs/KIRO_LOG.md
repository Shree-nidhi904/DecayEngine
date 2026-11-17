# Kiro log

One entry per working session. Keep it short and honest. The Kiro write-up and the blog post are written from this file, so note things while they are fresh.

For each session, record:

- **Goal**: what you set out to do
- **Kiro feature used**: spec, steering, hook, chat, CLI, MCP, other
- **What Kiro produced**: files, tests, decisions
- **What I changed by hand**: and why
- **What went wrong or surprised me**
- **Credits used** (rough)
- **Screenshot**: file name, if something is worth showing

---

## Session 0: setup (Nov 16, 2026)

- **Goal**: get ready to build.
- **Kiro feature used**: none yet, apart from one test prompt to confirm the IDE works from India.
- **What was done outside Kiro**: the project idea, the policy contract and the build plan were worked out in planning conversations with Claude. No application code exists yet.
- **Status**: Kiro IDE installed and working. Hackathon credits requested, not yet received. Joined the Kiro Discord.
- **Next**: steering documents, then the engine spec.

---

## Session 1: steering documents (Nov 16, 2026)

- **Goal**: give Kiro the project rules before any spec or code exists.
- **Kiro feature used**: steering, created through one chat prompt in the Kiro IDE (model: Claude Sonnet 4.5). The built-in steering generator was not used, because it reads existing code and there was none.
- **What Kiro produced**: six files in `.kiro/steering/`: `product.md`, `tech.md`, `structure.md`, `engine-boundary.md`, `theme-and-wording.md`, `testing.md`. No code.
- **What I changed by hand**: nothing.
- **What went wrong or surprised me**: nothing went wrong. The files matched the prompt closely, with no rules added or dropped. One follow-up: `structure.md` mentions the private `reports/` folder, and that section should be removed once the folder is deleted.
- **Credits used**: 0.31 (free plan, 50 credits). Took 29 seconds.
- **Screenshot**: two screenshots of the prompt and Kiro's reply (to be saved in `docs/screenshots/`).

---

## Session 2: engine spec, requirements (Nov 16, 2026)

- **Goal**: turn the approved policy contract into a Kiro spec for `packages/engine`, starting with requirements.
- **Kiro feature used**: spec-driven development in the Kiro IDE. Chose "Build a Feature", then "Requirements" first, so that each step stops for review.
- **What Kiro produced**: `.kiro/specs/engine/requirements.md` with 17 requirements and 97 acceptance criteria in EARS form, plus a glossary. Kiro ran its own automatic refinement pass over the requirements before finishing.
- **What I changed by hand**: nothing. Corrections are being sent back to Kiro as a prompt, not edited by hand.
- **What went wrong or surprised me**:
  - First attempt went into normal chat by mistake. Kiro only restated the prompt and created no spec file. Fixed by starting a spec session.
  - The refinement pass added detail but also introduced errors. A review of the file (done with Claude) found 12 problems. The main ones:
    - Death was redefined as "health reaches 0" in four criteria, contradicting the threshold rule stated elsewhere in the same file. This is the same hole that was fixed in the contract during planning.
    - The approved contract types were missing from the document, and threshold fields were renamed.
    - Invented items: a `resurrectAt` field, a `getState` function, a 10,000-entry history limit.
    - History entry types were inconsistent between requirements.
    - Storage was specified one item at a time, which makes "all or nothing" saves hard to guarantee.
    - Two rules were missing: settle an item's health before acting on it, and allow only one resurrect at a time per item.
  - Takeaway so far: the spec made the contradictions visible on the page before any code existed. In free-form prompting these would have surfaced later as bugs.
- **Credits used**: 0.27 for the mistaken chat attempt (21 seconds). 12.39 for the requirements (16 minutes 34 seconds), most of it on the automatic refinement. About 37 of the free 50 left.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Corrections, round 1**: 14 changes sent to Kiro as one prompt, with an instruction to edit the file directly and not re-run the refinement. All 14 were applied correctly. 2.35 credits, 3 minutes 58 seconds.
- **Corrections, round 2**: a second review found one real bug risk and eight smaller gaps. The bug risk: `tick` saved a new health without saying what happens to `lastEventAt`, which would make a time-based policy decay an item twice. Fixed by a rule that stored health and `lastEventAt` always move together, plus a property test ("splitting time makes no difference") that would catch it. Also added: resurrect settles the item first, the engine loads its snapshot on creation, and the storage namespace. All 9 were applied correctly. 2.17 credits, 2 minutes 33 seconds.
- **Result**: 18 requirements, reviewed and ready to approve. Asking Kiro for targeted edits cost about a fifth of the original generation each time.
- **Credits so far, all sessions**: about 17.5 of the free 50 used, about 32.5 left.
- **Status**: requirements ready to approve. Design and tasks come next.

---

## Session 3: engine spec, design (Nov 16, 2026)

- **Goal**: turn the approved requirements into a technical design.
- **Kiro feature used**: spec-driven development, design step. The prompt approved the requirements and listed ten design decisions to follow.
- **What Kiro produced**: `.kiro/specs/engine/design.md`, about 1,480 lines: package layout, full types, one shared `settle` function, synchronous snapshot storage, a 16-code error class, the resurrect lock, exact signatures for every engine function, ten correctness properties with a fake test policy, and a list of ten places where it had to interpret a requirement.
- **What I changed by hand**: the four test-plan fixes listed under "Second review" below. I edited these into `design.md` by hand, outside Kiro, after the second review. Everything else in the file is Kiro's.
- **What went right**: all four things the review was looking for were there. One `settle` function shared by every operation, snapshot storage saved before memory is updated, the six-type history union, and no clock or browser access outside the local storage file. The contract was unchanged.
- **What went wrong or surprised me**: a review (done with Claude) found ten problems, mostly in the test plan:
  - A property test called `Date.now()`, breaking the project's own steering rule that tests never use the real clock.
  - Test items were fully random with timestamps across the whole valid range, so nearly every item would die instantly and the property tests would pass while checking almost nothing.
  - The "splitting time" property compared health across the dead threshold, where a rounding difference can put one path at 20 and the other at 0. That would fail at random.
  - The save step was written as asynchronous while the functions calling it were synchronous.
  - Two conflicting definitions of the stored snapshot, one of which would lose data when saved as text.
  - An item removed while its resurrect was waiting would be silently re-added.
- **Credits used**: 5.86 (12 minutes). About 23.5 of the free 50 used in total.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Corrections, round 1**: 12 changes sent to Kiro as one prompt. All 12 were applied: synchronous saving, two clearly named snapshot types, one shared `applyHealth` function used by both `settle` and `tend`, the removed-during-resurrect case, deep copies in the in-memory adapter, and test items built by running real engine operations. 11.21 credits, 15 minutes 7 seconds. This was almost twice the cost of generating the design, because the test section was largely rewritten.
- **Second review**: the engine design itself is now sound. Four problems remain, all in the test plan:
  - The resurrect property uses an async test body inside a synchronous property, so its checks would not be evaluated correctly.
  - Test times are not guaranteed to come after the generated history, so several properties would fail with "time went backward" instead of testing their rule.
  - The serialization property saves and reloads deep copies, so it never exercises the real save and parse code.
  - `fc.statistics` is used in a way the library does not support.
- **Credits so far, all sessions**: about 34.7 of the free 50 used, about 15.3 left.
- **Lesson**: large rewrites through Kiro are expensive. Small, targeted corrections cost about 2 credits; a rewrite of one section cost 11.
- **Hand edits (four fixes, 0 credits)**: I made these by hand instead of sending another round through Kiro, to keep the remaining free credits for the tasks list.
  - Properties 6 and 7 now use `fc.asyncProperty` and are awaited. Property 7 also covers failed resurrects.
  - Properties 5 to 10 compute `now` as the latest generated timestamp plus a non-negative offset, so no test can fail with "time went backward" by accident.
  - Property 10 now goes through JSON text and builds a second engine from the reloaded snapshot, then compares items and history.
  - `fc.statistics` removed from the properties. One new Generator Coverage Check samples the generators with a fixed seed and asserts that alive, weak and dead items each make up at least 10%.
  - Supporting notes added to the generators list: `offset()`, `latestTimestamp()`, `buildEngine()`, and the rule that generated command sequences contain only synchronous operations.
- **Status**: design ready to approve. Tasks come next.

---

## Session 4: engine spec, tasks (Nov 16, 2026)

- **Goal**: turn the approved design into an implementation task list.
- **Kiro feature used**: spec-driven development, tasks step ("Generate Task List").
- **What Kiro produced**: `.kiro/specs/engine/tasks.md` with 26 top-level tasks and 52 sub-tasks, three checkpoints, requirement references on every task, and a dependency graph of 26 waves. It read the hand-edited design correctly: the tasks use `fc.asyncProperty`, the offset-based test times and the generator coverage check.
- **What went right**: the build order is sensible. Types, then errors, state derivation, settle, serialization, storage, then the engine one method at a time, with tests beside each step.
- **What went wrong or surprised me**: a review (done with Claude) found seven problems.
  - Every test task was marked optional, "can be skipped for faster MVP delivery". That covered all unit tests and all ten property tests, and it contradicts the testing steering document. With "Run All Tasks", the engine could have been built with no tests at all.
  - The fake test policy was scheduled at task 18, but the unit tests from task 4 onwards need it.
  - Tasks 3, 4 and 5 said to export internal functions that task 26 said must not be exported.
  - The error code count was wrong (14 instead of 16).
  - `tend`, `due` and `resurrect` did not say that the policy must receive the settled item, not the stored one. Passing the stored item would bring back the stale-health bug.
  - No task set up the workspace root, so `pnpm test` had nothing to run from.
  - Nothing enforced the engine boundary rules from steering.
- **What I changed by hand**: I edited seven fixes into `tasks.md` by hand, outside Kiro, at no credit cost.
  - Removed the optional marker from all 28 test tasks and replaced the note with "no task is optional; never weaken a test to make a task pass".
  - Moved the fake policy early in the dependency graph and pointed the unit test tasks at it.
  - Made the export rule consistent: only `deriveState` and `validateThresholds` are public helpers.
  - Corrected the error code count.
  - Stated that `applyEvent`, `nextDueAt` and `resurrect` receive the settled item, with a test for it.
  - Added workspace root setup and the coverage tool to task 1.
  - Added task 24.3: boundary tests that read the engine source and fail on any clock read, any browser access outside the local storage file, any import from an app or UI library, or any runtime dependency. This turns the engine-boundary steering rules into something the test run enforces.
- **Credits used**: 3.01 (3 minutes 53 seconds). About 37.7 of the free 50 used in total, about 12.3 left.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: the engine spec is complete: requirements, design and tasks. No code yet. Running the tasks waits for the hackathon credits and for Node.js and pnpm to be installed.

---

## Session 5: steering update for the new plan (Nov 17, 2026)

- **Goal**: bring the steering in line with the new plan. The Graveyard + Seance idea and Link Cemetery are dropped. The entry is now Study Dungeon + Ghosted, with Expiry Reaper as a reuse test. There is no backend. Triage and Autopsy are Must features.
- **Done outside Kiro first**: an updated plan (`docs/Kiroween Skeleton Crew plan (2).md`) and four HTML wireframes (Home, Study Dungeon, Ghosted, Add Item) were added to `docs/`. The two Kiro prompts (steering, then the engine spec) were drafted with Claude. A review of the wireframes against the engine spec found that the spec has no Triage, Autopsy, importance or cost at all.
- **Kiro feature used**: steering and hooks, through one chat prompt. This was the first session on the 4000 hackathon credits.
- **What Kiro produced**:
  - All six steering files updated. Link Cemetery, `server/` and `templates/` were removed. Feature tiers and the locked Triage rule were added. So were the per-app metaphors, list names and fonts, the Ghosted wording rule ("connection freshness"), outcome tests, and the rule that `healthAt` never increases between events.
  - A new `authorship.md`: decay rules, Triage selection and Autopsy reasoning are hand-written. Kiro writes UI, glue and tests.
  - Two hooks: `test-engine-on-save.json` and `scaffold-policy.json`.
- **What I changed by hand**: nothing yet. Corrections go back to Kiro as a prompt.
- **What went wrong or surprised me**: Kiro's summary said everything matched, but a review (done with Claude) found these problems:
  - **Kiro invented a new policy contract.** `engine-boundary.md`, `product.md`, `authorship.md` and the scaffold hook all list `healthAt(policyData, history, now)`, `applyEvent(event, policyData, now)`, `resurrect(item, policyData, now)` returning policyData, and a fifth function `costMinutes(policyData)`. None of this matches the approved spec (`healthAt(item, now)`, `init`, `thresholds`). It also contradicts the Add Item wireframe, where importance and costMinutes are item fields the user sets, not policy functions. Steering is loaded into every prompt, so this would have fought the spec update.
  - **The hooks are probably in the wrong format.** They use `PostFileSave` and `UserPromptSubmit` triggers in plain `.json` files. That looks like another tool's hook format, not Kiro's own (`.kiro.hook` files with `when` and `then`). They need checking in Kiro's Agent Hooks panel.
  - **Thresholds are hard-coded.** The steering states 100–60 / 59–1 / 0, but the wireframes use dead = 10, and thresholds are per policy in the spec. This is still undecided.
  - **Smaller problems:**
    - `product.md` says "four questions" and then lists five.
    - Cormorant SC is given to Expiry Reaper as well as the home page. The prompt said home only.
    - Palettes are pointers to the wireframes, not extracted values.
    - `authorship.md` sets a table format for this log, which clashes with the session format used here.
  - The prompt was followed in outline, but Kiro filled gaps with its own API instead of reading `.kiro/specs/engine/`. Next time, prompts should name the files that are the source of truth.
- **Credits used**: 3.33 (5 minutes 32 seconds).
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Corrections, round 1**: one prompt with five fixes.
  - Steps 1 to 4 were applied correctly:
    - The policy contract in steering now points to the spec's Type Contract, and costMinutes is described as an item field.
    - Hard-coded health bands were replaced with "each policy sets its own thresholds".
    - Cormorant SC is now for the home page only, and Expiry Reaper uses Special Elite.
    - Real palette hex values were copied from the wireframes.
    - The log format in `authorship.md` was fixed.
  - Step 5 (recreate the hooks) failed. Kiro tried to delete and recreate the files through its shell, `execute_bash` failed 7 times in a row, and Kiro stopped to ask. The run was cancelled. The shell failure is probably the WSL setup problem already in the plan, and it must be fixed before Kiro can run tests.
  - Credits: 0.88.
- **Correction to the review above**: the hook format was not wrong. Kiro's Create Hook form uses the same model: a trigger such as "File Saved" or "Prompt Submitted", a regex matcher, and an action of either "Run Command" or "Ask Kiro".
- **What I changed by hand**: deleted both hook files and recreated them in Kiro's Create Hook form, at no credit cost.
  - **Run engine tests on save**: File Saved, pattern `packages/engine/.*\.ts$`, Run Command `pnpm --filter ./packages/engine exec vitest run`, timeout 120 s. `vitest run` is used so the hook does not start watch mode and hang. It cannot be tested until Node, pnpm and the engine package exist.
  - **Scaffold a new decay policy**: Prompt Submitted, pattern `scaffold.*policy`, Ask Kiro. The instructions point to the spec's Type Contract instead of copying it, so the hook does not go stale when the contract changes. Every policy function body is left as a TODO, because decay rules are hand-written.
  - **Hook test**: the scaffold hook fired and asked which app to scaffold, as instructed. No files were created, because the contract is about to change in the spec update.
- **Decision**: thresholds are weak 60 and dead 10 for all three apps, matching the wireframes. The plan's "WEAK 59-1, DEAD 0" wording is replaced.
- **Status**: steering and hooks done. Next is the engine spec update (Triage, Autopsy, Forecast, edit, item fields, synchronous resurrect, accurate death times).

---

## Session 6: engine spec update for the new plan (Nov 17, 2026)

- **Goal**: bring the engine spec in line with the new plan and the wireframes. It needed Triage, Autopsy and Forecast, an edit operation, importance and costMinutes on every item, a synchronous resurrect that receives the event, and death times that record when an item actually died.
- **Kiro feature used**: spec-driven development, in two steps. Requirements came first, with a stop for review. Design and tasks followed after approval.
- **Paper test first (outside Kiro)**: the Add Item wireframe was checked against the contract field by field, and four gaps came out of it:
  - Items can start weak or dead. A friend last contacted 40 days ago, or a date that has already passed.
  - There was no way to edit an item.
  - Study Dungeon's resurrect needs the user's answer, but resurrect did not receive an event.
  - Death was stamped when the engine noticed, not when it happened. After weeks away, Autopsy would report the wrong day.
- **What Kiro produced**:
  - **Requirements (2a)**: five new requirements (edit, death timing by bisection, Triage, Autopsy, Forecast), a policy test kit, six new correctness properties, and an updated Type Contract.
  - **Design and tasks (2b)**: design.md grew to about 2,300 lines and tasks.md to 37 tasks. Kiro handed the design and tasks work to its own sub-agent.
- **What went wrong or surprised me**: a review (done with Claude) after each step.
  - **Requirements, 12 problems, all fixed by Kiro in one correction round:**
    - Tick still stamped deaths with "now", contradicting the new death-timing rule.
    - Editing a dead item could have brought it back to life.
    - The policy checker took fast-check generators, which would make fast-check a runtime dependency and break the engine's own boundary test.
    - The Triage property compared exact picks with a brute-force search. Equal-value answers can differ, so it would have failed at random.
  - **Design and tasks: the biggest miss.** The bisection was written as a separate module, but the core `settle` and `applyHealth` code still stamped every death with "now", so the feature was described and never actually used.
  - **Other design problems:**
    - The fake test policy lost 100 health in 10 seconds, so the 1-minute bisection would never have been exercised.
    - The Ghosted reference policy decayed from the item's last update instead of the last contact, so it would jump back to full health after every tick. This is the same class of bug as the "decays twice" problem fixed in Session 2.
    - Two outcome tests checked the wrong state on a day where health sits exactly on a threshold. The example days in my prompt were off by one at the thresholds.
    - The outcome tests were placed inside the engine package, which would make the engine import the apps.
    - An item going from alive straight to dead would have no "went weak" time for Autopsy.
    - resurrect returned nothing, so the app could not tell a won fight from a lost one.
    - Old async and lock text was left in several places.
  - **Task list problems:**
    - Triage, Autopsy and Forecast were exported in one task and kept internal in another.
    - Tests expected a budget of 0 and a horizon of 0 to work, though both are invalid.
    - `settle` was scheduled before the bisection it depends on.
    - The workspace still listed the dropped `templates/` folder.
    - One property test would have failed on items that were already dead.
- **What I changed by hand** (outside Kiro, 0 credits):
  - **design.md:**
    - Wired bisection into `settle`, using the stored item over its last-update-to-now interval.
    - `applyHealth` now takes the crossing times, and records the weak crossing before death.
    - Merged the two bisection functions into `bisectCrossing` and added `findDeathAfter` for Triage and Forecast.
    - Rescaled the fake policy to 1 health per hour and the generators to minutes and hours.
    - Rewrote the outcome-test section: the tests live in each app, with corrected reference rules, an expected-outcomes table that includes the day before each change, and bisection checks.
    - Fixed Properties 12 and 15.
    - Added `ResurrectOutcome` and the event on resurrect history entries.
    - Removed the leftover async and lock text.
  - **requirements.md:** added 8.9, so resurrect returns its outcome.
  - **tasks.md:**
    - Bisection now runs before settle in the dependency graph.
    - Tick no longer bisects itself.
    - Triage, Autopsy and Forecast stay internal.
    - Replaced the invalid budget-0 and horizon-0 tests, and added a hand-worked 20-minute Triage example.
    - Added generator sizing, Property 15's skip rule, and a note that real-policy outcome tests belong in the apps.
- **Also done outside Kiro**:
  - `README.md` rewritten for the new plan (Study Dungeon, Ghosted, Expiry Reaper; Triage, Autopsy, time machine; no server).
  - Placeholder folders renamed: `apps/link-cemetery` → `apps/ghosted`, and `server/` removed.
  - Drafts for the video storyboard, the Devpost description and the Kiro write-up outline written to the private `reports/` folder.
  - Fixed the scaffold hook. When it was created in the form, the pattern `scaffold.*policy` went into the instructions box and the matcher was left empty. So the hook fired on every prompt, and the only instruction it passed to Kiro was "scaffold.*policy". That explains why Kiro asked "which app?" during the hook test. The matcher and the full instructions are now set in the hook file.
- **Credits used**: 2.88 for requirements (5 minutes 29 seconds), 2.99 for the correction round (3 minutes 29 seconds), 20.62 for design and tasks (20 minutes 13 seconds). About 26.5 in total.
- **Lesson**: the design and tasks step cost seven times as much as the requirements and needed the most fixing. Kiro was most reliable at small, specific edits to one file, and least reliable when asked to carry a change through 2,000 lines on its own. That step is also where the most important bug hid: a feature fully described in one section and never used in the code that matters.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: engine spec complete and consistent. The engine can now be built (Nov 21 onward). Next: one short spec per app, starting with Study Dungeon.

---

## Session 7: guardrails, a policy hook and MCP (Nov 17, 2026)

- **Goal**: compare the repo with two Kiroween 2025 entries (Kiro-InteractionKit and RumorNet), then add what they had and this project lacked.
- **What the comparison showed**:
  - The layout already matches: `.kiro/` at the root, a skeleton package plus separate app folders, one spec per feature, steering and hooks.
  - Three things were missing:
    - A visible MCP setup (InteractionKit commits `.kiro/settings/mcp.json`).
    - Steering that forbids fake tests (RumorNet has `no-fake-tests.md` and `no-specification-gaming.md`).
    - A domain hook that wires new work into the framework automatically (InteractionKit's "auto-integrate new gesture").
  - Their hooks use an older format (`.kiro.hook` files with `when`/`then`). This Kiro's form saves `.json` files with `trigger`/`matcher`, so the current files are correct.
- **Kiro feature used**: steering, hooks and MCP.
- **What Kiro produced** (one prompt):
  - `.kiro/steering/no-fake-tests.md`: tests must check behaviour. Never catch errors to pass, never weaken or skip tests, never edit expected values to match wrong output, keep 100 runs per property, never read the clock. It includes two "wrong" examples.
  - `.kiro/hooks/check-policy-on-save.json`: when any `apps/<app>/src/policy.ts` is saved, Kiro runs that app's policy tests and checkPolicy. It reports the results and suggests fixes in words only, without editing the hand-written policy.
- **What I set up by hand**:
  - The Context7 MCP server in `.kiro/settings/mcp.json`. It connected with 2 tools, `resolve-library-id` and `query-docs`, and gives Kiro current docs for React, Vite and fast-check. No API key is used.
- **What I changed by hand**:
  - Corrected the MCP auto-approve list from `get-library-docs` to `query-docs`, the tool name Context7 now uses. With the old name, every docs lookup would still have asked for approval.
  - Replaced a made-up `policy.getHealth` in the steering example with the real `healthAt`, so steering never shows Kiro an API that does not exist.
- **What went wrong or surprised me**: Kiro said it would use its file-editing tools, then switched to the shell to create the new files. It worked this time, which suggests the shell problem from Session 5 is intermittent.
- **Credits used**: 0.99 (1 minute 25 seconds).
- **Screenshot**: the MCP Servers panel showing context7 connected with 2 tools (crop before committing).
- **Status**: `.kiro/` has 8 steering files, 3 hooks, MCP and the engine spec. Next: the Study Dungeon spec.

---

## Session 8: Study Dungeon spec (Nov 17, 2026)

- **Goal**: a short spec for the first app, Study Dungeon, built on the engine without changing it.
- **Kiro feature used**: spec-driven development in two steps: requirements with a stop for review, then design and tasks. The wireframes were in the private `reports/` folder, and Kiro read them from there.
- **Decision during requirements**: Kiro asked for the minimum and maximum half-life, as the prompt told it to. I chose 1 day and 180 days. Without a cap, a fact answered right every time would double its half-life without limit.
- **What Kiro produced**:
  - `requirements.md`: 15 requirements, then 18 after corrections.
  - `design.md`: about 550 lines.
  - `tasks.md`: 20 tasks in vertical-slice order. The policy and the autopsy sentences are marked hand-written.
- **What went wrong or surprised me**: a review (done with Claude) after each step.
  - **Requirements, fixed by Kiro in one correction round (2.05 credits):**
    - **The decay formula started from 100** instead of the fact's current health. A wrong answer (health 45) would have jumped back to 100.
    - **The "how well do you know it" level had nowhere to live.** `init` only receives the payload, which had no field for it.
    - **A failed challenge on a grave wasn't recorded**, so Autopsy couldn't count it.
    - **The streak was the longest run ever** instead of the current one.
    - **Three requested items were dropped:** the shared shell, the tests and sound.
    - After the fix, Kiro derived a correct `nextDueAt` formula on its own: `T + D × log2(H / 60)`.
  - **Design and tasks, logic bugs:**
    - **Preview mode was detected by comparing `now` with `Date.now()`.** The clock moves every millisecond, so the app would almost always have thought it was previewing the future and blocked every action.
    - **Resurrect tried to replay history**, which a policy cannot read. It is also unnecessary, because the half-life at death is still in policyData.
    - **First run was detected by "zero items".** After "Start empty", first run would show again forever.
  - **Design and tasks, wrong numbers and calls:**
    - **The outcome-test health values were wrong.** Day 8 was given as 70, which is alive, not weak.
    - **`engine.remove` and `engine.history` were called with the wrong arguments.**
    - **The app never ticked**, so deaths would not be saved with their real times.
  - **Tasks, missing or wrong work:**
    - **The shared shell was never built.** Requirement 16 puts the shared parts in `packages/shell`, but the tasks built everything inside the app. They read "build only what Study Dungeon needs" as "don't build the shell yet", and no task created `packages/shell`.
    - **Other slips:**
      - The sample data invented new facts instead of using the wireframe's 12.
      - checkPolicy was missing from the tests.
      - Loading spinners were planned for a resurrect that is no longer async.
      - The first-run tour had no task.
- **What I changed by hand** (outside Kiro, 0 credits):
  - **Time machine:** preview is now `previewOffsetMs > 0`, with `now = realNow + offset`. The app ticks on load and every minute, never while previewing.
  - **Resurrect:** returns `{ ok: true }` and leaves policyData unchanged.
  - **First run:** uses a `study-dungeon:started` flag.
  - **Engine calls:** `remove(id)` without a time, and `history(id)` per item.
  - **Outcome numbers:** corrected to 61.6, 57.4, 10.2 and 9.5, with checkPolicy added to the tests.
  - **Shared shell:**
    - Task 1 now creates `packages/shell`.
    - ItemCard, Counters, HistoryLogViewer, TriagePanel, AutopsyDialog and TimeMachine moved into it, generic over the app's types.
    - Each component takes the theme, the wording and render functions from the app.
  - **Sample data:** uses the wireframe's 12 facts and their dated histories.
  - **Tasks:** added task 11.5 for the first-run tour, and gave the autopsy-sentence tests exact expected outputs.
- **Credits used**: 2.62 for requirements (3 minutes 38 seconds), 2.05 for corrections (1 minute 50 seconds), 5.59 for design and tasks (8 minutes 16 seconds). About 10.3 in total.
- **Lesson**: the same pattern as the engine spec. The requirements were close and needed small fixes. The design and tasks contained the bugs that would have cost the most later. The preview-mode check alone would have made the app unusable, and a requirement (the shared shell) was quietly reinterpreted away in the task list.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: Study Dungeon spec complete. Code next: engine tasks first, then Study Dungeon.

---

## Session 9: first engine code, tasks 1-3 (Nov 17, 2026)

- **Goal**: start building the engine with the three foundation tasks: workspace and types, the error class, and the state functions. One task at a time, with a review after each.
- **Kiro feature used**: running spec tasks from `tasks.md`, plus steering, and Context7 for library docs.
- **What Kiro produced**:
  - **Task 1:** a pnpm workspace, `@decay-engine/engine` with strict TypeScript, the Vitest config, and `types.ts` matching the design field for field. Kiro picked current releases: TypeScript 7.0.2 (the new native compiler), Vitest 5.1.0 and fast-check 4.10.2.
  - **Task 2:** `DecayEngineError` with 21 codes and 31 tests. The tests include a compile-time check: if a 22nd error code is added without a test, the typecheck fails.
  - **Task 3:** `deriveState`, `validateThresholds`, `clampHealth` and `applyHealth`, with 50 tests. The tests cover every state transition, the bisected crossing times, the weak entry recorded before death, and that the input item is never changed.
  - **Result:** 81 tests pass and the typecheck is clean.
- **Kiro stopped and asked twice instead of guessing**, as the prompts told it to. Both were real problems:
  - **Resurrect contract:** the steering still said `resurrect` was async with no event, while the spec said synchronous with the event. I had missed the steering when the spec changed. Kiro asked before writing `types.ts`, and the steering was fixed.
  - **NaN thresholds:** the design's `validateThresholds` only checked `typeof === "number"`, and `NaN` passes that. A policy with a NaN threshold would never report "alive" (or never "weak") and would fail silently. Kiro found this while writing the tests. It now rejects NaN and ±Infinity with `Number.isFinite`, the design was updated, and five tests cover it.
- **What went wrong or surprised me**:
  - **Kiro's shell does not work on this setup.** Kiro runs on Windows while the project lives in WSL. Its shell tool rewrites the working folder as `\home\shree\decay-engine`, which bash rejects, so almost every command failed with exit code -1. Short commands sometimes got through, which is why it looked intermittent in Session 5.
    - **Workaround:** Kiro writes files only. Tests and the typecheck are run in WSL, by me or with Claude, and the results are pasted back to Kiro, which marks a task done only after a passing run.
    - **Probably affected:** the test-on-save hook, which runs a shell command the same way.
    - **Possible fix for later:** run Kiro's Linux version inside WSL.
  - **A sub-agent stopped early**, saying I had cancelled when I had not. The main agent noticed and sent it back.
  - **Kiro reported two "conflicts" in later tasks:**
    - One was stale: it had read an older copy of the file.
    - The other was a wording difference. Edit-caused deaths use `now`, and bisection over an empty interval also gives `now`. I reworded Requirement 8a.7 to say so.
- **What I changed by hand**:
  - Fixed the async `resurrect` in three steering files (`engine-boundary.md`, `authorship.md`, `product.md`).
  - Fixed the stale task reference "19.1" → "20.1" in task 4.2.
  - Clarified Requirement 8a.7.
- **Credits used**: about 17.3 for tasks 1-3: 5.56 for the shell attempts, the rest of task 1 and task 2, and 11.71 for task 3 (7 minutes 37 seconds). The first, cancelled task 1 run is not counted.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 1-3 done (81 tests). Next: the fake policy (20.1), bisection (5), then settle (4).

---

## Session 10: (date)

- **Goal**:
- **Kiro feature used**:
- **What Kiro produced**:
- **What I changed by hand**:
- **What went wrong or surprised me**:
- **Credits used**:
- **Screenshot**:
