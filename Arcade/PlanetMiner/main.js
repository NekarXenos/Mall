import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { MATERIALS } from './materials.js';
import { EdgeVertexIndices, TriangleTable, generateMarchingCubesGeometry } from './marchingCubes.js';
import { terrainNoise, sunGlowVertexShader, sunGlowFragmentShader, skyVertexShader, skyFragmentShader } from './shaders.js';

// Set up basic Three.js scene components
let scene, camera, renderer, raycaster;
let marchingCubesMesh, marchingCubesMeshMoon;
let waterMesh;
let torchLight; // Global variable for the torch spotlight
let sky, sun; // NEW: For atmosphere

// --- Inventory & Building ---
let inventory = {};
const buildableMaterials = [];
let selectedMaterialIndex = 0;
let cubes = [];
let cubeParent, moonCubeParent;
let moonRotation = new THREE.Quaternion();
const builtCubeMaterials = {};

// --- Grass Instancing & LOD ---
let grassLODs = []; // Will hold our InstancedMesh objects
const GRASS_LOD_DISTANCES = [50, 100, 150]; // Distances for LOD switching
const GRASS_LOD_BLADES = [3, 2, 1]; // Blades per patch for each LOD
const MAX_GRASS_PER_LOD = 20000; // Max instances per LOD mesh
let voxelToGrassMap = new Map(); // Maps voxel coords to instance index

let anemoneLODs = [];
let voxelToAnemoneMap = new Map();

// --- Player, Camera, and Controls ---
let player;
const clock = new THREE.Clock();
const thirdPersonCameraOffset = new THREE.Vector3(0, 3, 8);
let isFirstPersonView = true;
// Updated player settings from PlanetMiner (2).html
const playerSettings = {
    height: 2,
    speed: 5.0, // Units per second
    gravityStrength: 0.1, // per-frame acceleration
    jumpStrength: 5, // per-jump impulse
    sensitivity: 0.002,
    maxHealth: 100
};
const planetCenter = new THREE.Vector3(0, 0, 0);
let dominantBodyPosition = planetCenter;
const keys = { w: false, a: false, s: false, d: false, space: false, c: false, ctrl: false, arrowLeft: false, arrowRight: false }; // Added arrowLeft and arrowRight
let isLocked = false;

// --- Particle Systems ---
let bubbleParticles = [];
let splashParticles = [];
let lastBubbleTime = 0;
let lastSplashTime = 0;
let wasInWater = false; // To detect entering/exiting water

// Mobile control variables (declared globally for setupMobileControls)
let mobileJoystickTouchId = -1;
let joystickCenter = new THREE.Vector2();
const joystickRadius = 50;
const joystickBase = document.getElementById('joystick-base');
const joystickThumb = document.getElementById('joystick-thumb');
const mineButton = document.getElementById('mine-button');
const buildButton = document.getElementById('build-button');
const mobileControls = document.getElementById('mobile-controls');

// Voxel grid properties
const GRID_SIZE = 100;
const BLOCK_SIZE = 1;
const PLANET_RADIUS_FACTOR = 0.8;
const ISO_LEVEL = 0.5;
const PLANET_RADIUS = GRID_SIZE / 2 * BLOCK_SIZE * PLANET_RADIUS_FACTOR;
const WATER_LEVEL_OFFSET = -10;

// Moon properties
const GRID_SIZE_MOON = 20;
const MOON_RADIUS_FACTOR = 0.9;
const MOON_ORBIT_DISTANCE = GRID_SIZE * BLOCK_SIZE * 0.75;
const MOON_RADIUS = GRID_SIZE_MOON / 2 * BLOCK_SIZE * MOON_RADIUS_FACTOR;

// --- NEW: Atmosphere & Cloud Parameters ---
const ATMOSPHERE_THICKNESS = 15.0; // The height of the atmosphere from the planet's surface.
const ATMOSPHERE_TOP_HEIGHT = PLANET_RADIUS + ATMOSPHERE_THICKNESS;
const DENSITY_FALLOFF = 8; // 8.0; // How quickly the atmosphere thins out. Higher is thicker.
const RAYLEIGH_COEFFICIENTS = new THREE.Vector3(5.8e-4, 1.35e-3, 3.31e-3); // THREE.Vector3(5.8e-6, 1.35e-5, 3.31e-5);
const MIE_COEFFICIENTS = new THREE.Vector3(2.0e-5, 2.0e-5, 2.0e-5); // THREE.Vector3(2.0e-5, 2.0e-5, 2.0e-5);
const MIE_ECCENTRICITY = 0.76; // Directionality of Mie scattering
const CLOUD_BOTTOM_ALTITUDE = 6; // 6.0; // Height above planet surface where clouds start
const CLOUD_TOP_ALTITUDE = 8; // 10.0; // Height above planet surface where clouds end

let voxelData = [], voxelDataMoon = [];
let moonPosition = new THREE.Vector3();
const simplex = new SimplexNoise();

// Noise parameters
const initialNoiseScale = 0.02, noiseStrength = 0.5, octaves = 6, lacunarity = 2.0, persistence = 0.5;

// Water parameters (replaces sliders)
const waterSettings = {
    waveSpeed: 1.5,
    waveAmplitude: 100,
    blueFreq: 1.0,
    greenFreq: 20.0
};

// DOM Elements
const overlay = document.getElementById('overlay');
const messageBox = document.getElementById('message-box');
let canvas;

/**
 * Determines the material type at a given world point based on various environmental factors.
 * @param {THREE.Vector3} worldPoint - The point in world space to check.
 * @param {THREE.Vector3} surfaceNormal - The normal of the surface at the world point.
 * @param {boolean} onMoon - Whether the point is on the moon.
 * @returns {object} The material object from the MATERIALS constant.
 */
function getMaterialAtPoint(worldPoint, surfaceNormal, onMoon = false) {
    const center = onMoon ? moonPosition : planetCenter;
    const radius = onMoon ? MOON_RADIUS : PLANET_RADIUS;
    const waterRadius = PLANET_RADIUS + WATER_LEVEL_OFFSET;

    // --- Corrected Noise Calculation ---
    let terrainNoise;
    if (onMoon) {
        // For the moon, use its specific noise parameters and local coordinates
        const localPoint = worldPoint.clone().sub(moonPosition);
        terrainNoise = getRidgedMultifractalNoise(localPoint.x, localPoint.y, localPoint.z, simplex, 0.05, 0.3, 5, 2.2, 0.4);
    } else {
        // For the planet, use its noise parameters and world coordinates
        terrainNoise = getRidgedMultifractalNoise(worldPoint.x, worldPoint.y, worldPoint.z, simplex, initialNoiseScale, noiseStrength, octaves, lacunarity, persistence);
    }
    // --- End Correction ---

    // 1. Calculate depth from the "true" noise-defined surface
    const distSurface = (1.0 + terrainNoise - ISO_LEVEL) * radius;
    const distCenter = worldPoint.distanceTo(center);
    const depth = distSurface - distCenter;

    // 2. Handle subsurface materials first based on depth
    if (onMoon) {
        if (depth > 7) return MATERIALS.LAVA;
        if (depth > 2) return MATERIALS.MOON_ROCK;
        if (depth >= 0) return MATERIALS.MOON_SAND;
    } else {
        if (depth > 15) return MATERIALS.LAVA;
        if (depth > 3) return MATERIALS.ROCK;
        if (depth >= 0) return MATERIALS.SOIL;
    }

    // 3. Handle surface materials (where depth is near zero or negative)
    const upVector = worldPoint.clone().sub(center).normalize();
    const slope = 1.0 - Math.abs(surfaceNormal.dot(upVector)); // 0 = flat, 1 = vertical

    if (onMoon) {
        return slope > 0.4 ? MATERIALS.MOON_ROCK : MATERIALS.MOON_SAND;
    }

    // --- NEW: Polar Ice Cap Logic for Planet ---
    const poleThreshold = 0.85; // How far from the pole the ice extends. 1.0 is the pole.
    if (!onMoon && Math.abs(upVector.y) > poleThreshold) {
        return MATERIALS.ICE;
    }

    // Planet surface logic
    const heightAboveWater = distCenter - waterRadius;
    const isVertical = slope > 0.7; // Very steep, definitely rock
    const isSteep = slope > 0.3; // Moderately steep

    // All overhangs/steep areas should be rock
    if (isVertical || isSteep) {
        return MATERIALS.ROCK;
    }

    if (heightAboveWater < -1.0) { // Deep underwater
        const underwaterPattern = simplex.noise3D(worldPoint.x * 2, worldPoint.y * 2, worldPoint.z * 2);
        // Replaced seaweed with anemone: if it was seaweed or anemone, now it's anemone. Otherwise, sand.
        if (underwaterPattern < -0.3 || underwaterPattern > 0.3) return MATERIALS.ANEMONE;
        return MATERIALS.SAND;
    }

    if (Math.abs(heightAboveWater) <= 1.0) { // Shoreline
        // If not steep (already handled above), it's sand at the shoreline
        return MATERIALS.SAND;
    }

    if (heightAboveWater > 1.0) { // Above shoreline
        // If not steep (already handled above), it's only grass for near horizontal areas
        return MATERIALS.GRASS;
    }

    return MATERIALS.SOIL; // Default fallback (should be rarely reached now)
}

function getRidgedMultifractalNoise(x, y, z, noiseGenerator, scale, strength, numOctaves, lac, pers) {
    let totalNoise = 0, amplitude = 1, frequency = scale, maxAmplitudeSum = 0;
    for (let i = 0; i < numOctaves; i++) {
        let n = 1.0 - Math.abs(noiseGenerator.noise3D(x * frequency, y * frequency, z * frequency));
        n *= n;
        totalNoise += n * amplitude;
        maxAmplitudeSum += amplitude;
        amplitude *= pers;
        frequency *= lac;
    }
    return (totalNoise / maxAmplitudeSum) * strength;
}


function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Set background to black for space
    // Fog is now handled by the sky shader

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000); // Increased far plane for sky

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.body.appendChild(renderer.domElement);
    canvas = renderer.domElement;

     // --- Add a visible Sun ---
    const sunGeometry = new THREE.SphereGeometry(20, 32, 32);
    //const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffFF, fog: false }); // 0xffffee
    const sunMaterial = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 1000, side: THREE.FrontSide, fog: false }); // 0xffffee
    sun = new THREE.Mesh(sunGeometry, sunMaterial); // Assign to the global 'sun' variable
    sun.castShadow = false; // Sun does not cast shadows
    sun.receiveShadow = false; // Sun does not receive shadows
    // Lighting will be updated dynamically based on sun position
    const ambientLight = new THREE.AmbientLight(0xccddee, 0.5); // Reduced ambient light
    scene.add(ambientLight);

    // Use a PointLight attached to the sun mesh for unified lighting
    const pointLight = new THREE.PointLight(0xffffff, 4, 0, 0); // color, intensity, distance (0=infinite), decay
    sun.add(pointLight);

    // --- NEW: Atmosphere and Sky ---
    initSky();

    scene.add(sun); // The sun's position will be set in the animate loop

    // --- Add outer glow to the Sun (GalacticUFOv3 style) ---
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            pointSize: { value: 50 }, // Adjust size of the glow
            glowColor: { value: new THREE.Color(0xffd2a1) } // Orange tint
        },
        vertexShader: sunGlowVertexShader,
        fragmentShader: sunGlowFragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: true
    });

    sun.add(new THREE.Points(glowGeometry, glowMaterial));



    // Setup the torch spotlight
    torchLight = new THREE.SpotLight(0xffffff, 0, 50, Math.PI / 6, 0.5, 2); // Color, intensity (0 initially), distance, angle, penumbra, decay
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.width = 1024;
    torchLight.shadow.mapSize.height = 1024;
    torchLight.shadow.camera.near = 0.5;
    torchLight.shadow.camera.far = 50;
    torchLight.shadow.camera.fov = 30; // Match spotlight angle
    scene.add(torchLight); // Add torch light directly to the scene
    torchLight.target = new THREE.Object3D(); // Target for the spotlight
    scene.add(torchLight.target); // Add the target directly to the scene

    raycaster = new THREE.Raycaster();

    // Populate inventory and buildable materials list
    for (const key in MATERIALS) {
        const mat = MATERIALS[key];
        if (mat.buildable) {
            inventory[mat.id] = 0;
            buildableMaterials.push(mat.id);
            const materialOptions = { color: mat.color, roughness: 0.8 };
            if (mat.emissive) {
                materialOptions.emissive = mat.emissive;
                materialOptions.emissiveIntensity = 1.0; // Make it glow
            }
            // --- NEW: Special properties for ice ---
            if (mat.id === 'ice') {
                materialOptions.roughness = 0.2;
                materialOptions.metalness = 0.1;
                materialOptions.transparent = true;
                materialOptions.opacity = 0.8;
            }
            builtCubeMaterials[mat.id] = new THREE.MeshStandardMaterial(materialOptions);
        }
    }

    setupFoliage(); // New function call for foliage

    generatePlanet();
    generateMoon();
    createWaterLayer();

    cubeParent = new THREE.Group();
    scene.add(cubeParent);

    moonCubeParent = new THREE.Group(); // Create the moon cube container
    scene.add(moonCubeParent); // Add it to the scene

    createPlayer();

    setupEventListeners();
    setupInventoryUI();

    // Mobile device detection and control setup
    if (isMobileDevice()) {
        mobileControls.style.display = 'flex';
        setupMobileControls();
        messageBox.textContent = "Tap joystick to move, drag right side to look, tap buttons to interact!";
    } else {
        messageBox.textContent = "WASD: Move, Space: Jump, Mouse: Look, Click: Interact, Arrow Keys or 1-9: Switch Material, L: Teleport, T: Toggle Torch";
    }
}

function setupEventListeners() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    overlay.addEventListener('click', () => {
        // The request for pointer lock can be denied by the user, or fail if the
        // document is not in the correct state. This can sometimes lead to an
        // unhandled promise rejection in certain environments. This handles that case.
        const request = canvas.requestPointerLock();
        if (request && typeof request.catch === 'function') {
            request.catch(err => {
                console.warn("Pointer lock request was cancelled or failed.", err);
            });
        }
    });

    document.addEventListener('mousedown', onMouseDownDesktop);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', onWindowResize);
}

/**
 * Creates a semi-transparent geodesic sphere for the water layer.
 */
function createWaterLayer() {
    // Use IcosahedronGeometry for a more uniform sphere, preventing polar distortion.
    // A detail level of 5 gives faces with a side length of roughly 1 unit on a sphere of radius 30.
    const waterGeometry = new THREE.IcosahedronGeometry(PLANET_RADIUS + WATER_LEVEL_OFFSET, 20);
    const waterMaterial = new THREE.MeshStandardMaterial({
        metalness: 0.9,
        roughness: 0.3,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide // Render both sides
    });


    waterMaterial.onBeforeCompile = shader => {
        shader.uniforms.time = { value: 0 };
        shader.uniforms.noiseScale = { value: 2 };
        shader.uniforms.uWaveSpeed = { value: waterSettings.waveSpeed };
        shader.uniforms.uWaveAmplitude = { value: waterSettings.waveAmplitude };
        shader.uniforms.uBlueFreq = { value: waterSettings.blueFreq };
        shader.uniforms.uGreenFreq = { value: waterSettings.greenFreq };

        // Add simplex noise function to both shaders
        shader.vertexShader = terrainNoise + shader.vertexShader;
        shader.fragmentShader = terrainNoise + shader.fragmentShader;

        // Pass noise from vertex to fragment
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform float time;
            uniform float noiseScale;
            varying float vNoise;
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vNoise = ridgedMultifractal(normal * noiseScale);
            `
        );

        // --- Fragment Shader Modifications ---
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            uniform float time;
            uniform float uWaveSpeed;
            uniform float uWaveAmplitude;
            uniform float uBlueFreq;
            uniform float uGreenFreq;
            varying float vNoise;
            `
        );

        // Modify the normal to create the wave effect
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `
            #include <normal_fragment_maps>

            float t = vNoise;
            float freq = mix(uBlueFreq, uGreenFreq, t);
            float phase = time * uWaveSpeed;
            float wave_height = uWaveAmplitude * sin(vNoise * freq - phase);

            // Use derivatives to calculate the normal from the height field
            vec3 p_dx = dFdx(vViewPosition);
            vec3 p_dy = dFdy(vViewPosition);
            vec2 h_dx = dFdx(vec2(wave_height, 0.0));
            vec2 h_dy = dFdy(vec2(wave_height, 0.0));

            vec3 n = normal;
            n.xy -= vec2(h_dx.x, h_dy.x) * 0.1;

            normal = normalize(n);
            `
        );

        // Modify the color based on depth and wave crests
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float t_color = vNoise;
            vec3 blue = vec3(0.0, 0.3, 0.8);
            vec3 green = vec3(0.1, 0.8, 0.8);
            vec3 base_color = mix(blue, green, t_color);

            // --- Dynamic Crest Color ---
            // Recalculate the wave sine value to determine the crest
            float freq_crest = mix(uBlueFreq, uGreenFreq, vNoise);
            float phase_crest = time * uWaveSpeed;
            float wave_sine = sin(vNoise * freq_crest - phase_crest); // This value is between -1 and 1

            // Use smoothstep to create a smooth transition to the crest color at the wave peaks.
            float crest_factor = smoothstep(0.5, 1.0, wave_sine);

            // Define the two crest colors
            vec3 sky_blue_crest = vec3(0.529, 0.808, 0.922); // Sky blue for the blue water area
            vec3 white_crest = vec3(1.0, 1.0, 1.0);         // White for the green water area

            // The final crest color is a mix based on the same noise value as the base water color.
            // This ensures the crest color changes in sync with the water color.
            vec3 dynamic_crest_color = mix(sky_blue_crest, white_crest, t_color);

            // Mix the base water color with the dynamic crest color.
            vec3 final_color = mix(base_color, dynamic_crest_color, crest_factor);

            diffuseColor.rgb = final_color;
            `
        );

        waterMaterial.userData.shader = shader;
    };



    waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.position.copy(planetCenter); // Center the water sphere on the planet
    scene.add(waterMesh);
}

function createPlayer() {
    player = new THREE.Group();
    // Attach state properties directly to the player group
    player.velocity = new THREE.Vector3();
    player.onGround = false;
    player.health = playerSettings.maxHealth; // Initialize health
    player.lastDamageTime = 0; // For damage cooldown

    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x5588ff });
    player.body = new THREE.Mesh(bodyGeometry, bodyMaterial); // Assign to player.body
    player.body.castShadow = true; // Added castShadow
    player.body.position.y = -0.3;
    player.add(player.body);

    const headGeometry = new THREE.DodecahedronGeometry(0.5, 0);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    player.head = new THREE.Mesh(headGeometry, headMaterial); // Assign to player.head
    player.head.castShadow = true; // Added castShadow
    player.head.position.y = 0.8;
    player.add(player.head);

    // Initial position on the planet's surface
    player.position.set(0, PLANET_RADIUS + playerSettings.height, 0);

    // Orient player to be upright at the start
    const initialUp = player.position.clone().normalize();
    player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), initialUp);
    scene.add(player);
}

function onMouseDownDesktop(event) {
    if (!isLocked) return;
    event.preventDefault(); // Prevent default middle-click actions
    if (event.button === 0) mineBlockAtCrosshair();
    else if (event.button === 1) firePowerLaser();
    else if (event.button === 2) placeBlockAtCrosshair();
}

// --- GRASS FUNCTIONS ---
/**
 * Creates geometry for a single grass patch with a variable number of blades.
 * @param {number} bladeCount - The number of triangular blades to generate.
 * @returns {THREE.BufferGeometry}
 */
function createGrassPatchGeometry(bladeCount) {
    const patchGeometry = new THREE.BufferGeometry();
    const vertices = [];

    for (let i = 0; i < bladeCount; i++) {
        const baseWidth = 0.01;
        const height = THREE.MathUtils.randFloat(0.1, 0.5);
        const horizontalOffset = THREE.MathUtils.randFloat(0.05, 0.1);

        const angle = Math.random() * Math.PI * 2;
        const offsetX = Math.cos(angle) * horizontalOffset;
        const offsetZ = Math.sin(angle) * horizontalOffset;

        const v1 = new THREE.Vector3(offsetX - baseWidth / 2, 0, offsetZ);
        const v2 = new THREE.Vector3(offsetX + baseWidth / 2, 0, offsetZ);
        const v3 = new THREE.Vector3(offsetX, height, offsetZ);

        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
    }

    patchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    patchGeometry.computeVertexNormals();
    return patchGeometry;
}

/**
 * Initializes the InstancedMesh objects for all foliage types (grass, anemones).
 */
function setupFoliage() {
    // Setup for Grass
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x00cc44, side: THREE.DoubleSide });
    for (let i = 0; i < GRASS_LOD_DISTANCES.length; i++) {
        const bladeCount = GRASS_LOD_BLADES[i];
        const grassPatchGeometry = createGrassPatchGeometry(bladeCount);
        const lodMesh = new THREE.InstancedMesh(grassPatchGeometry, grassMaterial, MAX_GRASS_PER_LOD);
        lodMesh.name = `Grass_LOD_${i}`;
        lodMesh.count = 0;
        scene.add(lodMesh);
        grassLODs.push(lodMesh);
    }

    // Setup for Sea Anemones
    const anemoneMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1, side: THREE.DoubleSide }); // Blue color
    for (let i = 0; i < GRASS_LOD_DISTANCES.length; i++) {
        const bladeCount = GRASS_LOD_BLADES[i]; // Using same blade count for simplicity
        const anemonePatchGeometry = createGrassPatchGeometry(bladeCount);
        const lodMesh = new THREE.InstancedMesh(anemonePatchGeometry, anemoneMaterial, MAX_GRASS_PER_LOD); // Re-use max count
        lodMesh.name = `Anemone_LOD_${i}`;
        lodMesh.count = 0;
        scene.add(lodMesh);
        anemoneLODs.push(lodMesh);
    }
}

// --- MOBILE CONTROL FUNCTIONS ---
function isMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent) ||
        ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function setupMobileControls() {
    joystickBase.addEventListener('touchstart', onJoystickStart, { passive: false });
    document.addEventListener('touchmove', onJoystickMove, { passive: false });
    document.addEventListener('touchend', onJoystickEnd, { passive: false });
    mineButton.addEventListener('click', mineBlockAtCrosshair);
    buildButton.addEventListener('click', placeBlockAtCrosshair);
}

function onJoystickStart(event) {
    event.preventDefault();
    if (mobileJoystickTouchId === -1) {
        const touch = event.changedTouches[0];
        const rect = joystickBase.getBoundingClientRect();
        joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
        mobileJoystickTouchId = touch.identifier;
    }
}

function onJoystickMove(event) {
    event.preventDefault();
    for (let touch of event.changedTouches) {
        if (touch.identifier === mobileJoystickTouchId) {
            let dx = touch.clientX - joystickCenter.x;
            let dy = touch.clientY - joystickCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > joystickRadius) {
                dx *= joystickRadius / distance;
                dy *= joystickRadius / distance;
            }
            joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
            keys.w = dy < -20;
            keys.s = dy > 20;
            keys.a = dx < -20;
            keys.d = dx > 20;
        }
    }
}

function onJoystickEnd(event) {
    for (let touch of event.changedTouches) {
        if (touch.identifier === mobileJoystickTouchId) {
            joystickThumb.style.transform = `translate(0, 0)`;
            mobileJoystickTouchId = -1;
            keys.w = keys.a = keys.s = keys.d = false;
        }
    }
}

// --- INVENTORY UI FUNCTIONS ---
function setupInventoryUI() {
    // updateInventoryUI will now handle the full render, including initial setup.
    updateInventoryUI();
}

function updateInventoryUI() {
    // Store the ID of the currently selected material to maintain selection
    const selectedId = buildableMaterials[selectedMaterialIndex];

    // Ensure buildableMaterials is in a fixed, predictable order. Do not sort.
    // The initial order from the MATERIALS object is now preserved.

    const slotsContainer = document.getElementById('inventory-slots');
    slotsContainer.innerHTML = ''; // Clear existing slots to re-render

    // Re-create all slots in the fixed order
    buildableMaterials.forEach((matId, index) => {
        const mat = Object.values(MATERIALS).find(m => m.id === matId);
        if (!mat) return; // Safety check

        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.id = `slot-${matId}`;

        slot.innerHTML = `
            <div class="slot-color-preview" style="background-color: #${mat.color.getHexString()}"></div>
            <div class="slot-info">
                <div class="slot-name">${mat.id.replace('_', ' ')}</div>
                <div class="slot-count" id="count-${matId}">${inventory[matId]}</div>
            </div>
        `;

        if (index === selectedMaterialIndex) {
            slot.classList.add('selected');
        }

        slot.onclick = () => selectMaterialById(matId);
        slotsContainer.appendChild(slot);
    });

    // Scroll the selected item into view if it's outside the visible area
    const selectedSlot = document.querySelector('.inventory-slot.selected');
    if (selectedSlot) {
        selectedSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function selectMaterial(index) {
    selectedMaterialIndex = (index + buildableMaterials.length) % buildableMaterials.length;
    updateInventoryUI();
}
function selectPrevMaterial() { selectMaterial(selectedMaterialIndex - 1); }
function selectNextMaterial() { selectMaterial(selectedMaterialIndex + 1); }
function selectMaterialById(matId) {
    const index = buildableMaterials.findIndex(id => id === matId);
    if (index !== -1) selectMaterial(index);
}

// --- CORE GAME LOGIC ---
function onKeyDown(event) {
    // Handle number keys for inventory selection
    if (event.code.startsWith('Digit')) {
        const index = parseInt(event.key) - 1;
        if (index >= 0 && index < 9) {
            if (index < buildableMaterials.length) {
                selectMaterial(index);
            }
            return; // Early exit for number keys
        }
    }

    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space':
            keys.space = true; // Always track spacebar state
            // Jump impulse should only happen when on the ground.
            if (player && player.onGround) {
                const upDirection = player.position.clone().sub(dominantBodyPosition).normalize();
                player.velocity.add(upDirection.multiplyScalar(playerSettings.jumpStrength));
                player.onGround = false; // Player is no longer on ground after jumping
            }
            break;
        case 'KeyC': keys.c = true; break;
        case 'ControlLeft': case 'ControlRight': keys.ctrl = true; break;
        case 'ArrowLeft': keys.arrowLeft = true; selectPrevMaterial(); break; // Added for material selection
        case 'ArrowRight': keys.arrowRight = true; selectNextMaterial(); break; // Added for material selection
        case 'KeyL': // Teleport between Planet and Moon
            if (!marchingCubesMeshMoon) break; // Safety check

            const distToPlanet = player.position.distanceTo(planetCenter);
            const distToMoon = player.position.distanceTo(marchingCubesMeshMoon.position);

            if (distToPlanet > distToMoon) {
                // On moon, teleport to planet
                player.position.set(0, PLANET_RADIUS + playerSettings.height, 0);
                messageBox.textContent = "Teleported to the Planet!";
            } else {
                // On planet, teleport to moon
                player.position.copy(moonPosition.clone().add(new THREE.Vector3(0, MOON_RADIUS + playerSettings.height, 0)));
                messageBox.textContent = "Teleported to the Moon!";
            }
            player.velocity.set(0, 0, 0); // Reset velocity
            player.onGround = false; // Player might not be on ground immediately after teleport
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            break;
        case 'KeyP': // Debug: Count surface voxels
            let totalSurfaceVoxels = 0;
            const gridsToCount = [
                { data: voxelData, size: GRID_SIZE },
                { data: voxelDataMoon, size: GRID_SIZE_MOON }
            ];

            gridsToCount.forEach(gridInfo => {
                const grid = gridInfo.data;
                const size = gridInfo.size;
                if (!grid || grid.length === 0) return;

                for (let x = 1; x < size - 1; x++) {
                    for (let y = 1; y < size - 1; y++) {
                        for (let z = 1; z < size - 1; z++) {
                            if (grid[x][y][z] >= ISO_LEVEL) { // If the voxel is solid
                                // Check if any neighbor is air
                                if (
                                    grid[x + 1][y][z] < ISO_LEVEL ||
                                    grid[x - 1][y][z] < ISO_LEVEL ||
                                    grid[x][y + 1][z] < ISO_LEVEL ||
                                    grid[x][y - 1][z] < ISO_LEVEL ||
                                    grid[x][y][z + 1] < ISO_LEVEL ||
                                    grid[x][y][z - 1] < ISO_LEVEL
                                ) {
                                    totalSurfaceVoxels++;
                                }
                            }
                        }
                    }
                }
            });

            messageBox.textContent = `Total surface voxels: ${totalSurfaceVoxels}`;
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 3000);
            break;
        case 'KeyT': // Toggle Torch
            if (torchLight.intensity === 0) {
                torchLight.intensity = 1; // Turn on
                messageBox.textContent = "Torch ON";
            } else {
                torchLight.intensity = 0; // Turn off
                messageBox.textContent = "Torch OFF";
            }
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
        case 'KeyC': keys.c = false; break;
        case 'ControlLeft': case 'ControlRight': keys.ctrl = false; break;
        case 'KeyV': isFirstPersonView = !isFirstPersonView; break;
        case 'ArrowLeft': keys.arrowLeft = false; break; // Added for material selection
        case 'ArrowRight': keys.arrowRight = false; break; // Added for material selection
    }
}

function onMouseMove(event) {
    if (!isLocked || !player) return;
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
    const yawDelta = -movementX * playerSettings.sensitivity;
    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(playerUp, yawDelta);
    player.quaternion.premultiply(yawQuaternion);

    const pitchDelta = -movementY * playerSettings.sensitivity;
    player.head.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.head.rotation.x + pitchDelta));
}

function onPointerLockChange() {
    isLocked = document.pointerLockElement === canvas;
    overlay.style.display = isLocked ? 'none' : 'flex';
    messageBox.style.display = isLocked ? 'block' : 'none';
    document.getElementById('health-bar-container').style.display = isLocked ? 'block' : 'none'; // Show/hide health bar
    if (isLocked) {
        document.addEventListener('mousemove', onMouseMove, false);
    } else {
        document.removeEventListener('mousemove', onMouseMove, false);
    }
}

function updateHealthUI() {
    if (!player) return;
    const healthPercentage = (player.health / playerSettings.maxHealth) * 100;
    document.getElementById('health-bar-fill').style.width = `${healthPercentage}%`;
    document.getElementById('health-bar-text').textContent = `${Math.ceil(player.health)} / ${playerSettings.maxHealth}`;
}

function takeDamage(amount) {
    if (!player || player.health <= 0) return;

    player.health -= amount;
    player.lastDamageTime = clock.getElapsedTime();

    const damageOverlay = document.getElementById('damage-overlay');
    damageOverlay.style.opacity = 1;
    setTimeout(() => { damageOverlay.style.opacity = 0; }, 250); // Fade out after 250ms

    if (player.health <= 0) {
        player.health = 0;
        respawnPlayer();
    }
    updateHealthUI();
}

function respawnPlayer() {
    messageBox.textContent = "You have perished! Respawning...";
    messageBox.style.display = 'block';

    // Reset player state
    player.health = playerSettings.maxHealth;
    player.velocity.set(0, 0, 0);
    inventory = {}; // Optional: reset inventory on death
    for (const key in MATERIALS) {
        if (MATERIALS[key].buildable) {
            inventory[MATERIALS[key].id] = 0;
        }
    }
    updateInventoryUI();

    // Teleport to a safe spot on the planet surface
    player.position.set(0, PLANET_RADIUS + playerSettings.height, 0);
    const initialUp = player.position.clone().normalize();
    player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), initialUp);
    player.onGround = false;

    setTimeout(() => {
        if (isLocked) {
            messageBox.textContent = "Controls active";
        }
    }, 2000);

    updateHealthUI();
}

function mineBlockAtCrosshair() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects([marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh).concat(cubes));
    if (intersects.length > 0) {
        const intersected = intersects[0];
        const intersectionPoint = intersected.point;
        const intersectedObject = intersected.object;
        const miningRayDir = raycaster.ray.direction;
        const offsetWorldPoint = intersectionPoint.clone().add(miningRayDir.clone().multiplyScalar(-BLOCK_SIZE * 0.25));

        // Determine which Marching Cubes mesh was hit
        let targetGrid, targetGridSize, targetCenterOffset;
        let isMarchingCubesObject = false;
        let onMoon = false; // Added for material determination

        if (intersectedObject === marchingCubesMesh) {
            targetGrid = voxelData;
            targetGridSize = GRID_SIZE;
            targetCenterOffset = planetCenter; // Marching cubes mesh is at 0,0,0
            isMarchingCubesObject = true;
            onMoon = false;
        } else if (intersectedObject === marchingCubesMeshMoon) {
            targetGrid = voxelDataMoon;
            targetGridSize = GRID_SIZE_MOON;
            targetCenterOffset = marchingCubesMeshMoon.position; // Moon mesh is at moonPosition
            isMarchingCubesObject = true;
            onMoon = true;
        }

        if (isMarchingCubesObject) {
            // Convert world coordinates to grid coordinates relative to the object's center
            const localPoint = offsetWorldPoint.clone().sub(targetCenterOffset);
            const halfTargetGrid = targetGridSize / 2;
            const gridX = Math.floor(localPoint.x / BLOCK_SIZE + halfTargetGrid);
            const gridY = Math.floor(localPoint.y / BLOCK_SIZE + halfTargetGrid);
            const gridZ = Math.floor(localPoint.z / BLOCK_SIZE + halfTargetGrid);

            if (gridX >= 0 && gridX < targetGridSize && gridY >= 0 && gridY < targetGridSize && gridZ >= 0 && gridZ < targetGridSize) {
                // Set the voxel value to 0 (empty)
                targetGrid[gridX][gridY][gridZ] = 0;

                // Re-generate the Marching Cubes mesh for the affected object
                if (intersectedObject === marchingCubesMesh) {
                    updateMarchingCubesMesh();
                } else if (intersectedObject === marchingCubesMeshMoon) {
                    updateMarchingCubesMoonMesh();
                }

                const minedMaterial = getMaterialAtPoint(offsetWorldPoint, intersected.face.normal, onMoon);
                if (minedMaterial.buildable) {
                    inventory[minedMaterial.id]++;
                    updateInventoryUI();
                }
                createMiningEffect(intersectionPoint, minedMaterial);

                // If a foliage block was mined, remove the corresponding instance
                const mapKey = `${gridX},${gridY},${gridZ}`;
                if (minedMaterial.id === 'grass') {
                    const instanceId = voxelToGrassMap.get(mapKey);
                    if (instanceId !== undefined) {
                        const zeroScaleMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));
                        grassLODs.forEach(lod => {
                            lod.setMatrixAt(instanceId, zeroScaleMatrix);
                            lod.instanceMatrix.needsUpdate = true;
                        });
                        voxelToGrassMap.delete(mapKey);
                    }
                } else if (minedMaterial.id === 'anemone') {
                    const instanceId = voxelToAnemoneMap.get(mapKey);
                    if (instanceId !== undefined) {
                        const zeroScaleMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));
                        anemoneLODs.forEach(lod => {
                            lod.setMatrixAt(instanceId, zeroScaleMatrix);
                            lod.instanceMatrix.needsUpdate = true;
                        });
                        voxelToAnemoneMap.delete(mapKey);
                    }
                }
            }
        } else if (cubes.includes(intersectedObject)) {
            // This is a manually placed cube
            const minedMaterialId = intersectedObject.userData.materialId;
            if (minedMaterialId && inventory[minedMaterialId] !== undefined) {
                inventory[minedMaterialId]++;
                updateInventoryUI();
            }
            const builtMaterial = Object.values(MATERIALS).find(m => m.id === minedMaterialId) || MATERIALS.ROCK; // Fallback
            createMiningEffect(intersectionPoint, builtMaterial);

            // The cube's parent is either cubeParent or moonCubeParent.
            // This correctly removes it from the scene graph.
            if (intersectedObject.parent) {
                intersectedObject.parent.remove(intersectedObject);
            }

            cubes = cubes.filter(cube => cube.uuid !== intersectedObject.uuid);
            intersectedObject.geometry.dispose();
            // Do not dispose material, it's shared from builtCubeMaterials
        }
    }
}

/**
 * Creates a chamfered box geometry for built blocks.
 * @param {number} width
 * @param {number} height
 * @param {number} depth
 * @returns {THREE.ConvexGeometry}
 */
function createChamferedBlockGeometry(width, height, depth) {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    const points = [];

    const getRandomChamfer = (dim) => THREE.MathUtils.randFloat(dim / 10, dim / 3);

    const corners = [
        new THREE.Vector3(w, h, d), new THREE.Vector3(w, h, -d),
        new THREE.Vector3(w, -h, d), new THREE.Vector3(w, -h, -d),
        new THREE.Vector3(-w, h, d), new THREE.Vector3(-w, h, -d),
        new THREE.Vector3(-w, -h, d), new THREE.Vector3(-w, -h, -d)
    ];

    corners.forEach(corner => {
        const sx = Math.sign(corner.x);
        const sy = Math.sign(corner.y);
        const sz = Math.sign(corner.z);

        const chamferX = getRandomChamfer(width);
        const chamferY = getRandomChamfer(height);
        const chamferZ = getRandomChamfer(depth);

        points.push(new THREE.Vector3(corner.x - sx * chamferX, corner.y, corner.z));
        points.push(new THREE.Vector3(corner.x, corner.y - sy * chamferY, corner.z));
        points.push(new THREE.Vector3(corner.x, corner.y, corner.z - sz * chamferZ));
    });

    const geometry = new ConvexGeometry(points);
    return geometry;
}

function placeBlockAtCrosshair() {
    const materialIdToBuild = buildableMaterials[selectedMaterialIndex];
    if (inventory[materialIdToBuild] <= 0) {
        messageBox.textContent = `No ${materialIdToBuild.replace('_', ' ')} to place!`;
        setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
        return;
    }

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const objectsToIntersect = [marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh).concat(cubes);
    const intersects = raycaster.intersectObjects(objectsToIntersect);

    if (intersects.length > 0) {
        const intersected = intersects[0];
        const hitPoint = intersected.point;
        const faceNormal = intersected.face.normal;
        const onMoon = (intersected.object === marchingCubesMeshMoon) || (intersected.object.parent === moonCubeParent);

        // --- NEW: Ice on Lava Interaction ---
        if (materialIdToBuild === 'ice' && !onMoon) {
            let transformed = false;
            let wasBuiltCube = false;

            // Case 1: Intersected a built lava cube
            if (cubes.includes(intersected.object) && intersected.object.userData.materialId === 'lava') {
                intersected.object.material = builtCubeMaterials['basalt'];
                intersected.object.userData.materialId = 'basalt';
                transformed = true;
                wasBuiltCube = true;
            }
            // Case 2: Intersected natural lava terrain
            else if (intersected.object === marchingCubesMesh) {
                const groundMaterial = getMaterialAtPoint(hitPoint, faceNormal, false);
                if (groundMaterial.id === 'lava') {
                    // Nudge point inside the surface to ensure we get the right voxel
                    const localPoint = hitPoint.clone().add(faceNormal.clone().multiplyScalar(-0.1)).sub(planetCenter);
                    const gridX = Math.floor(localPoint.x / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridY = Math.floor(localPoint.y / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridZ = Math.floor(localPoint.z / BLOCK_SIZE + GRID_SIZE / 2);

                    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE && gridZ >= 0 && gridZ < GRID_SIZE) {
                        // Carve out the lava voxel
                        voxelData[gridX][gridY][gridZ] = 0;
                        updateMarchingCubesMesh();

                        // Place a basalt block in its place, at the center of the removed voxel
                        const newBlockWorldPos = new THREE.Vector3(
                            (gridX - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridY - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridZ - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE
                        );

                        const newCube = new THREE.Mesh(createChamferedBlockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), builtCubeMaterials['basalt']);
                        newCube.position.copy(newBlockWorldPos);
                        newCube.userData.materialId = 'basalt';
                        cubeParent.add(newCube); // Add to planet's cube group
                        cubes.push(newCube);
                        transformed = true;
                    }
                }
            }

            if (transformed) {
                messageBox.textContent = "Lava cooled into basalt!";
                setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
                // Consume the ice block, unless we transformed a built cube (free transformation)
                if (!wasBuiltCube) {
                   inventory[materialIdToBuild]--;
                   updateInventoryUI();
                }
                return; // Exit function, we don't place the ice block itself
            }
        }

        // --- REGULAR PLACEMENT LOGIC ---
        const newPosition = hitPoint.clone().add(faceNormal.clone().multiplyScalar(BLOCK_SIZE / 2));

        const distanceToPlayer = newPosition.distanceTo(player.position);
        if (distanceToPlayer < BLOCK_SIZE) {
            messageBox.textContent = "Cannot place block inside yourself!";
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            return;
        }

        let finalMaterialId = materialIdToBuild;
        // --- NEW: Lava in Water Interaction ---
        if (finalMaterialId === 'lava' && !onMoon) {
            const isInWater = newPosition.distanceTo(planetCenter) < (PLANET_RADIUS + WATER_LEVEL_OFFSET);
            if (isInWater) {
                finalMaterialId = 'basalt';
                messageBox.textContent = "Lava cooled into basalt in the water!";
                setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            }
        }
        
        // Use the original material from inventory, but build with the final material
        inventory[materialIdToBuild]--;

        const newCubeGeometry = createChamferedBlockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        const newCube = new THREE.Mesh(newCubeGeometry, builtCubeMaterials[finalMaterialId]);
        newCube.userData.materialId = finalMaterialId;

        const parent = onMoon ? moonCubeParent : cubeParent;
        newCube.position.copy(newPosition);
        
        // --- Orientation Logic ---
        const celestialCenter = onMoon ? moonPosition : planetCenter;
        const newY = newPosition.clone().sub(celestialCenter).normalize();
        const lookDir = player.position.clone().sub(newPosition);
        const newNegZ = lookDir.projectOnPlane(newY).normalize();
        const newZ = newNegZ.clone().negate();
        const newX = new THREE.Vector3().crossVectors(newY, newZ);
        const rotationMatrix = new THREE.Matrix4().makeBasis(newX, newY, newZ);
        newCube.quaternion.setFromRotationMatrix(rotationMatrix);

        parent.attach(newCube);
        cubes.push(newCube);
        updateInventoryUI();
    }
}


function createLaserBeamEffect(ray) {
    const beamLength = 1000; // A very long beam
    const startPoint = ray.origin;
    const endPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(beamLength));

    const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, beamLength, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        fog: false // Don't let fog affect the laser
    });
    const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);

    // Position and orient the cylinder
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    beamMesh.position.copy(midPoint);
    beamMesh.lookAt(endPoint);
    beamMesh.rotateX(Math.PI / 2);

    scene.add(beamMesh);

    // Fade out and remove after a short time
    setTimeout(() => {
        if (beamMesh.parent) {
            scene.remove(beamMesh);
            beamMesh.geometry.dispose();
            beamMesh.material.dispose();
        }
    }, 500); // Remove after 0.5 seconds
}

function firePowerLaser() {
    // 1. Clear inventory
    for (const matId in inventory) {
        inventory[matId] = 0;
    }
    updateInventoryUI();
    messageBox.textContent = "Inventory Cleared! Firing Laser!";
    setTimeout(() => { messageBox.textContent = "Controls active"; }, 2000);

    // 2. Raycast to find target
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects([marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh));
    if (intersects.length === 0) { // Fired into space
        createLaserBeamEffect(raycaster.ray);
        return;
    }

    const intersected = intersects[0];
    const targetObject = intersected.object;
    const laserRay = raycaster.ray;

    // Visual effect
    createLaserBeamEffect(laserRay);

    let targetGrid, targetGridSize, targetCenterOffset;
    let updateFunction;

    if (targetObject === marchingCubesMesh) {
        targetGrid = voxelData;
        targetGridSize = GRID_SIZE;
        targetCenterOffset = planetCenter;
        updateFunction = updateMarchingCubesMesh;
    } else if (targetObject === marchingCubesMeshMoon) {
        targetGrid = voxelDataMoon;
        targetGridSize = GRID_SIZE_MOON;
        targetCenterOffset = marchingCubesMeshMoon.position;
        updateFunction = updateMarchingCubesMoonMesh;
    } else {
        return; // Should not happen
    }

    // 3. Voxel manipulation
    const laserRadius = 2.0;
    const laserRadiusSq = laserRadius * laserRadius;
    const halfGrid = targetGridSize / 2;
    const voxelWorldPos = new THREE.Vector3();

    for (let x = 0; x < targetGridSize; x++) {
        for (let y = 0; y < targetGridSize; y++) {
            for (let z = 0; z < targetGridSize; z++) {
                // Calculate voxel's world position
                voxelWorldPos.set(
                    (x - halfGrid + 0.5) * BLOCK_SIZE,
                    (y - halfGrid + 0.5) * BLOCK_SIZE,
                    (z - halfGrid + 0.5) * BLOCK_SIZE
                ).add(targetCenterOffset);

                // Check distance from voxel center to the laser ray
                const distSq = laserRay.distanceSqToPoint(voxelWorldPos);

                if (distSq < laserRadiusSq) {
                    targetGrid[x][y][z] = 0; // Set to air
                }
            }
        }
    }

    // 4. Regenerate mesh
    updateFunction();
}

function generatePlanet() {
    const halfGrid = GRID_SIZE / 2;
    for (let x = 0; x < GRID_SIZE; x++) {
        voxelData[x] = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            voxelData[x][y] = [];
            for (let z = 0; z < GRID_SIZE; z++) {
                const wx = (x - halfGrid + 0.5) * BLOCK_SIZE;
                const wy = (y - halfGrid + 0.5) * BLOCK_SIZE;
                const wz = (z - halfGrid + 0.5) * BLOCK_SIZE;
                const dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
                const terrainNoise = getRidgedMultifractalNoise(wx, wy, wz, simplex, initialNoiseScale, noiseStrength, octaves, lacunarity, persistence);
                const normalizedDist = dist / PLANET_RADIUS;
                voxelData[x][y][z] = (1.0 - normalizedDist) + terrainNoise;
            }
        }
    }
    updateMarchingCubesMesh();
}

// --- MOON GENERATION ---
let moonBlobs = []; // To store the properties of the alien blobs
let moonCraters = []; // To store properties for craters

function generateMoon() {
    const lightDirForMoonPlacement = new THREE.Vector3(1, 1, 1).normalize();
    moonPosition.copy(lightDirForMoonPlacement).negate().setLength(MOON_ORBIT_DISTANCE);

    const halfGridMoon = GRID_SIZE_MOON / 2;

    // --- New Alien Landscape Generation ---
    // 1. Define the properties for the surface blobs and craters if they haven't been created yet.
    if (moonBlobs.length === 0) {
        const numBlobs = 5; // 5;
        for (let i = 0; i < numBlobs; i++) {
            // Create a random direction vector from the center of the moon.
            const randomDirection = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                Math.random() * 2 - 1
            ).normalize();

            // The center of the blob will be on the surface of the main moon sphere.
            const blobCenter = randomDirection.clone().multiplyScalar((MOON_RADIUS / 2) - 1);

            // Give each blob a random radius, e.g., between 20% and 40% of the moon's radius.
            const blobRadius = MOON_RADIUS * (Math.random() * 0.3 + 0.2);

            moonBlobs.push({ center: blobCenter, radius: blobRadius });

            // Create a corresponding crater for each blob
            // "at a radius of (1+ (The radius at which the blob-spheres are placed))"
            // This is interpreted as placing the crater center 1 unit further out along the same direction.
            const craterCenter = randomDirection.clone().multiplyScalar((MOON_RADIUS / 2)); // -1 + 1 = 0
            const craterRadius = blobRadius * 0.3; // Craters are slightly smaller than the hills they are in
            moonCraters.push({ center: craterCenter, radius: craterRadius });
        }

        // --- New, Uniform Crater Generation ---
        moonCraters = []; // Reset craters
        const numCraters = 25; // More craters for a pockmarked look
        const maxAttemptsPerCrater = 20; // How many times to try placing a single crater

        for (let i = 0; i < numCraters; i++) {
            for (let attempt = 0; attempt < maxAttemptsPerCrater; attempt++) {
                const randomDirection = new THREE.Vector3(
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1
                ).normalize();

                // Place crater center on the surface of the main moon sphere.
                const craterCenter = randomDirection.clone().multiplyScalar(MOON_RADIUS / 2);

                // Give each crater a random radius
                const craterRadius = MOON_RADIUS * (Math.random() * 0.15 + 0.05); // 5% to 20% of moon radius

                // Check for overlaps with existing craters
                let overlaps = false;
                for (const existingCrater of moonCraters) {
                    const distance = craterCenter.distanceTo(existingCrater.center);
                    // Add a small buffer to space them out a bit
                    if (distance < craterRadius + existingCrater.radius + (BLOCK_SIZE * 2)) {
                        overlaps = true;
                        break;
                    }
                }

                if (!overlaps) {
                    moonCraters.push({ center: craterCenter, radius: craterRadius });
                    break; // Exit attempt loop and move to next crater
                }
            }
        }
    }

    // 2. Generate the voxel data based on the new spherical-blob model.
    for (let x = 0; x < GRID_SIZE_MOON; x++) {
        voxelDataMoon[x] = [];
        for (let y = 0; y < GRID_SIZE_MOON; y++) {
            voxelDataMoon[x][y] = [];
            for (let z = 0; z < GRID_SIZE_MOON; z++) {
                // Calculate the world position of the current voxel relative to the moon's local origin (0,0,0).
                const worldX = (x - halfGridMoon + 0.5) * BLOCK_SIZE;
                const worldY = (y - halfGridMoon + 0.5) * BLOCK_SIZE;
                const worldZ = (z - halfGridMoon + 0.5) * BLOCK_SIZE;

                // --- Density Calculation ---
                // a. Calculate density contribution from the main moon sphere.
                // Density is 1.0 at the center, and 0.0 at the radius.
                const distFromMainCenter = Math.sqrt(worldX ** 2 + worldY ** 2 + worldZ ** 2);
                let finalDensity = 1.0 - (distFromMainCenter / MOON_RADIUS);

                // b. For each blob, calculate its density and merge it with the main sphere's density (Union operation).
                for (const blob of moonBlobs) {
                    const distFromBlobCenter = Math.sqrt(
                        (worldX - blob.center.x) ** 2 +
                        (worldY - blob.center.y) ** 2 +
                        (worldZ - blob.center.z) ** 2
                    );
                    const blobDensity = 1.0 - (distFromBlobCenter / blob.radius);

                    // Using Math.max results in a smooth union of the two shapes (hills).
                    finalDensity = Math.max(finalDensity, blobDensity);
                }

                // c. Post-blob function: For each crater, subtract its density to carve into the surface.
                for (const crater of moonCraters) {
                    const distFromCraterCenter = Math.sqrt(
                        (worldX - crater.center.x) ** 2 +
                        (worldY - crater.center.y) ** 2 +
                        (worldZ - crater.center.z) ** 2
                    );
                    const craterDensity = 1.0 - (distFromCraterCenter / crater.radius);

                    // If inside the crater sphere, subtract its density.
                    // This is a subtraction operation, creating craters.
                    if (craterDensity > 0) {
                        finalDensity -= craterDensity;
                    }
                }

                // Assign the final calculated density to the voxel grid.
                // The marching cubes algorithm will create a surface where this value equals ISO_LEVEL.
                voxelDataMoon[x][y][z] = finalDensity;
            }
        }
    }
    updateMarchingCubesMoonMesh();
}

function updateMarchingCubesMesh() {
    if (marchingCubesMesh) {
        scene.remove(marchingCubesMesh);
        marchingCubesMesh.geometry.dispose();
        // Do not dispose material, it's shared
    }
    const geometry = generateMarchingCubesGeometry(voxelData, ISO_LEVEL, GRID_SIZE, BLOCK_SIZE, planetCenter); // Pass centerOffset
    if (geometry.attributes.position) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const colors = [];
        const vertex = new THREE.Vector3(), normal = new THREE.Vector3();

        for (let i = 0; i < positions.length; i += 3) {
            vertex.set(positions[i], positions[i + 1], positions[i + 2]);
            normal.set(normals[i], normals[i + 1], normals[i + 2]);
            const material = getMaterialAtPoint(vertex, normal, false);
            colors.push(material.color.r, material.color.g, material.color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide, vertexColors: true }); // Added DoubleSide
    marchingCubesMesh = new THREE.Mesh(geometry, material);
    scene.add(marchingCubesMesh);

    // After creating the planet mesh, populate it with foliage
    populateFoliage();
}

function populateFoliage() {
    // Reset existing foliage
    grassLODs.forEach(lod => lod.count = 0);
    anemoneLODs.forEach(lod => lod.count = 0);
    voxelToGrassMap.clear();
    voxelToAnemoneMap.clear();

    const dummy = new THREE.Object3D();
    let grassInstanceIndex = 0;
    let anemoneInstanceIndex = 0;

    // Create inverse matrices for the foliage containers.
    // This is used to transform the world-space position of a new foliage instance
    // into the local space of its already-rotated container, preventing drift.
    const inverseGrassMatrix = new THREE.Matrix4();
    if (grassLODs.length > 0) {
        inverseGrassMatrix.copy(grassLODs[0].matrix).invert();
    }
    const inverseAnemoneMatrix = new THREE.Matrix4();
    if (anemoneLODs.length > 0) {
        inverseAnemoneMatrix.copy(anemoneLODs[0].matrix).invert();
    }

    const positions = marchingCubesMesh.geometry.attributes.position;
    const normals = marchingCubesMesh.geometry.attributes.normal;
    const colors = marchingCubesMesh.geometry.attributes.color;
    const grassColor = MATERIALS.GRASS.color;
    const anemoneColor = MATERIALS.ANEMONE.color;

    const halfGrid = GRID_SIZE / 2;
    const waterRadius = PLANET_RADIUS + WATER_LEVEL_OFFSET;

    for (let i = 0; i < positions.count; i++) {
        const r = colors.getX(i);
        const g = colors.getY(i);
        const b = colors.getZ(i);

        const isGrassColor = Math.abs(r - grassColor.r) < 0.1 && Math.abs(g - grassColor.g) < 0.1;
        const isAnemoneColor = Math.abs(r - anemoneColor.r) < 0.1 && Math.abs(g - anemoneColor.g) < 0.1 && Math.abs(b - anemoneColor.b) < 0.1;

        if ((isGrassColor || isAnemoneColor) && Math.random() > 0.9) {
            const pos = new THREE.Vector3().fromBufferAttribute(positions, i);
            const isUnderwater = pos.distanceTo(planetCenter) < waterRadius;
            const normal = new THREE.Vector3().fromBufferAttribute(normals, i);

            const gridX = Math.floor(pos.x / BLOCK_SIZE + halfGrid);
            const gridY = Math.floor(pos.y / BLOCK_SIZE + halfGrid);
            const gridZ = Math.floor(pos.z / BLOCK_SIZE + halfGrid);
            const mapKey = `${gridX},${gridY},${gridZ}`;

            // Calculate the desired world matrix for the foliage instance
            dummy.position.copy(pos);
            dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);
            dummy.updateMatrix();

            if (isUnderwater) {
                if (anemoneInstanceIndex < MAX_GRASS_PER_LOD && !voxelToAnemoneMap.has(mapKey)) {
                    // Transform the world matrix into the container's local space before setting
                    const localMatrix = dummy.matrix.clone().premultiply(inverseAnemoneMatrix);
                    anemoneLODs.forEach(lod => lod.setMatrixAt(anemoneInstanceIndex, localMatrix));
                    voxelToAnemoneMap.set(mapKey, anemoneInstanceIndex);
                    anemoneInstanceIndex++;
                }
            } else {
                if (grassInstanceIndex < MAX_GRASS_PER_LOD && !voxelToGrassMap.has(mapKey)) {
                    // Transform the world matrix into the container's local space before setting
                    const localMatrix = dummy.matrix.clone().premultiply(inverseGrassMatrix);
                    grassLODs.forEach(lod => lod.setMatrixAt(grassInstanceIndex, localMatrix));
                    voxelToGrassMap.set(mapKey, grassInstanceIndex);
                    grassInstanceIndex++;
                }
            }
        }
    }

    // Set initial counts and update matrices
    if (grassLODs.length > 0) {
        grassLODs[0].count = grassInstanceIndex;
        grassLODs.forEach(lod => lod.instanceMatrix.needsUpdate = true);
    }
    if (anemoneLODs.length > 0) {
        anemoneLODs[0].count = anemoneInstanceIndex;
        anemoneLODs.forEach(lod => lod.instanceMatrix.needsUpdate = true);
    }
}

function updateMarchingCubesMoonMesh() {
    if (marchingCubesMeshMoon) {
        scene.remove(marchingCubesMeshMoon);
        if (marchingCubesMeshMoon.geometry) marchingCubesMeshMoon.geometry.dispose();
        // Do not dispose material, it's shared
    }
    const geometry = generateMarchingCubesGeometry(voxelDataMoon, ISO_LEVEL, GRID_SIZE_MOON, BLOCK_SIZE, moonPosition); // Pass centerOffset
    if (geometry.attributes.position) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const colors = [];
        const vertex = new THREE.Vector3(), normal = new THREE.Vector3(), worldVertex = new THREE.Vector3();

        for (let i = 0; i < positions.length; i += 3) {
            vertex.set(positions[i], positions[i + 1], positions[i + 2]);
            worldVertex.copy(vertex).add(moonPosition);
            normal.set(normals[i], normals[i + 1], normals[i + 2]);
            const material = getMaterialAtPoint(worldVertex, normal, true);
            colors.push(material.color.r, material.color.g, material.color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide, vertexColors: true }); // Added DoubleSide
    marchingCubesMeshMoon = new THREE.Mesh(geometry, material);
    marchingCubesMeshMoon.position.copy(moonPosition);
    scene.add(marchingCubesMeshMoon);
    const moonLight = new THREE.PointLight(0x6080ff, 0.6, MOON_ORBIT_DISTANCE * 1.2, 1.5); // Added moon light
    marchingCubesMeshMoon.add(moonLight);
}

function createMiningEffect(position, minedMaterial) {
    const particleCount = 10; // Reduced particle count for performance
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8); // Changed to sphere
    const particleMaterial = new THREE.MeshBasicMaterial({ color: minedMaterial.color }); // Use passed material color

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry.clone(), particleMaterial.clone()); // Clone to avoid conflicts
        particle.position.copy(position);

        particle.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5, // Reduced initial velocity
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5
        );
        particle.decay = 0.02; // Consistent decay

        scene.add(particle);

        let opacity = 1;
        const interval = setInterval(() => {
            if (opacity <= 0) {
                scene.remove(particle);
                clearInterval(interval);
                particle.geometry.dispose(); // Dispose geometry
                particle.material.dispose(); // Dispose material
            } else {
                particle.position.add(particle.velocity);
                particle.material.opacity = opacity;
                particle.material.transparent = true;
                particle.scale.multiplyScalar(0.95); // Scale down
                opacity -= particle.decay;
            }
        }, 50); // Adjusted interval for smoother animation
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (isMobileDevice()) { // Update joystick center on resize
        const rect = joystickBase.getBoundingClientRect();
        joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
}

function updateCamera() {
    if (!player) return;
    camera.up.copy(player.position).sub(dominantBodyPosition).normalize();
    const headPosition = new THREE.Vector3();
    player.head.getWorldPosition(headPosition);

    if (isFirstPersonView) {
        player.body.visible = false;
        player.head.visible = false;

        // Position torch at camera and point it in camera's direction
        if (torchLight) {
            torchLight.position.copy(camera.position);
            torchLight.target.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
            torchLight.target.updateMatrixWorld(); // Ensure the target's world position is updated
        }

        const headQuaternion = new THREE.Quaternion();
        player.head.getWorldQuaternion(headQuaternion);
        camera.position.copy(headPosition);
        camera.quaternion.copy(headQuaternion);
    } else {
        player.body.visible = true;
        player.head.visible = true;

        // Position torch at player's head and point it in head's direction
        if (torchLight) {
            torchLight.position.copy(headPosition);
            torchLight.target.position.copy(headPosition).add(player.head.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
            torchLight.target.updateMatrixWorld(); // Ensure the target's world position is updated
        }

        const headQuaternion = new THREE.Quaternion();
        player.head.getWorldQuaternion(headQuaternion);
        const offsetFromHead = thirdPersonCameraOffset.clone();
        offsetFromHead.y -= player.head.position.y; // This line is crucial for correct third-person position relative to head
        const cameraOffsetRotated = offsetFromHead.clone().applyQuaternion(headQuaternion);
        const desiredCameraPosition = headPosition.clone().add(cameraOffsetRotated);
        camera.position.lerp(desiredCameraPosition, 0.15);
        camera.lookAt(headPosition);
    }
    // Ensure torch light visibility matches its intensity
    if (torchLight) {
        torchLight.visible = (torchLight.intensity > 0);
    }
}

// --- PARTICLE FUNCTIONS ---
/**
 * Creates a single bubble particle that rises and fades out.
 */
function createBubble() {
    const bubbleGeometry = new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.02, 0.05), 8, 8);
    const bubbleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
    });
    const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);

    // Start bubble near player's head
    const headPosition = new THREE.Vector3();
    player.head.getWorldPosition(headPosition);
    bubble.position.copy(headPosition).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        -0.2,
        (Math.random() - 0.5) * 0.5
    ));

    const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
    bubble.velocity = playerUp.clone().multiplyScalar(THREE.MathUtils.randFloat(0.5, 1.0));
    bubble.velocity.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.1
    ));
    bubble.lifetime = 2; // seconds
    bubble.age = 0;

    scene.add(bubble);
    bubbleParticles.push(bubble);
}

/**
 * Creates a splash effect at a given position.
 * @param {THREE.Vector3} position - The world position to create the splash at.
 */
function createSplashEffect(position) {
    const particleCount = 15;
    const splashGeometry = new THREE.SphereGeometry(0.05, 6, 6);
    const splashMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(splashGeometry, splashMaterial);
        particle.position.copy(position);

        const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const randomDirection = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() * 0.5, // Bias upwards
            Math.random() - 0.5
        ).normalize();

        // Project random direction onto the plane defined by playerUp
        const splashVector = randomDirection.projectOnPlane(playerUp).normalize();
        splashVector.add(playerUp.clone().multiplyScalar(THREE.MathUtils.randFloat(0.5, 1.0))); // Add upward force

        particle.velocity = splashVector.multiplyScalar(THREE.MathUtils.randFloat(1, 3));
        particle.lifetime = 1.5;
        particle.age = 0;

        scene.add(particle);
        splashParticles.push(particle);
    }
}

/**
 * Updates all active particles (bubbles and splashes).
 * @param {number} delta - The time since the last frame.
 */
function updateParticles(delta) {
    const gravityDirection = dominantBodyPosition.clone().sub(player.position).normalize();

    // Update Bubbles
    for (let i = bubbleParticles.length - 1; i >= 0; i--) {
        const particle = bubbleParticles[i];
        particle.age += delta;
        if (particle.age > particle.lifetime) {
            scene.remove(particle);
            particle.geometry.dispose();
            particle.material.dispose();
            bubbleParticles.splice(i, 1);
        } else {
            particle.position.add(particle.velocity.clone().multiplyScalar(delta));
            particle.material.opacity = 0.6 * (1 - (particle.age / particle.lifetime));
        }
    }

    // Update Splashes
    for (let i = splashParticles.length - 1; i >= 0; i--) {
        const particle = splashParticles[i];
        particle.age += delta;
        if (particle.age > particle.lifetime) {
            scene.remove(particle);
            particle.geometry.dispose();
            particle.material.dispose();
            splashParticles.splice(i, 1);
        } else {
            // Apply gravity to splashes
            particle.velocity.add(gravityDirection.clone().multiplyScalar(playerSettings.gravityStrength * delta * 5));
            particle.position.add(particle.velocity.clone().multiplyScalar(delta));
        }
    }
}

// --- NEW: Atmosphere and Sky Functions ---
function initSky() {
    sky = new THREE.Mesh(
        new THREE.SphereGeometry(1000, 32, 32), // A large sphere to act as the skybox
        new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: {
                uSunPosition: { value: new THREE.Vector3() },
                uPlanetCenter: { value: planetCenter },
                uPlanetRadius: { value: PLANET_RADIUS  + WATER_LEVEL_OFFSET }, // { value: PLANET_RADIUS},
                uAtmosphereRadius: { value: ATMOSPHERE_TOP_HEIGHT },
                uCameraPos: { value: new THREE.Vector3() },
                uTime: { value: 0.0 },
                // Scattering uniforms
                uRayleigh: { value: RAYLEIGH_COEFFICIENTS },
                uMie: { value: MIE_COEFFICIENTS },
                uMieG: { value: MIE_ECCENTRICITY },
                uDensityFalloff: { value: DENSITY_FALLOFF },
                // Cloud uniforms
                uCloudCover: { value:  0.3 }, // 0.4 },
                uCloudScale: { value: -0.05 },// 0.01 // 0.0005 },
                uCloudSpeed: { value: 0.15 }, // 0.02 },
                uCloudBottom: { value: PLANET_RADIUS + CLOUD_BOTTOM_ALTITUDE  + WATER_LEVEL_OFFSET  }, // { value: PLANET_RADIUS + CLOUD_BOTTOM_ALTITUDE  },
                uCloudTop: { value: PLANET_RADIUS + CLOUD_TOP_ALTITUDE  + WATER_LEVEL_OFFSET }, // { value: PLANET_RADIUS + CLOUD_TOP_ALTITUDE },
            },
            side: THREE.DoubleSide, // Render the inside of the sphere
            depthWrite: false
        })
    );
    scene.add(sky);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); // Clamp delta to avoid physics glitches

    // --- Sun Position Update ---
    const time = clock.getElapsedTime() * 0.1;
    const sunPosition = new THREE.Vector3(
        Math.sin(time) * 1000,
        Math.cos(time) * 1000,
        0
    );
    
    if (sun) {
        sun.position.copy(sunPosition);
    }

    if (sky) {
        sky.material.uniforms.uSunPosition.value.copy(sunPosition);
        sky.material.uniforms.uCameraPos.value.copy(camera.position);
        sky.material.uniforms.uTime.value = clock.getElapsedTime();
    }

    if (isLocked && player) {
        // --- ROTATIONS ---
        const planetRotationSpeed = 0.02; // Radians per second
        const moonAxialRotationSpeed = 0.1; // Radians per second, faster for visibility
        const rotationAxis = new THREE.Vector3(0, 1, 0);

        const planetDeltaRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis, planetRotationSpeed * delta);
        const moonAxialDeltaRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis, moonAxialRotationSpeed * delta);
        // --- END ROTATIONS ---

        const oldMoonPosition = moonPosition.clone(); // Capture moon position at start of frame

        // --- SCENE OBJECTS UPDATE ---
        // Rotate the planet and everything on it
        if (marchingCubesMesh) marchingCubesMesh.applyQuaternion(planetDeltaRotation);
        if (waterMesh) waterMesh.applyQuaternion(planetDeltaRotation);
        if (cubeParent) cubeParent.applyQuaternion(planetDeltaRotation);
        grassLODs.forEach(lod => lod.applyQuaternion(planetDeltaRotation));
        anemoneLODs.forEach(lod => lod.applyQuaternion(planetDeltaRotation));

        // Orbit and rotate the moon and its children
        if (marchingCubesMeshMoon) {
            moonPosition.applyQuaternion(planetDeltaRotation); // Orbit around planet

            // Apply orbit to moon mesh and its cube container
            marchingCubesMeshMoon.position.copy(moonPosition);
            moonCubeParent.position.copy(moonPosition);

            // Apply axial rotation to moon mesh and its cube container
            marchingCubesMeshMoon.applyQuaternion(moonAxialDeltaRotation);
            moonCubeParent.applyQuaternion(moonAxialDeltaRotation);
        }
        // --- END SCENE OBJECTS UPDATE ---

        // --- Player Update Logic ---
        const distToPlanet = player.position.distanceTo(planetCenter);
        const distToMoon = marchingCubesMeshMoon ? player.position.distanceTo(marchingCubesMeshMoon.position) : Infinity;

        let dominantBody, dominantBodyRadius;
        dominantBodyPosition = planetCenter; // Default to planet

        if (distToPlanet < distToMoon) {
            // --- ON PLANET ---
            dominantBody = marchingCubesMesh;
            dominantBodyPosition = planetCenter;
            dominantBodyRadius = PLANET_RADIUS;

            // Apply planet's rotation to the player to "stick" them to the surface
            player.position.applyQuaternion(planetDeltaRotation);
            player.velocity.applyQuaternion(planetDeltaRotation);
            player.quaternion.premultiply(planetDeltaRotation);

        } else if (marchingCubesMeshMoon) {
            // --- ON MOON ---
            dominantBody = marchingCubesMeshMoon;
            dominantBodyPosition = marchingCubesMeshMoon.position;
            dominantBodyRadius = MOON_RADIUS;

            // To fix drift, calculate the new position based on the moon's full transformation.
            // 1. Get player's position relative to the moon's center BEFORE this frame's rotation.
            const playerRelativePos = player.position.clone().sub(oldMoonPosition);
            // 2. Apply the moon's axial rotation to this relative vector.
            playerRelativePos.applyQuaternion(moonAxialDeltaRotation);
            // 3. The new player position is the moon's NEW center + the rotated relative vector.
            player.position.copy(moonPosition).add(playerRelativePos);

            // Update velocity and orientation to match the combined rotation.
            player.velocity.applyQuaternion(planetDeltaRotation);
            player.velocity.applyQuaternion(moonAxialDeltaRotation);
            player.quaternion.premultiply(planetDeltaRotation);
            player.quaternion.premultiply(moonAxialDeltaRotation);
        }


        const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const gravityDirection = dominantBodyPosition.clone().sub(player.position).normalize();

        // Non-linear gravity falloff
        const distFromSurface = player.position.distanceTo(dominantBodyPosition) - dominantBodyRadius;
        const l1_distance = MOON_ORBIT_DISTANCE / 2; // Simplified L1 point
        let gravityFactor = 1.0;
        if (distFromSurface > 0 && distFromSurface < l1_distance) {
            gravityFactor = 1.0 - Math.pow(distFromSurface / l1_distance, 2);
        }

        const waterRadius = waterMesh.geometry.parameters.radius;
        const distToWaterCenter = player.position.distanceTo(planetCenter);
        const isInWater = distToWaterCenter < waterRadius;
        const maxWaterSpeed = playerSettings.speed * 0.5; // Half of the normal speed

        // --- Water Effects ---
        const now = clock.getElapsedTime();
        const isIntersectingWater = Math.abs(distToWaterCenter - waterRadius) < 0.5; // Player is at the surface

        // Bubble effect - when fully submerged
        if (isInWater && !isIntersectingWater && now - lastBubbleTime > 0.2) {
            createBubble();
            lastBubbleTime = now;
        }

        // Splash effect - when moving at the water surface
        const isMovingHorizontally = (keys.w || keys.a || keys.s || keys.d);
        if (isIntersectingWater && isMovingHorizontally && now - lastSplashTime > 0.1) {
            const splashPos = player.position.clone();
            // Project player position onto the water sphere to get the exact surface point
            const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
            splashPos.sub(playerUp.multiplyScalar(distToWaterCenter - waterRadius));
            createSplashEffect(splashPos);
            lastSplashTime = now;
        }
        wasInWater = isInWater;
        // --- End Water Effects ---

        // Lava damage is now handled in the collision detection section below.

        // Swimming Animation
        const targetRotation = new THREE.Quaternion();
        const targetPosition = new THREE.Vector3();

        if (isInWater && !player.onGround) {
            // Rotate body back and move it up and behind the head
            targetRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            targetPosition.set(0, 0.8, 0.6);
        } else {
            targetRotation.identity();
            targetPosition.set(0, -0.3, 0); // Original position
        }
        player.body.quaternion.slerp(targetRotation, 0.1);
        player.body.position.lerp(targetPosition, 0.1);

        // 1. Apply gravity
        if (!player.onGround && !isInWater) { // Add !isInWater condition
            player.velocity.add(gravityDirection.multiplyScalar(playerSettings.gravityStrength * gravityFactor));
        } else if (isInWater) {
            // If in water, apply damping and handle vertical controls
            player.velocity.multiplyScalar(0.98); // Water resistance

            if (!player.onGround) {
                const waterVerticalSpeed = playerSettings.speed * 0.5;
                if (keys.space) {
                    player.velocity.add(playerUp.clone().multiplyScalar(waterVerticalSpeed * delta));
                }
                if (keys.c || keys.ctrl) {
                    player.velocity.sub(playerUp.clone().multiplyScalar(waterVerticalSpeed * delta));
                }
            }

            const currentSpeed = player.velocity.length();
            // If the current speed exceeds the maximum water speed, scale it down
            if (currentSpeed > maxWaterSpeed) {
                player.velocity.normalize().multiplyScalar(maxWaterSpeed);
            }
        }

        // 2. Get movement input and project onto tangent plane
        const moveDirection = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
        if (keys.w) moveDirection.add(forward);
        if (keys.s) moveDirection.sub(forward);
        if (keys.a) moveDirection.add(right.clone().multiplyScalar(-1));
        if (keys.d) moveDirection.add(right);

        const verticalComponent = player.velocity.clone().projectOnVector(playerUp);
        const horizontalComponent = player.velocity.clone().sub(verticalComponent);

        if (moveDirection.lengthSq() > 0) {
            const projectedMove = moveDirection.projectOnPlane(playerUp).normalize();
            const targetVelocity = projectedMove.multiplyScalar(playerSettings.speed);
            if (isInWater) {
                player.velocity.add(targetVelocity.multiplyScalar(delta)); // Direct application in water
            } else {
                horizontalComponent.lerp(targetVelocity, 0.2);
            }
        } else if (!isInWater) {
            horizontalComponent.lerp(new THREE.Vector3(), 0.1);
        }
        if (!isInWater) {
            player.velocity.copy(horizontalComponent).add(verticalComponent);
        }

        // 3. Update position based on velocity
        player.position.add(player.velocity.clone().multiplyScalar(delta));

        // 4. Collision detection and response (only if not in water)

        const groundObjects = [marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh).concat(cubes);
        const rayOrigin = player.position.clone().add(playerUp.clone().multiplyScalar(-playerSettings.height * 0.5));
        raycaster.set(rayOrigin, gravityDirection);
        const intersects = raycaster.intersectObjects(groundObjects);

        player.onGround = false;
        if (intersects.length > 0) {
            const intersected = intersects[0]; // Get the full intersection object
            const hitPoint = intersected.point;
            const distanceToHitPoint = rayOrigin.distanceTo(hitPoint);
            const groundDetectionTolerance = 0.1;
            const verticalSpeed = player.velocity.dot(playerUp);

            if (distanceToHitPoint < groundDetectionTolerance && verticalSpeed < 0.05) {
                player.onGround = true;
                const snapOffset = 0.01;
                player.position.copy(hitPoint.clone().add(playerUp.clone().multiplyScalar(playerSettings.height * 0.5 + snapOffset)));
                const verticalVelocityComponent = playerUp.clone().multiplyScalar(player.velocity.dot(playerUp));
                player.velocity.sub(verticalVelocityComponent);

                // --- DEBUG AND DAMAGE LOGIC ---
                let groundMaterialId = 'unknown';
                const intersectedObject = intersected.object;

                if (cubes.includes(intersectedObject)) {
                    // It's a placed block
                    groundMaterialId = intersectedObject.userData.materialId || 'unknown_cube';
                } else if (intersectedObject === marchingCubesMesh || intersectedObject === marchingCubesMeshMoon) {
                    // It's the terrain
                    const onMoon = (intersectedObject === marchingCubesMeshMoon);
                    const material = getMaterialAtPoint(hitPoint, intersected.face.normal, onMoon);
                    groundMaterialId = material.id;
                }

                // Display debug message
                messageBox.textContent = `Standing on: ${groundMaterialId}`;

                // Apply damage if lava
                if (groundMaterialId === 'lava' && clock.getElapsedTime() - player.lastDamageTime > 0.5) {
                    takeDamage(10);
                }
            }
        }

        // Upward collision correction
        if (!player.onGround && groundObjects.length > 0) {
            const rayOriginUpward = player.position.clone();
            raycaster.set(rayOriginUpward, playerUp);
            const intersectsUpward = raycaster.intersectObjects(groundObjects);
            if (intersectsUpward.length > 0 && intersectsUpward[0].distance < playerSettings.height * 0.5) {
                const hitPointUpward = intersectsUpward[0].point;
                player.position.copy(hitPointUpward.clone().add(playerUp.clone().multiplyScalar(playerSettings.height * 0.5 + 0.01)));
                player.onGround = true;
                const verticalVel = player.velocity.dot(playerUp);
                if (verticalVel < 0) player.velocity.sub(playerUp.clone().multiplyScalar(verticalVel));
            }
        }
        // }

        // 5. Orient player to stand upright on the dominant body
        const playerCurrentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(player.quaternion);
        const newUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const correction = new THREE.Quaternion().setFromUnitVectors(playerCurrentUp, newUp);
        player.quaternion.slerp(correction.multiply(player.quaternion), 0.2);
    }

    updateParticles(delta); // Update bubbles and splashes
    updateCamera();
    updateFoliageLODs(); // New call for foliage LOD logic

    // Update water shader uniforms
    if (waterMesh && waterMesh.material.userData.shader) {
        const shader = waterMesh.material.userData.shader;
        shader.uniforms.time.value = clock.getElapsedTime();
        // Values are now read from the waterSettings constant and don't need to be updated here
    }

    renderer.render(scene, camera);
}

function updateFoliageLODs() {
    if (!player) return;

    const foliageTypes = [
        { lods: grassLODs, map: voxelToGrassMap },
        { lods: anemoneLODs, map: voxelToAnemoneMap }
    ];

    const playerPos = player.position;
    const tempMatrix = new THREE.Matrix4();
    const instancePos = new THREE.Vector3();

    foliageTypes.forEach(type => {
        if (type.lods.length === 0 || type.map.size === 0) return;

        type.lods.forEach(lod => lod.count = 0);

        type.map.forEach((instanceId, mapKey) => {
            // Get the master matrix from the highest LOD mesh
            type.lods[0].getMatrixAt(instanceId, tempMatrix);
            instancePos.setFromMatrixPosition(tempMatrix);

            // Check if the instance has been mined (scaled to zero)
            if (tempMatrix.elements[0] === 0 && tempMatrix.elements[5] === 0) return;

            const dist = playerPos.distanceTo(instancePos);

            let lodIndex = -1;
            for (let j = 0; j < GRASS_LOD_DISTANCES.length; j++) {
                if (dist < GRASS_LOD_DISTANCES[j]) {
                    lodIndex = j;
                    break;
                }
            }

            if (lodIndex !== -1) {
                const targetLOD = type.lods[lodIndex];
                // Copy the matrix to the correct LOD at the correct index
                targetLOD.setMatrixAt(targetLOD.count, tempMatrix);
                targetLOD.count++;
            }
        });

        // Tell Three.js to update the instance matrices for all LODs of this type
        type.lods.forEach(lod => {
            lod.instanceMatrix.needsUpdate = true;
        });
    });
}

window.onload = function () {
    init();
    animate();
};