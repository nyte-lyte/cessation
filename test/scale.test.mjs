// scale.test.mjs — does the collection math survive the collection growing?
//
// This is the axis regtest cannot reach. A regtest run inscribes N pieces and
// views N pieces; the v1 engine passed exactly that and still broke the moment a
// new dataset joined the collection. Growth is the main case for this project,
// not an edge case: every piece is supposed to re-rank when a sibling appears.
//
// The test drives the pipeline the way draw() composes it, guards included —
// testing getAgedDataset() with raw out-of-range indices only proves that an
// unguarded call crashes, which tells us nothing about the engine.
//
// Run: node test/scale.test.mjs

import {
  liftModule, liftFromMainJs, makeCollection, mergedEntries, ownPosition,
  startIndexForDraw, assertDrawGuardUnchanged, initDatasetForPiece,
  assertInitDatasetGuardUnchanged, Report,
} from './harness.mjs';

const {
  computeMinMaxValues, blendDatasets, computeKarma, computeLiberationThreshold,
  getAgedDataset, applyCollectionInfluence, calculateHealthIndex,
} = liftModule('data/decay_logic.js', [
  'computeMinMaxValues', 'blendDatasets', 'computeKarma', 'computeLiberationThreshold',
  'getAgedDataset', 'applyCollectionInfluence', 'calculateHealthIndex',
]);

const { computeHSBFromStats, winsorizedPercentileForLab } =
  liftFromMainJs(['percentile', 'computeHSBFromStats', 'winsorizedPercentileForLab']);

const LAB_KEYS = ['glucose', 'nitrogen', 'creatinine', 'eGFR', 'sodium',
                  'potassium', 'chloride', 'carbonDioxide', 'calcium'];
const LIFE_FRACTIONS = [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1];

const BAKED = 30;   // healthDataSets.length at the time of inscription

const r = new Report();

// Tripwire: the harness models draw()'s startIdx guard. If that line in main.js
// changes, the model is stale and everything below is testing fiction.
assertDrawGuardUnchanged(r);

// One full pass of the render pipeline, exactly as draw() composes it.
function drawPipeline(r, ctx, ownPieceIndex, collection, mm) {
  const entries = mergedEntries(collection, ownPieceIndex);
  const dense = entries.map(e => e.dataset);
  const ownPos = ownPosition(entries, ownPieceIndex);
  const startIdx = startIndexForDraw(ownPos, ownPieceIndex, dense.length);

  r.checks++;
  if (startIdx < 0 || startIdx > dense.length - 1) {
    r.fail(ctx, `startIdx ${startIdx} is outside the collection (length ${dense.length}) — getAgedDataset will read undefined`);
    return;
  }

  for (const lf of LIFE_FRACTIONS) {
    const agedR = r.attempt(ctx, `getAgedDataset(lf=${lf})`, () =>
      getAgedDataset(startIdx, lf, dense, mm));
    if (!agedR.ok || !r.dataset(ctx, `aged(lf=${lf})`, agedR.value)) continue;

    // healthIndex is absent when getAgedDataset returns a pass-through dataset
    // (lo === hi). Consumers use `?? 0.5`, so absent is fine — but a present
    // value must be sane.
    if (agedR.value.healthIndex !== undefined) {
      r.inRange(ctx, `aged(lf=${lf}).healthIndex`, agedR.value.healthIndex, 0, 1);
    }

    const inflR = r.attempt(ctx, `applyCollectionInfluence(lf=${lf})`, () =>
      applyCollectionInfluence(agedR.value, dense, lf, mm));
    if (!inflR.ok || !r.dataset(ctx, `influenced(lf=${lf})`, inflR.value)) continue;
    const active = inflR.value;

    // applyCollectionInfluence always computes healthIndex — this one is required.
    r.inRange(ctx, `influenced(lf=${lf}).healthIndex`, active.healthIndex, 0, 1);

    const hsb = r.attempt(ctx, `computeHSBFromStats(lf=${lf})`, () =>
      computeHSBFromStats(active, dense));
    if (hsb.ok) {
      r.inRange(ctx, `hsb(lf=${lf}).hue`, hsb.value.hue, 0, 1);
      r.inRange(ctx, `hsb(lf=${lf}).sat`, hsb.value.sat, 0, 1);
      r.inRange(ctx, `hsb(lf=${lf}).bri`, hsb.value.bri, 0, 1);
    }

    for (const key of LAB_KEYS) {
      const wp = r.attempt(ctx, `winsorized(${key}, lf=${lf})`, () =>
        winsorizedPercentileForLab(active, key, dense));
      if (wp.ok) r.inRange(ctx, `winsorized.${key}(lf=${lf})`, wp.value, 0, 1);
    }

    r.inRange(ctx, `calculateHealthIndex(lf=${lf})`, calculateHealthIndex(active, mm), 0, 1);
    r.finite(ctx, `computeKarma(lf=${lf})`, computeKarma(active, mm));
  }
}

// ── 1. Steady state and growth ────────────────────────────────
// 30 is the collection as inscribed. 31 is the case that broke v1. 40 and 100
// are sustained growth — a new piece roughly every three months.
for (const n of [BAKED, BAKED + 1, 40, 100]) {
  const collection = makeCollection(n);
  const mm = computeMinMaxValues(collection);
  const ctxBase = `n=${n}`;

  for (const [key, b] of Object.entries(mm)) {
    r.finite(ctxBase, `minMax.${key}.min`, b.min);
    r.finite(ctxBase, `minMax.${key}.max`, b.max);
    r.checks++;
    if (Number.isFinite(b.min) && Number.isFinite(b.max) && b.min > b.max) {
      r.fail(ctxBase, `minMax.${key} inverted: min ${b.min} > max ${b.max}`);
    }
  }
  r.finite(ctxBase, 'computeLiberationThreshold', computeLiberationThreshold(collection, mm));

  // Own piece: first, middle, last, and — the growth case — a piece whose index
  // is past the baked array, which must get its dataset from its own metadata.
  const owners = [...new Set([0, 1, Math.floor(n / 2), n - 1, BAKED, n, n + 5])]
    .filter(i => i >= 0).sort((a, b) => a - b);
  for (const own of owners) {
    const beyondBaked = own >= BAKED;
    const beyondCollection = own > n - 1;
    const tag = beyondCollection ? ' (index past collection — sibling fetch incomplete)'
              : beyondBaked ? ' (index past baked array — new mint)' : '';
    drawPipeline(r, `${ctxBase} own=${own}${tag}`, own, collection, mm);
  }

  // Reanimation blend, including a partner past the baked array.
  for (const own of [0, 1, BAKED - 1, Math.min(BAKED, n - 1)]) {
    const partnerIdx = own % 2 === 0 ? own + 1 : own - 1;
    const a = collection[Math.min(own, n - 1)];
    const b = collection[Math.min(Math.max(partnerIdx, 0), n - 1)];
    const blend = r.attempt(`${ctxBase} blend own=${own}`, 'blendDatasets', () =>
      blendDatasets(a, b, mm));
    if (blend.ok && r.dataset(`${ctxBase} blend own=${own}`, 'blended', blend.value)) {
      r.finite(`${ctxBase} blend own=${own}`, 'blended karma', computeKarma(blend.value, mm));
    }
  }
}

// ── 2. Boot-order states ──────────────────────────────────────
// Reachable the moment draw() stops waiting on initLifecycle. At frame 1 the
// collection is the baked array alone; a few seconds later own metadata has
// landed but siblings have not. Both must render without NaN.
{
  const baked = makeCollection(BAKED);
  drawPipeline(r, 'boot: baked array only, own in range', 7, baked, computeMinMaxValues(baked));

  // A piece minted after the engine: its index exceeds the baked array and its
  // own dataset has arrived, but no siblings have.
  const ownOnly = [...baked, makeCollection(BAKED + 1)[BAKED]];
  drawPipeline(r, 'boot: baked + own only, own past baked', BAKED, ownOnly, computeMinMaxValues(ownOnly));
}

// ── 3. Growth must actually change the output ─────────────────
// The silent failure: everything renders, nothing crashes, and the piece simply
// ignores its new sibling. That is what the v3 setHSBUniforms fix addressed.
{
  const ctx = 'growth sensitivity';
  const before = makeCollection(BAKED);
  const after = makeCollection(BAKED + 1);
  const subject = before[10];

  const hsbBefore = computeHSBFromStats(subject, before);
  const hsbAfter = computeHSBFromStats(subject, after);
  r.checks++;
  if (!['hue', 'sat', 'bri'].some(k => hsbBefore[k] !== hsbAfter[k])) {
    r.fail(ctx, 'hue/sat/bri unchanged when the collection grew 30 -> 31; ranking is not reading the live collection');
  }

  const mmBefore = computeMinMaxValues(before);
  const mmAfter = computeMinMaxValues(after);
  r.checks++;
  if (!Object.keys(mmBefore).some(k =>
        mmBefore[k].min !== mmAfter[k].min || mmBefore[k].max !== mmAfter[k].max)) {
    r.fail(ctx, 'minMaxValues identical across 30 -> 31; normalisation is not tracking the collection');
  }

  // Drift span is 20% of collection length, so a longer collection must let an
  // old piece drift further. If this stops being true, chronological drift has
  // silently decoupled from collection size.
  const agedShort = getAgedDataset(10, 1, before, mmBefore);
  const agedLong  = getAgedDataset(10, 1, makeCollection(100), computeMinMaxValues(makeCollection(100)));
  r.checks++;
  if (agedShort.labs.eGFR === agedLong.labs.eGFR) {
    r.fail(ctx, 'a piece drifts to the same place in a 30-piece and a 100-piece collection; drift is not scaling with collection size');
  }
}

// ── 4. init()-time beam phase pre-advance ─────────────────────
// Not part of the collection pipeline above — this runs inside init(), before
// any frame. Every tempoFn dereferences the dataset, so if the piece's index is
// past the baked array and the lookup yields undefined, init() throws and the
// piece never renders at all. That is every piece minted after the engine.
{
  assertInitDatasetGuardUnchanged(r);

  const baked = makeCollection(BAKED);
  const mm = computeMinMaxValues(baked);
  const beams = liftFromMainJs(
    ['clamp', 'percentile', 'getBeamTempoSeconds', 'sodiumTempoSeconds', 'chlorideTempoSeconds'],
    {
      consts: ['BEAM'],
      inject: `const healthDataSets = ${JSON.stringify(baked)};
               const minMaxValues   = ${JSON.stringify(mm)};`,
    }
  );

  // 0 and 15 are ordinary. 29 is the last baked piece. 30 is the first mint
  // after the engine — the case that throws without the fallback. 45 is later
  // growth.
  for (const own of [0, 15, BAKED - 1, BAKED, 45]) {
    const ctx = `init beams own=${own}${own >= BAKED ? ' (past baked array — new mint)' : ''}`;
    const ds = initDatasetForPiece(baked, own);

    r.checks++;
    if (!ds) {
      r.fail(ctx, 'no dataset available for the beam phase pre-advance — init() will throw before the first frame');
      continue;
    }

    for (const [label, fn, args] of [
      ['getBeamTempoSeconds(NITROGEN)',   beams.getBeamTempoSeconds, [ds, beams.BEAM?.NITROGEN ?? 0]],
      ['getBeamTempoSeconds(CREATININE)', beams.getBeamTempoSeconds, [ds, 1]],
      ['getBeamTempoSeconds(CO2)',        beams.getBeamTempoSeconds, [ds, 4]],
      ['getBeamTempoSeconds(CALCIUM)',    beams.getBeamTempoSeconds, [ds, 5]],
      ['sodiumTempoSeconds',              beams.sodiumTempoSeconds,  [ds]],
      ['chlorideTempoSeconds',            beams.chlorideTempoSeconds,[ds]],
    ]) {
      const t = r.attempt(ctx, label, () => fn(...args));
      if (t.ok) {
        r.finite(ctx, label, t.value);
        r.checks++;
        if (t.value <= 0) r.fail(ctx, `${label} returned ${t.value}; a non-positive tempo divides into the phase advance`);
      }
    }
  }
}

process.exit(r.print('Scale — collection growth') ? 0 : 1);
