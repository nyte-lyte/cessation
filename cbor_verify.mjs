// Decode a piece's on-chain CBOR metadata using THE ENGINE'S OWN decoder, lifted
// from src/main.js, and compare it field by field to the local metadata JSON.
//
// It previously used a hand-rolled minimal decoder, which did not handle CBOR
// float16 and reported piece 4's potassium as 17536 (0x4480 — the half-precision
// encoding of 4.5). The engine handles float16 correctly; the verifier did not.
// Two decoders means two behaviours, so now there is one: whatever the engine does
// is what gets checked.
//
//   node cbor_verify.mjs <hex> <localMetadataPath>
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./src/main.js', import.meta.url), 'utf8');
const m = src.match(/^function cborDecode\(hex\) \{[\s\S]*?\n\}/m);
if (!m) { console.error('  could not lift cborDecode from src/main.js'); process.exit(1); }
const cborDecode = new Function(`${m[0]}; return cborDecode;`)();

const [hexRaw, metaPath] = process.argv.slice(2);
const hex = hexRaw.trim().replace(/^"|"$/g, '');
let on;
try { on = cborDecode(hex); }
catch (e) { console.error('  on-chain CBOR failed to decode with the ENGINE decoder: ' + e.message); process.exit(1); }

const local = JSON.parse(readFileSync(metaPath, 'utf8'));
const errs = [];

const keys = Object.keys(on).sort().join(',');
if (keys !== 'dataset,hashTail,inscriptionUnix,pieceIndex') errs.push(`keys on chain are ${keys}`);
if (on.pieceIndex !== local.pieceIndex)           errs.push(`pieceIndex ${on.pieceIndex} != ${local.pieceIndex}`);
if (on.hashTail !== local.hashTail)               errs.push(`hashTail ${on.hashTail} != ${local.hashTail}`);
if (on.inscriptionUnix !== local.inscriptionUnix) errs.push(`inscriptionUnix ${on.inscriptionUnix} != ${local.inscriptionUnix}`);
if (on.dataset?.date !== local.dataset.date)      errs.push(`date ${on.dataset?.date} != ${local.dataset.date}`);

// CBOR may store a value as float16/32/64, so compare as floats with a tolerance
// scaled to the value — not with ===.
for (const grp of ['ecg', 'labs']) {
  for (const [k, want] of Object.entries(local.dataset[grp])) {
    const got = on.dataset?.[grp]?.[k];
    if (typeof got !== 'number' || !Number.isFinite(got)) { errs.push(`${grp}.${k} is ${got}`); continue; }
    const tol = Math.max(Math.abs(want) * 1e-6, 1e-9);
    if (Math.abs(got - want) > tol) errs.push(`${grp}.${k} ${got} != ${want}`);
  }
}
const hi = local.dataset.healthIndex, hiOn = on.dataset?.healthIndex;
if (hi !== undefined && typeof hiOn === 'number' && Math.abs(hiOn - hi) > Math.abs(hi) * 1e-6)
  errs.push(`healthIndex ${hiOn} != ${hi}`);

if (/\/Users\/|hillyer|jess|@gmail|\.local/i.test(JSON.stringify(on)))
  errs.push('IDENTITY STRING IN ON-CHAIN METADATA');

if (errs.length) { console.error('  ' + errs.join('\n  ')); process.exit(1); }
console.log(`  metadata ✓  four keys, ${on.dataset.date}, ecg+labs match source (engine decoder), no identity`);
