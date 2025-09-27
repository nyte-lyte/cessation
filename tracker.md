# Cessation — Tracker Site To-Do

## 🎯 Milestone 0 — Prep
- [ ] Create `apps/tracker` (or separate repo) scaffold (Vite/Next.js)
- [ ] Decide hosting (Vercel/Netlify) + object storage (S3/R2) for snapshots
- [ ] Pick DB (Postgres preferred; SQLite ok to start)

## 🧱 Milestone 1 — Data & Schema
- [ ] Define schema
  - [ ] `pieces` (id, inscription_id, mint_time, block_height, hash_tail, lifespan_years, base_palette, health_index_at_mint)
  - [ ] `state_current` (piece_id, years_elapsed, decay_progress, phase_years, beam_strengths[6], beam_hues[6], updated_at)
  - [ ] `events` (piece_id, type: MINT|ARRIVAL_20|ARRIVAL_60|RIPPLE, at_years|block_height, metadata)
  - [ ] `snapshots` (piece_id, timestamp, image_url)
- [ ] Migrations + seed script (1–2 test pieces)

## 🔗 Milestone 2 — Chain Ingest
- [ ] Choose indexer/API (Ordinals/Bitcoin) for inscriptions & blocks
- [ ] Ingest job: on new mint → store inscription, block time/height, last-two hash digits
- [ ] Webhook/cron to poll blocks (fallback schedule)
- [ ] Unit tests: determinism of parsed fields

## 🧠 Milestone 3 — Life Model Engine
- [ ] Port core model (lifespanYearsFromHashDigits, decay, phaseYears)
- [ ] Deterministic recompute: given (health dataset, hash tail, block time)
- [ ] Compute per-piece **state_current** (yearsElapsed, decayProgress, beams: strength & hue)
- [ ] Scheduler: hourly recompute + on event (new block/mint)
- [ ] API endpoints
  - [ ] `GET /pieces` (list, paging, summary fields)
  - [ ] `GET /pieces/:id` (full state_current)
  - [ ] `GET /events` (recent collection events)
  - [ ] `POST /recompute/:id` (admin/debug)

## 🖼️ Milestone 4 — Rendering & Snapshots (optional at first)
- [ ] Reuse WebGL shaders (headless / OffscreenCanvas)
- [ ] Snapshot daily/weekly → push to storage → store URL in `snapshots`
- [ ] CLI task: `yarn snapshot --piece <id>`

## 🖥️ Milestone 5 — Frontend
- [ ] Collection page (grid)
  - [ ] Card: thumbnail/live canvas, age %, active beams count
  - [ ] Filters: early/mid/late life; active ripple
- [ ] Piece page
  - [ ] Live canvas (same shader) with read-only controls (timeWarp, pause)
  - [ ] Sidebar: on-chain facts (inscription, block, hash tail)
  - [ ] Life model panel: lifespanYears, yearsElapsed, decayProgress
  - [ ] Beams panel: strength, hue°, tempo label, active/inactive (why)
  - [ ] Timeline of events: Mint, 20% arrival, 60% arrival, ripples
  - [ ] Snapshots strip (if available)
- [ ] About/Method page (determinism, data sources)

## 🛡️ Milestone 6 — Determinism & Trust
- [ ] “Audit this view” JSON (inputs used for current render)
- [ ] Recompute button (admin)
- [ ] Link out to block explorer for provenance

## 🔔 Milestone 7 — Notifications (later)
- [ ] Subscribe to a piece (email/Discord/Telegram)
- [ ] Notify on arrivals and ripples

## 🧪 QA & Launch
- [ ] Fixture data for several lifespans (short/avg/long)
- [ ] Cross-check: UI state = engine state = API output
- [ ] Perf pass: lazy-load canvases, cache API responses
- [ ] Deploy staging → smoke test → go live

---

## 🏷️ Suggested GitHub Labels
- `backend`
- `frontend`
- `indexer`
- `engine`
- `schema`
- `snapshotting`
- `docs`
- `good-first-issue`

## 🗂️ Suggested Issues to open first
- [ ] Setup repo + CI
- [ ] Define DB schema & migrations
- [ ] Implement life model recompute (engine skeleton)
- [ ] Build `/pieces` and `/pieces/:id` endpoints
- [ ] Collection page (static list with mock data)
- [ ] Piece page skeleton (bind to API)
