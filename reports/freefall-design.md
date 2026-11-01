# Freefall: Math Dive — design + decision log

Owner brief (2026-10-31): a hero falling/escaping a collapsing building, steered with arrows; mind-maths
questions in the middle decide the run; a leaderboard across the web; login + database. Built on the
product verdict given the same day: math must be *steering*, a daily seeded run, guest play first,
server-checked scores, phone-first controls, a school-kid angle, original characters only.

## The loop

The city is collapsing. Your hero dives down a crumbling tower shaft. Every few seconds a concrete
floor slab blocks the shaft with **three openings, each painted with a number**; the sum for that slab
is on the HUD. Steer into the right opening and the slab shatters (streak up, speed up). Hit the wrong
opening or the wall between them and you crash through (lose a heart, and the right answer is shown).
Between slabs: falling debris to dodge and falling civilians to catch ("saving" — the owner's fantasy).
Three hearts; every 8-streak heals one. Endless — speed, slab rhythm and the sums all ramp, so a run
ends in ~2–4 minutes.

## Decisions (internal debate → choice)

| # | Question | Options weighed | Decision | Why |
|---|---|---|---|---|
| D1 | Math as pop-up or steering? | pause-and-answer · lanes | **Lanes (answer gates)** | Pop-ups break flow (verdict #1). Gates make reflex + math one action. |
| D2 | Separate shell or extend GameShell? | extend · own | **Own shell, shared engine** | GameShell is built around P1-vs-P2 (vs line, winner screen). Four games sit at 8/10; touching it risks regressions. Loop, Sfx, FxWorld, fitCanvas reused. |
| D3 | Canvas shape | 16:9 only · per-orientation | **Landscape 960×540, portrait 540×960** | A falling game on a portrait phone in a 16:9 strip is ~220px tall. The world (shaft 540 wide × 680 visible) is identical in both — only HUD placement differs — so the daily run is fair across devices. |
| D4 | Score integrity | trust client · replay | **Server replays the input log** | Deterministic core (seeded RNG, fixed 60 Hz step, no `Math.sin/cos` in the core — engines may differ in the last bit; `+ − × ÷ sqrt` are IEEE-exact). Signed run token carries seed + start time; a run can't claim more steps than wall-clock time since the token. Each token posts once. |
| D5 | Daily attempts | unlimited · first counts | **First posted daily run per level counts; later runs are practice** | Same seed for everyone means repeats would memorise answers. Practice has a fresh seed and its own all-time board. |
| D6 | Login wall | before play · before post | **Before post only** | Verdict #3. A guest's finished run is kept in sessionStorage and posted after sign-in. |
| D7 | Levels | easy/normal/hard · school classes | **Class 3–4 · Class 5–6 · Class 7+** | The school angle parents/teachers share. Each maps to speed, think time, opening width and sum types. |
| D8 | Day boundary | UTC · IST | **IST (Asia/Kolkata)** | The audience is Indian; "today" should flip at their midnight. |
| D9 | Phone controls | tilt · pad · drag | **Relative drag on the canvas + Dive/Brake buttons** | Tilt needs an iOS permission prompt. Relative drag keeps the finger off the hero. Keys: arrows/WASD, 1/2/3 jump to a lane. |
| D10 | Hero | Marvel/DC · originals | **Original fighters only** | Hybrid IP rule: games use originals. No deities in the game (verdict #4). |
| D11 | Empty boards at launch | seed fake scores · honest empty state | **Honest: "Be the first today"** | Fabricated records are not acceptable. |
| D13 | Camera (owner, 2026-10-31: "POV type, not linear") | side scroll · first person · chase cam | **Chase cam down the shaft** | Keeps the hero (and their theme) on screen while slabs, rubble and people rush at you; a pure first-person view hides who you're playing. Projection only — the replayed rules are unchanged. |
| D14 | Who can rank today's dive | any device · account | **Signed-in fan's first start** | An anonymous id is free to throw away for another "first" try (critic round 2). A nickname takes 20 s and no email. |
| D15 | "Work out just the ones digit" on easy sums, answers under ~30, squares, and sums whose own range leaves no room for tens traps (19 + 36 can't be under 37) | block it · allow | **Allow** | It is real column arithmetic teachers teach; blocking it needs traps 30+ away for small answers (15 offering 45), which reads as silly. Gap and rank rules are what must stay at chance. |
| D16 | What a mod gets | numbers only · reasons + replay | **Reasons + exact replay** | Holds are only as good as the human look; the stored log replays through the same core and view. Logs are kept for held runs only. |
| D19 | Where names are withheld | anywhere above the bar · only today's top 3 and the all-time top 10 | **Only where they're worth having** | Withholding everywhere left whole boards nameless without daily mod work (critic round 9); a forged #6 today is worth little, a forged #1 is not. |
| D18 | Who needs a mod's look | every podium run · first big run per player | **First big run per player (trust)** | Checking every podium run needs a mod on watch all day; one look per player keeps names flowing while still putting a human in front of every new name above ~p90 (critic round 7). |
| D17 | Where the podium is checked | at post time · at display time | **Display time** | A post-time "would be #1" hold compares only against what's visible, so with no mod online every good run is held and the boards go empty (critic round 6). Gating what's *shown* keeps every run in its real place and only withholds podium names until a mod looks. |
| D12 | Learning value | score only · review | **Result screen lists every missed sum with the right answer** | Turns a loss into practice; the thing a parent sees. |

## Not in v1 (logged, not built)

Friends / city / school boards; image share card (v1 shares text); hosted DB (SQLite seam already has a
D1 adapter); Hindi UI.
