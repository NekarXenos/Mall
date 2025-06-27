import * as THREE from 'three';

const CONFIG = {
    PERLIN_SCALE: 10.0,
    ROTATION_MULTIPLIER: 5.0, // Multiplied by PI for full rotations
    BROWNIAN_MOTION_STRENGTH: 0.5,
    VERTICAL_FADE_POWER: 3.0,
    FINAL_FADE_START: 0.2,
    FINAL_FADE_END: 0.5,
    SPIRAL_STRENGTH: 0.01, // Keep this value small for a subtle effect
    COLOR_OVERLAY_VISIBILITY: 1.0, // 0.0 = grayscale, 1.0 = full color
    // --- Tech Uniforms ---
    DUST_LANE_SCALE: 1.0,
    DUST_LANE_MIX_THRESHOLD: 0.7,
    FBM_ITERATIONS: 10, // Number of octaves for fractal brownian motion
    FBM_LACUNARITY: 2.0,      // How much detail is added each octave
    FBM_GAIN: 0.5,            // How much each octave contributes
    RAY_MARCH_STEPS: 20,
    RAY_MARCH_SCALE: 0.2,
    RAY_MARCH_THRESHOLD: 0.6
};

const shaders = {
    vertex: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    noise: `
        // Perlin noise function by Stefan Gustavson
        // https://github.com/stegu/webgl-noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute( permute( permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
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
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }
    `
};

const visualizations = [
    {
        title: '1. Perlin Noise',
        fragment: `
            noise = snoise(vec3(vUv * u_perlin_scale, 0.0));
            finalColor = vec3((noise + 1.0) / 2.0);
        `
    },
    {
        title: '2. Add Vertical Sine',
        fragment: `
            noise = snoise(vec3(vUv * u_perlin_scale, 0.0));
            noise += sin((vUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            finalColor = vec3((noise + 1.0) / 2.0);
        `
    },
    {
        title: '3. Normalize & Enhanced Fade',
        fragment: `
            noise = snoise(vec3(vUv * u_perlin_scale, 0.0));
            noise += sin((vUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            noise = (noise + 1.0) / 2.0;
            noise *= pow(sin(vUv.y * 3.14159), u_vfade_power);
            finalColor = vec3(noise);
        `
    },
    {
        title: '4. Add Rotation & Brownian Motion',
        fragment: `
            // First, calculate the rotated UV coordinate we want to sample from.
            vec2 to_center = vec2(0.5) - vUv;
            float brownian = snoise(vec3(vUv * 20.0, 0.0)) * u_brownian_strength;
            float angle = atan(to_center.y, to_center.x) + length(to_center) * u_rotation_multiplier * 3.14159 + brownian;
            vec2 rotatedUv = vec2(0.5) - vec2(cos(angle), sin(angle)) * length(to_center);

            // Now, calculate the value from Step 3, but using the rotated coordinate.
            // This effectively rotates the result of the previous step.
            noise = snoise(vec3(rotatedUv * u_perlin_scale, 0.0));
            noise += sin((rotatedUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            noise = (noise + 1.0) / 2.0;
            noise *= pow(sin(rotatedUv.y * 3.14159), u_vfade_power);
            finalColor = vec3(noise);
        `
    },
    {
        title: '5. Add Spiral Arms',
        fragment: `
            // First, calculate the rotated UV coordinate from the previous step.
            vec2 to_center = vec2(0.5) - vUv;
            float radius = length(to_center);
            float brownian = snoise(vec3(vUv * 20.0, 0.0)) * u_brownian_strength;
            float angle = atan(to_center.y, to_center.x) + radius * u_rotation_multiplier * 3.14159 + brownian;
            
            // Add the spiral arm distortion to the angle.
            angle += 1.0 / radius * u_spiral_strength;

            vec2 rotatedUv = vec2(0.5) - vec2(cos(angle), sin(angle)) * radius;

            // Now, calculate the value from Step 3, but using the new spiraled coordinate.
            noise = snoise(vec3(rotatedUv * u_perlin_scale, 0.0));
            noise += sin((rotatedUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            noise = (noise + 1.0) / 2.0;
            noise *= pow(sin(rotatedUv.y * 3.14159), u_vfade_power);
            finalColor = vec3(noise);
        `
    },
    {
        title: '6. Final Composite (Gradual Fade)',
        fragment: `
            // Calculate the value of step 5 first.
            vec2 to_center = vec2(0.5) - vUv;
            float radius = length(to_center);
            float brownian = snoise(vec3(vUv * 20.0, 0.0)) * u_brownian_strength;
            float angle = atan(to_center.y, to_center.x) + radius * u_rotation_multiplier * 3.14159 + brownian;
            angle += 1.0 / radius * u_spiral_strength;
            vec2 rotatedUv = vec2(0.5) - vec2(cos(angle), sin(angle)) * radius;

            float step5_val = snoise(vec3(rotatedUv * u_perlin_scale, 0.0));
            step5_val += sin((rotatedUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            step5_val = (step5_val + 1.0) / 2.0;
            step5_val *= pow(sin(rotatedUv.y * 3.14159), u_vfade_power);

            // Now, add the final effects to the result of step 5.
            noise = step5_val;
            noise += (1.0 - radius * 2.0); // Add circular sine based on screen position
            noise *= 1.0 - smoothstep(u_final_fade_start, u_final_fade_end, radius); // Apply final fade based on screen position
            finalColor = vec3(noise);
        `
    },
    {
        title: '7. Apply Color Ramp',
        fragment: `
            // Calculate the final grayscale value from the previous step
            vec2 to_center = vec2(0.5) - vUv;
            float radius = length(to_center);
            float brownian = snoise(vec3(vUv * 20.0, 0.0)) * u_brownian_strength;
            float angle = atan(to_center.y, to_center.x) + radius * u_rotation_multiplier * 3.14159 + brownian;
            angle += 1.0 / radius * u_spiral_strength;
            vec2 rotatedUv = vec2(0.5) - vec2(cos(angle), sin(angle)) * radius;

            float grayscale_val = snoise(vec3(rotatedUv * u_perlin_scale, 0.0));
            grayscale_val += sin((rotatedUv.y - 0.5) * 2.0 * 3.14159) * 0.5;
            grayscale_val = (grayscale_val + 1.0) / 2.0;
            grayscale_val *= pow(sin(rotatedUv.y * 3.14159), u_vfade_power);
            grayscale_val += (1.0 - radius * 2.0);
            grayscale_val *= 1.0 - smoothstep(u_final_fade_start, u_final_fade_end, radius);

            // Create a second noise value (fBm) to act as a color mask
            float fbm_mask = 0.0;
            float amp = 0.5;
            vec2 uv = vUv;
            for (int i = 0; i < 5; i++) {
                fbm_mask += snoise(vec3(uv * 5.0, 0.0)) * amp;
                uv *= 2.0;
                amp *= 0.5;
            }
            fbm_mask = (fbm_mask + 1.0) / 2.0;

            // Define the color ramp
            vec3 color_brightest = vec3(1.0, 1.0, 1.0);
            vec3 color_hot = vec3(1.0, 1.0, 0.85);
            vec3 color_mid = vec3(1.0, 0.6, 0.3);
            vec3 color_cool = vec3(0.4, 0.5, 1.0);
            vec3 color_space = vec3(0.0, 0.0, 0.0);

            // Use the fbm_mask to blend the colors more randomly
            float blend_factor = fbm_mask * 0.2; // Control the strength of the random blending
            vec3 colored_result = mix(color_space, color_cool, smoothstep(0.0, 0.25 + blend_factor, grayscale_val));
            colored_result = mix(colored_result, color_mid, smoothstep(0.25 + blend_factor, 0.5 + blend_factor, grayscale_val));
            colored_result = mix(colored_result, color_hot, smoothstep(0.5 + blend_factor, 0.75, grayscale_val));
            colored_result = mix(colored_result, color_brightest, smoothstep(0.75, 0.9, grayscale_val));

            // Blend between grayscale and colored result based on visibility uniform
            finalColor = mix(vec3(grayscale_val), colored_result, u_color_overlay_visibility);
        `
    },
    {
        title: 'Tech: Spiral Arms',
        fragment: `
            vec2 to_center = vec2(0.5) - vUv;
            float angle = atan(to_center.y, to_center.x) + 1.0 / length(to_center) * u_spiral_strength;
            float radius = length(to_center);
            noise = snoise(vec3(angle * 5.0, radius * 10.0, 0.0));
            finalColor = vec3((noise + 1.0) / 2.0) * (1.0 - smoothstep(0.48, 0.5, radius));
        `
    },
    {
        title: 'Tech: Galactic Core',
        fragment: `
            float radius = length(vec2(0.5) - vUv);
            noise = pow(1.0 - radius, 5.0);
            finalColor = vec3(noise);
        `
    },
    {
        title: 'Tech: Dust Lanes',
        fragment: `
            float dust = snoise(vec3(vUv * u_dust_scale, 0.0));
            noise = snoise(vec3(vUv * 3.0, 0.0));
            noise = mix(noise, 0.0, smoothstep(u_dust_threshold, u_dust_threshold + 0.2, dust));
            finalColor = vec3((noise + 1.0) / 2.0);
        `
    },
    {
        title: 'Tech: Fractal Brownian Motion',
        fragment: `
            float fbm = 0.0;
            float amp = 0.5;
            vec2 uv = vUv;
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
            for (int i = 0; i < u_fbm_iterations; i++) {
                fbm += snoise(vec3(uv * 3.0, 0.0)) * amp;
                uv *= u_fbm_lacunarity;
                uv *= rot;
                amp *= u_fbm_gain;
            }
            finalColor = vec3((fbm + 1.0) / 2.0);
        `
    },
    {
        title: 'Tech: Simple Ray Marching',
        fragment: `
            vec3 ro = vec3(vUv, 0.0);
            vec3 rd = vec3(0.0, 0.0, 1.0);
            float t = 0.0;
            for(int i = 0; i < u_ray_steps; i++) {
                vec3 p = ro + rd * t;
                float d = snoise(p * u_ray_scale) - u_ray_threshold;
                t += d * 0.2;
            }
            finalColor = vec3(t * 0.2);
        `
    }
];

let fullscreenRenderer, fullscreenScene;

function createVisualization(container, viz, isFullscreen = false) {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const size = isFullscreen ? Math.min(window.innerWidth, window.innerHeight) * 0.9 : 256;
    renderer.setSize(size, size);
    container.appendChild(renderer.domElement);

    const uniforms = {
        u_perlin_scale: { value: CONFIG.PERLIN_SCALE },
        u_rotation_multiplier: { value: CONFIG.ROTATION_MULTIPLIER },
        u_brownian_strength: { value: CONFIG.BROWNIAN_MOTION_STRENGTH },
        u_vfade_power: { value: CONFIG.VERTICAL_FADE_POWER },
        u_final_fade_start: { value: CONFIG.FINAL_FADE_START },
        u_final_fade_end: { value: CONFIG.FINAL_FADE_END },
        u_spiral_strength: { value: CONFIG.SPIRAL_STRENGTH },
        u_dust_scale: { value: CONFIG.DUST_LANE_SCALE },
        u_dust_threshold: { value: CONFIG.DUST_LANE_MIX_THRESHOLD },
        u_fbm_iterations: { value: CONFIG.FBM_ITERATIONS },
        u_fbm_lacunarity: { value: CONFIG.FBM_LACUNARITY },
        u_fbm_gain: { value: CONFIG.FBM_GAIN },
        u_ray_steps: { value: CONFIG.RAY_MARCH_STEPS },
        u_ray_scale: { value: CONFIG.RAY_MARCH_SCALE },
        u_ray_threshold: { value: CONFIG.RAY_MARCH_THRESHOLD },
        u_color_overlay_visibility: { value: CONFIG.COLOR_OVERLAY_VISIBILITY },
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shaders.vertex,
        fragmentShader: `
            varying vec2 vUv;
            uniform float u_perlin_scale;
            uniform float u_rotation_multiplier;
            uniform float u_brownian_strength;
            uniform float u_vfade_power;
            uniform float u_final_fade_start;
            uniform float u_final_fade_end;
            uniform float u_spiral_strength;
            uniform float u_dust_scale;
            uniform float u_dust_threshold;
            uniform int u_fbm_iterations;
            uniform float u_fbm_lacunarity;
            uniform float u_fbm_gain;
            uniform int u_ray_steps;
            uniform float u_ray_scale;
            uniform float u_ray_threshold;
            uniform float u_color_overlay_visibility;

            ${shaders.noise}

            void main() {
                float noise;
                vec3 finalColor;
                ${viz.fragment}
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);
    renderer.render(scene, camera);

    if (isFullscreen) {
        fullscreenRenderer = renderer;
        fullscreenScene = scene;
    }
}

const gridContainer = document.getElementById('grid-container');
const fullscreenOverlay = document.getElementById('fullscreen-overlay');
const fullscreenContent = document.getElementById('fullscreen-content');
const closeButton = document.getElementById('close-fullscreen');

// Main galaxy view setup
const mainCanvas = document.getElementById('main-canvas');
const mainCanvasContainer = document.getElementById('main-canvas-container');
const multiStageContainer = document.getElementById('multi-stage-container');

let mainRenderer, mainScene, mainCamera;

function initMainGalaxy() {
    mainScene = new THREE.Scene();
    mainCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    mainCamera.position.z = 1;

    mainRenderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true });
    mainRenderer.setSize(window.innerWidth, window.innerHeight);

    const uniforms = {
        u_perlin_scale: { value: CONFIG.PERLIN_SCALE },
        u_rotation_multiplier: { value: CONFIG.ROTATION_MULTIPLIER },
        u_brownian_strength: { value: CONFIG.BROWNIAN_MOTION_STRENGTH },
        u_vfade_power: { value: CONFIG.VERTICAL_FADE_POWER },
        u_final_fade_start: { value: CONFIG.FINAL_FADE_START },
        u_final_fade_end: { value: CONFIG.FINAL_FADE_END },
        u_spiral_strength: { value: CONFIG.SPIRAL_STRENGTH },
        u_dust_scale: { value: CONFIG.DUST_LANE_SCALE },
        u_dust_threshold: { value: CONFIG.DUST_LANE_MIX_THRESHOLD },
        u_fbm_iterations: { value: CONFIG.FBM_ITERATIONS },
        u_fbm_lacunarity: { value: CONFIG.FBM_LACUNARITY },
        u_fbm_gain: { value: CONFIG.FBM_GAIN },
        u_ray_steps: { value: CONFIG.RAY_MARCH_STEPS },
        u_ray_scale: { value: CONFIG.RAY_MARCH_SCALE },
        u_ray_threshold: { value: CONFIG.RAY_MARCH_THRESHOLD },
        u_color_overlay_visibility: { value: CONFIG.COLOR_OVERLAY_VISIBILITY },
    };

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: shaders.vertex,
        fragmentShader: `
            varying vec2 vUv;
            uniform float u_perlin_scale;
            uniform float u_rotation_multiplier;
            uniform float u_brownian_strength;
            uniform float u_vfade_power;
            uniform float u_final_fade_start;
            uniform float u_final_fade_end;
            uniform float u_spiral_strength;
            uniform float u_dust_scale;
            uniform float u_dust_threshold;
            uniform int u_fbm_iterations;
            uniform float u_fbm_lacunarity;
            uniform float u_fbm_gain;
            uniform int u_ray_steps;
            uniform float u_ray_scale;
            uniform float u_ray_threshold;
            uniform float u_color_overlay_visibility;

            ${shaders.noise}

            void main() {
                float noise;
                vec3 finalColor;
                ${visualizations[6].fragment} // Use the fragment shader from the final step (index 6 for 7th step)
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });

    const plane = new THREE.Mesh(geometry, material);
    mainScene.add(plane);

    function animateMain() {
        requestAnimationFrame(animateMain);
        mainRenderer.render(mainScene, mainCamera);
    }
    animateMain();

    window.addEventListener('resize', () => {
        mainRenderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function showMultiStageView() {
    mainCanvasContainer.style.display = 'none';
    multiStageContainer.classList.add('show');
    if (gridContainer.children.length === 0) { // Only populate once
        visualizations.forEach(viz => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';

            const canvasContainer = document.createElement('div');
            createVisualization(canvasContainer, viz);

            const description = document.createElement('p');
            description.textContent = viz.title;

            const button = document.createElement('button');
            button.textContent = 'Full Screen';
            button.onclick = () => {
                fullscreenContent.innerHTML = ''; // Clear previous content
                createVisualization(fullscreenContent, viz, true);
                fullscreenOverlay.classList.add('show');
            };

            cell.appendChild(canvasContainer);
            cell.appendChild(description);
            cell.appendChild(button);
            gridContainer.appendChild(cell);
        });
    }
}

function showMainGalaxyView() {
    multiStageContainer.classList.remove('show');
    mainCanvasContainer.style.display = 'flex';
}

// Initialize main galaxy view on load
initMainGalaxy();

// Keyboard listener for 'P' key
document.addEventListener('keydown', (event) => {
    if (event.key === 'p' || event.key === 'P') {
        if (multiStageContainer.classList.contains('show')) {
            showMainGalaxyView();
        } else {
            showMultiStageView();
        }
    }
});

closeButton.onclick = () => {
    fullscreenOverlay.classList.remove('show');
    // Cleanup WebGL context
    if (fullscreenRenderer) {
        fullscreenRenderer.dispose();
        fullscreenRenderer.forceContextLoss();
        fullscreenContent.innerHTML = '';
        fullscreenRenderer = null;
        fullscreenScene = null;
    }
};