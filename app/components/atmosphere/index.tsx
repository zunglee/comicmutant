/**
 * The active skin decides which background animation mounts (SkinSpec.atmosphere.kind). To add a
 * skin atmosphere: add the kind to types.ts, a component file here (default export, props
 * {hidden, strength}), and one line in KINDS below.
 */
import { lazy, Suspense } from 'react';
import { useSkin } from '~/skins/context';
import { Atmosphere } from '../atmosphere';
import { SacredAtmosphere } from '../sacred/sacred-atmosphere';

const NeonRain = lazy(() => import('./neon-rain'));
const MarigoldDust = lazy(() => import('./marigold-dust'));

export function SkinAtmosphere({ hidden = false }: { hidden?: boolean }) {
  const { spec } = useSkin();
  const { kind, strength } = spec.atmosphere;
  switch (kind) {
    case 'petals-diyas':
      return <SacredAtmosphere />;
    case 'neon-rain':
      return (
        <Suspense fallback={null}>
          <NeonRain hidden={hidden} strength={strength} />
        </Suspense>
      );
    case 'marigold-dust':
      return (
        <Suspense fallback={null}>
          <MarigoldDust hidden={hidden} strength={strength} />
        </Suspense>
      );
    default:
      return <Atmosphere hidden={hidden} />;
  }
}
