export const terrainNoise = `
// 3D Simplex Noise.
//
// Author: Ian McEwan, Ashima Arts.
//
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
{
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 8.
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

float ridgedMultifractal(vec3 p) {
    float lacunarity = 2.0;
    float gain = 0.5;
    float offset = 1.0;
    float sum = 0.0;
    float freq = 1.0, amp = 0.5;
    float prev = 1.0;
    for(int i=0; i<6; i++) {
        float n = snoise(p * freq);
        n = offset - abs(n);
        n *= n;
        sum += n * amp * prev;
        prev = n;
        freq *= lacunarity;
        amp *= gain;
    }
    return sum;
}
`;

export const sunGlowVertexShader = `
uniform float pointSize;
void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = pointSize;
}
`;

export const sunGlowFragmentShader = `
uniform vec3 glowColor;
void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float d = length(coord);
    if (d > 0.5) discard; // Make it circular

    vec3 white = vec3(1.0);
    vec3 starColor = glowColor;
    vec3 finalColor;
    float alpha;

    if (d <= 0.05) { // 0 to 5% radius (hot core)
        float t = d / 0.05;
        finalColor = mix(white, starColor, t);
        alpha = 1.0;
    } else if (d <= 0.25) { // 5% to 25% radius (main glow)
        float t = (d - 0.05) / 0.20;
        alpha = 1.0 - t * 0.5;
        finalColor = starColor;
    } else { // 25% to 50% radius (outer fade)
        float t = (d - 0.25) / 0.25;
        alpha = 0.5 - t * 0.5;
        finalColor = starColor;
    }
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export const skyVertexShader = `
varying vec3 vWorldPosition;
void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

export const skyFragmentShader = `
varying vec3 vWorldPosition;

uniform vec3 uSunPosition;
uniform vec3 uPlanetCenter;
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform vec3 uCameraPos;
uniform float uTime;

// Scattering Uniforms
uniform vec3 uRayleigh;
uniform vec3 uMie;
uniform float uMieG;
uniform float uDensityFalloff;

// Cloud uniforms
uniform float uCloudCover;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uCloudBottom;
uniform float uCloudTop;

// Simplex noise for clouds
${terrainNoise}

// Function to calculate intersection of a ray with a sphere
vec2 raySphereIntersect(vec3 rayOrigin, vec3 rayDir, vec3 sphereCenter, float sphereRadius) {
    vec3 oc = rayOrigin - sphereCenter;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - sphereRadius * sphereRadius;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0); // No intersection
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

// Rayleigh phase function
float rayleighPhase(float cosTheta) {
    return 3.0 / (16.0 * 3.14159) * (1.0 + cosTheta * cosTheta);
}

// Mie phase function (Henyey-Greenstein)
float henyeyGreensteinPhase(float cosTheta) {
    float g2 = uMieG * uMieG;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * uMieG * cosTheta, 1.5));
}

// Cloud density function
float cloudDensity(vec3 p) {
    float height = length(p - uPlanetCenter);
    float cloudFactor = smoothstep(uCloudBottom, uCloudBottom + 1.0, height) * (1.0 - smoothstep(uCloudTop - 1.0, uCloudTop, height));
    if (cloudFactor < 0.001) return 0.0;

    vec3 p_anim = p + vec3(uTime * uCloudSpeed, 0.0, 0.0);
    float noise = ridgedMultifractal(p_anim * uCloudScale);
    float density = smoothstep(uCloudCover, 1.0, noise);
    return density * cloudFactor;
}

// Optical depth for sun light
float getSunlightOpticalDepth(vec3 samplePoint, vec3 sunDir, vec3 planetCenter, float planetRadius, float atmosphereRadius) {
    vec2 atmosphereIntersect = raySphereIntersect(samplePoint, sunDir, planetCenter, atmosphereRadius);
    if (atmosphereIntersect.y < 0.0) return 0.0;

    vec2 planetIntersect = raySphereIntersect(samplePoint, sunDir, planetCenter, planetRadius);
    if (planetIntersect.x > 0.0) return 1000.0; // In shadow of the planet

    int sunSamples = 8;
    float sunStepSize = atmosphereIntersect.y / float(sunSamples);
    float opticalDepth = 0.0;

    for (int j = 0; j < sunSamples; ++j) {
        vec3 p = samplePoint + sunDir * (float(j) + 0.5) * sunStepSize;
        float height = length(p - planetCenter) - planetRadius;
        float density = exp(-height / uDensityFalloff);
        opticalDepth += density * sunStepSize;
    }
    return opticalDepth;
}


void main() {
    vec3 rayDir = normalize(vWorldPosition - uCameraPos);
    vec3 sunDir = normalize(uSunPosition);
    float cosTheta = dot(rayDir, sunDir);

    // --- Atmospheric Scattering ---
    vec2 planetIntersect = raySphereIntersect(uCameraPos, rayDir, uPlanetCenter, uPlanetRadius);
    vec2 atmosphereIntersect = raySphereIntersect(uCameraPos, rayDir, uPlanetCenter, uAtmosphereRadius);
    
    // If ray doesn't hit atmosphere, it's just space
    if(atmosphereIntersect.x < 0.0 && length(uCameraPos) > uAtmosphereRadius) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Ray march through the atmosphere
    float marchDist = max(0.0, atmosphereIntersect.x);
    float marchEnd = atmosphereIntersect.y;
    
    // If ray hits planet, shorten the march
    if(planetIntersect.x > 0.0) {
        marchEnd = min(marchEnd, planetIntersect.x);
    }

    int numSamples = 32;
    float stepSize = (marchEnd - marchDist) / float(numSamples);

    vec3 transmittance = vec3(1.0);
    vec3 scatteredLight = vec3(0.0);
    
    for(int i = 0; i < numSamples; ++i) {
        vec3 p = uCameraPos + rayDir * (marchDist + (float(i) + 0.5) * stepSize);
        float height = length(p - uPlanetCenter) - uPlanetRadius;
        if (height < 0.0) continue;

        float density = exp(-height / uDensityFalloff);

        // --- Cloud Calculation ---
        float cloud_density = cloudDensity(p);
        vec3 extinction = uRayleigh * density + uMie * density + cloud_density * 2.0; // Combined extinction
        
        vec3 sampleTransmittance = exp(-extinction * stepSize);
        
        // Calculate light scattered at this point
        float sunOpticalDepth = getSunlightOpticalDepth(p, sunDir, uPlanetCenter, uPlanetRadius, uAtmosphereRadius);
        vec3 sunTransmittance = exp(-(uRayleigh * sunOpticalDepth + uMie * sunOpticalDepth + cloudDensity(p) * sunOpticalDepth));

        vec3 inScatter = (uRayleigh * rayleighPhase(cosTheta) + uMie * henyeyGreensteinPhase(cosTheta)) * density;
        
        // Add cloud scattering
        inScatter += cloud_density * henyeyGreensteinPhase(cosTheta) * 1.0;

        scatteredLight += transmittance * inScatter * sunTransmittance * stepSize;
        transmittance *= sampleTransmittance;
    }
    
    // If the ray hits the planet surface, add surface color
    if (planetIntersect.x > 0.0 && planetIntersect.x < atmosphereIntersect.y) {
       // We are looking at the planet, so we see the light reflected from it.
       // A simple Lambertian reflection would be dot(normal, sunDir)
       // but we don't have the normal. So just darken the transmittance.
       transmittance *= 0.1; 
    }

    // Final color is scattered light + sun glare
    float sunDot = dot(rayDir, sunDir);
    float sunGlare = pow(max(0.0, sunDot), 100.0);
    vec3 finalColor = scatteredLight * 20.0 + vec3(1.0, 0.9, 0.8) * sunGlare * transmittance;
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;