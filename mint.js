// mint.js — Bake per-piece chain values into main.js and build the inscription bundle.
// Usage: node mint.js <pieceIndex> <blockHash> <blockUnixTimestamp>
// Example: node mint.js 3 000000000000000000029abc...f7e4 1712345678
//
// pieceIndex       : 0–28
// blockHash        : 64-char hex string of the reference block
// blockUnixTimestamp : Unix seconds of that block (bitcoin block `time` field)
//
// Output: dist/cessation_piece_XX.html — ready to inscribe.
// main.js is restored to dev defaults after the build.

'use strict';
const { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// ── Parse + validate CLI args ─────────────────────────────────────────────────

const [,, rawIndex, rawHash, rawTimestamp] = process.argv;

const pieceIndex = parseInt(rawIndex, 10);
if (isNaN(pieceIndex) || pieceIndex < 0 || pieceIndex > 28) {
  console.error('Error: pieceIndex must be 0–28');
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
  console.error(`Error: pieceIndex ${pieceIndex} out of range (${healthDataSets.length} datasets)`);
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

// ── Compute reanimationCycleSeconds ──────────────────────────────────────────
// Karma of the blended pair determines cycle length.
// Range: 30 days (healthy pair) → 3 years (heavy disease burden).

const CYCLE_MIN_SECS = 30  * 24 * 3600;       // 30 days
const CYCLE_MAX_SECS = 3 * 365 * 24 * 3600;   // 3 years

function computeReanimationCycleSeconds(idx) {
  const p = getPartnerIndex(idx);
  if (p < 0 || p >= healthDataSets.length) return 0; // genesis or unpaired
  const [a, b] = idx % 2 === 0
    ? [healthDataSets[idx + 1], healthDataSets[idx]]
    : [healthDataSets[idx],     healthDataSets[idx - 1]];
  const blended = blendDatasets(a, b);
  const karma   = computeKarma(blended, minMaxValues);
  return Math.round(CYCLE_MIN_SECS + karma * (CYCLE_MAX_SECS - CYCLE_MIN_SECS));
}

// ── Compute all baked values ──────────────────────────────────────────────────

const partnerInheritedHueDeg  = getPartnerInheritedHue(pieceIndex);
const reanimationCycleSeconds = computeReanimationCycleSeconds(pieceIndex);
const BAKED_IS_LIBERATED      = 0.0;
const BAKED_VOID_PROGRESS     = 0.0;

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
console.log(`  partnerInheritedHueDeg   : ${partnerInheritedHueDeg.toFixed(2)}°`);
console.log(`  reanimationCycleSeconds  : ${reanimationCycleSeconds}  (${(reanimationCycleSeconds / 86400).toFixed(1)} days)`);
if (karma !== null) {
  console.log(`  Pair karma               : ${karma.toFixed(4)}  |  threshold: ${liberationThreshold.toFixed(4)}  |  liberated at full cycle: ${karma < liberationThreshold}`);
}
console.log('');

// ── Patch main.js ─────────────────────────────────────────────────────────────

const mainJsPath = path.join(__dirname, 'src', 'main.js');
let mainJs = readFileSync(mainJsPath, 'utf8');
const mainJsOriginal = mainJs;

function bakeValue(src, marker, value) {
  const re = new RegExp(`(/\\*BAKE:${marker}\\*/)([^;,)\\n]+)`);
  if (!re.test(src)) throw new Error(`Bake marker not found: BAKE:${marker}`);
  return src.replace(re, `$1${value}`);
}

mainJs = bakeValue(mainJs, 'DATASET_INDEX',        pieceIndex);
mainJs = bakeValue(mainJs, 'HASH_DIGITS',          lastTwoHashDigits);
mainJs = bakeValue(mainJs, 'INSCRIPTION_UNIX',     inscriptionUnixSeconds);
mainJs = bakeValue(mainJs, 'REANIMATE_CYCLE_SECS', reanimationCycleSeconds);
mainJs = bakeValue(mainJs, 'IS_LIBERATED',         BAKED_IS_LIBERATED.toFixed(1));
mainJs = bakeValue(mainJs, 'VOID_PROGRESS',        BAKED_VOID_PROGRESS.toFixed(1));

writeFileSync(mainJsPath, mainJs, 'utf8');
console.log('Patched src/main.js.');

// ── Build ─────────────────────────────────────────────────────────────────────

try {
  execSync(`"${process.execPath}" build.js`, { stdio: 'pipe', cwd: __dirname });
} catch (e) {
  // Restore main.js before exiting on build failure
  writeFileSync(mainJsPath, mainJsOriginal, 'utf8');
  console.error('\nBuild failed:', e.message);
  if (e.output) console.error(e.output.map(b => b?.toString()).join('\n'));
  process.exit(1);
}

// ── Copy output to dist/ ──────────────────────────────────────────────────────

const distDir  = path.join(__dirname, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir);

const outputName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}.html`;
const outputDest = path.join(distDir, outputName);
copyFileSync(path.join(__dirname, 'index_bundle.html'), outputDest);

// ── Restore main.js to dev defaults ──────────────────────────────────────────

writeFileSync(mainJsPath, mainJsOriginal, 'utf8');
console.log('Restored src/main.js to dev defaults.\n');
console.log(`Ready to inscribe: dist/${outputName}\n`);
