/**
 * Brawler CPU. It perceives with a human-like delay (`react`), then acts: it guards attacks it
 * sees starting, punishes blocked and whiffed attacks, anti-airs jump-ins, plays footsies at the
 * edge of its reach, chains combos and spends meter when the special suits the range. It also
 * keeps a running read of the player's habits (punch-heavy players get crouched under). Each
 * round it picks a style (rush, footsie, turtle) so two rounds don't play the same.
 *
 * Presses made while the CPU is still in block-stun are buffered by the sim and fire on the first
 * free frame, which is how a reaction lands as a punish.
 */
import type { Action } from '../engine/input';
import type { Difficulty } from '../types';

export interface AiParams {
  /** seconds from seeing something to acting on it */
  react: number;
  /** chance to guard an attack it sees starting in range */
  block: number;
  /** chance per neutral decision to guard pre-emptively inside the opponent's reach */
  guard: number;
  /** chance to punish a blocked or whiffed attack */
  punish: number;
  /** footsies: pokes an opponent who walks in, steps out of range, adapts to habits (0–1) */
  spacing: number;
  antiAir: number;
  special: number;
  combo: number;
  /** chance a neutral decision in range is an unprovoked attack */
  aggression: number;
  /** chance a neutral decision is a plain mistake (swing at air, stroll straight in) */
  mistake: number;
}

export const FIGHT_AI: Record<Difficulty, AiParams> = {
  easy: {
    react: 0.36,
    block: 0.42,
    guard: 0.2,
    punish: 0.35,
    spacing: 0.3,
    antiAir: 0.15,
    special: 0.3,
    combo: 0.3,
    aggression: 0.4,
    mistake: 0.15,
  },
  normal: {
    react: 0.2,
    block: 0.7,
    guard: 0.4,
    punish: 0.6,
    spacing: 0.55,
    antiAir: 0.5,
    special: 0.6,
    combo: 0.6,
    aggression: 0.32,
    mistake: 0.08,
  },
  hard: {
    react: 0.1,
    block: 0.92,
    guard: 0.65,
    punish: 0.92,
    spacing: 0.92,
    antiAir: 0.85,
    special: 0.9,
    combo: 0.92,
    aggression: 0.3,
    mistake: 0.02,
  },
};

export type SpecialKind = 'beam' | 'projectile' | 'shockwave' | 'dash' | 'teleport';
export type AtkPhase = 'none' | 'startup' | 'active' | 'recovery';
type AtkId = 'punch' | 'kick' | 'uppercut' | 'special';

export interface AiView {
  /** opponent.x - self.x */
  dx: number;
  oppAir: boolean;
  oppAttacking: boolean;
  oppHurt: boolean;
  selfFree: boolean;
  selfAir: boolean;
  meter: number;
  projectileIncoming: boolean;
  /** our last attack connected and can be chained */
  canChain: boolean;
  // ── richer perception (optional so simple callers still work) ──
  /** increments every time the opponent starts an attack (chains included) */
  oppAtkSeq?: number;
  oppAtk?: AtkId | null;
  oppPhase?: AtkPhase;
  /** seconds until the opponent can act (or guard) again */
  oppFreeIn?: number;
  /** the opponent's current attack was blocked */
  oppBlocked?: boolean;
  /** the opponent's current attack has passed its active window without connecting */
  oppWhiffed?: boolean;
  oppCrouch?: boolean;
  /** opponent is airborne and coming down */
  oppFalling?: boolean;
  /** opponent's feet height above the ground */
  oppHeight?: number;
  /** distance at which our punch / their punch connects */
  selfReach?: number;
  oppReach?: number;
  /** we are in block-stun */
  selfBlocking?: boolean;
  /** opponent's guard gauge 0–1 (full breaks) */
  oppGuard?: number;
  /** the attack we are in (for picking the next chain link) */
  selfAtk?: AtkId | null;
  /** our current attack was blocked */
  selfBlocked?: boolean;
  specialKind?: SpecialKind;
  /** our health fraction minus theirs */
  hpLead?: number;
  timeLeft?: number;
}

export interface Intent {
  held: Record<Action, boolean>;
  pressed: Record<Action, boolean>;
}

type Style = 'rush' | 'footsie' | 'turtle';
type Plan = 'approach' | 'retreat' | 'hold' | 'dance' | 'guard' | 'poke' | 'whiff';
type Reaction = 'read' | 'punish' | 'shot';

/** Fallback punch reach (feet to feet) when the sim doesn't say. */
export const REACH = 136;
const UPPER_REACH = 100;
const STYLES: Record<Style, { range: number; aggr: number; guard: number }> = {
  rush: { range: 108, aggr: 0.15, guard: -0.1 },
  footsie: { range: 22, aggr: 0, guard: 0 },
  turtle: { range: 50, aggr: -0.12, guard: 0.12 },
};

const blank = (): Record<Action, boolean> => ({
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
  b: false,
  c: false,
});

export class FightAI {
  private clock = 0;
  private timer = 0;
  private plan: Plan = 'hold';
  private planT = 0;
  private crouch = false;
  private guardT = 0;
  private danceDir: 1 | -1 = 1;
  private queue: { at: number; kind: Reaction }[] = [];
  private antiAirArmed = false;
  private chainBtn: 'a' | 'b' | 'c' | null = null;
  private chainDown = false;
  private punishedSeq = -1;
  /** seconds since anyone threw anything (a passive opponent gets walked down) */
  private quiet = 0;
  private pokeIn = false;
  /** running read of the opponent's habits (survives rounds) */
  private habit = { punch: 1, other: 1, thrown: 2, blocked: 1 };
  private last = {
    seq: -1,
    blocked: false,
    air: false,
    shot: false,
    chain: false,
    dist: 0,
    phase: 'none' as AtkPhase,
    selfAtk: false,
    selfBlocked: false,
  };
  style: Style = 'footsie';
  readonly intent: Intent = { held: blank(), pressed: blank() };

  constructor(
    readonly p: AiParams,
    private rand: () => number,
  ) {
    this.newRound();
  }

  /** Re-roll the round's style and forget anything in flight. `lead` = our rounds − theirs. */
  newRound(lead = 0) {
    const r = this.rand();
    // Behind on rounds → more likely to rush; ahead → more likely to sit back.
    this.style = r < 0.33 - lead * 0.12 ? 'rush' : r < 0.7 ? 'footsie' : 'turtle';
    this.queue = [];
    this.plan = 'hold';
    this.guardT = 0;
    this.timer = 0.2 + this.rand() * 0.4;
    this.antiAirArmed = false;
    this.chainBtn = null;
    this.quiet = 0;
  }

  private schedule(kind: Reaction) {
    this.queue.push({ at: this.clock + this.p.react * (0.75 + this.rand() * 0.5), kind });
  }

  /** How punch-heavy the opponent has been (0–1). */
  private punchy() {
    return this.habit.punch / (this.habit.punch + this.habit.other);
  }

  /** How often our attacks have been blocked lately (0–1): a wall gets baited, not hit. */
  private walled() {
    return this.habit.blocked / this.habit.thrown;
  }

  update(dt: number, v: AiView): Intent {
    const P = this.p;
    const it = this.intent;
    it.pressed = blank();
    it.held = blank();
    this.clock += dt;
    const toward: Action = v.dx > 0 ? 'right' : 'left';
    const away: Action = v.dx > 0 ? 'left' : 'right';
    const dist = Math.abs(v.dx);
    const reach = v.selfReach ?? REACH;
    const oppReach = v.oppReach ?? REACH;
    const closing = dist < this.last.dist - 0.4;
    const st = STYLES[this.style];
    if (v.oppAttacking || v.selfAtk || v.oppHurt) this.quiet = 0;
    else this.quiet += dt;
    // Patience runs out sooner for a rushdown CPU; then it walks into range and starts swinging.
    const restless =
      this.quiet > (this.style === 'rush' ? 0.8 : this.style === 'footsie' ? 1.4 : 2.2);
    const range = restless ? reach - 14 : this.style === 'rush' ? st.range : oppReach + st.range;
    const lead = v.hpLead ?? 0;
    const late = (v.timeLeft ?? 60) < 15;
    // Behind on health → push; ahead late in the round → sit on the lead.
    const aggr = Math.max(
      0.05,
      Math.min(
        0.9,
        P.aggression +
          st.aggr +
          (restless ? 0.15 : 0) +
          (lead < -0.25 ? 0.15 : 0) +
          // the clock is running out: whoever is behind (or level) goes for it
          (late && lead <= 0.02 ? 0.25 : 0),
      ),
    );
    const guardChance = Math.max(0, P.guard + st.guard);
    const phase = v.oppPhase ?? (v.oppAttacking ? 'startup' : 'none');

    // ── perception edges ──
    const seq = v.oppAtkSeq ?? (v.oppAttacking ? this.last.seq : this.last.seq + 1);
    const newAttack = v.oppAttacking && seq !== this.last.seq;
    const blockedNow = !!v.oppBlocked && !this.last.blocked;
    const recovering = phase === 'recovery' && this.last.phase !== 'recovery';
    const airStart = v.oppAir && !this.last.air;
    const shotStart = v.projectileIncoming && !this.last.shot;
    const chainStart = v.canChain && !this.last.chain;

    if (v.selfAtk && !this.last.selfAtk) {
      // decay the read so it follows the player's current habit
      this.habit.thrown = this.habit.thrown * 0.92 + 1;
      this.habit.blocked *= 0.92;
    }
    if (v.selfBlocked && !this.last.selfBlocked) this.habit.blocked++;
    if (newAttack) {
      if (v.oppAtk === 'punch') this.habit.punch++;
      else if (v.oppAtk) this.habit.other++;
      if (dist < oppReach + 120) this.schedule('read');
    }
    if ((blockedNow || (recovering && v.oppWhiffed)) && this.punishedSeq !== seq) {
      this.punishedSeq = seq;
      if (this.rand() < P.punish) this.schedule('punish');
    }
    if (shotStart) this.schedule('shot');
    if (airStart && dist < 360) this.antiAirArmed = this.rand() < P.antiAir;
    if (!v.oppAir) this.antiAirArmed = false;

    // ── reactions whose delay has elapsed ──
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (!q || q.at > this.clock) continue;
      this.queue.splice(i, 1);
      if (q.kind === 'read') {
        if (phase !== 'startup' && phase !== 'active') continue;
        // Specials reach from anywhere (beam, dash, teleport behind you): guard them by distance-free read.
        if (dist <= oppReach + 14 || v.oppAtk === 'special') {
          if (this.rand() < P.block) {
            this.guardT = Math.max(this.guardT, (v.oppFreeIn ?? 0.35) + 0.05);
            // Duck a punch outright (it sails over a crouch) when we know it's coming.
            this.crouch = v.oppAtk === 'punch' && this.rand() < P.spacing * 0.7;
            this.plan = 'hold';
          }
        } else if (
          (v.oppFreeIn ?? 0.3) > 0.16 + Math.max(0, dist - reach) / 260 &&
          this.rand() < P.spacing
        ) {
          // They swung from too far and are stuck in a long recovery: walk in and punish.
          this.plan = 'whiff';
          this.planT = (v.oppFreeIn ?? 0.3) + 0.05;
        }
      } else if (q.kind === 'punish') {
        // Fires during our block-stun (the sim buffers it) or right as they recover.
        const free = v.oppFreeIn ?? 0.2;
        if (dist < reach + 6) {
          if (dist < UPPER_REACH && free > 0.08 && this.rand() < 0.6) {
            it.held.down = true;
            it.pressed.a = true; // uppercut launches
          } else it.pressed.a = true;
          this.guardT = 0;
          this.plan = 'hold';
        } else if (free > 0.16 + (dist - reach) / 260 && dist < reach + 90) {
          this.plan = 'whiff';
          this.planT = free;
        }
      } else if (q.kind === 'shot' && v.projectileIncoming) {
        if (dist > 230 && this.rand() < P.spacing * 0.35) {
          it.pressed.up = true;
          it.held[toward] = true;
        } else if (this.rand() < 0.5 + P.block * 0.5) {
          // An orb is slow and obvious: guard it far more reliably than a jab.
          this.guardT = Math.max(this.guardT, 0.45);
          this.crouch = false;
        }
      }
    }

    // ── combos: muscle memory, no reaction delay; decided once per connecting hit ──
    if (chainStart) {
      this.chainBtn = null;
      this.chainDown = false;
      // A juggled opponent drifts out of reach; extending the string there only whiffs.
      if (!v.oppAir && this.rand() < P.combo) {
        const atk = v.selfAtk ?? 'punch';
        // Only fast specials combo, and only off a grounded hit (a launched foe floats over them).
        const kind = v.specialKind ?? 'beam';
        const comboable = kind !== 'teleport' && atk !== 'uppercut';
        if (v.meter >= 50 && comboable && this.rand() < P.special * 0.5) this.chainBtn = 'c';
        else if (atk === 'punch') this.chainBtn = this.rand() < 0.6 ? 'b' : 'a';
        else if (atk === 'kick') {
          this.chainBtn = 'a';
          this.chainDown = this.rand() < 0.3 + P.combo * 0.6;
        }
      }
    }
    if (v.canChain && this.chainBtn) {
      it.pressed[this.chainBtn] = true;
      if (this.chainDown) it.held.down = true;
    }
    if (!v.canChain) this.chainBtn = null;

    // ── anti-air: wait under the jump, then rise to meet it ──
    if (this.antiAirArmed && v.oppAir && v.selfFree && !v.selfBlocking) {
      const h = v.oppHeight ?? 100;
      const falling = v.oppFalling ?? true;
      if (dist < 92 && falling && h < 190) {
        it.held.down = true;
        it.pressed.a = true;
        this.antiAirArmed = false;
      } else if (dist < reach && h < 80 && falling) {
        it.pressed.a = true;
        this.antiAirArmed = false;
      }
    }

    // ── neutral game ──
    this.timer -= dt;
    this.planT -= dt;
    const busy = this.guardT > 0 || this.plan === 'whiff' || this.plan === 'poke';
    if (this.timer <= 0 && v.selfFree && !v.selfBlocking && !busy && !it.pressed.a) {
      this.timer = P.react * (0.7 + this.rand() * 0.8) + 0.05;
      this.neutral(v, dist, reach, oppReach, closing, aggr, guardChance, range, it);
    }
    if (this.plan === 'poke' && this.planT <= 0) this.plan = 'hold';
    if (this.plan === 'whiff' && this.planT <= 0) this.plan = 'hold';

    // ── movement ──
    if (this.guardT > 0) {
      this.guardT -= dt;
      it.held[away] = true;
      if (this.crouch) it.held.down = true;
    } else {
      switch (this.plan) {
        case 'approach':
          // Walking in: a skilled CPU swings the moment the opponent enters its reach, so it
          // doesn't stroll into their poke.
          if (this.pokeIn && dist < reach - 2 && v.selfFree && !v.oppHurt) {
            it.pressed[v.oppCrouch ? 'b' : 'a'] = true;
            this.pokeIn = false;
            this.plan = 'hold';
          } else if (dist > range - 6) it.held[toward] = true;
          break;
        case 'retreat':
          if (dist < range + 16) it.held[away] = true;
          break;
        case 'dance':
          if (this.planT <= 0) {
            this.danceDir = this.danceDir === 1 ? -1 : 1;
            this.planT = 0.12 + this.rand() * 0.22;
          }
          // Step in and out at the edge of their reach; a sloppy CPU wanders inside it.
          if (
            dist > range + 60 ||
            (this.danceDir === 1 && dist > oppReach + 10 - (1 - P.spacing) * 40)
          )
            it.held[toward] = true;
          else if (this.danceDir === -1) it.held[away] = true;
          break;
        case 'guard':
          it.held[away] = true;
          if (this.crouch) it.held.down = true;
          if (this.planT <= 0) this.plan = 'hold';
          break;
        case 'poke':
          if (dist < reach - 2) {
            it.pressed[v.oppCrouch ? 'b' : 'a'] = true;
            this.plan = 'hold';
          }
          break;
        case 'whiff':
          if (dist < reach - 2) {
            it.pressed.a = true;
            if (dist < UPPER_REACH && this.rand() < 0.5) it.held.down = true; // uppercut
            this.plan = 'hold';
          } else if (phase === 'recovery' || phase === 'none' || dist > oppReach + 12)
            it.held[toward] = true; // never walk into a fist that is still out
          break;
        default:
          break;
      }
    }

    this.last = {
      seq,
      blocked: !!v.oppBlocked,
      air: v.oppAir,
      shot: v.projectileIncoming,
      chain: v.canChain,
      dist,
      phase,
      selfAtk: !!v.selfAtk,
      selfBlocked: !!v.selfBlocked,
    };
    return it;
  }

  /** Chance to swing unprovoked: less into a wall of blocks, more once their guard is cracking. */
  private pressure(v: AiView, aggr: number) {
    const wall = this.walled() * this.p.spacing * 0.8;
    const crack = (v.oppGuard ?? 0) > 0.5 ? 0.35 * this.p.spacing : 0;
    return Math.min(0.95, aggr * (1 - wall) + crack);
  }

  private approach(pokeIn: boolean) {
    this.plan = 'approach';
    this.pokeIn = pokeIn;
  }

  private specialFits(v: AiView, dist: number) {
    if (v.meter < 50) return false;
    switch (v.specialKind ?? 'beam') {
      case 'beam':
        return dist > 170 || (v.oppFreeIn ?? 0) > 0.35;
      case 'projectile':
        return dist > 260;
      case 'shockwave':
        return dist < 200 && !v.oppAir && (v.oppFreeIn ?? 0) > 0.3;
      case 'dash':
        return dist > 160 && dist < 440;
      case 'teleport':
        return dist > 180 && (v.oppFreeIn ?? 0) > 0.2;
    }
  }

  private neutral(
    v: AiView,
    dist: number,
    reach: number,
    oppReach: number,
    closing: boolean,
    aggr: number,
    guardChance: number,
    range: number,
    it: Intent,
  ) {
    const P = this.p;
    if (this.rand() < P.mistake) {
      // Plain mistakes: swing at air, or stroll straight in.
      if (this.rand() < 0.5) it.pressed[this.rand() < 0.5 ? 'a' : 'b'] = true;
      else this.approach(false);
      return;
    }
    // Spend meter when the special suits the range; a skilled CPU waits for an opening.
    const opening = v.oppHurt || (v.oppFreeIn ?? 0) > 0.3;
    if (this.specialFits(v, dist) && this.rand() < P.special * (opening ? 0.9 : 0.3)) {
      it.pressed.c = true;
      return;
    }
    if (this.walled() > 0.45 && dist < reach - 2 && dist > reach - 24 && this.rand() < P.spacing) {
      // A turtle: tick at the tip of our reach (pushback keeps it safe) until the guard cracks.
      it.pressed[this.rand() < 0.6 ? 'a' : 'b'] = true;
      this.plan = 'hold';
      return;
    }
    if (dist < Math.max(reach, oppReach) + 4) {
      // Inside reach: guard, attack, or step back out.
      if (v.oppHurt) {
        it.pressed.a = true;
        return;
      }
      const g = this.rand();
      if (g < guardChance) {
        this.plan = 'guard';
        // Habit read: a punch-heavy opponent gets crouched under.
        this.crouch = this.rand() < 0.2 + Math.max(0, this.punchy() - 0.45) * 1.6 * P.spacing;
        this.planT = 0.2 + this.rand() * 0.3;
      } else if (g < guardChance + this.pressure(v, aggr) * (1 - guardChance) && dist < reach) {
        const k = this.rand();
        if (dist < UPPER_REACH && k < 0.3) {
          it.held.down = true;
          it.pressed.a = true;
        } else if (v.oppCrouch || (k > 0.72 && dist < reach - 8)) it.pressed.b = true;
        else it.pressed.a = true;
        this.plan = 'hold';
      } else if (this.walled() > 0.4 && this.rand() < P.spacing) {
        // They just block: crouch-guard in their face (holds ground) and make them swing first.
        this.plan = 'guard';
        this.crouch = true;
        this.planT = 0.3 + this.rand() * 0.3;
      } else this.plan = this.rand() < 0.35 + P.spacing * 0.5 ? 'retreat' : 'dance';
      return;
    }
    if (dist < oppReach + 70) {
      // Footsie zone: wait for them to step in, then poke first.
      if (closing && this.rand() < P.spacing) {
        this.plan = 'poke';
        this.planT = 0.3;
      } else if (range < oppReach || (this.rand() < aggr * 0.6 && this.style !== 'turtle'))
        this.approach(this.rand() < P.spacing * (1 - this.walled()));
      else this.plan = this.rand() < P.spacing ? 'dance' : 'hold';
      return;
    }
    // Far: close in to the style's range, sometimes from the air.
    if (this.rand() < 0.55 + aggr * 0.4 || dist > range + 160) {
      this.approach(this.rand() < P.spacing * (1 - this.walled()));
      if (dist < 330 && this.rand() < aggr * 0.12) {
        it.pressed.up = true;
        it.held[v.dx > 0 ? 'right' : 'left'] = true;
      }
    } else this.plan = this.rand() < 0.5 ? 'hold' : 'dance';
  }
}
