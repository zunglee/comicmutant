/**
 * Read-only content store. Character and fighter JSON is bundled into the server build and
 * validated once at startup; the browser only ever receives what a route's loader returns.
 * Adding a character = dropping one JSON file in content/ (see README § Adding content).
 */
import {
  type Character,
  Character as CharacterSchema,
  Fighter,
  type Gadget,
  Gadget as GadgetSchema,
  type Milestone,
} from '~/lib/schema';
import { packVersion, type ThemeIndexRow } from '~/lib/theme/compute';

const charFiles = import.meta.glob('/content/characters/**/*.json', {
  eager: true,
  import: 'default',
});
const fighterFiles = import.meta.glob('/content/fighters/*.json', {
  eager: true,
  import: 'default',
});
const gadgetFiles = import.meta.glob('/content/gadgets/*.json', {
  eager: true,
  import: 'default',
});

function load<T>(files: Record<string, unknown>, parse: (v: unknown) => T, label: string): T[] {
  const out: T[] = [];
  for (const [file, raw] of Object.entries(files)) {
    try {
      out.push(parse(raw));
    } catch (e) {
      // A broken file must never ship; in dev it is skipped so one draft doesn't take the site down.
      if (process.env.NODE_ENV === 'production') throw new Error(`${label} ${file}: ${e}`);
      const n = (e as { issues?: unknown[] }).issues?.length ?? 1;
      console.warn(
        `[content] skipped ${file} (${n} issue${n === 1 ? '' : 's'}; run scripts/validate.ts)`,
      );
    }
  }
  return out;
}

const characters = load(charFiles, (v) => CharacterSchema.parse(v), 'character').sort(
  (a, b) => b.heat - a.heat || a.name.localeCompare(b.name),
);
const fighters = load(fighterFiles, (v) => Fighter.parse(v), 'fighter').sort((a, b) =>
  a.name.localeCompare(b.name),
);
const bySlug = new Map(characters.map((c) => [c.slug, c]));
const gadgets = load(gadgetFiles, (v) => GadgetSchema.parse(v), 'gadget')
  .filter((g) => bySlug.has(g.owner))
  .sort((a, b) => a.firstSeen.year - b.firstSeen.year);
const fighterBySlug = new Map(fighters.map((f) => [f.slug, f]));

// One slug = one theme URL: duplicates (also across casts) are a content bug, not a last-wins.
{
  const seen = new Set<string>();
  for (const x of [...characters, ...fighters]) {
    if (seen.has(x.slug)) {
      const msg = `[content] duplicate slug "${x.slug}"`;
      if (process.env.NODE_ENV === 'production') throw new Error(msg);
      console.warn(msg);
    }
    seen.add(x.slug);
  }
}

export const allCharacters = (): readonly Character[] => characters;
export const getCharacter = (slug: string) => bySlug.get(slug);
const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));
export const findCharacterByName = (name: string) => byName.get(name.trim().toLowerCase());
export const allFighters = (): readonly Fighter[] => fighters;
export const getFighter = (slug: string) => fighterBySlug.get(slug);
export const allGadgets = (): readonly Gadget[] => gadgets;
export const gadgetsOf = (owner: string) => gadgets.filter((g) => g.owner === owner);

/** Card-sized view for grids, so list pages don't ship every storyline. */
export interface CharacterCard {
  slug: string;
  name: string;
  universe: Character['universe'];
  kind: Character['kind'];
  summary: string;
  palette: Character['theme']['palette'];
  motif: Character['theme']['motif'];
  photo?: { file: string; alt: string; objectPosition?: string };
  heat: number;
  year: number;
}

export function toCard(c: Character): CharacterCard {
  return {
    slug: c.slug,
    name: c.name,
    universe: c.universe,
    kind: c.kind,
    summary: c.summary,
    palette: c.theme.palette,
    motif: c.theme.motif,
    photo: c.photo && {
      file: c.photo.file,
      alt: c.photo.alt,
      objectPosition: c.photo.objectPosition,
    },
    heat: c.heat,
    year: c.firstAppearance.year,
  };
}

/** Content is immutable per build, so derived views are computed once, on first use. */
function once<T>(fn: () => T): () => T {
  let v: T | undefined;
  return () => {
    v ??= fn();
    return v;
  };
}

/** Theme catalogue rows for characters and originals (grouping keys derive from the fields). */
export const themeIndex = once((): ThemeIndexRow[] => [
  ...characters.map((c) => ({
    slug: c.slug,
    name: c.name,
    universe: c.universe,
    kind: c.kind,
    motif: c.theme.motif,
    mood: c.theme.mood,
    swatch: [c.theme.palette.c1, c.theme.palette.c2, c.theme.palette.c3] as [
      string,
      string,
      string,
    ],
    tagline: c.theme.tagline,
    heat: c.heat,
    v: packVersion(c.theme),
  })),
  ...fighters.map((f) => ({
    slug: f.slug,
    name: f.alias,
    universe: 'original',
    kind: f.kind,
    motif: f.theme.motif,
    mood: f.theme.mood,
    swatch: [f.theme.palette.c1, f.theme.palette.c2, f.theme.palette.c3] as [
      string,
      string,
      string,
    ],
    tagline: f.theme.tagline,
    heat: f.heat,
    v: packVersion(f.theme),
  })),
]);

/** Every quiz question across the roster, tagged with its character. */
export const quizPool = once(() =>
  characters.flatMap((c) =>
    c.quiz.map((q, i) => ({
      ...q,
      id: `${c.slug}#${i}`,
      slug: c.slug,
      name: c.name,
      universe: c.universe,
    })),
  ),
);

export const gossipPool = once(() =>
  characters.flatMap((c) =>
    c.gossip.map((g, i) => ({
      ...g,
      id: `${c.slug}#${i}`,
      slug: c.slug,
      name: c.name,
      universe: c.universe,
      palette: c.theme.palette,
    })),
  ),
);

/** One row on the multiverse timeline: a milestone plus just enough of its character to draw it. */
export interface TimelineRow extends Milestone {
  id: string;
  slug: string;
  name: string;
  universe: Character['universe'];
  side: 'hero' | 'rogue';
  palette: Character['theme']['palette'];
  withName?: string;
}

/** Every character's milestones, oldest first (heroes before rogues within a year). */
export const timelinePool = once((): TimelineRow[] =>
  characters
    .flatMap((c) =>
      (c.timeline ?? []).map((m, i) => ({
        ...m,
        id: `${c.slug}#${i}`,
        slug: c.slug,
        name: c.name,
        universe: c.universe,
        side: c.kind === 'hero' ? ('hero' as const) : ('rogue' as const),
        palette: c.theme.palette,
        withName: m.with ? bySlug.get(m.with)?.name : undefined,
      })),
    )
    .sort((a, b) => a.year - b.year || (a.side === b.side ? 0 : a.side === 'hero' ? -1 : 1)),
);
