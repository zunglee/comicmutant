/** Zod-free Sacred India lists, safe to import in the browser. */

export const TRADITION_TABLE = [
  { id: 'hindu', label: 'Hindu', blurb: 'Gods, goddesses, avatars, sages and the epics' },
  { id: 'buddhist', label: 'Buddhist', blurb: 'The Buddha, his disciples and the bodhisattvas' },
  { id: 'jain', label: 'Jain', blurb: 'The 24 Tirthankaras and Jain heroes' },
  { id: 'sikh', label: 'Sikh', blurb: 'The ten Gurus and the heroes of Sikh history' },
] as const;
export type Tradition = (typeof TRADITION_TABLE)[number]['id'];
export const TRADITIONS = TRADITION_TABLE.map((t) => t.id) as unknown as readonly [
  Tradition,
  ...Tradition[],
];

export const GROUP_TABLE = [
  { id: 'trimurti', label: 'The Trimurti', tradition: 'hindu' },
  { id: 'devi', label: 'Devis', tradition: 'hindu' },
  { id: 'deva', label: 'Devas', tradition: 'hindu' },
  { id: 'avatar', label: 'Dashavatara', tradition: 'hindu' },
  { id: 'ramayana', label: 'Ramayana', tradition: 'hindu' },
  { id: 'mahabharata', label: 'Mahabharata', tradition: 'hindu' },
  { id: 'krishna-leela', label: "Krishna's world", tradition: 'hindu' },
  { id: 'purana', label: 'Puranic heroes', tradition: 'hindu' },
  { id: 'rishi', label: 'Rishis and sages', tradition: 'hindu' },
  { id: 'asura', label: 'Asuras and rakshasas', tradition: 'hindu' },
  { id: 'divine-being', label: 'Divine beings', tradition: 'hindu' },
  { id: 'bhakti', label: 'Bhakti saints', tradition: 'hindu' },
  { id: 'buddha', label: 'The Buddha', tradition: 'buddhist' },
  { id: 'disciple', label: 'Disciples and followers', tradition: 'buddhist' },
  { id: 'bodhisattva', label: 'Bodhisattvas', tradition: 'buddhist' },
  { id: 'tirthankara', label: 'Tirthankaras', tradition: 'jain' },
  { id: 'jain-figure', label: 'Jain heroes and saints', tradition: 'jain' },
  { id: 'guru', label: 'The Ten Gurus', tradition: 'sikh' },
  { id: 'sikh-figure', label: 'Sikh heroes and saints', tradition: 'sikh' },
] as const;
export type SacredGroup = (typeof GROUP_TABLE)[number]['id'];
export const SACRED_GROUPS = GROUP_TABLE.map((g) => g.id) as unknown as readonly [
  SacredGroup,
  ...SacredGroup[],
];

/** Generic card motifs. Never a face, a drawn deity, or a sacred emblem traced from a source. */
export const SACRED_SYMBOLS = [
  'lotus',
  'flame',
  'sun',
  'moon',
  'wave',
  'mountain',
  'wheel',
  'conch',
  'flute',
  'bow',
  'mace',
  'tree',
  'lamp',
  'feather',
  'serpent',
  'book',
  'star',
  'drum',
  'sword',
  'footprint',
] as const;
export type SacredSymbol = (typeof SACRED_SYMBOLS)[number];
