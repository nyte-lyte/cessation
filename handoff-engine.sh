#!/bin/bash
# Move the ENGINE carrier from ord-cold to the ord-v3 wallet.
#
# Exists because the equivalent one-liner is long enough that a terminal wraps it,
# which splits the `PEEL_NETWORK=mainnet …` prefix from the `node` call. peel.js then
# falls back to its defaults — which are REGTEST (peel.js:34). That happened on
# 2026-09-20 and failed safe only because regtest has no ord-cold wallet loaded.
#
# Dry run by default. Pass --broadcast to send.
#
#   ./handoff-engine.sh                # dry run
#   ./handoff-engine.sh --broadcast    # send it

set -euo pipefail

ENGINE_SAT=1459982499999999
V3_ADDR=bc1pqq7u99mj4lz9yy4kch38m9yn6rvcuxsld2pnxel9k67dprghkfdq9zcq6t
DATADIR=/Volumes/Bitcoin/Bitcoin
BCLI=/opt/homebrew/bin/bitcoin-cli

# --- refuse to run unless this really is mainnet -----------------------------
CHAIN=$("$BCLI" -datadir="$DATADIR" getblockchaininfo | sed -n 's/.*"chain": "\([a-z]*\)".*/\1/p')
if [ "$CHAIN" != "main" ]; then
  echo "REFUSING: node reports chain '$CHAIN', expected 'main'" >&2
  exit 1
fi

ORD_HEIGHT=$(curl -s --max-time 10 http://127.0.0.1:80/r/blockheight)
NODE_HEIGHT=$("$BCLI" -datadir="$DATADIR" getblockcount)
if [ "$ORD_HEIGHT" != "$NODE_HEIGHT" ]; then
  echo "REFUSING: ord at $ORD_HEIGHT, node at $NODE_HEIGHT — not level" >&2
  exit 1
fi
echo "mainnet ✓  ord and node both at $NODE_HEIGHT"

# --- ord-cold must be able to sign ------------------------------------------
# An UNENCRYPTED wallet has no "unlocked_until" field at all. Treating a missing
# field as "locked" refused a wallet that was always ready (2026-09-20).
WI=$("$BCLI" -datadir="$DATADIR" -rpcwallet=ord-cold getwalletinfo)
if ! echo "$WI" | grep -q unlocked_until; then
  echo "ord-cold is not encrypted — nothing to unlock, it can sign"
else
  UNLOCKED=$(echo "$WI" | sed -n 's/.*"unlocked_until": \([0-9]*\).*/\1/p')
  NOW=$(date +%s)
  if [ "$UNLOCKED" -le "$NOW" ]; then
    echo "REFUSING: ord-cold is encrypted and locked. Unlock it first:" >&2
    echo "  $BCLI -datadir=$DATADIR -rpcwallet=ord-cold walletpassphrase \"PASSPHRASE\" 600" >&2
    echo "  (run that in a SEPARATE terminal — not with '!' — so the passphrase" >&2
    echo "   does not land in the assistant transcript)" >&2
    exit 1
  fi
  echo "ord-cold unlocked ✓  ($(( (UNLOCKED - NOW) / 60 )) min remaining)"
fi
echo

PEEL_NETWORK=mainnet \
PEEL_DATADIR="$DATADIR" \
PEEL_WALLET=ord-cold \
PEEL_ORD_URL=http://127.0.0.1:80 \
exec node peel.js handoff --sat "$ENGINE_SAT" --to "$V3_ADDR" --fee-rate 1 "$@"
