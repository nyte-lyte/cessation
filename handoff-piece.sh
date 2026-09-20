#!/bin/bash
# Move ONE piece carrier from ord-cold into ord-v3, ready to inscribe.
#
#   ./handoff-piece.sh 0                # dry run
#   ./handoff-piece.sh 0 --broadcast    # send it
#
# Uses --piece N, which resolves the outpoint from PIECE_CARRIERS by scanning the
# chain for the sat -- so the piece/sat pairing cannot be typed wrong. On mainnet a
# mis-pairing is permanent AND silent: everything succeeds, the piece just lands on
# the wrong Nakamoto sat and the collection's ordering is wrong for ever (§7c).

set -euo pipefail

N=${1:-}
[ -n "$N" ] || { echo "usage: ./handoff-piece.sh <pieceIndex> [--broadcast]" >&2; exit 1; }
shift
DATADIR=/Volumes/Bitcoin/Bitcoin
BCLI=/opt/homebrew/bin/bitcoin-cli

CHAIN=$("$BCLI" -datadir="$DATADIR" getblockchaininfo | sed -n 's/.*"chain": "\([a-z]*\)".*/\1/p')
[ "$CHAIN" = "main" ] || { echo "REFUSING: chain is '$CHAIN', expected 'main'" >&2; exit 1; }
ORD_H=$(curl -s --max-time 10 http://127.0.0.1:80/r/blockheight)
NODE_H=$("$BCLI" -datadir="$DATADIR" getblockcount)
[ "$ORD_H" = "$NODE_H" ] || { echo "REFUSING: ord $ORD_H vs node $NODE_H — not level" >&2; exit 1; }
echo "mainnet ✓  ord and node both at $NODE_H"

# THE safety property (§7c/§3.3): ord funds from any cardinal UTXO it can see, and a
# bare rare carrier looks cardinal to it. With exactly one carrier present there is no
# second one for it to burn. Never relax this into a batch.
# Count only UNINSCRIBED 330-sat outputs. An inscribed one (the engine, or a piece
# already done) is ORDINAL to ord and will never be selected as funding -- §7c's hazard
# is specifically a BARE carrier, which ord reads as ordinary spendable change.
BARE=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-v3 listunspent 0 \
       | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{
           const fs=require("fs"),f="pending_reveals.json";
           let pend=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):{};
           const still={};
           const u=JSON.parse(s).filter(x=>Math.round(x.amount*1e8)===330);
           const bare=[];
           for(const o of u){
             const r=await fetch(`http://127.0.0.1:80/output/${o.txid}:${o.vout}`,{headers:{accept:"application/json"}});
             const j=await r.json();
             if((j.inscriptions||[]).length) continue;            // indexed as inscribed
             if(pend[o.txid]){ still[o.txid]=pend[o.txid]; continue; }  // our own reveal, not yet indexed
             bare.push(`${o.txid}:${o.vout}`);
           }
           // drop reveals that ord has now indexed, so the file cannot grow stale
           if(fs.existsSync(f)) fs.writeFileSync(f,JSON.stringify(still,null,2)+"\n");
           console.log(bare.join(","));})')
if [ -n "$BARE" ]; then
  echo "REFUSING: ord-v3 already holds an UNINSCRIBED carrier: $BARE" >&2
  echo "  Inscribe it before bringing another over — never two bare carriers at once." >&2
  echo "  ord funds from any cardinal UTXO, and a bare rare carrier looks cardinal (§3.3)." >&2
  exit 1
fi
echo "carrier check ✓  no uninscribed carrier sitting in ord-v3"

TO=$(./ord2.sh wallet --server-url http://127.0.0.1:80 --name ord-v3 receive \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).addresses[0])})')
echo "destination ✓  $TO  (fresh ord-v3 address)"
echo

PEEL_NETWORK=mainnet \
PEEL_DATADIR="$DATADIR" \
PEEL_WALLET=ord-cold \
PEEL_ORD_URL=http://127.0.0.1:80 \
exec node peel.js handoff --piece "$N" --to "$TO" --fee-rate 1 "$@"
