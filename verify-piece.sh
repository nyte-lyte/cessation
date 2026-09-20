#!/bin/bash
# Verify a confirmed piece against the chain. Exits non-zero on ANY discrepancy.
#   ./verify-piece.sh <N> <inscriptionId>
set -euo pipefail
N=$1; ID=$2; NN=$(printf "%02d" "$N")
HTML=dist/cessation_piece_${NN}.html
META=dist/cessation_piece_${NN}_metadata.json
ORD=http://127.0.0.1:80
ENGINE=$(cat ENGINE_ID.txt)
SAT=$(node -e '
const s=require("fs").readFileSync("inscribe.js","utf8");
const m=s.match(/const PIECE_CARRIERS = \[([\s\S]*?)\n\];/);
console.log([...m[1].matchAll(/sat:\s*(\d+)/g)].map(x=>x[1])[Number(process.argv[1])]);' "$N")

fail(){ echo "  VERIFY FAILED: $*" >&2; exit 1; }

J=$(curl -s "$ORD/inscription/$ID" -H 'Accept: application/json')
echo "$J" | grep -q '"id"' || fail "ord does not know inscription $ID"

LOCAL_BYTES=$(wc -c < "$HTML" | tr -d ' ')
node -e '
const j=JSON.parse(process.argv[1]), want={sat:process.argv[2], engine:process.argv[3], n:Number(process.argv[4]), bytes:Number(process.argv[5])};
const errs=[];
if(String(j.sat)!==want.sat) errs.push(`sat is ${j.sat}, expected ${want.sat}`);
if(j.value!==330) errs.push(`value is ${j.value}, expected 330 (carrier not intact)`);
if(!/:0$/.test(j.satpoint)) errs.push(`satpoint ${j.satpoint} is not at offset 0`);
if(!(j.parents||[]).includes(want.engine)) errs.push(`parents ${JSON.stringify(j.parents)} does not include the engine`);
// NOT a constant: the HTML length varies with the width of hue/ht/block, e.g.
// hue="84.0000" is a byte shorter than hue="324.0000". Compare to the real file.
if(j.content_length!==want.bytes) errs.push(`content_length ${j.content_length}, local file is ${want.bytes}`);
if(!/^text\/html/.test(j.content_type||"")) errs.push(`content_type ${j.content_type}`);
if(errs.length){console.error("  "+errs.join("\n  "));process.exit(1);}
console.log(`  chain record ✓  sat ${j.sat}, offset 0, value 330, parent=engine, height ${j.height}, charms ${JSON.stringify(j.charms)}`);
' "$J" "$SAT" "$ENGINE" "$N" "$LOCAL_BYTES" || fail "inscription record wrong"

curl -s "$ORD/content/$ID" -o /tmp/vp_$$.html
cmp -s /tmp/vp_$$.html "$HTML" || { rm -f /tmp/vp_$$.html; fail "on-chain content differs from $HTML"; }
rm -f /tmp/vp_$$.html
echo "  content ✓  byte-identical to $HTML"

HEX=$(curl -s "$ORD/r/metadata/$ID")
node cbor_verify.mjs "$HEX" "$META" || fail "on-chain CBOR metadata wrong"

curl -s "$ORD/r/children/$ENGINE/inscriptions" 2>/dev/null | grep -q "$ID" \
  || curl -s "$ORD/r/children/$ENGINE" | grep -q "$ID" \
  || fail "piece is not listed among the engine's children"
echo "  lineage ✓  listed under the engine's children"
