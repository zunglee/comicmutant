/** Append-only. Never edit a shipped entry; add a new one. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'fan' CHECK (role IN ('fan', 'mod')),
    avatar TEXT,
    banned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- A "take": a short opinion on a character page or one side of a Versus debate.
  CREATE TABLE takes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target TEXT NOT NULL,            -- 'c:<slug>' | 'v:<id>'
    side TEXT CHECK (side IN ('a', 'b')),
    body TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX takes_target ON takes(target, hidden, created_at);

  CREATE TABLE reactions (
    take_id INTEGER NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    PRIMARY KEY (take_id, user_id)
  );

  CREATE TABLE reports (
    take_id INTEGER NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (take_id, user_id)
  );

  CREATE TABLE versus (
    id INTEGER PRIMARY KEY,
    a TEXT NOT NULL,                 -- character slug
    b TEXT NOT NULL,
    prompt TEXT NOT NULL,            -- key into VERSUS_PROMPTS
    official INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    UNIQUE (a, b, prompt)
  );

  CREATE TABLE votes (
    versus_id INTEGER NOT NULL REFERENCES versus(id) ON DELETE CASCADE,
    voter TEXT NOT NULL,             -- 'u:<id>' or anonymous visitor hash
    side TEXT NOT NULL CHECK (side IN ('a', 'b')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (versus_id, voter)
  );

  CREATE TABLE throttle (bucket TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX throttle_bucket ON throttle(bucket, at);
  `,
  `
  CREATE TABLE scores (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    winner TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX scores_game ON scores(game, score DESC);
  `,
  `
  -- Security/scale pass (reports/2026-10-30-build.md § Reviews).
  ALTER TABLE users ADD COLUMN skeleton TEXT;
  UPDATE users SET skeleton = lower(replace(name, '_', ''));
  CREATE UNIQUE INDEX users_skeleton ON users(skeleton) WHERE skeleton IS NOT NULL;
  DROP TABLE throttle;
  -- Fixed-window counters: one upsert per check, swept by window index.
  CREATE TABLE throttle (
    bucket TEXT NOT NULL,
    win INTEGER NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (bucket, win)
  ) WITHOUT ROWID;
  CREATE INDEX throttle_win ON throttle(win);
  CREATE INDEX sessions_expires ON sessions(expires_at);
  CREATE INDEX takes_user ON takes(user_id, created_at);
  ALTER TABLE takes ADD COLUMN mod_cleared INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE versus ADD COLUMN votes_a INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE versus ADD COLUMN votes_b INTEGER NOT NULL DEFAULT 0;
  UPDATE versus SET
    votes_a = (SELECT COUNT(*) FROM votes WHERE versus_id = versus.id AND side = 'a'),
    votes_b = (SELECT COUNT(*) FROM votes WHERE versus_id = versus.id AND side = 'b');
  ALTER TABLE versus ADD COLUMN score INTEGER GENERATED ALWAYS AS (votes_a + votes_b) VIRTUAL;
  CREATE INDEX versus_hot ON versus(official DESC, score DESC, id DESC);
  -- Reaction tallies per take, kept by react(); a new reaction kind needs no migration.
  CREATE TABLE reaction_counts (
    take_id INTEGER NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (take_id, kind)
  ) WITHOUT ROWID;
  INSERT INTO reaction_counts (take_id, kind, n)
    SELECT take_id, kind, COUNT(*) FROM reactions GROUP BY take_id, kind;
  CREATE INDEX takes_flagged ON takes(hidden DESC, reports DESC) WHERE reports > 0 OR hidden = 1;
  CREATE TABLE mod_actions (
    id INTEGER PRIMARY KEY,
    mod_id INTEGER NOT NULL REFERENCES users(id),
    take_id INTEGER,
    target_user INTEGER,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  -- Efficiency re-audit: newest-first take pages served straight from the index (rowid = id).
  CREATE INDEX takes_page ON takes(target, hidden, id);
  CREATE INDEX takes_page_side ON takes(target, side, hidden, id);
  `,
  `
  -- Freefall: verified runs (app/.server/freefall.ts). One ranked daily run per player per level.
  CREATE TABLE freefall_runs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('daily', 'practice')),
    level TEXT NOT NULL CHECK (level IN ('easy', 'normal', 'hard')),
    day TEXT NOT NULL,
    seed INTEGER NOT NULL,
    score INTEGER NOT NULL,
    floors INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    asked INTEGER NOT NULL,
    saved INTEGER NOT NULL,
    best INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,     -- run-token signature: a token posts once
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX freefall_daily_once ON freefall_runs(user_id, level, day) WHERE mode = 'daily';
  CREATE INDEX freefall_daily_board ON freefall_runs(mode, level, day, score DESC);
  CREATE INDEX freefall_user_best ON freefall_runs(user_id, level, score DESC);
  CREATE INDEX freefall_level_score ON freefall_runs(level, score DESC);
  `,
  `
  -- Freefall anti-cheat (critic round 1): rubble hits kept for review; runs held for a mod's look
  -- (review 1 = waiting, 2 = rejected); daily starts counted per fan/device (only the first ranks).
  ALTER TABLE freefall_runs ADD COLUMN hits INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE freefall_runs ADD COLUMN review INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX freefall_review ON freefall_runs(review) WHERE review = 1;
  CREATE TABLE freefall_starts (
    who TEXT NOT NULL,              -- keyed hash of 'u:<id>' or 'g:<guest cookie>'
    level TEXT NOT NULL,
    day TEXT NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (who, level, day)
  ) WITHOUT ROWID;
  `,
  `
  -- Freefall review material (critic round 5): why a run was held, the run's sum seed and its input
  -- log (kept for held runs only, for the mod's replay), people in reach and pauses.
  ALTER TABLE freefall_runs ADD COLUMN qseed INTEGER;
  ALTER TABLE freefall_runs ADD COLUMN reasons TEXT;
  ALTER TABLE freefall_runs ADD COLUMN log TEXT;
  ALTER TABLE freefall_runs ADD COLUMN people INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE freefall_runs ADD COLUMN pauses INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Freefall (critic round 6): review 3 = approved by a mod (podium names show only when approved);
  -- end-of-run pings for the wall-clock check.
  CREATE TABLE freefall_ends (sig TEXT PRIMARY KEY, at INTEGER NOT NULL) WITHOUT ROWID;
  `,
  `
  -- Freefall (critic round 7): progress pings for the wall-clock check; the run's wall/game pace.
  CREATE TABLE freefall_ticks (sig TEXT NOT NULL, at INTEGER NOT NULL, step INTEGER NOT NULL);
  CREATE INDEX freefall_ticks_sig ON freefall_ticks(sig);
  ALTER TABLE freefall_runs ADD COLUMN pace REAL;
  CREATE INDEX freefall_trusted ON freefall_runs(user_id) WHERE review = 3;
  `,
  `
  -- Freefall (critic round 9): the end ping names its step; pause time per run (long pauses wait for
  -- a look even within a player's trust cap).
  ALTER TABLE freefall_ends ADD COLUMN step INTEGER;
  ALTER TABLE freefall_runs ADD COLUMN pause_ms INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Freefall (critic round 11): wall-clock doubts are a soft flag (name withheld only where it's
  -- worth having), not a hold.
  ALTER TABLE freefall_runs ADD COLUMN flag INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Fact Frenzy (reports/quiz-design.md): server-scored facts quiz. The server keeps the answers and
  -- the clock; a game row is the whole state (which questions, how each one's options were shuffled,
  -- where the player is). Times are epoch ms.
  CREATE TABLE quiz_games (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- set at start (fan) or on claim (guest)
    owner TEXT NOT NULL,            -- 'u<id>' | 'g<keyed hash of the guest cookie>'; bound into the token
    mode TEXT NOT NULL CHECK (mode IN ('daily', 'universe', 'character')),
    universe TEXT,
    character TEXT,
    day TEXT NOT NULL,              -- IST day the game started
    questions TEXT NOT NULL,        -- JSON: question ids in order
    perms TEXT NOT NULL,            -- JSON: per question, shown position → option index as written
    total INTEGER NOT NULL,
    pos INTEGER NOT NULL DEFAULT 0, -- the one question that can be answered now
    served_at INTEGER NOT NULL,     -- when that question was served (0 = not asked for yet)
    score INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    total_ms INTEGER NOT NULL DEFAULT 0,
    attempt INTEGER NOT NULL DEFAULT 1, -- daily: which start of the day this is (fan or browser)
    ranked INTEGER NOT NULL DEFAULT 0,
    review INTEGER NOT NULL DEFAULT 0,  -- 0 clean, 1 held, 2 rejected, 3 approved
    reasons TEXT,
    new_facts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE UNIQUE INDEX quiz_daily_once ON quiz_games(user_id, day) WHERE mode = 'daily' AND ranked = 1;
  CREATE INDEX quiz_daily_board ON quiz_games(day, score DESC) WHERE mode = 'daily' AND ranked = 1;
  CREATE INDEX quiz_universe_board ON quiz_games(universe, score DESC)
    WHERE mode = 'universe' AND ranked = 1;
  CREATE INDEX quiz_games_user ON quiz_games(user_id, finished_at);
  CREATE INDEX quiz_games_owner ON quiz_games(owner, day);
  CREATE INDEX quiz_games_held ON quiz_games(review) WHERE review = 1;
  CREATE INDEX quiz_games_finished ON quiz_games(finished_at);

  CREATE TABLE quiz_answers (
    game_id INTEGER NOT NULL REFERENCES quiz_games(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    choice INTEGER NOT NULL,        -- option index as written; -1 = timed out
    correct INTEGER NOT NULL,
    ms INTEGER NOT NULL,            -- server-measured, capped at the limit
    points INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (game_id, idx)      -- one answer per question: a replayed call can't score twice
  ) WITHOUT ROWID;
  CREATE INDEX quiz_answers_question ON quiz_answers(question_id);

  CREATE TABLE quiz_question_stats (
    question_id TEXT PRIMARY KEY,
    served INTEGER NOT NULL DEFAULT 0,
    answered INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    total_ms INTEGER NOT NULL DEFAULT 0
  ) WITHOUT ROWID;

  -- Distinct facts a fan has got right (from finished games that aren't held or rejected).
  CREATE TABLE quiz_mastered (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    universe TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, question_id)
  ) WITHOUT ROWID;
  CREATE INDEX quiz_mastered_at ON quiz_mastered(at);

  CREATE TABLE quiz_reports (
    id INTEGER PRIMARY KEY,
    question_id TEXT NOT NULL,
    game_id INTEGER NOT NULL REFERENCES quiz_games(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    note TEXT,
    at INTEGER NOT NULL,
    UNIQUE (game_id, idx)
  );
  CREATE INDEX quiz_reports_question ON quiz_reports(question_id);

  CREATE TABLE quiz_retired (question_id TEXT PRIMARY KEY, at INTEGER NOT NULL) WITHOUT ROWID;
  `,
  `
  -- Fact Frenzy round 1 (Q12, Q13): every question an owner ('u<id>' or 'g<guest hash>') has been
  -- shown, with the game that first showed it — "facts known" counts only first-sight right answers,
  -- and a guest browser's history merges into the fan's. The shown option a player sent, so an
  -- identical resend gets its stored reveal back.
  CREATE TABLE quiz_seen (
    who TEXT NOT NULL,
    question_id TEXT NOT NULL,
    first_game INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (who, question_id)
  ) WITHOUT ROWID;
  INSERT OR IGNORE INTO quiz_seen (who, question_id, first_game, at)
    SELECT g.owner, a.question_id, a.game_id, a.at
      FROM quiz_answers a JOIN quiz_games g ON g.id = a.game_id ORDER BY a.at;
  ALTER TABLE quiz_answers ADD COLUMN sent INTEGER;
  `,
  `
  -- Fact Frenzy round 2 (Q16–Q18): the browser that started a game (no daily beside an open ranked
  -- one, from the same fan or browser); tight-band flags (1 flagged, 2 cleared by a mod); fans a mod
  -- has cleared (trusted: names show in gated places); daily starts per network per IST day.
  ALTER TABLE quiz_games ADD COLUMN browser TEXT;
  ALTER TABLE quiz_games ADD COLUMN flag INTEGER NOT NULL DEFAULT 0;
  UPDATE quiz_games SET browser = owner WHERE owner LIKE 'g%';
  CREATE INDEX quiz_games_browser ON quiz_games(browser, day);
  CREATE INDEX quiz_games_flagged ON quiz_games(flag) WHERE flag = 1;
  CREATE INDEX quiz_games_approved ON quiz_games(user_id) WHERE review = 3;
  CREATE TABLE quiz_trust (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL
  );
  CREATE TABLE quiz_daily_ip (
    who TEXT NOT NULL,              -- keyed hash of the client IP
    day TEXT NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (who, day)
  ) WITHOUT ROWID;
  `,
  `
  -- Fact Frenzy round 3 (Q19–Q21): one open game per fan, browser and (dailies) network — starting
  -- another ends it as abandoned, and partial unique indexes keep racing starts to one; the client
  -- IP's keyed hash per game (scouting signals); when a mod ruled; per-board trust caps (quiz_trust,
  -- "clear fan", is retired: names in gated places now need an approval per game or within a cap).
  ALTER TABLE quiz_games ADD COLUMN abandoned_at INTEGER;
  ALTER TABLE quiz_games ADD COLUMN ip TEXT;
  ALTER TABLE quiz_games ADD COLUMN ruled_at INTEGER;
  UPDATE quiz_games SET abandoned_at = created_at WHERE finished_at IS NULL;
  CREATE UNIQUE INDEX quiz_open_user ON quiz_games(user_id)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND user_id IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_browser ON quiz_games(browser)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND browser IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_daily_ip ON quiz_games(ip)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode = 'daily' AND ip IS NOT NULL;
  CREATE INDEX quiz_games_ip ON quiz_games(ip, day);
  CREATE TABLE quiz_caps (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board TEXT NOT NULL,            -- 'u:<universe>' | 'facts'
    value INTEGER NOT NULL,         -- universe: last approved score (names up to 1.1×); facts: count (+30)
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, board)
  ) WITHOUT ROWID;
  DELETE FROM quiz_trust;
  `,
  `
  -- Fact Frenzy Q22 (revises Q16c/Q20): the IP is a signal, never a block — the per-IP open-daily
  -- lock and daily cap go. Two lanes per fan and per browser: one open daily, one open other game
  -- (partial unique indexes keep racing starts to one per lane). Daily starts are capped per fan and
  -- per browser ('u:<id>' / 'b:<guest tag>') each IST day.
  DROP INDEX quiz_open_user;
  DROP INDEX quiz_open_browser;
  DROP INDEX quiz_open_daily_ip;
  DROP TABLE quiz_daily_ip;
  CREATE UNIQUE INDEX quiz_open_daily_user ON quiz_games(user_id)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode = 'daily' AND user_id IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_daily_browser ON quiz_games(browser)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode = 'daily' AND browser IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_play_user ON quiz_games(user_id)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode != 'daily' AND user_id IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_play_browser ON quiz_games(browser)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode != 'daily' AND browser IS NOT NULL;
  CREATE TABLE quiz_daily_starts (
    who TEXT NOT NULL,
    day TEXT NOT NULL,
    n INTEGER NOT NULL,
    PRIMARY KEY (who, day)
  ) WITHOUT ROWID;
  `,
  `
  -- Fact Frenzy round 4 (Q23): lanes belong to the fan (any browser), or for a guest to the browser,
  -- so a fan's daily and a guest's blind daily in one browser no longer collide (a shared laptop's
  -- second fan ranks). The tight band is a mods' signal now, not a flag: clear flags it alone set.
  DROP INDEX quiz_open_daily_browser;
  DROP INDEX quiz_open_play_browser;
  CREATE UNIQUE INDEX quiz_open_daily_guest ON quiz_games(browser)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode = 'daily' AND user_id IS NULL
      AND browser IS NOT NULL;
  CREATE UNIQUE INDEX quiz_open_play_guest ON quiz_games(browser)
    WHERE finished_at IS NULL AND abandoned_at IS NULL AND mode != 'daily' AND user_id IS NULL
      AND browser IS NOT NULL;
  UPDATE quiz_games SET flag = 0, reasons = NULL
   WHERE flag = 1 AND review IN (0, 3) AND reasons LIKE 'tight band%' AND reasons NOT LIKE '%reading floor%';
  `,
  `
  -- Fact Frenzy round 5: approvals are per (game, board), never per game — approving a game for the
  -- facts board no longer names it on the daily podium. Existing approvals carry over to the game's
  -- own board (daily → daily, universe → universe, character → facts); flags stay 1 and are cleared
  -- per board by these rows.
  CREATE TABLE quiz_approvals (
    game_id INTEGER NOT NULL REFERENCES quiz_games(id) ON DELETE CASCADE,
    board TEXT NOT NULL CHECK (board IN ('daily', 'universe', 'facts')),
    at INTEGER NOT NULL,
    PRIMARY KEY (game_id, board)
  ) WITHOUT ROWID;
  INSERT OR IGNORE INTO quiz_approvals (game_id, board, at)
    SELECT id, CASE mode WHEN 'character' THEN 'facts' ELSE mode END, COALESCE(ruled_at, created_at)
      FROM quiz_games WHERE review = 3 OR flag = 2;
  UPDATE quiz_games SET flag = 1 WHERE flag = 2;
  `,
  `
  -- Fact Frenzy round 9 (Q26): a game played blind because its fan or browser had two pace-held
  -- games that IST day; and whether a game's own pace tripped the hold rules (ranked or not), which
  -- is what that count reads.
  ALTER TABLE quiz_games ADD COLUMN blind INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE quiz_games ADD COLUMN pace_held INTEGER NOT NULL DEFAULT 0;
  UPDATE quiz_games SET pace_held = 1
   WHERE reasons LIKE '%median answer under%' OR reasons LIKE '%faster than reading%';
  CREATE INDEX quiz_games_pace_held ON quiz_games(day, user_id) WHERE pace_held = 1;
  `,
];
