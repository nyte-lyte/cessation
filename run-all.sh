#!/bin/bash
# Inscribe a range of Cessation pieces end to end, unattended.
#
#   ./run-all.sh 2 30          # pieces 2 through 30
#   ./run-all.sh 2 5           # a shorter batch
#
# HALTS on any failure. Nothing is retried, nothing is skipped. On a halt the wallet
# and carriers are left exactly as they are and the log says where it stopped --
# a partial run leaves the collection INCOMPLETE, which is a normal state for an
# open-ended collection, not a broken one.
#
# Per piece: wait for an unclaimed block -> build -> gate -> inscribe -> hand off the
# NEXT carrier (so its confirmation overlaps) -> wait -> verify against chain.

set -euo pipefail

START=${1:?usage: ./run-all.sh <startPiece> <endPiece>}
END=${2:?usage: ./run-all.sh <startPiece> <endPiece>}
BCLI=/opt/homebrew/bin/bitcoin-cli
DD=/Volumes/Bitcoin/Bitcoin
ORD=http://127.0.0.1:80
LOG=run_log.jsonl
UNLOCK=~/unlock-v3.sh

say(){ echo "[$(date '+%H:%M:%S')] $*"; }
die(){ echo; echo "════ HALTED at $(date '+%H:%M:%S') ════" >&2; echo "  $*" >&2;
       echo "  Nothing retried. Inspect state before resuming." >&2; exit 1; }

# ── preflight ───────────────────────────────────────────────────────────────
CHAIN=$("$BCLI" -datadir="$DD" getblockchaininfo | sed -n 's/.*"chain": "\([a-z]*\)".*/\1/p')
[ "$CHAIN" = "main" ] || die "chain is '$CHAIN', expected main"
[ -f ENGINE_ID.txt ] || die "ENGINE_ID.txt missing"
ENGINE=$(cat ENGINE_ID.txt)
[ -x "$UNLOCK" ] || die "$UNLOCK missing or not executable"
BAL=$("$BCLI" -datadir="$DD" -rpcwallet=ord-v3 getbalances | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Math.round(JSON.parse(s).mine.trusted*1e8)))')
NEED=$(( (END - START + 1) * 900 ))
say "preflight ✓ mainnet, engine ${ENGINE:0:16}…, ord-v3 holds $BAL sat (need ~$NEED)"
[ "$BAL" -ge "$NEED" ] || die "ord-v3 has $BAL sat, run needs about $NEED"

wait_indexed(){ # $1 = txid, $2 = label
  local tx=$1 label=$2 i c o n
  for i in $(seq 1 120); do
    c=$("$BCLI" -datadir="$DD" getrawtransaction "$tx" true 2>/dev/null | sed -n 's/.*"confirmations": \([0-9]*\).*/\1/p' || true)
    if [ -n "$c" ] && [ "$c" -ge 1 ]; then
      o=$(curl -s --max-time 10 "$ORD/r/blockheight" 2>/dev/null || true)
      n=$("$BCLI" -datadir="$DD" getblockcount 2>/dev/null || true)
      [ -n "$o" ] && [ "$o" = "$n" ] && { say "  $label confirmed and indexed (height $n)"; return 0; }
    fi
    sleep 30
  done
  die "$label ($tx) not confirmed+indexed within 60 min"
}

carrier_present(){ # $1 = piece index -> echoes outpoint or NONE
  local sat
  sat=$(node -e '
    const s=require("fs").readFileSync("inscribe.js","utf8");
    const m=s.match(/const PIECE_CARRIERS = \[([\s\S]*?)\n\];/);
    console.log([...m[1].matchAll(/sat:\s*(\d+)/g)].map(x=>x[1])[Number(process.argv[1])]);' "$1")
  "$BCLI" -datadir="$DD" -rpcwallet=ord-v3 listunspent 1 | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{
      for(const o of JSON.parse(s)){
        if(Math.round(o.amount*1e8)!==330) continue;
        const r=await fetch(`http://127.0.0.1:80/output/${o.txid}:${o.vout}`,{headers:{accept:"application/json"}});
        const j=await r.json();
        if(String((j.sat_ranges||[[null]])[0][0])===process.argv[1] && !(j.inscriptions||[]).length){
          console.log(`${o.txid}:${o.vout}`); return; } }
      console.log("NONE");})' "$sat"
}

do_handoff(){ # $1 = piece index; echoes txid
  local n=$1 out tx
  out=$(./handoff-piece.sh "$n" --broadcast 2>&1) || { echo "$out" >&2; die "handoff for piece $n failed"; }
  tx=$(echo "$out" | sed -n 's/.*handoff broadcast: \([0-9a-f]\{64\}\).*/\1/p' | head -1)
  [ -n "$tx" ] || { echo "$out" >&2; die "could not read handoff txid for piece $n"; }
  echo "$tx"
}

wait_unclaimed_block(){ # echoes "height hash ts" for a block not already used
  local i h hash ts used
  for i in $(seq 1 120); do
    h=$("$BCLI" -datadir="$DD" getblockcount)
    used=$(node -e '
      const fs=require("fs"); const f="inscribed_blocks.json";
      const j=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};
      console.log(Object.values(j).some(v=>String(v.height)===process.argv[1])?"yes":"no");' "$h")
    if [ "$used" = "no" ]; then
      hash=$("$BCLI" -datadir="$DD" getblockhash "$h")
      ts=$("$BCLI" -datadir="$DD" getblockheader "$hash" | sed -n 's/.*"time": \([0-9]*\).*/\1/p')
      echo "$h $hash $ts"; return 0
    fi
    sleep 30
  done
  die "no unclaimed block appeared within 60 min"
}

# ── make sure the first carrier is here ─────────────────────────────────────
C=$(carrier_present "$START")
if [ "$C" = "NONE" ]; then
  say "piece $START carrier not in ord-v3 — handing it over"
  TX=$(do_handoff "$START"); wait_indexed "$TX" "piece $START carrier"
else
  say "piece $START carrier already present: $C"
fi

# ── the loop ────────────────────────────────────────────────────────────────
for (( N=START; N<=END; N++ )); do
  echo; say "════════ PIECE $N ════════"

  read -r H HASH TS <<<"$(wait_unclaimed_block)"
  say "anchor block $H"
  node inscribe.js "$N" "$HASH" "$TS" "$ENGINE" "$H" >/dev/null || die "inscribe.js failed for piece $N"

  ./inscribe-piece.sh "$N" >/dev/null || die "gates failed for piece $N — see ./inscribe-piece.sh $N"
  say "gates ✓"

  "$UNLOCK" >/dev/null || die "could not unlock ord-v3"

  OUT=$(./inscribe-piece.sh "$N" --broadcast-for-real 2>&1) || { echo "$OUT" >&2; die "inscribe failed for piece $N"; }
  REVEAL=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const m=s.match(/\{[\s\S]*\}/); try{console.log(JSON.parse(m[0]).reveal||"")}catch(e){console.log("")}})')
  PID=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const m=s.match(/\{[\s\S]*\}/); try{console.log(JSON.parse(m[0]).inscriptions[0].id||"")}catch(e){console.log("")}})')
  [ -n "$REVEAL" ] && [ -n "$PID" ] || { echo "$OUT" >&2; die "could not read reveal/id for piece $N"; }
  say "inscribed — $PID"

  NEXT_TX=""
  if [ "$N" -lt "$END" ]; then
    say "handing off piece $((N+1)) carrier so it confirms in parallel"
    NEXT_TX=$(do_handoff $((N+1)))
  fi

  wait_indexed "$REVEAL" "piece $N reveal"
  ./verify-piece.sh "$N" "$PID" || die "piece $N failed on-chain verification"

  node -e '
    const fs=require("fs");
    fs.appendFileSync("'"$LOG"'", JSON.stringify({
      piece:Number(process.argv[1]), id:process.argv[2], reveal:process.argv[3],
      anchorBlock:Number(process.argv[4]), at:new Date().toISOString()})+"\n");
  ' "$N" "$PID" "$REVEAL" "$H"
  say "piece $N COMPLETE and verified"

  [ -n "$NEXT_TX" ] && wait_indexed "$NEXT_TX" "piece $((N+1)) carrier"
done

echo; say "════ RUN COMPLETE: pieces $START..$END ════"
say "log: $LOG"
