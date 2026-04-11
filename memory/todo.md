# Cessation — To Do

## Pre-Mint (mint target was Easter Sunday April 5 2026 — not yet done as of 2026-04-06)
- **NEXT: Inscribe piece 0 on Nakamoto sat, then piece 1 as child**
  - Real mainnet. Bitcoin Core fully synced on laptop.
  - Use `node mint.js 0 <blockHash> <blockUnixTimestamp>` → `dist/cessation_piece_00.html`
  - Use `node mint.js 1 <blockHash> <blockTimestamp> <inscription0Id> <blockHeight>` → `dist/cessation_piece_01.html`
  - Both commands also write metadata JSON for `--json-metadata` flag
- Replace hardcoded hash tail `88` and unix timestamp `1704067200` with real chain values at mint (mint.js handles this automatically)
- ~~Test iframe bootstrap + /r/children/self via ord regtest~~ — DONE (2026-04-05): piece 0 + piece 1 inscribed in regtest, CBOR verified on-chain, iframe renders correctly with piece 1's data
- ~~Build inscription 0 bundle~~ — DONE: build.js → index_bundle.html (93.4 KB uncompressed, rebuilt 2026-04-03 at 64d4e51)
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
