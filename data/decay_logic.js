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
// blendDatasets(successor, predecessor)
// Succession blend: successor (a) retains 70% of its own data,
// predecessor (b) leaves a 30% impression. N+1 dominant.
function blendDatasets(a, b) {
  const blend = (x, y) => x * 0.70 + y * 0.30;
  const blended = {
    date: `blended`,
    ecg: {
      ventRate:    blend(a.ecg.ventRate,    b.ecg.ventRate),
      prInterval:  blend(a.ecg.prInterval,  b.ecg.prInterval),
      qrsInterval: blend(a.ecg.qrsInterval, b.ecg.qrsInterval),
      qtInterval:  blend(a.ecg.qtInterval,  b.ecg.qtInterval),
      qtcInterval: blend(a.ecg.qtcInterval, b.ecg.qtcInterval),
      pAxis:       blend(a.ecg.pAxis,       b.ecg.pAxis),
      rAxis:       blend(a.ecg.rAxis,       b.ecg.rAxis),
      tAxis:       blend(a.ecg.tAxis,       b.ecg.tAxis),
    },
    labs: {
      glucose:       blend(a.labs.glucose,       b.labs.glucose),
      nitrogen:      blend(a.labs.nitrogen,      b.labs.nitrogen),
      creatinine:    blend(a.labs.creatinine,    b.labs.creatinine),
      eGFR:          blend(a.labs.eGFR,          b.labs.eGFR),
      sodium:        blend(a.labs.sodium,        b.labs.sodium),
      potassium:     blend(a.labs.potassium,     b.labs.potassium),
      chloride:      blend(a.labs.chloride,      b.labs.chloride),
      carbonDioxide: blend(a.labs.carbonDioxide, b.labs.carbonDioxide),
      calcium:       blend(a.labs.calcium,       b.labs.calcium),
    },
    healthIndex: blend(a.healthIndex ?? 0.5, b.healthIndex ?? 0.5),
    decayRate:   blend(a.decayRate   ?? 0.01, b.decayRate   ?? 0.01),
  };
  return blended;
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
