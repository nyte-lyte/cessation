# Inscribing — the operational reference

Written 2026-09-06. **This is the single source of truth for how a Cessation piece gets
onto Bitcoin.** Everything here is either read off the chain from the previous mint or
measured on regtest; where something is only reasoned, it says so.

Related: [wallets.md](wallets.md) for what is held where, [testing.md](testing.md) for the
experiments behind these rules, [todo.md](todo.md) for what is still undecided.

---

## 1. The environment

| | |
|---|---|
| Node datadir | `/Volumes/Bitcoin/Bitcoin` — external volume, **must be mounted** |
| Node config | `txindex=1`, `server=1`, `rpcuser=bitcoin`, `rpcpassword=bitcoin`, an `assumevalid` |
| Bitcoin Core | **31.1** (upgraded 2026-09-06 — see §3) |
| ord | 0.27.1, data dir `/Volumes/Bitcoin/Ord` (`index.redb` ~164 GiB + three 2024 `.old` copies) |
| ord wrapper | `ord2.sh` — mainnet RPC + that data dir + `--index-sats` |
| Hot wallet | `ord` — the inscribing wallet, fee sats + carriers |
| Cold wallet | `ord-cold` — the rare sats, moved to `ord` one at a time |

```
bitcoind -datadir=/Volumes/Bitcoin/Bitcoin -daemon
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin loadwallet ord
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin loadwallet ord-cold
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin stop
```

### The ord index is a month of work — protect it

**A full `--index-sats` rebuild from genesis took over a month** (creator's own experience).
ord has **no compaction command** — `ord index` offers only `export`, `info`, `update` —
so the only way to reclaim the 90 GB of fragmentation (51% of the file) is to delete
`index.redb` and re-index from scratch. **Do not.** The space is not worth a month, and
489 GB is free on the volume anyway. Earlier notes framing a rebuild as merely "not
urgent" understated this badly.

Practical consequences:
- **Never delete or move `index.redb`.**
- ord commits every **5,000 blocks** by default (`--commit-interval`). Catching up less
  than that reports no height change at all until it finishes and commits once — the file's
  mtime advancing is the only live progress signal. Killing ord mid-catch-up discards the
  uncommitted work and restarts from the last commit.
- The three `index.redb.*.old` copies date from Sep/Oct 2024, ~80 GB each. Stale by
  months, but restoring one and catching up beats starting from genesis. **A current
  backup, taken once the index is caught up and ord is stopped, is worth far more than
  the three 2024 ones** — and would let those be deleted, reclaiming 242 GB.

**There is a second, decoy datadir** at `~/Library/Application Support/Bitcoin`. It is a
**pruned** node with an empty `ord` wallet, and it is not the inscribing node. Checking it
leads to the wrong conclusion that the node is pruned and unusable.

---

## 2. The model — how a sat ends up inscribed

Sats flow through a transaction **in input order**. An output of value `V` takes the next
`V` sats from the concatenated input stream. **Whatever is left at the end of the stream
is the fee, and goes to the miner.**

An inscription is two transactions — commit, then reveal — so the fee is taken **twice**.
For a sat to be *the* inscribed sat, it must sit at **offset 0** of the inscription output.

A **carrier** is a UTXO whose first sat is the rare sat you intend to inscribe. Everything
after it in that UTXO is padding.

---

## 3. Rules that are not negotiable

### 3.1 The carrier must pass through unchanged

**`output[0]` the same size as `input[0]`, with the fee coming from a separate input.**

This is how the v1/v2 mint did it, read off the chain. The 28-piece batch reveal
`5d643a3e…`:

```
inputs :  7x330, 20x546, 1x1600, 1x10000,  + one 23,955-sat funding UTXO
outputs:  7x330, 20x546, 1x1600, 1x10000   (same sizes, same order)
FEE    :  23,955 — exactly the extra input, consumed entirely
```

Input order mirrors output order size-for-size, so each carrier passes through 1:1 and no
rare sat is ever in a position to be spent. Single inscriptions are the same shape:

```
piece 0:  in [10000, 1767]   out [10000, 546]    fee 1221
engine:   in [10000, 71583]  out [10000, 10000]  fee 61583
piece 29: in [10000, 1764]   out [10000, 546]    fee 1218
```

**In practice you get this by setting `--postage` to the carrier's full size.** ord then
has to pull in a funding input to pay the reveal fee, instead of taking it out of slack.

### 3.2 Never leave `--postage` to default

ord's default is `TARGET_POSTAGE = 10,000`. Measured on regtest against a 907-sat all-rare
UTXO, that pulled **the entire range into a single inscription output**.

Set it lower than the carrier and the *reveal* fee eats the remainder — measured: postage
330 against a 469-sat commit output destroyed **70 rare sats**, while the commit itself
was fine. A funding input alone does **not** save you; it only protects the commit.

### 3.3 Lock every carrier you are not currently inscribing

**ord cannot see that these sats are rare.** Its rarity enum covers only *alpha* sats, so
an Omega black uncommon is labelled `common` and Nakamoto-era sats are not a rarity at
all. Every unlocked carrier is ordinary spendable change to ord.

Measured: inscribing carrier 0 with the correct postage, ord pulled **carrier 1 in as a
funding input and burned its 330 rare sats.** With carrier 1 locked, the same operation
left it untouched — `spent=false`, all 330 intact.

```
bitcoin-cli -rpcwallet=ord lockunspent false '[{"txid":"<txid>","vout":<n>}, ...]' true
bitcoin-cli -rpcwallet=ord listlockunspent
```

**That trailing `true` is `persistent`, and it is not optional.** Core's default stores
locks **in memory only** — *"always cleared (by virtue of process exit) when a node stops
or fails."* Measured 2026-09-06: 7 locks before a node restart, **1 after** — only the
persistent one survived. Carriers may sit for years across countless restarts; a
non-persistent lock evaporates on the first one and silently returns the rare sats to
the spendable pool.

**A lock is the second line of defence, not the first.** Keep carriers in `ord-cold`,
a wallet never used to fund anything, and move exactly one to `ord` at inscription time.
The lock protects against a mistake inside the hot wallet; the wallet separation protects
against the lock being lost.

ord honours locks (`plan.rs` skips `locked_utxos` when selecting cardinals) and already
auto-locks *inscribed* outputs. It just never locks uninscribed rare carriers.

**The lock is the difference between zero and 330 sats destroyed, and ord gives no signal
either way.**

### 3.4 Never pass `--no-backup`

It skips importing the ephemeral key that controls the commit output — and the sat being
inscribed sits at that address until the reveal confirms. If the reveal is evicted or the
machine dies between broadcasts, the sat is unrecoverable.

It was only ever needed because **Core 30.0–30.3** has a regression breaking ord's
recovery-key backup. **Core 31.1 is installed and the flag is retired.** If
`bitcoind -version` ever reports 30.x again, stop and read [testing.md](testing.md).

Confirm the backup actually happened: the commit output should come back `ismine=true`,
`solvable=true`, labelled `commit tx recovery key`.

### 3.5 One block per piece

Lifespan derives from the block hash, so two pieces sharing a block share a lifespan.
`inscribe.js` keeps `inscribed_blocks.json` as the ledger and refuses a reused block or
height. **Reset that file before a fresh mint** — it currently holds regtest heights.

### 3.6 Account for every rare sat after every step

Three of the four failing regtest configurations returned **exit code 0** and looked
entirely normal. ord will not tell you. After each transaction, scan the block's outputs
and confirm the count preserved equals the count you started with.

```
curl -s -H 'Accept: application/json' http://<ord>/output/<txid>:<vout>
```

(The ord server holds the index lock, so use HTTP while it is running, not `ord list`.)

---

## 4. The two carrier shapes

| shape | which | behaviour |
|---|---|---|
| **1 rare sat at offset 0 + common padding** | the 7 Omega carriers (546/546/546/546/330/330/330) | fees come off the end of the stream and eat padding. The rare sat survives. **This is the shape the v1/v2 mint used throughout, and the one-at-a-time cold→hot workflow is correct for it.** |
| **entirely rare, no padding** | the Nakamoto 907-sat range | nothing but rare sats exists for a fee to come from, so **every fee burns Nakamoto sats**. Measured: `ord wallet send` on it cost 111 rare sats in transfer fees alone. |

The all-rare range is the genuinely new case — v1/v2 never had one; its Nakamoto sat sat
in a padded carrier like everything else.

---

## 5. Preparing the Nakamoto range (the split)

Only needed for the all-rare range. **Verified on regtest: 907/907 preserved, zero lost.**

One transaction:
- **`input[0]` = the rare UTXO** so its sats lead the stream
- `input[1]` = a common funding UTXO
- outputs sized to the chunks you want; the final short chunk topped up to the **330-sat
  P2TR dust floor** with commons, which land *after* the rare sats and become its padding
- change output last; the fee comes off trailing commons

Measured result on 907 sats:

```
out0: 330 all rare                first sat rare   <- carrier 0
out1: 330 all rare                first sat rare   <- carrier 1
out2: 330 = 247 rare + 83 common  first sat rare   <- carrier 2
out3: change, all common
907 of 907 preserved
```

**Then lock all of them immediately** (§3.3), and record each carrier's first sat and rare
run in `PIECE_CARRIERS` in `inscribe.js`.

**Capacity: ~3 carriers from 907 sats.** The range does not stretch to 30 pieces.

---

## 5b. Peeling single Nakamoto sats into carriers — VERIFIED 2026-09-06

The plan is ~120 pieces on Nakamoto sats, the 6 spare Omegas held back. That needs 120
carriers of the **1 rare sat + common padding** shape (§4), not the 330-sat all-rare
chunks of §5 — those only yield ~3.

**Why it takes two transactions per sat.** Common padding cannot be interleaved between
contiguous Nakamoto sats inside one transaction: the range arrives as one uninterrupted
run in the sat stream, so any output boundary can only *cut* the run, never insert
commons into it. The way round it is to first move the target sat to the **end** of a
commons-led output, then peel it to the **front** of a new one.

**Round 1 — land the target at the end of a commons output.**
Inputs in this order: `[commons A] [rare range] [commons B]`.
- `out0 = |A| + 1` → all of A, then N0. **N0 is now the last sat of out0.**
- `out1 = rest of the range` (N1…)
- `out2 = change from B`; the fee comes off B's tail, so the range is untouched.

**Round 2 — peel it to offset 0 with padding.**
Inputs: `[out0 from round 1] [a commons UTXO]`.
- `out0 = |A|` → the leading commons, as change
- `out1 = 330` → **N0 followed by 329 common sats — the carrier**
- `out2 = remaining commons`; fee off the tail.

Measured result:

```
carrier: value 330
  ranges: [[1250000000802, 1250000000803]]   <- 1 Nakamoto sat at offset 0
          [[1245000000000, 1245000000329]]   <- 329 common sats of padding
```

Zero sats lost across both rounds. The carrier is structurally identical to the existing
Omega carriers, so from here the normal rules apply (§3).

### The batched peel — BUILT AND VERIFIED 2026-09-06

**Use `peel.js`.** It generates all of this for any K, dry-run by default:

```
node peel.js plan --range <txid:vout> --carriers 120 --chunks 2 --fee-rate 1
node peel.js split  [--broadcast]
node peel.js roundb [--broadcast]     # then wait for confirmation
node peel.js roundc [--broadcast]     # then wait for confirmation
node peel.js collect                  # verifies and LOCKS the carriers
```

It aborts if the rare-sat count fails to reconcile at any step, refuses outputs below
dust, picks the smallest suitable cardinals so tails stay small, locks each carrier as
soon as it is verified, and prints ready-made `PIECE_CARRIERS` entries for `inscribe.js`.
Round B and C are separate commands because ord only indexes **confirmed** outputs, so
the accounting check cannot run until the previous transaction has a block.


Both rounds batch on the same interleaving principle: **one commons input per chunk**.
Verified end to end on regtest with K=3, **907 of 907 preserved, zero lost.**

**Step A — split the range into K chunks.** One transaction: `[rare range][commons]`,
outputs sized so every chunk is at least 331 sats (so it still clears the 330 dust floor
after losing a sat), the last topped up with commons. Fee off trailing commons.

```
chunk0: 331 sats, 331 rare
chunk1: 331 sats, 331 rare
chunk2: 331 sats, 245 rare + 86 common
907 of 907 preserved
```

**Step B — batched round 1. K sats peeled in ONE transaction.**
Inputs interleaved `[C_1][chunk_1][C_2][chunk_2] … [C_fee]`. For each chunk:
`out = |C_i| + 1` → that commons UTXO followed by the chunk's first rare sat, so the sat
lands at the **end** of the output. The next output takes the chunk's remainder.

```
out0: 1001  rare   1   TAIL (1 rare at END)
out1:  330  rare 330   chunk remainder
out2: 1001  rare   1   TAIL
out3:  330  rare 330   chunk remainder
out4: 1001  rare   1   TAIL
out5:  330  rare 244   chunk remainder
907 of 907 preserved
```

**Step C — batched round 2. K tails → K carriers in ONE transaction.**
Inputs are the tails in order, plus one commons input to pad the last carrier. Each tail
gives up its leading commons as change, its rare sat then leads a carrier, and that
carrier's padding comes from the **following input's** leading commons.

```
out0: 1000  change
out1:  330  CARRIER  first sat …000  padding 329
out2:  671  change
out3:  330  CARRIER  first sat …331  padding 329
out4:  671  change
out5:  330  CARRIER  first sat …662  padding 329
3 carriers, zero lost
```

Each carrier is `1 rare sat at offset 0 + 329 common sats` — structurally identical to the
existing Omega carriers, so §3 applies from here.

**Scaling — and the constraint that actually binds.** K carriers come out of each
*pair* of transactions, so the temptation is to raise K. **K is bounded by the size of
the rare range, not by transaction size.** Chunks are sequential slices of the sat
stream, and in the split every common sat lands *after* the whole rare run — so only the
**last** chunk can be padded. Every other chunk must be that many **rare** sats:

```
K x (DUST + rounds)  <=  rare sats available
```

For **120 carriers from the 907-sat range**, at 1 sat/vB:

| K | rounds | chunk size | K x chunk | transactions | fees |
|---|---|---|---|---|---|
| 1 | 120 | 450 | 450 | 241 | ~68,400 sats |
| **2** | **60** | **390** | **780** | **121** | **~55,000 sats** |
| 3 | 40 | 370 | 1110 | — | needs more rare sats than exist |
| 4 | 30 | 360 | 1440 | — | needs more rare sats than exist |

**K=2 is the maximum: 121 transactions.** An earlier version of this file claimed K=12 or
K=30 was possible — that was wrong, it ignored the fact that chunks must be carved out of
the rare run itself. `peel.js` now refuses a too-large K and explains why.

**Total cost for 120 carriers: ~94,500 sats** — ~55,000 in fees at 1 sat/vB plus the
39,480 of permanent carrier padding. Raising K would need a bigger Nakamoto range, not a
cleverer transaction.

Padding alone is 246 carriers x 329 = **80,934 common sats**, plus fees across every transaction.
Model the total at the intended fee rate before starting; this is the expensive step.

---

## 6. The run

For each piece, in order, one block apart:

1. **Read the block** you are anchoring to — height, hash, timestamp.
2. **Unlock only this carrier**; everything else stays locked.
3. **Move it** from `ord-cold` to `ord` if it is not already there.
4. `node inscribe.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>` — from the
   repo root, so paths stay relative (`/Users/<name>/…` leaks identity onto chain).
5. **Read the metadata before broadcasting** — see §7. Blocking.
6. Run the printed `ord wallet inscribe` command. It carries `--sat` and `--postage`
   already; do not drop either. No `--no-backup`.
7. **Wait for confirmation**, then account for every rare sat (§3.6).
8. Re-lock, and read the *new* block before starting the next piece.

The engine is inscribed by hand, once, before any piece:

```
ord wallet inscribe --fee-rate <R> --sat 1459982499999999 \
    --postage <that carrier's full size> --file index_bundle.js
```

**Batch mode is worth considering.** v1/v2 did 28 pieces in one batch reveal
(`mode: separate-outputs`, per-inscription postages matching each carrier). That gives the
input↔output mirroring of §3.1 by construction. It does mean all those pieces share a
block, which conflicts with §3.5 — resolve that before choosing.

---

## 6b. What it costs — MEASURED on regtest 2026-09-06

Measured by actually inscribing, not estimated. vsize is network-independent, so these
scale linearly with whatever fee rate is current.

| | vsize | at 1 sat/vB |
|---|---|---|
| **Engine** (`index_bundle.js`, 100,173 bytes) | 25,478 vB | 25,478 sats |
| **One piece** (277-byte HTML + 581-byte CBOR, with `--parent`) | 608 vB | 608 sats |

Engine breakdown: commit 154 vB, reveal 25,324 vB. Piece: commit 212 vB, reveal 396 vB.

**The engine is 58% of a 30-piece re-mint on its own** — one engine costs as much as 41
pieces. It is the single item worth checking the fee rate for.

| rate | engine | 30 pieces | re-mint total |
|---|---|---|---|
| 1/vB | 25,478 | 18,240 | **43,718 sats** |
| 5/vB | 127,390 | 91,200 | 218,590 |
| 10/vB | 254,780 | 182,400 | 437,180 |
| 50/vB | 1,273,900 | 912,000 | 2,185,900 |

Add the peel if the Nakamoto range is being prepared: **193,488 sats** at 1 sat/vB for 246
carriers (`peel.js plan --carriers 246 --chunks 2`), of which 80,934 is carrier padding
that does not scale with the fee rate.

## 7. The metadata gate — blocking, nothing is broadcast until it passes

A real name reached Bitcoin permanently on the second inscription. It is the most
expensive mistake this project has made and it cannot be undone.

- Decode the CBOR of the **composed inscription**, not just the source JSON, and confirm
  exactly four keys: `pieceIndex`, `hashTail`, `inscriptionUnix`, `dataset`. Any fifth is
  a stop.
- Grep the decoded output for the username, real name, and `/Users/`.
- **Absolute paths leak identity.** Run `inscribe.js` from the repo root; check the
  inscribe command and any batch YAML the same way.

---

## 8. Pre-flight

- [ ] External volume mounted; node synced; `pruned=false`
- [ ] `bitcoind -version` reports **31.x** (not 30.x)
- [ ] Both wallets load; UTXOs match [wallets.md](wallets.md)
- [ ] All carriers locked except the one in hand
- [ ] `inscribed_blocks.json` reset for a fresh mint
- [ ] `PIECE_CARRIERS` filled from the real split tx — it ships empty on purpose
- [ ] Engine bundle rebuilds byte-identical; `node test/scale.test.mjs` passes
- [ ] Metadata gate passed (§7)
- [ ] Wallet backups taken

---

## 8b. WHERE THE MAINNET RUN ACTUALLY IS — updated 2026-09-08

**30 carriers made and verified. Batch two (30 → 60) running.**
State lives in `peel_state.json` (gitignored) — that file is the resume point; do not
delete it. The driver script lives at `/tmp/rounds3.sh` (`TARGET=` sets the batch end).

```
range      12425429610010 .. 12425429610916   (907 sats)
source     b9c74659198160579a1b6616f2ca6f435a8e168d73d02bd19da64b2871521150:0
split tx   3779b85871adb678c4e0688364062b0d754a62abdd80fc1de5d7f72e67efed3c
K          1        (ONE carrier per round — chosen for consecutive ordering)
feeRate    1 sat/vB

carriers   30, all verified: 330 sats, 1 Nakamoto sat at offset 0, persistently locked
             12425429610010 .. 12425429610036   (27 consecutive)
             12425429610463 .. 12425429610465   (3, made before the K=1 switch)
chunk A    8ff73420…:1   426 sats, holds 610037..610462  <- being peeled
reserve    729c98e0…:3   451 sats, holds 610466..610916  <- held back
ord-cold   ~180,900 sats spendable
accounting carriers 30 + chunkA 426 + reserve 451 = 907 / 907, nothing lost
```

**Run a batch:** edit `TARGET=` in `/tmp/rounds3.sh`, then `nohup bash /tmp/rounds3.sh &`.
It counts actual carriers (not rounds), is resume-aware (finishes a pending round B or C
first), and halts on any accounting mismatch.

### Why K=1 — decided 2026-09-07

K is not just a cost knob: **it determines whether the sats come out consecutive.** With
K=2 each round peels one sat from *each* chunk, so carriers alternate (+0, +453, +1, +454)
and the collection ends up as two runs. K=1 peels one chunk strictly in order.

The price is **2 transactions per carrier instead of 1** — roughly double the fees. The
creator chose K=1 deliberately: the collection is to be inscribed in consecutive order.
**This should have been surfaced before K=2 was started; it was presented as a pure cost
optimisation.** Three carriers off chunk B exist because of that (`…610463–610465`) — not
wasted, they sit exactly where chunk A's run will eventually reach.

### The consecutive run can be gapless

Chunk A stops at the 330-sat dust floor with `…610133–610462` still inside — normally
stranded. **It can be topped up with common sats and peeled further**, because padding
added *after* the rare run does not disturb ordering. With top-ups the run continues to
`…610462`, meets the three chunk-B strays at `…610463`, and carries on into chunk B. A
fully gapless collection is achievable. Untested — the top-up has not been done yet.

### Budget

At ~840 sats per carrier (2 × 255 fees + 329 padding), measured:

| target | more needed | approx cost |
|---|---|---|
| 60 | 30 | ~25,000 |
| 123 (chunk A's floor) | 93 | ~78,000 |
| 246 (everything, needs top-ups) | 216 | ~181,000 |

~180,900 available. **246 at K=1 is roughly break-even and leaves nothing for the
re-mint** (43,718). Fund more, or stop around 123 and leave chunk B for later.

### Do not use `estimatesmartfee` to decide the bid — measure the backlog instead

`estimatesmartfee` is a **conservative historical estimator** and it lags real conditions
badly. It misled this run twice on 2026-09-07/08, both times toward overpaying:

| moment | `estimatesmartfee` 1 blk | reality |
|---|---|---|
| deciding the peel rate | 2.12 sat/vB | 1 sat/vB confirming in a median of **6 min** |
| after a genuine spike drained | 3.0 sat/vB | only **0.16 MvB** outbid 1 sat/vB — under a fifth of one block |

**The number that decides whether a transaction confirms is how much of the mempool
outbids it**, not what the estimator predicts:

```
bitcoin-cli getrawmempool true | python3 -c "
import sys,json
m=json.load(sys.stdin); above=tot=0
for t,d in m.items():
    vs=d['vsize']; tot+=vs
    if d['fees']['base']*1e8/vs > RATE: above+=vs
print(f'above RATE: {above/1e6:.2f} MvB of {tot/1e6:.2f} MvB -> ~{above/1e6:.1f} blocks ahead')"
```

A block is roughly 1 MvB. If less than ~1 MvB outbids your rate, you are in the next
block or two. **mempool.space shows this directly and was right both times the estimator
was wrong** — the creator read it correctly on both occasions while I was quoting the RPC.

Also measured, and the reason not to panic-bump: at 1 sat/vB the carrier transactions
confirmed in a **median of 6 minutes** (range 3–34) across eight consecutive rounds. One
transaction did stall 4 hours during a real spike (next-block hit 4.18 sat/vB) — it
confirmed on its own once the spike drained, with no bump and nothing wasted. The driver's
4-hour timeout is there to stop the run in that case, not to trigger a fee increase.

**Rule: before raising a bid, check the backlog above your rate and the actual confirmation
times of recent transactions. Do not raise it because the estimator says so.**

## 9. Still open

- **The sat plan — DECIDED 2026-09-06:** the 6 spare Omegas do **not** carry pieces for
  now; **246** Nakamoto sats get peeled out of the 907 (the maximum; 247 is one sat short because both chunks peel together) into single-sat carriers (§5b).
  Still to design: the *batched* peel procedure, and its cost at a real fee rate.
- **`PIECE_CARRIERS` is still empty** — fill it from `peel.js status` once the first 15
  rounds finish. It prints entries oldest-first, ready to paste.
- **Batch vs one-at-a-time** — §6.
- **Rounds 16–123 of the peel**, waiting on 1 sat/vB (§8b).
- **An index backup.** The index is current as of 2026-09-07 after a 13.5-hour catch-up;
  the only copies are from 2024. Deprioritised by the creator, recorded as a known risk.
