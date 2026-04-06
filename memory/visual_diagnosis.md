---
name: Visual problems — diagnosis and current state
description: Blur sources, light system history, and pending work as of 2026-03-28
type: project
---

## Current Baseline — 2026-03-21 (commit 60b98cb)

Both cessation and cessation-tracker synced to this state on 2026-03-28. This is the "visually complete / lifecycle engine next" point from the creator's journal dated 3/22.

- Ellipse (blob) forms — smoothstep on ellipse distance
- Sigma multiplier 0.75 on background fields
- w^2 Gaussian weights, normalized blend `/wSum`
- Min-max normalization for pAxis, rAxis, tAxis (NOT percentile)
- ECG-driven form anchors (`0.20 + 0.60 * u_pAxisNorm` etc.), no zone partitioning

## What Happened 3/25–3/27 (all reverted)

**3/26 — sigma push to 0.90** — primary visual culprit. Made everything blobbier/more washed.

**3/26 — percentile ranking for pAxis/rAxis/tAxis** — spreads datasets more evenly across 0–1, moves fields/forms to extreme canvas positions, center has weaker weights. `/wSum` still fills to full brightness but across more distant fields → softer, more watercolor. Creator identified this as "the culprit visually" on 3/28. Reverted.

**3/27 — full redesign** (zone partitioning, noise field forms, sigma 0.42, orbit amplitudes 0.26–0.28) — reverted entirely on 3/28 after light system experiments went badly.

**3/27 — three light system approaches** — A (chroma/luminance split), B (dark base + additive + Reinhard), C (tight additive + Reinhard). C was creator's favorite. Two unresolved issues with C: (1) lines artifact from mismatched sigma sets, (2) hue variety lost in monochromatic datasets. All reverted.

## Blur — Root Causes (still present in current baseline)

**Source 1 — `/wSum` normalization:** Every pixel forced to full brightness regardless of how close it is to any field center. Pixels near no fields still render at full color — just an average of all four fields equally. This is the watercolor wash character.

**Source 2 — Wide smoothstep edges:** Transition zone on forms is `nOuter - nInner` = up to 0.25 canvas width. Example: nitrogen nInner = 0.15 + 0.15×r, nOuter = 0.30 + 0.25×r. Very soft, indistinct edges.

## Pending

**Blur fix (forms):** Tighten smoothstep: `smoothstep(nOuter - 0.025, nOuter, dist)` instead of `smoothstep(nInner, nOuter, dist)`. Thin 0.025 edge rather than 0.15–0.25 gradient. Not yet implemented.

**Blur fix (background):** Address `/wSum` normalization. Approach C (additive + Reinhard) is the direction but needs a solution for hue variety in datasets where fields don't overlap. A consistent ambient using the SAME sigma as the light fields (not a mismatched wider sigma) avoids the lines artifact.

**Tracker site:** Synced to 3/21 baseline. Should stay in sync with cessation going forward.
