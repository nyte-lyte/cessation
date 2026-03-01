#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Base uniforms
uniform float u_glucose;
uniform float u_potassium;
uniform float u_eGFR;
uniform vec2 u_resolution;

// Decay uniforms
uniform float u_decayPerYear;
uniform float u_totalYears;
uniform float u_lifespanYears;

// Beam uniforms
uniform float u_nitrogenStrength;
uniform float u_nitrogenHueDeg;
uniform float u_creatinineStrength;
uniform float u_creatinineHueDeg;
uniform float u_sodiumStrength;
uniform float u_sodiumHueDeg;
uniform float u_chlorideStrength;
uniform float u_chlorideHueDeg;
uniform float u_co2Strength;
uniform float u_co2HueDeg;
uniform float u_calciumStrength;
uniform float u_calciumHueDeg;

// Blob size uniforms — winsorized lab percentile (0..1)
// Higher value → larger, more spatially dominant blob
uniform float u_nitrogenRadius;
uniform float u_creatinineRadius;
uniform float u_sodiumRadius;
uniform float u_chlorideRadius;
uniform float u_calciumRadius;

// BUN/Creatinine ratio — spatial coupling between nitrogen and creatinine blobs
// 0 = low/normal ratio (kidney-intrinsic), blobs independent
// 1 = elevated ratio (pre-renal), blobs pulled together and overlapping
uniform float u_bunCreatRatioNorm;

// ECG axis uniforms — drive beam spatial positioning and field drift tempo
uniform float u_pAxisNorm;    // P wave axis, normalized 0..1 over dataset range
uniform float u_rAxisNorm;    // R wave (QRS) axis, normalized 0..1 over dataset range
uniform float u_qtcNorm;      // QTc interval, normalized 0..1 — drives identity field tempo
uniform float u_prNorm;       // PR interval, normalized 0..1 — drives acid-base field tempo
uniform float u_ventRateNorm; // Heart rate, normalized 0..1 — scales all field drift frequencies
uniform float u_tAxisNorm;    // T-wave axis, normalized 0..1 — repolarization direction
uniform float u_qrsTAngle;   // QRS-T angle normalized 0..1 — electrical dissonance (0=aligned, 1=max)

// Wall-clock time in seconds — drives realtime blob animation
uniform float u_time;

// Inheritance uniforms — color field carried in from previous piece at mint
uniform float u_inheritedHueDeg;  // hue in degrees, frozen at mint from ancestor
uniform float u_inheritedStrength; // 0..1, fades toward 0 over piece lifespan

// --- helpers ---
float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
vec3 hsb2rgb(float H, float S, float B){
    float c = B * S;
    float Hp = mod(H/60., 6.);
    float X = c * (1. - abs(mod(Hp, 2.)- 1.));
    vec3 rgb = vec3(0.);
    if(0. <= Hp && Hp < 1.)rgb = vec3(c, X, 0.);
    else if(1.<= Hp && Hp <2.)rgb = vec3(X, c, 0.);
    else if(2.<= Hp && Hp <3.)rgb = vec3(0., c, X);
    else if(3.<= Hp && Hp <4.)rgb = vec3(0., X, c);
    else if(4.<= Hp && Hp <5.)rgb = vec3(X, 0., c);
    else if(5.<= Hp && Hp <6.)rgb = vec3(c, 0., X);
    float m = B - c;
    return rgb + vec3(m);
}

vec3 screenBlend(vec3 base,vec3 tint,float k){
    vec3 t = clamp(tint * k, 0., 1.);
    return 1.-(1.- base)*(1.- t);
}

// Ellipse distance: rotates offset by `angle`, then scales major axis by `aspect`.
// aspect > 1 stretches the blob along the major axis (ECG-driven direction).
float ellipseDist(vec2 p, vec2 center, float aspect, float angle){
    vec2 d = p - center;
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 r = vec2(cosA * d.x + sinA * d.y, -sinA * d.x + cosA * d.y);
    return length(vec2(r.x / max(aspect, 0.1), r.y));
}

void main(){
    // Grain scales with QRS-T dissonance: aligned repolarization = smooth, discordant = textured
    float n = 0.0;
    float t = u_totalYears;

    // Life fraction and drift growth — the piece moves more as it ages
    float lifeFraction = clamp(u_totalYears / max(u_lifespanYears, 0.001), 0.0, 1.0);
    float driftMul = 0.5 + 0.8 * lifeFraction; // grows from 0.5 at birth to 1.3 at death

    // ECG axis deviation: -0.5..+0.5 from dataset midpoint
    float pS = u_pAxisNorm - 0.5;
    float rS = u_rAxisNorm - 0.5;

    // Slow hue evolution — each field drifts at a unique rate seeded by ECG axes.
    // At 2-3 degrees/year these are imperceptible day-to-day but shift the palette
    // meaningfully over decades, like a body's chemistry slowly changing.
    float hDrift1 = t * 2.5 + 180.0 * u_pAxisNorm;
    float hDrift2 = -t * 1.8 + 120.0 * u_rAxisNorm;
    float hDrift3 = t * 3.1 + 90.0 * (1.0 - u_pAxisNorm);

    // --- Base layer: three color fields blending across the canvas ---
    // Each field is anchored to specific metabolic values so its position,
    // size, and movement tempo are genuinely unique per dataset.
    // Fields overlap and mix at their boundaries — different regions of the
    // canvas have genuinely different dominant colors, like paint on canvas.

    // --- Lab-driven field base positions ---
    // cf1 (identity/glucose field): primary energy + electrolyte balance
    vec2 fieldBase1 = vec2(0.15 + 0.55 * u_glucose, 0.15 + 0.55 * u_potassium);
    // cf2 (acid-base/kidney field): eGFR inverted so it naturally opposes cf1
    vec2 fieldBase2 = vec2(0.85 - 0.55 * u_eGFR, 0.20 + 0.50 * u_pAxisNorm);
    // cf3 (cardiac/electrolyte field): R axis + potassium inversion
    vec2 fieldBase3 = vec2(0.20 + 0.50 * u_rAxisNorm, 0.80 - 0.55 * u_potassium);
    // cf4 (lineage field): antipodal to cf1 — ancestor color occupies opposite space from identity
    vec2 fieldBase4 = clamp(vec2(1.0) - fieldBase1, vec2(0.15), vec2(0.85));

    // --- Per-field sigma from health data ---
    // eGFR (kidney function) determines spread: high eGFR = wide diffuse zones,
    // low eGFR = tight concentrated pools. Each field responds to a different axis.
    float s1 = 0.09 + 0.20 * u_eGFR;          // identity field: kidney health = spread
    float s2 = 0.10 + 0.16 * (1.0 - u_eGFR);  // acid-base field: inverted kidney
    float s3 = 0.08 + 0.18 * u_glucose;         // electrolyte field: energy level = spread
    float s4 = 0.10 + 0.14 * u_eGFR;            // lineage field: kidney health drives spread

    // --- ECG-driven drift frequencies ---
    // The heart's electrical timing becomes the movement tempo of each field.
    // QTc (repolarization) drives the identity field; PR (conduction) drives acid-base.
    // Heart rate scales all frequencies: bradycardic pieces drift slowly, tachycardic urgently.
    float heartPace = 0.75 + 0.50 * u_ventRateNorm; // 0.75 (slow HR) → 1.25 (fast HR)
    float freqA = (0.06 + 0.10 * u_qtcNorm)   * heartPace; // cf1: QTc × HR
    float freqB = (0.04 + 0.07 * u_prNorm)    * heartPace; // cf2: PR × HR
    float freqC = (0.05 + 0.08 * u_rAxisNorm) * heartPace; // cf3: R axis × HR
    float freqD = (0.05 + 0.06 * u_pAxisNorm) * heartPace; // cf4 (lineage): P-axis × HR

    // --- Field centers: lab anchor + ECG displacement + time drift ---
    // ECG axes add additional spatial character on top of the lab-derived base.
    // Drift amplitude grows with lifeFraction so composition shifts more with age.
    vec2 cf1 = fieldBase1 + vec2(0.12 * pS, 0.10 * rS)
        + 0.12 * driftMul * vec2(sin(t * freqA        + 6.2831 * u_pAxisNorm),
                                  cos(t * freqA * 0.82 + 6.2831 * u_rAxisNorm));

    vec2 cf2 = fieldBase2 + vec2(-0.10 * pS, 0.09 * rS)
        + 0.11 * driftMul * vec2(cos(t * freqB        + 6.2831 * u_rAxisNorm),
                                  sin(t * freqB * 1.18 + 6.2831 * u_pAxisNorm));

    // cf3 drift seeded by T-wave axis — repolarization direction gives the cardiac
    // field an independent trajectory, distinct from depolarization (p/r) axes.
    vec2 cf3 = fieldBase3 + vec2(0.09 * rS, -0.10 * pS)
        + 0.11 * driftMul * vec2(sin(t * freqC        + 6.2831 * u_tAxisNorm),
                                  cos(t * freqC * 0.91 + 6.2831 * (1.0 - u_tAxisNorm)));

    // Lineage field: antipodal to cf1, π-offset drift so it moves in counterpoint
    vec2 cf4 = fieldBase4 + vec2(-0.08 * pS, -0.08 * rS)
        + 0.12 * driftMul * vec2(cos(t * freqD        + 3.1416 * u_pAxisNorm),
                                  sin(t * freqD * 0.88 + 3.1416 * u_rAxisNorm));

    // Gaussian weights: per-field sigma makes each zone uniquely sized
    float w1 = exp(-dot(v_uv - cf1, v_uv - cf1) / s1);
    float w2 = exp(-dot(v_uv - cf2, v_uv - cf2) / s2);
    float w3 = exp(-dot(v_uv - cf3, v_uv - cf3) / s3);
    float w4 = exp(-dot(v_uv - cf4, v_uv - cf4) / s4) * u_inheritedStrength;
    float wSum = w1 + w2 + w3 + w4 + 1e-6;

    // Field colors: metabolic values drive hue, sat, bri; hue drifts slowly over years
    vec3 col1 = hsb2rgb(mod(u_glucose * 360. + hDrift1, 360.), 0.55 + 0.35 * u_potassium, 0.35 + 0.55 * u_eGFR);
    vec3 col2 = hsb2rgb(mod(u_co2HueDeg      + hDrift2, 360.), 0.55,                      0.50 + 0.30 * u_eGFR);
    vec3 col3 = hsb2rgb(mod(u_calciumHueDeg  + hDrift3, 360.), 0.62,                      0.48 + 0.30 * u_eGFR);
    vec3 col4 = hsb2rgb(u_inheritedHueDeg, 0.58, 0.52 + 0.28 * u_eGFR);

    vec3 rgbColor = (w1 * col1 + w2 * col2 + w3 * col3 + w4 * col4) / wSum;
    rgbColor = clamp(rgbColor + n * 0.4, 0., 1.);

// --- ECG-driven blob shape ---
// Each blob is shaped by a different ECG dimension so pieces diverge across the dataset.
// Extremity = how far the value sits from the dataset midpoint (0=average, 1=extreme).
float extremeP   = abs(pS) * 2.0;                    // pAxis extremity
float qtcS       = u_qtcNorm - 0.5;                  // QTc deviation
float prS        = u_prNorm - 0.5;                   // PR deviation
float vrS        = u_ventRateNorm - 0.5;             // vent rate deviation
float tS         = u_tAxisNorm - 0.5;                // T-axis deviation
float extremeQtc = abs(qtcS) * 2.0;
float extremePR  = abs(prS)  * 2.0;
float extremeVR  = abs(vrS)  * 2.0;
float extremeT   = abs(tS)   * 2.0;

// Nitrogen: pAxis elongation (kidney waste tracks conduction axis), tAxis tilt
float nAspect  = 1.0 + 1.8 * extremeP;
float nAngle   = tS * 3.14159;

// Creatinine: QTc elongation (repolarization time reflects kidney stress), PR tilt
float crAspect = 1.0 + 1.6 * extremeQtc;
float crAngle  = -prS * 2.356;

// Sodium: ventRate elongation (HR reflects Na regulation load), rAxis + vrS tilt
float naAspect = 1.0 + 1.2 * extremeVR;
float naAngle  = (rS + vrS) * 1.047;

// Chloride: PR elongation (conduction delay tracks Cl/HCO3 balance), tAxis tilt
float clAspect = 1.0 + 1.4 * extremePR;
float clAngle  = tS * 1.571;

// Calcium: tAxis elongation (repolarization direction reflects Ca directly), QTc tilt
float caAspect = 1.0 + 1.4 * extremeT;
float caAngle  = -qtcS * 2.094;

// --- ECG-driven size modifiers ---
// Each blob uses the same ECG dimension that drives its shape to also modulate size.
// Centered ECG = compact; extreme ECG = large and assertive.
float nSizeMod  = 0.45 + 0.55 * extremeP;
float crSizeMod = 0.45 + 0.55 * extremeQtc;
float naSizeMod = 0.45 + 0.55 * extremeVR;
float clSizeMod = 0.45 + 0.55 * extremePR;
float caSizeMod = 0.45 + 0.55 * extremeT;

// --- Lab-driven blob radii ---
// Healthy (low percentile) → small, receding. Elevated → large, assertive.
float nInner  = 0.15 + 0.15 * u_nitrogenRadius;
float nOuter  = 0.30 + 0.25 * u_nitrogenRadius;

float cInner1 = 0.12 + 0.12 * u_creatinineRadius;
float cOuter1 = 0.24 + 0.18 * u_creatinineRadius;
float cInner2 = 0.09 + 0.09 * u_creatinineRadius;
float cOuter2 = 0.20 + 0.16 * u_creatinineRadius;

float naInner1 = 0.16 + 0.14 * u_sodiumRadius;
float naOuter1 = 0.32 + 0.20 * u_sodiumRadius;
float naInner2 = 0.14 + 0.12 * u_sodiumRadius;
float naOuter2 = 0.28 + 0.18 * u_sodiumRadius;

float clInner = 0.15 + 0.14 * u_chlorideRadius;
float clOuter = 0.30 + 0.18 * u_chlorideRadius;

float caInner1 = 0.18 + 0.16 * u_calciumRadius;
float caOuter1 = 0.36 + 0.20 * u_calciumRadius;
float caInner2 = 0.15 + 0.14 * u_calciumRadius;
float caOuter2 = 0.30 + 0.18 * u_calciumRadius;

// Blob positions: original pS/rS composition restored.
// Drift uses u_time (wall-clock seconds) for visible realtime movement.

// Nitrogen: pAxis drives position
vec2 cN = vec2(0.35 + 0.35 * pS, 0.45 + 0.30 * rS);
cN += 0.05 * vec2(
    sin(u_time * 0.018 + 6.2831 * u_pAxisNorm),
    cos(u_time * 0.014 + 6.2831 * u_rAxisNorm)
);

// Creatinine: pAxis inverted, mirrors Nitrogen
vec2 cC1 = vec2(0.65 - 0.30 * pS, 0.55 + 0.25 * rS)
    + 0.04 * vec2(sin(u_time * 0.022 + 6.2831 * (1.0 - u_pAxisNorm)),
                  cos(u_time * 0.019 + 6.2831 * u_rAxisNorm));
vec2 cC2 = vec2(0.50 + 0.25 * pS, 0.28 - 0.25 * rS)
    + 0.03 * vec2(sin(u_time * 0.016 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.013 + 6.2831 * (1.0 - u_rAxisNorm)));

// BUN/Creatinine ratio coupling: elevated ratio (pre-renal) pulls both markers together,
// creating overlap and a brighter combined region. Normal ratio keeps them independent.
float pull = u_bunCreatRatioNorm * 0.10;
vec2 pullVec = cC1 - cN;
vec2 pullDir = pullVec / max(length(pullVec), 0.001);
cN  += pullDir * pull;
cC1 -= pullDir * pull * 0.5;

float mN  = 1.0 - smoothstep(nInner,  nOuter,  ellipseDist(v_uv, cN,  nAspect,  nAngle));
float mC1 = 1.0 - smoothstep(cInner1, cOuter1, ellipseDist(v_uv, cC1, crAspect, crAngle));
float mC2 = 1.0 - smoothstep(cInner2, cOuter2, ellipseDist(v_uv, cC2, crAspect * 0.85, crAngle));
float mC  = max(mC1, mC2);

// Sodium: rAxis primary, pAxis secondary (axes swapped from Nitrogen)
vec2 cA = vec2(0.28 + 0.32 * rS, 0.62 + 0.28 * pS)
    + 0.04 * vec2(cos(u_time * 0.020 + 6.2831 * u_rAxisNorm),
                  sin(u_time * 0.016 + 6.2831 * u_pAxisNorm));
vec2 cB = vec2(0.62 - 0.28 * rS, 0.32 - 0.28 * pS)
    + 0.04 * vec2(sin(u_time * 0.013 + 6.2831 * (1.0 - u_rAxisNorm)),
                  cos(u_time * 0.017 + 6.2831 * (1.0 - u_pAxisNorm)));

float mA  = 1. - smoothstep(naInner1, naOuter1, ellipseDist(v_uv, cA, naAspect, naAngle));
float mB  = 1. - smoothstep(naInner2, naOuter2, ellipseDist(v_uv, cB, naAspect * 0.9, naAngle));
float mNa = max(mA, mB);

// Chloride: rAxis drives position
vec2 cCl = vec2(0.55 + 0.22 * rS + 0.05 * sin(u_time * 0.021 + 6.2831 * u_rAxisNorm),
               0.45 - 0.20 * pS + 0.04 * cos(u_time * 0.015 + 6.2831 * u_pAxisNorm));
float mCl = 1.0 - smoothstep(clInner, clOuter, ellipseDist(v_uv, cCl, clAspect, clAngle));

// Chloride strength comes from JS (handles arrival gate + lifespan correctly)
float strengthCl = u_chlorideStrength;

// CO2: HALO (cool, edge-biased ambient blend)
float lum = dot(rgbColor, vec3(.299, .587, .114));
float edge = length(vec2(dFdx(lum), dFdy(lum)));
float edgeW = smoothstep(.004, .050, edge);// stronger where colors meet
float ambW = .88 + .12 * rand(v_uv + vec2(u_pAxisNorm * 6.28, u_rAxisNorm * 4.71));// near-uniform atmospheric presence, slight texture per dataset
// T-axis directional lean: halo is subtly brighter in the repolarization direction
float tAngle = u_tAxisNorm * 3.14159;
float tBias = 0.5 + 0.5 * dot(normalize(v_uv - vec2(0.5)), vec2(cos(tAngle), sin(tAngle)));
float localGain = smoothstep(.01, .55, lum);// avoid dark wash
// QRS-T dissonance shifts halo from diffuse to edge-concentrated: discordant repolarization
// makes the atmosphere cluster at color boundaries rather than spread uniformly
float haloW = u_co2Strength * mix(ambW, edgeW, 0.45 + 0.30 * u_qrsTAngle) * localGain * (0.88 + 0.12 * tBias);

// Calcium: pAxis/rAxis, lobes pushed in opposite directions
vec2 c1 = vec2(0.62 + 0.22 * pS + 0.05 * sin(u_time * 0.011 + 6.2831 * u_pAxisNorm),
              0.32 + 0.18 * rS  + 0.05 * cos(u_time * 0.009 + 6.2831 * u_rAxisNorm));
vec2 c2 = vec2(0.32 - 0.18 * rS + 0.06 * cos(u_time * 0.007 + 6.2831 * (1.0 - u_rAxisNorm)),
              0.65 - 0.22 * pS  + 0.05 * sin(u_time * 0.010 + 6.2831 * (1.0 - u_pAxisNorm)));
float m1  = 1. - smoothstep(caInner1, caOuter1, ellipseDist(v_uv, c1, caAspect, caAngle));
float m2  = 1. - smoothstep(caInner2, caOuter2, ellipseDist(v_uv, c2, caAspect * 0.88, caAngle));
float mCa = max(m1, m2);
    
    // Nitrogen
    vec3 nitrogenRGB = hsb2rgb(u_nitrogenHueDeg, .90, .78);
    rgbColor = clamp(rgbColor + nitrogenRGB * u_nitrogenStrength * mN, 0., 1.0);

    // Creatinine
    vec3 creatRGB = hsb2rgb(u_creatinineHueDeg, .90, .78);
    rgbColor = clamp(rgbColor + creatRGB * u_creatinineStrength * mC, 0., 1.0);

    // Sodium
    vec3 sodiumRGB = hsb2rgb(u_sodiumHueDeg, .94, .80);
    rgbColor = clamp(rgbColor + sodiumRGB * u_sodiumStrength * mNa, 0., 1.0);

    // Chloride
    vec3 chlorideRGB = hsb2rgb(u_chlorideHueDeg, .75, .85);
    rgbColor = clamp(rgbColor + chlorideRGB * strengthCl * mCl, 0., 1.0);

    // CO2
    vec3 co2Tint = hsb2rgb(u_co2HueDeg, .65, 1.00);
    rgbColor = clamp(rgbColor + co2Tint * haloW, 0., 1.);

    // Calcium
    float darkW = smoothstep(.65, .25, lum);
    vec3 caTint = hsb2rgb(u_calciumHueDeg, 0.70, 0.95);
    rgbColor = screenBlend(rgbColor, caTint, u_calciumStrength * mCa * darkW);

    // Decay: stays near full brightness until ~70% of lifespan, then drops steeply.
    // Models how a body stays vital most of its life and deteriorates near the end.
    float latePhase = smoothstep(0.70, 1.00, lifeFraction);
    float decay = exp(-u_decayPerYear * u_totalYears) * (1.0 - 0.90 * latePhase * latePhase);
    fragColor = vec4(rgbColor * decay, 1.0);
}