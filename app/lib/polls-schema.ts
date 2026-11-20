/**
 * Poll content contract (content/polls.json) and the S7 check: Sacred India polls never rank a
 * faith or a deity (reports/sacred-design.md). Desi-hero polls may compare heroes — they are comics.
 * `checkPolls` runs in scripts/validate-polls.ts (prebuild) and in the unit tests.
 */
import { z } from 'zod';
import { TRADITIONS } from './sacred-taxonomy';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case');

/** 'sacred' | 'sacred:<tradition>' | 'figure:<roster slug>' | 'desi' | 'character:<slug>'. */
export const POLL_SCOPE_RE =
  /^(sacred(:[a-z]+)?|figure:[a-z0-9]+(?:-[a-z0-9]+)*|desi|character:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const PollOption = z.object({
  id: slug.max(40),
  label: z.string().min(1).max(80),
});

export const Poll = z.object({
  id: slug.max(60),
  realm: z.enum(['sacred', 'comic']),
  scope: z.string().regex(POLL_SCOPE_RE, 'unknown scope'),
  question: z.string().min(10).max(140),
  options: z.array(PollOption).min(2).max(6),
  /** A closed poll still shows its results but takes no votes. */
  closed: z.boolean().default(false),
});
export type Poll = z.infer<typeof Poll>;

export const PollFile = z.array(Poll);

// ─── S7: no ranking of faiths or deities ─────────────────────────────────────────────────────────

/** "best/greatest/… god", "true religion", "who would win" — banned in every realm. */
const SUBJECT =
  '(gods?|goddess(?:es)?|deit(?:y|ies)|gurus?|religions?|faiths?|avatars?|tirthankaras?|buddhas?|bodhisattvas?|traditions?|saints?|prophets?)';
export const RANK_RE = new RegExp(
  `\\b(greatest|best|strongest|most powerful|mightiest|superior|holiest|top|number one|better|stronger|more powerful|wisest)\\s+(\\w+\\s+){0,2}${SUBJECT}\\b`,
  'i',
);
/** "which god is the most powerful", "which faith is best". */
export const RANK_AFTER_RE = new RegExp(
  `\\b${SUBJECT}\\s+(is|are|was|were)\\s+(the\\s+)?(greatest|best|strongest|most powerful|mightiest|superior|holiest|number one|better|stronger|more powerful|wisest|true one|right one)\\b`,
  'i',
);
/** "favourite god" (adjacent only: "favourite story about a god" is fine). */
export const FAVOURITE_RE = new RegExp(`\\bfavou?rite\\s+${SUBJECT}\\b`, 'i');
export const TRUTH_RE = new RegExp(
  `\\b(true|right|correct|real|fake|false|wrong)\\s+${SUBJECT}\\b`,
  'i',
);
/**
 * Asks what the voter celebrates, practises, follows or believes — sacred polls never ask people to
 * reveal their faith (S14); ask which story to tell next instead.
 */
export const SELF_RE =
  /\b(celebrate[sd]?|celebrating|practi[sc]e[sd]?|practi[sc]ing|follow(s|ed|ing)?|believe[sd]?|believing)\b|\byour (own )?(faith|religion)\b/i;
/**
 * Words that tie an option to one tradition: festivals, places, practices (S15). A sacred poll with
 * options for three or more different traditions reads as a faith census, so it is refused.
 */
export const TRADITION_KEYWORDS: Record<(typeof TRADITIONS)[number], RegExp> = {
  hindu:
    /\b(hindu\w*|diwali|deepavali|holi|onam|navaratri|navratri|durga puja|dussehra|dasara|janmashtami|ganesh chaturthi|pongal|makar sankranti|ghats?|varanasi|kashi|ayodhya|vrindavan|mandir|puja|aarti)\b/i,
  buddhist:
    /\b(buddhis\w*|buddha purnima|vesak|bodh gaya|sarnath|lumbini|monaster\w*|vihara|stupa|sangha|bodhi tree)\b/i,
  jain: /\b(jain\w*|mahavir jayanti|paryushan\w*|tirthankaras?|palitana|shravanabelagola|derasar|kshamavani)\b/i,
  sikh: /\b(sikh\w*|gurpurab|gurpurb|vaisakhi|baisakhi|golden temple|harmandir\w*|amritsar|gurdwaras?|langar|khalsa)\b/i,
};

/** The traditions an option label points at, by keyword. */
export const traditionsOf = (label: string): string[] =>
  Object.entries(TRADITION_KEYWORDS)
    .filter(([, re]) => re.test(label))
    .map(([t]) => t);

/** Head-to-head framing, never allowed between sacred figures. */
export const VERSUS_RE = /\b(who would win|vs\.?|versus|beat|defeat|in a fight|stronger than)\b/i;
/** A question that asks people to rank or prefer its options. */
export const PREFER_RE =
  /\b(greatest|best|strongest|most powerful|mightiest|superior|holiest|top|number one|better|stronger|wisest|favou?rite|most important|ultimate|like most|love most)\b/i;

/** Faith names: an option that is just a faith name can't stand under a preference question. */
const FAITH_NAMES = [
  ...TRADITIONS,
  'hinduism',
  'buddhism',
  'jainism',
  'sikhism',
  'sanatan dharma',
  'islam',
  'christianity',
  'judaism',
  'zoroastrianism',
];
/** Honorifics stripped before comparing an option to a figure name. */
const HONORIFIC =
  /^(lord|god|goddess|guru|sri|shri|shree|bhagwan|bhagavan|mata|devi|maa|sant|saint|bhai|baba|acharya)\s+/;

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** A name without honorifics ("Lord", "Guru", "Mata"…), parentheticals or punctuation. */
export function bareName(s: string): string {
  let n = norm(s);
  for (let prev = ''; prev !== n; ) {
    prev = n;
    n = n.replace(HONORIFIC, '').replace(/\s+ji$/, '');
  }
  return n;
}

/** The option is (after honorifics and parentheticals) just a figure's or a faith's name. */
export function namesFigureOrFaith(label: string, names: ReadonlySet<string>): boolean {
  const n = bareName(label);
  return FAITH_NAMES.includes(n) || names.has(n) || names.has(`${n}a`); // "Ganesh" → Ganesha
}

export interface CheckPollsOptions {
  /** Roster slugs, so 'figure:<slug>' scopes resolve. Unchecked when omitted. */
  figureSlugs?: ReadonlySet<string>;
  /** Roster display names (any case), for the "deity as option under a best question" rule. */
  figureNames?: Iterable<string>;
  /** Character slugs, so 'character:<slug>' scopes resolve. Unchecked when omitted. */
  characterSlugs?: ReadonlySet<string>;
}

/**
 * Every problem with a poll file, as "<poll id>: <why>" lines (empty = good): schema, unique ids,
 * realm/scope agreement, and S7 — a sacred poll never asks to rank or pit faiths or deities, and
 * no poll anywhere asks for the "best god" or the "true religion".
 */
export function checkPolls(raw: unknown, opts: CheckPollsOptions = {}): string[] {
  const out: string[] = [];
  const parsed = PollFile.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) out.push(`schema ${i.path.join('.')}: ${i.message}`);
    return out;
  }
  const names = new Set([...(opts.figureNames ?? [])].map(bareName).filter((n) => n.length >= 3));
  const ids = new Set<string>();
  for (const p of parsed.data) {
    const bad = (why: string) => out.push(`${p.id}: ${why}`);
    if (ids.has(p.id)) bad('duplicate poll id');
    ids.add(p.id);
    const optIds = new Set(p.options.map((o) => o.id));
    if (optIds.size !== p.options.length) bad('duplicate option id');
    const labels = new Set(p.options.map((o) => norm(o.label)));
    if (labels.size !== p.options.length) bad('duplicate option label');

    const [kind, arg] = p.scope.split(':') as [string, string | undefined];
    const sacredScope = kind === 'sacred' || kind === 'figure';
    if (p.realm === 'sacred' && !sacredScope) bad(`sacred poll with scope ${p.scope}`);
    if (p.realm === 'comic' && sacredScope) bad(`comic poll with scope ${p.scope}`);
    if (kind === 'sacred' && arg && !(TRADITIONS as readonly string[]).includes(arg))
      bad(`unknown tradition ${arg}`);
    if (kind === 'figure' && arg && opts.figureSlugs && !opts.figureSlugs.has(arg))
      bad(`figure ${arg} is not in the roster`);
    if (kind === 'character' && arg && opts.characterSlugs && !opts.characterSlugs.has(arg))
      bad(`character ${arg} does not exist`);

    const texts = [p.question, ...p.options.map((o) => o.label)];
    for (const t of texts) {
      if (RANK_RE.test(t) || RANK_AFTER_RE.test(t) || FAVOURITE_RE.test(t))
        bad(`ranks a faith or deity: "${t}"`);
      if (TRUTH_RE.test(t)) bad(`judges a faith true or false: "${t}"`);
    }
    if (p.realm === 'sacred') {
      if (texts.some((t) => VERSUS_RE.test(t))) bad('pits sacred figures against each other');
      if (texts.some((t) => SELF_RE.test(t)))
        bad('asks what the voter celebrates, practises or believes');
      const faiths = new Set(p.options.flatMap((o) => traditionsOf(o.label)));
      if (faiths.size >= 3)
        bad(
          `options map one-per-faith (${[...faiths].join(', ')}); use themes that cross traditions`,
        );
      if (PREFER_RE.test(p.question)) {
        const named = p.options.filter((o) => namesFigureOrFaith(o.label, names));
        if (named.length > 0)
          bad(
            `asks to prefer figures or faiths (${named.map((o) => o.label).join(', ')}); ask what to read or explore next instead`,
          );
      }
    }
  }
  return out;
}
