const _selfScript = document.currentScript;
(function(){
const _style = document.createElement('style');
_style.textContent = 'html,body{background:#000}' + `body{margin:0;padding:0;height:100vh;width:100vw;display:flex;justify-content:center;align-items:center;}#canvas-container{box-sizing:border-box;width:min(100vw, 100vh);height:min(100vw, 100vh);display:flex;justify-content:center;align-items:center;border:clamp(8px, 8vmin, 80px) solid black;background-color:black;}#canvas{display:block;aspect-ratio:3 / 2;max-width:100%;max-height:100%;}#canvas-container{position:relative;}`;
(document.head || document.documentElement).appendChild(_style);
const _cc = document.createElement('div');
_cc.id = 'canvas-container';
const _cv = document.createElement('canvas');
_cv.id = 'canvas';
_cc.appendChild(_cv);
document.body.appendChild(_cc);
document.addEventListener('keydown', function(e) {
  if (e.key.toUpperCase() === 'F') {
    var c = document.getElementById('canvas-container');
    if (!document.fullscreenElement) c.requestFullscreen();
    else document.exitFullscreen();
  }
});
const _vertSrc = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;
const _fragSrc = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_glucose;
uniform float u_potassium;
uniform float u_eGFR;
uniform vec2 u_resolution;

uniform float u_totalYears;
uniform float u_lifespanYears;

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

uniform float u_nitrogenRadius;
uniform float u_creatinineRadius;
uniform float u_sodiumRadius;
uniform float u_chlorideRadius;
uniform float u_calciumRadius;

uniform float u_bunCreatRatioNorm;

uniform float u_pAxisNorm;
uniform float u_rAxisNorm;
uniform float u_qtcNorm;
uniform float u_qtcPercentile;
uniform float u_pAxisPct;
uniform float u_rAxisPct;
uniform float u_tAxisPct;
uniform float u_prNorm;
uniform float u_ventRateNorm;
uniform float u_tAxisNorm;
uniform float u_qrsTAngle;
uniform float u_qrsNorm;
uniform float u_co2Norm;

uniform float u_ventRatePct;
uniform float u_prPct;
uniform float u_qrsPct;
uniform float u_qrsTAnglePct;

uniform float u_time;

uniform float u_inheritedHueDeg;
uniform float u_inheritedStrength;

uniform float u_reanimationProgress;
uniform float u_partnerInheritedHueDeg;
uniform float u_isLiberated;
uniform float u_voidProgress;

uniform vec3 u_nitrogenRGB;
uniform vec3 u_creatRGB;
uniform vec3 u_sodiumRGB;
uniform vec3 u_chlorideRGB;
uniform vec3 u_co2RGB;
uniform vec3 u_calciumRGB;
uniform vec3 u_nirvanaRGB;
uniform vec3 u_partnerRGB;

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

float fw(vec2 p, vec2 center, float sigma) {
    float g = exp(-dot(p - center, p - center) / sigma);
    g *= g; return g * g;
}

float ellipseDist(vec2 p, vec2 center, float aspect, float angle){
    vec2 d = p - center;
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 r = vec2(cosA * d.x + sinA * d.y, -sinA * d.x + cosA * d.y);
    return length(vec2(r.x / max(aspect, 0.1), r.y));
}

void main(){

    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = vec2((v_uv.x - 0.5) * aspect + 0.5, v_uv.y);

    float t = u_totalYears;

    float lifeFraction = clamp(u_totalYears / max(u_lifespanYears, 0.001), 0.0, 1.0);
    float driftMul = 0.5 + 0.8 * lifeFraction;

    float pS = u_pAxisNorm - 0.5;
    float rS = u_rAxisNorm - 0.5;

    float heartPace = 0.75 + 0.50 * u_ventRateNorm;
    float labPace   = heartPace * 0.40;

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

    float os = 0.10 * driftMul;

    vec2 fVR  = vec2(0.10+0.80*u_ventRateNorm,  0.10+0.80*u_glucose)          + os*abVR  * vec2(sin(t*0.190*heartPace+1.0), cos(t*0.130*heartPace+2.0)) + 0.03*vec2(sin(u_time*0.23+1.0), cos(u_time*0.17+2.0));
    vec2 fPR  = vec2(0.10+0.80*u_prNorm,         0.10+0.80*u_eGFR)            + os*abPR  * vec2(cos(t*0.170*heartPace+3.0), sin(t*0.110*heartPace+1.5)) + 0.03*vec2(cos(u_time*0.19+3.0), sin(u_time*0.14+1.5));
    vec2 fQRS = vec2(0.10+0.80*u_qrsNorm,        0.10+0.80*u_potassium)       + os*abQRS * vec2(sin(t*0.230*heartPace+2.5), cos(t*0.150*heartPace+0.8)) + 0.03*vec2(sin(u_time*0.25+2.5), cos(u_time*0.18+0.8));
    vec2 fPA  = vec2(0.10+0.80*u_pAxisNorm,      0.10+0.80*u_nitrogenRadius)  + os*abPA  * vec2(cos(t*0.210*heartPace+4.0), sin(t*0.140*heartPace+2.0)) + 0.03*vec2(cos(u_time*0.21+4.0), sin(u_time*0.16+2.0));
    vec2 fRA  = vec2(0.10+0.80*u_rAxisNorm,      0.10+0.80*u_creatinineRadius)+ os*abRA  * vec2(sin(t*0.180*heartPace+1.2), cos(t*0.120*heartPace+3.5)) + 0.03*vec2(sin(u_time*0.18+1.2), cos(u_time*0.22+3.5));
    vec2 fQTc = vec2(0.10+0.80*u_qtcPercentile,  0.10+0.80*u_eGFR)            + os*abQTc * vec2(cos(t*0.220*heartPace+0.5), sin(t*0.160*heartPace+4.0)) + 0.03*vec2(cos(u_time*0.27+0.5), sin(u_time*0.20+4.0));
    vec2 fTA  = vec2(0.10+0.80*u_tAxisNorm,      0.10+0.80*u_glucose)         + os*abTA  * vec2(sin(t*0.160*heartPace+3.0), cos(t*0.110*heartPace+1.0)) + 0.03*vec2(sin(u_time*0.22+3.0), cos(u_time*0.15+1.0));
    vec2 fAng = vec2(0.10+0.80*u_qrsTAngle,      0.10+0.80*u_potassium)       + os*abAng * vec2(cos(t*0.200*heartPace+2.0), sin(t*0.140*heartPace+0.3)) + 0.03*vec2(cos(u_time*0.20+2.0), sin(u_time*0.13+0.3));

    vec2 fGlu = vec2(0.10+0.80*u_glucose,         0.10+0.80*u_eGFR)            + os*abGlu * vec2(sin(t*0.140*labPace+1.5), cos(t*0.090*labPace+3.0)) + 0.03*vec2(sin(u_time*0.16+1.5), cos(u_time*0.11+3.0));
    vec2 fBUN = vec2(0.10+0.80*u_nitrogenRadius,  0.10+0.80*(1.0-u_eGFR))     + os*abBUN * vec2(cos(t*0.120*labPace+0.8), sin(t*0.080*labPace+2.5)) + 0.03*vec2(cos(u_time*0.14+0.8), sin(u_time*0.10+2.5));
    vec2 fCr  = vec2(0.10+0.80*u_creatinineRadius,0.10+0.80*u_qtcPercentile)   + os*abCr  * vec2(sin(t*0.110*labPace+2.0), cos(t*0.070*labPace+1.0)) + 0.03*vec2(sin(u_time*0.13+2.0), cos(u_time*0.09+1.0));
    vec2 fEGF = vec2(0.10+0.80*u_eGFR,            0.10+0.80*u_potassium)       + os*abEGF * vec2(cos(t*0.100*labPace+3.5), sin(t*0.070*labPace+0.5)) + 0.03*vec2(cos(u_time*0.12+3.5), sin(u_time*0.08+0.5));
    vec2 fNa  = vec2(0.10+0.80*u_sodiumRadius,    0.10+0.80*u_chlorideRadius)  + os*abNa  * vec2(sin(t*0.130*labPace+1.0), cos(t*0.090*labPace+4.0)) + 0.03*vec2(sin(u_time*0.15+1.0), cos(u_time*0.10+4.0));
    vec2 fK   = vec2(0.10+0.80*u_potassium,       0.10+0.80*u_glucose)         + os*abK   * vec2(cos(t*0.120*labPace+2.5), sin(t*0.080*labPace+1.5)) + 0.03*vec2(cos(u_time*0.11+2.5), sin(u_time*0.08+1.5));
    vec2 fCl  = vec2(0.10+0.80*u_chlorideRadius,  0.10+0.80*u_co2Norm)        + os*abCl  * vec2(sin(t*0.110*labPace+3.0), cos(t*0.070*labPace+0.8)) + 0.03*vec2(sin(u_time*0.13+3.0), cos(u_time*0.09+0.8));
    vec2 fCO2 = vec2(0.10+0.80*u_co2Norm,         0.10+0.80*u_creatinineRadius)+ os*abCO2 * vec2(cos(t*0.100*labPace+1.5), sin(t*0.070*labPace+2.0)) + 0.03*vec2(cos(u_time*0.10+1.5), sin(u_time*0.07+2.0));
    vec2 fCa  = vec2(0.10+0.80*u_calciumRadius,   0.10+0.80*u_qtcPercentile)   + os*abCa  * vec2(sin(t*0.090*labPace+0.5), cos(t*0.060*labPace+3.0)) + 0.03*vec2(sin(u_time*0.11+0.5), cos(u_time*0.08+3.0));

    vec2 cf4 = clamp(vec2(1.0 - (0.15 + 0.55*u_glucose), 1.0 - (0.15 + 0.55*u_potassium)), 0.1, 0.9)
        + 0.06 * driftMul * vec2(cos(t*0.05*heartPace + 3.1416*u_pAxisNorm),
                                  sin(t*0.04*heartPace + 3.1416*u_rAxisNorm));

    float bSig = 0.12;
    float sSc  = 0.07;

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

float extremeP   = abs(pS) * 2.0;
float qtcS       = u_qtcNorm - 0.5;
float prS        = u_prNorm - 0.5;
float vrS        = u_ventRateNorm - 0.5;
float tS         = u_tAxisNorm - 0.5;
float extremeQtc = abs(qtcS) * 2.0;
float extremePR  = abs(prS)  * 2.0;
float extremeVR  = abs(vrS)  * 2.0;
float extremeT   = abs(tS)   * 2.0;

float nAspect  = 1.0 + 1.8 * extremeP;
float nAngle   = tS * 3.14159;

float crAspect = 1.0 + 1.6 * extremeQtc;
float crAngle  = -prS * 2.356;

float naAspect = 1.0 + 1.2 * extremeVR;
float naAngle  = (rS + vrS) * 1.047;

float clAspect = 1.0 + 1.4 * extremePR;
float clAngle  = tS * 1.571;

float caAspect = 1.0 + 1.4 * extremeT;
float caAngle  = -qtcS * 2.094;

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

vec2 cN = vec2(0.20 + 0.60 * u_pAxisNorm, 0.20 + 0.60 * u_rAxisNorm)
    + 0.20 * driftMul * vec2(sin(t * 0.19 + 6.2831 * u_pAxisNorm),
                              cos(t * 0.13 + 6.2831 * u_rAxisNorm))
    + 0.09 * driftMul * vec2(sin(t * 0.51 + 6.2831 * u_qtcNorm),
                              cos(t * 0.37 + 6.2831 * u_tAxisNorm))
    + 0.04 * vec2(sin(u_time * 0.23 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.17 + 6.2831 * u_rAxisNorm));

vec2 cC1 = vec2(0.20 + 0.60 * (1.0 - u_pAxisNorm), 0.20 + 0.60 * u_qtcNorm)
    + 0.18 * driftMul * vec2(sin(t * 0.23 + 6.2831 * (1.0 - u_pAxisNorm)),
                              cos(t * 0.16 + 6.2831 * u_rAxisNorm))
    + 0.08 * driftMul * vec2(sin(t * 0.44 + 6.2831 * (1.0 - u_qtcNorm)),
                              cos(t * 0.31 + 6.2831 * u_prNorm))
    + 0.04 * vec2(sin(u_time * 0.27 + 6.2831 * (1.0 - u_pAxisNorm)),
                  cos(u_time * 0.19 + 6.2831 * u_rAxisNorm));

vec2 cC2 = vec2(0.20 + 0.60 * u_qtcNorm, 0.20 + 0.60 * (1.0 - u_rAxisNorm))
    + 0.15 * driftMul * vec2(sin(t * 0.27 + 6.2831 * (1.0 - u_pAxisNorm) + 1.571),
                              cos(t * 0.19 + 6.2831 * u_rAxisNorm + 1.571))
    + 0.07 * driftMul * vec2(sin(t * 0.61 + 6.2831 * u_pAxisNorm),
                              cos(t * 0.43 + 6.2831 * (1.0 - u_rAxisNorm)))
    + 0.03 * vec2(sin(u_time * 0.21 + 6.2831 * u_pAxisNorm),
                  cos(u_time * 0.15 + 6.2831 * (1.0 - u_rAxisNorm)));

float pull = u_bunCreatRatioNorm * 0.12;
vec2 pullVec = cC1 - cN;
vec2 pullDir = pullVec / max(length(pullVec), 0.001);
cN  += pullDir * pull;
cC1 -= pullDir * pull * 0.5;

float mN  = 1.0 - smoothstep(nInner,  nOuter,  ellipseDist(uv, cN,  nAspect,  nAngle));
float mC1 = 1.0 - smoothstep(cInner1, cOuter1, ellipseDist(uv, cC1, crAspect, crAngle));
float mC2 = 1.0 - smoothstep(cInner2, cOuter2, ellipseDist(uv, cC2, crAspect * 0.85, crAngle));
float mC  = max(mC1, mC2);

vec2 cA = vec2(0.20 + 0.60 * u_rAxisNorm, 0.20 + 0.60 * u_ventRateNorm)
    + 0.18 * driftMul * vec2(cos(t * 0.17 + 6.2831 * u_rAxisNorm),
                              sin(t * 0.12 + 6.2831 * u_pAxisNorm))
    + 0.08 * driftMul * vec2(cos(t * 0.43 + 6.2831 * u_ventRateNorm),
                              sin(t * 0.29 + 6.2831 * u_qtcNorm))
    + 0.04 * vec2(cos(u_time * 0.25 + 6.2831 * u_rAxisNorm),
                  sin(u_time * 0.18 + 6.2831 * u_pAxisNorm));

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

vec2 cCl = vec2(0.20 + 0.60 * u_prNorm, 0.20 + 0.60 * u_tAxisNorm)
    + 0.18 * driftMul * vec2(sin(t * 0.22 + 6.2831 * u_rAxisNorm),
                              cos(t * 0.15 + 6.2831 * u_pAxisNorm))
    + 0.07 * driftMul * vec2(sin(t * 0.53 + 6.2831 * u_prNorm),
                              cos(t * 0.37 + 6.2831 * u_tAxisNorm))
    + 0.04 * vec2(sin(u_time * 0.26 + 6.2831 * u_rAxisNorm),
                  cos(u_time * 0.19 + 6.2831 * u_pAxisNorm));
float mCl = 1.0 - smoothstep(clInner, clOuter, ellipseDist(uv, cCl, clAspect, clAngle));

float strengthCl = u_chlorideStrength;

float lum = dot(rgbColor, vec3(.299, .587, .114));
float edge = length(vec2(dFdx(lum), dFdy(lum)));
float edgeW = smoothstep(.004, .050, edge);
float ambW = .88 + .12 * rand(uv + vec2(u_pAxisNorm * 6.28, u_rAxisNorm * 4.71));

float tAngle = u_tAxisNorm * 3.14159;
float tBias = 0.5 + 0.5 * dot(normalize(uv - vec2(0.5)), vec2(cos(tAngle), sin(tAngle)));
float localGain = smoothstep(.01, .55, lum);

float haloW = u_co2Strength * mix(ambW, edgeW, 0.45 + 0.30 * u_qrsTAngle) * localGain * (0.88 + 0.12 * tBias);

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

    rgbColor = clamp(rgbColor + u_nitrogenRGB * u_nitrogenStrength * mN, 0., 1.0);

    rgbColor = clamp(rgbColor + u_creatRGB * u_creatinineStrength * mC, 0., 1.0);

    rgbColor = clamp(rgbColor + u_sodiumRGB * u_sodiumStrength * mNa, 0., 1.0);

    rgbColor = clamp(rgbColor + u_chlorideRGB * strengthCl * mCl, 0., 1.0);

    rgbColor = clamp(rgbColor + u_co2RGB * haloW, 0., 1.);

    float darkW = smoothstep(.65, .25, lum);
    rgbColor = screenBlend(rgbColor, u_calciumRGB, u_calciumStrength * mCa * darkW);

    float liberated = step(0.5, u_isLiberated);
    float latePhase = smoothstep(0.70, 1.00, lifeFraction);

    vec3 livingColor = rgbColor;

    float nirvanaHue  = mod(u_glucose * 360.0, 360.0);
    float radialDist  = length(v_uv - vec2(0.5));
    float radialGlow  = exp(-radialDist * radialDist / 0.10);

    float nirvanaPulse = 0.94 + 0.06 * sin(u_time * 0.25);
    float nirvanaBri  = (0.38 + 0.57 * radialGlow) * nirvanaPulse;
    float nirvanaSat  = 0.75 - 0.30 * radialGlow;
    vec3  nirvanaRadial = hsb2rgb(nirvanaHue, nirvanaSat, nirvanaBri);

    livingColor = mix(livingColor, nirvanaRadial, latePhase * liberated);

    float nirvanaProgress = clamp((u_totalYears - u_lifespanYears) / 0.5, 0.0, 1.0);

    float partnerArrival = smoothstep(0.0, 0.6, u_reanimationProgress) * (1.0 - liberated);
    float lifeRestores   = smoothstep(0.5, 1.0, u_reanimationProgress) * (1.0 - liberated);
    vec2 partnerOrigin = clamp(vec2(1.0) - cf4, 0.1, 0.9);
    vec2 partnerPos    = mix(partnerOrigin, vec2(0.5), partnerArrival);
    vec2 ownPos        = mix(cf4, vec2(0.5), partnerArrival * 0.6);
    float pGlow = exp(-dot(uv - partnerPos, uv - partnerPos) / 0.14);
    float oGlow = exp(-dot(uv - ownPos,     uv - ownPos)     / 0.14);
    vec3 meetingField = clamp(u_nirvanaRGB * oGlow + u_partnerRGB * pGlow * partnerArrival, 0.0, 1.0);

    vec3 nirvanaState = mix(u_nirvanaRGB * 0.90, meetingField, smoothstep(0.0, 0.5, u_reanimationProgress));

    nirvanaState = mix(nirvanaState, nirvanaRadial, liberated);

    vec3 finalColor = mix(livingColor, nirvanaState, nirvanaProgress);
    finalColor = mix(finalColor, rgbColor, lifeRestores);

    float edgeDist = min(min(v_uv.x, 1.0 - v_uv.x), min(v_uv.y, 1.0 - v_uv.y));
    float edgeGlow = exp(-edgeDist * edgeDist / 0.003);
    float voidBri = 0.03 + 1.00 * edgeGlow;
    float voidSat = 0.90 * edgeGlow;
    vec3 voidColor = hsb2rgb(nirvanaHue, voidSat, voidBri);
    finalColor = mix(finalColor, voidColor, u_voidProgress * liberated);

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}`;

function normalize(val, min, max) {
  if (max - min === 0) return 0.5;
  return (val - min) / (max - min);
}

function blendDatasets(a, b) {
  const blend = (x, y) => x * 0.70 + y * 0.30;
  const blended = {
    date: `blended`,
    ecg: {
      ventRate:    blend(a.ecg.ventRate,    b.ecg.ventRate),
      prInterval:  blend(a.ecg.prInterval,  b.ecg.prInterval),
      qrsInterval: blend(a.ecg.qrsInterval, b.ecg.qrsInterval),
      qtInterval:  blend(a.ecg.qtInterval,  b.ecg.qtInterval),
      qtcInterval: blend(a.ecg.qtcInterval, b.ecg.qtcInterval),
      pAxis:       blend(a.ecg.pAxis,       b.ecg.pAxis),
      rAxis:       blend(a.ecg.rAxis,       b.ecg.rAxis),
      tAxis:       blend(a.ecg.tAxis,       b.ecg.tAxis),
    },
    labs: {
      glucose:       blend(a.labs.glucose,       b.labs.glucose),
      nitrogen:      blend(a.labs.nitrogen,      b.labs.nitrogen),
      creatinine:    blend(a.labs.creatinine,    b.labs.creatinine),
      eGFR:          blend(a.labs.eGFR,          b.labs.eGFR),
      sodium:        blend(a.labs.sodium,        b.labs.sodium),
      potassium:     blend(a.labs.potassium,     b.labs.potassium),
      chloride:      blend(a.labs.chloride,      b.labs.chloride),
      carbonDioxide: blend(a.labs.carbonDioxide, b.labs.carbonDioxide),
      calcium:       blend(a.labs.calcium,       b.labs.calcium),
    },
    healthIndex: blend(a.healthIndex ?? 0.5, b.healthIndex ?? 0.5),
  };
  return blended;
}

function computeKarma(dataset, minMaxValues) {
  const nQTc       = normalize(dataset.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max);
  const nCreat     = normalize(dataset.labs.creatinine, minMaxValues.creatinine.min,  minMaxValues.creatinine.max);
  const nEGFR      = normalize(dataset.labs.eGFR,       minMaxValues.eGFR.min,        minMaxValues.eGFR.max);
  const nGlucose   = normalize(dataset.labs.glucose,    minMaxValues.glucose.min,     minMaxValues.glucose.max);
  const nVentRate  = normalize(dataset.ecg.ventRate,    minMaxValues.ventRate.min,    minMaxValues.ventRate.max);
  return nQTc * 0.35 + nCreat * 0.25 + (1 - nEGFR) * 0.20 + nGlucose * 0.15 + nVentRate * 0.05;
}

function getAgedDataset(startIdx, lifeFraction, allDatasets) {
  const span    = allDatasets.length * 0.20;
  const maxSpan = Math.max(0, allDatasets.length - 1 - startIdx);
  const pos     = startIdx + lifeFraction * Math.min(span, maxSpan);
  const lo      = Math.floor(pos);
  const hi      = Math.min(lo + 1, allDatasets.length - 1);
  const t       = pos - lo;
  if (lo === hi) return allDatasets[lo];
  const a = allDatasets[lo];
  const b = allDatasets[hi];
  const lerp = (x, y) => x + (y - x) * t;
  return {
    date: 'aged',
    ecg: {
      ventRate:    lerp(a.ecg.ventRate,    b.ecg.ventRate),
      prInterval:  lerp(a.ecg.prInterval,  b.ecg.prInterval),
      qrsInterval: lerp(a.ecg.qrsInterval, b.ecg.qrsInterval),
      qtInterval:  lerp(a.ecg.qtInterval,  b.ecg.qtInterval),
      qtcInterval: lerp(a.ecg.qtcInterval, b.ecg.qtcInterval),
      pAxis:       lerp(a.ecg.pAxis,       b.ecg.pAxis),
      rAxis:       lerp(a.ecg.rAxis,       b.ecg.rAxis),
      tAxis:       lerp(a.ecg.tAxis,       b.ecg.tAxis),
    },
    labs: {
      glucose:       lerp(a.labs.glucose,       b.labs.glucose),
      nitrogen:      lerp(a.labs.nitrogen,      b.labs.nitrogen),
      creatinine:    lerp(a.labs.creatinine,    b.labs.creatinine),
      eGFR:          lerp(a.labs.eGFR,          b.labs.eGFR),
      sodium:        lerp(a.labs.sodium,        b.labs.sodium),
      potassium:     lerp(a.labs.potassium,     b.labs.potassium),
      chloride:      lerp(a.labs.chloride,      b.labs.chloride),
      carbonDioxide: lerp(a.labs.carbonDioxide, b.labs.carbonDioxide),
      calcium:       lerp(a.labs.calcium,       b.labs.calcium),
    },
    healthIndex: lerp(a.healthIndex ?? 0.5, b.healthIndex ?? 0.5),
  };
}

function applyCollectionInfluence(dataset, allDatasets, lifeFraction, influence = 0.05) {
  const n      = allDatasets.length;
  const pull   = influence * lifeFraction;
  const lerp   = (x, y) => x + (y - x) * pull;
  const avgLab = (key) => allDatasets.reduce((s, d) => s + d.labs[key], 0) / n;
  const avgEcg = (key) => allDatasets.reduce((s, d) => s + d.ecg[key],  0) / n;
  return {
    date: dataset.date,
    ecg: {
      ventRate:    lerp(dataset.ecg.ventRate,    avgEcg('ventRate')),
      prInterval:  lerp(dataset.ecg.prInterval,  avgEcg('prInterval')),
      qrsInterval: lerp(dataset.ecg.qrsInterval, avgEcg('qrsInterval')),
      qtInterval:  lerp(dataset.ecg.qtInterval,  avgEcg('qtInterval')),
      qtcInterval: lerp(dataset.ecg.qtcInterval, avgEcg('qtcInterval')),
      pAxis:       lerp(dataset.ecg.pAxis,       avgEcg('pAxis')),
      rAxis:       lerp(dataset.ecg.rAxis,       avgEcg('rAxis')),
      tAxis:       lerp(dataset.ecg.tAxis,       avgEcg('tAxis')),
    },
    labs: {
      glucose:       lerp(dataset.labs.glucose,       avgLab('glucose')),
      nitrogen:      lerp(dataset.labs.nitrogen,      avgLab('nitrogen')),
      creatinine:    lerp(dataset.labs.creatinine,    avgLab('creatinine')),
      eGFR:          lerp(dataset.labs.eGFR,          avgLab('eGFR')),
      sodium:        lerp(dataset.labs.sodium,        avgLab('sodium')),
      potassium:     lerp(dataset.labs.potassium,     avgLab('potassium')),
      chloride:      lerp(dataset.labs.chloride,      avgLab('chloride')),
      carbonDioxide: lerp(dataset.labs.carbonDioxide, avgLab('carbonDioxide')),
      calcium:       lerp(dataset.labs.calcium,       avgLab('calcium')),
    },
    healthIndex: lerp(dataset.healthIndex ?? 0.5, allDatasets.reduce((s, d) => s + (d.healthIndex ?? 0.5), 0) / n),
  };
}

function computeLiberationThreshold(allDatasets, minMaxValues) {
  const sorted = allDatasets
    .map(d => computeKarma(d, minMaxValues))
    .sort((a, b) => a - b);
  return sorted[Math.floor(0.25 * sorted.length)];
}

let healthDataSets = [
  {
    date: "2018-07-16",
    ecg: {
      ventRate: 65,
      prInterval: 166,
      qrsInterval: 82,
      qtInterval: 412,
      qtcInterval: 428,
      pAxis: 77,
      rAxis: 86,
      tAxis: 78,
    },
    labs: {
      glucose: 127,
      nitrogen: 20,
      creatinine: 0.62,
      eGFR: 115,
      sodium: 138,
      potassium: 4.1,
      chloride: 104,
      carbonDioxide: 24,
      calcium: 9.2,
    },
  },
  {
    date: "2018-10-04",
    ecg: {
      ventRate: 60,
      prInterval: 158,
      qrsInterval: 85,
      qtInterval: 428,
      qtcInterval: 428,
      pAxis: 49,
      rAxis: 76,
      tAxis: 58,
    },
    labs: {
      glucose: 105,
      nitrogen: 16,
      creatinine: 0.58,
      eGFR: 118,
      sodium: 140,
      potassium: 4.1,
      chloride: 107,
      carbonDioxide: 25,
      calcium: 9.1,
    },
  },
  {
    date: "2019-01-24",
    ecg: {
      ventRate: 60,
      prInterval: 152,
      qrsInterval: 86,
      qtInterval: 404,
      qtcInterval: 404,
      pAxis: 64,
      rAxis: 72,
      tAxis: 46,
    },
    labs: {
      glucose: 104,
      nitrogen: 16,
      creatinine: 0.64,
      eGFR: 114,
      sodium: 140,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 27,
      calcium: 9.4,
    },
  },
  {
    date: "2019-04-24",
    ecg: {
      ventRate: 63,
      prInterval: 149,
      qrsInterval: 72,
      qtInterval: 417,
      qtcInterval: 427,
      pAxis: 62,
      rAxis: 72,
      tAxis: 42,
    },
    labs: {
      glucose: 103,
      nitrogen: 15,
      creatinine: 0.63,
      eGFR: 115,
      sodium: 139,
      potassium: 4.4,
      chloride: 104,
      carbonDioxide: 26,
      calcium: 9.2,
    },
  },
  {
    date: "2019-07-31",
    ecg: {
      ventRate: 59,
      prInterval: 166,
      qrsInterval: 80,
      qtInterval: 412,
      qtcInterval: 408,
      pAxis: 61,
      rAxis: 77,
      tAxis: 48,
    },
    labs: {
      glucose: 105,
      nitrogen: 15,
      creatinine: 0.57,
      eGFR: 118,
      sodium: 139,
      potassium: 4.5,
      chloride: 105,
      carbonDioxide: 26,
      calcium: 9.3,
    },
  },
  {
    date: "2020-02-07",
    ecg: {
      ventRate: 78,
      prInterval: 164,
      qrsInterval: 85,
      qtInterval: 383,
      qtcInterval: 436,
      pAxis: 74,
      rAxis: 98,
      tAxis: 65,
    },
    labs: {
      glucose: 124,
      nitrogen: 17,
      creatinine: 0.69,
      eGFR: 110,
      sodium: 138,
      potassium: 4.2,
      chloride: 107,
      carbonDioxide: 24,
      calcium: 8.8,
    },
  },
  {
    date: "2020-02-28",
    ecg: {
      ventRate: 75,
      prInterval: 142,
      qrsInterval: 89,
      qtInterval: 377,
      qtcInterval: 421,
      pAxis: 54,
      rAxis: 93,
      tAxis: 55,
    },
    labs: {
      glucose: 116,
      nitrogen: 19,
      creatinine: 0.75,
      eGFR: 113,
      sodium: 136,
      potassium: 4.0,
      chloride: 109,
      carbonDioxide: 21,
      calcium: 9.5,
    },
  },
  {
    date: "2020-03-13",
    ecg: {
      ventRate: 101,
      prInterval: 136,
      qrsInterval: 82,
      qtInterval: 343,
      qtcInterval: 401,
      pAxis: 54,
      rAxis: 88,
      tAxis: 38,
    },
    labs: {
      glucose: 115,
      nitrogen: 18,
      creatinine: 0.75,
      eGFR: 107,
      sodium: 137,
      potassium: 4.1,
      chloride: 108,
      carbonDioxide: 22,
      calcium: 8.8,
    },
  },
  {
    date: "2020-05-22",
    ecg: {
      ventRate: 70,
      prInterval: 166,
      qrsInterval: 88,
      qtInterval: 370,
      qtcInterval: 399,
      pAxis: 69,
      rAxis: 79,
      tAxis: 51,
    },
    labs: {
      glucose: 117,
      nitrogen: 15,
      creatinine: 0.75,
      eGFR: 101,
      sodium: 140,
      potassium: 4.2,
      chloride: 107,
      carbonDioxide: 26,
      calcium: 9.6,
    },
  },
  {
    date: "2020-08-11",
    ecg: {
      ventRate: 75,
      prInterval: 164,
      qrsInterval: 86,
      qtInterval: 389,
      qtcInterval: 434,
      pAxis: 61,
      rAxis: 81,
      tAxis: 50,
    },
    labs: {
      glucose: 127,
      nitrogen: 17,
      creatinine: 0.75,
      eGFR: 100,
      sodium: 140,
      potassium: 3.7,
      chloride: 108,
      carbonDioxide: 22,
      calcium: 9.3,
    },
  },
  {
    date: "2020-11-12",
    ecg: {
      ventRate: 83,
      prInterval: 147,
      qrsInterval: 84,
      qtInterval: 372,
      qtcInterval: 437,
      pAxis: 48,
      rAxis: 70,
      tAxis: 31,
    },
    labs: {
      glucose: 118,
      nitrogen: 16,
      creatinine: 0.69,
      eGFR: 110,
      sodium: 137,
      potassium: 4.3,
      chloride: 106,
      carbonDioxide: 23,
      calcium: 9.4,
    },
  },
  {
    date: "2021-02-24",
    ecg: {
      ventRate: 64,
      prInterval: 168,
      qrsInterval: 94,
      qtInterval: 413,
      qtcInterval: 426,
      pAxis: 68,
      rAxis: 89,
      tAxis: 43,
    },
    labs: {
      glucose: 103,
      nitrogen: 14,
      creatinine: 0.79,
      eGFR: 94,
      sodium: 139,
      potassium: 4.5,
      chloride: 106,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2021-09-01",
    ecg: {
      ventRate: 67,
      prInterval: 149,
      qrsInterval: 80,
      qtInterval: 388,
      qtcInterval: 410,
      pAxis: 66,
      rAxis: 77,
      tAxis: 49,
    },
    labs: {
      glucose: 117,
      nitrogen: 9,
      creatinine: 0.62,
      eGFR: 113,
      sodium: 140,
      potassium: 4.4,
      chloride: 107,
      carbonDioxide: 22,
      calcium: 9.4,
    },
  },
  {
    date: "2021-12-01",
    ecg: {
      ventRate: 67,
      prInterval: 150,
      qrsInterval: 83,
      qtInterval: 386,
      qtcInterval: 402,
      pAxis: 54,
      rAxis: 70,
      tAxis: 31,
    },
    labs: {
      glucose: 120,
      nitrogen: 11,
      creatinine: 0.72,
      eGFR: 105,
      sodium: 138,
      potassium: 4.2,
      chloride: 105,
      carbonDioxide: 22,
      calcium: 9.5,
    },
  },
  {
    date: "2022-02-14",
    ecg: {
      ventRate: 69,
      prInterval: 166,
      qrsInterval: 87,
      qtInterval: 385,
      qtcInterval: 404,
      pAxis: 59,
      rAxis: 68,
      tAxis: 30,
    },
    labs: {
      glucose: 129,
      nitrogen: 12,
      creatinine: 0.69,
      eGFR: 109,
      sodium: 142,
      potassium: 3.9,
      chloride: 109,
      carbonDioxide: 23,
      calcium: 9,
    },
  },
  {
    date: "2022-05-13",
    ecg: {
      ventRate: 63,
      prInterval: 156,
      qrsInterval: 85,
      qtInterval: 404,
      qtcInterval: 411,
      pAxis: 65,
      rAxis: 75,
      tAxis: 47,
    },
    labs: {
      glucose: 160,
      nitrogen: 11,
      creatinine: 0.76,
      eGFR: 98,
      sodium: 139,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2022-08-25",
    ecg: {
      ventRate: 59,
      prInterval: 141,
      qrsInterval: 81,
      qtInterval: 436,
      qtcInterval: 435,
      pAxis: 48,
      rAxis: 69,
      tAxis: 41,
    },
    labs: {
      glucose: 112,
      nitrogen: 13,
      creatinine: 0.68,
      eGFR: 112,
      sodium: 139,
      potassium: 4.5,
      chloride: 108,
      carbonDioxide: 24,
      calcium: 9.4,
    },
  },
  {
    date: "2023-06-12",
    ecg: {
      ventRate: 57,
      prInterval: 161,
      qrsInterval: 85,
      qtInterval: 420,
      qtcInterval: 414,
      pAxis: 76,
      rAxis: 90,
      tAxis: 76,
    },
    labs: {
      glucose: 118,
      nitrogen: 14,
      creatinine: 0.6,
      eGFR: 115,
      sodium: 137,
      potassium: 3.7,
      chloride: 106,
      carbonDioxide: 26,
      calcium: 8.9,
    },
  },
  {
    date: "2023-09-05",
    ecg: {
      ventRate: 58,
      prInterval: 149,
      qrsInterval: 90,
      qtInterval: 427,
      qtcInterval: 424,
      pAxis: 69,
      rAxis: 88,
      tAxis: 60,
    },
    labs: {
      glucose: 116,
      nitrogen: 12,
      creatinine: 0.55,
      eGFR: 117,
      sodium: 142,
      potassium: 4,
      chloride: 113,
      carbonDioxide: 20,
      calcium: 9.2,
    },
  },
  {
    date: "2023-12-05",
    ecg: {
      ventRate: 54,
      prInterval: 153,
      qrsInterval: 83,
      qtInterval: 420,
      qtcInterval: 407,
      pAxis: 52,
      rAxis: 72,
      tAxis: 47,
    },
    labs: {
      glucose: 115,
      nitrogen: 14,
      creatinine: 0.58,
      eGFR: 116,
      sodium: 138,
      potassium: 4.1,
      chloride: 107,
      carbonDioxide: 22,
      calcium: 9.1,
    },
  },
  {
    date: "2024-02-05",
    ecg: {
      ventRate: 52,
      prInterval: 150,
      qrsInterval: 86,
      qtInterval: 453,
      qtcInterval: 433,
      pAxis: 72,
      rAxis: 69,
      tAxis: 55,
    },
    labs: {
      glucose: 117,
      nitrogen: 19,
      creatinine: 0.61,
      eGFR: 114,
      sodium: 139,
      potassium: 4.1,
      chloride: 110,
      carbonDioxide: 23,
      calcium: 9.1,
    },
  },
  {
    date: "2024-06-10",
    ecg: {
      ventRate: 57,
      prInterval: 152,
      qrsInterval: 85,
      qtInterval: 414,
      qtcInterval: 408,
      pAxis: 71,
      rAxis: 86,
      tAxis: 56,
    },
    labs: {
      glucose: 97,
      nitrogen: 12,
      creatinine: 0.66,
      eGFR: 112,
      sodium: 138,
      potassium: 4.1,
      chloride: 105,
      carbonDioxide: 22,
      calcium: 9.2,
    },
  },
  {
    date: "2024-09-16",
    ecg: {
      ventRate: 68,
      prInterval: 163,
      qrsInterval: 82,
      qtInterval: 389,
      qtcInterval: 407,
      pAxis: 80,
      rAxis: 93,
      tAxis: 67,
    },
    labs: {
      glucose: 103,
      nitrogen: 16,
      creatinine: 0.59,
      eGFR: 115,
      sodium: 137,
      potassium: 4.3,
      chloride: 106,
      carbonDioxide: 23,
      calcium: 9,
    },
  },
  {
    date: "2024-12-30",
    ecg: {
      ventRate: 63,
      prInterval: 155,
      qrsInterval: 86,
      qtInterval: 431,
      qtcInterval: 438,
      pAxis: 73,
      rAxis: 87,
      tAxis: 67,
    },
    labs: {
      glucose: 109,
      nitrogen: 15,
      creatinine: 0.62,
      eGFR: 113,
      sodium: 138,
      potassium: 4.3,
      chloride: 105,
      carbonDioxide: 23,
      calcium: 9.4,
    },
  },
  {
    date: "2025-03-26",
    ecg: {
      ventRate: 54,
      prInterval: 147,
      qrsInterval: 86,
      qtInterval: 448,
      qtcInterval: 433,
      pAxis: 148,
      rAxis: 143,
      tAxis: 142,
    },
    labs: {
      glucose: 100,
      nitrogen: 11,
      creatinine: 0.68,
      eGFR: 111,
      sodium: 138,
      potassium: 4.2,
      chloride: 107,
      carbonDioxide: 24,
      calcium: 9.3,
    },
  },
  {
    date: "2025-06-18",
    ecg: {
      ventRate: 51,
      prInterval: 156,
      qrsInterval: 80,
      qtInterval: 459,
      qtcInterval: 435,
      pAxis: 77,
      rAxis: 80,
      tAxis: 74,
    },
    labs: {
      glucose: 108,
      nitrogen: 16,
      creatinine: 0.71,
      eGFR: 107,
      sodium: 137,
      potassium: 4.2,
      chloride: 106,
      carbonDioxide: 24,
      calcium: 8.8,
    },
  },
  {
    date: "2025-09-12",
    ecg: {
      ventRate: 58,
      prInterval: 157,
      qrsInterval: 89,
      qtInterval: 419,
      qtcInterval: 417,
      pAxis: 84,
      rAxis: 95,
      tAxis: 75,
    },
    labs: {
      glucose: 108,
      nitrogen: 11,
      creatinine: 0.54,
      eGFR: 116,
      sodium: 137,
      potassium: 4.0,
      chloride: 106,
      carbonDioxide: 22,
      calcium: 9.0,
    },
  },
  {
    date: "2025-12-11",
    ecg: {
      ventRate: 60,
      prInterval: 164,
      qrsInterval: 86,
      qtInterval: 415,
      qtcInterval: 416,
      pAxis: 64,
      rAxis: 87,
      tAxis: 74,
    },
    labs: {
      glucose: 119,
      nitrogen: 17,
      creatinine: 0.66,
      eGFR: 111,
      sodium: 141,
      potassium: 4.3,
      chloride: 106,
      carbonDioxide: 25,
      calcium: 9.3,
    },
  },
  {
    date: "2026-03-20",
    ecg: {
      ventRate: 66,
      prInterval: 162,
      qrsInterval: 87,
      qtInterval: 385,
      qtcInterval: 399,
      pAxis: 68,
      rAxis: 85,
      tAxis: 52,
    },
    labs: {
      glucose: 117,
      nitrogen: 16,
      creatinine: 0.70,
      eGFR: 109,
      sodium: 139,
      potassium: 4.2,
      chloride: 109,
      carbonDioxide: 21,
      calcium: 9.1,
    },
  },
];

healthDataSets.sort((a, b) => {
  return new Date(a.date) - new Date(b.date);
});

let minMaxValues = {
  ventRate: { min: Infinity, max: -Infinity },
  prInterval: { min: Infinity, max: -Infinity },
  qrsInterval: { min: Infinity, max: -Infinity },
  qtInterval: { min: Infinity, max: -Infinity },
  qtcInterval: { min: Infinity, max: -Infinity },
  pAxis: { min: Infinity, max: -Infinity },
  rAxis: { min: Infinity, max: -Infinity },
  tAxis: { min: Infinity, max: -Infinity },
  glucose: { min: Infinity, max: -Infinity },
  nitrogen: { min: Infinity, max: -Infinity },
  creatinine: { min: Infinity, max: -Infinity },
  eGFR: { min: Infinity, max: -Infinity },
  sodium: { min: Infinity, max: -Infinity },
  potassium: { min: Infinity, max: -Infinity },
  chloride: { min: Infinity, max: -Infinity },
  carbonDioxide: { min: Infinity, max: -Infinity },
  calcium: { min: Infinity, max: -Infinity },
};

healthDataSets.forEach((dataSet) => {

  minMaxValues.ventRate.min = Math.min(
    minMaxValues.ventRate.min,
    dataSet.ecg.ventRate
  );
  minMaxValues.ventRate.max = Math.max(
    minMaxValues.ventRate.max,
    dataSet.ecg.ventRate
  );

  minMaxValues.prInterval.min = Math.min(
    minMaxValues.prInterval.min,
    dataSet.ecg.prInterval
  );
  minMaxValues.prInterval.max = Math.max(
    minMaxValues.prInterval.max,
    dataSet.ecg.prInterval
  );

  minMaxValues.qrsInterval.min = Math.min(
    minMaxValues.qrsInterval.min,
    dataSet.ecg.qrsInterval
  );
  minMaxValues.qrsInterval.max = Math.max(
    minMaxValues.qrsInterval.max,
    dataSet.ecg.qrsInterval
  );

  minMaxValues.qtInterval.min = Math.min(
    minMaxValues.qtInterval.min,
    dataSet.ecg.qtInterval
  );
  minMaxValues.qtInterval.max = Math.max(
    minMaxValues.qtInterval.max,
    dataSet.ecg.qtInterval
  );

  minMaxValues.qtcInterval.min = Math.min(
    minMaxValues.qtcInterval.min,
    dataSet.ecg.qtcInterval
  );
  minMaxValues.qtcInterval.max = Math.max(
    minMaxValues.qtcInterval.max,
    dataSet.ecg.qtcInterval
  );

  minMaxValues.pAxis.min = Math.min(minMaxValues.pAxis.min, dataSet.ecg.pAxis);
  minMaxValues.pAxis.max = Math.max(minMaxValues.pAxis.max, dataSet.ecg.pAxis);

  minMaxValues.rAxis.min = Math.min(minMaxValues.rAxis.min, dataSet.ecg.rAxis);
  minMaxValues.rAxis.max = Math.max(minMaxValues.rAxis.max, dataSet.ecg.rAxis);

  minMaxValues.tAxis.min = Math.min(minMaxValues.tAxis.min, dataSet.ecg.tAxis);
  minMaxValues.tAxis.max = Math.max(minMaxValues.tAxis.max, dataSet.ecg.tAxis);

  minMaxValues.glucose.min = Math.min(
    minMaxValues.glucose.min,
    dataSet.labs.glucose
  );
  minMaxValues.glucose.max = Math.max(
    minMaxValues.glucose.max,
    dataSet.labs.glucose
  );

  minMaxValues.nitrogen.min = Math.min(
    minMaxValues.nitrogen.min,
    dataSet.labs.nitrogen
  );
  minMaxValues.nitrogen.max = Math.max(
    minMaxValues.nitrogen.max,
    dataSet.labs.nitrogen
  );

  minMaxValues.creatinine.min = Math.min(
    minMaxValues.creatinine.min,
    dataSet.labs.creatinine
  );
  minMaxValues.creatinine.max = Math.max(
    minMaxValues.creatinine.max,
    dataSet.labs.creatinine
  );

  minMaxValues.eGFR.min = Math.min(minMaxValues.eGFR.min, dataSet.labs.eGFR);
  minMaxValues.eGFR.max = Math.max(minMaxValues.eGFR.max, dataSet.labs.eGFR);

  minMaxValues.sodium.min = Math.min(
    minMaxValues.sodium.min,
    dataSet.labs.sodium
  );
  minMaxValues.sodium.max = Math.max(
    minMaxValues.sodium.max,
    dataSet.labs.sodium
  );

  minMaxValues.potassium.min = Math.min(
    minMaxValues.potassium.min,
    dataSet.labs.potassium
  );
  minMaxValues.potassium.max = Math.max(
    minMaxValues.potassium.max,
    dataSet.labs.potassium
  );

  minMaxValues.chloride.min = Math.min(
    minMaxValues.chloride.min,
    dataSet.labs.chloride
  );
  minMaxValues.chloride.max = Math.max(
    minMaxValues.chloride.max,
    dataSet.labs.chloride
  );

  minMaxValues.carbonDioxide.min = Math.min(
    minMaxValues.carbonDioxide.min,
    dataSet.labs.carbonDioxide
  );
  minMaxValues.carbonDioxide.max = Math.max(
    minMaxValues.carbonDioxide.max,
    dataSet.labs.carbonDioxide
  );

  minMaxValues.calcium.min = Math.min(
    minMaxValues.calcium.min,
    dataSet.labs.calcium
  );
  minMaxValues.calcium.max = Math.max(
    minMaxValues.calcium.max,
    dataSet.labs.calcium
  );
});

function calculateHealthIndex(data) {
  const nQTc  = normalize(data.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max);
  const nEGFR = normalize(data.labs.eGFR,       minMaxValues.eGFR.min,        minMaxValues.eGFR.max);
  const nCr   = normalize(data.labs.creatinine,  minMaxValues.creatinine.min,  minMaxValues.creatinine.max);
  const nVent = normalize(data.ecg.ventRate,     minMaxValues.ventRate.min,    minMaxValues.ventRate.max);
  const nK    = normalize(data.labs.potassium,   minMaxValues.potassium.min,   minMaxValues.potassium.max);
  const nCO2  = normalize(data.labs.carbonDioxide, minMaxValues.carbonDioxide.min, minMaxValues.carbonDioxide.max);
  const nQRS  = normalize(data.ecg.qrsInterval,  minMaxValues.qrsInterval.min, minMaxValues.qrsInterval.max);

  return (
    (1 - nQTc)  * 0.30 +
    nEGFR       * 0.25 +
    (1 - nCr)   * 0.15 +
    (1 - nVent) * 0.10 +
    nK          * 0.07 +
    nCO2        * 0.07 +
    (1 - nQRS)  * 0.06
  );
}

healthDataSets.forEach((dataSet) => {
  dataSet.healthIndex = calculateHealthIndex(dataSet);
});

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");
if (!gl) {
  alert("WebGL2 is not available in your browser.");
}

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

function lifespanYearsFromHashDigits(x /* 0..99 */) {

  const t = x / 99;
  const a = 3, b = 100, c = 28;
  const F_c = (c - a) / (b - a);
  if (t <= F_c) {
    return a + Math.sqrt(t * (b - a) * (c - a));
  } else {
    return b - Math.sqrt((1 - t) * (b - a) * (b - c));
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapDeg(h) {
  return ((h % 360) + 360) % 360;
}

function guardHueGap(baseDeg, candDeg, minGapDeg, pushSign) {
  baseDeg = wrapDeg(baseDeg);
  candDeg = wrapDeg(candDeg);
  const diff = Math.abs(((candDeg - baseDeg + 540) % 360) - 180);
  if (diff < minGapDeg)
    candDeg = wrapDeg(candDeg + pushSign * (minGapDeg - diff));
  return candDeg;
}

function sodiumArrivalProgress(totalYears, lifespanYears) {
  const start = 0.2 * lifespanYears;
  const ramp = Math.max(0.1 * lifespanYears, 0.25);
  return clamp((totalYears - start) / ramp, 0, 1);
}

function sodiumTempoSeconds(ds) {
  const vMin = minMaxValues.ventRate.min;
  const vMax = minMaxValues.ventRate.max;
  const nVR = clamp(
    (ds.ecg.ventRate - vMin) / Math.max(1e-6, vMax - vMin),
    0,
    1
  );

  return 10 - 5.5 * nVR;
}

function sodiumPulseCount(ds) {
  const qMin = minMaxValues.qrsInterval.min;
  const qMax = minMaxValues.qrsInterval.max;
  const nQRS = clamp(
    (ds.ecg.qrsInterval - qMin) / Math.max(1e-6, qMax - qMin),
    0,
    1
  );
  const k = Math.round(3 + (1 - nQRS) * 3);
  return Math.max(3, Math.min(6, k));
}

function sodiumPhaseSeed(hashTail /* 0..99 */) {
  return hashTail / 99 + 0.57;
}

function sodiumPulseShape(phase01, k, width = 0.12) {
  let acc = 0.0;
  for (let i = 0; i < k; i++) {
    const c = (i + 0.5) / k;
    const d = Math.min(Math.abs(phase01 - c), 1 - Math.abs(phase01 - c));
    const g = Math.exp(-0.5 * Math.pow(d / Math.max(1e-3, width), 2));
    acc += g;
  }
  acc /= k;
  return 0.25 + 0.75 * acc;
}

function sodiumAmplitude(ds, healthIndex, arrivalProgress, pNa /* 0..1 */) {
  const base = 0.08 + 0.12 * clamp(pNa, 0, 1);
  const healthMul = 0.85 + 0.15 * (1 - clamp(healthIndex ?? 0.5, 0, 1));
  return arrivalProgress * base * healthMul;
}

function sodiumHueDeg(baseHueDeg, ds, pNa /* 0..1 */) {
  const targetOffset = -25 + 50 * clamp(pNa, 0, 1);
  let hue = baseHueDeg + targetOffset;

  const wrap = (h) => ((h % 360) + 360) % 360;
  const base = wrap(baseHueDeg);
  let cand = wrap(hue);
  let diff = Math.abs(((cand - base + 540) % 360) - 180);

  if (diff < 36) {
    const push = (32 - diff) * Math.sign(targetOffset || 1);
    cand = wrap(cand + push);
  }
  return cand;
}

function chlorideArrivalProgress(totalYears, lifespanYears) {
  const start = 0.6 * lifespanYears;
  const ramp = Math.max(0.08 * lifespanYears, 0.2);
  return clamp((totalYears - start) / ramp, 0, 1);
}

function chlorideTempoSeconds(ds) {
  const qMin = minMaxValues.qtInterval.min,
    qMax = minMaxValues.qtInterval.max;
  const nQT = clamp(
    (ds.ecg.qtInterval - qMin) / Math.max(1e-6, qMax - qMin),
    0,
    1
  );
  return 11 - 5.5 * nQT;
}

function chloridePhaseSeed(hashTail /* 0..99 */) {
  return (hashTail / 99 + 0.11) % 1;
}

function chlorideTriWithWarble(phase01, ds) {
  const tri = 1.0 - Math.abs(2.0 * (phase01 - Math.floor(phase01 + 0.5)));
  const tMin = minMaxValues.tAxis.min,
    tMax = minMaxValues.tAxis.max;
  const nT = clamp((ds.ecg.tAxis - tMin) / Math.max(1e-6, tMax - tMin), 0, 1);
  const wf = 1.6 + 2.2 * nT;
  const war = 0.92 + 0.08 * Math.sin(2 * Math.PI * (phase01 * wf));
  return clamp(tri * war, 0, 1);
}

function chlorideAmplitude(ds, healthIndex, arrCl, pCl /* 0..1 */) {
  const base = 0.09 + 0.13 * clamp(pCl, 0, 1);
  const healthMul = 0.9 + 0.1 * (1 - (healthIndex ?? 0.5));
  return arrCl * base * healthMul;
}

function chlorideHueDeg(baseHueDeg, pCl /* 0..1 */) {
  const wrap = (h) => ((h % 360) + 360) % 360;
  const base = wrap(baseHueDeg);
  const targetOffset = -20 + 40 * clamp(pCl, 0, 1);
  let cand = wrap(base + targetOffset);
  const diff = Math.abs(((cand - base + 540) % 360) - 180);
  if (diff < 32) {
    const push = 32 - diff;
    cand = wrap(cand + Math.sign(targetOffset || 1) * push);
  }
  return cand;
}

function cborDecode(hex) {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  let i = 0;
  function read() {
    const b = bytes[i++];
    const mt = b >> 5, ai = b & 0x1f;

    if (mt === 7 && ai === 25) { const v = (bytes[i] << 8) | bytes[i+1]; i += 2; const e = (v >> 10) & 0x1f, m = v & 0x3ff, s = v >> 15 ? -1 : 1; return s * (e === 31 ? (m ? NaN : Infinity) : e === 0 ? m * 5.9604644775e-8 : Math.pow(2, e - 15) * (1 + m / 1024)); }
    if (mt === 7 && ai === 26) { const dv = new DataView(bytes.buffer, i, 4); i += 4; return dv.getFloat32(0, false); }
    if (mt === 7 && ai === 27) { const dv = new DataView(bytes.buffer, i, 8); i += 8; return dv.getFloat64(0, false); }

    let n = ai;
    if (ai === 24) n = bytes[i++];
    else if (ai === 25) { n = (bytes[i] << 8) | bytes[i+1]; i += 2; }
    else if (ai === 26) { n = ((bytes[i] * 16777216) + (bytes[i+1] << 16) + (bytes[i+2] << 8) + bytes[i+3]); i += 4; }
    else if (ai === 27) { i += 8; n = 0; }
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const sl = bytes.slice(i, i + n); i += n; return sl; }
      case 3: { let s = '', e = i + n; while (i < e) { const c = bytes[i++]; if (c < 0x80) s += String.fromCharCode(c); else if (c < 0xE0) s += String.fromCharCode((c & 0x1F) << 6 | bytes[i++] & 0x3F); else { const b2 = bytes[i++]; s += String.fromCharCode((c & 0x0F) << 12 | (b2 & 0x3F) << 6 | bytes[i++] & 0x3F); } } return s; }
      case 4: { const arr = []; for (let k = 0; k < n; k++) arr.push(read()); return arr; }
      case 5: { const obj = {}; for (let k = 0; k < n; k++) { const key = read(); obj[key] = read(); } return obj; }
      case 6: return read();
      case 7: { if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; return undefined; }
    }
  }
  return read();
}

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

  gl.deleteShader(vShader);
  gl.deleteShader(fShader);

  return program;
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

async function init() {

  resizeCanvasToDisplaySize(canvas);
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas);
    draw();
  });

  const vertexSrc   = _vertSrc;
  const fragmentSrc = _fragSrc;
  const program = createProgram(gl, vertexSrc, fragmentSrc);
  gl.useProgram(program);

  const positionAttribLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  gl.enableVertexAttribArray(positionAttribLocation);
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);

  const uTimeLoc = gl.getUniformLocation(program, "u_time");
  const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const uGlucoseLoc = gl.getUniformLocation(program, "u_glucose");
  const uPotassiumLoc = gl.getUniformLocation(program, "u_potassium");
  const uEgfrLoc = gl.getUniformLocation(program, "u_eGFR");
  const uTotalYearsLoc = gl.getUniformLocation(program, "u_totalYears");
  const uLifespanYearsLoc = gl.getUniformLocation(program, "u_lifespanYears");

  const uNitrogenStrengthLoc = gl.getUniformLocation(
    program,
    "u_nitrogenStrength"
  );
  const uNitrogenHueDegLoc = gl.getUniformLocation(program, "u_nitrogenHueDeg");
  const uCreatinineStrengthLoc = gl.getUniformLocation(
    program,
    "u_creatinineStrength"
  );
  const uCreatinineHueDegLoc = gl.getUniformLocation(
    program,
    "u_creatinineHueDeg"
  );
  const uSodiumStrengthLoc = gl.getUniformLocation(program, "u_sodiumStrength");
  const uSodiumHueDegLoc = gl.getUniformLocation(program, "u_sodiumHueDeg");
  const uChlorideStrength = gl.getUniformLocation(
    program,
    "u_chlorideStrength"
  );
  const uChlorideHueDeg = gl.getUniformLocation(program, "u_chlorideHueDeg");
  const uCo2StrengthLoc = gl.getUniformLocation(program, "u_co2Strength");
  const uCo2HueDegLoc = gl.getUniformLocation(program, "u_co2HueDeg");
  const uCalciumStrengthLoc = gl.getUniformLocation(
    program,
    "u_calciumStrength"
  );
  const uCalciumHueDegLoc = gl.getUniformLocation(program, "u_calciumHueDeg");
  const uPAxisNormLoc = gl.getUniformLocation(program, "u_pAxisNorm");
  const uRAxisNormLoc = gl.getUniformLocation(program, "u_rAxisNorm");
  const uQtcNormLoc = gl.getUniformLocation(program, "u_qtcNorm");
  const uQtcPercentileLoc = gl.getUniformLocation(program, "u_qtcPercentile");
  const uPAxisPctLoc = gl.getUniformLocation(program, "u_pAxisPct");
  const uRAxisPctLoc = gl.getUniformLocation(program, "u_rAxisPct");
  const uTAxisPctLoc = gl.getUniformLocation(program, "u_tAxisPct");
  const uPrNormLoc = gl.getUniformLocation(program, "u_prNorm");
  const uVentRateNormLoc = gl.getUniformLocation(program, "u_ventRateNorm");
  const uTAxisNormLoc = gl.getUniformLocation(program, "u_tAxisNorm");
  const uQrsNormLoc       = gl.getUniformLocation(program, "u_qrsNorm");
  const uCo2NormLoc       = gl.getUniformLocation(program, "u_co2Norm");
  const uQrsTAngleLoc     = gl.getUniformLocation(program, "u_qrsTAngle");
  const uVentRatePctLoc   = gl.getUniformLocation(program, "u_ventRatePct");
  const uPrPctLoc         = gl.getUniformLocation(program, "u_prPct");
  const uQrsPctLoc        = gl.getUniformLocation(program, "u_qrsPct");
  const uQrsTAnglePctLoc  = gl.getUniformLocation(program, "u_qrsTAnglePct");
  const uInheritedHueDegLoc = gl.getUniformLocation(program, "u_inheritedHueDeg");
  const uInheritedStrengthLoc = gl.getUniformLocation(program, "u_inheritedStrength");
  const uReanimationProgressLoc    = gl.getUniformLocation(program, "u_reanimationProgress");
  const uPartnerInheritedHueDegLoc = gl.getUniformLocation(program, "u_partnerInheritedHueDeg");
  const uIsLiberatedLoc            = gl.getUniformLocation(program, "u_isLiberated");
  const uVoidProgressLoc           = gl.getUniformLocation(program, "u_voidProgress");

  const uNitrogenRadiusLoc   = gl.getUniformLocation(program, "u_nitrogenRadius");
  const uCreatinineRadiusLoc = gl.getUniformLocation(program, "u_creatinineRadius");
  const uSodiumRadiusLoc     = gl.getUniformLocation(program, "u_sodiumRadius");
  const uChlorideRadiusLoc   = gl.getUniformLocation(program, "u_chlorideRadius");
  const uCalciumRadiusLoc    = gl.getUniformLocation(program, "u_calciumRadius");
  const uBunCreatRatioNormLoc = gl.getUniformLocation(program, "u_bunCreatRatioNorm");

  const uNitrogenRGBLoc  = gl.getUniformLocation(program, "u_nitrogenRGB");
  const uCreatRGBLoc     = gl.getUniformLocation(program, "u_creatRGB");
  const uSodiumRGBLoc    = gl.getUniformLocation(program, "u_sodiumRGB");
  const uChlorideRGBLoc  = gl.getUniformLocation(program, "u_chlorideRGB");
  const uCo2RGBLoc       = gl.getUniformLocation(program, "u_co2RGB");
  const uCalciumRGBLoc   = gl.getUniformLocation(program, "u_calciumRGB");
  const uNirvanaRGBLoc   = gl.getUniformLocation(program, "u_nirvanaRGB");
  const uPartnerRGBLoc   = gl.getUniformLocation(program, "u_partnerRGB");

  const allBunCreatRatios = healthDataSets
    .map((d) => d.labs.nitrogen / Math.max(0.1, d.labs.creatinine))
    .slice()
    .sort((a, b) => a - b);
  const bunCreatP05 = allBunCreatRatios[Math.floor(0.05 * (allBunCreatRatios.length - 1))];
  const bunCreatP95 = allBunCreatRatios[Math.ceil(0.95 * (allBunCreatRatios.length - 1))];
  const sortedQtcValues = healthDataSets.map((d) => d.ecg.qtcInterval).sort((a, b) => a - b);
  const sortedPAxisValues     = healthDataSets.map((d) => d.ecg.pAxis).sort((a, b) => a - b);
  const sortedRAxisValues     = healthDataSets.map((d) => d.ecg.rAxis).sort((a, b) => a - b);
  const sortedTAxisValues     = healthDataSets.map((d) => d.ecg.tAxis).sort((a, b) => a - b);
  const sortedVentRateValues  = healthDataSets.map((d) => d.ecg.ventRate).sort((a, b) => a - b);
  const sortedPRValues        = healthDataSets.map((d) => d.ecg.prInterval).sort((a, b) => a - b);
  const sortedQRSValues       = healthDataSets.map((d) => d.ecg.qrsInterval).sort((a, b) => a - b);

  const allQrsTAngles = healthDataSets.map((d) => Math.abs(d.ecg.rAxis - d.ecg.tAxis));
  const qrsTAngleMin = Math.min(...allQrsTAngles);
  const qrsTAngleMax = Math.max(...allQrsTAngles);
  const sortedQRSTAngleValues = [...allQrsTAngles].sort((a, b) => a - b);

  let currentDataSetIndex      = /*BAKE:DATASET_INDEX*/5;
  let lastTwoHashDigits        = /*BAKE:HASH_DIGITS*/88;
  let inscriptionUnixSeconds   = /*BAKE:INSCRIPTION_UNIX*/1704067200;
  const BAKED_IS_LIBERATED     = /*BAKE:IS_LIBERATED*/0.0;
  const BAKED_VOID_PROGRESS    = /*BAKE:VOID_PROGRESS*/0.0;
  const YEARS_PER_SECOND = 1 / (365 * 24 * 3600);

  let inheritedHueDegOverride = null;

  const _sc = (typeof _selfScript !== 'undefined') ? _selfScript : null;
  if (_sc) {
    const _t = _sc.getAttribute('t');
    if (_t !== null) {
      currentDataSetIndex    = parseInt(_t)                          || currentDataSetIndex;
      lastTwoHashDigits      = parseInt(_sc.getAttribute('ht'))      || lastTwoHashDigits;
      inscriptionUnixSeconds = parseInt(_sc.getAttribute('unix'))    || inscriptionUnixSeconds;
      const _hue = _sc.getAttribute('hue');
      if (_hue !== null) inheritedHueDegOverride = parseFloat(_hue);
    }
  } else {

    const _hp = {};
    window.location.hash.slice(1).split('&').forEach(p => {
      const eq = p.indexOf('=');
      if (eq > 0) _hp[p.slice(0, eq)] = p.slice(eq + 1);
    });
    if (_hp.idx) {
      currentDataSetIndex    = parseInt(_hp.idx);
      lastTwoHashDigits      = parseInt(_hp.ht)   || lastTwoHashDigits;
      inscriptionUnixSeconds = parseInt(_hp.unix) || inscriptionUnixSeconds;
      if (_hp.hue != null) inheritedHueDegOverride = parseFloat(_hp.hue);
    }
  }

  const allInheritedHues = healthDataSets.map((_, i) =>
    computeHSBFromStats(healthDataSets[Math.max(0, i - 1)], healthDataSets).hue * 360
  );

  function getPartnerIndex(idx) {
    if (idx === 0) return -1;
    return idx % 2 === 0 ? idx + 1 : idx - 1;
  }
  function getPartnerInheritedHue(idx) {
    const p = getPartnerIndex(idx);
    if (p < 0 || p >= healthDataSets.length) return 0;
    return allInheritedHues[p];
  }

  let partnerInheritedHueDeg = getPartnerInheritedHue(currentDataSetIndex);
  let isLiberated = BAKED_IS_LIBERATED;
  let voidProgress = BAKED_VOID_PROGRESS;
  let __reanimationOverride = null;

  const BLOCKS_PER_YEAR = 52596;
  const BLOCK_WINDOW_MS = 600000;

  const lc = {
    ready:                false,
    ownBlockHeight:       0,
    currentBlockHeight:   0,
    cessationBlock:       0,
    cycleCount:           0,
    cycleDataset:         null,
    reanimationTriggerMs: null,
    voidTriggerMs:        null,
    reanimationProgress:  0.0,
    isLiberated:          false,
    voidProgress:         0.0,
    collectionDatasets:   [],
    _siblingPollCount:    0,
  };

  function lcTick(nowMs) {
    if (lc.reanimationTriggerMs !== null) {
      lc.reanimationProgress = Math.min(1.0, (nowMs - lc.reanimationTriggerMs) / BLOCK_WINDOW_MS);
    } else if (!lc.isLiberated) {
      lc.reanimationProgress = 0.0;
    }
    if (lc.voidTriggerMs !== null) {
      lc.voidProgress = Math.min(1.0, (nowMs - lc.voidTriggerMs) / BLOCK_WINDOW_MS);
    }
  }

  function lcCycleDataset() {
    return lc.cycleDataset ?? healthDataSets[currentDataSetIndex];
  }

  function lcEffectiveCollection() {
    return lc.collectionDatasets.length > 0
      ? lc.collectionDatasets.map(d => d.dataset)
      : healthDataSets;
  }

  function lcGetPartnerDataset(partnerIdx) {
    const found = lc.collectionDatasets.find(d => d.pieceIndex === partnerIdx);
    if (found) return found.dataset;
    if (partnerIdx >= 0 && partnerIdx < healthDataSets.length) return healthDataSets[partnerIdx];
    return null;
  }

  const _engineId = _sc ? _sc.getAttribute('src').replace('/content/', '') : null;

  async function lcRefreshSiblings() {
    if (!_engineId) return;
    let page = 0, more = true;
    const fetched = [];
    while (more) {
      let resp;
      try { resp = await fetch(`/r/children/${_engineId}/inscriptions/${page}`).then(r => r.json()); }
      catch (e) { break; }
      for (const id of (resp.ids ?? [])) {
        try {
          const metaHex = await fetch(`/r/metadata/${id}`).then(r => r.text());
          if (!metaHex || !metaHex.trim()) continue;
          const meta = cborDecode(metaHex.trim());
          if (meta && meta.dataset) {
            fetched.push({
              id,
              pieceIndex:      meta.pieceIndex      ?? null,
              dataset:         meta.dataset,
              hashTail:        meta.hashTail         ?? null,
              inscriptionUnix: meta.inscriptionUnix  ?? null,
            });
          }
        } catch (e) { /* skip this sibling */ }
      }
      more = resp.more ?? false;
      page++;
    }
    if (fetched.length > 0) lc.collectionDatasets = fetched;
  }

  async function lcIsPartnerLiberated(pd, pInscriptionHeight) {
    let pCessationBlock = pInscriptionHeight + Math.round(lifespanYearsFromHashDigits(pd.hashTail) * BLOCKS_PER_YEAR);
    let pCycleDs = pd.dataset;
    const myDs = lcCycleDataset();
    const collection = lcEffectiveCollection();

    while (true) {
      if (lc.currentBlockHeight < pCessationBlock) return false;
      const blended   = blendDatasets(pCycleDs, myDs);
      const threshold = computeLiberationThreshold(collection, minMaxValues);
      const karma     = computeKarma(blended, minMaxValues);
      if (karma < threshold) return true;

      pCycleDs = blended;
      try {
        const bi = await fetch(`/r/blockinfo/${pCessationBlock}`).then(r => r.json());
        const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
        pCessationBlock += Math.round(lifespanYearsFromHashDigits(ht) * BLOCKS_PER_YEAR);
      } catch (e) { return false; }
    }
  }

  async function lcCheckVoid() {
    const partnerIdx = getPartnerIndex(currentDataSetIndex);
    if (partnerIdx < 0) { lc.voidTriggerMs = Date.now(); return; }
    const pd = lc.collectionDatasets.find(d => d.pieceIndex === partnerIdx);
    if (!pd || pd.hashTail == null) return;
    try {
      const pInfo = await fetch(`/r/inscription/${pd.id}`).then(r => r.json());
      const partnerLiberated = await lcIsPartnerLiberated(pd, pInfo.height ?? 0);
      if (partnerLiberated) {
        lc.voidTriggerMs = Date.now();
        console.log('[lc] VOID — both partners liberated');
      }
    } catch (e) { /* partner state unknown — void pending */ }
  }

  async function lcPoll() {
    try { lc.currentBlockHeight = await fetch('/r/blockheight').then(r => r.json()); }
    catch (e) { return; }

    if (lc.currentBlockHeight >= lc.cessationBlock && !lc.isLiberated && lc.reanimationTriggerMs === null) {
      const partnerIdx = getPartnerIndex(currentDataSetIndex);
      if (partnerIdx < 0) {
        lc.isLiberated = true;
        await lcCheckVoid();
        return;
      }
      const partnerDs  = lcGetPartnerDataset(partnerIdx) ?? healthDataSets[Math.max(0, partnerIdx)];
      const blended    = blendDatasets(lcCycleDataset(), partnerDs);
      const threshold  = computeLiberationThreshold(lcEffectiveCollection(), minMaxValues);
      const karma      = computeKarma(blended, minMaxValues);

      if (karma < threshold) {
        lc.isLiberated  = true;
        lc.cycleDataset = blended;
        console.log(`[lc] LIBERATED — karma ${karma.toFixed(4)} < threshold ${threshold.toFixed(4)}`);
        await lcCheckVoid();
      } else {
        lc.reanimationTriggerMs = Date.now();
        lc.cycleCount++;
        lc.cycleDataset = blended;
        try {
          const bi = await fetch(`/r/blockinfo/${lc.cessationBlock}`).then(r => r.json());
          const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
          lc.cessationBlock += Math.round(lifespanYearsFromHashDigits(ht) * BLOCKS_PER_YEAR);
        } catch (e) {
          lc.cessationBlock += Math.round(lifespanYears * BLOCKS_PER_YEAR);
        }
        console.log(`[lc] REANIMATION cycle ${lc.cycleCount} — next cessation block ${lc.cessationBlock}`);
      }
    }

    if (lc.isLiberated && lc.voidTriggerMs === null) await lcCheckVoid();

    if (++lc._siblingPollCount % 10 === 0) lcRefreshSiblings().catch(() => {});
  }

  async function lcFastForward() {
    while (lc.currentBlockHeight >= lc.cessationBlock && !lc.isLiberated) {
      const partnerIdx = getPartnerIndex(currentDataSetIndex);
      if (partnerIdx < 0) { lc.isLiberated = true; break; }
      const partnerDs = lcGetPartnerDataset(partnerIdx) ?? healthDataSets[Math.max(0, partnerIdx)];
      const blended   = blendDatasets(lcCycleDataset(), partnerDs);
      const threshold = computeLiberationThreshold(lcEffectiveCollection(), minMaxValues);
      const karma     = computeKarma(blended, minMaxValues);
      if (karma < threshold) { lc.isLiberated = true; lc.cycleDataset = blended; break; }
      lc.cycleCount++;
      lc.cycleDataset = blended;
      try {
        const bi = await fetch(`/r/blockinfo/${lc.cessationBlock}`).then(r => r.json());
        const ht = Math.round(parseInt(bi.hash.slice(-2), 16) * 99 / 255);
        lc.cessationBlock += Math.round(lifespanYearsFromHashDigits(ht) * BLOCKS_PER_YEAR);
      } catch (e) { lc.cessationBlock += Math.round(lifespanYears * BLOCKS_PER_YEAR); break; }
    }
  }

  async function initLifecycle() {
    try {

      const _blk = _sc ? _sc.getAttribute('block') : null;
      if (_blk) {
        lc.ownBlockHeight = parseInt(_blk);
      } else {
        const selfInfo = await fetch('/r/inscription/self').then(r => r.json());
        lc.ownBlockHeight = selfInfo.height ?? 0;
      }
      lc.cessationBlock  = lc.ownBlockHeight + Math.round(lifespanYears * BLOCKS_PER_YEAR);
      lc.currentBlockHeight = await fetch('/r/blockheight').then(r => r.json());
      await lcRefreshSiblings();
      await lcFastForward();
      if (lc.isLiberated && lc.voidTriggerMs === null) await lcCheckVoid();
      setInterval(lcPoll, 60000);
      lc.ready = true;
      console.log(`[lc] ready — block ${lc.currentBlockHeight}, cessation ${lc.cessationBlock}, cycle ${lc.cycleCount}, liberated: ${lc.isLiberated}`);
    } catch (e) {
      console.warn('[lc] lifecycle engine inactive (not in ord env)');
    }
  }

  let _recorder = null;
  window.recordCanvas = (seconds = 10) => {
    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      _recorder = null;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `cessation_${currentDataSetIndex}_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    _recorder = recorder;
    recorder.start();
    console.log(`[R] recording started — press R again to stop`);
    if (seconds) setTimeout(() => { if (_recorder) _recorder.stop(); }, seconds * 1000);
  };

  window.addEventListener('keydown', (e) => {
    if (e.target !== document.body && e.target !== document.documentElement) return;
    const key = e.key.toUpperCase();

    if (key === 'F') {
      const container = document.getElementById('canvas-container');
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => console.warn('[F] fullscreen error:', err));
      } else {
        document.exitFullscreen();
      }
    }

    if (key === 'R') {
      if (_recorder && _recorder.state === 'recording') {
        _recorder.stop();
        console.log('[R] recording stopped — saving...');
      } else {
        window.recordCanvas(0);
      }
    }

    if (key === 'S') {
      draw();
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `cessation_${currentDataSetIndex}_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('[S] snapshot saved');
      }, 'image/png');
    }
  });

  const hash01 = lastTwoHashDigits / 99;
  const signed = (hash01 - 0.5) * 2;

  const nudgeNa = 12 * signed;
  const nudgeCl = 14 * signed;
  const nudgeCO2 = 18 * signed;
  const nudgeCa = 12 * signed;

  const params = {
    overrideYears: null,
    timeWarp: 1.0,
    previewSpeedYPS: 0,
  };

  let co2Pulse = 0,
    caPulse = 0;

  let lifespanYears = lifespanYearsFromHashDigits(lastTwoHashDigits);

  function setHSBUniforms(ds) {
    const { hue, sat, bri } = computeHSBFromStats(ds, healthDataSets);
    gl.uniform1f(uGlucoseLoc, hue);
    gl.uniform1f(uPotassiumLoc, sat);
    gl.uniform1f(uEgfrLoc, bri);
  }

  function setResolutionUniform() {
    gl.uniform2f(uResolutionLoc, gl.canvas.width, gl.canvas.height);
  }

  const beamPhases = {};
  const beamConfigs = [
    {
      label: 'N (BUN)', labKey: 'nitrogen', phaseKey: 'N',
      phaseSeed: (h) => (h / 99) * 2 * Math.PI, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.NITROGEN),
      strengthLoc: uNitrogenStrengthLoc, hueLoc: uNitrogenHueDegLoc, radiusLoc: uNitrogenRadiusLoc,
      update({ ph, p, ds }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp(0.58 * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.35 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.NITROGEN) + (10 + 8 * p) * Math.sin(ph * 0.93 + 0.14);
        return { str, hue };
      },
    },
    {
      label: 'C (Cr)', labKey: 'creatinine', phaseKey: 'C',
      phaseSeed: (h) => (h / 99) * 1.3 * Math.PI, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CREATININE),
      strengthLoc: uCreatinineStrengthLoc, hueLoc: uCreatinineHueDegLoc, radiusLoc: uCreatinineRadiusLoc,
      update({ ph, p, ds }) {
        const amp = getBreathingAmplitude(ds);
        let str = clamp((0.4 + 0.3 * p) * (0.5 + 0.5 * Math.sin(ph) * amp), 0, 1);
        str = 0.3 + 0.20 * str;
        const hue = getBeamHueAnchorDeg(ds, BEAM.CREATININE) + (8 + 5 * p) * Math.sin(ph * 1.07 + 0.08);
        return { str, hue };
      },
    },
    {
      label: 'Na', labKey: 'sodium', phaseKey: 'Na',
      phaseSeed: (h) => sodiumPhaseSeed(h), tickTwoPi: false,
      tempoFn: (ds) => sodiumTempoSeconds(ds),
      strengthLoc: uSodiumStrengthLoc, hueLoc: uSodiumHueDegLoc, radiusLoc: uSodiumRadiusLoc,
      update({ ph, p, ds, baseHueDeg, totalYears }) {
        const arr = sodiumArrivalProgress(totalYears, lifespanYears);
        const amp = sodiumAmplitude(ds, ds.healthIndex ?? 0.5, arr, p);
        let hue = sodiumHueDeg(baseHueDeg, ds, p) + nudgeNa;
        hue += (16 + 4 * p) * Math.sin(ph * 0.82 + 0.32);

        const baseStr = 0.06 + 0.10 * p;
        const arrivedStr = clamp(amp * sodiumPulseShape(ph, sodiumPulseCount(ds), 0.12), 0, 1);
        const str = clamp(baseStr + arrivedStr, 0, 1);
        return { str, hue };
      },
    },
    {
      label: 'Cl', labKey: 'chloride', phaseKey: 'Cl',
      phaseSeed: (h) => chloridePhaseSeed(h), tickTwoPi: false,
      tempoFn: (ds) => chlorideTempoSeconds(ds),
      strengthLoc: uChlorideStrength, hueLoc: uChlorideHueDeg, radiusLoc: uChlorideRadiusLoc,
      update({ ph, p, ds, baseHueDeg, totalYears }) {
        const arr = chlorideArrivalProgress(totalYears, lifespanYears);
        const amp = chlorideAmplitude(ds, ds.healthIndex ?? 0.5, arr, p);
        let hue = chlorideHueDeg(baseHueDeg, p) + nudgeCl;
        hue += (12 + 6 * p) * Math.sin(ph * 0.88 - 0.24);

        const baseStr = 0.05 + 0.09 * p;
        const arrivedStr = clamp(amp * chlorideTriWithWarble(ph, ds), 0, 1);
        const str = clamp(baseStr + arrivedStr, 0, 1);
        return { str, hue };
      },
    },
    {
      label: 'CO2', labKey: 'carbonDioxide', phaseKey: 'CO2',
      phaseSeed: () => 0, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CO2),
      strengthLoc: uCo2StrengthLoc, hueLoc: uCo2HueDegLoc, radiusLoc: null,
      update({ ph, p, baseHueDeg, co2Pulse }) {
        const str = clamp(0.26 + 0.18 * (1 - p) + 0.22 * co2Pulse, 0, 0.62);
        let hue = baseHueDeg - (24 + 12 * p) + nudgeCO2;
        hue = guardHueGap(baseHueDeg, hue, 30, -1);
        hue += (12 + 6 * p) * Math.sin(ph * 1.0 + 0.2);
        return { str, hue };
      },
    },
    {
      label: 'Ca', labKey: 'calcium', phaseKey: 'Ca',
      phaseSeed: () => 0, tickTwoPi: true,
      tempoFn: (ds) => getBeamTempoSeconds(ds, BEAM.CALCIUM),
      strengthLoc: uCalciumStrengthLoc, hueLoc: uCalciumHueDegLoc, radiusLoc: uCalciumRadiusLoc,
      update({ ph, p, baseHueDeg, caPulse, pCO2, pPR }) {
        const str = clamp(0.06 + 0.08 * (1 - pCO2) + 0.16 * caPulse, 0, 0.30);
        let hue = baseHueDeg + (45 + 25 * p) + nudgeCa;
        hue = guardHueGap(baseHueDeg, hue, 32, +1);
        hue += (10 + 6 * pPR) * Math.sin(ph * 0.92 - 0.13);
        return { str, hue };
      },
    },
  ];

  function draw() {
    resizeCanvasToDisplaySize(canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setResolutionUniform();
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = performance.now() / 1000;
    if (uTimeLoc) gl.uniform1f(uTimeLoc, t);
    window.__lastT = window.__lastT ?? t;
    const dt = Math.min(0.1, Math.max(0, t - window.__lastT));
    window.__lastT = t;

    const nowUnix = Math.floor(Date.now() / 1000);

    lcTick(Date.now());
    const reanimationProgress = (typeof __reanimationOverride !== 'undefined' && __reanimationOverride !== null)
      ? __reanimationOverride
      : lc.reanimationProgress;
    if (lc.ready) {
      isLiberated  = lc.isLiberated ? 1.0 : (BAKED_IS_LIBERATED > 0 ? 1.0 : 0.0);
      voidProgress = lc.voidProgress;
    }
    const baseYears =
      Math.max(0, nowUnix - inscriptionUnixSeconds) * YEARS_PER_SECOND;

    if (params.overrideYears !== null && params.previewSpeedYPS > 0) {
      params.overrideYears += params.previewSpeedYPS * dt;
    }

    const totalYears =
      (params.overrideYears !== null ? params.overrideYears : baseYears) *
      (params.timeWarp || 1);

    const lifeFraction = clamp(totalYears / lifespanYears, 0, 1);
    const activeDataSet = applyCollectionInfluence(
      getAgedDataset(currentDataSetIndex, lifeFraction, healthDataSets),
      healthDataSets,
      lifeFraction
    );
    setHSBUniforms(activeDataSet);

    gl.uniform1f(uTotalYearsLoc, totalYears);
    gl.uniform1f(uLifespanYearsLoc, lifespanYears);

    const pAxisNorm = clamp(
      normalize(activeDataSet.ecg.pAxis, minMaxValues.pAxis.min, minMaxValues.pAxis.max),
      0, 1
    );
    const rAxisNorm = clamp(
      normalize(activeDataSet.ecg.rAxis, minMaxValues.rAxis.min, minMaxValues.rAxis.max),
      0, 1
    );
    if (uPAxisNormLoc) gl.uniform1f(uPAxisNormLoc, pAxisNorm);
    if (uRAxisNormLoc) gl.uniform1f(uRAxisNormLoc, rAxisNorm);

    const qtcNorm = clamp(
      normalize(activeDataSet.ecg.qtcInterval, minMaxValues.qtcInterval.min, minMaxValues.qtcInterval.max),
      0, 1
    );
    const prNorm = clamp(
      normalize(activeDataSet.ecg.prInterval, minMaxValues.prInterval.min, minMaxValues.prInterval.max),
      0, 1
    );
    if (uQtcNormLoc) gl.uniform1f(uQtcNormLoc, qtcNorm);
    const qtcPercentile = percentile(activeDataSet.ecg.qtcInterval, sortedQtcValues);
    if (uQtcPercentileLoc) gl.uniform1f(uQtcPercentileLoc, qtcPercentile);
    const pAxisPct = percentile(activeDataSet.ecg.pAxis, sortedPAxisValues);
    const rAxisPct = percentile(activeDataSet.ecg.rAxis, sortedRAxisValues);
    const tAxisPct = percentile(activeDataSet.ecg.tAxis, sortedTAxisValues);
    if (uPAxisPctLoc) gl.uniform1f(uPAxisPctLoc, pAxisPct);
    if (uRAxisPctLoc) gl.uniform1f(uRAxisPctLoc, rAxisPct);
    if (uTAxisPctLoc) gl.uniform1f(uTAxisPctLoc, tAxisPct);
    if (uPrNormLoc) gl.uniform1f(uPrNormLoc, prNorm);
    const ventRateNorm = clamp(
      normalize(activeDataSet.ecg.ventRate, minMaxValues.ventRate.min, minMaxValues.ventRate.max),
      0, 1
    );
    if (uVentRateNormLoc) gl.uniform1f(uVentRateNormLoc, ventRateNorm);
    const tAxisNorm = clamp(
      normalize(activeDataSet.ecg.tAxis, minMaxValues.tAxis.min, minMaxValues.tAxis.max),
      0, 1
    );
    if (uTAxisNormLoc) gl.uniform1f(uTAxisNormLoc, tAxisNorm);
    const qrsNorm = clamp(
      normalize(activeDataSet.ecg.qrsInterval, minMaxValues.qrsInterval.min, minMaxValues.qrsInterval.max),
      0, 1
    );
    if (uQrsNormLoc) gl.uniform1f(uQrsNormLoc, qrsNorm);
    const co2Norm = clamp(
      normalize(activeDataSet.labs.carbonDioxide, minMaxValues.carbonDioxide.min, minMaxValues.carbonDioxide.max),
      0, 1
    );
    if (uCo2NormLoc) gl.uniform1f(uCo2NormLoc, co2Norm);
    const qrsTAngle = Math.abs(activeDataSet.ecg.rAxis - activeDataSet.ecg.tAxis);
    const qrsTAngleNorm = clamp(
      (qrsTAngle - qrsTAngleMin) / Math.max(1e-6, qrsTAngleMax - qrsTAngleMin),
      0, 1
    );
    if (uQrsTAngleLoc) gl.uniform1f(uQrsTAngleLoc, qrsTAngleNorm);
    const ventRatePct   = percentile(activeDataSet.ecg.ventRate,    sortedVentRateValues);
    const prPct         = percentile(activeDataSet.ecg.prInterval,  sortedPRValues);
    const qrsPct        = percentile(activeDataSet.ecg.qrsInterval, sortedQRSValues);
    const qrsTAnglePct  = percentile(qrsTAngle,                     sortedQRSTAngleValues);
    if (uVentRatePctLoc)  gl.uniform1f(uVentRatePctLoc,  ventRatePct);
    if (uPrPctLoc)        gl.uniform1f(uPrPctLoc,        prPct);
    if (uQrsPctLoc)       gl.uniform1f(uQrsPctLoc,       qrsPct);
    if (uQrsTAnglePctLoc) gl.uniform1f(uQrsTAnglePctLoc, qrsTAnglePct);

    const inheritedStrength = Math.pow(Math.max(0, 1 - lifeFraction), 0.7);
    const inheritedHueDeg = inheritedHueDegOverride !== null
      ? inheritedHueDegOverride
      : allInheritedHues[currentDataSetIndex];
    if (uInheritedHueDegLoc) gl.uniform1f(uInheritedHueDegLoc, inheritedHueDeg);
    if (uInheritedStrengthLoc) gl.uniform1f(uInheritedStrengthLoc, inheritedStrength);
    if (uReanimationProgressLoc) gl.uniform1f(uReanimationProgressLoc, reanimationProgress);
    if (uPartnerInheritedHueDegLoc) gl.uniform1f(uPartnerInheritedHueDegLoc, partnerInheritedHueDeg);
    if (uIsLiberatedLoc) gl.uniform1f(uIsLiberatedLoc, isLiberated);
    if (uVoidProgressLoc) gl.uniform1f(uVoidProgressLoc, voidProgress);

    const baseHSB = computeHSBFromStats(activeDataSet, healthDataSets);
    let baseHueDeg = baseHSB.hue * 360.0;

    co2Pulse *= Math.exp(-dt / 18.0);
    caPulse  *= Math.exp(-dt / 26.0);
    const pCO2 = winsorizedPercentileForLab(activeDataSet, 'carbonDioxide', healthDataSets);
    const pPR = clamp(
      (activeDataSet.ecg.prInterval - minMaxValues.prInterval.min) /
      Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min),
      0, 1
    );

    const beamRGBLocs = [uNitrogenRGBLoc, uCreatRGBLoc, uSodiumRGBLoc, uChlorideRGBLoc, uCo2RGBLoc, uCalciumRGBLoc];
    const beamSat =     [0.90,            0.90,          0.94,           0.75,            0.75,        0.70];
    const beamBri =     [0.78,            0.78,          0.80,           0.85,            1.00,        0.95];

    for (let i = 0; i < beamConfigs.length; i++) {
      const cfg = beamConfigs[i];
      beamPhases[cfg.phaseKey] = beamPhases[cfg.phaseKey] ?? cfg.phaseSeed(lastTwoHashDigits);
      if (cfg.tickTwoPi) {
        beamPhases[cfg.phaseKey] += (dt * 2 * Math.PI) / Math.max(1e-3, cfg.tempoFn(activeDataSet));
      } else {
        beamPhases[cfg.phaseKey] = (beamPhases[cfg.phaseKey] + dt / Math.max(1e-3, cfg.tempoFn(activeDataSet))) % 1;
      }
      const ph = beamPhases[cfg.phaseKey];
      const p = winsorizedPercentileForLab(activeDataSet, cfg.labKey, healthDataSets);
      const { str, hue } = cfg.update({ ph, p, ds: activeDataSet, baseHueDeg, totalYears, co2Pulse, caPulse, pCO2, pPR });
      if (cfg.strengthLoc) gl.uniform1f(cfg.strengthLoc, str);
      if (cfg.hueLoc)      gl.uniform1f(cfg.hueLoc, hue);
      if (cfg.radiusLoc)   gl.uniform1f(cfg.radiusLoc, p);
      if (beamRGBLocs[i])  gl.uniform3fv(beamRGBLocs[i], hsbToRgb(hue, beamSat[i], beamBri[i]));
    }

    if (uNirvanaRGBLoc) gl.uniform3fv(uNirvanaRGBLoc, hsbToRgb(inheritedHueDeg, 0.85, 0.92));
    if (uPartnerRGBLoc) gl.uniform3fv(uPartnerRGBLoc, hsbToRgb(partnerInheritedHueDeg, 0.85, 0.92));

    const bunCreatRatio = activeDataSet.labs.nitrogen / Math.max(0.1, activeDataSet.labs.creatinine);
    const bunCreatRatioNorm = clamp(
      (bunCreatRatio - bunCreatP05) / Math.max(1e-9, bunCreatP95 - bunCreatP05),
      0, 1
    );
    if (uBunCreatRatioNormLoc) gl.uniform1f(uBunCreatRatioNormLoc, bunCreatRatioNorm);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  }

  gl.clearColor(0, 0, 0, 1);
  draw();

  initLifecycle().catch(() => {});

}

function percentile(value, sortedArray) {
  const rank = sortedArray.filter((v) => v < value).length;
  return rank / (sortedArray.length - 1);
}

function computeHSBFromStats(dataSet, healthDataSets) {
  const glucoseValues = healthDataSets.map((d) => d.labs.glucose);
  const potassiumValues = healthDataSets.map((d) => d.labs.potassium);
  const egfrValues = healthDataSets.map((d) => d.labs.eGFR);

  glucoseValues.sort((a, b) => a - b);
  potassiumValues.sort((a, b) => a - b);
  egfrValues.sort((a, b) => a - b);

  const hue = percentile(dataSet.labs.glucose, glucoseValues);
  const sat = percentile(dataSet.labs.potassium, potassiumValues);
  const bri = percentile(dataSet.labs.eGFR, egfrValues);

  return { hue, sat, bri };
}

function hsbToRgb(hDeg, s, b) {
  const h = ((hDeg % 360) + 360) % 360;
  const K = [1, 2/3, 1/3, 3];
  const fract = (x) => x - Math.floor(x);
  const p = [
    Math.abs(fract(h/360 + K[0]) * 6 - K[3]),
    Math.abs(fract(h/360 + K[1]) * 6 - K[3]),
    Math.abs(fract(h/360 + K[2]) * 6 - K[3]),
  ];
  return [
    b * (1 - s + s * Math.max(0, Math.min(1, p[0] - 1))),
    b * (1 - s + s * Math.max(0, Math.min(1, p[1] - 1))),
    b * (1 - s + s * Math.max(0, Math.min(1, p[2] - 1))),
  ];
}

const BEAM = Object.freeze({
  NITROGEN: 0,
  CREATININE: 1,
  SODIUM: 2,
  CHLORIDE: 3,
  CO2: 4,
  CALCIUM: 5,
});

function winsorizedPercentileForLab(
  dataSet,
  labKey,
  datasets = healthDataSets
) {
  const values = datasets
    .map((d) => d.labs[labKey])
    .slice()
    .sort((a, b) => a - b);
  if (values.length < 2) return 0.5;
  const p05 = values[Math.floor(0.05 * (values.length - 1))];
  const p95 = values[Math.ceil(0.95 * (values.length - 1))];
  const v = dataSet.labs[labKey];
  const clamped = Math.max(p05, Math.min(p95, v));
  return (clamped - p05) / Math.max(1e-9, p95 - p05);
}

function getBreathingAmplitude(dataSet) {
  const pv = normalize(
    dataSet.ecg.ventRate,
    minMaxValues.ventRate.min,
    minMaxValues.ventRate.max
  );
  const pq = normalize(
    dataSet.ecg.qtcInterval,
    minMaxValues.qtcInterval.min,
    minMaxValues.qtcInterval.max
  );
  const uv = Math.abs(pv - 0.5);
  const uq = Math.abs(pq - 0.5);
  const V = 2 * Math.max(uv, uq);
  let amp = 0.05 + 0.07 * V;
  const extreme = pv < 0.1 || pv > 0.9 || pq < 0.1 || pq > 0.9;
  if (extreme) amp = Math.min(0.18, amp + 0.03);
  return amp;
}

function getBeamTempoSeconds(dataSet, beamId) {
  switch (beamId) {
    case BEAM.NITROGEN: {

      const vals = healthDataSets.map(d => d.labs.nitrogen).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.nitrogen, vals);
      return 10 - 3 * p;
    }
    case BEAM.CREATININE: {

      const prNorm = clamp(
        (dataSet.ecg.prInterval - minMaxValues.prInterval.min) /
        Math.max(1e-6, minMaxValues.prInterval.max - minMaxValues.prInterval.min),
        0, 1
      );
      return 9 + 6 * prNorm;
    }
    case BEAM.CO2: {

      const vals = healthDataSets.map(d => d.labs.eGFR).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.eGFR, vals);
      return 12 + 8 * p;
    }
    case BEAM.CALCIUM: {

      const tNorm = clamp(
        (dataSet.ecg.tAxis - minMaxValues.tAxis.min) /
        Math.max(1e-6, minMaxValues.tAxis.max - minMaxValues.tAxis.min),
        0, 1
      );
      return 18 + 12 * (1 - tNorm);
    }
    default:
      return 12.0;
  }
}

function getBeamHueAnchorDeg(dataSet, beamId) {
  const { hue } = computeHSBFromStats(dataSet, healthDataSets);
  const baseDeg = hue * 360.0;
  switch (beamId) {
    case BEAM.NITROGEN: {

      const vals = healthDataSets.map(d => d.labs.eGFR).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.eGFR, vals);
      return baseDeg + (p - 0.5) * 160;
    }
    case BEAM.CREATININE: {

      const vals = healthDataSets.map(d => d.labs.potassium).sort((a, b) => a - b);
      const p = percentile(dataSet.labs.potassium, vals);
      return baseDeg + (p - 0.5) * 120;
    }
    default:
      return baseDeg;
  }
}

init();
})();