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

// ECG axis uniforms — drive beam spatial positioning and field drift tempo
uniform float u_pAxisNorm;   // P wave axis, normalized 0..1 over dataset range
uniform float u_rAxisNorm;   // R wave (QRS) axis, normalized 0..1 over dataset range
uniform float u_qtcNorm;     // QTc interval, normalized 0..1 — drives identity field tempo
uniform float u_prNorm;      // PR interval, normalized 0..1 — drives acid-base field tempo

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

void main(){
    float n = rand(v_uv * u_resolution.xy * .1) * .02;
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
    // cf4 (inherited field): antipodal to cf1 so ancestor color occupies opposite space
    vec2 fieldBase4 = clamp(vec2(1.0) - fieldBase1, vec2(0.15), vec2(0.85));

    // --- Per-field sigma from health data ---
    // eGFR (kidney function) determines spread: high eGFR = wide diffuse zones,
    // low eGFR = tight concentrated pools. Each field responds to a different axis.
    float s1 = 0.09 + 0.20 * u_eGFR;          // identity field: kidney health = spread
    float s2 = 0.10 + 0.16 * (1.0 - u_eGFR);  // acid-base field: inverted kidney
    float s3 = 0.08 + 0.18 * u_glucose;         // electrolyte field: energy level = spread
    float s4 = 0.10 + 0.14 * u_eGFR;           // inherited field: moderate

    // --- ECG-driven drift frequencies ---
    // The heart's electrical timing becomes the movement tempo of each field.
    // QTc (repolarization) drives the identity field; PR (conduction) drives acid-base.
    float freqA = 0.06 + 0.10 * u_qtcNorm;     // cf1: QTc interval → identity field tempo
    float freqB = 0.04 + 0.07 * u_prNorm;      // cf2: PR interval → acid-base field tempo
    float freqC = 0.05 + 0.08 * u_rAxisNorm;   // cf3: R axis → electrolyte field tempo
    float freqD = 0.05 + 0.06 * u_pAxisNorm;   // cf4: P axis → inherited field tempo

    // --- Field centers: lab anchor + ECG displacement + time drift ---
    // ECG axes add additional spatial character on top of the lab-derived base.
    // Drift amplitude grows with lifeFraction so composition shifts more with age.
    vec2 cf1 = fieldBase1 + vec2(0.12 * pS, 0.10 * rS)
        + 0.12 * driftMul * vec2(sin(t * freqA        + 6.2831 * u_pAxisNorm),
                                  cos(t * freqA * 0.82 + 6.2831 * u_rAxisNorm));

    vec2 cf2 = fieldBase2 + vec2(-0.10 * pS, 0.09 * rS)
        + 0.11 * driftMul * vec2(cos(t * freqB        + 6.2831 * u_rAxisNorm),
                                  sin(t * freqB * 1.18 + 6.2831 * u_pAxisNorm));

    vec2 cf3 = fieldBase3 + vec2(0.09 * rS, -0.10 * pS)
        + 0.11 * driftMul * vec2(sin(t * freqC        + 6.2831 * (1.0 - u_pAxisNorm)),
                                  cos(t * freqC * 0.91 + 6.2831 * (1.0 - u_rAxisNorm)));

    // Inherited field: antipodal to cf1, π-offset drift so it moves in counterpoint
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
    vec3 col4 = hsb2rgb(u_inheritedHueDeg,                     0.58,                      0.52 + 0.28 * u_eGFR);

    vec3 rgbColor = (w1 * col1 + w2 * col2 + w3 * col3 + w4 * col4) / wSum;
    rgbColor = clamp(rgbColor + n * 0.4, 0., 1.);

// Nitrogen: pAxis drives position; rAxis drives secondary axis
vec2 cN = vec2(0.35 + 0.35 * pS, 0.45 + 0.30 * rS);
cN += 0.05 * vec2(
    sin(t * .33 + 6.2831 * u_pAxisNorm),
    cos(t * .27 + 6.2831 * u_rAxisNorm)
);

float dN = distance(v_uv, cN);
float mN = 1.0 - smoothstep(.30, .60, dN);

// Creatinine: two blobs, pAxis inverted so they mirror Nitrogen
vec2 cC1 = vec2(0.65 - 0.30 * pS, 0.55 + 0.25 * rS)
    + 0.04 * vec2(sin(t * .29 + 6.2831 * (1.0 - u_pAxisNorm)),
                  cos(t * .31 + 6.2831 * u_rAxisNorm));
vec2 cC2 = vec2(0.50 + 0.25 * pS, 0.28 - 0.25 * rS)
    + 0.03 * vec2(sin(t * .25 + 6.2831 * u_pAxisNorm),
                  cos(t * .21 + 6.2831 * (1.0 - u_rAxisNorm)));

float mC1 = 1.0 - smoothstep(.20, .40, distance(v_uv, cC1));
float mC2 = 1.0 - smoothstep(.16, .34, distance(v_uv, cC2));
float mC = max(mC1, mC2);

// Sodium: rAxis primary, pAxis secondary (axes swapped from Nitrogen)
vec2 cA = vec2(0.28 + 0.32 * rS, 0.62 + 0.28 * pS)
    + 0.04 * vec2(cos(t * .33 + 6.2831 * u_rAxisNorm),
                  sin(t * .27 + 6.2831 * u_pAxisNorm));
vec2 cB = vec2(0.62 - 0.28 * rS, 0.32 - 0.28 * pS)
    + 0.04 * vec2(sin(t * .21 + 6.2831 * (1.0 - u_rAxisNorm)),
                  cos(t * .19 + 6.2831 * (1.0 - u_pAxisNorm)));

float mA = 1. - smoothstep(.26, .50, distance(v_uv, cA));
float mB = 1. - smoothstep(.24, .48, distance(v_uv, cB));
float mNa = max(mA, mB);

// Chloride: rAxis drives position
vec2 cCl = vec2(0.55 + 0.22 * rS + .05 * sin(t * .27),
               0.45 - 0.20 * pS + .04 * cos(t * .31));
float dCl = distance(v_uv, cCl);
float mCl = 1.0 - smoothstep(.25, .45, dCl);

// arrival progression (~60% lifespan milestone)
float arrivalCl = smoothstep(.55, .65, u_totalYears/64.);
float breathCl = .6 + .4 * sin(t * .4);
float strengthCl = u_sodiumStrength * arrivalCl * breathCl;

// CO2: HALO (cool, edge-biased ambient blend)
float lum = dot(rgbColor, vec3(.299, .587, .114));
float edge = length(vec2(dFdx(lum), dFdy(lum)));
float edgeW = smoothstep(.004, .050, edge);// stronger where colors meet
float ambW = .35 + .65 * rand(v_uv + vec2(u_pAxisNorm * 6.28, u_rAxisNorm * 4.71));// soft presence, unique per dataset
float localGain = smoothstep(.06, .72, lum);// avoid dark wash
float haloW = u_co2Strength * mix(ambW, edgeW, .70) * localGain;

// CALCIUM: both axes; lobes are pushed in opposite directions
vec2 c1 = vec2(0.62 + 0.22 * pS + .05 * sin(t * .11),
              0.32 + 0.18 * rS + .05 * cos(t * .09));
vec2 c2 = vec2(0.32 - 0.18 * rS + .06 * cos(t * .07),
              0.65 - 0.22 * pS + .05 * sin(t * .08));
float d1 = distance(v_uv, c1);
float d2 = distance(v_uv, c2);
float m1 = 1. - smoothstep(.30, .52, d1);
float m2 = 1. - smoothstep(.26, .48, d2);
float mCa = max(m1, m2);// two slow drifting lobes
    
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