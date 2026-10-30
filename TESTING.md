# Testing

| Layer | Command | What it covers |
|---|---|---|
| Content | `pnpm tsx scripts/validate.ts` (runs as `prebuild`) | every JSON file vs `app/lib/schema.ts`, slug = file name, unique slugs, rivals/allies resolve |
| Unit | `pnpm test` | content schema + IP boundary (originals never share names with published characters; `app/game/**` never imports the roster), WCAG AA contrast of every theme's text pairs, all 20 clip recipes × 16 motifs draw without throwing, community store (reaction tallies, trusted reports, mod restore stickiness, keyset paging, vote counters, ban cleanup), take filter bypasses and false positives, `safeNext`, name skeletons, peppered hashes, fixed-window throttle, bounded form parsing, games (physics, rules, CPU bounds, every pose) |
| E2E | `pnpm test:e2e` | production build on :4345 with a throwaway DB: every public page 200 + axe (no serious/critical), 375 px no horizontal scroll, dock theme switch survives reload via SSR, theme shop downloads nothing until Get, roster server filtering, join → take → react → link rejected → vote, cross-site POST 403, security headers. `3-ux.spec.ts`: page readable with JavaScript off, phone game Start reachable by touch, 404 keeps site navigation |
| Clip quality gate | `pnpm tsx scripts/clip-shots.ts <round> <themes>` + independent critic | filmstrips per clip kind; kinds < 8/10 after 5 rounds are dropped (`app/lib/clips/gate.ts`) — see `reports/clip-quality.md` |

Reduced motion is the e2e default (animations would make contrast checks flaky); the rich path is
covered by the clip unit tests and manual browser checks.

## Game quality gate

- `test/game-*.test.ts` drive each game's sim headlessly with seeded bots (masher, chaser,
  positioning, sprinting, block-and-punish…) and assert the difficulty ladder, exploit closures
  (kickoff steals, parked keeper, one-shot spam, idle quiz player), match length and HUD rules.
- `pnpm tsx scripts/game-shots.ts <round> [games]` (dev server running) plays each game vs the CPU and
  writes timed captures + a WebM to `reports/game-shots/round-<n>/`. Scores per round:
  `reports/game-quality.md`.
- `test/unit/gadgets-timeline.test.ts`: every gadget fits its blueprint and has a roster owner; every
  timeline is oldest-first, starts at the debut and links only to real characters.
