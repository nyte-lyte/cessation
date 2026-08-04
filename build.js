// build.js — generates index_bundle.js
// Inlines all shaders, JS, data, and CSS into a single self-contained JS file.
// Usage: node build.js
//
// Output is text/javascript. The engine is inscribed as a JS file; all 29 pieces are HTML.
// Pieces load the engine via: <script t=N ht=H unix=U hue=D block=B src="/content/{engineId}">
// When loaded as a child, document.currentScript carries the piece params.
// When loaded directly as text/javascript, document.currentScript is null.

const { readFileSync, writeFileSync } = require('fs');

// ── Read source files ─────────────────────────────────────────
let   vertGlsl     = readFileSync('./src/shaders/vertex.glsl',   'utf8');
let   fragGlsl     = readFileSync('./src/shaders/fragment.glsl', 'utf8');
const css          = readFileSync('./style.css',                  'utf8');
let   decayLogic   = readFileSync('./data/decay_logic.js',        'utf8');
let   healthData   = readFileSync('./data/health_data_sets.js',   'utf8');
let   mainJs       = readFileSync('./src/main.js',                'utf8');

// ── Strip ES module syntax ────────────────────────────────────

decayLogic = decayLogic.replace(/^export\s*\{[^}]+\};\s*$/m, '');

healthData = healthData.replace(/^import\s+.*$/m, '');
healthData = healthData.replace(/^export\s*\{[^}]+\};\s*$/m, '');

mainJs = mainJs.replace(/^import\s+.*\n/gm, '');

// ── Strip dev tool blocks ─────────────────────────────────────
mainJs = mainJs.replace(/[ \t]*\/\/ DEV_START[\s\S]*?\/\/ DEV_END\n?/g, '');

// ── Remove duplicate normalize() (decay_logic.js provides it) ─
mainJs = mainJs.replace(/\nfunction normalize\(value, min, max\) \{[\s\S]*?\n\}\n/, '\n');

// ── Remove loadShaderSource (shaders inlined as JS variables) ─
mainJs = mainJs.replace(/async function loadShaderSource[\s\S]*?\n\}\n/, '');

// ── Replace shader loading with inline variable references ────
mainJs = mainJs.replace(
  /\/\/ load and compile shaders:\n\s*const vertexSrc\s*=\s*await loadShaderSource\("[^"]+"\);\n\s*const fragmentSrc\s*=\s*await loadShaderSource\("[^"]+"\);/,
  `// shaders inlined as JS variables (see bundle preamble):\n  const vertexSrc   = _vertSrc;\n  const fragmentSrc = _fragSrc;`
);

// ── Strip comments from all sources ──────────────────────────
function stripComments(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, '');   // block comments (NOTE: removes BAKE markers too — add them after)
  src = src.replace(/\/\/[^\n]*/g, '');          // line comments
  src = src.replace(/[ \t]+$/gm, '');            // trailing whitespace
  src = src.replace(/\n{3,}/g, '\n\n');          // collapse blank lines
  return src;
}

// Strip comments from everything except mainJs — mainJs keeps BAKE markers (block comments)
vertGlsl   = stripComments(vertGlsl);
fragGlsl   = stripComments(fragGlsl);
decayLogic = stripComments(decayLogic);
healthData = stripComments(healthData);
// mainJs: strip only line comments and whitespace, preserve BAKE block comments
mainJs = mainJs.replace(/\/\/[^\n]*/g, '');
mainJs = mainJs.replace(/[ \t]+$/gm, '');
mainJs = mainJs.replace(/\n{3,}/g, '\n\n');

// ── Build CSS string for injection (strip #fs-overlay rules) ─
const cssClean = css
  // Remove entire rules that reference #fs-overlay (including their selectors)
  .replace(/[^\n]*#fs-overlay[^\{]*\{[^\}]*\}/g, '')
  // Remove body background-color — engine always sets a plain black background
  .replace(/background-color:\s*#000000;?\s*/g, '')
  .trim()
  // Minify
  .replace(/\s*\{\s*/g, '{').replace(/\s*\}\s*/g, '}')
  .replace(/\s*:\s*/g, ':').replace(/\s*;\s*/g, ';')
  .replace(/\s*\/\*[^*]*\*\/\s*/g, '')  // strip any remaining comments
  .replace(/\n+/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

// Escape backticks and backslashes in CSS for use in template literal
const cssEscaped = cssClean.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// ── Escape shaders for JS template literals ───────────────────
function escapeForTemplateLiteral(src) {
  return src.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}
const vertEsc = escapeForTemplateLiteral(vertGlsl.trim());
const fragEsc = escapeForTemplateLiteral(fragGlsl.trim());

// ── Assemble bundle ───────────────────────────────────────────
// _selfScript: captured synchronously before any async code.
//   null  → piece 0 viewing itself directly (genesis)
//   set   → child piece loading this as <script src>, reads t/ht/unix/hue/block attributes
//
// Engine always sets a plain black background — no per-piece gradient baking.

const bundle = `const _selfScript = document.currentScript;
(function(){
const _style = document.createElement('style');
_style.textContent = 'html,body{background:#000}' + \`${cssEscaped}\`;
(document.head || document.documentElement).appendChild(_style);
const _cc = document.createElement('div');
_cc.id = 'canvas-container';
const _cv = document.createElement('canvas');
_cv.id = 'canvas';
_cc.appendChild(_cv);
document.body.appendChild(_cc);
const _vertSrc = \`${vertEsc}\`;
const _fragSrc = \`${fragEsc}\`;

${decayLogic.trim()}

${healthData.trim()}

${mainJs.trim()}
})();`;

writeFileSync('./index_bundle.js', bundle, 'utf8');

const kb = (buffer) => (Buffer.byteLength(buffer, 'utf8') / 1024).toFixed(1);
console.log(`Built index_bundle.js — ${kb(bundle)} KB uncompressed`);
