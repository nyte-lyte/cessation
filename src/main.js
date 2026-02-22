// ---------------------------------------------
// main.js
// ---------------------------------------------
import { healthDataSets, minMaxValues } from "../data/health_data_sets.js";
import { normalize } from "../data/decay_logic.js";

const TAU = 2 * Math.PI;

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

// Pulse count per cycle from QRS width (narrow QRS → more pulses)
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

// Pulsed Gaussian “grouped bursts” (phase01 in [0..1])
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

// Arrival gate (~60% lifespan, soft ramp ≈8% lifespan, min ~0.2y)
function chlorideArrivalProgress(totalYears, lifespanYears) {
  const start = 0.6 * lifespanYears;
  const ramp = Math.max(0.08 * lifespanYears, 0.2);
  return clamp((totalYears - start) / ramp, 0, 1);
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

  const uPAxisNormLoc = gl.getUniformLocation(program, "u_pAxisNorm");
  const uRAxisNormLoc = gl.getUniformLocation(program, "u_rAxisNorm");
  const uQtcNormLoc = gl.getUniformLocation(program, "u_qtcNorm");
  const uPrNormLoc = gl.getUniformLocation(program, "u_prNorm");
  const uInheritedHueDegLoc = gl.getUniformLocation(program, "u_inheritedHueDeg");
  const uInheritedStrengthLoc = gl.getUniformLocation(program, "u_inheritedStrength");

  let currentDataSetIndex = 0;
  let currentDataSet = healthDataSets[currentDataSetIndex];

  let baseDecayPerYear32 = currentDataSet.decayRate;

  // --- build normalized health track (0..1) once ---
  const hiTrack = healthDataSets.map((d) => d.healthIndex ?? 0.5);
  const hiMin = Math.min(...hiTrack),
    hiMax = Math.max(...hiTrack);
  const hiNorm = hiTrack.map((h) =>
    hiMax > hiMin ? (h - hiMin) / (hiMax - hiMin) : 0.5
  );

  // optional light smoothing
  for (let i = 1; i < hiNorm.length - 1; i++) {
    hiNorm[i] = (hiNorm[i - 1] + 2 * hiNorm[i] + hiNorm[i + 1]) / 4;
  }

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

  const beamConfigs = [
    {
      label: 'N (BUN)', labKey: 'nitrogen', phaseKey: 'phaseN', nudgeMag: 0,
      strengthLoc: gl.getUniformLocation(program, 'u_nitrogenStrength'),
      hueLoc:      gl.getUniformLocation(program, 'u_nitrogenHueDeg'),
      phaseSeed: (h) => h / 99,
      tempoFn: (_ds) => 10.0,
      update({ ph, p, baseHueDeg }) {
        const amp = getBreathingAmplitude(currentDataSet);
        let str = clamp(0.58 * (0.5 + 0.5 * Math.sin(ph * TAU) * amp), 0, 1);
        str = 0.35 + 0.20 * str;
        const hue = baseHueDeg + (10 + 8 * p) * Math.sin(ph * TAU * 0.93 + 0.14);
        return { str, hue };
      },
    },
    {
      label: 'C (Cr )', labKey: 'creatinine', phaseKey: 'phaseC', nudgeMag: 0,
      strengthLoc: gl.getUniformLocation(program, 'u_creatinineStrength'),
      hueLoc:      gl.getUniformLocation(program, 'u_creatinineHueDeg'),
      phaseSeed: (h) => (h / 99) * 0.65,
      tempoFn: (_ds) => 12.0,
      update({ ph, p, baseHueDeg }) {
        const amp = getBreathingAmplitude(currentDataSet);
        let str = clamp((0.4 + 0.3 * p) * (0.5 + 0.5 * Math.sin(ph * TAU) * amp), 0, 1);
        str = 0.30 + 0.20 * str;
        const hue = baseHueDeg + (8 + 5 * p) * Math.sin(ph * TAU * 1.07 + 0.08);
        return { str, hue };
      },
    },
    {
      label: 'Na', labKey: 'sodium', phaseKey: 'phaseNa', nudgeMag: 12,
      strengthLoc: gl.getUniformLocation(program, 'u_sodiumStrength'),
      hueLoc:      gl.getUniformLocation(program, 'u_sodiumHueDeg'),
      phaseSeed: (h) => (h / 99 + 0.57) % 1,
      tempoFn: (ds) => {
        const nVR = clamp(
          (ds.ecg.ventRate - minMaxValues.ventRate.min) /
          Math.max(1e-6, minMaxValues.ventRate.max - minMaxValues.ventRate.min), 0, 1);
        return 10 - 5.5 * nVR;
      },
      update({ ph, p, baseHueDeg, totalYears }) {
        const arr = sodiumArrivalProgress(totalYears, lifespanYears);
        const k   = sodiumPulseCount(currentDataSet);
        const pulse = sodiumPulseShape(ph, k, 0.12);
        const hi = currentDataSet.healthIndex ?? 0.5;
        const ampNa = arr * (0.08 + 0.12 * p) * (0.85 + 0.15 * (1 - clamp(hi, 0, 1)));
        const str = clamp(0.14 * (1 - arr) + clamp(ampNa * pulse, 0, 1), 0, 1);
        const offset = -25 + 50 * p;
        let hue = guardHueGap(baseHueDeg, baseHueDeg + offset, 32, Math.sign(offset || 1));
        hue += this.nudgeMag * signed;
        hue += (16 + 4 * p) * Math.sin(ph * 0.82 + 0.32);
        return { str, hue, note: arr < 1 ? `  (arriving ${Math.round(arr * 100)}%)` : undefined };
      },
    },
    {
      label: 'Cl', labKey: 'chloride', phaseKey: 'phaseCl', nudgeMag: 14,
      strengthLoc: gl.getUniformLocation(program, 'u_chlorideStrength'),
      hueLoc:      gl.getUniformLocation(program, 'u_chlorideHueDeg'),
      phaseSeed: (h) => (h / 99 + 0.11) % 1,
      tempoFn: (ds) => {
        const nQT = clamp(
          (ds.ecg.qtInterval - minMaxValues.qtInterval.min) /
          Math.max(1e-6, minMaxValues.qtInterval.max - minMaxValues.qtInterval.min), 0, 1);
        return 11 - 5.5 * nQT;
      },
      update({ ph, p, baseHueDeg, totalYears }) {
        const arr   = chlorideArrivalProgress(totalYears, lifespanYears);
        const shape = chlorideTriWithWarble(ph, currentDataSet);
        const hi = currentDataSet.healthIndex ?? 0.5;
        const ampCl = arr * (0.09 + 0.13 * p) * (0.9 + 0.1 * (1 - hi));
        const str = clamp(0.12 * (1 - arr) + clamp(ampCl * shape, 0, 1), 0, 1);
        const offset = -20 + 40 * p;
        let hue = guardHueGap(baseHueDeg, baseHueDeg + offset, 32, Math.sign(offset || 1));
        hue += this.nudgeMag * signed;
        hue += (12 + 6 * p) * Math.sin(ph * 0.88 - 0.24);
        return { str, hue, note: arr < 1 ? `  (arriving ${Math.round(arr * 100)}%)` : undefined };
      },
    },
    {
      label: 'CO2', labKey: 'carbonDioxide', phaseKey: 'phaseCO2', nudgeMag: 18,
      strengthLoc: gl.getUniformLocation(program, 'u_co2Strength'),
      hueLoc:      gl.getUniformLocation(program, 'u_co2HueDeg'),
      phaseSeed: (_h) => 0,
      tempoFn: (_ds) => 16.0,
      update({ ph, p, baseHueDeg, co2Pulse }) {
        const str = clamp(0.26 + 0.18 * (1 - p) + 0.22 * co2Pulse, 0, 0.62);
        let hue = baseHueDeg - (24 + 12 * p) + this.nudgeMag * signed;
        hue = guardHueGap(baseHueDeg, hue, 30, -1);
        hue += (12 + 6 * p) * Math.sin(ph * TAU + 0.2);
        return { str, hue };
      },
    },
    {
      label: 'Ca', labKey: 'calcium', phaseKey: 'phaseCa', nudgeMag: 12,
      strengthLoc: gl.getUniformLocation(program, 'u_calciumStrength'),
      hueLoc:      gl.getUniformLocation(program, 'u_calciumHueDeg'),
      phaseSeed: (_h) => 0,
      tempoFn: (_ds) => 24.0,
      update({ ph, p, baseHueDeg, caPulse, pCO2, pPR }) {
        const str = clamp(0.06 + 0.08 * (1 - pCO2) + 0.16 * caPulse, 0, 0.30);
        let hue = baseHueDeg + (45 + 25 * p) + this.nudgeMag * signed;
        hue = guardHueGap(baseHueDeg, hue, 32, +1);
        hue += (10 + 6 * pPR) * Math.sin(ph * TAU * 0.92 - 0.13);
        return { str, hue };
      },
    },
  ];

  // Internal animation state — phases and timing live here, not on window
  const state = {
    lastT: null,
    phaseN: null,
    phaseC: null,
    phaseNa: null,
    phaseCl: null,
    phaseCO2: null,
    phaseCa: null,
  };

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

  let phaseYears = clamp(lifespanYears * 0.15, 4, 10);
  let rateAmplitude = 0.3;

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

  // sample the health track over time (returns 0..1)
  function sampleHealthMod(totalYears, phaseYears, track) {
    if (!track || track.length === 0) return 0.5;
    const t = (totalYears / phaseYears) % 1; // 0..1 over one loop
    const f = t * (track.length - 1);
    const i = Math.floor(f);
    const frac = f - i;
    const a = track[i];
    const b = track[Math.min(i + 1, track.length - 1)];
    const mu = (1.0 - Math.cos(frac * Math.PI)) * 0.5;
    return a * (1 - mu) + b * mu;
  }

  // the draw() call just clears and draws the quad:
  function draw() {
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    setHSBUniforms();
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = performance.now() / 1000;
    state.lastT = state.lastT ?? t;
    const dt = Math.min(0.1, Math.max(0, t - state.lastT));
    state.lastT = t;

    const nowUnix = Math.floor(Date.now() / 1000);
    const baseYears =
      Math.max(0, nowUnix - inscriptionUnixSeconds) * YEARS_PER_SECOND;

    if (params.overrideYears !== null && params.previewSpeedYPS > 0) {
      params.overrideYears += params.previewSpeedYPS * dt;
    }

    const totalYears =
      (params.overrideYears !== null ? params.overrideYears : baseYears) *
      (params.timeWarp || 1);

    const healthMod01 = sampleHealthMod(totalYears, phaseYears, hiNorm);
    const rateMul = 1.0 + rateAmplitude * (healthMod01 - 0.5);
    const effectiveDecayPerYear = decayPerYear * rateMul;

    gl.uniform1f(uDecayPerYearLoc, effectiveDecayPerYear);
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

    // Decay ripple pulses once per frame
    co2Pulse *= Math.exp(-dt / 18.0);
    caPulse  *= Math.exp(-dt / 26.0);

    // Pre-compute cross-beam dependencies
    const pCO2 = winsorizedPercentileForLab(currentDataSet, 'carbonDioxide', healthDataSets);
    const pPR  = clamp(
      (currentDataSet.ecg.prInterval - minMaxValues.prInterval.min) /
      Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min), 0, 1);

    const beamDisplayLines = [];
    for (const cfg of beamConfigs) {
      const p = winsorizedPercentileForLab(currentDataSet, cfg.labKey, healthDataSets);
      state[cfg.phaseKey] = state[cfg.phaseKey] ?? cfg.phaseSeed(lastTwoHashDigits);
      state[cfg.phaseKey] = (state[cfg.phaseKey] + dt / Math.max(1e-3, cfg.tempoFn(currentDataSet))) % 1;
      const ph = state[cfg.phaseKey];
      const { str, hue, note } = cfg.update({ ph, p, baseHueDeg, totalYears, co2Pulse, caPulse, pCO2, pPR });
      if (cfg.strengthLoc) gl.uniform1f(cfg.strengthLoc, str);
      if (cfg.hueLoc)      gl.uniform1f(cfg.hueLoc, hue);
      beamDisplayLines.push(`${cfg.label}: str=${str.toFixed(2)} hue=${wrapDeg(hue).toFixed(0)}°${note ?? ''}`);
    }

    // Overlays — 4 corners
    overlayTL.textContent = [
      `DS:${currentDataSetIndex}  yr:${totalYears.toFixed(2)}`,
      params.overrideYears !== null ? `OVR ${params.overrideYears.toFixed(1)}y` : `REALTIME`,
      `warp:x${params.timeWarp}`,
    ].join('\n');

    overlayBL.textContent = [
      `HI:${currentDataSet.healthIndex?.toFixed(3) ?? 'N/A'}  decay:${effectiveDecayPerYear.toExponential(2)}`,
      `phY:${phaseYears.toFixed(1)}  inh:${inheritedHueDeg.toFixed(0)}deg ${inheritedStrength.toFixed(2)}`,
    ].join('\n');

    overlayTR.textContent = [
      `p:${currentDataSet.ecg.pAxis}(${pAxisNorm.toFixed(2)})  r:${currentDataSet.ecg.rAxis}(${rAxisNorm.toFixed(2)})`,
      baseHex,
    ].join('\n');

    overlayBR.textContent = beamDisplayLines.join('\n');

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
      phaseYears = clamp(lifespanYears * 0.15, 4, 10);

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

// Overlays — 4 corners, hidden by default, toggle with window.toggleOverlay()
function makeCornerOverlay(vert, horiz) {
  const div = document.createElement('div');
  Object.assign(div.style, {
    position: 'fixed',
    [vert]: '4px',
    [horiz]: '4px',
    padding: '2px 5px',
    background: 'rgba(0,0,0,0.4)',
    color: 'rgba(0,255,0,0.7)',
    whiteSpace: 'pre',
    fontFamily: 'monospace',
    fontSize: '10px',
    lineHeight: '1.4',
    textAlign: horiz === 'left' ? 'left' : 'right',
    zIndex: '9999',
    pointerEvents: 'none',
    display: 'none',
  });
  document.body.appendChild(div);
  return div;
}

const overlayTL = makeCornerOverlay('top', 'left');
const overlayBL = makeCornerOverlay('bottom', 'left');
const overlayTR = makeCornerOverlay('top', 'right');
const overlayBR = makeCornerOverlay('bottom', 'right');

window.toggleOverlay = () => {
  const show = overlayTL.style.display === 'none';
  const v = show ? 'block' : 'none';
  overlayTL.style.display = v;
  overlayBL.style.display = v;
  overlayTR.style.display = v;
  overlayBR.style.display = v;
};

init();
