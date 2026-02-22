// ---------------------------------------------
// main.js
// ---------------------------------------------
import { healthDataSets, minMaxValues } from "../data/health_data_sets.js";

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
  const n = x / 99;
  const offset = Math.pow(n, 2.5);

  let lifespan = 5 + offset * 35;

  if (x < 5) {
    lifespan = 5 + n * 10;
  } else if (x > 95) {
    lifespan = 40 + n * 25;
  }

  return lifespan;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normalize(value, min, max) {
  if (max - min === 0) return 0;
  return (value - min) / (max - min); // ← FIXED
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
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

// once everything is ready, initialize WebGL
async function init() {
  // resize canvas right away, then whenever the window changes:
  resizeCanvasToDisplaySize(canvas);
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas);
    draw();
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
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uGlucoseLoc = gl.getUniformLocation(program, "u_glucose");
  const uPotassiumLoc = gl.getUniformLocation(program, "u_potassium");
  const uEgfrLoc = gl.getUniformLocation(program, "u_eGFR");
  const uDecayPerYearLoc = gl.getUniformLocation(program, "u_decayPerYear");
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
  const uPrNormLoc = gl.getUniformLocation(program, "u_prNorm");
  const uInheritedHueDegLoc = gl.getUniformLocation(program, "u_inheritedHueDeg");
  const uInheritedStrengthLoc = gl.getUniformLocation(program, "u_inheritedStrength");

  // Blob size + BUN/Cr ratio uniforms
  const uNitrogenRadiusLoc   = gl.getUniformLocation(program, "u_nitrogenRadius");
  const uCreatinineRadiusLoc = gl.getUniformLocation(program, "u_creatinineRadius");
  const uSodiumRadiusLoc     = gl.getUniformLocation(program, "u_sodiumRadius");
  const uChlorideRadiusLoc   = gl.getUniformLocation(program, "u_chlorideRadius");
  const uCalciumRadiusLoc    = gl.getUniformLocation(program, "u_calciumRadius");
  const uBunCreatRatioNormLoc = gl.getUniformLocation(program, "u_bunCreatRatioNorm");

  // Pre-compute BUN/Creatinine ratio winsorized range across all datasets (once)
  const allBunCreatRatios = healthDataSets
    .map((d) => d.labs.nitrogen / Math.max(0.1, d.labs.creatinine))
    .slice()
    .sort((a, b) => a - b);
  const bunCreatP05 = allBunCreatRatios[Math.floor(0.05 * (allBunCreatRatios.length - 1))];
  const bunCreatP95 = allBunCreatRatios[Math.ceil(0.95 * (allBunCreatRatios.length - 1))];

  let currentDataSetIndex = 0;
  let currentDataSet = healthDataSets[currentDataSetIndex];

  let baseDecayPerYear32 = currentDataSet.decayRate;

  // TODO: replace with real chain values
  const lastTwoHashDigits = 88;
  const inscriptionUnixSeconds = 1704067200;
  const YEARS_PER_SECOND = 1 / (365 * 24 * 3600);

  // Inherited hue — stub: piece 0's primary (glucose) hue in degrees.
  // TODO: replace with the ancestor piece's hue read from chain at mint time.
  const ancestorHueDeg = computeHSBFromStats(healthDataSets[0], healthDataSets).hue * 360;
  let inheritedHueDeg = ancestorHueDeg;

  // Console override for tuning the inherited hue visually before chain integration
  window.setInheritedHue = (deg) => { inheritedHueDeg = ((deg % 360) + 360) % 360; };
  window.resetInheritedHue = () => { inheritedHueDeg = ancestorHueDeg; };

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
  window.setYears = (y) => {
    params.overrideYears = y == null ? null : Number(y);
  };
  window.clearYears = () => {
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

  // lifespan + aligned rate
  let lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);
  let decayPerYear = baseDecayPerYear32 * (32 / lifespanYears);

  // set uniforms
  function setHSBUniforms() {
    const { hue, sat, bri } = computeHSBFromStats(
      currentDataSet,
      healthDataSets
    );
    gl.uniform1f(uGlucoseLoc, hue);
    gl.uniform1f(uPotassiumLoc, sat);
    gl.uniform1f(uEgfrLoc, bri);
  }

  function hsb01ToRgb255(h, s, b) {
    // h,s,b are 0..1
    const H = (h * 360) % 360;
    const C = b * s;
    const Hp = H / 60;
    const X = C * (1 - Math.abs((Hp % 2) - 1));

    let r1 = 0,
      g1 = 0,
      b1 = 0;
    if (0 <= Hp && Hp < 1) [r1, g1, b1] = [C, X, 0];
    else if (1 <= Hp && Hp < 2) [r1, g1, b1] = [X, C, 0];
    else if (2 <= Hp && Hp < 3) [r1, g1, b1] = [0, C, X];
    else if (3 <= Hp && Hp < 4) [r1, g1, b1] = [0, X, C];
    else if (4 <= Hp && Hp < 5) [r1, g1, b1] = [X, 0, C];
    else if (5 <= Hp && Hp < 6) [r1, g1, b1] = [C, 0, X];

    const m = b - C;
    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const bl = Math.round((b1 + m) * 255);

    return {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, bl)),
    };
  }

  function rgb255ToHex({ r, g, b }) {
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
  }

  function setResolutionUniform() {
    gl.uniform2f(uResolutionLoc, gl.canvas.width, gl.canvas.height);
  }

  // the draw() call just clears and draws the quad:
  function draw() {
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    setHSBUniforms();
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = performance.now() / 1000;
    window.__lastT = window.__lastT ?? t;
    const dt = Math.min(0.1, Math.max(0, t - window.__lastT));
    window.__lastT = t;

    const nowUnix = Math.floor(Date.now() / 1000);
    const baseYears =
      Math.max(0, nowUnix - inscriptionUnixSeconds) * YEARS_PER_SECOND;

    if (params.overrideYears !== null && params.previewSpeedYPS > 0) {
      params.overrideYears += params.previewSpeedYPS * dt;
    }

    const totalYears =
      (params.overrideYears !== null ? params.overrideYears : baseYears) *
      (params.timeWarp || 1);

    gl.uniform1f(uDecayPerYearLoc, decayPerYear);
    gl.uniform1f(uTotalYearsLoc, totalYears);
    gl.uniform1f(uLifespanYearsLoc, lifespanYears);

    // ECG axis uniforms — pAxis and rAxis normalized over dataset min/max
    const pAxisNorm = clamp(
      normalize(currentDataSet.ecg.pAxis, minMaxValues.pAxis.min, minMaxValues.pAxis.max),
      0, 1
    );
    const rAxisNorm = clamp(
      normalize(currentDataSet.ecg.rAxis, minMaxValues.rAxis.min, minMaxValues.rAxis.max),
      0, 1
    );
    if (uPAxisNormLoc) gl.uniform1f(uPAxisNormLoc, pAxisNorm);
    if (uRAxisNormLoc) gl.uniform1f(uRAxisNormLoc, rAxisNorm);

    const qtcNorm = clamp(
      normalize(currentDataSet.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max),
      0, 1
    );
    const prNorm = clamp(
      normalize(currentDataSet.ecg.prInterval, minMaxValues.prInterval.min, minMaxValues.prInterval.max),
      0, 1
    );
    if (uQtcNormLoc) gl.uniform1f(uQtcNormLoc, qtcNorm);
    if (uPrNormLoc) gl.uniform1f(uPrNormLoc, prNorm);

    // Inherited color field — fades from full presence at birth toward 0 at end of life
    const lifeFraction = clamp(totalYears / lifespanYears, 0, 1);
    const inheritedStrength = Math.pow(Math.max(0, 1 - lifeFraction), 0.7);
    if (uInheritedHueDegLoc) gl.uniform1f(uInheritedHueDegLoc, inheritedHueDeg);
    if (uInheritedStrengthLoc) gl.uniform1f(uInheritedStrengthLoc, inheritedStrength);

    // Compute base hue
    const baseHSB = computeHSBFromStats(currentDataSet, healthDataSets); // 0..1
    let baseHueDeg = baseHSB.hue * 360.0;

    const baseRgb255 = hsb01ToRgb255(baseHSB.hue, baseHSB.sat, baseHSB.bri);
    const baseHex = rgb255ToHex(baseRgb255);

    // Beam phases use real-wall-clock dt so they advance smoothly regardless of
    // how fast totalYears is moving (preview mode, time warp, setYears jumps).
    // Shader-side drift/hue/decay are deterministic from totalYears for time-jumping.

    // ── NITROGEN (direct beam #1) ──
    const ampN = getBreathingAmplitude(currentDataSet);
    const tempoN = getBeamTempoSeconds(currentDataSet, BEAM.NITROGEN);
    window.__phaseN = window.__phaseN ?? (lastTwoHashDigits / 99) * 2 * Math.PI;
    window.__phaseN += (dt * 2 * Math.PI) / Math.max(1e-3, tempoN);
    const assertN = 0.58;
    let strN = clamp(
      assertN * (0.5 + 0.5 * Math.sin(window.__phaseN) * ampN),
      0,
      1
    );
    strN = 0.35 + (0.55 - 0.35) * strN;
    const hueAnchorN = getBeamHueAnchorDeg(currentDataSet, BEAM.NITROGEN);
    const seedN = winsorizedPercentileForLab(
      currentDataSet,
      "nitrogen",
      healthDataSets
    ); // 0..1
    const driftAmpN = 10 + 8 * seedN;
    const hueDegN =
      hueAnchorN + driftAmpN * Math.sin(window.__phaseN * 0.93 + 0.14);

    if (uNitrogenStrengthLoc) gl.uniform1f(uNitrogenStrengthLoc, strN);
    if (uNitrogenHueDegLoc) gl.uniform1f(uNitrogenHueDegLoc, hueDegN);

    // ── CREATININE (direct beam #2) ──
    const ampC = getBreathingAmplitude(currentDataSet);
    const tempoC = getBeamTempoSeconds(currentDataSet, BEAM.CREATININE);
    window.__phaseC = window.__phaseC ?? (lastTwoHashDigits / 99) * 1.3 * Math.PI;
    window.__phaseC += (dt * 2 * Math.PI) / Math.max(1e-3, tempoC);
    const pCreat = winsorizedPercentileForLab(
      currentDataSet,
      "creatinine",
      healthDataSets
    );
    const assertC = 0.4 + 0.3 * pCreat;
    let strC = clamp(
      assertC * (0.5 + 0.5 * Math.sin(window.__phaseC) * ampC),
      0,
      1
    );
    strC = 0.3 + (0.5 - 0.3) * strC;
    const hueAnchorC = getBeamHueAnchorDeg(currentDataSet, BEAM.CREATININE);
    const seedC = winsorizedPercentileForLab(
      currentDataSet,
      "creatinine",
      healthDataSets
    ); // 0..1
    const driftAmpC = 8 + 5 * seedC;
    const hueDegC =
      hueAnchorC + driftAmpC * Math.sin(window.__phaseC * 1.07 + 0.08);

    if (uCreatinineStrengthLoc) gl.uniform1f(uCreatinineStrengthLoc, strC);
    if (uCreatinineHueDegLoc) gl.uniform1f(uCreatinineHueDegLoc, hueDegC);

    // ---- SODIUM (beam #3) — pulsed Gaussian, arrival @ 20% lifespan ----
    const pNa = winsorizedPercentileForLab(
      currentDataSet,
      "sodium",
      healthDataSets
    );
    const arrNa = sodiumArrivalProgress(totalYears, lifespanYears);
    const TNa = sodiumTempoSeconds(currentDataSet);
    const kNa = sodiumPulseCount(currentDataSet);
    window.__phaseNa = window.__phaseNa ?? sodiumPhaseSeed(lastTwoHashDigits);
    window.__phaseNa = (window.__phaseNa + dt / Math.max(1e-3, TNa)) % 1;

    const pulseNa = sodiumPulseShape(window.__phaseNa, kNa, 0.12);
    const ampNa = sodiumAmplitude(
      currentDataSet,
      currentDataSet.healthIndex ?? 0.5,
      arrNa,
      pNa
    );
    let hueDegNa = sodiumHueDeg(baseHueDeg, currentDataSet, pNa) + nudgeNa;
    const driftAmpNa = 16 + 4 * pNa;
    hueDegNa += driftAmpNa * Math.sin(window.__phaseNa * 0.82 + 0.32);

    // --- Sodium strength with pre-arrival floor ---
    const floorNa = 0.14; // ~14% visible from early years
    const targetNa = clamp(ampNa * pulseNa, 0, 1);
    // blend from floor → target as arrival progresses
    const strNa = clamp(floorNa * (1.0 - arrNa) + targetNa, 0, 1);

    if (uSodiumStrengthLoc) gl.uniform1f(uSodiumStrengthLoc, strNa);
    if (uSodiumHueDegLoc) gl.uniform1f(uSodiumHueDegLoc, hueDegNa);

    // ---- CHLORIDE (beam #4) — triangle + warble, arrival @ 60% lifespan ----
    const pCl = winsorizedPercentileForLab(
      currentDataSet,
      "chloride",
      healthDataSets
    );
    const arrCl = chlorideArrivalProgress(totalYears, lifespanYears);
    const TCl = chlorideTempoSeconds(currentDataSet);
    window.__phaseCl = window.__phaseCl ?? chloridePhaseSeed(lastTwoHashDigits);
    window.__phaseCl = (window.__phaseCl + dt / Math.max(1e-3, TCl)) % 1;

    const shapeCl = chlorideTriWithWarble(window.__phaseCl, currentDataSet);
    const ampCl = chlorideAmplitude(
      currentDataSet,
      currentDataSet.healthIndex ?? 0.5,
      arrCl,
      pCl
    );
    let hueDegCl = chlorideHueDeg(baseHueDeg, pCl) + nudgeCl;
    const driftAmpCl = 12 + 6 * pCl;
    hueDegCl += driftAmpCl * Math.sin(window.__phaseCl * 0.88 - 0.24);
    // --- Chloride strength with pre-arrival floor ---
    const floorCl = 0.12; // ~12% visible before full arrival
    const targetCl = clamp(ampCl * shapeCl, 0, 1);
    const strCl = clamp(floorCl * (1.0 - arrCl) + targetCl, 0, 1);

    if (uChlorideStrength) gl.uniform1f(uChlorideStrength, strCl);
    if (uChlorideHueDeg) gl.uniform1f(uChlorideHueDeg, hueDegCl);

    // ---------- CO2 (beam #5) : cool halo ----------
    const pCO2 = winsorizedPercentileForLab(
      currentDataSet,
      "carbonDioxide",
      healthDataSets
    );
    const baseHueDeg5 =
      computeHSBFromStats(currentDataSet, healthDataSets).hue * 360.0;

    // Hue: base −18°..−36° (higher CO2 → cooler), keep ≥26° from base (push cooler)
    let hueDegCO2 = baseHueDeg5 - (24 + 12 * pCO2) + nudgeCO2;
    hueDegCO2 = guardHueGap(baseHueDeg5, hueDegCO2, 30, -1);
    const driftAmpCO2 = 12 + 6 * pCO2;
    window.__phaseCO2 = window.__phaseCO2 ?? 0;
    window.__phaseCO2 += (dt * 2 * Math.PI) / Math.max(1e-3, getBeamTempoSeconds(currentDataSet, BEAM.CO2));
    hueDegCO2 += driftAmpCO2 * Math.sin(window.__phaseCO2 * 1.0 + 0.2);

    // Strength: baseline from health (worse health → a bit more halo), plus ripple pulse that decays
    const baseCO2 = 0.26 + 0.18 * (1 - pCO2);
    co2Pulse *= Math.exp(-dt / 18.0);
    const strCO2 = clamp(baseCO2 + 0.22 * co2Pulse, 0, 0.62);

    if (uCo2StrengthLoc) gl.uniform1f(uCo2StrengthLoc, strCO2);
    if (uCo2HueDegLoc) gl.uniform1f(uCo2HueDegLoc, hueDegCO2);

    // ---------- Calcium (beam #6) : warm broad field ----------
    const pCa = winsorizedPercentileForLab(
      currentDataSet,
      "calcium",
      healthDataSets
    );
    const baseHueDeg6 = baseHueDeg5;

    // Hue: base +18°..+36° (higher Ca → warmer), keep ≥24° from base (push warmer)
    let hueDegCa = baseHueDeg6 + (45 + 25 * pCa) + nudgeCa;
    hueDegCa = guardHueGap(baseHueDeg6, hueDegCa, 32, +1);

    // Drift: calmer than CO2; seed from PR interval percentile for variety
    const prMin = minMaxValues.prInterval.min,
      prMax = minMaxValues.prInterval.max;
    const pPR = clamp(
      (currentDataSet.ecg.prInterval - prMin) / Math.max(1e-6, prMax - prMin),
      0,
      1
    );
    const driftAmpCa = 10 + 6 * pPR;

    window.__phaseCa = window.__phaseCa ?? 0;
    window.__phaseCa += (dt * 2 * Math.PI) / Math.max(1e-3, getBeamTempoSeconds(currentDataSet, BEAM.CALCIUM));

    hueDegCa += driftAmpCa * Math.sin(window.__phaseCa * 0.92 - 0.13);

    // --- Calcium strength (baseline + ripple) ---

    const hiCO2 = typeof pCO2 !== "undefined" ? pCO2 : 0.5;

    caPulse *= Math.exp(-dt / 26.0);

    const baseCa = 0.06 + 0.08 * (1.0 - hiCO2); // cooler CO₂ → warmer Ca baseline
    const strCa = clamp(baseCa + 0.16 * caPulse, 0.0, 0.30);

    if (uCalciumStrengthLoc) gl.uniform1f(uCalciumStrengthLoc, strCa);
    if (uCalciumHueDegLoc) gl.uniform1f(uCalciumHueDegLoc, hueDegCa);

    // Blob size: each beam's winsorized lab percentile drives spatial dominance
    if (uNitrogenRadiusLoc)   gl.uniform1f(uNitrogenRadiusLoc,   seedN);
    if (uCreatinineRadiusLoc) gl.uniform1f(uCreatinineRadiusLoc, pCreat);
    if (uSodiumRadiusLoc)     gl.uniform1f(uSodiumRadiusLoc,     pNa);
    if (uChlorideRadiusLoc)   gl.uniform1f(uChlorideRadiusLoc,   pCl);
    if (uCalciumRadiusLoc)    gl.uniform1f(uCalciumRadiusLoc,    pCa);

    // BUN/Creatinine ratio: spatial coupling between nitrogen and creatinine blobs
    const bunCreatRatio = currentDataSet.labs.nitrogen / Math.max(0.1, currentDataSet.labs.creatinine);
    const bunCreatRatioNorm = clamp(
      (bunCreatRatio - bunCreatP05) / Math.max(1e-9, bunCreatP95 - bunCreatP05),
      0, 1
    );
    if (uBunCreatRatioNormLoc) gl.uniform1f(uBunCreatRatioNormLoc, bunCreatRatioNorm);

    // Left overlay
    overlay.textContent = [
      `Dataset: ${currentDataSetIndex}`,
      `HealthIndex: ${currentDataSet.healthIndex?.toFixed(3) ?? "N/A"}`,
      `Years: ${totalYears.toFixed(2)}`,
      `DecayRate: ${decayPerYear.toExponential(3)}`,
      params.overrideYears !== null
        ? `Mode: OVERRIDE (${params.overrideYears}y)`
        : `Mode: REALTIME`,
      `Warp: x${params.timeWarp}`,
      `Inherited: ${inheritedHueDeg.toFixed(0)}° str=${inheritedStrength.toFixed(2)}`,
    ].join("\n");

    // Right overlay
    beamOverlay.textContent = [
      `pAxis: ${currentDataSet.ecg.pAxis}° (norm=${pAxisNorm.toFixed(2)})`,
      `rAxis: ${currentDataSet.ecg.rAxis}° (norm=${rAxisNorm.toFixed(2)})`,
      `N (BUN): str=${strN.toFixed(2)} hue=${(
        ((hueDegN % 360) + 360) %
        360
      ).toFixed(0)}°`,
      `C (Cr ): str=${strC.toFixed(2)} hue=${(
        ((hueDegC % 360) + 360) %
        360
      ).toFixed(0)}°`,
      `Na: str=${strNa.toFixed(2)} hue=${(
        ((hueDegNa % 360) + 360) %
        360
      ).toFixed(0)}°` +
        (arrNa < 1 ? `  (arriving ${Math.round(arrNa * 100)}%)` : ``),
      `Cl: str=${strCl.toFixed(2)} hue=${(
        ((hueDegCl % 360) + 360) %
        360
      ).toFixed(0)}°` +
        (arrCl < 1 ? `  (arriving ${Math.round(arrCl * 100)}%)` : ``),
      `CO2: str=${strCO2.toFixed(2)} hue=${wrapDeg(hueDegCO2).toFixed(0)}°`,
      `Ca: str=${strCa.toFixed(2)} hue=${wrapDeg(hueDegCa).toFixed(0)}°`,
      `BUN/Cr ratio: ${bunCreatRatioNorm.toFixed(2)} (${(currentDataSet.labs.nitrogen / Math.max(0.1, currentDataSet.labs.creatinine)).toFixed(1)})`,
      `BaseHex: ${baseHex}`,
    ].join("\n");

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  }

  gl.clearColor(0, 0, 0, 1);
  draw();

  // manually switch datasets in the console
  window.changeDataset = (newIndex) => {
    if (
      Number.isInteger(newIndex) &&
      newIndex >= 0 &&
      newIndex < healthDataSets.length
    ) {
      currentDataSetIndex = newIndex;
      currentDataSet = healthDataSets[currentDataSetIndex];

      // recompute dataset dependent values
      baseDecayPerYear32 = currentDataSet.decayRate;
      lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);
      decayPerYear = baseDecayPerYear32 * (32 / lifespanYears);

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
}

function percentile(value, sortedArray) {
  const rank = sortedArray.filter((v) => v < value).length;
  return rank / (sortedArray.length - 1); // ensures [0, 1] range
}

function computeHSBFromStats(dataSet, healthDataSets) {
  const glucoseValues = healthDataSets.map((d) => d.labs.glucose);
  const potassiumValues = healthDataSets.map((d) => d.labs.potassium);
  const egfrValues = healthDataSets.map((d) => d.labs.eGFR);

  glucoseValues.sort((a, b) => a - b);
  potassiumValues.sort((a, b) => a - b);
  egfrValues.sort((a, b) => a - b);

  const hue = percentile(dataSet.labs.glucose, glucoseValues); // 0..1
  const sat = percentile(dataSet.labs.potassium, potassiumValues); // 0..1
  const bri = percentile(dataSet.labs.eGFR, egfrValues); // 0..1

  return { hue, sat, bri };
}

// ──────────────────────────────────────────────────────────────
// BEAM SCAFFOLD (no-ops for now)
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
  datasets = healthDataSets
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

// Tempo mapper stub
function getBeamTempoSeconds(_dataSet, beamId) {
  switch (beamId) {
    case BEAM.NITROGEN:
      return 10.0;
    case BEAM.CREATININE:
      return 12.0;
    case BEAM.SODIUM:
      return 7.0;
    case BEAM.CHLORIDE:
      return 9.0;
    case BEAM.CO2:
      return 16.0;
    case BEAM.CALCIUM:
      return 24.0;
    default:
      return 12.0;
  }
}

// Hue anchor stub
function getBeamHueAnchorDeg(dataSet, _beamId) {
  const { hue } = computeHSBFromStats(dataSet, healthDataSets);
  return hue * 360.0; // degrees
}

// Overlay toggle
// overlays — hidden by default, toggle with window.toggleOverlay()
const overlay = document.createElement("div");
overlay.style.position = "fixed";
overlay.style.top = "5px";
overlay.style.left = "10px";
overlay.style.padding = "6px 10px";
overlay.style.background = "rgba(0, 0, 0, 0.6)";
overlay.style.color = "lime";
overlay.style.whiteSpace = "pre";
overlay.style.fontFamily = "monospace";
overlay.style.fontSize = "12px";
overlay.style.textAlign = "left";
overlay.style.zIndex = "9999";
overlay.style.display = "none";
document.body.appendChild(overlay);

const beamOverlay = document.createElement("div");
beamOverlay.style.position = "fixed";
beamOverlay.style.top = "5px";
beamOverlay.style.left = "auto";
beamOverlay.style.right = "10px";
beamOverlay.style.padding = "6px 10px";
beamOverlay.style.background = "rgba(0, 0, 0, 0.6)";
beamOverlay.style.color = "lime";
beamOverlay.style.whiteSpace = "pre";
beamOverlay.style.fontFamily = "monospace";
beamOverlay.style.fontSize = "12px";
beamOverlay.style.textAlign = "right";
beamOverlay.style.zIndex = "9999";
beamOverlay.style.pointerEvents = "none";
beamOverlay.style.display = "none";
document.body.appendChild(beamOverlay);

window.toggleOverlay = () => {
  const show = overlay.style.display === "none";
  overlay.style.display = show ? "block" : "none";
  beamOverlay.style.display = show ? "block" : "none";
};

init();
