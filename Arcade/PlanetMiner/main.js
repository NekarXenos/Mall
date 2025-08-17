import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { MATERIALS } from './materials.js';
import { EdgeVertexIndices, TriangleTable, generateMarchingCubesGeometry } from './marchingCubes.js';
import { terrainNoise, sunGlowVertexShader, sunGlowFragmentShader, skyVertexShader, skyFragmentShader } from './shaders.js';
import { initWaterMaterial } from './waterShader.js';

// Set up basic Three.js scene components
let scene, camera, renderer, raycaster;
let marchingCubesMesh, marchingCubesMeshMoon;
let waterMesh;
let torchLight; // Global variable for the torch spotlight
let sky, sun; // NEW: For atmosphere
let originMarker, playerMarker; // For map view

// --- Inventory & Building ---
let inventory = {};
const buildableMaterials = [];
let selectedMaterialIndex = 0;
let cubes = [];
let cubeParent, moonCubeParent;
let moonRotation = new THREE.Quaternion();
const builtCubeMaterials = {};
let moonGroup; // Container for the moon and its cubes

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
let isSolarSystemView = false; // For solar system view
let solarSystemCamera; // For solar system view
let solarSystemViewMode = 0; // 0: Top (X), 1: Side (Y), 2: Front (Z) // was 0: Top (Y), 1: Side (X), 2: Front (Z)

const playerSettings = {
    height: 2,
    speed: 5.0, // Units per second
    gravityStrength: 9.8, // A more standard gravity value (will be scaled by delta)
    jumpStrength: 5, // per-jump impulse
    sensitivity: 0.002,
    maxHealth: 100
};
const planetCenter = new THREE.Vector3(0, 0, 0);
let dominantBodyPosition = planetCenter;
const keys = { w: false, a: false, s: false, d: false, space: false, c: false, ctrl: false, arrowLeft: false, arrowRight: false };
let isLocked = false;

// --- Particle Systems ---
let bubbleParticles = [];
let splashParticles = [];
let lastBubbleTime = 0;
let lastSplashTime = 0;
let wasInWater = false; // To detect entering/exiting water

// Mobile control variables
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

// --- Atmosphere & Cloud Parameters ---
const ATMOSPHERE_THICKNESS = 15.0;
const ATMOSPHERE_TOP_HEIGHT = PLANET_RADIUS + ATMOSPHERE_THICKNESS;
const DENSITY_FALLOFF = 8;
const RAYLEIGH_COEFFICIENTS = new THREE.Vector3(5.8e-4, 1.35e-3, 3.31e-3);
const MIE_COEFFICIENTS = new THREE.Vector3(2.0e-5, 2.0e-5, 2.0e-5);
const MIE_ECCENTRICITY = 0.76;
const CLOUD_BOTTOM_ALTITUDE = 6;
const CLOUD_TOP_ALTITUDE = 8;

let voxelData = [], voxelDataMoon = [];
let moonPosition = new THREE.Vector3();
const simplex = new SimplexNoise();

// Noise parameters
const initialNoiseScale = 0.02, noiseStrength = 0.5, octaves = 6, lacunarity = 2.0, persistence = 0.5;

// Water parameters
const waterSettings = {
    waveSpeed: 1.5,
    waveAmplitude: 100,
    blueFreq: 1.0,
    greenFreq: 20.0
};

// DOM Elements
const overlay = document.getElementById('overlay');
const messageBox = document.getElementById('message-box');
const mapViewInfo = document.getElementById('map-view-info');
let canvas;

/**
 * Determines the material type at a given world point.
 * @param {THREE.Vector3} worldPoint - The point in world space.
 * @param {THREE.Vector3} surfaceNormal - The surface normal.
 * @param {boolean} onMoon - If the point is on the moon.
 * @returns {object} The material object from MATERIALS.
 */
function getMaterialAtPoint(worldPoint, surfaceNormal, onMoon = false) {
    const center = onMoon ? moonPosition : planetCenter;
    const radius = onMoon ? MOON_RADIUS : PLANET_RADIUS;
    const waterRadius = PLANET_RADIUS + WATER_LEVEL_OFFSET;

    let terrainNoiseVal;
    if (onMoon) {
        const localPoint = worldPoint.clone().sub(moonPosition);
        terrainNoiseVal = getRidgedMultifractalNoise(localPoint.x, localPoint.y, localPoint.z, simplex, 0.05, 0.3, 5, 2.2, 0.4);
    } else {
        terrainNoiseVal = getRidgedMultifractalNoise(worldPoint.x, worldPoint.y, worldPoint.z, simplex, initialNoiseScale, noiseStrength, octaves, lacunarity, persistence);
    }
    
    const distSurface = (1.0 + terrainNoiseVal - ISO_LEVEL) * radius;
    const distCenter = worldPoint.distanceTo(center);
    const depth = distSurface - distCenter;

    if (onMoon) {
        if (depth > 7) return MATERIALS.LAVA;
        if (depth > 2) return MATERIALS.MOON_ROCK;
        if (depth >= 0) return MATERIALS.MOON_SAND;
    } else {
        if (depth > 15) return MATERIALS.LAVA;
        if (depth > 3) return MATERIALS.ROCK;
        if (depth >= 0) return MATERIALS.SOIL;
    }

    const upVector = worldPoint.clone().sub(center).normalize();
    const slope = 1.0 - Math.abs(surfaceNormal.dot(upVector));

    if (onMoon) {
        return slope > 0.4 ? MATERIALS.MOON_ROCK : MATERIALS.MOON_SAND;
    }

    const poleThreshold = 0.85;
    if (!onMoon && Math.abs(upVector.y) > poleThreshold) {
        return MATERIALS.ICE;
    }

    const heightAboveWater = distCenter - waterRadius;
    const isVertical = slope > 0.7;
    const isSteep = slope > 0.3;

    if (isVertical || isSteep) {
        return MATERIALS.ROCK;
    }

    if (heightAboveWater < -1.0) {
        const underwaterPattern = simplex.noise3D(worldPoint.x * 2, worldPoint.y * 2, worldPoint.z * 2);
        if (underwaterPattern < -0.3 || underwaterPattern > 0.3) return MATERIALS.ANEMONE;
        return MATERIALS.SAND;
    }

    if (Math.abs(heightAboveWater) <= 1.0) {
        return MATERIALS.SAND;
    }

    if (heightAboveWater > 1.0) {
        return MATERIALS.GRASS;
    }

    return MATERIALS.SOIL;
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
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    solarSystemCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    scene.add(solarSystemCamera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.body.appendChild(renderer.domElement);
    canvas = renderer.domElement;

    const sunGeometry = new THREE.SphereGeometry(20, 32, 32);
    const sunMaterial = new THREE.MeshStandardMaterial({ color: 0xffffee,  emissive: 0xffffff, emissiveIntensity: 1000000, side: THREE.BackSide, fog: true });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.castShadow = false;
    sun.receiveShadow = false;
    
    const ambientLight = new THREE.AmbientLight(0xccddee, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 4, 0, 0);
    sun.add(pointLight);

    initSky();
    scene.add(sun);

    // --- NEW: Initialize markers for solar system view ---
    originMarker = new THREE.AxesHelper(100);
    originMarker.visible = false;
    scene.add(originMarker);
    
    playerMarker = new THREE.Mesh(
        new THREE.SphereGeometry(5, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
    );
    playerMarker.visible = false;
    scene.add(playerMarker);
    // --- End Marker Initialization ---

    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            pointSize: { value: 50 },
            glowColor: { value: new THREE.Color(0xffd2a1) }
        },
        vertexShader: sunGlowVertexShader,
        fragmentShader: sunGlowFragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: true
    });
    sun.add(new THREE.Points(glowGeometry, glowMaterial));

    torchLight = new THREE.SpotLight(0xffffff, 0, 50, Math.PI / 6, 0.5, 2);
    torchLight.castShadow = true;
    torchLight.shadow.mapSize.width = 1024;
    torchLight.shadow.mapSize.height = 1024;
    scene.add(torchLight);
    torchLight.target = new THREE.Object3D();
    scene.add(torchLight.target);

    raycaster = new THREE.Raycaster();

    for (const key in MATERIALS) {
        const mat = MATERIALS[key];
        if (mat.buildable) {
            inventory[mat.id] = 0;
            buildableMaterials.push(mat.id);
            const materialOptions = { color: mat.color, roughness: 0.8 };
            if (mat.emissive) {
                materialOptions.emissive = mat.emissive;
                materialOptions.emissiveIntensity = 1.0;
            }
            if (mat.id === 'ice') {
                materialOptions.roughness = 0.2;
                materialOptions.metalness = 0.1;
                materialOptions.transparent = true;
                materialOptions.opacity = 0.8;
            }
            builtCubeMaterials[mat.id] = new THREE.MeshStandardMaterial(materialOptions);
        }
    }

    setupFoliage();

    // --- FIXED: Initialize moonGroup before generating the moon ---
    moonGroup = new THREE.Group();
    scene.add(moonGroup);

    generatePlanet();
    generateMoon();
    createWaterLayer();

    cubeParent = new THREE.Group();
    scene.add(cubeParent);

    moonCubeParent = new THREE.Group();
    moonGroup.add(moonCubeParent);

    createPlayer();
    setupEventListeners();
    setupInventoryUI();

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

function createWaterLayer() {
    const waterGeometry = new THREE.IcosahedronGeometry(PLANET_RADIUS + WATER_LEVEL_OFFSET, 20);
    const waterMaterial = new THREE.MeshStandardMaterial({
        metalness: 0.9,
        roughness: 0.3,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    initWaterMaterial(waterMaterial, waterSettings);
    waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.position.copy(planetCenter);
    scene.add(waterMesh);
}

function createPlayer() {
    player = new THREE.Group();
    player.velocity = new THREE.Vector3();
    player.onGround = false;
    player.health = playerSettings.maxHealth;
    player.lastDamageTime = 0;

    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x5588ff });
    player.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    player.body.castShadow = true;
    player.body.position.y = -0.3;
    player.add(player.body);

    const headGeometry = new THREE.DodecahedronGeometry(0.5, 0);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    player.head = new THREE.Mesh(headGeometry, headMaterial);
    player.head.castShadow = true;
    player.head.position.y = 0.8;
    player.add(player.head);

    player.position.set(0, PLANET_RADIUS + playerSettings.height, 0);
    const initialUp = player.position.clone().normalize();
    player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), initialUp);
    scene.add(player);
}

function onMouseDownDesktop(event) {
    if (!isLocked) return;
    event.preventDefault();
    if (event.button === 0) mineBlockAtCrosshair();
    else if (event.button === 1) firePowerLaser();
    else if (event.button === 2) placeBlockAtCrosshair();
}

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

function setupFoliage() {
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

    const anemoneMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1, side: THREE.DoubleSide });
    for (let i = 0; i < GRASS_LOD_DISTANCES.length; i++) {
        const bladeCount = GRASS_LOD_BLADES[i];
        const anemonePatchGeometry = createGrassPatchGeometry(bladeCount);
        const lodMesh = new THREE.InstancedMesh(anemonePatchGeometry, anemoneMaterial, MAX_GRASS_PER_LOD);
        lodMesh.name = `Anemone_LOD_${i}`;
        lodMesh.count = 0;
        scene.add(lodMesh);
        anemoneLODs.push(lodMesh);
    }
}

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

function setupInventoryUI() {
    updateInventoryUI();
}

function updateInventoryUI() {
    const selectedId = buildableMaterials[selectedMaterialIndex];
    const slotsContainer = document.getElementById('inventory-slots');
    slotsContainer.innerHTML = '';

    buildableMaterials.forEach((matId, index) => {
        const mat = Object.values(MATERIALS).find(m => m.id === matId);
        if (!mat) return;

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

function updateMapViewInfo() {
    const viewName = ['Top', 'Side', 'Front'][solarSystemViewMode];
    mapViewInfo.textContent = `View: ${viewName}`;
}

function onKeyDown(event) {
    if (event.code.startsWith('Digit')) {
        const index = parseInt(event.key) - 1;
        if (index >= 0 && index < 9 && index < buildableMaterials.length) {
            selectMaterial(index);
        }
        return;
    }

    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space':
            keys.space = true;
            if (player && player.onGround) {
                const upDirection = player.position.clone().sub(dominantBodyPosition).normalize();
                player.velocity.add(upDirection.multiplyScalar(playerSettings.jumpStrength));
                player.onGround = false;
            }
            break;
        case 'KeyC': keys.c = true; break;
        case 'ControlLeft': case 'ControlRight': keys.ctrl = true; break;
        case 'ArrowLeft': keys.arrowLeft = true; selectPrevMaterial(); break;
        case 'ArrowRight': keys.arrowRight = true; selectNextMaterial(); break;
        case 'KeyL':
            if (!marchingCubesMeshMoon) break;
            const distToPlanet = player.position.distanceTo(planetCenter);
            const distToMoon = player.position.distanceTo(marchingCubesMeshMoon.position);
            if (distToPlanet > distToMoon) {
                player.position.set(0, PLANET_RADIUS + playerSettings.height, 0);
                messageBox.textContent = "Teleported to the Planet!";
            } else {
                player.position.copy(moonPosition.clone().add(new THREE.Vector3(0, MOON_RADIUS + playerSettings.height, 0)));
                messageBox.textContent = "Teleported to the Moon!";
            }
            player.velocity.set(0, 0, 0);
            player.onGround = false;
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            break;
        case 'KeyP':
            // Debug functionality can be added here
            break;
        case 'KeyT':
            torchLight.intensity = torchLight.intensity === 0 ? 1 : 0;
            messageBox.textContent = `Torch ${torchLight.intensity === 1 ? 'ON' : 'OFF'}`;
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            break;
        case 'KeyM':
            isSolarSystemView = !isSolarSystemView;
            if (isSolarSystemView) {
                solarSystemViewMode = 0;
                updateMapViewInfo();
                mapViewInfo.style.display = 'block';
            } else {
                mapViewInfo.style.display = 'none';
            }
            break;
        case 'KeyX':
            if (isSolarSystemView) {
                solarSystemViewMode = (solarSystemViewMode + 1) % 3;
                updateMapViewInfo();
            }
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
        case 'ArrowLeft': keys.arrowLeft = false; break;
        case 'ArrowRight': keys.arrowRight = false; break;
    }
}

// --- FIXED: Restored correct head rotation logic ---
function onMouseMove(event) {
    if (!isLocked || !player) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // Yaw (left/right) rotation for the whole player body
    const upDir = player.position.clone().sub(dominantBodyPosition).normalize();
    const yaw = -movementX * playerSettings.sensitivity;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(upDir, yaw);
    player.quaternion.premultiply(yawQuat);

    // Pitch (up/down) rotation for the player's head only, with clamping
    const pitch = -movementY * playerSettings.sensitivity;
    player.head.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.head.rotation.x + pitch));
}

function onPointerLockChange() {
    isLocked = document.pointerLockElement === canvas;
    overlay.style.display = isLocked ? 'none' : 'flex';
    messageBox.style.display = isLocked ? 'block' : 'none';
    document.getElementById('health-bar-container').style.display = isLocked ? 'block' : 'none';
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
    setTimeout(() => { damageOverlay.style.opacity = 0; }, 250);
    if (player.health <= 0) {
        player.health = 0;
        respawnPlayer();
    }
    updateHealthUI();
}

function respawnPlayer() {
    messageBox.textContent = "You have perished! Respawning...";
    messageBox.style.display = 'block';
    player.health = playerSettings.maxHealth;
    player.velocity.set(0, 0, 0);
    for (const key in MATERIALS) {
        if (MATERIALS[key].buildable) {
            inventory[MATERIALS[key].id] = 0;
        }
    }
    updateInventoryUI();
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

        let targetGrid, targetGridSize, targetCenterOffset;
        let isMarchingCubesObject = false;
        let onMoon = false;

        if (intersectedObject === marchingCubesMesh) {
            targetGrid = voxelData;
            targetGridSize = GRID_SIZE;
            targetCenterOffset = planetCenter;
            isMarchingCubesObject = true;
            onMoon = false;
        } else if (intersectedObject === marchingCubesMeshMoon) {
            targetGrid = voxelDataMoon;
            targetGridSize = GRID_SIZE_MOON;
            targetCenterOffset = marchingCubesMeshMoon.position;
            isMarchingCubesObject = true;
            onMoon = true;
        }

        if (isMarchingCubesObject) {
            const localPoint = offsetWorldPoint.clone().sub(targetCenterOffset);
            const halfTargetGrid = targetGridSize / 2;
            const gridX = Math.floor(localPoint.x / BLOCK_SIZE + halfTargetGrid);
            const gridY = Math.floor(localPoint.y / BLOCK_SIZE + halfTargetGrid);
            const gridZ = Math.floor(localPoint.z / BLOCK_SIZE + halfTargetGrid);

            if (gridX >= 0 && gridX < targetGridSize && gridY >= 0 && gridY < targetGridSize && gridZ >= 0 && gridZ < targetGridSize) {
                targetGrid[gridX][gridY][gridZ] = 0;
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
            const minedMaterialId = intersectedObject.userData.materialId;
            if (minedMaterialId && inventory[minedMaterialId] !== undefined) {
                inventory[minedMaterialId]++;
                updateInventoryUI();
            }
            const builtMaterial = Object.values(MATERIALS).find(m => m.id === minedMaterialId) || MATERIALS.ROCK;
            createMiningEffect(intersectionPoint, builtMaterial);
            if (intersectedObject.parent) {
                intersectedObject.parent.remove(intersectedObject);
            }
            cubes = cubes.filter(cube => cube.uuid !== intersectedObject.uuid);
            intersectedObject.geometry.dispose();
        }
    }
}

function createChamferedBlockGeometry(width, height, depth) {
    const w = width / 2, h = height / 2, d = depth / 2;
    const points = [];
    const getRandomChamfer = (dim) => THREE.MathUtils.randFloat(dim / 10, dim / 3);
    const corners = [
        new THREE.Vector3(w, h, d), new THREE.Vector3(w, h, -d),
        new THREE.Vector3(w, -h, d), new THREE.Vector3(w, -h, -d),
        new THREE.Vector3(-w, h, d), new THREE.Vector3(-w, h, -d),
        new THREE.Vector3(-w, -h, d), new THREE.Vector3(-w, -h, -d)
    ];
    corners.forEach(corner => {
        const sx = Math.sign(corner.x), sy = Math.sign(corner.y), sz = Math.sign(corner.z);
        const chamferX = getRandomChamfer(width), chamferY = getRandomChamfer(height), chamferZ = getRandomChamfer(depth);
        points.push(new THREE.Vector3(corner.x - sx * chamferX, corner.y, corner.z));
        points.push(new THREE.Vector3(corner.x, corner.y - sy * chamferY, corner.z));
        points.push(new THREE.Vector3(corner.x, corner.y, corner.z - sz * chamferZ));
    });
    return new ConvexGeometry(points);
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

        // --- START: New logic for lava on ice/snow ---
        if (materialIdToBuild === 'lava') {
            let transformed = false;
            let targetMaterialId = null;

            // Determine the material of the block being targeted
            if (cubes.includes(intersected.object)) {
                targetMaterialId = intersected.object.userData.materialId;
            } else if (intersected.object === marchingCubesMesh) {
                const groundMaterial = getMaterialAtPoint(hitPoint, faceNormal, false);
                targetMaterialId = groundMaterial.id;
            }

            // If the target is ice (which represents snow at the poles)
            if (targetMaterialId === 'ice') {
                // Case 1: The target is a player-built ice cube
                if (cubes.includes(intersected.object)) {
                    intersected.object.material = builtCubeMaterials['basalt'];
                    intersected.object.userData.materialId = 'basalt';
                    transformed = true;
                } 
                // Case 2: The target is natural ice/snow terrain
                else if (intersected.object === marchingCubesMesh) {
                    // Find the voxel coordinates to replace
                    const localPoint = hitPoint.clone().add(faceNormal.clone().multiplyScalar(-0.1)).sub(planetCenter);
                    const gridX = Math.floor(localPoint.x / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridY = Math.floor(localPoint.y / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridZ = Math.floor(localPoint.z / BLOCK_SIZE + GRID_SIZE / 2);

                    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE && gridZ >= 0 && gridZ < GRID_SIZE) {
                        // Remove the ice voxel from the terrain data
                        voxelData[gridX][gridY][gridZ] = 0;
                        updateMarchingCubesMesh(); // Regenerate the terrain mesh

                        // Place a new basalt cube in its place
                        const newBlockWorldPos = new THREE.Vector3(
                            (gridX - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridY - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridZ - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE
                        );
                        const newCube = new THREE.Mesh(createChamferedBlockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), builtCubeMaterials['basalt']);
                        newCube.position.copy(newBlockWorldPos);
                        newCube.userData.materialId = 'basalt';
                        cubeParent.add(newCube);
                        cubes.push(newCube);
                        transformed = true;
                    }
                }

                if (transformed) {
                    messageBox.textContent = "Ice and snow melt into basalt!";
                    setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
                    // Consume the lava from inventory since it was "used up" in the reaction
                    inventory[materialIdToBuild]--;
                    updateInventoryUI();
                    return; // Exit the function to prevent placing a lava block
                }
            }
        }
        // --- END: New logic for lava on ice/snow ---

        if (materialIdToBuild === 'ice') {
            let transformed = false;
            let wasBuiltCube = false;
            if (cubes.includes(intersected.object) && intersected.object.userData.materialId === 'lava') {
                intersected.object.material = builtCubeMaterials['basalt'];
                intersected.object.userData.materialId = 'basalt';
                transformed = true;
                wasBuiltCube = true;
            }
            else if (intersected.object === marchingCubesMesh) {
                const groundMaterial = getMaterialAtPoint(hitPoint, faceNormal, false);
                if (groundMaterial.id === 'lava') {
                    const localPoint = hitPoint.clone().add(faceNormal.clone().multiplyScalar(-0.1)).sub(planetCenter);
                    const gridX = Math.floor(localPoint.x / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridY = Math.floor(localPoint.y / BLOCK_SIZE + GRID_SIZE / 2);
                    const gridZ = Math.floor(localPoint.z / BLOCK_SIZE + GRID_SIZE / 2);
                    if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE && gridZ >= 0 && gridZ < GRID_SIZE) {
                        voxelData[gridX][gridY][gridZ] = 0;
                        updateMarchingCubesMesh();
                        const newBlockWorldPos = new THREE.Vector3(
                            (gridX - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridY - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE,
                            (gridZ - GRID_SIZE / 2 + 0.5) * BLOCK_SIZE
                        );
                        const newCube = new THREE.Mesh(createChamferedBlockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), builtCubeMaterials['basalt']);
                        newCube.position.copy(newBlockWorldPos);
                        newCube.userData.materialId = 'basalt';
                        cubeParent.add(newCube);
                        cubes.push(newCube);
                        transformed = true;
                    }
                }
            }
            if (transformed) {
                messageBox.textContent = "Lava cooled into basalt!";
                setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
                if (!wasBuiltCube) {
                   inventory[materialIdToBuild]--;
                   updateInventoryUI();
                }
                return;
            }
        }

        const newPosition = hitPoint.clone().add(faceNormal.clone().multiplyScalar(BLOCK_SIZE / 2));
        if (newPosition.distanceTo(player.position) < BLOCK_SIZE) {
            messageBox.textContent = "Cannot place block inside yourself!";
            setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            return;
        }

        let finalMaterialId = materialIdToBuild;
        if (finalMaterialId === 'lava' && !onMoon) {
            const isInWater = newPosition.distanceTo(planetCenter) < (PLANET_RADIUS + WATER_LEVEL_OFFSET);
            if (isInWater) {
                finalMaterialId = 'basalt';
                messageBox.textContent = "Lava cooled into basalt in the water!";
                setTimeout(() => { messageBox.textContent = "Controls active"; }, 1500);
            }
        }
        
        inventory[materialIdToBuild]--;
        const newCubeGeometry = createChamferedBlockGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        const newCube = new THREE.Mesh(newCubeGeometry, builtCubeMaterials[finalMaterialId]);
        newCube.userData.materialId = finalMaterialId;
        const parent = onMoon ? moonCubeParent : cubeParent;
        newCube.position.copy(newPosition);
        
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
    const beamLength = 1000;
    const startPoint = ray.origin;
    const endPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(beamLength));
    const beamGeometry = new THREE.CylinderGeometry(0.1, 0.1, beamLength, 8);
    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        fog: false
    });
    const beamMesh = new THREE.Mesh(beamGeometry, beamMaterial);
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    beamMesh.position.copy(midPoint);
    beamMesh.lookAt(endPoint);
    beamMesh.rotateX(Math.PI / 2);
    scene.add(beamMesh);
    setTimeout(() => {
        if (beamMesh.parent) {
            scene.remove(beamMesh);
            beamMesh.geometry.dispose();
            beamMesh.material.dispose();
        }
    }, 500);
}

function firePowerLaser() {
    for (const matId in inventory) {
        inventory[matId] = 0;
    }
    updateInventoryUI();
    messageBox.textContent = "Inventory Cleared! Firing Laser!";
    setTimeout(() => { messageBox.textContent = "Controls active"; }, 2000);

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects([marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh));
    if (intersects.length === 0) {
        createLaserBeamEffect(raycaster.ray);
        return;
    }

    const intersected = intersects[0];
    const targetObject = intersected.object;
    const laserRay = raycaster.ray;
    createLaserBeamEffect(laserRay);

    let targetGrid, targetGridSize, targetCenterOffset, updateFunction;

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
        return;
    }

    const laserRadius = 2.0;
    const laserRadiusSq = laserRadius * laserRadius;
    const halfGrid = targetGridSize / 2;
    const voxelWorldPos = new THREE.Vector3();
    for (let x = 0; x < targetGridSize; x++) {
        for (let y = 0; y < targetGridSize; y++) {
            for (let z = 0; z < targetGridSize; z++) {
                voxelWorldPos.set(
                    (x - halfGrid + 0.5) * BLOCK_SIZE,
                    (y - halfGrid + 0.5) * BLOCK_SIZE,
                    (z - halfGrid + 0.5) * BLOCK_SIZE
                ).add(targetCenterOffset);
                if (laserRay.distanceSqToPoint(voxelWorldPos) < laserRadiusSq) {
                    targetGrid[x][y][z] = 0;
                }
            }
        }
    }
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
                const terrainNoiseVal = getRidgedMultifractalNoise(wx, wy, wz, simplex, initialNoiseScale, noiseStrength, octaves, lacunarity, persistence);
                const normalizedDist = dist / PLANET_RADIUS;
                voxelData[x][y][z] = (1.0 - normalizedDist) + terrainNoiseVal;
            }
        }
    }
    updateMarchingCubesMesh();
}

let moonBlobs = [];
let moonCraters = [];

function generateMoon() {
    const lightDirForMoonPlacement = new THREE.Vector3(1, 1, 1).normalize();
    moonPosition.copy(lightDirForMoonPlacement).negate().setLength(MOON_ORBIT_DISTANCE);
    const halfGridMoon = GRID_SIZE_MOON / 2;

    if (moonBlobs.length === 0) {
        const numBlobs = 5;
        for (let i = 0; i < numBlobs; i++) {
            const randomDirection = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
            const blobCenter = randomDirection.clone().multiplyScalar((MOON_RADIUS / 2) - 1);
            const blobRadius = MOON_RADIUS * (Math.random() * 0.3 + 0.2);
            moonBlobs.push({ center: blobCenter, radius: blobRadius });
        }
        moonCraters = [];
        const numCraters = 25;
        const maxAttemptsPerCrater = 20;
        for (let i = 0; i < numCraters; i++) {
            for (let attempt = 0; attempt < maxAttemptsPerCrater; attempt++) {
                const randomDirection = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
                const craterCenter = randomDirection.clone().multiplyScalar(MOON_RADIUS / 2);
                const craterRadius = MOON_RADIUS * (Math.random() * 0.15 + 0.05);
                let overlaps = false;
                for (const existingCrater of moonCraters) {
                    const distance = craterCenter.distanceTo(existingCrater.center);
                    if (distance < craterRadius + existingCrater.radius + (BLOCK_SIZE * 2)) {
                        overlaps = true;
                        break;
                    }
                }
                if (!overlaps) {
                    moonCraters.push({ center: craterCenter, radius: craterRadius });
                    break;
                }
            }
        }
    }

    for (let x = 0; x < GRID_SIZE_MOON; x++) {
        voxelDataMoon[x] = [];
        for (let y = 0; y < GRID_SIZE_MOON; y++) {
            voxelDataMoon[x][y] = [];
            for (let z = 0; z < GRID_SIZE_MOON; z++) {
                const worldX = (x - halfGridMoon + 0.5) * BLOCK_SIZE;
                const worldY = (y - halfGridMoon + 0.5) * BLOCK_SIZE;
                const worldZ = (z - halfGridMoon + 0.5) * BLOCK_SIZE;
                const distFromMainCenter = Math.sqrt(worldX ** 2 + worldY ** 2 + worldZ ** 2);
                let finalDensity = 1.0 - (distFromMainCenter / MOON_RADIUS);
                for (const blob of moonBlobs) {
                    const distFromBlobCenter = Math.sqrt((worldX - blob.center.x) ** 2 + (worldY - blob.center.y) ** 2 + (worldZ - blob.center.z) ** 2);
                    const blobDensity = 1.0 - (distFromBlobCenter / blob.radius);
                    finalDensity = Math.max(finalDensity, blobDensity);
                }
                for (const crater of moonCraters) {
                    const distFromCraterCenter = Math.sqrt((worldX - crater.center.x) ** 2 + (worldY - crater.center.y) ** 2 + (worldZ - crater.center.z) ** 2);
                    const craterDensity = 1.0 - (distFromCraterCenter / crater.radius);
                    if (craterDensity > 0) {
                        finalDensity -= craterDensity;
                    }
                }
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
    }
    const geometry = generateMarchingCubesGeometry(voxelData, ISO_LEVEL, GRID_SIZE, BLOCK_SIZE, planetCenter);
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
    const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide, vertexColors: true });
    marchingCubesMesh = new THREE.Mesh(geometry, material);
    scene.add(marchingCubesMesh);
    populateFoliage();
}

function populateFoliage() {
    grassLODs.forEach(lod => lod.count = 0);
    anemoneLODs.forEach(lod => lod.count = 0);
    voxelToGrassMap.clear();
    voxelToAnemoneMap.clear();
    const dummy = new THREE.Object3D();
    let grassInstanceIndex = 0;
    let anemoneInstanceIndex = 0;
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
        const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
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
            dummy.position.copy(pos);
            dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);
            dummy.updateMatrix();
            if (isUnderwater) {
                if (anemoneInstanceIndex < MAX_GRASS_PER_LOD && !voxelToAnemoneMap.has(mapKey)) {
                    const localMatrix = dummy.matrix.clone().premultiply(inverseAnemoneMatrix);
                    anemoneLODs.forEach(lod => lod.setMatrixAt(anemoneInstanceIndex, localMatrix));
                    voxelToAnemoneMap.set(mapKey, anemoneInstanceIndex);
                    anemoneInstanceIndex++;
                }
            } else {
                if (grassInstanceIndex < MAX_GRASS_PER_LOD && !voxelToGrassMap.has(mapKey)) {
                    const localMatrix = dummy.matrix.clone().premultiply(inverseGrassMatrix);
                    grassLODs.forEach(lod => lod.setMatrixAt(grassInstanceIndex, localMatrix));
                    voxelToGrassMap.set(mapKey, grassInstanceIndex);
                    grassInstanceIndex++;
                }
            }
        }
    }
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
        moonGroup.remove(marchingCubesMeshMoon);
        if (marchingCubesMeshMoon.geometry) marchingCubesMeshMoon.geometry.dispose();
    }
    const geometry = generateMarchingCubesGeometry(voxelDataMoon, ISO_LEVEL, GRID_SIZE_MOON, BLOCK_SIZE, moonPosition);
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
    const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide, vertexColors: true });
    marchingCubesMeshMoon = new THREE.Mesh(geometry, material);
    marchingCubesMeshMoon.position.copy(moonPosition);
    moonGroup.add(marchingCubesMeshMoon);
    const moonLight = new THREE.PointLight(0x6080ff, 0.6, MOON_ORBIT_DISTANCE * 1.2, 1.5);
    marchingCubesMeshMoon.add(moonLight);
}

function createMiningEffect(position, minedMaterial) {
    const particleCount = 10;
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({ color: minedMaterial.color });
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry.clone(), particleMaterial.clone());
        particle.position.copy(position);
        particle.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
        particle.decay = 0.02;
        scene.add(particle);
        let opacity = 1;
        const interval = setInterval(() => {
            if (opacity <= 0) {
                scene.remove(particle);
                clearInterval(interval);
                particle.geometry.dispose();
                particle.material.dispose();
            } else {
                particle.position.add(particle.velocity);
                particle.material.opacity = opacity;
                particle.material.transparent = true;
                particle.scale.multiplyScalar(0.95);
                opacity -= particle.decay;
            }
        }, 50);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    solarSystemCamera.aspect = window.innerWidth / window.innerHeight;
    solarSystemCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (isMobileDevice()) {
        const rect = joystickBase.getBoundingClientRect();
        joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
}

function updateCamera() {
    if (!player) return;

    if (isSolarSystemView) {
        // --- Solar System View Logic ---
        const boundingBox = new THREE.Box3();
        if (sun) boundingBox.expandByObject(sun);
        if (marchingCubesMesh) boundingBox.expandByObject(marchingCubesMesh);
        if (marchingCubesMeshMoon) boundingBox.expandByObject(marchingCubesMeshMoon);
        
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = solarSystemCamera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 1.5 / Math.tan(fov / 2));

        switch (solarSystemViewMode) {
            case 0: solarSystemCamera.position.set(center.x, center.y, center.z + cameraZ); break; // Top-down view // Front view
            case 1: solarSystemCamera.position.set(center.x, center.y + cameraZ, center.z); break; // Top-down view
            case 2: solarSystemCamera.position.set(center.x + cameraZ, center.y, center.z); break; //  Front view // Was Side view
        }
        solarSystemCamera.lookAt(center);

        // --- FIXED: Make markers visible and update player marker position ---
        player.body.visible = true;
        player.head.visible = true;
        if (originMarker) originMarker.visible = true;
        if (playerMarker) {
            playerMarker.visible = true;
            playerMarker.position.copy(player.position);
        }
        return;
    }

    // --- FIXED: Hide markers when not in solar system view ---
    if (originMarker) originMarker.visible = false;
    if (playerMarker) playerMarker.visible = false;

    camera.up.copy(player.position).sub(dominantBodyPosition).normalize();
    const headPosition = new THREE.Vector3();
    player.head.getWorldPosition(headPosition);

    if (isFirstPersonView) {
        player.body.visible = false;
        player.head.visible = false;
        if (torchLight) {
            torchLight.position.copy(camera.position);
            torchLight.target.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
            torchLight.target.updateMatrixWorld();
        }
        const headQuaternion = new THREE.Quaternion();
        player.head.getWorldQuaternion(headQuaternion);
        camera.position.copy(headPosition);
        camera.quaternion.copy(headQuaternion);
    } else {
        player.body.visible = true;
        player.head.visible = true;
        if (torchLight) {
            torchLight.position.copy(headPosition);
            torchLight.target.position.copy(headPosition).add(player.head.getWorldDirection(new THREE.Vector3()).multiplyScalar(10));
            torchLight.target.updateMatrixWorld();
        }
        const headQuaternion = new THREE.Quaternion();
        player.head.getWorldQuaternion(headQuaternion);
        const offsetFromHead = thirdPersonCameraOffset.clone();
        offsetFromHead.y -= player.head.position.y;
        const cameraOffsetRotated = offsetFromHead.clone().applyQuaternion(headQuaternion);
        const desiredCameraPosition = headPosition.clone().add(cameraOffsetRotated);
        camera.position.lerp(desiredCameraPosition, 0.15);
        camera.lookAt(headPosition);
    }
    if (torchLight) {
        torchLight.visible = (torchLight.intensity > 0);
    }
}

function createBubble() {
    const bubbleGeometry = new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.02, 0.05), 8, 8);
    const bubbleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
    const headPosition = new THREE.Vector3();
    player.head.getWorldPosition(headPosition);
    bubble.position.copy(headPosition).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.2, (Math.random() - 0.5) * 0.5));
    const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
    bubble.velocity = playerUp.clone().multiplyScalar(THREE.MathUtils.randFloat(0.5, 1.0));
    bubble.velocity.add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1));
    bubble.lifetime = 2;
    bubble.age = 0;
    scene.add(bubble);
    bubbleParticles.push(bubble);
}

function createSplashEffect(position) {
    const particleCount = 15;
    const splashGeometry = new THREE.SphereGeometry(0.05, 6, 6);
    const splashMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff });
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(splashGeometry, splashMaterial);
        particle.position.copy(position);
        const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const randomDirection = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize();
        const splashVector = randomDirection.projectOnPlane(playerUp).normalize();
        splashVector.add(playerUp.clone().multiplyScalar(THREE.MathUtils.randFloat(0.5, 1.0)));
        particle.velocity = splashVector.multiplyScalar(THREE.MathUtils.randFloat(4, 9));
        particle.lifetime = 1.5;
        particle.age = 0;
        scene.add(particle);
        splashParticles.push(particle);
    }
}

function updateParticles(delta) {
    const gravityDirection = dominantBodyPosition.clone().sub(player.position).normalize();
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
    for (let i = splashParticles.length - 1; i >= 0; i--) {
        const particle = splashParticles[i];
        particle.age += delta;
        if (particle.age > particle.lifetime) {
            scene.remove(particle);
            particle.geometry.dispose();
            particle.material.dispose();
            splashParticles.splice(i, 1);
        } else {
            particle.velocity.add(gravityDirection.clone().multiplyScalar(playerSettings.gravityStrength * delta * 5));
            particle.position.add(particle.velocity.clone().multiplyScalar(delta));
        }
    }
}

function initSky() {
    sky = new THREE.Mesh(
        new THREE.SphereGeometry(ATMOSPHERE_TOP_HEIGHT, 64, 64),
        new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: {
                uSunPosition: { value: new THREE.Vector3() },
                uPlanetCenter: { value: planetCenter },
                uPlanetRadius: { value: PLANET_RADIUS + WATER_LEVEL_OFFSET },
                uAtmosphereRadius: { value: ATMOSPHERE_TOP_HEIGHT },
                uCameraPos: { value: new THREE.Vector3() },
                uTime: { value: 0.0 },
                uRayleigh: { value: RAYLEIGH_COEFFICIENTS },
                uMie: { value: MIE_COEFFICIENTS },
                uMieG: { value: MIE_ECCENTRICITY },
                uDensityFalloff: { value: DENSITY_FALLOFF },
                uCloudCover: { value: 0.3 },
                uCloudScale: { value: -0.05 },
                uCloudSpeed: { value: 0.15 },
                uCloudBottom: { value: PLANET_RADIUS + CLOUD_BOTTOM_ALTITUDE + WATER_LEVEL_OFFSET },
                uCloudTop: { value: PLANET_RADIUS + CLOUD_TOP_ALTITUDE + WATER_LEVEL_OFFSET },
                uScatteringEnabled: { value: 1.0 },
            },
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    scene.add(sky);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    const time = clock.getElapsedTime() * 0.1;
    const sunPosition = new THREE.Vector3(Math.sin(time) * 1000, Math.cos(time) * 1000, 0);
    if (sun) {
        sun.position.copy(sunPosition);
    }

    if (sky) {
        sky.material.uniforms.uSunPosition.value.copy(sunPosition);
        sky.material.uniforms.uCameraPos.value.copy(camera.position);
        sky.material.uniforms.uTime.value = clock.getElapsedTime();
    }

    if (isLocked && player) {
        const planetRotationSpeed = 0.02;
        const moonAxialRotationSpeed = 0.1;
        const rotationAxis = new THREE.Vector3(0, 1, 0);
        const planetDeltaRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis, planetRotationSpeed * delta);
        const moonAxialDeltaRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis, moonAxialRotationSpeed * delta);
        const oldMoonPosition = moonPosition.clone();

        if (sky) sky.applyQuaternion(planetDeltaRotation);
        if (marchingCubesMesh) marchingCubesMesh.applyQuaternion(planetDeltaRotation);
        if (waterMesh) {
            waterMesh.applyQuaternion(planetDeltaRotation);
            if (waterMesh.material.userData.shader) {
                waterMesh.material.userData.shader.uniforms.time.value = clock.getElapsedTime();
            }
        }
        if (cubeParent) cubeParent.applyQuaternion(planetDeltaRotation);
        grassLODs.forEach(lod => lod.applyQuaternion(planetDeltaRotation));
        anemoneLODs.forEach(lod => lod.applyQuaternion(planetDeltaRotation));

        if (marchingCubesMeshMoon) {
            moonPosition.applyQuaternion(planetDeltaRotation);
            marchingCubesMeshMoon.position.copy(moonPosition);
            moonCubeParent.position.copy(moonPosition);
            marchingCubesMeshMoon.applyQuaternion(moonAxialDeltaRotation);
            moonCubeParent.applyQuaternion(moonAxialDeltaRotation);
        }

        const distToPlanet = player.position.distanceTo(planetCenter);
        const distToMoon = marchingCubesMeshMoon ? player.position.distanceTo(marchingCubesMeshMoon.position) : Infinity;

        let dominantBodyRadius;
        if (distToMoon < distToPlanet) {
            dominantBodyPosition = marchingCubesMeshMoon.position;
            dominantBodyRadius = MOON_RADIUS;
            const playerRelativePos = player.position.clone().sub(oldMoonPosition);
            playerRelativePos.applyQuaternion(moonAxialDeltaRotation);
            player.position.copy(moonPosition).add(playerRelativePos);
            player.velocity.applyQuaternion(planetDeltaRotation).applyQuaternion(moonAxialDeltaRotation);
            player.quaternion.premultiply(planetDeltaRotation).premultiply(moonAxialDeltaRotation);
        } else {
            dominantBodyPosition = planetCenter;
            dominantBodyRadius = PLANET_RADIUS;
            player.position.applyQuaternion(planetDeltaRotation);
            player.velocity.applyQuaternion(planetDeltaRotation);
            player.quaternion.premultiply(planetDeltaRotation);
        }

        const playerUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const gravityDirection = playerUp.clone().negate();

        const distFromSurface = player.position.distanceTo(dominantBodyPosition) - dominantBodyRadius;
        const l1_distance = MOON_ORBIT_DISTANCE / 2;
        let gravityFactor = 1.0;
        if (distFromSurface > 0 && distFromSurface < l1_distance) {
            gravityFactor = 1.0 - Math.pow(distFromSurface / l1_distance, 2);
        }

        const waterRadius = waterMesh.geometry.parameters.radius;
        const distToWaterCenter = player.position.distanceTo(planetCenter);
        const isInWater = distToWaterCenter < waterRadius;
        const maxWaterSpeed = playerSettings.speed * 0.5;

        const now = clock.getElapsedTime();
        const isIntersectingWater = Math.abs(distToWaterCenter - waterRadius) < 0.5;
        if (isInWater && !isIntersectingWater && now - lastBubbleTime > 0.2) {
            createBubble();
            lastBubbleTime = now;
        }
        const isMovingHorizontally = (keys.w || keys.a || keys.s || keys.d);
        if (isIntersectingWater && isMovingHorizontally && now - lastSplashTime > 0.1) {
            const splashPos = player.position.clone();
            const playerUpLocal = player.position.clone().sub(dominantBodyPosition).normalize();
            splashPos.sub(playerUpLocal.multiplyScalar(distToWaterCenter - waterRadius));
            createSplashEffect(splashPos);
            lastSplashTime = now;
        }
        wasInWater = isInWater;

        const targetRotation = new THREE.Quaternion();
        const targetPosition = new THREE.Vector3();
        if (isInWater && !player.onGround) {
            targetRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            targetPosition.set(0, 0.8, 0.6);
        } else {
            targetRotation.identity();
            targetPosition.set(0, -0.3, 0);
        }
        player.body.quaternion.slerp(targetRotation, 0.1);
        player.body.position.lerp(targetPosition, 0.1);

        // --- FIXED: Apply gravity correctly with delta time ---
        if (!player.onGround && !isInWater) {
            player.velocity.add(gravityDirection.multiplyScalar(playerSettings.gravityStrength * gravityFactor * delta));
        } else if (isInWater) {
            player.velocity.multiplyScalar(0.98);
            if (!player.onGround) {
                const waterVerticalSpeed = playerSettings.speed * 0.5;
                if (keys.space) player.velocity.add(playerUp.clone().multiplyScalar(waterVerticalSpeed * delta));
                if (keys.c || keys.ctrl) player.velocity.sub(playerUp.clone().multiplyScalar(waterVerticalSpeed * delta));
            }
            if (player.velocity.length() > maxWaterSpeed) {
                player.velocity.normalize().multiplyScalar(maxWaterSpeed);
            }
        }

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
                player.velocity.add(targetVelocity.multiplyScalar(delta));
            } else {
                horizontalComponent.lerp(targetVelocity, 0.2);
            }
        } else if (!isInWater) {
            horizontalComponent.lerp(new THREE.Vector3(), 0.1);
        }
        if (!isInWater) {
            player.velocity.copy(horizontalComponent).add(verticalComponent);
        }

        player.position.add(player.velocity.clone().multiplyScalar(delta));

        const groundObjects = [marchingCubesMesh, marchingCubesMeshMoon].filter(mesh => mesh).concat(cubes);
        const rayOrigin = player.position.clone().add(playerUp.clone().multiplyScalar(-playerSettings.height * 0.5));
        raycaster.set(rayOrigin, gravityDirection);
        const intersects = raycaster.intersectObjects(groundObjects);
        player.onGround = false;
        if (intersects.length > 0) {
            const intersected = intersects[0];
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
                let groundMaterialId = 'unknown';
                const intersectedObject = intersected.object;
                if (cubes.includes(intersectedObject)) {
                    groundMaterialId = intersectedObject.userData.materialId || 'unknown_cube';
                } else if (intersectedObject === marchingCubesMesh || intersectedObject === marchingCubesMeshMoon) {
                    const onMoon = (intersectedObject === marchingCubesMeshMoon);
                    const material = getMaterialAtPoint(hitPoint, intersected.face.normal, onMoon);
                    groundMaterialId = material.id;
                }
                messageBox.textContent = `Standing on: ${groundMaterialId}`;
                if (groundMaterialId === 'lava' && clock.getElapsedTime() - player.lastDamageTime > 0.5) {
                    takeDamage(10);
                }
            }
        }

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

        const playerCurrentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(player.quaternion);
        const newUp = player.position.clone().sub(dominantBodyPosition).normalize();
        const correction = new THREE.Quaternion().setFromUnitVectors(playerCurrentUp, newUp);
        player.quaternion.slerp(correction.multiply(player.quaternion), 0.2);
    }

    updateParticles(delta);
    updateCamera();
    updateFoliageLODs();

    if (waterMesh && waterMesh.material.userData.shader) {
        const shader = waterMesh.material.userData.shader;
        shader.uniforms.time.value = clock.getElapsedTime();
    }

    const activeCamera = isSolarSystemView ? solarSystemCamera : camera;
    renderer.render(scene, activeCamera);
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
            type.lods[0].getMatrixAt(instanceId, tempMatrix);
            instancePos.setFromMatrixPosition(tempMatrix);
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
                targetLOD.setMatrixAt(targetLOD.count, tempMatrix);
                targetLOD.count++;
            }
        });
        type.lods.forEach(lod => {
            lod.instanceMatrix.needsUpdate = true;
        });
    });
}

window.onload = function () {
    init();
    animate();
};
