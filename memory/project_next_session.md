---
name: Base state — 2026-03-29
description: Stable baseline as of end of day 2026-03-29. Revert to these commits if anything goes wrong.
type: project
---

## Cessation (main project)
Commit `1c0157a` on main is the base state.

**What this state is:**
- 17-field body map, fixed positions: ECG fields left half, lab fields right half
- os=0.10 * driftMul, wobble=0.03 — confirmed movement feel
- Branchless hsb2rgb, CPU beam RGB precompute via vec3 uniforms
- No Option A quadrant layout, no cross-side pulls (both tried and scrapped)

## Tracker (cessation-tracker)
Commit `28a7f8c` on main is the base state.

**What this state is:**
- Shader synced to cessation `1c0157a` — same fixed positions, os=0.10, wobble=0.03
- About page: visual output copy updated to "a body map rendered in light..."
- Deployed to https://cessation-tracker.vercel.app

**Why:** Repeated confusion today from uncommitted experiments — Option A layout was committed in a state the user didn't approve, movement values got lost. These commits are the confirmed good state both locally and on Vercel.

**How to apply:** If visual output or movement feel wrong and the session history is unclear, revert cessation to `1c0157a` and tracker to `28a7f8c`. Do not revert further back.
