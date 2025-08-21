// ---------------------------------------------
// main.js
// ---------------------------------------------
import { healthDataSets, minMaxValues } from "../data/health_data_sets.js";
// 1) Grab the canvas and WebGL2 context
const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");
if (!gl) {
  alert("WebGL2 is not available in your browser.");
}

// 2) A helper to fetch a GLSL file as text
async function loadShaderSource(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url}: ${response.status}`);
  }
  return await response.text();
}

// 3) Compile a single shader (vertex or fragment)
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

// 4) Link vertex + fragment into a program
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

  // We can delete individual shaders once linked
  gl.deleteShader(vShader);
  gl.deleteShader(fShader);

  return program;
}

// 5) Resize‐handling utility, to keep canvas at full window size
function resizeCanvasToDisplaySize(canvas) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

// 6) Once everything is ready, we’ll initialize WebGL
async function init() {
  // A) Resize canvas right away, then whenever the window changes:
  resizeCanvasToDisplaySize(canvas);
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas);
    draw();
  });

  // B) Load and compile shaders:
  const vertexSrc = await loadShaderSource("./src/shaders/vertex.glsl");
  const fragmentSrc = await loadShaderSource("./src/shaders/fragment.glsl");
  const program = createProgram(gl, vertexSrc, fragmentSrc);
  gl.useProgram(program);

  // C) Set up a fullscreen quad (two triangles covering clip-space)
  const positionAttribLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Six floats: two triangles
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

  // D) uniform locations
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uGlucoseLoc = gl.getUniformLocation(program, "u_glucose");
  const uPotassiumLoc = gl.getUniformLocation(program, "u_potassium");
  const uEgfrLoc = gl.getUniformLocation(program, "u_eGFR");

  let currentDataSetIndex = 0;
  let currentDataSet = healthDataSets[currentDataSetIndex];

  // F) set uniforms
  function setHSBUniforms() {
    const { hue, sat, bri } = computeHSBFromStats(
      currentDataSet,
      healthDataSets
    );

    // Convert hue from [0..1] to degrees
    gl.uniform1f(uGlucoseLoc, hue); // Used as hue
    gl.uniform1f(uPotassiumLoc, sat); // Used as saturation
    gl.uniform1f(uEgfrLoc, bri); // Used as brightness
  }

  // H) Tell WebGL the resolution (in pixels)
  function setResolutionUniform() {
    gl.uniform2f(uResolutionLoc, gl.canvas.width, gl.canvas.height);
  }

  // I) The draw() call just clears and draws the quad:
  function draw() {
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    setHSBUniforms();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  }

  gl.clearColor(0, 0, 0, 1);
  draw();

  // L) If you want to “manually switch” datasets, e.g. enter a new index in the console:
  window.changeDataset = (newIndex) => {
    if (
      Number.isInteger(newIndex) &&
      newIndex >= 0 &&
      newIndex < healthDataSets.length
    ) {
      currentDataSetIndex = newIndex;
      currentDataSet = healthDataSets[currentDataSetIndex];
      draw();
    } else {
      console.warn("Invalid dataset index:", newIndex);
    }
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

init();
