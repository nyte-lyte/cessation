# Cessation — To Do

Rewritten 2026-08-16, updated 2026-08-21. Every claim was re-verified against the
code. An earlier version of this file asserted a state the code did not match — see
"Why this file was wrong" at the bottom before trusting any old checkmark.

## THE DECISION THAT FRAMES EVERYTHING
**Re-inscribing the whole project on fresh sats, v3 engine only.** No fourth layer on
the existing sats. One inscription per sat, clean parent chain, no legacy ancestors.
The bar is "make sure everything works this time" — two previous attempts failed and
one of them put a real name on chain permanently.

**Which sats — settled 2026-08-21.** The Nakamoto range already in `ord-cold`:
907 Satoshi-era sats from block 2485, `12425429610010 → …610916`. 31 needed, 907 held,
nothing to buy. Re-buying ~23 Omega blacks was the blocker and a fourth layer on the v2
sats was rejected. See [[wallets]] for the rationale and the fan-out prerequisite.

**Clean parent chain means the engine has no parent.** This is the whole of the load-time
problem. `lcRefreshSiblings` walks every ancestor and fetches `/r/metadata/<id>` for each
of its children, so the v1 → v2 → v3 chain meant ~90 metadata round trips at boot instead
of ~30, growing with every stacked engine. How many layers a sat carries costs the engine
nothing at runtime — ord serves `/content/<id>` and `/r/metadata/<id>` as direct lookups
and never scans the sat. The v2 engine was inscribed `--parent v1`; do not repeat that.

## Current state

**v2 is live.** The same sats have been inscribed on three times, and all three layers
are permanent:
1. **v1 engine** `b725884c…i0` — broken. Pieces not live, code missing.
2. **v2 engine, bad metadata** — the metadata leaked the creator's real name onto
   chain. Required inscribing again.
3. **v2 engine, metadata fixed** — **this is what is live now.** Engine
   `6a53d569…i0` on Nakamoto sat 12425429610917, `--parent v1`, with all 30 pieces
   (0–29) as its children. IDs in [[tracker]] under "Live On-Chain IDs".

Earlier layers sit underneath each sat and are bypassed by viewers (latest inscription
on a sat wins) but remain retrievable. Stacked inscriptions are also the cause of the
lag and poor appearance on ordinals.com.

**Repo HEAD** is ahead of `388e1db` with the zero-baked engine work uncommitted.
**Not inscribed.** Live v2 corresponds to `4fe0114` (2026-06-20). HEAD is what the
fresh-sat inscription would carry.

**What live v2 is missing** relative to HEAD (`1c80352` and `cdf1eb6`) — these are real,
running on chain right now:
- **Ancestor iteration order.** Live v2 walks `collectionAncestors` immediate-parent-first,
  so v1's children merge *last* and win the `Map.set` dedup — the v1 originals override
  the v2 pieces in the living collection. The datasets are identical, so the visual
  effect should be nil, but the collection is assembled from the superseded layer.
- **Colour ranking.** `setHSBUniforms` ranks against the baked 30-piece array, not the
  live collection, so `u_glucose`/`u_potassium`/`u_eGFR` will not re-rank when the
  collection grows past 30. This one bites at piece 31.
- **CO2 and Ca phase seeds hardcoded to 0** — those two beams breathe in lockstep across
  every piece instead of independently.
- The `u_time` float32 freeze was introduced in v3 and fixed in `cdf1eb6`. It never
  reached chain; live v2 uses `performance.now()`.

## Done this session (2026-08-16)

All committed and pushed. Harness stood at **9,300 checks** that day (14,071 now);
bundle rebuilds byte-identical.

- `cdf1eb6` — **u_time float32 freeze.** Raw seconds-since-inscription in a float32
  uniform; ULP exceeded a frame, so motion froze and snapped. Wrapped at 200π
  (every u_time coefficient is a multiple of 0.01 rad/s, so it is phase-continuous).
- `8ca13e5` — **v1 engine fossil removed** from `index_bundle.html`; back to a
  one-line loader.
- `8db7603` — **testing.md created**, inscription history corrected, stale doc claims
  fixed.
- `535ab4b` — **piece counts removed** from docs and comments (the collection grows).
- `0d618b3` — **scale harness** (`test/scale.test.mjs`), the growth axis regtest
  cannot reach. Mutation-tested.
- `d6329eb` — **four engine fixes:** the init()-time crash for any piece past the baked
  array (piece 30 onward would never have rendered at all — same class as the v1
  failure); first-frame rendering instead of waiting on the whole sibling scan;
  batched sibling fetches (30 serial round trips → 4); block height no longer
  defaults to 0.
- `8f49340` — **karma clearance at the piece's own eGFR**, plus `previewPairing()`
  dev helper. See [[nirvana]].

## Done this session (2026-08-21) — uncommitted

Suites: `test/scale.test.mjs` **14,071 checks**, `test/boot.test.mjs` **84 checks**,
both 0 failures. Bundle rebuilds byte-identical. Every assertion added was
mutation-tested — a passing test proves nothing until you break the code and watch it
fail.

- **The engine stopped carrying the collection.** `build.js` no longer inlines
  `data/health_data_sets.js`. 100.15 KB → **81.8 KB**.
- **Three more places were still ranking against the baked array** — the seven ECG
  rank tables (computed once in `init()`, consumed every frame), `getBeamTempoSeconds`
  and `getBeamHueAnchorDeg`. Same class as the `setHSBUniforms` bug v3 fixed; these
  were missed then. The ECG half of a piece stayed frozen at the engine's snapshot
  while the lab half re-ranked live, so the two drifted apart as the collection grew.
- **`test/boot.test.mjs`** — boots the shipped bundle against a stubbed DOM, WebGL2
  and `/r/*`. Everything else in `test/` exercises lifted functions; this runs what
  actually gets inscribed. Covers uniform completeness (the `u_co2Norm` class), CBOR
  fidelity, and both boot outcomes.
- **CBOR fidelity verified exact** — all 17 dataset values round-trip bit-identical.
  Closes the item that was blocking in [[testing]]. Mutation: float32 encoding drifts
  potassium 4.1 → 4.099999904632568, and the test names it.
- **Found and fixed:** `u_inheritedHueDeg` was `undefined` with an empty baked array.
  `allInheritedHues` derives from `healthDataSets` and nothing stood behind it. Masked
  in practice by the `hue` attribute every piece carries, but no derivation path
  existed. Now falls back to `inheritedHueFromCollection()`.
- **Harness fixes:** `liftFromMainJs` injected lifted consts but never returned them,
  so `beams.BEAM` was always `undefined` and the beam test fell back to `?? 0` — it
  would have silently tested NITROGEN while labelled CO2 if the enum were reordered.
  `liftModule` gained `inject` for modules whose imports the lift strips.

## Living collection — fixed 2026-08-16, completed 2026-08-21

**The first 30 pieces could not affect each other, and that was the whole point of the
project.** `_lcMergedEntries` seeded the collection from the baked `healthDataSets`
array, which the engine carried compiled in. So piece 0, alone on chain, already knew
pieces 1–29. Inscribing a sibling overwrote a baked entry with an identical one:
percentiles never moved, min/max never moved, nothing re-rendered. The collection only
began to live once inscriptions went *past* the baked set — piece 30 onward.

2026-08-16 stopped the collection *seeding* from the baked array. **2026-08-21 removed
the array from the engine entirely.** `build.js` no longer inlines
`data/health_data_sets.js`; the bundle declares `healthDataSets = []`. A piece gets its
own dataset from `/r/metadata/<ownId>` and the collection from `/r/children` discovery,
and there is no third source. It makes no sense for a living collection to have part of
itself baked into the engine — and while a fallback existed, a rehearsal could always
pass on data the chain never supplied.

Verified against the real datasets: **381 of 435 piece-observations change when a
sibling arrives** during a 30-piece run.

What the removal forced, all now done and covered by tests:
- ECG rank tables, beam tempo and beam hue anchor had to start ranking against the
  live collection. They read the baked array directly, so with it empty they returned
  NaN — the same bug class `setHSBUniforms` had, still live in three more places.
- `normalize` had to guard an empty collection: `computeMinMaxValues([])` leaves
  `Infinity/-Infinity`, whose span is `-Infinity`, which the `=== 0` guard missed.
- The beam phase pre-advance had to move out of `init()` — it needs a dataset, and
  with nothing baked there is none until own metadata lands.
- Own metadata had to be fetched *first* in `initLifecycle` and retried, since a
  failure among the lifecycle fetches used to abort before ever reaching it.
- A piece that resolves no dataset now holds black rather than rendering midpoints as
  if they were its own data.

Consequences accepted deliberately:
- **Piece 0 alone is a collection of one.** No ranking exists, so every percentile is
  the midpoint — it renders neutral until piece 1 exists. `percentile()` in main.js and
  `normalize()` gained guards for this; a one-piece collection used to be a
  divide-by-zero producing NaN hue/sat/bri, unreachable only because of the baked seed.
- **The early run lurches, the late run is gentle.** With 2–3 pieces a rank can only be
  0, 0.5 or 1, so piece 0 swings ~180° of hue when piece 1 lands, stays pinned while it
  holds the collection's extreme, and settles to 1–4° per arrival past ~12 pieces.
  **Decision: leave it.** Identity emerging as there is something to be distinct from.
- Dev and chain no longer render identically mid-run. Dev has everything baked, so it
  always shows the finished state. See [testing.md](testing.md).

## Outstanding — decisions, before any inscribing

- **Fan out the Nakamoto range — DO THIS BEFORE ANY INSCRIBING.** Every sat in
  `b9c746591981…:0` is Nakamoto-era, so inscribing straight against it spends ~330–546
  of them as postage padding per inscription and exhausts 907 after two. Split into 31
  outputs, one Nakamoto sat at offset 0 plus common padding each, then read the numbers
  back with `ord wallet sats`. Verify the split mechanics against the real `ord 0.27.1`
  binary first — a mis-built fan-out scatters Satoshi-era sats into fee change and is
  not recoverable. Sub-decisions still open: whether pieces map to the range in order
  (piece 0 on `…610010`), and which sat the engine takes.
- **`PIECE_SATS` is nulled and must be filled from the wallet, not from arithmetic.**
  It held the v2 Omega blacks until 2026-08-21 — running `inscribe.js` would have
  generated `--sat` commands putting a fourth layer on sats already carrying three. It
  now errors on every piece until filled. Fill only from `ord wallet sats` output after
  the fan-out confirms.
- **Tail convergence — UNDECIDED.** `getAgedDataset` clamps drift at the end of the
  timeline (`maxSpan`), so when the collection stops growing the final ~20% of pieces
  permanently converge onto the last dataset in old age. While the collection grows,
  new data keeps extending the runway and it does not bite. User's position: "not sure
  about tail convergence." Not a bug — a real structural consequence that should be
  decided rather than discovered.
- **Beam phase pre-advance runs against a collection of one — UNDECIDED.**
  `preAdvanceBeamPhases` fires once at boot, after own metadata lands but before the
  sibling scan, so beam tempos rank against a one-piece collection and every rank is
  the midpoint. The birth phase is therefore derived from a ranking that is not the
  real one. It is still deterministic — every viewer boots identically — but the error
  is larger than the chronological-drift approximation the code comments assume.
  Fix if wanted: re-run it once `lc.collectionResolved` flips true, which snaps the
  phase to the real value at the cost of a visible one-time jump a second into load.
- **`KARMA_CLEARANCE_K = 0.05` is a chosen constant, not data-derived.** It sets the
  tempo of liberation, not the ordering. The project's principle is that the data
  decides the important things. Re-derive alternatives with
  `node test/liberation_model.mjs`.
- **If inscribing: dump and read the actual CBOR before broadcasting.** Wrong metadata
  is what forced the third inscription and put a real name on chain permanently.
  Verify the composed inscription's metadata decodes to exactly four keys —
  `pieceIndex`, `hashTail`, `inscriptionUnix`, `dataset` — and nothing else. Check the
  inscribe command and any batch file for absolute paths; `/Users/<name>/…` leaks
  identity. Run inscribe.js from the repo root so paths stay relative (`dist/…`).
- **Remaining harness work** — float32 magnitude and a frozen-uniform age sweep are
  still unbuilt. Scale, determinism and **uniform completeness** (2026-08-21,
  `test/boot.test.mjs`) are done. See [[testing]].
- **The regtest growth rehearsal — the one thing that turns "modelled" into "seen."**
  The v1 regtest inscribed 30 and viewed 30, and passed; the failure only appeared when
  a new dataset joined the collection. So the rehearsal must include growth:
  1. Inscribe the engine, then pieces 0–29, each in its own block.
  2. Open all 30. Baseline — this is the step that already passed for v1.
  3. Add a new dataset to `health_data_sets.js` and inscribe piece 30.
  4. Reopen the originals: still render, discover 31 siblings, re-rank rather than crash.
  5. Open piece 30 itself — exercising `lc.ownDataReady` and the own-metadata fetch.
     Note this is no longer a special case: with nothing baked, *every* piece takes
     the same path piece 30 does, which is the point of removing the array.
  6. Repeat with 31 and 32; one new piece may not surface an off-by-one that two would.
  Also time the first paint — it should be immediate now, not tens of seconds.
- **Not yet proven on any chain:** boot ordering, batched sibling fetch, and the block
  height fallback all no-op in dev because `/r/*` 404s immediately. Dev verified the
  render path and the init-time fix only.
- **Downstream copies of the engine — DRIFTED as of 2026-08-21, still manual.** The
  zero-baked work changed `data/decay_logic.js` and rebuilt `index_bundle.js`, so both
  copies are now stale and need resyncing. Note `~/nytelyte` is a live site — sync it
  deliberately, not mid-change. Both repos hold copies and neither updates itself. After any change to `data/`,
  `src/shaders/` or `index_bundle.js`, check both:
  - `~/cessation-tracker` — `src/data/health_data_sets.js`, `src/data/decay_logic.js`,
    `src/shaders/{fragment,vertex}.glsl`. All four byte-identical as of `bc5ccc9`.
    `src/data/decay_logic.d.ts` now pins the function signatures, so a future sync that
    changes them fails the build instead of passing arguments into the wrong parameter —
    which nearly happened: `applyCollectionInfluence` gained `minMaxValues` in the
    fourth position, exactly where the old copy took `influence`.
  - `~/nytelyte` — `public/cessation-engine.js`, a full bundle copy, byte-identical to
    `index_bundle.js` as of `0d410a6`. Note `public/piece0.html` forwards query params
    onto the engine's `<script>` tag; it must not go back to URL-hash params, since
    `build.js` strips the dev block that read them.
  - Verify with:
    `for f in ...; do diff -q <tracker copy> <cessation source>; done`
- **Never hardcode a piece count in docs or comments.** The collection has no fixed
  size — a new piece is inscribed whenever new ECG/lab data arrives, so any count is stale
  within about three months. The old "all 29 pieces" phrasing dated from when 29 was
  the whole collection; it is 30 now and 31 soon. Process statements should say "every
  piece" and iterate the collection; a count belongs in docs only as a dated
  point-in-time fact. Cleaned up 2026-08-16 in `inscribe.js`, `build.js`, `MEMORY.md`, and
  `inscription_architecture.md`.

## Verified true (re-checked 2026-08-21)

Each confirmed present in `src/main.js` at HEAD. Grep for the name rather than
trusting a line number — line numbers move with every edit, which is how this file
went stale before:
- CBOR decoder inlined (`cborDecode`)
- `initLifecycle()` with graceful fallback outside ord
- Block polling every 60s (`setInterval(lcPoll, 60000)`) and `lcTick()` per frame
- Block height fallback uses the resolved `_ownId`, not `/self`, and throws rather
  than defaulting to 0 (fixed `d6329eb`)
- Lifecycle uniforms wired: `u_reanimationProgress`, `u_isLiberated`, `u_voidProgress`
- Void detection: `lcCheckVoid`, `lcIsPartnerLiberated`
- Living collection from sibling CBOR metadata (`lcRefreshSiblings`), fetched in
  batches of 8
- Fast-forward for pieces loaded years after inscription (`lcFastForward`)
- Engine is `text/javascript`, all pieces `text/html`, black background
- Dev console API stripped from the bundle via DEV_START/DEV_END
- No Brotli compression
- Sats sourced and held; `PIECE_SATS` filled in inscribe.js
- **Engine carries no datasets** — `grep -c 'date: *"' index_bundle.js` returns 0, and
  the bundle contains `let healthDataSets = [];`. Asserted by `test/boot.test.mjs`.
- Own metadata fetched first in `initLifecycle`, retried 4× (`lcFetchOwnDataset`)
- `_resolveOwnId` tries the ord path, a bare id in the path, then the query string
- `preAdvanceBeamPhases` called from the boot sequence, not inline in `init()`
- Boot holds black when `lcCycleDataset()` resolves nothing

## Why this file was wrong

The failure mode was not fabricated checkmarks — it was checkmarks that were true when
written, against code that was then rewritten underneath them, with nobody returning to
update the entry. Confirmed cases:

- **"Autonomous new-mint propagation — incremental, called every block poll."** The
  incremental machinery (`datasetByIdx`, `siblingIdMap`, `knownSiblingCount`) exists in
  exactly two commits in all of history: one adding it, one removing it. It was gone
  well before inscription. The real code refetches every child's metadata from every
  ancestor, on every 10th poll (`_siblingPollCount % 10`) — not incremental,
  not every block. `MEMORY.md` repeated the same claim; corrected 2026-08-16.
- **"URL hash bootstrap `#idx=…` (replaced window.PIECE)."** Neither mechanism is live.
  `window.PIECE` appears in zero lines at HEAD; the URL hash path sits inside
  DEV_START/DEV_END and is stripped from the bundle. On chain, piece params come from
  `<script>` tag attributes — which `MEMORY.md` states correctly under
  "`document.currentScript` bootstrap"; only this file was stale.
- **"Pieces 1-28 — thin iframe HTML `<iframe src=…>`."** There is no iframe. Pieces are
  `<script src>` with baked attributes (`inscribe.js` (`const scriptHtml`)). Also 1–28 omits piece 29.
- **"Piece 0 — full engine bundle (build.js → index_bundle.html)."** `build.js` writes
  `index_bundle.js`. Piece 0 is a child of the engine like every other piece.
- **"Network layer — /r/children/self."** v3 calls
  `/r/children/<ancestor>/inscriptions/<page>`.
- **"Thumbnail gradient CSS — injected as `<style>` tag in HTML."** Contradicted by an
  entry in this same file saying `CUSTOM_GRADIENTS` was "never consumed in HTML/metadata
  output." `inscribe.js` contains zero gradient references. This one was checked off for
  output that never existed.
- **"regtest verified" (2026-04-05 / 2026-04-11)** attaches to the iframe architecture,
  which was later replaced. The architecture actually inscribed was never covered by the
  regtest runs those checkmarks point at.

**Rule going forward:** a checkmark records what the code did on a date. When code is
rewritten, the entry is re-verified or struck — not left standing. Before any
inscription run, re-verify this file against the code rather than trusting it.
