# Wallets — Hot & Cold (mainnet)

Source of truth for the wallets used to inscribe Cessation. Verified live against the
node on 2026-08-13. Supersedes all older wallet notes (see "Deprecated" below).

> **File-level recheck 2026-09-06** (node not started, so UTXO contents below are still
> the 2026-08-13 audit): both wallet files present and SQLite —
> `/Volumes/Bitcoin/Bitcoin/ord/wallet.dat` (389 KB) and `.../ord-cold/wallet.dat`
> (73 KB), both modified 2026-08-30. Node last ran 2026-08-31. ord index is now **405 GB**
> (`index.redb` plus three `.old` backups), not the 176 GB noted below — the external
> volume has **491 GB free**, so the backups are worth pruning before a re-index.
>
> **Two blocking gaps found on 2026-09-06, see [todo.md](todo.md):**
> 1. **`PIECE_SATS` in `inscribe.js` lists the OLD v1/v2 sats** — zero overlap with the
>    cold wallet's holdings below. A re-mint run would target already-stacked sats and
>    the null-check would not catch it.
> 2. **8 rare sats held, 31 needed** (30 pieces + engine). Short by 23.

## Context
The **entire collection is being re-inscribed** because the engine code has multiple
bugs (see `inscription_architecture.md` → "Code Bugs" + "Inscription Failure History").
New rare sats are being purchased specifically for this fresh re-mint and parked in the
**cold wallet** until mint time.

## The node
- Full mainnet Bitcoin Core node. **Data dir: `/Volumes/Bitcoin/Bitcoin`** (807 GB blocks,
  on the external "Bitcoin" volume — must be mounted).
- Config `/Volumes/Bitcoin/Bitcoin/bitcoin.conf`: `txindex=1`, `server=1`,
  `rpcuser=bitcoin`, `rpcpassword=bitcoin`, plus an `assumevalid` for fast sync.
- Start: `bitcoind -datadir=/Volumes/Bitcoin/Bitcoin -daemon`
- Query: `bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin <cmd>` (add `-rpcwallet=<name>`)
- Stop: `bitcoin-cli -datadir=/Volumes/Bitcoin/Bitcoin stop`
- Both wallets live in the datadir root (no `wallets/` subdir): `loadwallet ord`,
  `loadwallet ord-cold` after start.
- ord's own data dir is separate: `/Volumes/Bitcoin/Ord` (`index.redb` ~176 GB,
  `wallets/ord.redb`). `ord2.sh` wraps ord with mainnet RPC + this data dir + `--index-sats`.

## Hot wallet — `ord`
- Bitcoin Core wallet `ord` at `/Volumes/Bitcoin/Bitcoin/ord/wallet.dat`.
- Role: the **inscribing wallet**. Holds fee sats + the carrier UTXOs; `ord wallet inscribe`
  runs against it. Rare sats get moved here from the cold wallet right before each inscription.
- As of 2026-08-13: ~217,767 sats across 37 UTXOs — one ~178,544-sat fee UTXO plus a large
  cluster of 546/330-sat carrier outputs (mostly from fan-out tx `5d643a3ed027…`).

## Cold wallet — `ord-cold`  ⭐ holds the new rare sats
- Bitcoin Core wallet `ord-cold` at `/Volumes/Bitcoin/Bitcoin/ord-cold/wallet.dat`.
- **Purpose: cold storage for the newly-bought rare sats for the re-mint.** Each of its
  UTXOs is a rare sat. Keep sats here until mint time, then transfer the needed one to `ord`.
- As of 2026-08-13: 8 UTXOs / 4,081 sats. **Contents confirmed via `ord list` + `ord traits`
  (2026-08-13):** 7 Omega black uncommons + 1 Nakamoto-era range. In each carrier UTXO the
  **rare sat sits at offset 0** (first sat of the UTXO); the rest is common padding.

### The rare sats (confirmed)
**Omega / Black Uncommon defined:** the **last satoshi created in the coinbase of a block** —
the closing sat of the block's transaction set. Properties: (1) always ends in **at least 8
nines**; (2) always exactly **one sat less than an Alpha** (an Alpha = the *first* coinbase sat
of a block). "Omega" and "Black Uncommon" refer to the same sat.

**Note on ord & rarity:** ord's rarity enum only covers *alpha* sats (uncommon = **first** sat
of a block, etc.), so it labels an Omega/Black Uncommon `common`. Verify instead by:
`offset_in_block == subsidy−1`, the sat number ending in ≥8 nines, and `sat+1` being the next
block's Alpha (`ord traits` → `rarity: uncommon`, `offset: 0`). The **Nakamoto sat** is likewise
not an ord rarity — a 907-sat range from 2009 Satoshi-era block 2485, valued for provenance, not
block position; note it does **not** end in 8 nines, confirming it is not an Omega.

| UTXO (txid:vout) | UTXO sats | rare sat # | ord name | block | type |
|---|---|---|---|---|---|
| b9c746591981…:0 | 907 | 12425429610010 (range → …610916) | ntlqhrjbmxb | 2485 | **Nakamoto-era** (2009-01-31) — for genesis/engine |
| d0048b4fa871…:32 | 546 | 1933312499999999 | adrejuehvqo | 783299 | Omega black uncommon |
| d0048b4fa871…:20 | 546 | 1934694999999999 | adkoglpialm | 785511 | Omega black uncommon |
| d0048b4fa871…:14 | 546 | 1946032499999999 | abigrncmehu | 803651 | Omega black uncommon |
| d0048b4fa871…:8  | 546 | 1952159999999999 | aaexuaaadws | 813455 | Omega black uncommon |
| 374244fe6082…:1 | 330 | 1621369999999999 | cjcytrkpena | 457095 | Omega black uncommon (12.5 BTC epoch) |
| b6bee748d138…:1 | 330 | 1459982499999999 | dmvuhsnspyo | 373992 | Omega black uncommon (25 BTC epoch, 2015) |
| 1c93fb759ca7…:1 | 330 | 1960022499999999 | ytgwcbgmcw  | 826035 | Omega black uncommon |

Addresses (receive, for reference): `:32` bc1pu7untfuv…shlc40, `:20` bc1p5cwxtxn…w7p6jj,
`:14` bc1plt6qe3v…tcsj0d, `:8` bc1pnps8rhv…gkutek, `907` bc1pxn7hawec…z7nshk, and the three
330-sat UTXOs all sit on `bc1pqzckzwqz2rye72t7lw5w0utjl2lrurqyv67f9z5ptgzxz00rrweqy3rk95`.

Four of the black uncommons (adrejuehvqo, adkoglpialm, abigrncmehu, aaexuaaadws) match the
"Spare BUs in wallet (4)" note in `inscribe.js` — "BU" = Black Uncommon. The other three
(cjcytrkpena, dmvuhsnspyo, ytgwcbgmcw) are additional, more recent buys; dmvuhsnspyo (2015,
25-BTC epoch) and cjcytrkpena (12.5-BTC epoch) are from older/scarcer epochs.

## Deprecated / stale
- **UniSat wallet — NO LONGER USED going forward.** It was the original off-node source for
  the first mint's sats. Ignore all UniSat references in `MEMORY.md` / older notes.
- Old addresses in `inscription_architecture.md` ("Sat Inventory as of 2026-06-06",
  `bc1p36tnmumxf9q…` holding, `bc1purcsf4pxtz…` fees) are **stale** — those sats have moved
  and belong to the abandoned earlier mint attempts. Not the current wallet set.
- Two failed inscription collections (v1, v2) were moved to a "trash wallet" — separate, not
  for reuse.
