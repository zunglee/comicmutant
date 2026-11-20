// Validate content/polls.json: schema, ids, scopes, and S7 — Sacred India polls never rank a faith
// or a deity (reports/sacred-design.md). Usage: pnpm tsx scripts/validate-polls.ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkPolls } from '../app/lib/polls-schema';

const read = (f: string): unknown => JSON.parse(readFileSync(f, 'utf8'));
const roster = read('content/sacred/roster.json') as { slug: string; name: string }[];
const walk = (d: string): string[] =>
  existsSync(d)
    ? readdirSync(d).flatMap((f) => {
        const p = path.join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
      })
    : [];
const characterSlugs = new Set(
  walk('content/characters').map((f) => (read(f) as { slug: string }).slug),
);

let polls: unknown;
try {
  polls = read('content/polls.json');
} catch (e) {
  console.error(`✗ content/polls.json: ${(e as Error).message}`);
  process.exit(1);
}
const problems = checkPolls(polls, {
  figureSlugs: new Set(roster.map((r) => r.slug)),
  figureNames: roster.map((r) => r.name),
  characterSlugs,
});
for (const p of problems) console.error(`✗ ${p}`);
const n = Array.isArray(polls) ? polls.length : 0;
if (problems.length) {
  console.error(`\n${problems.length} problem(s) in ${n} polls.`);
  process.exit(1);
}
console.log(`✓ ${n} polls OK`);
