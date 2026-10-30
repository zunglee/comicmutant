/** Sport props shared by the clips and the games: shuttlecock and football. */
import { INK } from '../engine/color';
import { TAU } from '../engine/math';

/** Shuttlecock: cork at (x,y), skirt trailing opposite `angle` (radians, direction of travel). */
export function drawShuttle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  s = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  // skirt (feathers) behind the cork, i.e. along -x
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(-17, -9);
  ctx.lineTo(-18, 9);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  for (const k of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(-3, k * 6);
    ctx.lineTo(-17.5, k * 16);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-12, -7);
  ctx.lineTo(-12.5, 7);
  ctx.stroke();
  // cork
  ctx.fillStyle = '#f2e6cf';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 4.6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Football with panel pattern; spin in radians. */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
  accent = '#ffd400',
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.rotate(spin);
  ctx.fillStyle = INK;
  const pent = (cx: number, cy: number, pr: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      i
        ? ctx.lineTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr)
        : ctx.moveTo(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr);
    }
    ctx.closePath();
    ctx.fill();
  };
  pent(0, 0, r * 0.36);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3);
  }
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(Math.cos(0.6) * r * 0.62, Math.sin(0.6) * r * 0.62, r * 0.14, 0, TAU);
  ctx.fill();
  ctx.restore();
  // cel shade + gloss
  ctx.fillStyle = 'rgba(13,11,16,0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0.2, Math.PI + 0.2);
  ctx.arc(-r * 0.15, r * 0.05, r * 0.85, Math.PI + 0.2, 0.2, true);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
