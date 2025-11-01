import * as THREE from 'three';

// Vertex shader for black hole bubble
export const blackHoleBubbleVertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vPosition;
    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

// Fragment shader for black hole bubble
export const blackHoleBubbleFragmentShader = `
    uniform float uTime;
    // --- Fresnel Uniforms ---
    uniform float uFresnelAngleWhite;
    uniform float uFresnelAngleBlack;
    uniform float uFresnelPeakWaveCount;
    uniform float uFresnelPeakWaveSpeed;
    uniform float uFresnelTroughWaveCount;
    uniform float uFresnelTroughWaveSpeed;

    // --- General Effect Uniforms ---
    uniform vec3 uPeakColor;
    uniform float uPeakStrength;
    uniform float uNoiseStrength;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vPosition;

    float deg2rad(float degrees) {
        return degrees * 3.14159265359 / 180.0;
    }

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);

        vec3 orange = vec3(1.0, 0.5, 0.0);
        vec3 white = vec3(1.0);
        vec3 black = vec3(0.0);

        // --- Fresnel Shading & Transparency ---
        vec3 fresnelColor = vec3(0.0);
        float fresnelAlpha = 0.0;
        float dotProduct = dot(normal, viewDir);
        float dot_white_peak = cos(deg2rad(90.0 - uFresnelAngleWhite));
        float dot_black_edge = cos(deg2rad(90.0 - uFresnelAngleBlack));

        // Color Gradient
        if (dotProduct > 0.0 && dotProduct < dot_black_edge) {
            if (dotProduct < dot_white_peak) {
                float t = dotProduct / dot_white_peak;
                vec3 blackToOrange = mix(black, orange, t * 2.0);
                vec3 orangeToWhite = mix(orange, white, (t - 0.5) * 2.0);
                fresnelColor = mix(blackToOrange, orangeToWhite, step(0.5, t));
            } else {
                float t = (dotProduct - dot_white_peak) / (dot_black_edge - dot_white_peak);
                vec3 whiteToOrange = mix(white, orange, t * 2.0);
                vec3 orangeToBlack = mix(orange, black, (t - 0.5) * 2.0);
                fresnelColor = mix(whiteToOrange, orangeToBlack, step(0.5, t));
            }
        }

        // Transparency Bands
        if (dotProduct > 0.0 && dotProduct < dot_black_edge) {
            float noise = (random(vPosition.xy * 10.0) - 0.5) * uNoiseStrength;
            float t = dotProduct / dot_black_edge + noise;
            
            // Peak wave
            float peak_arg = t * uFresnelPeakWaveCount * 3.14159 - uTime * uFresnelPeakWaveSpeed;
            float peak_contribution = max(0.0, sin(peak_arg));

            // Trough wave
            float trough_arg = t * uFresnelTroughWaveCount * 3.14159 - uTime * uFresnelTroughWaveSpeed;
            float trough_contribution = max(0.0, -sin(trough_arg));

            float combined_val = peak_contribution + trough_contribution;

            fresnelAlpha = clamp(combined_val * 2.0, 0.0, 1.0);
            float peak_factor = smoothstep(0.6, 1.0, combined_val);
            fresnelColor += uPeakColor * peak_factor * uPeakStrength;
        }

        gl_FragColor = vec4(fresnelColor, fresnelAlpha);
    }
`;

// Vertex shader for accretion disk
export const accretionDiskVertexShader = `
    varying vec3 vWorldPos;
    void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// Fragment shader for accretion disk
export const accretionDiskFragmentShader = `
    varying vec3 vWorldPos;
    uniform float time;
    uniform float innerRadius;
    uniform float outerRadius;

    // Noise functions for disk texture
    float hash(float n) { return fract(sin(n) * 753.5453); }
    float noise(vec3 x) {
        vec3 p = floor(x); vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float n = p.x + p.y * 157.0 + 113.0 * p.z;
        return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                      mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
                  mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                      mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y), f.z);
    }
    float fbm(vec3 pos) {
        float t = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
            t += noise(pos) * amp;
            pos *= 2.0;
            amp *= 0.5;
        }
        return t;
    }

    void main() {
        float dist = length(vWorldPos.xz);
        float angle = atan(vWorldPos.z, vWorldPos.x);

        // Add epsilon to prevent division by zero
        float safe_dist = dist + 0.0001;
        float diskTwist = 10.0 / sqrt(safe_dist);
        vec3 uvw = vec3(angle / (2.0 * 3.14159) - diskTwist, dist, 0.0);
        
        float densityVariation = fbm(uvw * 2.0);
        
        float radialProfile = smoothstep(innerRadius, innerRadius + 1.0, dist) * (1.0 - smoothstep(outerRadius - 1.0, outerRadius, dist));
        
        float density = radialProfile * densityVariation;
        
        vec3 color = mix(vec3(1.0, 0.5, 0.0), vec3(0.8, 0.2, 0.0), (dist - innerRadius) / (outerRadius - innerRadius));
        
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 velocityDir = normalize(vec3(-vWorldPos.z, 0.0, vWorldPos.x));
        float doppler = dot(viewDir, velocityDir);
        
        color.r *= 1.0 - doppler * 0.3;
        color.b *= 1.0 + doppler * 0.3;

        float gravitationalShift = 1.0 - 1.0 / sqrt(safe_dist);
        color *= gravitationalShift;

        gl_FragColor = vec4(color, density * 1.5);
    }
`;

// Vertex shader for particle jets
export const jetVertexShader = `
    attribute float aU;
    attribute float aHem;
    attribute float aPhase;
    uniform float time; 
    uniform float R; 
    uniform float r; 
    uniform float speed; 
    uniform vec2 tilt;
    uniform float diskInner; 
    uniform float diskOuter; 
    uniform float bhRadius;
    varying float vHeat;

    vec3 tiltX(vec3 p, float s, float c){ 
        return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); 
    }

    void main(){
      float t = fract(aPhase + time * speed);
      float split = 0.5;
      vec3 p;
      float heat = 0.0;

      if (t < split) {
        float tt = t / split;
        float v0 = acos(-R/r);
        float v = mix(v0 * aHem, 0.0, tt);
        float swirl = 2.5 * (1.0 - abs(v)/1.5707963) * tt;
        float u = aU + swirl;
        vec3 onSpindle = vec3(
            (R + r * cos(v)) * cos(u),
            r * sin(v),
            (R + r * cos(v)) * sin(u)
        );
        p = tiltX(onSpindle, tilt.x, tilt.y);
        heat = 1.0 - abs(v)/1.5707963;
      } else {
        float s = (t - split) / (1.0 - split);
        float startR = R + r;
        float targetR = diskInner * 0.98;
        float rr = mix(startR, targetR, smoothstep(0.0, 1.0, s));
        float ang = aU + 10.0 * s;
        vec3 inPlane = vec3(rr * cos(ang), rr * sin(ang), 0.0);
        float settle = 0.2 * (1.0 - s);
        p = tiltX(vec3(inPlane.x, inPlane.y + settle, inPlane.z), tilt.x, tilt.y);
        heat = 0.0;
      }
      vHeat = heat;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      float dist = length((modelViewMatrix * vec4(p,1.0)).xyz);
      gl_PointSize = 90.0 / dist;
    }
`;

// Fragment shader for particle jets
export const jetFragmentShader = `
    precision highp float; 
    varying float vHeat;
    void main(){
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float d = dot(uv, uv);
      if (d > 1.0) discard;
      float glow = pow(1.0 - d, 2.5);
      vec3 cold = vec3(0.2, 0.6, 1.0);
      vec3 mid = vec3(0.8, 0.95, 1.0);
      vec3 hot = vec3(1.0, 0.5, 0.0);
      vec3 c = mix(mix(cold, mid, smoothstep(0.0, 0.6, vHeat)), hot, smoothstep(0.6, 1.0, vHeat));
      gl_FragColor = vec4(c * glow, glow);
    }
`;

// Compute minor radius for torus
function computeMinorRadius(R, a) {
    return Math.sqrt(R * R - a * a);
}

/**
 * Create a black hole bubble effect
 * @param {number} size - The radius of the black hole bubble sphere
 * @param {THREE.Camera} camera - The camera (for accretion disk uniforms)
 * @returns {THREE.Group} - A group containing the bubble, disk, and jets
 */
export function createBlackHoleBubble(size, camera) {
    const group = new THREE.Group();
    group.userData.isBlackHoleBubble = true;

    // --- Black Hole Sphere ---
    const bhMaterial = new THREE.ShaderMaterial({
        vertexShader: blackHoleBubbleVertexShader,
        fragmentShader: blackHoleBubbleFragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uFresnelAngleWhite: { value: 30.0 },
            uFresnelAngleBlack: { value: 35.0 },
            uFresnelPeakWaveCount: { value: 10.0 },
            uFresnelPeakWaveSpeed: { value: 5.0 },
            uFresnelTroughWaveCount: { value: 5.0 },
            uFresnelTroughWaveSpeed: { value: -5.0 },
            uPeakColor: { value: new THREE.Color("#FF8800") },
            uPeakStrength: { value: 0.6 },
            uNoiseStrength: { value: 0.09 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const bhSphere = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), bhMaterial);
    group.add(bhSphere);
    group.userData.bubble = bhSphere;

    // --- Accretion Disk ---
    const diskInner = size * 1.25;
    const diskOuter = size * 3.125;
    const diskGeo = new THREE.RingGeometry(diskInner, diskOuter, 128, 1);
    const diskMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            time: { value: 0 },
            innerRadius: { value: diskInner },
            outerRadius: { value: diskOuter }
        },
        vertexShader: accretionDiskVertexShader,
        fragmentShader: accretionDiskFragmentShader
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.rotation.x = Math.PI / 2;
    group.add(disk);
    group.userData.disk = disk;

    // --- Particle Jets & Accretion ---
    const jetCount = 1000;
    const jetGeo = new THREE.BufferGeometry();
    const jetPos = new Float32Array(jetCount * 3);
    const jetA = new Float32Array(jetCount);
    const jetHem = new Float32Array(jetCount);
    const jetPhase = new Float32Array(jetCount);

    for (let i = 0; i < jetCount; i++) {
        jetPos[i * 3 + 0] = 0; 
        jetPos[i * 3 + 1] = 0; 
        jetPos[i * 3 + 2] = 0;
        jetA[i] = Math.random() * Math.PI * 2;
        jetHem[i] = Math.random() < 0.5 ? 1 : -1;
        jetPhase[i] = Math.random();
    }

    jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3));
    jetGeo.setAttribute('aU', new THREE.BufferAttribute(jetA, 1));
    jetGeo.setAttribute('aHem', new THREE.BufferAttribute(jetHem, 1));
    jetGeo.setAttribute('aPhase', new THREE.BufferAttribute(jetPhase, 1));

    const R_torus = size * 2.0;
    let r_torus = computeMinorRadius(R_torus, size);

    const jetMat = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            time: { value: 0 },
            R: { value: R_torus },
            r: { value: r_torus },
            speed: { value: 0.085 },
            tilt: { value: new THREE.Vector2(Math.sin(disk.rotation.x), Math.cos(disk.rotation.x)) },
            diskInner: { value: diskInner },
            diskOuter: { value: diskOuter },
            bhRadius: { value: size }
        },
        vertexShader: jetVertexShader,
        fragmentShader: jetFragmentShader
    });
    const jets = new THREE.Points(jetGeo, jetMat);
    group.add(jets);
    group.userData.jets = jets;

    return group;
}

/**
 * Update black hole bubble animations
 * @param {THREE.Group} bubbleGroup - The black hole bubble group
 * @param {number} deltaTime - Time elapsed since last frame
 * @param {THREE.Camera} camera - The camera for position updates
 */
export function updateBlackHoleBubble(bubbleGroup, deltaTime, camera) {
    if (!bubbleGroup || !bubbleGroup.userData.isBlackHoleBubble) return;

    const bubble = bubbleGroup.userData.bubble;
    const disk = bubbleGroup.userData.disk;
    const jets = bubbleGroup.userData.jets;

    if (bubble && bubble.material.uniforms) {
        bubble.material.uniforms.uTime.value += deltaTime;
    }

    if (disk && disk.material.uniforms) {
        disk.material.uniforms.time.value += deltaTime;
        disk.rotation.z += deltaTime * 0.05; // Slow rotation
    }

    if (jets && jets.material.uniforms) {
        jets.material.uniforms.time.value += deltaTime;
    }
}
