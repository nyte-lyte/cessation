---
name: Light system experiments — all three approaches tried and reverted
description: Three light system approaches tried; C was favorite but unresolved; reverted to end-of-yesterday weighted average
type: feedback
---

Three light system approaches were implemented and tried in sequence. User reverted to end-of-yesterday state. Do not re-propose unless user explicitly re-opens the topic.

**Approach A — chroma/luminance split:** Weighted average for chroma, raw Gaussian sum for luminance. Hue variety preserved. User moved on to B without strong feedback.

**Approach B — dark base + additive + Reinhard:** Deep dark ground (8% brightness), fields glow additively on top. Bioluminescent feel.

**Approach C — tight additive + Reinhard (user favorite):** Tighter sigmas (0.65×), purely additive accumulation, Reinhard tone map per channel. Dark gaps between fields, discrete pools of colored light. User liked it most but two issues emerged:
1. Lines artifact — caused by mismatched sigma sets: ambient used wide w^3 weights while light used tight gc weights. Boundary visible as rings. Fixed by removing ambient, but then:
2. Hue variety inconsistent — purely additive blending only shows fields where they're strong, so datasets with clustered field centers show fewer distinct hues.
3. Washed out — sigma widened to 0.82 + ambient 0.12 together lifted everything.

**Why reverted:** Unresolved tension between hue variety (needs field overlap/ambient) and light system character (needs dark negative space). User decided to return to yesterday's state rather than continue experimenting.

**Current state:** w^2 Gaussian weights, normalized weighted average blend, wSum epsilon 1e-6, sigma multiplier 0.75. pAxis/rAxis/tAxis percentile ranking is applied.

**How to apply:** If user re-opens the light system, Approach C is the starting point. The core unsolved problem is maintaining hue variety across all 29 datasets when fields don't overlap. A consistent ambient that uses the same sigma as the light (not a mismatched wider sigma) would avoid the lines artifact.
