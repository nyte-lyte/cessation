// any_reading.test.mjs — can ANY reading break the collection, not just the next one?
//
// The concern this exists to answer: testing piece 30 proves piece 30 works. Piece 31
// is a different reading and is untested again, and so is 32, and 33, for as long as
// the creator is alive. A one-off rehearsal is not protection against a recurring risk.
//
// So this file does not test A reading. It tests the SPACE of readings:
//
//   1. every reading already in data/health_data_sets.js is well formed — the file is
//      the input to every inscription, and nothing else in the suite checks it, so a
//      typo added months from now would otherwise stay green until inscription time
//   2. a fuzz over randomly generated newcomers, seeded so any failure reproduces
//   3. the adversarial values a generator will not stumble onto by chance
//
// The invariant is the same throughout, and it is about the pieces ALREADY ON CHAIN:
// whatever arrives next, no range may go non-finite, no existing piece may normalize
// outside [0,1], no ranking may go unsorted, and no karma value may go non-finite.
// The engine is immutable once inscribed; it has to be safe for every reading that
// has not been taken yet.
//
// Every generated reading is a test fixture. None is written to dist/, none is
// inscribed, and none is presented as health data.
//
// Run: node test/any_reading.test.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, liftFromMainJs, Report } from './harness.mjs';

const r = new Report();
const strip = (t) => t.replace(/^import\s+.*$/gm, '').replace(/^export\s*\{[^}]+\};\s*$/m, '');
const decaySrc = strip(readFileSync(join(ROOT, 'data/decay_logic.js'), 'utf8'));
const realSrc  = strip(readFileSync(join(ROOT, 'data/health_data_sets.js'), 'utf8'));
const REAL = new Function(`${decaySrc}\n${realSrc}\nreturn healthDataSets;`)();
const decay = new Function(`${decaySrc}
  return { computeMinMaxValues, normalize, getAgedDataset, computeLiberationThreshold,
           remainingKarma, karmaClearanceRate, computeKarma,
           // Older engines have no ingest contract. Fall back to admitting
           // everything so this file still RUNS against them and fails on the
           // real invariants rather than on a missing symbol.
           isUsableDataset: typeof isUsableDataset === 'function' ? isUsableDataset : () => true };`)();
const m = liftFromMainJs(['percentile', 'winsorizedPercentileForLab', 'ecgRanks'],
  { inject: `const healthDataSets = [];\nconst minMaxValues = {};` });

const ECG  = ['ventRate','prInterval','qrsInterval','qtInterval','qtcInterval','pAxis','rAxis','tAxis'];
const LABS = ['glucose','nitrogen','creatinine','eGFR','sodium','potassium','chloride','carbonDioxide','calcium'];

// ── 1. The data file itself ────────────────────────────────────────────────
// This is the file a future reading gets typed into. If it is wrong, everything
// downstream is wrong, and today nothing in the suite looks at it.
{
  r.checks++;
  if (!Array.isArray(REAL) || REAL.length === 0) {
    r.fail('data-file', 'healthDataSets is not a non-empty array');
  }
  const seenDates = new Map();
  REAL.forEach((d, i) => {
    r.checks++;
    if (typeof d?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      r.fail('data-file', `reading ${i}: date is ${JSON.stringify(d?.date)} — expected "YYYY-MM-DD"`);
    } else {
      // A duplicate date is not fatal but it is almost certainly a copy-paste of a
      // whole reading, which would be silently wrong rather than loudly wrong.
      if (seenDates.has(d.date)) {
        r.checks++;
        r.fail('data-file', `reading ${i} has the same date as reading ${seenDates.get(d.date)} (${d.date}) — likely a duplicated record`);
      }
      seenDates.set(d.date, i);
    }
    for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
      for (const k of keys) {
        r.checks++;
        const v = d?.[group]?.[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          r.fail('data-file', `reading ${i} (${d?.date}): ${group}.${k} is ${JSON.stringify(v)} — expected a finite number`);
        } else if (v < 0 && k !== 'pAxis' && k !== 'rAxis' && k !== 'tAxis') {
          // axes are genuinely signed; nothing else should be negative
          r.fail('data-file', `reading ${i} (${d?.date}): ${group}.${k} is negative (${v})`);
        }
      }
    }
  });
}

// ── the invariant, applied to one candidate collection ─────────────────────
function assertSurvives(candidate, label, existingCount) {
  // Model the engine's ingest: a dataset with no usable shape never joins the
  // collection (src/main.js, lcRefreshSiblings). Everything that DOES join must
  // then be survivable — that is the contract this file proves.
  const grown = candidate.filter(decay.isUsableDataset);
  r.checks++;
  if (grown.length < existingCount) {
    r.fail('invariant', `${label}: ingest filtering dropped a REAL piece (${grown.length} < ${existingCount})`);
    return false;
  }
  const mm = decay.computeMinMaxValues(grown);

  for (const [k, rng] of Object.entries(mm)) {
    r.checks++;
    if (!Number.isFinite(rng.min) || !Number.isFinite(rng.max)) {
      r.fail('invariant', `${label}: range ${k} = {${rng.min}, ${rng.max}} — every live piece normalizes through this`);
      return false;
    }
  }
  // the pieces already on chain
  for (let i = 0; i < existingCount; i++) {
    for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
      for (const k of keys) {
        const n = decay.normalize(grown[i][group][k], mm[k].min, mm[k].max);
        r.checks++;
        if (!Number.isFinite(n) || n < -1e-9 || n > 1 + 1e-9) {
          r.fail('invariant', `${label}: live piece ${i} ${group}.${k} normalized to ${n}`);
          return false;
        }
      }
    }
  }
  const ranks = m.ecgRanks(grown);
  for (const [k, v] of Object.entries(ranks)) {
    r.checks++;
    const ok = Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v);
    if (!ok) { r.fail('invariant', `${label}: ecgRanks().${k} went non-finite`); return false; }
  }
  for (const k of ['qtc','pAxis','rAxis','tAxis','ventRate','pr','qrs','qrsTAngle']) {
    r.checks++;
    const v = ranks[k];
    if (!Array.isArray(v) || v.some((x, i) => i > 0 && x < v[i-1])) {
      r.fail('invariant', `${label}: ecgRanks().${k} came back unsorted — percentile() would silently lie`);
      return false;
    }
  }
  r.checks++;
  const thr = decay.computeLiberationThreshold(grown, mm);
  if (!Number.isFinite(thr)) { r.fail('invariant', `${label}: liberation threshold = ${thr}`); return false; }

  for (let i = 0; i < existingCount; i++) {
    r.checks++;
    const rate = decay.karmaClearanceRate(grown[i], mm);
    if (!Number.isFinite(rate) || rate < -1e-9 || rate > 1 + 1e-9) {
      r.fail('invariant', `${label}: live piece ${i} karma clearance = ${rate}`); return false;
    }
    r.checks++;
    if (!Number.isFinite(decay.remainingKarma(grown[i], 1, mm))) {
      r.fail('invariant', `${label}: live piece ${i} remaining karma non-finite`); return false;
    }
  }
  for (const lf of [0, 1]) {
    r.checks++;
    const aged = decay.getAgedDataset(0, lf, grown, mm);
    for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
      for (const k of keys) {
        if (!Number.isFinite(aged?.[group]?.[k])) {
          r.fail('invariant', `${label}: getAgedDataset(0, ${lf}).${group}.${k} = ${aged?.[group]?.[k]}`);
          return false;
        }
      }
    }
  }
  return true;
}

// ── 2. Fuzz — seeded, so a failure is reproducible ─────────────────────────
{
  let seed = 0x5eed1234;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 0xffffffff); };
  const WILD = [0, 1, -1, 1e-12, 1e6, 1e12, 1e30, -1e30, 0.5, 37.5, 1e-300, 1e300];

  const ITER = 400;
  let firstFail = null;
  for (let it = 0; it < ITER && !firstFail; it++) {
    const ds = { date: '2027-01-01', ecg: {}, labs: {}, healthIndex: rnd() };
    for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
      for (const k of keys) {
        const roll = rnd();
        if (roll < 0.55) {
          // plausible-ish: somewhere around the real spread, sometimes far outside
          const vals = REAL.map(d => d[group][k]);
          const lo = Math.min(...vals), hi = Math.max(...vals);
          const span = (hi - lo) || 1;
          ds[group][k] = lo - span * 3 + rnd() * span * 7;
        } else if (roll < 0.85) {
          ds[group][k] = WILD[Math.floor(rnd() * WILD.length)] * (rnd() < 0.5 ? 1 : -1);
        } else {
          // junk: the shapes a data-entry mistake actually takes
          const junk = [null, undefined, NaN, Infinity, -Infinity, '123', '', {}, [], true];
          ds[group][k] = junk[Math.floor(rnd() * junk.length)];
        }
      }
    }
    if (rnd() < 0.15) delete ds.labs[LABS[Math.floor(rnd() * LABS.length)]];
    if (rnd() < 0.10) delete ds.ecg[ECG[Math.floor(rnd() * ECG.length)]];

    if (!assertSurvives([...REAL, ds], `fuzz#${it} (seed 0x5eed1234)`, REAL.length)) {
      firstFail = it;
    }
  }
}

// ── 3. Adversarial values a generator will not reach by chance ─────────────
{
  const NASTY = [
    ['zero everywhere',        () => 0],
    ['negative zero',          () => -0],
    ['Number.MAX_VALUE',       () => Number.MAX_VALUE],
    ['-Number.MAX_VALUE',      () => -Number.MAX_VALUE],
    ['Number.MIN_VALUE',       () => Number.MIN_VALUE],
    ['MAX_SAFE_INTEGER',       () => Number.MAX_SAFE_INTEGER],
    ['Infinity',               () => Infinity],
    ['-Infinity',              () => -Infinity],
    ['NaN',                    () => NaN],
    ['exactly the real max',   (g, k) => Math.max(...REAL.map(d => d[g][k]))],
    ['exactly the real min',   (g, k) => Math.min(...REAL.map(d => d[g][k]))],
  ];
  for (const [label, f] of NASTY) {
    const ds = { date: '2027-02-02', ecg: {}, labs: {}, healthIndex: 0.5 };
    for (const [group, keys] of [['ecg', ECG], ['labs', LABS]]) {
      for (const k of keys) ds[group][k] = f(group, k);
    }
    assertSurvives([...REAL, ds], `adversarial: ${label}`, REAL.length);
  }
  // an entirely empty / absent dataset object
  for (const [label, ds] of [['empty object', {}], ['no ecg or labs', { date: '2027-03-03' }]]) {
    r.checks++;
    try {
      assertSurvives([...REAL, ds], `adversarial: ${label}`, REAL.length);
    } catch (e) {
      r.fail('invariant', `adversarial: ${label} THREW — ${e.message}`);
    }
  }
}

// ── 4. And the collection must still be LIVING ─────────────────────────────
// All of the above is satisfied by an engine that ignores newcomers entirely.
// It must not: a real reading has to move the existing pieces.
{
  const vals = REAL.map(d => d.labs.glucose);
  const plausible = {
    date: '2027-04-04', healthIndex: 0.5,
    ecg:  Object.fromEntries(ECG.map(k => [k, REAL[0].ecg[k] * 1.08])),
    labs: Object.fromEntries(LABS.map(k => [k, REAL[0].labs[k] * 1.08])),
  };
  plausible.labs.glucose = Math.max(...vals) + 25;
  const before = m.winsorizedPercentileForLab(REAL[0], 'glucose', REAL);
  const after  = m.winsorizedPercentileForLab(REAL[0], 'glucose', [...REAL, plausible]);
  r.checks++;
  if (before === after) {
    r.fail('living', `a new reading above every prior glucose did not move piece 0's percentile (${before})`);
  }
  const mmB = decay.computeMinMaxValues(REAL);
  const mmA = decay.computeMinMaxValues([...REAL, plausible]);
  r.checks++;
  if (mmA.glucose.max <= mmB.glucose.max) {
    r.fail('living', `a real higher glucose did not widen the range (${mmB.glucose.max} -> ${mmA.glucose.max})`);
  }
}

console.log('\nAny reading — is the collection safe for readings that have not been taken yet?');
console.log('─'.repeat(74));
console.log(`${r.checks} checks, ${r.failures.length} failed\n`);
const seen = new Set();
for (const f of r.failures) {
  const key = f.replace(/#\d+/, '#N').slice(0, 100);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('  FAIL  ' + f + '\n');
}
if (r.failures.length > seen.size) console.log(`  (+${r.failures.length - seen.size} more of the same shape)\n`);
console.log(r.failures.length === 0
  ? 'PASS — no reading, real or malformed, can corrupt the pieces already on chain.'
  : `FAIL — ${r.failures.length} of ${r.checks}.`);
process.exit(r.failures.length === 0 ? 0 : 1);
