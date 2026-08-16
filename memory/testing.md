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

## What actually reaches the chain

Only two kinds of bytes, and neither reads `index_bundle.html`:

- **The engine** — `index_bundle.js`, built by `build.js` from exactly six paths:
  `src/main.js`, `src/shaders/fragment.glsl`, `src/shaders/vertex.glsl`,
  `style.css`, `data/decay_logic.js`, `data/health_data_sets.js`.
- **Each piece** — a ~300-byte HTML file written from the inline template at
  `mint.js:229`, carrying `t/ht/unix/hue/block` and `src="/content/{engineId}"`,
  plus its CBOR metadata JSON. Both regenerated into gitignored `dist/` every run.

## Planned harness — not built

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
