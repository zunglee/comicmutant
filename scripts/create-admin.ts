// Create a moderator: pnpm admin:create <nickname>  (password read from MOD_PASSWORD env)
import path from 'node:path';
import { createUser } from '../app/.server/auth';
import { sqliteSql } from '../app/.server/db';
import { openSqlite } from '../app/.server/db.node';

const name = process.argv[2];
const password = process.env.MOD_PASSWORD;
if (!name || !password) {
  console.error('usage: MOD_PASSWORD=... pnpm admin:create <nickname>');
  process.exit(1);
}
const sql = sqliteSql(
  openSqlite(process.env.COMICMUTANT_DB ?? path.resolve('data/comicmutant.db')),
);
const id = await createUser(sql, name, password, null, 'mod');
console.log(id ? `moderator ${name} created (#${id})` : 'name invalid/taken or password too short');
