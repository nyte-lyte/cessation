# Inscription Architecture

## Living Collection — Dynamic Sibling Discovery (PREFERRED)
Rather than hardcoding sibling datasets into each piece at mint time, every piece is inscribed as a **child of inscription 0**. This creates an on-chain family tree.

At runtime, any piece can call `/r/children/{inscription_0_id}` to discover ALL siblings — including ones minted after it. Then for each sibling it calls `/r/metadata/{sibling_id}` to fetch their health dataset.

This means:
- Piece 1 minted in month 3 will automatically know about piece 27 minted in year 7
- No hardcoding, no manual updates to existing pieces
- New pieces automatically shift the min/max and rendering of all existing pieces
- Fully trustless and on-chain — the chain does the work

**Runtime flow:**
1. Piece loads, calls `/r/children/{inscription_0_id}` → gets all sibling IDs
2. For each sibling, calls `/r/metadata/{sibling_id}` → gets their dataset
3. Builds full collection, computes min/max from all known pieces
4. Renders — aware of the entire living collection

**Reanimation runtime flow (extends above):**
5. Read current block height → determine which lifecycle cycle the piece is in
6. Identify partner by piece number from sibling list (pairing: (0,1), (2,3)...)
7. Partner dataset already fetched in step 2 via `/r/metadata/{partner_id}`
8. Compute blended dataset from own + partner datasets
9. Compute karma from blend → check against 25th percentile of all sibling karmas → determine if liberated
10. Each cycle's lifespan derived from the hash of the previous cessation block (`/r/blockinfo/{cessation_height}`)
11. Frozen partner rule: if partner is piece 0 (no reanimation) or has already liberated, use partner's last known dataset as permanent anchor

**At mint time**, each piece stores its health dataset in the ordinals **metadata field** (CBOR format) — a dedicated machine-readable slot accessible via `/r/metadata/{id}`. The HTML payload stays clean.

## Structure
- **Inscription 0** — genesis piece. Holds the entire rendering engine:
  - fragment.glsl + vertex.glsl inlined
  - main.js (all helpers, beam configs, decay logic) inlined
  - No inherited hue (genesis), no partner piece, no reanimation
- **Pieces 1–N** — thin HTML payload + reference back to inscription 0

## Per-Piece Payload
Each piece after 0 is inscribed as a small HTML file:
```html
<script>
  const PIECE = {
    datasetIndex: 5,
    dataset: { /* this piece's own ECG/lab data */ },
    hashTail: 62,
    inscriptionUnix: 1741234567,
    inheritedHueDeg: 218.4,
  };
</script>
<script src="/content/{inscription_0_id}"></script>
```

The dataset is also stored in the inscription's metadata field (CBOR) so siblings can fetch it via `/r/metadata/{id}`. No sibling array needed in the payload — discovery happens dynamically at runtime.

**CRITICAL: the `dataset` field must be present in the CBOR metadata of every child inscription.** The engine's sibling discovery reads `m.dataset` from each sibling's metadata to build `lc.collectionDatasets` — the dynamic collection that drives `getAgedDataset`, `applyCollectionInfluence`, and all percentile calculations. If `dataset` is absent from a child's metadata, the engine falls back to the local `healthDataSets[idx]` entry for that piece, but new pieces minted after inscription 0 have no local fallback and will be silently excluded from the collection influence. A child inscription without `dataset` in its metadata is invisible to the living collection.

## Boot Logic
Inscription 0 checks for `window.PIECE` on load:
- If absent → piece 0, genesis defaults
- If present → use PIECE.hashTail, PIECE.inscriptionUnix, PIECE.inheritedHueDeg, fetch all siblings dynamically

## Min/Max — Living Collection (INTENTIONAL)
- Min/max is NOT frozen. Each piece computes it dynamically from all sibling datasets.
- New pieces shift the color/percentile relationships of all existing pieces.
- By design — a new lifespan entering affects all the others.

## Ord CLI — Key Commands

**Inscribe piece 0 (genesis, no parent):**
```bash
ord wallet inscribe --fee-rate <FEE_RATE> --file index.html --json-metadata dataset.json
```

**Inscribe piece N (child of inscription 0):**
```bash
ord wallet inscribe --fee-rate <FEE_RATE> --parent <INSCRIPTION_0_ID> --file piece.html --json-metadata dataset.json
```

**CRITICAL: `--parent` must be declared at mint time — cannot be added retroactively.**

## Metadata Format
- Stored as CBOR (tag 5), accessible via `/r/metadata/{id}`
- CLI flag: `--json-metadata <file>` for single inscriptions
- 520 byte limit per data push — auto-concatenated if split, larger datasets still work
- Response is hex-encoded CBOR — client must decode

## Blockhash On-Chain
- `/r/blockinfo/{height_or_hash}` returns full block data including `hash`
- Hash tail readable directly on-chain — no external lookup needed
- Use `/r/inscription/self` → `height` field to get own block, then fetch that block

## Pagination
- `/r/children/{id}/inscriptions/{page}` — 100 per page
- Check `more` boolean in response to determine if more pages exist
- Must loop through all pages once collection exceeds 100 pieces
- Children returned in deterministic blockchain order — guaranteed stable

## Self Keyword
- Inscription 0 uses `/r/children/self/inscriptions/0` to list all children without knowing its own ID
- Also works for: `/r/inscription/self`, `/r/metadata/self`, `/r/parents/self`

## Mint Day Checklist (per piece)
1. Take new ECG/lab snapshot
2. Compute inheritedHueDeg from piece N-1's glucose hue
3. Prepare dataset JSON for metadata field
4. Inscribe with `--parent {inscription_0_id}` and `--json-metadata dataset.json`
5. Bitcoin returns blockhash and timestamp
6. Extract hashTail from last two hex chars of blockhash (convert to 0-99)
7. Blockhash also readable on-chain via `/r/blockinfo/{height}`
8. Update tracker: swap HASH=88 and inscriptionUnix placeholders in PieceViewer.tsx

## Collection Growth
- New piece every ~3 months as new ECG/lab data is taken
- Partner pairing: (0,1), (2,3)... — piece 0 has no partner
- Inherited hue computed at mint time from piece N-1's glucose hue, hardcoded into payload
