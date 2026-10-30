/** Rumble Royale — side-view brawler simulation + rendering. Best of three rounds. */
import type { Fighter } from '~/lib/schema';
import { alpha, brightest, INK, readable } from '../engine/color';
import type { Action, Input, PadState } from '../engine/input';
import { clamp, lerp, rng } from '../engine/math';
import { H, W } from '../shell/const';
import { arenaLayer, banner, bar, HEAD_FONT, inkText } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { orb } from '../sprite/fx';
import { POSE_LOOP, type PoseId } from '../sprite/poses';
import { dimsOf, drawFighter, jointsAt, rigHeight } from '../sprite/rig';
import type { Sim, SimEnv } from '../types';
import { type AtkPhase, FIGHT_AI, FightAI, type Intent } from './ai';
import {
  ATTACKS,
  type AttackId,
  BUFFER,
  CHIP,
  COUNTER_DMG,
  circleRect,
  damage,
  GUARD_BASE,
  GUARD_BREAK_STUN,
  GUARD_DRAIN,
  GUARD_PER_DMG,
  GUARD_REST,
  hurtbox,
  matchWinner,
  maxHp,
  POINTS,
  RAGE_AT,
  type Rect,
  ROUND_TIME,
  roundWinner,
  SPECIAL,
  SPECIAL_BLOCK_LAG,
  SPECIAL_COST,
  SPECIAL_DUR,
  timeoutWinner,
  walkSpeed,
} from './rules';

export const GROUND = 468;
/** Normals per string before only a special can extend it (punch → kick → uppercut). */
const MAX_CHAIN = 2;
const SCALE = 1.55;
const GRAV = 2100;
const LEFT = 60;
const RIGHT = W - 60;

type State =
  | 'intro'
  | 'idle'
  | 'walk'
  | 'jump'
  | 'crouch'
  | 'block'
  | 'attack'
  | 'hurt'
  | 'ko'
  | 'win';

interface Body {
  f: Fighter;
  side: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  max: number;
  ghost: number;
  meter: number;
  state: State;
  st: number;
  atk: AttackId | null;
  hit: boolean;
  stun: number;
  combo: number;
  comboT: number;
  invuln: number;
  flash: number;
  blockT: number;
  holdingBack: boolean;
  height: number;
  width: number;
  spawned: boolean;
  walkT: number;
  /** buffered button (a/b/c) and how long it stays live */
  buf: 'a' | 'b' | 'c' | null;
  bufDown: boolean;
  bufT: number;
  /** extra recovery added to the current attack (it was blocked) */
  lag: number;
  /** current attack was blocked */
  blocked: boolean;
  /** last frame's striking joint, so fast limbs sweep instead of tunnelling */
  prev: { x: number; y: number } | null;
  /** attack counter (lets the CPU see a chained attack as a new one) */
  seq: number;
  /** chain cancels in the current string */
  chain: number;
  /** recent striking-joint positions for the swoosh */
  trail: { x: number; y: number }[];
  /** seconds the guard shield stays drawn */
  guardFx: number;
  /** how far in front of the feet the punch's fist (plus its radius) reaches */
  reachX: number;
  /** guard gauge 0–1 (full = guard break) and seconds since the last block */
  guard: number;
  guardRest: number;
  /** this round's points (decides a time-out when health is level) */
  pts: number;
}

interface Shot {
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  t: number;
  alive: boolean;
}

type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

/** Coaching hints already shown this session (page lifetime): each appears once. */
const seenHints = new Set<HintId>();
type HintId = 'block' | 'punish';
const HINTS: Record<HintId, { t: number }> = { block: { t: 3.6 }, punish: { t: 3.2 } };

/** Tip wording for the player's input: on-screen pad buttons on touch, keys otherwise. */
export function hintCopy(id: HintId, touch: boolean, facing: 1 | -1) {
  if (id === 'block')
    return touch
      ? { text: `HOLD ${facing === 1 ? '◀' : '▶'} TO BLOCK`, sub: 'the arrow away from them' }
      : { text: 'HOLD BACK TO BLOCK', sub: `hold ${facing === 1 ? 'A' : 'D'} as they swing` };
  return touch
    ? { text: 'BLOCKED! NOW PUNISH', sub: 'tap PUNCH as they recover' }
    : { text: 'BLOCKED! NOW PUNISH', sub: 'PUNCH (F) as they recover' };
}

/** Coarse pointer = phone / tablet: tips name the touch buttons. */
const isTouch = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

const blankPad = (): PadState => ({
  held: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
  pressed: { left: false, right: false, up: false, down: false, a: false, b: false, c: false },
});

export class FightSim implements Sim {
  b: [Body, Body];
  shots: Shot[] = [];
  phase: Phase = 'intro';
  phaseT = 0;
  round = 1;
  wins: [number, number] = [0, 0];
  timer = ROUND_TIME;
  clock = 0;
  ai: FightAI | null;
  banner: { text: string; sub: string; t: number; color: string } | null = null;
  roundResult: 0 | 1 | -1 = -1;
  /** on-canvas coaching line for P1 (first rounds, once per session) */
  hint: { id: HintId; t: number; text: string; sub: string } | null = null;
  /** touch device (tips name the pad buttons) */
  touch = isTouch();
  /**
   * HUD text scale: when the canvas is drawn small (phone landscape ≈ 500 css px wide), small
   * lettering is enlarged so it stays ≥ ~11 css px.
   */
  ui = 1;
  private p1Hurt = 0;
  private env: SimEnv;

  constructor(env: SimEnv, seed = Date.now()) {
    this.env = env;
    this.b = [this.body(env.p1, 0), this.body(env.p2, 1)];
    this.ai = env.vs === 'cpu' ? new FightAI(FIGHT_AI[env.difficulty], rng(seed)) : null;
    this.startRound();
  }

  private body(f: Fighter, side: 0 | 1): Body {
    const d = dimsOf(f);
    return {
      f,
      side,
      x: side ? W * 0.7 : W * 0.3,
      y: GROUND,
      vx: 0,
      vy: 0,
      facing: side ? -1 : 1,
      hp: maxHp(f),
      max: maxHp(f),
      ghost: maxHp(f),
      meter: 0,
      state: 'intro',
      st: 0,
      atk: null,
      hit: false,
      stun: 0,
      combo: 0,
      comboT: 0,
      invuln: 0,
      flash: 0,
      blockT: 0,
      holdingBack: false,
      height: rigHeight(f) * SCALE * 0.95,
      width: (d.sw + 16) * SCALE,
      spawned: false,
      walkT: 0,
      buf: null,
      bufDown: false,
      bufT: 0,
      lag: 0,
      blocked: false,
      prev: null,
      seq: 0,
      chain: 0,
      trail: [],
      guardFx: 0,
      reachX:
        jointsAt(f, 'punch', 0.35 * (POSE_LOOP.punch ?? 1), {
          x: 0,
          y: GROUND,
          scale: SCALE,
          facing: 1,
        }).handF.x + ATTACKS.punch.r,
      guard: 0,
      guardRest: 0,
      pts: 0,
    };
  }

  private startRound() {
    for (const b of this.b) {
      Object.assign(b, {
        x: b.side ? W * 0.7 : W * 0.3,
        y: GROUND,
        vx: 0,
        vy: 0,
        hp: b.max,
        ghost: b.max,
        state: 'intro',
        st: 0,
        atk: null,
        stun: 0,
        combo: 0,
        invuln: 0,
        facing: b.side ? -1 : 1,
        buf: null,
        bufT: 0,
        lag: 0,
        blocked: false,
        prev: null,
        chain: 0,
        trail: [],
        guardFx: 0,
        guard: 0,
        guardRest: 0,
        pts: 0,
      });
    }
    this.shots = [];
    this.timer = ROUND_TIME;
    this.phase = 'intro';
    this.phaseT = 0;
    this.ai?.newRound(this.wins[1] - this.wins[0]);
    const [w0, w1] = this.wins;
    const lead = w0 === w1 ? null : w0 > w1 ? this.env.p1 : this.env.p2;
    this.say(
      `ROUND ${this.round}`,
      w0 === 1 && w1 === 1
        ? 'FINAL ROUND'
        : lead
          ? `${lead.alias.toUpperCase()} LEADS ${Math.max(w0, w1)}–${Math.min(w0, w1)}`
          : '',
      this.env.p1.theme.palette.c3,
    );
    this.env.announce(
      `Round ${this.round}. ${this.env.p1.alias} ${this.wins[0]}, ${this.env.p2.alias} ${this.wins[1]}.`,
    );
  }

  private coach(id: HintId) {
    if (seenHints.has(id) || this.round > 2 || this.phase !== 'fight') return;
    seenHints.add(id);
    const copy = hintCopy(id, this.touch, this.b[0].facing);
    this.hint = { id, t: 0, ...copy };
    this.env.announce(`Tip: ${copy.text.toLowerCase()}, ${copy.sub}.`);
  }

  private say(text: string, sub: string, color: string) {
    this.banner = { text, sub, t: 0, color };
  }

  // ── update ───────────────────────────────────────────────────────────────────────────
  update(dt: number, input: Input) {
    this.clock += dt;
    if (this.banner) {
      this.banner.t += dt / 1.4;
      if (this.banner.t >= 1) this.banner = null;
    }
    this.phaseT += dt;
    if (this.hint) {
      this.hint.t += dt;
      if (this.hint.t >= HINTS[this.hint.id].t) this.hint = null;
    }
    const [a, b] = this.b;
    if (this.phase === 'intro') {
      if (this.phaseT > 1.4 && this.phaseT - dt <= 1.4) {
        this.say('FIGHT!', '', this.env.p2.theme.palette.c3);
        this.env.sfx.play('whoosh', 1);
        this.env.announce('Fight!');
      }
      if (this.phaseT > 1.8) {
        this.phase = 'fight';
        for (const x of this.b) this.setState(x, 'idle');
      }
    } else if (this.phase === 'fight') {
      this.timer = Math.max(0, this.timer - dt);
      const pa = this.padFor(0, input);
      const pb = this.padFor(1, input, dt);
      this.control(a, b, pa, dt);
      this.control(b, a, pb, dt);
      if (this.timer <= 0) this.endRound(true);
    } else if (this.phase === 'roundEnd') {
      if (this.phaseT > 3) {
        const m = matchWinner(this.wins, this.round);
        if (m === null) {
          this.round++;
          this.startRound();
        } else {
          this.phase = 'matchEnd';
          this.phaseT = 0;
          const winner = m === 0 ? 'p1' : m === 1 ? 'p2' : 'draw';
          const wf = m === 0 ? this.env.p1 : this.env.p2;
          this.env.sfx.play('cheer');
          this.env.end({
            winner,
            score: [this.wins[0], this.wins[1]],
            summary:
              winner === 'draw'
                ? 'Dead even after five rounds.'
                : `${wf.alias} takes the match ${Math.max(...this.wins)}–${Math.min(...this.wins)}.`,
          });
        }
      }
    }
    for (const x of this.b) this.physics(x, x === a ? b : a, dt);
    this.separate();
    this.updateShots(dt);
    for (const x of this.b) {
      x.ghost = x.ghost > x.hp ? Math.max(x.hp, x.ghost - x.max * 0.35 * dt) : x.hp;
      x.flash = Math.max(0, x.flash - dt * 6);
      x.invuln = Math.max(0, x.invuln - dt);
      if (x.comboT > 0) {
        x.comboT -= dt;
        if (x.comboT <= 0) x.combo = 0;
      }
      // a combo is only a combo while the other fighter is still reeling
      const op = x === a ? b : a;
      if (x.combo > 0 && op.state !== 'hurt' && op.state !== 'ko') x.combo = 0;
      x.guardFx = Math.max(0, x.guardFx - dt);
      x.guardRest += dt;
      if (x.guardRest > GUARD_REST) x.guard = Math.max(0, x.guard - GUARD_DRAIN * dt);
    }
    // camera: frame both fighters
    const mid = (a.x + b.x) / 2;
    const dist = Math.abs(a.x - b.x);
    const fx = this.env.fx;
    fx.cam.tzoom = clamp(1.16 - dist / 1400, 1, 1.12);
    const half = W / (2 * fx.cam.tzoom);
    fx.cam.tx = clamp(mid, half, W - half) - W / 2;
    fx.cam.ty = (1 - 1 / fx.cam.tzoom) * 160;
  }

  private padFor(side: 0 | 1, input: Input, dt = 1 / 60): PadState | Intent {
    if (side === 0 || !this.ai) return input.pads[side];
    const me = this.b[1];
    const op = this.b[0];
    return this.ai.update(dt, {
      dx: op.x - me.x,
      oppAir: op.y < GROUND - 20,
      oppAttacking: op.state === 'attack',
      oppHurt: op.state === 'hurt',
      selfFree: this.free(me),
      selfAir: me.y < GROUND - 1,
      meter: me.meter,
      projectileIncoming: this.shots.some(
        (s) => s.alive && s.owner === 0 && Math.abs(s.x - me.x) < 320,
      ),
      canChain:
        me.state === 'attack' &&
        me.hit &&
        !me.blocked &&
        me.atk !== 'special' &&
        me.chain < MAX_CHAIN + (me.meter >= SPECIAL_COST ? 1 : 0),
      oppAtkSeq: op.seq,
      oppAtk: op.state === 'attack' ? op.atk : null,
      oppCrouch: op.state === 'crouch',
      selfReach: me.reachX + op.width / 2 - 4,
      oppReach: op.reachX + me.width / 2 - 4,
      oppPhase: this.phaseOf(op),
      oppFreeIn: this.freeIn(op),
      oppBlocked: op.state === 'attack' && op.blocked,
      oppWhiffed: op.state === 'attack' && !op.hit && this.phaseOf(op) === 'recovery',
      oppFalling: op.vy > 0,
      oppHeight: GROUND - op.y,
      selfBlocking: me.state === 'block',
      oppGuard: op.guard,
      selfAtk: me.state === 'attack' ? me.atk : null,
      selfBlocked: me.state === 'attack' && me.blocked,
      specialKind: me.f.special.kind,
      hpLead: me.hp / me.max - op.hp / op.max,
      timeLeft: this.timer,
    });
  }

  /** Where a fighter is inside its attack (startup → active → recovery). */
  private phaseOf(x: Body): AtkPhase {
    if (x.state !== 'attack' || !x.atk) return 'none';
    const u = x.st / this.dur(x);
    const act = x.atk === 'special' ? SPECIAL[x.f.special.kind].active : ATTACKS[x.atk].active;
    return u < act[0] ? 'startup' : u <= act[1] ? 'active' : 'recovery';
  }

  /** Seconds until a fighter can act (or guard) again. */
  private freeIn(x: Body) {
    if (x.state === 'attack') return Math.max(0, this.dur(x) + x.lag - x.st);
    if (x.state === 'hurt') return Math.max(0, x.stun);
    if (x.state === 'block') return Math.max(0, x.blockT);
    return 0;
  }

  private free(x: Body) {
    return (
      x.state === 'idle' ||
      x.state === 'walk' ||
      x.state === 'crouch' ||
      x.state === 'block' ||
      x.state === 'jump'
    );
  }

  private setState(x: Body, s: State) {
    x.state = s;
    x.st = 0;
    if (s !== 'attack') x.atk = null;
  }

  private control(me: Body, op: Body, pad: PadState | Intent, dt: number) {
    me.st += dt;
    const h = pad.held;
    const p = pad.pressed;
    const toward: Action = op.x > me.x ? 'right' : 'left';
    const away: Action = toward === 'right' ? 'left' : 'right';
    const grounded = me.y >= GROUND - 0.5;
    me.holdingBack = h[away] && !h[toward];

    if (me.state === 'ko' || me.state === 'win' || me.state === 'intro') {
      me.buf = null;
      return;
    }
    // Press buffer: a press is remembered for BUFFER seconds and fires on the first frame it can.
    // While guarding, a press is held until block-stun ends (so a reaction becomes a punish).
    const btn = p.c && me.meter >= SPECIAL_COST ? 'c' : p.a ? 'a' : p.b ? 'b' : null;
    if (btn) {
      me.buf = btn;
      me.bufDown = h.down;
      me.bufT = BUFFER;
    } else if (me.buf && me.state !== 'block') {
      me.bufT -= dt;
      if (me.bufT <= 0) me.buf = null;
    }

    if (me.state === 'hurt') {
      me.stun -= dt;
      if (me.stun <= 0 && grounded) this.setState(me, 'idle');
      return;
    }
    if (me.state === 'block') {
      me.blockT -= dt;
      if (me.blockT > 0) return;
      this.setState(me, 'idle');
    }
    if (me.state === 'attack') {
      this.runAttack(me, op, dt);
      if (me.state === 'attack') {
        // chain cancel after a connecting (not blocked) hit
        const atk = me.atk;
        if (me.hit && me.buf && atk && atk !== 'special' && me.st > 0.5 * this.dur(me)) {
          let next: AttackId | null = null;
          if (me.buf === 'c' && me.meter >= SPECIAL_COST && !me.blocked) next = 'special';
          else if (!me.blocked && me.chain < MAX_CHAIN) {
            if (me.buf === 'b' && atk !== 'kick') next = 'kick';
            else if (me.buf === 'a' && atk === 'kick')
              next = (me.bufDown || h.down) && grounded ? 'uppercut' : 'punch';
            else if (me.buf === 'a' && atk === 'punch') next = 'uppercut';
          }
          if (next) {
            me.buf = null;
            const chain = me.chain + 1;
            this.startAttack(me, next, op);
            me.chain = chain;
          }
        }
        return;
      }
      // The attack just ended: carry on as free this frame (so a buffered press fires now).
      // Anything else (the swing KO'd them and we now 'win') must not be overwritten.
      if (me.state !== 'idle' && me.state !== 'jump') return;
    }

    // free states
    if (grounded && me.state !== 'jump') me.facing = op.x > me.x ? 1 : -1;
    if (me.buf) {
      const b = me.buf;
      const down = me.bufDown || h.down;
      me.buf = null;
      if (b === 'c' && me.meter >= SPECIAL_COST) return this.startAttack(me, 'special');
      if (b === 'a') return this.startAttack(me, down && grounded ? 'uppercut' : 'punch');
      if (b === 'b') return this.startAttack(me, 'kick');
    }
    if (grounded) {
      if (p.up) {
        me.vy = -820 - me.f.stats.speed * 12;
        const dir = (h.right ? 1 : 0) - (h.left ? 1 : 0);
        me.vx = dir * walkSpeed(me.f) * 0.9;
        me.y -= 1;
        this.setState(me, 'jump');
        this.env.sfx.play('whoosh', 0.3);
        return;
      }
      if (h.down) {
        if (me.state !== 'crouch') this.setState(me, 'crouch');
        me.vx = 0;
        return;
      }
      const dir = (h.right ? 1 : 0) - (h.left ? 1 : 0);
      const speed = walkSpeed(me.f) * (dir === me.facing ? 1 : 0.7);
      me.vx = dir * speed;
      // proximity guard: holding back only plants a guard when an attack could actually reach
      const threatened =
        (op.state === 'attack' && (op.atk === 'special' || Math.abs(op.x - me.x) < 260)) ||
        this.shots.some((s) => s.alive && s.owner !== me.side && Math.abs(s.x - me.x) < 280);
      const want: State = dir === 0 ? 'idle' : me.holdingBack && threatened ? 'block' : 'walk';
      if (want === 'block') {
        me.vx = 0;
        if ((me.state as State) !== 'block') this.setState(me, 'block');
        me.blockT = 0.12;
      } else if (me.state !== want) this.setState(me, want);
      if (want === 'walk') me.walkT += dt * (dir === me.facing ? 1 : -1);
    }
  }

  private dur(me: Body) {
    return me.atk === 'special' ? SPECIAL_DUR : me.atk ? ATTACKS[me.atk].dur : 1;
  }

  /** `from` = the opponent when this attack is a chain link (steps in so the next hit reaches). */
  private startAttack(me: Body, id: AttackId, from?: Body) {
    if (id === 'special') {
      me.meter -= SPECIAL_COST;
      this.env.sfx.play('special');
      this.env.fx.flash(0.25, me.f.theme.palette.c3);
      this.env.fx.pop(
        me.x,
        me.y - me.height - 30,
        me.f.special.name.toUpperCase(),
        me.f.theme.palette.c3,
        26,
      );
      this.env.announce(`${me.f.alias} uses ${me.f.special.name}!`);
    } else this.env.sfx.play('whoosh', id === 'punch' ? 0.35 : 0.6);
    me.state = 'attack';
    me.atk = id;
    me.st = 0;
    me.hit = false;
    me.blocked = false;
    me.lag = 0;
    me.prev = null;
    me.trail = [];
    me.spawned = false;
    me.seq++;
    me.pts += POINTS.attack;
    me.chain = 0;
    if (me.y >= GROUND - 0.5) {
      me.vx = 0;
      if (from && id !== 'special') {
        // Close the gap the knock-back opened: ground friction makes the total slide ≈ vx · 0.119.
        const gap = Math.abs(from.x - me.x) - (id === 'uppercut' ? 78 : 100);
        if (gap > 0) me.vx = me.facing * Math.min(720, gap / 0.119);
      }
    }
  }

  private runAttack(me: Body, op: Body, _dt: number) {
    const id = me.atk;
    if (!id) return;
    const dur = this.dur(me);
    const u = me.st / dur;
    if (id === 'special') {
      const kind = me.f.special.kind;
      const sp = SPECIAL[kind];
      const on = u >= sp.active[0] && u <= sp.active[1];
      if (kind === 'dash') {
        if (on) {
          me.vx = me.facing * 980;
          me.invuln = 0.05;
        } else if (u > sp.active[1]) me.vx *= 0.8;
      }
      if (kind === 'teleport' && u >= 0.5 && !me.spawned) {
        me.spawned = true;
        const side = op.x > me.x ? 1 : -1;
        const want = op.x + side * 85;
        let x = clamp(want, LEFT, RIGHT);
        // A cornered target leaves no room behind: land on the open side instead of on top.
        if (Math.abs(x - want) > 40) x = clamp(op.x - side * 85, LEFT, RIGHT);
        me.x = x;
        me.facing = op.x >= me.x ? 1 : -1;
        this.env.sfx.play('whoosh', 0.9);
      }
      if (kind === 'teleport' && u > 0.36 && u < 0.6) me.invuln = 0.05;
      if (kind === 'projectile' && u >= sp.active[0] && !me.spawned) {
        me.spawned = true;
        const j = this.joints(me, 'special', u);
        this.shots.push({
          owner: me.side,
          x: j.handF.x,
          y: j.handF.y,
          vx: me.facing * 640,
          t: 0,
          alive: true,
        });
        this.env.sfx.play('whoosh', 1);
      }
      if (on && !me.hit && kind !== 'projectile') {
        let connect = false;
        const hb = this.hurt(op);
        if (kind === 'beam') {
          const j = this.joints(me, 'special', u);
          const y = (j.handF.y + j.handB.y) / 2;
          const x0 = j.handF.x;
          const inFront = me.facing === 1 ? hb.x + hb.w > x0 : hb.x < x0;
          connect = inFront && y > hb.y - 16 && y < hb.y + hb.h + 16;
        } else if (kind === 'shockwave') {
          connect = Math.abs(op.x - me.x) < 240 && op.y > GROUND - 30;
        } else if (kind === 'dash') {
          connect = circleRect(me.x + me.facing * 30, me.y - me.height * 0.5, 42, hb);
        } else {
          const j = this.joints(me, 'special', u);
          connect = circleRect(j.handF.x, j.handF.y, 30, hb);
        }
        if (connect) {
          me.hit = true;
          const j = this.joints(me, 'special', u);
          this.strike(
            me,
            op,
            {
              dmg: sp.dmg,
              kb: sp.kb,
              launch: sp.launch,
              stun: 0.6,
              stop: 10,
              meter: 0,
              word: sp.word,
            },
            kind === 'shockwave'
              ? { x: op.x, y: GROUND - 20 }
              : kind === 'beam'
                ? { x: op.x - me.facing * 20, y: (j.handF.y + j.handB.y) / 2 }
                : { x: op.x - me.facing * 20, y: op.y - op.height * 0.6 },
            true,
            SPECIAL_BLOCK_LAG,
          );
        }
      }
      if (kind === 'shockwave' && u >= 0.48 && !me.spawned) {
        me.spawned = true;
        this.env.fx.shake(0.55);
        this.env.sfx.play('ko', 0.6);
        this.env.fx.burst(
          me.x,
          GROUND,
          24,
          [me.f.theme.palette.c3, me.f.theme.palette.c1, '#ffffff'],
          { speed: 520, dir: -Math.PI / 2, spread: Math.PI, kind: 'square', size: 7, g: 1400 },
        );
      }
    } else {
      const def = ATTACKS[id];
      const uj = Math.min(u, 1);
      const pt = this.joints(me, def.pose, uj)[def.joint];
      const prev = me.prev ?? pt;
      me.prev = { x: pt.x, y: pt.y };
      if (u >= def.active[0] - 0.08 && u <= def.active[1]) {
        me.trail.push({ x: pt.x, y: pt.y });
        if (me.trail.length > 6) me.trail.shift();
      } else if (me.trail.length) me.trail.shift();
      if (!me.hit && u >= def.active[0] && u <= def.active[1]) {
        // sweep last frame's joint → this frame's so a fast arc can't skip the hurtbox
        const hb = this.hurt(op);
        for (let k = 1; k <= 3; k++) {
          const q = { x: lerp(prev.x, pt.x, k / 3), y: lerp(prev.y, pt.y, k / 3) };
          if (circleRect(q.x, q.y, def.r, hb)) {
            me.hit = true;
            this.strike(me, op, def, q, false, def.blockLag);
            break;
          }
        }
      }
      if (id === 'uppercut' && u > 0.3 && u < 0.4 && me.y >= GROUND - 1) me.vy = -260;
    }
    if (me.st >= dur + me.lag) this.setState(me, me.y < GROUND - 1 ? 'jump' : 'idle');
  }

  private joints(me: Body, pose: PoseId, u: number) {
    const air = me.y < GROUND - 1;
    return jointsAt(me.f, pose, u * (POSE_LOOP[pose] ?? 1), {
      x: me.x,
      y: me.y,
      scale: SCALE,
      facing: me.facing,
      noLift: air,
    });
  }

  private hurt(x: Body): Rect {
    return hurtbox(x.x, x.y, x.height, x.width, x.state === 'crouch');
  }

  private strike(
    me: Body,
    op: Body,
    d: {
      dmg: number;
      kb: number;
      launch: number;
      stun: number;
      stop: number;
      meter: number;
      word: string;
    },
    at: { x: number; y: number },
    special: boolean,
    blockLag = 0,
  ) {
    if (op.invuln > 0 || op.state === 'ko') return;
    const fx = this.env.fx;
    const pal = me.f.theme.palette;
    const blocking =
      (op.state === 'block' || (op.holdingBack && this.free(op) && op.y >= GROUND - 1)) &&
      op.state !== 'jump';
    const rage = (x: Body) => (x.hp / x.max < RAGE_AT ? 1.5 : 1);
    if (blocking) {
      const chip = damage(d.dmg, me.f.stats, op.f.stats, 0, special) * CHIP;
      op.hp = Math.max(1, op.hp - chip);
      this.setState(op, 'block');
      op.blockT = 0.22;
      op.guardFx = 0.3;
      op.vx = me.facing * d.kb * 0.5;
      op.meter = Math.min(100, op.meter + 4 * rage(op));
      op.guard += GUARD_BASE + d.dmg / GUARD_PER_DMG;
      op.pts += POINTS.block;
      if (op.side === 0 && !special) this.coach('punish');
      op.guardRest = 0;
      if (op.guard >= 1) {
        // Guard break: turtling has a cost too. The guard shatters into a long stagger.
        op.guard = 0;
        this.setState(op, 'hurt');
        op.stun = GUARD_BREAK_STUN;
        op.flash = 1;
        op.vx = me.facing * d.kb * 0.3;
        fx.stop(8);
        fx.shake(0.4);
        fx.flash(0.35, '#ffffff');
        fx.burst(at.x, at.y, 26, ['#ffffff', op.f.theme.palette.c3, '#9fb3c8'], {
          kind: 'square',
          speed: 460,
          size: 5,
          g: 900,
        });
        fx.pop(op.x, op.y - op.height - 40, 'GUARD BREAK!', '#ffffff', 34);
        this.env.sfx.play('ko', 0.5);
        this.env.announce(`${op.f.alias}'s guard breaks!`);
        return;
      }
      // A blocked swing leaves the attacker open: extra recovery, and no chain off it.
      me.blocked = true;
      if (me.state === 'attack') me.lag = blockLag;
      fx.stop(3);
      fx.burst(at.x, at.y, 10, [op.f.theme.palette.c3, '#ffffff'], { speed: 300, size: 3 });
      fx.ring(at.x, at.y, '#ffffff', 40);
      fx.pop(at.x - me.facing * 10, at.y - 30, 'BLOCK', '#e8eef7', 22 * this.ui);
      this.env.sfx.play('block');
      return;
    }
    // Counter-hit: caught mid-swing (wind-up or recovery) — bigger reward, louder lettering.
    const counter = op.state === 'attack' && !special;
    const dmg =
      damage(d.dmg, me.f.stats, op.f.stats, me.combo, special) * (counter ? COUNTER_DMG : 1);
    op.hp = Math.max(0, op.hp - Math.round(dmg * 10) / 10);
    me.combo++;
    me.pts += POINTS.hit;
    if (op.side === 0 && ++this.p1Hurt >= 2 && op.hp > 0) this.coach('block');
    me.comboT = 1.1;
    me.meter = Math.min(
      100,
      me.meter + (d.meter || 0) * (0.8 + me.f.stats.special * 0.04) * rage(me),
    );
    op.meter = Math.min(100, op.meter + 5 * rage(op));
    op.vx = me.facing * d.kb;
    op.vy = d.launch || (op.y < GROUND - 1 ? -300 : 0);
    if (op.vy < 0) op.y -= 1;
    op.flash = 1;
    this.setState(op, 'hurt');
    op.stun = d.stun + (counter ? 0.08 : 0);
    if (counter) fx.pop(at.x, at.y - 86, 'COUNTER!', '#ffffff', 26 * this.ui);
    fx.stop(d.stop + (counter ? 2 : 0));
    fx.shake(special ? 0.6 : 0.18 + d.dmg * 0.02);
    if (special || d.dmg >= 10) fx.flash(special ? 0.5 : 0.2, pal.c3);
    fx.burst(at.x, at.y, special ? 34 : 18, [pal.c3, pal.c1, '#ffffff'], {
      speed: special ? 620 : 420,
      size: special ? 6 : 4,
      g: 300,
    });
    fx.ring(at.x, at.y, pal.c3, special ? 90 : 55);
    fx.pop(at.x + me.facing * 20, at.y - 40, d.word, pal.c3, special ? 48 : 36);
    if (me.combo >= 2) {
      // one combo counter per side: the new count replaces the old label instead of stacking
      const cx = me.side ? W - 150 : 150;
      fx.pops = fx.pops.filter((q) => !(q.x === cx && q.text.endsWith(' HITS!'))); // pops drift up
      fx.pop(cx, 170, `${me.combo} HITS!`, readable(brightest(pal.c1, pal.c3), 0.3), 40);
    }
    this.env.sfx.play('hit', special ? 1 : 0.4 + d.dmg / 25);
    if (op.hp <= 0) this.ko(me, op);
  }

  private ko(me: Body, op: Body) {
    this.setState(op, 'ko');
    op.vy = -520;
    op.vx = me.facing * 380;
    op.y -= 1;
    this.env.fx.slow(1.1, 0.28);
    this.env.fx.flash(0.8);
    this.env.fx.shake(0.8);
    this.env.sfx.play('ko');
    this.endRound(false);
  }

  private endRound(timeUp: boolean) {
    const [a, b] = this.b;
    // Nothing keeps flying once the round is decided (a late orb used to hit the winner).
    this.shots = [];
    const decision = timeUp
      ? timeoutWinner([a.hp, b.hp], [a.max, b.max], [a.pts, b.pts])
      : { winner: roundWinner([a.hp, b.hp], [a.max, b.max]), by: 'ko' as const };
    const w = decision.winner;
    this.roundResult = w;
    if (w === 0 || w === 1) this.wins[w]++;
    this.phase = 'roundEnd';
    this.phaseT = 0;
    const wf = w === 0 ? a : w === 1 ? b : null;
    this.say(
      timeUp ? 'TIME!' : 'K.O.!',
      !wf
        ? 'DRAW ROUND'
        : timeUp
          ? `${wf.f.alias} WINS ON ${decision.by === 'points' ? 'POINTS' : 'HEALTH'}`
          : `${wf.hp >= wf.max ? 'PERFECT! ' : ''}${wf.f.alias} WINS THE ROUND`,
      wf ? wf.f.theme.palette.c3 : '#ffffff',
    );
    for (const x of this.b) {
      if (x === wf) {
        this.setState(x, 'win');
        x.vx = 0;
      } else if (x.state !== 'ko') this.setState(x, timeUp ? 'hurt' : 'idle');
      x.stun = 99;
      x.atk = null;
    }
    this.env.announce(
      `${timeUp ? 'Time' : 'Knockout'}! ${wf ? `${wf.f.alias} wins round ${this.round}${timeUp ? ` on ${decision.by === 'points' ? 'points' : 'health'}` : ''}.` : 'Round drawn.'} Rounds: ${this.wins[0]} to ${this.wins[1]}.`,
    );
  }

  private physics(x: Body, op: Body, dt: number) {
    const grounded = x.y >= GROUND - 0.5;
    if (!grounded || x.vy < 0) {
      x.vy += GRAV * dt;
      x.y += x.vy * dt;
      if (x.y >= GROUND) {
        x.y = GROUND;
        if (x.state === 'ko' && x.vy > 300) {
          x.vy = -x.vy * 0.25;
          this.env.fx.burst(x.x, GROUND, 10, ['#ffffff', x.f.theme.palette.c2], {
            kind: 'dot',
            speed: 200,
            dir: -Math.PI / 2,
            spread: Math.PI,
            g: 300,
            size: 6,
          });
          this.env.sfx.play('bounce', 0.8);
        } else {
          x.vy = 0;
          if (x.state === 'jump') {
            this.setState(x, 'idle');
            this.env.fx.burst(x.x, GROUND, 6, ['#ffffff'], {
              kind: 'dot',
              speed: 120,
              dir: -Math.PI / 2,
              spread: Math.PI,
              g: 200,
              size: 5,
            });
          }
          if (x.state === 'attack' && x.atk !== 'special' && x.atk !== 'uppercut')
            this.setState(x, 'idle');
        }
      }
    }
    x.x += x.vx * dt;
    if (
      x.y >= GROUND - 0.5 &&
      (x.state === 'hurt' || x.state === 'block' || x.state === 'ko' || x.state === 'attack')
    )
      x.vx *= 0.86 ** (dt * 60);
    if (x.state === 'idle' || x.state === 'crouch') x.vx = 0;
    x.x = clamp(x.x, LEFT, RIGHT);
    // cornered: push the attacker back instead
    if ((x.x === LEFT || x.x === RIGHT) && x.state === 'hurt' && Math.abs(op.x - x.x) < 140)
      op.x += (op.x > x.x ? 1 : -1) * 3;
  }

  private separate() {
    const [a, b] = this.b;
    const min = (a.width + b.width) * 0.32;
    const dx = b.x - a.x;
    const overlapY = Math.abs(a.y - b.y) < Math.min(a.height, b.height) * 0.7;
    if (overlapY && Math.abs(dx) < min) {
      const push = (min - Math.abs(dx)) / 2;
      const s = dx >= 0 ? 1 : -1;
      a.x = clamp(a.x - push * s, LEFT, RIGHT);
      b.x = clamp(b.x + push * s, LEFT, RIGHT);
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.t += dt;
      s.x += s.vx * dt;
      if (s.x < -40 || s.x > W + 40) s.alive = false;
      const tgt = this.b[s.owner ? 0 : 1];
      const me = this.b[s.owner];
      if (
        s.alive &&
        circleRect(s.x, s.y, 16, this.hurt(tgt)) &&
        tgt.invuln <= 0 &&
        tgt.state !== 'ko'
      ) {
        s.alive = false;
        const sp = SPECIAL.projectile;
        this.strike(
          me,
          tgt,
          {
            dmg: sp.dmg,
            kb: sp.kb,
            launch: sp.launch,
            stun: 0.55,
            stop: 9,
            meter: 0,
            word: sp.word,
          },
          { x: s.x, y: s.y },
          true,
        );
      }
    }
    // two shots cancel each other
    const alive = this.shots.filter((s) => s.alive);
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const p = alive[i];
        const q = alive[j];
        if (p && q && p.owner !== q.owner && Math.abs(p.x - q.x) < 26 && Math.abs(p.y - q.y) < 40) {
          p.alive = q.alive = false;
          this.env.fx.burst((p.x + q.x) / 2, p.y, 24, [
            '#ffffff',
            this.b[0].f.theme.palette.c3,
            this.b[1].f.theme.palette.c3,
          ]);
          this.env.sfx.play('hit', 0.5);
        }
      }
    this.shots = this.shots.filter((s) => s.alive);
  }

  // ── render ───────────────────────────────────────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D) {
    const cssW = ctx.canvas?.clientWidth ?? 0;
    this.ui = cssW > 0 ? clamp(11 / (16 * (cssW / W)), 1, 1.7) : 1;
    const fx = this.env.fx;
    const [a, b] = this.b;
    ctx.save();
    // parallax background (slower than the camera)
    const bg = arenaLayer(a.f, b.f, W + 120, H, GROUND, 'city');
    ctx.save();
    const o = fx.offset();
    ctx.translate(o.x * 0.4 - 60 - fx.cam.x * 0.35, o.y * 0.4);
    if (bg) ctx.drawImage(bg, 0, 0);
    else {
      ctx.fillStyle = '#1b1464';
      ctx.fillRect(0, 0, W + 120, H);
    }
    ctx.restore();
    ctx.save();
    fx.applyCamera(ctx, W, H);
    // draw the one being hit behind the attacker
    const order = a.state === 'attack' ? [b, a] : [a, b];
    for (const x of order) this.drawBody(ctx, x);
    this.drawHintArrow(ctx);
    for (const s of this.shots)
      orb(ctx, s.x, s.y, 13, s.t, this.b[s.owner].f.theme.palette, Math.sign(s.vx));
    fx.drawParticles(ctx);
    fx.drawPops(ctx, DISPLAY_FONT);
    ctx.restore();
    fx.drawFlash(ctx, W, H);
    this.hud(ctx);
    this.drawHint(ctx);
    if (this.banner)
      banner(ctx, W, H, this.banner.text, this.banner.sub, this.banner.t, this.banner.color);
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D, x: Body) {
    const air = x.y < GROUND - 1;
    let pose: PoseId = 'idle';
    let t = this.clock + x.side * 0.37;
    switch (x.state) {
      case 'intro':
        pose = 'taunt';
        break;
      case 'walk':
        pose = 'walk';
        t = x.walkT * 1.2;
        break;
      case 'jump': {
        pose = 'jump';
        t = (x.vy < 0 ? 0.42 : 0.62) * (POSE_LOOP.jump ?? 1);
        break;
      }
      case 'crouch':
        pose = 'crouch';
        break;
      case 'block':
        pose = 'block';
        break;
      case 'hurt':
        pose = 'hurt';
        t = Math.min(x.st, 0.5);
        break;
      case 'ko':
        pose = 'ko';
        t = Math.min(0.3 + x.st * 0.9, (POSE_LOOP.ko ?? 2) * 0.98);
        break;
      case 'win':
        pose = 'victory';
        t = x.st;
        break;
      case 'attack':
        if (x.atk) {
          pose = x.atk === 'special' ? 'special' : ATTACKS[x.atk].pose;
          t = this.poseU(x) * (POSE_LOOP[pose] ?? 1);
        }
        break;
    }
    if (x.state === 'idle' && this.phase === 'roundEnd') pose = 'idle';
    const flicker = x.invuln > 0 && x.atk !== 'special' ? 0.6 : 1;
    // player marker
    ctx.fillStyle = x.f.theme.palette.c3;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    const mx = x.x;
    const my = x.y - x.height - 22 - (air ? 0 : 0);
    if (
      this.phase !== 'roundEnd' &&
      x.state !== 'ko' &&
      !(x.atk === 'special' && x.f.special.kind === 'teleport')
    ) {
      ctx.beginPath();
      ctx.moveTo(mx - 8, my - 10);
      ctx.lineTo(mx + 8, my - 10);
      ctx.lineTo(mx, my);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      inkText(
        ctx,
        x.side ? (this.env.vs === 'cpu' ? 'CPU' : 'P2') : 'P1',
        mx,
        my - 14 - 8 * this.ui,
        16 * this.ui,
        '#ffffff',
        'center',
        HEAD_FONT,
      );
    }
    if (x.state === 'attack' && x.atk === 'special') this.drawCharge(ctx, x);
    this.drawTrail(ctx, x);
    drawFighter(ctx, x.f, pose, t, {
      x: x.x,
      y: x.y,
      scale: SCALE,
      facing: x.facing,
      noLift: air || pose === 'ko',
      flash: x.flash,
      alpha: flicker,
      orb: false,
      shadow: true,
    });
    if (air) {
      ctx.fillStyle = alpha(INK, 0.25);
      ctx.beginPath();
      ctx.ellipse(x.x, GROUND + 1, 30, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawTell(ctx, x);
    if (x.guardFx > 0) this.drawShield(ctx, x);
    if (x.state === 'attack' && x.lag > 0 && x.st > this.dur(x) * 0.6) this.drawStagger(ctx, x);
  }

  /** Hint arrow over P1 pointing the way to hold (world space, inside the camera). */
  private drawHintArrow(ctx: CanvasRenderingContext2D) {
    const h = this.hint;
    if (h?.id !== 'block') return;
    const k = Math.min(1, h.t / 0.25, (HINTS.block.t - h.t) / 0.4);
    const pal = this.env.p1.theme.palette;
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    const p = this.b[0];
    const dir = -p.facing;
    const cx = p.x + dir * 34;
    const cy = p.y - p.height - 100 + Math.sin(this.clock * 8) * 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(-dir, 1); // the base shape points left (−x)
    ctx.beginPath();
    ctx.moveTo(36, -10);
    ctx.lineTo(0, -10);
    ctx.lineTo(0, -26);
    ctx.lineTo(-34, 0);
    ctx.lineTo(0, 26);
    ctx.lineTo(0, 10);
    ctx.lineTo(36, 10);
    ctx.closePath();
    ctx.fillStyle = pal.c3;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /** Coaching line under the HUD, big enough for a phone (canvas ≈ 0.4× there). */
  private drawHint(ctx: CanvasRenderingContext2D) {
    const h = this.hint;
    if (!h) return;
    const def = { ...HINTS[h.id], text: h.text, sub: h.sub };
    const k = Math.min(1, h.t / 0.25, (def.t - h.t) / 0.4);
    const pop = 1 + Math.max(0, 0.25 - h.t) * 1.2;
    const pal = this.env.p1.theme.palette;
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    // a speech-panel strip so the lettering reads over any backdrop
    ctx.fillStyle = alpha('#fffdf6', 0.94);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(W / 2 - 290, 128, 580, 104);
    ctx.fill();
    ctx.stroke();
    inkText(ctx, def.text, W / 2, 162, 44 * pop, readable(pal.c3, 0.3), 'center', HEAD_FONT);
    ctx.font = `34px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.fillText(def.sub, W / 2, 207);
    ctx.restore();
  }

  /**
   * Pose time for an attack. A blocked attack's recovery is stretched over the extra lag, so the
   * attacker visibly stumbles instead of snapping back to guard.
   */
  private poseU(x: Body) {
    const dur = this.dur(x);
    const u = x.st / dur;
    if (x.lag <= 0 || u <= 0.6) return Math.min(u, 0.999);
    return Math.min(0.6 + (0.4 * (x.st - dur * 0.6)) / (dur * 0.4 + x.lag), 0.999);
  }

  /** Wind-up tell: a growing glint on the striking fist/foot during startup. */
  private drawTell(ctx: CanvasRenderingContext2D, x: Body) {
    if (x.state !== 'attack' || !x.atk || x.atk === 'special') return;
    const def = ATTACKS[x.atk];
    const u = x.st / def.dur;
    if (u >= def.active[0]) return;
    const k = u / def.active[0];
    const pt = this.joints(x, def.pose, u)[def.joint];
    const r = 6 + k * 12;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(k * 1.2);
    ctx.globalAlpha = 0.35 + k * 0.65;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = x.f.theme.palette.c3;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? r * 0.3 : r;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Special wind-up: a ring that tightens onto the fighter until the move fires. */
  private drawCharge(ctx: CanvasRenderingContext2D, x: Body) {
    const sp = SPECIAL[x.f.special.kind];
    const u = x.st / SPECIAL_DUR;
    if (u >= sp.active[0]) return;
    const k = u / sp.active[0];
    const cy = x.y - x.height * 0.55;
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = alpha(x.f.theme.palette.c3, 0.25 + k * 0.6);
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -this.clock * 120;
    ctx.beginPath();
    ctx.ellipse(x.x, cy, 130 - k * 60, (130 - k * 60) * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = alpha('#ffffff', 0.5 * k);
    ctx.beginPath();
    ctx.ellipse(x.x, cy, 60 + (1 - k) * 30, (60 + (1 - k) * 30) * 1.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Swoosh behind a swinging limb (comic motion lines). */
  private drawTrail(ctx: CanvasRenderingContext2D, x: Body) {
    const tr = x.trail;
    if (x.state !== 'attack' || tr.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, c] of [
      [16, alpha(INK, 0.35)],
      [11, alpha(x.f.theme.palette.c3, 0.55)],
      [5, alpha('#ffffff', 0.9)],
    ] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      for (const [i, p] of tr.entries()) {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Block impact: a bright arc flashes in front of the guard (red once it's close to breaking). */
  private drawShield(ctx: CanvasRenderingContext2D, x: Body) {
    const k = x.guardFx / 0.3;
    const cx = x.x + x.facing * x.width * 0.35;
    const cy = x.y - x.height * 0.5;
    const r = x.height * 0.55;
    const a0 = x.facing === 1 ? -Math.PI / 2.6 : Math.PI - Math.PI / 2.6;
    const a1 = a0 + (Math.PI / 2.6) * 2;
    // a cracking guard tints toward red
    const col = x.guard > 0.65 ? '#ff5a4d' : x.f.theme.palette.c3;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = alpha(INK, 0.5 * k);
    ctx.beginPath();
    ctx.arc(cx - x.facing * r * 0.6, cy, r, a0, a1);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = alpha(col, 0.85 * k);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = alpha('#ffffff', 0.9 * k);
    ctx.stroke();
    ctx.restore();
  }

  /** Blocked attacker: little stars over the head while the extra recovery plays out. */
  private drawStagger(ctx: CanvasRenderingContext2D, x: Body) {
    const cy = x.y - x.height - 8;
    for (let i = 0; i < 3; i++) {
      const ang = this.clock * 7 + (i * Math.PI * 2) / 3;
      const px = x.x + Math.cos(ang) * 22;
      const py = cy + Math.sin(ang) * 6;
      ctx.fillStyle = i % 2 ? '#ffffff' : x.f.theme.palette.c3;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2;
        const rr = j % 2 ? 2.5 : 6;
        ctx.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private hud(ctx: CanvasRenderingContext2D) {
    const [a, b] = this.b;
    const bw = 360;
    bar(
      ctx,
      40,
      24,
      bw,
      26,
      a.hp / a.max,
      a.ghost / a.max,
      readable(a.f.theme.palette.c1, 0.15),
      -1,
    );
    bar(
      ctx,
      W - 40 - bw,
      24,
      bw,
      26,
      b.hp / b.max,
      b.ghost / b.max,
      readable(b.f.theme.palette.c1, 0.15),
      1,
    );
    const ui = this.ui;
    const nameY = 54 + 12 * ui;
    inkText(ctx, a.f.alias, 48, nameY, 24 * ui, '#ffffff', 'left');
    inkText(ctx, b.f.alias, W - 48, nameY, 24 * ui, '#ffffff', 'right');
    for (const x of this.b) {
      const x0 = x.side ? W - 40 - bw : 40;
      // guard gauge: a thin strip under the health bar, only while it holds anything
      if (x.guard > 0.02) {
        const gw = bw * Math.min(1, x.guard);
        const hot = x.guard > 0.65;
        ctx.fillStyle = INK;
        ctx.fillRect(x0, 52, bw, 6);
        ctx.fillStyle = hot && Math.sin(this.clock * 24) > 0 ? '#ff5a4d' : '#e8eef7';
        ctx.fillRect(x.side ? x0 : x0 + bw - gw, 53, gw, 4);
      }
      // low health: the bar's frame pulses and DANGER flashes under the name
      if (this.phase === 'fight' && x.hp > 0 && x.hp / x.max < RAGE_AT) {
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * 9);
        ctx.strokeStyle = alpha('#ff3b30', 0.35 + pulse * 0.55);
        ctx.lineWidth = 4;
        ctx.strokeRect(x0 - 4, 20, bw + 8, 34);
        inkText(
          ctx,
          'DANGER',
          x.side ? W - 48 : 48,
          nameY + 14 + 14 * ui,
          (16 + pulse * 3) * ui,
          '#ff5a4d',
          x.side ? 'right' : 'left',
          HEAD_FONT,
        );
      }
    }
    // round pips
    for (let i = 0; i < 2; i++) {
      for (const [side, x0] of [
        [0, 40 + bw - 18 * ui - i * 22 * ui],
        [1, W - 40 - bw + 30 * ui + i * 22 * ui],
      ] as const) {
        ctx.fillStyle = this.wins[side] > i ? this.b[side].f.theme.palette.c3 : alpha(INK, 0.6);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x0, nameY, 8 * ui, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // timer
    ctx.save();
    ctx.translate(W / 2, 40);
    ctx.fillStyle = '#fffdf6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const r = i % 2 ? 30 : 40;
      i
        ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r)
        : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = `34px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.timer < 10 ? '#d11a2a' : INK;
    ctx.fillText(String(Math.ceil(this.timer)), 0, 2);
    ctx.restore();
    // special meters
    for (const x of this.b) {
      const mw = 220;
      const x0 = x.side ? W - 30 - mw : 30;
      const y0 = H - 34;
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 3, y0 - 3, mw + 6, 18);
      const k = x.meter / 100;
      const ready = x.meter >= SPECIAL_COST;
      ctx.fillStyle = ready ? x.f.theme.palette.c3 : alpha(x.f.theme.palette.c3, 0.55);
      ctx.fillRect(x.side ? x0 + mw * (1 - k) : x0, y0, mw * k, 12);
      ctx.fillStyle = alpha('#ffffff', 0.9);
      ctx.fillRect(x0 + mw / 2 - 1, y0, 2, 12);
      if (ready) {
        const pulse = 0.75 + 0.25 * Math.sin(this.clock * 10);
        inkText(
          ctx,
          `${x.f.special.name.toUpperCase()} READY`,
          x.side ? x0 + mw : x0,
          y0 - 6 - 10 * ui,
          (18 * pulse + 4) * ui,
          x.f.theme.palette.c3,
          x.side ? 'right' : 'left',
          HEAD_FONT,
        );
      }
    }
  }

  describe(): string {
    const [a, b] = this.b;
    const pct = (x: Body) => Math.round((x.hp / x.max) * 100);
    const dist = Math.round(Math.abs(a.x - b.x) / 10);
    return `Round ${this.round}, ${Math.ceil(this.timer)} seconds left. Rounds won: ${a.f.alias} ${this.wins[0]}, ${b.f.alias} ${this.wins[1]}. ${a.f.alias} health ${pct(a)}%${a.meter >= SPECIAL_COST ? ', special ready' : ''}. ${b.f.alias} health ${pct(b)}%${b.meter >= SPECIAL_COST ? ', special ready' : ''}. Distance ${dist} steps; ${b.f.alias} is to the ${b.x > a.x ? 'right' : 'left'}.`;
  }
}

/** Exposed for tests. */
export const _internals = { blankPad, lerp, resetHints: () => seenHints.clear() };
