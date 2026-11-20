import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SKINS } from '~/skins/registry';
import { SKIN_IDS, type SkinId } from '~/skins/types';

type Mock = { id: SkinId; source: 'lock' | 'pinned' | 'route' | 'default'; pinned: SkinId | null };
let state: Mock = { id: 'comic', source: 'default', pinned: null };
vi.mock('~/skins/context', () => ({
  useSkin: () => ({ ...state, spec: SKINS[state.id], setSkin: async () => undefined }),
}));

const { SkinPickerPanel } = await import('~/components/skin-picker/panel');
const html = (s: Mock) => {
  state = s;
  return renderToStaticMarkup(createElement(SkinPickerPanel, { onPick: () => undefined }));
};
/** The <li> markup of one card. */
const card = (h: string, id: string) =>
  h.split('<li>').find((c) => c.includes(`data-skin-card="${id}"`)) ?? '';

describe('SkinPickerPanel', () => {
  it('renders Automatic first, then one card per skin, each previewed from its own spec', () => {
    const h = html({ id: 'comic', source: 'default', pinned: null });
    const ids = [...h.matchAll(/data-skin-card="(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['auto', ...SKIN_IDS]);
    expect(h).toContain('Automatic (by section)');
    for (const id of SKIN_IDS) {
      const c = card(h, id);
      const s = SKINS[id];
      expect(c).toContain(s.label);
      expect(c).toContain(s.blurb);
      expect(c).toContain(`data-preview="${id}"`);
      // swatches from the spec, display face and shape from the spec
      for (const col of [s.colors.bg, s.colors.card, s.colors.c1, s.colors.c2, s.colors.c3])
        expect(c.toLowerCase()).toContain(col.toLowerCase());
      expect(c).toContain(`font-family:${s.type.display}`.replace(/"/g, '&quot;'));
      expect(c).toContain(`border-radius:${s.shape.radiusM}`);
    }
  });

  it('marks Automatic with a check and "Using now" text when nothing is pinned', () => {
    const h = html({ id: 'comic', source: 'default', pinned: null });
    expect(card(h, 'auto')).toContain('Using now');
    expect(card(h, 'auto')).toContain('aria-pressed="true"');
    expect(card(h, 'crime')).not.toContain('Using now');
    expect(h.match(/Using now/g)).toHaveLength(1);
  });

  it('marks the pinned skin, not Automatic', () => {
    const h = html({ id: 'crime', source: 'pinned', pinned: 'crime' });
    expect(card(h, 'crime')).toContain('Using now');
    expect(card(h, 'crime')).toContain('<svg');
    expect(card(h, 'auto')).not.toContain('Using now');
    expect(h).not.toContain('data-skin-lock');
  });

  it('says so when a lock route keeps its own look', () => {
    const h = html({ id: 'sacred', source: 'lock', pinned: 'crime' });
    expect(h).toContain('data-skin-lock');
    expect(h).toContain('section always stays calm');
    expect(h).toContain('Crime city');
    expect(card(h, 'crime')).toContain('Using now');
    expect(card(h, 'sacred')).toContain('On this page');
  });

  it('explains character themes', () => {
    expect(html({ id: 'comic', source: 'default', pinned: null })).toContain(
      'Character themes tint accents on the new looks; on Superhero comic they restyle the whole page.',
    );
  });
});

describe('cards are real forms (work without JS)', () => {
  it('each card is a submit button name=skin inside POST /api/skin', () => {
    const h = html({ id: 'comic', source: 'default', pinned: null });
    expect(h.match(/<form [^>]*action="\/api\/skin"/g)).toHaveLength(1 + SKIN_IDS.length);
    for (const id of ['auto', ...SKIN_IDS]) {
      expect(card(h, id)).toContain(`value="${id}"`);
      expect(card(h, id)).toContain('name="skin"');
      expect(card(h, id)).toContain('type="submit"');
    }
  });

  it('shows the saved confirmation in a status region', () => {
    state = { id: 'sacred', source: 'lock', pinned: null };
    const h = renderToStaticMarkup(
      createElement(SkinPickerPanel, { onPick: () => undefined, saved: "Saved. You'll see it" }),
    );
    expect(h).toContain('role="status"');
    expect(h).toContain('data-skin-saved');
    expect(h).toContain('Saved.');
  });
});

describe('POST /api/skin from a plain form', () => {
  const post = async (value: string, referer: string | null) => {
    const mod = (await import('~/routes/api/skin')) as unknown as {
      action: (a: { request: Request }) => Promise<Response | { init?: { status?: number } }>;
    };
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://localhost',
    };
    if (referer) headers.referer = referer;
    return mod.action({
      request: new Request('http://localhost/api/skin', {
        method: 'POST',
        headers,
        body: new URLSearchParams({ skin: value }),
      }),
    });
  };

  it('sets the cookie and 303s back to the referer path', async () => {
    const r = (await post('crime', 'http://localhost/roster?x=1')) as Response;
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/roster?x=1');
    expect(r.headers.getSetCookie()[0]).toMatch(/^cm_skin=crime; Path=\/; Max-Age=31536000/);
  });

  it('auto clears the pin; a foreign or missing referer goes home', async () => {
    const r = (await post('auto', 'http://localhost/')) as Response;
    expect(r.headers.getSetCookie()[0]).toMatch(/^cm_skin=; Path=\/; Max-Age=0/);
    const none = (await post('desi', null)) as Response;
    expect(none.headers.get('location')).toBe('/');
  });

  it('refuses bodies over 2 KB with 413 invalid, setting no cookie', async () => {
    const r = (await post(`crime${'x'.repeat(3000)}`, 'http://localhost/')) as {
      data?: { code?: string };
      init?: { status?: number; headers?: HeadersInit };
    };
    expect(r.init?.status).toBe(413);
    expect(r.data?.code).toBe('invalid');
    expect(new Headers(r.init?.headers).getSetCookie()).toEqual([]);
  });

  it('refuses unknown skins', async () => {
    const r = (await post('gta', 'http://localhost/')) as { init?: { status?: number } };
    expect(r.init?.status).toBe(400);
  });
});
