#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

// Base uniforms
uniform float u_glucose;
uniform float u_potassium;
uniform float u_eGFR;
uniform vec2 u_resolution;

// Lifecycle uniforms
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
// Higher value → larger, more spatially dominant form
uniform float u_nitrogenRadius;
uniform float u_creatinineRadius;
uniform float u_sodiumRadius;
uniform float u_chlorideRadius;
uniform float u_calciumRadius;

// BUN/Creatinine ratio — spatial coupling between nitrogen and creatinine forms
// 0 = low/normal ratio (kidney-intrinsic), forms independent
// 1 = elevated ratio (pre-renal), forms pulled together and overlapping
uniform float u_bunCreatRatioNorm;

// ECG axis uniforms — drive beam spatial positioning and field drift tempo
uniform float u_pAxisNorm;    // P wave axis, normalized 0..1 over dataset range
uniform float u_rAxisNorm;    // R wave (QRS) axis, normalized 0..1 over dataset range
uniform float u_qtcNorm;       // QTc interval, min-max normalized 0..1 — drives field tempo + form sizing
uniform float u_qtcPercentile; // QTc interval, percentile-ranked 0..1 — drives Field 3 hue
uniform float u_pAxisPct;     // P wave axis, percentile-ranked 0..1 — drives Field hue only
uniform float u_rAxisPct;     // R wave axis, percentile-ranked 0..1 — drives Field hue only
uniform float u_tAxisPct;     // T-wave axis, percentile-ranked 0..1 — drives Field hue only
uniform float u_prNorm;       // PR interval, normalized 0..1 — drives acid-base field tempo
uniform float u_ventRateNorm; // Heart rate, normalized 0..1 — scales all field drift frequencies
uniform float u_tAxisNorm;    // T-wave axis, normalized 0..1 — repolarization direction
uniform float u_qrsTAngle;   // QRS-T angle normalized 0..1 — electrical dissonance (0=aligned, 1=max)
uniform float u_qrsNorm;     // QRS interval, min-max normalized 0..1 — depolarization width
uniform float u_co2Norm;     // CO2/bicarbonate, min-max normalized 0..1 — acid-base balance

// Percentile-ranked ECG hues — future-proof against outliers in any dataset past the first 29
uniform float u_ventRatePct;
uniform float u_prPct;
uniform float u_qrsPct;
uniform float u_qrsTAnglePct;

// Wall-clock time in seconds — drives realtime form animation
uniform float u_time;

// Inheritance uniforms — color field carried in from previous piece at mint
uniform float u_inheritedHueDeg;  // hue in degrees, frozen at mint from ancestor
uniform float u_inheritedStrength; // 0..1, fades toward 0 over piece lifespan

// Entropy pool / reanimation uniforms
uniform float u_reanimationProgress;    // 0 = nirvana/waiting, 1 = fully reanimated
uniform float u_partnerInheritedHueDeg; // partner's lineage hue in degrees
uniform float u_isLiberated;            // 1 = karma exhausted, final cycle
uniform float u_voidProgress;           // 0 = holding radial, 1 = void (both partners ceased)

// Beam RGB — precomputed on CPU, eliminates per-pixel hsb2rgb calls
uniform vec3 u_nitrogenRGB;
uniform vec3 u_creatRGB;
uniform vec3 u_sodiumRGB;
uniform vec3 u_chlorideRGB;
uniform vec3 u_co2RGB;
uniform vec3 u_calciumRGB;
uniform vec3 u_nirvanaRGB;   // hsb(inheritedHueDeg, 0.85, 0.92)
uniform vec3 u_partnerRGB;   // hsb(partnerInheritedHueDeg, 0.85, 0.92)

// --- helpers ---
float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}
vec3 hsb2rgb(float H, float S, float B){
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(vec3(H/360.0) + K.xyz) * 6.0 - K.www);
    return B * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), S);
}

vec3 screenBlend(vec3 base,vec3 tint,float k){
    vec3 t = clamp(tint * k, 0., 1.);
    return 1.-(1.- base)*(1.- t);
}

// Field weight: g⁴ Gaussian for contrast — dominant field wins decisively at each pixel.
float fw(vec2 p, vec2 center, float sigma) {
    float g = exp(-dot(p - center, p - center) / sigma);
    g *= g; return g * g;
}

// Ellipse distance: rotates offset by `angle`, then scales major axis by `aspect`.
// aspect > 1 stretches the form along the major axis (ECG-driven direction).
float ellipseDist(vec2 p, vec2 center, float aspect, float angle){
    vec2 d = p - center;
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 r = vec2(cosA * d.x + sinA * d.y, -sinA * d.x + cosA * d.y);
    return length(vec2(r.x / max(aspect, 0.1), r.y));
}

void main(){
    // Aspect-correct UV: keeps the square composition centered and undistorted.
    // On a 3:2 canvas the sides show extended background fields — no stretching.
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = vec2((v_uv.x - 0.5) * aspect + 0.5, v_uv.y);

    float t = u_totalYears;

    // Life fraction and drift growth — the piece moves more as it ages
    float lifeFraction = clamp(u_totalYears / max(u_lifespanYears, 0.001), 0.0, 1.0);
    float driftMul = 0.5 + 0.8 * lifeFraction; // grows from 0.5 at birth to 1.3 at death

    // ECG axis deviation: -0.5..+0.5 from dataset midpoint
    float pS = u_pAxisNorm - 0.5;
    float rS = u_rAxisNorm - 0.5;

    // ─── 17-field body map ────────────────────────────────────────────────────
    // Canvas = body. Left: cardiac (ECG). Right: metabolic (labs).
    // Each value has a fixed physiological home. Data drives size + orbit.
    // Normal = still and small. Abnormal = restless and larger.
    // Additive accumulation + Reinhard: dark where nothing reaches, bright where values overlap.

    float heartPace = 0.75 + 0.50 * u_ventRateNorm; // cardiac tempo
    float labPace   = heartPace * 0.40;              // metabolic time is slower

    // Abnormality: distance from mid-range (0=normal, 1=extreme). Drives orbit + size.
    float abVR  = abs(u_ventRateNorm     - 0.5) * 2.0;
    float abPR  = abs(u_prNorm           - 0.5) * 2.0;
    float abQRS = abs(u_qrsNorm          - 0.5) * 2.0;
    float abPA  = abs(u_pAxisNorm        - 0.5) * 2.0;
    float abRA  = abs(u_rAxisNorm        - 0.5) * 2.0;
    float abQTc = abs(u_qtcNorm          - 0.5) * 2.0;
    float abTA  = abs(u_tAxisNorm        - 0.5) * 2.0;
    float abAng = abs(u_qrsTAngle        - 0.5) * 2.0;
    float abGlu = abs(u_glucose          - 0.5) * 2.0;
    float abBUN = abs(u_nitrogenRadius   - 0.5) * 2.0;
    float abCr  = abs(u_creatinineRadius - 0.5) * 2.0;
    float abEGF = abs(u_eGFR             - 0.5) * 2.0;
    float abNa  = abs(u_sodiumRadius     - 0.5) * 2.0;
    float abK   = abs(u_potassium        - 0.5) * 2.0;
    float abCl  = abs(u_chlorideRadius   - 0.5) * 2.0;
    float abCO2 = abs(u_co2Norm          - 0.5) * 2.0;
    float abCa  = abs(u_calciumRadius    - 0.5) * 2.0;

    float os = 0.10 * driftMul; // orbit scale — grows with age

    // ECG field centers — anchors data-driven, orbit on top
    vec2 fVR  = vec2(0.10+0.80*u_ventRateNorm,  0.10+0.80*u_glucose)          + os*abVR  * vec2(sin(t*0.190*heartPace+1.0), cos(t*0.130*heartPace+2.0)) + 0.03*vec2(sin(u_time*0.23+1.0), cos(u_time*0.17+2.0));
    vec2 fPR  = vec2(0.10+0.80*u_prNorm,         0.10+0.80*u_eGFR)            + os*abPR  * vec2(cos(t*0.170*heartPace+3.0), sin(t*0.110*heartPace+1.5)) + 0.03*vec2(cos(u_time*0.19+3.0), sin(u_time*0.14+1.5));
    vec2 fQRS = vec2(0.10+0.80*u_qrsNorm,        0.10+0.80*u_potassium)       + os*abQRS * vec2(sin(t*0.230*heartPace+2.5), cos(t*0.150*heartPace+0.8)) + 0.03*vec2(sin(u_time*0.25+2.5), cos(u_time*0.18+0.8));
    vec2 fPA  = vec2(0.10+0.80*u_pAxisNorm,      0.10+0.80*u_nitrogenRadius)  + os*abPA  * vec2(cos(t*0.210*heartPace+4.0), sin(t*0.140*heartPace+2.0)) + 0.03*vec2(cos(u_time*0.21+4.0), sin(u_time*0.16+2.0));
    vec2 fRA  = vec2(0.10+0.80*u_rAxisNorm,      0.10+0.80*u_creatinineRadius)+ os*abRA  * vec2(sin(t*0.180*heartPace+1.2), cos(t*0.120*heartPace+3.5)) + 0.03*vec2(sin(u_time*0.18+1.2), cos(u_time*0.22+3.5));
    vec2 fQTc = vec2(0.10+0.80*u_qtcPercentile,  0.10+0.80*u_eGFR)            + os*abQTc * vec2(cos(t*0.220*heartPace+0.5), sin(t*0.160*heartPace+4.0)) + 0.03*vec2(cos(u_time*0.27+0.5), sin(u_time*0.20+4.0));
    vec2 fTA  = vec2(0.10+0.80*u_tAxisNorm,      0.10+0.80*u_glucose)         + os*abTA  * vec2(sin(t*0.160*heartPace+3.0), cos(t*0.110*heartPace+1.0)) + 0.03*vec2(sin(u_time*0.22+3.0), cos(u_time*0.15+1.0));
    vec2 fAng = vec2(0.10+0.80*u_qrsTAngle,      0.10+0.80*u_potassium)       + os*abAng * vec2(cos(t*0.200*heartPace+2.0), sin(t*0.140*heartPace+0.3)) + 0.03*vec2(cos(u_time*0.20+2.0), sin(u_time*0.13+0.3));

    // Lab field centers — anchors data-driven, orbit on top
    vec2 fGlu = vec2(0.10+0.80*u_glucose,         0.10+0.80*u_eGFR)            + os*abGlu * vec2(sin(t*0.140*labPace+1.5), cos(t*0.090*labPace+3.0)) + 0.03*vec2(sin(u_time*0.16+1.5), cos(u_time*0.11+3.0));
    vec2 fBUN = vec2(0.10+0.80*u_nitrogenRadius,  0.10+0.80*(1.0-u_eGFR))     + os*abBUN * vec2(cos(t*0.120*labPace+0.8), sin(t*0.080*labPace+2.5)) + 0.03*vec2(cos(u_time*0.14+0.8), sin(u_time*0.10+2.5));
    vec2 fCr  = vec2(0.10+0.80*u_creatinineRadius,0.10+0.80*u_qtcPercentile)   + os*abCr  * vec2(sin(t*0.110*labPace+2.0), cos(t*0.070*labPace+1.0)) + 0.03*vec2(sin(u_time*0.13+2.0), cos(u_time*0.09+1.0));
    vec2 fEGF = vec2(0.10+0.80*u_eGFR,            0.10+0.80*u_potassium)       + os*abEGF * vec2(cos(t*0.100*labPace+3.5), sin(t*0.070*labPace+0.5)) + 0.03*vec2(cos(u_time*0.12+3.5), sin(u_time*0.08+0.5));
    vec2 fNa  = vec2(0.10+0.80*u_sodiumRadius,    0.10+0.80*u_chlorideRadius)  + os*abNa  * vec2(sin(t*0.130*labPace+1.0), cos(t*0.090*labPace+4.0)) + 0.03*vec2(sin(u_time*0.15+1.0), cos(u_time*0.10+4.0));
    vec2 fK   = vec2(0.10+0.80*u_potassium,       0.10+0.80*u_glucose)         + os*abK   * vec2(cos(t*0.120*labPace+2.5), sin(t*0.080*labPace+1.5)) + 0.03*vec2(cos(u_time*0.11+2.5), sin(u_time*0.08+1.5));
    vec2 fCl  = vec2(0.10+0.80*u_chlorideRadius,  0.10+0.80*u_co2Norm)        + os*abCl  * vec2(sin(t*0.110*labPace+3.0), cos(t*0.070*labPace+0.8)) + 0.03*vec2(sin(u_time*0.13+3.0), cos(u_time*0.09+0.8));
    vec2 fCO2 = vec2(0.10+0.80*u_co2Norm,         0.10+0.80*u_creatinineRadius)+ os*abCO2 * vec2(cos(t*0.100*labPace+1.5), sin(t*0.070*labPace+2.0)) + 0.03*vec2(cos(u_time*0.10+1.5), sin(u_time*0.07+2.0));
    vec2 fCa  = vec2(0.10+0.80*u_calciumRadius,   0.10+0.80*u_qtcPercentile)   + os*abCa  * vec2(sin(t*0.090*labPace+0.5), cos(t*0.060*labPace+3.0)) + 0.03*vec2(sin(u_time*0.11+0.5), cos(u_time*0.08+3.0));

    // Inherited lineage field — antipodal to glucose anchor, fades over lifetime
    // cf4 kept for reanimation visuals downstream
    vec2 cf4 = clamp(vec2(1.0 - (0.15 + 0.55*u_glucose), 1.0 - (0.15 + 0.55*u_potassium)), 0.1, 0.9)
        + 0.06 * driftMul * vec2(cos(t*0.05*heartPace + 3.1416*u_pAxisNorm),
                                  sin(t*0.04*heartPace + 3.1416*u_rAxisNorm));

    // Field sigma: base 0.12, grows with abnormality (wider when value is extreme)
    float bSig = 0.12;
    float sSc  = 0.07;

    // Per-field hue angles (radians) — value × 360° + slow per-field drift
    float hVR  = radians(mod(u_ventRatePct      * 360. + t *  2.1, 360.));
    float hPR  = radians(mod(u_prPct           * 360. + t * -1.8, 360.));
    float hQRS = radians(mod(u_qrsPct          * 360. + t *  2.7, 360.));
    float hPA  = radians(mod(u_pAxisPct        * 360. + t * -1.5, 360.));
    float hRA  = radians(mod(u_rAxisPct        * 360. + t *  3.2, 360.));
    float hQTc = radians(mod(u_qtcPercentile   * 360. + t * -2.3, 360.));
    float hTA  = radians(mod(u_tAxisPct        * 360. + t *  1.9, 360.));
    float hAng = radians(mod(u_qrsTAnglePct    * 360. + t * -2.8, 360.));
    float hGlu = radians(mod(u_glucose          * 360. + t *  1.4, 360.));
    float hBUN = radians(mod(u_nitrogenRadius   * 360. + t * -1.7, 360.));
    float hCr  = radians(mod(u_creatinineRadius * 360. + t *  2.4, 360.));
    float hEGF = radians(mod(u_eGFR             * 360. + t * -1.3, 360.));
    float hNa  = radians(mod(u_sodiumRadius     * 360. + t *  2.9, 360.));
    float hK   = radians(mod(u_potassium        * 360. + t * -2.0, 360.));
    float hChl = radians(mod(u_chlorideRadius   * 360. + t *  1.6, 360.));
    float hCO2 = radians(mod(u_co2Norm          * 360. + t * -2.5, 360.));
    float hCa  = radians(mod(u_calciumRadius    * 360. + t *  1.2, 360.));
    float hInh = radians(u_inheritedHueDeg);

    // Per-field sat: high baseline — vivid always, disease pushes to pure
    // Per-field bri: modest floor drop for more depth without going too dark
    float sVR=0.92+0.08*abVR;   float bVR=0.25+0.65*u_ventRateNorm;
    float sPR=0.92+0.08*abPR;   float bPR=0.25+0.65*u_prNorm;
    float sQRS=0.92+0.08*abQRS; float bQRS=0.25+0.65*u_qrsNorm;
    float sPA=0.92+0.08*abPA;   float bPA=0.25+0.65*u_pAxisNorm;
    float sRA=0.92+0.08*abRA;   float bRA=0.25+0.65*u_rAxisNorm;
    float sQTc=0.92+0.08*abQTc; float bQTc=0.25+0.65*u_qtcNorm;
    float sTA=0.92+0.08*abTA;   float bTA=0.25+0.65*u_tAxisNorm;
    float sAng=0.92+0.08*abAng; float bAng=0.25+0.65*u_qrsTAngle;
    float sGlu=0.92+0.08*abGlu; float bGlu=0.25+0.65*u_glucose;
    float sBUN=0.92+0.08*abBUN; float bBUN=0.25+0.65*u_nitrogenRadius;
    float sCr=0.92+0.08*abCr;   float bCr=0.25+0.65*u_creatinineRadius;
    float sEGF=0.92+0.08*abEGF; float bEGF=0.25+0.65*u_eGFR;
    float sNa=0.92+0.08*abNa;   float bNa=0.25+0.65*u_sodiumRadius;
    float sK=0.92+0.08*abK;     float bK=0.25+0.65*u_potassium;
    float sChl=0.92+0.08*abCl;  float bChl=0.25+0.65*u_chlorideRadius;
    float sCO2=0.92+0.08*abCO2; float bCO2=0.25+0.65*u_co2Norm;
    float sCa=0.92+0.08*abCa;   float bCa=0.25+0.65*u_calciumRadius;
    float sInh=0.72;             float bInh=0.52+0.28*u_eGFR;

    // Weighted average — normalized so canvas is always fully covered, no black corners
    float w1  = fw(uv, fVR,  bSig + sSc*abVR);
    float w2  = fw(uv, fPR,  bSig + sSc*abPR);
    float w3  = fw(uv, fQRS, bSig + sSc*abQRS);
    float w4  = fw(uv, fPA,  bSig + sSc*abPA);
    float w5  = fw(uv, fRA,  bSig + sSc*abRA);
    float w6  = fw(uv, fQTc, bSig + sSc*abQTc);
    float w7  = fw(uv, fTA,  bSig + sSc*abTA);
    float w8  = fw(uv, fAng, bSig + sSc*abAng);
    float w9  = fw(uv, fGlu, bSig + sSc*abGlu);
    float w10 = fw(uv, fBUN, bSig + sSc*abBUN);
    float w11 = fw(uv, fCr,  bSig + sSc*abCr);
    float w12 = fw(uv, fEGF, bSig + sSc*abEGF);
    float w13 = fw(uv, fNa,  bSig + sSc*abNa);
    float w14 = fw(uv, fK,   bSig + sSc*abK);
    float w15 = fw(uv, fCl,  bSig + sSc*abCl);
    float w16 = fw(uv, fCO2, bSig + sSc*abCO2);
    float w17 = fw(uv, fCa,  bSig + sSc*abCa);
    float w18 = fw(uv, cf4,  0.14) * u_inheritedStrength;
    float wSum = w1+w2+w3+w4+w5+w6+w7+w8+w9+w10+w11+w12+w13+w14+w15+w16+w17+w18 + 1e-6;

    // Circular mean of hues — blends angles not RGB vectors, no wash to white
    float hueX = (w1*cos(hVR)+w2*cos(hPR)+w3*cos(hQRS)+w4*cos(hPA)+w5*cos(hRA)+w6*cos(hQTc)+
                  w7*cos(hTA)+w8*cos(hAng)+w9*cos(hGlu)+w10*cos(hBUN)+w11*cos(hCr)+w12*cos(hEGF)+
                  w13*cos(hNa)+w14*cos(hK)+w15*cos(hChl)+w16*cos(hCO2)+w17*cos(hCa)+w18*cos(hInh)) / wSum;
    float hueY = (w1*sin(hVR)+w2*sin(hPR)+w3*sin(hQRS)+w4*sin(hPA)+w5*sin(hRA)+w6*sin(hQTc)+
                  w7*sin(hTA)+w8*sin(hAng)+w9*sin(hGlu)+w10*sin(hBUN)+w11*sin(hCr)+w12*sin(hEGF)+
                  w13*sin(hNa)+w14*sin(hK)+w15*sin(hChl)+w16*sin(hCO2)+w17*sin(hCa)+w18*sin(hInh)) / wSum;
    float blendedHue = mod(degrees(atan(hueY, hueX)), 360.0);
    float blendedSat = (w1*sVR+w2*sPR+w3*sQRS+w4*sPA+w5*sRA+w6*sQTc+
                        w7*sTA+w8*sAng+w9*sGlu+w10*sBUN+w11*sCr+w12*sEGF+
                        w13*sNa+w14*sK+w15*sChl+w16*sCO2+w17*sCa+w18*sInh) / wSum;
    float blendedBri = (w1*bVR+w2*bPR+w3*bQRS+w4*bPA+w5*bRA+w6*bQTc+
                        w7*bTA+w8*bAng+w9*bGlu+w10*bBUN+w11*bCr+w12*bEGF+
                        w13*bNa+w14*bK+w15*bChl+w16*bCO2+w17*bCa+w18*bInh) / wSum;
    vec3 rgbColor = hsb2rgb(blendedHue, blendedSat, blendedBri);

// --- ECG-driven form shape ---
// Each form is shaped by a different ECG dimension so pieces diverge across the dataset.
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

// --- Lab-driven form radii ---
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

// Form positions: lava lamp style.
// Each form floats on two superimposed sine orbits with incommensurate frequencies —
// the path never exactly repeats within a human lifespan. ECG values seed the phases
// so each dataset traces a genuinely unique trajectory. driftMul grows 0.5→1.3
// with age so orbits expand as the piece progresses. Small u_time term adds
// realtime breathing on top of the slow year-drift.

// Data-driven anchors: each form's home position is determined by a unique ECG pair.
// Range 0.20-0.80 keeps forms off the hard edges while using most of the canvas.
// Different datasets produce genuinely different compositions.

// Nitrogen: pAxis × rAxis
vec2 cN = vec2(0.20 + 0.60 * u_pAxisNorm, 0.20 + 0.60 * u_rAxisNorm)
    + 0.20 * driftMul * vec2(sin(t * 0.19 + 6.2831 * u_pAxisNorm),
                              cos(t * 0.13 + 6.2831 * u_rAxisNorm))
    + 0.09 * driftMul * vec2(sin(t * 0.51 + 6.2831 * u_qtcNorm),
                              cos(t * 0.37 + 6.2831 * u_tAxisNorm))
    + 0.04 * vec2(sin(u_time * 0.23 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.17 + 6.2831 * u_rAxisNorm));

// Creatinine lobe 1: (1-pAxis) × qtcNorm — inverted pAxis opposes Nitrogen
vec2 cC1 = vec2(0.20 + 0.60 * (1.0 - u_pAxisNorm), 0.20 + 0.60 * u_qtcNorm)
    + 0.18 * driftMul * vec2(sin(t * 0.23 + 6.2831 * (1.0 - u_pAxisNorm)),
                              cos(t * 0.16 + 6.2831 * u_rAxisNorm))
    + 0.08 * driftMul * vec2(sin(t * 0.44 + 6.2831 * (1.0 - u_qtcNorm)),
                              cos(t * 0.31 + 6.2831 * u_prNorm))
    + 0.04 * vec2(sin(u_time * 0.27 + 6.2831 * (1.0 - u_pAxisNorm)),
                  cos(u_time * 0.19 + 6.2831 * u_rAxisNorm));

// Creatinine lobe 2: qtcNorm × (1-rAxis)
vec2 cC2 = vec2(0.20 + 0.60 * u_qtcNorm, 0.20 + 0.60 * (1.0 - u_rAxisNorm))
    + 0.15 * driftMul * vec2(sin(t * 0.27 + 6.2831 * (1.0 - u_pAxisNorm) + 1.571),
                              cos(t * 0.19 + 6.2831 * u_rAxisNorm + 1.571))
    + 0.07 * driftMul * vec2(sin(t * 0.61 + 6.2831 * u_pAxisNorm),
                              cos(t * 0.43 + 6.2831 * (1.0 - u_rAxisNorm)))
    + 0.03 * vec2(sin(u_time * 0.21 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.15 + 6.2831 * (1.0 - u_rAxisNorm)));

// BUN/Creatinine ratio coupling: elevated ratio (pre-renal) pulls kidney forms together.
float pull = u_bunCreatRatioNorm * 0.12;
vec2 pullVec = cC1 - cN;
vec2 pullDir = pullVec / max(length(pullVec), 0.001);
cN  += pullDir * pull;
cC1 -= pullDir * pull * 0.5;

float mN  = 1.0 - smoothstep(nInner,  nOuter,  ellipseDist(uv, cN,  nAspect,  nAngle));
float mC1 = 1.0 - smoothstep(cInner1, cOuter1, ellipseDist(uv, cC1, crAspect, crAngle));
float mC2 = 1.0 - smoothstep(cInner2, cOuter2, ellipseDist(uv, cC2, crAspect * 0.85, crAngle));
float mC  = max(mC1, mC2);

// Sodium lobe A: rAxis × ventRateNorm
vec2 cA = vec2(0.20 + 0.60 * u_rAxisNorm, 0.20 + 0.60 * u_ventRateNorm)
    + 0.18 * driftMul * vec2(cos(t * 0.17 + 6.2831 * u_rAxisNorm),
                              sin(t * 0.12 + 6.2831 * u_pAxisNorm))
    + 0.08 * driftMul * vec2(cos(t * 0.43 + 6.2831 * u_ventRateNorm),
                              sin(t * 0.29 + 6.2831 * u_qtcNorm))
    + 0.04 * vec2(cos(u_time * 0.25 + 6.2831 * u_rAxisNorm),
                  sin(u_time * 0.18 + 6.2831 * u_pAxisNorm));

// Sodium lobe B: (1-rAxis) × (1-pAxis) — naturally opposes A
vec2 cB = vec2(0.20 + 0.60 * (1.0 - u_rAxisNorm), 0.20 + 0.60 * (1.0 - u_pAxisNorm))
    + 0.16 * driftMul * vec2(cos(t * 0.17 + 6.2831 * (1.0 - u_rAxisNorm)),
                              sin(t * 0.12 + 6.2831 * (1.0 - u_pAxisNorm)))
    + 0.07 * driftMul * vec2(cos(t * 0.43 + 6.2831 * (1.0 - u_ventRateNorm)),
                              sin(t * 0.29 + 6.2831 * (1.0 - u_qtcNorm)))
    + 0.03 * vec2(sin(u_time * 0.16 + 6.2831 * (1.0 - u_rAxisNorm)),
                  cos(u_time * 0.22 + 6.2831 * (1.0 - u_pAxisNorm)));

float mA  = 1. - smoothstep(naInner1, naOuter1, ellipseDist(uv, cA, naAspect, naAngle));
float mB  = 1. - smoothstep(naInner2, naOuter2, ellipseDist(uv, cB, naAspect * 0.9, naAngle));
float mNa = max(mA, mB);

// Chloride: prNorm × tAxisNorm
vec2 cCl = vec2(0.20 + 0.60 * u_prNorm, 0.20 + 0.60 * u_tAxisNorm)
    + 0.18 * driftMul * vec2(sin(t * 0.22 + 6.2831 * u_rAxisNorm),
                              cos(t * 0.15 + 6.2831 * u_pAxisNorm))
    + 0.07 * driftMul * vec2(sin(t * 0.53 + 6.2831 * u_prNorm),
                              cos(t * 0.37 + 6.2831 * u_tAxisNorm))
    + 0.04 * vec2(sin(u_time * 0.26 + 6.2831 * u_rAxisNorm),
                  cos(u_time * 0.19 + 6.2831 * u_pAxisNorm));
float mCl = 1.0 - smoothstep(clInner, clOuter, ellipseDist(uv, cCl, clAspect, clAngle));

// Chloride strength comes from JS (handles arrival gate + lifespan correctly)
float strengthCl = u_chlorideStrength;

// CO2: HALO (cool, edge-biased ambient blend)
float lum = dot(rgbColor, vec3(.299, .587, .114));
float edge = length(vec2(dFdx(lum), dFdy(lum)));
float edgeW = smoothstep(.004, .050, edge);// stronger where colors meet
float ambW = .88 + .12 * rand(uv + vec2(u_pAxisNorm * 6.28, u_rAxisNorm * 4.71));// near-uniform atmospheric presence, slight texture per dataset
// T-axis directional lean: halo is subtly brighter in the repolarization direction
float tAngle = u_tAxisNorm * 3.14159;
float tBias = 0.5 + 0.5 * dot(normalize(uv - vec2(0.5)), vec2(cos(tAngle), sin(tAngle)));
float localGain = smoothstep(.01, .55, lum);// avoid dark wash
// QRS-T dissonance shifts halo from diffuse to edge-concentrated: discordant repolarization
// makes the atmosphere cluster at color boundaries rather than spread uniformly
float haloW = u_co2Strength * mix(ambW, edgeW, 0.45 + 0.30 * u_qrsTAngle) * localGain * (0.88 + 0.12 * tBias);

// Calcium: slow, heavy. c1 anchored by tAxis × (1-qtc), c2 inverted — naturally opposes.
vec2 c1 = vec2(0.20 + 0.60 * u_tAxisNorm, 0.20 + 0.60 * (1.0 - u_qtcNorm))
    + 0.16 * driftMul * vec2(sin(t * 0.15 + 6.2831 * u_pAxisNorm),
                              cos(t * 0.11 + 6.2831 * u_rAxisNorm))
    + 0.07 * driftMul * vec2(sin(t * 0.41 + 6.2831 * u_tAxisNorm),
                              cos(t * 0.28 + 6.2831 * u_qtcNorm))
    + 0.04 * vec2(sin(u_time * 0.14 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.20 + 6.2831 * u_rAxisNorm));
vec2 c2 = vec2(0.20 + 0.60 * (1.0 - u_tAxisNorm), 0.20 + 0.60 * u_qtcNorm)
    + 0.16 * driftMul * vec2(cos(t * 0.15 + 6.2831 * (1.0 - u_rAxisNorm)),
                              sin(t * 0.11 + 6.2831 * (1.0 - u_pAxisNorm)))
    + 0.07 * driftMul * vec2(cos(t * 0.41 + 6.2831 * (1.0 - u_tAxisNorm)),
                              sin(t * 0.28 + 6.2831 * (1.0 - u_qtcNorm)))
    + 0.04 * vec2(cos(u_time * 0.11 + 6.2831 * (1.0 - u_rAxisNorm)),
                  sin(u_time * 0.16 + 6.2831 * (1.0 - u_pAxisNorm)));
float m1  = 1. - smoothstep(caInner1, caOuter1, ellipseDist(uv, c1, caAspect, caAngle));
float m2  = 1. - smoothstep(caInner2, caOuter2, ellipseDist(uv, c2, caAspect * 0.88, caAngle));
float mCa = max(m1, m2);
    
    // Nitrogen
    rgbColor = clamp(rgbColor + u_nitrogenRGB * u_nitrogenStrength * mN, 0., 1.0);

    // Creatinine
    rgbColor = clamp(rgbColor + u_creatRGB * u_creatinineStrength * mC, 0., 1.0);

    // Sodium
    rgbColor = clamp(rgbColor + u_sodiumRGB * u_sodiumStrength * mNa, 0., 1.0);

    // Chloride
    rgbColor = clamp(rgbColor + u_chlorideRGB * strengthCl * mCl, 0., 1.0);

    // CO2
    rgbColor = clamp(rgbColor + u_co2RGB * haloW, 0., 1.);

    // Calcium
    float darkW = smoothstep(.65, .25, lum);
    rgbColor = screenBlend(rgbColor, u_calciumRGB, u_calciumStrength * mCa * darkW);

    float liberated = step(0.5, u_isLiberated);
    float latePhase = smoothstep(0.70, 1.00, lifeFraction);

    // No artificial brightness decay — the data itself evolves over the lifetime
    // (chronological drift, collection influence, health modulation). That IS the decay.
    // Final cycle: late phase dissolves toward radial liberation instead.
    vec3 livingColor = rgbColor;

    // --- Nirvana radial: pure centered glow in the base glucose hue ---
    // This is the permanent state after liberation. No fields, no forms, no drift.
    // Dark at edges, luminous at center — heavenly stillness.
    // Nirvana: radial glow in the base glucose hue.
    // Floor keeps corners from going dark — eyes rest at center, edges remain present.
    float nirvanaHue  = mod(u_glucose * 360.0, 360.0);
    float radialDist  = length(v_uv - vec2(0.5));
    float radialGlow  = exp(-radialDist * radialDist / 0.10);
    // Slow pulse while holding — very subtle breathing, not full stillness
    float nirvanaPulse = 0.94 + 0.06 * sin(u_time * 0.25);
    float nirvanaBri  = (0.38 + 0.57 * radialGlow) * nirvanaPulse;
    float nirvanaSat  = 0.75 - 0.30 * radialGlow;
    vec3  nirvanaRadial = hsb2rgb(nirvanaHue, nirvanaSat, nirvanaBri);

    // Final cycle late phase: dissolve living complexity into nirvana radial.
    // Replaces the normal darkening — the piece brightens toward liberation.
    livingColor = mix(livingColor, nirvanaRadial, latePhase * liberated);

    // Post-cessation: complete dissolution into nirvana over 0.5 years.
    float nirvanaProgress = clamp((u_totalYears - u_lifespanYears) / 0.5, 0.0, 1.0);

    // --- Reanimation: partner's hue arrives from opposite corner, both converge ---
    // Only active for non-final cycles. Suppressed when liberated.
    float partnerArrival = smoothstep(0.0, 0.6, u_reanimationProgress) * (1.0 - liberated);
    float lifeRestores   = smoothstep(0.5, 1.0, u_reanimationProgress) * (1.0 - liberated);
    vec2 partnerOrigin = clamp(vec2(1.0) - cf4, 0.1, 0.9);
    vec2 partnerPos    = mix(partnerOrigin, vec2(0.5), partnerArrival);
    vec2 ownPos        = mix(cf4, vec2(0.5), partnerArrival * 0.6);
    float pGlow = exp(-dot(uv - partnerPos, uv - partnerPos) / 0.14);
    float oGlow = exp(-dot(uv - ownPos,     uv - ownPos)     / 0.14);
    vec3 meetingField = clamp(u_nirvanaRGB * oGlow + u_partnerRGB * pGlow * partnerArrival, 0.0, 1.0);

    // --- State blending ---
    // Non-final nirvana: inherited hue glow → partner collision → new life
    vec3 nirvanaState = mix(u_nirvanaRGB * 0.90, meetingField, smoothstep(0.0, 0.5, u_reanimationProgress));
    // Final nirvana: pure radial, permanent
    nirvanaState = mix(nirvanaState, nirvanaRadial, liberated);

    vec3 finalColor = mix(livingColor, nirvanaState, nirvanaProgress);
    finalColor = mix(finalColor, rgbColor, lifeRestores);

    // Void: both partners have reached final cessation — fade to near-black with bright halo outline.
    // Center is nearly black; edges glow in glucose hue like the piece's own halo.
    float edgeDist = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
    float edgeGlow = exp(-edgeDist * edgeDist / 0.003);
    float voidBri = 0.03 + 1.00 * edgeGlow;
    float voidSat = 0.90 * edgeGlow;
    vec3 voidColor = hsb2rgb(nirvanaHue, voidSat, voidBri);
    finalColor = mix(finalColor, voidColor, u_voidProgress * liberated);

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}