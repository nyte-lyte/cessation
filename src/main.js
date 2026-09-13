// ---------------------------------------------
// main.js
// ---------------------------------------------
// DEV_START
// Dev has no chain to discover anything from, so it reads the datasets from the
// repo. build.js strips this block, so THE INSCRIBED ENGINE CARRIES NO DATA —
// each piece supplies its own via CBOR metadata and finds its siblings on chain.
import { healthDataSets } from "../data/health_data_sets.js";
// DEV_END
import { blendDatasets, computeKarma, computeLiberationThreshold, getAgedDataset, applyCollectionInfluence, computeMinMaxValues, karmaClearanceRate, remainingKarma } from "../data/decay_logic.js";

// Derived entirely from whatever collection the piece can see — empty until the
// first refresh, which is why ensureMinMax() runs before anything reads it.
// Mutated in place (never reassigned) because every function below closes over
// this one object.
const minMaxValues = {};
function refreshMinMaxValues(allDatasets) {
  const fresh = computeMinMaxValues(allDatasets);
  for (const key in fresh) minMaxValues[key] = fresh[key];
}
// Populate from `collection` if it has not been done for that collection yet.
// Cached on identity like ecgRanks: sibling discovery replaces the array rather
// than mutating it, so a new identity is exactly when a recompute is due.
function ensureMinMax(collection) {
  if (!collection || !collection.length) return;
  if (ensureMinMax._for === collection && minMaxValues.ventRate) return;
  ensureMinMax._for = collection;
  refreshMinMaxValues(collection);
}

// DEV_START
// Dev has the datasets on disk, so seed the ranges immediately. Without this the
// DEV console helpers below run at init() before any chain discovery and read an
// empty minMaxValues — which threw in computeKarma and left dev with a blank
// canvas. On chain this block is stripped and the ranges come from the collection.
if (typeof healthDataSets !== 'undefined' && healthDataSets.length) {
  refreshMinMaxValues(healthDataSets);
}
// DEV_END

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");
if (!gl) {
  alert("WebGL2 is not available in your browser.");
}

async function loadShaderSource(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: ${response.status}`);
  }
  return await response.text();
}

function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(
      `Could not compile ${
        type === gl.VERTEX_SHADER ? "vertex" : "fragment"
      } shader:\n${info}`
    );
  }
  return shader;
}

// utility helpers
function lifespanYearsFromHashDigits(x /* 0..99 */) {
  // Triangular distribution: min=3, max=100, mode=28.
  // Skews young — median ~42 years, long tail to 100.
  // Inverse CDF maps uniform 0..99 hash to human-feeling lifespan.
  const t = x / 99;
  const a = 3, b = 100, c = 28;
  const F_c = (c - a) / (b - a); // ~0.258
  if (t <= F_c) {
    return a + Math.sqrt(t * (b - a) * (c - a));
  } else {
    return b - Math.sqrt((1 - t) * (b - a) * (b - c));
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Midpoint when the range is degenerate — matches decay_logic.js's normalize().
// A one-piece collection makes every min equal its max, so this is now a live path
// rather than a theoretical one, and the two implementations must agree.
function normalize(value, min, max) {
  if (max - min === 0) return 0.5;
  return (value - min) / (max - min);
}

function wrapDeg(h) {
  return ((h % 360) + 360) % 360;
}

// Keep a min gap between base hue and a candidate (one-sided push)
function guardHueGap(baseDeg, candDeg, minGapDeg, pushSign) {
  baseDeg = wrapDeg(baseDeg);
  candDeg = wrapDeg(candDeg);
  const diff = Math.abs(((candDeg - baseDeg + 540) % 360) - 180);
  if (diff < minGapDeg)
    candDeg = wrapDeg(candDeg + pushSign * (minGapDeg - diff));
  return candDeg;
}

// ─────────────────────────────────────────────────────────────
// Beam 3 — Sodium (beam helper)
// ─────────────────────────────────────────────────────────────

// 1) Arrival gate (~20% of lifespan, with a soft ramp ≈10% of lifespan)
function sodiumArrivalProgress(totalYears, lifespanYears) {
  const start = 0.2 * lifespanYears;
  const ramp = Math.max(0.1 * lifespanYears, 0.25); // at least ~3 months
  return clamp((totalYears - start) / ramp, 0, 1);
}

// 2) Tempo (seconds per cycle) from ventRate normalization (slower HR → slower T)
function sodiumTempoSeconds(ds) {
  const vMin = minMaxValues.ventRate.min;
  const vMax = minMaxValues.ventRate.max;
  const nVR = clamp(
    (ds.ecg.ventRate - vMin) / Math.max(1e-6, vMax - vMin),
    0,
    1
  );
  // map 0..1 → 10..4.5 seconds
  return 10 - 5.5 * nVR;
}

// 3) Pulse count per cycle from QRS width (narrow QRS → more pulses)
function sodiumPulseCount(ds) {
  const qMin = minMaxValues.qrsInterval.min;
  const qMax = minMaxValues.qrsInterval.max;
  const nQRS = clamp(
    (ds.ecg.qrsInterval - qMin) / Math.max(1e-6, qMax - qMin),
    0,
    1
  );
  const k = Math.round(3 + (1 - nQRS) * 3); // 3..6
  return Math.max(3, Math.min(6, k));
}

// 4) Deterministic per-piece phase seed from hash tail (0..1)
function sodiumPhaseSeed(hashTail /* 0..99 */) {
  return hashTail / 99 + 0.57; // 0..~1.57 cycles; we’ll mod 1 later
}

// 5) Pulsed Gaussian “grouped bursts” (phase01 in [0..1])
function sodiumPulseShape(phase01, k, width = 0.12) {
  let acc = 0.0;
  for (let i = 0; i < k; i++) {
    const c = (i + 0.5) / k; // centers
    const d = Math.min(Math.abs(phase01 - c), 1 - Math.abs(phase01 - c)); // wrap
    const g = Math.exp(-0.5 * Math.pow(d / Math.max(1e-3, width), 2));
    acc += g;
  }
  acc /= k;
  return 0.25 + 0.75 * acc; // 0.25..1.0
}

// 6) Amplitude from Sodium percentile, gated by arrival and healthIndex
function sodiumAmplitude(ds, healthIndex, arrivalProgress, pNa /* 0..1 */) {
  const base = 0.08 + 0.12 * clamp(pNa, 0, 1); // 0.08..0.20
  const healthMul = 0.85 + 0.15 * (1 - clamp(healthIndex ?? 0.5, 0, 1));
  return arrivalProgress * base * healthMul;
}

// 7) Hue anchor with guardrail against base hue (min 28° gap)
function sodiumHueDeg(baseHueDeg, ds, pNa /* 0..1 */) {
  const targetOffset = -25 + 50 * clamp(pNa, 0, 1); // -18°..+18°
  let hue = baseHueDeg + targetOffset;

  const wrap = (h) => ((h % 360) + 360) % 360;
  const base = wrap(baseHueDeg);
  let cand = wrap(hue);
  let diff = Math.abs(((cand - base + 540) % 360) - 180); // shortest arc

  if (diff < 36) {
    const push = (32 - diff) * Math.sign(targetOffset || 1);
    cand = wrap(cand + push);
  }
  return cand;
}

// ─────────────────────────────────────────────────────────────
// Beam 4 — Chloride (beam helper)
// ─────────────────────────────────────────────────────────────

// Arrival gate (~60% lifespan, soft ramp ≈8% lifespan, min ~0.2y)
function chlorideArrivalProgress(totalYears, lifespanYears) {
  const start = 0.6 * lifespanYears;
  const ramp = Math.max(0.08 * lifespanYears, 0.2);
  return clamp((totalYears - start) / ramp, 0, 1);
}

// Tempo (seconds per cycle) from QT interval (normalized)
function chlorideTempoSeconds(ds) {
  const qMin = minMaxValues.qtInterval.min,
    qMax = minMaxValues.qtInterval.max;
  const nQT = clamp(
    (ds.ecg.qtInterval - qMin) / Math.max(1e-6, qMax - qMin),
    0,
    1
  );
  return 11 - 5.5 * nQT; // 11..5.5 seconds
}

// Per-piece phase seed from hash tail (0..1 cycles, offset to avoid sync)
function chloridePhaseSeed(hashTail /* 0..99 */) {
  return (hashTail / 99 + 0.11) % 1;
}

// Triangle wave with subtle warble overlay
function chlorideTriWithWarble(phase01, ds) {
  const tri = 1.0 - Math.abs(2.0 * (phase01 - Math.floor(phase01 + 0.5)));
  const tMin = minMaxValues.tAxis.min,
    tMax = minMaxValues.tAxis.max;
  const nT = clamp((ds.ecg.tAxis - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
  const wf = 1.6 + 2.2 * nT; // 1.6 .. 3.8
  const war = 0.92 + 0.08 * Math.sin(2 * Math.PI * (phase01 * wf));
  return clamp(tri * war, 0, 1);
}

// Amplitude from Chloride percentile, gated by arrival and slightly by health
function chlorideAmplitude(ds, healthIndex, arrCl, pCl /* 0..1 */) {
  const base = 0.09 + 0.13 * clamp(pCl, 0, 1); // 0.07..0.18
  const healthMul = 0.9 + 0.1 * (1 - (healthIndex ?? 0.5));
  return arrCl * base * healthMul;
}

// Hue for Chloride with ≥24° separation from base hue
function chlorideHueDeg(baseHueDeg, pCl /* 0..1 */) {
  const wrap = (h) => ((h % 360) + 360) % 360;
  const base = wrap(baseHueDeg);
  const targetOffset = -20 + 40 * clamp(pCl, 0, 1); // -16°..+16°
  let cand = wrap(base + targetOffset);
  const diff = Math.abs(((cand - base + 540) % 360) - 180);
  if (diff < 32) {
    const push = 32 - diff;
    cand = wrap(cand + Math.sign(targetOffset || 1) * push);
  }
  return cand;
}

// ── Minimal CBOR decoder (no dependencies) ──────────────────────────────────
// Handles maps, strings, ints, floats (16/32/64), arrays, and tags.
// Used to decode hex-encoded ordinals metadata from /r/metadata/{id}.
function cborDecode(hex) {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  let i = 0;
  function read() {
    const b = bytes[i++];
    const mt = b >> 5, ai = b & 0x1f;
    // Float special cases before arg decode (float16/32/64 bytes are the payload)
    if (mt === 7 && ai === 25) { const v = (bytes[i] << 8) | bytes[i+1]; i += 2; const e = (v >> 10) & 0x1f, m = v & 0x3ff, s = v >> 15 ? -1 : 1; return s * (e === 31 ? (m ? NaN : Infinity) : e === 0 ? m * 5.9604644775e-8 : Math.pow(2, e - 15) * (1 + m / 1024)); }
    if (mt === 7 && ai === 26) { const dv = new DataView(bytes.buffer, i, 4); i += 4; return dv.getFloat32(0, false); }
    if (mt === 7 && ai === 27) { const dv = new DataView(bytes.buffer, i, 8); i += 8; return dv.getFloat64(0, false); }
    // Decode argument length/value
    let n = ai;
    if (ai === 24) n = bytes[i++];
    else if (ai === 25) { n = (bytes[i] << 8) | bytes[i+1]; i += 2; }
    else if (ai === 26) { n = ((bytes[i] * 16777216) + (bytes[i+1] << 16) + (bytes[i+2] << 8) + bytes[i+3]); i += 4; }
    else if (ai === 27) { i += 8; n = 0; } // 8-byte length not expected in our metadata
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const sl = bytes.slice(i, i + n); i += n; return sl; }
      case 3: { let s = '', e = i + n; while (i < e) { const c = bytes[i++]; if (c < 0x80) s += String.fromCharCode(c); else if (c < 0xE0) s += String.fromCharCode((c & 0x1F) << 6 | bytes[i++] & 0x3F); else { const b2 = bytes[i++]; s += String.fromCharCode((c & 0x0F) << 12 | (b2 & 0x3F) << 6 | bytes[i++] & 0x3F); } } return s; }
      case 4: { const arr = []; for (let k = 0; k < n; k++) arr.push(read()); return arr; }
      case 5: { const obj = {}; for (let k = 0; k < n; k++) { const key = read(); obj[key] = read(); } return obj; }
      case 6: return read(); // tag — decode tagged item
      case 7: { if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; return undefined; }
    }
  }
  return read();
}

// Link vertex + fragment into a program
function createProgram(gl, vertexSrc, fragmentSrc) {
  const program = gl.createProgram();
  const vShader = compileShader(gl, vertexSrc, gl.VERTEX_SHADER);
  const fShader = compileShader(gl, fragmentSrc, gl.FRAGMENT_SHADER);

  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Could not link WebGL program:\n" + info);
  }

  gl.deleteShader(vShader);
  gl.deleteShader(fShader);

  return program;
}

// resize‐handling utility, to keep canvas at full window size
function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

// once everything is ready, initialize WebGL
async function init() {
  // EXACTLY ONE render loop, however many times draw() is asked for.
  //
  // draw() ends by scheduling the next frame, so every direct call to draw()
  // used to start ANOTHER self-sustaining loop alongside the one already
  // running. The resize handler called draw() on every event — and a browser
  // fires resize continuously while a window is dragged — so a single drag
  // permanently multiplied the piece's frame rate. Measured on the pre-fix
  // engine: 60 draws/sec at rest, 441/sec after 20 synthetic resize events,
  // 497/sec after 70, never recovering. In a gallery of live iframes that is
  // the difference between idling and pegging the GPU.
  //
  // scheduleDraw() collapses any number of requests into one pending frame, so
  // the loop cannot fork no matter who calls it.
  //
  // It is also the one place a thrown frame can be caught. draw() schedules the
  // next frame as its LAST statement, so anything that throws part-way through
  // skips it and the piece is black for ever — the engine's own note calls that
  // "how v1 failed". Catching here and re-scheduling means a transient fault
  // (a lost WebGL context, a half-written dataset) costs one frame instead of
  // the piece. The engine is immutable once inscribed; it has to survive its own
  // bad frames.
  var _rafPending = false;
  function scheduleDraw() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      try {
        draw();          // re-arms the loop itself on success
      } catch (e) {
        if (!scheduleDraw._logged) {
          scheduleDraw._logged = true;
          console.error('[draw] threw — recovering, loop continues', e);
        }
        scheduleDraw();  // the tail call was skipped, so re-arm here
      }
    });
  }
  // resize canvas right away, then whenever the window changes:
  resizeCanvasToDisplaySize(canvas);
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas);
    scheduleDraw();
  });

  // load and compile shaders:
  const vertexSrc = await loadShaderSource("./src/shaders/vertex.glsl");
  const fragmentSrc = await loadShaderSource("./src/shaders/fragment.glsl");
  const program = createProgram(gl, vertexSrc, fragmentSrc);
  gl.useProgram(program);

  // set up a fullscreen quad (two triangles covering clip-space)
  const positionAttribLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  gl.enableVertexAttribArray(positionAttribLocation);
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);

  // uniform locations
  const uTimeLoc = gl.getUniformLocation(program, "u_time");
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uGlucoseLoc = gl.getUniformLocation(program, "u_glucose");
  const uPotassiumLoc = gl.getUniformLocation(program, "u_potassium");
  const uEgfrLoc = gl.getUniformLocation(program, "u_eGFR");
  const uTotalYearsLoc = gl.getUniformLocation(program, "u_totalYears");
  const uLifespanYearsLoc = gl.getUniformLocation(program, "u_lifespanYears");

  const uNitrogenStrengthLoc = gl.getUniformLocation(
    program,
    "u_nitrogenStrength"
  );
  const uNitrogenHueDegLoc = gl.getUniformLocation(program, "u_nitrogenHueDeg");
  const uCreatinineStrengthLoc = gl.getUniformLocation(
    program,
    "u_creatinineStrength"
  );
  const uCreatinineHueDegLoc = gl.getUniformLocation(
    program,
    "u_creatinineHueDeg"
  );
  const uSodiumStrengthLoc = gl.getUniformLocation(program, "u_sodiumStrength");
  const uSodiumHueDegLoc = gl.getUniformLocation(program, "u_sodiumHueDeg");
  const uChlorideStrength = gl.getUniformLocation(
    program,
    "u_chlorideStrength"
  );
  const uChlorideHueDeg = gl.getUniformLocation(program, "u_chlorideHueDeg");
  const uCo2StrengthLoc = gl.getUniformLocation(program, "u_co2Strength");
  const uCo2HueDegLoc = gl.getUniformLocation(program, "u_co2HueDeg");
  const uCalciumStrengthLoc = gl.getUniformLocation(
    program,
    "u_calciumStrength"
  );
  const uCalciumHueDegLoc = gl.getUniformLocation(program, "u_calciumHueDeg");
  const uPAxisNormLoc = gl.getUniformLocation(program, "u_pAxisNorm");
  const uRAxisNormLoc = gl.getUniformLocation(program, "u_rAxisNorm");
  const uQtcNormLoc = gl.getUniformLocation(program, "u_qtcNorm");
  const uQtcPercentileLoc = gl.getUniformLocation(program, "u_qtcPercentile");
  const uPAxisPctLoc = gl.getUniformLocation(program, "u_pAxisPct");
  const uRAxisPctLoc = gl.getUniformLocation(program, "u_rAxisPct");
  const uTAxisPctLoc = gl.getUniformLocation(program, "u_tAxisPct");
  const uPrNormLoc = gl.getUniformLocation(program, "u_prNorm");
  const uVentRateNormLoc = gl.getUniformLocation(program, "u_ventRateNorm");
  const uTAxisNormLoc = gl.getUniformLocation(program, "u_tAxisNorm");
  const uQrsNormLoc       = gl.getUniformLocation(program, "u_qrsNorm");
  const uCo2NormLoc       = gl.getUniformLocation(program, "u_co2Norm");
  const uQrsTAngleLoc     = gl.getUniformLocation(program, "u_qrsTAngle");
  const uVentRatePctLoc   = gl.getUniformLocation(program, "u_ventRatePct");
  const uPrPctLoc         = gl.getUniformLocation(program, "u_prPct");
  const uQrsPctLoc        = gl.getUniformLocation(program, "u_qrsPct");
  const uQrsTAnglePctLoc  = gl.getUniformLocation(program, "u_qrsTAnglePct");
  const uInheritedHueDegLoc = gl.getUniformLocation(program, "u_inheritedHueDeg");
  const uInheritedStrengthLoc = gl.getUniformLocation(program, "u_inheritedStrength");
  const uReanimationProgressLoc    = gl.getUniformLocation(program, "u_reanimationProgress");
  const uPartnerInheritedHueDegLoc = gl.getUniformLocation(program, "u_partnerInheritedHueDeg");
  const uIsLiberatedLoc            = gl.getUniformLocation(program, "u_isLiberated");
  const uVoidProgressLoc           = gl.getUniformLocation(program, "u_voidProgress");

  // Blob size + BUN/Cr ratio uniforms
  const uNitrogenRadiusLoc   = gl.getUniformLocation(program, "u_nitrogenRadius");
  const uCreatinineRadiusLoc = gl.getUniformLocation(program, "u_creatinineRadius");
  const uSodiumRadiusLoc     = gl.getUniformLocation(program, "u_sodiumRadius");
  const uChlorideRadiusLoc   = gl.getUniformLocation(program, "u_chlorideRadius");
  const uCalciumRadiusLoc    = gl.getUniformLocation(program, "u_calciumRadius");
  const uBunCreatRatioNormLoc = gl.getUniformLocation(program, "u_bunCreatRatioNorm");

  // Beam RGB vec3 uniform locations — set per-frame from CPU-precomputed values
  const uNitrogenRGBLoc  = gl.getUniformLocation(program, "u_nitrogenRGB");
  const uCreatRGBLoc     = gl.getUniformLocation(program, "u_creatRGB");
  const uSodiumRGBLoc    = gl.getUniformLocation(program, "u_sodiumRGB");
  const uChlorideRGBLoc  = gl.getUniformLocation(program, "u_chlorideRGB");
  const uCo2RGBLoc       = gl.getUniformLocation(program, "u_co2RGB");
  const uCalciumRGBLoc   = gl.getUniformLocation(program, "u_calciumRGB");
  const uNirvanaRGBLoc   = gl.getUniformLocation(program, "u_nirvanaRGB");
  const uPartnerRGBLoc   = gl.getUniformLocation(program, "u_partnerRGB");

  // ECG and BUN/creatinine rankings come from ecgRanks(drawCollection) at draw
  // time — see the note on that function. They used to be computed here, once,
  // from the baked array, and so could never re-rank as the collection grew.

  let currentDataSetIndex      = /*BAKE:DATASET_INDEX*/5;
  let lastTwoHashDigits        = /*BAKE:HASH_DIGITS*/88;
  let inscriptionUnixSeconds   = /*BAKE:INSCRIPTION_UNIX*/1704067200;
  const BAKED_IS_LIBERATED     = /*BAKE:IS_LIBERATED*/0.0;
  const BAKED_VOID_PROGRESS    = /*BAKE:VOID_PROGRESS*/0.0;
  const YEARS_PER_SECOND = 1 / (365 * 24 * 3600);

  // u_time is sent as float32 (uniform1f), so raw seconds-since-inscription is
  // unusable directly: at two months old its ULP is 0.5s, at two years 8s, and it
  // doubles every ~2 years after that — the value stops changing between frames
  // and the u_time motion freezes, then snaps. Wrapping keeps the magnitude small
  // (ULP ~6e-5s) while staying phase-continuous: every u_time coefficient in
  // fragment.glsl is a multiple of 0.01 rad/s, so 200π seconds advances each term
  // by an exact multiple of 2π. Wrap point is invisible; motion stays deterministic
  // from wall clock, so all viewers of a piece still see the same frame.
  const U_TIME_WRAP = 200 * Math.PI;   // 628.3185s

  // Inherited hue — piece N inherits piece N-1's glucose hue (from allInheritedHues).
  // Console override for manual testing; null = auto-derive from allInheritedHues.
  let inheritedHueDegOverride = null;
  // DEV_START
  window.setInheritedHue = (deg) => { inheritedHueDegOverride = ((deg % 360) + 360) % 360; };
  window.resetInheritedHue = () => { inheritedHueDegOverride = null; };
  // DEV_END

  // Bootstrap — read piece params from script tag attributes (bundle) or URL hash (dev).
  // In bundle: _selfScript is captured by preamble before this code runs.
  //   Child pieces pass: t=N ht=H unix=U hue=D block=B as attributes on the <script> tag.
  //   Piece 0 direct: _selfScript is null → use baked defaults.
  // In dev (index.html ES module): _selfScript is undefined → fall back to URL hash.
  const _sc = (typeof _selfScript !== 'undefined') ? _selfScript : null;
  if (_sc) {
    const _t = _sc.getAttribute('t');
    if (_t !== null) {
      currentDataSetIndex    = parseInt(_t);
      lastTwoHashDigits      = parseInt(_sc.getAttribute('ht'));
      inscriptionUnixSeconds = parseInt(_sc.getAttribute('unix'));
      const _hue = _sc.getAttribute('hue');
      if (_hue !== null) inheritedHueDegOverride = parseFloat(_hue);
    }
  }
  // DEV_START
  if (!_sc) {
    // Dev fallback: URL hash params (#idx=N&ht=H&unix=U&hue=D)
    const _hp = {};
    window.location.hash.slice(1).split('&').forEach(p => {
      const eq = p.indexOf('=');
      if (eq > 0) _hp[p.slice(0, eq)] = p.slice(eq + 1);
    });
    if (_hp.idx) {
      currentDataSetIndex    = parseInt(_hp.idx);
      lastTwoHashDigits      = parseInt(_hp.ht)   || lastTwoHashDigits;
      inscriptionUnixSeconds = parseInt(_hp.unix) || inscriptionUnixSeconds;
      if (_hp.hue != null) inheritedHueDegOverride = parseFloat(_hp.hue);
    }
  }
  // DEV_END

  // Piece N inherits piece N-1's glucose hue, ranked against the LIVE collection.
  // This used to be a baked precompute across healthDataSets, which meant it could
  // not extend past the bundled pieces and never re-ranked as the chain grew.
  // Returns null when the predecessor is not yet discoverable — callers decide
  // what to do with "not known yet" rather than being handed a baked guess.
  function lcInheritedHueFor(pieceIdx) {
    const prev = lcDatasetForPiece(Math.max(0, pieceIdx - 1));
    if (!prev) return null;
    return computeHSBFromStats(prev, lcEffectiveCollection()).hue * 360;
  }
  // Pairs: (0,1),(2,3),(4,5)... piece 0 is genesis — no reanimation
  // Even piece N (N>0): partner = N+1. Odd piece N: partner = N-1.
  function getPartnerIndex(idx) {
    if (idx === 0) return -1; // genesis
    return idx % 2 === 0 ? idx + 1 : idx - 1;
  }
  function getPartnerInheritedHue(idx) {
    const p = getPartnerIndex(idx);
    if (p < 0) return 0;                       // genesis has no partner
    return lcInheritedHueFor(p) ?? 0;          // 0 until the partner is discoverable
  }

  // Entropy pool / reanimation state — baked at mint time, reanimationProgress computed live
  // 0 until the collection resolves — recomputePartnerInheritedHue() sets it once
  // the partner is discoverable. NOT computed here: this runs before `lc` exists,
  // and the live lookup reads it. (Calling it here threw "Cannot access 'lc'
  // before initialization" and the piece never drew at all.)
  let partnerInheritedHueDeg = 0;
  let isLiberated = BAKED_IS_LIBERATED;
  let voidProgress = BAKED_VOID_PROGRESS;
  let __reanimationOverride = null; // declared outside DEV block so bundle can reference it safely
  // DEV_START
  // setReanimation(0..1) — override reanimation progress for dev preview
  window.setReanimation = (p) => {
    __reanimationOverride = Math.max(0, Math.min(1, Number(p)));
    partnerInheritedHueDeg = getPartnerInheritedHue(currentDataSetIndex);
    const pi = getPartnerIndex(currentDataSetIndex);
    if (pi < 0) console.warn('Piece 0 is genesis — no reanimation partner.');
    else console.log(`Reanimation override: ${__reanimationOverride.toFixed(3)} | piece ${currentDataSetIndex} ↔ piece ${pi} | partner hue: ${partnerInheritedHueDeg.toFixed(1)}°`);
  };
  window.clearReanimation = () => { __reanimationOverride = null; };
  // setLiberated(bool) — simulate karma exhaustion and liberation (final cycle)
  window.setLiberated = (v) => {
    isLiberated = v ? 1.0 : 0.0;
    partnerInheritedHueDeg = getPartnerInheritedHue(currentDataSetIndex);
  };
  // setVoidProgress(0..1) — simulate both partners having reached final cessation
  window.setVoidProgress = (v) => { voidProgress = clamp(Number(v), 0, 1); };
  // karma tools — inspect the reanimation system
  const liberationThreshold = computeLiberationThreshold(healthDataSets, minMaxValues);
  window.getKarma = (idxA, idxB) => {
    const blended = blendDatasets(healthDataSets[idxA], healthDataSets[idxB], minMaxValues);
    const rate = karmaClearanceRate(blended, minMaxValues);
    const karma = remainingKarma(blended, 1 - rate, minMaxValues);
    console.log(`Pair (${idxA}, ${idxB}) after one rebirth — clears ${(rate * 100).toFixed(1)}% | remaining karma: ${karma.toFixed(4)} | threshold: ${liberationThreshold.toFixed(4)} | liberated: ${karma < liberationThreshold}`);
    return karma;
  };
  window.getBlend = (idxA, idxB) => {
    const blended = blendDatasets(healthDataSets[idxA], healthDataSets[idxB], minMaxValues);
    console.log('Blended dataset:', blended);
    return blended;
  };
  // DEV_END

  // ── Lifecycle Engine ──────────────────────────────────────────────────────
  // Block-native: cessation, reanimation, liberation, and void are determined
  // by Bitcoin block height. All transitions autonomous — no human triggers.

  const BLOCKS_PER_YEAR = 52596;   // 144 blocks/day × 365.25 days
  const SIBLING_FETCH_BATCH = 8;   // concurrent /r/metadata fetches per batch
  const BLOCK_WINDOW_MS = 600000;  // ~10 min block window for transitions

  const lc = {
    ready:                false,
    ownBlockHeight:       0,
    currentBlockHeight:   0,
    cessationBlock:       0,
    cycleCount:           0,
    cycleDataset:         null,    // blended dataset for current reanimated cycle
    reanimationTriggerMs: null,
    voidTriggerMs:        null,
    reanimationProgress:  0.0,
    isLiberated:          false,
    voidProgress:         0.0,
    collectionDatasets:   [],      // [{id, pieceIndex, dataset, hashTail, inscriptionUnix}]
    uncleared:            1,       // share of karma not yet released; 1 = nothing cleared yet
    collectionResolved:   false,   // true once a sibling fetch has succeeded — from
                                   // then on the collection is what is on chain, and
                                   // the baked array is no longer consulted
    _siblingPollCount:    0,
    ownDataset:           null,    // own dataset fetched from /r/metadata/<ownId> at boot
    collectionRoot:       null,    // engine inscription id whose children list is the collection
  };

  // Resolves as soon as this piece knows its own dataset — either because it is
  // baked (index within healthDataSets) or because its CBOR metadata has landed.
  // Boot waits on this, never on the full sibling scan, so the first frame does
  // not sit behind ~30 network round trips. Always resolves, never rejects: a
  // failed lookup still releases the frame, which then renders from baked data.
  let _releaseOwnData;
  lc.ownDataReady = new Promise((resolve) => { _releaseOwnData = resolve; });
  const lcReleaseOwnData = () => { if (_releaseOwnData) { _releaseOwnData(); _releaseOwnData = null; } };

  // Per-frame: interpolate reanimation and void transition progress values
  function lcTick(nowMs) {
    if (lc.reanimationTriggerMs !== null) {
      lc.reanimationProgress = Math.min(1.0, (nowMs - lc.reanimationTriggerMs) / BLOCK_WINDOW_MS);
    } else if (!lc.isLiberated) {
      lc.reanimationProgress = 0.0;
    }
    if (lc.voidTriggerMs !== null) {
      lc.voidProgress = Math.min(1.0, (nowMs - lc.voidTriggerMs) / BLOCK_WINDOW_MS);
    }
  }

  // Dataset to use for current cycle (original or blended from prior reanimation).
  // For pieces whose index exceeds the baked healthDataSets length, lc.ownDataset
  // (fetched from /r/metadata/self at boot) is the source of truth.
  function lcCycleDataset() {
    if (lc.cycleDataset) return lc.cycleDataset;
    if (lc.ownDataset)   return lc.ownDataset;
    const fromCollection = lc.collectionDatasets.find(d => d.pieceIndex === currentDataSetIndex);
    if (fromCollection)  return fromCollection.dataset;
    return null;   // own metadata has not landed yet
  }

  // The living collection is what this piece can actually SEE on chain — the
  // siblings inscribed so far, plus itself. Not the baked array.
  //
  // This matters more than it looks. The engine carries every dataset compiled in,
  // so seeding the collection from that array meant piece 0 already knew pieces
  // 1..29 before they existed. Inscribing a sibling then taught the engine nothing:
  // it overwrote a baked entry with an identical one, percentiles never moved, and
  // the first N pieces could not affect each other at all. The collection only
  // started living after the baked set was exhausted. That defeats the whole idea.
  //
  // Now: once discovery has succeeded (`lc.collectionResolved`), only discovered
  // datasets count. Piece 0 alone is a collection of one. Piece 1 arrives and both
  // re-rank. Each inscription visibly moves every piece already on chain.
  //
  // The baked array remains the fallback for two cases, both necessary:
  //   - dev / outside ord, where there is no chain to discover anything from
  //   - the moments before the first sibling fetch returns, so the piece renders
  //     immediately instead of holding a blank frame
  // Returns a DENSE array — position N is NOT pieceIndex N when there are gaps,
  // so use lcOwnPosition() for this piece's slot.
  function _lcMergedEntries() {
    const byIndex = new Map();
    for (const d of lc.collectionDatasets) {
      if (typeof d.pieceIndex === 'number' && d.dataset) {
        byIndex.set(d.pieceIndex, { pieceIndex: d.pieceIndex, dataset: d.dataset });
      }
    }
    if (lc.ownDataset) {
      byIndex.set(currentDataSetIndex, { pieceIndex: currentDataSetIndex, dataset: lc.ownDataset });
    }
    // A collection can never be empty — a piece is always at least itself. With
    // no baked array there is nothing else to fall back to, and nothing else is
    // wanted: a piece alone IS a collection of one, which is the true state of
    // piece 0 before any sibling is inscribed.
    return [...byIndex.values()].sort((a, b) => a.pieceIndex - b.pieceIndex);
  }
  // One piece's dataset by pieceIndex, from the merged live view. Null when that
  // piece is not discoverable yet.
  function lcDatasetForPiece(pieceIdx) {
    const hit = _lcMergedEntries().find(e => e.pieceIndex === pieceIdx);
    return hit ? hit.dataset : null;
  }
  function lcEffectiveCollection() {
    return _lcMergedEntries().map(e => e.dataset);
  }
  // Own piece's position in the dense sorted collection (NOT its pieceIndex).
  // getAgedDataset and the inherited-hue index need a position into the dense array;
  // if pieces are non-contiguous (e.g., baked 0..29 + piece 100), the own piece is
  // at position 30 of the collection, not at position 100.
  function lcOwnPosition() {
    return _lcMergedEntries().findIndex(e => e.pieceIndex === currentDataSetIndex);
  }

  // Collection used for rendering — effective collection with this piece's own
  // dense-array position replaced by the post-reanimation blend (lc.cycleDataset),
  // so chronological drift continues forward from the piece's evolved data, not its
  // original snapshot.
  // Age within the CURRENT life, measured in blocks.
  //
  // Reanimation is reincarnation: a piece that has ceased and returned is a
  // newborn again, not permanently ancient. Measuring from inscription pinned
  // lifeFraction at 1.0 for ever once a piece outlived its first lifespan, so
  // every cycle after the first rendered the same frozen terminal frame.
  //
  // Block-native like every other lifecycle event here. Returns null before the
  // chain is known; the caller falls back to wall clock for dev and early boot.
  // Unclamped age within the current life, in years. Unclamped on purpose: between
  // cessation and the reanimation firing, this exceeds the cycle's lifespan, and the
  // shader's dissolution ramp needs exactly that overshoot.
  function lcCycleYears() {
    if (!lc.ready || lc.cycleStartBlock === null) return null;
    return (lc.currentBlockHeight - lc.cycleStartBlock) / BLOCKS_PER_YEAR;
  }
  function lcCycleLifeFraction() {
    if (!lc.ready || lc.cycleStartBlock === null) return null;
    const span = lc.cessationBlock - lc.cycleStartBlock;
    if (!(span > 0)) return null;
    return clamp((lc.currentBlockHeight - lc.cycleStartBlock) / span, 0, 1);
  }

  function getDrawCollection() {
    const base = lcEffectiveCollection();
    if (!lc.cycleDataset) return base;
    const pos = lcOwnPosition();
    if (pos < 0) return base;
    const arr = [...base];
    arr[pos] = lc.cycleDataset;
    return arr;
  }

  // Partner's dataset, strictly from what this piece can see. Null means "not
  // discoverable yet" — callers defer rather than substituting baked data, which
  // would invent an answer for a partner that may not even be inscribed.
  function lcGetPartnerDataset(partnerIdx) {
    return lcDatasetForPiece(partnerIdx);
  }

  // engineId = the inscription ID of the engine bundle currently running (from script src).
  // ownId = the inscription ID of THIS piece, parsed from window.location.pathname
  //   (ord serves pages at /content/<id> or /preview/<id>). The "/self" recursion
  //   shortcut isn't reliable in 0.27, so we resolve own id explicitly and use the
  //   explicit /r/metadata/<id> and /r/parents/<id> endpoints.
  // collectionAncestors = parent chain from own's immediate parent up to the topmost
  //   ancestor (the canonical collection root). The living collection is the union
  //   of children across every ancestor in this chain — so a v2 engine inscribed
  //   under v1 (NEW --parent OLD) lets reinscribed pieces (--parent NEW) see both
  //   their own siblings under NEW and the legacy pieces under OLD.
  const _engineId = _sc ? _sc.getAttribute('src').replace('/content/', '') : null;
  function _resolveOwnId() {
    if (typeof window === 'undefined' || !window.location) return null;
    const m = window.location.pathname.match(/\/(?:content|preview)\/([0-9a-f]{64}i\d+)/i);
    return m ? m[1] : null;
  }
  const _ownId = _resolveOwnId();
  lc.collectionAncestors = [];
  lc.collectionRoot = _engineId;

  // Walk parent chain from own up to topmost ancestor. Returns array of ancestor
  // inscription ids in order [immediate_parent, grandparent, ..., root].
  // Bounded at depth 10 — any deeper would indicate a malformed/circular chain.
  async function lcResolveAncestors() {
    if (!_ownId) return [];
    const ancestors = [];
    let cursor = _ownId;
    for (let depth = 0; depth < 10; depth++) {
      let resp;
      try { resp = await fetch(`/r/parents/${cursor}/inscriptions/0`).then(r => r.json()); }
      catch (e) { break; }
      const parents = resp?.parents ?? resp?.ids ?? [];
      if (parents.length === 0) break;
      const parentId = parents[0].id ?? parents[0];
      if (ancestors.includes(parentId) || parentId === _ownId) break; // cycle guard
      ancestors.push(parentId);
      cursor = parentId;
    }
    return ancestors;
  }

  // Fetch and load all sibling datasets — queries /r/children for every ancestor in
  // the parent chain and merges. lcEffectiveCollection dedups by pieceIndex via Map,
  // so reinscriptions under a deeper engine override originals under the topmost root
  // Ancestors iterated topmost-first so that immediate parent's children are
  // appended last — Map.set last-wins means the newest engine's pieces always
  // override older reinscriptions on the same sat.
  async function lcRefreshSiblings() {
    if (!lc.collectionAncestors || lc.collectionAncestors.length === 0) return;
    const fetched = [];
    // A refresh is only trustworthy if EVERY discovered child answered definitively.
    // See the commit guard at the end of this function for why a partial answer
    // must be thrown away rather than rendered.
    let incomplete = false;
    // MAX_PAGES bounds the walk. ord pages children 100 at a time and sets `more`
    // itself, so a healthy chain ends this loop long before the cap — 100 pages is
    // 10,000 pieces, which this collection will not reach in the artist's lifetime.
    // The cap exists because the engine is immutable: a gateway that answered
    // `more: true` for ever would otherwise spin requests for ever, with no way to
    // ship a fix to a piece already on chain.
    const MAX_PAGES = 100;
    for (const ancestor of [...lc.collectionAncestors].reverse()) {
      let page = 0, more = true;
      while (more && page < MAX_PAGES) {
        let resp;
        try { resp = await fetch(`/r/children/${ancestor}/inscriptions/${page}`).then(r => r.json()); }
        catch (e) { incomplete = true; break; }
        const childIds = (resp.children ?? []).map(c => c.id ?? c).concat(resp.ids ?? []);
        // Fetched in batches rather than one at a time: serially, a collection of
        // N pieces cost N round trips before anything else could proceed, which
        // is what made boot take tens of seconds and grew with every new mint.
        // Batches keep order (chunks run in sequence, Promise.all preserves order
        // within a chunk), so the pieceIndex dedup in _lcMergedEntries resolves
        // exactly as it did before. Capped so a large collection doesn't open
        // hundreds of sockets at once.
        for (let i = 0; i < childIds.length; i += SIBLING_FETCH_BATCH) {
          const batch = childIds.slice(i, i + SIBLING_FETCH_BATCH);
          // 200 → this child has metadata. 404 → it definitively has none, which
          // is the normal answer for the engine inscription and any other non-piece
          // child; that is a complete answer, not a failure. Anything else, or a
          // thrown request, is a transport failure: the child may well be a piece
          // we simply could not read. Those two cases used to be collapsed into
          // the same `null` by a bare .catch(), which is what let a flaky gateway
          // silently shrink the collection.
          const results = await Promise.all(batch.map(id =>
            fetch(`/r/metadata/${id}`)
              .then(r => {
                if (r.status === 404) return { id, hex: null };
                if (!r.ok) return null;
                return r.json().then(hex => ({ id, hex }));
              })
              .catch(() => null)
          ));
          for (const res of results) {
            if (!res) { incomplete = true; continue; }
            const { id, hex } = res;
            if (!hex || typeof hex !== 'string' || !hex.trim()) continue;
            try {
              const meta = cborDecode(hex.trim());
              if (meta && meta.dataset) {
                fetched.push({
                  id,
                  pieceIndex:      meta.pieceIndex      ?? null,
                  dataset:         meta.dataset,
                  hashTail:        meta.hashTail         ?? null,
                  inscriptionUnix: meta.inscriptionUnix  ?? null,
                });
              }
            } catch (e) { /* skip — engine inscriptions have no .dataset and end up here */ }
          }
        }
        more = resp.more ?? false;
        page++;
      }
    }
    // Every ranking the piece renders — percentiles, min/max ranges, karma, hue —
    // is computed across the WHOLE collection. So a refresh that silently dropped
    // pieces does not render "slightly stale": it re-ranks everything against a
    // collection that never existed, and the piece looks wrong until the next
    // refresh ten minutes later. A gateway hiccup must never be able to do that.
    //
    // A complete refresh is authoritative and always commits — the collection is
    // allowed to shrink for real reasons. An incomplete one commits only if it is
    // still an improvement on what we hold, which matters at boot: 25 of 30 pieces
    // beats rendering as a collection of one while the fetch is retried.
    const have = lc.collectionDatasets.length;
    if (fetched.length > 0 && (!incomplete || fetched.length > have)) {
      lc.collectionDatasets = fetched;
      // Discovery succeeded: from here the collection is strictly what is on chain.
      // Set before refreshing min/max so those are computed from the live set, not
      // the baked one.
      if (!incomplete) lc.collectionResolved = true;
      refreshMinMaxValues(lcEffectiveCollection());
      recomputePartnerInheritedHue();
      console.log(`[lc] collection resolved — ${fetched.length} piece(s) on chain${incomplete ? ' (partial — some children unreadable, will retry)' : ''}`);
    } else if (incomplete) {
      console.warn(`[lc] refresh incomplete — read ${fetched.length} of at least ${have}; keeping the collection already resolved`);
    }
  }

  // Recompute partner's inherited hue from the live collection — needed when the
  // partner's index exceeds the bundled healthDataSets length (allInheritedHues is
  // baked at module load and doesn't extend beyond the bundle).
  function recomputePartnerInheritedHue() {
    const p = getPartnerIndex(currentDataSetIndex);
    if (p < 0) return;                 // genesis has no partner
    const hue = lcInheritedHueFor(p);  // null while the partner is undiscovered
    if (hue !== null) partnerInheritedHueDeg = hue;
  }

  // Check if partner has also reached final cessation — trigger void if so
  // Simulate the partner's full cycle history to determine if they are truly liberated.
  // Mirrors lcFastForward but from the partner's perspective:
  //   blendDatasets(partnerCycleDs, thisDs) — partner is successor (70%), this piece is predecessor (30%).
  // Fetches cessation block hashes on-chain to derive each new lifespan, capped at 50 cycles.
  // Returns true only if the partner has exhausted karma and reached their final state.
  async function lcIsPartnerLiberated(pd, pInscriptionHeight) {
    let pCessationBlock = pInscriptionHeight + Math.round(lifespanYearsFromHashDigits(pd.hashTail) * BLOCKS_PER_YEAR);
    let pCycleDs = pd.dataset;
    // The partner clears burden across its own rebirths at its own rate, exactly
    // as this piece does. Replayed from the partner's birth, not stored.
    let pUncleared = 1;
    const myDs = lcCycleDataset();
    const collection = lcEffectiveCollection();
    // Loop exits via: return false (partner alive), return true (partner liberated),
    // or return false (fetch failed — retry on next poll). No artificial cap.
    while (true) {
      if (lc.currentBlockHeight < pCessationBlock) return false; // partner still alive in this cycle
      const blended   = blendDatasets(pCycleDs, myDs, minMaxValues);
      const threshold = computeLiberationThreshold(collection, minMaxValues);
      pUncleared     *= (1 - karmaClearanceRate(blended, minMaxValues));
      const karma     = remainingKarma(blended, pUncleared, minMaxValues);
      if (karma < threshold) return true; // partner liberated
      // Partner reanimates — fetch next cessation block hash to derive new lifespan
      pCycleDs = blended;
      try {
        const bi = await fetch(`/r/blockinfo/${pCessationBlock}`).then(r => r.json());
        const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
        pCessationBlock += Math.round(lifespanYearsFromHashDigits(ht) * BLOCKS_PER_YEAR);
      } catch (e) { return false; } // block info unavailable — assume not yet liberated, retry next poll
    }
  }

  // Check if partner has also reached final liberation — trigger void if so.
  async function lcCheckVoid() {
    const partnerIdx = getPartnerIndex(currentDataSetIndex);
    // piece 0 is genesis — liberates immediately but void requires piece 1 to also be liberated
    if (partnerIdx < 0) {
      const pd1 = lc.collectionDatasets.find(d => d.pieceIndex === 1);
      if (!pd1 || pd1.hashTail == null) return;
      try {
        const pInfo = await fetch(`/r/inscription/${pd1.id}`).then(r => r.json());
        const partnerLiberated = await lcIsPartnerLiberated(pd1, pInfo.height ?? 0);
        if (partnerLiberated) {
          lc.voidTriggerMs = Date.now();
          console.log('[lc] VOID — piece 0 genesis: piece 1 liberated');
        }
      } catch (e) { /* piece 1 state unknown — void pending */ }
      return;
    }
    const pd = lc.collectionDatasets.find(d => d.pieceIndex === partnerIdx);
    if (!pd || pd.hashTail == null) return; // partner metadata not yet available — will retry on next poll
    try {
      const pInfo = await fetch(`/r/inscription/${pd.id}`).then(r => r.json());
      const partnerLiberated = await lcIsPartnerLiberated(pd, pInfo.height ?? 0);
      if (partnerLiberated) {
        lc.voidTriggerMs = Date.now();
        console.log('[lc] VOID — both partners liberated');
      }
    } catch (e) { /* partner state unknown — void pending */ }
  }

  // Poll block height, detect cessation, trigger reanimation or liberation
  async function lcPoll() {
    try { lc.currentBlockHeight = await fetch('/r/blockheight').then(r => r.json()); }
    catch (e) { return; }

    if (lc.currentBlockHeight >= lc.cessationBlock && !lc.isLiberated && lc.reanimationTriggerMs === null) {
      const partnerIdx = getPartnerIndex(currentDataSetIndex);
      if (partnerIdx < 0) {
        lc.isLiberated = true;
        await lcCheckVoid();
        return;
      }
      // Partner dataset from the chain only. If the partner is not discoverable
      // yet — sibling fetch lagged, or it is not inscribed — defer reanimation to
      // the next poll rather than reanimating against invented data.
      const partnerDs = lcGetPartnerDataset(partnerIdx);
      if (!partnerDs) {
        console.warn(`[lc] partner ${partnerIdx} not yet discoverable — deferring reanimation`);
        return;
      }
      const blended    = blendDatasets(lcCycleDataset(), partnerDs, minMaxValues);
      const threshold  = computeLiberationThreshold(lcEffectiveCollection(), minMaxValues);
      // This rebirth clears a share of the burden, at the piece's own kidney
      // clearance rate. lc.uncleared carries across cycles and is never stored —
      // lcFastForward replays it from birth, so it stays chain-derivable.
      lc.uncleared    *= (1 - karmaClearanceRate(blended, minMaxValues));
      const karma      = remainingKarma(blended, lc.uncleared, minMaxValues);

      if (karma < threshold) {
        lc.isLiberated  = true;
        lc.cycleDataset = blended;
        console.log(`[lc] LIBERATED — remaining karma ${karma.toFixed(4)} < threshold ${threshold.toFixed(4)} after ${lc.cycleCount} cycle(s)`);
        await lcCheckVoid();
      } else {
        lc.reanimationTriggerMs = Date.now();
        lc.cycleCount++;
        lc.cycleDataset = blended;
        // A new life starts where the old one ended, and gets its own lifespan.
        lc.cycleStartBlock = lc.cessationBlock;
        try {
          const bi = await fetch(`/r/blockinfo/${lc.cessationBlock}`).then(r => r.json());
          const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
          lc.cycleLifespanYears = lifespanYearsFromHashDigits(ht);
        } catch (e) {
          lc.cycleLifespanYears = lifespanYears;
        }
        lc.cessationBlock += Math.round(lc.cycleLifespanYears * BLOCKS_PER_YEAR);
        console.log(`[lc] REANIMATION cycle ${lc.cycleCount} — next cessation block ${lc.cessationBlock}`);
      }
    }

    if (lc.isLiberated && lc.voidTriggerMs === null) await lcCheckVoid();

    // Once resolved, a ten-minute cadence is plenty — new siblings arrive every
    // few months. But while the collection is still UNRESOLVED the piece may be
    // rendering on partial data, or on nothing at all if its own metadata fetch
    // was the request that failed. Ten minutes of black waiting on the next
    // scheduled refresh is not acceptable when a retry costs one request, so
    // retry every poll until the chain answers completely.
    lc._siblingPollCount++;
    if (!lc.collectionResolved || lc._siblingPollCount % 10 === 0) {
      lcRefreshSiblings().catch(() => {});
    }
  }

  // Fast-forward through past cycles on first load (handles pieces loaded years after mint)
  async function lcFastForward() {
    while (lc.currentBlockHeight >= lc.cessationBlock && !lc.isLiberated) {
      const partnerIdx = getPartnerIndex(currentDataSetIndex);
      if (partnerIdx < 0) { lc.isLiberated = true; break; }
      const partnerDs = lcGetPartnerDataset(partnerIdx);
      if (!partnerDs) {
        console.warn(`[lc] fast-forward: partner ${partnerIdx} not discoverable — stopping replay`);
        break;
      }
      const blended   = blendDatasets(lcCycleDataset(), partnerDs, minMaxValues);
      const threshold = computeLiberationThreshold(lcEffectiveCollection(), minMaxValues);
      lc.uncleared   *= (1 - karmaClearanceRate(blended, minMaxValues));
      const karma     = remainingKarma(blended, lc.uncleared, minMaxValues);
      if (karma < threshold) { lc.isLiberated = true; lc.cycleDataset = blended; break; }
      lc.cycleCount++;
      lc.cycleDataset = blended;
      lc.cycleStartBlock = lc.cessationBlock;   // each replayed life starts where the last ended
      let _stop = false;
      try {
        const bi = await fetch(`/r/blockinfo/${lc.cessationBlock}`).then(r => r.json());
        const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
        lc.cycleLifespanYears = lifespanYearsFromHashDigits(ht);
      } catch (e) { lc.cycleLifespanYears = lifespanYears; _stop = true; }
      lc.cessationBlock += Math.round(lc.cycleLifespanYears * BLOCKS_PER_YEAR);
      if (_stop) break;
    }
  }

  // Main lifecycle init — non-blocking, piece renders immediately with local fallback
  async function initLifecycle() {
    try {
      // Every minted piece carries its block height as a <script> attribute, so
      // this is the normal path. The fallback exists for a piece loaded without
      // one (engine viewed directly, hand-built wrapper, dev).
      //
      // The fallback queries the explicitly resolved own id, not "/self" — the
      // /self shortcut is unreliable in ord 0.27, which is exactly why v3 resolves
      // _ownId from the URL for metadata and parents (see _resolveOwnId above).
      //
      // A missing height is fatal, not a default. ownBlockHeight is the origin of
      // the entire clock: defaulting it to 0 put cessation ~5.26M blocks out, so
      // the piece would never cease and nothing would say why.
      const _blk = _sc ? _sc.getAttribute('block') : null;
      if (_blk !== null && _blk !== '' && Number.isFinite(parseInt(_blk))) {
        lc.ownBlockHeight = parseInt(_blk);
      } else {
        const selfPath = _ownId ? `/r/inscription/${_ownId}` : '/r/inscription/self';
        const selfInfo = await fetch(selfPath).then(r => r.json());
        if (!Number.isFinite(selfInfo?.height)) {
          throw new Error(`[lc] no block height from ${selfPath} — cannot start the lifecycle clock`);
        }
        lc.ownBlockHeight = selfInfo.height;
      }
      lc.cessationBlock  = lc.ownBlockHeight + Math.round(lifespanYears * BLOCKS_PER_YEAR);
      lc.cycleStartBlock    = lc.ownBlockHeight;   // the first life begins at inscription
      lc.cycleLifespanYears = lifespanYears;
      lc.currentBlockHeight = await fetch('/r/blockheight').then(r => r.json());

      // Walk the parent chain up to the topmost ancestor. Every ancestor's children
      // contribute to the living collection (so a v2 engine under a v1 engine sees
      // both branches: reinscribed pieces under v2 + originals under v1).
      if (_ownId) {
        lc.collectionAncestors = await lcResolveAncestors();
        if (lc.collectionAncestors.length > 0) {
          lc.collectionRoot = lc.collectionAncestors[lc.collectionAncestors.length - 1];
        }

        // Own dataset from /r/metadata/<ownId> — required for pieces whose index
        // exceeds the baked healthDataSets length. Use r.json() to unwrap the
        // JSON-quoted hex string ord returns. Falls back silently in dev mode.
        try {
          const ownHex = await fetch(`/r/metadata/${_ownId}`).then(r => r.json());
          if (ownHex && typeof ownHex === 'string' && ownHex.trim()) {
            const ownMeta = cborDecode(ownHex.trim());
            if (ownMeta && ownMeta.dataset) {
              lc.ownDataset = ownMeta.dataset;
              // Seed collection so the very first draw has valid own data even
              // before the full sibling fetch completes.
              lc.collectionDatasets = [{
                id:               _ownId,
                pieceIndex:       ownMeta.pieceIndex ?? currentDataSetIndex,
                dataset:          ownMeta.dataset,
                hashTail:         ownMeta.hashTail ?? null,
                inscriptionUnix:  ownMeta.inscriptionUnix ?? null,
              }];
            }
          }
        } catch (e) { /* dev mode or no metadata — baked array carries dev */ }
      }
      // Own data is as resolved as it is going to get — release the first frame.
      // Everything below is collection-wide and must not hold up rendering.
      lcReleaseOwnData();

      await lcRefreshSiblings();
      await lcFastForward();
      if (lc.isLiberated && lc.voidTriggerMs === null) await lcCheckVoid();
      setInterval(lcPoll, 60000);
      lc.ready = true;
      console.log(`[lc] ready — block ${lc.currentBlockHeight}, cessation ${lc.cessationBlock}, cycle ${lc.cycleCount}, liberated: ${lc.isLiberated}`);
    } catch (e) {
      console.warn('[lc] lifecycle engine inactive (not in ord env)', e);
      // DEV_START
      // No chain to discover from. Seed the living collection from the repo file
      // so dev drives the SAME code path as chain rather than a second one that
      // only dev ever takes — that divergence is why these bugs went unseen.
      if (typeof healthDataSets !== 'undefined' && healthDataSets.length) {
        lc.collectionDatasets = healthDataSets.map((d, i) => ({
          id: null, pieceIndex: i, dataset: d, hashTail: null, inscriptionUnix: null,
        }));
        lc.ownDataset = healthDataSets[currentDataSetIndex]
                     ?? healthDataSets[healthDataSets.length - 1];
        lc.collectionResolved = true;
        refreshMinMaxValues(lcEffectiveCollection());
        recomputePartnerInheritedHue();
        console.log(`[lc] dev — seeded ${healthDataSets.length} piece(s) from the local file`);
      }
      // DEV_END
    } finally {
      // Never leave boot waiting — if init threw before the own-metadata step,
      // the piece still renders from baked data.
      lcReleaseOwnData();
    }
  }

  // recordCanvas(seconds) — captures directly from the WebGL canvas to a .webm download
  let _recorder = null;
  window.recordCanvas = (seconds = 10) => {
    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      _recorder = null;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `cessation_${currentDataSetIndex}_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    _recorder = recorder;
    recorder.start();
    console.log(`[R] recording started — press R again to stop`);
    if (seconds) setTimeout(() => { if (_recorder) _recorder.stop(); }, seconds * 1000);
  };

  // Collector key bindings
  // F — toggle fullscreen
  // R — toggle video recording
  // S — save high-res PNG snapshot
  window.addEventListener('keydown', (e) => {
    if (e.target !== document.body && e.target !== document.documentElement) return;
    const key = e.key.toUpperCase();

    if (key === 'F') {
      const container = document.getElementById('canvas-container');
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => console.warn('[F] fullscreen error:', err));
      } else {
        document.exitFullscreen();
      }
    }

    if (key === 'R') {
      if (_recorder && _recorder.state === 'recording') {
        _recorder.stop();
        console.log('[R] recording stopped — saving...');
      } else {
        window.recordCanvas(0); // 0 = no auto-stop
      }
    }

    if (key === 'S') {
      draw(); // ensure latest frame
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `cessation_${currentDataSetIndex}_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[S] snapshot saved');
      }, 'image/png');
    }
  });

  const hash01 = lastTwoHashDigits / 99; // 0..1
  const signed = (hash01 - 0.5) * 2; // -1..+1

  // Tuned per-beam ranges (degrees)
  const nudgeNa = 12 * signed; 
  const nudgeCl = 14 * signed; 
  const nudgeCO2 = 18 * signed;  
  const nudgeCa = 12 * signed; 

  // decay test helpers
  const params = {
    overrideYears: null,
    timeWarp: 1.0,
    previewSpeedYPS: 0,
  };

  // Ripple pulses for CO2 / Calcium (decay over preview-time seconds)
  let co2Pulse = 0,
    caPulse = 0;

  // DEV_START
  // Console triggers (later hook these to real mint events)
  window.ripple = () => {
    // single ripple: CO2 stronger, Ca smaller
    co2Pulse = Math.min(1, co2Pulse + 0.55);
    caPulse = Math.min(1, caPulse + 0.35);
  };
  window.bigRipple = () => {
    // larger event
    co2Pulse = Math.min(1, co2Pulse + 0.85);
    caPulse = Math.min(1, caPulse + 0.55);
  };
  // setLifeFraction(0..1) — 0.0 = birth, 1.0 = cessation
  window.setLifeFraction = (f) => {
    params.overrideYears = f == null ? null : clamp(Number(f), 0, 1) * lifespanYears;
  };
  window.clearLifeFraction = () => {
    params.overrideYears = null;
  };
  window.timeWarp = (f) => {
    params.timeWarp = Math.max(0, Number(f));
  };
  window.playPreview = (speedYPS = 4) => {
    params.previewSpeedYPS = Math.max(0, Number(speedYPS));
  };
  window.stopPreview = () => {
    params.previewSpeedYPS = 0;
  };

  // previewPairing(cycles) — actually render the post-reanimation piece.
  //
  // setReanimation() only ramps the transition uniform; the piece underneath is
  // still its own dataset. What a piece BECOMES after pairing lives in
  // lc.cycleDataset, which only lcPoll/lcFastForward set — and neither runs
  // outside ord. This mirrors lcFastForward's loop exactly (blend own with
  // partner, karma against the live threshold, repeat) so what you see here is
  // what the chain will do.
  //
  //   previewPairing()    → one cycle: the piece after its first reanimation
  //   previewPairing(5)   → five cycles: how a pair converges late in life
  //   clearPairing()      → back to the original dataset
  window.previewPairing = (cycles = 1) => {
    const partnerIdx = getPartnerIndex(currentDataSetIndex);
    if (partnerIdx < 0) {
      console.warn('Piece 0 is genesis — it liberates directly, with no partner to blend with.');
      return null;
    }
    const partnerDs = lcGetPartnerDataset(partnerIdx);
    if (!partnerDs) {
      console.warn(`Partner ${partnerIdx} has no dataset — it is not in the collection yet. A piece cannot reanimate before its partner exists.`);
      return null;
    }
    for (let i = 1; i <= Math.max(1, Number(cycles)); i++) {
      const blended   = blendDatasets(lcCycleDataset(), partnerDs, minMaxValues);
      const threshold = computeLiberationThreshold(lcEffectiveCollection(), minMaxValues);
      const rate      = karmaClearanceRate(blended, minMaxValues);
      lc.uncleared   *= (1 - rate);
      const karma     = remainingKarma(blended, lc.uncleared, minMaxValues);
      lc.cycleDataset = blended;
      const liberates = karma < threshold;
      console.log(`cycle ${i}: piece ${currentDataSetIndex} ↔ ${partnerIdx} | cleared ${(rate * 100).toFixed(1)}% this rebirth (${(lc.uncleared * 100).toFixed(1)}% of burden remains) | karma ${karma.toFixed(4)} vs threshold ${threshold.toFixed(4)} | ${liberates ? 'LIBERATES — this is the final cycle' : 'reanimates again'}`);
      if (liberates) {
        isLiberated = 1.0;
        const asked = Math.max(1, Number(cycles));
        if (i < asked) console.log(`(stopped at cycle ${i} of ${asked} — the piece has liberated, so later cycles do not exist. Try a piece with more burden to see a longer run.)`);
        break;
      }
    }
    return lc.cycleDataset;
  };
  window.clearPairing = () => {
    lc.cycleDataset = null;
    lc.uncleared    = 1;
    isLiberated = BAKED_IS_LIBERATED;
    console.log('Pairing preview cleared — rendering the original dataset.');
  };
  // DEV_END

  // lifespan + aligned rate
  let lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);

  // set uniforms
  function setHSBUniforms(ds, collection) {
    const { hue, sat, bri } = computeHSBFromStats(ds, collection);
    gl.uniform1f(uGlucoseLoc, hue);
    gl.uniform1f(uPotassiumLoc, sat);
    gl.uniform1f(uEgfrLoc, bri);
  }

  function setResolutionUniform() {
    gl.uniform2f(uResolutionLoc, gl.canvas.width, gl.canvas.height);
  }

  // ─── Beam configurations ────────────────────────────────────────────────────
  const beamPhases = {};
  const beamConfigs = [
    {
      label: 'N (BUN)', labKey: 'nitrogen', phaseKey: 'N',
      phaseSeed: (h) => (h / 99) * 2 * Math.PI, tickTwoPi: true,
      tempoFn: (ds, coll) => getBeamTempoSeconds(ds, BEAM.NITROGEN, coll),
      strengthLoc: uNitrogenStrengthLoc, hueLoc: uNitrogenHueDegLoc, radiusLoc: uNitrogenRadiusLoc,
      update({ ph, p, ds, coll }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp(0.58 * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.35 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.NITROGEN, coll) + (10 + 8 * p) * Math.sin(ph * 0.93 + 0.14);
        return { str, hue };
      },
    },
    {
      label: 'C (Cr)', labKey: 'creatinine', phaseKey: 'C',
      phaseSeed: (h) => (h / 99) * 1.3 * Math.PI, tickTwoPi: true,
      tempoFn: (ds, coll) => getBeamTempoSeconds(ds, BEAM.CREATININE, coll),
      strengthLoc: uCreatinineStrengthLoc, hueLoc: uCreatinineHueDegLoc, radiusLoc: uCreatinineRadiusLoc,
      update({ ph, p, ds, coll }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp((0.4 + 0.3 * p) * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.3 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.CREATININE, coll) + (8 + 5 * p) * Math.sin(ph * 1.07 + 0.08);
        return { str, hue };
      },
    },
    {
      label: 'Na', labKey: 'sodium', phaseKey: 'Na',
      phaseSeed: (h) => sodiumPhaseSeed(h), tickTwoPi: false,
      tempoFn: (ds) => sodiumTempoSeconds(ds),
      strengthLoc: uSodiumStrengthLoc, hueLoc: uSodiumHueDegLoc, radiusLoc: uSodiumRadiusLoc,
      update({ ph, p, ds, baseHueDeg, totalYears }) {
        const arr = sodiumArrivalProgress(totalYears, lifespanYears);
        const amp = sodiumAmplitude(ds, ds.healthIndex ?? 0.5, arr, p);
        let hue = sodiumHueDeg(baseHueDeg, ds, p) + nudgeNa;
        hue += (16 + 4 * p) * Math.sin(ph * 0.82 + 0.32);
        // Always present from day 1 at data-driven floor; arrival gate grows it to full prominence
        const baseStr = 0.06 + 0.10 * p;
        const arrivedStr = clamp(amp * sodiumPulseShape(ph, sodiumPulseCount(ds), 0.12), 0, 1);
        const str = clamp(baseStr + arrivedStr, 0, 1);
        return { str, hue };
      },
    },
    {
      label: 'Cl', labKey: 'chloride', phaseKey: 'Cl',
      phaseSeed: (h) => chloridePhaseSeed(h), tickTwoPi: false,
      tempoFn: (ds) => chlorideTempoSeconds(ds),
      strengthLoc: uChlorideStrength, hueLoc: uChlorideHueDeg, radiusLoc: uChlorideRadiusLoc,
      update({ ph, p, ds, baseHueDeg, totalYears }) {
        const arr = chlorideArrivalProgress(totalYears, lifespanYears);
        const amp = chlorideAmplitude(ds, ds.healthIndex ?? 0.5, arr, p);
        let hue = chlorideHueDeg(baseHueDeg, p) + nudgeCl;
        hue += (12 + 6 * p) * Math.sin(ph * 0.88 - 0.24);
        // Always present from day 1 at data-driven floor; arrival gate grows it to full prominence
        const baseStr = 0.05 + 0.09 * p;
        const arrivedStr = clamp(amp * chlorideTriWithWarble(ph, ds), 0, 1);
        const str = clamp(baseStr + arrivedStr, 0, 1);
        return { str, hue };
      },
    },
    {
      label: 'CO2', labKey: 'carbonDioxide', phaseKey: 'CO2',
      phaseSeed: (h) => (h / 99) * 1.1 * Math.PI, tickTwoPi: true,
      tempoFn: (ds, coll) => getBeamTempoSeconds(ds, BEAM.CO2, coll),
      strengthLoc: uCo2StrengthLoc, hueLoc: uCo2HueDegLoc, radiusLoc: null,
      update({ ph, p, baseHueDeg, co2Pulse }) {
        const str = clamp(0.26 + 0.18 * (1 - p) + 0.22 * co2Pulse, 0, 0.62);
        let hue = baseHueDeg - (24 + 12 * p) + nudgeCO2;
        hue = guardHueGap(baseHueDeg, hue, 30, -1);
        hue += (12 + 6 * p) * Math.sin(ph * 1.0 + 0.2);
        return { str, hue };
      },
    },
    {
      label: 'Ca', labKey: 'calcium', phaseKey: 'Ca',
      phaseSeed: (h) => (h / 99) * 0.7 * Math.PI, tickTwoPi: true,
      tempoFn: (ds, coll) => getBeamTempoSeconds(ds, BEAM.CALCIUM, coll),
      strengthLoc: uCalciumStrengthLoc, hueLoc: uCalciumHueDegLoc, radiusLoc: uCalciumRadiusLoc,
      update({ ph, p, baseHueDeg, caPulse, pCO2, pPR }) {
        const str = clamp(0.06 + 0.08 * (1 - pCO2) + 0.16 * caPulse, 0, 0.30);
        let hue = baseHueDeg + (45 + 25 * p) + nudgeCa;
        hue = guardHueGap(baseHueDeg, hue, 32, +1);
        hue += (10 + 6 * pPR) * Math.sin(ph * 0.92 - 0.13);
        return { str, hue };
      },
    },
  ];

  // Pre-advance beam phases from birth so each page load starts mid-cycle,
  // not at the hash-seeded zero position. The phase a beam is at on any given
  // day is fully deterministic: seed + (secsSinceBirth / tempo) % period.
  // Uses the initial baked dataset's tempo as the approximation — tempo drifts
  // slightly with chronological drift but the error is negligible vs. the
  // alternative of always starting at the beginning.
  {
    // A piece minted after the engine has no baked entry — its dataset arrives
    // later via its own CBOR metadata. Every tempoFn dereferences the dataset,
    // so an undefined here throws inside init() and the piece never draws at all.
    // Fall back to the last baked dataset: tempo is already documented above as
    // an approximation, and being slightly off beats not rendering.
    // Own dataset only. Boot now awaits lc.ownDataReady before the first draw,
    // so this is populated by the time it is read; the guard below still skips
    // the pre-advance rather than throwing if it somehow is not.
    const _initDs = lcCycleDataset();
    const _initSecs = Math.max(0, Date.now() / 1000 - inscriptionUnixSeconds);
    for (const cfg of beamConfigs) {
      if (!_initDs) break;   // no own data yet — phases start at their seed
      const seed  = cfg.phaseSeed(lastTwoHashDigits);
      const tempo = Math.max(1e-3, cfg.tempoFn(_initDs, lcEffectiveCollection()));
      if (cfg.tickTwoPi) {
        // Accumulates radians — no need to mod, JS Math.sin handles large args.
        beamPhases[cfg.phaseKey] = seed + (_initSecs * 2 * Math.PI) / tempo;
      } else {
        // Kept in [0, 1) by modding after each frame advance.
        beamPhases[cfg.phaseKey] = (seed + _initSecs / tempo) % 1;
      }
    }
  }

  // the draw() call just clears and draws the quad:
  function draw() {
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = performance.now() / 1000;
    // u_time = seconds since inscription (not since page load), wrapped at
    // U_TIME_WRAP for float32 precision. Pieces are born at inscription and count
    // forward from that moment — each page load finds the piece mid-motion, never
    // restarting from zero.
    const secsSinceBirth = Math.max(0, Date.now() / 1000 - inscriptionUnixSeconds);
    if (uTimeLoc) gl.uniform1f(uTimeLoc, secsSinceBirth % U_TIME_WRAP);
    window.__lastT = window.__lastT ?? t;
    const dt = Math.min(0.1, Math.max(0, t - window.__lastT));
    window.__lastT = t;

    const nowUnix = Math.floor(Date.now() / 1000);
    // Sync from lifecycle engine each frame
    lcTick(Date.now());
    const reanimationProgress = (typeof __reanimationOverride !== 'undefined' && __reanimationOverride !== null)
      ? __reanimationOverride
      : lc.reanimationProgress;
    if (lc.ready) {
      isLiberated  = lc.isLiberated ? 1.0 : (BAKED_IS_LIBERATED > 0 ? 1.0 : 0.0);
      voidProgress = lc.voidProgress;
    }
    const baseYears =
      Math.max(0, nowUnix - inscriptionUnixSeconds) * YEARS_PER_SECOND;

    if (params.overrideYears !== null && params.previewSpeedYPS > 0) {
      params.overrideYears += params.previewSpeedYPS * dt;
    }

    const totalYears =
      (params.overrideYears !== null ? params.overrideYears : baseYears) *
      (params.timeWarp || 1);

    // Chronological drift: piece ages through the real health timeline each frame.
    // drawCollection is the live sibling collection (own position replaced by the
    // post-reanimation blend) — falls back to local healthDataSets in dev/early boot.
    // This cycle's age once the chain is known; wall clock otherwise.
    const _cycLF = lcCycleLifeFraction();
    const lifeFraction = _cycLF !== null ? _cycLF : clamp(totalYears / lifespanYears, 0, 1);
    const drawCollection = getDrawCollection();
    // NOTHING TO DRAW YET. With no baked array the collection is empty until this
    // piece's own CBOR metadata lands, and every step below dereferences a dataset.
    // Bail on a clear frame rather than throwing: a piece that throws in draw()
    // never renders again, which is how v1 failed.
    //
    // KEEP THE LOOP ALIVE. This used to `return` outright, on the assumption that
    // something would call draw() again once data arrived. Nothing does — the only
    // other callers are the boot one-shot, a resize handler, and dev helpers. So a
    // single failed /r/metadata/<ownId> at boot released ownDataReady early, this
    // frame found an empty collection, the loop was never re-armed, and the piece
    // stayed black FOR EVER even though its siblings resolved a second later. Only
    // resizing the window brought it back. Re-arming costs one idle frame and makes
    // the piece recover by itself from any transient gateway failure.
    if (!drawCollection.length) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      scheduleDraw();
      return;
    }
    // minMaxValues is derived, not imported — populate it before anything reads it.
    ensureMinMax(drawCollection);
    const _ecg = ecgRanks(drawCollection);
    // getAgedDataset expects a POSITION into the dense drawCollection, not a
    // pieceIndex. They coincide when pieces are contiguous (0..N-1), but for
    // non-contiguous collections (e.g., baked 0..29 + piece 100), own pieceIndex
    // 100 is at position 30 in the collection. Falls back to pieceIndex for the
    // dev/early-boot path where own piece isn't yet in the collection.
    const ownPos = lcOwnPosition();
    const startIdx = ownPos >= 0 ? ownPos : Math.min(currentDataSetIndex, drawCollection.length - 1);
    const activeDataSet = applyCollectionInfluence(
      getAgedDataset(startIdx, lifeFraction, drawCollection, minMaxValues),
      drawCollection,
      lifeFraction,
      minMaxValues
    );
    setHSBUniforms(activeDataSet, drawCollection);

    // CYCLE-RELATIVE, not measured from inscription.
    //
    // The shader derives its OWN lifeFraction and its nirvanaProgress dissolution
    // ramp from these two numbers, so feeding it inscription-relative years meant
    // that once a piece was half a year past its FIRST lifespan,
    //     nirvanaProgress = clamp((u_totalYears - u_lifespanYears)/0.5, 0, 1)
    // saturated at 1.0 for ever. finalColor became pure nirvanaState, and with
    // reanimationProgress back at 0 that is u_nirvanaRGB * 0.90 — a single flat
    // colour over the whole canvas. Every reanimated piece stopped being artwork.
    //
    // Reincarnation means each life ages from zero, so the shader is told about the
    // CURRENT life: how far into it we are, and how long it is meant to last.
    const _cycY = lcCycleYears();
    gl.uniform1f(uTotalYearsLoc,    _cycY !== null ? _cycY : totalYears);
    gl.uniform1f(uLifespanYearsLoc, (_cycY !== null && lc.cycleLifespanYears) ? lc.cycleLifespanYears : lifespanYears);

    // ECG axis uniforms — pAxis and rAxis normalized over dataset min/max
    const pAxisNorm = clamp(
      normalize(activeDataSet.ecg.pAxis, minMaxValues.pAxis.min, minMaxValues.pAxis.max),
      0, 1
    );
    const rAxisNorm = clamp(
      normalize(activeDataSet.ecg.rAxis, minMaxValues.rAxis.min, minMaxValues.rAxis.max),
      0, 1
    );
    if (uPAxisNormLoc) gl.uniform1f(uPAxisNormLoc, pAxisNorm);
    if (uRAxisNormLoc) gl.uniform1f(uRAxisNormLoc, rAxisNorm);

    const qtcNorm = clamp(
      normalize(activeDataSet.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max),
      0, 1
    );
    const prNorm = clamp(
      normalize(activeDataSet.ecg.prInterval, minMaxValues.prInterval.min, minMaxValues.prInterval.max),
      0, 1
    );
    if (uQtcNormLoc) gl.uniform1f(uQtcNormLoc, qtcNorm);
    const qtcPercentile = percentile(activeDataSet.ecg.qtcInterval, _ecg.qtc);
    if (uQtcPercentileLoc) gl.uniform1f(uQtcPercentileLoc, qtcPercentile);
    const pAxisPct = percentile(activeDataSet.ecg.pAxis, _ecg.pAxis);
    const rAxisPct = percentile(activeDataSet.ecg.rAxis, _ecg.rAxis);
    const tAxisPct = percentile(activeDataSet.ecg.tAxis, _ecg.tAxis);
    if (uPAxisPctLoc) gl.uniform1f(uPAxisPctLoc, pAxisPct);
    if (uRAxisPctLoc) gl.uniform1f(uRAxisPctLoc, rAxisPct);
    if (uTAxisPctLoc) gl.uniform1f(uTAxisPctLoc, tAxisPct);
    if (uPrNormLoc) gl.uniform1f(uPrNormLoc, prNorm);
    const ventRateNorm = clamp(
      normalize(activeDataSet.ecg.ventRate, minMaxValues.ventRate.min, minMaxValues.ventRate.max),
      0, 1
    );
    if (uVentRateNormLoc) gl.uniform1f(uVentRateNormLoc, ventRateNorm);
    const tAxisNorm = clamp(
      normalize(activeDataSet.ecg.tAxis, minMaxValues.tAxis.min, minMaxValues.tAxis.max),
      0, 1
    );
    if (uTAxisNormLoc) gl.uniform1f(uTAxisNormLoc, tAxisNorm);
    const qrsNorm = clamp(
      normalize(activeDataSet.ecg.qrsInterval, minMaxValues.qrsInterval.min, minMaxValues.qrsInterval.max),
      0, 1
    );
    if (uQrsNormLoc) gl.uniform1f(uQrsNormLoc, qrsNorm);
    const co2Norm = clamp(
      normalize(activeDataSet.labs.carbonDioxide, minMaxValues.carbonDioxide.min, minMaxValues.carbonDioxide.max),
      0, 1
    );
    if (uCo2NormLoc) gl.uniform1f(uCo2NormLoc, co2Norm);
    const qrsTAngle = Math.abs(activeDataSet.ecg.rAxis - activeDataSet.ecg.tAxis);
    const qrsTAngleNorm = clamp(
      (qrsTAngle - _ecg.qrsTAngleMin) / Math.max(1e-6, _ecg.qrsTAngleMax - _ecg.qrsTAngleMin),
      0, 1
    );
    if (uQrsTAngleLoc) gl.uniform1f(uQrsTAngleLoc, qrsTAngleNorm);
    const ventRatePct   = percentile(activeDataSet.ecg.ventRate,    _ecg.ventRate);
    const prPct         = percentile(activeDataSet.ecg.prInterval,  _ecg.pr);
    const qrsPct        = percentile(activeDataSet.ecg.qrsInterval, _ecg.qrs);
    const qrsTAnglePct  = percentile(qrsTAngle,                     _ecg.qrsTAngle);
    if (uVentRatePctLoc)  gl.uniform1f(uVentRatePctLoc,  ventRatePct);
    if (uPrPctLoc)        gl.uniform1f(uPrPctLoc,        prPct);
    if (uQrsPctLoc)       gl.uniform1f(uQrsPctLoc,       qrsPct);
    if (uQrsTAnglePctLoc) gl.uniform1f(uQrsTAnglePctLoc, qrsTAnglePct);

    // Inherited color field — fades from full presence at birth toward 0 at end of life
    const inheritedStrength = Math.pow(Math.max(0, 1 - lifeFraction), 0.7);
    // On chain the piece's own `hue` attribute is authoritative — inscribe.js
    // always emits it. The live computation is the fallback, not a baked lookup.
    const inheritedHueDeg = inheritedHueDegOverride !== null
      ? inheritedHueDegOverride
      : (lcInheritedHueFor(currentDataSetIndex) ?? 0);
    if (uInheritedHueDegLoc) gl.uniform1f(uInheritedHueDegLoc, inheritedHueDeg);
    if (uInheritedStrengthLoc) gl.uniform1f(uInheritedStrengthLoc, inheritedStrength);
    if (uReanimationProgressLoc) gl.uniform1f(uReanimationProgressLoc, reanimationProgress);
    if (uPartnerInheritedHueDegLoc) gl.uniform1f(uPartnerInheritedHueDegLoc, partnerInheritedHueDeg);
    if (uIsLiberatedLoc) gl.uniform1f(uIsLiberatedLoc, isLiberated);
    if (uVoidProgressLoc) gl.uniform1f(uVoidProgressLoc, voidProgress);

    // Compute base hue
    const baseHSB = computeHSBFromStats(activeDataSet, drawCollection); // 0..1
    let baseHueDeg = baseHSB.hue * 360.0;

    // Beam phases advance on real-wall-clock dt for smooth animation regardless
    // of totalYears speed. Decay ripple pulses and cross-beam deps pre-computed.
    co2Pulse *= Math.exp(-dt / 18.0);
    caPulse  *= Math.exp(-dt / 26.0);
    const pCO2 = winsorizedPercentileForLab(activeDataSet, 'carbonDioxide', drawCollection);
    const pPR = clamp(
      (activeDataSet.ecg.prInterval - minMaxValues.prInterval.min) /
      Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min),
      0, 1
    );

    // Beam RGB uniforms — precomputed per-frame, one vec3 per beam (eliminates per-pixel hsb2rgb)
    // sat/bri values match what the shader used to compute: N/Cr (0.90, 0.78), Na (0.94, 0.80),
    // Cl (0.75, 0.85), CO2 (0.75, 1.00), Ca (0.70, 0.95)
    const beamRGBLocs = [uNitrogenRGBLoc, uCreatRGBLoc, uSodiumRGBLoc, uChlorideRGBLoc, uCo2RGBLoc, uCalciumRGBLoc];
    const beamSat =     [0.90,            0.90,          0.94,           0.75,            0.75,        0.70];
    const beamBri =     [0.78,            0.78,          0.80,           0.85,            1.00,        0.95];

    for (let i = 0; i < beamConfigs.length; i++) {
      const cfg = beamConfigs[i];
      beamPhases[cfg.phaseKey] = beamPhases[cfg.phaseKey] ?? cfg.phaseSeed(lastTwoHashDigits);
      if (cfg.tickTwoPi) {
        beamPhases[cfg.phaseKey] += (dt * 2 * Math.PI) / Math.max(1e-3, cfg.tempoFn(activeDataSet, drawCollection));
      } else {
        beamPhases[cfg.phaseKey] = (beamPhases[cfg.phaseKey] + dt / Math.max(1e-3, cfg.tempoFn(activeDataSet, drawCollection))) % 1;
      }
      const ph = beamPhases[cfg.phaseKey];
      const p = winsorizedPercentileForLab(activeDataSet, cfg.labKey, drawCollection);
      const { str, hue } = cfg.update({ ph, p, ds: activeDataSet, coll: drawCollection, baseHueDeg, totalYears, co2Pulse, caPulse, pCO2, pPR });
      if (cfg.strengthLoc) gl.uniform1f(cfg.strengthLoc, str);
      if (cfg.hueLoc)      gl.uniform1f(cfg.hueLoc, hue);
      if (cfg.radiusLoc)   gl.uniform1f(cfg.radiusLoc, p);
      if (beamRGBLocs[i])  gl.uniform3fv(beamRGBLocs[i], hsbToRgb(hue, beamSat[i], beamBri[i]));
    }

    // Nirvana / partner RGB — set from inherited hue degrees
    if (uNirvanaRGBLoc) gl.uniform3fv(uNirvanaRGBLoc, hsbToRgb(inheritedHueDeg, 0.85, 0.92));
    if (uPartnerRGBLoc) gl.uniform3fv(uPartnerRGBLoc, hsbToRgb(partnerInheritedHueDeg, 0.85, 0.92));

    // BUN/Creatinine ratio: spatial coupling between nitrogen and creatinine forms
    const bunCreatRatio = activeDataSet.labs.nitrogen / Math.max(0.1, activeDataSet.labs.creatinine);
    const bunCreatRatioNorm = clamp(
      (bunCreatRatio - _ecg.bunCreatP05) / Math.max(1e-9, _ecg.bunCreatP95 - _ecg.bunCreatP05),
      0, 1
    );
    if (uBunCreatRatioNormLoc) gl.uniform1f(uBunCreatRatioNormLoc, bunCreatRatioNorm);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    scheduleDraw();
  }

  gl.clearColor(0, 0, 0, 1);

  // Boot: draw as soon as this piece has data for itself, and let the collection
  // load behind the rendered frame.
  //
  // This used to await the whole of initLifecycle, which includes the sibling
  // scan — one /r/metadata round trip per piece in the collection. That is why
  // pieces sat on black for tens of seconds before the first frame, and it got
  // worse with every piece minted.
  //
  // The engine carries no datasets, so EVERY piece waits for its own metadata —
  // not just those minted after the engine, as when a baked array existed. It
  // waits on lc.ownDataReady (its own CBOR only, not the whole collection), and
  // lcReleaseOwnData() sits in a `finally`, so the promise always resolves and a
  // failure still yields a frame rather than a black screen.
  (async () => {
    const lifecycle = initLifecycle().catch(() => {});
    await Promise.race([lc.ownDataReady, lifecycle]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Through scheduleDraw, not draw(), so the very first frame is inside the
    // guard too — a throw on frame one must not be the one that kills the loop.
    scheduleDraw();
  })();

  // DEV_START
  // manually switch datasets in the console
  window.changeDataset = (newIndex) => {
    if (
      Number.isInteger(newIndex) &&
      newIndex >= 0 &&
      newIndex < healthDataSets.length
    ) {
      currentDataSetIndex = newIndex;

      lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);

      draw();
    } else {
      console.warn("Invalid dataset index:", newIndex);
    }
  };

  window.nextDataset = () => {
    const newIndex = (currentDataSetIndex + 1) % healthDataSets.length;
    changeDataset(newIndex);
  };

  window.prevDataset = () => {
    const newIndex =
      (currentDataSetIndex - 1 + healthDataSets.length) % healthDataSets.length;
    changeDataset(newIndex);
  };
  // DEV_END
}

// A collection of one has no ranking to give — genesis alone on chain has nothing
// to be distinct from. Return the midpoint rather than dividing by zero.
// (inscribe.js has always had this guard; main.js did not, because the baked seed
// made a one-piece collection unreachable. It is reachable now.)
function percentile(value, sortedArray) {
  if (sortedArray.length < 2) return 0.5;
  const rank = sortedArray.filter((v) => v < value).length;
  return rank / (sortedArray.length - 1); // ensures [0, 1] range
}

function computeHSBFromStats(dataSet, datasets) {
  const glucoseValues = datasets.map((d) => d.labs.glucose);
  const potassiumValues = datasets.map((d) => d.labs.potassium);
  const egfrValues = datasets.map((d) => d.labs.eGFR);

  glucoseValues.sort((a, b) => a - b);
  potassiumValues.sort((a, b) => a - b);
  egfrValues.sort((a, b) => a - b);

  const hue = percentile(dataSet.labs.glucose, glucoseValues); // 0..1
  const sat = percentile(dataSet.labs.potassium, potassiumValues); // 0..1
  const bri = percentile(dataSet.labs.eGFR, egfrValues); // 0..1

  return { hue, sat, bri };
}

// CPU-side HSB → linear RGB (matches branchless shader version)
function hsbToRgb(hDeg, s, b) {
  const h = ((hDeg % 360) + 360) % 360;
  const K = [1, 2/3, 1/3, 3];
  const fract = (x) => x - Math.floor(x);
  const p = [
    Math.abs(fract(h/360 + K[0]) * 6 - K[3]),
    Math.abs(fract(h/360 + K[1]) * 6 - K[3]),
    Math.abs(fract(h/360 + K[2]) * 6 - K[3]),
  ];
  return [
    b * (1 - s + s * Math.max(0, Math.min(1, p[0] - 1))),
    b * (1 - s + s * Math.max(0, Math.min(1, p[1] - 1))),
    b * (1 - s + s * Math.max(0, Math.min(1, p[2] - 1))),
  ];
}

// ──────────────────────────────────────────────────────────────
// BEAM SCAFFOLD
// ──────────────────────────────────────────────────────────────

const BEAM = Object.freeze({
  NITROGEN: 0, // BUN (direct)
  CREATININE: 1, // direct
  SODIUM: 2, // lifespan @ ~20%
  CHLORIDE: 3, // lifespan @ ~60%
  CO2: 4, // ripple
  CALCIUM: 5, // ripple
});

// Winsorized percentile helper for any lab key (5–95%)
function winsorizedPercentileForLab(
  dataSet,
  labKey,
  datasets
) {
  const values = datasets
    .map((d) => d.labs[labKey])
    .slice()
    .sort((a, b) => a - b);
  if (values.length < 2) return 0.5;
  const p05 = values[Math.floor(0.05 * (values.length - 1))];
  const p95 = values[Math.ceil(0.95 * (values.length - 1))];
  const v = dataSet.labs[labKey];
  const clamped = Math.max(p05, Math.min(p95, v));
  return (clamped - p05) / Math.max(1e-9, p95 - p05); // 0..1
}

// Breathing amplitude from ECG variability
function getBreathingAmplitude(dataSet) {
  const pv = normalize(
    dataSet.ecg.ventRate,
    minMaxValues.ventRate.min,
    minMaxValues.ventRate.max
  );
  const pq = normalize(
    dataSet.ecg.qtcInterval,
    minMaxValues.qtcInterval.min,
    minMaxValues.qtcInterval.max
  );
  const uv = Math.abs(pv - 0.5);
  const uq = Math.abs(pq - 0.5);
  const V = 2 * Math.max(uv, uq); // 0..1
  let amp = 0.05 + 0.07 * V; // 5–12%
  const extreme = pv < 0.1 || pv > 0.9 || pq < 0.1 || pq > 0.9;
  if (extreme) amp = Math.min(0.18, amp + 0.03); // up to 18%
  return amp;
}

// Tempo: data-driven per beam
// ECG + BUN/creatinine rankings, derived from whatever collection is passed.
//
// These were nine `const`s inside init(), computed once from the baked array and
// never recomputed — so every ECG-derived percentile (form angles, beam
// amplitudes, the kidney coupling) stayed frozen against the first 30 datasets
// while colour correctly re-ranked against the chain. They agreed only because
// the baked array happened to equal the 30 inscribed pieces; they diverge at
// piece 31. Top-level so the test harness can drive them.
//
// Cached on collection identity: sibling discovery replaces the array rather
// than mutating it, so identity changing is exactly when a recompute is due.
// The cache hangs off the function so it stays self-contained and liftable.
function ecgRanks(datasets) {
  if (ecgRanks._for === datasets && ecgRanks._cache) return ecgRanks._cache;
  const sortedBy = (f) => datasets.map(f).sort((a, b) => a - b);
  const angles = datasets.map((d) => Math.abs(d.ecg.rAxis - d.ecg.tAxis));
  const ratios = datasets
    .map((d) => d.labs.nitrogen / Math.max(0.1, d.labs.creatinine))
    .sort((a, b) => a - b);
  ecgRanks._for = datasets;
  ecgRanks._cache = {
    qtc:          sortedBy((d) => d.ecg.qtcInterval),
    pAxis:        sortedBy((d) => d.ecg.pAxis),
    rAxis:        sortedBy((d) => d.ecg.rAxis),
    tAxis:        sortedBy((d) => d.ecg.tAxis),
    ventRate:     sortedBy((d) => d.ecg.ventRate),
    pr:           sortedBy((d) => d.ecg.prInterval),
    qrs:          sortedBy((d) => d.ecg.qrsInterval),
    qrsTAngle:    [...angles].sort((a, b) => a - b),
    qrsTAngleMin: Math.min(...angles),
    qrsTAngleMax: Math.max(...angles),
    bunCreatP05:  ratios[Math.floor(0.05 * (ratios.length - 1))],
    bunCreatP95:  ratios[Math.ceil(0.95 * (ratios.length - 1))],
  };
  return ecgRanks._cache;
}

function getBeamTempoSeconds(dataSet, beamId, datasets) {
  switch (beamId) {
    case BEAM.NITROGEN: {
      // High BUN (waste accumulating) → more urgent breathing cycle
      const vals = datasets.map(d => d.labs.nitrogen).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.nitrogen, vals);
      return 10 - 3 * p; // 10s (low BUN) → 7s (high BUN)
    }
    case BEAM.CREATININE: {
      // PR interval: conduction delay reflects kidney-cardiac stress
      const prNorm = clamp(
        (dataSet.ecg.prInterval - minMaxValues.prInterval.min) /
        Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min),
        0, 1
      );
      return 9 + 6 * prNorm; // 9s (short PR) → 15s (long PR)
    }
    case BEAM.CO2: {
      // Low eGFR → more acidosis pressure → faster CO2 cycling
      const vals = datasets.map(d => d.labs.eGFR).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.eGFR, vals);
      return 12 + 8 * p; // 12s (low eGFR, stressed) → 20s (high eGFR, calm)
    }
    case BEAM.CALCIUM: {
      // T-axis deviation directly reflects calcium's effect on repolarization
      const tNorm = clamp(
        (dataSet.ecg.tAxis - minMaxValues.tAxis.min) /
        Math.max(1e-6, minMaxValues.tAxis.max - minMaxValues.tAxis.min),
        0, 1
      );
      return 18 + 12 * (1 - tNorm); // 18s (high tAxis) → 30s (low tAxis)
    }
    default:
      return 12.0;
  }
}

// Hue anchor: kidney beams offset from base by an independent lab variable.
// Uses an offset from baseHueDeg (not a full remap) so pieces stay coherent
// while the kidney markers can still diverge meaningfully under disease.
function getBeamHueAnchorDeg(dataSet, beamId, datasets) {
  const { hue } = computeHSBFromStats(dataSet, datasets);
  const baseDeg = hue * 360.0;
  switch (beamId) {
    case BEAM.NITROGEN: {
      // eGFR offsets nitrogen ±80° from base. Low eGFR (failing kidneys) pushes
      // the form away from the glucose background — disease creates color tension.
      const vals = datasets.map(d => d.labs.eGFR).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.eGFR, vals);
      return baseDeg + (p - 0.5) * 160; // ±80° from base
    }
    case BEAM.CREATININE: {
      // Potassium offsets creatinine ±60° from base — K+ varies independently.
      const vals = datasets.map(d => d.labs.potassium).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.potassium, vals);
      return baseDeg + (p - 0.5) * 120; // ±60° from base
    }
    default:
      return baseDeg; 
  }
}

init();
