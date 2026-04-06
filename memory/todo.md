# Cessation — To Do

## Pre-Mint (Easter Sunday April 5 2026 — 2 days away as of 2026-04-03)
- **NEXT: Test window.PIECE bootstrap + /r/children/self locally using ord env**
  - Using laptop (Bitcoin Core syncing — was interrupted by power outage to desktop)
  - Need to install ord on laptop, configure regtest, do test inscriptions
- Replace hardcoded hash tail `88` and unix timestamp `1704067200` with real chain values
- Inscribe piece 0
- Immediately inscribe piece 1 as child with dataset in metadata
- ~~Build inscription 0 bundle~~ — DONE: build.js → index_bundle.html (93.4 KB uncompressed, rebuilt 2026-04-03 at 64d4e51)
- ~~Strip dev console API~~ — DONE: DEV_START/DEV_END markers, only F/R/S remain for collectors
- ~~Decide on Brotli compression~~ — DONE: not compressing
- ~~Source Nakamoto sat for piece 0~~ — DONE: 2009-01-31 sat acquired
- ~~Add final (29th) dataset~~ — DONE: 2026-03-20 dataset added
- ~~Data audit complete~~ — DONE: all metrics wired meaningfully as of 2026-03-22
- ~~Source and hold 29 Omega black uncommon sats~~ — DONE
- ~~Lock visual system~~ — DONE: sat=0.92+0.08*ab, bri=0.25+0.65*value, u_co2Norm fixed, tracker synced (9ee8fe5)

## Blockchain Integration (both projects)
- Replace hardcoded hash tail `88` and unix timestamp `1704067200` with real chain values at mint
- Wire lifespan, decay nudges, and beam hue nudges to actual hash derivation
- Display real mint status per piece (currently hardcoded "not yet minted")

## Lifecycle Engine — Built (2026-03-22)
Core logic implemented in main.js. One remaining item before mint:
- ~~CBOR decoder~~ — DONE
- ~~Network layer~~ — DONE
- ~~LifecycleState (lc) + initLifecycle()~~ — DONE
- ~~Block polling (60s), lcTick() per-frame~~ — DONE
- ~~Uniforms wired to lc~~ — DONE
- ~~Void detection~~ — DONE
- ~~Living collection (lc.collectionDatasets)~~ — DONE
- ~~Frozen partner rule~~ — DONE
- ~~window.PIECE fast init~~ — DONE
- ~~Autonomous new-mint propagation (lcRefreshSiblings)~~ — DONE

## Tracker — Color Identity (pending)
- Replace single `hex` color (glucose/potassium/eGFR) with two representative colors per piece
  - `hex1` = circular mean of 8 ECG field hues
  - `hex2` = circular mean of 9 lab field hues
  - PieceCard thumbnail: `linear-gradient(135deg, hex1, hex2)`
  - Rationale: 17-field system has no single dominant color; ECG/lab split reflects actual canvas structure

## Tracker — Data & Shader Sync
- health_data_sets.js and decay_logic.js are manual copies — divergence risk if main project data changes
- Shaders (fragment.glsl, vertex.glsl) are also manual copies — same risk

## Tracker — Hiro API / Mint Data
- Mint status badges per piece
- Block explorer links
- Actual inscription timestamps and hash tails once minted
