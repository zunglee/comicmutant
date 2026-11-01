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

## Freefall: Math Dive (flagship, 2026-10-31 → 2026-11-01) — ✅ 8.0 at round F15

Same gate, same bar (≥ 8/10 from a fresh critic each round). Captures from `scripts/freefall-shots.ts`
(desktop 1280×800, iPhone 13 portrait + landscape) in `reports/game-shots/round-f<n>/freefall/`.

| Round | Score | What the critic found → what changed |
|---|---|---|
| F1 | 6 | Rubble, not maths, ended ~90% of good runs (480 units of look-ahead, density up to 2.5×); the answer was the middle *value* ~60% of the time; a scripted perfect run posted at #1; a guest's daily run was overwritten by practice; small phone canvas; no "why did I die". → Hero raised (550 units ahead), rubble ramp capped at 1.6×, red warning chevrons for rubble below the view; answer value-rank uniform, sign-flip trap kept for negatives; late think-time ramp + heal every 8 so near-perfect runs end in minutes; only the first *start* of today's tower ranks (per device and account); runs with a 30+ streak and ≤ 1 rubble hit are held for a mod (`/mod`); per-mode guest storage; header/dock/tab bar step aside while diving on touch; cause-of-death line; Russo One sums, flat slab digits. |
| F2 | 6 | Integrity 3: restarting without cookies gave a fresh "first" daily start every time, and a scripted 22,725 posted #1 (it dodged the streak review rule by taking two hits); landscape result off-screen; sums gave answers away by last digit; negative traps for positive answers. → Ranked daily needs an account at the start (counted per account); tokens name their owner and only the owner can post; review by score ceiling per level (above simulated strong-human max), ≥ 95% over 40+ sums, or the tower bottom; traps keep the answer's last digit, never negative or 0 for a positive answer; rubble kept ≥ 0.8 s clear of slabs; late think-time ramp so every run ends in ~1.5–3 min; Restart on today's dive becomes practice; result stays over the canvas in the full-screen layout; guest practice keeps the best run, failed posts are kept. **Owner direction: POV view** — chase camera down the shaft (pov.ts), slabs and rubble rush at you; rules and replay unchanged. |
| F3 | 6 | First POV round. A scripted 9,645 (hard) still slipped under the score hold; today's tower could be memorised; pause showed the sum (free thinking time); POV line-up hard to read; pop-in; typical runs 38–55 s. → Sums come from a per-run seed (tower shared, sums not); holds at ~p95 of a simulated strong player plus "25+ sums with no rubble hit"; sum and slab numbers hidden while paused; white outline on the hole you're in + crossing crosshair; spawns fade in, passed objects vanish; red glow on rubble heading for you; 4 hearts, every 3rd person caught heals; rubble starts at 0.6× density; posting race fixed (claim first), Retry on network failure; drag 1:1. Typical (80% right) runs now ~80–100 s, maths ends 75–90% of runs. |
| F4 | 7 | Core loop 8; maths ends 73–95% of runs; typical runs ~2 min. Left: a near-hold forgery (hard 6,978, 48 people saved) reached #1; `pnpm admin:create` crashed (so held runs couldn't be reviewed); landscape Start under the tab bar; easy sums beatable 47% without maths (shared-digit pairs, evenly spaced options). → Podium hold: a run that would make today's top 3 or the all-time top 10 above a modest bar waits for a mod; saves rule (> 15, or > half the sums); hold scores at ~p80; admin script fixed; tab bar/dock hidden on this page on landscape phones; one trap family per question and no evenly spaced options (every no-maths heuristic now at chance, 33%); reduced motion now stops shake/flash; rescue-heal announced right; pause clears the screen-reader sum. |
| F5 | 7 | Fixed per the critic: admin script, landscape Start, reduced motion, heal copy, earlier giveaways. Left: "take the outer one of the two closest" beat chance (51–62%); the saves/asked rule held 70–90% of honest chasers; a forged run below the podium bar took #1; mods judged blind; unlimited pause. → Options built shape-first (gap pattern drawn, then the answer in a uniformly random slot; shape valid in every slot) — every gap rule ≤ 37% in 30k samples; saves rule now "90%+ of the people within reach"; any run that would be #1 above a low bar is held; held runs store reasons + log + sum seed and /mod/freefall/:id replays them exactly; pauses go into the log (server counts them, > 3 holds a run); header refreshes after a sign-in from a game. |
| F6 | 7 | Gameplay now 8 across the board (core, feel, controls, maths, HUD). Integrity 6: a forged run sat just under the podium bar at #2 unseen; the "would be #1" hold emptied boards with no mod online; slowing the frame clock bought thinking time; holds caught 20–93% of strong honest Class 7+ runs; banned players counted in ranks. → **Podium gating moved to display time**: every non-rejected run takes its real place, and podium rows (today's top 3, all-time top 10) above a low bar show "awaiting a quick check" without a name until a mod approves (owners see their own row); end-of-run ping + pause lengths in the log → runs slower than the wall clock are held; hold score recalibrated with a solve-time model; banned filtered everywhere; one aria-live announcement per step; squares offer neighbouring squares; small answers avoided; landscape opens on the game. |
| F7 | 7 | No forged run reached a named podium unseen; boards kept every run in place. Left: names stayed blank without constant mod work (bar below the median); one early end ping beat the wall clock; forged named places at #4–#10; replay page couldn't approve podium runs; ones-digit shortcut on Class 5–6/7+. → **Trust**: once a mod approves one of a player's runs they're trusted and their runs show by name; untrusted runs above ~p90 (10k / 7k / 4.5k) show unnamed anywhere on the board; **progress pings** every 10 s + end ping checked stretch by stretch against logged pauses (slow motion, early end, made-up pauses, missing pings all hold); wall/game pace stored and shown to mods; replay page approves any queued run; tens-family options from 15 up on Class 5–6/7+; no trap equal to an operand; real minus signs; "1 heart". |
| F8 | 7 | Onboarding up to 8. Left: one modest approved run made a cheater trusted for any score (named forged #1s); the wall clock's per-stretch slack added up with frequent pings and honest flaky connections / real pauses got held (9–96%); queue capped at 50; replay approve → 404; impossible traps (14 + 5 offering 8). → Trust capped per level at 1.15× the player's best mod-approved score (a sudden record goes back to the queue unnamed); queue grouped by player and paged; wall clock checked **cumulatively from the token** (game can't run ahead of real time; logged pauses must fit; overall pace ≤ 1.2× + 15 s), pings deduped by step — no per-ping slack; blips under 3 s aren't pauses; pause holds only past 6 pauses / 10 min; missing pings alone don't hold; replay approve redirects to the queue; each sum carries its possible range (no option below an addend, above a dividend, …). |
| F9 | 7 | Trust cap worked (a trusted cheater needed a human per step); integrity 7. Maths fell to 6: the new range bounds pushed questions into an unchecked fallback (`15 − 1: 15,17,14`), × 10 left the answer the only 0-ending, negative sums showed positive options; slow motion slipped through with an early end ping; names stayed blank without daily mod work; a lost end ping held honest runs; rejecting didn't touch trust. → A sum that can't get fair options is **redrawn** (no fallback); products keep their 0/5/even ending across options; negatives stay negative; evenly spaced shapes allowed again (the shape is drawn before the slot); tens shapes the norm from 30 up; the end ping carries the run's last step (must match ±2), retries, and a prompt post counts as the end if it's lost; names withheld only in today's top 3 and the all-time top 10 (a player's earned named run still shows beside a withheld record); trust margin 30%; a rejection resets trust at that level; long pauses (> 90 s) need a look above the bar; queue biggest-first with the player's checked best. |
| F10 | 7 | Game at 8 everywhere but maths 7 and integrity 6. Left: sock puppets held at the top pushed a forged run into the named top 3; a forged run just under the bar took a named #1; a network drop at game over held honest runs; impossible options in order-of-operations and negative sums; one player's withheld runs filled the all-time top 10; result copy didn't match where the name actually showed. → The window now counts **named** rows (withheld rows can't push anyone in); rule-held runs never show a name; the top named spot has a lower bar (~p75: 4.5k / 3k / 2.5k); each player keeps one checked and one unchecked all-time row; a lost end ping is dated from the last progress ping; `a + b × c` and negative sums carry their ranges; "pending" on the result means the name is actually withheld where the run sits; mod page spacing, "1 rubble hit". |
| F11 | 7 | Sock-puppet push and near-bar #1 closed; maths 7, integrity 6. Left: a p75–p90 forgery took a named #2 (second bar too high); queued runs between the bars had no stored log (blind approvals); one account's 400 runs blanked the all-time board, a dozen puppets a daily one; long network drops held honest runs; "1" traps; ÷ read as + in the practise list; the 25-clean-sums rule caught strong players. → **One bar (~p75) for every place in the windows**; every run keeps its log ("Watch replay" always works); one checked + one unchecked candidate per player chosen in SQL before any limit; at most 3 unnamed rows per board; "Reject all by player"; wall-clock doubts are a soft flag (name withheld only in the windows, never a hold); last-ping window 25 s, pings judged by step; lowest option 2 for ÷, √, ½, %; Russo One in the practise list; no-hit rule at 40 sums. |
| F12 | 7 | Integrity 7: no forged name reached a window unseen (proved live). Left: past three unnamed rows honest withheld runs vanished and their owners were told a rank they couldn't see; 31 puppets still blanked a daily board; reject-all left approved runs named; a lost end ping ignored later pauses; "2" traps (√484 → 2, 12, 22); 5 × 4 left 20 the only 0-ending. → Boards decide every run (all of today's runs; per-player candidates all-time), keep **real ranks**, list three unnamed rows and fold the rest into one "+N more awaiting a check" row where they sit, and always show the viewer's own run; the queue gets every withheld run; reject-all covers approved runs (and so trust); the end estimate adds pauses after the last ping; options ≥ 0.4× the answer from 10 up; product endings follow the product; no dock on the mod pages; "1 heart" in the screen-reader line. |
| F13 | 7 | Maths now 8 (every no-maths rule at chance in 90k sums, no impossible options); no forged name reached a window. Left: folded runs still used up the 10 places (31 puppets blanked a daily board); the result's all-time rank disagreed with the board for players shown twice; the guest-posted banner sat under the header; slow play slipped through when the end ping was dropped; a trusted player's earned run could show lower. → Folded runs take no place (the board keeps listing names at real ranks, "+N" counts all); result ranks come from the same decided list as the board (ties included); the guest banner scrolls into view; every progress ping is held to the 1.2× pace too; the all-time candidate SQL uses the same unchecked test as the board; reject-all copy; missing-number sums keep their "?" in the practise list. |
| F14 | 7 | All gameplay at 8; integrity 7 (no forged name unseen; honest runs in their real places). Left, all small: the landscape guest-posted banner was scrolled under the header by the game's own landscape scroll; a practice result took "pending" from the new run but the rank from the player's best row; faked progress pings + no end ping + a late post passed. → The landscape scroll skips when a guest run is being posted; the result's rank, "pending" and "your best / this run" all come from the one row the owner will find; a post more than 60 s after a ping-estimated end is flagged; the "+N more" row names its rank span; /mod actions redirect with their own message; replay page wording ("Why it's here"). |
| F15 | **8** | ✅ Every area 8 (core, feel, controls, maths, HUD, flow, polish, integrity). No forged run reached a named place worth having without a mod's look (live HTTP forgeries above the bar shown unnamed and queued; below it, the accepted D19 places); honest runs keep real places, owners told the truth; all no-maths rules at chance in 60k sums per level. Leftovers fixed after scoring: one all-time row per player when their named best is above a withheld run; "+N more" says "between ranks a and b"; pending copy shows "this run"; queue says "Why it's here". |

Death-cause mix after F1 fixes (30 seeded runs, 0.25 s-reaction bot, normal): 90% right → 73% of runs
end on a sum, 27% on rubble; 75% right → 87% on a sum; guessing ends in ~20 s.
