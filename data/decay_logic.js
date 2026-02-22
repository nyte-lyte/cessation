// decay_logic.js
// Computes a per-dataset decay rate from health markers.
//
// BASE_DECAY_PER_YEAR_32 = 0.01 is the reference rate for a 32-year piece with
// average health. main.js scales dataset.decayRate by (32 / lifespanYears),
// where lifespanYears is derived from the BTC block hash at mint.

const BASE_DECAY_PER_YEAR_32 = 0.01;

function normalize(val, min, max) {
  if (max - min === 0) return 0.5;
  return (val - min) / (max - min);
}

function calculateDynamicDecayRate(dataSet, minMaxValues, healthIndex) {
  const nQTc = normalize(
    dataSet.ecg.qtcInterval,
    minMaxValues.qtcInterval.min,
    minMaxValues.qtcInterval.max
  );
  const nCreatinine = normalize(
    dataSet.labs.creatinine,
    minMaxValues.creatinine.min,
    minMaxValues.creatinine.max
  );
  const nEGFR = normalize(
    dataSet.labs.eGFR,
    minMaxValues.eGFR.min,
    minMaxValues.eGFR.max
  );
  const nGlucose = normalize(
    dataSet.labs.glucose,
    minMaxValues.glucose.min,
    minMaxValues.glucose.max
  );

  // 0..1 score: higher = worse health markers = faster decay
  // Higher QTc, higher creatinine, lower eGFR, higher glucose → faster decay
  const score =
    nQTc * 0.4 +
    nCreatinine * 0.3 +
    (1 - nEGFR) * 0.2 +
    nGlucose * 0.1;

  // Health index further amplifies decay for worse overall health
  const shaped = score * (1 + Math.pow(1 - healthIndex, 2));

  return BASE_DECAY_PER_YEAR_32 * shaped;
}

export { calculateDynamicDecayRate, BASE_DECAY_PER_YEAR_32, normalize };
