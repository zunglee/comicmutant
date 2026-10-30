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
