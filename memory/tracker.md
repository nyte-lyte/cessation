# Tracker Site

## Location & Stack
- Repo: ~/cessation-tracker (separate git repo)
- Live: https://cessation-tracker.vercel.app
- GitHub: https://github.com/nyte-lyte/cessation-tracker
- Stack: Next.js 16 (Turbopack) + TypeScript + Tailwind v4 + Vercel

## Key Files
- src/app/page.tsx — redirects to /piece/0 (grid removed 2026-05-03)
- src/app/piece/[id]/page.tsx — individual piece page (reads shaders server-side via fs.readFileSync)
- src/app/analytics/page.tsx — collection analytics: pair karma, health trends, karma ranking
- src/app/about/page.tsx — about page
- src/components/PieceViewer.tsx — live WebGL canvas ('use client'), replicates cessation shader stack
- src/components/PieceCard.tsx — grid card (no longer used on homepage, kept for reference)
- src/components/PieceInteractions.tsx — keyboard nav + fullscreen (hidden on mobile)
- src/components/Nav.tsx — nav component
- src/lib/pieceUtils.ts — computeHSBFromStats, hsbToHex, getPieceMeta, computeStaticUniforms
- src/shaders/ — fragment.glsl + vertex.glsl (copied from cessation)
- src/data/ — health_data_sets.js + decay_logic.js (copied from cessation)

## Build & Dev
- npm run build → generates 29 static piece pages via generateStaticParams
- npm run dev → localhost:3001 (port 3001 to avoid conflict with nytelyte on 3002)

## Live On-Chain IDs (as of 2026-06-20)

Engine (v2, fixed engine on Nakamoto sat 12425429610917, --parent v1):
`6a53d56958589b9f9bf191646fc0eddfb560e2873bb39d714c5c6e34f00e4f60i0`

Pieces — these are the **latest/clean inscription on each sat** (what marketplaces and ordinals.com surface). All point at v2 engine via `<script src>` and are children of v2 engine via `--parent`. The v1 originals + the leaked path-metadata layer remain on chain underneath each sat but are bypassed by viewers because the latest inscription wins.

| Piece | Inscription ID |
|---|---|
| 0  | `625d803e9bf5e532905d30b9701f7132bf27056893c36dc45ca5fa3f05d960bai0` |
| 1  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i0` |
| 2  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i1` |
| 3  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i2` |
| 4  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i3` |
| 5  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i4` |
| 6  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i5` |
| 7  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i6` |
| 8  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i7` |
| 9  | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i8` |
| 10 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i9` |
| 11 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i10` |
| 12 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i11` |
| 13 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i12` |
| 14 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i13` |
| 15 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i14` |
| 16 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i15` |
| 17 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i16` |
| 18 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i17` |
| 19 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i18` |
| 20 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i19` |
| 21 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i20` |
| 22 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i21` |
| 23 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i22` |
| 24 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i23` |
| 25 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i24` |
| 26 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i25` |
| 27 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i26` |
| 28 | `5d643a3ed027346871718780233c65890e4de866e78b9242fad2ca5cf1bc19e7i27` |
| 29 | `ebf6532aa5b0deaaa26b56c1874dbb1989961bdd4085411570f80cb264d5304bi0` |

Reference (do NOT link from the tracker — these are historical layers underneath each sat):
- v1 engine (broken, on Nakamoto sat 12425429610918): `b725884c8a6d63c2499c0f86b8e5863115808f8998697ba23abc0194b8c3323ei0`
- v1 original piece IDs (pieces 0–29, baked-data only, no live collection): captured in `memory/inscription_architecture.md`

## Gotchas
- Root-level app/ (from create-next-app) conflicts with src/app/ — REMOVED root app/
- turbopack.root must be set to __dirname to fix workspace root warning
- Tailwind v4 `@import "tailwindcss"` + CSS layer ordering can override body/html background rules — use inline style on `<html>` and `<body>` in layout.tsx for reliable full-viewport background. globals.css `html,body { background }` alone is not sufficient.
- background: #0a0a0a set as inline style on both html and body in layout.tsx (not just CSS) to prevent macOS dark mode browser canvas from bleeding through on short pages

## Current UI State
- Homepage redirects straight to /piece/0 — no landing grid
- Nav: left side has COLLECTION (links /piece/0) + ABOUT + ANALYTICS. Right side has "nytelyte.xyz" linking to https://nytelyte.xyz. Labels 12px, letterSpacing 0.12em, var(--muted).
- Mobile responsive: piece page stacks canvas above sidebar at ≤600px (portrait). Landscape keeps side-by-side grid.
- Prev/next navigation at top of sidebar (not bottom)
- Canvas wrapper: 48px padding, flex-centered, black background
- About page: src/app/about/page.tsx — 3 prose paragraphs + THE SYSTEM section (health index, visual output, decay, on-chain). 13px, lineHeight 2, var(--muted), maxWidth 680px
- About page content vertically centered: outer wrapper div has minHeight calc(100vh - 50px) + display flex + alignItems center. Self-contained, no effect on other pages.
- About page decay text: "The lifespan of each cycle is determined by the Bitcoin block hash — the mint block for the first lifespan, the cessation block for each rebirth."
- No page scrollbar on desktop — overflow hidden on layout and body
- Fullscreen: hover icon (expand/compress SVG) appears top-right of canvas on mouse hover. Targets canvas wrap only — sidebar disappears in fullscreen. Handled in PieceInteractions.tsx
- Arrow key navigation: left/right arrow keys cycle through pieces. Handled in PieceInteractions.tsx
- PieceInteractions.tsx: client component, fixed overlay covering canvas area (pointerEvents auto for hover detection)

## Piece Sidebar Layout
- Piece header: color dot + "PIECE XX" + date
- Health index: labeled "HEALTH INDEX" with a 3px bar (filled to healthIndex proportion, tinted with piece.hex) + numeric value on the right
- Mint status: compact DataRow ("MINT STATUS" / "not yet minted") — no bordered box
- ECG section: 8 DataRows (vent rate, PR, QRS, QT, QTc, P/R/T axis)
- Metabolic Panel: 9 DataRows (glucose, BUN, creatinine, eGFR, sodium, potassium, chloride, CO₂, calcium)
- Lifecycle section: decay rate + lifespan row (shows "—" until minted)

## Purpose — Historical Record
The tracker is a permanent snapshot of the collection at birth. Original datasets, original visuals, what each piece looked like before any reanimation. As pieces cycle and drift from their originals over time, the tracker becomes the only place to see what they once were. No blockchain integration needed — this is by design.

## nytelyte.xyz — Live
- Artist portfolio site at https://nytelyte.xyz, repo ~/nytelyte (github: nyte-lyte/nytelyte)
- Stack: Next.js 16 + TypeScript + Tailwind v4 + Vercel, dev on port 3002
- Nav: nytelyte (home) · Projects · About · Contact. Contact form via Resend → hillyerjess@gmail.com

## nytelyte.xyz Homepage (app/page.tsx) — current state (2026-05-10)
- Layout: `1fr 3fr` CSS grid, 60px gap, text left, live piece right, `align-items: center`, `min-height: calc(100vh - 120px)`
- Mobile (≤768px): single column, piece on top (order -1), stacked
- Piece iframe: `position: relative` outer div, `paddingBottom: 66.667%` spacer div for 3:2 ratio, iframe fills absolutely
- Piece src: `/piece0.html?v=${idx}#idx=${idx}` (random piece, cache-busted)
- public/piece0.html: minimal — just loads `/cessation-engine.js`. Engine owns DOM, injects own CSS + creates canvas-container + canvas.
- CSS override in piece0.html: `#canvas-container { width: 100vw !important; height: 100vh !important; }` — fills full iframe (engine default is min(100vw,100vh) square which leaves black margins in landscape iframe)
- Text: `clamp(24px, 5vw, 64px)` h1, 14px paragraph, "View collection →" link to cessation-tracker.vercel.app

## Deferred
- Hiro API, Postgres, mint status badges, block explorer links
- No custom Bitcoin indexer needed — use Hiro Ordinals API (hiro.so/ordinals-api)
