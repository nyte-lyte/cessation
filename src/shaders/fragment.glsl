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
    
    float pixelHue=mod(u_glucose*360.+(v_uv.x*50.+v_uv.y*50.)*n,360.);
    float pixelSat=clamp(.3+u_potassium*.7+n*2.,0.,1.);
    float pixelBri=clamp(.2+u_eGFR*.8+n*1.5,0.,1.);
    
    vec3 rgbColor=hsb2rgb(pixelHue,pixelSat,pixelBri);

    // --- minimal spatial masks (drift uses u_totalYears) ---
    float t=u_totalYears;

// Nitrogen: soft radial blob drifting slightly
vec2 cN=vec2(.28+.08*sin(t*.6),.32+.06*cos(t*.5));
float dN=distance(v_uv,cN);
float mN=1.-smoothstep(.28,.46,dN);// 1 inside ~0.28 radius, soft edge to 0

// Creatinine: diagonal band that slowly shifts
float ang=.8;// ~46°
vec2 dir=normalize(vec2(cos(ang),sin(ang)));
float coord=dot(v_uv+vec2(.15*sin(t*.25),-.12*cos(t*.22)),dir);
float band=abs(sin(coord*6.+t*.4));// ~6 waves across the canvas
float mC=smoothstep(.9,.3,band);// thick bright band

// Sodium: two large blobs, take the max (either one can glow)
    vec2 cA=vec2(.72+.06*cos(t*.33),.42+.05*sin(t*.27));
    vec2 cB=vec2(.38+.07*sin(t*.21),.78+.06*cos(t*.19));
    float dA=distance(v_uv,cA);
    float dB=distance(v_uv,cB);
    float mA=1.-smoothstep(.22,.40,dA);
    float mB=1.-smoothstep(.18,.34,dB);
    float mNa=max(mA,mB);
    
    // Nitrogen (test)
    vec3 nitrogenRGB=hsb2rgb(u_nitrogenHueDeg,.8,.8);
    rgbColor=clamp(rgbColor+nitrogenRGB*u_nitrogenStrength*mN,0.,1.);
    
    // Creatinine (test)
    vec3 creatRGB=hsb2rgb(u_creatinineHueDeg,.75,.8);
    rgbColor=clamp(rgbColor+creatRGB*u_creatinineStrength*mC,0.,1.);

    // Sodium (test)
    vec3 sodiumRGB=hsb2rgb(u_sodiumHueDeg,.80,.85);
    rgbColor=clamp(rgbColor+sodiumRGB*u_sodiumStrength*mNa,0.,1.);

    float decay=exp(-u_decayPerYear*u_totalYears);
    fragColor=vec4(rgbColor*decay,1.);
}