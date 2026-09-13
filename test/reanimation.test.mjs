// reanimation.test.mjs — does a reanimated piece come back to life, and can it die again?
//
// Reanimation is an EVENT, not a state. It used to latch: `lc.reanimationTriggerMs`
// was set once at reanimation and never cleared, so `reanimationProgress` climbed to
// 1.0 and stayed there for ever. Two things broke.
//
// THE RENDER. In a new cycle the shader's `nirvanaProgress` is 0 — cycle-relative age
// restarts near 0 and the new lifespan is at least 3 years — so
// `mix(livingColor, nirvanaState, nirvanaProgress)` keeps livingColor, and the only
// remaining use of reanimationProgress is the next line:
//
//     lifeRestores = smoothstep(0.5, 1.0, u_reanimationProgress)
//     finalColor   = mix(finalColor, rgbColor, lifeRestores)
//
// Pinned at 1.0 that resolves to `rgbColor` for ever: the piece renders as its flat
// base colour and stops ageing for the rest of the cycle.
//
// THE LIFECYCLE. The cessation check in lcPoll requires `reanimationTriggerMs === null`,
// so once set the piece could never reanimate a SECOND time.
//
// These tests drive the real lcTick source out of src/main.js, so they test the
// shipped code rather than a restatement of it.
//
// Run: node test/reanimation.test.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, Report } from './harness.mjs';

const r = new Report();
const src = readFileSync(join(ROOT, 'src/main.js'), 'utf8');

const WINDOW = (() => {
  const m = src.match(/const BLOCK_WINDOW_MS\s*=\s*(\d+)/);
  if (!m) throw new Error('BLOCK_WINDOW_MS not found in src/main.js');
  return Number(m[1]);
})();

const fnSrc = src.match(/^  function lcTick\(nowMs\) \{[\s\S]*?\n  \}/m);
if (!fnSrc) {
  console.log('FAIL — could not find lcTick in src/main.js');
  process.exit(1);
}

function makeTick(lc) {
  const scope = { lc, BLOCK_WINDOW_MS: WINDOW };
  const keys = Object.keys(scope);
  const body = `${fnSrc[0].replace(/^  function lcTick/, 'function lcTick')}\nreturn lcTick;`;
  return new Function(...keys, body)(...keys.map(k => scope[k]));
}

const freshLc = (over = {}) => ({
  reanimationTriggerMs: 0,
  reanimationProgress:  0,
  voidTriggerMs:        null,
  voidProgress:         0,
  isLiberated:          false,
  ...over,
});

// What the shader actually derives from the uniform. If this is discontinuous the
// viewer sees a jump, which is the thing the arc exists to avoid.
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lifeRestores = (p) => smoothstep(0.5, 1.0, p);

// ── 1. The arc: rises to 1, comes back to 0 ────────────────────────────────
{
  const lc = freshLc();
  const tick = makeTick(lc);
  const at = (frac) => { tick(frac * WINDOW); return lc.reanimationProgress; };

  const checks = [
    [0.0, 0.0, 'at the moment of reanimation'],
    [0.5, 0.5, 'half way through the bloom'],
    [1.0, 1.0, 'at full bloom'],
    [1.5, 0.5, 'half way through the settle'],
  ];
  for (const [frac, want, when] of checks) {
    r.checks++;
    const got = at(frac);
    if (Math.abs(got - want) > 1e-9) {
      r.fail('arc', `progress ${when} (t=${frac}) was ${got}, expected ${want}`);
    }
  }
}

// ── 2. THE BUG: it must not latch, and it must re-arm ──────────────────────
{
  const lc = freshLc();
  const tick = makeTick(lc);
  tick(2 * WINDOW);
  r.checks++;
  if (lc.reanimationProgress !== 0) {
    r.fail('latch',
      `reanimationProgress is ${lc.reanimationProgress} once the arc is over, not 0 — ` +
      `the shader's lifeRestores stays at ${lifeRestores(lc.reanimationProgress).toFixed(3)}, ` +
      `pinning finalColor to rgbColor and freezing the piece's ageing for the rest of the cycle`);
  }
  r.checks++;
  if (lc.reanimationTriggerMs !== null) {
    r.fail('latch',
      'reanimationTriggerMs was not cleared — lcPoll requires it to be null, so this ' +
      'piece can never reanimate a second time; it would reach its next cessation ' +
      'block and do nothing at all');
  }
  // and it stays settled long afterwards
  tick(50 * WINDOW);
  r.checks++;
  if (lc.reanimationProgress !== 0) {
    r.fail('latch', `progress drifted to ${lc.reanimationProgress} long after the arc ended`);
  }
}

// ── 3. No jump anywhere in the arc — including the moment it clears ────────
// The whole reason for coming back down through smoothstep's 0.5 edge rather than
// snapping 1 -> 0 is that the viewer must not see a pop.
{
  const lc = freshLc();
  const tick = makeTick(lc);
  const STEPS = 4000;              // ~0.3 s of wall clock per step at a 10 min window
  let prev = null, worstP = 0, worstL = 0, atP = 0, atL = 0;
  let maxProgress = -Infinity, minProgress = Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * 2.5 * WINDOW;
    tick(t);
    const p = lc.reanimationProgress;
    maxProgress = Math.max(maxProgress, p);
    minProgress = Math.min(minProgress, p);
    r.checks++;
    if (!Number.isFinite(p)) { r.fail('arc', `progress went non-finite at t=${(t / WINDOW).toFixed(3)}`); break; }
    if (prev !== null) {
      const dp = Math.abs(p - prev.p);
      const dl = Math.abs(lifeRestores(p) - lifeRestores(prev.p));
      if (dp > worstP) { worstP = dp; atP = t / WINDOW; }
      if (dl > worstL) { worstL = dl; atL = t / WINDOW; }
    }
    prev = { p };
  }
  // One step is 2.5/4000 of a window; a continuous ramp moves at most ~that much.
  const STEP = 2.5 / STEPS;
  r.checks++;
  if (worstP > STEP * 3) {
    r.fail('arc',
      `reanimationProgress jumps by ${worstP.toFixed(4)} in one step at t=${atP.toFixed(3)} ` +
      `windows — a continuous arc should move at most ~${STEP.toFixed(5)}. The viewer sees a pop.`);
  }
  r.checks++;
  if (worstL > STEP * 3) {
    r.fail('arc',
      `the shader's lifeRestores jumps by ${worstL.toFixed(4)} in one step at ` +
      `t=${atL.toFixed(3)} windows — the rendered colour pops`);
  }
  r.checks++;
  if (maxProgress > 1 + 1e-9 || minProgress < -1e-9) {
    r.fail('arc', `progress left [0,1]: min ${minProgress}, max ${maxProgress}`);
  }
  r.checks++;
  if (Math.abs(maxProgress - 1) > 1e-6) {
    r.fail('arc', `the bloom never reached full: peak was ${maxProgress}`);
  }
}

// ── 4. A liberated piece is left alone ─────────────────────────────────────
// When liberated the shader multiplies partnerArrival and lifeRestores by
// (1 - liberated) = 0, so progress must not be touched on its behalf.
{
  const lc = freshLc({ reanimationTriggerMs: null, isLiberated: true, reanimationProgress: 0.42 });
  const tick = makeTick(lc);
  tick(5 * WINDOW);
  r.checks++;
  if (lc.reanimationProgress !== 0.42) {
    r.fail('liberated',
      `a liberated piece's reanimationProgress was changed to ${lc.reanimationProgress}`);
  }
}

// ── 5. The void ramp still works and is unaffected ─────────────────────────
{
  const lc = freshLc({ reanimationTriggerMs: null, voidTriggerMs: 0 });
  const tick = makeTick(lc);
  tick(0.5 * WINDOW);
  r.checks++;
  if (Math.abs(lc.voidProgress - 0.5) > 1e-9) {
    r.fail('void', `voidProgress at half a window was ${lc.voidProgress}, expected 0.5`);
  }
  tick(3 * WINDOW);
  r.checks++;
  if (lc.voidProgress !== 1) {
    r.fail('void', `voidProgress saturated to ${lc.voidProgress}, expected 1`);
  }
}

// ── 6. Two reanimations in one session ─────────────────────────────────────
// The end-to-end shape of the lifecycle bug: cease, reanimate, settle, and then
// cease again. The second cessation is what the latch made impossible.
{
  const lc = freshLc();
  const tick = makeTick(lc);
  tick(2 * WINDOW);                        // first arc completes, trigger clears
  r.checks++;
  const canReanimateAgain = lc.reanimationTriggerMs === null && !lc.isLiberated;
  if (!canReanimateAgain) {
    r.fail('cycles', 'the piece cannot enter a second reanimation');
  }
  // lcPoll would now set the trigger again at the next cessation block
  lc.reanimationTriggerMs = 10 * WINDOW;
  tick(10.5 * WINDOW);
  r.checks++;
  if (Math.abs(lc.reanimationProgress - 0.5) > 1e-9) {
    r.fail('cycles',
      `the second reanimation did not bloom — progress ${lc.reanimationProgress} at half a window`);
  }
  tick(12 * WINDOW);
  r.checks++;
  if (lc.reanimationProgress !== 0 || lc.reanimationTriggerMs !== null) {
    r.fail('cycles', 'the second reanimation did not settle and re-arm');
  }
}

console.log('\nReanimation — does the piece come back to life, and can it die again?');
console.log('─'.repeat(72));
console.log(`${r.checks} checks, ${r.failures.length} failed\n`);
for (const f of r.failures) console.log('  FAIL  ' + f + '\n');
console.log(r.failures.length === 0
  ? `PASS — the arc blooms, settles and re-arms, with no jump in what the shader renders.`
  : `FAIL — ${r.failures.length} of ${r.checks}.`);
process.exit(r.failures.length === 0 ? 0 : 1);
