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
//
// ── Per-piece thumbnail gradients ────────────────────────────────────────────
// Set a custom CSS gradient string per piece index, or leave null to use the
// auto-computed data-driven gradient (glucose hue → dark radial glow).
// Example: "radial-gradient(ellipse at 40% 55%, #a0246a 0%, #0d0408 70%)"
// Tracker-matched gradients: linear-gradient(90deg, hex1, hex2)
// hex1 = circular mean of 8 ECG field hues, hex2 = circular mean of 9 lab field hues.
// Matches exactly what cessation-tracker shows on each PieceCard thumbnail.
const CUSTOM_GRADIENTS = {
  0:  "linear-gradient(90deg, #d12acf, #c2d12a)",  // 2018-07-16
  1:  "linear-gradient(90deg, #2ad181, #d1bd2a)",  // 2018-10-04
  2:  "linear-gradient(90deg, #36d12a, #2a43d1)",  // 2019-01-24
  3:  "linear-gradient(90deg, #56d12a, #2a67d1)",  // 2019-04-24
  4:  "linear-gradient(90deg, #4ad12a, #d1632a)",  // 2019-07-31
  5:  "linear-gradient(90deg, #c12ad1, #2a95d1)",  // 2020-02-07
  6:  "linear-gradient(90deg, #d12ab2, #d12a78)",  // 2020-02-28
  7:  "linear-gradient(90deg, #d15b2a, #d1452a)",  // 2020-03-13
  8:  "linear-gradient(90deg, #3b2ad1, #3f2ad1)",  // 2020-05-22
  9:  "linear-gradient(90deg, #2a44d1, #d12ab3)",  // 2020-08-11
  10: "linear-gradient(90deg, #d14b2a, #2a9ad1)",  // 2020-11-12
  11: "linear-gradient(90deg, #c82ad1, #d1a92a)",  // 2021-02-24
  12: "linear-gradient(90deg, #2ad157, #2c2ad1)",  // 2021-09-01
  13: "linear-gradient(90deg, #d19c2a, #d1492a)",  // 2021-12-01
  14: "linear-gradient(90deg, #d12a6d, #d1862a)",  // 2022-02-14
  15: "linear-gradient(90deg, #2ad170, #d1482a)",  // 2022-05-13
  16: "linear-gradient(90deg, #d18d2a, #2aafd1)",  // 2022-08-25
  17: "linear-gradient(90deg, #d12a7b, #d1652a)",  // 2023-06-12
  18: "linear-gradient(90deg, #2a84d1, #d1672a)",  // 2023-09-05
  19: "linear-gradient(90deg, #8cd12a, #81d12a)",  // 2023-12-05
  20: "linear-gradient(90deg, #d12ad0, #2cd12a)",  // 2024-02-05
  21: "linear-gradient(90deg, #2ad1bf, #91d12a)",  // 2024-06-10
  22: "linear-gradient(90deg, #d12ab2, #bfd12a)",  // 2024-09-16
  23: "linear-gradient(90deg, #2a6ed1, #2ad16b)",  // 2024-12-30
  24: "linear-gradient(90deg, #d12a36, #2ad1a0)",  // 2025-03-26
  25: "linear-gradient(90deg, #d12a89, #2ad132)",  // 2025-06-18
  26: "linear-gradient(90deg, #d12a4a, #d18a2a)",  // 2025-09-12
  27: "linear-gradient(90deg, #2a9fd1, #2a2bd1)",  // 2025-12-11
  28: "linear-gradient(90deg, #2a35d1, #2ab7d1)",  // 2026-03-20
};

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

// ── Compute baked values ──────────────────────────────────────────────────────

const partnerInheritedHueDeg = getPartnerInheritedHue(pieceIndex);
const BAKED_IS_LIBERATED     = 0.0;
const BAKED_VOID_PROGRESS    = 0.0;

// Preview gradient — custom override or auto-computed from glucose hue
const _autoHue = Math.round(computeHSBFromStats(healthDataSets[pieceIndex], healthDataSets).hue * 360);
const previewGradient = CUSTOM_GRADIENTS[pieceIndex] ||
  `radial-gradient(ellipse at 50% 60%, hsl(${_autoHue}, 55%, 22%) 0%, hsl(${_autoHue}, 40%, 8%) 70%)`;

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

// ── Piece 0: bake full engine bundle ─────────────────────────────────────────

if (pieceIndex === 0) {
  const mainJsPath = path.join(__dirname, 'src', 'main.js');
  let mainJs = readFileSync(mainJsPath, 'utf8');
  const mainJsOriginal = mainJs;

  function bakeValue(src, marker, value, all = false) {
    const re = new RegExp(`(/\\*BAKE:${marker}\\*/)([^;,)\\n]+)`, all ? 'g' : '');
    if (!re.test(src)) throw new Error(`Bake marker not found: BAKE:${marker}`);
    return src.replace(new RegExp(`(/\\*BAKE:${marker}\\*/)([^;,)\\n]+)`, all ? 'g' : ''), `$1${value}`);
  }

  mainJs = bakeValue(mainJs, 'DATASET_INDEX',    pieceIndex);
  mainJs = bakeValue(mainJs, 'HASH_DIGITS',      lastTwoHashDigits);
  mainJs = bakeValue(mainJs, 'INSCRIPTION_UNIX', inscriptionUnixSeconds);
  mainJs = bakeValue(mainJs, 'IS_LIBERATED',     BAKED_IS_LIBERATED.toFixed(1));
  mainJs = bakeValue(mainJs, 'VOID_PROGRESS',    BAKED_VOID_PROGRESS.toFixed(1));

  writeFileSync(mainJsPath, mainJs, 'utf8');
  console.log('Patched src/main.js.');

  try {
    execSync(`"${process.execPath}" build.js`, { stdio: 'pipe', cwd: __dirname });
  } catch (e) {
    writeFileSync(mainJsPath, mainJsOriginal, 'utf8');
    console.error('\nBuild failed:', e.message);
    if (e.output) console.error(e.output.map(b => b?.toString()).join('\n'));
    process.exit(1);
  }

  const outputName = `cessation_piece_00.html`;
  const outputDest = path.join(distDir, outputName);
  // Inject thumbnail gradient as CSS (visible before WebGL loads, used by ord's renderer)
  let bundleHtml = readFileSync(path.join(__dirname, 'index_bundle.html'), 'utf8');
  bundleHtml = bundleHtml.replace('</head>', `<style>#canvas,canvas{background:${previewGradient};}</style></head>`);
  writeFileSync(outputDest, bundleHtml, 'utf8');

  writeFileSync(mainJsPath, mainJsOriginal, 'utf8');
  console.log('Restored src/main.js to dev defaults.\n');
  console.log(`Ready to inscribe: dist/${outputName}`);
  console.log(`  ord wallet inscribe --fee-rate <FEE_RATE> --file dist/${outputName} --json-metadata dist/${metadataName}\n`);

} else {
  // ── Pieces 1-28: thin iframe HTML — embeds piece 0 with params in URL hash ──
  // Usage: node mint.js <index> <hash> <unixTimestamp> <inscription0Id> <blockHeight>
  //
  // The iframe loads piece 0's HTML at /content/{piece0Id}#idx=N&ht=H&unix=U&hue=D&block=B
  // Inside the iframe, piece 0's engine reads the hash and renders as piece N.
  // /r/children/self inside the iframe resolves to piece 0's children — correct.
  //
  const inscription0Id = process.argv[5];
  const blockHeight    = parseInt(process.argv[6], 10);
  if (!inscription0Id) {
    console.error('Error: pieces 1-28 require a 4th argument — the inscription 0 ID');
    console.error('  node mint.js 3 <blockHash> <blockTimestamp> <inscription0Id> <blockHeight>');
    process.exit(1);
  }
  if (isNaN(blockHeight) || blockHeight < 0) {
    console.error('Error: pieces 1-28 require a 5th argument — the block height at inscription time');
    console.error('  node mint.js 3 <blockHash> <blockTimestamp> <inscription0Id> <blockHeight>');
    process.exit(1);
  }

  const hue = partnerInheritedHueDeg.toFixed(4);
  const hashParams = `idx=${pieceIndex}&ht=${lastTwoHashDigits}&unix=${inscriptionUnixSeconds}&hue=${hue}&block=${blockHeight}`;
  const iframeHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;}body{background:${previewGradient};}iframe{display:block;width:100vw;height:100vh;border:0;}</style></head><body><iframe src="/content/${inscription0Id}#${hashParams}" scrolling="no"></iframe></body></html>`;

  const outputName = `cessation_piece_${String(pieceIndex).padStart(2, '0')}.html`;
  const outputDest = path.join(distDir, outputName);
  writeFileSync(outputDest, iframeHtml, 'utf8');

  console.log(`iframe payload written: dist/${outputName}  (${iframeHtml.length} bytes)`);
  console.log(`Ready to inscribe: dist/${outputName}`);
  console.log(`  ord wallet inscribe --fee-rate <FEE_RATE> --parent ${inscription0Id} --file dist/${outputName} --json-metadata dist/${metadataName}\n`);
}
