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

// Blend two datasets — all values average toward midpoint.
// Each reanimation cycle produces a genuinely new dataset that has drifted
// further from the originals. Extreme disease markers smooth out over lifetimes.
function blendDatasets(a, b) {
  return {
    date: `blended`,
    ecg: {
      ventRate:    (a.ecg.ventRate    + b.ecg.ventRate)    / 2,
      prInterval:  (a.ecg.prInterval  + b.ecg.prInterval)  / 2,
      qrsInterval: (a.ecg.qrsInterval + b.ecg.qrsInterval) / 2,
      qtInterval:  (a.ecg.qtInterval  + b.ecg.qtInterval)  / 2,
      qtcInterval: (a.ecg.qtcInterval + b.ecg.qtcInterval) / 2,
      pAxis:       (a.ecg.pAxis       + b.ecg.pAxis)       / 2,
      rAxis:       (a.ecg.rAxis       + b.ecg.rAxis)       / 2,
      tAxis:       (a.ecg.tAxis       + b.ecg.tAxis)       / 2,
    },
    labs: {
      glucose:       (a.labs.glucose       + b.labs.glucose)       / 2,
      nitrogen:      (a.labs.nitrogen      + b.labs.nitrogen)      / 2,
      creatinine:    (a.labs.creatinine    + b.labs.creatinine)    / 2,
      eGFR:          (a.labs.eGFR          + b.labs.eGFR)          / 2,
      sodium:        (a.labs.sodium        + b.labs.sodium)        / 2,
      potassium:     (a.labs.potassium     + b.labs.potassium)     / 2,
      chloride:      (a.labs.chloride      + b.labs.chloride)      / 2,
      carbonDioxide: (a.labs.carbonDioxide + b.labs.carbonDioxide) / 2,
      calcium:       (a.labs.calcium       + b.labs.calcium)       / 2,
    },
  };
}

// Karma = accumulated disease burden of a dataset.
// Higher karma = more cycles before liberation.
// Uses same disease markers as decay, weighted toward cardiac and kidney stress.
function computeKarma(dataset, minMaxValues) {
  const nQTc       = normalize(dataset.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max);
  const nCreat     = normalize(dataset.labs.creatinine, minMaxValues.creatinine.min,  minMaxValues.creatinine.max);
  const nEGFR      = normalize(dataset.labs.eGFR,       minMaxValues.eGFR.min,        minMaxValues.eGFR.max);
  const nGlucose   = normalize(dataset.labs.glucose,    minMaxValues.glucose.min,     minMaxValues.glucose.max);
  const nVentRate  = normalize(dataset.ecg.ventRate,    minMaxValues.ventRate.min,    minMaxValues.ventRate.max);
  return nQTc * 0.35 + nCreat * 0.25 + (1 - nEGFR) * 0.20 + nGlucose * 0.15 + nVentRate * 0.05;
}

// Liberation threshold — 25th percentile of karma across the full collection.
// When a blended dataset's karma drops below this, the next cessation is liberation.
// Resolves naturally: healthy data → fewer cycles. Disease-heavy → more cycles.
function computeLiberationThreshold(allDatasets, minMaxValues) {
  const sorted = allDatasets
    .map(d => computeKarma(d, minMaxValues))
    .sort((a, b) => a - b);
  return sorted[Math.floor(0.25 * sorted.length)];
}

export { calculateDynamicDecayRate, BASE_DECAY_PER_YEAR_32, normalize, blendDatasets, computeKarma, computeLiberationThreshold };
