/** One looping sprite "GIF" of an original fighter in a pose, rendered through the shared ClipCanvas. */
import { useMemo } from 'react';
import { ClipCanvas } from '~/lib/clips/ClipCanvas';
import type { Fighter } from '~/lib/schema';
import { CLIP_LOOP, POSES, type PoseId } from './sprite/poses';
import { spriteClip } from './sprite/rig';

export interface SpriteClipProps {
  fighter: Fighter;
  pose: PoseId;
  /** Show the "Save clip" button (records the loop to WebM). */
  save?: boolean;
  className?: string;
  aspect?: number;
  autoPlay?: boolean;
  /** Inside a link/button: no own controls, hidden from assistive tech. */
  decorative?: boolean;
  /** Grid cards: animate only while hovered/focused. */
  hoverPlay?: boolean;
}

/** Still-frame phase (of the clip loop) per pose: the most readable moment of the move. */
const STILL: Partial<Record<PoseId, number>> = {
  punch: 0.25,
  kick: 0.25,
  uppercut: 0.25,
  jump: 0.5,
  hurt: 0.2,
  ko: 0.7,
  victory: 0.3,
  special: 0.5,
  dash: 0.4,
  serve: 0.25,
  smash: 0.25,
  'kick-ball': 0.25,
  celebrate: 0.5,
};

export function SpriteClip({
  fighter,
  pose,
  save,
  className,
  aspect = 1,
  autoPlay,
  decorative,
  hoverPlay,
}: SpriteClipProps) {
  const draw = useMemo(() => spriteClip(fighter, pose), [fighter, pose]);
  const loop = CLIP_LOOP[pose] ?? 1;
  const label = `${fighter.alias} — ${POSES.find((p) => p.id === pose)?.label ?? pose}`;
  return (
    <ClipCanvas
      draw={draw}
      label={label}
      aspect={aspect}
      decorative={decorative}
      hoverPlay={hoverPlay}
      still={(STILL[pose] ?? 0.3) * loop}
      loop={Math.max(2, loop * Math.ceil(2 / loop))}
      className={className}
      autoPlay={autoPlay}
      saveName={save ? `comicmutant-${fighter.slug}-${pose}` : undefined}
    />
  );
}
