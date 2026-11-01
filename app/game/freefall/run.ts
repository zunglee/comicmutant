/**
 * One run on the client: the deterministic core + the input recorder + everything that makes it feel
 * good (particles, shake, sound, banners, screen-reader lines). The recorder sees exactly the controls
 * the core stepped with, so the log replays to the same score on the server.
 */
import type { Fighter } from '~/lib/schema';
import type { Sfx } from '../engine/audio';
import type { FxWorld } from '../engine/fx';
import { lerp } from '../engine/math';
import { type Ctl, type FfEvent, FreefallCore, LANES, STEP, SW } from './core';
import { fmt, type Level } from './maths';
import { PATH_Y } from './pov';
import { draw, type Layout, type ViewState } from './render';
import { Recorder } from './replay';

const GOOD = '#3ddc84';
const BAD = '#ff4d5e';
const LANE_NAME = ['left', 'middle', 'right'];

export class FreefallRun {
  readonly core: FreefallCore;
  readonly rec = new Recorder();
  /** One mark per slab, for the share card: true = right. */
  readonly marks: boolean[] = [];
  private prev = { depth: 0, x: 0 };
  private v: ViewState;

  constructor(
    seed: number,
    level: Level,
    readonly hero: Fighter,
    private fx: FxWorld,
    private sfx: Sfx,
    private announce: (msg: string) => void,
    qseed = seed,
  ) {
    this.core = new FreefallCore(seed, level, qseed);
    this.prev = { depth: this.core.depth, x: this.core.x };
    this.v = {
      depth: 0,
      x: this.core.x,
      t: 0,
      qFlash: 1,
      note: null,
      go: 1.1,
      hurt: 0,
      dive: false,
      reduced: false,
      hidden: false,
    };
    const g = this.core.gate;
    if (g) this.say(g.q);
  }

  private say(q: { say: string; options: number[] }) {
    this.announce(`${q.say}? Left ${q.options[0]}, middle ${q.options[1]}, right ${q.options[2]}.`);
  }

  step(c: Ctl) {
    const core = this.core;
    if (core.over) return;
    this.prev = { depth: core.depth, x: core.x };
    this.rec.record(core.step, c);
    core.update(c);
    // One announcement per step: "Right! Streak 3." and the next sum arrive together, and a second
    // aria-live update in the same frame would drop the first.
    const said: string[] = [];
    const announce = this.announce;
    this.announce = (m) => said.push(m);
    for (const e of core.events) this.react(e);
    this.announce = announce;
    if (said.length) announce(said.join(' '));
    const v = this.v;
    v.qFlash = Math.max(0, v.qFlash - STEP * 3);
    v.go = Math.max(0, v.go - STEP);
    v.hurt = Math.max(0, v.hurt - STEP);
    if (v.note) v.note.life -= STEP;
  }

  private react(e: FfEvent) {
    const fx = this.fx;
    const sfx = this.sfx;
    const v = this.v;
    const pal = this.hero.theme.palette;
    switch (e.k) {
      // Effects live in the POV box's screen units: events happen on the hero's plane (PATH_Y).
      case 'correct': {
        this.marks.push(true);
        // The slab bursts into concrete chunks that fly out past the camera.
        for (let i = 0; i < 10; i++) {
          const x = 30 + i * 53;
          const y = 120 + (i % 3) * 170;
          fx.burst(x, y, 3, ['#8f8a8d', '#6d676b', '#a2533c'], {
            kind: 'square',
            size: 26,
            speed: 700,
            dir: Math.atan2(y - 300, x - SW / 2),
            spread: 0.6,
            g: 0,
            drag: 0.5,
            max: 0.6,
          });
        }
        fx.burst(e.x, PATH_Y, 18, [pal.c3, '#ffffff', pal.c1], { speed: 520, max: 0.5 });
        fx.ring(e.x, PATH_Y, '#ffffff', 110);
        fx.pop(e.x, PATH_Y - 120, `+${e.pts}`, GOOD, 44);
        if (e.streak >= 3) fx.pop(SW / 2, 120, `STREAK ×${e.streak}`, pal.c3, 34);
        fx.shake(0.18);
        sfx.play('correct', 0.8);
        v.note = { text: 'SMASHED IT!', color: GOOD, life: 1.1 };
        this.announce(`Right! Streak ${e.streak}.`);
        break;
      }
      case 'wrong':
      case 'wall': {
        this.marks.push(false);
        fx.burst(e.x, PATH_Y, 22, ['#8f8a8d', BAD, '#ffffff'], { kind: 'square', size: 14 });
        fx.flash(0.6, BAD);
        fx.shake(0.55);
        fx.stop(5);
        sfx.play('wrong', 0.9);
        v.hurt = 0.45;
        v.note = { text: `IT WAS ${fmt(e.answer)}`, color: BAD, life: 1.8 };
        this.announce(
          `${e.k === 'wall' ? 'Caught between two openings' : 'Wrong opening'}. The answer was ${e.answer}. ${hearts(this.core.hearts)} left.`,
        );
        break;
      }
      case 'hit':
        fx.burst(e.x, PATH_Y, 16, ['#7c7578', '#a2533c', '#ffffff'], { kind: 'dot', size: 8 });
        fx.shake(0.4);
        fx.stop(3);
        sfx.play('hit', 0.7);
        v.hurt = 0.4;
        this.announce(`Hit by rubble. ${hearts(this.core.hearts)} left.`);
        break;
      case 'save':
        fx.pop(e.x, PATH_Y - 90, 'SAVED! +30', '#4da3ff', 30);
        fx.ring(e.x, PATH_Y - 20, '#4da3ff', 70);
        fx.burst(e.x, PATH_Y - 20, 10, ['#4da3ff', '#ffffff'], { kind: 'star', size: 9, g: -200 });
        sfx.play('cheer', 0.5);
        this.announce('Caught someone. Saved!');
        break;
      case 'heal':
        fx.pop(this.core.x, PATH_Y - 160, '+1 HEART', BAD, 32);
        sfx.play('special', 0.5);
        this.announce(
          e.why === 'save'
            ? 'Three people caught: one heart back.'
            : 'Eight in a row: one heart back.',
        );
        break;
      case 'question':
        v.qFlash = 1;
        sfx.play('blip', 0.4);
        this.say(e.q);
        break;
      case 'over':
        fx.shake(0.8);
        sfx.play('ko', 0.9);
        break;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    L: Layout,
    a: number,
    reduced: boolean,
    touch = false,
    hidden = false,
  ) {
    const v = this.v;
    v.depth = lerp(this.prev.depth, this.core.depth, a);
    v.x = lerp(this.prev.x, this.core.x, a);
    v.t = (this.core.step + a) * STEP;
    v.dive = this.core.diving;
    v.reduced = reduced;
    v.hidden = hidden;
    draw(ctx, L, this.core, this.hero, this.fx, v, reduced, touch);
  }

  describe(): string {
    const c = this.core;
    if (c.over) return `Run over. Score ${c.score}, floor ${c.floors}.`;
    const g = c.gate;
    const lane = c.x < (LANES[0] + LANES[1]) / 2 ? 0 : c.x < (LANES[1] + LANES[2]) / 2 ? 1 : 2;
    return [
      `Floor ${c.floors}, score ${c.score}, ${hearts(c.hearts)}, streak ${c.streak}.`,
      g
        ? `Next slab: ${g.q.say}. Options left ${g.q.options[0]}, middle ${g.q.options[1]}, right ${g.q.options[2]}. You are over the ${LANE_NAME[lane]} opening.`
        : '',
    ].join(' ');
  }
}

const hearts = (n: number) => `${n} ${n === 1 ? 'heart' : 'hearts'}`;
