/**
 * DEV ONLY. `?fixture=1` on /quiz/play fakes /api/quiz/* in the browser so the UI can be checked
 * without the real API. Reached only through `import.meta.env.DEV` in api.ts, so the production
 * build never contains this file. Extra switches (all optional):
 *   lag=<ms>    delay every reply        fail=1  first answer fails once (network)
 *   held=1      summary says held        pb=1    summary says personal best
 *   fast=<s>    seconds per question     guest=1 summary is claimable, not ranked
 */
import type {
  DailyArchive,
  QuizAnswerBody,
  QuizNextBody,
  QuizQuestionView,
  QuizReveal,
  QuizStartBody,
  QuizSummary,
} from '~/lib/quiz-contract';

interface Item {
  slug: string;
  name: string;
  universe: QuizQuestionView['character']['universe'];
  topic: string;
  difficulty: 1 | 2 | 3;
  q: string;
  options: [string, string, string, string];
  right: number;
  why: string;
  source: string;
  fans: number | null;
}

const BANK: Item[] = [
  {
    slug: 'spider-man',
    name: 'Spider-Man',
    universe: 'marvel',
    topic: 'Origin',
    difficulty: 1,
    q: 'Who raised Peter Parker after his parents were gone?',
    options: ['Aunt May and Uncle Ben', 'Nick Fury', 'Norman Osborn', 'Tony Stark'],
    right: 0,
    why: 'Peter grew up in Queens with his aunt and uncle, and the loss of Ben shaped his whole code.',
    source: 'https://en.wikipedia.org/wiki/Spider-Man',
    fans: 91,
  },
  {
    slug: 'batman',
    name: 'Batman',
    universe: 'dc',
    topic: 'Allies',
    difficulty: 1,
    q: "What is the name of Bruce Wayne's loyal butler?",
    options: ['Lucius', 'Jim', 'Alfred', 'Harvey'],
    right: 2,
    why: 'Alfred Pennyworth keeps the manor running and patches up the Dark Knight after every night out.',
    source: 'https://en.wikipedia.org/wiki/Alfred_Pennyworth',
    fans: 94,
  },
  {
    slug: 'hulk',
    name: 'Hulk',
    universe: 'marvel',
    topic: 'Powers',
    difficulty: 1,
    q: 'What kind of radiation turned Bruce Banner into the Hulk?',
    options: ['Cosmic', 'Gamma', 'Solar', 'Neutron'],
    right: 1,
    why: 'A gamma bomb test went wrong, and Banner took the blast while saving a teenager.',
    source: 'https://en.wikipedia.org/wiki/Hulk',
    fans: 88,
  },
  {
    slug: 'superman',
    name: 'Superman',
    universe: 'dc',
    topic: 'Origin',
    difficulty: 1,
    q: 'Which doomed planet was Superman born on?',
    options: ['Apokolips', 'Oa', 'Thanagar', 'Krypton'],
    right: 3,
    why: 'Jor-El and Lara sent baby Kal-El to Earth just before Krypton blew apart.',
    source: 'https://en.wikipedia.org/wiki/Superman',
    fans: null,
  },
  {
    slug: 'goku',
    name: 'Goku',
    universe: 'anime',
    topic: 'Backstory',
    difficulty: 2,
    q: "What is Goku's Saiyan birth name?",
    options: ['Bardock', 'Kakarot', 'Raditz', 'Turles'],
    right: 1,
    why: 'He was born Kakarot on Planet Vegeta before his pod landed on Earth.',
    source: 'https://en.wikipedia.org/wiki/Goku',
    fans: 63,
  },
  {
    slug: 'naruto-uzumaki',
    name: 'Naruto Uzumaki',
    universe: 'anime',
    topic: 'Powers',
    difficulty: 1,
    q: 'Which Tailed Beast is sealed inside Naruto?',
    options: ['Shukaku', 'Matatabi', 'Kurama', 'Gyuki'],
    right: 2,
    why: 'The Nine-Tailed Fox, Kurama, was sealed into baby Naruto the night of its attack on the village.',
    source: 'https://en.wikipedia.org/wiki/Naruto_Uzumaki',
    fans: 79,
  },
  {
    slug: 'wonder-woman',
    name: 'Wonder Woman',
    universe: 'dc',
    topic: 'Origin',
    difficulty: 2,
    q: "What is the name of Wonder Woman's home island?",
    options: ['Themyscira', 'Atlantis', 'Genosha', 'Wakanda'],
    right: 0,
    why: 'Themyscira is hidden from the world and home to the Amazons.',
    source: 'https://en.wikipedia.org/wiki/Wonder_Woman',
    fans: 47,
  },
  {
    slug: 'iron-man',
    name: 'Iron Man',
    universe: 'marvel',
    topic: 'Gear',
    difficulty: 1,
    q: "What is the name of Tony Stark's company?",
    options: ['Oscorp', 'Stark Industries', 'Wayne Enterprises', 'Pym Technologies'],
    right: 1,
    why: 'Stark Industries made weapons first, then the armour that changed everything.',
    source: 'https://en.wikipedia.org/wiki/Iron_Man',
    fans: 85,
  },
  {
    slug: 'thanos',
    name: 'Thanos',
    universe: 'marvel',
    topic: 'Gear',
    difficulty: 2,
    q: 'How many Infinity Stones are there?',
    options: ['Four', 'Five', 'Seven', 'Six'],
    right: 3,
    why: 'Mind, Soul, Reality, Power, Space and Time: six stones, one gauntlet.',
    source: 'https://en.wikipedia.org/wiki/Infinity_Gems',
    fans: 31,
  },
  {
    slug: 'hellboy',
    name: 'Hellboy',
    universe: 'other',
    topic: 'Allies',
    difficulty: 3,
    q: 'Which agency does Hellboy work for?',
    options: ['S.H.I.E.L.D.', 'The B.P.R.D.', 'A.R.G.U.S.', 'The Hellfire Club'],
    right: 1,
    why: 'The Bureau for Paranormal Research and Defense investigates and fights supernatural threats.',
    source: 'https://en.wikipedia.org/wiki/Hellboy',
    fans: 12,
  },
];

interface Game {
  order: Item[];
  /** Shuffled options + answer index per question. */
  shown: { options: Item['options']; right: number }[];
  at: number;
  score: number;
  streak: number;
  best: number;
  correct: number;
  grid: string[];
  failedOnce: boolean;
  mode: string;
}
const games = new Map<string, Game>();

const flag = (k: string) => new URLSearchParams(location.search).get(k);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function view(g: Game, i: number): QuizQuestionView {
  const it = g.order[i] as Item;
  const sh = g.shown[i] as Game['shown'][number];
  return {
    index: i,
    q: it.q,
    options: sh.options,
    difficulty: it.difficulty,
    topic: it.topic,
    character: { slug: it.slug, name: it.name, universe: it.universe },
    seconds: Number(flag('fast')) || 15,
  };
}

export async function fakePost(url: string, body: unknown): Promise<unknown> {
  await sleep(Number(flag('lag')) || 120);
  if (url.endsWith('/start')) {
    const b = body as QuizStartBody;
    let pool = BANK.slice();
    if (b.mode === 'universe') pool = pool.filter((x) => x.universe === b.universe);
    if (b.mode === 'character') pool = pool.filter((x) => x.slug === b.character);
    if (!pool.length) return { ok: false, error: 'No questions for that yet (fixture).' };
    const order = pool.concat(pool).concat(pool).slice(0, 10);
    const shown = order.map((it, i) => {
      // Rotate so the right answer lands on a different letter each question.
      const k = (i * 3 + 1) % 4;
      const opts = it.options.map((_, j) => it.options[(j + k) % 4]) as Item['options'];
      return { options: opts, right: (it.right - k + 4) % 4 };
    });
    const id = `fx-${Math.random().toString(36).slice(2, 8)}`;
    games.set(id, {
      order,
      shown,
      at: Date.now(),
      score: 0,
      streak: 0,
      best: 0,
      correct: 0,
      grid: [],
      failedOnce: false,
      mode: b.mode,
    });
    const g = games.get(id) as Game;
    const guest = flag('guest') === '1';
    return {
      ok: true,
      game: id,
      mode: b.mode,
      total: order.length,
      ranked: !guest && flag('unranked') !== '1',
      unrankedWhy: guest ? 'Join to put your score on the board.' : 'You already played today.',
      question: view(g, 0),
    };
  }
  if (url.endsWith('/answer')) {
    const b = body as QuizAnswerBody;
    const g = games.get(b.game);
    if (!g) return { ok: false, error: 'Unknown game (fixture).' };
    if (flag('fail') === '1' && !g.failedOnce) {
      g.failedOnce = true;
      return {
        ok: false,
        error: 'Could not reach the server. Check your connection.',
        network: true,
      };
    }
    const sh = g.shown[b.index] as Game['shown'][number];
    const it = g.order[b.index] as Item;
    const secs = Math.round(((Date.now() - g.at) / 1000) * 10) / 10;
    const blind = flag('blind') === '1';
    const correct = b.choice === sh.right;
    let points = 0;
    if (correct && !blind) {
      g.streak++;
      g.correct++;
      const mult = [1, 1, 1.5, 2][it.difficulty] as number;
      points =
        Math.round((100 + Math.max(0, 50 * (1 - secs / 15))) * mult) + (g.streak > 2 ? 25 : 0);
    } else g.streak = 0;
    g.best = Math.max(g.best, g.streak);
    g.score += points;
    g.grid.push(correct ? '✓' : b.choice === -1 ? '⏱' : '✗');
    // Like the real daily (Q10): a miss keeps its answer secret until midnight IST.
    const locked = blind || (g.mode === 'daily' && !correct && flag('unlock') !== '1');
    const reveal: QuizReveal = {
      correct: blind ? null : correct,
      blind,
      answer: locked ? null : sh.right,
      why: locked ? null : it.why,
      source: locked ? null : it.source,
      locked,
      timedOut: b.choice === -1,
      points,
      seconds: secs,
      streak: g.streak,
      score: g.score,
      fansRight: it.fans,
    };
    const last = b.index + 1 >= g.order.length;
    const summary: QuizSummary | null = last
      ? {
          score: g.score,
          correct: g.correct,
          total: g.order.length,
          bestStreak: g.best,
          newFacts: g.correct,
          ranked: flag('guest') !== '1',
          rank: flag('guest') === '1' || flag('held') === '1' ? null : 7,
          board: flag('guest') === '1' || flag('held') === '1' ? null : "Today's daily",
          held: flag('held') === '1',
          personalBest: flag('pb') === '1',
          grid: g.grid.join(''),
          claimable: flag('guest') === '1',
          nameWithheld: flag('withheld') === '1',
          blind: flag('blind') === '1',
        }
      : null;
    return { ok: true, reveal, more: !last, summary };
  }
  if (url.endsWith('/next')) {
    const b = body as QuizNextBody;
    const g = games.get(b.game);
    if (!g || b.index >= g.order.length) return { ok: false, error: 'No such question (fixture).' };
    g.at = Date.now();
    return { ok: true, question: view(g, b.index) };
  }
  if (url.endsWith('/claim')) {
    return {
      ok: true,
      summary: {
        score: 0,
        correct: 0,
        total: 10,
        bestStreak: 0,
        newFacts: 0,
        ranked: true,
        rank: 12,
        board: 'Facts known',
        held: false,
        personalBest: false,
        grid: '',
        claimable: false,
        nameWithheld: false,
        blind: false,
      },
    };
  }
  if (url.endsWith('/report')) return { ok: true };
  return { ok: false, error: 'Unknown fixture route.' };
}

/** Yesterday's answers for the hub preview (`/quiz?fixture=1`, dev only). */
export function fixtureArchive(): DailyArchive {
  return {
    day: '2026-10-31',
    questions: BANK.map((it) => ({
      q: it.q,
      options: it.options,
      answer: it.right,
      why: it.why,
      source: it.source,
      character: { slug: it.slug, name: it.name, universe: it.universe },
      fansRight: it.fans,
    })),
  };
}
