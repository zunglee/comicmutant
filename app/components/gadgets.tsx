/**
 * Gadget Lab blueprints. Each template is an ORIGINAL, deliberately generic schematic (a boxy armoured
 * car, a robot suit, a plain disc…) — never a copy of a published design. A template is a list of
 * slots; a gadget's `parts` fill them in order (content/gadgets/*.json, checked by scripts/validate.ts).
 *
 * Motion: parts fly apart along their `out` vector (exploded view), the picked part pulls further out
 * and lights up in the owner's accent, outlines draw on with pathLength, and a scan line sweeps.
 * Transform-only; reduced motion / Lite FX get the exploded state at once.
 */
import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { useAnimate } from '~/lib/fx';
import type { Gadget } from '~/lib/schema';

type Blueprint = Gadget['blueprint'];

interface Slot {
  /** Exploded offset in viewBox units (600 × 400). */
  out: [number, number];
  /** Where the number badge sits, assembled coordinates. */
  pin: [number, number];
  draw: ReactNode;
}

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinejoin: 'round',
} as const;
const F = { ...S, fill: 'var(--bp-fill)' } as const;

export const BLUEPRINT_SLOTS: Record<Blueprint, Slot[]> = {
  // Low, boxy armoured car, side view.
  vehicle: [
    {
      out: [0, 0],
      pin: [300, 215],
      draw: <path {...F} d="M70 250 L120 190 L250 175 L420 175 L520 205 L545 250 Z" />,
    },
    {
      out: [20, -120],
      pin: [365, 160],
      draw: (
        <g>
          <rect {...F} x="320" y="140" width="90" height="40" rx="4" />
          <path {...S} d="M332 140v40M348 140v40M364 140v40M380 140v40M396 140v40" />
        </g>
      ),
    },
    {
      out: [120, -10],
      pin: [560, 228],
      draw: (
        <g>
          <path {...F} d="M520 205 L575 222 L575 240 L545 250 Z" />
          <path {...S} d="M560 214h34M560 232h34" />
        </g>
      ),
    },
    {
      out: [-30, -130],
      pin: [215, 160],
      draw: <path {...F} d="M170 186 Q205 128 275 135 L300 176 Z" />,
    },
    {
      out: [0, 110],
      pin: [300, 268],
      draw: (
        <g>
          {[150, 450].map((x) => (
            <g key={x}>
              <circle {...F} cx={x} cy="262" r="38" />
              <circle {...S} cx={x} cy="262" r="14" />
            </g>
          ))}
        </g>
      ),
    },
    {
      out: [-130, 0],
      pin: [45, 225],
      draw: (
        <g>
          <rect {...F} x="38" y="208" width="40" height="34" rx="4" />
          <path {...S} d="M38 214 L10 225 L38 236" />
        </g>
      ),
    },
  ],
  // Blocky robot suit, front view.
  armor: [
    {
      out: [0, -110],
      pin: [300, 70],
      draw: (
        <g>
          <rect {...F} x="268" y="40" width="64" height="64" rx="18" />
          <path {...S} d="M280 70h40" />
        </g>
      ),
    },
    {
      out: [0, 0],
      pin: [300, 165],
      draw: (
        <g>
          <path {...F} d="M240 110 L360 110 L345 230 L255 230 Z" />
          <circle {...S} cx="300" cy="150" r="16" />
        </g>
      ),
    },
    {
      out: [140, -10],
      pin: [395, 170],
      draw: (
        <g>
          <rect {...F} x="196" y="115" width="38" height="120" rx="10" />
          <rect {...F} x="366" y="115" width="38" height="120" rx="10" />
          <rect {...F} x="192" y="235" width="46" height="34" rx="6" />
          <rect {...F} x="362" y="235" width="46" height="34" rx="6" />
        </g>
      ),
    },
    {
      out: [0, 110],
      pin: [300, 300],
      draw: (
        <g>
          <rect {...F} x="258" y="235" width="36" height="110" rx="8" />
          <rect {...F} x="306" y="235" width="36" height="110" rx="8" />
          <path {...F} d="M250 345h52v18h-52zM298 345h52v18h-52z" />
        </g>
      ),
    },
    {
      out: [-150, -40],
      pin: [215, 110],
      draw: (
        <g>
          <path {...F} d="M240 118 L170 95 L180 150 L240 150 Z" />
          <path {...F} d="M360 118 L430 95 L420 150 L360 150 Z" />
        </g>
      ),
    },
    {
      out: [-160, 120],
      pin: [300, 200],
      draw: <path {...S} strokeDasharray="6 6" d="M300 110v120M270 180h60M280 205h40" />,
    },
  ],
  // Plain disc, exploded into stacked layers.
  shield: [
    {
      out: [-150, -40],
      pin: [300, 140],
      draw: (
        <g>
          <circle {...F} cx="300" cy="200" r="130" />
          <circle {...S} cx="300" cy="200" r="60" />
        </g>
      ),
    },
    {
      out: [0, 0],
      pin: [300, 200],
      draw: (
        <g>
          <circle {...F} cx="300" cy="200" r="105" />
          <path {...S} d="M240 170h120M225 200h150M240 230h120" strokeDasharray="10 8" />
        </g>
      ),
    },
    {
      out: [150, 40],
      pin: [430, 200],
      draw: (
        <g>
          <circle {...S} strokeWidth={10} cx="300" cy="200" r="130" />
          <circle {...S} cx="300" cy="200" r="138" />
        </g>
      ),
    },
    {
      out: [40, 150],
      pin: [300, 290],
      draw: <path {...F} d="M250 260h100v22H250zM285 240h30v62h-30z" />,
    },
  ],
  // Hammer: head, shaft, grip, loop.
  hammer: [
    {
      out: [0, -100],
      pin: [300, 95],
      draw: (
        <g>
          <path {...F} d="M190 60 L410 60 L425 80 L425 130 L410 150 L190 150 L175 130 L175 80 Z" />
          <path {...S} d="M215 75v60M385 75v60" />
        </g>
      ),
    },
    {
      out: [0, 0],
      pin: [300, 200],
      draw: <rect {...F} x="285" y="150" width="30" height="130" rx="6" />,
    },
    {
      out: [100, 60],
      pin: [300, 300],
      draw: (
        <g>
          <rect {...F} x="281" y="280" width="38" height="60" rx="6" />
          <path {...S} d="M281 292l38 10M281 308l38 10M281 324l38 10" />
        </g>
      ),
    },
    {
      out: [-110, 70],
      pin: [300, 365],
      draw: <path {...S} strokeWidth={5} d="M300 340 C270 395 330 395 300 340" />,
    },
  ],
  // Wrist device, side view.
  gauntlet: [
    {
      out: [0, 0],
      pin: [300, 200],
      draw: <rect {...F} x="200" y="160" width="200" height="80" rx="20" />,
    },
    {
      out: [-20, -120],
      pin: [290, 120],
      draw: (
        <g>
          <rect {...F} x="240" y="100" width="100" height="36" rx="18" />
          <path {...S} d="M262 100v36M318 100v36" />
        </g>
      ),
    },
    {
      out: [130, -20],
      pin: [440, 190],
      draw: <path {...F} d="M400 180 L455 172 L455 208 L400 200 Z" />,
    },
    {
      out: [40, 120],
      pin: [330, 260],
      draw: (
        <g>
          <rect {...F} x="310" y="240" width="40" height="22" rx="6" />
          <circle {...S} cx="330" cy="275" r="9" />
        </g>
      ),
    },
    {
      out: [-140, 40],
      pin: [190, 200],
      draw: (
        <g>
          <path {...S} strokeWidth={8} d="M200 172 C150 172 150 228 200 228" />
          <path {...S} d="M175 185v30" />
        </g>
      ),
    },
  ],
  // Ring: band, gem, power source, charge arcs.
  ring: [
    {
      out: [0, 60],
      pin: [300, 270],
      draw: (
        <g>
          <ellipse {...S} strokeWidth={14} cx="300" cy="250" rx="70" ry="40" />
          <ellipse {...S} cx="300" cy="250" rx="84" ry="52" />
        </g>
      ),
    },
    {
      out: [0, -90],
      pin: [300, 165],
      draw: (
        <g>
          <rect {...F} x="255" y="140" width="90" height="70" rx="14" />
          <circle {...S} cx="300" cy="175" r="20" />
        </g>
      ),
    },
    {
      out: [170, -10],
      pin: [470, 200],
      draw: (
        <g>
          <rect {...F} x="440" y="140" width="60" height="110" rx="8" />
          <path {...S} d="M455 160h30M455 180h30M455 200h30M455 220h30" />
        </g>
      ),
    },
    {
      out: [-170, -30],
      pin: [140, 175],
      draw: (
        <g>
          <path
            {...S}
            d="M150 120 Q110 175 150 230M125 135 Q90 175 125 215M175 105 Q130 175 175 245"
          />
        </g>
      ),
    },
  ],
  // Belt: buckle, three pouches, grapnel.
  belt: [
    {
      out: [0, -100],
      pin: [300, 190],
      draw: (
        <g>
          <path {...S} strokeWidth={10} d="M40 200h520" />
          <rect {...F} x="265" y="170" width="70" height="60" rx="8" />
        </g>
      ),
    },
    ...[130, 390, 470].map(
      (x, i): Slot => ({
        out: [i === 0 ? -40 : 40 * i, 100 + i * 10],
        pin: [x + 20, 230],
        draw: (
          <g>
            <rect {...F} x={x} y="205" width="40" height="50" rx="5" />
            <path {...S} d={`M${x} 220h40`} />
          </g>
        ),
      }),
    ),
    {
      out: [-150, 60],
      pin: [70, 250],
      draw: (
        <g>
          <path {...S} d="M70 205v55" strokeDasharray="5 5" />
          <path {...S} strokeWidth={4} d="M70 260 l-16 18 M70 260 l16 18 M70 260 v24" />
        </g>
      ),
    },
  ],
};

/**
 * The dissect view. `explode` 0 = assembled, 1 = fully apart. `active` part pulls further out and
 * glows in the accent. Numbers match the parts list beside it.
 */
export function Blueprint({
  kind,
  explode,
  active,
  onPick,
  labels,
}: {
  kind: Blueprint;
  explode: number;
  active: number | null;
  onPick?: (i: number) => void;
  labels?: string[];
}) {
  const animate = useAnimate();
  const slots = BLUEPRINT_SLOTS[kind];
  return (
    <svg
      viewBox="-80 -80 760 560"
      className="block h-auto w-full text-(--print-blueprint-ink)"
      style={{ ['--bp-fill' as string]: 'rgb(223 234 255 / 0.08)' }}
      role="img"
      aria-label={`Exploded blueprint${labels ? `: ${labels.join(', ')}` : ''}`}
    >
      <defs>
        <pattern id={`bp-grid-${kind}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M20 0H0V20"
            fill="none"
            stroke="var(--print-blueprint-ink)"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect x="-80" y="-80" width="760" height="560" fill="var(--print-blueprint)" />
      <rect x="-80" y="-80" width="760" height="560" fill={`url(#bp-grid-${kind})`} />
      {/* Scan line sweeps the sheet. */}
      {animate && (
        <m.rect
          x="-80"
          y="-80"
          width="760"
          height="6"
          fill="var(--c3)"
          initial={{ y: -80 }}
          animate={{ y: 480 }}
          transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        />
      )}
      {slots.map((s, i) => {
        const on = active === i;
        const k = explode * (on ? 1.3 : 1);
        return (
          <m.g
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are a fixed, ordered template.
            key={i}
            initial={animate ? { x: 0, y: 0, opacity: 0 } : false}
            animate={{ x: s.out[0] * k, y: s.out[1] * k, opacity: 1 }}
            transition={{
              type: 'spring',
              stiffness: 120,
              damping: 16,
              delay: animate ? i * 0.08 : 0,
            }}
            style={{ color: on ? 'var(--c3)' : undefined, cursor: onPick ? 'pointer' : undefined }}
            onClick={onPick ? () => onPick(i) : undefined}
          >
            {s.draw}
            <g transform={`translate(${s.pin[0]} ${s.pin[1]})`}>
              <circle
                r="15"
                fill={on ? 'var(--c3)' : 'var(--print-blueprint)'}
                stroke="currentColor"
                strokeWidth="3"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontFamily: 'var(--font-display)' }}
                fontSize="18"
                fill={on ? 'var(--on-c3)' : 'currentColor'}
              >
                {i + 1}
              </text>
            </g>
          </m.g>
        );
      })}
    </svg>
  );
}
