// build.js — generates index_bundle.html
// Inlines all shaders, JS, data, and CSS into a single self-contained HTML file.
// Usage: node build.js

const { readFileSync, writeFileSync } = require('fs');

// ── Read source files ─────────────────────────────────────────
const vertGlsl     = readFileSync('./src/shaders/vertex.glsl',   'utf8');
const fragGlsl     = readFileSync('./src/shaders/fragment.glsl', 'utf8');
const css          = readFileSync('./style.css',                  'utf8');
let   decayLogic   = readFileSync('./data/decay_logic.js',        'utf8');
let   healthData   = readFileSync('./data/health_data_sets.js',   'utf8');
let   mainJs       = readFileSync('./src/main.js',                'utf8');

// ── Strip ES module syntax ────────────────────────────────────

// decay_logic.js — remove export statement at bottom
decayLogic = decayLogic.replace(/^export\s*\{[^}]+\};\s*$/m, '');

// health_data_sets.js — remove import line at top, export at bottom
healthData = healthData.replace(/^import\s+.*$/m, '');
healthData = healthData.replace(/^export\s*\{[^}]+\};\s*$/m, '');

// main.js — remove import lines at top
mainJs = mainJs.replace(/^import\s+.*\n/gm, '');

// main.js — remove duplicate normalize() (decay_logic.js provides it)
mainJs = mainJs.replace(/\nfunction normalize\(value, min, max\) \{[\s\S]*?\n\}\n/, '\n');

// main.js — remove loadShaderSource function (no longer needed)
mainJs = mainJs.replace(/async function loadShaderSource[\s\S]*?\n\}\n/, '');

// main.js — replace fetch-based shader loading with inline DOM access
mainJs = mainJs.replace(
  /\/\/ load and compile shaders:\n\s*const vertexSrc\s*=\s*await loadShaderSource\("[^"]+"\);\n\s*const fragmentSrc\s*=\s*await loadShaderSource\("[^"]+"\);/,
  `// load and compile shaders (inlined):\n  const vertexSrc   = document.getElementById('vert-shader').textContent;\n  const fragmentSrc = document.getElementById('frag-shader').textContent;`
);

// ── Strip fs-overlay CSS (element removed) ───────────────────
const cssClean = css
  .replace(/#fs-overlay[\s\S]*?(?=\n\n|\n#|$)/g, '')
  .replace(/#canvas-container:hover #fs-overlay[\s\S]*?\}/g, '')
  .trim();

// ── Assemble bundle ───────────────────────────────────────────
const bundle = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cessation</title>
  <link rel="icon" href="data:," />
  <style>
${cssClean}
  </style>
</head>
<body>
  <div id="canvas-container">
    <canvas id="canvas"></canvas>
  </div>

  <!-- Shaders -->
  <script id="vert-shader" type="x-shader/x-vertex">
${vertGlsl.trim()}
  </script>
  <script id="frag-shader" type="x-shader/x-fragment">
${fragGlsl.trim()}
  </script>

  <!-- Fullscreen key binding -->
  <script>
    document.addEventListener('keydown', (e) => {
      if (e.key.toUpperCase() === 'F') {
        const c = document.getElementById('canvas-container');
        if (!document.fullscreenElement) { c.requestFullscreen(); }
        else { document.exitFullscreen(); }
      }
    });
  </script>

  <!-- Engine -->
  <script>
${decayLogic.trim()}

${healthData.trim()}

${mainJs.trim()}
  </script>
</body>
</html>`;

writeFileSync('./index_bundle.html', bundle, 'utf8');

const kb = (buffer) => (Buffer.byteLength(buffer, 'utf8') / 1024).toFixed(1);
console.log(`Built index_bundle.html — ${kb(bundle)} KB uncompressed`);
