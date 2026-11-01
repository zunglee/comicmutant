# Fact Frenzy — design (Batman run `quiz-v2`, 2026-11-01)

Owner ask: a facts + options quiz per universe and per character, questions researched on the web; a
funky, animated UI, iterated until it's good; store player info and analytics; show leaderboards.

## Goal and non-goals

- **Goal:** `/quiz` — a server-scored 4-option quiz over the 108 published characters, with a daily
  challenge, per-universe and per-character games, personal analytics, site analytics for mods, and
  three leaderboards.
- **Not:** the arena "Quiz Duel" (stays as is, CM originals only); no new IP rules — real names appear in
  quiz text only (Hybrid IP), never drawn.

## Decisions

- **Q1 — Server keeps the answers.** The bank is server-only. `/api/quiz/start` returns one question with
  shuffled options and no answer; `/api/quiz/answer` checks it, returns the reveal and the next question.
  Time is measured on the server (served → answered), 15 s + 1.5 s grace. One answer per question, in
  order. The character-page mini-quiz (answers in page data) is not part of the bank.
- **Q9 — The clock starts when the player asks for the question** (found by U1 before round 1). The
  answer reply carries only the reveal; `POST /api/quiz/next` serves the next question and stamps its
  start time; a repeat call returns the same question without resetting the clock. Otherwise reading a
  long `why` ate into the next question's 15 s, and shipping the next question with the reveal would let
  a player read it before its clock started.
- **Q2 — Modes.** *Daily:* 10 questions, the same for everyone that IST day (seeded), mixed universes; only
  a signed-in fan's first attempt ranks. *Universe:* 10 questions from that universe, difficulty mix
  3×1, 4×2, 3×3. *Character:* up to 10 from that character. Within a mode, prefer questions the player
  hasn't seen.
- **Q3 — Points.** Right = (100 + speed bonus 0–50, linear over the 15 s) × difficulty (1, 1.5, 2), +25 per
  answer in a streak beyond the 2nd. Wrong / timeout = 0 and the streak resets.
- **Q4 — Boards.** *Daily* (today's first attempts, score, ties → faster total time). *Universe best*
  (best universe-mode game per fan per universe, all-time and this week). *Facts mastered* (distinct
  questions a fan has ever got right — replaying the same quiz can't farm it). The viewer's own row is
  always shown.
- **Q5 — Integrity.** Answers are revealed after each question, so a bot could learn the bank over many
  games. Guard: games with an inhuman pace (median answer < 1.5 s, or 10/10 with every answer < 2.5 s) are
  **held** — excluded from boards, the owner sees "held for a quick check", mods approve/reject in
  `/mod/quiz`. Rate limits on start/answer. Guests play everything; results reach boards only after they
  join and claim the game (30 min window, same guest cookie).
- **Q6 — Analytics.** Per fan: games, accuracy (overall, per universe, per topic, per difficulty), best
  streak, facts mastered, average answer time, weakest characters, last 10 games. Per question: served,
  right %, average time → "Only 23% of fans got this" after the reveal (shown from 20 answers). Site (mods):
  plays per day (14 days), by mode/universe, hardest/easiest questions, reported facts queue.
- **Q7 — Reports.** Every reveal has "This fact looks wrong" → `quiz_reports`; mods see it with the source
  and can retire a question (retired ids never serve again).
- **Q8 — Content rules.** 8–14 questions per character (target 10), ≥4 topics, ≥2 of each difficulty, a
  source URL per question that the researcher opened, own words only, wrong options of the same kind as the
  answer (years with years, names with names). `pnpm tsx scripts/validate-quiz.ts` must pass.

## Round-1 rulings (critic round 1 scored integrity 5, question quality 6)

- **Q10 — The daily keeps its answers until midnight IST.** During the day a daily reveal says right or
  wrong only. A right answer still shows its `why` (you knew it, so it teaches nothing new). A wrong or
  timed-out one says "Answer unlocks at midnight IST" and shows no answer or `why`. The hub shows
  **Yesterday's answers** (all 10 questions, answers, whys, sources, % of fans right). This kills
  scouting the daily from a second browser. A daily game started as a guest never ranks, even if claimed,
  because it could be a scout. Every player still gets the same 10 questions (it's the shared puzzle).
  *Rejected:* a per-player pool of about 40 (it only multiplies the scouting) and hiding every reveal
  (the `why` is the fun of the other modes).
- **Q11 — Pace hold uses reading time.** Each right answer gets a floor of 0.8 s plus the question's
  characters ÷ 45 per second (a skim of the question; the options are short). A ranked game is held when
  at least 3 right answers beat their floor, or the existing median rule fires. Only **ranked** games are
  held, and only they enter the mod queue. Unranked practice is never held and never shows "held" copy.
  C1 calibrates the numbers in a test so honest fast play (a fan who knows it: about 2–4 s on short
  questions) isn't held.
- **Q12 — "Facts known" replaces "facts mastered".** A fact counts only when a signed-in fan gets it right
  the **first time they ever see it**. Anything already revealed to them doesn't count, and that includes
  questions seen as a guest in the same browser (guest history merges into the account on claim or sign
  in). The board is renamed "Facts known (first try)". This stops answer-farming by replay. Scouting from
  another cookie can't be fully stopped. The Q11 pace hold and per-IP limits make it slow, and the
  residual risk is written down.
- **Q13 — A lost answer can be resent.** Sending the identical answer for an already-answered question
  returns the stored reveal (no double points). A different choice is refused.
- **Q14 — Fairness and copy.** Timeout grace goes from 1.5 s to 2.5 s (it absorbs network delay; the speed
  bonus still uses server time). A timeout says "Time's up", not "answered in 15.0 s". Ties share a rank
  (times rounded to 0.1 s; equal values share the rank). The end screen names the board the rank is on,
  or shows none. The weakest-characters list only shows characters under 70%. Mod totals count answered
  questions, not served ones.
- **Q15 — Bank fixes.** Numeric distractors are re-spread so a year or number answer is the lowest,
  2nd, 3rd or highest option about equally often (validator check: across the bank, the extremes ≥ 35%
  of numeric answers). About 35 give-away questions get rewritten (the validator now lists any answer
  word of 5+ letters that appears in the question or character name). Content fixes from the critic and
  Alfred are applied, and every `why` sharing 8+ words in a row with its source is rewritten.

## Round-2 rulings (critic round 2 scored integrity 4)

A quiz whose answers the server must reveal can't stop a determined person with several accounts or
browsers. That is the same as googling. The goal is to stop one person in one browser getting a top
place in minutes, and to make sure no name reaches a top place without a person having looked. Freefall
learned this the hard way (freefall-design D-rulings).

- **Q16 — Daily scouting.** (a) While a fan or browser has an unfinished ranked daily, no other daily
  starts (`start` refuses with a message). (b) A daily that can't rank (a guest's, or a fan's second or
  later try) is **blind**: each answer locks in with no right/wrong (`correct: null`, `blind: true`), and
  the end shows the score only. Per-question results unlock at midnight with Yesterday's answers.
  (c) Daily starts are capped at 6 per IP per IST day. (d) A day's 10 never include yesterday's ids, and
  a stand-in for a retired question is never one of today's ids. Guests get the full fun of reveals in
  universe and character modes. The daily's blind practice copy says so and invites them to join.
- **Q17 — Names wait for a look (display-time gating).** Every game keeps its real place. A fan's name
  shows in a **gated place** (today's daily top 3, each universe board's top 3 all-time and this week,
  facts known top 10) only once that fan is **trusted**, meaning a mod has approved one of their games
  or cleared them. Until then the row reads "Name withheld · awaiting a quick check". The owner always
  sees their own name, plus a line saying it shows after a quick check. An untrusted fan entering a gated
  place goes into the mod **trust queue** with their best game, its answer times and the reasons. A
  rejection (or "reject all by player") removes their games from the boards and revokes trust. Approved
  games can be revoked.
- **Q18 — Pace and farming.** The hold rule stays. Add a soft **tight-band flag**: at least 6 right
  answers whose time over the floor varies by less than 0.6 s (std dev) sends the game to the trust queue,
  even for a trusted fan. Facts-known credit is capped at 120 a fan per IST day. A claimed guest daily
  earns no facts. `fanStats` counts only finished games, and timeouts count as answered but don't enter
  the average time.

## Round-3 rulings (critic round 3: integrity 5; untrusted gating held, trust-forever was the hole)

- **Q19 — Trust is capped per board, and the daily podium is per game.** A daily top-3 name needs *that
  game* approved; there is no carry-over trust (it's 3 looks a day). Universe and facts boards use
  Freefall's trust cap: a fan's name shows in a gated place only while the value is ≤ 1.1 × the value of
  their last approved game on that board (facts: ≤ last approved count + 30). Anything above goes back
  to the trust queue. "Clear fan" is gone. Approving a game sets that board's cap, and the confirmation
  says so. Revoking or rejecting resets the cap to 0. Only places the public boards actually show are
  gated or queued.
- **Q20 — One game at a time; nothing playable outside its day.** (a) Starting any game ends the owner's
  previous unfinished game as abandoned. The owner is the user, the browser cookie (now issued on every
  start, signed in too) and, for dailies, the IP. A partial unique index on open games makes this
  race-proof. (b) A ranked daily can't start from an IP or browser with another open daily. (c) A daily
  can't be answered or advanced once its IST day has ended ("This daily closed at midnight"). (d) A
  blind daily hides its score too ("Score unlocks at midnight").
- **Q21 — Bot signals and what mods see.** Add a near-floor rule: 4 or more right answers within 0.3 s of
  their floor flags the game, alongside the tight band. The trust queue shows **scouting signals** for
  each item: practice or blind dailies, or other games, from the same IP or browser that day, and how
  many of this game's questions the fan saw before.

## Q22 — revision of Q16c and Q20 (Batman's error, flagged by C1)

Q20 (and Q16c) used the client IP as a hard block. In India most phones sit behind carrier NAT, where
thousands of people share one IP. So one person's open daily would have blocked everyone else's ranked
daily, and 6 daily starts per IP per day would have run out for a whole carrier. Q20a also used up a fan's
ranked daily silently when they opened any other quiz. Revised:

- **The IP is a signal, never a block.** It stays in per-minute rate limits and in the trust queue's
  scouting signals. It is never used for daily caps or open-game locks. The daily cap is 6 starts per
  browser and per fan each IST day.
- **Daily and other modes are separate lanes.** A fan or browser can have one open daily and one open
  non-daily game. Starting a non-daily game ends only the previous non-daily one. Starting a daily while
  a daily is open is refused with a clear message ("Finish today's daily first"). Nothing silently
  forfeits a ranked daily.
- **Today's daily questions never appear in other modes** until the IST day ends. A parallel universe
  game therefore can't reveal a daily answer, which is the whole point of the lane rule.
- **Errors carry a stable `code`** (contract `QuizErrorCode`) so the UI never matches on text.

## Round-4 rulings (critic round 4: gated places hold; fairness to honest players is the gap)

- **Q23a — Resume, never lock out.** Starting a daily while your own daily is open **resumes** it. You
  get the same game token and the current question, with its clock still running from when it was first
  served (a clock that ran out counts as a timeout and play moves on). Quit on a daily says "Your daily
  stays open: come back to finish it". There is no error loop.
- **Q23b — Rank the fan, not the browser.** A fan's first daily of the day ranks, even if the browser
  played a blind daily as a guest or another fan used it. A blind daily shows questions but not answers,
  and a daily podium place always needs a per-game look (Q19). So the earlier browser play becomes a
  **scouting signal** on that game ("this browser played today's daily blind earlier"), not a block. The
  copy only states what is true.
- **Q23c — Tight band is a signal, not a gate.** Simulated honest experts trip it about 85% of the time,
  while jitter bots pass. It moves to `signals`. The hold (median) and near-floor rules stay as gates.
  Residual risk, accepted: a jitter bot can be named at places 4 and below. The top places still need a
  look.
- **Q23d — Fairness details.** (1) Rate limits key on the fan, or else the browser. The per-IP limit
  stays only as a high ceiling (600 a minute) against floods. (2) `nextQuestion` re-checks against
  *today's* daily set at serve time, so a game that crosses midnight never reveals the new day's
  questions. (3) Approving a game sets only that board's cap. The facts cap is set only by approving a
  facts-board trust item. If 1.1× is at or above the board's maximum possible score, the message says so
  ("covers any score on Marvel best").

## Round-6 ruling

- **Q24 — A held game's approval is for that game only.** Approving a game that was *held* for pace puts
  that game on its own board by name and credits its first-sight facts. It sets **no** cap: a bot-pace
  score must never cover a fan's future games. The card and the reply say exactly that. Signals count
  only **other fans'** games, and keep browser and IP apart: a shared browser is a strong signal, a shared
  IP is weak (carrier NAT). The tight band shows only when σ < 0.25 s. A held game is never a personal
  best.

## Round-8 ruling

- **Q25 — Serve the leaked question first.** Questions about one character naturally mention its real
  name, team and enemies, so a `why` (shown after answering) often prints another question's answer.
  Rewriting 300+ whys would make them vague. Instead the server orders each game by a **leak graph**:
  if A's question text or `why` prints B's answer, B is served before A. In a cycle, the game drops
  one of the pair. The graph is built once per bank load, within each universe, using the validator's
  matcher (`app/lib/quizleak.ts`, shared). The content rules stay strict where ordering can't help:
  no **question text** may print a sibling's answer (it is visible before answering), and no bank
  question may copy the character page's mini-quiz, whose answers ship to the browser.
- **Loop cap.** The Batman skill caps critic rounds at 8. Round 8 left 3 areas at 7, with concrete,
  shrinking fix lists (UX: a tab-bar regression from the dock rule plus copy; mod: a self-history signal
  and totals; content: leaks found by a stronger validator). Batman extends the cap to 10 for this run.

## Round-9 ruling

- **Q26 — Held floods go blind.** A fan (or browser) with 2 held games in an IST day plays the rest of
  that day's games blind: answers lock in with no right/wrong and no `why`, so bot-pace games can't
  scout the bank for free. The mod's held tab groups one card per fan per day. The matcher (shared
  `app/lib/quizleak.ts`) now also treats year/number answers, a leading article ("A rabbit" →
  "rabbit") and lowercase distinctive words as leak terms. The site's first-visit intro and page
  transitions never play over a timed game screen.

## Final rulings (critic round 10 + Alfred rounds 4–9)

- **Q27 — The daily never serves a mini-quiz answer.** Character pages (and the arena Quiz Duel) ship
  their small quiz's answers to the browser. A bank question with the same answer for the same character
  (~130) is harmless in universe and character games, which reveal answers after each question anyway.
  It would only be a free answer on the **daily**, where answers stay locked. So the daily pool excludes
  them. The validator lists them as info, and near-copies (same question and same answer) still fail.
- **Blind means blind everywhere.** A blind game (a Q16 daily or a Q26 flood) shows no result on
  /quiz/me or anywhere else until its IST day ends.
- **The build enforces the content rules.** Prebuild runs `validate-quiz --strict`.

## Measured "done" targets

- ≥ 1,000 questions, all 108 characters covered, validator 0 problems.
- Critic fact spot-check: ≥ 95% of 40 random questions confirmed by their source.
- No answer index or `why` in any HTML/JSON the browser receives before the player answers.
- A replayed universe game can add 0 facts-mastered for already-mastered questions.
- Bot pace (all answers at 0.5 s) → held, never on a board.
- UI: 60 fps on question transitions (no long tasks > 50 ms on a mid phone profile), axe 0 serious, works
  at 375 px, keyboard 1–4 / A–D, reduced motion honoured.
- Every area ≥ 8 from a fresh critic.

## Contracts

- Bank files: `app/lib/quizbank-schema.ts` (zod) → `content/quiz/<universe>/<slug>.json`.
- Wire: `app/lib/quiz-contract.ts`. API: `POST /api/quiz/start | answer | claim | report`.

## Work table

| Piece | Agent | Model | Owns | Done-check |
|---|---|---|---|---|
| R1 Marvel A–I (17) | researcher | sonnet | `content/quiz/marvel/` first half | validator |
| R2 Marvel J–Z (17) | researcher | sonnet | `content/quiz/marvel/` second half | validator |
| R3 DC A–I (16) | researcher | sonnet | `content/quiz/dc/` first half | validator |
| R4 DC J–Z (16) | researcher | sonnet | `content/quiz/dc/` second half | validator |
| R5 Desi (20) | researcher | sonnet | `content/quiz/indian/` | validator |
| R6 Anime + Indie (22) | researcher | sonnet | `content/quiz/anime/`, `content/quiz/other/` | validator |
| C1 Core | core | opus | `app/.server/quiz.ts`, `app/.server/quizbank.ts`, `app/routes/api/quiz-*.ts`, one appended migration, `test/quiz-frenzy.test.ts` | unit tests, typecheck |
| U1 Play UI | builder | sonnet | `app/routes/quiz.tsx`, `app/routes/quiz-play.tsx`, `app/components/quiz/**`, quiz section of `app/app.css` | browser at 375/1280, axe |
| U2 Data UI | builder | sonnet | `app/routes/quiz-leaders.tsx`, `app/routes/quiz-me.tsx`, `app/routes/mod-quiz.tsx` | browser, axe |
| Batman | main | opus | contracts, `routes.ts`, nav, home CTA, sitemap, `scripts/validate*.ts`, docs | full suite |
| Critic | critic | opus | read-only, fresh each round | scores ≥ 8 |
| Alfred | alfred | opus | scorecard JSON only | — |
