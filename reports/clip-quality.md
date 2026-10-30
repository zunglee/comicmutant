# Clip quality gate

Owner rule (2026-10-30): every character gets ≥ 20 animated clips ("GIFs"). A clip kind that scores
under **8/10** after **5** improvement rounds is dropped; the rest ship. The website offers a Rich / Lite
switch (header) so the full set never forces itself on a slow device.

Process per round: `pnpm tsx scripts/clip-shots.ts <round> <themes>` renders each kind as a 4-frame
filmstrip (t = 0.15, 0.6, 1.2, 2.1 s) on five deliberately different palettes — spider-man (red/blue),
nagraj (green on green), parmanu (yellow/charcoal/cyan), joker (purple/green), shaktimaan (red/gold).
An independent critic agent (no stake in the result) scores each kind 1–10, worst theme weighted
heavily; fixes go in; repeat. Sheets are kept in `reports/clip-shots/round-N/`.

## Motif kinds (published characters)

| Kind | R1 | R2 | R3 | R4 | R5 | Result |
|---|---|---|---|---|---|---|
| splash | 6 | 7 | 8 | 8 | **9** | ship |
| aura | 5 | 5 | 6 | 6 | **7** | **dropped** |
| charge | 6 | 6 | 7 | 7 | **8** | ship |
| blast | 5 | 5 | 6 | 7 | **8** | ship |
| impact | 6 | 7 | 8 | 8 | **9** | ship |
| orbit | 5 | 6 | 5 | 7 | **8** | ship |
| storm (Vortex) | 5 | 5 | 7 | 6 | **8** | ship |
| wipe | 5 | 5 | 5 | 7 | **7** | **dropped** |
| speedlines (Zoom rush) | 7 | 7 | 7 | 8 | **8** | ship |
| glitch | 7 | 7 | 7 | 8 | **8** | ship |
| panels | 5 | 6 | 6 | 6 | **6** | **dropped** |
| rain | 6 | 5 | 5 | 5 | **6** | **dropped** |
| shockwave (Ground pound) | 4 | 5 | 6 | 7 | **7** | **dropped** |
| spotlight (Night signal) | 4 | 5 | 6 | 6 | **8** | ship |
| kaleido | 5 | 6 | 6 | 6 | **8** | ship |
| heartbeat (Power meter) | 5 | 5 | 5 | 7 | **7** | **dropped** |
| portal | 5 | 7 | 6 | 7 | **8** | ship |
| sticker | 7 | 6 | 8 | 8 | **8** | ship |
| skyline-run (Rooftop dash) | 4 | 6 | 6 | 7 | **8** | ship |
| cover | 6 | 6 | 8 | 8 | **8** | ship |

**Outcome: 14 of 20 motif kinds ship** (`app/lib/clips/gate.ts`). Dropped after 5 rounds: aura, wipe, panels, rain, ground pound, power meter. Every published character therefore has 14 motif clips (not 20); pages that used a dropped kind were switched to shipped ones, and `MotifClip` falls back to the splash page for any dropped id.

Fixes between rounds:
- **R1 → R2:** contrast picker for every colour (never trust palette roles), motif plates, paper
  keylines, distinct motion per kind (vortex, zoom rush, ground pound replaced near-duplicates), site
  chrome hidden in captures.
- **R2 → R3:** lettering keyline flips to paper on dark fills; secondary elements (bursts, drops, wedges,
  arcs, runner) routed through the picker; paper halo on plates over near-black; minimum motif stroke
  (≈2.2 px); SFX words ≤ 6 letters; one key moment per kind (hit/slam/squash + shake); "Vital signs"
  rebuilt as a comic "Power meter"; radial (not full-frame) flashes; no empty first frames.
- **R3 → R4:** palette discipline — only c1/c2/c3, ink and paper (no mixed or tinted shades; value via
  halftone); every element opaque and keylined; new layouts / key moments for 14 kinds.
- **R4 → R5 (final):** near-black grounds use small paper/c3 dots; all motif glows and alpha fades removed;
  night-signal beam and cover gloss made opaque; kaleidoscope geometry fixed (mirrored wedges had
  overlapped, leaving half the disc black); panels 2+1, rain with splashes, meter with visible empty
  cells; runner enlarged.

## Sprite poses (CM Originals)

Fighters: meghna-kadam, tarsus-vell (R1), + bholu-pandey (R2–R5). Rounds 4 and 5 were sampled at
times the animator wasn't told (0.3/0.9/1.5/2.25 s, then 0.2/0.75/1.35/1.95 s) so the gate judged real
motion, not tuned frames.

| Pose | R1 | R2 | R3 | R4 | R5 | Result |
|---|---|---|---|---|---|---|
| idle | 7 | 7 | 7 | 8 | **8** | ship |
| walk | 6 | 6 | 7 | 7 | **8** | ship |
| run | 7 | 7 | 7 | 6 | **6** | **dropped** |
| jump | 6 | 6 | 7 | 8 | **8** | ship |
| crouch | 5 | 6 | 6.5 | 7 | **8** | ship |
| punch | 7 | 7 | 7.5 | 8 | **8** | ship |
| kick | 6 | 6 | 7 | 8 | **7** | **dropped** |
| uppercut | 7 | 6 | 6.5 | 6 | **8** | ship |
| block | 6 | 6 | 7 | 8 | **8** | ship |
| hurt | 5 | 6 | 7 | 6 | **6** | **dropped** |
| ko | 5 | 6 | 7 | 8 | **8** | ship |
| victory | 7 | 7 | 7 | 6 | **5** | **dropped** |
| taunt | 6 | 6 | 6 | 7 | **7** | **dropped** |
| charge | 6 | 6 | 6 | 7 | **7** | **dropped** |
| special | 7 | 6 | 6.5 | 6 | **8** | ship |
| dash | 5 | 5 | 7.5 | 7 | **8** | ship |
| serve | 7 | 7 | 6.5 | 6 | **8** | ship |
| smash | 5 | 6 | 7 | 7 | **6** | **dropped** |
| kick-ball | 6 | 6 | 6 | 7 | **8** | ship |
| celebrate | 6 | 6 | 7 | 5 | **7** | **dropped** |

**Outcome: 12 of 20 sprite poses ship as gallery clips** (`DROPPED_SPRITE` in `app/lib/clips/gate.ts`). The games still animate every pose — the rule governs the clip galleries ("GIFs"), and fights need run/kick/hurt. Fixes across rounds: one fixed character scale (camera pans only), stickers that avoid head/limbs/contact point, opaque hit flashes, contrast-picked effect colours, hands out of the face cone, ordered attack phases, backdrop cached per fighter.

## Second batch: six new motif kinds (owner: "Yes, add 6 kinds")

Same rule, same five palettes, same independent critic. Two changes to the process, learned from the
sprite gate: from round 3 on, each round's filmstrip sampled frame times the animator had not seen
(round 5: t = 0.1, 0.5, 0.95, 1.4, 1.85, 2.3 s), and the critic read each recipe's code to judge what
happens between sampled frames, especially at the loop seam. Sheets: `reports/clip-shots/round-new-r*/`.

| Kind | R1 | R2 | R3 | R4 | R5 | Result |
|---|---|---|---|---|---|---|
| faceoff (Face-off) | 6 | 8 | 6 | 8 | **8** | ship |
| headline (Front page) | 7 | 8 | 7 | 7 | **8** | ship |
| cardflip (Trading card) | 7 | 7 | 7 | 6 | **8** | ship |
| bounce (Ricochet) | 5 | 7 | 6 | 7 | **8** | ship |
| radar (Radar lock) | 6 | 6 | 7 | 6 | **7** | **dropped** |
| shatter (Glass break) | 7 | 7 | 8 | 7 | **8** | ship |

**Outcome: 5 of 6 ship. Every character now has 19 motif clips** (14 first batch + 5), 1 short of the
20-per-character target; the Rich/Lite switch still governs all of them. Radar dropped because its
loop still popped back in at the seam (label and sweep wedge return at full size) and its lock
brackets lost their accent colour on dark palettes.

Round-5 fixes that decided it: EXTRA! now rolls off with the front page, and the hold gets a photo pan
and type-in columns; the trading-card glint is always lighter than the card (paper core otherwise); the
ricochet ball stays flush to the wall when squashed, with spaced ring trails; the glass breaks in
the first quarter and the name holds ~1 s; shards carry the glass texture.

Non-blocking critic notes fixed after the verdict (no score change claimed): the colour picker's
fallback now chooses the colour furthest from the ground (Spider-Man's web/spark were black on navy);
shard texture covers shard tips past the canvas edge; the ricochet's SFX word and spark scale out
instead of vanishing in one frame.
