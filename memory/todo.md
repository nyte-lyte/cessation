# Cessation — To Do

Rewritten 2026-08-16, updated end of session 2026-08-16. Every claim was re-verified
against the code. The previous version of this file asserted a state the code did not
match — see "Why this file was wrong" at the bottom before trusting any old checkmark.

## THE DECISION THAT FRAMES EVERYTHING
**Re-inscribing the whole project on fresh sats, v3 engine only.** No fourth layer on
the existing sats. One inscription per sat, clean parent chain, no legacy ancestors.
The bar is "make sure everything works this time" — two previous attempts failed and
one of them put a real name on chain permanently.

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

**Repo HEAD** is `8f49340`. **Not inscribed.** Live v2 corresponds to `4fe0114`
(2026-06-20). HEAD is what the fresh-sat inscription would carry.

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

All committed and pushed. Harness at **9,300 checks, 0 failures**; bundle rebuilds
byte-identical.

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

## Outstanding — decisions, before any inscribing

- **Tail convergence — UNDECIDED.** `getAgedDataset` clamps drift at the end of the
  timeline (`maxSpan`), so when the collection stops growing the final ~20% of pieces
  permanently converge onto the last dataset in old age. While the collection grows,
  new data keeps extending the runway and it does not bite. User's position: "not sure
  about tail convergence." Not a bug — a real structural consequence that should be
  decided rather than discovered.
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
- **Remaining harness work** — uniform completeness, float32 magnitude, and a
  frozen-uniform age sweep are still unbuilt. Scale and determinism are done. See
  [[testing]].
- **The regtest growth rehearsal — the one thing that turns "modelled" into "seen."**
  The v1 regtest inscribed 30 and viewed 30, and passed; the failure only appeared when
  a new dataset joined the collection. So the rehearsal must include growth:
  1. Inscribe the engine, then pieces 0–29, each in its own block.
  2. Open all 30. Baseline — this is the step that already passed for v1.
  3. Add a new dataset to `health_data_sets.js` and inscribe piece 30.
  4. Reopen the originals: still render, discover 31 siblings, re-rank rather than crash.
  5. Open piece 30 itself — index past the baked array, exercising the `_initDs`
     fallback and `lc.ownDataReady`.
  6. Repeat with 31 and 32; one new piece may not surface an off-by-one that two would.
  Also time the first paint — it should be immediate now, not tens of seconds.
- **Not yet proven on any chain:** boot ordering, batched sibling fetch, and the block
  height fallback all no-op in dev because `/r/*` 404s immediately. Dev verified the
  render path and the init-time fix only.
- **Tracker data/shader copies** — `health_data_sets.js`, `decay_logic.js`,
  `fragment.glsl`, `vertex.glsl` are manual copies in ~/cessation-tracker. Divergence
  risk on every change to this repo.
- **Never hardcode a piece count in docs or comments.** The collection has no fixed
  size — a new piece is inscribed whenever new ECG/lab data arrives, so any count is stale
  within about three months. The old "all 29 pieces" phrasing dated from when 29 was
  the whole collection; it is 30 now and 31 soon. Process statements should say "every
  piece" and iterate the collection; a count belongs in docs only as a dated
  point-in-time fact. Cleaned up 2026-08-16 in `inscribe.js`, `build.js`, `MEMORY.md`, and
  `inscription_architecture.md`.

## Verified true (re-checked 2026-08-16)

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
