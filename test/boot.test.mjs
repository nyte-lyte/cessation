// boot.test.mjs — boots the real index_bundle.js the way ord would.
//
// Everything else in test/ exercises lifted functions. This runs the shipped
// bundle end to end against a stubbed DOM, a stubbed WebGL2 context and a
// stubbed /r/* surface, and asks the only question that finally matters: given
// nothing but its own CBOR metadata, does the piece render, and does it render
// finite numbers?
//
// This is the axis testing.md calls out as unbuilt — uniform completeness. A
// uniform the shader declares but main.js never sets defaults to 0 in WebGL and
// produces a perfectly good image of the wrong thing (u_co2Norm did exactly
// that). Here an unset uniform is simply absent from the recorded map, and an
// undefined one is caught as non-finite.
//
// It matters more now that the engine ships with no datasets: before, a piece
// could fall back to the baked array and look right no matter what the chain
// said. Now the metadata IS the piece.

import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, liftModule, Report } from './harness.mjs';
import { cborEncode } from './cbor_encode.mjs';

const r = new Report();
const bundle = readFileSync(join(ROOT, 'index_bundle.js'), 'utf8');

// The engine boots inside an async IIFE, so anything it throws surfaces as an
// unhandled rejection and would kill the process before the report prints —
// a real failure that looks like broken test infrastructure. Record it instead.
const asyncFailures = [];
process.on('unhandledRejection', (e) => asyncFailures.push(e));
process.on('uncaughtException',  (e) => asyncFailures.push(e));

// health_data_sets.js calls normalize() at load to enrich each dataset; it comes
// from decay_logic.js, whose import the lift strips.
const { normalize } = liftModule('data/decay_logic.js', ['normalize']);
const { healthDataSets } = liftModule('data/health_data_sets.js', ['healthDataSets'],
  { inject: `const normalize = ${normalize.toString()};` });
const OWN_INDEX = 7;
const OWN_ID = 'a'.repeat(64) + 'i0';

// ── The bundle must not carry the collection ──────────────────
// The whole point of the change: a living collection cannot ship with part of
// itself compiled in, or a piece knows its siblings before they are inscribed.
{
  const ctx = 'bundle';
  r.checks++;
  const baked = (bundle.match(/date: *"\d{4}-\d{2}-\d{2}"/g) ?? []).length;
  if (baked > 0) {
    r.fail(ctx, `${baked} datasets are compiled into index_bundle.js; the engine must carry none — pieces supply their own via CBOR metadata`);
  }
  // This engine goes further than an empty shell: build.js strips the import
  // inside DEV_START/DEV_END, so the name does not appear in the bundle at all.
  // Asserting its ABSENCE is the stronger check — a shell could be repopulated by
  // a build change; a missing symbol cannot.
  r.checks++;
  if (/healthDataSets/.test(bundle)) {
    r.fail(ctx, 'index_bundle.js still references healthDataSets — build.js may have gone back to inlining the data file');
  }
}

// ── CBOR fidelity ─────────────────────────────────────────────
// testing.md item 8. If CBOR encodes any value at reduced precision, percentile
// ranks flip and a piece renders differently from the same data in dev. This was
// survivable while the baked array was authoritative; the metadata is the only
// source now, so a rounded value IS the piece.
const metadata = {
  pieceIndex:      OWN_INDEX,
  hashTail:        42,
  inscriptionUnix: 1735689600,
  dataset:         healthDataSets[OWN_INDEX],
};
const metadataHex = cborEncode(metadata);
{
  const ctx = 'cbor fidelity';
  const cborDecode = new Function(
    `${bundle.match(/function cborDecode[\s\S]*?\n\}\n/)[0]}\nreturn cborDecode;`
  )();
  const back = cborDecode(metadataHex);

  r.checks++;
  if (back.pieceIndex !== metadata.pieceIndex || back.hashTail !== metadata.hashTail ||
      back.inscriptionUnix !== metadata.inscriptionUnix) {
    r.fail(ctx, 'pieceIndex / hashTail / inscriptionUnix did not survive the round trip');
  }
  for (const group of ['ecg', 'labs']) {
    for (const [k, v] of Object.entries(metadata.dataset[group])) {
      r.checks++;
      if (back.dataset[group][k] !== v) {
        r.fail(ctx, `${group}.${k} decoded as ${back.dataset[group][k]}, encoded from ${v} — reduced precision flips percentile ranks`);
      }
    }
  }
}

// ── Boot the bundle ───────────────────────────────────────────
function bootEngine({ serveMetadata }) {
  const uniforms = {};
  let draws = 0;
  const gl = new Proxy({}, { get(_, k) {
    if (k === 'canvas') return { width: 900, height: 600 };
    if (k === 'drawArrays') return () => { draws++; };
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getUniformLocation') return (_p, name) => ({ name });
    if (k === 'getAttribLocation') return () => 0;
    if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
    if (k === 'uniform1f') return (loc, v) => { if (loc?.name) uniforms[loc.name] = v; };
    if (k === 'uniform2f') return (loc, a, b) => { if (loc?.name) uniforms[loc.name] = [a, b]; };
    if (k === 'uniform3fv') return (loc, v) => { if (loc?.name) uniforms[loc.name] = Array.from(v ?? []); };
    if (typeof k === 'string' && k.toUpperCase() === k) return 1;   // GL enums
    return () => ({});
  }});

  const el = () => ({
    id: '', textContent: '', style: {}, classList: { add(){}, remove(){} },
    appendChild(){}, setAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, getBoundingClientRect: () => ({ width: 900, height: 600 }),
  });
  const canvas = { ...el(), width: 900, height: 600, clientWidth: 900, clientHeight: 600,
                   getContext: () => gl };

  globalThis.document = {
    currentScript: null, head: el(), documentElement: el(), body: el(),
    createElement: () => el(),
    getElementById: (id) => (id === 'canvas' ? canvas : el()),
    addEventListener(){},
  };
  globalThis.window = {
    location: { pathname: `/content/${OWN_ID}`, search: '' },
    addEventListener(){}, devicePixelRatio: 1,
  };
  globalThis.requestAnimationFrame = () => 0;

  const errors = [];
  globalThis.fetch = (url) => {
    // A real Response always carries ok/status, and since 2026-09-13 the engine
    // reads them: lcRefreshSiblings distinguishes a 404 ("this child has no
    // metadata", a complete answer) from a transport failure, so a mock without
    // them is classified as a failure and the collection never commits. Mock the
    // shape the engine actually consumes.
    const ok  = (body) => Promise.resolve({ ok: true,  status: 200, json: () => Promise.resolve(body) });
    const notFound = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    if (url === `/r/metadata/${OWN_ID}`) {
      return serveMetadata ? ok(metadataHex) : notFound();
    }
    if (url === '/r/blockheight')          return ok(880000);
    if (url.startsWith('/r/inscription/')) return ok({ height: 879000 });
    if (url.startsWith('/r/parents/'))     return ok({ parents: [] });
    if (url.startsWith('/r/children/'))    return ok({ ids: [] });
    return Promise.reject(new Error('404 ' + url));
  };

  const realError = console.error, realWarn = console.warn, realLog = console.log;
  console.error = (...a) => errors.push(a.join(' '));
  console.warn = () => {}; console.log = () => {};
  let threw = null;
  try { new Function(bundle)(); } catch (e) { threw = e; }
  const restore = () => { console.error = realError; console.warn = realWarn; console.log = realLog; };

  return { uniforms, draws: () => draws, errors, threw, restore };
}

const settle = () => new Promise(res => setTimeout(res, 1500));

// Anything thrown during boot, attributed to the case that was running.
function drainAsyncFailures(ctx) {
  r.checks++;
  if (asyncFailures.length) {
    const e = asyncFailures[0];
    r.fail(ctx, `the engine threw during boot — ${e?.constructor?.name}: ${e?.message}`);
    asyncFailures.length = 0;
  }
}

// ── A piece with its metadata renders, and renders finite ─────
{
  const ctx = 'boot with metadata';
  const run = bootEngine({ serveMetadata: true });
  await settle();
  run.restore();

  r.checks++;
  if (run.threw) r.fail(ctx, `the bundle threw on load: ${run.threw.message}`);

  r.checks++;
  if (run.draws() === 0) {
    r.fail(ctx, 'no frame was drawn from valid on-chain metadata — the piece cannot render itself without the baked array');
  }

  const names = Object.keys(run.uniforms);
  r.checks++;
  if (names.length < 40) {
    r.fail(ctx, `only ${names.length} uniforms were set; the shader declares far more — something is unwired`);
  }

  // The u_co2Norm class: a value that is undefined or NaN reaches the shader as
  // garbage and still produces a plausible image.
  for (const name of names) {
    const v = run.uniforms[name];
    const vals = Array.isArray(v) ? v : [v];
    r.checks++;
    if (!vals.every(Number.isFinite)) {
      r.fail(ctx, `${name} was set to ${JSON.stringify(v)} — a non-finite uniform renders a wrong-but-valid frame`);
    }
  }

  r.checks++;
  if (run.errors.length) r.fail(ctx, `unexpected console.error: ${run.errors[0].slice(0, 120)}`);

  drainAsyncFailures(ctx);
}

// ── A piece without its metadata holds black ──────────────────
// With an empty collection every percentile and normalize returns its midpoint,
// so drawing would produce a complete, plausible image of a piece this is not.
{
  const ctx = 'boot without metadata';
  const run = bootEngine({ serveMetadata: false });
  await settle();
  run.restore();

  r.checks++;
  if (run.draws() > 0) {
    r.fail(ctx, `drew ${run.draws()} frame(s) with no dataset; midpoint values would be shown as if they were this piece's own data`);
  }
  r.checks++;
  if (!run.errors.some(e => e.includes('no dataset'))) {
    r.fail(ctx, 'held black but said nothing — a blank piece with no explanation is indistinguishable from a broken engine');
  }

  // Without the gate this is not a neutral render but a TypeError: every tempoFn
  // dereferences the dataset, so the pre-advance throws on undefined. The gate is
  // load-bearing beyond the wrong-but-valid-frame argument for it.
  drainAsyncFailures(ctx);
}

process.exit(r.print('Boot — the shipped bundle, as ord runs it') ? 0 : 1);
