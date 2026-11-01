/** Fact Frenzy's own inline icons (24px grid, decorative unless titled). */
type P = { className?: string };

function Svg({ className = 'size-5', children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);
export const IconCross = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 3h6" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" />
  </Svg>
);
export const IconShare = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h12l-2 4 2 4H5" />
  </Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Svg>
);

/** The streak flame: a filled teardrop, bigger and brighter as the streak grows. */
export function FlameShape({ className = 'size-8' }: P) {
  return (
    <svg viewBox="0 0 24 32" className={className} aria-hidden focusable="false">
      <path
        d="M12 1c1 5 7 8 7 16a7 7 0 01-14 0c0-3 1.5-5 3-6.5C8.5 13 10 13.5 10.5 12 11.3 9 10 5 12 1z"
        fill="currentColor"
        stroke="var(--line)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path
        d="M12 18c2 1.5 3 3 3 4.6a3 3 0 01-6 0c0-1.600 1.500-2.600 3-4.600z"
        fill="var(--color-paper)"
        stroke="var(--line)"
        strokeWidth={1.2}
      />
    </svg>
  );
}
