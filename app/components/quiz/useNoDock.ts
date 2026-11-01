import { useEffect } from 'react';

/** The floating theme dock would sit over quiz text (hub, end screen): hide it on quiz pages. */
export function useNoDock() {
  useEffect(() => {
    document.documentElement.setAttribute('data-no-dock', '');
    return () => document.documentElement.removeAttribute('data-no-dock');
  }, []);
}
