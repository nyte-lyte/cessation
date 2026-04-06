---
name: ECG hue normalization — inconsistency diagnosis
description: The brown left side is caused by min-max normalization for ECG field hues while the rest of the system uses percentile. Fix is to apply percentile consistently.
type: feedback
---

The system already uses percentile ranking consistently in two places:
- `computeHSBFromStats` — percentile for glucose, potassium, eGFR → base hue. Full wheel guaranteed.
- `winsorizedPercentileForLab` — winsorized percentile for all beam lab drives. Outlier-safe.

The 17-field ECG hues use min-max normalization — the only place in the system that doesn't use percentile. This is the inconsistency causing the brown/dark left side.

If one ECG dataset had an extreme value (e.g. the 2025-03-26 outlier: pAxis=148, rAxis=143, tAxis=142), min-max normalization compresses all normal days into 0.0–0.3 of the range → hue 0°–108° → red/orange/brown for every normal piece.

**Why:** No principled reason. The original percentile revert for pAxis/rAxis/tAxis (commit e213853, reverted) was about form POSITIONS clustering at canvas extremes — a different use case. Hue is not affected by that problem. The revert was overcorrected.

**How to apply:** Compute percentile-ranked values for all ECG metrics in main.js (same pattern as sortedQtcValues/qtcPercentile). Pass as separate uniforms. Use for field hues only — form position anchors can stay on min-max if needed. This makes the ECG hue system consistent with the rest of the architecture.

Fields affected: fVR, fPR, fQRS, fPA, fRA, fQTc (already done), fTA, fAng — all need percentile hues.
Already done: u_qtcPercentile exists and is used. Pattern just needs extending to remaining ECG metrics.
