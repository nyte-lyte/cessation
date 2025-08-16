// ---------------------------------------------
// main.js
// ---------------------------------------------

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
  const vertexSrc = await loadShaderSource("./shaders/vertex.glsl");
  const fragmentSrc = await loadShaderSource("./shaders/fragment.glsl");
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

  // D) Find uniform locations once:
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uHueLoc = gl.getUniformLocation(program, "u_hueValue");
  const uSatLoc = gl.getUniformLocation(program, "u_satValue");
  const uBriLoc = gl.getUniformLocation(program, "u_briValue");

  // E) Pick a dataset index (0…healthDataSets.length-1). You can change this manually later:
  let currentDataSetIndex = 0;
  let currentDataSet = healthDataSets[currentDataSetIndex];

  // F) Compute normalized H/S/B from lab values:
  function computeHSB(dataset) {
    // Normalize glucose (97–160) → [0…1], then map to [0°…360°]
    const gluN = normalize(
      dataset.labs.glucose,
      minMaxValues.glucose.min,
      minMaxValues.glucose.max
    );
    const hue = gluN * 360.0;

    // Normalize potassium (3.7–4.5) → [0…1], then map to saturation in [30%…100%]
    const potN = normalize(
      dataset.labs.potassium,
      minMaxValues.potassium.min,
      minMaxValues.potassium.max
    );
    const sat = 30 + potN * 70; // 30%→100%

    // Normalize eGFR (94–118) → [0…1], then map to brightness in [20%…80%]
    const eGFRn = normalize(
      dataset.labs.eGFR,
      minMaxValues.eGFR.min,
      minMaxValues.eGFR.max
    );
    const bri = 20 + eGFRn * 60; // 20%→80%

    return { hue, sat, bri };
  }

  // G) Set up a function to update those H/S/B uniforms:
  function setHSBUniforms() {
    const { hue, sat, bri } = computeHSB(currentDataSet);
    gl.uniform1f(uHueLoc, hue);
    gl.uniform1f(uSatLoc, sat);
    gl.uniform1f(uBriLoc, bri);
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
  }

  // J) Initial clear‐color (optional)
  gl.clearColor(0, 0, 0, 1);

  // K) Kick off the first frame
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

// 7) Start everything
init();
