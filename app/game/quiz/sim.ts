/**
 * Quiz Duel — answer comic trivia; every right answer is a hit on the canvas above, and HP decides
 * the match (a K.O. ends it early). The questions are about published characters, so they appear
 * as TEXT ONLY; the canvas only ever draws the two ComicMutant originals.
 */
import type { Fighter } from '~/lib/schema';
import type { Input } from '../engine/input';
import { rng } from '../engine/math';
import { H, W } from '../shell/const';
import { arenaLayer, banner, bar, HEAD_FONT, inkText, onFill, plate } from '../shell/hud';
import { DISPLAY_FONT } from '../sprite/backdrop';
import { POSE_LOOP, type PoseId } from '../sprite/poses';
import { drawFighter, jointsAt } from '../sprite/rig';
import type { QuizQ, Sim, SimEnv } from '../types';
import {
  COMBO_AT,
  COMBO_MULT,
  COUNTER_DMG,
  comboMult,
  cpuAnswer,
  cpuLock,
  cpuLockAt,
  FAST_WINDOW,
  FIRE_AT,
  MAX_HP,
  QUESTION_TIME,
  quizDamage,
  quizWinner,
  READ_TIME,
} from './logic';

const GROUND = 470;
const SCALE = 1.7;
const HOME: [number, number] = [W * 0.26, W * 0.74];
const RIGHT = '#3ddc84';
const WRONG = '#ff3b30';
const FIRE = '#ff9f1a';

export interface Answer {
  choice: number;
  /** Seconds after the question appeared. */
  time: number;
}

/** What happened to one player on the question just revealed. */
export interface Outcome {
  ok: boolean;
  dmg: number;
  /** Locked in before the other player. */
  first: boolean;
  timedOut: boolean;
  /** Right answers in a row after this question. */
  streak: number;
  /** Counter-hit damage this player dealt because the other answered wrong. */
  counter: number;
}

/** One strike of the current reveal, mirrored in the panel's hit strip. */
export interface Strike {
  who: 0 | 1;
  dmg: number;
  word: string;
  counter: boolean;
  /** Combo multiplier applied (1 or COMBO_MULT). */
  mult: number;
  /** Right answers in a row behind this strike (0 for a counter). */
  streak: number;
  state: 'pending' | 'landed' | 'blocked';
  /** Defender's HP once it landed. */
  hpAfter: number | null;
}

export interface PlayerStats {
  right: number;
  /** Fastest right answer, seconds. */
  fastest: number | null;
  /** Sum of times of right answers (for the average). */
  rightTime: number;
  bestStreak: number;
  dealt: number;
}

export interface QuizSnapshot {
  i: number;
  total: number;
  phase: 'ask' | 'reveal' | 'over';
  q: QuizQ | null;
  timeLeft: number;
  answers: [Answer | null, Answer | null];
  /** Right answers so far. */
  score: [number, number];
  hp: [number, number];
  streak: [number, number];
  cpu: boolean;
  outcome: [Outcome, Outcome] | null;
  /** Hits still landing — Next is held until they do. */
  busy: boolean;
  /** Seconds until the next question appears on its own (reveal only). */
  nextIn: number | null;
  /** Who was knocked out, if anyone. */
  ko: 0 | 1 | null;
  /** Questions actually asked (a K.O. can end the match early). */
  asked: number;
  stats: [PlayerStats, PlayerStats];
  winner: 'p1' | 'p2' | 'draw' | null;
  /** Strikes of the current reveal, in landing order. */
  strikes: Strike[];
}

interface Act {
  pose: PoseId;
  t0: number;
  dur: number;
  x0: number;
  x1: number;
  /** pose time range mapped across the act */
  u0: number;
  u1: number;
}

interface Hit {
  at: number;
  who: 0 | 1;
  dmg: number;
  done: boolean;
  word: string;
  /** Index into snap.strikes. */
  idx: number;
  streak: number;
}

const freshStats = (): PlayerStats => ({
  right: 0,
  fastest: null,
  rightTime: 0,
  bestStreak: 0,
  dealt: 0,
});

export class QuizSim implements Sim {
  private env: SimEnv;
  private qs: QuizQ[];
  private rand: () => number;
  private listeners = new Set<() => void>();
  snap: QuizSnapshot;
  private cpuPlan: { choice: number; delay: number } | null = null;
  private clock = 0;
  private acts: [Act[], Act[]] = [[], []];
  private x: [number, number] = [HOME[0], HOME[1]];
  private hits: Hit[] = [];
  /** HP shown by the trailing red "ghost" part of the bars. */
  private ghost: [number, number] = [MAX_HP, MAX_HP];
  private bannerS: { text: string; sub: string; t: number; color: string } | null = null;
  private lastTick = -1;
  private nextAt: number | null = null;
  private finishAt: number | null = null;
  private strikeList: Strike[] = [];
  private emberT = 0;
  /** False until the first update: the idle canvas shows a title card. */
  private started = false;

  constructor(env: SimEnv, questions: QuizQ[], seed = Date.now()) {
    this.env = env;
    this.qs = questions;
    this.rand = rng(seed);
    this.snap = {
      i: 0,
      total: questions.length,
      phase: questions.length ? 'ask' : 'over',
      q: questions[0] ?? null,
      timeLeft: QUESTION_TIME,
      answers: [null, null],
      score: [0, 0],
      hp: [MAX_HP, MAX_HP],
      streak: [0, 0],
      cpu: env.vs === 'cpu',
      outcome: null,
      busy: false,
      nextIn: null,
      ko: null,
      asked: questions.length ? 1 : 0,
      stats: [freshStats(), freshStats()],
      winner: null,
      strikes: [],
    };
    this.planCpu();
    this.bannerS = {
      text: 'QUIZ DUEL!',
      sub: `${questions.length} QUESTIONS · RIGHT ANSWERS HIT`,
      t: 0.05,
      color: env.p1.theme.palette.c3,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private emit(patch: Partial<QuizSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  private planCpu() {
    const q = this.snap.q;
    this.cpuPlan =
      q && this.env.vs === 'cpu'
        ? cpuAnswer(this.env.difficulty, q.answer, q.options.length, this.rand)
        : null;
  }

  /** Seconds since the current question appeared. */
  get elapsed() {
    return QUESTION_TIME - this.snap.timeLeft;
  }

  /** When the CPU will lock in on this question (seconds after it appeared), or null. */
  cpuLockTime(): number | null {
    if (!this.cpuPlan || this.snap.answers[1]) return null;
    return cpuLockAt(this.cpuPlan.delay, this.snap.answers[0]?.time ?? null);
  }

  /** Lock in an answer for player 0 or 1. Ignored after lock-in or outside the ask phase. */
  answer(who: 0 | 1, choice: number) {
    if (this.snap.phase !== 'ask' || this.snap.answers[who]) return;
    if (who === 1 && this.env.vs === 'cpu') return;
    const answers: [Answer | null, Answer | null] = [...this.snap.answers];
    answers[who] = { choice, time: this.elapsed };
    this.env.sfx.play('blip');
    this.emit({ answers });
    if (answers[0] && answers[1]) this.reveal();
  }

  /** Move on to the next question (or the result). Held while hits land or after a K.O. */
  next() {
    if (this.snap.phase !== 'reveal' || this.snap.busy || this.snap.ko !== null) return;
    const i = this.snap.i + 1;
    if (i >= this.qs.length) return this.finish();
    this.acts = [[], []];
    this.x = [HOME[0], HOME[1]];
    this.nextAt = null;
    this.lastTick = -1;
    this.emit({
      i,
      q: this.qs[i] ?? null,
      phase: 'ask',
      timeLeft: QUESTION_TIME,
      answers: [null, null],
      outcome: null,
      nextIn: null,
      asked: i + 1,
      strikes: [],
    });
    this.planCpu();
    this.env.announce(`Question ${i + 1} of ${this.qs.length}.`);
  }

  private reveal() {
    const q = this.snap.q;
    if (!q) return;
    const ans = this.snap.answers;
    const ok: [boolean, boolean] = [ans[0]?.choice === q.answer, ans[1]?.choice === q.answer];
    const t0 = ans[0]?.time ?? Number.POSITIVE_INFINITY;
    const t1 = ans[1]?.time ?? Number.POSITIVE_INFINITY;
    const firstWho: 0 | 1 | null = !ans[0] && !ans[1] ? null : t0 <= t1 ? 0 : 1;
    const streak: [number, number] = [
      ok[0] ? this.snap.streak[0] + 1 : 0,
      ok[1] ? this.snap.streak[1] + 1 : 0,
    ];
    const wrongPick = (w: 0 | 1) => !!ans[w] && !ok[w];
    const outcome = ([0, 1] as const).map(
      (w): Outcome => ({
        ok: ok[w],
        dmg: ok[w] ? quizDamage(ans[w]?.time ?? QUESTION_TIME, streak[w]) : 0,
        first: firstWho === w,
        timedOut: !ans[w],
        streak: streak[w],
        // A wrong pick hands a counter to an opponent who answered RIGHT (never to an idle one).
        counter: ok[w] && wrongPick(w ? 0 : 1) ? COUNTER_DMG : 0,
      }),
    ) as [Outcome, Outcome];
    const stats = ([0, 1] as const).map((w): PlayerStats => {
      const s = this.snap.stats[w];
      const t = ans[w]?.time ?? QUESTION_TIME;
      return ok[w]
        ? {
            right: s.right + 1,
            fastest: s.fastest === null ? t : Math.min(s.fastest, t),
            rightTime: s.rightTime + t,
            bestStreak: Math.max(s.bestStreak, streak[w]),
            dealt: s.dealt,
          }
        : s;
    }) as [PlayerStats, PlayerStats];
    const score: [number, number] = [stats[0].right, stats[1].right];
    const before = this.snap.streak;
    this.emit({ phase: 'reveal', score, streak, outcome, stats, busy: true, nextIn: null });
    this.env.sfx.play(ok[0] ? 'correct' : 'wrong');

    // Misses stagger at once; right answers strike in the order they were locked in.
    for (const w of [0, 1] as const) if (!ok[w]) this.miss(w, !ans[w], before[w]);
    const order = ([0, 1] as const)
      .filter((w) => ok[w])
      .sort((x, y) => (ans[x]?.time ?? 99) - (ans[y]?.time ?? 99));
    this.strikeList = [];
    let t = this.clock + 0.35;
    for (const who of order) t = this.attack(who, t, outcome[who].dmg, outcome[who].streak);
    for (const who of [0, 1] as const)
      if (outcome[who].counter) t = this.attack(who, t + 0.15, outcome[who].counter, 0, true);
    this.emit({ strikes: [...this.strikeList] });
    if (!order.length && !outcome[0].counter && !outcome[1].counter) this.settle();

    const names = [this.env.p1.alias, this.env.p2.alias];
    const said = ([0, 1] as const)
      .map(
        (w) =>
          `${names[w]} ${ok[w] ? `right, ${outcome[w].dmg} damage` : ans[w] ? 'wrong' : 'out of time'}${outcome[w].counter ? `, counters for ${outcome[w].counter}` : ''}`,
      )
      .join('; ');
    this.env.announce(`Answer: ${q.options[q.answer]}. ${said}. ${q.why}`);
  }

  /** Wrong or no answer: "MISS!" and a stagger; the miss itself deals no damage. */
  private miss(who: 0 | 1, timedOut: boolean, lostStreak = 0) {
    const dir = who ? -1 : 1;
    const back = HOME[who] - dir * 46;
    const t0 = this.clock + 0.05;
    this.acts[who].push(
      { pose: 'hurt', t0, dur: 0.5, x0: HOME[who], x1: back, u0: 0, u1: 1 },
      { pose: 'walk', t0: t0 + 0.5, dur: 0.4, x0: back, x1: HOME[who], u0: 0, u1: 1 },
    );
    const text = timedOut ? 'TOO SLOW!' : 'MISS!';
    this.env.fx.pop(HOME[who], GROUND - 310, text, '#ffffff', timedOut ? 34 : 44);
    if (lostStreak >= COMBO_AT)
      this.env.fx.pop(HOME[who], GROUND - 365, 'COMBO BROKEN', '#9aa0a6', 26);
    this.env.fx.burst(HOME[who], GROUND - 200, 8, ['#9aa0a6', '#ffffff'], {
      speed: 160,
      size: 4,
      g: 200,
    });
  }

  private attack(who: 0 | 1, t0: number, dmg: number, streak: number, counter = false): number {
    const other = who ? 0 : 1;
    const dir = who ? -1 : 1;
    const target = HOME[other] - dir * 110;
    const f = who ? this.env.p2 : this.env.p1;
    const pick: PoseId = counter
      ? 'punch'
      : streak >= COMBO_AT
        ? 'special'
        : ((['punch', 'kick', 'uppercut'] as const)[Math.floor(this.rand() * 3)] ?? 'punch');
    const strike = pick === 'special' ? 1.1 : 0.55;
    const contactU =
      pick === 'punch'
        ? 0.32
        : pick === 'kick'
          ? 0.42
          : pick === 'uppercut'
            ? 0.42
            : f.special.kind === 'beam'
              ? 0.45
              : 0.5;
    const ranged =
      pick === 'special' && (f.special.kind === 'beam' || f.special.kind === 'projectile');
    const x1 = ranged ? HOME[who] : target;
    this.acts[who].push(
      { pose: 'dash', t0, dur: 0.28, x0: HOME[who], x1, u0: 0, u1: 1 },
      { pose: pick, t0: t0 + 0.28, dur: strike, x0: x1, x1, u0: 0, u1: 1 },
      { pose: 'walk', t0: t0 + 0.28 + strike, dur: 0.35, x0: x1, x1: HOME[who], u0: 0, u1: 1 },
    );
    const word = counter
      ? 'COUNTER!'
      : pick === 'special'
        ? f.special.name.toUpperCase()
        : pick === 'punch'
          ? 'POW!'
          : pick === 'kick'
            ? 'WHAM!'
            : 'KRAK!';
    // Streak build-up: ×2 from COMBO_AT, bigger lettering and a rising ping each step; ON FIRE at FIRE_AT.
    if (streak >= COMBO_AT) {
      const size = 30 + 5 * (Math.min(streak, 8) - COMBO_AT);
      this.env.fx.pop(
        HOME[who],
        GROUND - 330,
        `×${comboMult(streak)} COMBO · ${streak}`,
        f.theme.palette.c3,
        size,
      );
      if (streak >= FIRE_AT) {
        this.env.fx.pop(HOME[who], GROUND - 385, 'ON FIRE!', FIRE, 40 + 2 * (streak - FIRE_AT));
        this.env.fx.burst(HOME[who], GROUND - 90, 26, [FIRE, '#ffd400', WRONG], {
          speed: 260,
          size: 6,
          g: -320,
        });
      }
    }
    if (streak >= 2) this.env.sfx.play('shuttle', Math.min(1, 0.2 * (streak - 1)));
    const idx = this.strikeList.length;
    this.strikeList.push({
      who,
      dmg,
      word,
      counter,
      mult: counter ? 1 : comboMult(streak),
      streak: counter ? 0 : streak,
      state: 'pending',
      hpAfter: null,
    });
    this.hits.push({
      at: t0 + 0.28 + strike * contactU,
      who,
      dmg,
      done: false,
      word,
      idx,
      streak: counter ? 0 : streak,
    });
    if (pick === 'special') this.env.sfx.play('special');
    return t0 + 0.28 + strike + 0.3;
  }

  /** All hits of this question have landed: start the read-then-advance countdown. */
  private settle() {
    if (this.snap.ko !== null) return;
    const anyHit = this.snap.outcome?.some((o) => o.ok);
    this.nextAt = this.clock + (anyHit ? READ_TIME : READ_TIME - 1);
    this.emit({ busy: false, nextIn: this.nextAt - this.clock });
  }

  private landHit(h: Hit) {
    h.done = true;
    const other = h.who ? 0 : 1;
    const hp: [number, number] = [...this.snap.hp];
    hp[other] = Math.max(0, hp[other] - h.dmg);
    const stats: [PlayerStats, PlayerStats] = [
      { ...this.snap.stats[0] },
      { ...this.snap.stats[1] },
    ];
    stats[h.who].dealt += h.dmg;
    const st = this.strikeList[h.idx];
    if (st) {
      st.state = 'landed';
      st.hpAfter = hp[other];
    }
    this.emit({ hp, stats, strikes: [...this.strikeList] });
    const fx = this.env.fx;
    const f = h.who ? this.env.p2 : this.env.p1;
    const x = this.x[other];
    // Escalates with the streak: longer hit-stop, harder shake, stronger flash, more sparks.
    const lvl = h.streak >= FIRE_AT ? 2 : h.streak >= COMBO_AT ? 1 : 0;
    const flashCol = lvl === 2 ? FIRE : f.theme.palette.c3;
    fx.stop(6 + lvl * 3);
    fx.shake(0.35 + lvl * 0.15);
    fx.flash(0.2 + lvl * 0.12, flashCol);
    fx.burst(x, GROUND - 120, 22 + lvl * 14, [flashCol, f.theme.palette.c1, '#ffffff'], {
      speed: 480 + lvl * 120,
      size: 5 + lvl,
      g: 300,
    });
    fx.ring(x, GROUND - 120, flashCol, 70 + lvl * 30);
    if (lvl) fx.ring(x, GROUND - 120, '#ffffff', 40 + lvl * 20);
    fx.pop(x, GROUND - 300, h.word, flashCol, (h.word.length > 6 ? 30 : 44) + lvl * 6);
    fx.pop(x + (h.who ? -70 : 70), GROUND - 170, `-${h.dmg}`, WRONG, 40 + lvl * 10);
    this.env.sfx.play('hit', 0.8 + lvl * 0.1);
    if (hp[other] <= 0 && this.snap.ko === null) {
      // K.O.: the fallen fighter's queued strike never lands.
      for (const o of this.hits)
        if (o.who === other && !o.done) {
          o.done = true;
          const bs = this.strikeList[o.idx];
          if (bs) bs.state = 'blocked';
        }
      this.acts[other] = [];
      this.finishAt = this.clock + 1.8;
      this.nextAt = null;
      this.bannerS = { text: 'K.O.!', sub: '', t: 0, color: f.theme.palette.c3 };
      this.env.sfx.play('cheer');
      this.emit({ ko: other, busy: false, nextIn: null, strikes: [...this.strikeList] });
    }
  }

  private finish() {
    if (this.snap.phase === 'over') return;
    const s = this.snap;
    const w = quizWinner(s.hp);
    this.emit({ phase: 'over', winner: w, nextIn: null, busy: false });
    const wf = w === 'p1' ? this.env.p1 : w === 'p2' ? this.env.p2 : null;
    if (s.ko === null) this.env.sfx.play('cheer');
    this.bannerS = {
      text: wf ? `${wf.alias} WINS` : 'DRAW!',
      sub: s.ko !== null ? `K.O. ON QUESTION ${s.asked}` : `HP ${s.hp[0]} – ${s.hp[1]}`,
      t: 0,
      color: wf?.theme.palette.c3 ?? '#ffffff',
    };
    // Kept to one line: the result overlay is short; the panel under the canvas has full stats.
    const line = (who: 0 | 1) =>
      `${who ? this.env.p2.alias : this.env.p1.alias} ${s.stats[who].right}/${s.asked} right`;
    const how =
      s.ko !== null ? `K.O. on question ${s.asked}!` : `HP left after ${s.asked} questions.`;
    this.env.end({
      winner: w,
      score: [s.hp[0], s.hp[1]],
      summary: `${how} ${line(0)}, ${line(1)}. Full stats below.`,
    });
  }

  update(dt: number, _input: Input) {
    this.clock += dt;
    this.started = true;
    if (this.bannerS) {
      this.bannerS.t += dt / 1.4;
      if (this.bannerS.t >= 1) this.bannerS = null;
    }
    for (const w of [0, 1] as const) {
      const hp = this.snap.hp[w];
      this.ghost[w] = this.ghost[w] > hp ? Math.max(hp, this.ghost[w] - dt * 40) : hp;
    }
    if (this.snap.phase === 'ask') {
      const left = Math.max(0, this.snap.timeLeft - dt);
      this.snap.timeLeft = left;
      const lockAt = this.cpuLockTime();
      if (this.cpuPlan && lockAt !== null && this.elapsed >= lockAt) {
        const q = this.snap.q;
        const lock = cpuLock(
          this.cpuPlan,
          this.snap.answers[0]?.time ?? null,
          q?.answer ?? 0,
          q?.options.length ?? 4,
          this.rand,
        );
        const answers: [Answer | null, Answer | null] = [
          this.snap.answers[0],
          { choice: lock.choice, time: lock.time },
        ];
        this.emit({ answers });
        if (answers[0]) this.reveal();
      }
      const tick = Math.ceil(left * 10);
      if (this.snap.phase === 'ask' && tick !== this.lastTick) {
        const sec = Math.ceil(left);
        if (tick % 10 === 0 && sec <= 5 && sec > 0 && !this.snap.answers[0])
          this.env.sfx.play('blip');
        this.lastTick = tick;
        this.emit({});
      }
      if (left <= 0 && this.snap.phase === 'ask') this.reveal();
    }
    for (const h of this.hits) if (!h.done && this.clock >= h.at) this.landHit(h);
    // ON FIRE aura: a few rising embers around a fighter on a hot streak.
    this.emberT -= dt;
    if (this.emberT <= 0 && this.snap.phase !== 'over') {
      this.emberT = 0.09;
      for (const w of [0, 1] as const)
        if (this.snap.streak[w] >= FIRE_AT)
          this.env.fx.burst(this.x[w], GROUND - 80, 2, [FIRE, '#ffd400'], {
            speed: 90,
            size: 4,
            g: -240,
          });
    }
    this.hits = this.hits.filter((h) => !h.done || this.clock - h.at < 1);
    if (this.snap.phase === 'reveal') {
      if (this.snap.busy && this.hits.every((h) => h.done)) this.settle();
      if (this.finishAt !== null && this.clock >= this.finishAt) {
        this.finishAt = null;
        this.finish();
      } else if (this.nextAt !== null) {
        const left = Math.max(0, this.nextAt - this.clock);
        if (left <= 0) this.next();
        else if (Math.ceil(left * 10) !== Math.ceil((this.snap.nextIn ?? 0) * 10))
          this.emit({ nextIn: left });
      }
    }
  }

  private poseOf(who: 0 | 1): { pose: PoseId; t: number; x: number } {
    for (const a of this.acts[who]) {
      if (this.clock >= a.t0 && this.clock < a.t0 + a.dur) {
        const k = (this.clock - a.t0) / a.dur;
        const x = a.x0 + (a.x1 - a.x0) * k;
        this.x[who] = x;
        return { pose: a.pose, t: (a.u0 + (a.u1 - a.u0) * k) * (POSE_LOOP[a.pose] ?? 1), x };
      }
    }
    this.x[who] = HOME[who];
    const s = this.snap;
    if (s.ko === who) return { pose: 'ko', t: POSE_LOOP.ko * 0.95, x: HOME[who] };
    const other = who ? 0 : 1;
    const recentHit = this.hits.find((h) => h.who === other && h.done && this.clock - h.at < 0.6);
    if (recentHit) return { pose: 'hurt', t: this.clock - recentHit.at, x: HOME[who] };
    if (s.ko !== null || s.phase === 'over') {
      const w = s.winner ?? quizWinner(s.hp);
      const won = (w === 'p1' && who === 0) || (w === 'p2' && who === 1);
      if (won) return { pose: 'victory', t: this.clock, x: HOME[who] };
      if (w !== 'draw') return { pose: 'hurt', t: 0.45, x: HOME[who] };
    }
    if (s.phase === 'ask' && s.answers[who]) return { pose: 'taunt', t: this.clock, x: HOME[who] };
    if (s.phase === 'ask' && s.timeLeft < 5) return { pose: 'charge', t: this.clock, x: HOME[who] };
    return { pose: 'idle', t: this.clock + who * 0.5, x: HOME[who] };
  }

  /** Tag over a fighter's head: lock-in state while asking, result after the reveal. */
  private tag(ctx: CanvasRenderingContext2D, who: 0 | 1, x: number, y: number, f: Fighter) {
    const s = this.snap;
    let text = '';
    let fill = '#ffffff';
    if (s.phase === 'ask') {
      const a = s.answers[who];
      const other = s.answers[who ? 0 : 1];
      if (a) {
        text = `LOCKED IN${!other || a.time <= other.time ? ' · 1ST' : ''}`;
        fill = f.theme.palette.c3;
      } else text = s.cpu && who === 1 ? 'THINKING…' : who ? 'PICK 7–0' : 'PICK 1–4';
    } else if (s.phase === 'reveal' && s.outcome && s.ko === null) {
      const o = s.outcome[who];
      const t = s.answers[who]?.time;
      text = o.ok
        ? `RIGHT ${t?.toFixed(1)}s${o.first ? ' · 1ST' : ''}`
        : o.timedOut
          ? 'NO ANSWER'
          : 'WRONG';
      fill = o.ok ? RIGHT : WRONG;
    }
    if (!text) return;
    ctx.font = `20px ${HEAD_FONT}`;
    const w = ctx.measureText(text).width + 22;
    plate(ctx, x - w / 2, y - 16, w, 32, fill);
    ctx.fillStyle = onFill(fill);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  render(ctx: CanvasRenderingContext2D) {
    const fx = this.env.fx;
    const p1: Fighter = this.env.p1;
    const p2: Fighter = this.env.p2;
    const s = this.snap;
    const bg = arenaLayer(p1, p2, W, H, GROUND, 'city');
    if (!this.started) return this.titleCard(ctx, bg);
    ctx.save();
    fx.applyCamera(ctx, W, H);
    if (bg) ctx.drawImage(bg, 0, 0);
    const a = this.poseOf(0);
    const b = this.poseOf(1);
    const p2Front = this.acts[1].some((x) => this.clock >= x.t0 && this.clock < x.t0 + x.dur);
    const order: [0 | 1, typeof a][] = p2Front
      ? [
          [0, a],
          [1, b],
        ]
      : [
          [1, b],
          [0, a],
        ];
    for (const [who, st] of order) {
      const f = who ? p2 : p1;
      const opts = { x: st.x, y: GROUND, scale: SCALE, facing: (who ? -1 : 1) as 1 | -1 };
      drawFighter(ctx, f, st.pose, st.t, opts);
      const j = jointsAt(f, st.pose, st.t, opts);
      this.tag(ctx, who, HOME[who], Math.max(150, j.head.y - 64), f);
    }
    fx.drawParticles(ctx);
    fx.drawPops(ctx, DISPLAY_FONT);
    ctx.restore();
    fx.drawFlash(ctx, W, H);

    // HUD: HP bars with numbers, names + right-answer count and combo, question counter, timer.
    bar(ctx, 40, 22, 300, 26, s.hp[0] / MAX_HP, this.ghost[0] / MAX_HP, p1.theme.palette.c1, -1);
    bar(
      ctx,
      W - 340,
      22,
      300,
      26,
      s.hp[1] / MAX_HP,
      this.ghost[1] / MAX_HP,
      p2.theme.palette.c1,
      1,
    );
    inkText(ctx, `${Math.ceil(s.hp[0])}`, 364, 35, 24, '#ffffff', 'left', HEAD_FONT);
    inkText(ctx, `${Math.ceil(s.hp[1])}`, W - 364, 35, 24, '#ffffff', 'right', HEAD_FONT);
    const sub = (who: 0 | 1) => {
      const st = s.streak[who];
      const tag =
        st >= FIRE_AT
          ? ` · ON FIRE ×${comboMult(st)} (${st})`
          : st >= COMBO_AT
            ? ` · ×${comboMult(st)} COMBO (${st})`
            : st === COMBO_AT - 1
              ? ` · ${st} IN A ROW — NEXT ×${COMBO_MULT}`
              : '';
      return `${s.score[who]} RIGHT${tag}`;
    };
    const subCol = (who: 0 | 1, f: Fighter) =>
      s.streak[who] >= FIRE_AT ? FIRE : s.streak[who] >= 2 ? f.theme.palette.c3 : '#ffffff';
    inkText(ctx, p1.alias, 48, 68, 24, '#ffffff', 'left');
    inkText(ctx, sub(0), 48, 94, 16, subCol(0, p1), 'left', HEAD_FONT);
    inkText(ctx, p2.alias, W - 48, 68, 24, '#ffffff', 'right');
    inkText(ctx, sub(1), W - 48, 94, 16, subCol(1, p2), 'right', HEAD_FONT);
    plate(ctx, W / 2 - 64, 12, 128, 40, '#0d0b10');
    inkText(
      ctx,
      `Q ${Math.min(s.i + 1, s.total)}/${s.total}`,
      W / 2,
      33,
      26,
      '#ffffff',
      'center',
      HEAD_FONT,
    );
    if (s.phase === 'ask') {
      const k = s.timeLeft / QUESTION_TIME;
      const fast = this.elapsed <= FAST_WINDOW;
      const col = k < 0.33 ? WRONG : fast ? RIGHT : p1.theme.palette.c3;
      ctx.fillStyle = '#0d0b10';
      ctx.fillRect(W / 2 - 150, 62, 300, 18);
      ctx.fillStyle = col;
      ctx.fillRect(W / 2 - 147, 65, 294 * k, 12);
      inkText(
        ctx,
        fast ? `${Math.ceil(s.timeLeft)} · FAST BONUS` : String(Math.ceil(s.timeLeft)),
        W / 2,
        100,
        fast ? 22 : 30,
        k < 0.33 ? '#ff6b5e' : fast ? RIGHT : '#ffffff',
        'center',
        HEAD_FONT,
      );
    }
    if (this.bannerS)
      banner(ctx, W, H, this.bannerS.text, this.bannerS.sub, this.bannerS.t, this.bannerS.color);
  }

  /** Idle canvas before Start: both fighters squared up under the title. */
  private titleCard(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement | null) {
    const { p1, p2 } = this.env;
    if (bg) ctx.drawImage(bg, 0, 0);
    else {
      ctx.fillStyle = '#12101a';
      ctx.fillRect(0, 0, W, H);
    }
    drawFighter(ctx, p1, 'taunt', 0.5, { x: HOME[0], y: GROUND, scale: SCALE, facing: 1 });
    drawFighter(ctx, p2, 'charge', 0.4, { x: HOME[1], y: GROUND, scale: SCALE, facing: -1 });
    ctx.fillStyle = 'rgba(13, 11, 16, 0.6)';
    ctx.fillRect(0, 36, W, 170);
    inkText(ctx, 'QUIZ DUEL', W / 2, 100, 84, p1.theme.palette.c3);
    inkText(ctx, `${p1.alias}  VS  ${p2.alias}`, W / 2, 160, 28, '#ffffff', 'center', HEAD_FONT);
    inkText(
      ctx,
      `${this.qs.length} QUESTIONS · FAST ANSWERS HIT HARDER · WRONG ANSWERS GET COUNTERED`,
      W / 2,
      190,
      17,
      '#ffffff',
      'center',
      HEAD_FONT,
    );
  }

  describe(): string {
    const s = this.snap;
    const q = s.q;
    if (!q) return 'No questions loaded.';
    const base = `Question ${s.i + 1} of ${s.total}. HP ${this.env.p1.alias} ${s.hp[0]}, ${this.env.p2.alias} ${s.hp[1]}.`;
    if (s.phase === 'ask')
      return `${base} ${Math.ceil(s.timeLeft)} seconds left. ${q.q} Options: ${q.options.map((o, i) => `${i + 1}, ${o}`).join('; ')}.`;
    return `${base} Correct answer: ${q.options[q.answer]}. ${q.why}`;
  }
}
