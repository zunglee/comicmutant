# ComicMutant

An animated, unofficial superhero fan site: Marvel, DC, Desi (Indian) and indie heroes and villains —
fun facts, busted myths, story arcs told as comic strips, a colour theme for every character, debates
and an Arena of canvas mini-games played by ComicMutant's own original cast.

Built from scratch on 2026-10-30. The older Astro site in `../comic-mutant/` was kept untouched and used
only as a data source (66 character fact files, 54 credited Commons photos, 18 original characters).

## Run

```bash
pnpm install
pnpm dev          # http://127.0.0.1:4323
pnpm preview      # production build on http://127.0.0.1:4335
```

| Script | What |
|---|---|
| `pnpm dev` | React Router dev server, port 4323 |
| `pnpm build` / `pnpm start` | production build / serve (port 4335) |
| `pnpm test` | Vitest: content schema, theme contrast, clips, community store, games |
| `pnpm test:e2e` | Playwright against a production build + throwaway DB (port 4345) |
| `pnpm typecheck` / `pnpm lint` | tsc strict / Biome |
| `pnpm tsx scripts/validate.ts [filter]` | validate content JSON with readable errors |
| `MOD_PASSWORD=… pnpm admin:create <nick>` | create a moderator (sees `/mod`) |
| `pnpm tsx scripts/clip-shots.ts <round> <themes>` | quality-gate filmstrips (dev server running) |

Data: `data/comicmutant.db` (SQLite, created on first request; override with `COMICMUTANT_DB`).

## What's where

| Path | |
|---|---|
| `/` | splash in the current theme, six universe portals, two rows per universe (heroes; villains & antiheroes), trending, rumour of the day (scratch card), Versus of the day |
| `/roster` | every published character; server-side search/filter/sort/paging |
| `/c/:slug` | character page wearing that character's theme: origin, powers, storyline strip, gossip files, pop quiz, GIF wall (19 gated clips), rivals/allies, hot takes |
| `/originals`, `/originals/:slug` | CM Originals: 30 sprite-drawn fighters, 12 gated move clips each |
| `/themes` | theme shop: grouped catalogue (universe/side/motif/mood), Get = download pack, locker, top-5 editor |
| `/timeline` | Multiverse Timeline: every character's real-world milestones (debuts, landmark stories, screen firsts, deaths, comebacks), a decade at a time; Motion decade chart (heroes up, villains down), scroll-filled spine, heroes left / villains right |
| `/gadgets`, `/gadgets/:slug` | Gadget Lab: famous gadgets as animated exploded blueprints (original generic schematics), a fact on every part, scroll-driven part picking |
| `/rumours` | True-or-Cap swipe game + tabloid wall |
| `/versus`, `/versus/:id` | two characters, one question, tug-of-war meter, takes per side |
| `/arena`, `/arena/:game` | Quick play vs CPU first (today's hero-vs-villain pair, one tap per game), then the full picker; fight, badminton, football, quiz duel |
| `/freefall` | Flagship daily maths dive in a POV shaft: fly through the right answer. Today's ranked dive per class level (shared tower, per-run sums, new at midnight IST), practice, replay-verified boards with mod checks for top names (`app/game/freefall/`, `app/.server/freefall.ts`; design + decisions in `reports/freefall-design.md`, critic rounds in `reports/game-quality.md`) |
| `/quiz`, `/quiz/play`, `/quiz/leaders`, `/quiz/me` | **Fact Frenzy**: server-scored 4-option facts quiz over all 108 characters (1,080 web-researched questions, own words, a source each). Daily challenge (same 10 for everyone, answers unlock at midnight IST), universe and character quizzes, resume, PNG share card, three boards with names gated by a mod look, personal analytics (`app/.server/quiz.ts`, `app/components/quiz/`, `content/quiz/`; design Q1–Q24 in `reports/quiz-design.md`, critic rounds in `reports/quiz-quality.md`, worker scoring in `reports/batman-ledger.md`) |
| `/mod/quiz` | Mods: Fact Frenzy trust checks (per game and board, signals, times against reading floors), held games, reported facts (retire / restore), site analytics |
| `/mod`, `/mod/freefall/:id` | Mods: report queue, Freefall runs to check (reasons, pace, exact replay, approve / reject / reject-all). Create a mod with `MOD_PASSWORD=… pnpm admin:create <nickname>` |
| `/join`, `/login`, `/mod` | nickname accounts, moderation queue |

## Comic layer (byte-man style)

Everything below is Rich FX only: off in Lite FX and under `prefers-reduced-motion`, and never on a game screen.

| Piece | File | What |
|---|---|---|
| Atmosphere | `app/components/atmosphere.tsx` | per-motif "weather" behind the page (embers, snow, bubbles, sparks, bats…) plus rare events (lightning, bat swarm, shooting star); 30 fps, starts after load + idle, pauses in hidden tabs |
| Loaders | `app/components/loaders.tsx` | first-visit "COMIC MUTANT" panel slam (once per browser session, `cm_seen` cookie) and a 0.75 s themed transit per section (slam / iris / stripes by motif); click, Esc or Skip ends it; never blocks navigation |
| Easter eggs | `app/components/eggs.tsx` | Konami code or typing `kapow` → SFX sticker storm; typing `mutant` → random theme roulette; spark cursor trail on fine pointers |
| Design system | `design-system/comicmutant/MASTER.md` | UI-UX Pro Max tokens, motion rules, anti-patterns and the pre-delivery checklist |

## Adding content

- **A character** = one JSON file in `content/characters/<universe>/<slug>.json` matching `Character` in
  `app/lib/schema.ts`. It is automatically a roster entry, a theme, 19 gated clips, quiz questions and gossip.
  Run `pnpm tsx scripts/validate.ts` before shipping; production refuses to start on an invalid file.
- **An original** = one JSON file in `content/fighters/` matching `Fighter`. It joins the Arena and the
  theme shop.
- **A timeline** = a `timeline` array on the character file (`Milestone` in `app/lib/schema.ts`), oldest
  first; `with` links another roster slug.
- **A gadget** = one JSON in `content/gadgets/` matching `Gadget`; `parts` must fill the blueprint's slots
  (`BLUEPRINT_SLOTS` in `app/components/gadgets.tsx`). `scripts/validate.ts` checks owner and slot count.
- **A theme group axis** = a new `groups` tag in `app/.server/content.ts#themeIndex` + an entry in
  `AXES` in `app/routes/themes.tsx`.
- **A clip kind** = a recipe in `app/lib/clips/registry.ts`; it must then pass the quality gate.

## IP boundary (owner ruling, 2026-10-30: "Hybrid")

Published characters (Marvel, DC, Indian, other) appear **only** as facts, trivia, quiz questions,
plain-English story summaries, colour palettes and abstract motif animations — never as drawn
figures, logos, comic art, film stills or quotes, and never with invented stories or outcomes. Photos
are Wikimedia Commons files under CC/PD licences, credited per page. The **games and sprite figures use
CM Originals only** (enforced by `test/unit/content.test.ts`). Gadget Lab blueprints are our own
generic schematics (a boxy car, a robot suit, a plain disc) labelled with facts — never the published
designs, logos or emblems. Non-commercial: no ads, merch or paid
features. Disclaimer in the footer and on every character page.

See ARCHITECTURE.md, SECURITY.md, PERFORMANCE.md, TESTING.md and `reports/`.
