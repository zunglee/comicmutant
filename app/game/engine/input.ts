/**
 * Unified input: keyboard (two players on one keyboard), on-screen touch pad, and gamepads.
 * Each player exposes `held` and edge-triggered `pressed` per action; `endStep()` clears edges
 * after every fixed update so a tap is never lost or double-counted.
 */
export const ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b', 'c'] as const;
export type Action = (typeof ACTIONS)[number];

export interface PadState {
  held: Record<Action, boolean>;
  pressed: Record<Action, boolean>;
}

const blank = (): Record<Action, boolean> => ({
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
  b: false,
  c: false,
});

export const KEYMAP: Record<string, [player: 0 | 1, action: Action]> = {
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  KeyW: [0, 'up'],
  KeyS: [0, 'down'],
  KeyF: [0, 'a'],
  KeyG: [0, 'b'],
  KeyH: [0, 'c'],
  Space: [0, 'up'],
  ArrowLeft: [1, 'left'],
  ArrowRight: [1, 'right'],
  ArrowUp: [1, 'up'],
  ArrowDown: [1, 'down'],
  KeyJ: [1, 'a'],
  KeyK: [1, 'b'],
  KeyL: [1, 'c'],
};

export class Input {
  readonly pads: [PadState, PadState] = [
    { held: blank(), pressed: blank() },
    { held: blank(), pressed: blank() },
  ];
  /** Single-player: both key sets drive P1. */
  merge: boolean;
  private keys = new Set<string>();
  private touch: [Record<Action, boolean>, Record<Action, boolean>] = [blank(), blank()];
  private pads0: [Record<Action, boolean>, Record<Action, boolean>] = [blank(), blank()];
  private target: Window | null = null;
  enabled = true;

  constructor(merge: boolean) {
    this.merge = merge;
  }

  private onDown = (e: KeyboardEvent) => {
    const m = KEYMAP[e.code];
    if (!m || !this.enabled) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      return;
    e.preventDefault();
    if (this.keys.has(e.code)) return;
    this.keys.add(e.code);
    this.set(this.merge ? 0 : m[0], m[1], true);
  };
  private onUp = (e: KeyboardEvent) => {
    const m = KEYMAP[e.code];
    if (!m) return;
    this.keys.delete(e.code);
    this.recompute();
  };
  private onBlur = () => {
    this.keys.clear();
    this.recompute();
  };

  attach(w: Window = window) {
    this.target = w;
    w.addEventListener('keydown', this.onDown);
    w.addEventListener('keyup', this.onUp);
    w.addEventListener('blur', this.onBlur);
  }

  detach() {
    const w = this.target;
    if (!w) return;
    w.removeEventListener('keydown', this.onDown);
    w.removeEventListener('keyup', this.onUp);
    w.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  /** Set an action from any source; rising edge marks `pressed`. */
  private set(player: 0 | 1, a: Action, down: boolean) {
    const pad = this.pads[player];
    if (down && !pad.held[a]) pad.pressed[a] = true;
    pad.held[a] = down || pad.held[a];
  }

  private recompute() {
    for (const p of [0, 1] as const) {
      for (const a of ACTIONS) {
        let v = this.touch[p][a] || this.pads0[p][a];
        for (const code of this.keys) {
          const m = KEYMAP[code];
          if (m && m[1] === a && (this.merge ? p === 0 : m[0] === p)) v = true;
        }
        const pad = this.pads[p];
        if (v && !pad.held[a]) pad.pressed[a] = true;
        pad.held[a] = v;
      }
    }
  }

  setTouch(player: 0 | 1, a: Action, down: boolean) {
    this.touch[player][a] = down;
    this.recompute();
  }

  /** Simulate a key for tests / bots. */
  press(player: 0 | 1, a: Action, down: boolean) {
    this.setTouch(player, a, down);
  }

  /** Poll gamepads (cheap no-op when none are connected). Pad 1 → P1, pad 2 → P2 (or P1 when merged). */
  poll() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    const next: [Record<Action, boolean>, Record<Action, boolean>] = [blank(), blank()];
    let any = false;
    for (const p of [0, 1] as const) {
      const g = gps[p];
      if (!g) continue;
      any = true;
      const ax = g.axes[0] ?? 0;
      const ay = g.axes[1] ?? 0;
      const b = (i: number) => !!g.buttons[i]?.pressed;
      const s = next[this.merge ? 0 : p];
      s.left ||= ax < -0.4 || b(14);
      s.right ||= ax > 0.4 || b(15);
      s.up ||= ay < -0.6 || b(12) || b(0);
      s.down ||= ay > 0.6 || b(13);
      s.a ||= b(2);
      s.b ||= b(3) || b(1);
      s.c ||= b(5) || b(7);
    }
    if (!any && !this.hadPad) return;
    this.hadPad = any;
    let changed = false;
    for (const p of [0, 1] as const)
      for (const a of ACTIONS)
        if (this.pads0[p][a] !== next[p][a]) {
          this.pads0[p][a] = next[p][a];
          changed = true;
        }
    if (changed) this.recompute();
  }
  private hadPad = false;

  endStep() {
    for (const pad of this.pads) for (const a of ACTIONS) pad.pressed[a] = false;
  }

  reset() {
    this.keys.clear();
    this.touch = [blank(), blank()];
    this.pads0 = [blank(), blank()];
    for (const pad of this.pads) {
      pad.held = blank();
      pad.pressed = blank();
    }
  }
}
