// liberation_model.mjs — what fraction of the collection ever reaches liberation,
// and how that changes as the collection grows.
//
// Not a pass/fail test. It is a design instrument: run it after changing the
// blend weight, the karma weights, or the threshold percentile, and see what it
// does to the distribution.
//
// Mechanism worth holding in mind while reading the output:
//   blendDatasets is a * 0.70 + b * 0.30, so iterating x <- 0.7x + 0.3p converges
//   geometrically to the PARTNER's values. A piece's karma therefore converges to
//   its partner's karma. Liberation needs karma < threshold, so in the limit a
//   piece liberates roughly when its partner's burden is below the threshold —
//   and the threshold is the 25th percentile. That is the structural reason the
//   fraction sits near a quarter rather than a half.
//
// Run: node test/liberation_model.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = s => s.replace(/^import\s+.*$/gm, '').replace(/^export\s*\{[^}]+\};?\s*$/gm, '');

const env = new Function(`
  ${strip(readFileSync(join(ROOT, 'data/decay_logic.js'), 'utf8'))}
  ${strip(readFileSync(join(ROOT, 'data/health_data_sets.js'), 'utf8'))}
  return { healthDataSets, blendDatasets, computeKarma, computeLiberationThreshold,
           computeMinMaxValues, getAgedDataset, applyCollectionInfluence,
           calculateHealthIndex };
`)();

const {
  healthDataSets: REAL, blendDatasets, computeKarma, computeLiberationThreshold,
  computeMinMaxValues, getAgedDataset, applyCollectionInfluence,
} = env;

const ECG  = ['ventRate','prInterval','qrsInterval','qtInterval','qtcInterval','pAxis','rAxis','tAxis'];
const LABS = ['glucose','nitrogen','creatinine','eGFR','sodium','potassium','chloride','carbonDioxide','calcium'];
const MAX_CYCLES = 400;

// A cycle is one lifespan, not one block. Lifespans are triangular(3, 100, mode 28),
// median around 42 years, so cycle counts translate into centuries — nobody alive
// watches a piece liberate. The spread across cycles is the shape of the system,
// which is why "everything liberates on cycle 1" reads as broken even though no
// observer would ever see the difference in their own lifetime.
const MEDIAN_LIFESPAN_YEARS = 42;

// Mirrors blendDatasets (data/decay_logic.js:41) with the self-weight exposed.
// Shipping value is 0.70. Iterating x <- w*x + (1-w)*p converges to the partner
// geometrically at rate w, so w is precisely the knob that sets how many cycles
// a piece takes to cross the threshold — and therefore how spread out liberation
// is across the collection.
function blendWith(w, a, b, mm) {
  const f = (x, y) => x * w + y * (1 - w);
  const out = { date: 'blended', ecg: {}, labs: {} };
  for (const k of ECG)  out.ecg[k]  = f(a.ecg[k],  b.ecg[k]);
  for (const k of LABS) out.labs[k] = f(a.labs[k], b.labs[k]);
  out.healthIndex = env.calculateHealthIndex ? env.calculateHealthIndex(out, mm) : undefined;
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const partnerOf = i => (i === 0 ? -1 : (i % 2 === 0 ? i + 1 : i - 1));

// Deterministic noise so runs are comparable.
let _seed = 12345;
const rand = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

// Least-squares slope/intercept of a metric across the real collection.
function trend(values) {
  const n = values.length, xs = [...Array(n).keys()];
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (values[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

const TRENDS = {};
for (const k of ECG)  TRENDS[`ecg.${k}`]  = trend(REAL.map(d => d.ecg[k]));
for (const k of LABS) TRENDS[`labs.${k}`] = trend(REAL.map(d => d.labs[k]));

// Spread of each metric, used to size the noise on generated future readings.
const SD = {};
for (const path of Object.keys(TRENDS)) {
  const [g, k] = path.split('.');
  const vals = REAL.map(d => d[g][k]);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  SD[path] = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length);
}

// Future readings are unknowable, so model three futures rather than pretend one.
//   decline  — the trend in the real data continues
//   plateau  — health holds at the recent average
//   recovery — the trend reverses at half rate
const SCENARIOS = {
  decline:  (path, i) => TRENDS[path].intercept + TRENDS[path].slope * i,
  plateau:  (path)    => { const [g, k] = path.split('.'); const tail = REAL.slice(-5).map(d => d[g][k]); return tail.reduce((a, b) => a + b, 0) / tail.length; },
  recovery: (path, i) => TRENDS[path].intercept + TRENDS[path].slope * (REAL.length - 1) - TRENDS[path].slope * (i - REAL.length + 1) * 0.5,
};

function makeFuture(i, scenario) {
  const ds = { date: `projected-${i}`, ecg: {}, labs: {} };
  for (const k of ECG)  { const p = `ecg.${k}`;  ds.ecg[k]  = SCENARIOS[scenario](p, i) + (rand() - 0.5) * SD[p] * 0.6; }
  for (const k of LABS) { const p = `labs.${k}`; ds.labs[k] = SCENARIOS[scenario](p, i) + (rand() - 0.5) * SD[p] * 0.6; }
  return ds;
}

function grownCollection(n, scenario) {
  _seed = 12345;
  const out = REAL.slice();
  for (let i = REAL.length; i < n; i++) out.push(makeFuture(i, scenario));
  return out;
}

// Does piece i ever liberate, given the collection as it stands?
// The piece is evaluated at end of life — drifted and collection-influenced —
// because that is its state when cessation and reanimation happen.
function simulate(i, collection, mm, threshold) {
  const p = partnerOf(i);
  if (p < 0) return { liberates: true, cycles: 0, genesis: true };
  if (p >= collection.length) return { liberates: false, cycles: null, noPartner: true };

  let ds = applyCollectionInfluence(getAgedDataset(i, 1, collection, mm), collection, 1, mm);
  const partnerDs = applyCollectionInfluence(getAgedDataset(p, 1, collection, mm), collection, 1, mm);

  for (let c = 1; c <= MAX_CYCLES; c++) {
    ds = blendDatasets(ds, partnerDs, mm);
    if (computeKarma(ds, mm) < threshold) return { liberates: true, cycles: c };
  }
  return { liberates: false, cycles: null };
}

function report(scenario) {
  console.log(`\n${scenario.toUpperCase()}`);
  console.log('  size   threshold   liberate   of original 30   median cycles');
  console.log('  ' + '─'.repeat(64));
  for (const n of [30, 40, 60, 90, 120]) {
    const collection = grownCollection(n, scenario);
    const mm = computeMinMaxValues(collection);
    const threshold = computeLiberationThreshold(collection, mm);

    let lib = 0, libOriginal = 0;
    const cycles = [];
    for (let i = 0; i < n; i++) {
      const res = simulate(i, collection, mm, threshold);
      if (res.liberates) { lib++; if (i < REAL.length) libOriginal++; if (res.cycles) cycles.push(res.cycles); }
    }
    cycles.sort((a, b) => a - b);
    const med = cycles.length ? cycles[Math.floor(cycles.length / 2)] : '—';
    const pct = (lib / n * 100).toFixed(0).padStart(3);
    const pctOrig = (libOriginal / REAL.length * 100).toFixed(0).padStart(3);
    console.log(`  ${String(n).padStart(4)}   ${threshold.toFixed(4)}      ${pct}%          ${pctOrig}%             ${String(med).padStart(3)}`);
  }
}

console.log(`Liberation reach — ${REAL.length} real pieces, projected forward.`);
console.log(`Threshold = 25th percentile of collection karma. Cycle cap ${MAX_CYCLES}.`);
for (const s of Object.keys(SCENARIOS)) report(s);

// ── Blend weight vs spread ────────────────────────────────────
// Two independent knobs. The threshold percentile sets HOW MANY pieces ever
// liberate. The blend weight sets HOW SPREAD OUT those liberations are across
// cycles — i.e. across centuries. Shipping today: w = 0.70, threshold = 25th.
console.log('\n\nBLEND WEIGHT vs SPREAD  (decline, 60 pieces)');
console.log('  Cycles to liberation, across pieces that reach it.');
console.log('  1 cycle ~ 42 years, so the p75 column is the long tail of the system.\n');
for (const pct of [0.25, 0.40]) {
  const collection = grownCollection(60, 'decline');
  const mm = computeMinMaxValues(collection);
  const karmas = collection.map(d => computeKarma(d, mm)).sort((a, b) => a - b);
  const threshold = karmas[Math.floor(pct * karmas.length)];

  console.log(`  threshold = ${(pct * 100).toFixed(0)}th percentile (${threshold.toFixed(4)})`);
  console.log('    self-weight   liberate   cycles p25 / median / p75 / max      median in years');
  console.log('    ' + '─'.repeat(76));

  for (const w of [0.70, 0.80, 0.85, 0.90, 0.95, 0.97]) {
    let lib = 0;
    const cycles = [];
    for (let i = 0; i < collection.length; i++) {
      const p = partnerOf(i);
      if (p < 0) { lib++; continue; }               // genesis liberates directly
      if (p >= collection.length) continue;
      let ds = applyCollectionInfluence(getAgedDataset(i, 1, collection, mm), collection, 1, mm);
      const pd = applyCollectionInfluence(getAgedDataset(p, 1, collection, mm), collection, 1, mm);
      for (let c = 1; c <= MAX_CYCLES; c++) {
        ds = blendWith(w, ds, pd, mm);
        if (computeKarma(ds, mm) < threshold) { lib++; cycles.push(c); break; }
      }
    }
    cycles.sort((a, b) => a - b);
    const med = quantile(cycles, 0.5);
    const cells = `${String(quantile(cycles, 0.25) ?? '—').padStart(3)} / ${String(med ?? '—').padStart(4)} / ${String(quantile(cycles, 0.75) ?? '—').padStart(4)} / ${String(cycles.length ? cycles[cycles.length - 1] : '—').padStart(4)}`;
    const years = med ? `~${(med * MEDIAN_LIFESPAN_YEARS).toLocaleString()} yrs` : '—';
    const mark = w === 0.70 ? '  <- shipping' : '';
    console.log(`    ${w.toFixed(2).padStart(9)}   ${(lib / collection.length * 100).toFixed(0).padStart(6)}%   ${cells}          ${years.padStart(12)}${mark}`);
  }
  console.log('');
}

// What would it take to get most pieces there? The threshold percentile is the
// single knob that moves this without touching the art's data model.
console.log('\n\nTHRESHOLD PERCENTILE vs REACH (decline scenario, 60 pieces)');
console.log('  percentile   threshold   liberate');
console.log('  ' + '─'.repeat(40));
{
  const collection = grownCollection(60, 'decline');
  const mm = computeMinMaxValues(collection);
  const karmas = collection.map(d => computeKarma(d, mm)).sort((a, b) => a - b);
  for (const pct of [0.25, 0.40, 0.50, 0.60, 0.75, 0.90]) {
    const threshold = karmas[Math.floor(pct * karmas.length)];
    let lib = 0;
    for (let i = 0; i < collection.length; i++) if (simulate(i, collection, mm, threshold).liberates) lib++;
    console.log(`  ${(pct * 100).toFixed(0).padStart(8)}%   ${threshold.toFixed(4)}      ${(lib / collection.length * 100).toFixed(0).padStart(3)}%`);
  }
}
