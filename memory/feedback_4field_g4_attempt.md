---
name: 4-field + g⁴ experiment — tried and reverted 2026-04-01
description: Replacing 17-field system with 4-field g⁴ was tried and immediately reverted — looked terrible
type: feedback
---

Replaced the 17-field background with 4 data-driven fields (glucose×potassium, eGFR×pAxis, rAxis×potassium, inherited antipodal) using the existing g⁴ fw() function and /wSum normalization. Sigma values 0.30–0.56. Immediately reverted — "looks terrible."

**Why it failed:** The 4-field system from 16d2213 used g¹ + Reinhard tone mapping + dark ground, not g⁴ + /wSum. With /wSum normalization and g⁴, the sharp falloff means each field owns a hard-edged territory with no blending between them. The result is a stark, graphic look — not the painterly color world the 4-field system originally produced. The original feel came from the combination of g¹ softness + Reinhard + dark ground making fields emerge from darkness. g⁴ + /wSum is the wrong combination for 4 fields.

**What was NOT tried:** g⁴ + Reinhard + dark ground (replacing /wSum with the original tone mapping). This would preserve the "data earns the light" aesthetic while sharpening field boundaries. Could still be worth trying — but use Reinhard, not /wSum.

**How to apply:** If attempting 4-field again, use the original rendering approach (Reinhard tone map, dark ground base, no /wSum normalization) but replace g¹ with g⁴ and scale sigma up. Do NOT use /wSum — it kills the dark-ground aesthetic that made the 4-field system work.

**Current safe state:** 1d519af — 17-field data-driven anchors + percentile ECG hues. Revert here if needed.
