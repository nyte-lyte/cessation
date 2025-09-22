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

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function normalize(value, min, max) {
  if (max - min === 0) return 0;
  return (value - min) / (max / min);
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

  // delete individual shaders once linked
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

  // six floats: two triangles
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  gl.enableVertexAttribArray(positionAttribLocation);
  gl.vertexAttribPointer(
    positionAttribLocation,
    2, // 2 components per vertex (x, y)
    gl.FLOAT, // type
    false, // normalize?
    0, // stride (0 = move forward sizeOf(float)*2 each iteration)
    0 // offset into buffer
  );

  // uniform locations
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uGlucoseLoc = gl.getUniformLocation(program, "u_glucose");
  const uPotassiumLoc = gl.getUniformLocation(program, "u_potassium");
  const uEgfrLoc = gl.getUniformLocation(program, "u_eGFR");
  const uDecayPerYearLoc = gl.getUniformLocation(program, "u_decayPerYear");
  const uTotalYearsLoc = gl.getUniformLocation(program, "u_totalYears");

  const uNitrogenStrengthLoc = gl.getUniformLocation(program, "u_nitrogenStrength");
  const uNitrogenHueDegLoc = gl.getUniformLocation(program, "u_nitrogenHueDeg");

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

  // decay test helpers
  const params = {
    overrideYears: null,
    timeWarp: 1.0,
    previewSpeedYPS: 0
  };

  window.setYears = (y) => {
    params.overrideYears = (y == null ? null : Number(y));
  };
  window.clearYears = () => {
    params.overrideYears = null;
  };
  window.timeWarp = (f) => {
    params.timeWarp = Math.max(0, Number(f));
  };
  window.playPreview = (speedYPS = 4) => { params.previewSpeedYPS = Math.max(0, Number(speedYPS)); };
  window.stopPreview = () => { params.previewSpeedYPS = 0; };

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

    // convert hue from [0..1] to degrees
    gl.uniform1f(uGlucoseLoc, hue); // Used as hue
    gl.uniform1f(uPotassiumLoc, sat); // Used as saturation
    gl.uniform1f(uEgfrLoc, bri); // Used as brightness
  }

  // tell WebGL the resolution (in pixels)
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
    // cosine interpolation
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
    window.__lastT = window.__lastT ?? t;
    const dt = Math.min(0.1, Math.max(0, t - window.__lastT));
    window.__lastT = t;

    const nowUnix = Math.floor(Date.now() / 1000);
    //const totalYears = Math.max(0, nowUnix - inscriptionUnixSeconds) * YEARS_PER_SECOND;
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

    // ── NITROGEN (debug wiring for visibility) ──
    const ampN = getBreathingAmplitude(currentDataSet); // ~0.05..0.12 (up to 0.18)
    const tempoN = getBeamTempoSeconds(currentDataSet, BEAM.NITROGEN); // stub returns ~10s
    // keep a phase accumulator on window so it persists:
    window.__phaseN =
      (window.__phaseN || 0) + (dt * (2 * Math.PI)) / Math.max(1e-3, tempoN);

    // simple assertiveness placeholder (we’ll replace with data-driven soon)
    const assertN = 0.5;

    // strength breathes with amplitude (bounded 0..1)
    const strN = Math.min(
      1.0,
      Math.max(0.0, assertN * (0.5 + 0.5 * Math.sin(window.__phaseN) * ampN))
    );

    // hue anchor + drift (scaffold stubs for now)
    const hueAnchorN = getBeamHueAnchorDeg(currentDataSet, BEAM.NITROGEN); // near base hue
    const hueDriftN = getBeamHueDriftDeg(currentDataSet, BEAM.NITROGEN); // default 12°
    const hueDegN = hueAnchorN + hueDriftN * Math.sin(window.__phaseN);

    // push uniforms (guard against null if optimized out)
    if (uNitrogenStrengthLoc) gl.uniform1f(uNitrogenStrengthLoc, strN);
    if (uNitrogenHueDegLoc) gl.uniform1f(uNitrogenHueDegLoc, hueDegN); 

    overlay.textContent = [
      `Dataset: ${currentDataSetIndex}`,
      `HealthIndex: ${currentDataSet.healthIndex?.toFixed(3) ?? "N/A"}`,
      `Years: ${totalYears.toFixed(2)}`,
      `DecayRate(eff): ${effectiveDecayPerYear.toExponential(3)}`,
      `PhaseYears: ${phaseYears.toFixed(2)}`,
      params.overrideYears !== null
        ? `Mode: OVERRIDE (${params.overrideYears}y)`
        : `Mode: REALTIME`,
      `Warp: x${params.timeWarp}`,
    ].join("\n");

    beamOverlay.textContent = `N (BUN): str=${strN.toFixed(2)} hue=${(
      hueDegN % 360
    ).toFixed(0)}°`;

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
      lifespanYears      = lifespanYearsFromHashDigits(lastTwoHashDigits);
      decayPerYear       = baseDecayPerYear32 * (32 / lifespanYears);
      phaseYears         = clamp(lifespanYears * 0.15, 4, 10);
      
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
// BEAM SCAFFOLD (no-ops for now) — safe to paste today
// ──────────────────────────────────────────────────────────────

// 0) Beam IDs (fixed order; we’ll use indices later for arrays)
const BEAM = Object.freeze({
  NITROGEN: 0,      // BUN (direct)
  CREATININE: 1,    // direct
  SODIUM: 2,        // lifespan @ ~20%
  CHLORIDE: 3,      // lifespan @ ~60%
  CO2: 4,           // ripple
  CALCIUM: 5        // ripple
});
const BEAM_COUNT = 6;

// 1) Winsorized percentile helper for any lab key (5–95%)
function winsorizedPercentileForLab(dataSet, labKey, datasets = healthDataSets) {
  const values = datasets.map(d => d.labs[labKey]).slice().sort((a,b)=>a-b);
  if (values.length < 2) return 0.5;
  const p05 = values[Math.floor(0.05 * (values.length - 1))];
  const p95 = values[Math.ceil(0.95 * (values.length - 1))];
  const v = dataSet.labs[labKey];
  const clamped = Math.max(p05, Math.min(p95, v));
  // rank within clamped range
  return (clamped - p05) / Math.max(1e-9, (p95 - p05)); // 0..1
}

// 2) Breathing amplitude from ECG variability (ventRate + qtcInterval)
// Returns fraction (e.g., 0.05..0.12; up to 0.18 for extremes)
function getBreathingAmplitude(dataSet) {
  const pv = normalize(dataSet.ecg.ventRate, minMaxValues.ventRate.min, minMaxValues.ventRate.max); // 0..1
  const pq = normalize(dataSet.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max); // 0..1
  const uv = Math.abs(pv - 0.5);
  const uq = Math.abs(pq - 0.5);
  const V = 2 * Math.max(uv, uq); // 0..1
  let amp = 0.05 + 0.07 * V;      // 5–12%
  const extreme = (pv < 0.10 || pv > 0.90 || pq < 0.10 || pq > 0.90);
  if (extreme) amp = Math.min(0.18, amp + 0.03); // up to 18%
  return amp;
}

// 3) Tempo mapper stub — returns seconds per cycle for a beam (we’ll flesh per beam)
function getBeamTempoSeconds(dataSet, beamId) {
  switch (beamId) {
    case BEAM.NITROGEN:   /* PR-driven (7–14s target) */ return 10.0;
    case BEAM.CREATININE: /* QTc-driven (9–18s)        */ return 12.0;
    case BEAM.SODIUM:     /* ventRate-scaled (4–9s)    */ return 7.0;
    case BEAM.CHLORIDE:   /* QRS-driven (6–12s)        */ return 9.0;
    case BEAM.CO2:        /* P-axis (12–24s)           */ return 16.0;
    case BEAM.CALCIUM:    /* T-axis (18–36s)           */ return 24.0;
    default: return 12.0;
  }
}

// 4) Hue anchor + drift stubs (per-beam personalities will replace these)
function getBeamHueAnchorDeg(dataSet, beamId) {
  // For now: anchor near the base hue derived from glucose percentile
  const { hue } = computeHSBFromStats(dataSet, healthDataSets);
  return hue * 360.0; // degrees
}
function getBeamHueDriftDeg(dataSet, beamId) {
  // Default gentle drift; we’ll specialize per beam later
  return 12.0; // degrees
}

// 5) Assertiveness band stub (maps winsorized percentile → band top/bottom)
function getBeamAssertiveness(dataSet, beamId) {
  // Return a nominal center for now; real bands come when we wire each beam
  return 0.50; // fraction 0..1 (pre-budget), placeholder
}

// 6) Lifespan-proportional total cap (+ soft decay dimmer)
function getTotalIntensityCap(lifespanYears, decayProgress /*0..1*/) {
  // Map lifespan 10→64y to 0.28→0.38 linearly (clamped)
  const L = Math.max(10, Math.min(64, lifespanYears));
  const base = 0.28 + ( (L - 10) / (64 - 10) ) * (0.38 - 0.28);
  const dimmer = Math.max(0.3, 1.0 - decayProgress); // never below 30%
  return base * dimmer;
}
const PER_BEAM_CAP = 0.30;    // with +0.05 grace for lifespan entrances (applied later)

// 7) Beam state container (we’ll fill Nitrogen first next session)
const beamState = Array.from({ length: BEAM_COUNT }, (_, id) => ({
  id,
  active: false,            // will flip true as beams enter (Nitrogen true next session)
  assertiveness: 0.0,       // 0..1 pre-budget
  hueAnchorDeg: 0.0,        // degrees
  hueDriftDeg: 0.0,         // degrees
  tempoSec: 12.0,           // seconds per breathing cycle
  phase: 0.0,               // radians, updated over time
  baseline: 0.0,            // for ripple accumulation (CO2/Ca later)
  strength: 0.0             // current, post-envelope, pre-budget (will be scaled)
}));

// 8) Overlay toggle (handy during dev)
window.toggleOverlay = () => {
  overlay.style.display = (overlay.style.display === 'none' ? 'block' : 'none');
};


// overlay element
const overlay = document.createElement('div');
overlay.style.position = 'fixed';
overlay.style.top = '5px';
overlay.style.left = '10px';
overlay.style.padding = '6px 10px';
overlay.style.background = 'rgba(0, 0, 0, 0.6)';
overlay.style.color = 'lime';
overlay.style.whiteSpace = 'pre';
overlay.style.fontFamily = 'monospace';
overlay.style.fontSize = '12px';
overlay.style.textAlign = 'left'
overlay.style.zIndex = '9999';
document.body.appendChild(overlay);

const beamOverlay = document.createElement("div");
beamOverlay.style.position = "fixed";
beamOverlay.style.top = "5px";
beamOverlay.style.left = "auto";
beamOverlay.style.right = "10px"
beamOverlay.style.padding = "6px 10px";
beamOverlay.style.background = "rgba(0, 0, 0, 0.6)";
beamOverlay.style.color = "lime";
beamOverlay.style.whiteSpace = "pre";
beamOverlay.style.fontFamily = "monospace";
beamOverlay.style.fontSize = "12px";
beamOverlay.style.textAlign = "right"
beamOverlay.style.zIndex = "9999";
beamOverlay.style.pointerEvents = "none"
document.body.appendChild(beamOverlay);

init();
