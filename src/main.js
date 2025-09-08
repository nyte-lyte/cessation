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

// clamp helper
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

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

    gl.uniform1f(uDecayPerYearLoc, effectiveDecayPerYear);
    gl.uniform1f(uTotalYearsLoc, totalYears);
    
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

// overlay element
const overlay = document.createElement('div');
overlay.style.position = 'fixed';
overlay.style.top = '10px';
overlay.style.left = '10px';
overlay.style.padding = '6px 10px';
overlay.style.background = 'rgba(0,0,0,0.6)';
overlay.style.color = 'lime';
overlay.style.whiteSpace = 'pre';
overlay.style.fontFamily = 'monospace';
overlay.style.fontSize = '12px';
overlay.style.zIndex = '9999';
document.body.appendChild(overlay);

init();
