import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cachePolicy } from '~/entry.server';
import { ThemeSpec } from '~/lib/schema';
import {
  ACCENT_KEYS,
  accentVars,
  contrast,
  HOUSE_SLUG,
  layerPackVars,
  RULES_VERSION,
  TEXT_MIN,
  type ThemeVars,
  themeVars,
} from '~/lib/theme/compute';
import {
  backdropProblems,
  contrastAdjustments,
  htmlMood,
  htmlVars,
  packLayerFor,
  skinCss,
  skinVars,
} from '~/skins/compute';
import { realmOf } from '~/skins/context';
import { bezier, seconds as secondsOf, skinMotion } from '~/skins/motion';
import {
  FONT_URLS,
  isSkinId,
  preloadHrefs,
  resolveSkin,
  SKINS,
  skinFontImports,
} from '~/skins/registry';
import { pickSkin, readPinned } from '~/skins/select';
import { SKIN_IDS, SKIN_VAR_NAMES, type SkinSpec } from '~/skins/types';

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : [];
  });
/** Every shipped character/original theme, keyed by file. */
const themes = [...walk('content/characters'), ...walk('content/fighters')]
  .map((f) => ({ f, t: ThemeSpec.safeParse(JSON.parse(readFileSync(f, 'utf8')).theme) }))
  .filter((x) => x.t.success)
  .map((x) => ({ f: x.f, t: x.t.data as ThemeSpec }));
const themeOf = (file: string) => {
  const hit = themes.find((x) => x.f.endsWith(file));
  if (!hit) throw new Error(`no theme ${file}`);
  return hit.t;
};

const skins = SKIN_IDS.map((id) => SKINS[id]);

/** [text, surface, min ratio] — the same pairs test/unit/theme.test.ts holds every theme to. */
const PAIRS: [string, string, number][] = [
  ['--fg', '--bg', 4.5],
  ['--fg', '--surface-2', 4.5],
  ['--card-fg', '--card', 4.5],
  ['--muted', '--card', 4.5],
  ['--muted', '--bg', 4.5],
  ['--c1-text', '--bg', 4.5],
  ['--c1-text-card', '--card', 4.5],
  ['--c3-text', '--bg', 4.5],
  ['--on-c1', '--btn-c1', 4.5],
  ['--on-c1', '--c1', 3],
  ['--on-c2', '--c2', 3],
  ['--on-c3', '--c3', 3],
  // Control borders (WCAG 1.4.11 non-text contrast).
  ['--line-strong', '--bg', 3],
  ['--line-strong', '--card', 3],
];

const ratio = (v: ThemeVars, a: string, b: string) =>
  contrast(v[a as `--${string}`] as string, v[b as `--${string}`] as string);

const seconds = (d: string) =>
  d.endsWith('ms') ? Number.parseFloat(d) / 1000 : Number.parseFloat(d);

describe('registry', () => {
  it('the registry is the single list: 4 skins, unique ids, each keyed by its own id', () => {
    expect(SKIN_IDS).toEqual(Object.keys(SKINS));
    expect(SKIN_IDS).toHaveLength(4);
    expect(new Set(SKIN_IDS.map((id) => SKINS[id].id)).size).toBe(SKIN_IDS.length);
  });
  it('fonts live in the spec: preload keys resolve in its own fontFiles, its loader is wired', () => {
    for (const s of skins) {
      for (const k of s.type.preload) expect(s.type.fontFiles[k], `${s.id} ${k}`).toBeTruthy();
      expect(skinFontImports[s.id]).toBe(s.type.fontLoaders);
    }
  });
  it('Devanagari-capable faces load through unicode-range CSS, never a bare subset file (S21)', () => {
    for (const f of ['app/skins/sacred.ts', 'app/skins/desi.ts', 'app/root.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/(devanagari|gurmukhi)-\d00\.css/);
    }
  });
  it('has one spec per SKIN_ID, keyed by its own id', () => {
    expect(Object.keys(SKINS).sort()).toEqual([...SKIN_IDS].sort());
    for (const id of SKIN_IDS) expect(SKINS[id].id).toBe(id);
  });
  it('routes are absolute path prefixes', () => {
    for (const s of skins) for (const r of s.routes) expect(r).toMatch(/^\/[a-z0-9/-]*[a-z0-9]$/);
  });
  it('every preload key names a known woff2 file, and each skin has a font loader', () => {
    for (const s of skins) {
      for (const k of s.type.preload) expect(FONT_URLS[k], `${s.id} preload ${k}`).toBeTruthy();
      expect(preloadHrefs(s)).toHaveLength(s.type.preload.length);
      expect(typeof skinFontImports[s.id]).toBe('function');
    }
  });
  it('isSkinId accepts only registered ids', () => {
    expect(isSkinId('crime')).toBe(true);
    for (const junk of ['', 'Comic', 'gta', null, 3, undefined]) expect(isSkinId(junk)).toBe(false);
  });
});

describe('skinVars', () => {
  it.each(skins.map((s) => [s.id, s] as const))('%s writes every SKIN_VAR_NAME', (_id, s) => {
    const v = skinVars(s);
    for (const name of SKIN_VAR_NAMES) {
      expect(v[name], name).toBeTypeOf('string');
      expect((v[name] as string).length, name).toBeGreaterThan(0);
    }
    // Nothing outside the contract, and nothing that could break the inline style attribute.
    expect(Object.keys(v).sort()).toEqual([...SKIN_VAR_NAMES].sort());
    for (const [k, val] of Object.entries(v)) {
      expect(val, k).not.toMatch(/;|!important/);
    }
  });

  it.each(skins.map((s) => [s.id, s] as const))('%s passes AA on every text pair', (_id, s) => {
    const v = skinVars(s);
    for (const [a, b, min] of PAIRS)
      expect(ratio(v, a, b), `${a} on ${b}`).toBeGreaterThanOrEqual(min);
  });

  it('pushes a failing author colour to AA instead of trusting it', () => {
    const base = SKINS.desi;
    const bad: SkinSpec = {
      ...base,
      colors: { ...base.colors, fg: '#fff0d0', muted: '#ffe0b0', cardFg: '#ffffff', c3: '#ffee00' },
    };
    const v = skinVars(bad);
    for (const [a, b, min] of PAIRS) expect(ratio(v, a, b), a).toBeGreaterThanOrEqual(min);
  });

  it('keeps shadow pieces separate and turns pattern/backdrop/tilt into CSS', () => {
    const c = skinVars(SKINS.comic);
    expect(c['--shadow-x']).toBe('5px');
    expect(c['--shadow-blur']).toBe('0px');
    expect(c['--shadow-color']).toBe('var(--line)');
    expect(c['--pattern-image']).toContain('radial-gradient(var(--halftone)');
    expect(c['--pattern-size']).toBe('14px 14px');
    expect(c['--backdrop']).toBe('none');
    expect(c['--hover-lift']).toBe('2px');
    const s = skinVars(SKINS.sacred);
    expect(s['--pattern-image']).toBe('none');
    expect(s['--halftone']).toBe('transparent');
    expect(s['--backdrop']).toMatch(/^radial-gradient/);
    expect(
      skinVars({ ...SKINS.crime, shape: { ...SKINS.crime.shape, tilt: '-1.5' } })['--tilt'],
    ).toBe('-1.5deg');
  });

  it('comic carries today’s house fallback colours and type', () => {
    const v = skinVars(SKINS.comic);
    expect(v).toMatchObject({
      '--bg': '#12101a',
      '--fg': '#f6f1e7',
      '--card': '#241523',
      '--muted': '#b9b1a6',
      '--line': '#000000',
      '--c1': '#ff2e4d',
      '--c3': '#ffd400',
      '--glow': '#ffd40088',
      '--halftone': '#ff2e4d2e',
      '--display-tracking': '0.03em',
    });
    expect(v['--font-display']).toMatch(/^"Bangers"/);
    expect(v['--font-head']).toMatch(/^"Russo One"/);
    expect(v['--font-body']).toMatch(/^"Chakra Petch"/);
  });

  it('lengths carry their units; icon stroke is unitless', () => {
    const len = /^(0|-?\d*\.?\d+(px|rem|em))$/;
    for (const sp of skins) {
      const v = skinVars(sp);
      for (const k of ['--hover-lift', '--press-depth', '--ink-offset'] as const)
        expect(v[k], `${sp.id} ${k}`).toMatch(/^-?\d*\.?\d+px$/);
      for (const k of ['--shadow-x', '--shadow-y', '--shadow-blur', '--shadow-spread'] as const)
        expect(v[k], `${sp.id} ${k}`).toMatch(len);
      expect(v['--tilt'], sp.id).toMatch(/deg$/);
      expect(v['--icon-stroke'], sp.id).toMatch(/^\d*\.?\d+$/);
    }
  });

  it('emits spread, backdrop size, halftone dots and ink offset with sensible defaults', () => {
    const c = skinVars(SKINS.comic);
    expect(c['--shadow-spread']).toBe('0px');
    expect(c['--backdrop-size']).toBe('auto');
    expect(c['--halftone-image']).toBe('radial-gradient(var(--line) 1px, transparent 1.3px)');
    expect(c['--halftone-size']).toBe('7px 7px');
    expect(c['--ink-offset']).toBe('3px');
    const s = skinVars(SKINS.sacred);
    expect(s['--shadow-spread']).toBe('-12px');
    expect(s['--halftone-image']).toBe('none');
    expect(s['--ink-offset']).toBe('0px');
    const sized = { ...SKINS.desi, colors: { ...SKINS.desi.colors, backdropSize: '14px 14px' } };
    expect(skinVars(sized)['--backdrop-size']).toBe('14px 14px');
    for (const pattern of ['dots', 'mandala', 'scanlines', 'none'] as const) {
      const v = skinVars({ ...SKINS.crime, shape: { ...SKINS.crime.shape, pattern } });
      expect(v['--halftone-image'], pattern).toBeTruthy();
      expect(v['--halftone-size'], pattern).toBeTruthy();
    }
  });

  it('ui type tokens: comic controls in the head face, sacred in the body face', () => {
    const c = skinVars(SKINS.comic);
    expect(c['--font-ui']).toBe(SKINS.comic.type.head);
    expect(c).toMatchObject({
      '--ui-weight': '400',
      '--ui-tracking': '0.04em',
      '--kicker-tracking': '0.16em',
      '--head-leading': '1.1',
    });
    const s = skinVars(SKINS.sacred);
    expect(s['--font-ui']).toMatch(/^"Mukta"/);
    expect(s).toMatchObject({
      '--ui-weight': '600',
      '--ui-tracking': '0.01em',
      '--kicker-tracking': '0.18em',
    });
    const { headLeading: _drop, ...type } = SKINS.crime.type;
    expect(skinVars({ ...SKINS.crime, type })['--head-leading']).toBe('1.1');
  });

  it('--line-strong: the authored colour when it reads at 3:1, else line pushed to 3:1', () => {
    expect(skinVars(SKINS.sacred)['--line-strong']).toBe('#a8843f');
    expect(skinVars(SKINS.sacred)['--line']).toBe(SKINS.sacred.colors.line);
    const { lineStrong: _drop, ...colors } = SKINS.desi.colors;
    expect(skinVars({ ...SKINS.desi, colors })['--line-strong']).toBe(SKINS.desi.colors.line);
    const v = skinVars(SKINS.comic);
    expect(contrast(v['--line-strong'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(3);
  });

  it('hand-picked text colours ship as written when they pass AA', () => {
    const v = skinVars(SKINS.sacred);
    expect(v['--c1-text']).toBe('#9a4a05');
    expect(v['--c1-text-card']).toBe('#9a4a05');
    expect(v['--c3-text']).toBe('#0f6467');
  });

  it('a hand-picked colour that fails AA is nudged and reported', () => {
    const bad = {
      ...SKINS.desi,
      colors: { ...SKINS.desi.colors, c1Text: '#ffd0a0', c3Text: '#fff2c0' },
    };
    const v = skinVars(bad);
    expect(contrast(v['--c1-text'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--c3-text'] as string, v['--bg'] as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastAdjustments(bad).map((a) => a.var)).toEqual(
      expect.arrayContaining(['--c1-text', '--c1-text-card', '--c3-text']),
    );
  });

  it('reports which skin colours were adjusted to reach AA', () => {
    for (const sp of skins) {
      const adj = contrastAdjustments(sp);
      for (const a of adj) console.info(`[skins] ${sp.id} ${a.var}: ${a.from} -> ${a.to} (AA)`);
      // Every adjusted value is the AA-safe one actually emitted.
      for (const a of adj) expect(skinVars(sp)[a.var]).toBe(a.to);
      // Hand-picked text overrides are a promise: a shipped skin must not need them nudged.
      expect(
        adj.filter((a) =>
          ['--c1-text', '--c1-text-card', '--c3-text', '--line-strong'].includes(a.var),
        ),
        `${sp.id} hand-picked text colour fails AA`,
      ).toEqual([]);
    }
  });

  it('skinCss is the inline style text with color-scheme', () => {
    const css = skinCss(SKINS.sacred);
    expect(css).toContain('--bg:#fbf5e6');
    expect(css.endsWith('color-scheme:light')).toBe(true);
    expect(css).not.toContain('!important');
  });
});

describe('surface policy (T3)', () => {
  const batman = themeVars(themeOf('dc/batman.json'));

  it('comic + a character reproduces that character’s computed vars (golden)', () => {
    for (const file of ['dc/batman.json', 'marvel/spider-man.json', 'indian/nagraj.json']) {
      const own = themeVars(themeOf(file));
      const got = htmlVars(SKINS.comic, own);
      for (const [k, val] of Object.entries(own))
        expect(got[k as `--${string}`], `${file} ${k}`).toBe(val);
      // The rest comes from the skin: type, shape, motion.
      expect(got['--font-display']).toBe(skinVars(SKINS.comic)['--font-display']);
    }
    expect(htmlMood(SKINS.comic, 'light')).toBe('light');
  });

  it('comic derives a 3:1 --line-strong from every character’s own surfaces', () => {
    for (const { f, t } of themes) {
      const v = htmlVars(SKINS.comic, themeVars(t), 'x');
      for (const k of ['--bg', '--card'] as const)
        expect(
          contrast(v['--line-strong'] as string, v[k] as string),
          `${f} on ${k}`,
        ).toBeGreaterThanOrEqual(3);
    }
  });

  it('--control-line: comic = the character’s ink --line; other skins = 3:1 --line-strong', () => {
    expect(skinVars(SKINS.comic)['--control-line']).toBe(skinVars(SKINS.comic)['--line']);
    for (const { f, t } of themes) {
      const own = themeVars(t);
      for (const slug of ['x', 'house']) {
        const v = htmlVars(SKINS.comic, own, slug);
        expect(v['--control-line'], f).toBe(own['--line']);
      }
    }
    for (const s of skins.filter((x) => x.surfaces !== 'character')) {
      for (const pack of [undefined, ...themes.slice(0, 20).map((x) => themeVars(x.t))]) {
        const v = htmlVars(s, pack, 'x');
        expect(v['--control-line'], s.id).toBe(v['--line-strong']);
        for (const k of ['--bg', '--card'] as const)
          expect(
            contrast(v['--control-line'] as string, v[k] as string),
            `${s.id} on ${k}`,
          ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('comic derives --surface-2 from the character’s own surfaces', () => {
    const got = htmlVars(SKINS.comic, batman);
    expect(got['--surface-2']).not.toBe(skinVars(SKINS.comic)['--surface-2']);
    expect(
      layerPackVars({ ...batman, '--surface-2': '#123456' }, { mode: 'all' })['--surface-2'],
    ).toBe('#123456');
  });

  it('the house pack (no character equipped) paints comic as today but leaves other skins alone', () => {
    const house = themeVars({
      palette: { c1: '#ff2e4d', c2: '#1b1464', c3: '#ffd400' },
      motif: 'chaos',
      mood: 'dark',
      tagline: 'Every universe, one loud page.',
    });
    expect(htmlVars(SKINS.comic, house, HOUSE_SLUG)).toMatchObject(house);
    for (const s of [SKINS.desi, SKINS.crime]) {
      expect(htmlVars(s, house, HOUSE_SLUG), s.id).toEqual(skinVars(s));
      expect(layerPackVars(house, packLayerFor(s), HOUSE_SLUG)['--c1']).toBe(s.colors.c1);
    }
    // A real character with the same palette still tints the skin.
    expect(htmlVars(SKINS.desi, house, 'someone')['--c1']).toBe('#ff2e4d');
  });

  it('a skin-owned skin keeps its surfaces and takes only the accents', () => {
    for (const s of [SKINS.desi, SKINS.crime]) {
      const got = htmlVars(s, batman);
      const base = skinVars(s);
      for (const k of [
        '--bg',
        '--fg',
        '--card',
        '--card-fg',
        '--surface-2',
        '--muted',
        '--line',
      ] as const)
        expect(got[k], `${s.id} ${k}`).toBe(base[k]);
      expect(got['--c1']).toBe(batman['--c1']);
      expect(got['--btn-c1']).toBe(batman['--btn-c1']);
      expect(htmlMood(s, 'dark')).toBe(s.colors.mood);
      expect(htmlMood(s, 'light')).toBe(s.colors.mood);
    }
  });

  it('every character accent stays AA on every skin-owned skin', () => {
    expect(themes.length).toBeGreaterThan(100);
    for (const s of skins.filter((x) => packLayerFor(x).mode === 'accent')) {
      for (const { f, t } of themes) {
        const v = htmlVars(s, themeVars(t));
        for (const [a, b, min] of PAIRS)
          expect(ratio(v, a, b), `${s.id} × ${f}: ${a} on ${b}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('a lock skin ignores the equipped character entirely (Sacred stays calm)', () => {
    expect(packLayerFor(SKINS.sacred)).toEqual({ mode: 'none' });
    expect(htmlVars(SKINS.sacred, batman)).toEqual(skinVars(SKINS.sacred));
    expect(htmlMood(SKINS.sacred, 'dark')).toBe('light');
  });

  it('accentVars filters to accent keys and re-derives text colours on given surfaces', () => {
    const a = accentVars(batman);
    expect(Object.keys(a).every((k) => (ACCENT_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(a['--bg']).toBeUndefined();
    const on = accentVars(batman, { bg: '#ffffff', card: '#ffffff' });
    expect(contrast(on['--c1-text'] as string, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(on['--c3-text'] as string, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(layerPackVars(batman, { mode: 'none' })).toEqual({});
  });
});

describe('selection (T4)', () => {
  const req = (cookie?: string) =>
    new Request('http://localhost/', { headers: cookie ? { cookie } : {} });

  it.each([
    // [path, pinned, universe, id, source]
    ['/sacred', 'crime', null, 'sacred', 'lock'],
    ['/sacred/f/ganga', null, null, 'sacred', 'lock'],
    ['/desi', 'crime', null, 'crime', 'pinned'],
    ['/', 'crime', null, 'crime', 'pinned'],
    ['/', 'sacred', null, 'sacred', 'pinned'],
    ['/c/nagraj', 'comic', 'indian', 'comic', 'pinned'],
    ['/desi', null, null, 'desi', 'route'],
    ['/desi/anything', null, null, 'desi', 'route'],
    ['/c/nagraj', null, 'indian', 'desi', 'route'],
    ['/c/batman', null, 'dc', 'comic', 'default'],
    ['/desirable', null, null, 'comic', 'default'],
    ['/sacredx', null, null, 'comic', 'default'],
    ['/roster', 'gta', null, 'comic', 'default'],
    ['/roster/nagraj', null, 'indian', 'comic', 'default'],
  ] as const)('%s pinned=%s universe=%s → %s (%s)', (pathname, pinned, universe, id, source) => {
    expect(resolveSkin({ pathname, pinned, universe })).toEqual({ id, source });
  });

  it('pickSkin reads the cookie and the character universe from content', () => {
    expect(pickSkin(req(), '/c/nagraj')).toEqual({ id: 'desi', source: 'route', pinned: null });
    expect(pickSkin(req(), '/c/batman')).toEqual({ id: 'comic', source: 'default', pinned: null });
    expect(pickSkin(req(), '/c/no-such-hero')).toMatchObject({ id: 'comic', source: 'default' });
    expect(pickSkin(req(), '/c/%E0%A4')).toMatchObject({ id: 'comic' });
    expect(pickSkin(req('cm_skin=crime'), '/c/nagraj')).toMatchObject({
      id: 'crime',
      source: 'pinned',
    });
    expect(pickSkin(req('a=1; cm_skin=crime'), '/sacred')).toEqual({
      id: 'sacred',
      source: 'lock',
      pinned: 'crime',
    });
    expect(pickSkin(req('cm_skin=desi'), '/')).toMatchObject({ id: 'desi', source: 'pinned' });
  });

  it('junk cookies are ignored', () => {
    for (const junk of [
      'cm_skin=gta',
      'cm_skin=',
      'cm_skin=%E0%A4',
      'cm_skin=Comic',
      'cm_skin_x=crime',
    ])
      expect(readPinned(req(junk)), junk).toBeNull();
    expect(pickSkin(req('cm_skin=gta'), '/desi')).toMatchObject({ id: 'desi', source: 'route' });
  });
});

describe('POST /api/skin', () => {
  const SITE = 'http://localhost';
  type Reply = {
    status: number;
    body: Record<string, unknown>;
    cookie: string | null;
    cache: string | null;
  };
  const send = async (
    body: unknown,
    opts: { method?: string; origin?: string | null; type?: string; raw?: string } = {},
  ): Promise<Reply> => {
    const mod = (await import('~/routes/api/skin')) as unknown as {
      action: (a: { request: Request }) => Promise<unknown>;
    };
    const method = opts.method ?? 'POST';
    const headers: Record<string, string> = { 'content-type': opts.type ?? 'application/json' };
    const origin = opts.origin === undefined ? SITE : opts.origin;
    if (origin) headers.origin = origin;
    const request = new Request(`${SITE}/api/skin`, {
      method,
      headers,
      ...(method === 'POST' || method === 'PUT' ? { body: opts.raw ?? JSON.stringify(body) } : {}),
    });
    const r = (await mod.action({ request })) as {
      data?: unknown;
      init?: { status?: number; headers?: HeadersInit };
    };
    const h = new Headers(r.init?.headers);
    return {
      status: r.init?.status ?? 200,
      body: r.data as Record<string, unknown>,
      cookie: h.getSetCookie()[0] ?? null,
      cache: h.get('cache-control'),
    };
  };

  it('pins a valid skin for a year, Lax, private', async () => {
    const r = await send({ skin: 'crime' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, skin: 'crime' });
    expect(r.cookie).toMatch(/^cm_skin=crime; Path=\/; Max-Age=31536000; SameSite=Lax/);
    expect(r.cookie).not.toContain('Secure'); // dev; Secure is added when ENV.prod
    expect(r.cache).toBe('private, no-store');
  });

  it('{skin: null} and DELETE clear the pin', async () => {
    for (const r of [await send({ skin: null }), await send(null, { method: 'DELETE' })]) {
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, skin: null });
      expect(r.cookie).toMatch(/^cm_skin=; Path=\/; Max-Age=0; SameSite=Lax/);
    }
  });

  it('refuses unknown skins and malformed bodies with stable codes, setting no cookie', async () => {
    const cases: [Reply, number, string][] = [
      [await send({ skin: 'gta' }), 400, 'unknown-skin'],
      [await send({ skin: 3 }), 400, 'unknown-skin'],
      [await send({}), 400, 'invalid'],
      [await send(null), 400, 'invalid'],
      [await send(null, { raw: '{nope' }), 400, 'invalid'],
      [await send({ skin: 'crime' }, { type: 'text/plain' }), 415, 'invalid'],
      [await send(null, { raw: JSON.stringify({ skin: 'x'.repeat(400) }) }), 413, 'invalid'],
      [await send({ skin: 'crime' }, { method: 'PUT' }), 405, 'invalid'],
    ];
    for (const [r, status, code] of cases) {
      expect(r.status).toBe(status);
      expect(r.body).toMatchObject({ ok: false, code });
      expect(r.cookie).toBeNull();
    }
  });

  it('refuses cross-site and origin-less writes', async () => {
    for (const r of [
      await send({ skin: 'crime' }, { origin: 'https://evil.example' }),
      await send({ skin: 'crime' }, { origin: null }),
      await send(null, { method: 'DELETE', origin: 'https://evil.example' }),
    ]) {
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ ok: false, code: 'cross-site' });
      expect(r.cookie).toBeNull();
    }
  });

  it('a page for a browser with any preference cookie is private (S22); without one it is shared', () => {
    for (const cookie of ['cm_skin=crime', 'cm_theme=batman', 'a=1; cm_top5=x', 'cm_fx=lite']) {
      const page = new Headers();
      cachePolicy(new Request(`${SITE}/desi`, { headers: { cookie } }), page, 200);
      expect(page.get('cache-control'), cookie).toBe('private, no-store');
    }
    const page = new Headers();
    cachePolicy(new Request(`${SITE}/desi`, { headers: { cookie: 'cm_seen=1' } }), page, 200);
    expect(page.get('cache-control')).toMatch(/^public/);
    expect(page.get('vary')).toContain('Cookie');
    const write = new Headers({ 'Set-Cookie': 'cm_skin=crime' });
    cachePolicy(new Request(`${SITE}/api/skin`, { method: 'POST' }), write, 200);
    expect(write.get('cache-control')).toBe('private, no-store');
  });
});

describe('calm skins (T7)', () => {
  it('lock skins are calm, and calm skins never move faster than 0.4s', () => {
    for (const s of skins) {
      if (s.lock) expect(s.motion.calm, s.id).toBe(true);
      if (!s.motion.calm) continue;
      for (const d of [s.motion.durFast, s.motion.durBase, s.motion.durSlow])
        expect(seconds(d), `${s.id} ${d}`).toBeGreaterThanOrEqual(0.4);
      expect(s.motion.entrance).not.toBe('pop');
      expect(s.motion.wipe).not.toBe('glitch');
      expect(s.shape.tilt).toMatch(/^0(deg)?$/);
    }
    expect(SKINS.sacred.motion.calm).toBe(true);
  });

  it('no skin source uses !important (comments aside)', () => {
    const files = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = path.join(d, f);
        return statSync(p).isDirectory() ? files(p) : [p];
      });
    for (const f of files('app/skins')) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toContain('!important');
    }
  });
});

describe('backdrop is checked against the text (S18)', () => {
  it('every shipped backdrop passes, so none is dropped', () => {
    for (const s of skins) {
      expect(backdropProblems(s), s.id).toEqual([]);
      if (s.colors.backdrop.trim()) expect(skinVars(s)['--backdrop'], s.id).not.toBe('none');
    }
  });

  it('a light "ocean" copy of crime keeping its dark opaque gradient is refused and dropped', () => {
    const ocean = {
      ...SKINS.crime,
      colors: {
        ...SKINS.crime.colors,
        bg: '#e8f4fb',
        fg: '#0b2a4a',
        card: '#ffffff',
        cardFg: '#0b2a4a',
        surface2: '#d6ebf6',
        muted: '#33536f',
        mood: 'light' as const,
      },
    };
    const problems = backdropProblems(ocean);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.reason).join(' ')).toMatch(/--fg is \d/);
    expect(skinVars(ocean)['--backdrop']).toBe('none');
    expect(skinVars(ocean)['--backdrop-size']).toBe('auto');
  });

  it('refuses colours it cannot check, accepts translucent tints and token references', () => {
    const at = (backdrop: string) =>
      backdropProblems({ ...SKINS.desi, colors: { ...SKINS.desi.colors, backdrop } });
    expect(at('linear-gradient(hsl(200 50% 50%), transparent)')[0]?.reason).toMatch(
      /engine can check/,
    );
    expect(
      at('linear-gradient(color-mix(in srgb, red, blue), transparent)').length,
    ).toBeGreaterThan(0);
    expect(at('linear-gradient(navy, transparent)')[0]?.reason).toMatch(/named colours/);
    expect(at('url(/x.png)').length).toBeGreaterThan(0);
    expect(
      at('radial-gradient(ellipse 60% 40% at 50% 0%, rgb(0 0 0 / 0.04), transparent 70%)'),
    ).toEqual([]);
    expect(at('linear-gradient(var(--bg), var(--surface-2))')).toEqual([]);
    expect(at('linear-gradient(#000, #111)').length).toBeGreaterThan(0);
  });
});

describe('accent text reads on the page AND in cards (critic r1: /c/doga 4.48:1)', () => {
  it('themeVars: c1-text and c3-text >= 4.6 on bg and card for every shipped theme', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(3);
    for (const { f, t } of themes) {
      const v = themeVars(t);
      for (const k of ['--c1-text', '--c3-text'] as const)
        for (const s of ['--bg', '--card'] as const)
          expect(ratio(v, k, s), `${f} ${k} on ${s}`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(ratio(v, '--c1-text-card', '--card'), f).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });

  it('every skin × every theme: accent text >= 4.6 on the bg and card actually painted', () => {
    for (const s of skins) {
      for (const { f, t } of themes) {
        const v = htmlVars(s, themeVars(t), 'x');
        for (const k of ['--c1-text', '--c3-text'] as const)
          for (const sf of ['--bg', '--card'] as const)
            expect(ratio(v, k, sf), `${s.id} × ${f}: ${k} on ${sf}`).toBeGreaterThanOrEqual(
              TEXT_MIN,
            );
      }
      const own = skinVars(s);
      for (const k of ['--c1-text', '--c3-text'] as const)
        for (const sf of ['--bg', '--card'] as const)
          expect(ratio(own, k, sf), `${s.id} ${k} on ${sf}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('motion tokens (S20)', () => {
  it('comic is the baseline: call-site springs and staggers pass through unchanged', () => {
    const mo = skinMotion(SKINS.comic);
    expect(mo.spring({ stiffness: 500, damping: 14 }, 0.1)).toEqual({
      type: 'spring',
      stiffness: 500,
      damping: 14,
      delay: 0.1,
    });
    expect(mo.delay(3, 0.03)).toBeCloseTo(0.09);
    expect(mo.tween(0.15)).toEqual({ duration: 0.15 });
    expect(mo.tween(0.5, { ease: 'easeOut' })).toEqual({ duration: 0.5, ease: 'easeOut' });
    expect(mo.springConfig).toEqual(SKINS.comic.motion.spring);
  });

  it('every skin reads its own spring, stagger and entrance', () => {
    for (const s of skins) {
      const mo = skinMotion(s);
      expect(mo.stagger).toBe(s.motion.stagger);
      expect(mo.delay(1)).toBeCloseTo(s.motion.stagger);
      if (!s.motion.calm) {
        expect(mo.spring()).toMatchObject({ type: 'spring', ...s.motion.spring });
        expect(Object.keys(mo.entrance.initial).length).toBeGreaterThan(0);
      }
      // Entrances never hide text in the SSR HTML.
      expect(mo.entrance.initial).not.toHaveProperty('opacity');
    }
  });

  it('a calm skin never springs and never goes under 0.4 s', () => {
    for (const s of skins.filter((x) => x.motion.calm)) {
      const mo = skinMotion(s);
      const t = mo.spring({ stiffness: 600, damping: 12 });
      expect(t).not.toHaveProperty('type');
      expect(t.duration as number).toBeGreaterThanOrEqual(0.4);
      expect(mo.tween(0.1).duration as number).toBeGreaterThanOrEqual(0.4);
      expect(mo.dur(0.05)).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('bezier and seconds parse the spec strings', () => {
    expect(bezier('cubic-bezier(0.2, 1.4, 0.4, 1)')).toEqual([0.2, 1.4, 0.4, 1]);
    expect(bezier('ease')).toEqual([0.16, 1, 0.3, 1]);
    expect(secondsOf('600ms')).toBeCloseTo(0.6);
    expect(secondsOf('0.7s')).toBeCloseTo(0.7);
  });
});

describe('realm alias and atmosphere names', () => {
  it('data-realm="sacred" only on the lock route, never when sacred is merely pinned (S19)', () => {
    expect(realmOf('sacred', 'lock')).toBe('sacred');
    expect(realmOf('sacred', 'pinned')).toBeUndefined();
    expect(realmOf('comic', 'default')).toBeUndefined();
  });
  it('the desi atmosphere is marigold-dust; icons carry stroke + linecap only', () => {
    expect(SKINS.desi.atmosphere.kind).toBe('marigold-dust');
    for (const s of skins) expect(Object.keys(s.icons).sort()).toEqual(['linecap', 'stroke']);
  });
});
