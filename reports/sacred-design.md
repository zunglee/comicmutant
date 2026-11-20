# Sacred India + Desi heroes — design (Batman run 2, 2026-11-13)

Owner ask (2026-11-13): add all Indian superheroes, and all figures of India's religions and mythology,
each with a card, a full profile and at least 20 interesting web-researched facts, every fact critiqued
for interest; selecting Indian religion turns the whole site calm, peaceful and spiritual, animation
heavy; mythology interactive and knowledge-based for kids; polls, quiz and other interactives;
re-audit every step to 8/10; commit and push.

Rulings below were decided by engineering under owner delegation (memory: delegated-decisions).

## Goals and measured "done"

| Target | Check |
|---|---|
| Sacred roster: 377 figures in 4 traditions (`content/sacred/roster.json`), every one has a profile | `validate-sacred.ts --strict`: each roster slug has a valid file |
| ≥ 20 facts per figure, each with a source and a critic interest score ≥ 7 | validator; `depth: compact` only per S5 |
| Desi heroes: every notable Indian superhero/villain with a Wikipedia-grade source, each with ≥ 20 facts | validator (`facts` on `indian` characters) |
| Every batch audited by a fresh critic, fixed, re-audited; batch score ≥ 8 | `reports/sacred-audit.md` |
| Sacred realm: whole site (header, footer, atmosphere, fonts, motion) turns calm on `/sacred/**` | e2e asserts `html[data-realm=sacred]` and tokens |
| Kids: card flip, fact deck, story walk, quiz, symbol match, avatar wheel, Gurus and Tirthankara paths | e2e + critic "kids" area ≥ 8 |
| Polls: server-stored, one vote per voter, never rank a faith or a deity | unit tests + poll validator |
| Reduced motion respected; AA contrast; 44 px targets; no horizontal scroll at 375 px | axe + e2e |

## Rulings

- **S1 Separate realm, separate schema.** Religious figures are `Figure` (`app/lib/sacred-schema.ts`), not
  `Character`. No power stats, versus, gossip spice, hero/villain kind, theme downloads, Fact Frenzy
  leaderboards. Route `/sacred`, label "Sacred India". UI copy says "figures" / "profiles"; the card is a
  "card".
- **S2 Traditions in scope:** the four faiths born in India — Hindu, Buddhist, Jain, Sikh. Figures of
  faiths that came from outside India are out of this section (not a judgement; a scope line).
- **S3 Attribution, never mockery.** Claims about the divine are attributed: "In the Valmiki Ramayana…",
  "Jains believe…", "Many Puranas say…". Versions that differ are named, not ranked. Never "myth = false".
  Sikh Gurus, Buddha's life and saints are history: dated facts with sources. Asuras and rakshasas get
  role "asura in the Ramayana", never "villain".
- **S4 No depictions.** No faces, figures or traced sacred emblems for any deity, Guru, Tirthankara or
  saint. Cards use generic animated motifs (`SACRED_SYMBOLS`: lotus, flame, wheel, lamp…). No Commons
  photos in this section. Sikh tradition in particular avoids portraits of the Gurus.
- **S5 Accuracy beats count.** Target ≥ 20 facts each. Where the sources genuinely hold fewer verifiable,
  interesting facts (some Tirthankaras, minor sages), the profile is `depth: "compact"` with ≥ 8 and is
  listed in the audit. Padding with weak or invented facts fails the critic.
- **S6 Interest gate.** Researchers write ~26 candidates; the critic scores each 1–10 for "would a
  curious 12-year-old say whoa?" and accuracy; facts < 7 or doubtful are cut or replaced.
- **S7 Polls never rank faiths or deities** ("who is the greatest god" is banned). Allowed: favourite
  story, which lesson matters most to you, which festival you celebrate, which figure to read next.
  Desi-hero polls may compare heroes (they are comics).
- **S8 Calm realm.** On `/sacred/**`: ivory/saffron/lotus/peacock palette, serif display face, slow
  eases (≥ 600 ms), floating diyas, petals, slow mandala, breathing light. Animation-heavy but calm:
  no shakes, flashes, comic bursts or loud sounds. `prefers-reduced-motion` stills everything.
- **S9 Desi heroes stay in the comics universe** (`indian`), Hybrid IP rule unchanged (facts only, no
  drawn figures). They gain `facts` (≥ 20) and a `/desi` hub; heroes from films/TV count.
- **S10 Kids.** Every figure has `kidSummary`, a 3–6 step `story` walk and `kid` facts. Interactives are
  knowledge-based (no scores that rank children publicly; local progress only).
- **S11 Process.** Research = Sonnet (`batman-researcher`), fact critic and re-audit = Opus
  (`batman-critic`), fixes = Sonnet, mechanical = Haiku, server/polls = Opus (`batman-core`), UI = Sonnet
  builders, final critic rounds = Opus, Alfred blind scoring. Waves commit and push separately so
  progress is never lost.
- **S12 Faith data never tied to accounts.** Sacred polls ("which festival do you celebrate") and sacred
  fact reactions are keyed by the guest cookie only, even for signed-in fans; no user id is stored.
  Reason: answers hint at a person's religion. Desi/comic polls keep fan identity.
- **S13 Soft-ban cleans votes.** A moderator soft-ban deletes the voter's account-linked poll votes and
  fact reactions (counts are computed from rows).
- **S14 (UI critic r1)** Trident motif removed (it is Shiva's emblem → S4); neutral motifs only.
  Faith-tally polls dropped: no poll may reveal or tally which faith or festival a person follows
  ("which tradition next", "which festival do you celebrate" → reworded to story/reading choices).
  A vote counts only with a voter cookie issued by an earlier GET; POST needs a same-origin Origin.
  Dashavatara: both common lists are named and accepted (Balarama-list and Buddha-list).
- **S16 (UI critic r3) Motifs.** S4 forbids faces/bodies and any traced sacred emblem (trishula, khanda,
  Om, Ik Onkar, dharma chakra, lanchhana). Everyday story objects (conch, flute, mace, bow) stay allowed
  as generic art. The ten Gurus, Guru Granth Sahib and all 24 Tirthankaras use neutral motifs only
  (lamp, book, lotus, moon, star, sun, mountain), because their emblems are the tradition's own.
  Guru Granth Sahib is an unnumbered closing card ("the eternal Guru"), not "11".
- **S17 Caching.** Pages that carry a poll or fact deck are `private, no-store` whenever the request has
  no voter cookie or the mint ceiling was hit (a cached cookie-less copy would make every new visitor
  fail "reload"). A flagged voter sees their own vote in their own view only.
