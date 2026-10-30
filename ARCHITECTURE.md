# ComicMutant — architecture

```
content/*.json ──zod──▶ app/.server/content.ts  (validated once at boot, bundled into the server build)
                              │
           ┌──────────────────┼────────────────────────┐
           ▼                  ▼                        ▼
   route loaders        app/.server/themes.ts    app/.server/community.ts ──▶ Sql seam ──▶ SQLite (D1-ready)
   (cards, pages)       theme packs, top-5        takes, reactions, reports,
           │            /themes/pack/:slug        versus, votes, auth
           ▼                  ▼
   React (SSR) + Motion   app/lib/theme/*  ── CSS custom properties on <html> (SSR) or a page wrapper
           │
           ▼
   app/lib/clips/ClipCanvas  ◀── motif recipes (registry.ts)   — published characters
        one shared rAF       ◀── sprite rig (app/game/sprite)   — CM Originals only
           ▲
   app/game/*  canvas games, one lazy chunk per game
```

## Decisions

Format: Decision / Context / Options / Choice / Why / Trade-offs. "Delegated" = decided by engineering
under the owner's standing delegation; the owner can overrule.

### D1 — New folder, old site kept
- **Context:** Owner: "take the idea and existing character data. website should be from scratch."
- **Options:** delete and rebuild `comic-mutant/`; new folder; extend the Astro site.
- **Choice:** new `comicmutant/`; `../comic-mutant/` is read-only input (`scripts/import-legacy.mjs`).
- **Why:** "from scratch" without destroying anything. Deleting the old site is the owner's call.
- **Trade-offs:** two Comic Mutant folders until the owner retires one; the old one still owns port
  4321 and `comicmutant.localhost` in `scripts/ports.mjs`.

### D2 — Stack = byte-man's (React Router 8 SSR + Motion 14 + Tailwind 4 + SQLite seam)
- **Why:** owner asked for "motion AI" like byte-man; one stack across sites halves maintenance; the
  `Sql` seam and WebCrypto auth already run on Workers/D1.
- **Trade-offs:** ~110 KB gz React baseline vs. zero-JS Astro. Mitigated by lazy Motion features, lazy
  game chunks, and canvas clips that only animate on screen.

### D3 — IP boundary "Hybrid" (owner ruling 2026-10-30)
- Real characters: facts, gossip, quiz, storyline summaries, themes, abstract motif clips, credited
  Commons photos. CM Originals: the only drawn figures and the only game cast.
- Versus prompts are opinion comparisons from a fixed list (`VERSUS_PROMPTS`), never invented outcomes.
- Enforced by tests: original names never collide with real ones; `app/game/**` never imports the
  character roster (the quiz receives question text through its route loader).

### D4 — Themes are computed, not authored CSS
- **Context:** 100+ themes must stay readable and be cheap to add.
- **Choice:** a theme is 3 colours + motif + mood in the character JSON. `themeVars()` derives ~17 CSS
  variables and pushes every text pair to WCAG AA. Packs (~1 KB) are served by a resource route
  computed from content — no build step, a new JSON file is a new theme.
- **Why:** contrast is guaranteed by code (a unit test checks every shipped theme), not by review.
- **Trade-offs:** authors can't hand-tune a single token; extend `ThemeSpec` when that's needed.

### D5 — "Download from the theme section" = lazy pack + local locker
- Catalogue lists rows only (swatches, tagline, groups). **Get** fetches `/themes/pack/:slug?v=N`
  (long-cached, versioned by `PACK_VERSION`), stores it in a localStorage locker. Top-5 + current theme
  live in cookies so SSR paints them with no flash. All storage access is try/catch-guarded.

### D6 — "GIFs" are generated canvas clips, not image files
- **Context:** owner wants ≥20 GIFs per character, light pages, no copied art.
- **Choice:** 26 procedural motif recipes (20 + a second batch of 6) for published characters and 20
  sprite poses for originals,
  drawn by one `ClipCanvas` scheduler: one rAF loop, max 14 live clips, pauses off-screen, DPR ≤ 2,
  still frames in Lite mode / reduced motion, "Save clip" exports WebM via `MediaRecorder`.
- **Why:** 130 characters × 20 GIFs as files would be hundreds of MB; recipes are ~40 KB of JS total.
- **Gate:** owner rule — a kind scoring < 8/10 after 5 critic rounds is dropped (`app/lib/clips/gate.ts`,
  `reports/clip-quality.md`).

### D7 — Discussion is "takes + versus", not threads
- **Context:** "discussion (cool way) not reddit way".
- **Choice:** one-line takes (≤220 chars) as speech bubbles with five sound-effect reactions; Versus
  rooms with a live tug-of-war and takes per side. No nesting, no karma, no links.
- **Moderation:** small block list + link ban + rate limits; 3 distinct reports auto-hide; mods restore,
  keep hidden or soft-ban (`/mod`). Accounts are nickname + password (PBKDF2), no email.

### D8 — Roster filtering on the server
- Search/filter/sort/paging are URL params handled in the loader, so the page payload stays at one
  page of cards however large the roster grows, and it works without JS.

### D9 — Content validated at boot
- `import.meta.glob` bundles content into the server build; zod parses it once. Production refuses to
  start on an invalid file; dev skips it with a warning so one draft can't take the site down.

## Cloudflare later
`d1Sql` in `app/.server/db.ts` is the D1 adapter; auth uses WebCrypto only; content is bundled. Photos
would move to R2 or stay as static assets. Not started.
