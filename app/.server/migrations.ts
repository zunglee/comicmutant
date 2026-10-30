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
];
