/** Shared fixtures for the game tests: a recording mock 2D context and fighter fixtures. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Sfx } from '~/game/engine/audio';
import { FxWorld } from '~/game/engine/fx';
import type { GameResult, SimEnv } from '~/game/types';
import { Fighter } from '~/lib/schema';

export interface MockCtx {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  nan: string[];
}

/** Proxy-backed CanvasRenderingContext2D: every method is a no-op that logs its args. */
export function mockCtx(): MockCtx {
  const calls: string[] = [];
  const nan: string[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, font: '10px sans-serif' };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (args.some((a) => typeof a === 'number' && !Number.isFinite(a)))
          nan.push(`${key}(${args.join(',')})`);
        calls.push(
          `${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : String(a))).join(',')})`,
        );
        if (key === 'measureText') return { width: String(args[0] ?? '').length * 8 };
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return gradient;
        if (key === 'createPattern') return null;
        return undefined;
      };
    },
    set(target, key: string, v) {
      target[key] = v;
      if (typeof v === 'number' && !Number.isFinite(v)) nan.push(`${key}=${v}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, nan };
}

const base: Fighter = Fighter.parse({
  slug: 'test-fixture',
  name: 'Test Fixture',
  alias: 'FIXTURE',
  kind: 'hero',
  archetype: 'test dummy',
  bio: 'A fixture used only by the unit tests to cover every rig option.',
  catchphrase: 'Testing, testing.',
  rig: {
    build: 'normal',
    head: 'mask',
    cape: true,
    skin: '#c98f65',
    suit: '#1d2433',
    trim: '#ffd400',
    eye: '#00e5ff',
    emblem: 'bolt',
  },
  stats: { power: 5, speed: 5, defense: 5, special: 5 },
  special: { name: 'Test Beam', kind: 'beam' },
  theme: {
    palette: { c1: '#ff2e4d', c2: '#1b1464', c3: '#ffd400' },
    motif: 'bolt',
    mood: 'dark',
    tagline: 'Fixture tagline',
  },
});

/** Synthetic fighters that together cover every build, head, emblem, cape and special kind. */
export function variants(): Fighter[] {
  const builds = ['slim', 'normal', 'heavy'] as const;
  const heads = ['mask', 'helmet', 'hood', 'bare', 'horns', 'crown', 'visor'] as const;
  const emblems = ['bolt', 'star', 'ring', 'diamond', 'chevron', 'eye', 'fang', 'none'] as const;
  const kinds = ['beam', 'dash', 'shockwave', 'projectile', 'teleport'] as const;
  const motifs = ['flame', 'bolt', 'cosmic', 'shadow', 'ice', 'tech', 'nature', 'chaos'] as const;
  return emblems.map((emblem, i) => ({
    ...base,
    slug: `fixture-${i}`,
    rig: {
      ...base.rig,
      build: builds[i % 3] ?? 'normal',
      head: heads[i % 7] ?? 'mask',
      cape: i % 2 === 0,
      emblem,
      suit: i === 3 ? '#07090d' : base.rig.suit,
    },
    special: { name: 'Fixture', kind: kinds[i % 5] ?? 'beam' },
    theme: { ...base.theme, motif: motifs[i] ?? 'bolt', mood: i % 3 === 0 ? 'light' : 'dark' },
  }));
}

/** Real fighters from content/ that already validate (drafts are skipped). */
export function realFighters(): Fighter[] {
  const dir = path.resolve('content/fighters');
  const out: Fighter[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const r = Fighter.safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
    if (r.success) out.push(r.data);
  }
  return out;
}

export const fixture = base;

export function stubEnv(
  over: Partial<SimEnv> = {},
): SimEnv & { ended: Omit<GameResult, 'game'>[]; said: string[] } {
  const ended: Omit<GameResult, 'game'>[] = [];
  const said: string[] = [];
  const v = variants();
  return {
    p1: v[0] as Fighter,
    p2: v[1] as Fighter,
    vs: 'cpu',
    difficulty: 'normal',
    sfx: { play() {}, unlock() {}, muted: true, setMuted() {}, dispose() {} } as unknown as Sfx,
    fx: new FxWorld(true),
    reduced: true,
    settings: {},
    announce: (m: string) => said.push(m),
    end: (r) => ended.push(r),
    ended,
    said,
    ...over,
  };
}
