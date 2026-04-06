---
name: Data Mappings — Full Current State
description: What each health/ECG metric drives in the shader and JS (as of 2026-03-26)
type: project
---

All health/ECG metrics and what they drive:

- **QTc** — Field 1 drift freq, Field 3 hue, Cr form aspect, Ca form tilt, health index (0.30). Most wired metric.
- **ventRate** — heartPace (scales ALL field + form orbit speeds), Na tempo, Na form shape/anchor, health index (0.10)
- **pAxis / rAxis** — field base positions, hue drift, form anchors (N, Cr, Na, Cl), breathing amplitude; percentile-ranked (not min-max)
- **tAxis** — Cl form anchor/tilt, Ca form anchors/aspect, CO2 halo tilt, field 3 drift; percentile-ranked
- **PR interval** — Cr tempo, field 2 drift freq, Cr form tilt, Cl form anchor
- **QRS interval** — Na pulse count; Field 1 spread (u_qrsNorm → s1 formula, wide QRS = more diffuse identity field)
- **eGFR** — brightness, all field sigmas, form radii, CO2 tempo, N hue offset, health index (0.25)
- **creatinine** — Cr form size/strength, BUN/Cr spatial coupling, Field 2 brightness (high Cr darkens acid-base field), karma, health index (0.15)
- **BUN** — N form strength/tempo, breathing amplitude (adds up to 6% more urgency under high BUN)
- **sodium** — arrival gate (~20%)
- **chloride** — arrival gate (~60%), CO2 halo saturation (0.60→0.90, acid-base signal)
- **CO2** — halo strength/tempo, health index (0.07). str = 0.26 + 0.18*(1-p), range 0.26–0.44. Low CO2 (acidosis) = more presence.
- **calcium** — Ca form strength (str = 0.06 + 0.24*p, range 0.06–0.30), Ca form size/tempo, Ca hue
- **glucose** — base hue (primary color identity), Field 1 position, nirvana/void hue
- **potassium** — saturation, Field 1 position/saturation, Cr hue offset, health index (0.07)
- **healthIndex** — inherited field fade exponent (0.7 healthy → 1.2 sick; sick pieces lose ancestral connection faster)
- **qtInterval** — dormant (redundant with QTc, intentionally unused)
