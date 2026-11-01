/**
 * Input log: what the player did, step by step, in a compact form the server can replay. A run is
 * fully described by (seed, level, log); the server re-runs FreefallCore and trusts only its result.
 *
 * Log format: a flat int array of pairs [Δstep, code] — "from step s (Δ after the previous change)
 * the controls are `code`". code = dive | brake<<1 | (steer+1)<<2 | (target+1)<<4, or PAUSE + s:
 * "the game was paused here for s seconds" (controls unchanged; Δ may be 0 next to it).
 */
import { type Ctl, FreefallCore, IDLE, MAX_STEPS, type Summary, SW } from './core';
import type { Level } from './maths';

/** Longest log the server accepts (pairs × 2). A 20-minute run of constant dragging fits. */
export const MAX_LOG = 72_000;
/** Log code for a pause (outside every control code). */
export const PAUSE = 1 << 20;
/** Longest pause one log entry records (seconds). */
export const PAUSE_MAX_S = 86_400;

export function encodeCtl(c: Ctl): number {
  return (c.dive ? 1 : 0) | (c.brake ? 2 : 0) | ((c.steer + 1) << 2) | ((c.target + 1) << 4);
}

export function decodeCtl(code: number): Ctl | null {
  const steer = ((code >> 2) & 3) - 1;
  const target = (code >> 4) - 1;
  if (steer > 1 || target > SW) return null;
  return { dive: !!(code & 1), brake: !!(code & 2), steer: steer as Ctl['steer'], target };
}

/** Builds the log while the client plays: call once per core step, before `core.update`. */
export class Recorder {
  log: number[] = [];
  private last = encodeCtl(IDLE);
  private lastStep = 0;

  /** A pause at this step (the server counts them; a ranked run paused a lot gets a human look). */
  pause(step: number) {
    this.beforePause = this.lastStep;
    this.log.push(step - this.lastStep, PAUSE);
    this.lastStep = step;
    this.pausedAt = Date.now();
    this.pauseIdx = this.log.length - 1;
  }

  /** Back from a pause: its length goes into its log entry (the server checks the wall clock). */
  resume() {
    if (this.pauseIdx < 0) return;
    const s = Math.min(PAUSE_MAX_S, Math.round((Date.now() - this.pausedAt) / 1000));
    if (s < 3 && this.pauseIdx === this.log.length - 1) {
      // A blip (a notification, a tab flick): not worth a pause entry, and the wall clock's slack
      // covers it. Nothing was recorded since, so it simply comes back out.
      this.log.length -= 2;
      this.lastStep = this.beforePause;
    } else this.log[this.pauseIdx] = PAUSE + s;
    this.pauseIdx = -1;
  }
  private pausedAt = 0;
  private pauseIdx = -1;
  private beforePause = 0;

  record(step: number, c: Ctl) {
    const code = encodeCtl(c);
    if (code === this.last) return;
    this.log.push(step - this.lastStep, code);
    this.last = code;
    this.lastStep = step;
  }
}

export type ReplayResult =
  | { ok: true; summary: Summary /** Logged pause time. */; pauseMs: number }
  | { ok: false; reason: string };

/** Re-run a whole game from its log. The run must end (hearts gone) within MAX_STEPS. */
export function replay(
  seed: number,
  level: Level,
  log: readonly number[],
  qseed = seed,
): ReplayResult {
  if (log.length % 2 || log.length > MAX_LOG) return { ok: false, reason: 'bad log' };
  const core = new FreefallCore(seed, level, qseed);
  let ctl: Ctl = IDLE;
  let pauseMs = 0;
  let i = 0;
  let next = log.length ? (log[0] as number) : Number.POSITIVE_INFINITY;
  while (!core.over && core.step < MAX_STEPS) {
    while (core.step === next) {
      const raw = log[i + 1];
      if (!Number.isInteger(raw) || (raw as number) < 0) return { ok: false, reason: 'bad log' };
      const isPause = (raw as number) >= PAUSE && (raw as number) <= PAUSE + PAUSE_MAX_S;
      if (isPause) {
        core.pauses++;
        pauseMs += ((raw as number) - PAUSE) * 1000;
      } else {
        const c = decodeCtl(raw as number);
        if (!c) return { ok: false, reason: 'bad log' };
        ctl = c;
      }
      i += 2;
      const d = log[i];
      // Δ 0 only next to a pause (a pause and a control change on the same step).
      const zeroOk = isPause || (log[i + 1] ?? 0) >= PAUSE;
      if (d === undefined) next = Number.POSITIVE_INFINITY;
      else if (!Number.isInteger(d) || d < (zeroOk ? 0 : 1))
        return { ok: false, reason: 'bad log' };
      else next += d;
    }
    if (next < core.step) return { ok: false, reason: 'bad log' };
    core.update(ctl);
  }
  if (!core.over) return { ok: false, reason: 'run did not end' };
  // Inputs after the end are a sign of a forged log.
  if (i < log.length) return { ok: false, reason: 'inputs after the end' };
  return { ok: true, summary: core.summary(), pauseMs };
}

/** The pauses in a log: the step each began at and its logged length (ms). */
export function pausesIn(log: readonly number[]): { step: number; ms: number }[] {
  const out: { step: number; ms: number }[] = [];
  let step = 0;
  for (let i = 0; i + 1 < log.length; i += 2) {
    step += log[i] as number;
    const code = log[i + 1] as number;
    if (code >= PAUSE && code <= PAUSE + PAUSE_MAX_S) out.push({ step, ms: (code - PAUSE) * 1000 });
  }
  return out;
}
