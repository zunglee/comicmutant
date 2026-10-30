/**
 * The database seam. Everything above this file talks to `Sql`, an async three-method interface,
 * so the same queries run on better-sqlite3 locally and on Cloudflare D1 later (see `d1Sql`).
 */

export type Param = string | number | null | Uint8Array;

export interface Sql {
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
  get<T>(sql: string, params?: Param[]): Promise<T | undefined>;
  run(sql: string, params?: Param[]): Promise<{ changes: number; lastId: number }>;
}

import type Database from 'better-sqlite3';

// The better-sqlite3 adapter lives in db.node.ts and is imported lazily below, so nothing in
// the route graph pulls the native driver (a Workers build swaps getSql for the D1 adapter).
export function sqliteSql(db: Database.Database): Sql {
  return {
    async all<T>(sql: string, params: Param[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: Param[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async run(sql: string, params: Param[] = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
    },
  };
}

/** Minimal D1 shape, so this file needs no Cloudflare types. */
interface D1Like {
  prepare(sql: string): {
    bind(...v: Param[]): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
    };
  };
}

/** Cloudflare D1 adapter for the Workers deploy. Not used locally. */
export function d1Sql(d1: D1Like): Sql {
  return {
    async all<T>(sql: string, params: Param[] = []) {
      return (
        await d1
          .prepare(sql)
          .bind(...params)
          .all<T>()
      ).results;
    },
    async get<T>(sql: string, params: Param[] = []) {
      return (
        (await d1
          .prepare(sql)
          .bind(...params)
          .first<T>()) ?? undefined
      );
    },
    async run(sql: string, params: Param[] = []) {
      const r = await d1
        .prepare(sql)
        .bind(...params)
        .run();
      return { changes: r.meta.changes, lastId: r.meta.last_row_id };
    },
  };
}

let cached: Promise<Sql> | undefined;
let seeded: Promise<void> | undefined;

/** Process-wide connection. The first call also seeds the official Versus debates. */
export async function getSql(): Promise<Sql> {
  cached ??= import('./db.node').then((m) => {
    const { assertProductionEnv } = m;
    assertProductionEnv();
    return sqliteSql(m.openSqlite(process.env.COMICMUTANT_DB ?? m.defaultDbPath()));
  });
  const sql = await cached;
  // A failed seed (e.g. SQLITE_BUSY) is retried on the next request, never cached as fatal.
  seeded ??= import('./seed')
    .then((m) => m.seedIfEmpty(sql))
    .catch((e) => {
      seeded = undefined;
      console.error('[seed] failed, will retry', e);
    });
  await seeded;
  return sql;
}
