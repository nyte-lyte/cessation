# Cessation — To Do

Rewritten 2026-08-16. Every claim below was re-verified against the code on that
date. The previous version of this file asserted a state the code did not match —
see "Why this file was wrong" at the bottom before trusting any old checkmark.

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

**Repo HEAD** is `8ca13e5` — engine v3 plus the `u_time` fix. **Not inscribed.** Live
v2 corresponds to `4fe0114` (2026-06-20).

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

## Outstanding

- **Decide whether a v3 inscription is worth a fourth layer.** Each reinscription stacks
  another layer on the same sats, which is what degraded appearance and speed on
  ordinals.com. Weigh that against the colour-ranking issue above, which only matters
  once the collection passes 30 pieces. Not urgent; do not reinscribe reflexively.
- **If inscribing: dump and read the actual CBOR before broadcasting.** Wrong metadata
  is what forced the third inscription and put a real name on chain permanently.
  Verify the composed inscription's metadata decodes to exactly four keys —
  `pieceIndex`, `hashTail`, `inscriptionUnix`, `dataset` — and nothing else. Check the
  inscribe command and any batch file for absolute paths; `/Users/<name>/…` leaks
  identity. Run mint.js from the repo root so paths stay relative (`dist/…`).
- **`/r/inscription/self` at `src/main.js:877`** — the last v2-era `/self` call in live
  code, while `main.js:631` documents why v3 stopped trusting `/self` in ord 0.27.
  Dev-only in practice (mint.js bakes `block=` on every piece). The `?? 0` fallback is
  the worse half: a failed lookup becomes block 0, so `cessationBlock` lands ~5.26M and
  the piece never ceases. Should use the already-resolved `_ownId` and fail loudly.
- **No verification harness** for age, collection scale, or determinism — the three
  axes regtest cannot reach. See [[testing]].
- **Tracker data/shader copies** — `health_data_sets.js`, `decay_logic.js`,
  `fragment.glsl`, `vertex.glsl` are manual copies in ~/cessation-tracker. Divergence
  risk on every change to this repo.
- **Never hardcode a piece count in docs or comments.** The collection has no fixed
  size — a new piece is minted whenever new ECG/lab data arrives, so any count is stale
  within about three months. The old "all 29 pieces" phrasing dated from when 29 was
  the whole collection; it is 30 now and 31 soon. Process statements should say "every
  piece" and iterate the collection; a count belongs in docs only as a dated
  point-in-time fact. Cleaned up 2026-08-16 in `mint.js`, `build.js`, `MEMORY.md`, and
  `inscription_architecture.md`.

## Verified true (re-checked 2026-08-16)

Each of these was confirmed present in `src/main.js` at HEAD:
- CBOR decoder inlined (`cborDecode`, line 227)
- `initLifecycle()` with graceful fallback outside ord (line 869)
- Block polling every 60s (`setInterval(lcPoll, 60000)`, line 918) and `lcTick()`
  per frame (line 1187)
- Lifecycle uniforms wired: `u_reanimationProgress`, `u_isLiberated`, `u_voidProgress`
- Void detection: `lcCheckVoid` (764), `lcIsPartnerLiberated` (740)
- Living collection from sibling CBOR metadata (`lcRefreshSiblings`, 676)
- Fast-forward for pieces loaded years post-mint (`lcFastForward`, 844)
- Engine is `text/javascript`, all pieces `text/html`, black background
- Dev console API stripped from the bundle via DEV_START/DEV_END
- No Brotli compression
- Sats sourced and held; `PIECE_SATS` filled in mint.js

## Why this file was wrong

The failure mode was not fabricated checkmarks — it was checkmarks that were true when
written, against code that was then rewritten underneath them, with nobody returning to
update the entry. Confirmed cases:

- **"Autonomous new-mint propagation — incremental, called every block poll."** The
  incremental machinery (`datasetByIdx`, `siblingIdMap`, `knownSiblingCount`) exists in
  exactly two commits in all of history: one adding it, one removing it. It was gone
  well before inscription. The real code refetches every child's metadata from every
  ancestor, on every 10th poll (`_siblingPollCount % 10`, line 840) — not incremental,
  not every block. `MEMORY.md` repeated the same claim; corrected 2026-08-16.
- **"URL hash bootstrap `#idx=…` (replaced window.PIECE)."** Neither mechanism is live.
  `window.PIECE` appears in zero lines at HEAD; the URL hash path sits inside
  DEV_START/DEV_END and is stripped from the bundle. On chain, piece params come from
  `<script>` tag attributes — which `MEMORY.md` states correctly under
  "`document.currentScript` bootstrap"; only this file was stale.
- **"Pieces 1-28 — thin iframe HTML `<iframe src=…>`."** There is no iframe. Pieces are
  `<script src>` with baked attributes (`mint.js:229`). Also 1–28 omits piece 29.
- **"Piece 0 — full engine bundle (build.js → index_bundle.html)."** `build.js` writes
  `index_bundle.js`. Piece 0 is a child of the engine like every other piece.
- **"Network layer — /r/children/self."** v3 calls
  `/r/children/<ancestor>/inscriptions/<page>`.
- **"Thumbnail gradient CSS — injected as `<style>` tag in HTML."** Contradicted by an
  entry in this same file saying `CUSTOM_GRADIENTS` was "never consumed in HTML/metadata
  output." `mint.js` contains zero gradient references. This one was checked off for
  output that never existed.
- **"regtest verified" (2026-04-05 / 2026-04-11)** attaches to the iframe architecture,
  which was later replaced. The architecture actually inscribed was never covered by the
  regtest runs those checkmarks point at.

**Rule going forward:** a checkmark records what the code did on a date. When code is
rewritten, the entry is re-verified or struck — not left standing. Before any
inscription run, re-verify this file against the code rather than trusting it.
