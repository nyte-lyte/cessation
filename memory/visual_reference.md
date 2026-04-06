---
name: Visual reference — 4-field vs 17-field comparison
description: Images showing what the 4-field system looked like vs the current 17-field system. The 4-field had the right feel.
type: project
---

## Image files
- `img_4field_warm.png` — 4-field system, warm piece (the goal)
- `img_4field_cool.png` — 4-field system, cool piece (the goal)
- `img_17field_a.png` — 17-field fixed positions, piece A
- `img_17field_b.png` — 17-field fixed positions, piece B
- `img_datadriven_a.png` — 17-field data-driven anchors, piece E (2026-03-30)
- `img_datadriven_b.png` — 17-field data-driven anchors, piece F (2026-03-30)
- `img_datadriven_c.png` — 17-field data-driven anchors, piece G (2026-03-30)

## The goal: what the 4-field system produced

Two example pieces from the 4-field system (commit ~16d2213 era):

**Piece A (warm):** Purple → magenta → orange → gold. Three distinct color regions bleeding into each other. Warm, rich, alive. The whole canvas belongs to a warm world.

**Piece B (cool):** Cyan center, teal bottom-left, red top-right, blue bottom-right. Diagonal composition. Cool and airy. Completely different color world from piece A.

This is what the COLLECTION felt like — each piece had its own color identity. You could look at any piece and know it immediately. The data placed the fields in different parts of the canvas so the composition itself was unique, not just the tint.

The blur was the only problem. The transitions between fields were too soft (simple g¹ Gaussian, large sigma). The color variety and the distinct per-piece identity were correct.

## What the current 17-field system produces

Two example pieces from the current system (commit 1c0157a):

**Piece C:** Green/teal/blue background, bright magenta teardrop form visible, blue oval form. Vivid and complex.

**Piece D:** Blue/purple/magenta/red pinwheel convergence. Very vivid.

These are not bad — vivid, complex, technically impressive. But both pieces look like variations of the same pattern (pinwheel/radiating structure converging toward center). The collection no longer feels like each piece has its own color world. The structure is always similar even when hues differ.

## Today's result — 17-field data-driven anchor positions (2026-03-30)

Three pieces from the new data-driven anchor system:

**Piece E:** Brown/red left, rainbow seam (red→green→cyan→blue) running vertically, hot pink/magenta right half.

**Piece F:** Brown/red left, blue/purple center, magenta right — seam shifted, structure similar to E but center region different.

**Piece G:** Brown/olive left, lime green dominant center-left, cyan seam, magenta right — most distinct of the three, green region is new.

---

## Comparison across all three systems

| | 4-field (goal) | 17-field fixed (old) | 17-field data-driven (new) |
|---|---|---|---|
| Composition variety | High — each piece different skeleton | None — same skeleton always | Partial — seam moves, left always dark |
| Hue variety | High — warm vs cool worlds | Low — similar pinwheel tints | Medium — better than fixed, not as good as 4-field |
| Blur | Yes — too soft | No | No |
| Left side | Data-driven | Fixed | Consistently dark brown |
| Structure | Fields own large regions | Pinwheel always | Vertical seam always |

**Key observation:** The new system has better hues than fixed positions but is still structurally similar across pieces — the left side stays dark/brown and a vertical seam is always present. This is because the ECG fields (low variance) are clustering to similar positions on the left for most datasets. The lab fields (higher variance) are driving the hue differences on the right.

## The diagnosis

The 4-field system gave each piece a **color world** — large regions of the canvas belonging to one color, placed there by the data.

The 17-field system gives each piece **complexity** — many small zones, always the same structural character.

## What to do next

Restore 4-field data-driven positions. Fix the blur with g⁴ and scaled-up sigma (~4× the g¹ value). Keep everything else (forms, beams, lifecycle) exactly as it is in 1c0157a.

The one thing NOT to do: keep fixed positions. That is what killed the collection identity.

**Why:** The blur in the 4-field system came from large sigmas with g¹. That is a solvable rendering problem. The color world identity came from data-driven positions. That is the architecture. Don't sacrifice architecture to fix rendering.
