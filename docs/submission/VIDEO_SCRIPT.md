# Demo video script and storyboard (under 2:50)

Written for: the person recording the video (the developer). Voice-over is about 2.4 words per second, so read each line aloud with a timer. Show the result first, explain the mechanism second. One idea per shot. Record on the **live URLs**, with the address bar visible, and no copyrighted music.

Lines marked **[IF BUILT]** are cut if the feature is not live on recording day. The script still works without them: predict, prioritise, explain.

## Before you record (30 minutes, do not skip)

1. Use a fresh private window for each app, so first-run state and the tour behave the same each take. Skip the tour first.
2. **Study Dungeon:** load the sample data (12 facts). The hero should read "If you do nothing, in the next 7 days 1 fact weakens and 1 dies." The Triage line shows with the **20-minute** budget, not the default 10.
3. **Ghosted:** load the sample street. Its Triage line shows only with the moon clock moved ahead **about 15 days** and the **30-minute** budget. Practise this move twice; it is the one shot that can go wrong.
4. Keep the bottom-right corner clear in every shot (the Netlify badge). Crop or zoom to hide it.
5. Browser window about 1280×720, zoom 100%. Close every other tab and notification. Turn off reduced motion (so the window lights flicker).
6. Terminal: run `bash scripts/check.sh` once beforehand so installs are warm. The shot is only the last lines, under 8 seconds.
7. Rehearse the whole thing once with a timer before recording.

## Shot list

| Time | Shot | Voice-over | What it proves |
|---|---|---|---|
| 0:00–0:15 | Study Dungeon hero: the creature with its speech bubble, then the line "If you do nothing, in the next 7 days 1 fact weakens and 1 dies." | "Everything you learn fades. This engine can tell you exactly what you will lose, and when." | The headline capability |
| 0:15–0:38 | Open "Coming up". Drag the time machine slider forward 30 days. The dungeon ages, markers pass, the "Preview" banner shows. Click "Back to today". | "Slide forward in time. Nothing is saved. You are looking at next month's dungeon, today." | Forecast and preview mode |
| 0:38–1:05 | Triage: choose 20 minutes. The picks appear. Point at the line "Answering these right saves N facts that would die in the next 7 days." | "You will never have time for everything. Tell it you have twenty minutes, and it finds the best set to save, exactly, and says how many facts that keeps alive." | Exact triage, and what a session saves |
| 1:05–1:30 | Fight one fact (pick the answer). Then open the autopsy of a dead sample fact: the cause sentence. **[IF BUILT]** End on the what-if sentence ("A review on 14 Nov, when it first went weak, would have kept it alive until 9 Jan."). | "When something dies, it says why. Facts only. **[IF BUILT]** And what one review, at the right moment, would have changed." | Autopsy and the what-if |
| 1:30–1:45 | Cut to Ghosted: the street of windows glowing and flickering. | "Now the same engine, on something very different: the people you keep meaning to call." | The second app |
| 1:45–2:15 | Ghosted: the hero line. Slide the moon clock to about +15 days; the moon thins. Triage, 30 minutes: the line "A call or meet-up with these people keeps N windows from going dark in the next 7 days." | "Different rules. Different look. Same engine. And it never says a light measures how much someone matters." | Reuse, and the ethics |
| 2:15–2:32 | Terminal: the last lines of `bash scripts/check.sh`: "engine: no code change since engine-complete", then the test totals. | "Ghosted was built with no change to the engine, and a check proves it on every run. Over two thousand tests." | The Skeleton Crew proof |
| 2:32–2:50 | Short montage, about 2 seconds each: a spec file open in Kiro, a steering file, the `policy-reviewer` agent, `docs/KIRO_LOG.md`. End card: the pitch line and `decay-engine-landing.netlify.app`. | "Built with Kiro: specs for every feature, steering that Kiro follows, a reviewing agent, and a log of every session. One engine for things that fade." | Kiro usage, and the close |

## Words to avoid on camera

- "Scientifically proven", "optimal memory": Study Dungeon's schedule is a simple half-life rule, not a validated model.
- "Dead" or "die" for a person: use "goes dark" or "flickers".
- "Saves" without the condition: the line is true because a right answer or a call keeps the item alive, so say "answering these right" and "a call or meet-up".
- Any feature that is not live on the day.

## If you run short of time

Cut the "Back to today" click, then the fight in the 1:05 shot, then the montage down to two frames. Never cut the terminal shot: it is the Skeleton Crew proof.

## Rules to check before upload

- Under 3:00, public on YouTube, no copyrighted music, shows the project running.
- Every link works logged out.
