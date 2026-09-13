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
- **The canvas renders at 300×200 regardless of viewport** — 25% of the frame at
  1200px, 21% at 2400px. Measured on mainnet 2026-09-06, not inferred. Fixed in the
  repo the same day; the fix has never been inscribed. This affects every piece
  currently visible on ordinals.com.
- **27 seconds to first paint on mainnet.** Three compounding causes — 3× metadata
  from the stacked layers (fresh sats fixes), serial fetches and paint-blocking on the
  full sibling scan (both fixed by `d6329eb`, in HEAD, not on chain). See
  [testing.md](testing.md).

## Done this session (2026-09-06)

Regtest run completed and verified end to end, plus the first direct measurement of
live mainnet. Full detail in [testing.md](testing.md); the short version:

- **Canvas scaling bug found and fixed.** `#canvas` had no `width`, so it stayed
  300×200 at every viewport — 25% of the frame at 1200px. Shipped, and live on mainnet
  today. Fixed with `width:100%;height:auto` in `style.css`; verified 84–89% fill and
  exact 3:2 from 400px to 2400px, portrait included, zero errors.
- **`build.js` was inscribing CSS comments.** Comment stripper couldn't match across an
  asterisk and ran after minification. Fixed. Net cost of the canvas fix on chain: **+23
  bytes** (was +465 with the comment).
- **Mainnet measured: 27.06s to first paint**, 90 metadata fetches for a 30-piece
  collection because the ancestor walk pulls all three stacked layers. HEAD paints at
  64ms under 300ms/request latency, before any fetch completes.
- Regtest chain fully re-verified: metadata gate passes (exactly four keys, no identity
  leak), engine bytes on chain identical to local bundle, 30/30 distinct blocks and
  timestamps, complete index set.
- Bundle reproducible byte-identical; `node test/scale.test.mjs` 14,064 checks, 0 failed.

**Not yet inscribed anywhere** — the canvas and build fixes are repo-only. The regtest
chain still carries the pre-fix engine.

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

## Living collection — fixed 2026-08-16

**The first 30 pieces could not affect each other, and that was the whole point of the
project.** `_lcMergedEntries` seeded the collection from the baked `healthDataSets`
array, which the engine carries compiled in. So piece 0, alone on chain, already knew
pieces 1–29. Inscribing a sibling overwrote a baked entry with an identical one:
percentiles never moved, min/max never moved, nothing re-rendered. The collection only
began to live once inscriptions went *past* the baked set — piece 30 onward.

Now the collection is strictly what is on chain once discovery succeeds
(`lc.collectionResolved`). Baked data is fallback only: dev, and the frames before the
first sibling fetch returns. Verified against the real datasets: **381 of 435
piece-observations change when a sibling arrives** during a 30-piece run.

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

- **~~A reanimated piece renders a flat colour~~ FIXED 2026-09-12.** Past its first
  cessation every frame was solid `rgb(211,32,143)`, stddev 0.00 — the artwork gone.
  Cause: `fragment.glsl` computes `nirvanaProgress` from `u_totalYears - u_lifespanYears`,
  and those were inscription-relative, so the dissolution ramp saturated at 1.0 for ever
  and `finalColor` became `u_nirvanaRGB * 0.90` — one colour for the whole canvas. Fixed by
  feeding the shader **cycle-relative** years. **Lesson: the shader keeps its own copy of
  the lifecycle maths — `lifeFraction` and `nirvanaProgress` both — so fixing timing in JS
  alone is not enough. Grep the shader too.** Verified at cycles 0/4/12: real images, all
  distinct, moving. See [testing.md](testing.md) → "AGE".
- **~~`lifeFraction` never resets on reanimation~~ FIXED 2026-09-12.** Age was measured
  from the original inscription and clamped to 1, pinning a piece at 1.0 for ever once it
  outlived its first lifespan. Reanimation is **reincarnation** — each cycle now begins a
  new life and ages from zero, block-native via `lc.cycleStartBlock` /
  `lc.cycleLifespanYears`. Verified through `u_inheritedStrength` (lifeFraction 0.67 at
  +20y, 0.85 at +60y, no longer pinned). **Did not fix the flat-colour bug above** — two
  separate faults.

- **NOT INSCRIBING YET — more regtest first (creator, 2026-09-12).** The rare sats are
  peeled and ready (153 carriers, 150 consecutive, `PIECE_CARRIERS` filled), but the
  engine and inscribe path need more verification before anything goes on chain. There is
  no time pressure: the carriers sit locked in `ord-cold` indefinitely. See
  [inscribe.md](inscribe.md) §8b.

- **Move the node off `rpcuser`/`rpcpassword` to cookie auth. Do it when the index is
  caught up and the node is being stopped anyway — NOT mid-index.**
  The mainnet node's RPC credentials are `bitcoin` / `bitcoin` and they are in the public
  repo in three places, on `main`:
  - `ord2.sh:2` — since `10a8764` (2026-06-06)
  - `memory/wallets.md:59` — since `93b6662` (2026-08-13)
  - `memory/inscribe.md:17` — added 2026-09-06 (duplicated what was already public)

  **Not urgent, and no funds are at risk from this alone.** Verified 2026-09-06: the node
  listens on `127.0.0.1:8332` and `[::1]:8332` only, with no `rpcbind` or `rpcallowip` in
  `bitcoin.conf`. RPC is unreachable from outside the machine. Anyone who could use these
  credentials already has code execution locally, and could read the wallet files directly.
  It is hygiene, not an open door.

  When the moment comes:
  1. Delete `rpcuser=` and `rpcpassword=` from `/Volumes/Bitcoin/Bitcoin/bitcoin.conf`.
     Core generates `.cookie` automatically — this is what Core 31's own startup warning
     recommends ("switch to cookie-based auth, or otherwise to use hashed rpcauth").
  2. Drop `--bitcoin-rpc-username` / `--bitcoin-rpc-password` from `ord2.sh`; ord reads the
     cookie from the bitcoin data dir.
  3. Remove the credential from the three doc lines above.

  **Do not rewrite git history to erase them.** The repo is public and already cloned and
  mirrored; the old values are out regardless. Changing the credential is what helps —
  erasing the record of it does not, and it would break every commit SHA referenced in
  `tracker.md` and `todo.md`.

- **Sat consumption / padding — RESOLVED on regtest 2026-09-06, but it changes the plan.**
  Rare sats were destroyed in three of four configurations tested. Full detail and the
  traces in [testing.md](testing.md).
  - **The distinction that matters: two UTXO shapes.** The 7 Omega carriers are
    *1 rare sat at offset 0 + common padding*, so fees eat padding and the rare sat
    survives — the existing one-at-a-time cold→hot workflow is correct for those. The
    Nakamoto UTXO is *entirely rare, no padding*, so every fee burns Nakamoto sats.
    Measured: `ord wallet send` on it cost **111 rare sats in transfer fees alone**,
    before any inscription. Do not assume the established procedure covers it.
  - **THE RULE: `--postage` must equal the contiguous rare run in the UTXO.** Less, and
    the *reveal* fee eats the overhang. A common funding input is **not** sufficient on
    its own — that only protects the commit.
  - Worst case measured: 907-sat range, postage 330 → **577 rare sats paid to a miner**,
    silently, exit code 0, output looking entirely normal.
  - ord will not protect them: its rarity enum covers only alpha sats, so an Omega is
    labelled `common` and Nakamoto-era sats are not a rarity at all. **There is no
    safeguard to switch on.**
  - `inscribe.js` prints no `--postage`, so ord defaults to 10,000 — which would pull the
    entire 907-sat range into the first inscription. **Must print an explicit
    `--postage`.** Still to do.
  - **Capacity: the 907-sat range carries ~3 pieces, not 30** (2 chunks of 330 at the
    P2TR dust floor plus a 247 remainder needing common padding). So the sat plan needs
    rethinking — either far more Nakamoto sats, or pieces on Omegas with the Nakamoto
    range reserved for the genesis pieces.
  - Any multi-piece use of the range needs a **split transaction first**, funded by
    common sats, then one inscription per chunk at `--postage` = that chunk's run.
  - **Always account for every rare sat afterwards** by scanning the block's outputs.
    Experiments 2 and 3 both looked successful from ord's output alone.

- **~~`PIECE_SATS` points at the OLD sats~~ FIXED 2026-09-06.** The table listed the
  v1/v2 sats — the ones already carrying three stacked inscriptions — and every entry
  was non-null, so the "is it filled in?" check would have waved a re-mint onto them.
  Replaced in `inscribe.js` by a derived `satForPiece(index)`:
  - **Engine → `1459982499999999`** (dmvuhsnspyo, oldest Omega held, block 373992).
    Inscribed by hand; the script never emits it, and refuses if a piece resolves to it.
  - **Piece N → `12425429610010 + N`**, Nakamoto-era sats from the 907-sat range in
    UTXO `b9c746591981…:0` (block 2485, 2009-01-31), oldest first. Piece 0 = `…610010`,
    piece 29 = `…610039`. Hard bound at `…610916`; piece 907 is refused.
  - Nothing is hand-typed per piece any more, so the stale-table failure cannot recur.
  - Verified: each Omega sat number equals the last sat of its block computed from the
    subsidy schedule, and the range lies inside block 2485.
  - **The real backstop is ord itself** — the printed command carries `--sat`, and ord
    fails if that sat is not in the wallet. Move the sat from `ord-cold` to `ord` first;
    if ord cannot find it, stop rather than dropping the flag.

- **~~Only 8 rare sats held; 31 needed~~ — WRONG, retracted 2026-09-06.** That counted
  the Nakamoto entry as a single sat. It is a **907-sat range**, so it covers 907 pieces.
  No shortfall; the open-ended collection has room for as long as the range lasts.

- **~~Upgrade Bitcoin Core to 31.x~~ DONE 2026-09-06** — machine now on brew
  `bitcoin 31.1_1`; mainnet node restarted on it, both wallets verified unchanged.
  Inscribe without `--no-backup`. Original context follows.
- **Was: upgrade Bitcoin Core to 31.x before the mainnet run.** Core 30.0–30.3
  carries a regression that breaks ord's recovery-key backup, which is why every regtest
  inscription this project has run used `--no-backup`. That flag skips importing the
  ephemeral key controlling the commit output — and the sat being inscribed sits at that
  address until the reveal confirms. Carrying the flag to mainnet risks losing the
  Nakamoto sat or an Omega uncommon permanently. Fixed in Core 31.0, so this is a normal
  forward upgrade, not a downgrade; ord 0.27.1 sets no maximum Core version.
  **Verified on regtest against Core 31.1 (2026-09-06)** — inscribing without the flag
  succeeds, and the commit output comes back `ismine=True` / `solvable=True` labelled
  `commit tx recovery key`, where a `--no-backup` inscription gives `ismine=False`.
  Remaining action is only to upgrade the machine's own Core (still brew `30.2`) before
  inscribing. Full diagnosis in [testing.md](testing.md) → "`--no-backup`".

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
- **The regtest growth rehearsal — DONE 2026-09-06.** Full results in
  [testing.md](testing.md) under "Measured on chain". Engine + pieces 0–29 inscribed
  one block each (heights 202–231); all 30 open in Brave with zero errors, all frames
  distinct, first paint median 45ms.

  **The recipe that used to sit here was stale and is corrected:** it said to add a
  31st dataset and inscribe piece 30 to force growth. That was the mechanism when the
  engine seeded its collection from the baked array. Since `5f10fb0` the collection is
  built from chain, so **inscribing one at a time IS the growth test** — the collection
  grows 1→30 during the run and every existing piece re-ranks on each arrival. No new
  health data is needed, and none should be invented to make a test run. All 30 pieces
  confirm `[lc] collection resolved — 30 piece(s) on chain`.

  Still genuinely untested, and only reachable once real piece 30 data exists: a piece
  whose index is **past the engine's baked array** (`_initDs` fallback,
  `lc.ownDataReady`). `test/scale.test.mjs` covers it off-chain at sizes 30/31/40/100;
  chain has never seen it. Do it with the first real new dataset, not a fabricated one.
- **Not yet proven on any chain:** boot ordering, batched sibling fetch, and the block
  height fallback all no-op in dev because `/r/*` 404s immediately. Dev verified the
  render path and the init-time fix only.
- **Downstream copies of the engine — resynced 2026-08-17, still manual.** Both other
  repos hold copies and neither updates itself. After any change to `data/`,
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
