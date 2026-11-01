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
];
