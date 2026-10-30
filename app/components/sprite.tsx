/**
 * Lazy sprite clip: the rig (~20 KB gz) loads after first paint, once, so the originals and
 * arena pages stay inside the JS budget. Same box until then, tinted in the fighter's colours.
 */
import { useEffect, useState } from 'react';
import type { SpriteClipProps } from '~/game/SpriteClip';

type Mod = typeof import('~/game/SpriteClip');
let pending: Promise<Mod> | undefined;
let loaded: Mod | undefined;

export function SpriteClip(props: SpriteClipProps) {
  const [mod, setMod] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    pending ??= import('~/game/SpriteClip').then((m) => {
      loaded = m;
      return m;
    });
    let live = true;
    pending.then((m) => live && setMod(m));
    return () => {
      live = false;
    };
  }, []);
  if (!mod) {
    const { c1, c2 } = props.fighter.theme.palette;
    return (
      <div
        aria-hidden
        className={props.className}
        style={{
          aspectRatio: String(props.aspect ?? 1),
          background: `linear-gradient(160deg, ${c2}, ${c1})`,
        }}
      />
    );
  }
  return <mod.SpriteClip {...props} />;
}
