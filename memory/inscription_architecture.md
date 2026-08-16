# Inscription Architecture

## Current Architecture (as of 2026-04-11 — regtest verified)

Two-inscription model. Engine and pieces are separate inscriptions.

### Engine inscription
- File: `index_bundle.js` (text/javascript)
- Inscribed once, no parent, no metadata
- Holds the entire rendering engine: shaders, main.js, health_data_sets.js, decay_logic.js, CSS, DOM creation
- Creates its own DOM (canvas-container, canvas) and injects CSS as a style element
- Reads piece parameters from `document.currentScript` attributes

### Piece inscriptions (every piece)
- All pieces are thin HTML files (~300 bytes)
- Each loads the engine via `<script src="/content/{engineId}">`
- Piece params passed as HTML attributes on the script tag: `t` (pieceIndex), `ht` (hashTail), `unix` (inscriptionUnixSeconds), `hue` (inheritedHueDeg), `block` (blockHeight)
- Example:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}</style></head><body><script t="1" ht="61" unix="1775938686" hue="321.4286" block="204" src="/content/{engineId}"></script></body></html>
```
- **Every piece inscribed with `--parent {engineId}`** — engine is the root inscription
- Piece 0 is the genesis art piece, not the inscription parent

### Engine boot logic (`document.currentScript`)
The engine reads params synchronously at load time:
```js
const _selfScript = document.currentScript;
```
- `_selfScript` null → piece 0 loading itself directly as text/javascript (shouldn't happen in prod)
- `_selfScript` set → child HTML loaded it as `<script src>`, reads `t/ht/unix/hue/block` attributes
- `main.js` uses these to set `currentDataSetIndex`, `lc.pieceIndex`, `lc.hashTail`, `inscriptionUnixSeconds`, `inheritedHueDegOverride` synchronously before any async calls

### Sibling discovery (living collection)
- All pieces are children of the engine via `--parent {engineId}`
- At runtime, engine calls `/r/children/{engineId}` to discover ALL siblings
- Engine extracts engineId from `document.currentScript.src` — same for every piece
- For each sibling, fetches `/r/metadata/{sibling_id}` to get their health dataset (CBOR)
- Builds `lc.collectionDatasets` — drives `getAgedDataset`, `applyCollectionInfluence`, percentile calculations
- New mints automatically propagate via `lcRefreshSiblings()` on every block poll — no reload needed

## Mint Sequence

```bash
# 1. Inscribe engine on the Nakamoto sat (once, text/javascript, no parent)
ord wallet inscribe --fee-rate <FEE> --sat 12425429610918 --file index_bundle.js
# → engineId  (engine sits on last sat of UTXO ccab20ce:0, block 2485)

# 2. Generate piece HTML (same command for every piece)
node mint.js <N> <blockHash> <blockTimestamp> <engineId> <blockHeight>
# → dist/cessation_piece_0N.html + dist/cessation_piece_0N_metadata.json
# mint.js errors if PIECE_SATS[N] is not filled in

# 3. Inscribe piece (every piece uses --parent engineId, --sat from PIECE_SATS)
ord wallet inscribe --fee-rate <FEE> --sat <satNumber> --parent <engineId> --file dist/cessation_piece_0N.html --json-metadata dist/cessation_piece_0N_metadata.json
```

**CRITICAL: `--parent` must be declared at mint time — cannot be added retroactively.**
**CRITICAL: Fill in `PIECE_SATS` in mint.js before running — wrong sat = permanently wrong sat.**

## Sat Inventory (in ord wallet as of 2026-06-06)

> ⚠️ **STALE (2026-08-13):** this inventory and the two addresses below belong to an
> abandoned earlier mint attempt — those sats have moved. Current wallets are documented
> in `memory/wallets.md` (hot `ord` + cold `ord-cold`). New rare sats for the re-mint live
> in the `ord-cold` cold wallet. Kept here only for historical reference.

All sats held at receive address `bc1p36tnmumxf9qz0z9umufgra27qs4ee9spav9qarwu7m7cqjzhewys6v30sm`.
Plus 2 funding UTXOs (10,350 sats common) at `bc1purcsf4pxtznjha05mgpp229q7eqe9erynqp990rvkf5dhpwx0tzqmuasvt` for inscription fees.

**1 Nakamoto-era UTXO** (909 sats from Satoshi-era block 2485 — **engine inscribed on sat 12425429610918**, the last sat of the range):

| Name | Sat # | Block | UTXO | Size | Offset |
|---|---|---|---|---|---|
| ntlqhrjbmxb | 12425429610010 | 2485 | ccab20ce9075c7...:0 | 909 | 0 (range start) |

**34 Black Uncommon sats** (last sat of block; the next sat is uncommon):

| Name | Sat # | Block | UTXO | Size | Offset |
|---|---|---|---|---|---|
| ggaofldnaso | 1073492499999999 | 219396 | 5ec2e32a13fbac...:0 | 330 | 329 |
| geegozsvhly | 1083577499999999 | 223430 | 266671f0e01187...:3 | 546 | 0 |
| gasmtandsqk | 1102322499999999 | 230928 | 33c1f44521bbb8...:1 | 546 | 545 |
| fswrmtkmsde | 1144884999999999 | 247953 | 266671f0e01187...:7 | 546 | 545 |
| fpdqkiwtjgc | 1165149999999999 | 256059 | af3e7cd733214a...:1 | 330 | 0 |
| fdzzclsqgnq | 1225639999999999 | 280255 | 930fdd98313e68...:0 | 1600 | 600 |
| fcebtbyphkc | 1235642499999999 | 284256 | 266671f0e01187...:4 | 546 | 0 |
| ezyfkmhfbio | 1247724999999999 | 289089 | 33c1f44521bbb8...:0 | 546 | 545 |
| eyourxqckxm | 1255119999999999 | 292047 | 86e744eac81ac8...:0 | 330 | 329 |
| ewsmtjurgus | 1265207499999999 | 296082 | 266671f0e01187...:8 | 546 | 545 |
| esopiujojcc | 1287739999999999 | 305095 | 266671f0e01187...:5 | 546 | 0 |
| epptzdzeziw | 1303782499999999 | 311512 | 86e744eac81ac8...:1 | 330 | 329 |
| eodakrzsxew | 1311874999999999 | 314749 | 86e744eac81ac8...:3 | 330 | 329 |
| eoceaafyvvu | 1312054999999999 | 314821 | 86e744eac81ac8...:2 | 330 | 329 |
| eiqhfztjjyo | 1341682499999999 | 326672 | af3e7cd733214a...:0 | 330 | 329 |
| djxqrjryauc | 1475882499999999 | 380352 | af3e7cd733214a...:4 | 546 | 0 |
| dbtaiujpvdq | 1520284999999999 | 398113 | 3d9befa8398e45...:1 | 546 | 0 |
| dbrvfnaybyg | 1520534999999999 | 398213 | 3d9befa8398e45...:0 | 546 | 0 |
| dahbajgrwjq | 1528214999999999 | 401285 | af3e7cd733214a...:5 | 546 | 0 |
| ctrlbuazpyg | 1564052499999999 | 415620 | 3d9befa8398e45...:2 | 546 | 0 |
| cedznsnbrdq | 1648302499999999 | 478641 | 266671f0e01187...:2 | 546 | 0 |
| cbevdkdbery | 1664417499999999 | 491533 | af3e7cd733214a...:2 | 330 | 0 |
| beqznfjhipm | 1786754999999999 | 589403 | 266671f0e01187...:0 | 546 | 0 |
| bbbsmbaumcw | 1806232499999999 | 604985 | 3d9befa8398e45...:4 | 546 | 0 |
| avndjbdkrqw | 1836424999999999 | 629139 | 3d9befa8398e45...:6 | 546 | 0 |
| arrnapijeso | 1857229999999999 | 661567 | 266671f0e01187...:6 | 546 | 0 |
| ajyzbtminrm | 1899107499999999 | 728571 | 3d9befa8398e45...:7 | 546 | 0 |
| afnovbhsioo | 1923204999999999 | 767127 | 3d9befa8398e45...:5 | 546 | 0 |
| afeksbckasw | 1925117499999999 | 770187 | 3d9befa8398e45...:8 | 546 | 0 |
| adrzwervqle | 1933139999999999 | 783023 | 266671f0e01187...:1 | 546 | 0 |
| adrejuehvqo | 1933312499999999 | 783299 | 33c1f44521bbb8...:2 | 546 | 0 |
| adkoglpialm | 1934694999999999 | 785511 | 3d9befa8398e45...:9 | 546 | 0 |
| abigrncmehu | 1946032499999999 | 803651 | 3d9befa8398e45...:3 | 546 | 0 |
| aaexuaaadws | 1952159999999999 | 813455 | af3e7cd733214a...:3 | 546 | 0 |

Assignments (see `mint.js` PIECE_SATS for the full map):
- **Engine** → Nakamoto sat 12425429610918 (last sat of UTXO ccab20ce:0)
- **Pieces 0–28** → Black Uncommons in chronological-by-block order, starting from `ggaofldnaso` (block 219396) through `afeksbckasw` (block 770187)
- **5 spare BUs** in wallet for future pieces 29+: `adrzwervqle, adrejuehvqo, adkoglpialm, abigrncmehu, aaexuaaadws` (blocks 783023, 783299, 785511, 803651, 813455)

For future growth: chronological-by-block won't strictly hold — newly acquired BUs may come from any block. The 29 initial pieces lock the early chronology; later pieces just use whichever BU is acquired next.

Use `ord wallet inscribe --sat <sat_number>` — ord splits the host UTXO around the target sat automatically.

## Metadata Format
- Stored as CBOR, accessible via `/r/metadata/{id}`
- CLI flag: `--json-metadata <file>` for single inscriptions
- Response is hex-encoded CBOR — client must decode
- **Every child piece MUST have `dataset` in its metadata** — engine reads `m.dataset` from each sibling. Without it, the piece is invisible to the living collection.

## MIME Types
- Engine: `text/javascript` (ord infers from `.js` extension)
- All pieces: `text/html` (ord infers from `.html` extension)
- **Reason for separate engine**: `.js` inscriptions show as raw code in ord's preview UI. All piece `.html` files render correctly as art.

## Living Collection — Dynamic Sibling Discovery
- Each piece at runtime discovers all siblings by querying `/r/children/{piece0Id}`
- Fetches `/r/metadata/{sibling_id}` for each to get health datasets
- New pieces minted post-collection shift percentiles for ALL existing pieces automatically
- Piece 0 is permanently in the sibling list (genesis influences everything)
- Pagination: `/r/children/{id}/inscriptions/{page}` — 100 per page, check `more` boolean

## Self Keyword
- `/r/children/self/inscriptions/0` — piece 0 can list its children without knowing its own ID
- `/r/inscription/self`, `/r/metadata/self`, `/r/parents/self` also work

## Blockhash On-Chain
- `/r/blockinfo/{height_or_hash}` returns full block data including `hash`
- Lifespan derived from block hash at mint — the `block` attribute in the script tag gives height

## Min/Max — Living Collection (Intentional)
- Min/max is NOT frozen at mint time
- Each piece computes it dynamically from all sibling datasets
- New pieces shift the color/percentile relationships of all existing pieces
- By design — a new lifespan entering affects all the others
- **Confirmed implemented 2026-06-06**: this was the intended design all along, but the
  code didn't match it — `minMaxValues` was baked once at module load and never
  recomputed. Fixed via `computeMinMaxValues()`/`refreshMinMaxValues()` (mutates the
  object in place, called from `lcRefreshSiblings()` on new sibling data). Principle
  and implementation are now aligned. See `memory/living_collection_2026-06-06.md`.

## Collection Growth
- New piece every ~3 months as new ECG/lab data is taken
- Partner pairing: (0,1), (2,3)... — piece 0 liberates directly (no karma check)
- Inherited hue computed at mint time from piece N-1's glucose hue, baked into `hue` attribute
