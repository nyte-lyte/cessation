# Cessation — Project Memory

## READ FIRST (session ending 2026-08-16)
**Decision: re-inscribing the whole project on fresh sats, v3 engine only.** No fourth
layer on the existing sats. The bar is "make sure everything works this time."
- Live on chain right now: **v2** (`4fe0114`). Repo HEAD is ahead and NOT inscribed.
- `node test/scale.test.mjs` — 9,300 checks, must pass before anything is inscribed.
- `node test/liberation_model.mjs` — design instrument for the liberation distribution.
- Full state, what's done, and what's still undecided: [todo.md](todo.md).
- What is and isn't verifiable, plus the blocking metadata gate: [testing.md](testing.md).
- **Two decisions still open:** tail convergence, and whether `KARMA_CLEARANCE_K = 0.05`
  should be data-derived rather than chosen. Both are cheap now, permanent later.
- Terminology: **inscribing** is writing to chain (what the creator does); **minting**
  is a collector claiming. `inscribe.js` builds the per-piece files and prints the ord command; it does not broadcast. Renamed from `mint.js` 2026-08-16.

## What It Is
Generative art project inscribed on the Bitcoin blockchain. Each piece is derived from a specific health data snapshot (one ECG/lab reading; 30 of them so far, 2018 onward). The subject has a rare cardiomyopathy. The art visualizes the lifecycle and disease progression of a human life.

## Key Files
- `src/main.js` — Core JS (~1500 lines): WebGL2 setup, health data processing, beam animation, uniform computation, lifecycle engine, console debug API
- `src/shaders/fragment.glsl` — Fragment shader (~370 lines): 4 background fields, 6 electrolyte forms, lava lamp orbits, decay, hue drift
- `src/shaders/vertex.glsl` — Trivial fullscreen quad pass-through
- `data/health_data_sets.js` — the baked ECG+lab snapshots, one per piece, oldest first. Grows with the collection (30 as of 2026-08-16, 2018 to 2026-06-19). Plus min/max and healthIndex[].
- `data/decay_logic.js` — Blend, karma, drift, and collection influence functions (pure, ready for backend port)
- `index.html` / `style.css` — Minimal entry, fullscreen canvas, no build system
- `test/scale.test.mjs` + `test/harness.mjs` — growth/scale/determinism harness (9,300 checks)
- `test/liberation_model.mjs` — liberation distribution model (design instrument, not a test)
- `inscribed_blocks.json` — written by inscribe.js; which block each piece claimed. Guards against two pieces sharing a block.

## Architecture
- Pure ES6 module + WebGL2. No build tools, no dependencies. Runs directly in browser via HTTP server.
- Data flow: health snapshot → JS normalization → 40+ uniforms → fragment shader → rendered frame
- Deterministic: same Bitcoin hash tail + health dataset = same visual output (blockchain-verifiable)

## Six Beams (Electrolytes)
1. Nitrogen (BUN) — always present, breathing-modulated
2. Creatinine — always present, two-form
3. Sodium — arrival gate at ~20% lifespan
4. Chloride — arrival gate at ~60% lifespan
5. CO2 — halo/atmosphere, data-driven baseline (0.26–0.44)
6. Calcium — dual-lobe, data-driven baseline (0.06–0.30)

## Color System
- Glucose → hue, Potassium → saturation, eGFR → brightness (base palette)
- 4 layered background fields (identity, acid-base, electrolyte, inherited ancestor)
- Slow hue drift: 2–3°/year per field, imperceptible daily but meaningful over decades
- Ancestor field fades over piece lifespan (inheritance fades as individual emerges)

## Health Data
- Personal ECG + metabolic/kidney labs, one snapshot per piece, 2018 onward. The set grows with each new reading — 30 as of 2026-08-16 (indices 0-29). Any fixed count in older notes is just the size on the day it was written, not a cap.
- Two disease processes: LVNC (cardiomyopathy) + Crohn's — but the metabolic panel is a cardiac med safety panel (kidney monitoring for heart meds), not a Crohn's panel. Everything is cardiac-context.
- ECG metrics drive: form angles, field drift tempos
- Lab percentiles drive: form radii, color vibrancy
- BUN/Creatinine ratio couples kidney forms spatially (disease = forms pull together)
- pAxis/rAxis/tAxis: min-max normalized (using minMaxValues). Note: 2025-03-26 outlier (148/143/142) compresses other datasets to lower range — percentile ranking was tried 3/26 but caused visual problems and was reverted

## Health Index
- Rewritten 2026-03-21. Higher = healthier/calmer. Lower = more disease burden = more intense visually (sodium/chloride beams more pronounced).
- Weights: QTc inverted (0.30), eGFR (0.25), creatinine inverted (0.15), ventRate inverted (0.10), potassium (0.07), CO2 (0.07), QRS inverted (0.06)
- Removed: glucose (drives hue already, noisy), qtInterval, nitrogen, calcium, pAxis/rAxis/tAxis, prInterval, sodium, chloride
- Note: 2025-03-26 has extreme axis outliers (pAxis:148, rAxis:143, tAxis:142) — reason unknown, excluded from health index

## Bitcoin Blocktime — Foundation of the System
The Bitcoin block clock (~10 min average) is the heartbeat of the entire project. Every lifecycle event is block-native:
- **Lifespan** — derived from blockhash at mint
- **Cessation** — occurs at a specific block height
- **Reanimation** — triggered by block detection; transition interpolates over one block window
- **Nirvana / void** — triggered when both partners' final cessation blocks are detected; same one-block transition window
- **Liberation threshold** — recomputed fresh from all sibling datasets at each block read
Nothing is wall-clock timed. No human triggers. The chain breathes and the pieces respond.

## Decay Model
- **No artificial brightness decay** — the data itself evolves over the lifetime (chronological drift, collection influence). That IS the decay. Exponential dimming was removed as meaningless on top of real data evolution.
- **Lifespan distribution** (2026-04-18): triangular inverse CDF, min=3, max=100, mode=28. Skews young — median ~42 years, long tail to 100. Most pieces die before they "should." Replaces old n^2.5 power curve (was clustered 5–20 years, max 65). Same function in cessation main.js and tracker pieceUtils.ts.
- `driftMul` grows 0.5→1.3 with lifeFraction — movement amplitude increases with age
- Final cycle (liberated): late phase dissolves toward radial light instead of darkening

## Chronological Drift & Systemic Influence
- `activeDataSet` drives all rendering — computed per-frame, not the static snapshot
- **Chronological drift** (`getAgedDataset`): piece drifts forward through the real health timeline proportionally to collection size. Drift span = 20% of collection length. Waxing and waning emerge naturally from the real biological data.
- **Systemic collection influence** (`applyCollectionInfluence`): 5% pull toward collection average. New healthy pieces lift the collection; sick data pulls it down. Collection breathes together.
- `currentDataSetIndex` is the raw anchor; `activeDataSet` is what renders each frame.

## Composition State (current — committed 2026-04-03)
- **17-field data-driven anchor positions** — all committed. Each field's home position derived from two related physiological metrics.
- ECG fields: anchor x = own ECG metric, anchor y = related lab metric (e.g. fVR = ventRateNorm × glucose, fQTc = qtcPercentile × eGFR)
- Lab fields: anchor x = own lab percentile, anchor y = related metric (e.g. fGlu = glucose × eGFR, fBUN = nitrogenRadius × (1-eGFR))
- g^4, /wSum, sigma 0.12+0.07×ab, os=0.10, wobble=0.03, circular mean hue blend
- Beam arrival gates: Na/Cl present from birth at data-driven floor, grow at arrival gate
- Beam tempos: N by BUN (7-10s), Cr by PR (9-15s), CO2 by eGFR (12-20s), Ca by tAxis (18-30s)
- DPR: both cessation and tracker render at physical pixels
- **Current safe state: cessation `8f49340`, tracker `9d0b0b9`**

## Visual Progress (2026-04-03 — current)
- 17-field data-driven anchors committed and approved. User loves this system.
- **Saturation formula: `0.92+0.08*ab`** — near-fully saturated always; ab nudges it slightly. Raised from 0.70 floor.
- **Brightness formula: `0.25+0.65*value`** — floor lowered from 0.35 to 0.25, enables darker pixels and more contrast.
- **Root cause of "washed" look (identified 2026-04-03):** Weighted blend averages all brightness values — floor 0.35 compressed all pixels to 0.35–0.95, making truly dark pixels impossible. Lowering to 0.25 partially addresses this.
- **Design intent confirmed:** Disease progression = beauty. Healthy pieces = calm/restrained. Sick data = vivid/dramatic. Collection becomes more beautiful as creator's health deteriorates.
- **u_co2Norm bug fixed:** Shader declared `u_co2Norm` and used it in 5 places (fCl y-anchor, fCO2 x-anchor, hCO2, bCO2, abCO2), but main.js and PieceViewer.tsx never set it — defaulted to 0 (WebGL). Accidentally created a dark red (hue 0°, bri 0.35, sat 1.0, ab 1.0) max-drift anchor field. Now fixed in both cessation and tracker.
- ECG fields still cluster warmer/darker than lab fields — vertical seam character partially present. Acceptable for mint.

## Form Movement — Current State
- Lava lamp orbits: two superimposed sine frequencies. ECG values seed phases. driftMul grows 0.5→1.3 with age.
- `os = 0.10 * driftMul` (committed 1c0157a). Realtime wobble: 0.03.
- BUN/Creatinine pull coupling (pull=0.12): disease pulls kidney forms together spatially.
- **`u_time` fixed (2026-08-04):** now `secsSinceBirth` = `Date.now()/1000 - inscriptionUnixSeconds`. Pieces are born at inscription and count forward — each page load finds the piece mid-motion, never restarting from zero. Previously used `performance.now()` which reset to 0 on every load.
- **Beam phases pre-advanced from birth (2026-08-04):** all 6 beams initialized to `seed + (secsSinceBirth / tempo) % period` before the first draw. Previously always restarted from hash seed on every page load.
- **CO2 and Ca phase seeds fixed (2026-08-04):** were `() => 0` — all pieces breathed in unison. Now hash-seeded: CO2 = `(h/99)*1.1π`, Ca = `(h/99)*0.7π`. Each piece independent, different from N (2π) and Cr (1.3π).
- **`setHSBUniforms` fixed (2026-08-04):** now passes `drawCollection` (live sibling collection) instead of baked `healthDataSets`. Ensures `u_glucose`/`u_potassium`/`u_eGFR` percentile ranking stays correct as collection grows past the initial 30 pieces.

## Canvas Format & Display (committed)
- Aspect ratio: 3:2 (landscape, like 35mm film negative)
- UV correction: `uv = vec2((v_uv.x - 0.5) * aspect + 0.5, v_uv.y)` using u_resolution
- Frame: `clamp(8px, 8vmin, 80px)` solid black border (proportional film strip) — replaces old fixed 125px (2026-04-12)
- Fullscreen: F key toggles fullscreen on canvas-container. Hover icon removed.
- Tracker: same 3:2 canvas, same shader, black background wrapper

## Collector Key Bindings (permanent — not removed pre-mint)
- **F** — toggle fullscreen (canvas-container)
- **R** — toggle video recording (start/stop, saves .webm). No auto-stop when triggered by key.
- **S** — save high-res PNG snapshot of current frame
- `recordCanvas(seconds)` console API preserved for timed recordings

## Console Debug API (dev only — removed pre-mint)
changeDataset(idx), nextDataset(), prevDataset()
setLifeFraction(0..1), clearLifeFraction(), timeWarp(f)
playPreview(speedYPS), stopPreview()
setInheritedHue(deg), resetInheritedHue()
setReanimation(0..1), setLiberated(bool), setVoidProgress(0..1)
getKarma(idxA, idxB), getBlend(idxA, idxB)
ripple/bigRipple — REMOVED (pulse mechanism removed entirely)

## Visual State (current — 2026-04-03)
- Debug overlays: removed. Console debug API intact (dev only, removed pre-mint). Grain removed; rand() used only for CO2 halo texture.
- Background: 17-field data-driven anchors. Sat: `0.92+0.08*ab`. Bri: `0.25+0.65*value`.
- Form shapes: ellipse smoothstep. Radii data-driven from lab percentiles. CO2: atmospheric halo, not shape.
- CO2 beam: str 0.26–0.44 (data-driven). Calcium beam: str 0.06–0.30 (data-driven).

## Data Mappings
Full details in `memory/data_mappings.md`.
- pAxis/rAxis/tAxis: min-max normalized via minMaxValues
- QTc: most wired (Field 3 hue, form aspects, health index 0.30)
- ventRate: heartPace scales all field + form speeds; health index (0.10)
- eGFR: brightness, field sigmas, form radii; health index (0.25)
- glucose → hue, potassium → sat, eGFR → brightness (base palette)

## Ancestor Hue
- Hardcoded at mint from Bitcoin chain (on-chain recursion). Not computed dynamically.
- Per-piece: piece N uses piece N-1's glucose hue (`allInheritedHues[N]`). Piece 0 uses its own.
- Two-field and blended approaches were tried and reverted — competed with piece's own color identity.
- **Bug fixed (2026-05-17)**: inscribe.js was using `getPartnerInheritedHue(pieceIndex)` (returns partner's inherited hue) instead of `allInheritedHues[pieceIndex]`. Even pieces 2+ got their own glucose hue; odd pieces 3+ got two steps back. Piece 1 was accidentally correct. Now fixed: `hue = allInheritedHues[pieceIndex].toFixed(4)`.

## Collection Structure & Lifecycle
- Collection grows indefinitely — new piece minted every ~3 months as new ECG/lab data is taken, as long as creator is alive. The collection is literally tied to continued survival.
- Lineage sequential: piece N inherits hue from piece N-1; piece 0 is genesis.
- Each piece mints to its own Bitcoin block — minimum 2 blocks apart to guarantee distinct blockhashes for lifespan derivation.
- **Piece 0 influences everything permanently** — it is always in the sibling list regardless of collection size. Its dataset is always part of the living collection, always included in percentile calculations, always pulling on every new piece. Genesis influences all that follows.
- New mints shift percentiles for all existing pieces automatically via lcRefreshSiblings on the next block poll. Early pieces drift the most by the time the collection matures.
- The collection has no fixed size. A new piece is minted whenever new ECG/lab data arrives (~every 3 months), for as long as the creator is alive. Counts in these docs are point-in-time only — as of 2026-08-16 the collection is 30 pieces, indices 0-29, and piece 30 is expected next.

## Nirvana / Karma / Lifecycle
Full details in `memory/nirvana.md`.
- Built: nirvana, reanimation, liberation visual states in fragment.glsl
- Karma formula drives liberation threshold (25th percentile of collection) — **threshold is DYNAMIC**, shifts as new pieces are minted. Not fixed.
- Pairing: (0,1), (2,3)... — piece 0 (genesis) liberates directly, no karma check
- **Lifecycle engine built** (2026-03-22): `lc` state object, `initLifecycle()`, `lcPoll()`, `lcResolve()`, `lcTick()`, `lcStartPoller()`
- Dev mode: lcSelf() fails gracefully → uses hardcoded defaults, lc.ready = true, lc.onChain = false
- On-chain: fetches own CBOR metadata, discovers ALL siblings (paginated), computes cessationBlock, polls every 60s
- Transition: reanimationProgress interpolates 0→1 over LC_BLOCK_WIN_MS (600s) per frame via lcTick()
- **Void detection built**: `lcIsPartnerLiberated()` simulates partner's full cycle history iteratively (blend, karma check, fetch next cessation block hash — no cap, exits via return false/true or fetch failure). `lcCheckVoid()` fires at own liberation and every subsequent block poll while liberated. Both partners must liberate independently before void triggers.
- Piece 0 void partner = piece 1 (getPartnerIndex handles this)
- **Living collection**: sibling CBOR metadata fetched at boot, datasets extracted into `lc.collectionDatasets`. draw() uses this for getAgedDataset, applyCollectionInfluence, computeHSBFromStats, winsorizedPercentileForLab. Falls back to local healthDataSets in dev mode or if dataset absent from metadata.
- **Boot rendering** (rewritten 2026-08-16): the piece draws on frame 1 from the baked array, then **switches to the live on-chain collection** once the first sibling fetch returns (`lc.collectionResolved`). From that point the baked array is not consulted at all. So a piece mid-inscription-run genuinely renders against however many siblings exist — piece 0 alone is a collection of ONE. Expect a visible settle at boot while the collection resolves; that is the design, not a flash bug.
- **The baked array is fallback only** — dev/outside ord, and the moments before discovery returns. It is no longer the seed. Seeding from it was why the first 30 pieces could not affect each other: the engine already held every dataset, so inscribing a sibling taught it nothing and no percentile moved. See [todo.md](todo.md).
- **`document.currentScript` bootstrap** (replaced URL hash 2026-04-11): engine reads `t/ht/unix/hue/block` attributes from the `<script>` tag synchronously. Eliminates piece-0-flash. `block` attribute supplies child's inscription block height for lcFastForward.
- **Karma clearance** (2026-08-16, `8f49340`): karma now clears across rebirths at the piece's own eGFR — kidney clearance rate applied to accumulated burden. `lc.uncleared` starts at 1, multiplied by `(1 - karmaClearanceRate)` each cessation; liberation when remaining karma < threshold. Never stored, always replayed from birth. Full rationale and consequences in `memory/nirvana.md`.
- **Boot renders on frame 1** (2026-08-16, `d6329eb`): `draw()` no longer awaits `initLifecycle`. Pieces inside the baked array draw immediately; a piece past it waits only on `lc.ownDataReady` (its own metadata), never the sibling scan. Sibling metadata is fetched in batches of 8, not serially — this is what caused tens of seconds of black screen.
- **Pieces past the baked array used to crash init()** (fixed 2026-08-16, `d6329eb`): the beam phase pre-advance read `healthDataSets[currentDataSetIndex]` and handed it to every tempoFn, which all dereference it. Piece 30 onward would never have rendered at all. Falls back to the last baked dataset.
- **Autonomous new-mint propagation** (corrected 2026-08-16 — the previous entry here described code that no longer exists): `lcRefreshSiblings()` is called from `lcPoll()` on **every 10th poll** (`_siblingPollCount % 10`, ~10 min), not every block. It is a **full refetch**, not incremental — it re-fetches every child's CBOR metadata from every ancestor in `lc.collectionAncestors`, rebuilds `lc.collectionDatasets`, refreshes `minMaxValues`, and recomputes the partner inherited hue. The incremental machinery this entry used to claim (`lc.datasetByIdx`, `lc.siblingIdMap`, `lc.knownSiblingCount`) exists in exactly two commits in all of history — one adding it, one removing it — and was gone long before inscription. Net effect is still correct: new mints propagate without a reload, just via full refetch on a 10-poll cadence.

## Wallets (hot & cold)
Full details in `memory/wallets.md`. Verified live 2026-08-13.
- Mainnet node data dir: `/Volumes/Bitcoin/Bitcoin` (external volume). RPC bitcoin/bitcoin.
- **Hot wallet `ord`** (`/Volumes/Bitcoin/Bitcoin/ord/`) — the inscribing wallet: fees + carriers.
- **Cold wallet `ord-cold`** (`/Volumes/Bitcoin/Bitcoin/ord-cold/`) — holds the newly-bought rare sats for the re-mint. Move a sat to `ord` only at mint time.
- **UniSat wallet is deprecated — not used going forward.**

## Inscription Architecture
Full details in `memory/inscription_architecture.md`.
- **Two-inscription model** (finalized 2026-04-18): engine is root, all 30 pieces (0-29) are its children
- Engine: `index_bundle.js` inscribed as `text/javascript` — no parent, no metadata. Root inscription.
- Every piece: a thin HTML file (~300 bytes) loading the engine via `<script t=N ht=H unix=U hue=D block=B src="/content/{engineId}">` — ALL use `--parent engineId`
- Engine reads piece params from `document.currentScript` attributes synchronously
- **Sibling discovery** (v3, `d718517`): the engine resolves its **own** inscription id from `window.location.pathname` (`_resolveOwnId`), walks the parent chain via `/r/parents/<id>/inscriptions/0` up to the topmost ancestor (`lcResolveAncestors`, depth cap 10), then fetches `/r/children/<ancestor>/inscriptions/<page>` for **every** ancestor and merges, deduped by pieceIndex. This is what lets a v2/v3 engine inscribed under v1 see both branches. The older description — engineId pulled from `_sc.getAttribute('src')` and a single `/r/children/{engineId}` call — was v1/v2 and is no longer how it works. `_engineId` is still parsed from the script src, but only as the initial `collectionRoot` fallback.
- Piece 0 is the genesis art piece, NOT the inscription parent. It's a child of the engine like all others.
- New pieces (30+): mint with `--parent engineId` → automatically appear in `/r/children/{engineId}` → picked up by `lcRefreshSiblings` within ~10 minutes. Collection grows without any changes to existing pieces.
- CBOR metadata per piece via `--json-metadata` flag — `dataset` field required for living collection
- `PIECE_SATS` in inscribe.js: lookup table (null placeholders) — fill in sat ordinal numbers before minting. Script errors loudly if any sat is null. Generated command includes `--sat <satNumber>`.
- `CUSTOM_GRADIENTS` removed from inscribe.js (2026-05-17) — was dead code, `previewGradient` was never used in HTML output.
- Min/max computed dynamically from all known siblings — intentional, new pieces shift existing ones

## Code Bugs Found & Fixed (2026-08-04 audit)
Full audit before third inscription attempt. All fixed in main.js unless noted.

1. **`u_time` = page-load seconds (wrong)** — `performance.now()/1000` resets to 0 every page load. All pieces start from identical visual state every time. Pieces should be born at inscription and count forward. Fixed: now `Math.max(0, Date.now()/1000 - inscriptionUnixSeconds)`.
2. **Beam phases reset on page load** — N/Cr/Na/Cl/CO2/Ca phases initialized from hash seed on every load, always starting from the same position. Fixed: all 6 phases pre-advanced by `secsSinceBirth` before first draw using initial dataset's tempo.
3. **CO2 and Ca phase seeds always 0** — `phaseSeed: () => 0` means every piece breathes in perfect unison. No hash-based differentiation. Fixed: CO2 = `(h/99)*1.1π`, Ca = `(h/99)*0.7π` — each piece independent.
4. **`setHSBUniforms` used baked `healthDataSets`** — the three primary color uniforms (`u_glucose`, `u_potassium`, `u_eGFR`) ranked against the static 29-piece baked array rather than the growing live sibling collection. Background color percentiles would diverge from beam color percentiles once piece 30+ minted. Fixed: `setHSBUniforms(ds, collection)` now takes `drawCollection` as parameter.
5. **`lcRefreshSiblings` ancestor ordering wrong** — iterated ancestors immediate→topmost, so oldest engine's children were appended last and won via Map.set last-wins. Newest reinscription would lose to oldest broken inscription. Fixed: now iterates topmost→immediate so newest pieces win.
6. **`build.js` comment wrong** — said "Piece 0 is inscribed as a JS file." The engine is the JS file; all pieces including piece 0 are HTML. Fixed: updated comment.

## Inscription History (corrected 2026-08-16 — the previous version of this section was wrong)
**The same sats have been inscribed on three times.** All three layers are permanent.
- **1st — v1 engine:** broken. Pieces not live, code missing.
- **2nd — v2 engine, bad metadata:** engine worked, but the metadata leaked the creator's
  real name onto chain (a path-derived value in the inscribe invocation, not from
  `metadataObj` — inscribe.js has only ever written pieceIndex/hashTail/inscriptionUnix/dataset).
  Required inscribing again.
- **3rd — v2 engine, metadata fixed:** **this is what is live now.** IDs recorded in
  `memory/tracker.md` under "Live On-Chain IDs (as of 2026-06-20)".
- The earlier layers stay on chain underneath each sat, bypassed by viewers because the
  latest inscription on a sat wins — but they remain retrievable. The name cannot be undone.
- **v3 engine is NOT inscribed.** Repo HEAD (`8ca13e5`) is ahead of what is live.
- Stacked inscriptions on the same sats are also what caused the lag and poor appearance
  on ordinals.com.

## Mint Timeline
- **Re-inscribing on fresh sats (2026-08-04):** first two inscription attempts had errors (broken engine v1, then metadata problems in v2). Both failed collections moved to trash wallet. Third inscription will be on fresh sats — clean parent chain, no legacy ancestor conflicts.
- **`lcRefreshSiblings` ancestor ordering fixed (2026-08-04):** now iterates topmost-first so newest engine's pieces win via Map.set last-wins. Harmless for fresh sats (single ancestor), correct for any future reinscription.
- Environment confirmed: Node v25.9.0, Bitcoin Core v30.2.0, ord 0.27.1
- Engine: `index_bundle.js` 95.4 KB uncompressed (rebuilt 2026-08-13 at `cdf1eb6`; the old "87.4 KB / 2026-04-18" figure predated engine v2 and v3)
- **Mint sequence** (unified for all pieces — fill `PIECE_SATS` in inscribe.js first):
  1. `ord wallet inscribe --fee-rate <FEE> --file index_bundle.js` → engineId
  2. For each piece index in the collection: `node inscribe.js <N> <BLOCK_HASH> <BLOCK_TIME> <ENGINE_ID> <BLOCK_HEIGHT>`
  3. Run the generated command (includes `--sat`, `--parent engineId`, `--json-metadata`)
- **Sats**: newly-bought rare sats held in the **`ord-cold`** wallet (see `memory/wallets.md`). Transfer the needed sat to the hot `ord` wallet at mint time. Use `ord wallet sats` after transfer to map sat numbers and satpoints before touching anything. (UniSat wallet deprecated.)

## Rare Sats
- **Live collection** (as of 2026-08-16, indices 0-29): every piece is inscribed on an **Omega black uncommon sat** — last sat of a block. **Piece 0 (genesis)** is on a **Nakamoto sat** mined 2009-01-31 — 28 days after the genesis block, when Satoshi was the only miner. Never moved.
- These sats each carry **three inscription layers** now — see "Inscription History" above. They are no longer never-previously-inscribed.
- **For any future inscription**: newly-bought rare sats are held in the **`ord-cold`** cold wallet (see `memory/wallets.md`) — transfer to the hot `ord` wallet before minting. Some UTXOs may contain multiple rare sats; ord separates them correctly during inscription via satpoint tracking. (UniSat wallet deprecated — no longer used.)

## Visual Problems — Resolved / Pending
Full diagnosis in `memory/visual_diagnosis.md`. Images saved in `memory/` — see `visual_reference.md`.
1. **Dark left side** — partially mitigated by lowering bri floor to 0.25. ECG fields still warmer/darker than labs but acceptable for mint.
2. **Form blur** — smoothstep transition zone still wide. Not addressed; acceptable for mint.
3. ~~**Tracker color identity**~~ — DONE (2026-04-03): hex1 (ECG circular mean) + hex2 (lab circular mean). PieceCard thumbnail gradient, border hover gradient, piece page dot + health bar, analytics dots + hover text all use `linear-gradient(90deg, hex1, hex2)`.
4. ~~**Tracker oversaturation**~~ — DONE (2026-03-31): beam RGB vec3 uniforms were never set; fixed.
5. ~~**u_co2Norm missing**~~ — DONE (2026-04-03): fixed in cessation main.js + PieceViewer.tsx.
6. ~~**Mobile fullscreen button showing on iPhone landscape**~~ — DONE (2026-04-03): changed detection from `innerWidth <= 600` to `pointer: coarse` media query.

## To Do
Full list in `memory/todo.md`.

## Tracker Site
Full details in `memory/tracker.md`.
- Live: https://cessation-tracker.vercel.app — homepage redirects to /piece/0 (grid removed)
- Nav: COLLECTION (→/piece/0) · ABOUT · ANALYTICS · nytelyte.xyz right side
- Stack: Next.js 16 + TypeScript + Tailwind v4 + Vercel, deployed from ~/cessation-tracker

## nytelyte.xyz — Live
- Artist portfolio site at https://nytelyte.xyz, repo ~/nytelyte (github: nyte-lyte/nytelyte)
- Homepage: live random piece embed (iframe) left text + right piece layout
- Nav: nytelyte · Projects · About · Contact (Resend contact form → hillyerjess@gmail.com)
- "View collection" links to cessation-tracker.vercel.app/piece/0

## User Preferences
- Communication: concise, direct, no emojis
- Project is deeply personal — the health data is the creator's own cardiomyopathy records
- Visual changes: max 25% increments — no dramatic jumps when dialing things up

## Key Insights (architecture)
- **Blur = field-density problem.** 17 dense fields means every pixel has a natural dominant neighbor — g⁴ works. 4-field blur can't be fixed parametrically; not enough fields to cover canvas.
- **Composition sameness = fixed-anchor problem.** ECG always left, labs always right. Solved with data-driven anchors (committed 2026-04-03).
- **"Washed" look = brightness floor averaging.** Weighted blend compresses all brightness to floor–1.0. Floor 0.35 → pixels always 0.35–0.95. Floor lowered to 0.25 for more contrast range.

## Feedback
- Always read files and discuss plan before making code changes.
- Settled blend: weighted average `(w1*col1+…)/wSum` with w^2, sigma 0.75, wSum epsilon 1e-6
- [Light system history](feedback_light_system.md) — all approaches tried (A/B/C), all reverted
- [Color variety root cause](feedback_color_variety.md) — full history of failed approaches
- [4-field g⁴ attempt](feedback_4field_g4_attempt.md) — reverted. g⁴+/wSum wrong for 4 fields; use Reinhard+dark ground if retrying.
- [Visual reference](visual_reference.md) — 7 saved images with analysis
- [ECG hue inconsistency](feedback_ecg_percentile.md) — brown left side, min-max on ECG hues
- [Engine version artifacts](feedback_engine_version_artifacts.md) — u_time float32 bug, v1 fossil in index_bundle.html, why regtest missed both
- [Testing](testing.md) — dev-mode expectations, regtest's three blind spots (age/scale/visual), pre-inscription checklist, planned harness
