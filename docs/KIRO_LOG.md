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
- **What was done outside Kiro**: I worked out the project idea, the policy contract and the build plan before implementation. No application code exists yet.
- **Status**: Kiro IDE installed and working. Hackathon credits requested, not yet received. Joined the Kiro Discord.
- **Next**: steering documents, then the engine spec.

---

## Session 1: steering documents (Nov 16, 2026)

- **Goal**: give Kiro the project rules before any spec or code exists.
- **Kiro feature used**: steering, created through one chat prompt in the Kiro IDE. The built-in steering generator was not used, because it reads existing code and there was none.
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
  - The refinement pass added detail but also introduced errors. I reviewed the file and found 12 problems. The main ones:
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
- **What went wrong or surprised me**: I reviewed the design and found ten problems, mostly in the test plan:
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
- **What went wrong or surprised me**: I reviewed the task list and found seven problems.
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
- **Done outside Kiro first**: I added an updated plan (`docs/Kiroween Skeleton Crew plan (2).md`) and four HTML wireframes (Home, Study Dungeon, Ghosted, Add Item) to `docs/`. I drafted the two Kiro prompts (steering, then the engine spec) myself. I reviewed the wireframes against the engine spec and found that the spec has no Triage, Autopsy, importance or cost at all.
- **Kiro feature used**: steering and hooks, through one chat prompt. This was the first session on the 4000 hackathon credits.
- **What Kiro produced**:
  - All six steering files updated. Link Cemetery, `server/` and `templates/` were removed. Feature tiers and the locked Triage rule were added. So were the per-app metaphors, list names and fonts, the Ghosted wording rule ("connection freshness"), outcome tests, and the rule that `healthAt` never increases between events.
  - A new `authorship.md`: decay rules, Triage selection and Autopsy reasoning are hand-written. Kiro writes UI, glue and tests.
  - Two hooks: `test-engine-on-save.json` and `scaffold-policy.json`.
- **What I changed by hand**: nothing yet. Corrections go back to Kiro as a prompt.
- **What went wrong or surprised me**: Kiro's summary said everything matched, but I reviewed the changes and found these problems:
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
- **What went wrong or surprised me**: I reviewed after each step.
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
- **What went wrong or surprised me**: I reviewed after each step.
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
    - **Workaround:** Kiro writes files only. I run the tests and typecheck in WSL, then paste the results back to Kiro, which marks a task done only after a passing run.
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

## Session 10: engine core, tasks 4-22, with manual WSL verification alongside (Nov 17, 2026)

- **Goal**: build the rest of the engine's core: settle, bisection, serialization, storage, the `DecayEngine` class, triage and autopsy.
- **Kiro feature used**: running spec tasks from `tasks.md`, plus steering. I ran every test and typecheck in WSL, and from task 9 on I also wrote code.
- **Why I joined the implementation**: Kiro's shell cannot run commands on this setup (Session 9), so Kiro wrote files and I ran the tests and pasted the results back. I then wrote tasks 9-19 myself while Kiro worked on other files.
- **What Kiro produced**:
  - **Task 20:** the fake policy (34 tests).
  - **Tasks 4-6:** `settle`, bisection and serialization (13 + 13 + 80 tests). Its summary said settle had 15 tests; the run showed 13, and nothing was missing.
  - **Requirement 17.5 fix:** policy errors now name the function and the bad value (`Policy healthAt returned invalid health: NaN`). Also: a dead item with health above 0 is rejected when loading.
  - **Task 8:** the storage interface, `InMemoryAdapter` (6 tests) and `LocalStorageAdapter` (18 tests). It reaches `localStorage` through `globalThis` so the rest of the engine still cannot use browser APIs. It added a 22nd error code, `STORAGE_UNAVAILABLE`, and updated the design and the error tests to match.
  - **Task 24:** `checkPolicy` (12 tests), with two extra checks (`inputs`, `build-items`) so it never throws.
- **What I produced**:
  - **Tasks 9-19:** the `DecayEngine` class in `src/engine.ts`: constructor, `addItem`, `view`, `tick`, `tend`, `due`, `graveyard`, `history`, `remove`, `resurrect` and `edit`, with 238 tests. After each round it broke the code on purpose (for example: memory updated before the save, `applyEvent` given the stored item instead of the settled one) to check that a test fails.
  - **Tasks 21-22, triage and autopsy:** these were planned as hand-written by me. I noted that the README and submission draft say so, and chose to write both myself while correcting the claims. Triage uses an exact 0/1 knapsack. Its worked example shows greedy-by-value-per-minute picking a worse set (157 against 173). Autopsy reports facts only. 52 tests.
  - **Authorship corrections:** README, submission draft, `authorship.md` and the task labels now say who wrote what. My hand-written part is the decay rules (each app's policy) and the app's cause-of-death sentences.
- **What I changed by hand**: no code. Decisions: I wrote triage and autopsy; keep Kiro's extra `checkPolicy` checks; the fake policy is allowed to fail `checkPolicy`, because it deliberately does not clamp (engine tests need out-of-range values).
- **What went wrong or surprised me**:
  - **Spec conflict:** Requirement 4.3 says `view` must not change `lastEventAt` or `diedAt`, but the design says `view` returns the settled item. Following the design keeps every returned item valid. 4.3 still needs rewording so that "not change" clearly means storage.
  - **Kiro's test-count predictions were off** whenever files it did not know about existed. It assumed its own files were the whole suite.
  - **The scaffold-policy hook ran on every prompt,** even though its matcher is `scaffold.*policy`. Kiro skipped it each time because no app was named.
  - **Working in parallel** only worked because Kiro and I never edited the same file in the same round.
  - **Smaller choices left to confirm:** a bad `nextDueAt` value throws `INVALID_TIMESTAMP`; a malformed `resurrect` result counts as a failure; `edit` lists every field passed, even if unchanged.
- **Credits used**: 15.11 for the 17.5 fix and tasks 8.1-8.3 (7 minutes 21 seconds); 14.81 for task 24 (7 minutes 47 seconds); about 47.7 for tasks 20, 4-6 and 8.4-8.5 together. That last figure is worked out, not read: the running total after task 24 (157.82) minus Sessions 1-9 (80.18 logged) and the two rounds above. The per-round figures were in an earlier chat that was lost. At the end of the day: 38.34 of the 50 plan credits used, 157.82 of 4000 in total. My implementation work used no Kiro credits.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 1-22 and 24 done, 555 tests. Next: forecast and the property tests.

---

## Session 11: forecast, property tests and the finished engine, tasks 23-37 (Nov 18, 2026)

- **Goal**: finish the engine spec.
- **Kiro feature used**: spec tasks and steering. Kiro and I worked in parallel: Kiro on forecast and the docs, and I wrote the property tests.
- **What Kiro produced**:
  - **Task 24 follow-up:** tests for its two extra checks (6 tests, 18 in that file).
  - **Tasks 23 and 25:** `forecast` and `engine.forecast` (11 tests), plus integration tests for triage, autopsy and forecast together (37 tests). For an item whose `lastEventAt` is after `now`, it starts the search at `lastEventAt`, which keeps "`view(diesAt)` shows the item dead" true. It also flagged that a very large horizon could go past the largest valid timestamp.
  - **Task 37:** checked the exports, added JSDoc to the public API (comments only; a comment-stripped comparison confirmed no code changed), wrote `packages/engine/README.md`, and turned the README's quick start into a test (17 tests), so the example cannot go out of date.
- **What I produced**:
  - **Task 27:** the generators (`tests/generators.ts`). The coverage check reaches about 36% alive, 17% weak and 47% dead items.
  - **Tasks 28-35:** Properties 1-17 in 12 files, each with at least 100 runs. Property 8 uses `expect().toThrow()` instead of the design's `try/catch`, which the no-fake-tests steering forbids.
  - **Task 32.3:** boundary tests (46): no clock reads, no browser globals outside the localStorage adapter, no imports from outside the engine, and no runtime dependencies. A temporary file that broke all three rules failed all three checks.
  - **A gap the property tests had:** making bisection return the earlier end of its final minute passed every property. A new property (an item dead at `now` is already dead at its `diedAt` and not a minute earlier) now catches it.
  - **Kiro's open point fixed:** forecast and triage now never search past `MAX_TIMESTAMP`. The constant moved to `types.ts` to avoid a circular import.
  - **Tasks 26 and 36:** the checkpoints, including the coverage run.
  - **Loose ends closed after the spec was done** (my decisions carried out by me):
    - A new error code, `INVALID_POLICY_RESULT`: a bad `nextDueAt` value (it was `INVALID_TIMESTAMP`) and a malformed `resurrect` result (it was silently counted as a failed fight) now throw it and save nothing. A policy bug should not look like a lost fight.
    - `edit` keeps listing every field passed, as the design says.
    - Requirement 4.3 reworded: "not modified" now clearly means storage; design.md records why `view` returns the settled item.
    - `MAX_TIMESTAMP` is now exported, for the time machine.
    - The scaffold-policy hook is disabled until a new app needs it.
    - 701 tests in 29 files.
- **What I changed by hand**: no code.
- **What went wrong or surprised me**:
  - **The test command broke overnight.** The WSL shell started picking up the Windows Node (`/mnt/c/nvm4w`) instead of the Linux one, so `npx` failed with `ERR_INVALID_URL` and `tsc` looked for `typescript-win32-x64`. Fix: put `~/.nvm/versions/node/v26.13.1/bin` first on the PATH, or run `source ~/.nvm/nvm.sh`.
  - **Kiro ran stray shell commands twice** despite the no-shell rule (`ls`/`grep`, then `true`). Both failed or did nothing, and it reported them.
  - **Everything passed on the first run** except that one bisection gap. That is why the deliberate code-breaking checks mattered: they showed the properties were real.
- **Credits used**: 8.39 for tasks 23 and 25 (4 minutes 18 seconds); 15.15 for task 37 (5 minutes 50 seconds); about 5.4 for the task 24 follow-up (worked out from the running total: 186.8 after task 37, minus 157.82, 8.39 and 15.15). About 29 for the session; 186.8 of 4000 in total.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: engine spec complete: 37 of 37 tasks, 701 tests in 29 files, coverage 95% of lines, 90% of branches, 100% of functions. Next: Study Dungeon (my policy and cause-of-death sentences by hand, Kiro for the UI).

---

## Session 12: Linux Kiro attempt and the Study Dungeon policy (Nov 18, 2026)

- **Goal**: get Kiro's shell working by running Kiro inside WSL, then start Study Dungeon with its decay policy.
- **Linux Kiro in WSL (abandoned)**:
  - **Option 1, `kiro .` from WSL in the Windows app:** cannot work. The launcher only switches to remote-WSL mode if Microsoft's Remote - WSL extension is installed, and that extension is licensed for VS Code only.
  - **Option 2, the Linux build (1.4.215) inside WSL:** installed and opened through WSLg.
    - The shell now saw the right paths: `pwd` gave `/home/shree/decay-engine`, with Node v26.13.1 and pnpm 12.21.0.
    - But every command still reported exit code -1, and the Vitest output was cut off.
    - The window also froze.
  - **Decision:** drop it, and keep the proven split. Kiro writes files; tests run in WSL.
  - **Side effect:** Linux Kiro also offered to scaffold a policy, unprompted, although that hook is disabled in its file.
- **Broken `node_modules` (fixed)**: the tests would not start, failing with `Cannot find package '@rolldown/pluginutils'`. `node_modules` had been damaged, most likely by a Windows-side tool. `pnpm install --frozen-lockfile` repaired it without changing the lockfile or any code, and all 701 tests passed again.
- **The Study Dungeon decay policy** (`apps/study-dungeon/src/policy.ts`, task 2.1): written by me (originally planned as hand-written by me).
  - **Rules:** health decays from the stored health. A right answer gives 100 and doubles the half-life; a wrong answer gives 45 and halves it. The half-life is clamped to 1-180 days.
  - **`nextDueAt`** solves for the exact moment health falls below 60.
  - **Resurrect** succeeds only on a right answer and keeps the half-life the fact had at death.
  - **Also added:** the minimal app package files it needs (`package.json`, `tsconfig.json`). Kiro's task 1 adds Vite and React on top.
- **Verification**: a temporary test ran the policy through the real engine, and all 7 checks passed:
  - checkPolicy
  - the spec's outcome table (alive day 7, weak day 8, still weak day 33, dead day 34)
  - death within 1 minute after 33.22 days
  - the 45 and 100 rules with decay continuing from 45
  - both half-life clamps
  - `nextDueAt`
  - both resurrect outcomes
  - Typecheck clean.
  - The temporary test was then removed, because the real policy tests (tasks 2.2 and 2.3) are Kiro's. The app's test script passes with no tests until Kiro's arrive.
- **Cause-of-death sentences** (`apps/study-dungeon/src/autopsy-sentences.ts`, task 10.1): also written by me (originally planned as hand-written by me), done early so Kiro is never blocked on it.
  - **Voice** follows the wireframe's autopsy: one cause sentence first ("Missed answers kept cutting the half-life (10 → 5 → 10 → 5 → 2.5 days). It never grew long enough to survive a gap."), then plain facts (went weak on, died on, last reviewed on, silent for, reviews missed).
  - **A spec gap it found:** the spec says to replay the half-life history from the first half-life, but after a resurrection the current life starts from the half-life at the previous death, which the autopsy report does not carry. The history is replayed only for facts never resurrected; for the others the app passes the half-life at death as an option. Noted in task 10.1.
  - **Half-life replay** goes through the policy's own `applyEvent`, so the doubling, halving and clamps live in one place.
  - **Verification**: four scenarios through the real engine (never reviewed, long silence after growth, several wrong answers, resurrected and died again), each sentence checked by hand against the policy maths, e.g. "solid" dies on day 33.22 and 2.5 days × log2(45/10) ≈ 5.4 days after the last miss. Temporary test removed; the real tests are Kiro's task 10.2.
- **What I changed by hand**:
  - Recorded the policy's authorship in `authorship.md` and `tasks.md`.
  - Reworded the top of `authorship.md`, which said decay rules are "never generated". It now says: I decide every rule in the specs, Kiro never writes decay-rule code, and the code is written by me, with each case listed.
- **Credits used**: about 0.5 for the Linux Kiro shell test.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: engine complete (701 tests). The Study Dungeon policy is written and verified. Next: Kiro builds the Study Dungeon app (tasks 1, 2.2-2.3, 3-4).

---

## Session 13: Study Dungeon setup and the policy tests, tasks 1, 2.2, 2.3, 3, 4, 10.2 and 15 (Nov 18, 2026)

- **Goal**: start the Study Dungeon app: Vite and React setup plus the shell package (task 1), theme and wording (task 3), the engine instance and ticking (task 4), and global styles (task 15). Kiro writes files only; I run the commands in WSL.
- **Kiro feature used**: spec tasks (run in orchestrator mode with sub-agents) and steering.
- **What Kiro produced**:
  - **Task 1:**
    - Extended `apps/study-dungeon/package.json`: `dev`, `build` and `preview` scripts; `react` and `react-dom` ^18.3.1; `vite` ^8.3.8 to match the lockfile; `@vitejs/plugin-react` ^6.3.0, whose peer range is vite ^8; `@types/react` ^18.3.12 and `@types/react-dom` ^18.3.1; `@decay-engine/shell` `workspace:*`.
    - Extended `tsconfig.json`: DOM libs, `jsx: react-jsx`, strict kept, and `vite.config.ts` included.
    - New files: `index.html` at the Vite root with the Google Fonts link (Pirata One, Spectral, IBM Plex Mono), `vite.config.ts`, `src/main.tsx` and a placeholder `src/App.tsx`.
    - New package `packages/shell` (`@decay-engine/shell`): `package.json` with React as a peer dependency and `main`/`types`/`exports` pointing at `src/index.ts`, plus `tsconfig.json`, `src/types.ts` (`ThemeProps` and `WordingProps` from design.md) and `src/index.ts`. No components yet, and the shell imports nothing.
  - **Task 3:** `src/theme.ts` (`studyDungeonTheme`, `toCssVariables`, and `cssVariables` with `--color-*` and `--font-*` names), `src/wording.ts` (`studyDungeonWording`: Crypt/Dungeon/Graveyard, Fight/Challenge, sleeping/monster/dead) and `src/theme.test.ts`, which checks the palette against the steering file.
  - **Task 4:**
    - `src/engine-instance.ts`: the engine with `studyDungeonPolicy`, `LocalStorageAdapter("study-dungeon")` and `crypto.randomUUID` ids. It does not tick at import.
    - `src/ticking.ts`: `startTicking` with an injected clock and scheduler, and a `useSettleTicks(engine, previewing, onTick)` hook that never ticks while previewing.
    - `src/ticking.test.ts`: 5 tests using a real engine on `InMemoryAdapter` and a fake scheduler. A "solid" fact ticked on day 34 is saved dead with its bisected death time.
  - **Task 15:** `src/styles/global.css` (the 14 variables, base styles, a `:focus-visible` outline and a reduced-motion block), imported from `main.tsx`; `src/vite-env.d.ts`; and `src/styles/global-css.test.ts`, which checks that `global.css` matches `cssVariables`. `@types/node` ^22 was added for that test.
  - **Spec conflicts:** before starting, Kiro asked about three conflicts, and each time I chose tasks.md:
    - CSS variables are `--color-*`/`--font-*` (the steering file lists `--bg`, `--stone` and so on).
    - `App.tsx` lives at `src/App.tsx` (design.md says `src/components/`).
    - Wording has its own `src/wording.ts` (design.md puts it in `theme.ts`).
    - The app tsconfig stays standalone, because there is no root tsconfig to extend.
- **What I changed by hand**: no code. Decisions: tasks.md wins the three spec conflicts; the death-time wording is fixed in the spec (Requirement 17.3, task 2.3, and design.md line 461) instead of loosening the test.
- **What went wrong or surprised me**:
  - **The spec's death-time wording:** Kiro pointed out that "within 1 minute after 33.22 days" (Requirement 17.3, task 2.3) does not quite match the maths. The real crossing is 10 × log2(10) ≈ 33.2193 days, and bisection records the death at most a minute later, so `diedAt` always falls just before 33.22 days. Its ticking test checks crossing ≤ `diedAt` ≤ crossing + 1 minute instead. The requirement wording needs my decision before tasks 2.2 and 2.3.
  - **A leftover scratch test:** Kiro found `apps/study-dungeon/src/__cc_check.test.ts` and left it alone.
  - **Nothing was run in this session.** Results come from my WSL run.
  - **Round 2 (tasks 2.2, 2.3, 10.2 and a round 1 test fix), written, not yet run:**
    - **`src/policy.test.ts`** (tasks 2.2 and 2.3): checkPolicy with all three knowledge levels and both events; `init`; `healthAt` against hand-worked values (day 7 61.557, day 8 57.435, day 33 10.153, day 34 9.473); both clamps (180 and 1) directly and through the engine; decay continuing from 45; `nextDueAt` for alive, weak and dead; resurrect keeping the half-life at death (20 after doubling, 5 after halving); the half-life 10 outcome table; and `diedAt` checked as crossing ≤ `diedAt` ≤ crossing + 60 000 ms.
    - **`src/autopsy-sentences.test.ts`** (task 10.2): reports built through the real engine, exact sentence arrays for 8 scenarios (never reviewed, long silence after growth, several wrong answers, one wrong among right ones, resurrected with and without `halfLifeAtDeath` and with and without a later review, a failed challenge). The expected dates, day counts and half-life chains are worked out in comments from the policy maths. Also `halfLifeChain` (including both clamps and null for a resurrected fact) and `formatDuration`.
    - **`global-css.test.ts`:** the parser now uses a lookbehind `(?<=^|\})`, so it no longer consumes the previous rule's `}`. New test checks that all seven top-level rules are found.
    - **Spec lines:** Requirement 17.3 and task 2.3 now say "within 1 minute after the crossing at 10 × log2(10) ≈ 33.219 days". That settles the open point above.
    - **`package.json`:** `--passWithNoTests` removed from the app's test script.
  - **The suggested parser assertion would not have caught the bug.** With the old parser the rules found were `:root`, `html`, `h1` and `:focus-visible`; the skipped ones were `*`, `body` and `code`. So "h1 and :focus-visible are both found" passes on the broken parser. Kiro asserted the skipped rules (`*`, `body`, `code`, and the others) instead.
  - **Kiro ran two shell commands in this round despite the no-commands rule:** a read-only `ls`/`tail` to find the files and the end of this log, and a pointless `true`. Both exited with -1 and changed nothing.
- **Verification (in WSL)**:
  - **Round 1** (tasks 1, 3, 4, 15): `pnpm install` OK, shell and app typecheck clean (React 18 types work with TypeScript 7), `vite build` OK (141 kB JS), engine still 701/701. App tests 15/16: the one failure was a bug in Kiro's CSS test parser, not in `global.css` (its regex consumed each rule's closing `}`, so every second rule, including `body`, was skipped). Kiro fixed it in round 2.
  - **Round 2** (tasks 2.2, 2.3, 10.2): 104/104 on the first run. I then broke the policy and the autopsy sentences on purpose 12 times (wrong-answer health 50, each clamp, the "shaky" start, decay from creation, no weak branch in `nextDueAt`, a resurrect that resets the half-life, and five changes to the sentences). 11 were caught. Not caught: the "missed answers" cause needing 3 misses instead of 2, because the only scenario had exactly 3. Kiro added a 2-miss scenario; 105/105, and that change now fails a test.
  - **Cause-of-death sentences** (`autopsy-sentences.ts`, task 10.1) were written by me in this session too; see Session 12.
- **Credits used**: 26.13 for round 1 (12 minutes 3 seconds); 12.89 for round 2 (7 minutes 36 seconds); the 2-miss follow-up was small and not recorded.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 1, 2.2, 2.3, 3, 4, 10.2 and 15 done and ticked (105 app tests).

---

## Session 14: Study Dungeon lists and the first shell components, tasks 13, 14 and 6.1-6.3 (Nov 18, 2026)

- **Goal**: the first visible screen. Counters, the history log and the item card in `packages/shell`; the Crypt, Dungeon and Graveyard in the app; remove with confirmation. Before any component, give the shell fixed colour roles so it cannot pick up Study Dungeon's colour names. Kiro writes files only; I run the commands in WSL.
- **Kiro feature used**: spec tasks and steering, plus Context7 to check that Vite applies the tsconfig `jsx` setting to the shell's `.tsx` tests without the React plugin.
- **What Kiro produced**:
  - **Step 0, shell colour roles:**
    - `ThemeProps` is now fixed roles: colours `bg`, `panel`, `panelHi`, `line`, `text`, `textDim`, `accent`, `alive`, `weak` and `dead`; fonts `display`, `body` and `mono`.
    - `packages/shell/src/theme.ts` turns them into `--shell-<role>` variables (`--shell-panel-hi`, `--shell-font-display`, and so on). Every component sets these on its root element from its `theme` prop. `shell.css` uses nothing else.
    - In the app, `studyDungeonShellTheme` maps the palette onto the roles: panel = stone, panelHi = stoneHi, text = bone, textDim = boneDim, accent = pumpkin, alive = ecto, weak = pumpkin, dead = slate. The palette itself and the `--color-*` variables in `global.css` are unchanged.
    - `theme.test.ts` checks the mapping three ways: the hex values, the palette name each role comes from, and the `--shell-*` variables the shell produces.
  - **Task 13:** `Counters`, three badges. Each shows the state's icon, the count and the list name from the wording.
  - **Task 14:** `HistoryLogViewer`, oldest first, with equal timestamps keeping their order. The app passes `describe(entry)` for the words and `formatTimestamp(ms)` for the time.
  - **Task 6.2:** `ItemCard`, generic over Payload and PolicyData.
    - The app passes `renderText` and an optional `renderDetail`.
    - The state is shown as the app's icon plus `wording.states`.
    - The main button says `wording.actions.tend`, or `wording.actions.resurrect` for a dead item.
    - The text is cut to two lines.
  - **Task 6.1:** `src/lists.ts` holds the pure helpers `groupByState`, `sortCrypt`, `sortDungeon`, `sortGraveyard`, `buildLists`, `epitaphOf`, `formatHealth` and `formatWakeUp`.
    - Crypt: soonest `studyDungeonPolicy.nextDueAt` first.
    - Dungeon: lowest health first.
    - Graveyard: newest `diedAt` first.
    - Ties go by id.
    - `ThreeLists.tsx` shows them as keyboard-usable tabs with counts, reading `engine.view(now)` once per `now` and `version`.
    - `icons.tsx` holds a candle, a monster and a tombstone as inline SVG.
  - **Task 6.3:** `ConfirmRemoveDialog`, a native modal `<dialog>` that says "Remove this fact? This cannot be undone." Cancel has focus first, and Escape cancels. Confirming calls `engine.remove(id)` in the App, which bumps a version counter.
  - **App.tsx:** `now = realNow + previewOffsetMs`. `realNow` is set by each settle tick. `previewOffsetMs` is a typed placeholder fixed at 0 until round 5. Fight and Challenge call a marked no-op until round 4.
  - **Tests, not yet run:**
    - **Shell (32 tests):** the components are rendered with `react-dom/server` `renderToStaticMarkup`, using a neutral fixture theme and wording.
      - Every visible word comes from the props.
      - Each state shows its icon (hidden from screen readers) and its words.
      - The root element carries exactly the 13 `--shell-*` variables from the theme.
      - The button labels follow the wording.
    - **Shell boundary test:** it reads every shell source file. It fails on any import from an app, on an engine import that is not `import type`, on a Study Dungeon colour name (stone, bone, ecto, pumpkin, slate and the rest), and on the words Crypt, Dungeon, Graveyard, Fight, Challenge, sleeping or monster.
    - **App (20 tests):**
      - The list helpers, tested on facts from a real engine on `InMemoryAdapter` at fixed times.
      - The expected wake-up times, health values and death times are worked out in comments from the spec formulas: for example "new" wakes at 2 × log2(100/60) ≈ 1.474 days, and a wrong answer on day 1 leaves 45 × 0.5^(7/5) ≈ 17.05 on day 8.
      - The new theme and wording checks.
  - **Packages:** the shell gained the dev dependencies `react-dom`, `@types/react-dom`, `@types/node` (for the boundary test) and `@decay-engine/engine` (`workspace:*`, types only). `--passWithNoTests` was removed from the shell's test script.
  - **design.md:** updated to match: `ThemeProps` roles, `StateIcons`, the new `ItemCard`, `Counters` and `HistoryLogViewer` props, `actions.remove`, the `studyDungeonShellTheme` mapping, and a rewritten "Theme Application" section.
- **What I changed by hand**: no code. Kiro's gap-fillers (`actions.remove`, `StateIcons` from the app, the plain palette type, Dungeon tab first, health rounded down) are kept.
- **What went wrong or surprised me**:
  - **The fixed-roles change conflicted with design.md**, which typed the theme as `Record<string, string>` and said shell components read `--color-*`. design.md was updated, as instructed.
  - **Two gaps Kiro filled, to confirm:**
    - The Remove button sits on the shell's ItemCard, but `WordingProps` had no label for it. Writing "Remove" in the shell would hard-code a word, so Kiro added `actions.remove` to `WordingProps`.
    - The candle, monster and tombstone are Study Dungeon's metaphor, so the icons come from the app as a `StateIcons` prop. Hard-coding them in the shell would have fitted no other app.
  - **`toCssVariables` now takes a plain palette type**, because the Study Dungeon palette no longer fits the shell's `ThemeProps`.
- **Verification (in WSL)**: app typecheck clean, app 125/125, shell 32/32, build OK, engine 701/701.
  - **One failure: the shell typecheck.** `boundary.test.ts` could not find `node:fs` although `@types/node` was installed. TypeScript 7 no longer adds installed `@types` packages by itself, so Kiro's note ("no `types` field, so every installed `@types` package is picked up") no longer holds. The app only passed because `vite-env.d.ts` pulls Node's types in through Vite. I fixed it in Session 15: `"types": ["node"]` in both tsconfigs.
  - **Deliberate breaks:** 9 of 9 caught (each sort reversed, health rounded instead of floored, an empty epitaph shown, the Fight/Challenge label swapped, the state label and "Remove" hard-coded in the shell, the theme variables dropped).
- **Credits used**: 39.72 (15 minutes 48 seconds).
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 6.1, 6.2, 6.3, 13 and 14 done and ticked.

---

## Session 15: Study Dungeon add/edit, fight and challenge, tasks 5.1, 5.2, 7.1 and 7.2 (Nov 18, 2026)

- **Goal**: make the app writable. An add/edit fact form, the fight for alive and weak facts, and the challenge for graves, all wired into the App so every write bumps the version counter. Kiro writes files only; I run the commands in WSL.
- **Kiro feature used**: spec tasks and steering. The npm registry was checked for current versions of the new test packages.
- **What Kiro produced**:
  - **Tasks 5.1 and 5.2, `AddEditFactDialog`:**
    - A native modal `<dialog>` with a `<form>`. Fields: question and answer (required, at most 140 characters), why (optional, at most 80), knowledge (brand new / shaky / solid), importance (1, 2, 3) and review cost (1, 2, 3, 5 minutes).
    - Each text field has a label, a `maxLength`, a character counter and an error message linked with `aria-describedby`.
    - Adding calls `engine.addItem`. Editing calls `engine.edit`, with the knowledge field hidden and the stored value passed through. The dialog closes after a save.
    - Validation is a pure function, `validateFactForm` in `src/fact-form.ts`. It trims the text, reports every failing field at once, and returns exactly what `addItem` and `edit` need.
  - **Task 7.1, `FightDialog`:** first the question with "Show answer" and "Walk away", then the answer with "I knew it", "I forgot" and "Walk away". It calls `engine.tend(id, { kind: "review", correct }, now())` and shows the result text from task 7.1. "Walk away" and Escape make no engine call.
  - **Task 7.2, `ChallengeDialog`:** the question and the answer together, with "I knew it" and "I forgot". Both call `engine.resurrect`. On success it reads the half-life from `engine.view` after the resurrect and shows "Resurrected! New half-life: X days". On failure it shows the outcome's reason.
  - **Testability:** each dialog takes only the engine methods it uses (`Pick<StudyDungeonEngine, ...>`) and a `now()` function. The App passes the localStorage engine and `Date.now`. Tests pass a real engine on `InMemoryAdapter` and fixed times.
  - **Shell:** `WordingProps.actions` gained `edit`, and `ItemCard` gained `onEdit`. Buttons now come in the order action, edit, remove. design.md was updated to match.
  - **App:** an "Add fact" button above the lists, an Edit button on every card, and Fight and Challenge open their dialogs instead of the no-op. One dialog is open at a time. Every write passes through `bumpVersion`.
  - **Wording:** every new label and line of text is in `wording.ts` (`factFormText`, `fightText`, `challengeText`, `formatHalfLifeDays`).
  - **Styles:** `src/styles/dialogs.css`. Bone on stone, pumpkin for the main button, ecto for a right answer, blood for a wrong one, slate for a resurrection. Every result is also written out in words.
  - **Tests, not yet run:**
    - **`fact-form.test.ts` (node):** 140 characters accepted and 141 rejected for question and answer, 80 and 81 for why. Also: blank counts as missing, trimming, the three knowledge levels, importance 1-3, costs 1/2/3/5, and every error reported together.
    - **Dialog tests (jsdom, `@testing-library/react` and `user-event`):**
      - Fight: "Walk away" leaves history unchanged at both steps. "I knew it" on a solid fact on day 3 gives health 100 and half-life 20. "I forgot" gives 45, half-life 5, and an alive → weak entry. A weak monster on day 8 comes back alive.
      - Challenge: "I forgot" leaves the fact dead and adds one resurrect-failed entry with the policy's reason. "I knew it" brings it back with the half-life it had at death (20 after a right answer, 2.5 after two wrong ones).
      - Add/edit: adding stores every chosen field (solid → half-life 10). Editing a solid fact keeps knowledge "solid" and half-life 10, and records `fieldsChanged: ["payload", "importance", "costMinutes"]`. An empty form saves nothing.
      - `ThreeLists`: Edit, Fight and Challenge on a card reach the App with the right fact and action.
      - Each expected value is worked out in a comment from the spec formulas, for example a death at day 1 + 5 × log2(45 / 10) ≈ day 11.85.
    - **Updated:** the wording test now expects `edit: "Edit"`. New wording tests cover the fight and challenge text and the half-life format.
  - **Packages:** the app gained the dev dependencies `jsdom` ^31.0.1, `@testing-library/react` ^16.3.3 and `@testing-library/user-event` ^14.6.12. No `@types` packages were added. Only the dialog test files use jsdom, through a `// @vitest-environment jsdom` comment.
- **What I changed by hand**: no code. I added `"types": ["node"]` to the shell's and the app's tsconfig (the Session 14 fix, which had not been sent to Kiro) and ticked the verified tasks in `tasks.md`.
- **What went wrong or surprised me**:
  - **jsdom and `<dialog>`:** jsdom has long lacked `showModal()` and `close()`. A small test-only file (`src/test/dialog-polyfill.ts`) adds them only when they are missing; it sets and removes the `open` attribute.
  - **A fight can outlive its fact.** The lists refresh once a minute, so a fact can die between opening the fight and answering. `engine.tend` then saves the death and throws `ITEM_ALREADY_DEAD`. The fight catches only that code, says the fact died and points to the Graveyard. A test covers it.
  - **Gaps Kiro filled, to confirm:**
    - The challenge has a "Walk away" button, so a mouse user can leave without answering. Requirement 8.6 lists only "I knew it" and "I forgot".
    - A half-life of exactly 1 reads "1 day", not "1 days".
    - `@testing-library/react` and `user-event` both need `@testing-library/dom` as a peer. pnpm installs peers automatically, so it is not listed.
  - **Kiro ran two shell commands in this round despite the no-commands rule:** an `echo` and a `true`, both by mistake. Both exited with -1 and changed nothing.
- **Verification (in WSL)**: `pnpm install` added the test packages (with `@testing-library/dom` as a peer, no warning). After the tsconfig fix: shell and app typecheck clean, shell 35/35, app 166/166, build OK, engine 701/701.
  - **Deliberate breaks:** 7 changes. Caught: fight answers swapped, "Walk away" calling `tend`, a challenge that always counts as right, "I forgot" on a grave recording nothing, the question limit off by one, the epitaph limit raised to 100. Not caught on its own: editing reads knowledge from the form instead of the stored fact. That one has no effect, because the edit form is also pre-filled with the stored knowledge; breaking both places at once fails the edit test. So the rule is guarded twice.
- **Credits used**: 43.85 (14 minutes 51 seconds).
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 5.1, 5.2, 7.1 and 7.2 done and ticked. Study Dungeon: 22 of 58 tasks and subtasks ticked (166 app tests, 35 shell tests). Kiro's three choices (Challenge "Walk away", "1 day", "half-life doubled" kept at the 180 clamp) are kept unless I change them. Next: round 5, the time machine (task 8).

---

## Session 16: Study Dungeon time machine and Triage, tasks 8.1-8.3, 9.1 and 9.2 (Nov 18, 2026)

- **Goal**: preview the future without saving anything, and answer "I have N minutes. What should I save?". A real `previewOffsetMs` with every write blocked while previewing, the shared `TimeMachine`, `PreviewBanner` and `TriagePanel`, and a fight queue started from Triage. Kiro writes files only; I run the commands in WSL.
- **Kiro feature used**: spec tasks and steering.
- **What Kiro produced**:
  - **Shell, `WordingProps`:** three new sections, `timeMachine`, `preview` and `triage`, filled in by the app's `wording.ts`. The shell test fixtures fill them with neutral words.
  - **Shell, `ItemCard`:** `disabled` and `disabledReason` props. Disabled buttons keep their place and label, are marked `aria-disabled` (not the native attribute, so they stay focusable), take the reason as their title and description, and ignore clicks.
  - **Task 8.2, `TimeMachine`:**
    - A slider from 0 to 60 days in one-hour steps, controlled by an `offsetMs` prop, plus +7, +14 and +30 quick jumps that are never disabled.
    - It shows `wording.timeMachine.showing(formatDate(today + offset), whole days)`, with the date formatted by the app.
    - Play moves the offset from where it is to +60 days over 5 seconds, rounded to whole hours each frame. Pressing it again stops it, and so does moving the slider or a quick jump.
    - The frame scheduler, the clock and the reduced-motion check are injected, as `ticking.ts` injects its scheduler. With reduced motion, Play jumps straight to +60 days.
  - **Task 8.3, `PreviewBanner`:** "Future preview · nothing is saved" with "Back to today". The App renders it only while previewing.
  - **Task 9.1, `TriagePanel`:**
    - Generic over Payload and PolicyData. Budgets are 5, 10 (chosen first), 20 or a custom whole number. An invalid custom budget shows an error and calls nothing.
    - The app passes `triage(budget)`, which calls `engine.triage(budget, now)`; the panel never imports the engine. The result is worked out again when that function changes, so it follows the time machine and every write.
    - Picks show the text, value per minute, cost and days until death; the others show "dies in N days". Days are rounded up from `diesAt`, and a null `diesAt` reads "not dying within 10 years".
    - With no weak facts there is an empty state instead of lists. "Start the session" takes `startDisabled` and a reason.
  - **Task 8.1, App:**
    - `previewOffsetMs` is real state set by the time machine; previewing means `previewOffsetMs > 0`.
    - Add fact, Edit, Remove, Fight, Challenge and "Start the session" are disabled while previewing, with the reason "Nothing is saved in a future preview. Go back to today first.". The handlers also refuse.
    - Writes still use the real clock. `useSettleTicks` gained optional `getNow` and `scheduler`, so "Back to today" ticks straight away and refreshes `realNow`.
    - The App now takes its engine, clock, tick scheduler, frame scheduler, frame clock, reduced-motion check and date format as props. `main.tsx` passes the localStorage engine; everything else defaults to the browser.
  - **Task 9.2, the fight queue:**
    - "Start the session" queues the pick ids in triage order. Each fact is looked up again with `engine.view(clock())` when its turn comes. One that died or was removed is skipped and named in the completion message.
    - Close, Walk away and Escape move on to the next fight. `FightDialog` gained an optional `session` prop that shows "Fight N of M" and a "Stop session" button, which drops the rest of the queue.
  - **Tests, not yet run:**
    - **Shell:** markup tests with `renderToStaticMarkup` for TimeMachine, TriagePanel, PreviewBanner and the disabled ItemCard. Interaction tests in jsdom drive the slider and the quick jumps, step Play frame by frame with a fake scheduler and clock, and cover Stop, reduced motion, custom budget validation, the results and the empty state.
    - **App (`App.test.tsx`):** a real engine on an adapter that counts saves, a hand-moved clock and a fake tick scheduler.
      - A "solid" fact added on day 0 is in the Dungeon at +30 days and in the Graveyard at +34.
      - While previewing, every write button in all three lists is disabled and opens nothing. The snapshot, the save count and the history stay unchanged, and no tick runs.
      - "Back to today" re-enables everything and ticks at the new time.
      - The Triage worked example (budgets 5 and 10) is worked out in a comment from the value rule and compared with the panel and `engine.triage`.
      - The queue fights b then a, skips c after it died, and finishes with the completion message. Also covered: a removed fact, Stop session, and a fight from a card that is not part of a session.
    - **Wording:** the banner, jump, days and value-per-minute text, `formatPreviewDate` and the session text.
  - **Boundary test:** "lurking" (the Triage heading "Still lurking") added to the forbidden words; the three new shell files added to the files it must find.
  - **design.md:** `WordingProps`, `ItemCardProps`, `TriagePanelProps`, `TimeMachineProps`, `FrameScheduler` and `PreviewBannerProps` updated to match, plus the time machine, Triage and fight queue sections.
  - **Packages:** the shell gained the dev dependencies `jsdom` ^31.0.1 and `@testing-library/react` ^16.3.3, the same versions as the app. No `@types` packages were added, so the tsconfig `types` fields are unchanged.
- **What I changed by hand**: no code. Kiro's four choices (custom budgets capped at 1440 minutes, "None of them fits in that time", Play at +60 days restarting from today, Stop session ending without the completion message) are kept.
- **What went wrong or surprised me**:
  - **Gaps Kiro filled, to confirm:**
    - The custom budget also has an upper limit of 1440 minutes, because `engine.triage` throws `INVALID_BUDGET` above that.
    - When weak facts exist but none fits the budget, the panel says "None of them fits in that time" instead of showing an empty picks list.
    - Play pressed at +60 days runs again from today; "from the current offset" would otherwise do nothing.
    - "Stop session" ends the queue without the completion message.
  - **Kiro ran one shell command in this round despite the no-commands rule:** an `echo` at the start. It changed nothing.
- **Verification (in WSL)**: `pnpm install` OK, no peer warnings. Shell and app typecheck clean, shell 85/85, app 239/239 (including the sample data, stats and contrast tests written alongside), build OK, engine 701/701. Everything passed on the first run.
  - **Deliberate breaks:** 14 changes. 12 were caught: Play animating under reduced motion, Play lasting 2 s, the slider stopping at 30 days, a custom budget of 0 or with no maximum, disabled card buttons still clicking, Add fact allowed while previewing, the queue in reverse order, the queue fighting a dead fact, preview never turning on, ticking while previewing.
  - **Two got past the App's own check:** remove and "Start the session" while previewing. Both are blocked twice: the App ignores them, and the shell's ItemCard and TriagePanel never call back while disabled. Breaking both layers fails a test in each case, so they are covered.
  - **One made no difference:** writes using the preview time. Writes cannot happen while previewing, so the offset is always 0 when one does.
- **Credits used**: 58.77 (20 minutes 20 seconds), the most for one round so far.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 8.1, 8.2, 8.3, 9.1 and 9.2 done and ticked.

---

## Alongside Session 16: sample data, hero stats and the contrast check (Nov 18, 2026)

- **Goal**: shorten the later rounds by writing three self-contained pieces outside Kiro, in new files only, while Kiro does round 5 (time machine and Triage).
- **Kiro feature used**: none. Written by Claude Opus 5.5 at my request; no Kiro credits.
- **What was produced**:
  - **Sample data** (`src/sample-data.ts`, tasks 11.1 and 11.2):
    - 12 facts, 4 per knowledge level. Questions 1-9 come from the wireframe; 3 are new.
    - The wireframe's own half-lives (3, 2.5, 7 days and so on) do not follow the policy's starting values (2, 5, 10), so each history was worked out again from the policy maths.
    - The histories are replayed through the real engine at past times, then ticked at now. That gives 4 alive, 4 weak and 4 dead, each at least a day from a state boundary, so the result does not depend on the time of day.
    - The dead ones show off the autopsy: Frankenstein dies of two missed answers (half-life 10 → 20 → 10 → 20 → 10), one fact was never reviewed, one died after a long silence, and the gold fact has a failed challenge.
    - `loadSampleData(engine, now)` returns the new ids.
    - 10 tests: 12 facts, the 4/4/4 spread, each fact's state, the same states at four times of day, every death time against the maths, history counts (18 reviews, 3 wrong, 1 failed challenge), every fact passes the add form's validation, and the Frankenstein autopsy sentence.
  - **Hero stats** (`src/stats.ts`, the logic for task 12.1):
    - `countSoulsBanished` counts right answers in "tended" entries only; resurrections do not count.
    - `currentStreak` counts calendar days in the viewer's time zone, ending today or yesterday. It steps back by calendar date rather than by 24 hours, so daylight-saving changes cannot skip or repeat a day.
    - `allHistory(engine, now)` collects every fact's history.
    - 14 tests, including 23:30 and 00:30 counting as two days, the Kolkata time zone, the New York daylight-saving change, and reviews after now being ignored.
  - **Contrast check** (`src/contrast.test.ts`, task 16.3): computes the WCAG ratio for every text colour on bg, panel and panelHi, and for the filled buttons. All pass AA; the lowest is blood on stoneHi at 6.0:1. Task 16.3's "bone on bg 14.6:1" is wrong: it is 16.35:1. 30 tests.
- **What I changed by hand**: no code.
- **What went wrong or surprised me**:
  - **Deliberate breaks:** 10 changes. 7 were caught. Two made no difference (a review moved within its safety margin, a date step off by an hour that still lands on the same day). One was a real gap: a review later on the same day, after now, was counted toward the streak, because the test only had a future review on a later day. A same-day case was added, and that change now fails a test.
- **Verification (in WSL)**: app typecheck clean, app 221/221 (239/239 with round 5).
- **Status**: tasks 11.1, 11.2 and 16.3 done and ticked after the round 5 run; 12.1's logic is ready for Kiro's HeroSection. For Kiro: the first-run screen (11.3) calls `loadSampleData(engine, Date.now())`, and the hero (12.1) uses `countSoulsBanished(allHistory(engine, now))` and `currentStreak(...)`.

---

## Session 17: Study Dungeon autopsy, first run, reset and hero, tasks 10.3, 11.3, 11.4, 12.1 and 12.2 (Nov 19, 2026)

- **Goal**: the autopsy dialog for graves, the first-run screen, "Reset all data", and the hero section with its stat cards. Task 11.5 (the tour) is not in this round. Kiro writes files only; I run the commands in WSL.
- **Kiro feature used**: spec tasks and steering.
- **What Kiro produced**:
  - **Task 10.3, `AutopsyDialog` (shell):**
    - A native modal `<dialog>`: the dead icon and title, the epitaph under its label, a health-over-time chart, then the cause sentences as paragraphs, in order. Escape and Close call `onClose`.
    - The chart is inline SVG. It draws the health line, shades the bands below the weak and dead thresholds it is given, and puts a mark per review in a row under the plot: a circle when right, a cross when wrong. A legend names both shapes and both bands in words. Its `aria-label` comes from `wording.autopsy.chartLabel` (for example "Health from 1 Oct 2026 to 7 Oct 2026: it started at 100 and fell to 9. No right answers, no wrong answers.").
    - An optional resurrect button labelled `wording.actions.resurrect`, with `resurrectDisabled` and a reason, like the Triage start button.
    - `WordingProps` gained `actions.autopsy` and an `autopsy` section; `ItemCard` gained `onAutopsy`. That button is read-only, so `disabled` leaves it enabled. Buttons now come in the order action, autopsy, edit, remove.
  - **Task 10.3, chart points (`src/autopsy-chart.ts`):** `replayStretches` replays the whole history from creation: the first half-life from `studyDungeonPolicy.init`, each review through `applyEvent`, and a resurrection at health 100 with the half-life kept. `buildAutopsyChart` then samples `healthAt` over the current life only (48 steps by default), plus the health just before and just after each review in that life.
  - **Task 10.3, App:** graves get an Autopsy button that works while previewing, including for a fact dead only on the previewed day. `FactAutopsy` reads `engine.autopsy(id, now)`, passes the dead fact's `policyData.halfLifeDays` as `halfLifeAtDeath`, and builds the chart. Its Challenge closes the autopsy and opens the challenge; it is disabled while previewing.
  - **Task 11.3, first run (`src/first-run.ts`, `FirstRun.tsx`):** shown when `study-dungeon:started` is missing and there are no facts. "Load sample data" calls `loadSampleData(engine, clock())` and bumps the version; "Start empty" shows the main screen, where the empty lists ask for the first fact. Both set the flag. Facts with a missing flag set the flag and skip first run. The App takes the storage as a prop (default `window.localStorage`).
  - **Task 11.4, `ResetData`:** "Reset all data?" confirmation in the words of Requirement 13.6. Confirming removes exactly `decay-engine:study-dungeon` and `study-dungeon:started` (`RESET_KEYS`), then calls an injected `reload`. Disabled while previewing.
  - **Tasks 12.1 and 12.2, `HeroSection`:** "Your memory today", then "N facts are weakening" with "Fight the weakest" (the lowest-health weak fact; disabled while previewing), or the quiet-crypt message, or a line pointing to Add fact. Stat cards: the shell's `Counters` for the three counts, plus souls banished and the streak from `stats.ts`, each with an icon, a number in IBM Plex Mono and a label. Counts use `now`; souls and the streak use `realNow`.
  - **Wording:** every new label is in `wording.ts` (`autopsy`, `firstRunText`, `resetText`, `heroText`, `emptyCryptPrompt`).
  - **Tests, not yet run:**
    - **Chart points:** a fact never reviewed (halfway 100 / √10 ≈ 31.62), a right and a wrong answer (70.71 before each, 100 and 45 after; halfway ≈ 35.68 on half-life 2), and a resurrected fact whose second life starts from half-life 10, not the 5 of "shaky" (halfway 31.62 instead of 10.0), checked while dead only on a previewed day.
    - **Shell `AutopsyDialog`:** epitaph, sentences in order, line coordinates and mark positions worked out from the plot size, marks told apart by shape, bands following the thresholds, the `aria-label`, no words of its own, and the resurrect button enabled, disabled and clicked.
    - **App:** first run with each button and the 4/4/4 sample; existing facts with no flag; reset confirm, cancel and preview; the hero's messages, counts, souls 3 and streak 3 for a worked history, "Fight the weakest" opening the weakest fact, and counts changing at +30 days while souls and streak stay; the autopsy's epitaph, chart label, sentences and Challenge, today and in preview.
  - **Changed existing tests (requirement changes, not loosened checks):** the App preview test now expects `Graveyard:Autopsy` among the grave's buttons and checks it is not disabled instead of clicking it; `theme.test.ts` expects `autopsy: "Autopsy"` in the actions.
  - **Boundary test:** "forgot", "souls", "banished" and "weakening" added to the forbidden words; `AutopsyDialog.tsx` added to the files it must find.
  - **design.md:** `WordingProps`, `AutopsyChartSummary`, `ItemCardProps` and `AutopsyDialogProps` updated, plus the hero, autopsy, first run and reset sections.
  - **Packages:** none added; tsconfig `types` fields unchanged.
- **What I changed by hand**: no code. Kiro's six choices are kept: `onResurrect` instead of `onChallenge` in the shell ("Challenge" is a Study Dungeon word), first run only with no flag and no facts, the App taking storage, reload and time zone, an extra hero message when every fact is dead, review marks in a row under the chart with a legend, and the extra empty-list line after "Start empty".
- **What went wrong or surprised me**:
  - **Gaps Kiro filled, to confirm:**
    - The shell prop is `onResurrect`, not `onChallenge`: "Challenge" is a Study Dungeon word, and the boundary test forbids it in the shell.
    - First run needs both a missing flag and no facts, as asked; the flag is set in an effect after mount, so showing first run writes nothing.
    - A hero message for "only dead facts" ("Nothing is weakening. Your graves are waiting in the Graveyard."), which the spec does not cover.
    - Review marks sit in a row under the plot, with a dashed guide up to the line, rather than on the line.
    - The empty-lists prompt is an extra line under "The X is empty.", shown only when there are no facts at all.
  - **Kiro ran two shell commands in this round despite the no-commands rule:** an `echo` and a `true`. Both exited with -1 and changed nothing.
- **Verification (in WSL)**, with `scripts/check.sh`: install OK, shell and app typecheck clean, engine 701/701, shell 103/103, app 309/309 (including the files written alongside), build OK. Everything passed on the first run.
  - **Deliberate breaks:** 7 changes. Caught: a resurrection restarting the chart's half-life from the knowledge level (the trap this round's prompt warned about), a resurrected life starting at 45 instead of 100, first run shown over existing facts (14 tests failed), reset keeping the "started" flag.
  - **Three got through, and none is a gap.** The streak reading the preview time survived only because the `useMemo` dependency list does not include `now`; the realistic form of that bug (adding `now` to the list too) fails the test. Souls reading the preview time makes no difference, because the history is the same whatever time is passed. A reset that also removes other keys could not run against the test's fake storage, which has no `key()`; the test does check that other apps' keys survive a reset.
- **Credits used**: 74.74 (24 minutes 5 seconds), the most for one round so far.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: tasks 10.3, 11.3, 11.4, 12.1 and 12.2 done and ticked. Next: round 7, the last build round.

---

## Alongside Session 17: storage errors, crash screen, animations, sound and the check script (Nov 19, 2026)

- **Goal**: finish the self-contained parts of the last tasks outside Kiro, in new files only, while Kiro does round 6 (autopsy dialog, first run, reset, hero). Kiro wires them in during round 7.
- **Kiro feature used**: none. Written by Claude Opus 5.5 at my request; no Kiro credits.
- **What was produced**:
  - **Storage problems** (`src/storage-errors.ts`, task 18.3):
    - `classifyWriteError` turns a failed save into "full" (the browser's quota error, under each browser's name) or "unavailable", and returns null for anything else, so real bugs are rethrown, not hidden.
    - `classifyLoadError` and `createEngineSafely` handle a snapshot that cannot be read at startup. Today that throws while `engine-instance.ts` is imported and leaves a blank page.
    - The "corrupt" list holds only the three codes the engine's snapshot parser actually throws. A first draft listed nine; checking `serialization.ts` cut it down, so a bug elsewhere is never reported as corrupt data.
    - `storageProblemText` gives one plain sentence per problem, starting with "Storage full." as the design asks.
    - 13 tests through the real engine and `LocalStorageAdapter` over a fake localStorage. A quota error during `addItem` is classified "full", and storage and memory are unchanged afterwards. Bad JSON, an unknown schema version and a damaged item are all "corrupt"; missing storage is "unavailable"; other errors are rethrown.
  - **Crash screen** (`src/components/ErrorBoundary.tsx`, `src/styles/problem.css`, task 18.3): `ErrorBoundary` catches render errors, logs them and shows `ProblemScreen`, which offers Reload and, when the app passes one, Reset all data with a confirmation step. Reload and logging are injected. 5 tests (jsdom), including keyboard-only use.
  - **Animations** (`src/styles/animations.css`, tasks 17.1 and 17.2): the candle's flame flickers; a monster shakes once when its card is hovered or focused (so keyboard users see it too, and a full Dungeon is not all moving). The tombstone stays still. All of it is off under reduced motion.
    - 5 tests. The selectors are read from the CSS and run against the real icons from `icons.tsx`, so renaming a `data-icon` attribute breaks a test instead of silently stopping the animation.
  - **Sound** (`src/sound.ts`, task 20): a slash for a right answer, a low growl for a wrong one and a rising C major chime for a resurrection, generated with Web Audio in code: no audio files, nothing to license (Requirement 18.2). Off by default and saved under `study-dungeon:sound`. `play` never throws, does nothing when sound is off, and gives up quietly when the browser has no Web Audio. 14 tests with a fake audio context that records every tone's wave, pitch, timing and fade.
  - **`scripts/check.sh`**: install, both typechecks, the engine, shell and app tests, and the build, with a one-line result per step. It picks the Linux Node from nvm (the Session 11 problem). Its first run caught a real failure in Kiro's round 6, then in progress: `actions.autopsy` had been added to the wording but not to `theme.test.ts`.
- **What I changed by hand**: no code.
- **What went wrong or surprised me**:
  - **Reading a CSS file in a jsdom test** took three tries. Vitest blanks CSS imports, even `?raw`, and jsdom replaces the global `URL`, so `fileURLToPath(new URL(...))` fails. `import.meta.dirname` works.
  - **Deliberate breaks:** 15 changes across the four pieces. 14 were caught, among them a quota error only recognised under Chrome's name, a bug reported as corrupt data, a reset without confirmation, a monster shaking forever, animation left on under reduced motion, no shake for keyboard users, sound playing while off and sound on by default. The one not caught makes no difference: without `autoFocus`, focus still lands on Cancel, because React reuses the "Reset all data" button for it. `autoFocus` stays as a safeguard.
- **Verification (in WSL)**: the four new test files pass (37 tests); app typecheck clean.
- **Status**: code for 17.1, 17.2, 18.3 and 20 written; the tasks get ticked after Kiro wires them in (round 7) and the run passes. 17.3 (the tombstone) was already drawn by Kiro in `icons.tsx`.

---

## Session 18: Study Dungeon round 7, the last build round: tasks 11.5, 16.1, 16.2, 16.4, 17.1-17.3, 18.1-18.3 and 20.1-20.3 (Nov 19, 2026)

- **Goal**: wire in the pieces written alongside Session 17 (storage errors, crash screen, animations, sound) without editing them, and finish accessibility, the first-run tour, the responsive layout and sound. Kiro writes files only; I run the commands in WSL. Task 19 (final checkpoint) is done outside Kiro afterwards.
- **Kiro feature used**: spec tasks and steering.
- **What Kiro produced**:
  - **Task 18.3, error handling:**
    - `engine-instance.ts` now exports `createEngine()` instead of building the engine at import, which is what left a blank page on a damaged snapshot.
    - New `Root.tsx`: builds the engine once through `createEngineSafely`. "Corrupt" shows `ProblemScreen` with `storageProblemText.corrupt`, Reload and Reset all data; "unavailable" shows its sentence and Reload only. The App sits inside `ErrorBoundary`, which also offers the reset. `main.tsx` renders `Root` with `window.localStorage` (or null when reading it throws).
    - New `write-guard.ts` (`runWrite`, `reportWriteError`): a storage problem is reported, anything else is rethrown. The App uses it for remove, loading the sample data and setting the first-run flag. The add/edit, fight and challenge dialogs gained an optional `onWriteError` and hand their engine errors to the App. On a storage problem the App shows the sentence in its live region, closes the dialog and any Triage session, and keeps working.
  - **Tasks 17.1-17.3, visuals:** App.tsx imports `animations.css`. The counters, the cards and the autopsy title already use the same `studyDungeonIcons`, so every candle, monster and tombstone carries its `data-icon`. No icon code changed.
  - **Tasks 16.1, 16.2, 16.4, accessibility:**
    - `useModalDialog` remembers the opener and focuses it again when the dialog closes. A dialog opened from inside another (Autopsy → Challenge, the next fight of a session) takes over the first one's opener. `ConfirmRemoveDialog` now uses the hook, and `FactAutopsy` uses `useReturnFocus` for the shell's dialog.
    - Landmarks: `<header>` for the title, `<main>`, and a `<nav>` around the list tabs.
    - One polite `aria-live` region at the top of `<main>`: "Fact added to the Crypt.", "Fact saved.", "Fact removed.", fight and challenge results with the list the fact ends up in (read from the engine), "12 sample facts loaded.", and storage problems. The dialogs gained an optional `onResult` for this.
    - No button was icon-only, so no `aria-label` was needed; a test checks that every button has a name in words.
  - **Task 11.5, tour:** `Tour.tsx`, four steps (the Crypt, the Dungeon, Fight, the time machine) right after either first-run button, unless `study-dungeon:tour-done` is set. It is a small non-modal panel. Each step outlines its target. Focus starts on Next, Escape skips, and finishing moves focus to `<main>`. `TOUR_DONE_FLAG` joined `RESET_KEYS`.
  - **Tasks 18.1 and 18.2, layout:** new `layout.css`. Wide screens get two columns (lists, and a side column with the time machine and Triage). Below 640px everything stacks, the dialogs and the tour fit the screen, and the page padding drops to 0.75rem. 18.2 needs no loading state, because the engine is synchronous; this is recorded in tasks.md.
  - **Tasks 20.1-20.3, sound:** `SoundToggle.tsx`, a "Sound effects" switch beside "Reset all data" (through a new `children` prop on `ResetData`). It is off by default and saved with `saveSoundEnabled`. The App makes one `createSoundPlayer` and passes it to the fight and the challenge. The App takes `createAudioContext` so tests can record tones.
  - **Wording:** `announceText`, `landmarkText`, `soundText` and `tourText` in `wording.ts`.
  - **Tests, not yet run:**
    - `Root.test.tsx`: two kinds of damaged snapshot, read by the real `LocalStorageAdapter` from jsdom's localStorage, show the problem screen. Reset removes exactly the snapshot, the first-run flag and the tour flag, and keeps the sound setting and another app's key. Also: Reload, unavailable storage, a render crash and a constructor bug.
    - `App.storage-errors.test.tsx`: a quota error during addItem, tend, remove, resurrect and Load sample data. Each shows the sentence, changes nothing and leaves the app working; then the same action works.
    - `App.accessibility.test.tsx`: Escape and the focus return for all nine dialog openers, including Autopsy → Challenge; the live region after add, fight (right and wrong), challenge (won and lost) and remove; landmarks; button names; Tab reach; Enter and Space.
    - `App.tour.test.tsx`: the four steps walked with Enter and Space alone, Back, Escape, "Skip tour" reached with Shift+Tab, shown once, and the reset keys.
    - `App.sound.test.tsx` and `components/dialog-sound.test.tsx`: off by default, the choice saved as on or off, and right, wrong and revive played through one real player with a fake audio context. Nothing plays while sound is off, on Walk away, on a failed save, or for a fact that died first.
    - `layout-css.test.ts`: the new rules, plus a check across every app and shell stylesheet that no fixed width or column minimum is wider than a 320px screen's 296px content box.
    - `motion.test.ts`: the time machine's Play is the only `requestAnimationFrame` in the app and shell sources; there is no `Element.animate`, no smooth scrolling, and no interval timer apart from the settle tick.
    - `App.visuals.test.tsx`: the icons in the counters, the lists and the autopsy.
    - `write-guard.test.ts`.
  - **Test helpers:** `test/round7-helpers.ts` (a failing adapter, the live region, a fake audio context). `app-kit.tsx` gained optional `adapter` and `createAudioContext` options. The dialog polyfill now turns Escape into the browser's `cancel` event, so tests press Escape instead of faking `cancel`.
  - **design.md:** the file list, the hierarchy as built, the round 7 interfaces, the tour, the reset keys, sound, storage errors, accessibility and the responsive layout.
  - **Packages:** none added; the tsconfig `types` fields are unchanged.
- **What I changed by hand**: no code. Kiro's choices are kept: the tour only right after first run, reset keeping the sound setting, and two columns on wide screens. One was changed after the run (see the next entry): on a storage problem, the add/edit form now stays open with what was typed instead of closing.
- **What went wrong or surprised me**:
  - **Choices Kiro made, to confirm:**
    - The tour starts only right after first run, not for existing users who never saw it.
    - Reset keeps the sound setting, since it is a preference for this browser, not data.
    - On a storage problem, the add/edit form closes, and the typed text is lost.
    - The layout now has two columns on wide screens, which moved the time machine and Triage after the lists in the Tab order.
  - **Not covered:** a failing save during a settle tick (`engine.tick`) is still not caught. At mount it reaches the crash screen; in the minute interval it is uncaught. It is noted in design.md.
  - **Unknown files:** without the shell, Kiro could not list folders. If any file other than `main.tsx` imported `engine` or `adapter` from `engine-instance.ts`, the typecheck will name it.
  - **Kiro ran two shell commands in this round despite the no-commands rule:** an `echo` and a `true`, both by mistake. Both exited with -1 and changed nothing.
- **Verification (in WSL)**, with `scripts/check.sh`: install OK, shell and app typecheck clean, engine 701/701, shell 103/103, app 398/398, build OK. Everything passed on the first run.
  - **Wiring checked by reading:** the engine is built through `createEngineSafely` in `Root.tsx`, so a bad snapshot shows the problem screen; reset everywhere goes through `resetAllData` and `RESET_KEYS`, which now includes the tour flag; writes are classified or rethrown; one sound player, used by both dialogs.
  - **Deliberate breaks:** 10 changes, all caught: reset keeping the tour flag, the tour shown every time or never marked done, Escape not skipping the tour, focus not returned to a dialog's opener, a wrong answer playing the slash, no chime on a resurrection, the lists' nav landmark removed, no reset offered for corrupt data, the wrong storage message. (The nav check first looked caught only because the change was a syntax error; done properly, the accessibility test fails.)
- **Credits used**: 105.44 (31 minutes 54 seconds), the most for one round. Rounds 1-7 together: about 362 credits.
- **Screenshot**: (add file names from `docs/screenshots/`)
- **Status**: all round 7 tasks done and ticked. With the final checkpoint (next entry), Study Dungeon's spec is complete: 58 of 58.

---

## Alongside Session 18: two fixes and the final checkpoint, task 19 (Nov 19, 2026)

- **Goal**: close the gaps round 7 left, then run task 19.
- **Kiro feature used**: none. Done by Claude Opus 5.5 at my request; no Kiro credits.
- **What was changed**:
  - **A full storage during a settle tick** (the gap Kiro reported): before, at load it showed the crash screen instead of "Storage full", and in the minute interval the error went nowhere. `startTicking` and `useSettleTicks` now take an `onError`; the App classifies the error, announces a storage problem once (and again only after a tick has saved in between, so it does not repeat every minute), still moves `realNow` on, and rethrows anything else. Tests: two in `ticking.test.ts`, three in `App.storage-errors.test.tsx` (load on day 40 with a death to save: no crash, said once, the grave still shown; said once across failing ticks, again after a save worked; a real bug rethrown). `app-kit.tsx` gained `fireTick`.
  - **The add/edit form on a storage problem**: it used to close and lose what was typed, and its message went to a live region behind a modal dialog, where the page is inert. The form now stays open with the text and shows the sentence inside it (`role="alert"`); pressing the button again works once there is room. Kiro's add test was updated to this behaviour and an edit test added.
  - **design.md** updated for both.
  - Removing any of the four fixes fails a test.
- **Task 19, final checkpoint**: `scripts/check.sh`: install OK, typechecks clean, engine 701/701, shell 103/103, app 404/404 (1,208 tests in all), build OK. The dev server and the production preview were started and served the page and the built script.
- **What I changed by hand**: no code.
- **Status**: Study Dungeon's spec is complete: 58 of 58. Still to do outside the spec: a manual pass in a browser (keyboard only, a phone width, sound on), screenshots for this log, and deployment.


---

## After the spec: the visual pass (Nov 19, 2026)

- **Goal**: close the gap between the working app and the approved wireframe. The app worked, but it looked like a flat black list. The Study Dungeon spec described behaviour, not the look, so nothing told Kiro to build the creatures, scenes or candle.
- **Kiro feature used**: none. Done by Claude Opus 5.5 at my request; no Kiro credits.
- **Honest split**: the wireframe (`docs/design/study-dungeon-wireframe.html`) was designed outside Kiro. The brief (`docs/design/study-dungeon-visual-pass.md`) and the design tokens (`.kiro/steering/design-tokens.md`) were written outside Kiro too. The code for the visual pass was written by Claude Opus 5.5 from them, not by Kiro.
- **What was changed** (look and feel only; the engine is untouched, every behaviour kept):
  - **Pass 1, the world**: fixed atmosphere layers (room darkening, fog, cobwebs, vignette, grain) that age with the time machine through `--age`; the logo between two flickering torches with bats; each tab is now a scene: the Dungeon is a torch-lit brick chamber, the Crypt cold blue stone, the Graveyard a moonlit yard with a tree.
  - **Pass 2, creatures and health**: four creatures (slime, bat, imp, eye) chosen from each fact's id, in four moods (sleep, worried, feral, happy) by the brief's rule; monster cards with name, quip, urgency label, epitaph, importance, minutes, half-life, health orb, a health bar with the weak and dead marks and the hatched "lost since last review" part; sleeping creatures in the Crypt; tombstones in the Graveyard. Fight is the one filled button; Edit and Remove are quiet. An "alive today" tag shows in a preview.
  - **Pass 3, time machine and motion**: the time machine moved into a dock fixed to the bottom, beside a candle that melts as you look ahead, with markers for the days facts weaken or die (click to jump) and a "Next:" line. The hero says "In 18 days: …" and compares with today while previewing. The fight and challenge show the creature: it pops in, is squished by a right answer, lunges at a wrong one, rises when resurrected; a miss shakes the dialog. All motion is inside `prefers-reduced-motion: no-preference`.
- **Kept on purpose**: the tabs (the wireframe stacks the scenes, but the tab keyboard pattern and its tests stay); every button name, its order and its disabled reason; the shell's ItemCard contract (`FactCard` keeps its classes, so the tests read cards the same way).
- **Small shell change**: `TimeMachine` gained an optional `belowSlider` slot for the timeline. Shell tests 103/103.
- **Steering**: `theme-and-wording.md` said "not as a health bar"; it now allows a bar beside the world, always with the weak and dead marks.
- **Tests**: new `creatures.test.ts` (mood rule, urgency, stable identity), `components/art/art.test.tsx` (every creature in every mood, HealthBar marks and lost part, the candle melting), `timeline.test.ts`; `styles/animations-css.test.tsx` rewritten for the new motion rules. One real bug found on the way: a card read the history of a fact removed mid-session; the base health is now read with the lists.
- **What I changed by hand**: no code.

---

## After the spec: visual pass 2 and answer checking (Nov 19, 2026)

- **Kiro feature used**: none. Done by Claude Opus 5.5 at my request; no Kiro credits.
- **Why**: the first pass worked but felt like a standard UI with empty space, and "I knew it" could be clicked without knowing the answer.
- **What was changed**:
  - **Layout**: one full-width column. The hero has a boss stage in the middle (the weakest monster in a spotlight on a pedestal, with a health ring and a speech bubble; a sleeping dragon when nothing is weak). Triage became a full-width "raid planner" with a three-step explanation beside it. Scenes are full width (three cards a row).
  - **Atmosphere**: rising embers in the Dungeon, dust in the Crypt, fireflies in the Graveyard, a breathing torchlight glow; an entrance with two doors that swing open (once per tab, skipped under reduced motion; rendered in `main.tsx`, outside the App).
  - **Answer checking** (`answer-check.ts`, `AnswerPanel.tsx`): a fight or challenge now asks you to pick from four options (the wrong ones are your other facts' answers, the most alike first) or to type the answer (checked with slack for case, punctuation, articles and small typos). The old "Show answer / I knew it" stays as a third choice. Setting "Answer by" beside Sound; default is picking. Tests written before this select the old mode through `defaultAnswerCheck` / the app-kit's `answerCheck`.
  - **Features**: hunter ranks from souls banished with progress to the next (`ranks.ts`); a combo counter in Triage sessions; sparks on a win, "Miss!" on a wrong answer; after a right answer the fight says when the fact wakes again.
- **Tests**: new `answer-check.test.ts`, `ranks.test.ts`, `components/FightDialog.checked.test.tsx`, `App.answers.test.tsx`; `layout-css.test.ts` now expects one column and checks the new CSS files fit a 320px screen. App 451/451, shell 103/103, typechecks clean.
- **What I changed by hand**: no code.

---

## After the spec: extras, checks and the next apps' briefs (Nov 19, 2026)

- **Kiro feature used**: none. Done by Claude Opus 5.5 at my request; no Kiro credits.
- **What was added**:
  - **Unique creature names** (`nameCreatures` in `creatures.ts`): larger name pools; facts are named oldest first, so names never repeat and never change when facts are added.
  - **Triage shows a result at once** (shell `TriagePanel` gained an optional `initialBudget`; the app passes 10 minutes).
  - **Today's 5-minute raid**: one click runs Triage for 5 minutes and starts the session.
  - **Import facts** (`import-facts.ts`, `ImportFactsDialog.tsx`): paste `question | answer | why` lines, tabs or CSV; bad lines are listed with their reason.
  - **Back up and restore** (`backup.ts`, `BackupControls.tsx`): download your facts as JSON; a restore is checked by loading it into a real engine, then confirmed before it replaces anything.
  - **Phone**: the time dock folds to one row with a button to open it. **Empty Graveyard**: a flower meadow instead of a blank panel.
- **Keyboard and phone check** (scripted in a real browser, Playwright with Chromium): every control has a visible focus ring; dialogs trap and return focus; nothing scrolls sideways at 390px. It found two real problems, both fixed: focused buttons could sit under the fixed dock (fixed with `scroll-padding-bottom`), and a stray Enter answered a fight because focus started on option A (focus now starts on the options group; A to D or 1 to 4 pick).
- **Decided against**: stacking the three scenes (a very long page, and it would undo the tab pattern); topic tags for answer options (needs a new field in the developer's `policy.ts`).
- **Kept on purpose**: local-first. No accounts and no database, as `tech.md` says; backup and restore cover moving or losing a browser. Cloud sync is the next step the storage adapter allows.
- **Briefs for the next apps**: `docs/design/ghosted-visual-brief.md` (with `ghosted-wireframe.html`) and `docs/design/expiry-reaper-visual-brief.md`, written before Kiro builds them, so the look is in their specs from day one.
- **Tests**: app 465/465, shell 104/104, typechecks clean.
- **What I changed by hand**: no code.

---

## Session 19: scaffold hook back on, Ghosted scaffold, and a policy-reviewer agent (Nov 20, 2026)

- **Goal**: use the two Kiro features the write-up was weakest on. Turn the scaffold-policy hook back on and use it for Ghosted, and add a custom agent that reviews a policy.
- **Kiro feature used**: hooks, custom agents (sub-agents), chat. The `custom-agent-creator` and `introspect` built-in agents helped write and check the agent file.
- **What Kiro produced**:
  - **Scaffold hook** (`.kiro/hooks/scaffold-a-new-decay-policy.json`): `enabled` set back to `true` (it was turned off in Session 11 after it fired on every prompt). Its instructions now:
    - take the skin colours from `design-tokens.md`;
    - write test stubs as `it.todo`, not empty passing tests (`no-fake-tests.md`);
    - create a minimal `package.json` and `tsconfig.json` if they are missing;
    - log the run as a new session.
  - **Ghosted scaffold**: Kiro followed the hook's instructions. The hook did not fire, because this session's prompt ("do option 2 and 3") does not match `scaffold.*policy`. New files:
    - `apps/ghosted/src/policy.ts`. Every function throws "not written yet". The thresholds are `NaN`, so the engine constructor rejects the policy until it is written. The payload, policyData and event types come from the Ghosted reference policy in the engine `design.md`. No decay rule is written (`authorship.md`).
    - `apps/ghosted/src/policy.test.ts`, with 5 `it.todo` tests: health 0-100, purity, `healthAt` never increases, checkPolicy, and the design.md outcome (dies just after day 81 on a 30-day rhythm).
    - `apps/ghosted/src/skin.css`, with the Ghosted values from `design-tokens.md` and a comment on the window metaphor ("connection freshness").
    - `apps/ghosted/package.json` and `tsconfig.json`. The engine is the only dependency, with no React or Vite yet.
  - **Custom agent `policy-reviewer`** (`.kiro/agents/policy-reviewer.md`):
    - It checks an app's `policy.ts` against the Type Contract, the purity and clock rules, and the app spec.
    - It runs the policy tests and checks them against `no-fake-tests.md`.
    - It reports in five sections and never edits files. Its tools are `read` and `shell` only, with no `write`, and a `permissions` rule allows only the policy test command.
    - The steering files and the engine requirements are attached as `resources`.
    - The format was checked against kiro.dev (custom-agents/configuration-reference).
- **First run of the agent (Study Dungeon policy)**:
  - **Contract, purity and time**: no findings that need a change. It noted one small risk: `nextDueAt` calls `this.healthAt` (line 91), which breaks if the function is called on its own instead of as a method.
  - **A real spec conflict**: Study Dungeon `requirements.md` 4.1 (line 89) says a right-answer resurrect returns `policyData: { halfLifeDays: ... }`, but `design.md` line 386 says `{ ok: true }`. The Session 8 hand fix changed the design and never updated the requirement. The code follows the design, and the result is the same.
  - **Tests**: it would not run them. Kiro's shell printed nothing, and the agent's no-write rule stopped it from saving the output to a file. It gave me the command to run instead, so the read-only limit held.
- **Verification (in WSL)**: `pnpm install` OK; the lockfile gained the `apps/ghosted` importer only. Ghosted typecheck clean. Ghosted tests: 1 file skipped, 5 todo, 0 passed. Study Dungeon policy tests 60/60.
- **What I changed by hand**: nothing yet. The requirement 4.1 / design conflict is mine to settle.
- **What went wrong or surprised me**:
  - Kiro's shell printed nothing for long chained commands. Saving the output to a file in one command and reading it in a second worked.
  - The hook cannot be triggered by Kiro itself. To see it fire, send a prompt such as "scaffold the expiry-reaper policy".
- **Credits used**: (add from the usage panel)
- **Screenshot**: (add file names: the agent's report, the hook panel showing it enabled)

---

## Session 20: Ghosted policy, task 0.2 (Nov 20, 2026)

- **Goal**: replace the scaffold `apps/ghosted/src/policy.ts` with the real policy, from Requirements 1 to 4 and design sections 2.1 and 2.2 only. This is the documented exception in `authorship.md`: the rules are the developer's, the code is Kiro's.
- **Kiro feature used**: spec task, steering (`ghosted.md`, `authorship.md`, `engine-boundary.md`). The scaffold hook was not run, as asked.
- **What Kiro produced**: `apps/ghosted/src/policy.ts`:
  - `PersonPayload` gained `relationship: string`. Exports are exactly `PersonPayload`, `PersonPolicyData`, `ContactEvent`, `Person` and `ghostedPolicy`. `DAY_MS` is a module constant, not exported, because design 2.1 does not list it.
  - Thresholds `{ weak: 60, dead: 10 }`; `init` copies `payload.lastContactAt`.
  - `healthAt`: `elapsed = max(0, now − L)`, `T = 3 × rhythmDays × DAY_MS`, `max(0, 100 × (T − elapsed) / T)`, in that order. It reads only `policyData.lastContactAt`, `payload.rhythmDays` and `now`.
  - `applyEvent`: text gives `min(100, h + 40)` and `lastContactAt = now − (100 − health) / 100 × T`; call and meet-up give 100 and `lastContactAt = now`.
  - `nextDueAt`: `null` when `item.state === "dead"`, otherwise `L + 2 × T / 5` at 60 or more, `now` from 10 to below 60, and `null` below 10.
  - `resurrect`: always `{ ok: true, policyData: { lastContactAt: now } }`.
  - Imports only types from `@decay-engine/engine`. No clock, no randomness, no side effects.
  - `policy.test.ts`, `autopsy-sentences.ts`, the engine and the shell were not touched.
- **What I changed by hand**: nothing in the code. I reviewed the file against Requirements 1 to 4 line by line (outside Kiro) and fixed the stale "hand-written" paragraph in design section 2, which Kiro had pointed out. The `check-policy-on-save` hook (which should fire when an agent saves `policy.ts`) was not seen firing in Kiro's report; that is still unconfirmed.
- **What went wrong or surprised me**:
  - **Stale text in design.md**: section 2's intro still says `policy.ts` is "Hand-written by the developer" and that Kiro never edits it. Tasks.md 0.2, requirements and `authorship.md` say Kiro writes it. The formulas do not conflict; only that paragraph is out of date.
  - **One order choice, to confirm**: Requirement 3.1 (health 60 or more) and 3.3 (state dead) overlap if a dead item ever had health 60 or more. The code checks `state === "dead"` first, so a dead item is never due.
  - Kiro's shell printed nothing again. Saving the typecheck output to a file and reading it back worked: `tsc --noEmit`, exit 0.
- **Verification (in WSL)**: Ghosted typecheck clean (Kiro, through the file). Tests (mine, in WSL): 5 `it.todo` and nothing else at the time, as expected. After that I tested the policy through the real engine with a temporary test (since deleted): `checkPolicy` passes, exactly 60 on day 36, weak on day 37, exactly 10 and still weak on day 81, dead on day 82, a text on day 45 gives 90 and fades again on day 72, and a reconnect gives health 100. Later, in Session 29, I broke the policy nine ways and the real tests caught eight (the ninth was an equivalent mutant).
- **Credits used**: 5.64 (2 min 34 s)
- **Screenshot**: (add file names)

---

## Session 21: Ghosted steering, requirements, design and tasks (Nov 20, 2026; catch-up entry)

Written after the fact for the sessions that came before Session 20, from Kiro's own end-of-session reports. Credits are the "Est. Credits Used" Kiro showed after each step. Reviews marked *outside Kiro* were done by Claude Code in WSL (no Kiro credits); they are not Kiro work and are listed so the write-up does not claim them.

- **Goal**: build the Ghosted spec the same way as the two earlier specs (requirements, then design, then tasks), one stage at a time with a review round between stages, and add Ghosted steering first.
- **Kiro feature used**: spec-driven development (requirements, design, tasks), steering (`ghosted.md`, `fileMatch`), hooks (the scaffold hook, see below), chat.

### What Kiro produced, step by step

| Step | Credits | Time | Result |
|---|---|---|---|
| Ghosted steering | 3.12 | 2 min | `.kiro/steering/ghosted.md`, 44 lines, `inclusion: fileMatch` on `apps/ghosted/**`. Front matter checked against kiro.dev/docs/steering |
| Requirements, attempt 1 | 7.01 | 7 min | Cancelled before any file was written (see conflicts below) |
| Requirements, attempt 2 | 7.95 | 4 min | `requirements.md`: 31 requirements, glossary, type contract, 12 properties |
| Requirements, correction round | 5.41 | 2 min | Added Requirement 32 (app runs and is checked), 19.6 / 20.8 / property 13 (started dark), `2 × T / 5` in 3.1 |
| Design, attempt 1 | 6.75 | 2 min | Stopped: the `#[[folder:...]]` references did not load, so Kiro read files by hand and used its context before writing anything |
| Design part 1 (sections 1 to 3) | 13.52 | 6 min | Architecture, policy contract table, shell additions with real line numbers |
| Design part 2 (sections 4 to 6) | 24.81 | 10 min | Components, window art, a 12-person sample table with the arithmetic |
| Design part 3, attempt 1 | 13.06 | 4 min | Cancelled after the amendments; part 3 not written |
| Design part 3 (sections 7 to 9) | 10.88 | 5 min | Testing strategy, the engine-unchanged script, error and accessibility notes, 13 correctness properties |
| Tasks | 14.62 | 6 min | `tasks.md`: groups 0 and A to F, every requirement 1 to 32 in at least one task (checked with a script) |

Spec stage total: 107.13 credits (3.12 + 7.01 + 7.95 + 5.41 + 6.75 + 13.52 + 24.81 + 13.06 + 10.88 + 14.62), not counting Sessions 19, 20 or 22.

### Corrections that came out of the review rounds

- **Conflicts Kiro found by reading the real code, before any file was written (requirements attempt 1)**: the engine always sets health to 100 on resurrect (the wireframe showed 70); `100 × (1 − elapsed / T)` gives 9.999999999999998 on day 81, so a person would die a day early (the form `100 × (T − elapsed) / T` gives exactly 10); `engine.edit` never changes `policyData`, so editing the last contact date would do nothing; the shell's time machine stops at 60 days and Triage offers 5 / 10 / 20 minutes; the autopsy chart only marks right and wrong; backup, restore and import live in Study Dungeon, not in the shell; "No reply yet" needs an event kind the policy does not have. These became decisions in the requirements.
- **Requirements, attempt 2**: Kiro corrected its own wrong example (a text on day 45 gives 90 and fades again on day 72, not day 54).
- **Correction round**: I added Requirement 32 because nothing said Ghosted had to run in `scripts/check.sh`; I asked for the started-dark case because the engine records "created" and "died" at the same instant, so an autopsy would say "0 days"; Kiro found that `0.4 × T` and `2 × T / 5` give identical results for every rhythm from 1 to 365 days, so the change is exactness by construction, not a fix.
- **Design part 1 open issues, decided by me**: autopsy dialog focus (add an optional prop in the shell), the counters show the list name rather than the state word (amend 16.1), imported people get importance 2 and 10 minutes, and `initialBudget` keeps today's behaviour when no list is given.
- **Design part 2 error caught after the fact**: the sample table's expected values in 6.3 treated a death on a whole day as on that day. The engine dates a crossing up to one minute after it happens, and health exactly 10 is still weak, so Grace is not in the 30-day forecast and the dock markers fall just after the day. Kiro spotted this while planning part 3; I fixed section 6.3.
- **Tasks**: Kiro moved four tests next to the code they test (properties 10, 11, the app half of 12, and the sample expectations), because in group C they would have failed the checkpoint. I accepted that.

### Checks done outside Kiro

- I recomputed all 12 sample people from the Requirement 1 to 4 formulas with my own script, not Kiro's. States, orders (fading, empty windows, still lit) and the 30-minute Triage picks (Dan and Meera, 193.74) all matched. That check did not catch the one-minute point above.
- I reviewed the shell allowed list in design 8.2 and added `shell.css`.

### What I changed by hand

- Gated the scaffold hook (see below) and removed its `matcher`.
- Settled the open issues listed above and wrote the corrected section 6.3.
- Bundled the fonts in Study Dungeon (`@fontsource`), raised its test timeout to 20 seconds (three App tests timed out at random under load), fixed the README forecast line and Study Dungeon requirement 4.1, and put `docs/KIRO_LOG.md` in `.gitignore`.
- Recorded the approval commit: `57b2783` in `.kiro/specs/ghosted/approved-commit.txt`.
- Decided that Kiro writes `policy.ts` for Ghosted, as a documented exception (see Session 20 and `authorship.md`).

### What went wrong or surprised me

- **The scaffold hook fired on every prompt.** Kiro said it fired on the steering request, which never mentioned scaffolding. The docs (kiro.dev/docs/hooks) document `matcher` only for tool and file events, not for prompt submit, so `scaffold.*policy` never filtered anything. The IDE cannot create a new manual hook either. Fix: the hook's instructions now start with a gate that does nothing unless the prompt asks for a scaffold. I had also been adding "do not run the scaffold hook" to prompts as a workaround, which was a patch rather than a fix.
- **Folder references in prompts do not load.** `#[[folder:...]]` failed, so design attempt 1 spent its context reading files one by one. Splitting the design into three parts with plain file paths worked. Two attempts were cancelled (about 20 credits).
- **File-save hooks fire for agent-made changes only** (kiro.dev/docs/hooks/types). The `check-policy-on-save` hook watches `policy.ts`, which until Session 20 nobody but me edited, so it may never have fired.
- **Study Dungeon source files were rewritten under me** (the attribution comments, "Claude" replaced by "-" in 45 files). I left them as they are.
- Kiro's shell printed nothing for some commands again.
- **Credits used**: 107.13 for this session (table above).
- **Screenshot**: (add file names: the steering file with its front matter, the requirements and design files, the hook panel)

---

## Session 22: Ghosted shell addition, task 1.1 TimeMachine range and jumps (Nov 20, 2026)

- **Goal**: add optional `maxDays` and `jumpDays` props to the shell's `TimeMachine` (Requirement 26, design 3.1), with today's behaviour as the default.
- **Kiro feature used**: spec task, steering.
- **What Kiro produced**:
  - `packages/shell/src/components/TimeMachine.tsx`: `maxDays` is used only if it is a positive whole number (0, −1, 1.5 and NaN fall back to 60); the range sets the slider maximum, Play's end and every clamp including the one on `onChange`; one jump button per `jumpDays` entry in order, clamped to the end. Exported constants and the step and Play timings are unchanged.
  - `packages/shell/src/components/TimeMachine.range.test.tsx`: 17 tests (a 365-day range with jumps of 30, 90, 180 and 365; the exact offset of each jump; clamp with a jump of 400; Play ending at 365, half-way at 182.5; reduced-motion Play; the fallbacks; the defaults).
  - No existing test file, `packages/engine` or anything else was changed.
- **Verification (in WSL, outside Kiro)**: `bash scripts/check.sh` passed: engine 701, shell 121 (104 before, plus 17), Study Dungeon 465. Kiro could confirm only the shell tests and both typechecks; its run of the Study Dungeon tests did not finish, so that confirmation is mine.
- **What I changed by hand**: nothing.
- **What went wrong or surprised me**: Kiro's shell lost the Study Dungeon test run, as in earlier sessions.
- **Credits used**: 10.82 (2 min 48 s).
- **Screenshot**: (add file names)


---

## Session 23: Ghosted shell addition, task 1.2 TriagePanel budget choices (Nov 20, 2026)

- **Goal**: add optional `budgets` and `defaultBudget` props to the shell's `TriagePanel` (Requirement 27, design 3.2), with today's behaviour as the default.
- **Kiro feature used**: spec task, steering.
- **What Kiro produced**:
  - `packages/shell/src/components/TriagePanel.tsx` (34 lines added, 5 removed): `budgets` and `defaultBudget` props; `choices`, `fallback` and `initial` taken from the design's code block. With no list (or an empty one) the panel behaves as before, including the old quirk that an `initialBudget` outside 5 / 10 / 20 still runs triage while 10 stays selected. `TRIAGE_BUDGETS` is still `[5, 10, 20]`.
  - `packages/shell/src/components/TriagePanel.budgets.test.tsx` (14 tests): the list 15, 30, 60, 120 with custom; the default choice (first, `defaultBudget`, or the first when `defaultBudget` is not in the list); `initialBudget` in and out of the list; the custom limit; the no-list defaults.
  - No existing test file, engine file or Study Dungeon file was touched.
- **Verification (in WSL, outside Kiro)**: shell tests 135 pass (121 plus 14). Kiro could not finish the Study Dungeon run in its shell; mine passed: 465.
- **What I changed by hand**: nothing in this task.
- **What went wrong or surprised me**: while checking this task, my first `check.sh` run showed Study Dungeon tests taking 100 to 130 seconds each and some failing, and a second run was killed (exit 137). The load average had reached 38 on a 12-core, 3.5 GB machine, from my run overlapping Kiro's own test runs and 12 Vitest workers. With nothing else running, the same suite passed in 30 seconds with 4 workers. Fix: `maxWorkers: 4` in Study Dungeon's Vite config.
- **Credits used**: 7.58 (2 min 39 s).

---

## Work outside Kiro on Nov 20 (not a Kiro session)

Listed so the write-up does not count it as Kiro work. Done by Claude Code in WSL, with no Kiro credits.

- **Engine-unchanged check, replaced.** The design's check recorded an approval commit in a file. That file was dropped as fragile (commits were undone and the recorded hash left the branch). The new `scripts/check-engine-unchanged.sh` works the "before" state out from git history (the parent of the first commit that added anything under `.kiro/specs/ghosted`; HEAD if none; skipped on a shallow clone). It checks that `packages/engine` is unchanged and that `packages/shell` changed only in the files Requirements 26 to 28 allow. I tested it on the real repository (passes) and on three planted violations (an engine edit, an untracked engine file, an edited existing shell test), each of which fails it. It is wired into `scripts/check.sh`. Requirement 29, design section 8 and tasks 0.1, 1.5, 2.10 and 6.1 were rewritten to match. The script was written outside Kiro, and task 2.10 now only adds the Ghosted steps.
- Independent review of the policy against Requirements 1 to 4 and a temporary test (since deleted) on the real engine: `checkPolicy` passes, boundaries at day 36 / 81 / 82, the text on day 45, and a reconnect.
- The test-stability fixes above, and the catch-up log entries.

---

## Session 24: Ghosted shell additions, tasks 1.3 and 1.4 AutopsyDialog markers and focus (Nov 20, 2026)

- **Goal**: add contact markers and a focus-on-content prop to the shell's `AutopsyDialog` (Requirement 28, design 3.3), with today's behaviour as the default; close Group A (task 1.5).
- **Kiro feature used**: spec tasks, steering. Two tasks in one run, as grouped runs were planned.
- **What Kiro produced**:
  - `AutopsyDialog.tsx`, `types.ts`, `index.ts`: a new exported `AutopsyMarker` (time, kind, label) and four optional props, `markers`, `renderMarker`, `markerSummary` and `focusContentOnOpen`. With `markers`, each marker in the chart's span is drawn as a `data-marker` group, the legend keeps weak and dead and adds one entry per kind, the right/wrong marks and legend are dropped, and the summary carries the app's `markerSummary` text. Without `markers` the markup and the summary object are exactly as before. With `focusContentOnOpen`, the title gets `tabindex="-1"` and takes focus after `showModal()`.
  - `AutopsyDialog.markers.test.tsx` and `AutopsyDialog.focus.test.tsx`: 16 new tests (order and positions of call, text and meet-up markers, none outside the span, the legend, the "3 calls, 2 messages, 1 meet-up" summary, the default circle, an empty list, the unchanged defaults; the focus prop on, off and omitted).
  - No existing test file, engine file, Study Dungeon file or script was touched.
- **Verification (in WSL, outside Kiro)**: `bash scripts/check.sh` passed: engine unchanged ok, engine 701, shell 151 (135 plus 16), Study Dungeon 465, builds ok.
- **What I changed by hand**: nothing in the code. I amended Requirement 28 (1 to 3) so that `markers` is the switch (as the design already had it) and the legend lists only kinds that have a marker inside the span.
- **What went wrong or surprised me**:
  - Kiro read the requirement ("no renderer given: as today") and the design (the `markers` prop is the switch) as different, flagged it, and followed the design. The requirement was the wrong one.
  - Its closing message still gave the old `approved-commit.txt` command for the Group A checkpoint, after tasks 1.5 and the design had been rewritten without that file: stale context.
  - It ran an empty `true` command by mistake in a session where I had said not to use the terminal. It changed nothing.
  - The legend lists a kind even when all its markers fall outside the span (count 0); fixed in the next run.
- **Credits used**: 12.86 (4 min 11 s).

---

## Session 25: Ghosted app skeleton, tasks 2.1 to 2.5, plus the legend fix (Nov 20, 2026)

- **Goal**: the legend fix from amended Requirement 28.3, then the first half of Group B: package, Vite entry, fonts and tokens, wording and time helpers, and the modules copied from Study Dungeon (engine instance, storage errors, write guard, ticking, first-run flags). Five tasks in one run.
- **Kiro feature used**: spec tasks, steering.
- **What Kiro produced**:
  - Shell: the legend lists only kinds with a marker inside the chart's span (`AutopsyDialog.tsx`), with a new test.
  - `apps/ghosted/`: `package.json` (React, the shell, four `@fontsource` packages, fast-check and the test libraries; plus `vite` and `@types/node`, which the task did not list), `tsconfig.json`, `vite.config.ts` (jsdom, 20-second timeout, base "/"), `index.html` (no remote URLs), `styles/tokens.css`, `styles/global.css`, `theme.ts`, `wording.ts`, `time.ts` and its test, and the copied `engine-instance.ts`, `storage-errors.ts`, `write-guard.ts` (plus `runGatedWrite`), `ticking.ts`, `first-run.ts`, `test/fake-storage.ts`, each with a header naming its Study Dungeon source and its own tests. None imports from `apps/study-dungeon`.
  - Where the spec gave no text, Kiro wrote the wording itself ("Moon clock", "Play the year", "Plan"), and listed it for me to change.
- **Verification (in WSL, outside Kiro)**: Ghosted typecheck clean; Ghosted tests 61 passed plus 5 `it.todo`; shell 152 (151 plus 1); full `check.sh` passed with the engine check ok. No remote URL anywhere in the app; the only "study-dungeon" strings are storage keys in tests that check reset leaves other apps' data alone.
- **What I changed by hand**:
  - Deleted the scaffold `skin.css` (Kiro's file tools cannot delete files and I had told it to stay off the terminal).
  - Added `apps/ghosted/src/vite-env.d.ts`: without it the Ghosted typecheck failed on the shell's CSS imports. The spec and design did not list it.
  - Added `maxWorkers: 4` to `apps/ghosted/vite.config.ts`, as in Study Dungeon.
  - Ran `pnpm install` (Kiro cannot).
- **What went wrong or surprised me**:
  - The typecheck failure above: a gap in my spec, not in Kiro's work.
  - `index.html` points at `/src/main.tsx`, which arrives in task 2.8, so `vite build` fails until then.
  - Kiro could not delete a file and said so instead of working around it.
- **Credits used**: 34.48 (8 min 29 s).

---

## Session 26: Ghosted tasks 2.6 to 2.11, first attempt, cancelled (Nov 20, 2026)

- **Goal**: the rest of Group B in one run (person form rules, backup and import copies, Root and the App frame, boundary checks, the Ghosted steps in `check.sh`).
- **What Kiro produced**: nothing. It read parts of `tasks.md` and `design.md` and made no file changes.
- **What went wrong**: Kiro's file-read tool failed on this workspace's path, so it fell back to its shell, and `execute_bash` errored seven times. I cancelled the run. The prompt had not told Kiro to stay off the terminal, which the two earlier runs had. Fix for the next attempt: the run is split in two, the prompt says to read only through file references and file tools, and a tool that fails twice means stop and report.
- **Credits used**: 1.95 (1 min 15 s).

---

## Session 27: Ghosted tasks 2.6 and 2.7, person form rules, copied backup and import (Nov 20, 2026)

- **Goal**: the form validation rules and the backup and import modules (Requirements 17 and 21), with no React components yet.
- **Kiro feature used**: spec tasks, steering. First run with the terminal forbidden in the prompt, after Session 26's `execute_bash` failures.
- **How it went**: Kiro stopped before writing anything and asked eight questions the spec left open (what `PersonFormInput` holds, trimming, what counts as a whole number, what "not later than today" means, the rule sentences, how an import line leaves out the relationship, the backup refusal sentences). Each came with a proposal. I accepted all of them, and for the relationship chose positional fields ("Mira | | 30"), so "Mira | 30" is skipped with a clear reason. Asking instead of guessing is what the steering and the prompt told it to do, and it is why the spec's gaps now show up in the log.
- **What Kiro produced** (all in `apps/ghosted/src/`): `person-form.ts` (limits, `validatePerson`, `startsDark`, which calls the policy's own `init` and `healthAt` rather than repeating the formula) and its test; `backup.ts` (`{ app: "ghosted", version: 1, exportedAt, snapshot }`, five refusal reasons, restore checked by building a real engine) and its test; `import-people.ts` (`|`, tab and CSV, positional fields, bad lines skipped with reasons, importance 2 and 10 minutes) and its test; `wording.ts` extended with the rule and refusal sentences and the import help text. No dependencies added.
- **Verification (in WSL, outside Kiro)**: Ghosted typecheck clean; Ghosted tests 101 passed plus 5 `it.todo` (40 new); no import from Study Dungeon.
- **What I changed by hand**: nothing in the code.
- **What went wrong or surprised me**:
  - Kiro made one choice the spec does not cover, and said so: a line with more than four fields is skipped with a reason, and empty trailing fields are fine. I accepted it.
  - A skipped line's reason holds only the reason; the import dialog (task 5.3) adds "Line N: ".
  - Kiro's steering file still asks it to log each session, which I overrode in the prompts, so these entries are written from its reports.
- **Credits used**: 18.25 in total: 4.69 (1 min 26 s) for the round where Kiro asked its eight questions, plus 13.56 (5 min 24 s) for writing the files. The earlier cancelled attempt is Session 26 (1.95).

---

## Session 28: Ghosted tasks 2.8 to 2.10, Root and App frame, source checks, check script (Nov 20, 2026)

- **Goal**: finish Group B: the Root and crash screen, the App frame, `main.tsx`, the source-check tests and the Ghosted steps in `scripts/check.sh`. Three tasks in one run, with the terminal forbidden in the prompt.
- **Kiro feature used**: spec tasks, steering. Kiro again stopped first and asked twelve questions (what the frame renders, where `SessionFlagStorage` lives, crash-screen wording, button styling, font weights, fixture names, how each source check matches, where the three `check.sh` steps go), each with a proposal. I answered yes to all, with one adjustment (it may update the comment lines in `check.sh`).
- **What Kiro produced** (`apps/ghosted/src/`): `Root.tsx`, `components/ErrorBoundary.tsx`, `styles/problem.css`, `components/useModalDialog.ts`, `main.tsx` (the approved font weights), `App.tsx` (the frame: props, `now` and preview state, `runGatedWrite` through a ref, settle ticks, the dialog union, a live region, header, main and a dock slot, no placeholder behaviour), `splash.ts` (only the `SessionFlagStorage` type), `test/fixtures.ts`, `test/recording-adapter.ts`, `test/source-files.ts` (a helper not in the task list), `Root.test.tsx`, and the source checks `shell-boundary.test.ts`, `app-boundary.test.ts`, `no-network.test.ts`, `config.test.ts` and `check-script.test.ts`. Each source check builds its patterns from pieces so it cannot match itself, and first proves it catches a planted example. `wording.ts` gained `problemScreenText`. In `scripts/check.sh` it added the three Ghosted steps after "build app" and updated the header comment; no executable line changed.
- **Verification (in WSL, outside Kiro)**: after one fix (below), the full `bash scripts/check.sh` passed: engine unchanged ok, engine 701, shell 152, Study Dungeon 465, Ghosted 128 passed plus 5 `it.todo`, both builds ok (Ghosted 1.1 MB).
- **What I changed by hand**: one line of `test/source-files.ts`. Five of the new tests failed with "The URL must be of scheme file": in the jsdom test environment `new URL(...)` is jsdom's own URL class, which Node's `fileURLToPath` rejects. Passing the plain string `import.meta.url` fixed it.
- **What went wrong or surprised me**:
  - The jsdom URL failure above: Kiro could not have seen it without a terminal.
  - Kiro could only read shell files that `index.ts` exports (no folder listing without a terminal); it said so, and the test itself reads the whole shell tree, so it covers the rest.
  - The problem card uses the shell's hard `0 6px 0 #000` shadow, which task 5.9's token test may flag.
- **Credits used**: 32.52 in total: 8.97 (2 min 35 s) for the round where Kiro asked its twelve questions, plus 23.55 (6 min 33 s) for writing the files.

---

## Work outside Kiro, later on Nov 20 (not a Kiro session): the Ghosted cause-of-death sentences

- **Task 0.3** was planned as hand-written by the developer. At the developer's request I (Claude Code, Sonnet 5.5, in WSL) wrote `apps/ghosted/src/autopsy-sentences.ts` instead. No Kiro credits were used, and Kiro never edits the file; it writes its tests (task 3.6).
- **What it does**: `generateCauseSentences(report, payload, { timeZone, locale })` returns the cause first ("After the last call there was no contact for 81 days, about 2.7 times your usual rhythm."), then the supporting facts (when it started fading, when it went dark, the last contact and its kind, how many contacts and of which kinds, how many times it had been lit again) and a closing line that the light shows how recently you were in touch, not how much anyone matters. A person added already dark gets "Already dark when added: no contact for N days, about X times your usual rhythm." with N measured from `payload.lastContactAt` and never below 1 (Requirement 19.6). Never tended and resurrected-with-no-contact lives have their own first sentence.
- **Checks**: typecheck clean. A temporary test (since deleted) built real engine reports for a normal death, a death after a text, a never-tended person, a person who was lit again, and a started-dark person, and I read the sentences. A 200-run property check on started-dark people (rhythm 1 to 365 days, gaps just past 2.7 rhythms up to years) found the sentences always contain the floored day count and never "0 days" or a banned phrase.
- **Records updated to match**: `authorship.md` (new section), the Ghosted requirements, design and tasks (0.3 and 0.4 ticked), `ghosted.md` steering, the README.

---

## Session 29: Ghosted tasks 3.1 to 3.5, policy tests and properties (Nov 20, 2026)

- **Goal**: test the Ghosted policy: generators, a generator coverage check, unit and outcome tests, Properties 1 to 9, and Property 12 at the gate.
- **Kiro feature used**: spec tasks, steering, property-based testing (fast-check). The run did not stop to ask questions this time; it made three small choices the spec leaves open and listed them.
- **What Kiro produced** (`apps/ghosted/src/`): `test/generators.ts` (people built by replaying a real engine with `ghostedPolicy`, every time T0 plus whole minutes), `generator-coverage.test.ts` (each state at least 10% of 300 people, each contact kind at least 10% of steps, time order and gaps, seeds 42, 7, 9, 11), `policy.properties.test.ts` (Properties 1 to 9, `numRuns` 100 to 300), `write-guard.properties.test.ts` (Property 12 at the gate, 1000 runs), and `policy.test.ts` with each of the five `it.todo` stubs replaced by a real test (contract through `checkPolicy`, every function, and every row of the outcome table through the engine, with exact values worked out from the formula, not copied from the policy).
- **Verification (in WSL, outside Kiro)**: Ghosted typecheck clean; Ghosted tests 186 passed, no `it.todo` left; full `bash scripts/check.sh` passed.
- **Mutation check (mine, outside Kiro)**: to see whether the tests can fail, I broke `policy.ts` nine ways, one at a time, and restored it afterwards. Eight were caught: text adds 30 instead of 40 (4 tests failed), decay from `item.lastEventAt` (18), dead threshold 9 (8), no clamp on negative elapsed (4), reconnect keeps an old contact date (6), `nextDueAt` null at exactly health 10 (1), text not capped at 100 (3), `healthAt` scaled by `item.health` (8). The ninth, `h >= 60` to `h > 60` in `nextDueAt`, survived, and it is an equivalent mutant: at exactly 60 both return `now`. No property found a bug in the policy.
- **What I changed by hand**: nothing in the code.
- **What went wrong or surprised me**:
  - The `#[[file:...]]` references did not load as written this time; Kiro read the files by their full WSL path and said so.
  - The three choices the spec did not make (all small): the gap range for `startedDark()` (from `floor(2.7 × rhythm) + 1` days up to three rhythms more), whole minutes for the starting last contact, and two extra helpers in `generators.ts` (`scenarioTimes`, `scenarioPayload`).
  - No property failed, so there is still no "PBT found a real bug" story. The honest claim for the write-up is: property-based tests designed from the spec, a generator coverage check against vacuous properties, and mutation-checked.
- **Credits used**: 20.67 (8 min 5 s).

---

## Session 30: Ghosted tasks 3.6 and 4.1 to 4.3, sentence tests, window art, person card and the three lists (Nov 20, 2026)

- **Goal**: test the cause-of-death sentences (task 3.6), then the first UI: state glyphs and window and house art (4.1), the person card (4.2), and the three lists with section navigation (4.3). Four tasks in one run.
- **Kiro feature used**: spec tasks, steering, property-based testing (Properties 10, 11 and 13).
- **What Kiro produced** (`apps/ghosted/src/`): `autopsy-sentences.test.ts` (facts, rules and exact sentences for three fixed reports) and `started-dark.test.ts` (Property 13, 100 runs); `lists.ts` and its test; `components/icons.tsx`, `Window.tsx`, `House.tsx`, `PersonCard.tsx`, `ThreeLists.tsx` with their tests, `Window.property.test.tsx` (Property 10) and `PersonCard.property.test.tsx` (Property 11); `styles/window.css`, `street.css`, `motion.css`, `layout.css`; `test/css.ts` and `test/dom.ts` (helpers that read the CSS for motion, widths and 44px targets, since jsdom cannot measure); `App.test.tsx`; and the section nav and three lists wired into `App.tsx`. `wording.ts` gained the card and list strings. It worked out the expected sentences by hand from the function and the engine's dates, since it had no terminal.
- **Choices beyond the spec, which I accepted**: Still lit rows show a small window (Requirement 16.1 asks for light, glyph and word everywhere); the "Street" entry in the nav does nothing until task 4.4; Property 11 covers the card now and the Street window later; `ThreeLists` has an extra `formatDate` prop; boarded-up glyphs use `--rust` as design 5.2 says, not the wireframe's `--dark`.
- **Verification (in WSL, outside Kiro)**: the first run showed 5 TypeScript errors and 2 failing tests; after my fixes below, Ghosted typecheck clean, 270 tests passed, and the full `check.sh` passed.
- **What I changed by hand**:
  - `PersonCard.test.tsx`: an explicit return type on the `actions()` helper (`PersonActions & Record<..., Mock>`) did not type-check against Vitest's mock type. I removed the annotation so TypeScript infers it.
  - `ThreeLists.tsx`: **a real accessibility bug.** The Open button's accessible name came out as "OpenPriya Raman" with no space, because the space was the first character inside the visually hidden span. Two tests (written by Kiro) caught it. The space is now outside the span.
  - `wording.ts`: the wireframe's "Dark for too long." (Kiro flagged it) became "These windows went dark." because "too long" judges the user.
- **What went wrong or surprised me**:
  - Kiro ran one shell command (`echo skip`) by mistake in a no-terminal run; it changed nothing.
  - Kiro could not run anything, so a type error and an accessible-name bug reached my checkpoint. The tests did their job: they found the bug.
  - This was the biggest run so far.
- **Credits used**: 77.5 (21 min 2 s).

---

## Session 31: Ghosted tasks 4.13, 4.4, 4.5 and part of 5.4, sample data, the Street, the Hero and first run (Nov 21, 2026)

- **Goal**: the 12-person sample street (4.13), the Street (4.4), the Hero (4.5) and the first-run wiring (5.4), so the app can be seen working. Four tasks in one run, with the terminal forbidden in the prompt.
- **Kiro feature used**: spec tasks, steering, tests built from the spec's tables.
- **What Kiro produced** (`apps/ghosted/src/`): `sample-data.ts` and `sample-data.test.ts` (the 12 rows of design 6.2, every row of 7.5, crossings compared within one minute); `street.ts`, `components/Street.tsx` (houses by relationship, "Others" last, legend, moths, fog and headlights only inside the reduced-motion block) and tests; `components/Hero.tsx` (five cases, one filled button each, the shell `Counters` with glyphs and list names) and its test; `components/PrivacyLine.tsx` and its test; `App.first-run.test.tsx`; and the wiring in `App.tsx`. With no people the app shows only the hero and the privacy line.
- **Where Kiro stopped, and what I decided**:
  - **Reset all data** needs `ConfirmDialog` (task 4.6): leave it until 4.6, with a note there.
  - **Splash cases** need the splash (4.14): a note there.
  - **Privacy line after add, import and restore** needs 4.10 and 5.3: notes there.
  - Task 5.4 stays unticked, with those notes added to tasks.md.
- **One reading of the spec, accepted**: design 7.5 gives the Triage values to three decimals and asks for "within 1e-6", which can never pass for Dan (101.1358…). Kiro tested within 1e-6 of the exact value and within 5e-4 of the printed number, and changed no expected value.
- **Verification (in WSL, outside Kiro)**: this time the first run was clean: Ghosted typecheck, 327 tests passed, and the full `check.sh` passed.
- **A look at the real page (mine, outside Kiro)**: I started the Ghosted dev server and took screenshots with the cached Chromium at 1280 and 390 px, next to the approved wireframe. Both widths load with no sideways scroll, "Load sample street" works, and the sample street shows 4 lit, 4 fading and 4 empty, as the table says. It matches the wireframe's structure and colours. Flaws seen: the state words under the Street windows wrap mid-word ("flickeri / ng" and "boarded / up"); the person cards wrap "History" onto a second row; the header is still a plain "Ghosted" (the neon sign and splash are task 4.14); no dock yet (5.1). The only console message is one 404, probably the favicon.
- **What I changed by hand**: nothing in the code.
- **What went wrong or surprised me**: Kiro again ran two shell commands by mistake (`ls`, `echo skip`) in a no-terminal run; harmless. Without a terminal it could not catch layout problems, which a real page showed immediately.
- **Credits used**: 55.09 (17 min 28 s).

---

## Session 32: Ghosted two layout fixes and tasks 4.6 to 4.9, the dialogs (Nov 21, 2026)

- **Goal**: fix two layout flaws found by looking at the real page (the Street's state words broke mid-word, the person cards wrapped "History" onto its own row), then build the confirm dialog with reset, the person dialog, the Reach out dialog and the Reconnect dialog (tasks 4.6 to 4.9). Terminal forbidden in the prompt.
- **Kiro feature used**: spec tasks, steering.
- **What Kiro produced** (`apps/ghosted/src/`):
  - **Layout**: the Street words broke because `.gh-app` sets `overflow-wrap: anywhere` and every label inherited it; labels now reset it and wrap only at the space (window columns 88 px, so "flickering" fits even at 320 px). Card buttons: the primary has its own row and the quiet buttons share the next row at equal widths (three in one row from 264 px, four always two by two, 44 px minimum). Each fix has a CSS-source test.
  - **Dialogs**: `components/ConfirmDialog.tsx`, `ResetData.tsx` (reset removes exactly `RESET_KEYS`, then reloads), `PersonDialog.tsx`, `ReachOutDialog.tsx` (three real choices with "Freshness a → b" from the policy's own `applyEvent`), `ReconnectDialog.tsx` (boarded window, three options, boards fall and the window relights; no "No reply yet"), a test for each, `styles/dialogs.css`, and `test/dialog-polyfill.ts` (copied). The reset cases were added to `App.first-run.test.tsx`.
- **Choices beyond the spec, accepted**: `ResetData` keeps its own confirm state, so the App's `{ kind: "reset" }` dialog type is unused; extra props (`formatDate`, `focusHeading`); outlined rust confirm buttons; Reconnect calls `onWrite` even when the engine refuses, because the engine still saves the failed attempt. Wording Kiro invented: "What did you do to reach <first name>?", "Reach out to <name>", "Reconnect with <name>". One text it flagged as reading oddly ("Reach out again by <today>" after a text leaves someone still flickering) is still open.
- **Verification (in WSL, outside Kiro)**: Ghosted typecheck clean; the first run had 1 failing test of 375; after my fix, 376 passed, and the full `check.sh` passed.
- **What I changed by hand**: one test, `ReconnectDialog.test.tsx`. It asserted that no timers are pending after the pick, but React's own scheduler holds timers under the fake clock (the count was 2 before the click and the click adds one), so the assertion was about React, not the component. It now checks that the end state is on the page without advancing any timer, plus a source check that `ReconnectDialog.tsx` itself schedules no `setTimeout`, `setInterval` or `requestAnimationFrame`.
- **Looked at the real page (mine, outside Kiro)**: new screenshots at 1280 px with the Chromium cache. Both layout fixes worked (state words on one line; Reach out on its own row with Edit, Remove and History below). I opened the dialogs: focus lands on the dialog's question (not a button); Reach out shows "Freshness 28 → 68" for a message and "28 → 100" for a call or meet-up; Reconnect relights the window and the page behind it updated (5 lit, 3 empty). Freshness is shown floored (28 for 28.89).
- **What went wrong or surprised me**: two more mistaken shell calls (`echo skip`, `true`), harmless. Kiro again could not run anything, so one test was wrong in a way only a run showed.
- **Credits used**: 82 (21 min 57 s).

---

## Session 33: Ghosted tasks 4.10, 4.12, 4.11 and 4.14, Add and Edit, Triage, autopsy, splash and neon sign (Nov 21, 2026)

- **Goal**: finish Group D: the Add and Edit dialog (4.10), the Triage wrapper and session (4.12), the autopsy with its chart (4.11), and the splash and neon sign (4.14). Four tasks in one run, terminal forbidden.
- **Kiro feature used**: spec tasks, steering.
- **What Kiro produced** (`apps/ghosted/src/`): `components/AddEditPersonDialog.tsx`, `GhostedTriage.tsx`, `PersonAutopsy.tsx`, `NeonSign.tsx`, `Splash.tsx`, `autopsy-chart.ts`, `styles/sign.css`, `App.session.test.tsx` (the Triage session opens the Reach out dialog for each pick) and a test file for each new module, plus the wiring in `App.tsx`, `wording.ts` and `splash.ts`. The Add dialog applies the form rules, shows "This window starts dark" before saving when `startsDark` says so, and shows the last contact read-only when editing. The autopsy uses the shell's `AutopsyDialog` with call, message and meet-up markers, focus on the content, and the sentences from `autopsy-sentences.ts`; Reconnect is disabled in a preview. The splash lights six windows one by one, then the Monoton sign and "Walk in"; once per tab, skipped under reduced motion.
- **Decisions beyond the spec, accepted**: the Edit dialog takes `lastContactAt` (the last logged contact, the date the card shows, since the add date would be wrong after any contact) and `relationships` (for the tag list); the Add form defaults are importance 2, 10 minutes and today's date; the splash is marked seen as soon as it shows; where `matchMedia` does not exist (jsdom) the default is no splash, so existing App tests do not open one; the splash's light-up uses `animation-fill-mode: both` instead of the design's `forwards`, which would have shown every pane lit during its delay.
- **Where Kiro stopped**: one existing assertion would now fail (Start empty opens the Add dialog, which has its own filled Save, so the hero test saw two filled buttons). Kiro did not edit it and offered two options. I chose the one it recommended: narrow that assertion to buttons outside any dialog, which is what Requirement 8.6 is about.
- **Verification (in WSL, outside Kiro)**: typecheck clean; the one predicted failure of 459 tests; after my one-line change to that assertion, 459 passed and the full `check.sh` passed.
- **What I changed by hand**: that single assertion in `App.first-run.test.tsx`, and I deleted `App.splash-snippet.tmp`, a stray file Kiro created by mistake and could not delete (its file tools cannot delete).
- **Looked at the real page (mine, outside Kiro)**: screenshots at 1280 px. The splash and neon sign match the wireframe; after "Walk in" focus moves to a heading and the sign is the page's one h1; the autopsy of the started-dark person shows a freshness line from the last contact to the day he was added and "Already dark when added: no contact for 370 days, about 3.1 times your usual rhythm."; the Add dialog and the Triage panel work. Cosmetic items for later: the shell's Triage buttons ("Plan", "Start reaching out") and radios use a different font and case from the app's own buttons; the splash tagline shows a focus box because focus is moved there on purpose; the favicon 404 remains.
- **What went wrong or surprised me**: Kiro again could not delete a file it created by mistake, and it flagged an existing test that its change broke instead of editing it, which is the behaviour I asked for.
- **Credits used**: 106.26 (26 min 8 s).

---

## Session 34: Ghosted tasks 5.1, 5.2, 5.3, the moon-clock dock, forecast, backup and import (Nov 21, 2026)

- **Goal**: the dock (5.1), the forecast control (5.2), backup, restore and import controls (5.3) and a cosmetic pass making the shell's own controls match the app's buttons. Terminal forbidden in the prompt.
- **Kiro feature used**: spec tasks, steering.
- **What Kiro produced** (`apps/ghosted/src/`): `timeline.ts` (the dock's markers: start-fading times from the policy's next-due, go-dark times from `engine.forecast`) and test; `components/MoonDock.tsx` (the shell `TimeMachine` with a 365-day range and jumps +30, +90, +180 and +1 year, the moon's shade following `--age`, the preview banner, every write disabled while previewing), `ForecastControl.tsx` (7, 30 and 90 days; the 30-day list for the sample street is Sunita, Meera and Dan, the 7-day list says nobody), `BackupControls.tsx`, `ImportDialog.tsx`, their tests, `styles/dock.css`, `shell-controls-css.test.ts`, and the wiring in `App.tsx`. Import adds people one line at a time through the write gate; if storage fills part-way it keeps what was added and leaves the remaining lines in the box. New `App.test.tsx` cases check that an add, an import and a restore each change the privacy line.
- **Decisions beyond the spec, accepted**: `MoonDock` takes a `timeZone` prop for marker dates; the import dialog shows a storage problem inside itself; `BackupControls` has `timeZone` and `download` props and the App reloads after the restore confirmation; a `.gh-age-dim` layer dims the street as `--age` rises; the backup download link is revoked with a 1-second `setTimeout`, as in Study Dungeon (task 5.9's motion test must not count it).
- **Verification (in WSL, outside Kiro)**: for the first time nothing needed fixing: Ghosted typecheck clean, 530 tests passed, and the full `check.sh` passed on the first run.
- **What I changed by hand**: nothing.
- **Looked at the real page (mine, outside Kiro)**: screenshots at 1280 px, driven by the jump buttons. Today: 4 windows flickering. At +90 days (19 Feb 2027): 2 flickering, the nav reads "Fading 2, Empty windows 10, Still lit 0", the moon is high. At +180 days: "Nobody is fading." At +365 days (21 Nov 2027): a thin crescent moon, every window boarded up, "Empty windows 12". "Back to today" restores the hero. The only visual flaw: the fade and dark markers in the first month overlap in a cluster at the left of the track. One console message, the favicon 404.
- **What went wrong or surprised me**: nothing broke. Kiro's choices were all small and listed.
- **Credits used**: 94.72 (22 min 54 s).

---

## Session 35: Tasks 5.4 to 5.10 and dock marker stagger

- **What I asked Kiro**: finish 5.4 (first run, privacy line), then 5.5 (app-level Property 12), 5.6 (storage errors, crash screen), 5.7 (accessibility), 5.8 (wording), 5.9 (motion, layout, tap targets), 5.10 (README), plus staggering the dock markers.
- **What Kiro did**: wrote the tests and the small changes listed in its report (new files: App.preview.property/App.preview/App.storage-errors/App.accessibility tests, wording, contrast, tokens, motion, layout-css, primary-buttons, dock-stagger tests, test/css-rules.ts; `markerRows` in timeline.ts; row rules in dock.css; smooth scrolling in motion.css; README). It could not run anything (no terminal), so it left the boxes unticked.
- **Kiro stopped for a decision**: the Empty windows count badge (13px, `--dark`) failed AA contrast (3.69 against 4.5). I chose option (a): the badge uses `--dim`; the 26px heading keeps `--dark`. I updated one assertion in ThreeLists.test.tsx to match.
- **My checks (outside Kiro)**: typecheck clean; Ghosted 663 tests pass (32 s); full `check.sh` passes (engine 701, shell 152, Study Dungeon 465, Ghosted 663; engine unchanged). Property 12 at the app level runs in 7.5 s. Kiro's worry that "connection freshness" was never shown on screen: the street note already says it in plain words, so nothing was added.
- **What went wrong or surprised me**: nothing failed on the first real run. The only fix was the badge colour above.
- **Credits used**: 115.63 (28 min 27 s).

---

## Session 36: policy-reviewer agent on Ghosted's policy

- **What I asked Kiro**: "Use the policy-reviewer agent to review the ghosted policy." Read-only.
- **What Kiro did**: reviewed `apps/ghosted/src/policy.ts` against the type contract, the steering and the spec, and ran `policy.test.ts` (44 tests pass, `checkPolicy` returns `{ passed: true, failures: [] }`). It changed no files. Its report had the sections Contract, Purity and time, Spec match, and Tests.
- **Finding**: one minor. `nextDueAt` writes the numbers 60 and 10 instead of reading `thresholds.weak` and `thresholds.dead`. The output is correct today because the spec fixes those numbers (Req 3), so I accepted it as a known minor issue and did not change the Kiro-written policy.
- **Everything else matched** (six members, no async, no clock or randomness, health stays in 0 to 100, tests use a fixed time).
- **What went wrong or surprised me**: the reviewer's first test run printed only "RUN" and it re-ran the tests as a background process to read the result. That matches Kiro's shell trouble in other sessions.
- **Credits used**: 6.2 (3 min 11 s).

---

## Session 37: does the check-policy-on-save hook fire for an agent edit?

- **What I asked Kiro**: a one-time authorised edit: add the comment "// hook test" at the top of `apps/ghosted/src/policy.ts`, then remove it, and report whether a hook fired. No terminal.
- **What happened**: no hook fired. Kiro's edit tool said "Replaced text" and nothing else came back: no `checkPolicy` run and no test output. The line was removed again.
- **My check (outside Kiro)**: `git diff` shows `policy.ts` unchanged. The hook file is valid: trigger `PostFileSave`, matcher `apps/[^/]+/src/policy\.ts$`, enabled. So the matcher is not the cause.
- **Finding**: in my setup this file-save hook did not fire on an edit made by the agent. The likely reason is that it only reacts to saves made by me in the editor. I have not tested a manual save yet.
- **Credits used**: 0.72 (28 s).

---

## Work outside Kiro on Nov 21 (not a Kiro session): 320px dock fix

- **What I did**: opened the app in a real browser (Playwright with Chromium) at 1280, 390 and 320 px as part of task 6.2.
- **What I found**: no horizontal page scroll at any width, but at 390 and 320 px the Moon Clock slider and jump buttons ran off the right edge. The time machine was 592 px wide inside a 210 px column, because its no-wrap jump buttons set its minimum width.
- **Fix**: one line in `dock.css`, `min-inline-size: 0` on `.gh-dock .shell-time-machine`, so the jump buttons scroll inside the dock as the design says. I added `dock-narrow.test.ts` (a CSS source check) and confirmed it fails without the fix. The 5.9 layout tests had missed this because jsdom cannot lay out.
- **After**: only the buttons meant to scroll sideways extend past the edge. Full `check.sh` passes (Ghosted 665 tests). Task 6.1 is ticked. Tasks 6.2 (the rest) and 6.3 are open.

---

## Credits so far (Kiro's own "Est. Credits Used" figures for Ghosted)

| Session | What | Credits |
|---|---|---|
| 19 | Hook, scaffold, policy-reviewer agent | not shown in the pasted reports |
| 20 | Policy (task 0.2) | 5.64 |
| 21 | Steering, requirements, design, tasks (spec stages, with cancelled attempts) | 107.13 |
| 22 | Task 1.1 TimeMachine | 10.82 |
| 23 | Task 1.2 TriagePanel | 7.58 |
| 24 | Tasks 1.3 and 1.4 AutopsyDialog | 12.86 |
| 25 | Tasks 2.1 to 2.5 | 34.48 |
| 26 | Tasks 2.6 to 2.11, cancelled | 1.95 |
| 27 | Tasks 2.6 and 2.7 (4.69 questions + 13.56 files) | 18.25 |
| 28 | Tasks 2.8 to 2.10 (8.97 questions + 23.55 files) | 32.52 |
| 29 | Tasks 3.1 to 3.5 | 20.67 |
| 30 | Tasks 3.6 and 4.1 to 4.3 | 77.50 |
| 31 | Tasks 4.13, 4.4, 4.5, part of 5.4 | 55.09 |
| 32 | Layout fixes and tasks 4.6 to 4.9 | 82.00 |
| 33 | Tasks 4.10 to 4.12 and 4.14 | 106.26 |
| 34 | Tasks 5.1 to 5.3 | 94.72 |
| 35 | Tasks 5.4 to 5.10, dock stagger | 115.63 |
| 36 | policy-reviewer on Ghosted policy | 6.20 |
| 37 | Save-hook test | 0.72 |
| | **Total so far** | **790.02** |

### Reconciliation with Kiro's usage panel (Nov 21)

| | Credits |
|---|---|
| Kiro's usage panel, all work since the hackathon credits | 1363.18 |
| Logged for Sessions 1 to 18 (engine and Study Dungeon): about 186.8 by the end of the engine work, plus about 0.5, 39.0 and 322.5 for the later Study Dungeon rounds | about 548.8 |
| Logged for Ghosted (table above) | 790.0 |
| **Logged in total** | **about 1338.8** |
| Not itemised | about 24.4 |

The 24.4 left over is Session 19 (its credits were not shown in the reports I pasted), the small Study Dungeon follow-up rounds that were never recorded, and rounding in the early "about" figures. I have no per-session figure for it, so I am not inventing one.

Work done outside Kiro (Claude Code) used none of these credits.


## Session 38: hook retest, Playwright MCP, write-up rewrite (Nov 21, 2026)

- **Goal**: show Kiro usage clearly in the write-up, retest the check-policy-on-save hook, and add a second MCP server.
- **Kiro feature used**: chat (Kiro IDE), agent hooks, MCP config. Kiro CLI 3.5.0 was installed in WSL by me, before this session.
- **What Kiro produced**:
  - `docs/KIRO_WRITEUP.md` rewritten to open with Kiro's share of the work: about 36,600 of about 49,600 lines of TS/TSX/CSS, counted from the files listed in `authorship.md` (an estimate, because Claude Code also edited some Kiro files).
  - Hook matchers in `check-policy-on-save.json` and `run-engine-tests-on-save.json` changed to accept `/` or `\` in paths.
  - `playwright` server (`@playwright/mcp@latest`) added to `.kiro/settings/mcp.json`. Not used yet.
- **Hook retest**: Kiro added `// hook test` to the top of `apps/ghosted/src/policy.ts` and then removed it. **The hook fired both times.** Each time Kiro ran `pnpm --filter ./apps/ghosted exec vitest run src/policy.test.ts`: 44 of 44 passed, including `passes checkPolicy from @decay-engine/engine`. `git diff` shows `policy.ts` unchanged afterwards.
- **What surprised me**: the hook event gave `file_path` as `apps/ghosted/src/policy.ts` with forward slashes, so the old matcher would also have matched. The slash change is probably not why it works now. Session 37's failure is still unexplained. Kiro's docs say file hooks fire on agent edits only, so the Session 37 guess ("only editor saves") was wrong.
- **What went wrong**: Kiro's first write of the write-up went to a stray `home/shree/DecayEngine/docs/` folder inside the repo (an absolute WSL path written as if relative). Kiro found it in `git status`, moved the file into `docs/` and removed the folder. The shell tool still often returned empty output and needed a second call to read results from a file.
- **Credits used**: (add from the usage panel)
---

## Session 39: policy-reviewer from Kiro CLI on Ghosted's policy (Nov 21, 2026)

- **Goal**: run the same `policy-reviewer` agent from Kiro CLI 3.5.0 in WSL and compare it with the IDE run (Session 36).
- **Kiro feature used**: Kiro CLI, custom agent (`.kiro/agents/policy-reviewer.md`, loaded unchanged).
- **What happened**:
  - I pasted `kiro-cli --agent policy-reviewer` into a CLI chat that was already open. Kiro saw it was already running in `~/DecayEngine`, refused to start a nested session, and offered to run the review itself (0.15 credits).
  - "review the ghosted policy": the chat handed the work to the `policy-reviewer` agent as a sub-agent ("Orchestrated (1 agent)").
- **What Kiro produced** (report only, no file changes):
  - No violations. Six members match the contract, thresholds `{ weak: 60, dead: 10 }`, no clock reads, no side effects or async code, health stays in 0 to 100 and never rises with time.
  - **It ran the tests itself**: `policy.test.ts` 44 of 44 and `policy.properties.test.ts` 9 of 9. In the IDE (Session 36) I had to run them in WSL and paste the results back. This is the main difference between the CLI and the IDE on my setup.
  - Test-quality check: no try/catch, skips, real-clock reads or existence-only tests, and expected values come from the spec.
  - Edge case: `rhythmDays` 0 would make `healthAt` return NaN. Checked afterwards: `person-form.ts` (`RHYTHM_MAX = 365`, whole days from 1) and `import-people.ts` already enforce 1 to 365, so no change is needed.
  - It said what it did not check: generator coverage in `test/generators.ts`, this log, and design section 2.2 line by line.
- **What I changed by hand**: nothing.
- **What went wrong or surprised me**: it did not repeat the IDE run's `nextDueAt` finding (hard-coded 60 and 10, Session 36). Checked: `nextDueAt` now reads `ghostedPolicy.thresholds.weak` and `.dead`, so that issue was already fixed and the CLI run was right not to raise it.
- **Credits used**: 1.74 for the session (0.15 for the first turn, 1.58 for the review; 1 min 29 s).
---

## Session 40: draft deploy of both apps to Netlify from Kiro CLI (Nov 21, 2026)

- **Goal**: put both apps online as Netlify drafts, without a production deploy yet.
- **Kiro feature used**: Kiro power `netlify-deployment` (installed in the IDE; its guide set the plan: `netlify.toml`, CLI-first, draft before `--prod`), Kiro IDE chat for the config, Kiro CLI 3.5.0 for the deploy.
- **What Kiro produced**:
  - IDE: `apps/study-dungeon/netlify.toml` and `apps/ghosted/netlify.toml` (base is the app folder, `pnpm --filter @decay-engine/<app> build`, publish `dist`, Node 22, pnpm 12.21.0). Both apps built locally first. The hosting lines in `structure.md` and `tech.md` now say Netlify, one site per app.
  - CLI: created the sites `decay-engine-study-dungeon` and `decay-engine-ghosted`, linked each app folder, and ran `netlify deploy --build` for each (builds 14.9 s and 9.9 s). No `--prod`.
  - Draft URLs: https://6b01c9cf668564bf7d924029--decay-engine-study-dungeon.netlify.app and https://6b01c9e6baabd8b65f6780e3--decay-engine-ghosted.netlify.app
  - The CLI added `.netlify` to `.gitignore`.
- **Checked afterwards (IDE)**: both draft URLs return 200 with the right `<title>` (Study Dungeon, Ghosted), and each page's JS bundle returns 200. Not yet checked in a browser.
- **What went wrong or surprised me**: the CLI could not find the power by name (`/powers install netlify` and "Netlify Deployment" both failed), because the power was installed in the IDE and its installed name is `netlify-deployment`. Earlier, the IDE session preparing the deploy was cancelled after repeated empty shell results. The monorepo made `netlify` ask which project to use; the CLI passed `--filter @decay-engine/<app>` to skip that.
- **Credits used**: 3.20 for the CLI session (0.91 for the deploy turn, 1 min 53 s). The IDE prep is not itemised.
---

## Session 41: live links in the README and Playwright screenshots of both apps from Kiro CLI (Nov 21, 2026)

- **Goal**: put the live URLs at the top of the README, then use the Playwright MCP to screenshot both live apps at 1280px: sample data, time machine at +30 days, Triage with 20 minutes.
- **Kiro feature used**: Kiro CLI 3.5.0, the `netlify-deployment` power's CLI workflow, and the Playwright MCP server (`@playwright/mcp`, added in Session 38 and not used until now).
- **What Kiro produced**:
  - Production deploy of both apps with `netlify deploy --prod --build` (the step after Session 40's drafts). Both return 200: https://decay-engine-study-dungeon.netlify.app and https://decay-engine-ghosted.netlify.app
  - `README.md`: two lines under the title, one per app, each with a link and one sentence. Kiro put them under the `# Decay Engine` title and not above it, and said so.
  - Six screenshots in `docs/screenshots/`, all 1280x800:
    - `study-dungeon-1280-sample-data.png`
    - `study-dungeon-1280-time-machine-plus-30-days.png`
    - `study-dungeon-1280-triage-20-minutes.png`
    - `ghosted-1280-sample-data.png`
    - `ghosted-1280-moon-clock-plus-30-days.png`
    - `ghosted-1280-triage-20-minutes.png`
- **What went wrong or surprised me**:
  - **Chrome failure**: the first Playwright call failed because the server was set to Google Chrome, which was not at `/opt/google/chrome/chrome`.
  - **The sudo prompt**: Kiro tried `npx playwright install chrome`. It needs `sudo` to install system dependencies, and the CLI cannot type a password, so the install failed. Kiro stopped and asked me.
  - **Deleted cache folders**: the same command also removed two Playwright downloads from my cache as "unused browsers": `~/.cache/ms-playwright/chromium-1148` and `ffmpeg-1010`. I did not ask for that and Kiro had not warned me. Nothing in the repo was affected, and Playwright downloads them again when needed. Kiro told me about it right after.
  - **No `browser_install` tool**: I asked for it, and this MCP server has none (the tool load returned "not found"). Kiro said so and offered two options: Chrome with `sudo` in my own terminal, or switching to Chromium.
  - **The switch to headless chromium**: the Kiro IDE session changed `.kiro/settings/mcp.json` to launch the server with `--browser chromium --headless`. No `sudo` was needed. On the next try the browser opened.
  - **Slider is in milliseconds**: Kiro's first attempt to set the time machine to "30" moved it by about 30 ms. The sliders take milliseconds (Study Dungeon 0 to 60 days, Ghosted 0 to 1 year). Kiro then set the value to 2,592,000,000 and fired the input events. It did not drag with the mouse, and said so. Both screenshots show "30 days ahead".
  - **Ghosted has no 20-minute preset** (15, 30, 60, 120), so Kiro used "Other" and typed 20.
  - **A wrong first shot**: Kiro looked at each screenshot after saving it. The first Study Dungeon shot was scrolled halfway down with the tour popup over the time machine, so Kiro skipped the tour and retook it. The first Ghosted Triage shot showed 30 min selected and no picks, so Kiro retook that too. The page scrolls smoothly, which made `scrollY` read 1 straight after `scrollTo`.
- **Not done**: Kiro did not commit anything. Both `netlify.toml` files are still untracked. `docs/screenshots/` is in `.gitignore`, so the screenshots will not be committed unless that line changes. The `.playwright-mcp/` folder (page snapshots the MCP server writes) is now in `.gitignore` too. The time dock covers the bottom of every screenshot at this height.
- **What I changed by hand**: nothing. (The `mcp.json` change was made by Kiro in the IDE, not by hand.)
- **Credits used**: 4.81 for the session so far (figure from the usage panel, not itemised by Kiro).
- **Screenshot file names**: the six files listed above.
---
