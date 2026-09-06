# Testing — what is verified, what is not

Last updated 2026-08-16.

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

## What regtest structurally cannot prove — the three axes

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
5. **`PIECE_SATS` is filled in inscribe.js** — the script errors on any null. **Not
   sufficient.** Checked 2026-09-06: every entry is non-null and every entry is *wrong*
   for the re-mint — all 30 are v1/v2 sats, zero overlap with what `ord-cold` actually
   holds ([wallets.md](wallets.md)). Non-null only proves someone typed a number. Verify
   each sat is genuinely in the cold wallet before inscribing, or the run targets sats
   that already carry three inscriptions.

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
