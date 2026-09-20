#!/bin/bash
# Inscribe ONE piece from ord-v3, onto its own Nakamoto carrier.
#
#   ./inscribe-piece.sh 0                      # dry run
#   ./inscribe-piece.sh 0 --broadcast-for-real
#
# Run handoff-piece.sh N first and let it confirm; then `node inscribe.js N ...`
# to build dist/. This only inscribes what is already built and already in the wallet.

set -euo pipefail

N=${1:-}; [ -n "$N" ] || { echo "usage: ./inscribe-piece.sh <pieceIndex> [--broadcast-for-real]" >&2; exit 1; }
NN=$(printf "%02d" "$N")
HTML=dist/cessation_piece_${NN}.html
META=dist/cessation_piece_${NN}_metadata.json
DATADIR=/Volumes/Bitcoin/Bitcoin
BCLI=/opt/homebrew/bin/bitcoin-cli
ENGINE=$(cat ENGINE_ID.txt)

CHAIN=$("$BCLI" -datadir="$DATADIR" getblockchaininfo | sed -n 's/.*"chain": "\([a-z]*\)".*/\1/p')
[ "$CHAIN" = "main" ] || { echo "REFUSING: chain is '$CHAIN'" >&2; exit 1; }
ORD_H=$(curl -s --max-time 10 http://127.0.0.1:80/r/blockheight)
NODE_H=$("$BCLI" -datadir="$DATADIR" getblockcount)
[ "$ORD_H" = "$NODE_H" ] || { echo "REFUSING: ord $ORD_H vs node $NODE_H — not level" >&2; exit 1; }
echo "mainnet ✓  ord and node both at $NODE_H"

[ -f "$HTML" ] && [ -f "$META" ] || { echo "REFUSING: $HTML / $META missing — run node inscribe.js $N ... first" >&2; exit 1; }

# The metadata gate, re-run here so it cannot be skipped by inscribing out of order.
node -e '
const fs=require("fs"),p=process.argv[1];
const j=JSON.parse(fs.readFileSync(p,"utf8"));
const k=Object.keys(j).sort().join(",");
if(k!=="dataset,hashTail,inscriptionUnix,pieceIndex"){console.error("REFUSING: metadata keys are "+k);process.exit(1);}
' "$META"
if LC_ALL=C grep -qiE "/Users/|/Volumes/|hillyer|jess|@gmail|\.local" "$HTML" "$META"; then
  echo "REFUSING: identity string found in $HTML or $META" >&2; exit 1
fi
grep -q "$ENGINE" "$HTML" || { echo "REFUSING: $HTML does not reference engine $ENGINE" >&2; exit 1; }
echo "metadata gate ✓  four keys, identity clean, engine id correct"

# The carrier for THIS piece must be present, confirmed and still bare.
SAT=$(node -e '
const src=require("fs").readFileSync("inscribe.js","utf8");
const m=src.match(/const PIECE_CARRIERS = \[([\s\S]*?)\n\];/);
const rows=[...m[1].matchAll(/sat:\s*(\d+)/g)].map(x=>x[1]);
const n=Number(process.argv[1]);
if(n>=rows.length){console.error("piece out of range");process.exit(1);}
console.log(rows[n]);' "$N")

FOUND=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-v3 listunspent 1 \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{
      const want=process.argv[1];
      for(const o of JSON.parse(s)){
        if(Math.round(o.amount*1e8)!==330) continue;
        const r=await fetch(`http://127.0.0.1:80/output/${o.txid}:${o.vout}`,{headers:{accept:"application/json"}});
        const j=await r.json();
        const first=(j.sat_ranges||[[null]])[0][0];
        if(String(first)===want && !(j.inscriptions||[]).length){console.log(`${o.txid}:${o.vout}`);return;}
      }
      console.log("NONE");})' "$SAT")
[ "$FOUND" != "NONE" ] || { echo "REFUSING: no confirmed, uninscribed 330-sat carrier holding sat $SAT in ord-v3" >&2; exit 1; }
echo "carrier ✓  $FOUND — sat $SAT at offset 0, uninscribed"

WI=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-v3 getwalletinfo)
if echo "$WI" | grep -q unlocked_until; then
  U=$(echo "$WI" | sed -n 's/.*"unlocked_until": \([0-9]*\).*/\1/p')
  [ "$U" -gt "$(date +%s)" ] || { echo "REFUSING: ord-v3 is locked — walletpassphrase first" >&2; exit 1; }
  echo "ord-v3 unlocked ✓  ($(( (U - $(date +%s)) / 60 )) min remaining)"
fi

echo
if [ "${2:-}" != "--broadcast-for-real" ]; then
  echo "DRY RUN — all guards passed. Would run:"
  echo "  ord wallet --name ord-v3 inscribe --fee-rate 1 --sat $SAT \\"
  echo "     --postage 330sat --parent $ENGINE \\"
  echo "     --file $HTML --json-metadata $META"
  exit 0
fi

echo "INSCRIBING PIECE $N — permanent."
OUT=$(./ord2.sh wallet --server-url http://127.0.0.1:80 --name ord-v3 inscribe \
  --fee-rate 1 --sat "$SAT" --postage 330sat --parent "$ENGINE" \
  --file "$HTML" --json-metadata "$META")
echo "$OUT"

# Record the reveal. Until it confirms, ord reports its outputs as having no
# inscriptions -- indistinguishable from a bare carrier. handoff-piece.sh reads this
# so it can bring the NEXT carrier over while this one is still confirming, without
# having to relax the "no bare carrier in the wallet" rule.
REVEAL=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  try{console.log(JSON.parse(s).reveal||"")}catch(e){console.log("")}})')
if [ -n "$REVEAL" ]; then
  node -e '
    const fs=require("fs"),f="pending_reveals.json";
    const j=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};
    j[process.argv[1]]={piece:Number(process.argv[2]),sat:process.argv[3],at:new Date().toISOString()};
    fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");
    console.log("  recorded pending reveal "+process.argv[1].slice(0,16)+"… for piece "+process.argv[2]);
  ' "$REVEAL" "$N" "$SAT"
fi
