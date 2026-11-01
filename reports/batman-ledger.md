# Batman ledger

## Summary — quiz-v2 (Fact Frenzy), 2026-11-01

| Model | Pieces | Batman avg | Alfred avg | What it was good at |
|---|---|---|---|---|
| opus | core rules, integrity, critic, Alfred | 8.73 | 8.07 | Server rules with a test per exploit; caught two of Batman's own ruling errors; fast fix rounds |
| sonnet | 6 researchers, 2 UI builders, content fixer | 7.84 | 7.71 | Web research (1,080 facts, 95–100% confirmed per critic sample), UI, content rewrites; slow on long measurement loops (one 70-min round) and sometimes shipped without looking at its own screenshots |
| haiku | numeric re-spread (mechanical) | 9.00 | 7.60 | Cheapest piece by far (60k tokens, 3 min); fine for a scripted, verifiable change |
| Batman self | orchestration | 7.00 | 6.20 | Rulings held up, but a weak validator and matcher let leaks through twice, one IP-block ruling had to be revised, and a CSS rule regressed the phone tab bar |

**Gaps:** 15 flagged across 3 scoring rounds. Alfred was right 7 times, Batman 4, and 4 were split.
Batman lost mostly on **verification** (crediting a worker's checks that didn't cover the real failure)
and on his own efficiency. He won where Alfred, blind by design, couldn't see receipts or scratch-folder
evidence (since fixed: Alfred now gets the scratch folders and a login recipe).

**Model choice for next time:** keep Opus for rules and integrity, Sonnet for research, UI and content,
and Haiku for scripted mechanical edits. Give Sonnet UI workers hard time-boxes and require assertions
(an e2e spec), not printed values.


Batman scores each worker; Master-Alfred (Opus) scores the same work blind. Gaps ≥ threshold get a decision.

## quiz-v2 — round 0 (2026-11-01)

Cells are Batman/Alfred. ⚠ = |gap| ≥ 1.5.

| agent | model | correctness | scope | quality | verification | efficiency | avg B/A | avg gap |
|---|---|---|---|---|---|---|---|---|
| C1 core | opus | 8/9 | 9/9 | 9/9 | 8/9 | 9/8 | 8.6/8.8 | -0.2 |
| R1 research-marvel-a | sonnet | 8/9 | 9/9 | 8/8 | 7/8 | 9/9 | 8.2/8.6 | -0.4 |
| R2 research-marvel-b | sonnet | 8/9 | 8/9 | 7/8 | 8/8 | 8/9 | 7.8/8.6 | -0.8 |
| R3 research-dc-a | sonnet | 8/9 | 9/9 | 8/8 | 8/8 | 6/7 | 7.8/8.2 | -0.4 |
| R4 research-dc-b | sonnet | 8/9 | 9/9 | 8/8 | 7/8 | 8/8 | 8.0/8.4 | -0.4 |
| R5 research-desi | sonnet | 7/8 | 6/9 ⚠ | 8/8 | 8/8 | 7/8 | 7.2/8.2 | -1.0 |
| R6 research-anime-indie | sonnet | 8/9 | 9/9 | 7/8 | 8/8 | 6/8 ⚠ | 7.6/8.4 | -0.8 |
| U1 play-ui | sonnet | 8/8 | 7/9 ⚠ | 8/8 | 9/8 | 6/6 | 7.6/7.8 | -0.2 |
| U2 data-ui | sonnet | 8/8 | 9/8 | 8/8 | 9/7 ⚠ | 7/7 | 8.2/7.6 | 0.6 |

### Flagged gaps

- **R5 research-desi** (sonnet) · scope: Batman 6 vs Alfred 9 (gap -3)
  - Batman: 195 Q valid, careful on conflicting dates and religion; but ran another worker's gen1.py from shared scratch, writing into content/quiz/dc/ (out of scope, self-reported); Doga single-source (indianetzone).
  - Alfred: 20 files/195 q, validator 0; Doga facts verified on indianetzone and Krrish/Kaal/Robo/Bahadur/Shaktimaan on Wikipedia; parmanu-10 'Brahmand Rakshak' is on neither cited source; 3 files under the 10 target (8,8,9); kept off religious claims
  - Decision: Batman right. Alfred was blind to the receipts by design and couldn't see that R5 ran another worker's generator, which wrote into content/quiz/dc/. Scope stays 6; the DC files were checked and are intact. Action: Batman shares part of the blame (shared scratch), so the skill now gives every worker its own scratch folder. Model stays sonnet.
- **R6 research-anime-indie** (sonnet) · efficiency: Batman 6 vs Alfred 8 (gap -2)
  - Batman: 220 Q valid; spot-checks right (Ufotable, Malebolgia, Shanks); shortest whys (avg 67); slowest researcher (1014 s, 210k tokens).
  - Alfred: 22 files/220 q, validator 0; 12 hand-checked (Nihon Shoki, Madhouse S1, Kenshin scar, Vegeta ch.204, Frieza 4 months, Aizen ch.79, Keith David, Karel Roden) all confirmed; spawn-05 answer 'Terry' next to full-name wrong options is a small tell
  - Decision: Alfred right. Batman scored absolute time; per character R6 cost ~9.5k tokens, the same as R1 (9.7k) and well under R3 (16k). Batman revises R6 efficiency to 8. Model stays sonnet.
- **U1 play-ui** (sonnet) · scope: Batman 7 vs Alfred 9 (gap -2)
  - Batman: Funky, works end to end, found the core clock bug, axe 0 at 3 profiles + slow-reader and retry checks; started an extra dev server on 4399 and overwrote build/; 'PLAY TODAY'S' label reads cut off; 1500 s first pass.
  - Alfred: My Playwright run: axe 0 serious at 375/1280/reduced, 0 px overflow, 0 long tasks over 9 transitions, keys 1-4 and Enter work, no SfxBurst under reduce; at 375 the SfxBurst covers the 'NOT QUITE' label (375_play_reveal.png); if the answer reply is lost, 'Send my answer again' gets 'not the current question' and the player is stuck; 71+16 calls, 27 play shots plus scripts left in reports/quiz-shots
  - Decision: Batman right on the facts, Alfred right on the weight. The extra dev server on 4399 and the overwritten build/ are in the receipt Alfred never saw, so they stand. The cost was small (nothing lost), so 8 is fair. Alfred also found two real UI bugs Batman missed: the lost-answer retry dead end and the SFX burst covering the verdict at 375. Both go into the fix round. Model stays sonnet.
- **U2 data-ui** (sonnet) · verification: Batman 9 vs Alfred 7 (gap +2)
  - Batman: Pages typecheck against the real core, axe 0 on 8 views x 2 widths, proved axe catches a broken page, isolated throwaway server + DB; found the 25% accuracy symptom; many-fan boards only checked on mock data.
  - Alfred: leaders and me-as-guest: axe 0 serious, no overflow at 375/1280; mod-quiz checks requireMod and same origin and redirected me to /login; on-disk shots u2r-mod/me show the held queue, report queue (notes escaped) and per-topic bars working; I could not render the signed-in views myself, and the worker's test users ('U2mod', 'Bolt') stay in the dev DB
  - Decision: Split. Alfred not being able to render the signed-in views isn't U2's fault, but U2 checked many-fan boards only on mock data and left its test users in the dev DB. Batman revises verification to 8. Model stays sonnet.

### Round 0 extra findings (Alfred) routed to the fix round
- green-goblin-10 (R1) and parmanu-10 (R5) cite pages that don't state the answer → fix the source or replace the question.
- A lost answer reply leaves the player stuck: a retry gets "not the current question" (C1 must make a repeated identical answer return the stored reveal; U1 retries that way).
- At 375 px the SFX burst covers the verdict label (U1).
- Replaying the daily adds facts mastered. This is a design question: a fact learned from a reveal then answered on a replay counts. Batman's ruling is in the round-1 fix list.

### Process incident (Alfred, round 0)
While working around Wikipedia rate limits, Alfred put the owner's email address in a User-Agent header on requests to Wikipedia. No other data was sent. The owner has been told. The `alfred` and `batman-researcher` agent files now forbid putting any personal identifier in outbound requests.

## quiz-v2 fix rounds — round 1-3 (2026-11-01)

Cells are Batman/Alfred. ⚠ = |gap| ≥ 1.5.

| agent | model | correctness | scope | quality | verification | efficiency | avg B/A | avg gap |
|---|---|---|---|---|---|---|---|---|
| C1 core | opus | 8/8 | 9/8 | 9/8 | 9/9 | 8/7 | 8.6/8.0 | 0.6 |
| M1 numeric | haiku | 9/8 | 9/8 | 8/7 | 9/6 ⚠ | 10/9 | 9.0/7.6 | 1.4 |
| R7 content-fix | sonnet | 9/8 | 9/8 | 8/8 | 8/8 | 8/6 ⚠ | 8.4/7.6 | 0.8 |
| U1 play-ui | sonnet | 8/7 | 8/8 | 8/8 | 8/7 | 4/4 | 7.2/6.8 | 0.4 |
| U2 data-ui | sonnet | 8/8 | 9/8 | 8/8 | 8/6 ⚠ | 6/5 | 7.8/7.0 | 0.8 |

### Flagged gaps

- **M1 numeric** (haiku) · verification: Batman 9 vs Alfred 6 (gap +3)
  - Batman: 90/90 numeric questions re-spread, extremes 1%→48%, own verifier against a backup plus a change log; 60k tokens / 182 s; some distractors tight (astro-boy-03).
  - Alfred: Validator numeric ranks 25/27/26/25 (extremes 49%, target >=35%); my wider parse of 131 all-numeric questions gives 35/32/35/29, closest-to-mean 24.4%, no templated offsets (most common distractor offset set appears 3 times out of 131), distractors plausible (e.g. brainiac-01 1947/1952/1955/1958). 15 calls / 182 s. No check of its own beyond the validator.
  - Decision: Batman right. M1 wrote its own verifier against a backup, and it is on disk in its scratch folder (scratchpad/m1/: rebalance_numeric.py, backup/, change-log.json). Alfred was told not to read receipts and wasn't pointed at worker scratch folders, so he couldn't see it. Score stays 9. Process fix: Alfred's brief now names each worker's scratch folder as evidence.
- **R7 content-fix** (sonnet) · efficiency: Batman 8 vs Alfred 6 (gap +2)
  - Batman: Fixed facts with sources it opened; pushed back with live evidence where the critic was wrong (martian-manhunter-08, siddhant-arya-07); give-away marks were over-generous in round 1 (49) and were tightened later; copied text 36→0.
  - Alfred: validate-quiz --strict: 1080 q, 0 problems; no-knowledge strategies 23.8% longest, 24.3% shortest, 26.5% question-word overlap, 29.3% median-length (best); 18 questions checked against sources (Wikipedia action=raw): 17 confirmed in source, 1 true but not stated there (batman-06 Alfred 1943); longest why/source shared run 4 words over 12; giveawayOk 12/12 sampled honest (shared word is in every option).
  - Decision: Split. R7's first fix round cost 80 calls for ~200 edits; later rounds were very cheap (19 and 7). Batman revises to 7. Model stays sonnet.
- **U2 data-ui** (sonnet) · verification: Batman 8 vs Alfred 6 (gap +2)
  - Batman: Withheld rows, ties, trust queue with signals, core's own ruling messages; verified on real core data with 6 fans and 62 filler rows; faked one tight-band row (disclosed); slow rounds (1572 s, 986 s).
  - Alfred: /quiz/leaders serves the 'Facts known (first try)' label; board.tsx:16-28 withholds names ('Name withheld / awaiting a quick check', owner sees 'shows after a quick check') and shows ties in words; mod-quiz.tsx approveEffect matches core approve() caps (1.1x score, facts+30); TrustTimes table gives time/floor/margin per answer with Q21 signals. Mod page not browser-checked (needs mod login); 76 calls / 3,269 s for 3 pages.
  - Decision: Batman right on the evidence. U2 exercised /mod/quiz on its own throwaway server with a real mod and the live core (screenshots u2r3-mod-trust-* on disk). Alfred couldn't log in as a mod. The one faked tight-band row was disclosed. Score stays 8. Process fix: give Alfred a throwaway mod login recipe.

### Fix-round extra finding (Alfred)
- `QuizGame.tsx:860` still says the daily cap is "all played out on this network", which contradicts Q22 (the cap is per browser and per fan). This goes to U1 in the next fix round.

## Loop cap decision (quiz-v2)

The skill caps critic rounds at 8, and Batman extended this run to 10 (reports/quiz-design.md, Round-8
ruling), because the fix lists were concrete and getting shorter. Round 10 left one area at 7
(integrity), from a single bug: blind flood games' results showed on /quiz/me. Plus three small items.
Decision: fix those and run a **scoped verification critic** (fresh Opus) that re-checks only the round-10
items and the areas they touch, instead of an 11th full round. Its result is recorded under the quality
table in reports/quiz-quality.md.

## quiz-v2 fix rounds — round 4-9 (2026-11-01)

Cells are Batman/Alfred. ⚠ = |gap| ≥ 1.5.

| agent | model | correctness | scope | quality | verification | efficiency | avg B/A | avg gap |
|---|---|---|---|---|---|---|---|---|
| B0 batman (orchestrator) | opus | 7/6 | 8/7 | 7/7 | 7/5 ⚠ | 6/6 | 7.0/6.2 | 0.8 |
| C1 core | opus | 9/7 ⚠ | 9/8 | 9/7 ⚠ | 9/7 ⚠ | 9/8 | 9.0/7.4 | 1.6 |
| R7 content-fix | sonnet | 8/7 | 9/8 | 8/7 | 8/6 ⚠ | 9/6 ⚠ | 8.4/6.8 | 1.6 |
| U1 play-ui | sonnet | 8/8 | 8/8 | 8/7 | 7/6 | 8/8 | 7.8/7.4 | 0.4 |
| U2 data-ui | sonnet | 8/7 | 9/8 | 8/7 | 8/6 ⚠ | 6/5 | 7.8/6.6 | 1.2 |

### Flagged gaps

- **B0 batman (orchestrator)** (opus) · verification: Batman 7 vs Alfred 5 (gap +2)
  - Batman: Self-score. Plan, contracts and rulings drove 10 rounds; own errors: Q20 IP-block ruling (carrier NAT, caught by C1), the dock CSS rule hiding the tab bar, a leak matcher too weak twice, contracts without error codes and signal strength (UI matched text), and shared scratch at the start.
  - Alfred: Q23–Q26 are coherent and Q22 frankly fixed an IP-as-block error. But rulings flip-flopped: the Q18 tight-band gate became a signal in Q23c, then got a narrower σ in Q24. The validator kept trailing the critics: half-names (round 8), then years and lowercase words (round 9). Sibling leaks fail only under --strict (validate-quiz.ts), and prebuild runs without it. The mini-quiz check needs Jaccard ≥0.6, which misses 46 same-answer copies. The data-no-dock shell rule hid the phone tab bar (a round-8 regression). It raised the critic cap from 8 to 10 itself.
  - Decision: Alfred right. The prebuild ran the validator without --strict, so leak checks never gated the build. The matcher missed classes of leak twice (rounds 8 and 9), and the mini-quiz check was too loose (46 same-fact copies slipped through). Batman revises his own verification to 5. Action: prebuild now runs --strict, and the mini-quiz check matches on answer, not wording.
- **C1 core** (opus) · correctness: Batman 9 vs Alfred 7 (gap +2)
  - Batman: Resume, rank-the-fan, per-board approvals, Q25 leak-graph ordering, Q26; a test per repro (107 quiz tests), a sim-calibration test on the real bank; measured and reported the content consequence (24 short character games) before anyone asked; 6–19 calls per round.
  - Alfred: 107/107 quiz tests and typecheck pass. On my own prod server, Q23a resume, Q24 held approval ('no cap set') and Q26 blind reveals (correct/why/answer null) all work, and 40 live games (394 questions) had 0 earlier questions printing a later answer (Q25). Q26 hole: fanStats (quiz.ts:1683) skips only today's blind dailies, not flood-blind games. So /quiz/me shows a blind Anime game as '10 / 10 right 2,427' and gives per-universe accuracy (Desi 0% after an all-wrong blind game). That is a right/wrong oracle, and the test at test:2974 only checks factsMastered. quiz.ts is 2,432 lines.
  - Decision: Alfred right on the defect. Blind (Q26) games showed their results on /quiz/me, untested; C1 built Q26 but didn't follow it through to fanStats. Given the amount of correct work, Batman revises correctness to 8. Model stays opus.
- **C1 core** (opus) · quality: Batman 9 vs Alfred 7 (gap +2)
  - Batman: Resume, rank-the-fan, per-board approvals, Q25 leak-graph ordering, Q26; a test per repro (107 quiz tests), a sim-calibration test on the real bank; measured and reported the content consequence (24 short character games) before anyone asked; 6–19 calls per round.
  - Alfred: 107/107 quiz tests and typecheck pass. On my own prod server, Q23a resume, Q24 held approval ('no cap set') and Q26 blind reveals (correct/why/answer null) all work, and 40 live games (394 questions) had 0 earlier questions printing a later answer (Q25). Q26 hole: fanStats (quiz.ts:1683) skips only today's blind dailies, not flood-blind games. So /quiz/me shows a blind Anime game as '10 / 10 right 2,427' and gives per-universe accuracy (Desi 0% after an all-wrong blind game). That is a right/wrong oracle, and the test at test:2974 only checks factsMastered. quiz.ts is 2,432 lines.
  - Decision: Split: the defect above counts against quality too. Revised to 8.
- **C1 core** (opus) · verification: Batman 9 vs Alfred 7 (gap +2)
  - Batman: Resume, rank-the-fan, per-board approvals, Q25 leak-graph ordering, Q26; a test per repro (107 quiz tests), a sim-calibration test on the real bank; measured and reported the content consequence (24 short character games) before anyone asked; 6–19 calls per round.
  - Alfred: 107/107 quiz tests and typecheck pass. On my own prod server, Q23a resume, Q24 held approval ('no cap set') and Q26 blind reveals (correct/why/answer null) all work, and 40 live games (394 questions) had 0 earlier questions printing a later answer (Q25). Q26 hole: fanStats (quiz.ts:1683) skips only today's blind dailies, not flood-blind games. So /quiz/me shows a blind Anime game as '10 / 10 right 2,427' and gives per-universe accuracy (Desi 0% after an all-wrong blind game). That is a right/wrong oracle, and the test at test:2974 only checks factsMastered. quiz.ts is 2,432 lines.
  - Decision: Alfred right. There was no test of the blind-game player view. Revised to 7.
- **R7 content-fix** (sonnet) · verification: Batman 8 vs Alfred 6 (gap +2)
  - Batman: Fixed every validator list in 1–2 passes with zero siblingOk marks, and replaced 22 mini-quiz copies with sourced facts; round-7 rewrites left half-name leaks (they passed Batman's weak matcher) and parmanu-03 cited the wrong source.
  - Alfred: The validator passes with --strict: 1080 questions, 0 problems, 0 question-text sibling leaks. My plural and 2-digit probe also found 0. parmanu-03 'Bufalo' now matches the Wikipedia raw text. Churn: the round-7 rewrites left half-name leaks (found in round 8), and the round-8 parmanu-03 rewrite was wrong until round 9. It fixed only the 22 flagged mini-quiz copies. 46 bank questions still ask the same fact with the same answer as the character-page mini-quiz, which ships its answers to the browser (e.g. sinestro-01 Korugar, raven-01 Trigon, superman-07 Doomsday).
  - Decision: Split. R7 checked against the validator, which was weak. Its round-7 rewrites passed it yet left half-name leaks, so its own reading should have caught them. Revised to 7.
- **R7 content-fix** (sonnet) · efficiency: Batman 9 vs Alfred 6 (gap +3)
  - Batman: Fixed every validator list in 1–2 passes with zero siblingOk marks, and replaced 22 mini-quiz copies with sourced facts; round-7 rewrites left half-name leaks (they passed Batman's weak matcher) and parmanu-03 cited the wrong source.
  - Alfred: The validator passes with --strict: 1080 questions, 0 problems, 0 question-text sibling leaks. My plural and 2-digit probe also found 0. parmanu-03 'Bufalo' now matches the Wikipedia raw text. Churn: the round-7 rewrites left half-name leaks (found in round 8), and the round-8 parmanu-03 rewrite was wrong until round 9. It fixed only the 22 flagged mini-quiz copies. 46 bank questions still ask the same fact with the same answer as the character-page mini-quiz, which ships its answers to the browser (e.g. sinestro-01 Korugar, raven-01 Trigon, superman-07 Doomsday).
  - Decision: Alfred right. Rework counts: rewrites made new leaks that later rounds had to fix, and Batman's per-call view hid that. Revised to 7.
- **U2 data-ui** (sonnet) · verification: Batman 8 vs Alfred 6 (gap +2)
  - Batman: Mod tabs/paging, grouped cards per game and per fan/day, typed signals, held-only /quiz/me fix; always verified on a throwaway server with the live core; slow rounds (990–1454 s) for small pages.
  - Alfred: The grouped held card ('+1 more held today'), strong/weak signals and the floor table check out live, and after one approval the next card surfaces. Axe is clean on /mod/quiz and /quiz/me at 375. But quiz-me.tsx never calls useNoDock, unlike quiz.tsx:86, quiz-play.tsx:75 and quiz-leaders.tsx:85, so the theme dock covers the 'Facts known board: not ranked y…' pill. Its own u2r9-me-held-only-phone.png shows this and it shipped anyway. The no-dock effect is copy-pasted inline in 3 routes. Rounds 4–7 took 990–1454 s each.
  - Decision: Alfred right. U2's own screenshot shows the dock covering the Facts known pill on /quiz/me, and it shipped anyway. Revised to 6. Model stays sonnet; brief future UI workers to look at their screenshots, not just take them.

### Rounds 4–9 extra findings (Alfred) routed to the final fix
- Prebuild must run `validate-quiz --strict` (Batman).
- 46 bank questions ask the same fact with the same answer as the character-page mini-quiz, whose answers ship to the browser. The check now matches same character + same answer, and R7 replaces them.
- /quiz/me shows the theme dock over the Facts known pill (U2).
- U1's checks print values but assert nothing, and there is no quiz e2e test. U1 now writes test/e2e/4-quiz.spec.ts.
