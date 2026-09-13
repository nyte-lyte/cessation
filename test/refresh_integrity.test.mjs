// refresh_integrity.test.mjs — can a flaky gateway corrupt what a piece renders?
//
// Every ranking a piece draws (percentiles, min/max ranges, karma, inherited hue)
// is computed across the WHOLE collection. So if a sibling refresh silently drops
// pieces, the piece does not render "slightly stale" — it re-ranks everything
// against a collection that never existed, and stays wrong until the next refresh
// ten minutes later.
//
// `/r/metadata/<id>` answers 404 for an inscription that genuinely has no metadata
// (the engine inscription, and any other non-piece child). That is a COMPLETE
// answer meaning "not a piece". A 503, a timeout, or a dropped connection is a
// TRANSPORT FAILURE — the child may well be a piece we simply could not read.
// Collapsing those two into one `null` is what let a hiccup shrink the collection.
//
// These tests drive the real lcRefreshSiblings source from src/main.js against a
// fake chain, so they test the shipped code rather than a restatement of it.
//
// Run: node test/refresh_integrity.test.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, Report } from './harness.mjs';

const r = new Report();
const src = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

// ── Lift the real function ─────────────────────────────────────────────────
const fnSrc = src.match(/^  async function lcRefreshSiblings\(\) \{[\s\S]*?\n  \}/m);
if (!fnSrc) {
  console.log('FAIL — could not find lcRefreshSiblings in src/main.js');
  process.exit(1);
}

// A dataset shaped like the real ones, distinct per piece so re-ranking is visible.
const dsFor = (i) => ({
  date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
  ecg:  { ventRate: 60 + i, prInterval: 140 + i, qrsInterval: 80 + i, qtInterval: 380 + i,
          qtcInterval: 400 + i, pAxis: 40 + i, rAxis: 30 + i, tAxis: 50 + i },
  labs: { glucose: 90 + i, nitrogen: 12 + i, creatinine: 1 + i / 100, eGFR: 80 + i,
          sodium: 138 + (i % 5), potassium: 4 + (i % 3) / 10, chloride: 100 + (i % 4),
          carbonDioxide: 24 + (i % 3), calcium: 9 + (i % 2) / 10 },
  healthIndex: 0.5,
});

const PIECES = 30;           // pieces 0..29, all real children
const NON_PIECE = 'engine';  // a child with no metadata — a legitimate 404

// Build the fake chain: 30 pieces plus the engine inscription as a child.
const CHILD_IDS = [...Array(PIECES).keys()].map(i => `p${i}`).concat(NON_PIECE);

// cborDecode stand-in: our fake "hex" is just JSON, so the test exercises the
// refresh logic rather than re-testing the decoder (covered separately).
const cborDecode = (hex) => JSON.parse(hex);

// Run one refresh against a chain with a given failure policy.
//   failFor(id) -> 'ok' | '404' | 'fail'
async function runRefresh(failFor, startingCollection, failChildrenListing = false) {
  const lc = {
    collectionAncestors: ['root'],
    collectionDatasets:  startingCollection,
    collectionResolved:  false,
    ownDataset:          null,
  };
  const logs = [], warns = [];
  let minMaxCalls = 0;

  const fakeFetch = async (url) => {
    const kids = url.match(/^\/r\/children\/root\/inscriptions\/(\d+)$/);
    if (kids) {
      if (failChildrenListing) throw new Error('ECONNRESET');
      const page = Number(kids[1]);
      // one page, like ord returns for a collection under 100
      return { ok: true, status: 200,
               json: async () => (page === 0 ? { ids: CHILD_IDS, more: false } : { ids: [], more: false }) };
    }
    const meta = url.match(/^\/r\/metadata\/(.+)$/);
    if (meta) {
      const id = meta[1];
      const verdict = failFor(id);
      if (verdict === 'fail') throw new Error('ECONNRESET');       // transport failure
      if (verdict === '503')  return { ok: false, status: 503, json: async () => { throw new Error('no body'); } };
      if (verdict === '404')  return { ok: false, status: 404, json: async () => { throw new Error('not found'); } };
      const idx = Number(id.slice(1));
      return { ok: true, status: 200,
               json: async () => JSON.stringify({ pieceIndex: idx, dataset: dsFor(idx),
                                                  hashTail: idx, inscriptionUnix: 1700000000 + idx }) };
    }
    throw new Error('unexpected url ' + url);
  };

  const scope = {
    lc, cborDecode, fetch: fakeFetch,
    SIBLING_FETCH_BATCH: 8,
    refreshMinMaxValues: () => { minMaxCalls++; },
    recomputePartnerInheritedHue: () => {},
    lcEffectiveCollection: () => lc.collectionDatasets.map(d => d.dataset),
    console: { log: (m) => logs.push(m), warn: (m) => warns.push(m) },
  };
  const keys = Object.keys(scope);
  const body = `${fnSrc[0].replace(/^  async function lcRefreshSiblings/, 'async function lcRefreshSiblings')}
                return lcRefreshSiblings;`;
  const fn = new Function(...keys, body)(...keys.map(k => scope[k]));
  await fn();
  return { lc, logs, warns, minMaxCalls };
}

const full = () => [...Array(PIECES).keys()].map(i => ({ id: `p${i}`, pieceIndex: i, dataset: dsFor(i) }));
const solo = () => [{ id: 'p1', pieceIndex: 1, dataset: dsFor(1) }];

// ── 1. Healthy chain: all 30 pieces, engine's 404 skipped, marked resolved ──
{
  const { lc, logs } = await runRefresh(id => (id === NON_PIECE ? '404' : 'ok'), solo());
  r.checks++;
  if (lc.collectionDatasets.length !== PIECES) {
    r.fail('refresh', `healthy refresh resolved ${lc.collectionDatasets.length} pieces, expected ${PIECES}`);
  }
  r.checks++;
  if (lc.collectionResolved !== true) {
    r.fail('refresh', 'a complete refresh did not mark the collection resolved');
  }
  r.checks++;
  if (logs.some(l => /partial/.test(l))) {
    r.fail('refresh', `a complete refresh reported itself partial: ${logs.join(' | ')}`);
  }
}

// ── 2. THE BUG: transport failures must never shrink a resolved collection ──
// 20 of 30 pieces unreadable, on a piece that already holds all 30.
for (const mode of ['fail', '503']) {
  const { lc, warns } = await runRefresh(
    id => (id === NON_PIECE ? '404' : (Number(id.slice(1)) < 20 ? mode : 'ok')),
    full());
  r.checks++;
  if (lc.collectionDatasets.length !== PIECES) {
    r.fail('refresh',
      `a refresh where 20 of 30 children ${mode === 'fail' ? 'threw' : 'returned 503'} left the ` +
      `collection at ${lc.collectionDatasets.length} pieces instead of ${PIECES} — ` +
      `every percentile, range and hue the piece renders would silently re-rank ` +
      `against a collection that never existed`);
  }
  r.checks++;
  if (!warns.some(w => /incomplete/.test(w))) {
    r.fail('refresh', `an incomplete refresh (${mode}) was not reported as incomplete`);
  }
}

// ── 3. A failed children LISTING must not wipe the collection either ────────
// The listing is the one request that decides what exists at all. If it fails,
// the refresh knows nothing and must leave the resolved collection alone.
{
  const { lc, warns } = await runRefresh(id => 'ok', full(), true);
  r.checks++;
  if (lc.collectionDatasets.length !== PIECES) {
    r.fail('refresh',
      `a refresh whose children listing failed left the collection at ` +
      `${lc.collectionDatasets.length} pieces instead of ${PIECES}`);
  }
  r.checks++;
  if (!warns.some(w => /incomplete/.test(w))) {
    r.fail('refresh', 'a failed children listing was not reported as incomplete');
  }
}

// ── 4. At boot, a partial answer still beats rendering as a collection of one ─
// The piece holds only itself. 25 of 30 readable is a real improvement and must
// commit — but must NOT be marked resolved, so it is known to be provisional.
{
  const { lc, logs } = await runRefresh(
    id => (id === NON_PIECE ? '404' : (Number(id.slice(1)) < 5 ? 'fail' : 'ok')),
    solo());
  r.checks++;
  if (lc.collectionDatasets.length !== PIECES - 5) {
    r.fail('refresh',
      `at boot a partial refresh should still commit an improvement — got ` +
      `${lc.collectionDatasets.length} pieces, expected ${PIECES - 5}`);
  }
  r.checks++;
  if (lc.collectionResolved === true) {
    r.fail('refresh', 'a partial refresh marked the collection fully resolved');
  }
  r.checks++;
  if (!logs.some(l => /partial/.test(l))) {
    r.fail('refresh', 'a partial commit did not say it was partial');
  }
}

// ── 5. A genuine shrink (a piece really gone) must still be honoured ────────
// Only 10 children exist now and all answer definitively. That is the truth and
// the guard must not freeze the collection at its old size.
{
  const ORIG = CHILD_IDS.length;
  CHILD_IDS.length = 10;
  const { lc } = await runRefresh(id => 'ok', full());
  CHILD_IDS.length = 0;
  CHILD_IDS.push(...[...Array(PIECES).keys()].map(i => `p${i}`), NON_PIECE);
  r.checks++;
  if (lc.collectionDatasets.length !== 10) {
    r.fail('refresh',
      `a COMPLETE refresh returning 10 pieces was rejected (held ${lc.collectionDatasets.length}) — ` +
      `the guard must only reject INCOMPLETE refreshes, or the collection can never shrink for real reasons`);
  }
  if (ORIG !== PIECES + 1) r.fail('refresh', 'test rig corrupted CHILD_IDS');
}

// ── 6. Every child failing must leave the collection completely untouched ───
{
  const { lc } = await runRefresh(id => 'fail', full());
  r.checks++;
  if (lc.collectionDatasets.length !== PIECES) {
    r.fail('refresh', `a total outage changed the collection to ${lc.collectionDatasets.length} pieces`);
  }
}

console.log('\nRefresh integrity — can a flaky gateway corrupt what a piece renders?');
console.log('─'.repeat(72));
console.log(`${r.checks} checks, ${r.failures.length} failed\n`);
for (const f of r.failures) console.log('  FAIL  ' + f + '\n');
console.log(r.failures.length === 0
  ? 'PASS — a partial answer can never silently re-rank the collection.'
  : `FAIL — ${r.failures.length} of ${r.checks}.`);
process.exit(r.failures.length === 0 ? 0 : 1);
