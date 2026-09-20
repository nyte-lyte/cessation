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

node -e '
const j=JSON.parse(process.argv[1]), want={sat:process.argv[2], engine:process.argv[3], n:Number(process.argv[4])};
const errs=[];
if(String(j.sat)!==want.sat) errs.push(`sat is ${j.sat}, expected ${want.sat}`);
if(j.value!==330) errs.push(`value is ${j.value}, expected 330 (carrier not intact)`);
if(!/:0$/.test(j.satpoint)) errs.push(`satpoint ${j.satpoint} is not at offset 0`);
if(!(j.parents||[]).includes(want.engine)) errs.push(`parents ${JSON.stringify(j.parents)} does not include the engine`);
if(j.content_length!==322) errs.push(`content_length ${j.content_length}, expected 322`);
if(!/^text\/html/.test(j.content_type||"")) errs.push(`content_type ${j.content_type}`);
if(errs.length){console.error("  "+errs.join("\n  "));process.exit(1);}
console.log(`  chain record ✓  sat ${j.sat}, offset 0, value 330, parent=engine, height ${j.height}, charms ${JSON.stringify(j.charms)}`);
' "$J" "$SAT" "$ENGINE" "$N" || fail "inscription record wrong"

curl -s "$ORD/content/$ID" -o /tmp/vp_$$.html
cmp -s /tmp/vp_$$.html "$HTML" || { rm -f /tmp/vp_$$.html; fail "on-chain content differs from $HTML"; }
rm -f /tmp/vp_$$.html
echo "  content ✓  byte-identical to $HTML"

curl -s "$ORD/r/metadata/$ID" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
const buf=Buffer.from(s.trim().replace(/^"|"$/g,""),"hex");
let i=0;
function rd(){const b=buf[i++],mt=b>>5,ai=b&31;let v=ai;
  if(ai===24)v=buf[i++];else if(ai===25){v=buf.readUInt16BE(i);i+=2;}
  else if(ai===26){v=buf.readUInt32BE(i);i+=4;}
  else if(ai===27){v=Number(buf.readBigUInt64BE(i));i+=8;}
  switch(mt){case 0:return v;case 1:return -1-v;
    case 3:{const t=buf.slice(i,i+v).toString("utf8");i+=v;return t;}
    case 4:{const a=[];for(let k=0;k<v;k++)a.push(rd());return a;}
    case 5:{const o={};for(let k=0;k<v;k++){const kk=rd();o[kk]=rd();}return o;}
    case 7:{if(ai===27)return buf.readDoubleBE(i-8);if(ai===26)return buf.readFloatBE(i-4);return v;}}
  throw new Error("cbor mt "+mt);}
const on=rd();
const local=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const errs=[];
const keys=Object.keys(on).sort().join(",");
if(keys!=="dataset,hashTail,inscriptionUnix,pieceIndex") errs.push("keys on chain are "+keys);
if(on.pieceIndex!==local.pieceIndex) errs.push(`pieceIndex ${on.pieceIndex} != ${local.pieceIndex}`);
if(on.hashTail!==local.hashTail) errs.push(`hashTail ${on.hashTail} != ${local.hashTail}`);
if(on.inscriptionUnix!==local.inscriptionUnix) errs.push(`inscriptionUnix mismatch`);
if(on.dataset.date!==local.dataset.date) errs.push(`date ${on.dataset.date} != ${local.dataset.date}`);
for(const grp of ["ecg","labs"]) for(const k of Object.keys(local.dataset[grp]))
  if(Math.abs(on.dataset[grp][k]-local.dataset[grp][k])>1e-9) errs.push(`${grp}.${k} ${on.dataset[grp][k]} != ${local.dataset[grp][k]}`);
const blob=JSON.stringify(on);
if(/\/Users\/|hillyer|jess|@gmail|\.local/i.test(blob)) errs.push("IDENTITY STRING IN ON-CHAIN METADATA");
if(errs.length){console.error("  "+errs.join("\n  "));process.exit(1);}
console.log(`  metadata ✓  four keys, ${on.dataset.date}, ecg+labs match source, no identity`);
});' "$META" || fail "on-chain CBOR metadata wrong"

curl -s "$ORD/r/children/$ENGINE/inscriptions" 2>/dev/null | grep -q "$ID" \
  || curl -s "$ORD/r/children/$ENGINE" | grep -q "$ID" \
  || fail "piece is not listed among the engine's children"
echo "  lineage ✓  listed under the engine's children"
