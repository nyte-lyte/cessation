# Engine version artifacts — v1/v2 copies must never sit in the build path

## What happened (2026-08-13)

Two defects from the engine v2/v3 work were found in dev, neither caught by regtest:

1. **`u_time` float32 precision** (introduced in `1c80352`, fixed in `cdf1eb6`).
   `u_time` was set to raw seconds-since-inscription and sent via `uniform1f`
   (float32). At that magnitude the float32 ULP exceeds a frame — 0.5s for a
   two-month-old piece, 8s at the dev default, doubling every ~2 years — so the
   uniform froze between frames and then snapped. Every term it drives (the
   0.03–0.04 wobble on all 17 field anchors, the lava-lamp orbits, nirvanaPulse)
   jumped 1–2 radians at once. Fixed by wrapping at 200π seconds: every `u_time`
   coefficient in fragment.glsl is a multiple of 0.01 rad/s, so 200π advances each
   term by an exact multiple of 2π — phase-continuous, no seam.

2. **`index_bundle.html` was a v1 fossil.** Commit `f90af79`, whose message reads
   only "Update safe state to 1c80352 in MEMORY.md", also replaced the file's
   one-line loader with 2,546 lines of fully inlined pre-v2 engine — no
   `collectionAncestors`, no parent-chain walk, old `u_time`. Restored to the
   one-line loader. The fossil is preserved in git at `f90af79^:index_bundle.html`
   if it is ever needed; do not copy it back into the working tree.

## Why regtest didn't catch either

Regtest proves the piece boots and the recursive endpoints answer. It cannot
produce an **old** piece (bug 1 needs months of age — at one minute old,
`secsSinceBirth` is ~60 and float32 handles it fine), a **large** collection, or a
**visually wrong but valid** frame. Every bug that has shipped so far lived in one
of those three gaps: u_time (age), u_co2Norm never set (valid-but-wrong image),
inscribe.js inherited hue (valid-but-wrong hue), ancestor ordering (needs two engine
generations with overlapping children).

## Rules

- Only two files in the repo may contain engine code: `src/main.js` and
  `index_bundle.js`. If `grep -rl "uTimeLoc" . --exclude-dir=.git` returns a third,
  something is wrong.
- `index_bundle.html` stays a one-line loader so it always tracks the current
  bundle and cannot go stale.
- Before any inscription run, verify the bundle is reproducible: rebuild and diff
  against the committed `index_bundle.js`. They must be byte-identical.
- What actually reaches the chain: `index_bundle.js` (built by `build.js` from
  exactly six source paths) and the ~300-byte per-piece HTML written from the
  inline template in `inscribe.js` (`const scriptHtml`). Neither reads `index_bundle.html`.
- Never bury an unrelated file rewrite in a commit whose message describes
  something else.

## Closed

`/r/inscription/self` for block height — the last v2-era `/self` call in live code —
was fixed in `d6329eb`. It now queries the resolved `_ownId` and throws instead of
defaulting to block 0, which had put cessation ~5.26M blocks out so the piece would
silently never cease.
