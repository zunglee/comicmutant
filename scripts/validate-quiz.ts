// Validate the Fact Frenzy bank. Usage: pnpm tsx scripts/validate-quiz.ts [path-substring]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BankFile } from '../app/lib/quizbank-schema';
import { leakTerms, leakVia, nameTokensOf } from '../app/lib/quizleak';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const filter = args.find((a) => !a.startsWith('--')) ?? '';
const ROOT = 'content/quiz';
const walk = (d: string): string[] =>
  existsSync(d)
    ? readdirSync(d).flatMap((f) => {
        const p = path.join(d, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
      })
    : [];

const STOP = new Set(
  'about after their there which where while would could should other first being these those'.split(
    ' ',
  ),
);
const words = (t: string) =>
  new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
const numeric = (o: string) => /^[#\s]*-?\d[\d,.]*\s*(%|s|th|st|nd|rd)?$/i.test(o.trim());
const giveaways: string[] = [];
const siblings: string[] = [];
// Q25: why-leaks are handled at serve time (the leaked question is served first), so they're info only.
const whyLeaks: string[] = [];
const miniOverlap: string[] = [];
const ranks = [0, 0, 0, 0];

let bad = 0;
let count = 0;
const seenQ = new Map<string, string>();
const files = walk(ROOT).filter((f) => f.includes(filter));
for (const f of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    bad++;
    console.error(`✗ ${f}: not JSON (${(e as Error).message})`);
    continue;
  }
  const r = BankFile.safeParse(raw);
  if (!r.success) {
    bad++;
    console.error(`✗ ${f}`);
    for (const i of r.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`);
    continue;
  }
  const b = r.data;
  const expected = path.join(ROOT, b.universe, `${b.character}.json`);
  if (path.normalize(f) !== expected) {
    bad++;
    console.error(`✗ ${f}: must live at ${expected}`);
  }
  if (!existsSync(path.join('content/characters', b.universe, `${b.character}.json`))) {
    bad++;
    console.error(`✗ ${f}: no character content/characters/${b.universe}/${b.character}.json`);
  }
  const charFile = path.join('content/characters', b.universe, `${b.character}.json`);
  const charName = existsSync(charFile)
    ? String(JSON.parse(readFileSync(charFile, 'utf8')).name)
    : '';
  for (const q of b.questions) {
    // Q15: an answer word (4+ letters, minus stop words) that also appears in the question or the character name on the card.
    const shown = words(`${q.q} ${charName}`);
    const hit = [...words(q.options[q.answer] ?? '')].filter((w) => shown.has(w));
    if (hit.length && !(q as { giveawayOk?: boolean }).giveawayOk)
      giveaways.push(`${q.id}: "${hit.join(', ')}" — ${q.q} → ${q.options[q.answer]}`);
    // Also "Issue 9" / "Chapter 204" / "#135": all four share one template once digits are masked.
    const tpl = q.options.map((o) => o.replace(/\d[\d,.]*/g, '#'));
    const sameTemplate = tpl.every((t) => t === tpl[0]) && (tpl[0] ?? '').split('#').length === 2;
    if (q.options.every(numeric) || sameTemplate) {
      const v = q.options.map((o) => Number.parseFloat(o.replace(/[^\d.-]/g, '')));
      const sorted = [...v].sort((x, y) => x - y);
      const at = sorted.indexOf(v[q.answer] as number);
      ranks[at] = (ranks[at] ?? 0) + 1;
    }
    const k = q.q.trim().toLowerCase();
    const other = seenQ.get(k);
    if (other) {
      bad++;
      console.error(`✗ ${q.id}: same question as ${other}`);
    }
    seenQ.set(k, q.id);
  }
  // Sibling leaks (Q25, shared matcher): a question's TEXT may never print a sibling's answer; a `why`
  // may (info only) because the server serves the leaked question first.
  const nameTokens = nameTokensOf(charName, b.character);
  const edge = new Set<string>();
  for (const a of b.questions) {
    const terms = leakTerms(a, nameTokens);
    for (const o of b.questions) {
      if (o === a) continue;
      const via = leakVia(o, terms);
      if (via) edge.add(`${o.id}>${a.id}`);
      if (via === 'q') siblings.push(`${o.id} question prints the answer to ${a.id}`);
      else if (via === 'why') whyLeaks.push(`${o.id} why prints the answer to ${a.id}`);
    }
  }
  // Two questions that each print the other's answer can't both be served (Q25): a character game
  // would come up short. Reword one side.
  for (const e of edge) {
    const [o, a] = e.split('>');
    if (o && a && o < a && edge.has(`${a}>${o}`))
      siblings.push(`${o} and ${a} print each other's answers (cycle)`);
  }
  // The character page's mini-quiz ships its answers to the browser: no bank question may copy one.
  if (existsSync(charFile)) {
    const norm = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const mini = (JSON.parse(readFileSync(charFile, 'utf8')).quiz ?? []) as {
      q: string;
      options: string[];
      answer: number;
    }[];
    for (const q of b.questions) {
      const wq = new Set(norm(q.q).split(' '));
      for (const m of mini) {
        const wm = new Set(norm(m.q).split(' '));
        const inter = [...wq].filter((w) => wm.has(w)).length;
        const jac = inter / (wq.size + wm.size - inter);
        const sameAnswer = norm(q.options[q.answer] ?? '') === norm(m.options[m.answer] ?? '');
        // Same answer, different wording (Alfred r4–9): info only — other modes reveal answers anyway,
        // and the daily never serves these (Q27).
        if (sameAnswer && jac < 0.6) miniOverlap.push(q.id);
        if (sameAnswer && jac >= 0.6)
          siblings.push(`${q.id} copies the character page's mini-quiz ("${m.q}")`);
      }
    }
  }
  count += b.questions.length;
}
const nNum = ranks.reduce((a, b) => a + b, 0);
if (!filter && nNum) {
  const extremes = ((ranks[0] as number) + (ranks[3] as number)) / nNum;
  console.log(
    `numeric answers by rank (low→high): ${ranks.join(' / ')} — extremes ${Math.round(extremes * 100)}%`,
  );
  if (extremes < 0.35) {
    bad++;
    console.error('✗ numeric answers sit at the lowest/highest option under 35% of the time (Q15)');
  }
}
if (giveaways.length) {
  console.log(
    `\n${giveaways.length} possible give-away(s) (fix, or set "giveawayOk": true if the word is not a clue):`,
  );
  for (const g of giveaways) console.log(`  ${g}`);
  if (strict) bad += giveaways.length;
}
if (siblings.length) {
  console.log(
    `\n${siblings.length} leak(s) (reword the leaking text; "siblingOk": true on the leaked question only if it is no clue):`,
  );
  for (const g of siblings) console.log(`  ${g}`);
  if (strict) bad += siblings.length;
}
if (miniOverlap.length)
  console.log(
    `${miniOverlap.length} question(s) share an answer with their character page's mini-quiz: info only — kept out of the daily (Q27).`,
  );
if (whyLeaks.length)
  console.log(
    `\n${whyLeaks.length} why-leak(s): info only — the server serves the leaked question first (Q25).`,
  );
console.log(`${files.length} files, ${count} questions, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
