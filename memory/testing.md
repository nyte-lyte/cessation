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

## What regtest proves

Endpoints answer, the piece boots, CBOR metadata round-trips, parent/child
discovery works, MIME types are right. Verified 2026-04-05 and 2026-04-11 for the
architecture current at those dates.

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
5. **`PIECE_SATS` is filled in mint.js** — the script errors on any null.
6. **METADATA GATE — no identity on chain. Blocking; nothing is broadcast until this
   passes.** A name reached Bitcoin permanently on the second inscription. It is the
   most expensive mistake this project has made and it is not reversible.
   - Decode the CBOR of the **composed inscription** — not just the source JSON — and
     confirm it holds exactly four keys: `pieceIndex`, `hashTail`, `inscriptionUnix`,
     `dataset`. Any fifth key is a stop.
   - Grep the decoded output for the username, real name, and `/Users/` before signing.
   - **Absolute paths leak identity.** `/Users/<name>/…` carries the name in it. Run
     mint.js from the repo root so every path stays relative (`dist/…`), and check the
     inscribe command and any batch YAML the same way. `mint.js` itself has never
     written a name — the leak came in through the invocation, so inspecting only
     `metadataObj` is not sufficient.
7. **Count the layers on each sat.** Each reinscription stacks another permanent layer
   and degrades appearance and load speed on ordinals.com. Know how many a sat already
   carries and whether another is genuinely worth it.
8. **CBOR number fidelity.** On regtest, decode `/r/metadata/<id>` for several pieces and
   compare every ecg/labs value *numerically* against the baked dataset — not by eye.
   Dev and chain render identically at launch **only if these round-trip exactly**
   (verified: 1,800 rendered values match across all pieces and life stages when the
   numbers are preserved). If CBOR encodes any value at reduced precision, percentile
   ranks can flip and a piece will not look on chain the way it looks in dev. This is
   the one assumption behind "what you see in dev is what launches."

## What actually reaches the chain

Only two kinds of bytes, and neither reads `index_bundle.html`:

- **The engine** — `index_bundle.js`, built by `build.js` from exactly six paths:
  `src/main.js`, `src/shaders/fragment.glsl`, `src/shaders/vertex.glsl`,
  `style.css`, `data/decay_logic.js`, `data/health_data_sets.js`.
- **Each piece** — a ~300-byte HTML file written from the inline template at
  `mint.js:229`, carrying `t/ht/unix/hue/block` and `src="/content/{engineId}"`,
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

## Guard in mint.js — one block per piece

`mint.js` refuses to build a piece against a block another piece already claimed,
checked by hash and by height independently, with re-running the same piece allowed.
Lifespan is derived from the block hash, so two pieces sharing a block would share a
lifespan and cycle in lockstep forever. The ledger lives at `mint_blocks.json` (repo
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
