/**
 * Motif primitives: generic visual signs of a power set (a bolt, a flame, a rune circle …).
 * Deliberately not logos or costume details — the IP boundary allows colour + generic motif
 * for real characters. Every function draws centred on (0,0) at unit size; callers transform.
 */
import type { Motif } from '../taxonomy';

export interface Ink {
  c1: string;
  c2: string;
  c3: string;
  line: string;
}

const TAU = Math.PI * 2;

/** Minimum stroke in unit space for the current draw (≈2.2 px on screen), set by drawMotif. */
let MIN_LW = 0.02;
const lw = (x: number) => Math.max(x, MIN_LW);

function outline(ctx: CanvasRenderingContext2D, ink: Ink, w = 0.06) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lw(w);
  ctx.strokeStyle = ink.line;
  ctx.stroke();
}

function star(
  ctx: CanvasRenderingContext2D,
  points: number,
  outer: number,
  inner: number,
  rot = 0,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i / (points * 2)) * TAU - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

const drawers: Record<Motif, (ctx: CanvasRenderingContext2D, t: number, ink: Ink) => void> = {
  tech(ctx, t, ink) {
    // Hex core with circuit traces and a pulsing ring.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      ctx.lineTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62);
    }
    ctx.closePath();
    ctx.fillStyle = ink.c2;
    ctx.fill();
    outline(ctx, ink);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.62, Math.sin(a) * 0.62);
      ctx.lineTo(Math.cos(a) * 0.82, Math.sin(a) * 0.82);
      ctx.lineTo(Math.cos(a + 0.25) * 0.95, Math.sin(a + 0.25) * 0.95);
      ctx.strokeStyle = ink.c3;
      ctx.lineWidth = lw(0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(Math.cos(a + 0.25) * 0.95, Math.sin(a + 0.25) * 0.95, 0.06, 0, TAU);
      ctx.fillStyle = ink.c3;
      ctx.fill();
    }
    const pulse = 0.28 + Math.sin(t * 4) * 0.04;
    ctx.beginPath();
    ctx.arc(0, 0, pulse, 0, TAU);
    ctx.fillStyle = ink.c3;
    ctx.fill();
    outline(ctx, ink, 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, 0.42, t * 2, t * 2 + 4);
    ctx.strokeStyle = ink.c1;
    ctx.lineWidth = lw(0.07);
    ctx.stroke();
  },
  bolt(ctx, t, ink) {
    const j = Math.sin(t * 23) * 0.03;
    ctx.beginPath();
    ctx.moveTo(0.15 + j, -0.95);
    ctx.lineTo(-0.42, 0.1);
    ctx.lineTo(-0.02, 0.1);
    ctx.lineTo(-0.2 - j, 0.95);
    ctx.lineTo(0.45, -0.18);
    ctx.lineTo(0.05, -0.18);
    ctx.lineTo(0.32, -0.95);
    ctx.closePath();
    ctx.fillStyle = ink.c3;
    ctx.fill();
    outline(ctx, ink, 0.07);
  },
  flame(ctx, t, ink) {
    const layers: [string, number][] = [
      [ink.c1, 1],
      [ink.c3, 0.66],
      ['#fff6c8', 0.34],
    ];
    for (const [i, [col, s]] of layers.entries()) {
      const f = Math.sin(t * 7 + i * 1.7) * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -0.95 * s + f);
      ctx.bezierCurveTo(0.55 * s, -0.35 * s, 0.6 * s, 0.35 * s, 0, 0.8 * s + 0.15);
      ctx.bezierCurveTo(-0.6 * s, 0.35 * s, -0.5 * s, -0.25 * s, 0.05 * s - f, -0.95 * s + f);
      ctx.fillStyle = col;
      ctx.fill();
      if (i === 0) outline(ctx, ink, 0.06);
    }
  },
  ice(ctx, t, ink) {
    ctx.rotate(t * 0.4);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i / 6) * TAU);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0.09, -0.55);
      ctx.lineTo(0, -0.95);
      ctx.lineTo(-0.09, -0.55);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? ink.c1 : ink.c3;
      ctx.fill();
      outline(ctx, ink, 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -0.5);
      ctx.lineTo(0.22, -0.7);
      ctx.moveTo(0, -0.5);
      ctx.lineTo(-0.22, -0.7);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = lw(0.05);
      ctx.stroke();
      ctx.restore();
    }
  },
  cosmic(ctx, t, ink) {
    ctx.save();
    ctx.scale(1, 0.38);
    ctx.beginPath();
    ctx.arc(0, 0, 0.88, 0, TAU);
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.12);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 0.5, 0, TAU);
    ctx.fillStyle = ink.c1;
    ctx.fill();
    // Flat highlight crescent (no gradients: the clips are flat ink).
    ctx.beginPath();
    ctx.arc(-0.14, -0.14, 0.24, Math.PI * 0.95, Math.PI * 1.75);
    ctx.lineWidth = lw(0.09);
    ctx.lineCap = 'round';
    ctx.strokeStyle = ink.c3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.5, 0, TAU);
    outline(ctx, ink);
    for (let i = 0; i < 5; i++) {
      const a = t * 0.6 + i * 1.3;
      ctx.save();
      ctx.translate(Math.cos(a) * 0.8, Math.sin(a) * 0.3 - 0.5);
      star(ctx, 4, 0.12, 0.035, t);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  },
  magic(ctx, t, ink) {
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.05);
    for (const r of [0.9, 0.72]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.rotate(t * 0.8);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 0.74, Math.sin(a) * 0.74);
      ctx.lineTo(Math.cos(a) * (i % 3 ? 0.82 : 0.88), Math.sin(a) * (i % 3 ? 0.82 : 0.88));
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.rotate(-t * 1.2);
    star(ctx, 6, 0.66, 0.38);
    ctx.strokeStyle = ink.c1;
    ctx.lineWidth = lw(0.06);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * 0.66, Math.sin(a) * 0.66);
    }
    ctx.closePath();
    ctx.strokeStyle = ink.c3;
    ctx.stroke();
    ctx.restore();
  },
  shadow(ctx, t, ink) {
    // Crescent moon behind drifting smoke.
    // Crescent = disc minus an offset disc, via even-odd fill inside a clip (never erases the bg).
    ctx.save();
    ctx.beginPath();
    ctx.arc(0.1, -0.1, 0.62, 0, TAU);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(-1, -1, 2, 2);
    ctx.arc(0.36, -0.28, 0.52, 0, TAU);
    ctx.fillStyle = ink.c3;
    ctx.fill('evenodd');
    ctx.restore();
    for (let i = 0; i < 7; i++) {
      const x = ((i * 0.37 + t * 0.18) % 2) - 1;
      const y = 0.45 + Math.sin(t + i) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 0.22 + (i % 3) * 0.06, 0, TAU);
      ctx.fillStyle = i % 2 ? ink.c2 : ink.c1;
      ctx.fill();
    }
  },
  speed(ctx, t, ink) {
    for (let i = 0; i < 3; i++) {
      const x = ((t * 1.6 + i * 0.45) % 1.35) - 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 0.25, -0.55);
      ctx.lineTo(x + 0.2, 0);
      ctx.lineTo(x - 0.25, 0.55);
      ctx.lineTo(x - 0.05, 0.55);
      ctx.lineTo(x + 0.4, 0);
      ctx.lineTo(x - 0.05, -0.55);
      ctx.closePath();
      ctx.fillStyle = [ink.c3, ink.c1, '#ffffff'][i] ?? ink.c3;
      ctx.fill();
      outline(ctx, ink, 0.04);
    }
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.035);
    for (let i = 0; i < 6; i++) {
      const y = -0.8 + i * 0.32;
      const x = ((t * 3 + i * 0.7) % 2) - 1;
      ctx.beginPath();
      ctx.moveTo(x - 0.5, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  },
  strength(ctx, t, ink) {
    const k = (t * 0.9) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, 0.2 + k * 0.75, 0, TAU);
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.14 * (1 - k) + 0.02);
    ctx.stroke();
    // Cracked boulder.
    ctx.beginPath();
    const pts = [
      [-0.55, 0.1],
      [-0.4, -0.42],
      [0.05, -0.58],
      [0.5, -0.32],
      [0.58, 0.2],
      [0.2, 0.55],
      [-0.35, 0.5],
    ];
    for (const [x, y] of pts) ctx.lineTo(x ?? 0, y ?? 0);
    ctx.closePath();
    ctx.fillStyle = ink.c1;
    ctx.fill();
    outline(ctx, ink, 0.07);
    ctx.beginPath();
    ctx.moveTo(0.05, -0.58);
    ctx.lineTo(-0.05, -0.15);
    ctx.lineTo(0.18, 0.05);
    ctx.lineTo(0.05, 0.5);
    ctx.moveTo(-0.05, -0.15);
    ctx.lineTo(-0.38, 0.0);
    outline(ctx, ink, 0.05);
  },
  nature(ctx, t, ink) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * TAU * 1.6;
      const r = 0.08 + (i / 60) * 0.8;
      ctx.lineTo(Math.cos(a + t * 0.6) * r, Math.sin(a + t * 0.6) * r);
    }
    ctx.strokeStyle = ink.c1;
    ctx.lineWidth = lw(0.1);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = t * 0.6 + i * 1.25;
      const r = 0.3 + i * 0.13;
      ctx.save();
      ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
      ctx.rotate(a + Math.sin(t * 2 + i) * 0.4);
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.16, 0.07, 0, 0, TAU);
      ctx.fillStyle = i % 2 ? ink.c3 : ink.c2;
      ctx.fill();
      outline(ctx, ink, 0.03);
      ctx.restore();
    }
  },
  web(ctx, t, ink) {
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.035);
    const spokes = 10;
    const wob = Math.sin(t * 2) * 0.03;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 0.98, Math.sin(a) * 0.98);
      ctx.stroke();
    }
    for (let ring = 1; ring <= 5; ring++) {
      const r = ring * 0.18 + wob;
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * TAU;
        const a0 = ((i - 0.5) / spokes) * TAU;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else
          ctx.quadraticCurveTo(
            Math.cos(a0) * r * 0.86,
            Math.sin(a0) * r * 0.86,
            Math.cos(a) * r,
            Math.sin(a) * r,
          );
      }
      ctx.stroke();
    }
    const k = (t * 0.7) % 1;
    ctx.beginPath();
    ctx.arc(Math.cos(k * TAU) * 0.55, Math.sin(k * TAU) * 0.55, 0.07, 0, TAU);
    ctx.fillStyle = ink.c1;
    ctx.fill();
  },
  claw(ctx, t, ink) {
    const k = Math.min(1, ((t * 1.2) % 1.6) / 0.35);
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.3;
      ctx.beginPath();
      ctx.moveTo(-0.6 + off, -0.75);
      ctx.quadraticCurveTo(0.05 + off, -0.1, -0.6 + off + 1.1 * k, -0.75 + 1.5 * k);
      ctx.lineTo(-0.52 + off + 1.1 * k, -0.78 + 1.5 * k);
      ctx.quadraticCurveTo(0.2 + off, -0.15, -0.48 + off, -0.82);
      ctx.closePath();
      ctx.fillStyle = i === 1 ? ink.c3 : '#ffffff';
      ctx.fill();
      outline(ctx, ink, 0.04);
    }
  },
  mind(ctx, t, ink) {
    for (let i = 0; i < 5; i++) {
      const k = ((t * 0.6 + i / 5) % 1) * 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, k, 0, TAU);
      ctx.strokeStyle = i % 2 ? ink.c3 : ink.c1;
      ctx.lineWidth = lw(0.08 * (1 - k) + 0.015);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.42, 0.24, 0, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    outline(ctx, ink, 0.06);
    ctx.beginPath();
    ctx.arc(Math.sin(t * 1.4) * 0.12, 0, 0.13, 0, TAU);
    ctx.fillStyle = ink.c1;
    ctx.fill();
  },
  water(ctx, t, ink) {
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      const y0 = -0.35 + row * 0.38;
      ctx.moveTo(-1, 1);
      for (let x = -1; x <= 1.001; x += 0.05) {
        ctx.lineTo(x, y0 + Math.sin(x * 5 + t * 3 + row) * 0.1);
      }
      ctx.lineTo(1, 1);
      ctx.closePath();
      ctx.fillStyle = [ink.c3, ink.c1, ink.c2][row] ?? ink.c1;
      ctx.fill();
      outline(ctx, ink, 0.04);
    }
  },
  chaos(ctx, t, ink) {
    for (let i = 0; i < 9; i++) {
      const a = i * 0.9 + t * (i % 2 ? 1.3 : -0.9);
      const r = 0.25 + (i % 4) * 0.18;
      ctx.save();
      ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
      ctx.rotate(a * 2);
      ctx.beginPath();
      ctx.moveTo(0, -0.14);
      ctx.lineTo(0.09, 0);
      ctx.lineTo(0, 0.14);
      ctx.lineTo(-0.09, 0);
      ctx.closePath();
      ctx.fillStyle = [ink.c1, ink.c3, ink.c2][i % 3] ?? ink.c1;
      ctx.fill();
      outline(ctx, ink, 0.025);
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i < 80; i++) {
      const a = i * 0.25 - t * 2;
      const r = i * 0.007;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.strokeStyle = ink.c3;
    ctx.lineWidth = lw(0.05);
    ctx.stroke();
  },
  size(ctx, t, ink) {
    // Nested squares growing outward: opaque strokes, weight (not alpha) carries depth.
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.5 + i / 4) % 1) ** 1.4;
      const s = 0.12 + k * 0.85;
      ctx.save();
      ctx.rotate(k * 0.6);
      ctx.beginPath();
      ctx.rect(-s, -s, s * 2, s * 2);
      ctx.lineWidth = lw(0.12 * (1 - k) + 0.03);
      ctx.strokeStyle = ink.line;
      ctx.stroke();
      ctx.lineWidth = lw(0.07 * (1 - k) + 0.015);
      ctx.strokeStyle = i % 2 ? ink.c1 : ink.c3;
      ctx.stroke();
      ctx.restore();
    }
  },
};

export function drawMotif(
  ctx: CanvasRenderingContext2D,
  motif: Motif,
  x: number,
  y: number,
  size: number,
  t: number,
  ink: Ink,
  rot = 0,
) {
  if (size <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size, size);
  MIN_LW = 2.2 / size;
  drawers[motif](ctx, t, ink);
  ctx.restore();
}

/** Comic sound effect per motif — onomatopoeia, not a trademarked catchphrase. */
export const SFX: Record<Motif, string[]> = {
  tech: ['BZZT!', 'WHIRR!', 'PEW!'],
  bolt: ['KRAK!', 'ZZAP!', 'BOOM!'],
  flame: ['FWOOM!', 'WHUMP!', 'BLAM!'],
  ice: ['KRSH!', 'TINK!', 'CRACK!'],
  cosmic: ['VWOOM!', 'THOOM!', 'WOMM!'],
  magic: ['SHAZZ!', 'FZZT!', 'VMMM!'],
  shadow: ['WHUP!', 'SHFF!', 'SWOOP!'],
  speed: ['ZOOM!', 'VRRM!', 'ZIP!'],
  strength: ['SMASH!', 'THUD!', 'BOOM!'],
  nature: ['SKRK!', 'FWUP!', 'SNAP!'],
  web: ['THWAK!', 'ZIP!', 'SWISH!'],
  claw: ['SHRAK!', 'SLASH!', 'SKRT!'],
  mind: ['MMMM!', 'BWAAM!', 'PING!'],
  water: ['SPLAT!', 'GLUB!', 'SPLSH!'],
  chaos: ['HA-HA!', 'KAPOW!', 'BOING!'],
  size: ['POP!', 'BWOMP!', 'ZOOP!'],
};

/** Small deterministic PRNG so a clip looks the same on every frame and every visit. */
export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
