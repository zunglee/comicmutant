/**
 * Clip kinds as data (id, label, loop seconds) — tiny, safe for the server and every page. The
 * drawing recipes live in registry.ts and load lazily on the client; a unit test keeps the two
 * lists identical.
 */
export const CLIP_MANIFEST = [
  { id: 'splash', label: 'Splash page', loop: 3 },
  { id: 'aura', label: 'Power aura', loop: 2 },
  { id: 'charge', label: 'Charge up', loop: 2.4 },
  { id: 'blast', label: 'Signature blast', loop: 1.6 },
  { id: 'impact', label: 'Impact frame', loop: 1.2 },
  { id: 'orbit', label: 'Orbit', loop: 4 },
  { id: 'storm', label: 'Vortex', loop: 3 },
  { id: 'wipe', label: 'Halftone wipe', loop: 2.4 },
  { id: 'speedlines', label: 'Zoom rush', loop: 1.6 },
  { id: 'glitch', label: 'Glitch reveal', loop: 2.4 },
  { id: 'panels', label: 'Three-panel strip', loop: 3 },
  { id: 'rain', label: 'Motif rain', loop: 3 },
  { id: 'shockwave', label: 'Ground pound', loop: 2 },
  { id: 'spotlight', label: 'Night signal', loop: 4 },
  { id: 'kaleido', label: 'Kaleidoscope', loop: 4 },
  { id: 'heartbeat', label: 'Power meter', loop: 2.4 },
  { id: 'portal', label: 'Portal', loop: 3 },
  { id: 'sticker', label: 'Sound-effect stickers', loop: 2.4 },
  { id: 'skyline-run', label: 'Rooftop dash', loop: 2 },
  { id: 'cover', label: 'Issue #1 cover', loop: 4 },
  { id: 'faceoff', label: 'Face-off', loop: 2 },
  { id: 'headline', label: 'Front page', loop: 3 },
  { id: 'cardflip', label: 'Trading card', loop: 3 },
  { id: 'bounce', label: 'Ricochet', loop: 2.4 },
  { id: 'radar', label: 'Radar lock', loop: 3 },
  { id: 'shatter', label: 'Glass break', loop: 2.4 },
] as const;

export type ClipKind = (typeof CLIP_MANIFEST)[number]['id'];
export const CLIP_LABEL: Record<string, string> = Object.fromEntries(
  CLIP_MANIFEST.map((k) => [k.id, k.label]),
);
