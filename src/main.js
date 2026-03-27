// ---------------------------------------------
// main.js
// ---------------------------------------------
import { healthDataSets, minMaxValues } from "../data/health_data_sets.js";
import { blendDatasets, computeKarma, computeLiberationThreshold, getAgedDataset, applyCollectionInfluence } from "../data/decay_logic.js";

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

  // Kick off lifecycle engine — resolves chain state asynchronously, safe to start immediately
  initLifecycle().then(() => lcStartPoller()).catch(e => console.warn('[lifecycle]', e.message));

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
  const uPrNormLoc = gl.getUniformLocation(program, "u_prNorm");
  const uVentRateNormLoc = gl.getUniformLocation(program, "u_ventRateNorm");
  const uTAxisNormLoc = gl.getUniformLocation(program, "u_tAxisNorm");
  const uQrsTAngleLoc = gl.getUniformLocation(program, "u_qrsTAngle");
  const uQrsNormLoc   = gl.getUniformLocation(program, "u_qrsNorm");
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

  // Pre-compute BUN/Creatinine ratio winsorized range across all datasets (once)
  const allBunCreatRatios = healthDataSets
    .map((d) => d.labs.nitrogen / Math.max(0.1, d.labs.creatinine))
    .slice()
    .sort((a, b) => a - b);
  const bunCreatP05 = allBunCreatRatios[Math.floor(0.05 * (allBunCreatRatios.length - 1))];
  const bunCreatP95 = allBunCreatRatios[Math.ceil(0.95 * (allBunCreatRatios.length - 1))];
  const sortedQtcValues   = healthDataSets.map((d) => d.ecg.qtcInterval).sort((a, b) => a - b);
  const sortedPAxisValues = healthDataSets.map((d) => d.ecg.pAxis).sort((a, b) => a - b);
  const sortedRAxisValues = healthDataSets.map((d) => d.ecg.rAxis).sort((a, b) => a - b);
  const sortedTAxisValues = healthDataSets.map((d) => d.ecg.tAxis).sort((a, b) => a - b);

  // QRS-T angle: |rAxis - tAxis|, normalized over dataset range
  const allQrsTAngles = healthDataSets.map((d) => Math.abs(d.ecg.rAxis - d.ecg.tAxis));
  const qrsTAngleMin = Math.min(...allQrsTAngles);
  const qrsTAngleMax = Math.max(...allQrsTAngles);

  let currentDataSetIndex = 0;

  // Chain values — updated by lifecycle engine when on-chain; dev defaults otherwise
  let lastTwoHashDigits = 88;
  let inscriptionUnixSeconds = 1704067200;
  const YEARS_PER_SECOND = 1 / (365 * 24 * 3600);

  // Inherited hue — piece N inherits piece N-1's glucose hue (from allInheritedHues).
  // Console override for manual testing; null = auto-derive from allInheritedHues.
  let inheritedHueDegOverride = null;
  // DEV_START
  window.setInheritedHue = (deg) => { inheritedHueDegOverride = ((deg % 360) + 360) % 360; };
  window.resetInheritedHue = () => { inheritedHueDegOverride = null; };

  // Lifecycle console tools — write directly to module-scope lc (works dev + on-chain)
  // setReanimation(0..1) — simulate reanimation transition for current dataset
  window.setReanimation = (p) => {
    const partnerIdx = getPartnerIndex(currentDataSetIndex);
    lc.reanimationProgress    = Math.max(0, Math.min(1, Number(p)));
    lc.partnerInheritedHueDeg = allInheritedHues[partnerIdx >= 0 ? partnerIdx : 0] ?? 0;
    if (partnerIdx < 0) console.warn('Piece 0 is genesis — no reanimation partner.');
    else console.log(`Reanimation: piece ${currentDataSetIndex} ↔ piece ${partnerIdx} | partner hue: ${lc.partnerInheritedHueDeg.toFixed(1)}°`);
  };
  // setLiberated(bool) — simulate liberation (karma exhaustion, final cycle)
  window.setLiberated = (v) => {
    const partnerIdx = getPartnerIndex(currentDataSetIndex);
    lc.isLiberated            = v ? 1.0 : 0.0;
    lc.partnerInheritedHueDeg = allInheritedHues[partnerIdx >= 0 ? partnerIdx : 0] ?? 0;
  };
  // setVoidProgress(0..1) — simulate both partners at final cessation
  window.setVoidProgress = (v) => { lc.voidProgress = clamp(Number(v), 0, 1); };
  // getKarma / getBlend — inspect the reanimation system
  window.getKarma = (idxA, idxB) => {
    const blended = blendDatasets(healthDataSets[idxA], healthDataSets[idxB]);
    const karma = computeKarma(blended, minMaxValues);
    console.log(`Pair (${idxA}, ${idxB}) karma: ${karma.toFixed(4)} | threshold: ${lc.liberationThreshold.toFixed(4)} | liberated: ${karma < lc.liberationThreshold}`);
    return karma;
  };
  window.getBlend = (idxA, idxB) => {
    const blended = blendDatasets(healthDataSets[idxA], healthDataSets[idxB]);
    console.log('Blended dataset:', blended);
    return blended;
  };
  // DEV_END

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
  // R — toggle video recording
  // S — save high-res PNG snapshot
  window.addEventListener('keydown', (e) => {
    if (e.target !== document.body && e.target !== document.documentElement) return;
    const key = e.key.toUpperCase();

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

  // Fast init from window.PIECE — correct piece renders from frame 1, no piece-0 flash
  if (window.PIECE) {
    currentDataSetIndex    = window.PIECE.datasetIndex    ?? 0;
    lastTwoHashDigits      = window.PIECE.hashTail        ?? 88;
    inscriptionUnixSeconds = window.PIECE.inscriptionUnix ?? 1704067200;
    inheritedHueDegOverride = window.PIECE.inheritedHueDeg ?? null;
    lc.pieceIndex          = currentDataSetIndex;
    lc.hashTail            = lastTwoHashDigits;
    lc.mintUnix            = inscriptionUnixSeconds;
    lc.lifespanYears       = lifespanYearsFromHashDigits(lastTwoHashDigits);
  }

  const hash01 = lastTwoHashDigits / 99; // 0..1
  const signed = (hash01 - 0.5) * 2; // -1..+1

  // Tuned per-beam ranges (degrees) — recomputed in draw() when hashTail changes on reanimation
  let nudgeNa = 12 * signed;
  let nudgeCl = 14 * signed;
  let nudgeCO2 = 18 * signed;
  let nudgeCa = 12 * signed;

  // decay test helpers
  const params = {
    overrideYears: null,
    timeWarp: 1.0,
    previewSpeedYPS: 0,
  };

  // DEV_START
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
  // DEV_END

  // lifespan + aligned rate
  let lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);

  // set uniforms
  function setHSBUniforms(ds, datasets) {
    const { hue, sat, bri } = computeHSBFromStats(ds, datasets);
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
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.NITROGEN),
      strengthLoc: uNitrogenStrengthLoc, hueLoc: uNitrogenHueDegLoc, radiusLoc: uNitrogenRadiusLoc,
      update({ ph, p, ds }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp(0.58 * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.35 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.NITROGEN) + (10 + 8 * p) * Math.sin(ph * 0.93 + 0.14);
        return { str, hue };
      },
    },
    {
      label: 'C (Cr)', labKey: 'creatinine', phaseKey: 'C',
      phaseSeed: (h) => (h / 99) * 1.3 * Math.PI, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CREATININE),
      strengthLoc: uCreatinineStrengthLoc, hueLoc: uCreatinineHueDegLoc, radiusLoc: uCreatinineRadiusLoc,
      update({ ph, p, ds }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp((0.4 + 0.3 * p) * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.3 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.CREATININE) + (8 + 5 * p) * Math.sin(ph * 1.07 + 0.08);
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
      phaseSeed: () => 0, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CO2),
      strengthLoc: uCo2StrengthLoc, hueLoc: uCo2HueDegLoc, radiusLoc: null,
      update({ ph, p, baseHueDeg }) {
        const str = clamp(0.26 + 0.18 * (1 - p), 0, 0.62);
        let hue = baseHueDeg - (24 + 12 * p) + nudgeCO2;
        hue = guardHueGap(baseHueDeg, hue, 30, -1);
        hue += (12 + 6 * p) * Math.sin(ph * 1.0 + 0.2);
        return { str, hue };
      },
    },
    {
      label: 'Ca', labKey: 'calcium', phaseKey: 'Ca',
      phaseSeed: () => 0, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CALCIUM),
      strengthLoc: uCalciumStrengthLoc, hueLoc: uCalciumHueDegLoc, radiusLoc: uCalciumRadiusLoc,
      update({ ph, p, baseHueDeg, pPR }) {
        const str = clamp(0.06 + 0.24 * p, 0, 0.30);
        let hue = baseHueDeg + (45 + 25 * p) + nudgeCa;
        hue = guardHueGap(baseHueDeg, hue, 32, +1);
        hue += (10 + 6 * pPR) * Math.sin(ph * 0.92 - 0.13);
        return { str, hue };
      },
    },
  ];

  // the draw() call just clears and draws the quad:
  function draw() {
    // Advance lifecycle transitions and sync chain values from lc
    lcTick();
    if (lc.ready && lc.onChain) {
      if (lastTwoHashDigits !== lc.hashTail) {
        lastTwoHashDigits = lc.hashTail;
        const h01 = lastTwoHashDigits / 99;
        const sg  = (h01 - 0.5) * 2;
        nudgeNa  = 12 * sg;
        nudgeCl  = 14 * sg;
        nudgeCO2 = 18 * sg;
        nudgeCa  = 12 * sg;
        // Reset beam phase seeds so they reseed with the new hash on reanimation
        for (const cfg of beamConfigs) delete beamPhases[cfg.phaseKey];
      }
      inscriptionUnixSeconds = lc.mintUnix;
      lifespanYears          = lc.lifespanYears;
    }

    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = performance.now() / 1000;
    if (uTimeLoc) gl.uniform1f(uTimeLoc, t);
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

    // Chronological drift: piece ages through the real health timeline each frame.
    // On-chain: use dynamic collection (grows with new mints). Dev: use local healthDataSets.
    const datasets   = (lc.ready && lc.onChain && lc.collectionDatasets) ? lc.collectionDatasets : healthDataSets;
    const datasetIdx = (lc.ready && lc.onChain) ? lc.pieceIndex : currentDataSetIndex;
    const lifeFraction = clamp(totalYears / lifespanYears, 0, 1);
    const activeDataSet = applyCollectionInfluence(
      getAgedDataset(datasetIdx, lifeFraction, datasets),
      datasets,
      lifeFraction
    );
    setHSBUniforms(activeDataSet, datasets);

    gl.uniform1f(uTotalYearsLoc, totalYears);
    gl.uniform1f(uLifespanYearsLoc, lifespanYears);

    // ECG axis uniforms — percentile-ranked to prevent one outlier (2025-03-26) from
    // compressing all other datasets into the bottom third of the normalized range.
    const pAxisNorm = percentile(activeDataSet.ecg.pAxis, sortedPAxisValues);
    const rAxisNorm = percentile(activeDataSet.ecg.rAxis, sortedRAxisValues);
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
    const qtcPercentile = percentile(activeDataSet.ecg.qtcInterval, sortedQtcValues);
    if (uQtcPercentileLoc) gl.uniform1f(uQtcPercentileLoc, qtcPercentile);
    if (uPrNormLoc) gl.uniform1f(uPrNormLoc, prNorm);
    const ventRateNorm = clamp(
      normalize(activeDataSet.ecg.ventRate, minMaxValues.ventRate.min, minMaxValues.ventRate.max),
      0, 1
    );
    if (uVentRateNormLoc) gl.uniform1f(uVentRateNormLoc, ventRateNorm);
    const tAxisNorm = percentile(activeDataSet.ecg.tAxis, sortedTAxisValues);
    if (uTAxisNormLoc) gl.uniform1f(uTAxisNormLoc, tAxisNorm);
    const qrsTAngle = Math.abs(activeDataSet.ecg.rAxis - activeDataSet.ecg.tAxis);
    const qrsTAngleNorm = clamp(
      (qrsTAngle - qrsTAngleMin) / Math.max(1e-6, qrsTAngleMax - qrsTAngleMin),
      0, 1
    );
    if (uQrsTAngleLoc) gl.uniform1f(uQrsTAngleLoc, qrsTAngleNorm);
    const qrsNorm = normalize(activeDataSet.ecg.qrsInterval, minMaxValues.qrsInterval.min, minMaxValues.qrsInterval.max);
    if (uQrsNormLoc) gl.uniform1f(uQrsNormLoc, clamp(qrsNorm, 0, 1));

    // Inherited color field — sick pieces lose ancestral connection faster than healthy ones
    const fadeExp = 0.7 + 0.5 * (1 - clamp(activeDataSet.healthIndex ?? 0.5, 0, 1));
    const inheritedStrength = Math.pow(Math.max(0, 1 - lifeFraction), fadeExp);
    const inheritedHueDeg = inheritedHueDegOverride !== null
      ? inheritedHueDegOverride
      : allInheritedHues[currentDataSetIndex];
    if (uInheritedHueDegLoc) gl.uniform1f(uInheritedHueDegLoc, inheritedHueDeg);
    if (uInheritedStrengthLoc) gl.uniform1f(uInheritedStrengthLoc, inheritedStrength);
    if (uReanimationProgressLoc)    gl.uniform1f(uReanimationProgressLoc,    lc.reanimationProgress);
    if (uPartnerInheritedHueDegLoc) gl.uniform1f(uPartnerInheritedHueDegLoc, lc.partnerInheritedHueDeg);
    if (uIsLiberatedLoc)            gl.uniform1f(uIsLiberatedLoc,             lc.isLiberated);
    if (uVoidProgressLoc)           gl.uniform1f(uVoidProgressLoc,            lc.voidProgress);

    // Compute base hue
    const baseHSB = computeHSBFromStats(activeDataSet, datasets); // 0..1
    let baseHueDeg = baseHSB.hue * 360.0;

    // Pre-compute cross-beam dependencies for calcium hue
    const pPR = clamp(
      (activeDataSet.ecg.prInterval - minMaxValues.prInterval.min) /
      Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min),
      0, 1
    );

    for (const cfg of beamConfigs) {
      beamPhases[cfg.phaseKey] = beamPhases[cfg.phaseKey] ?? cfg.phaseSeed(lastTwoHashDigits);
      if (cfg.tickTwoPi) {
        beamPhases[cfg.phaseKey] += (dt * 2 * Math.PI) / Math.max(1e-3, cfg.tempoFn(activeDataSet));
      } else {
        beamPhases[cfg.phaseKey] = (beamPhases[cfg.phaseKey] + dt / Math.max(1e-3, cfg.tempoFn(activeDataSet))) % 1;
      }
      const ph = beamPhases[cfg.phaseKey];
      const p = winsorizedPercentileForLab(activeDataSet, cfg.labKey, datasets);
      const { str, hue } = cfg.update({ ph, p, ds: activeDataSet, baseHueDeg, totalYears, pPR });
      if (cfg.strengthLoc) gl.uniform1f(cfg.strengthLoc, str);
      if (cfg.hueLoc)      gl.uniform1f(cfg.hueLoc, hue);
      if (cfg.radiusLoc)   gl.uniform1f(cfg.radiusLoc, p);
    }

    // BUN/Creatinine ratio: spatial coupling between nitrogen and creatinine blobs
    const bunCreatRatio = activeDataSet.labs.nitrogen / Math.max(0.1, activeDataSet.labs.creatinine);
    const bunCreatRatioNorm = clamp(
      (bunCreatRatio - bunCreatP05) / Math.max(1e-9, bunCreatP95 - bunCreatP05),
      0, 1
    );
    if (uBunCreatRatioNormLoc) gl.uniform1f(uBunCreatRatioNormLoc, bunCreatRatioNorm);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  }

  gl.clearColor(0, 0, 0, 1);
  draw();

  // DEV_START
  // manually switch datasets in the console
  window.changeDataset = (newIndex) => {
    if (
      Number.isInteger(newIndex) &&
      newIndex >= 0 &&
      newIndex < healthDataSets.length
    ) {
      currentDataSetIndex = newIndex;
      lc.pieceIndex = newIndex;

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
  // BUN adds urgency: waste accumulation drives more agitated breathing
  const pBUN = winsorizedPercentileForLab(dataSet, 'nitrogen', healthDataSets);
  let amp = 0.05 + 0.07 * V + 0.06 * pBUN; // 5–18% base; high BUN adds up to 6% more
  const extreme = pv < 0.1 || pv > 0.9 || pq < 0.1 || pq > 0.9;
  if (extreme) amp = Math.min(0.25, amp + 0.04); // up to 25% under extreme ECG + high BUN
  return amp;
}

// Tempo: data-driven per beam
function getBeamTempoSeconds(dataSet, beamId) {
  switch (beamId) {
    case BEAM.NITROGEN: {
      // High BUN (waste accumulating) → more urgent breathing cycle
      const vals = healthDataSets.map(d => d.labs.nitrogen).sort((a, b) => a - b);
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
      const vals = healthDataSets.map(d => d.labs.eGFR).sort((a, b) => a - b);
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
function getBeamHueAnchorDeg(dataSet, beamId) {
  const { hue } = computeHSBFromStats(dataSet, healthDataSets);
  const baseDeg = hue * 360.0;
  switch (beamId) {
    case BEAM.NITROGEN: {
      // eGFR offsets nitrogen ±80° from base. Low eGFR (failing kidneys) pushes
      // the blob away from the glucose background — disease creates color tension.
      const vals = healthDataSets.map(d => d.labs.eGFR).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.eGFR, vals);
      return baseDeg + (p - 0.5) * 160; // ±80° from base
    }
    case BEAM.CREATININE: {
      // Potassium offsets creatinine ±60° from base — K+ varies independently.
      const vals = healthDataSets.map(d => d.labs.potassium).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.potassium, vals);
      return baseDeg + (p - 0.5) * 120; // ±60° from base
    }
    default:
      return baseDeg;
  }
}

// ─────────────────────────────────────────────────────────────
// Partner pairing — module scope (pure, no closures)
// ─────────────────────────────────────────────────────────────
function getPartnerIndex(idx) {
  if (idx === 0) return -1; // genesis — no partner
  return idx % 2 === 0 ? idx + 1 : idx - 1;
}

// Inherited hues: piece N inherits piece N-1's glucose hue
const allInheritedHues = healthDataSets.map((_, i) =>
  computeHSBFromStats(healthDataSets[Math.max(0, i - 1)], healthDataSets).hue * 360
);

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE ENGINE
// ═══════════════════════════════════════════════════════════════

// Minimal inline CBOR decoder — uint, negint, bytes, text, array, map, tag, simple
function cborDecode(input) {
  const buf = input instanceof ArrayBuffer ? input : input.buffer;
  const dv  = new DataView(buf);
  let pos = 0;
  function next() {
    const b  = dv.getUint8(pos++);
    const mt = b >> 5, ai = b & 0x1f;
    let n;
    if      (ai < 24)  n = ai;
    else if (ai === 24) { n = dv.getUint8(pos);             pos += 1; }
    else if (ai === 25) { n = dv.getUint16(pos);            pos += 2; }
    else if (ai === 26) { n = dv.getUint32(pos);            pos += 4; }
    else if (ai === 27) { n = Number(dv.getBigUint64(pos)); pos += 8; }
    else n = 0;
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const s = new Uint8Array(buf, pos, n); pos += n; return s; }
      case 3: { const s = new TextDecoder().decode(new Uint8Array(buf, pos, n)); pos += n; return s; }
      case 4: { const a = []; for (let i = 0; i < n; i++) a.push(next()); return a; }
      case 5: { const m = {}; for (let i = 0; i < n; i++) { const k = next(); m[k] = next(); } return m; }
      case 6: return next(); // tag — skip tag number, decode value
      case 7: return n === 20 ? false : n === 21 ? true : n === 22 ? null : undefined;
    }
  }
  return next();
}

// Network helpers with timeout
async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res;
  } catch (e) { clearTimeout(tid); throw e; }
}

async function lcBlockHeight() {
  return parseInt(await (await fetchWithTimeout('/r/blockheight')).text(), 10);
}
async function lcBlockInfo(height) {
  return (await fetchWithTimeout(`/r/blockinfo/${height}`)).json();
}
async function lcMetadata(id) {
  const buf = await (await fetchWithTimeout(`/r/metadata/${id}`)).arrayBuffer();
  return cborDecode(buf);
}
async function lcSelf() {
  return (await fetchWithTimeout('/r/inscription/self')).json();
}
async function lcInscriptionInfo(id) {
  return (await fetchWithTimeout(`/r/inscription/${id}`)).json();
}
async function lcAllChildren(parentId) {
  const ids = [];
  for (let page = 0; ; page++) {
    const d = await (await fetchWithTimeout(`/r/children/${parentId}/inscriptions/${page}`)).json();
    ids.push(...(d.ids ?? []));
    if (!d.more) break;
  }
  return ids;
}

// Lifecycle state — single mutable object read by draw() each frame
const lc = {
  ready:   false,  // true once initLifecycle() completes
  onChain: false,  // true if running inside an Ordinals viewer

  // Piece identity
  pieceIndex: 0,

  // Chain-derived timing (updated at boot and on each reanimation)
  hashTail:       88,
  mintBlock:      0,
  mintUnix:       1704067200,
  lifespanYears:  lifespanYearsFromHashDigits(88),
  cessationBlock: Infinity,
  cycleIndex:     0,

  // Phase: 'living' | 'reanimating' | 'liberated' | 'void'
  phase: 'living',

  // Transition interpolation
  transitionStartMs: null,
  transitionType:    null, // 'reanimation' | 'void'

  // Uniforms fed into draw() each frame
  reanimationProgress:    0,
  partnerInheritedHueDeg: 0,
  isLiberated:            0,
  voidProgress:           0,

  // Liberation threshold (recomputed after sibling discovery)
  liberationThreshold: computeLiberationThreshold(healthDataSets, minMaxValues),

  // Bookkeeping
  lastKnownBlock:     0,
  siblingIdMap:       {}, // pieceIndex → inscriptionId
  collectionDatasets: null, // sorted by pieceIndex; null = use local healthDataSets

  // Sibling refresh (for autonomous wall-mount / new-mint propagation)
  parentId:          null, // inscription 0's id — set in initLifecycle
  knownSiblingCount: 0,    // total child count last seen
  datasetByIdx:      {},   // pieceIndex → dataset (all known siblings)
};

const LC_BLOCKS_PER_YEAR = 52560;   // ~144 blocks/day × 365
const LC_BLOCK_WIN_MS    = 600_000; // one ~10-min block window (transition duration)

async function initLifecycle() {
  // Try to reach chain. If we're not in an Ordinals viewer, stay in dev mode.
  let selfInfo;
  try {
    selfInfo = await lcSelf();
  } catch {
    console.log('[lifecycle] dev mode — using hardcoded defaults');
    lc.ready = true;
    return;
  }

  lc.onChain = true;

  // Fetch own CBOR metadata to get piece identity and timing
  let meta = {};
  try { meta = await lcMetadata(selfInfo.id); } catch (e) {
    console.warn('[lifecycle] own metadata fetch failed:', e.message);
  }

  lc.pieceIndex     = meta.pieceIndex      ?? 0;
  lc.hashTail       = meta.hashTail        ?? 88;
  lc.mintUnix       = meta.inscriptionUnix ?? (selfInfo.timestamp ?? 1704067200);
  lc.mintBlock      = selfInfo.height      ?? 0;
  lc.lifespanYears  = lifespanYearsFromHashDigits(lc.hashTail);
  lc.cessationBlock = lc.mintBlock + Math.round(lc.lifespanYears * LC_BLOCKS_PER_YEAR);

  // Discover siblings — children of parent inscription (inscription 0 = the engine)
  const parentId = selfInfo.parent;
  lc.parentId = parentId ?? null;
  if (parentId) {
    try {
      const sibIds = await lcAllChildren(parentId);
      lc.knownSiblingCount = sibIds.length;

      // Fetch each sibling's metadata to build a pieceIndex → id map
      const fetched = await Promise.all(
        sibIds.map(id =>
          lcMetadata(id)
            .then(m => ({ id, idx: m.pieceIndex ?? -1, dataset: m.dataset ?? null }))
            .catch(() => null)
        )
      );
      const validSibs = fetched.filter(Boolean).filter(m => m.idx >= 0);
      lc.siblingIdMap  = Object.fromEntries(validSibs.map(m => [m.idx, m.id]));
      lc.datasetByIdx  = Object.fromEntries(
        validSibs.map(m => [m.idx, m.dataset ?? healthDataSets[m.idx]])
      );

      // Build dynamic collection sorted by pieceIndex.
      // Falls back to local healthDataSets entry if dataset absent from metadata.
      const sibDatasets = validSibs
        .sort((a, b) => a.idx - b.idx)
        .map(m => m.dataset ?? healthDataSets[m.idx] ?? null)
        .filter(Boolean);
      if (sibDatasets.length > 0) lc.collectionDatasets = sibDatasets;
    } catch (e) {
      console.warn('[lifecycle] sibling discovery failed:', e.message);
    }
  }

  await lcPoll();
  lc.ready = true;
}

// Called on every new block — picks up pieces minted after this one was inscribed.
// New mints shift the living collection, which affects color/percentile of all existing pieces.
async function lcRefreshSiblings() {
  if (!lc.parentId) return;
  try {
    const sibIds = await lcAllChildren(lc.parentId);
    if (sibIds.length <= lc.knownSiblingCount) return; // nothing new

    // Only fetch metadata for inscriptions we haven't seen yet
    const knownIdSet = new Set(Object.values(lc.siblingIdMap));
    const newIds     = sibIds.filter(id => !knownIdSet.has(id));
    const fetched    = await Promise.all(
      newIds.map(id =>
        lcMetadata(id)
          .then(m => ({ id, idx: m.pieceIndex ?? -1, dataset: m.dataset ?? null }))
          .catch(() => null)
      )
    );

    for (const m of fetched.filter(Boolean).filter(m => m.idx >= 0)) {
      lc.siblingIdMap[m.idx] = m.id;
      lc.datasetByIdx[m.idx] = m.dataset ?? healthDataSets[m.idx];
    }

    // Rebuild sorted collection
    lc.collectionDatasets = Object.keys(lc.datasetByIdx)
      .map(Number).sort((a, b) => a - b)
      .map(idx => lc.datasetByIdx[idx]);

    lc.knownSiblingCount    = sibIds.length;
    lc.liberationThreshold  = computeLiberationThreshold(lc.collectionDatasets, minMaxValues);
    console.log(`[lifecycle] collection updated — ${lc.collectionDatasets.length} pieces`);
  } catch (e) {
    console.warn('[lifecycle] sibling refresh failed:', e.message);
  }
}

async function lcPoll() {
  let block;
  try { block = await lcBlockHeight(); } catch { return; }
  if (block === lc.lastKnownBlock) return;
  lc.lastKnownBlock = block;
  await lcRefreshSiblings(); // pick up any new mints before resolving lifecycle
  await lcResolve(block);
}

async function lcResolve(currentBlock) {
  if (lc.phase === 'void') return;
  if (lc.phase === 'liberated') { await lcCheckVoid(currentBlock); return; }

  if (currentBlock < lc.cessationBlock) {
    lc.phase = 'living';
    return;
  }

  // At or past cessation — run karma check
  const partnerIdx = getPartnerIndex(lc.pieceIndex);

  if (partnerIdx < 0) {
    // Genesis piece — no karma check, direct liberation
    lc.phase       = 'liberated';
    lc.isLiberated = 1.0;
    console.log('[lifecycle] piece 0 (genesis) liberated');
    await lcCheckVoid(currentBlock);
    return;
  }

  lc.partnerInheritedHueDeg = allInheritedHues[partnerIdx] ?? 0;

  // Use local datasets as proxy; on-chain would fetch partner's /r/metadata/{id}
  const ownDs     = healthDataSets[lc.pieceIndex]  ?? healthDataSets[0];
  const partnerDs = healthDataSets[partnerIdx]      ?? healthDataSets[0];
  const blended   = blendDatasets(ownDs, partnerDs);
  const karma     = computeKarma(blended, minMaxValues);

  if (karma < lc.liberationThreshold) {
    lc.phase       = 'liberated';
    lc.isLiberated = 1.0;
    console.log(`[lifecycle] piece ${lc.pieceIndex} liberated — karma ${karma.toFixed(4)} < threshold ${lc.liberationThreshold.toFixed(4)}`);
    await lcCheckVoid(currentBlock);
    return;
  }

  // Reanimate — begin transition if not already underway
  if (lc.transitionStartMs === null) {
    lc.phase             = 'reanimating';
    lc.transitionStartMs = Date.now();
    lc.transitionType    = 'reanimation';
    lc.cycleIndex++;

    // Derive next lifespan from cessation block hash
    try {
      const info  = await lcBlockInfo(lc.cessationBlock);
      const tail  = parseInt((info.hash ?? '').slice(-2), 16) % 100; // 0..99
      lc.hashTail       = tail;
      lc.lifespanYears  = lifespanYearsFromHashDigits(tail);
      lc.mintBlock      = lc.cessationBlock;
      lc.mintUnix       = info.timestamp ?? lc.mintUnix;
      lc.cessationBlock = lc.mintBlock + Math.round(lc.lifespanYears * LC_BLOCKS_PER_YEAR);
      console.log(`[lifecycle] piece ${lc.pieceIndex} cycle ${lc.cycleIndex} — lifespan ${lc.lifespanYears.toFixed(1)}y`);
    } catch (e) {
      console.warn('[lifecycle] block info fetch failed:', e.message);
    }
  }
}

// Simulate partner's lifecycle forward to determine if they have liberated by currentBlock.
// Iterates through reanimation cycles, fetching cessation block hashes as needed.
async function lcIsPartnerLiberated(partnerIdx, currentBlock) {
  const partnerInscriptionId = lc.siblingIdMap?.[partnerIdx];
  if (!partnerInscriptionId) return false;

  let partnerInfo, partnerMeta;
  try {
    [partnerInfo, partnerMeta] = await Promise.all([
      lcInscriptionInfo(partnerInscriptionId),
      lcMetadata(partnerInscriptionId),
    ]);
  } catch (e) {
    console.warn('[lifecycle] partner info fetch failed:', e.message);
    return false;
  }

  let mintBlock = partnerInfo.height ?? 0;
  let hashTail  = partnerMeta.hashTail ?? 88;

  for (let cycle = 0; cycle < 50; cycle++) {
    const cessationBlock = mintBlock + Math.round(lifespanYearsFromHashDigits(hashTail) * LC_BLOCKS_PER_YEAR);

    if (currentBlock < cessationBlock) return false; // still living in this cycle

    // Piece 0 (genesis) always liberates directly — no karma check
    if (partnerIdx === 0) return true;

    // Karma check from partner's perspective: partner = self, own piece = their partner
    const partnerDs = healthDataSets[partnerIdx]    ?? healthDataSets[0];
    const ownDs     = healthDataSets[lc.pieceIndex] ?? healthDataSets[0];
    const karma     = computeKarma(blendDatasets(partnerDs, ownDs), minMaxValues);

    if (karma < lc.liberationThreshold) return true; // liberated at this cessation

    // Reanimated — derive next cycle from cessation block hash
    try {
      const info = await lcBlockInfo(cessationBlock);
      hashTail   = parseInt((info.hash ?? '').slice(-2), 16) % 100;
      mintBlock  = cessationBlock;
    } catch (e) {
      console.warn('[lifecycle] partner cessation block fetch failed:', e.message);
      return false;
    }
  }

  return false; // cycle cap reached
}

// Check if partner has also liberated → trigger void transition
async function lcCheckVoid(currentBlock) {
  if (lc.transitionType === 'void') return; // already in progress

  // Piece 0's void partner is piece 1; all others use normal pairing
  const partnerIdx = lc.pieceIndex === 0 ? 1 : getPartnerIndex(lc.pieceIndex);
  if (partnerIdx < 0 || partnerIdx >= healthDataSets.length) return;

  const partnerLiberated = await lcIsPartnerLiberated(partnerIdx, currentBlock);
  if (partnerLiberated) {
    lc.phase             = 'void';
    lc.transitionStartMs = Date.now();
    lc.transitionType    = 'void';
    console.log(`[lifecycle] piece ${lc.pieceIndex} entering void — both partners liberated`);
  }
}

// Called once per frame from draw() — advances transition progress 0→1
function lcTick() {
  if (lc.transitionStartMs === null) return;
  const t = Math.min(1, (Date.now() - lc.transitionStartMs) / LC_BLOCK_WIN_MS);
  if (lc.transitionType === 'reanimation') {
    lc.reanimationProgress = t;
    if (t >= 1) {
      lc.reanimationProgress = 0;
      lc.transitionStartMs   = null;
      lc.transitionType      = null;
      lc.phase               = 'living';
    }
  } else if (lc.transitionType === 'void') {
    lc.voidProgress = t; // holds at 1.0 after complete
  }
}

function lcStartPoller() {
  setInterval(() => lcPoll(), 60_000);
}

init();
