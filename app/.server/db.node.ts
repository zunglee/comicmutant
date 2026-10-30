/** Node-only SQLite driver + migration runner. Imported lazily by db.ts#getSql. */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations';

export { assertProductionEnv } from './env';

export const defaultDbPath = () => path.resolve('data/comicmutant.db');

export function migrate(db: Database.Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const done = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((r) => r.id),
  );
  for (const [i, sql] of MIGRATIONS.entries()) {
    const id = i + 1;
    if (done.has(id)) continue;
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(
        id,
        new Date().toISOString(),
      );
    })();
  }
}

export function openSqlite(file: string): Database.Database {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
