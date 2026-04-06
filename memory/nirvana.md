# Nirvana / Karma / Lifecycle System

## Bitcoin Blocktime — Core Architectural Principle
The Bitcoin block clock (~10 min average) is the heartbeat of the entire lifecycle. It is not just a timing mechanism — it is the fundamental unit of existence in this project:
- **Lifespan:** derived from the blockhash at mint — the block determines how long each piece lives
- **Cessation:** determined by block height — the piece dies at a specific block, not a wall-clock time
- **Reanimation:** triggered by block detection — the engine reads cessation block, computes karma, begins transition
- **Void:** triggered when both partners' final cessation blocks are detected
- **Transition window:** both reanimation and void fade interpolate over one block window (~10 min) — the block IS the transition
- **Liberation threshold:** computed fresh from all sibling datasets at each block read — dynamic, never frozen

Everything is block-native. No human triggers, no external timers. The chain breathes and the pieces respond.

## Philosophical Grounding
Buddhist rebirth (not reincarnation). Not a permanent soul transmigrating — a stream of consciousness carried forward. The flame passing to the next candle. Samsara is the cycle; nirvana is liberation from it. Reanimation is not triumph — it's continuation of the cycle because karma remains unresolved.

**Lifecycle:** born → living → cessation → [karma check] → reanimate (samsara) → ... → final cycle → radial dissolution → void (liberation, karma exhausted)

## Pairing Rules
- Sequential pairs: (0,1), (2,3), (4,5)... — piece 0 is genesis, no reanimation
- Even piece N (>0): partner = N+1. Odd piece N: partner = N-1.
- Odd final piece (if collection ends odd): eternal vigil — immediate liberation, most fortunate outcome
- Fully autonomous — no human required, no new transactions after original mint
- Each piece always has its own blockhash-determined lifespan, including reanimated cycles
- Cycle N lifespan derived from the hash of the cessation block of cycle N-1 — deterministic, fully on-chain

## Succession, Not Soulmates
- Pairs are not soulmates — they are successive lives in a lineage
- Sequential pairing: (0,1), (2,3)... even piece is the predecessor, odd is the successor
- They cycle independently, each on its own blockhash-determined lifespan
- "Soul mates" framing retired — the bond is generational, not romantic

## Karma & Liberation
- Karma = disease burden of the dataset (QTc×0.35 + creatinine×0.25 + (1-eGFR)×0.20 + glucose×0.15 + ventRate×0.05)
- Liberation threshold = 25th percentile karma of full collection — DYNAMIC, computed at runtime from all current sibling datasets
- When a piece's current karma drops below threshold at cessation → liberation, not reanimation
- No fixed cycle count — resolves naturally over time through three mechanisms (see below)

## What Drives Liberation — Three Mechanisms
1. **Per-piece asynchrony**: each piece lives its own blockhash-determined lifespan independently. When piece A ceases, it blends against B's current state at that moment — not a synchronized end-of-cycle. Because lifespans differ, the two pieces are always slightly out of phase. Each cessation produces a slightly different blend, so karma drifts continuously rather than freezing.
2. **New pieces joining**: each new inscription shifts the threshold at runtime. Recent datasets trend healthier (pieces 19, 21, 22, 26 are lowest karma), so new additions pull the threshold down — lowering the bar for all existing pairs.
3. **Liberated pairs**: their frozen low-karma datasets remain in the sibling list permanently, continuing to pull the threshold down for all remaining pairs indefinitely.

No partial blending needed. The system resolves naturally through the combined weight of asynchronous lifespans, new life entering the collection, and old pairs finding rest.

**Intent: hundreds of years of cycling before liberation is the goal — not quick resolution. The heaviest pairs may cycle for centuries. This is by design.**

## Karma Values (current 28 datasets, computed)
Sorted ascending — liberation threshold = karma[7] = 0.284 (dataset 12)
0.138(4), 0.174(19), 0.178(22), 0.204(2), 0.211(26), 0.257(21), 0.276(17), **0.284(12)**, 0.295(18), 0.328(1), 0.364(14), 0.386(13), 0.392(27), 0.393(3), 0.412(7), 0.419(8), 0.450(0), 0.457(20), 0.512(23), 0.513(24), 0.518(6), 0.557(16), 0.609(25), 0.640(5), 0.640(10), 0.656(15), 0.720(11), 0.758(9)

## Pair Blended Karmas (first blend)
| Pair | Blend | Status |
|------|-------|--------|
| (0,1) | 0.389 | cycles |
| (2,3) | 0.299 | cycles |
| (4,5) | 0.389 | cycles |
| (6,7) | 0.465 | cycles |
| (8,9) | 0.589 | cycles — very heavy |
| (10,11) | 0.680 | cycles — heaviest |
| (12,13) | 0.335 | cycles |
| (14,15) | 0.510 | cycles |
| (16,17) | 0.417 | cycles |
| (18,19) | 0.235 | **liberates cycle 1** |
| (20,21) | 0.357 | cycles |
| (22,23) | 0.345 | cycles |
| (24,25) | 0.561 | cycles — heavy |
| (26,27) | 0.302 | cycles |

## Reanimation — Fully On-Chain, No New Transactions
- Reanimation is a computed state, not a new inscription
- Each piece checks its own karma at its own cessation (not synchronized with partner)
- Partner dataset read at runtime from partner inscription metadata via recursive reference
- Blend computed dynamically in the engine — nothing written, all reads
- Dynamic liberation threshold: engine reads all siblings' datasets at runtime, computes karma distribution, derives 25th percentile
- All lifecycle states (living, reanimation, liberated, void) are deterministic from block height alone

## Transition Timing — Block Clock
Both major transitions use the same mechanism: block detected → interpolate over one block window (~10 min real time).

**Regular cessation → reanimation (per-piece, asynchronous):**
- Each piece reanimates the moment IT reaches cessation — does NOT wait for partner
- Blends against partner's current state at that moment (partner may still be living)
- Block detects this piece's cessation, karma check passes (not liberated)
- `u_reanimationProgress` interpolates 0→1 over ~10 min: `(Date.now() - triggerTimestamp) / 600000`
- No hard cut, no freeze — piece holds at final living state, partner hue arrives smoothly

**Final cessation → void (the only synchronization point):**
- Void triggers only when BOTH partners have reached final cessation — this is the only moment they "catch up"
- Block detects both partners ceased
- `u_voidProgress` interpolates 0→1 over ~10 min: same mechanism
- Fades to near-black hint of hue

The block is the heartbeat. Both transitions autonomous, no human intervention, same rhythm. Pieces cycle independently — liberation is the only rendezvous.

## Frozen Partner Rule
When a partner is permanently unavailable — piece 0 ending without reanimation, or a piece that has already reached liberation — the remaining piece still reanimates. It always blends against the partner's final frozen dataset.
- Karma still resolves: the frozen data keeps pulling on the remaining piece each cycle until liberation threshold is crossed
- Piece 1 specifically: reanimates indefinitely using piece 0's original frozen dataset as its permanent anchor
- Universal rule: applies to any piece whose partner is gone — the frozen partner remains present in every future lifetime until the remaining piece achieves liberation

## Lifecycle Lifecycle State Sequence (revised)
**born → living → cessation → [karma check] → reanimate (samsara) → ... → final cycle → radial dissolution → void**

There is only ONE nirvana = liberation = the void. "Nirvana" is not a waiting state between cycles. Reanimated cycles begin exactly like birth cycles. The only special visual state is the FINAL cycle's end phase.

## Visual States (in fragment.glsl) — Current Implementation

**Living / Reanimated:** standard visual. Beams, background fields, decay over lifespan. No distinction between first life and reanimated cycles visually.

**Reanimation transition:** partner hue arrives from opposite corner, both drift to center. Life re-emerges from meeting point. (Loved this — do not change.)

**Final cycle — late-phase dissolution (u_isLiberated=1.0):**
- No late-phase darkening for ANY cycle — removed entirely. `decay = exp(-u_decayPerYear * u_totalYears)` only. Non-final pieces live fully until cessation, no ghosting.
- Final cycle: instead of going dark, piece BRIGHTENS toward radial gradient as late phase progresses
- `livingColor = mix(livingColor, nirvanaRadial, latePhase * liberated)`
- Beams gradually reshape into the radial as the piece approaches cessation

**Radial (nirvana threshold state):**
- Base glucose hue: `nirvanaHue = mod(u_glucose * 360.0, 360.0)`
- Centered radial glow: `radialGlow = exp(-radialDist² / 0.10)` where `radialDist = length(v_uv - vec2(0.5))`
- Brightness floor prevents harsh corners: `nirvanaBri = 0.38 + 0.57 * radialGlow`
- Slow pulse while waiting: `nirvanaPulse = 0.94 + 0.06 * sin(u_time * 0.25)`
- Saturation: `nirvanaSat = 0.75 - 0.30 * radialGlow` (center desaturates toward white)
- Nirvana completes in 0.5 years after cessation (was 1.5)
- Radial HOLDS as waiting state until partner also reaches final cessation

**Void fade (u_voidProgress 0..1):**
- Trigger: block check detects both partners have reached final cessation
- Interpolate u_voidProgress 0→1 over one block window (~10 min real time): `(Date.now() - triggerTimestamp) / 600000` clamped 0..1, fed per-frame. Holds at 1.0.
- Void color: near-black center with bright glucose-hue edge glow
  - `edgeDist = min(min(v_uv.x, 1-v_uv.x), min(v_uv.y, 1-v_uv.y))`
  - `edgeGlow = exp(-edgeDist² / 0.003)`
  - `voidBri = 0.03 + 1.00 * edgeGlow`
  - `voidSat = 0.90 * edgeGlow` — desaturates to grey/black at center, no colored mid-band
- Reanimation suppressed when liberated: `* (1.0 - liberated)` on partnerArrival and lifeRestores

## Uniforms & API
- Uniforms: `u_reanimationProgress`, `u_partnerInheritedHueDeg`, `u_isLiberated`, `u_voidProgress`
- Console API: `setReanimation(0..1)` — auto-uses correct partner hue. `setLiberated(bool)`. `setVoidProgress(0..1)`. `getKarma(a,b)`, `getBlend(a,b)`
- Test: `setYears(34)` → late phase. `setLiberated(true)` → radial dissolution. `setVoidProgress(1)` → void. `setReanimation(0.5)` → collision (auto hue).
- data/decay_logic.js exports: `blendDatasets(successor, predecessor)`, `computeKarma(dataset, minMaxValues)`, `computeLiberationThreshold(allDatasets, minMaxValues)`
- Blend is 70/30: ceasing piece keeps 70% of itself, takes 30% from partner. Ceasing piece dominant.

## Hue Collision Pairs (current 28 datasets)
- Most pairs subtle (6–11°) — adjacent glucose values don't change much
- Dramatic: pair (16,17) = 86° — red meets green-yellow (piece 15 glucose=160, most extreme)
- Dramatic: pair (12,13) = 80°
- Monochrome: pairs (0,1) and (26,27) — identical hues, single unified luminous field

## inheritedHueDeg — Current State
- Per-piece: piece N uses piece N-1's glucose hue. Piece 0 uses its own.
- In main.js: computed per-frame as `allInheritedHues[currentDataSetIndex]`, override via `setInheritedHue(deg)` / `resetInheritedHue()`
- In pieceUtils.ts: `ds_all[Math.max(0, id - 1)]` — same logic, fixed in same session
- Bug history: was hardcoded to piece 0's hue for all pieces → all nirvana states looked identical ("everything pink")
