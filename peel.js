// peel.js — split a contiguous rare sat range into single-sat carriers.
//
// A carrier is a UTXO whose FIRST sat is rare and whose remainder is common
// padding, so transaction fees (taken from the end of the sat stream) eat the
// padding and never the rare sat. That is the shape the v1/v2 mint used and the
// only shape safe to inscribe on. See memory/inscribe.md.
//
// Common padding cannot be interleaved between contiguous rare sats inside one
// transaction — the range arrives as an uninterrupted run, so an output boundary
// can only cut it. Hence two rounds per sat, both of which batch:
//
//   split   one tx  : range -> K chunks, each >= 331 sats
//   round B one tx  : K chunks -> K "tails"  (rare sat at the END of an output)
//   round C one tx  : K tails  -> K carriers (rare sat at offset 0 + padding)
//
// Each B+C pair yields K carriers, so N carriers take ~2*ceil(N/K) transactions.
//
// Usage:
//   node peel.js plan   --range <txid:vout> --carriers 120 --chunks 12 [--fee-rate 1]
//   node peel.js split  [--broadcast]
//   node peel.js round  [--broadcast]        # one B+C pair -> K more carriers
//   node peel.js status
//
// DRY RUN BY DEFAULT. Nothing is broadcast without --broadcast.
// State lives in peel_state.json next to this file.

'use strict';
const { execFileSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  network:  process.env.PEEL_NETWORK  || 'regtest',            // regtest | mainnet
  datadir:  process.env.PEEL_DATADIR  || 'ord-env',
  wallet:   process.env.PEEL_WALLET   || 'ord',
  ordUrl:   process.env.PEEL_ORD_URL  || 'http://127.0.0.1:9001',
};

const DUST = 330;          // P2TR dust floor
const PADDING = DUST - 1;  // common sats behind the rare sat in a carrier
const STATE = path.join(__dirname, 'peel_state.json');

// ── Fee estimation (P2TR key-path spends) ────────────────────────────────────
const vsize = (nIn, nOut) => Math.ceil(11 + 57.5 * nIn + 43 * nOut);
const feeFor = (nIn, nOut, rate) => Math.max(vsize(nIn, nOut) * rate, 200);

// ── RPC ──────────────────────────────────────────────────────────────────────
function bcli(args, useWallet = false) {
  const base = [`-datadir=${CFG.datadir}`];
  if (CFG.network === 'regtest') base.push('-regtest');
  if (useWallet) base.push(`-rpcwallet=${CFG.wallet}`);
  const out = execFileSync('bitcoin-cli', [...base, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return out.trim();
}
const bjson = (args, w = false) => { const s = bcli(args, w); return s ? JSON.parse(s) : null; };

function ordOutput(outpoint) {
  const out = execFileSync('curl', ['-sS', '--max-time', '30', '-H', 'Accept: application/json',
    `${CFG.ordUrl}/output/${outpoint}`], { encoding: 'utf8' });
  try { return JSON.parse(out); } catch { return null; }
}

// how many sats of [lo,hi] does this output hold, and does it START with one
function rareIn(outpoint, lo, hi) {
  const d = ordOutput(outpoint);
  if (!d) return { count: 0, startsRare: false, value: 0 };
  const ranges = d.sat_ranges || [];
  let count = 0;
  for (const [a, b] of ranges) {
    const s = Math.max(a, lo), e = Math.min(b - 1, hi);
    if (s <= e) count += e - s + 1;
  }
  const startsRare = ranges.length > 0 && ranges[0][0] >= lo && ranges[0][0] <= hi;
  return { count, startsRare, value: d.value, ranges };
}

// ── State ────────────────────────────────────────────────────────────────────
const loadState = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

// ── Wallet helpers ───────────────────────────────────────────────────────────
function newAddress() {
  // taproot only — matches how the ord wallet is built
  return bcli(['getnewaddress', '', 'bech32m'], true);
}
function cardinals(minSat, exclude = new Set()) {
  const u = bjson(['listunspent', '1', '9999999'], true) || [];
  return u
    .map(x => ({ txid: x.txid, vout: x.vout, sats: Math.round(x.amount * 1e8) }))
    .filter(x => x.sats >= minSat && !exclude.has(`${x.txid}:${x.vout}`))
    .sort((a, b) => b.sats - a.sats);
}
// Padding inputs want to be SMALL — a tail is `commons + 1`, so feeding it a
// 25-BTC output makes a 25-BTC tail that then has to be shuffled through round C.
const smallest = (minSat, exclude, n) =>
  cardinals(minSat, exclude).slice().reverse().slice(0, n);
function lockOutputs(list) {
  if (!list.length) return;
  bcli(['lockunspent', 'false', JSON.stringify(list.map(o => ({ txid: o.txid, vout: o.vout })))], true);
}

// ── Transaction assembly ─────────────────────────────────────────────────────
const btc = (sats) => Number((sats / 1e8).toFixed(8));

function buildAndMaybeSend(ins, outs, broadcast, label) {
  const outsObj = outs.map(o => ({ [o.addr]: btc(o.sats) }));
  const raw = bcli(['createrawtransaction', JSON.stringify(ins), JSON.stringify(outsObj)]);
  if (!broadcast) {
    console.log(`  [dry run] ${label}: ${ins.length} inputs, ${outs.length} outputs, ` +
                `~${vsize(ins.length, outs.length)} vB`);
    return null;
  }
  const signed = bjson(['signrawtransactionwithwallet', raw], true);
  if (!signed.complete) { console.error(`  ${label}: signing incomplete`, signed.errors || ''); process.exit(1); }
  const txid = bcli(['sendrawtransaction', signed.hex]);
  console.log(`  ${label} broadcast: ${txid}`);
  return txid;
}

function assertNoLoss(label, outpoints, lo, hi, expected) {
  let total = 0;
  for (const op of outpoints) total += rareIn(op, lo, hi).count;
  if (total !== expected) {
    console.error(`\nSTOP — ${label}: ${expected - total} rare sat(s) unaccounted for.`);
    console.error(`  expected ${expected} across the outputs, found ${total}.`);
    console.error('  Do not continue. See memory/inscribe.md.');
    process.exit(1);
  }
  console.log(`  accounting: ${total}/${expected} rare sats preserved`);
}

// ── plan ─────────────────────────────────────────────────────────────────────
function cmdPlan(args) {
  const range = args['--range'];
  const carriers = parseInt(args['--carriers'], 10);
  const K = parseInt(args['--chunks'], 10);
  const feeRate = Number(args['--fee-rate'] || 1);
  if (!range || !carriers || !K) {
    console.error('Usage: node peel.js plan --range <txid:vout> --carriers <N> --chunks <K> [--fee-rate 1]');
    process.exit(1);
  }
  const d = ordOutput(range);
  if (!d) { console.error(`Error: ord has no output ${range}. Is the server up and the index synced?`); process.exit(1); }
  const ranges = d.sat_ranges || [];
  if (ranges.length !== 1) {
    console.error(`Error: ${range} is not one contiguous range (${ranges.length} ranges). This script assumes one.`);
    process.exit(1);
  }
  const [lo, hiEx] = ranges[0];
  const hi = hiEx - 1;
  const rare = hi - lo + 1;
  if (rare !== d.value) {
    console.error(`Warning: output is ${d.value} sats but only ${rare} are in the range — expected an all-rare UTXO.`);
  }

  const roundsNeeded = Math.ceil(carriers / K);
  // A chunk loses one rare sat per round and must stay >= DUST, so it needs
  // DUST + roundsNeeded sats. And chunks are SEQUENTIAL SLICES of the sat stream:
  // in the split, every common sat sits *after* the whole rare run, so only the
  // LAST chunk can be padded with commons. Every other chunk must therefore be
  // that many RARE sats. That is what bounds K — not transaction size.
  const chunkSize = Math.max(DUST + roundsNeeded, DUST + 1);
  const maxK = Math.floor(rare / chunkSize);
  if (K > maxK) {
    console.error(`Error: K=${K} needs ${K * chunkSize} rare sats but the range has ${rare}.`);
    console.error('');
    console.error('  Chunks are sequential slices of the sat stream, and in the split every');
    console.error('  common sat lands AFTER the whole rare run — so only the last chunk can be');
    console.error('  padded. Every other chunk must be that many RARE sats.');
    console.error('');
    console.error(`  With ${rare} rare sats and ${carriers} carriers, the most chunks you can`);
    console.error(`  run is ${maxK} (chunk size ${chunkSize} = dust ${DUST} + ${roundsNeeded} peels).`);
    const kBest = Math.max(1, Math.floor(rare / (DUST + Math.ceil(carriers / Math.max(1, Math.floor(rare / (DUST + 1)))))));
    console.error(`  Try --chunks ${Math.min(kBest, maxK) || 1}.`);
    process.exit(1);
  }
  const rarePerChunk = chunkSize;
  const chunkPadding = Math.max(0, chunkSize - rarePerChunk) * K;
  const carrierPadding = carriers * PADDING;
  const txCount = 1 + roundsNeeded * 2;
  const est = feeFor(2, K + 1, feeRate)
            + roundsNeeded * (feeFor(2 * K + 1, 2 * K + 1, feeRate) + feeFor(K + 1, 2 * K + 1, feeRate));

  const state = {
    range, lo, hi, rare, carriers, K, feeRate,
    roundsNeeded, chunkSize, chunkPadding, carrierPadding,
    chunks: [], tails: [], carriersMade: [], roundsDone: 0, split: null,
  };
  saveState(state);

  console.log('=== PEEL PLAN ===');
  console.log(`  source              : ${range}`);
  console.log(`  rare range          : ${lo} .. ${hi}  (${rare} sats, contiguous)`);
  console.log(`  carriers wanted     : ${carriers}`);
  console.log(`  chunks (K)          : ${K}   -> ${K} carriers per round`);
  console.log(`  rounds              : ${roundsNeeded}`);
  console.log(`  chunk size          : ${chunkSize} sats (>= dust ${DUST} after ${roundsNeeded} peels)`);
  console.log(`  rare per chunk      : ~${rarePerChunk}`);
  console.log('');
  console.log(`  transactions        : ${txCount}  (1 split + ${roundsNeeded} x 2)`);
  console.log(`  common sats locked  : ~${chunkPadding} as chunk padding (returns as change)`);
  console.log(`  common sats spent   : ${carrierPadding} as carrier padding (permanent)`);
  console.log(`  estimated fees      : ~${est} sats at ${feeRate} sat/vB`);
  console.log('');
  console.log(`  state written to ${path.basename(STATE)}`);
  console.log('  next: node peel.js split [--broadcast]');
}

// ── split ────────────────────────────────────────────────────────────────────
function cmdSplit(broadcast) {
  const s = loadState();
  if (!s) { console.error('No plan. Run: node peel.js plan …'); process.exit(1); }
  if (s.split) { console.error(`Already split (${s.split}). Run: node peel.js round`); process.exit(1); }

  const [rtx, rvout] = s.range.split(':');
  const need = s.chunkSize * s.K;
  const fee = feeFor(2, s.K + 1, s.feeRate);
  const fund = cardinals(need + fee + DUST, new Set([s.range]))[0];
  if (!fund) { console.error(`Error: no cardinal UTXO >= ${need + fee + DUST} sats to fund the split.`); process.exit(1); }

  // rare range FIRST so its sats lead the stream; commons follow and become the
  // padding on the final chunk, and the fee comes off the commons tail.
  //
  // ALL the rare must land in chunks. Chunks are sequential slices, so the first
  // K-1 take `chunkSize` each and the LAST takes everything remaining — padded
  // with commons only if that remainder is itself under chunkSize. Leftover rare
  // must never fall through into the change output.
  const ins = [{ txid: rtx, vout: Number(rvout) }, { txid: fund.txid, vout: fund.vout }];
  const head = s.chunkSize * (s.K - 1);
  if (head >= s.rare) { console.error('Error: chunk sizing would leave the last chunk with no rare sats.'); process.exit(1); }
  const lastRare = s.rare - head;
  const lastSize = Math.max(lastRare, s.chunkSize);
  const commonsUsed = lastSize - lastRare;
  const sizes = [...Array(s.K - 1).fill(s.chunkSize), lastSize];

  const change = fund.sats - commonsUsed - fee;
  if (change < DUST) { console.error('Error: change below dust; pick a larger funding UTXO.'); process.exit(1); }

  const outs = sizes.map(sz => ({ addr: newAddress(), sats: sz }));
  outs.push({ addr: newAddress(), sats: change });

  console.log('=== SPLIT ===');
  console.log(`  ${s.rare} rare + ${commonsUsed} common -> chunks [${sizes.join(', ')}]`);
  const txid = buildAndMaybeSend(ins, outs, broadcast, 'split');
  if (!txid) return;

  s.split = txid;
  s.chunks = sizes.map((sz, i) => ({ txid, vout: i, sats: sz }));
  saveState(s);
  console.log('  confirm it, then: node peel.js round [--broadcast]');
}

// ── round B: chunks -> tails ─────────────────────────────────────────────────
// Split from round C deliberately: ord only indexes CONFIRMED outputs, so the
// accounting check cannot run until B has a block. That is also the real
// workflow — you wait between transactions anyway.
function cmdRoundB(broadcast) {
  const s = loadState();
  if (!s) { console.error('No plan.'); process.exit(1); }
  if (!s.split) { console.error('Not split yet. Run: node peel.js split'); process.exit(1); }
  if (s.pendingTails) { console.error('Round B already broadcast. Confirm it, then: node peel.js roundc'); process.exit(1); }
  if (s.carriersMade.length >= s.carriers) { console.log('Done — all carriers made.'); return; }

  const exclude = new Set([...s.chunks, ...s.carriersMade].map(o => `${o.txid}:${o.vout}`));
  const cSize = PADDING + DUST + 1;
  const feeB = feeFor(2 * s.K + 1, 2 * s.K + 1, s.feeRate);

  const cIn = smallest(cSize, exclude, s.K);
  if (cIn.length < s.K) {
    console.error(`Error: need ${s.K} cardinal UTXOs of >= ${cSize} sats for padding; found ${cIn.length}.`);
    process.exit(1);
  }
  const usedC = new Set([...exclude, ...cIn.map(c => `${c.txid}:${c.vout}`)]);
  const feeIn = cardinals(feeB + DUST, usedC)[0];
  if (!feeIn) { console.error(`Error: no cardinal UTXO >= ${feeB + DUST} sats for the round-B fee.`); process.exit(1); }

  const ins = [];
  for (let i = 0; i < s.K; i++) {
    ins.push({ txid: cIn[i].txid, vout: cIn[i].vout });
    ins.push({ txid: s.chunks[i].txid, vout: s.chunks[i].vout });
  }
  ins.push({ txid: feeIn.txid, vout: feeIn.vout });

  const outs = [];
  const tails = [], chunksNext = [];
  for (let i = 0; i < s.K; i++) {
    const chunkSats = s.chunks[i].sats || s.chunkSize;
    outs.push({ addr: newAddress(), sats: cIn[i].sats + 1 });   // commons + ONE rare -> tail
    outs.push({ addr: newAddress(), sats: chunkSats - 1 });     // chunk remainder
    tails.push({ vout: i * 2, sats: cIn[i].sats + 1 });
    chunksNext.push({ vout: i * 2 + 1, sats: chunkSats - 1 });
    if (chunkSats - 1 < DUST) { console.error(`Error: chunk ${i} would drop below dust.`); process.exit(1); }
  }
  outs.push({ addr: newAddress(), sats: feeIn.sats - feeB });

  console.log(`=== ROUND ${s.roundsDone + 1} / ${s.roundsNeeded} — B (chunks -> tails) ===`);
  const txid = buildAndMaybeSend(ins, outs, broadcast, 'roundB');
  if (!txid) return;

  s.pendingTails = { txid, tails, chunksNext };
  saveState(s);
  console.log('  WAIT FOR CONFIRMATION, then: node peel.js roundc [--broadcast]');
}

// ── round C: tails -> carriers ───────────────────────────────────────────────
function cmdRoundC(broadcast) {
  const s = loadState();
  if (!s || !s.pendingTails) { console.error('No round B pending. Run: node peel.js roundb'); process.exit(1); }
  const { txid: txB, tails, chunksNext } = s.pendingTails;

  // B is confirmed by now — verify nothing was lost before building on it
  assertNoLoss('round B', [...tails, ...chunksNext].map(o => `${txB}:${o.vout}`),
               s.lo, s.hi, s.rare - s.carriersMade.length);
  for (const t of tails) {
    const r = rareIn(`${txB}:${t.vout}`, s.lo, s.hi);
    if (r.count !== 1) { console.error(`STOP — tail ${t.vout} holds ${r.count} rare sats, expected 1.`); process.exit(1); }
  }

  const feeC = feeFor(s.K + 1, 2 * s.K + 1, s.feeRate);
  const skip = new Set([...s.chunks, ...s.carriersMade].map(o => `${o.txid}:${o.vout}`));
  for (const t of tails) skip.add(`${txB}:${t.vout}`);
  for (const c of chunksNext) skip.add(`${txB}:${c.vout}`);
  const padIn = cardinals(PADDING + feeC + DUST, skip)[0];
  if (!padIn) { console.error('Error: no cardinal UTXO left to pad the final carrier.'); process.exit(1); }

  const ins = tails.map(t => ({ txid: txB, vout: t.vout }));
  ins.push({ txid: padIn.txid, vout: padIn.vout });

  const outs = [{ addr: newAddress(), sats: tails[0].sats - 1 }];   // tail 0's leading commons
  for (let i = 0; i < s.K - 1; i++) {
    outs.push({ addr: newAddress(), sats: DUST });                   // CARRIER
    const rest = tails[i + 1].sats - 1 - PADDING;
    if (rest < DUST) { console.error(`Error: tail ${i + 1} too small to pad and leave dust change.`); process.exit(1); }
    outs.push({ addr: newAddress(), sats: rest });
  }
  outs.push({ addr: newAddress(), sats: DUST });                     // final CARRIER
  outs.push({ addr: newAddress(), sats: padIn.sats - PADDING - feeC });

  console.log(`=== ROUND ${s.roundsDone + 1} — C (tails -> carriers) ===`);
  const txC = buildAndMaybeSend(ins, outs, broadcast, 'roundC');
  if (!txC) return;

  s.pendingCarriers = { txid: txC, count: outs.length };
  s.chunks = chunksNext.map(c => ({ txid: txB, vout: c.vout, sats: c.sats }));
  delete s.pendingTails;
  s.roundsDone += 1;
  saveState(s);
  console.log('  WAIT FOR CONFIRMATION, then: node peel.js collect');
}

// ── collect: verify carriers and lock them ───────────────────────────────────
function cmdCollect() {
  const s = loadState();
  if (!s || !s.pendingCarriers) { console.error('Nothing to collect.'); process.exit(1); }
  const { txid, count } = s.pendingCarriers;
  const made = [];
  for (let v = 0; v < count; v++) {
    const r = rareIn(`${txid}:${v}`, s.lo, s.hi);
    if (r.count === 1 && r.startsRare && r.value === DUST) made.push({ txid, vout: v, sat: r.ranges[0][0] });
  }
  if (made.length !== s.K) {
    console.error(`STOP — expected ${s.K} carriers from ${txid}, found ${made.length}. Do not continue.`);
    process.exit(1);
  }
  lockOutputs(made);
  s.carriersMade.push(...made);
  delete s.pendingCarriers;
  saveState(s);
  console.log(`  ${made.length} carriers verified and LOCKED: ${made.map(m => m.sat).join(', ')}`);
  console.log(`  total: ${s.carriersMade.length} / ${s.carriers}`);
  if (s.carriersMade.length < s.carriers) console.log('  next: node peel.js roundb [--broadcast]');
}

// ── status ───────────────────────────────────────────────────────────────────
function cmdStatus() {
  const s = loadState();
  if (!s) { console.log('No plan yet.'); return; }
  console.log('=== PEEL STATUS ===');
  console.log(`  range      : ${s.lo}..${s.hi} (${s.rare} sats)`);
  console.log(`  split tx   : ${s.split || '(not split)'}`);
  console.log(`  rounds     : ${s.roundsDone} / ${s.roundsNeeded}`);
  console.log(`  carriers   : ${s.carriersMade.length} / ${s.carriers}`);
  if (s.carriersMade.length) {
    console.log('\n  PIECE_CARRIERS entries for inscribe.js:');
    s.carriersMade.forEach((c) => console.log(`    { sat: ${c.sat}, run: 1 },   // ${c.txid}:${c.vout}`));
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const args = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) {
  args[argv[i]] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
}
const broadcast = !!args['--broadcast'];
if (!broadcast && ['split','roundb','roundc'].includes(cmd)) console.log('(dry run — pass --broadcast to send)\n');

switch (cmd) {
  case 'plan':   cmdPlan(args); break;
  case 'split':  cmdSplit(broadcast); break;
  case 'roundb': cmdRoundB(broadcast); break;
  case 'roundc': cmdRoundC(broadcast); break;
  case 'collect': cmdCollect(); break;
  case 'status': cmdStatus(); break;
  default:
    console.log('node peel.js plan --range <txid:vout> --carriers <N> --chunks <K> [--fee-rate 1]');
    console.log('node peel.js split  [--broadcast]');
    console.log('node peel.js roundb [--broadcast]     # chunks -> tails   (then confirm)');
    console.log('node peel.js roundc [--broadcast]     # tails  -> carriers (then confirm)');
    console.log('node peel.js collect                  # verify + lock the carriers');
    console.log('node peel.js status');
}
