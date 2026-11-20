import { m } from 'motion/react';
import { CountUp } from '~/components/bits';
import { useSkinMotion } from '~/skins/motion';

const LETTERS = ['D', 'E', 'S', 'I'];

/**
 * Animated page header. The orbs are the heroes' own palette colours drifting (decorative, no
 * figures). Motion's MotionConfig(reducedMotion="user") stills every transform for reduced motion.
 */
export function DesiHeader({
  heroes,
  facts,
  publishers,
  palettes,
}: {
  heroes: number;
  facts: number;
  publishers: number;
  palettes: string[];
}) {
  const mo = useSkinMotion();
  const orbs = palettes.slice(0, 14);
  return (
    <header className="relative isolate overflow-hidden border-line border-b-[3px]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {orbs.map((c, i) => (
          <m.span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative list
            key={i}
            className="absolute round"
            style={{
              // Palette tint over the skin's own paper, so the orb stays crisp and readable in every skin.
              background: `color-mix(in srgb, ${c} 45%, transparent)`,
              width: 28 + ((i * 17) % 44),
              height: 28 + ((i * 17) % 44),
              // Kept to the right of the copy column (and faint on phones, where the copy fills the width).
              left: `${56 + ((i * 37) % 40)}%`,
              top: `${(i * 53 + 8) % 80}%`,
              border: '2px solid color-mix(in srgb, var(--line) 35%, transparent)',
            }}
            animate={{ y: [0, -16 - (i % 4) * 5, 0], rotate: [0, 8, 0] }}
            transition={{
              ...mo.tween(4 + (i % 5), { ease: 'easeInOut', delay: mo.delay(i, 0.2) }),
              repeat: Number.POSITIVE_INFINITY,
            }}
          />
        ))}
        <m.div
          className="burst absolute -right-16 -bottom-24 size-72 bg-c3 opacity-40"
          animate={{ rotate: 360 }}
          transition={{ ...mo.tween(60, { ease: 'linear' }), repeat: Number.POSITIVE_INFINITY }}
        />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(var(--line) 1.4px, transparent 1.6px)',
            backgroundSize: '14px 14px',
          }}
        />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:py-16">
        <p className="kicker">
          Comic realm · Indian superheroes ·{' '}
          <span lang="hi" className="font-body">
            देसी सुपरहीरो
          </span>
        </p>
        <h1 className="h-display ink-text text-c1-text text-7xl leading-none sm:text-9xl">
          <span className="sr-only">Desi heroes</span>
          <span aria-hidden className="inline-flex gap-1">
            {LETTERS.map((l, i) => (
              <m.span
                key={l}
                className="inline-block"
                initial={{ y: 40, rotate: -8, scale: 0.6 }}
                animate={{ y: 0, rotate: i % 2 ? 3 : -3, scale: 1 }}
                transition={mo.spring({ stiffness: 420, damping: 14 }, mo.delay(i, 0.08))}
              >
                {l}
              </m.span>
            ))}
          </span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg">
          The wiki of India's superheroes and villains: who made them, where they debuted, and the
          facts that make them worth knowing. Facts only, no drawn heroes.
        </p>
        <dl
          data-testid="desi-stats"
          className="mt-8 grid max-w-xl grid-cols-3 gap-2 text-center sm:gap-3"
        >
          {(
            [
              ['Heroes', heroes],
              ['Facts', facts],
              ['Publishers', publishers],
            ] as const
          ).map(([label, n], i) => (
            <m.div
              key={label}
              className="panel min-w-0 px-1 py-3 sm:px-2"
              initial={{ y: 20, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              transition={mo.spring({ stiffness: 300, damping: 18 }, 0.4 + mo.delay(i, 0.1))}
            >
              <dd className="h-display text-4xl text-c1-text-card sm:text-5xl">
                <CountUp value={n} />
              </dd>
              <dt className="kicker text-[0.65rem] tracking-normal sm:text-xs sm:tracking-wider">
                {label}
              </dt>
            </m.div>
          ))}
        </dl>
      </div>
    </header>
  );
}
