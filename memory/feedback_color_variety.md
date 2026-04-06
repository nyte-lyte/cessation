---
name: Color variety — root cause and correct direction
description: Two weeks of failed attempts traced to 17-field fixed positions. Data-driven positions are the answer.
type: feedback
---

The 17-field body map (fixed ECG left / lab right) solved blur but killed color variety. Every attempt to restore variety within that system failed — percentile ranking, 6-form redesign, weight amplification. None of it worked because the problem was architectural, not parametric.

**Why:** Fixed field positions mean every piece has the same composition — same regions of the canvas, same structure. Only the hue tints change, and with 17 fields in a circular mean, even those converge. The old 4-field system had data-driven BASE POSITIONS (`vec2 fieldBase1 = vec2(0.15 + 0.55 * u_glucose, 0.15 + 0.55 * u_potassium)`) — so piece with glucose=97 had field 1 near bottom-left, piece with glucose=160 had it near top-right. Different compositions, not just different tints. That was the source of variety.

**The core vision:** Data-driven visuals from the body. The body's data should shape the composition — where things live on the canvas — not just color zones within a fixed medical diagram layout.

**How to apply:** The next attempt at color variety must restore data-driven field positions. The 4-field system from commit `16d2213` had this. The blur came from large sigmas with simple g¹ Gaussian. The fix is data-driven positions + g⁴ (sharp) + sigmas scaled ~4× to compensate (g⁴ needs ~4× the sigma of g¹ for equivalent visual field size). Do this in a fresh session, not at the end of an exhausted one.

**What not to try again:**
- 17-field fixed positions with percentile tuning — won't work, architectural not parametric
- 6-form system with fixed hue territories — tried 2026-03-29, reverted
- Circular mean with 17 fixed fields — dilutes the 6 high-variance metrics into noise
- Any parametric fix (g², g⁴, sigma scaling) to blur in a 4-field system — blur is field-density, not math

## 2026-03-30 update — outsider insight

The blur/variety problem was two separate problems being conflated:
1. **Blur = field density problem.** 17 fields gives every pixel a dominant neighbor geometrically. 4 fields cannot be fixed by changing the weight function — there aren't enough fields. This is why every g¹→g⁴ attempt on 4 fields "looked the same."
2. **Sameness = fixed anchor problem.** ECG always left, labs always right, same skeleton every piece. Fix: data-driven anchors.

**Implemented 2026-03-30:** 17-field system with data-driven anchor positions. Each field's home position computed from two data values instead of fixed constants. Results: better hue variety, some composition variety, but ECG fields still cluster dark/brown on the left (low-variance ECG metrics land in warm/dark hue territory). The lab fields drive the right side variation. Still a recognizable vertical seam structure.

**Next step:** Address dark left side. ECG field hues land in brown/red because min-max normalized values for low-variance ECG metrics cluster in warm hue territory. Options: percentile ranking for ECG field hues, or raise brightness floor for ECG fields specifically.
