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

// --- helpers ---
float rand(vec2 co){
    return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);
}
vec3 hsb2rgb(float H,float S,float B){
    float c=B*S;
    float Hp=mod(H/60.,6.);
    float X=c*(1.-abs(mod(Hp,2.)-1.));
    vec3 rgb=vec3(0.);
    if(0.<=Hp&&Hp<1.)rgb=vec3(c,X,0.);
    else if(1.<=Hp&&Hp<2.)rgb=vec3(X,c,0.);
    else if(2.<=Hp&&Hp<3.)rgb=vec3(0.,c,X);
    else if(3.<=Hp&&Hp<4.)rgb=vec3(0.,X,c);
    else if(4.<=Hp&&Hp<5.)rgb=vec3(X,0.,c);
    else if(5.<=Hp&&Hp<6.)rgb=vec3(c,0.,X);
    float m=B-c;
    return rgb+vec3(m);
}

void main(){
    float n=rand(v_uv*u_resolution.xy*.1)*.02;
    
    float pixelHue=mod(u_glucose*360.+(v_uv.x*120.+v_uv.y*120.)*n,360.);
    float pixelSat=clamp(.25+u_potassium*.9+n*3.,0.,1.);
    float pixelBri=clamp(.15+u_eGFR*.9+n*2.,0.,1.);
    
    vec3 rgbColor=hsb2rgb(pixelHue,pixelSat,pixelBri);

    // --- minimal spatial masks (drift uses u_totalYears) ---
    float t = u_totalYears;

// Nitrogen: dataset-seeded center + gentle drift
float hN1=fract(sin(u_glucose*43758.5453)*1e4);
float hN2=fract(sin(u_potassium*24693.9753)*1e4);

vec2 cN=vec2(.15+.70*hN1,.20+.65*hN2);
cN+=.05*vec2(
    sin(u_totalYears*.33+6.2831*hN1),
    cos(u_totalYears*.27+6.2831*hN2)
);

float dN=distance(v_uv,cN);
float mN=1.-smoothstep(.26,.52,dN);// inner/outer radii = size/softness

// Creatinine: two localized blobs (replaces diagonal band)
float hC1=fract(sin(u_potassium*19641.1231)*1e4);
float hC2=fract(sin(u_eGFR*15431.7311)*1e4);

vec2 cC1=vec2(.20+.60*hC1,.25+.55*hC2)
+.04*vec2(sin(u_totalYears*.29+6.2831*hC1),
cos(u_totalYears*.31+6.2831*hC2));
vec2 cC2=vec2(.35+.55*hC2,.18+.60*hC1)
+.03*vec2(sin(u_totalYears*.25+6.2831*hC2),
cos(u_totalYears*.21+6.2831*hC1));

float mC1=1.-smoothstep(.18,.38,distance(v_uv,cC1));
float mC2=1.-smoothstep(.16,.36,distance(v_uv,cC2));
float mC=max(mC1,mC2);

// Sodium: two large, gentle washes (dataset-seeded), very soft edges
float hNa1=fract(sin(u_eGFR*17321.5521)*1e4);
float hNa2=fract(sin(u_glucose*21391.3459)*1e4);

vec2 cA=vec2(.25+.65*hNa1,.22+.65*hNa2)
+.04*vec2(cos(u_totalYears*.33+6.2831*hNa1),
sin(u_totalYears*.27+6.2831*hNa2));
vec2 cB=vec2(.12+.75*hNa2,.30+.60*hNa1)
+.04*vec2(sin(u_totalYears*.21+6.2831*hNa2),
cos(u_totalYears*.19+6.2831*hNa1));

float mA=1.-smoothstep(.24,.40,distance(v_uv,cA));
float mB=1.-smoothstep(.22,.46,distance(v_uv,cB));
float mNa=max(mA,mB);

// Chloride: "breath" + subtle warble
vec2 cCl=vec2(.62+.05*sin(t*.27),.28+.04*cos(t*.31));
float dCl=distance(v_uv,cCl);
float mCl=1.-smoothstep(.23,.43,dCl);

// arrival progression (~60% lifespan milestone)
float arrivalCl=smoothstep(.55,.65,u_totalYears/64.);
float breathCl=.6+.4*sin(t*.4);
float strengthCl=u_sodiumStrength*arrivalCl*breathCl;

// CO2: HALO (cool, edge-biased ambient blend) 
float lum=dot(rgbColor,vec3(.299,.587,.114));
float edge=length(vec2(dFdx(lum),dFdy(lum)));
float edgeW=smoothstep(.005,.030,edge);// stronger where colors meet
float ambW=.35+.65*rand(v_uv+vec2(t*.02,-t*.017));// soft presence
float localGain=smoothstep(.10,.60,lum);// avoid dark wash
float haloW=u_co2Strength*mix(ambW,edgeW,.70)*localGain;

// CALCIUM: field(warm, broad low-frequency glow) 
vec2 c1=vec2(.62+.05*sin(t*.11),.28+.05*cos(t*.09));
vec2 c2=vec2(.26+.06*cos(t*.07),.68+.05*sin(t*.08));
float d1=distance(v_uv,c1);
float d2=distance(v_uv,c2);
float m1=1.-smoothstep(.28,.50,d1);
float m2=1.-smoothstep(.25,.47,d2);
float mCa=max(m1,m2);// two slow drifting lobes
    
    // Nitrogen (test)
    vec3 nitrogenRGB=hsb2rgb(u_nitrogenHueDeg,.90,.78);
    rgbColor=clamp(rgbColor+nitrogenRGB*u_nitrogenStrength*mN,0.,1.);
    
    // Creatinine (test)
    vec3 creatRGB=hsb2rgb(u_creatinineHueDeg,.90,.78);
    rgbColor=clamp(rgbColor+creatRGB*u_creatinineStrength*mC,0.,1.);

    // Sodium (test)
    vec3 sodiumRGB=hsb2rgb(u_sodiumHueDeg,.94,.80);
    rgbColor=clamp(rgbColor+sodiumRGB*u_sodiumStrength*mNa,0.,1.);

    // Chloride (test)
    vec3 chlorideRGB=hsb2rgb(u_chlorideHueDeg,.90,.78);
    rgbColor=clamp(rgbColor+chlorideRGB*strengthCl*mCl,0.,1.);

    // CO2 (test)
    vec3 co2Tint=hsb2rgb(u_co2HueDeg,.8,1.);
    rgbColor=clamp(rgbColor+co2Tint*haloW,0.,1.);

    // Calcium (test)
    vec3 caTint=hsb2rgb(u_calciumHueDeg,.88,.82);
    rgbColor=clamp(rgbColor+caTint*(u_calciumStrength*mCa),0.,1.);

    float decay=exp(-u_decayPerYear*u_totalYears);
    fragColor=vec4(rgbColor*decay,1.);
}