#version 300 es
precision mediump float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uHealthIndex;
uniform float uDecayRate;

in vec2 vUv;
out vec4 fragColor;

// Simple 2D noise → warp UVs
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    float a=hash(i),b=hash(i+vec2(1,0));
    float c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
    f=f*f*(3.-2.*f);
    return mix(a,b,f.x)+(c-a)*f.y*(1.-f.x)+(d-b)*f.x*f.y;
}

// HSB → RGB helper
vec3 hsv2rgb(vec3 c){
    vec3 rgb=clamp(abs(mod(c.x*6.+vec3(0,4,2),
6.)-3.)-1.,
0.,1.);
rgb=rgb*rgb*(3.-2.*rgb);
return c.z*mix(vec3(1.),rgb,c.y);
}

void main(){
// warp & jitter uv
float n=noise(vUv*3.+uTime*.05);
vec2 uv=vUv+(n-.5)*(.02+.5*uHealthIndex);

// simple decay progression
float decay=exp(-uDecayRate*uTime);

// base color from healthIndex
float hue=fract(uHealthIndex+.2);
float sat=.6;
float bri=mix(1.,.1,decay);

vec3 col=hsv2rgb(vec3(hue,sat,bri));

// modulate by noise
col*=.8+.2*n;

fragColor=vec4(1.0, 0.0, 0.0, 1.0);
}