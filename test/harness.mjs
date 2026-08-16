// harness.mjs — shared loader for the headless tests.
//
// The collection math lives in two places: data/decay_logic.js is a proper ES
// module and imports directly. The rest sits at the top level of src/main.js,
// which cannot be imported (it calls init() on load and needs document + WebGL2).
// So those functions are extracted from the source text by name and evaluated.
//
// Extraction relies on main.js formatting: top-level functions start with
// `function name(` at column 0 and end with `}` at column 0. Anything nested is
// indented, so the first column-0 brace is always the function's own close.
// If a lift fails, the harness throws loudly rather than silently testing nothing.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');

// data/decay_logic.js is written as a browser ES module, but the repo has no
// package.json, so Node reads .js as CommonJS and the named exports are invisible.
// Rather than add a package.json (which would change how the project loads
// everywhere else), strip the module syntax the same way build.js does and
// evaluate it. Same source of truth either way — no copy to drift.
export function liftModule(relPath, names) {
  let src = readFileSync(join(ROOT, relPath), 'utf8');
  src = src.replace(/^import\s+.*$/gm, '');
  src = src.replace(/^export\s*\{[^}]+\};?\s*$/gm, '');
  const factory = new Function(`${src}\nreturn { ${names.join(', ')} };`);
  const lifted = factory();
  for (const n of names) {
    if (typeof lifted[n] !== 'function') {
      throw new Error(`harness: ${n}() not found in ${relPath}`);
    }
  }
  return lifted;
}

export function liftFromMainJs(names) {
  const src = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  const bodies = [];
  for (const name of names) {
    const re = new RegExp(`^function ${name}\\(([\\s\\S]*?)\\n\\}`, 'm');
    const m = src.match(re);
    if (!m) throw new Error(`harness: could not lift ${name}() from src/main.js — has the file been reformatted?`);
    bodies.push(m[0]);
  }
  const factory = new Function(`${bodies.join('\n\n')}\nreturn { ${names.join(', ')} };`);
  return factory();
}

// A dataset shaped exactly like the real ones. Values are plausible but synthetic —
// this harness tests structure and scale behaviour, not the real health data.
export function makeDataset(i, n) {
  const w = n > 1 ? i / (n - 1) : 0.5;           // 0..1 across the collection
  const jitter = (amp, phase) => amp * Math.sin(i * 1.7 + phase);
  return {
    date: `synthetic-${String(i).padStart(3, '0')}`,
    ecg: {
      ventRate:    70  + 30 * w + jitter(6, 0.3),
      prInterval:  150 + 40 * w + jitter(8, 1.1),
      qrsInterval: 90  + 30 * w + jitter(5, 2.0),
      qtInterval:  380 + 60 * w + jitter(9, 0.7),
      qtcInterval: 420 + 70 * w + jitter(10, 1.9),
      pAxis:       40  + 60 * w + jitter(12, 2.6),
      rAxis:       30  + 70 * w + jitter(14, 0.4),
      tAxis:       35  + 65 * w + jitter(13, 1.5),
    },
    labs: {
      glucose:       85   + 40   * w + jitter(7, 0.9),
      nitrogen:      12   + 14   * w + jitter(2, 1.4),
      creatinine:    0.9  + 1.2  * w + jitter(0.1, 2.2),
      eGFR:          110  - 55   * w + jitter(5, 0.6),
      sodium:        138  + 5    * w + jitter(1.5, 1.8),
      potassium:     3.8  + 1.0  * w + jitter(0.2, 0.2),
      chloride:      100  + 6    * w + jitter(2, 2.4),
      carbonDioxide: 24   + 5    * w + jitter(1.5, 1.0),
      calcium:       9.0  + 1.0  * w + jitter(0.3, 1.6),
    },
  };
}

export function makeCollection(n) {
  return Array.from({ length: n }, (_, i) => makeDataset(i, n));
}

// ── models of the engine's own guards ─────────────────────────
// These mirror logic that lives inside main.js's init() closure and therefore
// cannot be lifted (it needs document + WebGL2). They are deliberately small,
// and assertDrawGuardUnchanged() below is a tripwire against them going stale.

// Mirrors _lcMergedEntries (src/main.js:581). The baked healthDataSets are always
// seeded first, which is why the collection can never be smaller than the baked
// array — a fact several assertions depend on.
export function mergedEntries(collectionDatasets, ownPieceIndex, ownDataset = null) {
  const byIndex = new Map();
  collectionDatasets.forEach((dataset, i) => byIndex.set(i, { pieceIndex: i, dataset }));
  if (ownDataset) byIndex.set(ownPieceIndex, { pieceIndex: ownPieceIndex, dataset: ownDataset });
  return [...byIndex.values()].sort((a, b) => a.pieceIndex - b.pieceIndex);
}

// Mirrors lcOwnPosition (src/main.js:603).
export function ownPosition(entries, ownPieceIndex) {
  return entries.findIndex(e => e.pieceIndex === ownPieceIndex);
}

// Mirrors the startIdx guard in draw() (src/main.js:1217).
export function startIndexForDraw(ownPos, ownPieceIndex, collectionLength) {
  return ownPos >= 0 ? ownPos : Math.min(ownPieceIndex, collectionLength - 1);
}

const DRAW_GUARD_SOURCE =
  'const startIdx = ownPos >= 0 ? ownPos : Math.min(currentDataSetIndex, drawCollection.length - 1);';

// If draw()'s guard is edited, startIndexForDraw() above is no longer a model of
// the engine and every result below it is fiction. Fail loudly instead.
export function assertDrawGuardUnchanged(report) {
  const src = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  report.checks++;
  if (!src.includes(DRAW_GUARD_SOURCE)) {
    report.fail('harness', 'draw()\'s startIdx guard in src/main.js no longer matches the model in harness.mjs (startIndexForDraw) — update the harness before trusting these results');
  }
}

// ── assertions ────────────────────────────────────────────────
// Collect failures rather than throwing on the first one — a scale bug usually
// trips several checks at once and the whole picture is more useful than the
// first line of it.

export class Report {
  constructor() { this.failures = []; this.checks = 0; }

  fail(context, message) { this.failures.push(`${context}: ${message}`); }

  finite(context, label, value) {
    this.checks++;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(context, `${label} is ${value === undefined ? 'undefined' : String(value)}, expected a finite number`);
      return false;
    }
    return true;
  }

  inRange(context, label, value, lo, hi) {
    if (!this.finite(context, label, value)) return false;
    this.checks++;
    if (value < lo || value > hi) {
      this.fail(context, `${label} is ${value}, expected within [${lo}, ${hi}]`);
      return false;
    }
    return true;
  }

  // Every ecg + labs field present and finite. This is the check that catches a
  // dataset that came back undefined and got silently spread into the next stage.
  dataset(context, label, ds) {
    this.checks++;
    if (!ds || typeof ds !== 'object') {
      this.fail(context, `${label} is ${ds === undefined ? 'undefined' : String(ds)}, expected a dataset object`);
      return false;
    }
    if (!ds.ecg || !ds.labs) {
      this.fail(context, `${label} is missing ${!ds.ecg ? 'ecg' : 'labs'}`);
      return false;
    }
    let ok = true;
    for (const group of ['ecg', 'labs']) {
      for (const [k, v] of Object.entries(ds[group])) {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          this.fail(context, `${label}.${group}.${k} is ${String(v)}, expected a finite number`);
          ok = false;
        }
      }
    }
    return ok;
  }

  // Run fn, converting a thrown error into a recorded failure. A crash is a
  // result here, not an abort — v1's growth bug was a crash.
  attempt(context, label, fn) {
    this.checks++;
    try {
      return { ok: true, value: fn() };
    } catch (e) {
      this.fail(context, `${label} threw ${e.constructor.name}: ${e.message}`);
      return { ok: false, value: undefined };
    }
  }

  print(title) {
    const pass = this.failures.length === 0;
    console.log(`\n${title}`);
    console.log('─'.repeat(title.length));
    console.log(`${this.checks} checks, ${this.failures.length} failed`);
    if (!pass) {
      console.log('');
      for (const f of this.failures) console.log(`  FAIL  ${f}`);
    }
    console.log(pass ? '\nPASS' : '\nFAIL');
    return pass;
  }
}
