/**
 * Juice: particles, screen shake (trauma model), hit-stop, flash, floating lettering, camera.
 * Reduced motion turns off shake and flash; particles stay (they carry information).
 */
import { alpha, INK } from './color';
import { clamp, lerp, TAU } from './math';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'spark' | 'dot' | 'ring' | 'square' | 'star';
  g: number;
  drag: number;
  rot: number;
}

export interface Pop {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  size: number;
  fill: string;
  rot: number;
}

const MAX_PARTICLES = 420;

export class FxWorld {
  particles: Particle[] = [];
  pops: Pop[] = [];
  trauma = 0;
  hitstop = 0;
  flashA = 0;
  flashColor = '#ffffff';
  timeScale = 1;
  slowmo = 0;
  reduced: boolean;
  cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1 };
  private t = 0;

  constructor(reduced: boolean) {
    this.reduced = reduced;
  }

  shake(amount: number) {
    if (this.reduced) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  stop(frames: number) {
    this.hitstop = Math.max(this.hitstop, frames);
  }

  flash(a: number, color = '#ffffff') {
    if (this.reduced) return;
    this.flashA = Math.max(this.flashA, a);
    this.flashColor = color;
  }

  slow(seconds: number, scale = 0.3) {
    this.slowmo = seconds;
    this.timeScale = scale;
  }

  burst(
    x: number,
    y: number,
    n: number,
    colors: string[],
    o: Partial<Particle> & { speed?: number; spread?: number; dir?: number } = {},
  ) {
    const speed = o.speed ?? 320;
    const spread = o.spread ?? TAU;
    const dir = o.dir ?? 0;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      const max = (o.max ?? 0.45) * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: max,
        max,
        size: (o.size ?? 4) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length] ?? '#fff',
        kind: o.kind ?? 'spark',
        g: o.g ?? 600,
        drag: o.drag ?? 2.5,
        rot: Math.random() * TAU,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 50) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.3,
      max: 0.3,
      size,
      color,
      kind: 'ring',
      g: 0,
      drag: 0,
      rot: 0,
    });
  }

  pop(x: number, y: number, text: string, fill: string, size = 34) {
    this.pops.push({
      x,
      y,
      text,
      life: 0.8,
      max: 0.8,
      size,
      fill,
      rot: (Math.random() - 0.5) * 0.4,
    });
    if (this.pops.length > 6) this.pops.shift();
  }

  /** Real-time step (runs even during hit-stop). */
  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flashA = Math.max(0, this.flashA - dt * 4);
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      if (this.slowmo <= 0) this.timeScale = 1;
    }
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 8;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i] as Pop;
      p.life -= dt;
      p.y -= dt * 30;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
    const c = this.cam;
    const k = 1 - 0.0005 ** dt;
    c.x = lerp(c.x, c.tx, k * 0.6);
    c.y = lerp(c.y, c.ty, k * 0.6);
    c.zoom = lerp(c.zoom, c.tzoom, k * 0.5);
  }

  /** Shake offset for this frame. */
  offset(): { x: number; y: number; r: number } {
    if (this.reduced || this.trauma <= 0) return { x: 0, y: 0, r: 0 };
    const s = this.trauma * this.trauma;
    const t = this.t * 60;
    return {
      x: Math.sin(t * 1.7) * 14 * s,
      y: Math.cos(t * 2.3) * 10 * s,
      r: Math.sin(t * 1.1) * 0.02 * s,
    };
  }

  /** Camera + shake transform around the logical centre. Call inside save()/restore(). */
  applyCamera(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const o = this.offset();
    const c = this.cam;
    ctx.translate(W / 2 + o.x, H / 2 + o.y);
    ctx.rotate(o.r);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-W / 2 - c.x, -H / 2 - c.y);
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const k = p.life / p.max;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = alpha(p.color.startsWith('#') ? p.color : '#ffffff', k);
        ctx.lineWidth = 5 * k + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 - k) * p.size + 6, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'square' || p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        const s = p.size * (0.4 + 0.6 * k);
        ctx.fillRect(-s / 2, -s / 3, s, (s * 2) / 3);
        ctx.strokeRect(-s / 2, -s / 3, s, (s * 2) / 3);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color.startsWith('#') ? alpha(p.color, k) : p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU);
        ctx.fill();
      }
    }
  }

  drawPops(ctx: CanvasRenderingContext2D, font: string) {
    for (const p of this.pops) {
      const age = 1 - p.life / p.max;
      const s =
        age < 0.12 ? (age / 0.12) * 1.25 : age < 0.2 ? 1.25 - ((age - 0.12) / 0.08) * 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 0.25, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(s, s);
      ctx.font = `${p.size}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = p.size * 0.16;
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, 2, 3);
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.fill;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  drawFlash(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (this.flashA <= 0.01) return;
    ctx.fillStyle = alpha(this.flashColor, this.flashA * 0.5);
    ctx.fillRect(-W, -H, W * 3, H * 3);
  }
}
