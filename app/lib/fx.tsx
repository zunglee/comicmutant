/**
 * Effects level. "rich" = every clip animates while on screen; "lite" = clips show a still
 * frame until tapped. OS reduced-motion forces lite behaviour regardless of the toggle.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Fx = 'rich' | 'lite';
export const FX_COOKIE = 'cm_fx';

const FxContext = createContext<{ fx: Fx; setFx: (f: Fx) => void }>({
  fx: 'rich',
  setFx: () => {},
});

export function FxProvider({ initial, children }: { initial: Fx; children: React.ReactNode }) {
  const [fx, setFxState] = useState<Fx>(initial);
  const setFx = useCallback((f: Fx) => {
    setFxState(f);
    document.documentElement.dataset.fx = f;
    // biome-ignore lint/suspicious/noDocumentCookie: one tiny preference cookie, read by SSR.
    document.cookie = `${FX_COOKIE}=${f}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);
  // Stable value: every clip reads this context, so a new object per render re-renders them all.
  const value = useMemo(() => ({ fx, setFx }), [fx, setFx]);
  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}

export const useFxSetting = () => useContext(FxContext);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** True when decorative animation should run. */
export function useAnimate(): boolean {
  const { fx } = useFxSetting();
  const reduced = useReducedMotion();
  return fx === 'rich' && !reduced;
}
