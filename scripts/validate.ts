// Validate every content file against app/lib/schema.ts. Usage: pnpm tsx scripts/validate.ts [glob-substring]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Character, Fighter, Gadget } from '../app/lib/schema';

const filter = process.argv[2] ?? '';
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });

let bad = 0;
const slugs = new Set<string>();
const all = [...walk('content/characters'), ...walk('content/fighters')];
for (const f of all) {
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  if (slugs.has(raw.slug)) console.error(`DUPLICATE slug ${raw.slug} (${f})`);
  slugs.add(raw.slug);
  if (!f.includes(filter)) continue;
  const r = (f.includes('/fighters/') ? Fighter : Character).safeParse(raw);
  if (raw.TODO) console.error(`TODO left in ${f}`);
  if (!r.success) {
    bad++;
    console.error(
      `✗ ${f}\n  ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  } else if (raw.slug !== path.basename(f, '.json')) {
    bad++;
    console.error(`✗ ${f}: slug must equal file name`);
  }
}
// Cross-references must resolve.
for (const f of all) {
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  for (const s of [...(raw.rivals ?? []), ...(raw.allies ?? [])])
    if (!slugs.has(s)) console.error(`dangling ref ${s} in ${f}`);
  for (const m of raw.timeline ?? [])
    if (m.with && !slugs.has(m.with)) console.error(`dangling timeline ref ${m.with} in ${f}`);
}
// Gadgets: schema + owner on the roster + parts match the blueprint's slot count.
const SLOTS: Record<string, number> = {
  vehicle: 6,
  armor: 6,
  shield: 4,
  hammer: 4,
  gauntlet: 5,
  ring: 4,
  belt: 5,
};
const gadgets = existsSync('content/gadgets') ? walk('content/gadgets') : [];
for (const f of gadgets) {
  if (!f.includes(filter)) continue;
  const raw = JSON.parse(readFileSync(f, 'utf8'));
  const r = Gadget.safeParse(raw);
  if (!r.success) {
    bad++;
    console.error(
      `✗ ${f}\n  ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
    continue;
  }
  if (!slugs.has(raw.owner)) {
    bad++;
    console.error(`✗ ${f}: owner ${raw.owner} is not on the roster`);
  }
  if (raw.parts.length !== SLOTS[raw.blueprint]) {
    bad++;
    console.error(`✗ ${f}: ${raw.blueprint} needs exactly ${SLOTS[raw.blueprint]} parts`);
  }
}
console.log(`${all.length + gadgets.length} files, ${bad} invalid`);
process.exit(bad ? 1 : 0);
