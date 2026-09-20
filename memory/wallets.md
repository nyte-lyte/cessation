# Wallets — Hot & Cold (mainnet)

Source of truth for the wallets used to inscribe Cessation. Verified live against the
node on 2026-08-13. Supersedes all older wallet notes (see "Deprecated" below).

> **Re-verified live 2026-09-06 against the node at tip 965827** (`ibd=false`,
> `pruned=false`, progress 100%). Everything below still holds:
>
> - **`ord-cold`: all 8 UTXOs present and unspent, 4,081 sats, amounts unchanged, no
>   extras.** Confirmations 9,984–13,086 — every one predates the 2026-08-13 audit and
>   has not been touched since. A UTXO's sats cannot change without spending it, so the
>   7 Omega black uncommons and the Nakamoto-era range are intact. (Sat *numbers* were
>   not re-derived; that needs the ord index caught up, and the untouched outpoints make
>   it unnecessary.)
> - **`ord`: 37 UTXOs / 217,767 sats**, unchanged.
> - Wallet files both SQLite, modified 2026-08-30; node had last run 2026-08-31 and was
>   ~980 blocks behind on startup.
> - ord index is now **405 GB** (`index.redb` plus three `.old` backups), not the 176 GB
>   noted below — the volume has **491 GB free**, so the backups are worth pruning before
>   any re-index.
> - **Core upgraded 30.2 -> 31.1_1 the same day**, after this verification. Wallet
>   backups taken first to `~/bitcoin-wallet-backups/2026-09-06-pre-core31/` (both
>   wallets plus UTXO snapshots). Node restarted on 31.1.0: chain fine (`pruned=false`,
>   `ibd=false`), both wallets reloaded with no warning, and both UTXO sets came back
>   **byte-identical** to the pre-upgrade snapshot. Only startup notice was the
>   non-fatal "Incompatible old fee estimation data", expected on a version change.
>   See [testing.md](testing.md) on why: `--no-backup` is no longer needed.
>
> **Sat assignment settled 2026-09-06 — `inscribe.js` rewritten to match:**
> - **Engine → `1459982499999999`** (dmvuhsnspyo, Omega black uncommon, block 373992,
>   2015 / 25-BTC epoch — the oldest Omega held). Inscribed by hand, not by the script.
> - **Every piece → a Nakamoto-era sat, oldest first:** piece N takes
>   `12425429610010 + N`, drawn from the 907-sat range in UTXO `b9c746591981…:0`
>   (block 2485, 2009-01-31). Piece 0 = `…610010`, piece 29 = `…610039`.
> - The old `PIECE_SATS` table listed the **v1/v2 sats** — already carrying three stacked
>   inscriptions — and every entry was non-null, so the old "is it filled in?" check would
>   have waved a re-inscription straight onto them. Replaced by a derived
>   `satForPiece(index)` with a hard range bound; nothing is hand-typed per piece.
> - The six remaining Omegas (cjcytrkpena, adrejuehvqo, adkoglpialm, abigrncmehu,
>   aaexuaaadws, ytgwcbgmcw) stay unassigned in `ord-cold`.
>
> **Correction:** an earlier note here said "8 rare sats held, 31 needed — short by 23."
> That was wrong. It counted the Nakamoto entry as one sat; it is a **907-sat range**, so
> it covers 907 pieces. There is no shortfall, and the open-ended collection has room to
> grow for as long as the range lasts.

## Context

**Procedure for actually inscribing: [inscribe.md](inscribe.md).**
The **entire collection is being re-inscribed** because the engine code has multiple
bugs (see `inscription_architecture.md` → "Code Bugs" + "Inscription Failure History").
New rare sats are being purchased specifically for this fresh re-inscription and parked in the
**cold wallet** until inscription time.

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
- **Purpose: cold storage for the newly-bought rare sats for the re-inscription.** Each of its
  UTXOs is a rare sat. Keep sats here until inscription time, then transfer the needed one to the **fresh v3 wallet** — NOT `ord`, which holds v1/v2 (inscribe.md §7c).
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

## Inscribing wallet — `ord-v3`  ⭐ v3 inscribes FROM here

**Created, encrypted and funded 2026-09-18.** This entry was missing until 2026-09-20,
and its absence caused a real error: another session read this file, concluded the
wallet still had to be created, and would have run `ord wallet create` against a funded
wallet. If you add a wallet, add it here.

- Bitcoin Core descriptor wallet at `/Volumes/Bitcoin/Bitcoin/ord-v3/wallet.dat`
  (12 KB). Taproot-only, 2 descriptors — created by `ord wallet create`, so ord will
  drive it (unlike `ord-cold`, see below).
- **ENCRYPTED.** `getwalletinfo` shows `unlocked_until`. Signing needs
  `bitcoin-cli -rpcwallet=ord-v3 walletpassphrase "<pass>" <secs>` first; reads work
  locked. Verified on regtest that ord honours this (inscribe.md §7d).
- **Mnemonic written down offline, BIP39 passphrase empty.** Record "passphrase: none"
  alongside it — restore tools always prompt, and entering one derives a different
  empty wallet rather than failing.
- **Two different things are both called "passphrase" here. Do not conflate them.**
  (1) the **BIP39** passphrase — the optional 25th word on the seed. Yours is EMPTY;
  `ord wallet create` prints it as `"passphrase": ""`. (2) the **Core encryption**
  passphrase, set separately with `encryptwallet`, required by `walletpassphrase`
  before signing. These are unrelated, and mistaking (1) for (2) cost a session on
  2026-09-20. The encryption passphrase is NOT recorded in this repo — the repo is
  **public** (github.com/nyte-lyte/cessation). Keep it wherever the mnemonic lives.
- **`encryptwallet` did NOT regenerate the seed, despite what it says.** It returns a
  fixed string ending *"a new HD seed was generated. You need to make a new backup"*.
  That is boilerplate, not a report. Verified 2026-09-20: `ord-v3` still carries ord's
  own **2 taproot-only descriptors on BIP86 (86h/0h/0h)** with the original fingerprint
  `5281c2de`, still deriving the addresses holding the funds. Had Core re-run its own
  descriptor setup it would have produced its standard **8** descriptors across
  `pkh`/`sh`/`wpkh`/`tr` — which is exactly what `ord-cold` shows, so the contrast is
  visible on this machine. **The mnemonic remains valid and the backup is good.**
  To check this on any wallet: `listdescriptors` — 2 `tr` on 86h = ord's import
  survived; 8 across four paths = Core replaced them.
- **How to tell if a wallet is encrypted at all**, rather than guessing from fields:
  `walletlock` succeeds on an encrypted wallet and fails with `-15 running with an
  unencrypted wallet` otherwise. `getwalletinfo`'s `unlocked_until` is present only
  when encrypted, but the A/B on `walletlock` is unambiguous.
- **Backed up** to `~/wallet-backups/ord-v3-backup.dat`, and the backup is
  restore-VERIFIED: restored under a temp name, came back encrypted with the same
  master fingerprint `5281c2de` and the same 2 descriptors.
- **Balance: 101,300 sat**, swept from `ord`'s cardinal side 2026-09-18
  (txid `74485ab7…03d8`, 341 vB, 1.01 sat/vB). Covers the engine plus 31 pieces at
  1 sat/vB with roughly 2.3x margin.
- **What it will hold:** the v3 engine, PERMANENTLY — ord spends and re-creates the
  parent on every child inscription, so it must stay here or the collection can never
  grow — plus whichever carrier is in flight. Never two carriers at once.

### Why `ord-cold` cannot be the inscribing wallet

It is a Core-native wallet with 8 descriptors (`pkh`/`sh`/`tr`/`wpkh`). ord refuses it:
*"contains unexpected output descriptors, and does not appear to be an `ord` wallet"*.
Carriers therefore move out of it by raw transaction — `node peel.js handoff` — not by
`ord wallet send`. See inscribe.md §7c.

### All three wallets, at a glance (2026-09-20)

| wallet | role | encrypted | backed up | balance |
|---|---|---|---|---|
| `ord` | archive: v1/v2, 90 inscriptions across 32 outputs | no | yes | 35,922 sat (all ordinal) |
| `ord-cold` | storage: 160 locked carriers | no | yes | 111,052 sat |
| `ord-v3` | **inscribes v3** | **yes** | yes, restore-verified | 101,300 sat |

`ord` and `ord-cold` have **no mnemonic recorded** — their `.dat` backups are the only
route back in, and those backups are unencrypted copies of the keys.

## Deprecated / stale
- **UniSat wallet — NO LONGER USED going forward.** It was the original off-node source for
  the first inscription run's sats. Ignore all UniSat references in `MEMORY.md` / older notes.
- Old addresses in `inscription_architecture.md` ("Sat Inventory as of 2026-06-06",
  `bc1p36tnmumxf9q…` holding, `bc1purcsf4pxtz…` fees) are **stale** — those sats have moved
  and belong to the abandoned earlier inscription attempts. Not the current wallet set.
- Two failed inscription collections (v1, v2) were moved to a "trash wallet" — separate, not
  for reuse.
