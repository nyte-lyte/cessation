
(async function init() {
  // 1) Grab the canvas and WebGL2 context
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL2 not supported");
    return;
  }

  // 2) Resize helper (keeps canvas & viewport in sync)
  function resizeCanvas() {
    const container = document.getElementById("canvas-container");
    const rect = container.getBoundingClientRect();
     
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // 3) Fetch your shader sources
  const [vertSrc, fragSrc] = await Promise.all([
    fetch("./src/shaders/vertex.glsl").then((r) => r.text()),
    fetch("./src/shaders/fragment.glsl").then((r) => r.text()),
  ]);

  // 4) Compile helper
  function compileShader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      throw new Error("Shader compile failed");
    }
    return s;
  }

  // 5) Build program
  const vs = compileShader(gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    throw new Error("Program link failed");
  }
  gl.useProgram(program);

  // 6) Set up a full‑screen quad (covering clip space)
  const posLoc = gl.getAttribLocation(program, "a_position");
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // 7) Look up optional uniforms
  const uRes = gl.getUniformLocation(program, "u_resolution");
  const uTime = gl.getUniformLocation(program, "u_time");

  // 8) Render loop
  let start = performance.now();
  function render() {
    resizeCanvas();
    const t = (performance.now() - start) * 0.001;

    if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
    if (uTime) gl.uniform1f(uTime, t);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
