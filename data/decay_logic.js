// decay_logic.js
// Dataset blending, karma, chronological drift, and collection influence.

function normalize(val, min, max) {
  if (max - min === 0) return 0.5;
  return (val - min) / (max - min);
}

const ECG_KEYS = ['ventRate', 'prInterval', 'qrsInterval', 'qtInterval', 'qtcInterval', 'pAxis', 'rAxis', 'tAxis'];
const LAB_KEYS = ['glucose', 'nitrogen', 'creatinine', 'eGFR', 'sodium', 'potassium', 'chloride', 'carbonDioxide', 'calcium'];

// Is this dataset usable as a member of the collection?
//
// The contract the rest of this file relies on: anything that passes here has an
// `ecg` and a `labs` object, so downstream code may dereference them. Anything that
// does not is never admitted to the collection at all — see lcRefreshSiblings.
//
// This is the boundary, deliberately in one place. A piece whose CBOR metadata
// carries `dataset: {}` is truthy and used to sail through the old `meta.dataset`
// check, then throw inside ecgRanks or computeKarma — which does not break that
// piece, it kills the render for every piece that discovered it.
//
// Individual FIELDS are allowed to be missing or junk: computeMinMaxValues and
// ecgRanks both ignore non-finite values, so a reading that is merely incomplete
// still contributes everything it got right. Only a dataset with no usable shape
// at all is refused.
function isUsableDataset(d) {
  if (!d || typeof d !== 'object') return false;
  if (!d.ecg || typeof d.ecg !== 'object') return false;
  if (!d.labs || typeof d.labs !== 'object') return false;
  // at least one finite reading somewhere, or it carries no information
  for (const k of ECG_KEYS) if (typeof d.ecg[k] === 'number' && Number.isFinite(d.ecg[k])) return true;
  for (const k of LAB_KEYS) if (typeof d.labs[k] === 'number' && Number.isFinite(d.labs[k])) return true;
  return false;
}

// Derive min/max ranges fresh from any dataset collection.
// The collection is a living organism — only the starting datasets are fixed at inscription.
// Everything derived from them (minMaxValues, percentiles, healthIndex, karma) should
// be recomputed from the live collection as it grows with new inscriptions.
function computeMinMaxValues(allDatasets) {
  const result = {};
  for (const k of ECG_KEYS) result[k] = { min: Infinity, max: -Infinity };
  for (const k of LAB_KEYS) result[k] = { min: Infinity, max: -Infinity };
  // ONLY real numbers widen a range. This is the collection's immune system.
  //
  // These ranges are computed across the WHOLE collection and every piece
  // normalizes through them, so a single bad field in a single future reading
  // does not corrupt one piece — it corrupts every piece already on chain, for
  // ever, with no way to patch the engine. Measured on the real thirty:
  //   a newcomer missing `glucose`  -> range {NaN, NaN} -> every piece's
  //                                    normalized glucose is NaN
  //   a newcomer with glucose: null -> null coerces to 0, range silently becomes
  //                                    0..160, and piece 0 moves 0.5352 -> 0.7937
  // Neither raises an error. The second does not even look wrong.
  //
  // So skip anything that is not a finite number: a missing key, null, undefined,
  // NaN, or a string that happens to look numeric. A malformed piece is then
  // simply absent from the ranking rather than able to redefine it.
  const consider = (slot, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    slot.min = Math.min(slot.min, v);
    slot.max = Math.max(slot.max, v);
  };
  for (const d of allDatasets) {
    for (const k of ECG_KEYS) consider(result[k], d?.ecg?.[k]);
    for (const k of LAB_KEYS) consider(result[k], d?.labs?.[k]);
  }
  // A key no dataset supplied would leave {Infinity, -Infinity}, which normalizes
  // to NaN. Collapse it instead: min === max makes normalize() return 0.5.
  for (const k of Object.keys(result)) {
    if (!Number.isFinite(result[k].min) || !Number.isFinite(result[k].max)) {
      result[k].min = 0;
      result[k].max = 0;
    }
  }
  return result;
}

// Blend two datasets — all values average toward midpoint.
// Each reanimation cycle produces a genuinely new dataset that has drifted
// further from the originals. Extreme disease markers smooth out over lifetimes.
// blendDatasets(successor, predecessor, minMaxValues)
// Succession blend: successor (a) retains 70% of its own data,
// predecessor (b) leaves a 30% impression. N+1 dominant.
// healthIndex is recomputed fresh from the blended values (using live minMaxValues)
// rather than blended from the originals' stale healthIndex numbers.
function blendDatasets(a, b, minMaxValues) {
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
  };
  blended.healthIndex = minMaxValues ? calculateHealthIndex(blended, minMaxValues) : blend(a.healthIndex ?? 0.5, b.healthIndex ?? 0.5);
  return blended;
}

// Karma = accumulated disease burden of a dataset.
// Higher karma = more cycles before liberation.
// Uses disease markers weighted toward cardiac and kidney stress.
// A field that is missing or junk ranks at the midpoint rather than poisoning the
// sum with a NaN — karma feeds liberation, which decides whether a piece ever stops
// reanimating, so it must be a number for every input.
function normOr(v, range) {
  if (typeof v !== 'number' || !Number.isFinite(v) || !range) return 0.5;
  const n = normalize(v, range.min, range.max);
  return Number.isFinite(n) ? n : 0.5;
}

function computeKarma(dataset, minMaxValues) {
  const nQTc       = normOr(dataset?.ecg?.qtcInterval, minMaxValues?.qtcInterval);
  const nCreat     = normOr(dataset?.labs?.creatinine, minMaxValues?.creatinine);
  const nEGFR      = normOr(dataset?.labs?.eGFR,       minMaxValues?.eGFR);
  const nGlucose   = normOr(dataset?.labs?.glucose,    minMaxValues?.glucose);
  const nVentRate  = normOr(dataset?.ecg?.ventRate,    minMaxValues?.ventRate);
  return nQTc * 0.35 + nCreat * 0.25 + (1 - nEGFR) * 0.20 + nGlucose * 0.15 + nVentRate * 0.05;
}

// Karma cleared per rebirth = the piece's own kidney clearance.
//
// eGFR is the glomerular filtration rate: the rate at which the kidneys clear
// accumulated waste from the blood. Karma is accumulated burden. So the rate a
// piece releases burden across rebirths is not a rule invented for the lifecycle
// — it is the piece's own clearance function, read from the same lab value that
// already drives brightness, normalised against the live collection and
// recomputed every cycle from the piece's current (blended, drifted) dataset.
//
// Consequences, all of which fall out of the data rather than being legislated:
//   - Healthy kidneys release burden quickly and reach liberation in few cycles.
//   - The lowest eGFR in the collection clears 0% — such a piece cannot release
//     its own burden at all, and only ever arrives by blending toward its partner.
//   - As the creator's kidney function declines, later pieces take longer.
//
// KARMA_CLEARANCE_K is the one chosen constant: it sets the tempo, not the
// ordering. At 0.05 the collection liberates across roughly 1–16 cycles at
// mature collection size — centuries apart, nothing bunched. See
// test/liberation_model.mjs to re-derive this after any change.
const KARMA_CLEARANCE_K = 0.05;

function karmaClearanceRate(dataset, minMaxValues) {
  return KARMA_CLEARANCE_K * normOr(dataset?.labs?.eGFR, minMaxValues?.eGFR);
}

// Burden remaining after a rebirth: the karma of the piece as it now is, less
// everything cleared across every rebirth so far. `uncleared` starts at 1 and is
// carried forward by the caller — it is never stored, only replayed, so it stays
// derivable from chain state alone.
function remainingKarma(dataset, uncleared, minMaxValues) {
  return computeKarma(dataset, minMaxValues) * uncleared;
}

// Chronological drift — smooth interpolation through the real health timeline.
// Piece starts at its own snapshot and drifts forward proportionally to collection size.
// Drift span = 20% of collection size, growing as new pieces are added.
// Waxing and waning emerge naturally from the real biological trajectory.
function getAgedDataset(startIdx, lifeFraction, allDatasets, minMaxValues) {
  const span    = allDatasets.length * 0.20;
  const maxSpan = Math.max(0, allDatasets.length - 1 - startIdx);
  const pos     = startIdx + lifeFraction * Math.min(span, maxSpan);
  const lo      = Math.floor(pos);
  const hi      = Math.min(lo + 1, allDatasets.length - 1);
  const t       = pos - lo;
  if (lo === hi) return allDatasets[lo];
  const a = allDatasets[lo];
  const b = allDatasets[hi];
  const lerp = (x, y) => x + (y - x) * t;
  const aged = {
    date: 'aged',
    ecg: {
      ventRate:    lerp(a.ecg.ventRate,    b.ecg.ventRate),
      prInterval:  lerp(a.ecg.prInterval,  b.ecg.prInterval),
      qrsInterval: lerp(a.ecg.qrsInterval, b.ecg.qrsInterval),
      qtInterval:  lerp(a.ecg.qtInterval,  b.ecg.qtInterval),
      qtcInterval: lerp(a.ecg.qtcInterval, b.ecg.qtcInterval),
      pAxis:       lerp(a.ecg.pAxis,       b.ecg.pAxis),
      rAxis:       lerp(a.ecg.rAxis,       b.ecg.rAxis),
      tAxis:       lerp(a.ecg.tAxis,       b.ecg.tAxis),
    },
    labs: {
      glucose:       lerp(a.labs.glucose,       b.labs.glucose),
      nitrogen:      lerp(a.labs.nitrogen,      b.labs.nitrogen),
      creatinine:    lerp(a.labs.creatinine,    b.labs.creatinine),
      eGFR:          lerp(a.labs.eGFR,          b.labs.eGFR),
      sodium:        lerp(a.labs.sodium,        b.labs.sodium),
      potassium:     lerp(a.labs.potassium,     b.labs.potassium),
      chloride:      lerp(a.labs.chloride,      b.labs.chloride),
      carbonDioxide: lerp(a.labs.carbonDioxide, b.labs.carbonDioxide),
      calcium:       lerp(a.labs.calcium,       b.labs.calcium),
    },
  };
  aged.healthIndex = minMaxValues ? calculateHealthIndex(aged, minMaxValues) : lerp(a.healthIndex ?? 0.5, b.healthIndex ?? 0.5);
  return aged;
}

// Systemic collection influence — gentle pull toward collection average.
// New healthy pieces joining lift existing pieces; sick data pulls the other way.
// influence = 0.05 means 5% pull toward the average each evaluation.
function applyCollectionInfluence(dataset, allDatasets, lifeFraction, minMaxValues, influence = 0.05) {
  const n      = allDatasets.length;
  const pull   = influence * lifeFraction;
  const lerp   = (x, y) => x + (y - x) * pull;
  const avgLab = (key) => allDatasets.reduce((s, d) => s + d.labs[key], 0) / n;
  const avgEcg = (key) => allDatasets.reduce((s, d) => s + d.ecg[key],  0) / n;
  const influenced = {
    date: dataset.date,
    ecg: {
      ventRate:    lerp(dataset.ecg.ventRate,    avgEcg('ventRate')),
      prInterval:  lerp(dataset.ecg.prInterval,  avgEcg('prInterval')),
      qrsInterval: lerp(dataset.ecg.qrsInterval, avgEcg('qrsInterval')),
      qtInterval:  lerp(dataset.ecg.qtInterval,  avgEcg('qtInterval')),
      qtcInterval: lerp(dataset.ecg.qtcInterval, avgEcg('qtcInterval')),
      pAxis:       lerp(dataset.ecg.pAxis,       avgEcg('pAxis')),
      rAxis:       lerp(dataset.ecg.rAxis,       avgEcg('rAxis')),
      tAxis:       lerp(dataset.ecg.tAxis,       avgEcg('tAxis')),
    },
    labs: {
      glucose:       lerp(dataset.labs.glucose,       avgLab('glucose')),
      nitrogen:      lerp(dataset.labs.nitrogen,      avgLab('nitrogen')),
      creatinine:    lerp(dataset.labs.creatinine,    avgLab('creatinine')),
      eGFR:          lerp(dataset.labs.eGFR,          avgLab('eGFR')),
      sodium:        lerp(dataset.labs.sodium,        avgLab('sodium')),
      potassium:     lerp(dataset.labs.potassium,     avgLab('potassium')),
      chloride:      lerp(dataset.labs.chloride,      avgLab('chloride')),
      carbonDioxide: lerp(dataset.labs.carbonDioxide, avgLab('carbonDioxide')),
      calcium:       lerp(dataset.labs.calcium,       avgLab('calcium')),
    },
  };
  influenced.healthIndex = minMaxValues
    ? calculateHealthIndex(influenced, minMaxValues)
    : lerp(dataset.healthIndex ?? 0.5, allDatasets.reduce((s, d) => s + (d.healthIndex ?? 0.5), 0) / n);
  return influenced;
}

// Liberation threshold — 25th percentile of karma across the full collection.
// When a blended dataset's karma drops below this, the next cessation is liberation.
function computeLiberationThreshold(allDatasets, minMaxValues) {
  const sorted = allDatasets
    .map(d => computeKarma(d, minMaxValues))
    .sort((a, b) => a - b);
  return sorted[Math.floor(0.25 * sorted.length)];
}

// Health index — higher = healthier/calmer, lower = more disease burden = more intense visually.
// Primary markers: QTc (LVNC), eGFR + creatinine (kidney/med safety), vent rate (cardiac load).
// Bad markers are inverted so that stress pushes the index down.
// Derived from raw labs + current minMaxValues — recomputes when the living collection grows.
function calculateHealthIndex(data, minMaxValues) {
  const nQTc  = normalize(data.ecg.qtcInterval,    minMaxValues.qtcInterval.min,   minMaxValues.qtcInterval.max);
  const nEGFR = normalize(data.labs.eGFR,          minMaxValues.eGFR.min,          minMaxValues.eGFR.max);
  const nCr   = normalize(data.labs.creatinine,    minMaxValues.creatinine.min,    minMaxValues.creatinine.max);
  const nVent = normalize(data.ecg.ventRate,       minMaxValues.ventRate.min,      minMaxValues.ventRate.max);
  const nK    = normalize(data.labs.potassium,     minMaxValues.potassium.min,     minMaxValues.potassium.max);
  const nCO2  = normalize(data.labs.carbonDioxide, minMaxValues.carbonDioxide.min, minMaxValues.carbonDioxide.max);
  const nQRS  = normalize(data.ecg.qrsInterval,    minMaxValues.qrsInterval.min,   minMaxValues.qrsInterval.max);
  return (
    (1 - nQTc)  * 0.30 +
    nEGFR       * 0.25 +
    (1 - nCr)   * 0.15 +
    (1 - nVent) * 0.10 +
    nK          * 0.07 +
    nCO2        * 0.07 +
    (1 - nQRS)  * 0.06
  );
}

export { normalize, isUsableDataset, blendDatasets, computeKarma, computeLiberationThreshold, getAgedDataset, applyCollectionInfluence, calculateHealthIndex, computeMinMaxValues, karmaClearanceRate, remainingKarma, KARMA_CLEARANCE_K };
