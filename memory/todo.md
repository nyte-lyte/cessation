# Cessation — To Do

## Pre-Mint (mint target was Easter Sunday April 5 2026 — not yet done as of 2026-04-11)
- **NEXT: Mainnet mint sequence**
  1. Inscribe engine: `ord wallet inscribe --fee-rate <FEE_RATE> --file index_bundle.js` → get engineId
  2. All 29 pieces: `node mint.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>` → inscribe with --parent engineId
  - All pieces are children of the engine. Engine is the root inscription.
  - Piece 0 is genesis art piece, not the inscription parent.
  - Sibling discovery at runtime uses /r/children/{engineId} (engineId extracted from script src).
  - All pieces use --json-metadata for CBOR
  - Engine is text/javascript (ord infers from .js extension), all pieces are text/html
- ~~Architecture: separate engine inscription~~ — DONE (2026-04-11): engine=text/javascript, all 29 pieces=HTML, black background, regtest verified
- ~~Test iframe bootstrap + /r/children/self via ord regtest~~ — DONE (2026-04-05)
- ~~Build inscription 0 bundle~~ — DONE: build.js → index_bundle.js (86.5 KB uncompressed)
- ~~Strip dev console API~~ — DONE: DEV_START/DEV_END markers, only F/R/S remain for collectors
- ~~Decide on Brotli compression~~ — DONE: not compressing
- ~~Source Nakamoto sat for piece 0~~ — DONE: 2009-01-31 sat acquired
- ~~Add final (29th) dataset~~ — DONE: 2026-03-20 dataset added
- ~~Data audit complete~~ — DONE: all metrics wired meaningfully as of 2026-03-22
- ~~Source and hold 29 Omega black uncommon sats~~ — DONE
- ~~Lock visual system~~ — DONE: sat=0.92+0.08*ab, bri=0.25+0.65*value, u_co2Norm fixed, tracker synced (9ee8fe5)
- ~~Lifecycle engine~~ — DONE (2026-04-05): full lc engine in main.js, regtest verified
- ~~Inscription architecture~~ — DONE (2026-04-05): iframe + URL hash params, CBOR metadata, mint.js rewritten
- ~~Thumbnail gradients~~ — DONE (2026-04-06): CUSTOM_GRADIENTS in mint.js, all 29 pieces use tracker-matched linear-gradient(90deg, hex1, hex2)

## Blockchain Integration (both projects)
- Wire lifespan, decay nudges, and beam hue nudges to actual hash derivation
- Display real mint status per piece in tracker (currently hardcoded "not yet minted")
- Update tracker with real inscription IDs, timestamps, hash tails post-mint

## Lifecycle Engine — COMPLETE (2026-04-05)
All items done and regtest-verified:
- ~~CBOR decoder~~ — inlined in main.js
- ~~Network layer~~ — /r/children/self, /r/metadata, /r/blockheight, /r/blockinfo
- ~~LifecycleState (lc) + initLifecycle()~~ — full boot sequence, graceful fallback outside ord
- ~~Block polling (60s), lcTick() per-frame~~ — transitions interpolate over one block window
- ~~Uniforms wired to lc~~ — reanimationProgress, isLiberated, voidProgress
- ~~Void detection~~ — lcCheckVoid, partner liberation simulation
- ~~Living collection (lc.collectionDatasets)~~ — fetched from sibling CBOR metadata
- ~~Frozen partner rule~~ — handled in lcGetPartnerDataset
- ~~URL hash bootstrap~~ — #idx=N&ht=H&unix=U&hue=D&block=B (replaced window.PIECE)
- ~~Autonomous new-mint propagation (lcRefreshSiblings)~~ — incremental, called every block poll
- ~~Fast-forward for pieces loaded years post-mint~~ — lcFastForward()

## Inscription Architecture — COMPLETE (2026-04-05)
- ~~Piece 0~~ — full engine bundle (build.js → index_bundle.html), baked via BAKE: markers
- ~~Pieces 1-28~~ — thin iframe HTML: `<iframe src="/content/{piece0Id}#{params}">`. MIME issue solved (HTML can't be loaded as script).
- ~~CBOR metadata~~ — written to dist/ via --json-metadata, verified round-trip in regtest
- ~~Thumbnail gradient CSS~~ — injected as `<style>` tag in HTML (not JS), visible before WebGL loads

## Tracker — Data & Shader Sync
- health_data_sets.js and decay_logic.js are manual copies — divergence risk if main project data changes
- Shaders (fragment.glsl, vertex.glsl) are also manual copies — same risk

## Tracker — Hiro API / Mint Data
- Mint status badges per piece
- Block explorer links
- Actual inscription timestamps and hash tails once minted
