/**
 * Fact Frenzy leak matcher (Q25), shared by the validator and the server. A question "leaks" another
 * when its text (visible before answering) or its `why` (shown after) prints the other's answer — the
 * full answer, or a distinctive capitalised name inside a multi-word answer.
 */

const STOP = new Set(
  (
    'about after their there which where while would could should other first being these those ' +
    'with from that this what have been they them into does name than when also only over more most ' +
    'year years film comic comics series issue character'
  ).split(' '),
);

export interface LeakQuestion {
  id: string;
  q: string;
  why: string;
  options: readonly string[];
  answer: number;
  /** Set on a question whose answer, printed elsewhere, is no clue. */
  siblingOk?: boolean;
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const hasTerm = (text: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`, 'i').test(text);

/** The strings that would give away `a`'s answer. `nameTokens` = the character's own name words. */
export function leakTerms(a: LeakQuestion, nameTokens: ReadonlySet<string>): string[] {
  if (a.siblingOk) return [];
  const ans = (a.options[a.answer] ?? '').trim();
  const others = a.options
    .filter((_, i) => i !== a.answer)
    .join(' ')
    .toLowerCase();
  const terms = new Set<string>();
  // Numbers: a year (or other 3+ digit number) answer leaks wherever it's printed (critic round 9).
  if (/^[#\d\s,.%-]+$/.test(ans)) {
    for (const n of ans.match(/\d{3,}/g) ?? []) terms.add(n);
    return [...terms];
  }
  // The answer itself, without a leading article ("A rabbit" leaks as "rabbit").
  const bare = ans.replace(/^(a|an|the)\s+/i, '');
  if (bare.length >= 3) terms.add(bare.toLowerCase());
  // A one-word answer also leaks as its singular/plural twin ("The Avengers" ↔ "Avenger"), unless the
  // twin is the character's own name ("The Marvels" ↔ Captain Marvel).
  if (bare.length >= 3 && !/\s/.test(bare))
    for (const f of forms(bare.toLowerCase())) if (!nameTokens.has(f)) terms.add(f);
  // Distinctive words inside a multi-word answer: 4+ letters, any case, not the character's own name,
  // not a stop word, not shared with a distractor (then it isn't a clue), plus any 3+ digit number.
  if (/\s/.test(bare)) {
    for (const t of bare.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? []) {
      const lt = t.toLowerCase();
      if (!nameTokens.has(lt) && !STOP.has(lt) && !hasTerm(others, lt)) terms.add(lt);
    }
    for (const n of bare.match(/\d{3,}/g) ?? []) if (!others.includes(n)) terms.add(n);
  }
  return [...terms];
}

/** Name words of a character ("Iron Man" + slug "iron-man" → iron, man). */
export const nameTokensOf = (name: string, slug: string) =>
  new Set<string>([...(name.toLowerCase().match(/[a-z]+/g) ?? []), ...slug.split('-')]);

/** How `o` leaks `a`, if it does: through its question text or its why. */
/** A term and its singular/plural twin ("avengers" ↔ "avenger", "nazis" ↔ "nazi"), for word terms. */
function forms(t: string): string[] {
  if (!/[a-z]$/.test(t)) return [t];
  if (t.endsWith('ies')) return [t, `${t.slice(0, -3)}y`];
  if (t.endsWith('s') && !t.endsWith('ss')) return [t, t.slice(0, -1)];
  return [t, t.endsWith('y') ? `${t.slice(0, -1)}ies` : `${t}s`];
}

export function leakVia(o: LeakQuestion, terms: readonly string[]): 'q' | 'why' | null {
  for (const t of terms) if (hasTerm(o.q, t)) return 'q';
  for (const t of terms) if (hasTerm(o.why, t)) return 'why';
  return null;
}
