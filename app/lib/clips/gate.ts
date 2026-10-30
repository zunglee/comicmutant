/**
 * Clip quality gate (owner rule, 2026-10-30): every clip kind is scored by an independent critic
 * on sample themes; a kind still under 8/10 after 5 improvement rounds is dropped from packs.
 * Scores and rounds: reports/clip-quality.md. Edit only from that report.
 */
import { CLIP_MANIFEST } from './manifest';

/** Kinds removed by the gate. */
/** Final round (5/5, 2026-10-30): scored under 8 — see reports/clip-quality.md. */
export const DROPPED_MOTIF: string[] = [
  'aura',
  'wipe',
  'panels',
  'rain',
  'shockwave',
  'heartbeat',
  // Second batch, final round 5/5.
  'radar',
];
/** Sprite gate final round (5/5): under 8 — gallery clips only; games still animate every pose. */
export const DROPPED_SPRITE: string[] = [
  'run',
  'kick',
  'hurt',
  'victory',
  'taunt',
  'charge',
  'smash',
  'celebrate',
];

/**
 * Kinds still in their own 5-round gate (none now). The six added 2026-10-30 finished theirs:
 * faceoff, headline, cardflip, bounce, shatter shipped; radar dropped (7/10 in round 5).
 */
export const PENDING_MOTIF: string[] = [];

/** Sprite pose ids, mirrored from app/game/sprite/rig.ts POSES (a unit test keeps them equal). */
export const SPRITE_POSES = [
  'idle',
  'walk',
  'run',
  'jump',
  'crouch',
  'punch',
  'kick',
  'uppercut',
  'block',
  'hurt',
  'ko',
  'victory',
  'taunt',
  'charge',
  'special',
  'dash',
  'serve',
  'smash',
  'kick-ball',
  'celebrate',
];

export const CLIP_GATE = {
  motif: CLIP_MANIFEST.map((k) => k.id as string).filter(
    (id) => !DROPPED_MOTIF.includes(id) && !PENDING_MOTIF.includes(id),
  ),
  sprite: SPRITE_POSES.filter((id) => !DROPPED_SPRITE.includes(id)),
};
