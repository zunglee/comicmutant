/**
 * Fact Frenzy question bank. content/quiz/<universe>/<slug>.json is bundled into the server build and
 * validated once (BankFile); each question carries its character's name from the roster. Server-only:
 * answers and `why` never leave through here — app/.server/quiz.ts decides what a player sees.
 * The live bank is the whole bank minus the ids a mod has retired (quiz_retired). The leak graph (Q25)
 * is built here once: which questions' text or `why` prints another's answer.
 */

import { BankFile, type BankQuestion } from '~/lib/quizbank-schema';
import { leakTerms, leakVia, nameTokensOf } from '~/lib/quizleak';
import type { PublishedUniverse } from '~/lib/taxonomy';
import { getCharacter } from './content';
import type { Sql } from './db';

/** A bank question with its character joined in. */
export interface BankEntry extends BankQuestion {
  slug: string;
  name: string;
  universe: PublishedUniverse;
}

export interface Bank {
  /** Every question, sorted by id (so seeded picks don't depend on file order). */
  all: readonly BankEntry[];
  byId: ReadonlyMap<string, BankEntry>;
  byCharacter: ReadonlyMap<string, readonly BankEntry[]>;
  byUniverse: ReadonlyMap<PublishedUniverse, readonly BankEntry[]>;
  /** Q25 leak graph within each universe: id → ids whose answer its question or `why` prints. */
  leaks: ReadonlyMap<string, ReadonlySet<string>>;
  /** Q25: the strings that would give each question's answer away (app/lib/quizleak.ts). */
  terms: ReadonlyMap<string, readonly string[]>;
  /**
   * Q27: ids the daily never serves — the answer equals an answer in the same character's page
   * mini-quiz, which ships to the browser (free answers where the daily keeps them locked).
   */
  notDaily: ReadonlySet<string>;
}

/** A mini-quiz item as far as Q27 cares. */
export interface MiniQuizItem {
  options: readonly string[];
  answer: number;
}

/** Answer text for comparison: lowercase, letters and digits, single spaces. */
export const normAnswer = (a: string) =>
  a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Does `a` (its text or `why`) print `b`'s answer? Computed with the shared matcher. */
export function leaksAnswer(a: BankEntry, b: BankEntry, terms: readonly string[]): boolean {
  if (a.id === b.id || !terms.length) return false;
  const text = `${a.q}\n${a.why}`.toLowerCase();
  // Cheap substring check first; the matcher then checks word boundaries.
  return terms.some((t) => text.includes(t)) && leakVia(a, terms) !== null;
}

/** Leak terms and the within-universe leak graph for a list of questions. */
function leakGraph(
  all: readonly BankEntry[],
  byUniverse: ReadonlyMap<PublishedUniverse, readonly BankEntry[]>,
) {
  const terms = new Map<string, readonly string[]>();
  for (const q of all) terms.set(q.id, leakTerms(q, nameTokensOf(q.name, q.slug)));
  const leaks = new Map<string, Set<string>>();
  for (const list of byUniverse.values())
    for (const b of list) {
      const t = terms.get(b.id) ?? [];
      if (!t.length) continue;
      for (const a of list)
        if (leaksAnswer(a, b, t)) {
          const set = leaks.get(a.id) ?? new Set<string>();
          set.add(b.id);
          leaks.set(a.id, set);
        }
    }
  return { leaks, terms };
}

const files = import.meta.glob('/content/quiz/**/*.json', { eager: true, import: 'default' });

/**
 * Validate and index raw bank files. A broken file must never ship; in dev it is skipped so one draft
 * doesn't take the quiz down. Files for a character missing from the roster are skipped (no name to
 * show), as are ids already taken by another file.
 */
export function buildBank(
  raw: Record<string, unknown>,
  nameOf: (slug: string) => string | undefined,
  miniQuizOf: (slug: string) => readonly MiniQuizItem[] | undefined = () => undefined,
): Bank {
  const all: BankEntry[] = [];
  const byId = new Map<string, BankEntry>();
  for (const [file, v] of Object.entries(raw)) {
    const r = BankFile.safeParse(v);
    if (!r.success) {
      if (process.env.NODE_ENV === 'production') throw new Error(`quiz bank ${file}: ${r.error}`);
      const n = r.error.issues.length;
      console.warn(
        `[quiz] skipped ${file} (${n} issue${n === 1 ? '' : 's'}; run scripts/validate-quiz.ts)`,
      );
      continue;
    }
    const name = nameOf(r.data.character);
    if (!name) {
      console.warn(`[quiz] skipped ${file}: "${r.data.character}" is not on the roster`);
      continue;
    }
    for (const q of r.data.questions) {
      if (byId.has(q.id)) {
        console.warn(`[quiz] duplicate question id ${q.id} in ${file}; kept the first`);
        continue;
      }
      const e: BankEntry = { ...q, slug: r.data.character, name, universe: r.data.universe };
      byId.set(q.id, e);
      all.push(e);
    }
  }
  all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byCharacter = new Map<string, BankEntry[]>();
  const byUniverse = new Map<PublishedUniverse, BankEntry[]>();
  for (const e of all) {
    const c = byCharacter.get(e.slug) ?? [];
    if (!c.length) byCharacter.set(e.slug, c);
    c.push(e);
    const u = byUniverse.get(e.universe) ?? [];
    if (!u.length) byUniverse.set(e.universe, u);
    u.push(e);
  }
  const notDaily = new Set<string>();
  for (const [slug, list] of byCharacter) {
    const mini = new Set(
      (miniQuizOf(slug) ?? []).map((m) => normAnswer(m.options[m.answer] ?? '')).filter(Boolean),
    );
    for (const q of list) if (mini.has(normAnswer(q.options[q.answer] ?? ''))) notDaily.add(q.id);
  }
  return { all, byId, byCharacter, byUniverse, ...leakGraph(all, byUniverse), notDaily };
}

let bank: Bank | undefined;

/** The whole bank, retired ids included (answered games and reports still need their text). */
export function getBank(): Bank {
  bank ??= buildBank(
    files,
    (slug) => getCharacter(slug)?.name,
    (slug) => getCharacter(slug)?.quiz,
  );
  return bank;
}

/** Tests inject a small fixture bank; null goes back to the bundled one. */
export function setBankForTests(b: Bank | null): void {
  bank = b ?? undefined;
}

export async function retiredIds(sql: Sql): Promise<Set<string>> {
  const rows = await sql.all<{ question_id: string }>('SELECT question_id FROM quiz_retired');
  return new Set(rows.map((r) => r.question_id));
}

/** The bank as it serves right now: retired questions never reach a new game. */
export async function liveBank(sql: Sql): Promise<Bank> {
  const full = getBank();
  const retired = await retiredIds(sql);
  if (!retired.size) return full;
  const keep = (list: readonly BankEntry[]) => list.filter((q) => !retired.has(q.id));
  const byCharacter = new Map<string, readonly BankEntry[]>();
  for (const [k, v] of full.byCharacter) byCharacter.set(k, keep(v));
  const byUniverse = new Map<PublishedUniverse, readonly BankEntry[]>();
  for (const [k, v] of full.byUniverse) byUniverse.set(k, keep(v));
  const all = keep(full.all);
  return {
    all,
    byId: new Map(all.map((q) => [q.id, q])),
    byCharacter,
    byUniverse,
    leaks: full.leaks,
    terms: full.terms,
    notDaily: full.notDaily,
  };
}
