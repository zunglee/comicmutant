/**
 * Responsive canvas: the element fills its (aspect-ratio reserved) box; the backing store
 * follows the box at DPR ≤ 2 and the context is scaled so games draw in fixed logical units.
 */
export interface Viewport {
  /** CSS px per logical unit. */
  scale: number;
  dpr: number;
  apply(ctx: CanvasRenderingContext2D): void;
  dispose(): void;
}

export function fitCanvas(
  canvas: HTMLCanvasElement,
  W: number,
  H: number,
  onResize?: () => void,
): Viewport {
  const vp: Viewport = {
    scale: 1,
    dpr: 1,
    apply(ctx) {
      ctx.setTransform(vp.scale * vp.dpr, 0, 0, vp.scale * vp.dpr, 0, 0);
    },
    dispose() {
      ro.disconnect();
    },
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    vp.dpr = Math.min(2, window.devicePixelRatio || 1);
    vp.scale = Math.max(0.1, Math.min(r.width / W, r.height / H));
    canvas.width = Math.max(1, Math.round(W * vp.scale * vp.dpr));
    canvas.height = Math.max(1, Math.round(H * vp.scale * vp.dpr));
    onResize?.();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  return vp;
}
