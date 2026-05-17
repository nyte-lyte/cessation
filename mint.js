// mint.js — Build per-piece HTML inscription files for Cessation.
// The engine (index_bundle.js) is a separate text/javascript inscription.
// All 29 pieces are thin HTML files that load the engine via <script src>.
//
// Usage (same for all pieces):
//   node mint.js <pieceIndex> <blockHash> <blockTimestamp> <engineId> <blockHeight>
//
// pieceIndex    : 0–N (open-ended — new pieces with new health data can be added)
// blockHash     : 64-char hex string of the reference block
// blockTimestamp: Unix seconds of that block
// engineId      : inscription ID of the engine (text/javascript) inscription
// blockHeight   : block height at inscription time
//
// All 29 pieces use --parent engineId. Fill in PIECE_SATS before running.
//

// ── Per-piece sat numbers ─────────────────────────────────────────────────────
// REQUIRED — fill in the sat ordinal number for each piece before minting.
// Piece 0: Nakamoto sat (2009-01-31). Pieces 1–28: Omega black uncommon sats.
// Leave null to get an error rather than silently inscribing on the wrong sat.
const PIECE_SATS = {
  0:  null,  // Nakamoto sat — 2009-01-31
  1:  null,  // Omega black uncommon sat
  2:  null,
  3:  null,
  4:  null,
  5:  null,
  6:  null,
  7:  null,
  8:  null,
  9:  null,
  10: null,
  11: null,
  12: null,
  13: null,
  14: null,
  15: null,
  16: null,
  17: null,
  18: null,
  19: null,
  20: null,
  21: null,
  22: null,
  23: null,
  24: null,
  25: null,
  26: null,
  27: null,
  28: null,
};

'use strict';
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

// ── Parse + validate CLI args ─────────────────────────────────────────────────

const [,, rawIndex, rawHash, rawTimestamp, engineId] = process.argv;

const pieceIndex = parseInt(rawIndex, 10);
if (isNaN(pieceIndex) || pieceIndex < 0) {
  console.error('Error: pieceIndex must be 0 or greater');
  process.exit(1);
}
if (!engineId) {
  console.error('Error: engineId (5th argument) is required — the inscription ID of the engine');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(rawHash)) {
  console.error('Error: blockHash must be a 64-character hex string');
  process.exit(1);
}
const inscriptionUnixSeconds = parseInt(rawTimestamp, 10);
if (isNaN(inscriptionUnixSeconds) || inscriptionUnixSeconds < 1000000000) {
  console.error('Error: blockUnixTimestamp must be a valid Unix timestamp (seconds)');
  process.exit(1);
}

// ── Derive lastTwoHashDigits from block hash ──────────────────────────────────
// Take the last byte of the hash string (2 hex chars = 0x00..0xFF),
// map to 0..99 via proportional rounding.
const lastTwoByte = parseInt(rawHash.slice(-2), 16);        // 0..255
const lastTwoHashDigits = Math.round(lastTwoByte * 99 / 255); // 0..99

// ── Load health data in Node context ─────────────────────────────────────────
// Strip ES module syntax the same way build.js does, then eval.

function loadStripped(relPath) {
  let src = readFileSync(path.join(__dirname, relPath), 'utf8');
  src = src.replace(/^import\s+.*$/mg, '');
  src = src.replace(/^export\s*\{[^}]+\};\s*$/mg, '');
  return src;
}

const decaySrc  = loadStripped('./data/decay_logic.js');
const healthSrc = loadStripped('./data/health_data_sets.js');

const scope = {};
const setupFn = new Function(
  'scope_',
  decaySrc + '\n' + healthSrc + '\n' +
  'scope_.healthDataSets = healthDataSets;\n' +
  'scope_.minMaxValues = minMaxValues;\n' +
  'scope_.computeKarma = computeKarma;\n' +
  'scope_.computeLiberationThreshold = computeLiberationThreshold;\n' +
  'scope_.blendDatasets = blendDatasets;\n'
);
setupFn(scope);
const { healthDataSets, minMaxValues, computeKarma, computeLiberationThreshold, blendDatasets } = scope;

if (pieceIndex >= healthDataSets.length) {
  console.error(`Error: pieceIndex ${pieceIndex} out of range — only ${healthDataSets.length} datasets in health_data_sets.js`);
  console.error('Add the new health record to data/health_data_sets.js first.');
  process.exit(1);
}

// ── Replicate computeHSBFromStats from main.js ────────────────────────────────

function percentile(value, sortedArray) {
  if (sortedArray.length < 2) return 0.5;
  const rank = sortedArray.filter(v => v < value).length;
  return rank / (sortedArray.length - 1);
}

function computeHSBFromStats(dataSet, datasets) {
  const glucoseValues   = datasets.map(d => d.labs.glucose).slice().sort((a, b) => a - b);
  const potassiumValues = datasets.map(d => d.labs.potassium).slice().sort((a, b) => a - b);
  const egfrValues      = datasets.map(d => d.labs.eGFR).slice().sort((a, b) => a - b);
  return {
    hue: percentile(dataSet.labs.glucose,   glucoseValues),
    sat: percentile(dataSet.labs.potassium, potassiumValues),
    bri: percentile(dataSet.labs.eGFR,      egfrValues),
  };
}

const allInheritedHues = healthDataSets.map((_, i) =>
  computeHSBFromStats(healthDataSets[Math.max(0, i - 1)], healthDataSets).hue * 360
);

function getPartnerIndex(idx) {
  if (idx === 0) return -1;
  return idx % 2 === 0 ? idx + 1 : idx - 1;
}

function getPartnerInheritedHue(idx) {
  const p = getPartnerIndex(idx);
  if (p < 0 || p >= healthDataSets.length) return 0;
  return allInheritedHues[p];
}

// ── Compute baked values ──────────────────────────────────────────────────────

const partnerInheritedHueDeg = getPartnerInheritedHue(pieceIndex);
const BAKED_IS_LIBERATED     = 0.0;
const BAKED_VOID_PROGRESS    = 0.0;


const partnerIdx          = getPartnerIndex(pieceIndex);
const liberationThreshold = computeLiberationThreshold(healthDataSets, minMaxValues);
let karma = null;
if (partnerIdx >= 0 && partnerIdx < healthDataSets.length) {
  const [a, b] = pieceIndex % 2 === 0
    ? [healthDataSets[pieceIndex + 1], healthDataSets[pieceIndex]]
    : [healthDataSets[pieceIndex],     healthDataSets[pieceIndex - 1]];
  karma = computeKarma(blendDatasets(a, b), minMaxValues);
}

// ── Print summary ─────────────────────────────────────────────────────────────

console.log('\n=== Cessation Mint Bake ===');
console.log(`  Piece index              : ${pieceIndex}`);
console.log(`  Dataset date             : ${healthDataSets[pieceIndex].date}`);
console.log(`  Block hash (last 2 hex)  : ...${rawHash.slice(-2)} → lastTwoHashDigits = ${lastTwoHashDigits}`);
console.log(`  Inscription Unix time    : ${inscriptionUnixSeconds}  (${new Date(inscriptionUnixSeconds * 1000).toISOString()})`);
console.log(`  Partner index            : ${partnerIdx >= 0 ? partnerIdx : 'none'}`);
console.log(`  inheritedHueDeg (baked)  : ${allInheritedHues[pieceIndex].toFixed(2)}°`);
console.log(`  partnerInheritedHueDeg   : ${partnerInheritedHueDeg.toFixed(2)}°  (engine computes live, not baked)`);
if (karma !== null) {
  console.log(`  Pair karma               : ${karma.toFixed(4)}  |  threshold: ${liberationThreshold.toFixed(4)}  |  liberated at full cycle: ${karma < liberationThreshold}`);
}
console.log('');

// ── Shared: generate metadata JSON for --json-metadata flag ───────────────────
// Stored as CBOR in the inscription's metadata field — readable on-chain via /r/metadata/{id}.
// pieceIndex + hashTail + inscriptionUnix enable partner cycle computation at runtime.

const metadataObj = {
  pieceIndex:      pieceIndex,
  hashTail:        lastTwoHashDigits,
  inscriptionUnix: inscriptionUnixSeconds,
  dataset:         healthDataSets[pieceIndex],
};
const metadataName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}_metadata.json`;
const distDir  = path.join(__dirname, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir);
writeFileSync(path.join(distDir, metadataName), JSON.stringify(metadataObj, null, 2), 'utf8');
console.log(`Metadata JSON written: dist/${metadataName}`);
console.log(`  Use with: ord wallet inscribe --json-metadata dist/${metadataName}\n`);

// ── All pieces: thin HTML — loads engine via <script src="/content/{engineId}"> ──
// All 29 pieces are children of the engine inscription (--parent engineId).
// The engine is the root. Piece 0 is the genesis art piece, not the inscription parent.
// Sibling discovery at runtime: extract engineId from _sc.src, fetch /r/children/{engineId}.

// Piece's own inherited hue (glucose hue of dataset[N-1], or own hue for piece 0).
// NOTE: partnerInheritedHueDeg above is the PARTNER's hue — used for display only,
// not baked here. The engine computes it live at runtime via getPartnerInheritedHue().
const hue = allInheritedHues[pieceIndex].toFixed(4);

const blockHeight = parseInt(process.argv[6], 10);
if (isNaN(blockHeight) || blockHeight < 0) {
  console.error('Error: blockHeight required as 6th argument');
  console.error('  node mint.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>');
  process.exit(1);
}

const satNumber = PIECE_SATS[pieceIndex];
if (satNumber === null || satNumber === undefined) {
  console.error(`Error: PIECE_SATS[${pieceIndex}] is not set — fill in the sat ordinal number in mint.js before minting.`);
  process.exit(1);
}

const scriptHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}</style></head><body><script t="${pieceIndex}" ht="${lastTwoHashDigits}" unix="${inscriptionUnixSeconds}" hue="${hue}" block="${blockHeight}" src="/content/${engineId}"><\/script></body></html>`;

const outputName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}.html`;
const outputDest = path.join(distDir, outputName);
writeFileSync(outputDest, scriptHtml, 'utf8');

console.log(`HTML written: dist/${outputName}  (${scriptHtml.length} bytes)`);
console.log(`Ready to inscribe: dist/${outputName}`);
console.log(`  ord wallet inscribe --fee-rate <FEE_RATE> --sat ${satNumber} --parent ${engineId} --file dist/${outputName} --json-metadata dist/${metadataName}`);
