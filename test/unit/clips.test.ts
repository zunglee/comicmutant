import { describe, expect, it } from 'vitest';
import { CLIP_GATE } from '~/lib/clips/gate';
import { CLIP_KINDS } from '~/lib/clips/registry';
import { MOTIFS } from '~/lib/schema';
import { mockCtx } from './mock-canvas';

describe('motif clips', () => {
  it('there are exactly 26 unique kinds (20 original + 6 added)', () => {
    expect(CLIP_KINDS).toHaveLength(26);
    expect(new Set(CLIP_KINDS.map((k) => k.id)).size).toBe(26);
  });
  it('every kind draws every motif at several times without throwing', () => {
    for (const k of CLIP_KINDS) {
      for (const motif of MOTIFS) {
        const draw = k.make({
          c1: '#ff2e4d',
          c2: '#1b1464',
          c3: '#ffd400',
          motif,
          name: 'Test Name',
          year: 1990,
        });
        for (const t of [0, 0.3, 1.7, 5.2])
          expect(() => draw(mockCtx(), t, 320, 320)).not.toThrow();
      }
    }
  });
  it('gate only lists known kinds', () => {
    const ids = new Set(CLIP_KINDS.map((k) => k.id));
    for (const id of CLIP_GATE.motif) expect(ids.has(id)).toBe(true);
    expect(CLIP_GATE.sprite).toHaveLength(new Set(CLIP_GATE.sprite).size);
  });
});

describe('manifest', () => {
  it('matches the registry exactly (ids, labels, loops)', async () => {
    const { CLIP_MANIFEST } = await import('~/lib/clips/manifest');
    expect(CLIP_MANIFEST.map((k) => [k.id, k.label, k.loop])).toEqual(
      CLIP_KINDS.map((k) => [k.id, k.label, k.loop]),
    );
  });
});

describe('quality gate', () => {
  it('ships only kinds that passed: 14 first-batch + 5 second-batch motif clips per character', () => {
    expect(CLIP_GATE.motif).toHaveLength(19);
    for (const id of ['aura', 'wipe', 'panels', 'rain', 'shockwave', 'heartbeat', 'radar'])
      expect(CLIP_GATE.motif).not.toContain(id);
    for (const id of ['faceoff', 'headline', 'cardflip', 'bounce', 'shatter'])
      expect(CLIP_GATE.motif).toContain(id);
  });
});

describe('sprite gate', () => {
  it('ships the 12 poses that passed the final round', () => {
    expect(CLIP_GATE.sprite).toEqual([
      'idle',
      'walk',
      'jump',
      'crouch',
      'punch',
      'uppercut',
      'block',
      'ko',
      'special',
      'dash',
      'serve',
      'kick-ball',
    ]);
  });
});
