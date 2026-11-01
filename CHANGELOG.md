# Changelog

## 0.1.0 — 2026-10-30

First build, from scratch (old `../comic-mutant` kept as a data source only).

- 99 published characters (34 Marvel, 32 DC, 20 Desi, 13 indie/manga) with storylines, gossip,
  myths, quizzes; 30 ComicMutant originals for the games.
- 130 site themes (every character + house), computed to WCAG AA; top-5 dock; theme shop with lazy
  pack download and a local locker.
- 20 procedural motif clips per character and 20 sprite clips per original; Save clip (WebM).
- Arena: fight, badminton, football, quiz duel — CPU or local 2-player.
- Rumour Mill (True-or-Cap swipe game, tabloid wall), Versus debates, hot takes with sound-effect
  reactions, nickname accounts, moderation queue.
- Security + scalability review pass (see SECURITY.md, PERFORMANCE.md, reports/).

## 0.2.0 — 2026-10-30

Byte-man-style comic layer (owner direction: "motion-ai using UI-UX pro max skill and comic character
theme based like byte-man").

- Theme atmosphere: per-motif particle weather + rare events behind every page, in the equipped
  theme's colours; character pages run their own local layer.
- Motion loaders: first-visit COMIC MUTANT panel slam (server-rendered curtain, once per session) and
  themed section transits (slam / iris / stripes); skippable, never blocking.
- Easter eggs: Konami code, `kapow`, `mutant` theme roulette; spark cursor trail.
- UI-UX Pro Max re-pass: design system persisted to `design-system/comicmutant/MASTER.md` and the
  site audited against its checklist.
- Six new motif clip kinds through the same 5-round quality gate: face-off, front page, trading card,
  ricochet and glass break ship (8/10); radar lock dropped (7/10). 19 motif clips per character.
- UI-UX Pro Max checklist audit (25 findings) fixed: phone game menus and touch pad flow below the
  canvas; the intro curtain lifts without JavaScript; transits lift once the page is in, let clicks
  through and skip Back/Forward; dock folds on phones; 44px touch targets; focus moves to the page
  after navigation; error pages keep the site chrome; labelled, debounced search; accessible auth
  errors + show password; atmosphere dimmed over the reading column; offline notice.

## 0.3.0 — 2026-10-30

Owner request: "create CPU versus game by default first · show 2 rows for each universe · superhero
timelines incl. villains (browse the web for the data) · gadget dissect (Batmobile, Iron Man suit…) ·
re-audit the games until each is above 8".

- **Arena:** Quick play vs CPU first (today's hero-vs-villain pair, one tap per game, normal); the full
  picker below is preselected with a ready CPU fight.
- **Home:** six universe doors and two rows per universe (heroes; villains & antiheroes), sliding in
  from opposite sides. New **Anime & Manga** universe (5 moved + 9 new: Naruto, Luffy, Sailor Moon,
  Tanjiro, Vegeta, Madara, Sukuna, Dio, Aizen) — 108 published characters.
- **Multiverse Timeline** (`/timeline`): 738 web-verified real-world milestones for every character,
  heroes and villains; Motion decade chart, scroll-filled spine, heroes left / villains right;
  per-character strip on `/c/:slug`. Three debut years corrected (Iron Man 1963, Captain America and
  Red Skull 1941).
- **Gadget Lab** (`/gadgets`): 10 gadgets (Batmobile, Iron Man armour, Cap's shield, Mjolnir,
  web-shooters, Green Lantern ring, utility belt, Panther habit, Mr. India's band, Dragon Radar) as
  animated exploded blueprints — original generic schematics, a web-verified fact on every part,
  scroll-driven part picking.
- **Games re-audited to ≥ 8/10** by independent critics over 7 rounds (fight 5.5→8, badminton 6→8,
  football 3→8, quiz 4.5→8): AI ladders, exploits closed, phone layouts rebuilt, headless tests for
  every target (`reports/game-quality.md`).

## 0.4.0 — 2026-10-31

Freefall: Math Dive — the flagship daily game (owner brief: a falling hero you save with the arrows,
mind-maths in the middle, a leaderboard across the web, login and a database).

- `/freefall`: dive down a collapsing tower; each floor slab has three numbered openings and the
  sum is on the HUD — steering *is* answering. Rubble to dodge, falling people to catch, dive/brake,
  5-streak heals a heart. Class 3–4 / 5–6 / 7+ sum sets that ramp inside a run.
- Phone-first: 9:16 canvas on portrait phones, 16:9 with Dive/Brake in the side gutters on landscape,
  relative drag to steer; keys, 1/2/3 lane jumps and screen-reader lines on desktop. Site dock and tab
  bar step aside while diving.
- Leaderboards that can't be faked by editing the client: deterministic core, the server replays
  the input log from a signed seed token and checks game time against wall-clock time; a token posts
  once; one ranked daily run per player per level. Guests play first and post after signing in.
- Result screen lists every missed sum with its answer; text share card with a right/wrong grid.
- Entry points on the home hero and the Arena. `scripts/freefall-shots.ts` bot harness for the
  critic gate.

### 0.4.0 — after the critic gate (2026-11-01)

Fifteen critic rounds (6 → 7 → 8). What changed on the way:

- **POV view** (owner: "POV type, not linear"): a chase camera down the shaft; slabs, rubble and
  people rush up at you; the hole you're lined up with is outlined, a crosshair shows where you'd
  cross. Rules and server replay unchanged (`pov.ts` only projects).
- **Maths you can't game**: options are built shape-first (two gaps drawn, then the answer in a
  uniformly random slot) so value rank, lane, gap pattern and parity are all at chance; each sum
  carries its possible range; products keep their 0/5/even ending; a sum that can't get fair options
  is redrawn. Sums are per run (the daily tower is shared, its sums aren't).
- **A fair board without constant moderating**: every run keeps its real place; names inside today's
  top 3 / the all-time top 10 above ~p75 show once a mod has looked at that player at roughly that
  score (trust ×1.3, reset by a rejection); unnamed rows fold into "+N more"; your own run always
  shows. Mods get a queue with reasons, pace and an exact replay (`/mod/freefall/:id`), plus
  reject-all.
- **Wall clock**: progress pings + an end ping carrying the last step, checked cumulatively
  (no running ahead, pauses must fit, ≤ 1.2× real time); doubts are a soft flag, not a hold.
- 4 hearts, every third person caught heals, rubble kept clear of slabs; ranked daily needs an
  account at the start; owner-bound run tokens; `pnpm admin:create` fixed.

