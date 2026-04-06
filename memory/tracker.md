# Tracker Site

## Location & Stack
- Repo: ~/cessation-tracker (separate git repo)
- Live: https://cessation-tracker.vercel.app
- GitHub: https://github.com/nyte-lyte/cessation-tracker
- Stack: Next.js 16 (Turbopack) + TypeScript + Tailwind v4 + Vercel

## Key Files
- src/app/page.tsx — collection grid (all 29 pieces, hue-tinted cards)
- src/app/piece/[id]/page.tsx — individual piece page (reads shaders server-side via fs.readFileSync)
- src/app/analytics/page.tsx — collection analytics: pair karma, health trends, karma ranking
- src/app/about/page.tsx — about page
- src/components/PieceViewer.tsx — live WebGL canvas ('use client'), replicates cessation shader stack
- src/components/PieceCard.tsx — grid card ('use client', onMouseEnter hover)
- src/components/PieceInteractions.tsx — keyboard nav + fullscreen (hidden on mobile)
- src/lib/pieceUtils.ts — computeHSBFromStats, hsbToHex, getPieceMeta, computeStaticUniforms
- src/shaders/ — fragment.glsl + vertex.glsl (copied from cessation)
- src/data/ — health_data_sets.js + decay_logic.js (copied from cessation)

## Build & Dev
- npm run build → generates 29 static piece pages via generateStaticParams
- npm run dev → localhost:3000

## Gotchas
- Root-level app/ (from create-next-app) conflicts with src/app/ — REMOVED root app/
- turbopack.root must be set to __dirname to fix workspace root warning
- Tailwind v4 `@import "tailwindcss"` + CSS layer ordering can override body/html background rules — use inline style on `<html>` and `<body>` in layout.tsx for reliable full-viewport background. globals.css `html,body { background }` alone is not sufficient.
- background: #0a0a0a set as inline style on both html and body in layout.tsx (not just CSS) to prevent macOS dark mode browser canvas from bleeding through on short pages

## Current UI State
- Mobile responsive: piece page stacks canvas above sidebar at ≤600px (portrait). Landscape keeps side-by-side grid.
- Prev/next navigation at top of sidebar (not bottom)
- Canvas wrapper: 48px padding, flex-centered, black background
- One-liner on landing page: "A generative art project using personal health data to reach digital nirvana." — do not change this
- Nav: left side has CESSATION + ABOUT + ANALYTICS (12px, letterSpacing 0.12em, var(--muted)). Right side has "nytelyte.xyz" span (placeholder until site is live).
- About page: src/app/about/page.tsx — 3 prose paragraphs + THE SYSTEM section (health index, visual output, decay, on-chain). 13px, lineHeight 2, var(--muted), maxWidth 680px
- About page content vertically centered: outer wrapper div has minHeight calc(100vh - 50px) + display flex + alignItems center. Self-contained, no effect on other pages.
- About page decay text: "The lifespan of each cycle is determined by the Bitcoin block hash — the mint block for the first lifespan, the cessation block for each rebirth."
- Landing page: explicit 2-column grid (repeat(2, 1fr)), maxWidth 560px, margin 0 auto. Each row is a partner pair — (00,01), (02,03), etc. Conceptually intentional.
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

## Future — nytelyte.xyz
Domain purchased: nytelyte.xyz (.xyz). Will host a portfolio + project pages including cessation. A separate live gallery page post-mint that pulls from the blockchain — shows each piece in its current lifecycle state. Built once the collection is on-chain.

## Live Features
- Open Graph metadata + per-piece OG images (piece number, color dot, date, health index)
- Vercel Analytics installed (@vercel/analytics)
- Vercel Speed Insights installed (@vercel/speed-insights)
- Mobile landscape fix: side-by-side layout when max-height 600px
- PieceInteractions hidden on mobile (fullscreen not supported on iOS)

## Deferred
- Hiro API, Postgres, mint status badges, block explorer links
- No custom Bitcoin indexer needed — use Hiro Ordinals API (hiro.so/ordinals-api)
