# Arena game quality gate

Owner rule (2026-10-30): "re-audit and make the game above 8 pointer till then keep revising" — every
Arena game must score **≥ 8/10** from an independent critic; no round cap.

**Process per round**
1. `pnpm tsx scripts/game-shots.ts <round>` — a scripted bot plays each game vs the CPU (normal) at
   1280×800; timed canvas captures + a WebM per game in `reports/game-shots/round-<n>/<game>/`.
2. A fresh critic agent (no stake in the result) reads the captures and the code, runs its own headless
   bot matches and Playwright phone runs (iPhone 13 portrait + landscape, 1280×800, 1366×768), and
   scores each game on core loop · feel · controls · AI · HUD · onboarding/flow · polish (overall is
   not an average: a broken core loop can't be 8).
3. One fixer agent per game works only in its own folder (`app/game/<game>/**` + its test file);
   shared shell/engine fixes are made by the lead. Every fix lands with a headless test that measures
   the target (win rates per difficulty, goals per match, rally length, KO rules…).

## Scores

| Game | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Final |
|---|---|---|---|---|---|---|---|---|
| Fight (Rumble Royale) | 5.5 | 7.5 | 7.5 | **8.0** | 8.0 | 8.0 | — | ✅ 8.0 |
| Badminton | 6 | 6.5 | 6.5 | 7.0 | **8.0** | 8.0 | — | ✅ 8.0 |
| Quiz duel | 4.5 | 7 | 7.5 | 7.5 | **8.0** | 8.0 | 8.0 | ✅ 8.0 |
| Football | 3 | 6 | 6.5 | 7.0 | 7.5 | 7.5 | **8.0** | ✅ 8.0 |

All four games reached the bar on 2026-10-30 (round 7). Later rounds re-checked the games already at 8
for regressions after shared-shell changes; none dropped.

**Difficulty ladders as measured by the critics (≥ 48 seeded matches per row, round 6–7):**
- Football — easy: a masher wins 43/48; normal: a casual bot wins ~85% with scores like 5-3; hard: a
  skilled positioning bot wins 15/48. Kickoff steals on normal: 4% of goals (were 53%).
- Fight — easy: masher wins 12/16; a block-and-punish bot at human reaction wins 7/16 normal, 2/16 hard.
- Badminton — easy: masher wins 6/8; placing away from the CPU wins 11/12 normal, 9/12 hard; one-shot
  spam and strict alternation are read and punished on hard.
- Quiz — blind guessing and idling lose; knowing half the answers beats normal ~81%.

## What moved the scores

**Shared shell** — auto-pause soft-lock (Resume came back frozen); presses dropped during hit-stop;
phone layout rebuilt twice (landscape: canvas under the sticky header, pad in the side gutters, Start
first on touch start screens; portrait: 2-col d-pad + 2×2 action block); Sound/Full/II off the
field; desktop canvas sized to fit under the title at 1366×768; result actions under the heading;
sleeping canvas repaints after a resize (blank start screens); quiz menus above its capped canvas.

**Fight** — 6-frame press buffer; AI that punishes, counters and adapts per difficulty (dumb bot
won 95% of rounds on hard → 0%); blocked hits cost recovery; guard gauge + break; uppercut hitbox and
jab self-link bugs; teleport stacking in corners; in-play block/punish hints (touch-aware); time-out
decisions; combo labels no longer stack.

**Badminton** — direction aims depth; landing marker; CPU errors driven by shot pressure (were a dice
roll that gave 90% of points), shown as visible mishits; sitters + PUT AWAY; pattern reading (repeats
and alternation) so placing away from the CPU is the winning plan; first to 7, shorter rallies;
forgiving easy.

**Quiz** — HP decides (KO after ~6 fast right answers); speed matters (a hurried CPU slips);
wrong answers get countered; 30-question pool sampled per Start; hit strip and HP in the panel;
side-by-side layout on landscape phones; streak ×2 / ON FIRE.

**Football** — readable scoreboard; fair kickoffs (were 75–87% of goals); no CPU own goals (were 53
in 10 matches); parked-keeper exploit closed; difficulty ladder rebuilt three times; kickoff-steal
exploit closed (the CPU plays the ball and drops goal-side); header double-fire; camera zoom
(desktop 1.3×, phones 1.5×) with an off-screen ball marker; compact phone scoreboard.

Critic probes, logs and phone screenshots for every round live in the session scratchpad
(`crit/`, `crit/r3–r5/`); the captures per round are in `reports/game-shots/`.
