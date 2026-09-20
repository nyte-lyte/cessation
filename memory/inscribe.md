# Inscribing — the operational reference

Written 2026-09-06. **This is the single source of truth for how a Cessation piece gets
onto Bitcoin.** Everything here is either read off the chain from the previous inscription or
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
| Cold wallet | `ord-cold` — the rare sats, moved to the **fresh v3 wallet** one at a time (§7c) |

```
bitcoind -datadir=/Volumes/Bitcoin/Bitcoin -daemon
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin loadwallet ord
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin loadwallet ord-cold
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin stop
```

### Mainnet ord is STOPPED as of 2026-09-13 — how to bring it back

Shut down deliberately at the end of the 2026-09-13 session to free memory: it held
~5.3 GB resident and was starving the machine during regtest runs (background tasks
were being killed, and the 30-piece run visibly slowed). It was fully caught up at
966,856 and was stopped with `kill -INT`, NOT killed — it committed on the way out
(index.redb mtime advanced, 173 GB intact).

Restart with the existing wrapper:

```
./ord2.sh server                 # mainnet RPC + /Volumes/Bitcoin/Ord + --index-sats
```

It will catch up from 966,856. Expect that to take a while but not a rebuild — the
index is intact. Verify before trusting it:

```
curl -s http://127.0.0.1:80/r/blockheight          # ord
bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin getblockcount   # should converge
```

**Only stop it again when those two match.** Stopping mid-catch-up loses the
uncommitted work. `kill -INT` and wait; never `kill -9`.

Note it is not needed for regtest work at all — the regtest env is a separate ord on
port 9001 and is unaffected.

### ord2.sh serves on port 80, not 8080 — and on ALL interfaces

Corrected 2026-09-16. `ord2.sh` passes no `--http-port`, so `ord server` takes the
default **80**. An earlier instance in these notes was on 8080, which means it had
been started with an explicit port; the wrapper does not. This matters because
`ord wallet` also defaults to `--server-url http://localhost:80`, so the two agree
only when the server is left on the default.

It also binds to `*:80` — **all interfaces, not loopback**. Verified with
`lsof -nP -iTCP:80 -sTCP:LISTEN`. What that exposes is the block explorer and the
recursive endpoints, i.e. public chain data, not keys and not wallet operations —
`ord wallet` talks to bitcoind locally. Still an unauthenticated service reachable
from the local network. Recorded as a fact for the security pass.

**Catch-up shows no height change until it commits.** ord commits in batches, so a
gap smaller than the commit interval leaves `/r/blockheight` frozen at the old value
for the whole catch-up. Watch `stat -f '%Sm' /Volumes/Bitcoin/Ord/index.redb` instead
— a moving mtime means it is working. Measured 2026-09-16: a 502-block gap reported
no height movement at all while actively writing.

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

This is how the v1/v2 inscription run did it, read off the chain. The 28-piece batch reveal
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

**`--postage` is the carrier's FULL OUTPUT SIZE, not its rare-sat count.** For the mainnet
carriers that is **330** — 1 Nakamoto sat + 329 common padding. Earlier wording here said
"postage must equal the contiguous rare run", which was the same number while carriers were
all-rare chunks and became wrong the moment they were padded: `inscribe.js` printed
`--postage 1sat`, below the dust floor. Its field is now `postage` (holding 330) rather
than `run`, and the guard rejects anything under the dust floor. Found by running
`inscribe.js` and reading the command it printed — not by reasoning about it.

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
a wallet never used to fund anything, and move exactly one to the inscribing wallet at
inscription time — for v3 that is the fresh wallet, not `ord` (§7c).
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
height. **Reset that file before a fresh inscription run** — it currently holds regtest heights.

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
| **1 rare sat at offset 0 + common padding** | the 7 Omega carriers (546/546/546/546/330/330/330) | fees come off the end of the stream and eat padding. The rare sat survives. **This is the shape the v1/v2 inscription run used throughout, and the one-at-a-time cold→inscribing-wallet workflow is correct for it.** |
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
3. **Move it** from `ord-cold` to the **fresh v3 wallet** (NOT `ord` — that holds v1/v2;
   see §7c). `ord wallet send --fee-rate <R> --postage 330sat <fresh-addr> <txid>:<vout>:0`
   — `--postage` matching the carrier is mandatory (330 peeled / 546 Omega). Measured:
   omitting it inflates the carrier to 10,000 sats. Never have two carriers in the
   fresh wallet at once; that is the safety property, not a habit (§7c).
4. `node inscribe.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>` — from the
   repo root, so paths stay relative (`/Users/<name>/…` leaks identity onto chain).
5. **Read the metadata before broadcasting** — see §7. Blocking.
6. Run the printed `ord wallet inscribe` command **from the fresh v3 wallet**
   (`ord wallet --name <v3wallet> inscribe …`). It carries `--sat` and `--postage`
   already; do not drop either. No `--no-backup`.
7. **Wait for confirmation**, then account for every rare sat (§3.6).
8. Re-lock, and read the *new* block before starting the next piece.

The engine is inscribed by hand, once, before any piece — **into the fresh v3 wallet,
where it must then stay for the life of the collection**, because ord spends and
re-creates it as the parent of every child (§7c):

```
ord wallet inscribe --fee-rate <R> --sat 1459982499999999 \
    --postage 330sat --file index_bundle.js
```

**`--postage 330sat`, NOT 546.** Located and verified on chain 2026-09-18: the engine
sat sits in `b6bee748d138f06b7ddf710ab0bed97842dffda4bc9ed0eaebf6628bdba47878:1`, a
**330-sat** carrier with the sat at offset 0 (2 ranges). The seven Omegas are
"546/546/546/546/330/330/330" and the engine's is one of the 330s — the four 546-sat
carriers hold entirely different sats (1952159999999999, 1946032499999999,
1934694999999999, 1933312499999999). Reading "546" off the Omega description and
typing it here would set the wrong postage on the single most expensive inscription
in the project.

Move it with `handoff --sat`, which resolves the outpoint rather than trusting a
pasted one:

```
PEEL_NETWORK=mainnet PEEL_DATADIR=/Volumes/Bitcoin/Bitcoin \
PEEL_WALLET=ord-cold PEEL_ORD_URL=http://127.0.0.1:80 \
node peel.js handoff --sat 1459982499999999 --to <ord-v3 addr> --fee-rate 1 --broadcast
```

**Timing.** The engine is the first inscription of the real run, and once inscribed it
is the parent of every piece for ever — a change means a new engine and a new
collection. So it should go AFTER the piece-30 rehearsal, not before: that rehearsal is
the only test that exercises a real new reading arriving on chain, and it is the last
thing that could still surface an engine bug. Also do not move its carrier days ahead;
an uninscribed rare carrier sits in the hot wallet as `cardinal`, i.e. spendable.

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

**The engine is 58% of a 30-piece re-inscription on its own** — one engine costs as much as 41
pieces. It is the single item worth checking the fee rate for.

| rate | engine | 30 pieces | re-inscription total |
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

## 7a. The gate CANNOT be fully satisfied pre-broadcast — what to do instead

§7 asks for the CBOR of the **composed** inscription, not the source JSON. Tested
2026-09-20: that is not reachable before broadcast. `ord wallet inscribe --dry-run`
returns a `reveal_psbt`, but the PSBT is UNSIGNED — `decodepsbt` shows both inputs with
**no keys at all**, no witness and no tapscript. The inscription envelope is only
constructed at signing, so there is nothing to decode.

An attempt to predict it instead also failed: `test/cbor_encode.mjs` reproduces ord's
bytes for only 20 of 31 pieces, because encoding choices differ. So the composed bytes
cannot be known in advance.

**What IS achievable, and should be the protocol:**

1. **Pre-broadcast, check the source JSON** — exactly four keys, no identity-shaped
   content, all 17 values finite. That is what `inscribe.js`'s gate does, and what was
   run on all 31 regtest pieces.
2. **Trust the path, which is measured.** inscribe.js -> `--json-metadata` -> ord's CBOR
   was verified on chain across three full regtest runs: 31/31 clean, four keys, no
   identity, correct dates. The mainnet path is the same code.
3. **Decode the composed CBOR of piece 0 from the mempool, BEFORE inscribing piece 1.**
   It cannot be unsent, but it caps the blast radius at one piece instead of thirty-one.
   This is the step that replaces the impossible one.

### CBOR fidelity, measured 2026-09-20

Compared ord's on-chain metadata against the source JSON for all 31 regtest pieces,
decoded with a reference library (`cbor2`), not only our own decoder:

- Everything is **f64** — 4 x `0xfb` markers per piece, zero `0xfa`. Nothing is
  encoded at reduced precision, which was the fear.
- **30 of 31 pieces round-trip exactly.** One differed: piece 25's `healthIndex`,
  source `0.42842540792540795`, on chain `0.4284254079254079` — **5.55e-17, one ULP**,
  from JS `JSON.stringify` and Rust `serde_json` disagreeing on the last bit of a
  17-significant-digit double.
- Harmless: `healthIndex` is derived, the engine recomputes it for blended datasets,
  and no ranking depends on distinguishing two values 1e-16 apart.

## 7b. The hot wallet — checked and CLEAR (resolved 2026-09-18)

An earlier version of this section flagged four unlocked dust UTXOs in the hot `ord`
wallet (679/874/874/874 sat, ~14,000 confirmations) as "consistent with old v1/v2
inscription outputs" and said to verify before any mainnet run. **Verified, and the
concern was unfounded** — that was an inference from size and age, not evidence.

Checked with ord caught up (`--no-sync`, safe here: these outputs are ~14,000
confirmations old, so a 130-block index lag cannot affect them):

    ord wallet --name ord balance  ->  cardinal 101,645   ordinal 35,922

`/output/<outpoint>` for all four: **`inscriptions: 0`**. They are dust change from
the v1/v2 run, nothing more. The cardinal figure is exactly those four plus the 98,344
funding UTXO.

**The real inscriptions are protected.** ord tracks **90** inscriptions in the hot
wallet — 30 pieces x 3 layers, matching the history of the same sats being inscribed
three times. They count as `ordinal`, so ord will not select them as funding, and 32
UTXOs are locked as a second line.

Note the postage sum across those 90 (66,674 sat) exceeds the `ordinal` balance
(35,922). That is not a discrepancy: stacked inscriptions share a UTXO, so postage
double-counts outputs that carry more than one layer.

Moot for v3 in any case — v3 inscribes from a fresh wallet (§7c) and the hot wallet is
never in the path.

## 7c. Where v3 goes — decided 2026-09-13, transfer step VERIFIED on regtest

**v3 is inscribed from a FRESH wallet. `ord-cold` stays exactly as it is — sat
storage.** v1/v2 live in the hot `ord` wallet and are never touched, which is the
whole point: they must not share a wallet with v3.

This is not a new workflow. It is the one v1/v2 already used, confirmed on chain:
**65 carrier-sized arrivals across 38 transactions, 2026-05-03 to 2026-06-20, median
15 minutes apart** — carriers moved from storage into the inscribing wallet one or two
at a time, with inscribing in between. The only change for v3 is that the destination
is a fresh wallet rather than `ord`.

An earlier draft of this plan said a fresh wallet would cost "160 extra transactions".
**That was wrong.** Those transfers happen anyway, one per piece. Whether the carrier
lands in `ord` or in a fresh wallet is the same transaction either way, so a fresh
wallet costs nothing over reusing the hot one.

### The loop, per piece

1. Unlock exactly ONE carrier in `ord-cold` (`lockunspent true '[{...}]'`).
2. `node peel.js handoff --piece <N> --to <fresh-wallet-addr> --fee-rate <R> --broadcast`
   — **use `--piece`, not `--carrier`.** It resolves the outpoint from PIECE_CARRIERS
   so the ordering cannot be got wrong by hand. NOT `ord wallet send`; see below.
3. Confirm, then inscribe that piece from the fresh wallet with `--sat` and
   `--postage 330sat` as `inscribe.js` prints.
4. Next piece. Never two carriers in the fresh wallet at once.

### Why one at a time is the safety property, not just a habit

§3.3 measured ord pulling a second carrier in as a funding input and burning its rare
sats. **With only one carrier in the wallet there is no second one to take.** That is
what the one-at-a-time loop buys, and it is why it must not be "optimised" into a
batch move. Confirmed again 2026-09-13: a carrier arriving in a fresh wallet reports
as `cardinal: 330, ordinal: 0` — ord sees an uninscribed rare carrier as ordinary
spendable change and will fund from it.

### `--piece N` — the ordering cannot be typed wrong

`PIECE_CARRIERS` maps piece index -> sat, oldest sat first, and the outpoint appears
only in a trailing comment. So nothing mechanical connected "piece 7" to the right
UTXO; it relied on a human pasting the correct txid. On mainnet that mistake is
permanent AND silent — the piece lands on the wrong Nakamoto sat, everything succeeds,
and the collection's ordering is wrong for ever.

`--piece N` closes it. It reads the sat for piece N out of `inscribe.js`, then scans
the wallet's LOCKED outpoints (which is exactly the carrier set) for the one holding
that sat **at offset 0**, and refuses if the value does not equal the expected postage.

ord cannot shortcut this: `/sat/<n>` returns `satpoint: null` because `ord2.sh` does
not pass `--index-addresses`. The scan is 160 `/output` calls and takes a few seconds.

**Verified against the real mainnet carriers 2026-09-18** (dry run, nothing broadcast).
The independently resolved outpoint matched the recorded comment for every piece tried:

    piece  0 -> 00ca3bab0828b36c315dd4f8b98a024b216c4559…:1   MATCH
    piece  1 -> 4070a87b10202aa7fd2df379ada5a2ed3ae850b9…:1   MATCH
    piece  7 -> ab633404545cac147e2aa5af238fe604fd4205b9…:1   MATCH
    piece 29 -> 05307624397e8838d321f773d2e89353c3b750d1…:1   MATCH

That is also an independent check on the PIECE_CARRIERS table itself: the comments were
written from the peel, and the resolution reads the live chain, and they agree.

### Why the transfer cannot use `ord wallet send` — corrected 2026-09-18

An earlier version of this section said to move carriers with `ord wallet send`. **That
does not work**, and the 2026-09-13 rehearsal missed it because the source there was an
ord-created wallet.

`ord-cold` is a standard Core wallet carrying `pkh`/`sh`/`tr`/`wpkh` descriptors; ord
builds taproot-only wallets (2 `tr` descriptors). ord therefore refuses it outright:

    error: wallet "ord-cold" contains unexpected output descriptors, and does not
    appear to be an `ord` wallet, create a new wallet with `ord wallet create`

So the transfer is assembled by hand, the same way the peel itself was —
`createrawtransaction` / `signrawtransactionwithwallet` / `sendrawtransaction`, which
is why `peel.js` already had the machinery. `node peel.js handoff` wraps it:

    PEEL_NETWORK=mainnet PEEL_DATADIR=/Volumes/Bitcoin/Bitcoin \
    PEEL_WALLET=ord-cold PEEL_ORD_URL=http://127.0.0.1:80 \
    node peel.js handoff --carrier <txid>:<vout> --to <addr> --fee-rate 1 [--broadcast]

What it enforces, because the ordering IS the safety argument:

    input[0]  = the carrier          output[0] = EXACTLY the carrier's value
    input[1]  = funding              output[1] = change

Sats traverse a transaction in input order, so `output[0]` takes the first `value`
sats — the carrier's, rare sat still at offset 0. The fee is the tail, paid from the
funding input, and cannot reach the carrier. The command refuses to build if the
carrier is not `input[0]` or `output[0]` does not equal its value exactly. It also
excludes every locked outpoint from funding selection, so it can never pay a fee with
another carrier, and it re-locks the carrier if the run was a dry run or failed.

**Rehearsed 2026-09-18 on regtest**, deliberately from a Core-native wallet
(`coldtest`, same `pkh/sh/tr/wpkh` descriptors, ord rejects it identically):

    carrier 330 sat, first sat 4505000410582
    -> destination output: 330 sat, first sat 4505000410582   both OK

Dry run is the default; it re-locked the carrier afterwards, verified.

### Measured on regtest 2026-09-13 — `ord wallet send` postage

A bare 330-sat carrier (first sat 4505000000737) sent to a fresh wallet:

| invocation | resulting output | first sat |
|---|---|---|
| `--postage 330sat` | **330 sat** — carrier identical | preserved at offset 0 |
| no `--postage` (default 10000) | **10,000 sat** | preserved at offset 0 |

The default is **not** destructive — the rare sat survives at offset 0 either way —
but it inflates the carrier to 10,000 sats by pulling 9,670 from the funding input,
which then contradicts the `--postage 330sat` that `inscribe.js` prints for the
inscribe step, and wastes the difference. Always pass `--postage 330sat` on the
transfer. (Omega carriers are 546: pass `--postage 546sat` for those.)

Rehearsed end to end on regtest with a second wallet created via
`ord --datadir <dd> wallet --name v3test create`.

### The engine does NOT go to storage, and this is not optional

ord spends the engine as a parent input and re-creates it on every child inscription —
verified on regtest, where the engine's satpoint is now piece 30's reveal tx
(`7c8043bd…:0:0`). It must stay in the fresh wallet permanently, because every future
piece needs it as `--parent`. Send the engine away and the collection can never grow.

So the fresh wallet ends up holding: the engine (permanently), and whichever carrier is
in flight. Nothing else.

### Note on creating the real wallet

`ord wallet create` prints the BIP39 mnemonic to stdout, once. If it is run inside an
assistant session, the seed enters that transcript. Stated as a fact about the command,
not a recommendation about who should run it.

## 7d. The v3 wallet — creation, encryption, and the order to do it in

Rehearsed on regtest 2026-09-18 against `v3test`. **Encryption is compatible with the
ord workflow**, which was the open question:

| step | result |
|---|---|
| `ord wallet --name X balance` on a LOCKED encrypted wallet | works — reads are fine |
| `ord wallet --name X send` while LOCKED | fails loudly: `RpcError -13 "Please enter the wallet passphrase with walletpassphrase first."` |
| after `bitcoin-cli -rpcwallet=X walletpassphrase "<pass>" <secs>` | signs and broadcasts normally |

Cost of encrypting: one `walletpassphrase` before each signing step. Forgetting it is a
clean error, not a silent failure or a corrupted transaction.

**`encryptwallet` does NOT invalidate existing keys.** Core prints *"the keypool has
been flushed and a new HD seed was generated"*, which reads alarmingly — it refers to
FUTURE key generation. Verified: after encrypting, the wallet still reported its full
balance and still signed a spend of a pre-existing UTXO.

### Order matters, and it is one-way

1. `ord --datadir <dd> wallet --name <v3wallet> create`
   → **prints the BIP39 mnemonic ONCE, to stdout.** Write it down before pressing
   anything else. This is the step that was missed for `ord` and `ord-cold`, which is
   why neither has a seed backup today.
2. `bitcoin-cli -rpcwallet=<v3wallet> encryptwallet "<passphrase>"`
3. `bitcoin-cli -rpcwallet=<v3wallet> backupwallet "<path off this machine>"`

**Step 3 must come after step 2.** A backup taken before encryption is an unencrypted
copy of the keys, and stays unencrypted for ever regardless of what is done to the
original afterwards. Core itself says so after encrypting: *"You need to make a new
backup with the backupwallet RPC."*

### Why this wallet in particular must be backed up at creation

It holds the ENGINE permanently — the parent of every piece, spent and re-created on
each child inscription (§7c). Losing it does not just lose custody of the pieces: the
collection can never grow again, because no future piece could use `--parent`. That is
a different and worse failure than losing a carrier.

## 7e. Dress rehearsal of the REAL command — 2026-09-19

Every regtest run before this omitted `--sat`, so the command that actually runs on
mainnet had never executed anywhere:

    ord wallet inscribe --fee-rate R --sat <SAT> --postage 330sat \
        --parent <engine> --file <piece>.html --json-metadata <piece>.json

Rehearsed in full on regtest: carrier created in a Core-native wallet, locked, handed
off with `peel.js handoff --sat`, into an **encrypted** wallet, unlocked with
`walletpassphrase`, engine inscribed into that same wallet, then the piece inscribed on
the carrier with `--sat`. Result:

    vout[0]  10,000 sat  <- the PARENT (engine), returned to the wallet
    vout[1]     330 sat  <- the piece; first sat = the targeted sat, at offset 0

`--sat` targeted correctly, `--postage 330sat` preserved the carrier exactly, and the
rare sat survived at offset 0 of the inscription output.

### Three things this established

**1. The parent must be in the inscribing wallet — hard error, not guidance.**
Inscribing from `v3test` while the engine sat in `ord` failed outright:

    error: parent c1cc8b82…3335i0 not in wallet

So the engine must be inscribed INTO the v3 wallet and stay there. §7c said this; now
it is enforced by ord rather than by discipline.

**2. The output layout is [parent, piece] — the piece is vout 1, NOT vout 0.**
The returned parent takes vout 0. Checking vout 0 after a piece inscription shows the
engine's 10,000-sat output and a completely unrelated first sat — which reads exactly
like a destroyed rare sat when nothing is wrong. **Verify vout 1**, or read
`satpoint` off `/r/inscription/<id>`, which names the correct vout directly.

This is a transfer-vs-inscribe difference worth holding: `handoff` builds
`out[0] = carrier` because there is no parent. The inscribe tx does not.

**3. An encrypted wallet needs `walletpassphrase` before inscribing**, exactly as the
7d rehearsal showed for `send`. Reads work locked; signing does not.

## 8. Pre-flight

- [ ] External volume mounted; node synced; `pruned=false`
- [ ] `bitcoind -version` reports **31.x** (not 30.x)
- [ ] Both wallets load; UTXOs match [wallets.md](wallets.md)
- [ ] All carriers locked except the one in hand
- [ ] `inscribed_blocks.json` reset for a fresh inscription run
- [ ] `PIECE_CARRIERS` filled from the real split tx — it ships empty on purpose
- [ ] Engine bundle rebuilds byte-identical; `node test/scale.test.mjs` passes
- [ ] Metadata gate passed (§7)
- [ ] Wallet backups taken

---

## 8b. WHERE THINGS STAND — 2026-09-12

**The sats are done. The code is not yet trusted. NOTHING IS BEING INSCRIBED.**
Decision (creator, 2026-09-12): more regtest work first, to be sure the code is right.
The carriers are peeled and waiting — there is no time pressure on them.

### Done — the rare sats are ready

```
153 carriers made from the 907-sat Nakamoto range, every one verified on chain:
  330 sats, ONE Nakamoto sat at offset 0, persistently locked in ord-cold

  12425429610010 .. 12425429610159   150 CONSECUTIVE  -> the piece assignments
  12425429610463 .. 12425429610465     3 spares (pre-K=1, sit after a gap)

chunk A   423 sats, 303 Nakamoto still inside (needs another top-up to extract)
reserve   451 Nakamoto in chunk B, never touched
accounting  153 + 303 + 451 = 907 / 907 — nothing lost across ~310 mainnet txs
cost        ~87,000 sats total, about 570 per carrier
ord-cold    ~111,000 sats left    ord (hot) ~101,000 for the re-inscription
```

`PIECE_CARRIERS` in `inscribe.js` is **filled** with the 150 consecutive sats, oldest
first — piece 0 on `12425429610010`, the oldest Nakamoto sat held. The 3 spares are in
`SPARE_CARRIERS`, deliberately not assigned.

**150 consecutive sats is ~37 years at four pieces a year.**

### Still to do before anything is inscribed

- **More regtest verification of the engine and inscribe path** — the creator's call, and
  the right one. The v1/v2 history is two collections inscribed on code that had not been
  proven. Nothing about the peel changes that.
- **The metadata gate is only PARTLY satisfied** — see below.
- Engine not inscribed. `inscribed_blocks.json` reset to `{}` and the block-reuse guard
  re-tested (a repeated block is refused).

### The metadata gate — what passed, and what cannot be checked pre-broadcast

Passed:
- Source JSON has exactly four keys: `pieceIndex`, `hashTail`, `inscriptionUnix`, `dataset`.
- Identity scan clean across the metadata JSON, the 277-byte piece HTML, and the CBOR —
  no name, username, `/Users/`, `/Volumes/`, `.local`, or `@gmail`.
- **Composed** CBOR verified for 30 regtest pieces built by this same `inscribe.js`:
  exactly four keys, no identity, read back from `/r/metadata`.

**Not verifiable in advance:** the *mainnet* composed CBOR. ord embeds metadata in the
reveal **witness**, which does not exist until signing — `--dry-run` returns an unsigned
PSBT with no witness. Encoding the CBOR by hand to inspect it is a proxy, not the gate.

**So the only real check is to inscribe piece 0 alone, read `/r/metadata/<id>`, verify,
and only then continue.** One piece at risk instead of thirty-one.

### Operational gotchas found 2026-09-12

- **ord cannot use the `ord-cold` wallet** — *"contains unexpected output descriptors, and
  does not appear to be an `ord` wallet"*. Carriers must be moved to the inscribing wallet before
  inscribing. This matches [wallets.md](wallets.md)'s one-at-a-time workflow, but it is a
  hard refusal, not a preference.
- **`ord2.sh` lacks `--server-url`**, so `ord wallet` commands hunt for a server on port
  80 and fail with `Connection refused`. Add
  `wallet --server-url http://127.0.0.1:80` (or whatever port the index server is on).
- A piece inscription dry-ran at **544 sats** on mainnet at 1 sat/vB (608 measured on
  regtest) — the estimate holds.

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
re-inscription** (43,718). Fund more, or stop around 123 and leave chunk B for later.

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
