# Plan — remove the baked dataset array from the engine

Written 2026-09-12. **Not started. No code changed.**

## The intent

> Each piece should hold its own dataset. There should be no datasets in the engine.
> The pieces talk to the engine on chain and get the instructions to function.
> — creator, 2026-09-12

The engine becomes **pure code**. A piece carries its own dataset in its CBOR metadata
(it already does) and discovers its siblings from the chain (it already does). The
engine's copy of the first 30 readings is redundant — the same data inscribed 31 times.

## Why this is worth doing

- **It kills a live bug by construction.** Every ECG-derived ranking currently ranks
  against the baked array and never re-ranks. See "The bug" below.
- **The engine stops being stale by design.** It carries a snapshot of the first 30
  readings, so it is out of date the moment piece 30 exists. Pure code never expires.
- **12.6% smaller.** The array is 12,655 bytes of a 100,143-byte bundle. At 1 sat/vB that
  is ~3,200 sats off every engine inscription, permanently.
- **A piece becomes genuinely self-contained** — the thing the architecture claims.

## The bug this fixes

`main.js` init computes these **once**, from the baked array, and never recomputes them
when the live collection resolves or grows:

| line | constant | consumed at |
|---|---|---|
| 401–405 | `allBunCreatRatios`, `bunCreatP05/P95` | 1503 — BUN/creatinine coupling |
| 407 | `sortedQtcValues` | 1401 — QTc percentile |
| 408–410 | `sortedPAxis/RAxis/TAxisValues` | 1403+ — form angles |
| 411 | `sortedVentRateValues` | 1436 |
| 412–413 | `sortedPRValues`, `sortedQRSValues` | — |
| 415–418 | `allQrsTAngles`, `qrsTAngleMin/Max`, `sortedQRSTAngleValues` | 1432, 1439 |

This is the **same class of bug** `1c80352` fixed for colour (`setHSBUniforms` on
glucose/potassium/eGFR). The ECG half was left behind.

**Invisible today** because the baked array equals the 30 pieces on chain. It diverges at
**piece 31**: colour re-ranks, geometry does not. Exactly what [todo.md](todo.md)
describes for live v2 — *"This one bites at piece 31."*

**The harness cannot see it.** `test/scale.test.mjs` has zero references to `qtc`,
`pAxis`, `ventRate`, `qrsT` or `bunCreat`; its `LAB_KEYS` are all labs, no ECG. Those
constants are closure variables inside `init()`, so `liftFromMainJs` cannot reach them.
The same architecture that makes them un-updatable makes them un-testable — which is why
14,064 passing checks did not catch it.

## The call sites — 4 groups

### Group 1 — the bug: init-time constants (lines 401–418)

Become functions of the live collection, recomputed when it changes.
`lcEffectiveCollection()` already returns the right array.

- Move each `sorted*Values` into a function taking `collection`, mirroring how
  `computeHSBFromStats(dataSet, datasets)` already takes its collection as an argument.
- Cache per collection-revision, not forever — `lc` already bumps on sibling refresh.
- **These must become reachable for the harness** (module-scope or exported), or the fix
  is as untestable as the bug.

### Group 2 — partner / inheritance fallbacks

| line | what it does |
|---|---|
| 479–481 | `allInheritedHues` precomputed across the baked array |
| 490 | `getPartnerInheritedHue` bounds-checks against `healthDataSets.length` |
| 671 | `lcGetPartnerDataset` falls back to baked |
| 787, 796 | inherited-hue lookup falls back to baked |
| 881, 925 | partner dataset falls back to baked |

All already have a live path first. **Delete the fallback, return null/0, and let the
existing null-handling run.** A partner that is not yet on chain is genuinely unknown —
substituting baked data invents an answer.

### Group 3 — `_lcMergedEntries` fallbacks (617–618, 631–636)

Today: unresolved collection seeds from the baked array.
Becomes: **the piece's own dataset alone** — a collection of one, which is already the
accepted state for piece 0. `lc.ownDataset` comes from its own CBOR.

Also `1302–1303` (`_initDs`) and `591`: fall back to `lc.ownDataset`, not baked.

### Group 1b — MORE of the same bug, found while checking group 4

I first filed these as dev plumbing. **Wrong** — they are live render-path bugs, the same
class as group 1. Verified 2026-09-12:

| line | function | called from |
|---|---|---|
| 1666, 1681 | `getBeamTempoSeconds(dataSet, beamId)` | beam animation |
| 1703, 1709 | `getBeamHueAnchorDeg(dataSet, beamId)` | `draw()` at 1211, 1224 |

Neither takes the collection as a parameter — both reach for the module-level
`healthDataSets` **inside the function body**, on every call:

```js
function getBeamTempoSeconds(dataSet, beamId) {
  const vals = healthDataSets.map(d => d.labs.nitrogen).sort((a, b) => a - b);
```

So **beam tempo and beam hue anchors also rank against the baked array**, not the live
collection — while the lab percentiles right beside them (1465, 1488) correctly use
`drawCollection`. The fix is the same: take the collection as an argument.

`winsorizedPercentileForLab` (1626) has `datasets = healthDataSets` as a **default
parameter**, and its real callers pass `drawCollection` explicitly. That one is fine —
the default just needs removing so a missing argument fails loudly instead of silently
using baked data.

### Group 4 — dev-mode plumbing (genuinely dev-only)

- `1528`, `1541`, `1554`, `1560` and the `window.changeDataset/next/prev` helpers
  (1535–1563) sit inside `DEV_START/DEV_END` and are already stripped by `build.js`.
- **Proposal:** move `import { healthDataSets }` inside a `DEV_START/DEV_END` block so
  `build.js` strips it too, and have dev seed `lc.collectionDatasets` from the file at
  boot. Dev then exercises the *same* live-collection path as chain rather than a second
  path only dev uses — a testing improvement in itself, and the reason dev never showed
  these bugs.

## The failing test — WRITTEN 2026-09-12, `test/engine_purity.test.mjs`

`node test/engine_purity.test.mjs` → **14 checks, 13 failed.** Red is the bug, not a
broken test. It goes green as the plan below is worked through.

The plan originally said to extend `scale.test.mjs` to drive the ECG rankings directly.
**That is not possible** — they are closure variables inside `init()`, so no test can call
them. Their unreachability *is* part of the finding, so the new file uses three angles:

**1. Behavioural, and the strongest evidence.** Lift a render-path function twice against
two *different* module-scope `healthDataSets` bindings and call it with an identical
dataset both times. A function whose answer comes from its arguments returns the same
value twice; one that reaches for baked data does not. Measured:

```
getBeamTempoSeconds   9.172s vs 9.121s   beam tempo differs by the ENGINE's build
getBeamHueAnchorDeg   88.28° vs 86.46°   nearly 2 degrees of hue
```

Those numbers are the bug, demonstrated rather than argued: the same piece renders
differently depending on what array the engine was compiled with, not on what is on chain.

**`winsorizedPercentileForLab` is the control, and it PASSES** — handed a collection
explicitly it is already pure. That matters: it shows the test distinguishes a pure
function from an impure one, so the 13 failures are the code, not the method.

**2. Source guard on the nine init-time rankings** — the only check available while they
remain unreachable.

**3. Engine purity** — `src/main.js` must not import `healthDataSets` at module scope, and
`index_bundle.js` must contain no `ecg`/`labs` blocks at all.

The behavioural test stays meaningful after the refactor: whatever the new signature is,
output must depend on what is passed in, not on what the engine was built with.

`node test/scale.test.mjs` still passes 14,064 checks — no regression.

## Order of work

1. ~~Write the failing test first.~~ **DONE** — `test/engine_purity.test.mjs`, 13 of 14
   failing against today's code, with the control passing.
2. Refactor group 1 and 1b to take the collection as an argument. Test goes green.
3. Groups 2 and 3 — delete fallbacks, handle null.
4. Group 4 — move the import behind `DEV_START`, seed dev from the file.
5. `node build.js`, confirm the bundle no longer contains the array and shrinks ~12.6%.
6. Full regtest: inscribe engine + pieces, confirm rendering and re-ranking, **and
   inscribe a piece past the old baked length** — the case that broke v1 and that no
   chain has ever seen.
7. Re-run `scale.test.mjs` and the browser sweep.

## Risks

- **This is the engine, and it has been inscribed wrong twice.** The change touches ~40
  call sites in the file that renders every piece.
- **Removing fallbacks means new null paths.** Every one must render *something* — a piece
  that throws is a piece that never draws, which is how v1 failed.
- **Dev and chain behaviour converge**, which is good, but it means dev stops showing the
  finished collection by default. Expect dev renders to look different after this.
- The 150 peeled carriers are unaffected either way — sats are independent of engine code.
