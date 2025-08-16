#version 300 es
precision highp float;

// passed from vertex shader
in vec2 v_uv;

// the final color we write
out vec4 fragColor;

// Uniforms for dataset metrics
uniform float u_glucose;// normalized [0..1]
uniform float u_potassium;// normalized [0..1]
uniform float u_eGFR;// normalized [0..1]

// The resolution of the canvas (width, height)
uniform vec2 u_resolution;

// Simple pseudorandom noise based on UV:
float rand(vec2 co){
    return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);
}

// Convert HSB (Hue [0..360], Sat [0..1], Bright [0..1]) to RGB
vec3 hsb2rgb(float H,float S,float B){
    float c=B*S;
    float Hprime=mod(H/60.,6.);
    float X=c*(1.-abs(mod(Hprime,2.)-1.));
    vec3 rgb=vec3(0.);
    
    if(0.<=Hprime&&Hprime<1.)rgb=vec3(c,X,0.);
    else if(1.<=Hprime&&Hprime<2.)rgb=vec3(X,c,0.);
    else if(2.<=Hprime&&Hprime<3.)rgb=vec3(0.,c,X);
    else if(3.<=Hprime&&Hprime<4.)rgb=vec3(0.,X,c);
    else if(4.<=Hprime&&Hprime<5.)rgb=vec3(X,0.,c);
    else if(5.<=Hprime&&Hprime<6.)rgb=vec3(c,0.,X);
    
    float m=B-c;
    return rgb+vec3(m);
}

void main(){
// 1) Sample a tiny bit of noise so our field isn’t totally flat
float n=rand(v_uv*u_resolution.xy*.1)*.02;
// We multiply resolution to decorrelate noise per pixel; tweak “0.1” for scale

// 2) Hue = glucose * 360°, then add subtle spatial variation (like a gentle “ripple”)
float pixelHue=mod(u_glucose*360.+(v_uv.x*50.+v_uv.y*50.)*n,360.);

// 3) Saturation = 0.3 → 1.0 based on potassium, plus a bit of noise
float pixelSat=clamp(.3+u_potassium*.7+n*2.,0.,1.);

// 4) Brightness = 0.2 → 1.0 based on eGFR, plus noise
float pixelBri=clamp(.2+u_eGFR*.8+n*1.5,0.,1.);

vec3 rgbColor=hsb2rgb(pixelHue,pixelSat,pixelBri);

fragColor=vec4(rgbColor,1.);
}