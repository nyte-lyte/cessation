#!/bin/bash
# Inscribe the ENGINE (index_bundle.js) onto the engine Omega sat, from ord-v3.
#
# Once this confirms it is the parent of every piece for ever — a change means a new
# engine and a new collection (§7c). Run it once.
#
# Dry run by default. Pass --broadcast-for-real to actually inscribe.
#
#   ./inscribe-engine.sh                    # dry run
#   ./inscribe-engine.sh --broadcast-for-real

set -euo pipefail

ENGINE_SAT=1459982499999999
BUNDLE=index_bundle.js
BUNDLE_MD5=b1ef3a96dbd4f47bca5e357e8e888628   # the bundle the 7 suites passed against
BUNDLE_BYTES=83444
DATADIR=/Volumes/Bitcoin/Bitcoin
BCLI=/opt/homebrew/bin/bitcoin-cli
FEE_RATE=1

# --- mainnet, and ord level with the node ------------------------------------
CHAIN=$("$BCLI" -datadir="$DATADIR" getblockchaininfo | sed -n 's/.*"chain": "\([a-z]*\)".*/\1/p')
[ "$CHAIN" = "main" ] || { echo "REFUSING: chain is '$CHAIN', expected 'main'" >&2; exit 1; }
ORD_H=$(curl -s --max-time 10 http://127.0.0.1:80/r/blockheight)
NODE_H=$("$BCLI" -datadir="$DATADIR" getblockcount)
[ "$ORD_H" = "$NODE_H" ] || { echo "REFUSING: ord $ORD_H vs node $NODE_H — not level" >&2; exit 1; }
echo "mainnet ✓  ord and node both at $NODE_H"

# --- the bundle must be the one that was tested ------------------------------
# The project's whole failure mode is inscribing something that was not the thing
# proven to work. This is 86 KB and permanent; check it byte for byte.
GOT_MD5=$(md5 -q "$BUNDLE")
GOT_BYTES=$(wc -c < "$BUNDLE" | tr -d ' ')
if [ "$GOT_MD5" != "$BUNDLE_MD5" ] || [ "$GOT_BYTES" != "$BUNDLE_BYTES" ]; then
  echo "REFUSING: $BUNDLE is not the tested build." >&2
  echo "  expected  md5 $BUNDLE_MD5  $BUNDLE_BYTES bytes" >&2
  echo "  got       md5 $GOT_MD5  $GOT_BYTES bytes" >&2
  echo "  Run 'node build.js' and re-run the suites before inscribing." >&2
  exit 1
fi
echo "bundle ✓  $BUNDLE_BYTES bytes, md5 $GOT_MD5 — the build the suites passed against"

# --- no identity anywhere in the bundle --------------------------------------
if LC_ALL=C grep -qiE "/Users/|hillyer|jess|@gmail|\.local" "$BUNDLE"; then
  echo "REFUSING: identity-shaped string found in $BUNDLE" >&2
  LC_ALL=C grep -inoE "/Users/[a-z]*|hillyer|jess|@gmail|\.local" "$BUNDLE" | head >&2
  exit 1
fi
echo "identity scan ✓  no name, path or address in the bundle"

# --- ord-v3 must hold the engine carrier, confirmed --------------------------
CARRIER=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-v3 listunspent 1 \
          | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
              const u=JSON.parse(s).filter(x=>Math.round(x.amount*1e8)===330);
              if(u.length===1) console.log(`${u[0].txid}:${u[0].vout}`);
              else console.log(u.length===0?"NONE":"MULTIPLE");})')
[ "$CARRIER" != "NONE" ]     || { echo "REFUSING: no confirmed 330-sat carrier in ord-v3 yet" >&2; exit 1; }
[ "$CARRIER" != "MULTIPLE" ] || { echo "REFUSING: more than one 330-sat carrier in ord-v3 — §7c says exactly one" >&2; exit 1; }

FIRST_SAT=$(curl -s "http://127.0.0.1:80/output/$CARRIER" -H 'Accept: application/json' \
            | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
                const j=JSON.parse(s);console.log((j.sat_ranges||[["?"]])[0][0]);})')
[ "$FIRST_SAT" = "$ENGINE_SAT" ] || {
  echo "REFUSING: carrier $CARRIER holds first sat $FIRST_SAT, expected $ENGINE_SAT" >&2; exit 1; }
echo "carrier ✓  $CARRIER — engine sat $ENGINE_SAT at offset 0"

# --- ord-v3 must be unlocked (it IS encrypted) -------------------------------
WI=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-v3 getwalletinfo)
if echo "$WI" | grep -q unlocked_until; then
  U=$(echo "$WI" | sed -n 's/.*"unlocked_until": \([0-9]*\).*/\1/p')
  if [ "$U" -le "$(date +%s)" ]; then
    echo "REFUSING: ord-v3 is locked. In a SEPARATE terminal (not with '!'):" >&2
    echo "  $BCLI -datadir=$DATADIR -rpcwallet=ord-v3 walletpassphrase \"PASSPHRASE\" 900" >&2
    exit 1
  fi
  echo "ord-v3 unlocked ✓  ($(( (U - $(date +%s)) / 60 )) min remaining)"
fi

echo
if [ "${1:-}" != "--broadcast-for-real" ]; then
  echo "DRY RUN — all guards passed. The command that would run:"
  echo
  echo "  ./ord2.sh wallet --server-url http://127.0.0.1:80 --name ord-v3 inscribe \\"
  echo "      --fee-rate $FEE_RATE --sat $ENGINE_SAT --postage 330sat --file $BUNDLE"
  echo
  echo "Re-run with --broadcast-for-real to inscribe. NOTE: no --no-backup, ever (§3)."
  exit 0
fi

echo "INSCRIBING THE ENGINE — permanent."
exec ./ord2.sh wallet --server-url http://127.0.0.1:80 --name ord-v3 inscribe \
     --fee-rate "$FEE_RATE" --sat "$ENGINE_SAT" --postage 330sat --file "$BUNDLE"
