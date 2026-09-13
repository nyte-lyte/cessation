// engine_purity.test.mjs — does the engine render from the CHAIN, or from baked data?
//
// The architecture: each piece carries its own dataset in CBOR metadata and
// discovers its siblings on chain. The engine is meant to be pure code — the
// instructions a piece runs, holding no data of its own.
//
// It is not that yet. `src/main.js` still imports a baked 30-dataset array and
// several render-path rankings read it directly, so those rankings never move
// when the live collection grows. They agree with the chain today only because
// the baked array happens to equal the 30 pieces inscribed. They diverge at
// piece 31 — the first genuinely new health reading.
//
// THESE TESTS ARE EXPECTED TO FAIL until memory/dataless_engine_plan.md is done.
// A red run here is the bug, not a broken test.
//
// Run: node test/engine_purity.test.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, liftFromMainJs, makeCollection, Report } from './harness.mjs';

const r = new Report();
const src = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

// ── 1. Render-path functions must be pure in their collection ──────────────
//
// The strongest evidence available, because it is behavioural rather than
// textual: lift the same function twice against two DIFFERENT module-scope
// `healthDataSets` bindings and call it with an identical dataset both times.
//
// A function whose answer is determined by its arguments returns the same value
// both times. One that reaches for module-scope baked data returns something
// different — which is exactly the bug, demonstrated rather than asserted.
//
// This test stays meaningful after the refactor: whatever the new signature is,
// output must depend on what is passed in, not on what the engine was built with.

const SMALL = makeCollection(30);    // stands in for the baked array
const LARGE = makeCollection(100);   // the collection after years of growth

// BEAM is injected into scope by `consts` but not returned, so lift the real
// declaration out of the source rather than copying its values into the test.
const BEAM = new Function(
  `${src.match(/^const BEAM = [\s\S]*?\n\}\);/m)[0]}\nreturn BEAM;`)();

function liftWith(collection, names) {
  return liftFromMainJs(names, {
    consts: ['BEAM'],
    inject: `const healthDataSets = ${JSON.stringify(collection)};
             const minMaxValues = {};`,
  });
}

function comparePure(fnName, call) {
  const small = liftWith(SMALL, [fnName, 'percentile', 'computeHSBFromStats']);
  const large = liftWith(LARGE, [fnName, 'percentile', 'computeHSBFromStats']);
  // Same input dataset, same beam — only the engine's baked array differs.
  // Same dataset AND same collection handed to both — only the engine's own
  // baked array differs. A pure function cannot tell the difference.
  const probe = SMALL[10];
  const a = call(small, probe, SMALL);
  const b = call(large, probe, SMALL);
  r.checks++;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    r.fail('purity', `${fnName} returned a non-finite value (${a}, ${b})`);
    return;
  }
  if (a !== b) {
    r.fail('purity',
      `${fnName}() changes when the ENGINE's baked array changes (${a} vs ${b}) — ` +
      `its answer comes from module-scope healthDataSets, not from its arguments. ` +
      `It cannot re-rank as the on-chain collection grows.`);
  }
}

// Both are called from draw() on every frame.
comparePure('getBeamTempoSeconds',
  (m, ds, coll) => m.getBeamTempoSeconds(ds, BEAM.NITROGEN, coll));
comparePure('getBeamHueAnchorDeg',
  (m, ds, coll) => m.getBeamHueAnchorDeg(ds, BEAM.NITROGEN, coll));

// winsorizedPercentileForLab is the control: its callers pass drawCollection
// explicitly, so it should already be pure when given one. If this fails the
// problem is wider than the plan assumes.
{
  const small = liftWith(SMALL, ['winsorizedPercentileForLab', 'percentile']);
  const large = liftWith(LARGE, ['winsorizedPercentileForLab', 'percentile']);
  const probe = SMALL[10];
  const a = small.winsorizedPercentileForLab(probe, 'glucose', SMALL);
  const b = large.winsorizedPercentileForLab(probe, 'glucose', SMALL);
  r.checks++;
  if (a !== b) {
    r.fail('purity',
      `winsorizedPercentileForLab() differs (${a} vs ${b}) even when handed the same ` +
      `collection explicitly — the default parameter is leaking baked data`);
  }
}

// ── 2. The ECG / BUN rankings ──────────────────────────────────────────────
//
// These were nine `const`s inside init(), computed once from the baked array —
// unreachable by any test, which is why 14,064 passing checks never saw them.
// They are now `ecgRanks(datasets)` at top level, so they can be driven directly.

{
  const small = liftWith(SMALL, ['ecgRanks']);
  const large = liftWith(LARGE, ['ecgRanks']);

  // Pure: same collection in, same ranks out, whatever the engine was built with.
  const a = small.ecgRanks(SMALL);
  const b = large.ecgRanks(SMALL);
  r.checks++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    r.fail('ecg-ranks',
      'ecgRanks() differs between two engines handed the same collection — ' +
      'it is still reading module-scope baked data');
  }

  // Live: the ranks must actually MOVE when the collection grows. A function
  // that ignores its argument would pass the purity check above and still be
  // frozen, so this is the half that proves it re-ranks.
  const grown = small.ecgRanks(LARGE);
  r.checks++;
  if (JSON.stringify(a) === JSON.stringify(grown)) {
    r.fail('ecg-ranks',
      'ecgRanks() returned identical ranks for a 30-piece and a 100-piece ' +
      'collection — it is not following the live collection at all');
  }

  // Every field must be present and sane, or a consumer silently gets undefined.
  const EXPECT = ['qtc', 'pAxis', 'rAxis', 'tAxis', 'ventRate', 'pr', 'qrs',
                  'qrsTAngle', 'qrsTAngleMin', 'qrsTAngleMax',
                  'bunCreatP05', 'bunCreatP95'];
  for (const k of EXPECT) {
    r.checks++;
    const v = a[k];
    const ok = Array.isArray(v)
      ? v.length === SMALL.length && v.every(Number.isFinite)
      : Number.isFinite(v);
    if (!ok) r.fail('ecg-ranks', `ecgRanks().${k} is missing or not finite (${JSON.stringify(v)?.slice(0, 40)})`);
  }

  // Sorted arrays must actually be sorted — percentile() assumes it.
  for (const k of ['qtc', 'pAxis', 'rAxis', 'tAxis', 'ventRate', 'pr', 'qrs', 'qrsTAngle']) {
    r.checks++;
    const v = a[k];
    if (!Array.isArray(v) || v.some((x, i) => i > 0 && x < v[i - 1])) {
      r.fail('ecg-ranks', `ecgRanks().${k} is not sorted ascending — percentile() requires it`);
    }
  }

  // A collection of one is the real state of piece 0 before any sibling lands.
  r.checks++;
  try {
    const solo = small.ecgRanks([SMALL[0]]);
    if (!Number.isFinite(solo.bunCreatP05) || !Number.isFinite(solo.qrsTAngleMin)) {
      r.fail('ecg-ranks', 'ecgRanks() on a collection of one produced non-finite values');
    }
  } catch (e) {
    r.fail('ecg-ranks', `ecgRanks() threw on a collection of one: ${e.message}`);
  }
}

// ── 3. The engine must carry no datasets ───────────────────────────────────
//
// The point of the whole exercise. A piece holds its own data; the engine holds
// instructions. Checked against the built bundle, which is what is inscribed.

{
  r.checks++;
  const importLine = /^import\s*\{[^}]*healthDataSets[^}]*\}\s*from/m.test(src);
  if (importLine) {
    r.fail('engine-purity',
      'src/main.js imports healthDataSets at module scope — the engine still carries data');
  }
}

{
  let bundle = null;
  try { bundle = readFileSync(join(ROOT, 'index_bundle.js'), 'utf8'); } catch { /* not built */ }
  r.checks++;
  if (bundle === null) {
    r.fail('engine-purity', 'index_bundle.js not found — run `node build.js` first');
  } else {
    // The datasets are recognisable by their shape, not their name: a bundled
    // array of objects each carrying an `ecg` and a `labs` block.
    const hasData = /"?ecg"?\s*:\s*\{/.test(bundle) && /"?labs"?\s*:\s*\{/.test(bundle);
    if (hasData) {
      const approx = (bundle.match(/"?labs"?\s*:\s*\{/g) || []).length;
      r.fail('engine-purity',
        `index_bundle.js still contains baked health data (~${approx} datasets) — ` +
        `the inscribed engine is carrying ${(12655 / bundle.length * 100).toFixed(1)}% data ` +
        `that every piece already holds in its own metadata`);
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log('\nEngine purity — does the engine render from chain, or from baked data?');
console.log('─'.repeat(72));
console.log(`${r.checks} checks, ${r.failures.length} failed\n`);
for (const f of r.failures) console.log('  FAIL  ' + f + '\n');
console.log(r.failures.length === 0
  ? 'PASS — the engine is pure code and every ranking follows the live collection.'
  : `FAIL — ${r.failures.length} of ${r.checks}. Expected until dataless_engine_plan.md is done.`);
process.exit(r.failures.length === 0 ? 0 : 1);
