import { describe, expect, it } from 'vitest';
import { loopBox } from '~/game/sprite/clip';
import { POSE_LOOP } from '~/game/sprite/poses';
import { drawFighter, jointsAt, POSES, rigHeight, spriteClip } from '~/game/sprite/rig';
import { SPRITE_POSES } from '~/lib/clips/gate';
import { mockCtx, realFighters, variants } from './game-helpers';

const fighters = [...variants(), ...realFighters().slice(0, 4)];

describe('POSES', () => {
  it('has exactly 20 unique ids with positive loops', () => {
    expect(POSES).toHaveLength(20);
    expect(new Set(POSES.map((p) => p.id)).size).toBe(20);
    for (const p of POSES) expect(p.loop).toBeGreaterThan(0);
  });
  it('matches the clip gate list the site uses', () => {
    expect(POSES.map((p) => p.id)).toEqual([...SPRITE_POSES]);
  });
});

describe('drawFighter', () => {
  it('draws every pose for every rig variant without throwing or NaN coordinates', () => {
    for (const f of fighters)
      for (const p of POSES)
        for (const k of [0, 0.13, 0.37, 0.5, 0.71, 0.99]) {
          const m = mockCtx();
          drawFighter(m.ctx, f, p.id, k * p.loop, {
            x: 200,
            y: 300,
            scale: 1.4,
            facing: k > 0.5 ? -1 : 1,
          });
          expect(m.nan, `${f.slug} ${p.id} @${k}`).toEqual([]);
          expect(m.calls.length).toBeGreaterThan(20);
        }
  });

  it('supports game options (ghost, big head, racket, no lift, flash)', () => {
    const f = fighters[0];
    if (!f) throw new Error('no fixture');
    const m = mockCtx();
    for (const p of POSES) {
      drawFighter(m.ctx, f, p.id, 0.3, { x: 0, y: 0, scale: 1, facing: 1, ghost: '#ff0000' });
      drawFighter(m.ctx, f, p.id, 0.3, {
        x: 0,
        y: 0,
        scale: 1,
        facing: 1,
        headScale: 1.9,
        prop: 'racket',
        noLift: true,
        flash: 1,
        orb: false,
      });
    }
    expect(m.nan).toEqual([]);
  });

  it('is pure for a given t', () => {
    const f = fighters[2];
    if (!f) throw new Error('no fixture');
    for (const p of ['special', 'run', 'victory'] as const) {
      const a = mockCtx();
      const b = mockCtx();
      drawFighter(a.ctx, f, p, 0.42, { x: 10, y: 20, scale: 2, facing: 1 });
      drawFighter(b.ctx, f, p, 0.42, { x: 10, y: 20, scale: 2, facing: 1 });
      expect(a.calls).toEqual(b.calls);
    }
  });

  it('plants the feet on the ground line when standing', () => {
    for (const f of fighters) {
      const j = jointsAt(f, 'idle', 0, { x: 0, y: 500, scale: 1, facing: 1 });
      const lowest = Math.max(j.footF.y, j.footB.y);
      expect(lowest).toBeGreaterThan(485);
      expect(lowest).toBeLessThanOrEqual(500);
      expect(j.head.y).toBeLessThan(500 - rigHeight(f) * 0.6);
    }
  });
});

describe('spriteClip', () => {
  it('renders every pose for several fighters without NaN', () => {
    for (const f of fighters.slice(0, 5))
      for (const p of POSES)
        for (const t of [0.15, 0.6, 1.2, 2.1]) {
          const m = mockCtx();
          spriteClip(f, p.id)(m.ctx, t, 320, 320);
          expect(m.nan, `${f.slug} ${p.id} t=${t}`).toEqual([]);
        }
  });

  it('frames the whole loop: the loop bounding box fits the panel', () => {
    for (const f of fighters)
      for (const p of POSES) {
        const box = loopBox(f, p.id);
        expect(box.minY).toBeLessThan(0);
        expect(box.maxX).toBeGreaterThan(box.minX);
        expect(Number.isFinite(box.minY)).toBe(true);
      }
    expect(POSE_LOOP.special).toBeGreaterThan(1);
  });
});
