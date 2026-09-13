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
  const probe = SMALL[10];
  const a = call(small, probe);
  const b = call(large, probe);
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
  (m, ds) => m.getBeamTempoSeconds(ds, BEAM.NITROGEN));
comparePure('getBeamHueAnchorDeg',
  (m, ds) => m.getBeamHueAnchorDeg(ds, BEAM.NITROGEN));

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

// ── 2. The init-time ECG rankings ──────────────────────────────────────────
//
// These are closure variables inside init(), so no test can call them: the same
// architecture that stops them updating stops them being driven. Until they are
// hoisted to take a collection argument, a source guard is the only check
// available — and their unreachability is itself the finding.

const INIT_RANKINGS = [
  'allBunCreatRatios', 'sortedQtcValues', 'sortedPAxisValues', 'sortedRAxisValues',
  'sortedTAxisValues', 'sortedVentRateValues', 'sortedPRValues', 'sortedQRSValues',
  'allQrsTAngles',
];

for (const name of INIT_RANKINGS) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([\\s\\S]{0,120})`));
  r.checks++;
  if (!m) {
    r.fail('init-rankings', `${name} no longer exists in src/main.js — update this test`);
  } else if (/healthDataSets/.test(m[1])) {
    r.fail('init-rankings',
      `${name} is computed from the baked healthDataSets at init and never recomputed — ` +
      `it cannot re-rank when the live collection grows`);
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
