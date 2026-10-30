/** A recording 2D context good enough to run every draw function without a browser. */
export function mockCtx(w = 200, h = 200): CanvasRenderingContext2D {
  const grad = { addColorStop() {} };
  const canvas = { width: w, height: h };
  const state: Record<string | symbol, unknown> = { canvas };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern')
        return () => grad;
      if (k === 'getImageData')
        return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      return () => {};
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
