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

// ECG axis uniforms — drive beam spatial positioning
uniform float u_pAxisNorm;   // P wave axis, normalized 0..1 over dataset range
uniform float u_rAxisNorm;   // R wave (QRS) axis, normalized 0..1 over dataset range

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

    // ECG axis deviation: -0.5..+0.5 from dataset midpoint
    float pS = u_pAxisNorm - 0.5;
    float rS = u_rAxisNorm - 0.5;

    // --- Base layer: three color fields blending across the canvas ---
    // Metabolic values drive each field's color; ECG axes drive their positions.
    // Fields overlap and mix at their boundaries — different regions of the
    // canvas have genuinely different dominant colors, like paint on canvas.

    // Field centers: axis-displaced base positions with slow independent drift
    vec2 cf1 = vec2(0.35 + 0.35 * pS, 0.45 + 0.30 * rS)
        + 0.06 * vec2(sin(t * 0.11 + 6.2831 * u_pAxisNorm),
                      cos(t * 0.09 + 6.2831 * u_rAxisNorm));

    vec2 cf2 = vec2(0.70 - 0.28 * pS, 0.30 + 0.22 * rS)
        + 0.05 * vec2(cos(t * 0.07 + 6.2831 * u_rAxisNorm),
                      sin(t * 0.13 + 6.2831 * u_pAxisNorm));

    vec2 cf3 = vec2(0.42 + 0.22 * rS, 0.68 - 0.25 * pS)
        + 0.05 * vec2(sin(t * 0.09 + 6.2831 * (1.0 - u_pAxisNorm)),
                      cos(t * 0.07 + 6.2831 * (1.0 - u_rAxisNorm)));

    // Inherited field — 4th color field from ancestor piece, fades over lifespan.
    // Positioned in a different quadrant from cf1 so both coexist spatially.
    // Drift is π-offset from cf1 so they move somewhat out of phase.
    vec2 cf4 = vec2(0.65 - 0.20 * pS, 0.58 + 0.20 * rS)
        + 0.06 * vec2(cos(t * 0.11 + 3.1416 * u_pAxisNorm),
                      sin(t * 0.09 + 3.1416 * u_rAxisNorm));

    // Gaussian weights: soft falloff so colors blend smoothly at boundaries
    float sigma2 = 0.20;
    float w1 = exp(-dot(v_uv - cf1, v_uv - cf1) / sigma2);
    float w2 = exp(-dot(v_uv - cf2, v_uv - cf2) / sigma2);
    float w3 = exp(-dot(v_uv - cf3, v_uv - cf3) / sigma2);
    float w4 = exp(-dot(v_uv - cf4, v_uv - cf4) / sigma2) * u_inheritedStrength;
    float wSum = w1 + w2 + w3 + w4 + 1e-6;

    // Field colors: metabolic values drive hue, sat, bri
    vec3 col1 = hsb2rgb(u_glucose * 360., 0.55 + 0.35 * u_potassium, 0.35 + 0.55 * u_eGFR);
    vec3 col2 = hsb2rgb(u_co2HueDeg,       0.55,                     0.50 + 0.30 * u_eGFR);
    vec3 col3 = hsb2rgb(u_calciumHueDeg,   0.62,                     0.48 + 0.30 * u_eGFR);
    vec3 col4 = hsb2rgb(u_inheritedHueDeg, 0.58,                     0.52 + 0.28 * u_eGFR);

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
float ambW = .35 + .65 * rand(v_uv + vec2(t * .02, - t * .017));// soft presence
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

    float decay = exp(-u_decayPerYear * u_totalYears);
    fragColor = vec4(rgbColor * decay, 1.0);
}