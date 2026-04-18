# Inscription Architecture

## Current Architecture (as of 2026-04-11 — regtest verified)

Two-inscription model. Engine and pieces are separate inscriptions.

### Engine inscription
- File: `index_bundle.js` (text/javascript)
- Inscribed once, no parent, no metadata
- Holds the entire rendering engine: shaders, main.js, health_data_sets.js, decay_logic.js, CSS, DOM creation
- Creates its own DOM (canvas-container, canvas) and injects CSS as a style element
- Reads piece parameters from `document.currentScript` attributes

### Piece inscriptions (all 29)
- All pieces are thin HTML files (~300 bytes)
- Each loads the engine via `<script src="/content/{engineId}">`
- Piece params passed as HTML attributes on the script tag: `t` (pieceIndex), `ht` (hashTail), `unix` (inscriptionUnixSeconds), `hue` (inheritedHueDeg), `block` (blockHeight)
- Example:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}</style></head><body><script t="1" ht="61" unix="1775938686" hue="321.4286" block="204" src="/content/{engineId}"></script></body></html>
```
- Piece 0: `t="0"`, no parent at inscribe time (genesis piece)
- Pieces 1+: inscribed with `--parent {piece0Id}` — makes them children of piece 0

### Engine boot logic (`document.currentScript`)
The engine reads params synchronously at load time:
```js
const _selfScript = document.currentScript;
```
- `_selfScript` null → piece 0 loading itself directly as text/javascript (shouldn't happen in prod)
- `_selfScript` set → child HTML loaded it as `<script src>`, reads `t/ht/unix/hue/block` attributes
- `main.js` uses these to set `currentDataSetIndex`, `lc.pieceIndex`, `lc.hashTail`, `inscriptionUnixSeconds`, `inheritedHueDegOverride` synchronously before any async calls

### Sibling discovery (living collection)
- Pieces 1+ are children of piece 0 via `--parent`
- At runtime, engine calls `/r/children/{piece0Id}` to discover ALL siblings
- For each sibling, fetches `/r/metadata/{sibling_id}` to get their health dataset (CBOR)
- Builds `lc.collectionDatasets` — drives `getAgedDataset`, `applyCollectionInfluence`, percentile calculations
- New mints automatically propagate via `lcRefreshSiblings()` on every block poll — no reload needed

## Mint Sequence

```bash
# 1. Inscribe engine (once, text/javascript)
ord wallet inscribe --fee-rate <FEE> --file index_bundle.js
# → engineId

# 2. Generate piece 0 HTML
node mint.js 0 <blockHash> <blockTimestamp> <engineId> <blockHeight>
# → dist/cessation_piece_00.html + dist/cessation_piece_00_metadata.json

# 3. Inscribe piece 0 (no parent, with metadata)
ord wallet inscribe --fee-rate <FEE> --file dist/cessation_piece_00.html --json-metadata dist/cessation_piece_00_metadata.json
# → piece0Id

# 4. Generate piece N HTML (N = 1..28)
node mint.js N <blockHash> <blockTimestamp> <engineId> <piece0Id> <blockHeight>
# → dist/cessation_piece_0N.html + dist/cessation_piece_0N_metadata.json

# 5. Inscribe piece N (--parent piece0Id)
ord wallet inscribe --fee-rate <FEE> --parent <piece0Id> --file dist/cessation_piece_0N.html --json-metadata dist/cessation_piece_0N_metadata.json
```

**CRITICAL: `--parent` must be declared at mint time — cannot be added retroactively.**

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

## Thumbnail Gradients
- Each piece HTML has body `background:#000` (always)
- The gradient background for piece 0 standalone viewing is baked via `BAKE:PREVIEW_GRADIENT` marker in the engine — replaced by `mint.js` with `CUSTOM_GRADIENTS[0]`
- Tracker-matched gradients in `CUSTOM_GRADIENTS` in `mint.js`

## Min/Max — Living Collection (Intentional)
- Min/max is NOT frozen at mint time
- Each piece computes it dynamically from all sibling datasets
- New pieces shift the color/percentile relationships of all existing pieces
- By design — a new lifespan entering affects all the others

## Collection Growth
- New piece every ~3 months as new ECG/lab data is taken
- Partner pairing: (0,1), (2,3)... — piece 0 liberates directly (no karma check)
- Inherited hue computed at mint time from piece N-1's glucose hue, baked into `hue` attribute
