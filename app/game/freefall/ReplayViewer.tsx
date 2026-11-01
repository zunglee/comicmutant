/**
 * A mod's replay of a held run: the exact input log fed back through the same core and POV view, at
 * 1×–4×. What the server scored is what you watch — so "superhuman" dodging or instant lane picks
 * are plain to see.
 */
import { useEffect, useRef, useState } from 'react';
import type { Fighter } from '~/lib/schema';
import { Sfx } from '../engine/audio';
import { fitCanvas } from '../engine/canvas';
import { FxWorld } from '../engine/fx';
import { createLoop } from '../engine/loop';
import { type Ctl, IDLE } from './core';
import type { Level } from './maths';
import { LANDSCAPE } from './render';
import { decodeCtl, PAUSE } from './replay';
import { FreefallRun } from './run';

export interface ReplayProps {
  hero: Fighter;
  level: Level;
  seed: number;
  qseed: number;
  log: number[];
}

export default function ReplayViewer({ hero, level, seed, qseed, log }: ReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  playingRef.current = playing;
  const [status, setStatus] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const L = LANDSCAPE;
    const sfx = new Sfx();
    sfx.setMuted(true);
    const fx = new FxWorld(false);
    const run = new FreefallRun(seed, level, hero, fx, sfx, () => {}, qseed);
    let ctl: Ctl = IDLE;
    let i = 0;
    let next = log.length ? (log[0] as number) : Number.POSITIVE_INFINITY;
    let pauses = 0;
    const step = () => {
      while (run.core.step === next) {
        const raw = log[i + 1] as number;
        if (raw >= PAUSE) pauses++;
        else ctl = decodeCtl(raw) ?? ctl;
        i += 2;
        next = i < log.length ? next + (log[i] as number) : Number.POSITIVE_INFINITY;
      }
      run.step(ctl);
    };
    const vp = fitCanvas(canvas, L.W, L.H);
    const loop = createLoop({
      update: (dt) => {
        if (!playingRef.current || run.core.over) return;
        fx.update(dt);
        for (let k = 0; k < speedRef.current && !run.core.over; k++) step();
        const c = run.core;
        if (c.step % 15 && !c.over) return;
        setStatus(
          `${(c.step / 60).toFixed(1)} s · floor ${c.floors} · ${c.correct}/${c.asked} right · ${c.hits} hits · ${c.saved}/${c.people} saved · ${pauses} pauses${c.over ? ' · END' : ''}`,
        );
      },
      render: (a) => {
        vp.apply(ctx);
        ctx.clearRect(0, 0, L.W, L.H);
        run.render(ctx, L, a, false, false);
      },
    });
    loop.start();
    return () => {
      loop.destroy();
      vp.dispose();
      sfx.dispose();
    };
  }, [hero, level, seed, qseed, log]);

  return (
    <div>
      <div className="panel relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Replay of the held run"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        {[1, 2, 4].map((x) => (
          <button
            key={x}
            type="button"
            className="chip min-h-11"
            aria-pressed={speed === x}
            onClick={() => setSpeed(x)}
          >
            {x}×
          </button>
        ))}
        <p className="text-sm" aria-live="off">
          {status}
        </p>
      </div>
    </div>
  );
}
