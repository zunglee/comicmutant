import { type CSSProperties, useMemo } from 'react';
import { accentVars, type ThemeVars } from '~/lib/theme/compute';
import { useSkin } from '~/skins/context';

/**
 * CSS vars for a page that wears a character's pack (character and fighter pages). Under a skin whose
 * surfaces are the character's (comic) the whole pack applies; under a `surfaces: 'skin'` skin only the
 * accents do, re-checked against the skin's own bg/card, so the skin keeps its surfaces (T3).
 */
export function usePackVars(vars: ThemeVars): { style: CSSProperties; dark: boolean | null } {
  const { spec } = useSkin();
  return useMemo(() => {
    if (spec.surfaces === 'character') return { style: vars as CSSProperties, dark: null };
    return {
      style: accentVars(vars, { bg: spec.colors.bg, card: spec.colors.card }) as CSSProperties,
      dark: spec.colors.mood === 'dark',
    };
  }, [vars, spec]);
}
