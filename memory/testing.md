# Testing — what is verified, what is not

Last updated 2026-09-06.

**For the procedure itself, see [inscribe.md](inscribe.md).** This file is the evidence
behind it — what was measured, and what is still unverifiable.

## Dev mode (Live Server or any local http server)

`[lc] lifecycle engine inactive (not in ord env)` is **expected, not an error.** The
`/r/*` recursive endpoints only exist inside an ord server; in dev they 404, the
fetch throws, and `initLifecycle` falls back to the baked `healthDataSets` — which
*is* the initial 30-piece collection, so the render is correct. `lc.ready` stays false and
block polling never starts. That is the whole meaning of the message.

Two things worth knowing when reading a dev console:

- **The filename tells you which build you're running.** `main.js:NNN` means the ES
  module source via `index.html`. On-chain the same code runs as `index_bundle.js`
  served from `/content/<id>`, so a trace naming `main.js` is always dev.
- **Dev renders an aged piece.** The baked default `inscriptionUnixSeconds` is
  `1704067200` (2024-01-01), so the piece behaves as ~2.6 years old. This is useful
  — it is why the `u_time` freeze showed up in dev at 8-second steps rather than
  the 0.5-second steps a freshly inscribed piece would show.

## Inscription history — why this matters

The same sats have been inscribed on **three times**, and every layer is permanent:
v1 (engine broken, code missing), v2 with metadata that **leaked the creator's real
name onto chain**, and v2 again with the metadata fixed — the layer live today.

Neither failure was a subtle bug. Both are the kind of thing one read-through before
broadcasting would have caught, and the second one cannot be undone: the name is on
Bitcoin forever, bypassed by viewers but retrievable by anyone who looks under the
sat. Nothing in this file matters more than the metadata gate below.

## Measured on chain — 2026-09-06

The v3 regtest run (engine + pieces 0–29, one block each, heights 202–231) plus the
first direct measurement of **live mainnet v2**. Method below under "Driving a real
browser". Four things were established that had only been modelled before.

**1. The living collection works on chain.** All 30 regtest pieces log
`[lc] collection resolved — 30 piece(s) on chain` and `[lc] ready`. Cessation blocks
differ per piece (981190 … 2722107), so lifespans are individuated. Inscribing
one-at-a-time *is* the growth test now that the collection is built from chain
(`5f10fb0`) — the collection grew 1→30 during the run and every piece re-ranked on
each arrival. No 31st dataset is needed to exercise growth; the old rehearsal recipe
in [todo.md](todo.md) predates the living-collection change.

**2. THE CANVAS NEVER SCALED — shipped, and live on mainnet.** `#canvas` had
`aspect-ratio` + `max-width/height` but **no `width`**. A `<canvas>` has an intrinsic
300×150 default; `aspect-ratio` leaves the used width at 300px and `max-*` only caps,
never grows. So the canvas sat at 300×200 at every viewport while the container
scaled:

| viewport | container | canvas | fill |
|---|---|---|---|
| 400×400 | 400 | 300×200 | 75% |
| 1200×1200 | 1200 | 300×200 | **25%** |
| 2400×1400 | 1400 | 300×200 | **21%** |

Confirmed on mainnet two ways: the on-chain v2 engine's own CSS
(`#canvas{display:block;aspect-ratio:3 / 2;max-width:100%;max-height:100%;}`) and
live measurement of mainnet piece 0. Since the live iframe *is* the ordinals.com
thumbnail, the art has been showing at a quarter size in a black field.
Fixed by `width:100%;height:auto` — 84–89% fill, exact 3:2, at every viewport
including portrait. **This is blind-spot #3 in the flesh:** a wrong-but-valid frame,
rendered without error, through three inscriptions and two regtests.

**3. Mainnet takes 27 seconds to paint, and the reinscriptions are why.** Instrumented
at the WebGL draw call, mainnet piece 0's first draw is at **27,056ms** — nothing but
black until then. Request capture explains it:

```
90  /r/metadata/…      ← for a THIRTY-piece collection
 2  /r/children/…      ← v2 engine AND v1 engine
 3  /r/parents/…       ← ancestor chain walk
```

The engine walks piece 0 → v2 engine → v1 engine and pulls children of both. Every
layer on those sats is a child of one ancestor or the other — v1's 30, v2-leaked's 30,
v2-fixed's 30 — so it fetches **90 metadata documents to render 30 pieces**. Exactly
3×, one per reinscription. v1 painted fast; the slowness arrived with the restacking.
Three independent causes, and fresh sats only fixes the first:

| cause | fixed by |
|---|---|
| 3× metadata from three stacked layers | fresh sats (one inscription per sat) |
| 30 serial round trips | `d6329eb` batching — in HEAD, not on chain |
| waits for the whole scan before first paint | `d6329eb` first-frame — in HEAD, not on chain |

**4. HEAD fixes the paint blocking — verified under latency, not assumed.** Same
engine on regtest with CDP latency injection:

| | mainnet v2 | HEAD @ 0ms | HEAD @ 300ms/req |
|---|---|---|---|
| first draw | 27,056ms | 29ms | **64ms** |
| fetches complete at first draw | 96/96 | **0/1** | **0/1** |
| total fetches | 96 | 35 | 35 |

HEAD paints before *any* network response arrives; 300ms/request latency moves first
paint by 35ms. That is `d6329eb` doing what it claimed.

### Two smaller findings from the same run

- **ord's JSON→CBOR is not bit-exact for float64.** Piece 25's `healthIndex` came back
  1 ULP low on chain (`3fdb…2a5f` vs the correctly-rounded `3fdb…2a60`); the JSON on
  disk was exact. One value in 30 pieces, relative error 1.3e-16. **Harmless here and
  the reason is worth keeping:** the smallest gap between any two pieces on any ranked
  field is 8.8e-4 (`healthIndex`; labs are 0.1–1.0 apart), ~10¹³× the error, so no
  percentile rank can flip. Do not upgrade this to "CBOR round-trips exactly" — it
  doesn't, it is merely far below the resolution that matters. Re-check if a ranked
  field ever gains near-duplicate values.
- **`build.js` was inscribing CSS comments.** The stripper at the CSS minify step used
  `/\*[^*]*\*/`, which cannot match across an asterisk, so any comment containing one
  (`max-*`, `/* 2 * n */`) shipped to chain — and it ran *after* minification, which
  rewrote the prose inside. Now `[\s\S]*?` and stripped before minifying. Caught only
  because the canvas-fix comment contained `max-*` and added 465 bytes to the bundle.

### hashTail collisions are expected — not a guard failure

Regtest pieces 6/8, 11/13 and 10/29 share a hashTail. `hashTail` is
`round(byte × 99/255)` → 100 buckets, so 30 pieces collide with ~99% probability. The
guard in `inscribe.js` checks **block-hash reuse**, and its stated worry ("cease and
reanimate in lockstep forever") only applies to pieces sharing a block. Colliding
pieces here have different inscription heights, so `inscriptionHeight +
lifespan × BLOCKS_PER_YEAR` gives different cessation blocks, and reanimation redraws
hashTail from each piece's own cessation-block hash. Same duration, different clocks,
immediate divergence. Do not "fix" this.

## Driving a real browser (headless Brave over CDP)

No extension and no Chrome needed. Launch:

```
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --headless=new \
  --remote-debugging-port=9222 --user-data-dir=<tmp> --no-first-run \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader
```

then drive `ws://…/devtools/browser/…` with node's built-in `WebSocket`. Two lessons:

- **`--screenshot` hangs on this project.** The rAF loop plus the 60s block poll means
  `--virtual-time-budget` never settles. Use `Page.captureScreenshot` over CDP.
- **Do not infer "it rendered" from pixel brightness** — these pieces are legitimately
  dark, and a black frame is ambiguous between "not painted" and "painted dark". Wrap
  `drawArrays`/`drawElements` via `Page.addScriptToEvaluateOnNewDocument` and record
  the first call. That is what produced the 27s number; a screenshot only showed black
  and I first mis-attributed it to the canvas bug.
- `Emulation.setDeviceMetricsOverride` for viewport sweeps,
  `Network.emulateNetworkConditions` for latency, and wrapping `window.fetch` to count
  requests outstanding at first draw.

## What regtest proves

Endpoints answer, the piece boots, CBOR metadata round-trips, parent/child
discovery works, MIME types are right. Verified 2026-04-05 and 2026-04-11 for the
architecture current at those dates; re-verified end-to-end 2026-09-06 for v3
(see "Measured on chain" above).

## AGE — tested 2026-09-12, and it found a real bug

The age axis is listed below as one regtest cannot reach. It can, with two fakes, because
the engine has **two independent clocks**:

- **wall clock** → `totalYears` → `lifeFraction`, from `Date.now() - inscriptionUnixSeconds`
- **block height** → cessation / reanimation / liberation / void, from `/r/blockheight`

Faking both: override `Date.now()` in the page, and put a proxy in front of ord that
offsets `/r/blockheight` (and synthesises `/r/blockinfo/<h>` for heights the regtest chain
has not reached, since reanimation derives each new lifespan from the cessation block's
hash). Scripts: `timeproxy.mjs`, `agecheck.mjs` in the session scratchpad — worth rebuilding,
they are ~60 lines each.

**What passed.** Piece 0 (73.4-year lifespan) at +1, +5, +30, +73, +80, +150 years: renders,
moves, and visibly ages (47% of pixels differ between +1y and +5y). Past cessation it
becomes `liberated: true` — correct, piece 0 is genesis with no partner. Piece 1 reanimates:
`cycle 1` at +60y, `cycle 4` at +200y, and at +600y `[lc] VOID — both partners liberated`,
`cycle 9`. The whole arc runs without error.

### FIXED: a reanimated piece rendered a FLAT COLOUR — the artwork disappeared

Found and fixed 2026-09-12 by simulating age. Past its first cessation, every frame was a
solid magenta rectangle, `rgb(211,32,143)`, standard deviation **0.00**. Not frozen art —
no art at all, at every cycle, identical whether the collection held 2 pieces or 30.

**The cause, in `fragment.glsl`:**

```glsl
float nirvanaProgress = clamp((u_totalYears - u_lifespanYears) / 0.5, 0.0, 1.0);
...
vec3 finalColor = mix(livingColor, nirvanaState, nirvanaProgress);
finalColor      = mix(finalColor, rgbColor, lifeRestores);
```

`u_totalYears` was measured from **inscription**, so half a year past the piece's FIRST
lifespan `nirvanaProgress` saturated at 1.0 and stayed there for ever. `finalColor` became
pure `nirvanaState`, and with `reanimationProgress` back at 0 after the transition finished,
that is `u_nirvanaRGB * 0.90` — **one colour for the entire canvas**. `lifeRestores` is
`smoothstep(0.5, 1.0, reanimationProgress)`, also 0, so the living image was never restored.

Arithmetic confirms it exactly: `u_nirvanaRGB` is `hsb(hue, 0.85, 0.92)`, and
`0.92 × 0.90 = 0.828` → `211/255 = 0.827`; saturation 0.85 gives the min channel `32/255`.
The observed flat colour *is* `u_nirvanaRGB * 0.90`.

**THE SHADER KEEPS ITS OWN COPY OF THE LIFECYCLE MATHS.** It re-derives `lifeFraction` at
line 128 and `nirvanaProgress` at line 493 from raw years. Fixing `lifeFraction` in JS did
nothing for either — the same quantity lived in three places and only one was corrected.
**When changing lifecycle timing, grep the shader too.**

**The fix:** JS now feeds `u_totalYears` and `u_lifespanYears` **cycle-relative** values via
`lcCycleYears()` and `lc.cycleLifespanYears`, so all three shader uses become correct at
once — the drift term `t`, the internal `lifeFraction`, and the dissolution ramp.
`lcCycleYears()` is deliberately **unclamped**: between cessation and the reanimation
firing it exceeds the cycle's lifespan, which is exactly the overshoot the dissolution ramp
needs, and it drops back to ~0 when the new life begins.

**Verified after the fix**, piece 1 (29.7-year lifespan) on a fresh regtest engine:

```
+20y   cycle 0    interior stddev 49.46   REAL IMAGE
+60y   cycle 0    interior stddev 65.38   REAL IMAGE
+200y  cycle 4    interior stddev 63.74   REAL IMAGE
+600y  cycle 12   interior stddev 50.86   REAL IMAGE
```

All four frames distinct, and moving — 4 distinct screenshots over 6 s at +200y and +600y.
`scale.test.mjs` 14,033 checks and `engine_purity` 29 checks still pass.

### `lifeFraction` did reset — fixed, and verified, but it was not the cause

The first hypothesis was that `lifeFraction` never reset on reanimation: it was computed
from the ORIGINAL inscription and clamped to 1, so a piece past its first lifespan pinned
at exactly 1.0 for ever. That was real and is fixed — reanimation is **reincarnation**
(creator, 2026-09-12): each cycle begins a new life and ages from zero.

`lc.cycleStartBlock` and `lc.cycleLifespanYears` now track the current life, set at
inscription and reset at every reanimation in both the live and fast-forward paths.
`lcCycleLifeFraction()` measures age in **blocks** within the current cycle — block-native
like every other lifecycle event — falling back to wall clock before the chain is known.

Verified through the uniforms: `u_inheritedStrength` = `(1-lifeFraction)^0.7` reads 0.4575
at +20y and 0.2612 at +60y, i.e. lifeFraction 0.67 → 0.85 rather than pinning at 1.0. Cycle
counts also deepened correctly (cycle 9 → 14 at +600y) as each cycle now takes its own span.

**But the flat-colour bug is unchanged by it** — byte-identical before and after the fix.
Two separate faults; only one is fixed.

## What regtest structurally cannot prove — the three axes## What regtest structurally cannot prove — the three axes

1. **Age.** A regtest piece is minutes old. Anything that only manifests with age is
   invisible. The `u_time` float32 bug passed regtest because at 60 seconds old the
   value is 60 and float32 handles it perfectly; the bug needs months to appear.
2. **Scale.** The collection is however many pieces were inscribed that afternoon.
   Percentile shifts, liberation-threshold drift, and dense-position resolution at
   100+ pieces are untested.
3. **Visual correctness.** A wrong-but-valid frame renders without error. `u_co2Norm`
   defaulting to 0 and the wrong inherited hue both produced perfectly good images
   of the wrong thing.

Every bug that has shipped so far lived in one of these three gaps. See
[[feedback_engine_version_artifacts]].

## Pre-inscription checklist — run every time

1. **Engine code lives in exactly two files.**
   `grep -rl "uTimeLoc" . --exclude-dir=.git` must return `index_bundle.js` and
   `src/main.js`. A third result means a stale engine copy is in the tree.
2. **The bundle is reproducible.** Copy `index_bundle.js` aside, run `node build.js`,
   diff. Must be byte-identical — otherwise the committed bundle is not what the
   current source produces.
3. **`index_bundle.html` is the one-line loader**, not an inlined engine copy. It was
   a fully inlined v1 fossil once (`f90af79`); restored in `8ca13e5`.
4. **Every uniform declared in fragment.glsl is located and set** in main.js. Compare
   the `uniform <type> <name>` declarations against the `getUniformLocation` names.
   This is the `u_co2Norm` check and it is purely static.
5. **Sat assignment is derived, not typed — check the range, not a table.**
   `inscribe.js` has no `PIECE_SATS` table any more (rewritten 2026-09-06; the old one
   listed the v1/v2 sats and every entry was non-null, so "is it filled in?" would have
   passed a re-mint straight onto already-stacked sats). Now `satForPiece(index)` returns
   `12425429610010 + index` from the 907-sat Nakamoto range, bounded at `…610916`, and
   refuses the engine's sat. Confirm the range still matches what `ord-cold` holds
   ([wallets.md](wallets.md)) and that the sat has been moved to `ord` before inscribing —
   **ord fails if `--sat` is not in the wallet, which is the real backstop.**

5b. **There are two Bitcoin datadirs on this machine. Use the right one.**
   `~/Library/Application Support/Bitcoin` is a **pruned** secondary node (`prune=1907`
   in its `settings.json`, set via Bitcoin-Qt; 13 GB, ~2 GB of blocks, last run
   2026-04-18) with an empty `ord` wallet. It is **not** the inscribing node and its
   presence is misleading — a check that finds it will wrongly conclude the node is
   pruned and unusable. The real node is **`/Volumes/Bitcoin/Bitcoin`** on the external
   volume: full chain (812 GB blocks, `blk00000.dat` present, 5,732 files), `txindex=1`,
   no pruning, with `ord` and `ord-cold` wallets in the datadir root. ord's index is
   `/Volumes/Bitcoin/Ord` (405 GB including `.old` backups). Read
   [wallets.md](wallets.md) first — it documents all of this.
6. **METADATA GATE — no identity on chain. Blocking; nothing is broadcast until this
   passes.** A name reached Bitcoin permanently on the second inscription. It is the
   most expensive mistake this project has made and it is not reversible.
   - Decode the CBOR of the **composed inscription** — not just the source JSON — and
     confirm it holds exactly four keys: `pieceIndex`, `hashTail`, `inscriptionUnix`,
     `dataset`. Any fifth key is a stop.
   - Grep the decoded output for the username, real name, and `/Users/` before signing.
   - **Absolute paths leak identity.** `/Users/<name>/…` carries the name in it. Run
     inscribe.js from the repo root so every path stays relative (`dist/…`), and check the
     inscribe command and any batch YAML the same way. `inscribe.js` itself has never
     written a name — the leak came in through the invocation, so inspecting only
     `metadataObj` is not sufficient.
7. **Count the layers on each sat.** Each reinscription stacks another permanent layer
   and degrades appearance and load speed on ordinals.com. Know how many a sat already
   carries and whether another is genuinely worth it.
8. **CBOR number fidelity.** On regtest, decode `/r/metadata/<id>` for several pieces and
   compare every ecg/labs value *numerically* against the baked dataset — not by eye.
   If CBOR encodes any value at reduced precision, percentile ranks flip and a piece
   renders differently from the same data in dev.

   **Note (2026-08-16): dev and chain no longer render identically at launch, by
   design.** That equivalence held only while the engine seeded its collection from
   the baked array. It now builds from what is on chain, so during the inscription run
   a piece renders against however many siblings exist — dev, with all datasets baked,
   always shows the finished state. Compare dev against a piece on a *complete* chain
   collection, not against one mid-run.

9. **NEVER pass `--no-backup` on mainnet. Blocking.** Regtest needs it only because of a
   Bitcoin Core bug (below). On mainnet it puts a rare sat at risk of permanent loss.
   Check the Core version before the run: `bitcoin-cli -version`. If it is **30.0–30.3**,
   **upgrade to 31.x** — the fix shipped in Core 31.0. ord 0.27.1 sets only a *minimum*
   Core version (28.0, `MIN_VERSION = 280000` in `src/wallet.rs`) and no maximum, so 31.x
   is acceptable to it. **DONE 2026-09-06 — the machine now runs Core 31.1.**
   Verified on regtest first (inscribe without the flag succeeds and the recovery key is
   actually imported), then `brew upgrade bitcoin` 30.2 -> 31.1_1 and the mainnet node
   restarted on it. Wallet backups were taken first; both wallets reloaded clean and
   their UTXO sets came back byte-identical. **Inscribe without `--no-backup` from now
   on.** If `bitcoind -version` ever reports 30.x again, stop and re-read this section.

## Sat consumption and padding — RESOLVED ON REGTEST 2026-09-06

Run on regtest with a synthetic 907-sat contiguous range standing in for the Nakamoto
UTXO. **Rare sats were destroyed in three of four configurations.** Read this before
inscribing on any rare sat.

**The mechanic.** Sats flow through a transaction in input order; an output of value `V`
takes the next `V` sats. Whatever is left at the **end** of the stream is the fee, and
goes to the miner. An inscription is two transactions, so the fee is taken **twice** —
and the reveal's only input is the commit output, which begins with the rare run.

| # | setup | outcome |
|---|---|---|
| 1 | 907 rare, **default postage (10,000)** | all 907 preserved — but every one of them locked inside a **single** inscription output |
| 2 | 907 rare, postage 330, rare UTXO the sole input | **577 of 907 burned to fees** |
| 3 | 400 rare, postage 330, common funding input present | **70 of 400 burned** — commit was safe, the *reveal* fee ate the overhang |
| 4 | 400 rare, **postage 400 = the full rare run** | **400 of 400 preserved, zero lost** ✓ |

**Experiment 2, the worst case, traced:**

```
commit:  in 907 (whole rare range)  ->  out 796   FEE 111  <- rare sats
reveal:  in 796                     ->  out 330   FEE 466  <- rare sats
                                              577 rare sats paid to the miner
```

ord used the rare UTXO as the only input and paid both fees from it. **Silently — no
warning, exit code 0, output looks completely normal.**

**Experiment 3 shows a funding input is not sufficient:**

```
commit:  in [400 rare][4999952395 common] -> out [469][4999952114]  fee 212 all common  OK
reveal:  in [469 = 400 rare + 69 common]  -> out [330]              fee 139 = 70 rare + 69 common  LOST
```

The commit protects the range; the **reveal fee eats whatever rare sats sit past the
postage boundary**, because they sit between the end of the inscription output and the
common padding.

### The two UTXO shapes — this is the distinction that matters

The experiments above all used an **all-rare UTXO**, which matches only the Nakamoto
holding. `ord-cold` actually holds two different shapes, and they behave differently:

| shape | UTXOs | fee behaviour |
|---|---|---|
| **1 rare sat at offset 0 + common padding** | the 7 Omega carriers (546/546/546/546/330/330/330) | fees come from the **end** of the stream, so they eat padding. The rare sat at offset 0 is untouched. **Safe** — this is why the one-at-a-time cold→hot workflow has worked. |
| **entirely rare, no padding** | the Nakamoto 907-sat range | there is nothing but rare sats for a fee to come from, so **every fee burns Nakamoto sats** |

Measured: moving the all-rare 907-sat UTXO with `ord wallet send` cost **111 rare sats**
to the transfer fee alone, before any inscription. The same operation on a padded Omega
carrier costs only padding.

So the established procedure is correct for the Omegas and must not be assumed correct
for the Nakamoto range. Treat that UTXO as a special case in its own right.

### The v1/v2 mint already did this correctly — read it before redesigning

Checked against the live chain 2026-09-06. The previous mint's own transactions state the
rule more cleanly than the derivation above, and confirm it.

**The 28-piece batch reveal `5d643a3e…`:**

```
inputs :  7x330, 20x546, 1x1600, 1x10000,  + one 23,955-sat funding UTXO
outputs:  7x330, 20x546, 1x1600, 1x10000   (same sizes, same order)
FEE    :  23,955 - exactly the extra funding input, consumed entirely
```

Input order mirrors output order, size for size. Each carrier passes through 1:1, so the
rare sat at offset 0 of input *k* lands at offset 0 of output *k*. The fee comes wholly
from a dedicated trailing input, so **no rare sat is ever in a position to be spent.**
Note the output sizes are exactly the `ord-cold` carrier sizes — 330 and 546.

**The single inscriptions follow the same shape:**

```
piece 0:  in [10000, 1767]   out [10000, 546]    fee 1221
engine:   in [10000, 71583]  out [10000, 10000]  fee 61583
piece 29: in [10000, 1764]   out [10000, 546]    fee 1218
```

`input[0]` size always equals `output[0]` size; the second input pays the fee.

**Restating the rule the way the chain shows it:** the carrier must pass through
unchanged — `output[0]` the same size as `input[0]` — with the fee coming from a separate
input. Setting `--postage` to the carrier's full size is how you get ord to do that: it
then has to pull in a funding input for the reveal fee. This is also why experiment 3
failed and experiment 4 succeeded — at postage 330 against a 469-sat commit output, ord
took the reveal fee out of the slack, and the slack was rare sats.

**So the established practice was already right**, for the padded carriers. What is new
is the 907-sat all-rare Nakamoto range, which has no padding and did not exist in this
shape for the previous mint — there the Nakamoto sat sat in a padded carrier like any
other. That range is the genuinely new case.

### THE RULE

**`--postage` must equal the number of contiguous rare sats in the UTXO being spent.**
Less, and the reveal fee takes the overhang. There is no default that is safe:
`inscribe.js` currently prints no `--postage`, so ord uses `TARGET_POSTAGE = 10,000`.

### Why ord does not protect them

ord's rarity enum covers only *alpha* sats (first sat of a block/epoch). As
[wallets.md](wallets.md) already notes, an **Omega/black uncommon is labelled `common`**
by ord, and the Nakamoto-era sats are not an ord rarity either. **ord cannot see that
these sats are special and will spend them as fees or change without hesitation.** No
safeguard exists to switch on.

### What this means for the 907-sat Nakamoto range

- To preserve all 907, postage must be 907 — i.e. **one inscription carrying the entire
  range**.
- For N pieces each on a Nakamoto sat, the range must **first be split into N chunks**,
  each at least the 330-sat P2TR dust floor, with the split transaction funded by common
  sats so its fee comes from the end of the stream. Then inscribe each chunk with
  `--postage` equal to that chunk's rare run.
- 907 sats at the 330 floor gives **2 chunks of 330 plus a 247 remainder** (which needs
  ~83 common sats appended to clear dust). So the range carries **about 3 pieces, not
  30** — confirming `piece N = NAKAMOTO_FIRST + N` is not inscribable.

### Option 1 — pad the range into carriers. THE CHOSEN APPROACH, tested 2026-09-06.

Verified on regtest. Preserves the whole range, but adds a step that must not be skipped.

**Step 1 — split the all-rare range into carriers. Works: 907/907 preserved, zero lost.**
One transaction, **rare UTXO as input[0]** so its sats lead the stream, plus a common
funding input. Outputs are sized to the chunks; the final short chunk is topped up to the
330 dust floor with commons (which land *after* the rare sats, so they are the padding).
Fee comes from trailing commons. Measured result on a 907-sat range:

```
out0: 330 sats, all rare        first sat rare  <- carrier 0
out1: 330 sats, all rare        first sat rare  <- carrier 1
out2: 330 = 247 rare + 83 common  first sat rare  <- carrier 2
out3: change, all common
907 of 907 rare sats preserved
```

**Step 2 — LOCK EVERY CARRIER IMMEDIATELY. Skipping this destroys them.**
Measured: inscribing carrier 0 with the correct `--postage 330`, ord pulled **carrier 1
in as an ordinary funding input** and burned its 330 rare sats. The commit showed 660
sats of input — carrier 0 plus carrier 1. Carrier 0 came through intact (330/330) while
carrier 1 was silently destroyed; range total went 907 -> 577.

ord cannot see the sats are rare, so it treats every unlocked carrier as spendable
change. It **does** honour locks — `plan.rs` skips `locked_utxos` when selecting
cardinals, and ord already auto-locks inscription-bearing outputs (visible in
`listlockunspent`). It just does not lock *uninscribed* rare carriers.

```
bitcoin-cli -rpcwallet=ord lockunspent false '[{"txid":"<split txid>","vout":0}, ...]'
```

**Confirmed end-to-end on a fresh regtest wallet (2026-09-06).** A clean wallet, a
660-sat all-rare source split into two 330-sat carriers (660/660 preserved), carrier 1
locked, carrier 0 inscribed at `--postage 330`:

```
commit inputs:  carrier 0 (the target, 330 sats) + a commons UTXO (2,499,999,185)
                the locked carrier 1 does NOT appear
carrier 1:      spent=false, ranges [[1250000000330, 1250000000660]] — intact
accounting:     660 of 660 preserved, LOST 0
```

Compare the same operation with carrier 1 *unlocked*, where ord pulled it in as funding
and burned all 330. **The lock is the difference between 0 and 330 sats destroyed.**

**Step 3 — inscribe one carrier at a time.** Unlock only that carrier, then
`--postage` = exactly that carrier's rare run (330, or 247 for the padded remainder).
Re-lock anything left. Verified: full commit+reveal cycle on carrier 0 preserved 330/330,
both fees paid from commons.

**Step 4 — account for every rare sat after every step**, by scanning the block's
outputs. Three of the failing configurations returned exit code 0 and looked entirely
normal.

**Capacity: ~3 pieces from 907 sats** (2 x 330 + a 247 remainder). Confirmed again here.

### Procedure, whenever a rare sat is inscribed

1. Know the exact contiguous rare run in the UTXO (`/output/<outpoint>` on the ord
   server, or `ord list`; the server holds the index lock, so use HTTP while it runs).
2. Set `--postage` to exactly that run length.
3. Ensure a common-sat input is available so the *commit* fee comes from commons.
4. **Afterwards, account for every rare sat**: scan the block's outputs and confirm the
   count preserved equals the count you started with. Experiments 2 and 3 both looked
   entirely successful from ord's output alone.

## `--no-backup` — what it actually does, and why regtest needs it

Diagnosed 2026-09-06 after the note in memory had read, harmlessly, "ord 0.27.1 +
Core 30.2.0 incompatibility, use `--no-backup`". It is not a benign workaround.

**What the recovery key is.** Inscribing is two transactions. The **commit** moves the
sat being inscribed into a fresh taproot address whose key ord generates on the spot —
the *recovery key* — with the inscription committed into the script tree. The **reveal**
spends that output by the script path and sends the sat to its destination. Normally ord
imports the recovery key into the Core wallet between signing and broadcasting, so the
commit output stays recoverable. `--no-backup` skips that import, and the key then exists
only in ord's memory for the length of the run.

Verified on the regtest chain — piece 0's reveal has two inputs:

```
[0] c9481bec…:0   ismine=True    1 witness item    <- parent (engine) inscription
[1] f9014382…:0   ismine=False   3 witness items   <- the commit output
```

`ismine=False` is the point: the wallet does not know that address. Three witness items
is the taproot script-path spend (signature + reveal script + control block). Between the
commit confirming and the reveal confirming, **the sat lives at an address only the
ephemeral key controls.** If the reveal is evicted from the mempool or the machine dies
between broadcasts, and the key was never backed up, that sat is gone permanently. On
mainnet that sat is the Nakamoto sat or an Omega uncommon. ord's own failure message —
"Commit tx {txid} will be recovered once mined" — is false when `--no-backup` was used.

**Why the backup fails: a Core 30 regression, not an ord bug.** ord calls
`importdescriptors` with `internal: false` plus a label. ord reports only "commit tx
recovery key import failed"; Core's actual error is `-8 Internal addresses should not
have a label`. From `src/wallet/rpc/backup.cpp`:

The guard is `if (internal && data.exists("label"))`. In v30 `internal` became a
`std::optional<bool>`, so that tests whether the optional *holds a value*, not what the
value is — sending `internal: false` at all trips it. Fixed in v31 by evaluating the
contained value into a plain `bool` first:

| Core | the guard | verdict |
|---|---|---|
| ≤ v29.4 | `if (internal && …)`, `internal` a plain `bool` | works |
| **v30.0 – v30.3** | same guard, `internal` now `std::optional<bool>` | **broken** |
| **v31.0, v31.1, master** | `if (desc_internal && …)` where `desc_internal = internal.has_value() && internal.value()` | **fixed** |

**Check the guard line, not the declaration.** `desc_internal = internal.has_value() &&
internal.value()` also appears in v30.2 — in the *multipath descriptor* loop, nothing to
do with the label check. Grepping for it reports every broken version as fixed. This
cost a wrong recommendation once (downgrade to 29.x, when the real answer is upgrade to
31.x); check what `if (… && data.exists("label"))` actually tests.

Confirmed by varying one field at a time against Core 30.2:

```
active:false internal:false +label        FAIL: Internal addresses should not have a label
active:false internal:false  no label     OK
active:false  +label (internal omitted)   OK
```

**Fix: upgrade Bitcoin Core to 31.x — VERIFIED ON REGTEST 2026-09-06.** (30.3 is still
broken; the fix landed in 31.0.) A forward upgrade, which Core supports; no downgrade,
and ord 0.27.1 imposes no maximum Core version (`MIN_VERSION = 280000`, no ceiling).

Tested by running the regtest env against a standalone Core 31.1 (checksum-verified
against the published `SHA256SUMS`, brew's 30.2 left untouched — put the 31.1 `bin/`
first on `PATH` and `ord env` picks it up). Results:

- `ord wallet inscribe` **without** `--no-backup` succeeded — no "recovery key import
  failed".
- The wallet gained the label `commit tx recovery key` and a `rawtr(...)` descriptor
  (`active=false`), which is the backup actually landing.
- The decisive check, comparing the same field on both kinds of inscription:

  | | `--no-backup` (Core 30.2) | backup enabled (Core 31.1) |
  |---|---|---|
  | `ismine` | **False** | **True** |
  | `solvable` | False | True |
  | `labels` | `[]` | `['commit tx recovery key']` |

  `ismine=True` is the whole point: if the reveal fails, the wallet can spend the commit
  output and recover the sat. Under `--no-backup` it cannot.
- Rest of the pipeline healthy on 31.1: ord indexed the new inscription, all 30 engine
  children still resolve, `ord wallet balance` fine.

Keeping `--no-backup` with a high fee rate lowers the odds but leaves the failure mode
intact, and patching ord means building from source. Neither is needed now.

## What actually reaches the chain

Only two kinds of bytes, and neither reads `index_bundle.html`:

- **The engine** — `index_bundle.js`, built by `build.js` from exactly six paths:
  `src/main.js`, `src/shaders/fragment.glsl`, `src/shaders/vertex.glsl`,
  `style.css`, `data/decay_logic.js`, `data/health_data_sets.js`.
- **Each piece** — a ~300-byte HTML file written from the inline template at
  `inscribe.js` (`const scriptHtml`), carrying `t/ht/unix/hue/block` and `src="/content/{engineId}"`,
  plus its CBOR metadata JSON. Both regenerated into gitignored `dist/` every run.

## Scale harness — built 2026-08-16

`node test/scale.test.mjs` — ~8,900 assertions, no dependencies, runs in about a
second. This is the axis that actually broke v1: **regtest inscribed 30 pieces and
all 30 rendered; the failure only appeared when a new dataset joined the
collection.** Growth is the main case for this project, not an edge case.

What it drives, at collection sizes 30 / 31 / 40 / 100:
- The full render pipeline exactly as `draw()` composes it — `getAgedDataset` ->
  `applyCollectionInfluence` -> `computeHSBFromStats` -> `winsorizedPercentileForLab`
  -> `calculateHealthIndex` / `computeKarma` — across seven life fractions.
- Own-piece indices at the start, middle, end, **past the baked array** (a piece
  minted after the engine, which must load its dataset from its own metadata), and
  **past the collection** (sibling fetch incomplete).
- Boot-order states that become reachable the moment `draw()` stops waiting on
  `initLifecycle`: baked array alone, and baked + own metadata with no siblings.
- Reanimation blends, including a partner past the baked array.
- **Growth sensitivity** — that a piece's hue/sat/bri and the min/max bounds
  actually *move* when a sibling appears, and that drift span scales with
  collection size. This catches the silent version, where nothing crashes and the
  piece just ignores its new sibling.

It models three guards that live inside main.js's `init()` closure and cannot be
imported (`_lcMergedEntries`, `lcOwnPosition`, and draw()'s `startIdx` clamp).
`assertDrawGuardUnchanged()` reads main.js and fails if that clamp is edited, so
the model cannot silently go stale.

**Mutation-tested.** A test that passes proves nothing until you break the code and
watch it fail. All three of the real historical bugs are caught:

| mutation | result |
|---|---|
| remove draw()'s `startIdx` clamp (the v1 growth crash) | caught — TypeError |
| rank colour against the baked array, not the live collection (the v2 bug v3 fixed) | caught — no change on growth |
| decouple drift span from collection size | caught — drift differs |

Also covers **karma clearance** (added with the mechanism itself): the rate is bounded
by `KARMA_CLEARANCE_K`, is exactly 0 at the collection's minimum eGFR and exactly k at
its maximum, is monotonic in eGFR, and — the property that matters most — replaying a
piece's history in one pass gives bit-identical results to applying cycles one at a
time. If replay diverged, a page reload could change whether a piece had liberated.
Mutation-tested: perturbing one path by 0.1% fails with the divergence printed.

Current status against HEAD: **9,300 checks, 0 failures.**

## Design instrument — not a test

`node test/liberation_model.mjs` projects the collection forward under decline /
plateau / recovery futures and reports what fraction of pieces ever liberate and how
spread out those liberations are. Run it after changing the blend weight, the karma
weights, the threshold percentile, or `KARMA_CLEARANCE_K`. It is how the current
mechanism was chosen. Note it synthesises future health data — the three scenarios
bracket the possibilities, they do not predict one.

## Guard in inscribe.js — one block per piece

`inscribe.js` refuses to build a piece against a block another piece already claimed,
checked by hash and by height independently, with re-running the same piece allowed.
Lifespan is derived from the block hash, so two pieces sharing a block would share a
lifespan and cycle in lockstep forever. The ledger lives at `inscribed_blocks.json` (repo
root, deliberately not `dist/`, which is gitignored and wiped) and doubles as the
provenance record: which block each piece claimed and the lifespan it produced.

It catches *building* two pieces against one block. It cannot stop two inscriptions
confirming in the same block — only waiting for confirmation before broadcasting the
next does that.

## Remaining harness work — not built

Run the uniform computation in Node with a fake `gl` object that records every
`uniform1f` call instead of drawing. Then assert across the axes regtest can't
reach. In value-per-effort order:

- **Uniform completeness** (static, cheapest) — catches the `u_co2Norm` class.
- **Float32 magnitude** — assert every value sent through `uniform1f`, rounded to
  float32, has a ULP smaller than one frame's expected change. Guards the `u_time`
  class permanently.
- **Frozen-uniform detection across an age sweep** — run ages 0→100 years and assert
  no uniform freezes, goes NaN, or jumps discontinuously.
- **Scale** — synthesize collections of 30/100/300 datasets; assert percentiles,
  karma, and threshold stay in range and own-position still resolves.
- **Determinism** — same piece at the same simulated clock computed twice, and with
  siblings arriving in different fetch orders, must produce identical uniforms.

Cost: `main.js` is one large `init()` closure assuming `document`, a canvas, and
WebGL2, so headless running needs stubs. A day's work, not an hour — but it does not
touch the shipped engine.

## What no harness catches

Aesthetics — a harness proves `u_glucose` is stable, deterministic, and in range,
and says nothing about whether the piece looks right. And intent bugs: the wrong
inherited hue was a valid number produced by working code, and needed a human who
knew piece N should inherit N-1.

---

# Fine-tooth-comb engine audit (2026-09-12)

Run against the dataless engine before re-inscription, on the premise that the
bugs worth finding are the ones green test suites had already missed. Four of the
five real findings were invisible to 14,000+ passing checks and only appeared when
something was made to FAIL.

## Method

Two things did the work, and neither was line-by-line reading:

1. **Hunt the pattern, not the line.** Today's known bugs all had the same shape —
   one quantity computed in two places with only one copy fixed. So: enumerate
   every quantity named in both `main.js` and `fragment.glsl`, every `u_time`
   coefficient, every early `return`, every division.
2. **Break it on purpose.** A proxy in front of ord that injects HTTP failures.
   Everything rendered fine until a single request was made to fail — then two
   serious bugs fell out immediately.

## Findings

### 1. One failed `/r/metadata/<ownId>` at boot → permanently black piece  (FIXED)
The highest-severity finding. `draw()` schedules the next frame as its LAST
statement. The empty-collection guard `return`ed before it, on a comment's
assumption that "lcPoll/initLifecycle call draw() again once data arrives" —
nothing does. The only other callers are the boot one-shot, a resize handler and
dev helpers.

Boot releases `ownDataReady` in a `finally`, so a failed own-metadata fetch
releases the first frame EARLY, before siblings resolve. That frame found an empty
collection, returned, and the loop was never re-armed. The collection resolved a
second later to no effect. Only resizing the window brought the piece back.

Measured: 406 draws in 7s healthy; **0 draws with one injected 503**. After the
fix, 403. Present in the pre-fix engine too — not introduced by this work.

### 2. Every window resize forked another render loop  (FIXED)
`draw()` re-arms itself, and the resize handler called `draw()` directly, so each
resize event started a second self-sustaining loop. Browsers fire resize
continuously during a drag.

Measured on the pre-fix engine: 60 draws/sec at rest → **441/sec after 20 resize
events → 497/sec after 70**, never recovering. This is live on v1 and v2 on
mainnet right now. Fixed by `scheduleDraw()`, which collapses any number of
requests into one pending frame. After: a flat 60/sec however many resizes.

### 3. A flaky gateway could silently re-rank the whole collection  (FIXED)
`fetch(...).then(r => r.json()).catch(() => null)` collapsed two different answers
into one: a 404 ("this child genuinely has no metadata" — the normal answer for
the engine inscription) and a transport failure ("this child may be a piece we
could not read"). Unreadable children were dropped and `lc.collectionDatasets`
was overwritten with the short list.

Every percentile, min/max range, karma value and hue is computed across the WHOLE
collection, so this does not render "slightly stale" — it re-ranks everything
against a collection that never existed, until the next refresh ten minutes later.
Now 404 and failure are distinguished, and an incomplete refresh commits only if
it is an improvement. Covered by `test/refresh_integrity.test.mjs` (14 checks),
which fails 7/14 against the pre-fix engine.

### 4. Only retry was ten minutes away  (FIXED)
Sibling refresh ran every 10th poll unconditionally. Now every poll while the
collection is unresolved, backing off to every 10th once it is.

### 5. A thrown frame killed the piece for ever  (FIXED — hardening)
The engine's own comment says "a piece that throws in draw() never renders again,
which is how v1 failed", and nothing guarded it. `scheduleDraw()` now catches and
re-arms, so a transient fault costs one frame instead of the piece. The engine is
immutable once inscribed; it has to survive its own bad frames.

Also bounded the child-pagination `while (more)` loop at 100 pages, for the same
immutability reason.

## Checked and CLEAN — do not re-audit without a reason

- **`u_time` wrap.** `U_TIME_WRAP = 200π`. All 53 uses are `u_time * <2-decimal
  literal>`, and 200π × k/100 is always an exact multiple of 2π, so the 628.3s wrap
  produces no phase jump. A 3-decimal coefficient would break this — keep them at
  two decimals.
- **CBOR decoder.** All 30 real datasets round-tripped through the engine's exact
  `cborDecode`, under both float64 and smallest-float (f16/f32) encodings: 60/60
  byte-exact. Also verified against real on-chain metadata via regtest ord.
- **Metadata identity gate.** All 30 files: exactly four top-level keys
  (`pieceIndex`, `hashTail`, `inscriptionUnix`, `dataset`), no identity-bearing key
  or string value anywhere in the tree.
- **Bundle.** Rebuild is byte-identical to the committed one; no `healthDataSets`,
  no baked readings, no identity strings.
- **Divide-by-zero / NaN.** `normalize()` returns 0.5 when max===min, `percentile()`
  returns 0.5 below 2 elements. The boot-with-one-piece path (where min===max for
  every field) is therefore safe.
- **`lcPoll` re-entrancy.** Every guard flag (`isLiberated`, `reanimationTriggerMs`)
  is set synchronously before the first `await`, so overlapping polls cannot
  double-trigger reanimation. Careful code; leave it alone.
- **`ownDataReady`.** Released on the normal path AND in a `finally`, so boot can
  never hang.
- **Block-driven age sweep, 0→600 years** (`agesweep.mjs` through `timeproxy.mjs`):
  14/14 ages clean through 12 reincarnation cycles — every uniform finite and in
  declared range, never a flat frame, always moving.

## Known and deliberately NOT fixed

- **`lc.reanimationTriggerMs` is set once and never cleared.** After a live
  reanimation, `u_reanimationProgress` latches at 1.0, so `lifeRestores` pins
  `finalColor = rgbColor` and the piece stops aging for the rest of that cycle;
  the `=== null` guard also blocks any SECOND live reanimation. Real, but it needs
  a tab left open across two full lifespans — minimum lifespan is 3 years, median
  ~42. Every page load replays history through `lcFastForward` with the trigger
  null, so a fresh viewer is always correct. Measured visual difference mid-cycle:
  mean 5.4/255, max 58. Fixing it means deciding what happens at the moment the
  flourish ends, which changes rendering — not worth the risk unprompted.
- ~~7 dead uniforms~~ **REMOVED 2026-09-12.** `u_nitrogenHueDeg`,
  `u_creatinineHueDeg`, `u_sodiumHueDeg`, `u_chlorideHueDeg`, `u_co2HueDeg`,
  `u_calciumHueDeg`, `u_partnerInheritedHueDeg` — declared in GLSL, never read by
  the shader; the RGB uniforms superseded them. See "Dead uniform removal" below.
- **`ensureMinMax._for` / `ecgRanks._for` caches never hit**, because
  `lcEffectiveCollection()` returns a fresh array each call. Measured cost at
  N=300: 0.05 ms/frame, 0.3% of a 60fps budget. Dead code, not a defect.

## New rig, kept in the scratchpad

- `enginproxy.mjs` — serves the freshly built LOCAL bundle in place of the
  on-chain engine (`ENGINE_ID` + `LOCAL_ENGINE`), so an engine change can be
  rendered against the real chain WITHOUT re-inscribing. Also injects metadata
  failures (`FAIL_META=n` fails the first n `/r/metadata` requests — note the
  counter is per proxy process, so restart it between runs).
- The lesson worth keeping: **the suites were green through all five findings.**
  Rendering in a browser caught the first two; injecting failures caught the rest.


## Dead uniform removal (2026-09-12)

Removed the 7 uniforms the shader declared but never read, along with their
`getUniformLocation` calls, the `hueLoc` field in all 6 beam configs, and the two
dead upload lines. 49 uniforms now declared, **0 never read**.

**They were never actually uploaded.** A uniform no GLSL code reads is INACTIVE in
the linked program, so `getUniformLocation` already returned null and the
`if (cfg.hueLoc)` / `if (uPartnerInheritedHueDegLoc)` guards short-circuited every
frame. So this cost bytes and 7 wasted lookups at init, not per-frame work. (An
earlier note in this file said they were "uploaded every frame" — they were not.)

**What had to stay.** The `hue` value each beam's `update()` returns is NOT dead —
the very next line feeds it to the live `u_*RGB` uniform via `hsbToRgb(hue, …)`.
Likewise `partnerInheritedHueDeg` still drives `u_partnerRGB`. Only the uploads and
the locations went; every computation remains.

**Proof it changed nothing.** Rendered the same piece against regtest ord on the
old and new bundles and dumped the uniform set the compiled program exposes:

    old: lookups 56, active 49, inactive 7, draws 342, errors 0
    new: lookups 49, active 49, inactive 0, draws 342, errors 0
    active set identical: True

The 7 inactive names in the old run were exactly the 7 removed. Bundle 83052 ->
81927 bytes (1,125 saved). All suites green.
