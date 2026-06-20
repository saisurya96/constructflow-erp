# ConstructFlow — "Blueprint" video brand

A ~30s product demo of the woven workflow (plan → raise → source → receive → cost & bill),
styled as a construction **drafting sheet**: warm paper, warm ink, one hi-vis safety-orange
accent, mono technical labels. The whole video plays inside a fixed drawing-sheet frame
(inset border, corner registration marks, title-block footer) while the "drawing" inside
changes scene to scene.

## Palette (strict)

| Token   | Hex       | Use                                                            |
| ------- | --------- | ------------------------------------------------------------- |
| paper   | `#FAF8F3` | Canvas background (warm drafting paper). Same on every scene.  |
| ink     | `#232220` | Headlines, big numbers, ink panels (warm near-black).         |
| card    | `#FFFFFF` | Cards / panels on paper.                                       |
| orange  | `#E1701E` | THE accent — brand mark, the "live" signal, the one highlight. Sparingly. |
| muted   | `#6B675F` | Secondary text, mono labels.                                  |
| line    | `#E4E0D8` | Hairline borders (use 2px in video).                          |
| red     | `#C5392A` | Critical / blocked status.                                    |
| green   | `#3F8F5F` | Good / on-budget / received.                                  |
| amber   | `#D9A441` | Warning / in-progress.                                        |

Do NOT introduce other hues. Orange is the only brand color; reds/greens/amber are status only.

## Type

- **Space Grotesk** — display: headlines + every big metric number. Weights 500/600/700.
- **Geist Mono** (fallback JetBrains Mono) — mono micro-labels / eyebrows / table headers /
  sheet annotations. UPPERCASE, wide letter-spacing (~0.14em), ~18–22px in video.
- No Inter (banned). Sans + mono pairing only. Extreme weight contrast.

## Motifs (the "Blueprint" identity)

- Faint engineering **grid** behind every scene (continuity).
- **Corner registration marks** + an inset hairline **frame**, persistent across the whole video.
- **Title-block footer**: `CONSTRUCTFLOW — THE WOVEN WORKFLOW · SHEET A-100 · SCALE N.T.S. · REV A`.
- **Squared** status marks (not dots), **sharp** corners (radius ~6px), thin squared meters.
- FLAT hairline cards — **no shadows, no gradients, no glassmorphism**.
- Mono section markers `01 / PLAN`, `02–03 / SOURCE`, etc.

## Do / Don't

- DO make the light canvas cinematic: bold 2px borders, full-saturation orange focal hits,
  ink panels for depth, one element pulling the eye per scene.
- DON'T switch to a dark theme, add gradients/glows, use cyan/purple, or center everything with
  equal weight. Anchor content to zones. Lead the eye.
