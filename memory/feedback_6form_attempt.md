---
name: 6-form background attempt — reverted
description: 6-form system replacing 17-field background was tried and immediately reverted on 2026-03-29
type: feedback
---

Replacing the 17-field background with a 6-form system (ventRate, QTc, tAxis, glucose, BUN, eGFR) was tried on 2026-03-29 and immediately reverted without feedback on what was wrong.

**Why:** Result looked similar to the 17-field version but less dynamic. Color variety was no different. The abnormality measure (abs(value-0.5)*2.0) was too weak — values cluster near mid-range after normalization so nothing pushed hard into the hue territories.

**How to apply:** The problem is not field count — it's that the data isn't driving the color aggressively enough. Amplifying abnormality scores (e.g. raising to a power) may produce more variety without restructuring fields. Try that before rebuilding the field system again.

**Data context:** Only 6 metrics have meaningful variance across 29 datasets: ventRate (51–101), glucose (97–160), QTc (399–438), BUN (9–20), eGFR (94–118), tAxis (30–78). The rest are too tightly regulated to drive color variety.
