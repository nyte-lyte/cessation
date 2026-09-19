// peel.js — split a contiguous rare sat range into single-sat carriers.
//
// A carrier is a UTXO whose FIRST sat is rare and whose remainder is common
// padding, so transaction fees (taken from the end of the sat stream) eat the
// padding and never the rare sat. That is the shape the v1/v2 inscription run used and the
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
  // persistent=true is NOT optional here. Core's default stores locks in MEMORY
  // ONLY — "always cleared (by virtue of process exit) when a node stops or
  // fails". Carriers may sit untouched for years across countless restarts; a
  // non-persistent lock would silently evaporate on the first one and leave the
  // rare sats as ordinary spendable change.
  bcli(['lockunspent', 'false',
        JSON.stringify(list.map(o => ({ txid: o.txid, vout: o.vout }))), 'true'], true);
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
// Which carrier belongs to piece N, resolved from the sat rather than typed.
//
// PIECE_CARRIERS in inscribe.js maps piece index -> sat, oldest sat first. The
// outpoint appears only in a trailing comment, so nothing mechanical connected
// "piece 7" to the right UTXO — it relied on a human pasting the correct txid.
// On mainnet that mistake is permanent and silent: the piece simply lands on the
// wrong Nakamoto sat and the collection's ordering is wrong for ever.
//
// ord cannot answer "where is sat N" (satpoint is null without --index-addresses),
// so this scans the wallet's LOCKED outpoints — which is exactly the carrier set —
// and finds the one holding that sat AT OFFSET 0.
function carrierForPieceIndex(n) {
  const src = readFileSync(path.join(__dirname, 'inscribe.js'), 'utf8');
  const body = src.match(/const PIECE_CARRIERS = \[([\s\S]*?)\n\];/);
  if (!body) { console.error('  cannot find PIECE_CARRIERS in inscribe.js'); process.exit(1); }
  const rows = [...body[1].matchAll(/\{ sat: (\d+), postage: (\d+) \}/g)]
    .map(m => ({ sat: m[1], postage: Number(m[2]) }));
  if (n < 0 || n >= rows.length) {
    console.error(`  piece ${n} out of range — PIECE_CARRIERS has ${rows.length} entries`);
    process.exit(1);
  }
  const want = rows[n];
  console.log(`  piece ${n} wants sat ${want.sat} (postage ${want.postage})`);

  const locked = bjson(['listlockunspent'], true) || [];
  console.log(`  scanning ${locked.length} locked carriers for it…`);
  for (const o of locked) {
    const op = `${o.txid}:${o.vout}`;
    const d = ordOutput(op);
    if (!d) continue;
    const r = (d.sat_ranges || [])[0];
    if (!r) continue;
    if (String(r[0]) === want.sat) {
      if (d.value !== want.postage) {
        console.error(`  FOUND ${op} but value ${d.value} != expected postage ${want.postage}`);
        process.exit(1);
      }
      console.log(`  resolved  ${op}  (sat at offset 0, ${d.value} sat)`);
      return op;
    }
  }
  console.error(`  sat ${want.sat} not found at offset 0 of any locked carrier in ${CFG.wallet}.`);
  console.error(`  It may already have been handed off, or the wallet/locks are wrong.`);
  process.exit(1);
}

// ── handoff: move ONE carrier out of storage, sat-preservingly ───────────────
//
// `ord wallet send` cannot do this. ord refuses to drive `ord-cold` at all —
// "contains unexpected output descriptors, and does not appear to be an `ord`
// wallet" — because that wallet carries pkh/sh/wpkh/tr descriptors while ord
// builds taproot-only wallets. So the transfer has to be assembled by hand, the
// same way the peel itself was.
//
// The shape is the whole safety argument:
//
//   input[0]  = the carrier            output[0] = EXACTLY the carrier's value
//   input[1+] = funding                output[1] = change
//
// Sats traverse a transaction in input order, so output[0] takes the first
// `value` sats — which are precisely the carrier's, rare sat still at offset 0.
// The fee is the tail, so it is paid out of the funding input and can never
// reach the carrier. Any other ordering breaks that.
function cmdHandoff(args, broadcast) {
  const to   = args['--to'];
  const rate = Number(args['--fee-rate'] || 1);
  const pieceArg = args['--piece'];
  if (!to || (!args['--carrier'] && pieceArg === undefined)) {
    console.error('usage: node peel.js handoff (--piece <N> | --carrier <txid:vout>) --to <address> [--fee-rate 1] [--broadcast]');
    console.error('       --piece is preferred: it resolves the carrier from PIECE_CARRIERS so the order cannot be got wrong.');
    process.exit(1);
  }
  const carrier = pieceArg !== undefined
    ? carrierForPieceIndex(Number(pieceArg))
    : args['--carrier'];
  const [ctxid, cvoutStr] = carrier.split(':');
  const cvout = Number(cvoutStr);

  const d = ordOutput(carrier);
  if (!d) { console.error(`  cannot read ${carrier} from ord at ${CFG.ordUrl}`); process.exit(1); }
  const value  = d.value;
  const ranges = d.sat_ranges || [];
  if (!ranges.length) { console.error('  ord returned no sat_ranges — is --index-sats on?'); process.exit(1); }
  const firstSat = ranges[0][0];

  console.log(`  carrier   ${carrier}`);
  console.log(`  value     ${value} sat`);
  console.log(`  first sat ${firstSat}   (this is the one that must survive)`);
  console.log(`  ranges    ${ranges.length}`);

  // Never fund from another carrier. Everything locked is off limits, and the
  // carrier being moved is excluded explicitly because we are about to unlock it.
  const locked = bjson(['listlockunspent'], true) || [];
  const exclude = new Set(locked.map(o => `${o.txid}:${o.vout}`));
  exclude.add(carrier);

  const fee = feeFor(2, 2, rate);
  const funders = cardinals(fee + DUST, exclude);
  if (!funders.length) {
    console.error(`  no cardinal UTXO >= ${fee + DUST} sat to pay the fee — fund ${CFG.wallet} first`);
    process.exit(1);
  }
  const funder = funders[funders.length - 1];        // smallest that covers it
  const change = funder.sats - fee;
  if (change < DUST) { console.error(`  change ${change} below dust`); process.exit(1); }

  const ins  = [{ txid: ctxid, vout: cvout }, { txid: funder.txid, vout: funder.vout }];
  const outs = [{ addr: to, sats: value }, { addr: newAddress(), sats: change }];

  console.log(`  funding   ${funder.txid}:${funder.vout}  ${funder.sats} sat`);
  console.log(`  fee       ${fee} sat @ ${rate} sat/vB   change ${change} sat`);
  console.log(`  shape     in[0]=carrier(${value})  out[0]=${value} -> ${to.slice(0,20)}…`);

  // The invariant, asserted rather than assumed.
  if (outs[0].sats !== value) { console.error('  REFUSING: output[0] != carrier value'); process.exit(1); }
  if (`${ins[0].txid}:${ins[0].vout}` !== carrier) { console.error('  REFUSING: carrier is not input[0]'); process.exit(1); }

  // Unlock only for as long as it takes to build; restore on any failure.
  bcli(['lockunspent', 'true', JSON.stringify([{ txid: ctxid, vout: cvout }])], true);
  let txid = null;
  try {
    txid = buildAndMaybeSend(ins, outs, broadcast, 'handoff');
  } finally {
    if (!txid) lockOutputs([{ txid: ctxid, vout: cvout }]);   // dry run or failure: re-lock
  }
  if (!txid) { console.log('  [dry run] nothing broadcast; carrier re-locked'); return; }

  console.log(`  broadcast ${txid}`);
  console.log(`  verify once confirmed:  curl -s ${CFG.ordUrl}/output/${txid}:0 -H 'Accept: application/json'`);
  console.log(`  expect: value ${value}, first sat ${firstSat}`);
}

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

  // B is confirmed by now — verify nothing was lost before building on it.
  // The reserve (chunks deliberately held back, e.g. when K was reduced) must be
  // counted too: its sats are still part of the range, just not being peeled.
  // Including it also means every round re-verifies the reserve is intact.
  const reserveOps = (s.reserve || []).map(o => `${o.txid}:${o.vout}`);
  const carrierOps = s.carriersMade.map(o => `${o.txid}:${o.vout}`);
  assertNoLoss('round B',
    [...tails, ...chunksNext].map(o => `${txB}:${o.vout}`).concat(reserveOps, carrierOps),
    s.lo, s.hi, s.rare);
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
    // SORTED ASCENDING — oldest sat first, which is the assignment plan: piece N
    // takes the Nth oldest Nakamoto sat. Carriers are *created* in a different
    // order: with K chunks each round peels one sat from every chunk, so creation
    // order alternates between chunks (+0, +453, +1, +454 …). Pasting that order
    // in would give piece 0 the oldest sat and piece 1 the 454th.
    const sorted = [...s.carriersMade].sort((a, b) => a.sat - b.sat);
    console.log('\n  PIECE_CARRIERS entries for inscribe.js (oldest sat first):');
    sorted.forEach((c) => console.log(`    { sat: ${c.sat}, run: 1 },   // ${c.txid}:${c.vout}`));
    const runs = [];
    for (const c of sorted) {
      const last = runs[runs.length - 1];
      if (last && c.sat === last[1] + 1) last[1] = c.sat; else runs.push([c.sat, c.sat]);
    }
    console.log(`\n  ${sorted.length} carriers in ${runs.length} contiguous run(s) — one per chunk:`);
    runs.forEach(([a, b]) => console.log(`    ${a} .. ${b}  (${b - a + 1} sats)`));
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
if (!broadcast && ['split','roundb','roundc','handoff'].includes(cmd)) console.log('(dry run — pass --broadcast to send)\n');

switch (cmd) {
  case 'plan':   cmdPlan(args); break;
  case 'split':  cmdSplit(broadcast); break;
  case 'roundb': cmdRoundB(broadcast); break;
  case 'roundc': cmdRoundC(broadcast); break;
  case 'collect': cmdCollect(); break;
  case 'status': cmdStatus(); break;
  case 'handoff': cmdHandoff(args, broadcast); break;
  default:
    console.log('node peel.js plan --range <txid:vout> --carriers <N> --chunks <K> [--fee-rate 1]');
    console.log('node peel.js split  [--broadcast]');
    console.log('node peel.js roundb [--broadcast]     # chunks -> tails   (then confirm)');
    console.log('node peel.js roundc [--broadcast]     # tails  -> carriers (then confirm)');
    console.log('node peel.js collect                  # verify + lock the carriers');
    console.log('node peel.js handoff --carrier <txid:vout> --to <addr> [--fee-rate 1] [--broadcast]');
    console.log('node peel.js status');
}
