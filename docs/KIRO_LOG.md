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

## Session 5: (date)

- **Goal**:
- **Kiro feature used**:
- **What Kiro produced**:
- **What I changed by hand**:
- **What went wrong or surprised me**:
- **Credits used**:
- **Screenshot**:
