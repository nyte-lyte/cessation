// newcomer.test.mjs — when a NEW reading arrives, does it break the pieces already on chain?
//
// This is the risk that matters after mint. The collection is inscribed and live.
// Months later a new ECG/lab reading arrives and piece 30 is minted. Every existing
// piece discovers it, recomputes min/max and percentiles across the WHOLE collection,
// and re-renders. If the newcomer can push any uniform out of range, produce a NaN,
// or collapse a ranking, it does not break one piece — it breaks all of them, on
// chain, permanently, with no way to patch the engine.
//
// scale.test.mjs already covers the collection growing to 31/40/100/300 with a
// synthetic collection that is internally consistent. This file covers the case that
// one is not built to reach: the REAL thirty readings plus ONE newcomer that sits
// OUTSIDE every range the collection has ever seen.
//
// The newcomer is a TEST FIXTURE, not a health reading. It is derived from the real
// data (min/max of each field, pushed further out) purely to probe the edges, it is
// never written to dist/, and it is never inscribed. No invented reading goes on chain.
//
// Run: node test/newcomer.test.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, liftFromMainJs, Report } from './harness.mjs';

const r = new Report();

// ── The real thirty ────────────────────────────────────────────────────────
const strip = (t) => t.replace(/^import\s+.*$/gm, '').replace(/^export\s*\{[^}]+\};\s*$/m, '');
const decaySrc = strip(readFileSync(join(ROOT, 'data/decay_logic.js'), 'utf8'));
const realSrc  = strip(readFileSync(join(ROOT, 'data/health_data_sets.js'), 'utf8'));
// health_data_sets.js computes each reading's healthIndex with decay_logic's
// normalize(), so the two have to be lifted together.
const REAL = new Function(`${decaySrc}\n${realSrc}\nreturn healthDataSets;`)();
if (!Array.isArray(REAL) || REAL.length !== 30) {
  console.log(`FAIL — expected 30 real datasets, found ${REAL?.length}`);
  process.exit(1);
}

const ECG  = Object.keys(REAL[0].ecg);
const LABS = Object.keys(REAL[0].labs);

// Build a newcomer that is outside the collection's entire history, in one
// direction or the other, by `mult` times the observed spread.
function newcomer(dir, mult, date = '2026-12-01') {
  const ds = { date, ecg: {}, labs: {}, healthIndex: dir > 0 ? 1 : 0 };
  for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
    for (const k of keys) {
      const vals = REAL.map(d => d[group][k]).filter(Number.isFinite);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const spread = (hi - lo) || Math.abs(hi) || 1;
      ds[group][k] = dir > 0 ? hi + spread * mult : lo - spread * mult;
    }
  }
  return ds;
}

const m = liftFromMainJs(
  ['percentile', 'winsorizedPercentileForLab', 'ecgRanks', 'computeHSBFromStats'],
  { inject: `const healthDataSets = [];\nconst minMaxValues = {};` });

const decay = new Function(`${decaySrc}
  return { computeMinMaxValues, normalize, getAgedDataset, blendDatasets,
           computeLiberationThreshold, remainingKarma, karmaClearanceRate,
           applyCollectionInfluence };`)();

const finite = (v) => typeof v === 'number' ? Number.isFinite(v) : true;

// ── 1. Every normalized value must stay inside [0,1] ───────────────────────
// This is the one that would show as visible corruption on every live piece:
// the shader treats these as 0..1 and a value outside that range is out of gamut.
for (const dir of [+1, -1]) {
  for (const mult of [0.5, 5, 100]) {
    const grown = [...REAL, newcomer(dir, mult)];
    const mm = decay.computeMinMaxValues(grown);
    for (let i = 0; i < grown.length; i++) {
      for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
        for (const k of keys) {
          const range = mm[k];
          if (!range) continue;
          const n = decay.normalize(grown[i][group][k], range.min, range.max);
          r.checks++;
          if (!Number.isFinite(n) || n < -1e-9 || n > 1 + 1e-9) {
            r.fail('range',
              `with a newcomer ${dir > 0 ? 'above' : 'below'} every prior reading by ${mult}x the spread, ` +
              `piece ${i}'s normalized ${group}.${k} is ${n} — outside [0,1]. Every live piece renders ` +
              `this through the shader as an out-of-gamut uniform.`);
          }
        }
      }
    }
  }
}

// ── 2. Percentiles for the EXISTING pieces stay valid ──────────────────────
{
  const grown = [...REAL, newcomer(+1, 20)];
  for (let i = 0; i < REAL.length; i++) {
    for (const k of LABS) {
      r.checks++;
      const p = m.winsorizedPercentileForLab(grown[i], k, grown);
      if (!Number.isFinite(p) || p < -1e-9 || p > 1 + 1e-9) {
        r.fail('percentile',
          `an extreme newcomer made piece ${i}'s winsorized percentile for ${k} = ${p}`);
      }
    }
  }
}

// ── 3. ecgRanks survives and still ranks ───────────────────────────────────
{
  for (const dir of [+1, -1]) {
    const grown = [...REAL, newcomer(dir, 50)];
    const ranks = m.ecgRanks(grown);
    for (const [k, v] of Object.entries(ranks)) {
      r.checks++;
      const ok = Array.isArray(v) ? v.length === grown.length && v.every(Number.isFinite) : Number.isFinite(v);
      if (!ok) r.fail('ecg-ranks', `ecgRanks().${k} went bad with an extreme newcomer (${dir > 0 ? 'high' : 'low'})`);
    }
    // sorted arrays must still be sorted, or percentile() silently lies
    for (const k of ['qtc','pAxis','rAxis','tAxis','ventRate','pr','qrs','qrsTAngle']) {
      r.checks++;
      const v = ranks[k];
      if (!Array.isArray(v) || v.some((x, i) => i > 0 && x < v[i-1])) {
        r.fail('ecg-ranks', `ecgRanks().${k} came back unsorted with an extreme newcomer`);
      }
    }
  }
}

// ── 4. The existing pieces must MOVE, not freeze ───────────────────────────
// A newcomer that changed nothing would mean the collection is not really living.
{
  const before = decay.computeMinMaxValues(REAL);
  const after  = decay.computeMinMaxValues([...REAL, newcomer(+1, 3)]);
  let movedRanges = 0;
  for (const k of Object.keys(before)) {
    if (before[k].min !== after[k].min || before[k].max !== after[k].max) movedRanges++;
  }
  r.checks++;
  if (movedRanges === 0) {
    r.fail('living', 'a newcomer outside every prior range moved no min/max at all');
  }
  const p0Before = m.winsorizedPercentileForLab(REAL[0], 'glucose', REAL);
  const p0After  = m.winsorizedPercentileForLab(REAL[0], 'glucose', [...REAL, newcomer(+1, 3)]);
  r.checks++;
  if (p0Before === p0After) {
    r.fail('living', `piece 0's glucose percentile did not move when a newcomer arrived (${p0Before})`);
  }
}

// ── 5. Karma, threshold and the aged path stay finite ──────────────────────
{
  for (const dir of [+1, -1]) {
    const grown = [...REAL, newcomer(dir, 25)];
    const mm = decay.computeMinMaxValues(grown);
    r.checks++;
    const thr = decay.computeLiberationThreshold(grown, mm);
    if (!finite(thr)) r.fail('karma', `liberation threshold went ${thr} with an extreme newcomer`);
    for (let i = 0; i < grown.length; i++) {
      r.checks++;
      const rate = decay.karmaClearanceRate(grown[i], mm);
      if (!finite(rate) || rate < -1e-9 || rate > 1 + 1e-9) {
        r.fail('karma', `piece ${i} karma clearance rate = ${rate} with an extreme newcomer`);
      }
      r.checks++;
      const km = decay.remainingKarma(grown[i], 1, mm);
      if (!finite(km)) r.fail('karma', `piece ${i} remaining karma = ${km}`);
    }
    // the aged path is what every live piece runs every frame
    for (const lf of [0, 0.5, 1]) {
      for (const i of [0, 15, 29, 30]) {
        r.checks++;
        const aged = decay.getAgedDataset(i, lf, grown, mm);
        const bad = [];
        for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
          for (const k of keys) if (!finite(aged?.[group]?.[k])) bad.push(`${group}.${k}=${aged?.[group]?.[k]}`);
        }
        if (bad.length) r.fail('aged', `getAgedDataset(${i}, lf=${lf}) produced ${bad.slice(0,3).join(', ')}`);
      }
    }
  }
}

// ── 6. A newcomer with a missing / malformed field must not take anyone down ─
// Real data entry goes wrong. A live collection must degrade, not die.
{
  const broken = newcomer(+1, 2);
  delete broken.labs.glucose;
  broken.ecg.qtcInterval = null;
  const grown = [...REAL, broken];
  r.checks++;
  try {
    const mm = decay.computeMinMaxValues(grown);
    const ranks = m.ecgRanks(grown);
    let nan = 0;
    for (let i = 0; i < REAL.length; i++) {
      for (const k of LABS) {
        const p = m.winsorizedPercentileForLab(grown[i], k, grown);
        if (!Number.isFinite(p)) nan++;
      }
    }
    if (nan) {
      r.fail('malformed',
        `a newcomer missing one lab and with a null ECG field produced ${nan} non-finite ` +
        `percentiles across the EXISTING pieces — one bad reading would corrupt the live collection`);
    }
    r.checks++;
    if (!Number.isFinite(ranks.bunCreatP05) || !Number.isFinite(ranks.bunCreatP95)) {
      r.fail('malformed', 'ecgRanks BUN/creatinine bounds went non-finite on a malformed newcomer');
    }
  } catch (e) {
    r.fail('malformed', `a malformed newcomer THREW: ${e.message}`);
  }
}

// ── 7. THE ONE THAT MATTERS: a malformed newcomer must not poison the RANGES ─
// min/max are computed across the whole collection and every piece normalizes
// through them. If one bad field can make a range non-finite, every live piece
// renders NaN — not just the newcomer. If it can silently widen a range, every
// live piece re-ranks against a value that was never a real reading.
{
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const cases = [
    ['missing a lab field',   (d) => { delete d.labs.glucose; } ],
    ['a null lab value',      (d) => { d.labs.glucose = null; } ],
    ['an undefined ECG field',(d) => { d.ecg.qtcInterval = undefined; } ],
    ['a string lab value',    (d) => { d.labs.sodium = '138'; } ],
    ['NaN in a lab',          (d) => { d.labs.calcium = NaN; } ],
  ];
  for (const [label, wreck] of cases) {
    const bad = clone(REAL[REAL.length - 1]);
    bad.date = '2026-12-01';
    wreck(bad);
    const grown = [...REAL, bad];
    const mmClean = decay.computeMinMaxValues(REAL);
    const mm      = decay.computeMinMaxValues(grown);

    // (a) no range may go non-finite
    for (const [k, rng] of Object.entries(mm)) {
      r.checks++;
      if (!Number.isFinite(rng.min) || !Number.isFinite(rng.max)) {
        r.fail('poison',
          `a newcomer with ${label} made the ${k} range {min:${rng.min}, max:${rng.max}} — ` +
          `every piece already on chain normalizes through this and renders NaN`);
      }
    }
    // (b) no EXISTING piece may normalize to a non-finite or out-of-range value
    for (let i = 0; i < REAL.length; i++) {
      for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
        for (const k of keys) {
          const rng = mm[k]; if (!rng) continue;
          r.checks++;
          const n = decay.normalize(REAL[i][group][k], rng.min, rng.max);
          if (!Number.isFinite(n) || n < -1e-9 || n > 1 + 1e-9) {
            r.fail('poison',
              `a newcomer with ${label} made live piece ${i}'s ${group}.${k} normalize to ${n}`);
          }
        }
      }
    }
    // (c) a junk value must not silently WIDEN a range either — that re-ranks
    //     every live piece against a reading that never happened
    for (const k of Object.keys(mmClean)) {
      r.checks++;
      const widened = mm[k].min < mmClean[k].min - 1e-9 || mm[k].max > mmClean[k].max + 1e-9;
      const realExtends = Number.isFinite(bad.ecg?.[k]) || Number.isFinite(bad.labs?.[k]);
      if (widened && !realExtends) {
        r.fail('poison',
          `a newcomer with ${label} widened the ${k} range from ` +
          `[${mmClean[k].min}, ${mmClean[k].max}] to [${mm[k].min}, ${mm[k].max}] ` +
          `without contributing a real value — every live piece silently re-ranks`);
      }
    }
  }
}

console.log('\nNewcomer — does a brand-new reading break the pieces already on chain?');
console.log('─'.repeat(72));
console.log(`${r.checks} checks, ${r.failures.length} failed\n`);
const seen = new Set();
for (const f of r.failures) {
  const key = f.slice(0, 90);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('  FAIL  ' + f + '\n');
}
if (r.failures.length > seen.size) console.log(`  (+${r.failures.length - seen.size} more of the same shape)\n`);
console.log(r.failures.length === 0
  ? 'PASS — an arriving reading, however extreme, cannot corrupt the live collection.'
  : `FAIL — ${r.failures.length} of ${r.checks}.`);
process.exit(r.failures.length === 0 ? 0 : 1);
