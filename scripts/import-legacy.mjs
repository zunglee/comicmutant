// One-off: pull character facts + Commons photos + originals from the old comic-mutant site
// into draft files that the content pass completes (storyline, gossip, quiz, theme, rig).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const OLD = path.resolve('../comic-mutant/src');
const out = (p, d) => {
  mkdirSync(path.dirname(p), { recursive: true });
  if (!existsSync(p)) writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
};

for (const f of readdirSync(`${OLD}/content/archive-characters`)) {
  const d = JSON.parse(readFileSync(`${OLD}/content/archive-characters/${f}`, 'utf8'));
  const slug = f.replace(/\.json$/, '');
  let photo;
  if (d.photo && existsSync(`${OLD}/assets/archive-photos/${slug}.webp`)) {
    copyFileSync(`${OLD}/assets/archive-photos/${slug}.webp`, `public/assets/photos/${slug}.webp`);
    const { alt, artist, license, licenseUrl, sourcePage, objectPosition } = d.photo;
    photo = { file: `${slug}.webp`, alt, artist, license, licenseUrl, sourcePage, objectPosition };
  }
  out(`content/characters/${d.universe}/${slug}.json`, {
    slug,
    name: d.name,
    realName: d.realName,
    universe: d.universe,
    kind: d.kind,
    medium: 'comics',
    publisher: d.publisher,
    summary: d.summary,
    origin: d.origin,
    creators: d.creators,
    firstAppearance: d.firstAppearance,
    powers: d.powers.slice(0, 12),
    affiliations: (d.affiliations ?? []).slice(0, 12),
    allies: d.partnersInRoster ?? [],
    rivals: [],
    sources: d.sources,
    ...(photo ? { photo } : {}),
    TODO: 'storyline, gossip, quiz, theme, heat, rivals',
  });
}

for (const kind of ['heroes', 'villains']) {
  for (const f of readdirSync(`${OLD}/content/${kind}`)) {
    const d = JSON.parse(readFileSync(`${OLD}/content/${kind}/${f}`, 'utf8'));
    out(`content/fighters/${f}`, {
      slug: f.replace(/\.json$/, ''),
      name: d.name,
      alias: d.alias,
      kind: d.alignment === 'villain' ? 'villain' : 'hero',
      archetype: d.archetype,
      legacySummary: d.summary,
      legacyOrigin: d.origin,
      legacyQuotes: d.quotes,
      legacyStats: d.stats,
      legacyColours: { primary: d.visual?.primary, secondary: d.visual?.secondary },
      TODO: 'bio, catchphrase, rig, stats(1-10), special, theme, rivals, heat',
    });
  }
}
console.log('imported');
