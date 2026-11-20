// Validate Sacred India profiles and Desi hero facts.
// Usage: pnpm tsx scripts/validate-sacred.ts [--strict] [path-substring]
//   default: checks every file that exists; --strict: every roster slug must have a file and every
//   indian character must carry ≥ 20 facts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Figure } from '../app/lib/sacred-schema';
import { Character } from '../app/lib/schema';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const ROOT = 'content/sacred';
const walk = (d: string): string[] =>
  existsSync(d)
    ? readdirSync(d).flatMap((f) => {
        const p = path.join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
      })
    : [];

type RosterRow = { slug: string; name: string; tradition: string; group: string };
const roster = JSON.parse(readFileSync(path.join(ROOT, 'roster.json'), 'utf8')) as RosterRow[];
const rosterBy = new Map(roster.map((r) => [r.slug, r]));

let bad = 0;
const fail = (m: string) => {
  bad++;
  console.error(`✗ ${m}`);
};
const warn: string[] = [];
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const jac = (a: Set<string>, b: Set<string>) => {
  const i = [...a].filter((w) => b.has(w)).length;
  return i / (a.size + b.size - i || 1);
};
// HSL saturation/lightness of a hex colour: the realm stays calm (no neon cards).
const hsl = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  return { s, l };
};
// Phrases that state belief as plain fact or mock it; a fact must attribute instead (S3).
const MOCK = /\b(fake|silly|just a myth|not real|made[- ]up|superstition|so-called)\b/i;
const RANK = /\b(greatest|best|strongest|most powerful) (god|goddess|deity|guru|religion|faith)\b/i;

const seen = new Set<string>();
const allFacts: { slug: string; w: Set<string>; text: string }[] = [];
let full = 0;
let compact = 0;
const files = walk(ROOT).filter((f) => !f.endsWith('roster.json') && !f.endsWith('polls.json'));
for (const f of files.filter((x) => x.includes(filter))) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    fail(`${f}: not JSON (${(e as Error).message})`);
    continue;
  }
  const r = Figure.safeParse(raw);
  if (!r.success) {
    fail(f);
    for (const i of r.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`);
    continue;
  }
  const g = r.data;
  seen.add(g.slug);
  const row = rosterBy.get(g.slug);
  if (!row) fail(`${f}: slug ${g.slug} is not in roster.json`);
  else if (row.tradition !== g.tradition || row.group !== g.group)
    fail(`${f}: tradition/group ${g.tradition}/${g.group} ≠ roster ${row.tradition}/${row.group}`);
  const expected = path.join(ROOT, g.tradition, `${g.slug}.json`);
  if (path.normalize(f) !== expected) fail(`${f}: must live at ${expected}`);
  if (g.depth === 'full' && g.facts.length < 20)
    fail(`${g.slug}: depth full needs ≥ 20 facts (has ${g.facts.length})`);
  g.depth === 'full' ? full++ : compact++;
  const low = g.facts.filter((x) => x.interest < 7);
  if (low.length) fail(`${g.slug}: ${low.length} fact(s) under interest 7 must be cut or replaced`);
  if (g.facts.filter((x) => x.kid).length < 5) fail(`${g.slug}: needs ≥ 5 kid facts`);
  const texts = new Set<string>();
  for (const x of g.facts) {
    const k = x.text.toLowerCase().replace(/\W+/g, ' ').trim();
    if (texts.has(k)) fail(`${g.slug}: duplicate fact "${x.text.slice(0, 50)}…"`);
    texts.add(k);
    if (MOCK.test(x.text)) fail(`${g.slug}: dismissive wording in "${x.text.slice(0, 60)}…" (S3)`);
    if (RANK.test(x.text)) fail(`${g.slug}: ranks the divine in "${x.text.slice(0, 60)}…" (S7)`);
    allFacts.push({ slug: g.slug, w: words(x.text), text: x.text });
  }
  // Near-duplicates inside one profile read as padding.
  const fw = g.facts.map((x) => words(x.text));
  for (let i = 0; i < fw.length; i++)
    for (let j = i + 1; j < fw.length; j++)
      if (jac(fw[i] as Set<string>, fw[j] as Set<string>) >= 0.6)
        fail(`${g.slug}: facts ${i} and ${j} say nearly the same thing`);
  for (const s of [...g.related, ...g.family.flatMap((m) => (m.slug ? [m.slug] : []))])
    if (!rosterBy.has(s)) fail(`${g.slug}: links unknown slug ${s}`);
  for (const c of [g.palette.c1, g.palette.c2]) {
    const { s, l } = hsl(c);
    if (s > 0.8 || l < 0.3) fail(`${g.slug}: palette ${c} is too loud/dark for the calm realm`);
  }
  if (
    !/\b(say|says|said|tell|tells|told|believe|believed|according|tradition|text|version|purana|ramayana|mahabharata|veda|sutra|canon|scripture|legend|story)/i.test(
      g.about,
    )
  )
    warn.push(`${g.slug}: "about" never attributes its claims (S3) — check wording`);
}
// The same fact pasted onto two profiles.
for (let i = 0; i < allFacts.length; i++)
  for (let j = i + 1; j < allFacts.length; j++) {
    const a = allFacts[i] as (typeof allFacts)[number];
    const b = allFacts[j] as (typeof allFacts)[number];
    if (a.slug !== b.slug && a.w.size > 6 && jac(a.w, b.w) >= 0.75)
      warn.push(`${a.slug} ≈ ${b.slug}: "${a.text.slice(0, 50)}…"`);
  }
if (strict && !filter)
  for (const r of roster) if (!seen.has(r.slug)) fail(`missing profile: ${r.tradition}/${r.slug}`);

// Desi heroes: ≥ 20 facts each (S9).
const CH = 'content/characters/indian';
let desi = 0;
for (const f of walk(CH).filter((x) => x.includes(filter))) {
  const c = Character.safeParse(JSON.parse(readFileSync(f, 'utf8')));
  if (!c.success) continue; // scripts/validate.ts reports schema errors
  desi++;
  const n = c.data.facts?.length ?? 0;
  if (n < 20 && strict) fail(`${c.data.slug}: desi hero needs ≥ 20 facts (has ${n})`);
  for (const x of c.data.facts ?? [])
    if (x.interest < 7) fail(`${c.data.slug}: fact under interest 7: "${x.text.slice(0, 50)}…"`);
}

for (const w of warn) console.log(`  ! ${w}`);
console.log(
  `${seen.size}/${roster.length} sacred profiles (${full} full, ${compact} compact), ${desi} desi heroes, ${bad} problem(s)`,
);
process.exit(bad ? 1 : 0);
