import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { 
    SUN_RADIUS, WALK_SPEED, RUN_SPEED, BODY_HALF_HEIGHT, 
    SWIM_SPEED, SWIM_UP_SPEED, WATER_DRAG, BUOYANCY, 
    MAX_NO_JETPACK_ALTITUDE, 
    ROCKET_ENTER_DISTANCE, ROCKET_LENGTH, ROCKET_MAIN_THRUST, ROCKET_BOOST_THRUST, ROCKET_TURN_SPEED, ROCKET_RCS_THRUST, ROCKET_BRAKE_FORCE, G_CONSTANT, 
    LAUNCH_ASSIST_TARGET_RADIAL_SPEED, LAUNCH_ASSIST_ACCEL, LAUNCH_ASSIST_GRACE_TIME, LAUNCH_ASSIST_CLEARANCE, LAUNCH_STRENGTH, LAUNCH_BASE_BODY_RADIUS, 
    TRACTOR_BEAM_PULL_FORCE, TRACTOR_BEAM_ROTATION_SYNC, TRACTOR_BEAM_MAX_DISTANCE, 
    NUM_PLANETS, PLANET_MIN_RADIUS, PLANET_MAX_RADIUS, MAX_MOONS_PER_PLANET, MOON_MIN_RADIUS_FACTOR, MOON_MAX_RADIUS_FACTOR,
    MOUSE_SENSITIVITY, MAX_PITCH, COLOR_PALETTE, CHARACTER_GRAVITY, JUMP_STRENGTH, JETPACK_THRUST, JETPACK_DOWN_THRUST
} from './pConstants.js';
import { createBlackHoleBubble, updateBlackHoleBubble } from './pBlackHoleBubble.js';
import { SceneSetup } from './pSceneSetup.js';
import { generateSolarSystem, getOrbitMaxDistance } from './pSolarSystemGenerator.js';
import { segmentIntersectsSphere, findBodyByMesh, calculateTrajectoryGravity } from './pPhysics.js';
import { CharacterController } from './pCharacterController.js';
import { CameraController } from './pCameraController.js';
import { RocketSystem } from './pRocketSystem.js';
import { UIManager } from './pUISystem.js';
import { VisualEffectsManager, SunAnimationManager, AnimationLoopManager } from './pRenderPipeline.js';
import { InputManager } from './pInputSystem.js';
import { generatePlanetTerrain, TERRAIN_COLOR_THEMES } from './pTerrain.js';
import { LODManager, findClosestSystemIndex } from './pLODSystem.js';

window.addEventListener('load', () => {
            // Get UI elements
            const infoElement = document.getElementById('info');
            
            // =================== SOLAR SYSTEM GENERATION ===================
            const solarSystemData = generateSolarSystem();

            // =================== THREE.JS SETUP ===================
            const sceneSetup = new SceneSetup();
            const scene = sceneSetup.scene;
            const renderer = sceneSetup.renderer;
            const camera = sceneSetup.camera;
            const thirdPersonCamera = sceneSetup.thirdPersonCamera;
            const firstPersonCamera = sceneSetup.firstPersonCamera;
            
            // Initialize Camera Controller
            const cameraController = new CameraController(sceneSetup, null, null); // Will set pivot and headGroup later
            
            // Initialize free camera configurations based on solar system size
            const furthestPlanet = solarSystemData.length > 0 ? solarSystemData[solarSystemData.length - 1] : { orbitRadius: SUN_RADIUS * 4 };
            cameraController.initFreeCameraConfigs(furthestPlanet.orbitRadius, SUN_RADIUS);
            
            // Add lighting
            const sunLight = sceneSetup.addSunLight();
            const ambientLight = sceneSetup.addAmbientLight();
            
            // Screen texture target reference
            let screenTextureTarget = sceneSetup.screenTextureTarget;

            // =================== REMAINING STATE VARIABLES ===================
            // Debug mode variables
            let debugMode = false;
            //let debugAxesGroup = null;

            // Removed duplicate World-space helpers for rocket axes (account for parent transforms)


            // =================== SUN TEXTURE GENERATION ===================
            function generateSunTexture(width, height, time, canvas = null) {
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                }
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(width, height);
                for (let x = 0; x < width; x++) {
                    for (let y = 0; y < height; y++) {
                        const nx = x / width - 0.5;
                        const ny = y / height - 0.5;
                        const d = Math.sqrt(nx * nx + ny * ny);
                        const turb = (Math.sin((nx + time * 0.1) * 10) + Math.cos((ny - time * 0.07) * 8)) * 0.5;
                        const val = Math.max(0, 1 - d * 2 + turb * 0.3);
                        const idx = (y * width + x) * 4;
                        imageData.data[idx] = Math.floor(255 * Math.pow(val, 0.8));
                        imageData.data[idx + 1] = Math.floor(200 * Math.pow(val, 1.2));
                        imageData.data[idx + 2] = Math.floor(50 * val);
                        imageData.data[idx + 3] = 255;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                return canvas;
            }

            function generateCoronaTexture(width, height, time, canvas = null) {
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                }
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(width, height);
                const data = imageData.data;
                const centerX = width / 2;
                const centerY = height / 2;

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const dx = x - centerX;
                        const dy = y - centerY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx);
                        
                        const maxDist = width / 2;
                        const normDist = dist / maxDist;
                        
                        const numFlares = 8;
                        const flareAngle = angle + time * 0.5;
                        const flarePattern = Math.sin(flareAngle * numFlares) * 0.5 + 0.5;
                        
                        const turbulence = Math.sin(dist * 0.05 + time * 2) * 0.3 + 
                                         Math.cos(angle * 3 + time) * 0.2;
                        
                        let intensity = (1.0 - normDist) * (0.5 + flarePattern * 0.5 + turbulence);
                        intensity = Math.max(0, Math.min(1, intensity));
                        intensity = Math.pow(intensity, 1.5);
                        
                        const idx = (y * width + x) * 4;
                        data[idx] = Math.floor(255 * intensity);
                        data[idx + 1] = Math.floor(240 * intensity);
                        data[idx + 2] = Math.floor(150 * intensity);
                        data[idx + 3] = Math.floor(255 * intensity * 0.6);
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                return canvas;
            }

            // =================== BUILD SCENE FROM GENERATED DATA ===================
            // Pre-create canvases for sun textures
            const sunCanvas = document.createElement('canvas');
            sunCanvas.width = 256;
            sunCanvas.height = 256;
            const sunTexture = new THREE.CanvasTexture(sunCanvas);
            generateSunTexture(256, 256, 0, sunCanvas);
            sunTexture.needsUpdate = true;

            const coronaCanvas = document.createElement('canvas');
            coronaCanvas.width = 512;
            coronaCanvas.height = 512;
            const coronaTexture = new THREE.CanvasTexture(coronaCanvas);
            generateCoronaTexture(512, 512, 0, coronaCanvas);
            coronaTexture.needsUpdate = true;

            const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, 64, 64);
            const sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
            const sun = new THREE.Mesh(sunGeometry, sunMaterial);
            scene.add(sun);

            // Add corona sprite
            const corona = new THREE.Sprite(new THREE.SpriteMaterial({
                map: coronaTexture,
                color: 0xffffaa,
                transparent: true,
                blending: THREE.AdditiveBlending,
                opacity: 0.8
            }));
            corona.scale.set(SUN_RADIUS * 4, SUN_RADIUS * 4, 1);
            sun.add(corona);

            const teleportLocations = [];
            const allBlackHoleBubbles = []; // Store all bubbles for animation updates
            
            // Sun collapse and black hole state
            let sunCollapsing = false;
            let sunCollapseTimer = 0;
            let questComplete = false;
            let blackHoleActive = false;
            let blackHoleSystem = {};

            // =================== ASSIGN COLOR THEMES TO PLANETS AND MOONS ===================
            // Create an array of available non-Earth themes for random selection
            const nonEarthThemes = [
                TERRAIN_COLOR_THEMES.LUNA,      // Light grey
                TERRAIN_COLOR_THEMES.MERCURY,   // Dark grey
                TERRAIN_COLOR_THEMES.MARS,      // Reddish iron-rich
                TERRAIN_COLOR_THEMES.SULFUR,    // Yellow sulfuric
                TERRAIN_COLOR_THEMES.ROCKY,     // Grey-brown rocky
                TERRAIN_COLOR_THEMES.ICY        // White/blue icy
            ];
            
            // Assign color themes to planets
            solarSystemData.forEach((planetData, pIndex) => {
                if (pIndex === 0) {
                    // First planet is always Earth-like
                    planetData.colorTheme = TERRAIN_COLOR_THEMES.EARTHLIKE;
                } else {
                    // Other planets get random themes from the pool
                    planetData.colorTheme = nonEarthThemes[Math.floor(Math.random() * nonEarthThemes.length)];
                }
                
                // Assign color themes to moons (always non-Earth themes)
                if (planetData.moons && planetData.moons.length > 0) {
                    planetData.moons.forEach((moonData) => {
                        moonData.colorTheme = nonEarthThemes[Math.floor(Math.random() * nonEarthThemes.length)];
                    });
                }
            });

            solarSystemData.forEach((planetData, pIndex) => {
                const planetSystemLocations = [];

                const planetGroup = new THREE.Object3D();
                planetData.planetGroup = planetGroup;
                scene.add(planetGroup);
                
                // Store LOD metadata
                planetData.systemIndex = pIndex;
                planetData.bodyIndex = 0;
                planetData.pivot = planetGroup;

                // --- Create Black Hole Bubble for Planet ---
                const planetBubbleSize = planetData.effectiveRadius * 0.2;
                const planetBubble = createBlackHoleBubble(planetBubbleSize, camera);
                planetGroup.add(planetBubble);
                planetData.blackHoleBubble = planetBubble;
                planetBubble.userData.originalRadius = planetData.radius;
                planetBubble.userData.bodyData = planetData;
                allBlackHoleBubbles.push(planetBubble);

                // --- Create Planet Mesh with Voxel Terrain ---
                let planet;
                let oceanRadius;
                let actualTerrainRadius = planetData.radius;
                
                // All planets now use voxel terrain
                const terrainParams = {
                    scale: 0.01 + Math.random() * 0.02, // Vary terrain scale
                    strength: 0.1 + Math.random() * 0.2, // Vary terrain height
                    useFractal: true,
                    levels: 3 + Math.floor(Math.random() * 3), // 3-5 octaves
                    lacunarity: 1.8 + Math.random() * 0.4,
                    persistence: 0.4 + Math.random() * 0.2,
                    ridgedBlend: Math.random() * 0.5, // Random ridged influence
                    sphereBlend: Math.random() * 0.3, // Random sphere smoothing
                    waterLevel: 0.5 + Math.random() * 0.3, // Random water level
                    beachWidthAbove: 0.0,
                    beachWidthBelow: 0.0
                };

                // First planet gets Earth-like settings
                if (pIndex === 0) {
                    terrainParams.scale = 0.01;
                    terrainParams.strength = 0.15;
                    terrainParams.levels = 4;
                    terrainParams.lacunarity = 2.0;
                    terrainParams.persistence = 0.5;
                    terrainParams.ridgedBlend = 0.0;
                    terrainParams.sphereBlend = 0.0;
                    terrainParams.waterLevel = 0.6;
                }
                
                // Gas giants get smoother, more gas-like terrain
                if (planetData.isGasGiant) {
                    terrainParams.scale = 0.005; // Larger features
                    terrainParams.strength = 0.05; // Very subtle variation
                    terrainParams.levels = 2; // Fewer octaves for smoother look
                    terrainParams.ridgedBlend = 0.0; // No ridges
                    terrainParams.sphereBlend = 0.7; // Very smooth
                    terrainParams.waterLevel = 0.0; // No water on gas giants
                }
                
                // Get the color theme for this planet
                const planetColorTheme = planetData.colorTheme || TERRAIN_COLOR_THEMES.EARTHLIKE;
                
                // Store seed for LOD system
                planetData.seed = `planet-${pIndex}-seed-${Math.random()}`;
                
                const terrainResult = generatePlanetTerrain(
                    planetData.radius,
                    planetData.seed,
                    terrainParams,
                    planetColorTheme
                );
                
                planet = terrainResult.terrainMesh;
                planetData.mesh = planet;
                planet.userData.lodLevel = 'high'; // Mark as high LOD for LOD system
                planet.userData.bodyId = `${pIndex}-0`;
                planetBubble.add(planet);
                
                // Add water sphere for non-gas giants with water
                if (!planetData.isGasGiant && terrainParams.waterLevel > 0.1) {
                    oceanRadius = terrainResult.waterRadius;
                    const oceanSphere = terrainResult.waterSphere;
                    planetBubble.add(oceanSphere);
                    planetData.waterSphere = oceanSphere;
                    planetData.waterRadius = oceanRadius;
                }
                
                actualTerrainRadius = terrainResult.terrainRadius;

                // --- Add special features to the first planet ---
                if (pIndex === 0) {
                    // --- Atmosphere ---
                    let atmosphereRadius;
                    if (planetData.moons.length === 0) {
                        atmosphereRadius = actualTerrainRadius * 1.15;
                    } else {
                        const firstMoon = planetData.moons[0];
                        const safeDistance = firstMoon.orbitRadius - firstMoon.radius;
                        const maxAtmosphereRadius = safeDistance * 0.9;
                        atmosphereRadius = Math.min(actualTerrainRadius * 1.15, maxAtmosphereRadius);
                    }

                    const atmosphereGeometry = new THREE.SphereGeometry(atmosphereRadius, 32, 32);
                    const atmosphereMaterial = new THREE.MeshStandardMaterial({
                        color: 0x88ccff,
                        transparent: true,
                        opacity: 0.15,
                        side: THREE.BackSide,
                        depthWrite: false
                    });
                    const atmosphereSphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
                    planetBubble.add(atmosphereSphere);

                    planetData.atmosphereSphere = atmosphereSphere;
                    planetData.atmosphereRadius = atmosphereRadius;
                }

                if (planetData.isGasGiant) {
                    const gasGeometry = new THREE.SphereGeometry(planetData.effectiveRadius, 32);
                    const gasMaterial = new THREE.MeshStandardMaterial({
                        color: COLOR_PALETTE[pIndex % COLOR_PALETTE.length],
                        transparent: true,
                        opacity: 0.35,
                        roughness: 0.2
                    });
                    const gasSphere = new THREE.Mesh(gasGeometry, gasMaterial);
                    planetBubble.add(gasSphere);
                    planetData.gasSphere = gasSphere;

                    const liquidRadius = (planetData.radius + planetData.effectiveRadius) / 2;
                    const liquidGeometry = new THREE.SphereGeometry(liquidRadius, 32, 32);
                    const liquidMaterial = new THREE.MeshStandardMaterial({
                        color: 0x4466aa,
                        transparent: true,
                        opacity: 0.5,
                        roughness: 0.4,
                        metalness: 0.6
                    });
                    const liquidSphere = new THREE.Mesh(liquidGeometry, liquidMaterial);
                    planetBubble.add(liquidSphere);

                    planetData.liquidSphere = liquidSphere;
                    planetData.liquidRadius = liquidRadius;
                }
                
                planetData.name = `Planet ${pIndex + 1}`;
                planetSystemLocations.push({ name: `Planet ${pIndex + 1}`, object: planet, parentGroup: planetGroup, radius: planetData.effectiveRadius });

                // --- Build Rings ---
                if (planetData.rings.length > 0) {
                    const ringSystemGroup = new THREE.Object3D();
                    planetData.ringSystemGroup = ringSystemGroup;
                    planetGroup.add(ringSystemGroup);
                    ringSystemGroup.rotation.x = Math.PI / 2;
                    planetData.rings.forEach(ringData => {
                        const ringGeometry = new THREE.RingGeometry(ringData.innerRadius, ringData.outerRadius, 64);
                        const ringMaterial = new THREE.MeshBasicMaterial({
                            color: COLOR_PALETTE[pIndex % COLOR_PALETTE.length],
                            transparent: true,
                            opacity: 0.6,
                            side: THREE.DoubleSide
                        });
                        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                        ringSystemGroup.add(ring);
                        ringData.mesh = ring;
                    });
                }

                // --- Build Moons with Voxel Terrain ---
                planetData.moons.forEach((moonData, mIndex) => {
                    const moonGroup = new THREE.Object3D();
                    moonGroup.position.set(moonData.orbitRadius, 0, 0);
                    planetData.planetGroup.add(moonGroup);
                    moonData.moonGroup = moonGroup;
                    moonData.isMoon = true;
                    
                    // Store LOD metadata
                    moonData.systemIndex = pIndex;
                    moonData.bodyIndex = mIndex + 1;
                    moonData.pivot = moonGroup;
                    
                    // --- Create Black Hole Bubble for Moon ---
                    const moonBubbleSize = moonData.radius * 0.2;
                    const moonBubble = createBlackHoleBubble(moonBubbleSize, camera);
                    moonGroup.add(moonBubble);
                    moonData.blackHoleBubble = moonBubble;
                    moonBubble.userData.originalRadius = moonData.radius;
                    moonBubble.userData.bodyData = moonData;
                    allBlackHoleBubbles.push(moonBubble);
                    
                    // --- Create Moon Mesh with Voxel Terrain ---
                    const moonTerrainParams = {
                        scale: 0.015 + Math.random() * 0.01, // Slightly finer detail than planets
                        strength: 0.15 + Math.random() * 0.15,
                        useFractal: true,
                        levels: 3 + Math.floor(Math.random() * 2), // 3-4 octaves
                        lacunarity: 2.0 + Math.random() * 0.3,
                        persistence: 0.45 + Math.random() * 0.15,
                        ridgedBlend: Math.random() * 0.6, // Moons can be more cratered/ridged
                        sphereBlend: 0.1 + Math.random() * 0.2,
                        waterLevel: 0.0, // No water on moons by default
                        beachWidthAbove: 0.0,
                        beachWidthBelow: 0.0
                    };
                    
                    // Get the color theme for this moon
                    const moonColorTheme = moonData.colorTheme || TERRAIN_COLOR_THEMES.ROCKY;
                    
                    // Store seed for LOD system
                    moonData.seed = `moon-${pIndex}-${mIndex}-seed-${Math.random()}`;
                    
                    const moonTerrainResult = generatePlanetTerrain(
                        moonData.radius,
                        moonData.seed,
                        moonTerrainParams,
                        moonColorTheme
                    );
                    
                    const moon = moonTerrainResult.terrainMesh;
                    moonData.mesh = moon;
                    moon.userData.lodLevel = 'high'; // Mark as high LOD for LOD system
                    moon.userData.bodyId = `${pIndex}-${mIndex + 1}`;
                    moonBubble.add(moon);
                    
                    moonData.name = `Moon ${mIndex + 1} of Planet ${pIndex + 1}`;
                    planetSystemLocations.push({ 
                        name: moonData.name, 
                        object: moon, 
                        parentGroup: moonGroup, 
                        radius: moonData.radius 
                    });
                });

                teleportLocations.push(planetSystemLocations);

                // Add orbit path ring for this planet
                {
                    const orbitRadius = planetData.orbitRadius;
                    const orbitWidth = Math.max(2, orbitRadius * 0.005);
                    const orbitGeometry = new THREE.RingGeometry(
                        orbitRadius - orbitWidth / 2,
                        orbitRadius + orbitWidth / 2,
                        256
                    );
                    const orbitMaterial = new THREE.MeshBasicMaterial({
                        color: COLOR_PALETTE[pIndex % COLOR_PALETTE.length],
                        transparent: true,
                        opacity: 0.25,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    });
                    const orbitRing = new THREE.Mesh(orbitGeometry, orbitMaterial);
                    orbitRing.rotation.x = Math.PI / 2;
                    orbitRing.position.set(0, -0.05, 0);
                    scene.add(orbitRing);
                    planetData.orbitPathMesh = orbitRing;
                }
            });


            // =================== CHARACTER SETUP ===================
            const pivot = new THREE.Object3D();
            const bodyGeometry = new THREE.BoxGeometry(1, 1.5, 0.5);
            const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            pivot.add(body);

            const headGroup = new THREE.Object3D();
            pivot.add(headGroup);
            const headGeometry = new THREE.IcosahedronGeometry(0.4, 0);
            const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, roughness: 0.5 });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            headGroup.add(head);

            // =================== JETPACK SPACE-SUIT ===================
            // Helmet - semi-transparent sphere
            const helmetGeometry = new THREE.SphereGeometry(0.55, 16, 16);
            const helmetMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x88ccff, 
                transparent: true, 
                opacity: 0.3,
                roughness: 0.1,
                metalness: 0.3
            });
            const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
            headGroup.add(helmet);

            // Jetpack - box on the back
            const jetpackGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
            const jetpackMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x333333, 
                roughness: 0.6,
                metalness: 0.5
            });
            const jetpack = new THREE.Mesh(jetpackGeometry, jetpackMaterial);
            jetpack.position.set(0, 0.3, -0.4); // Position on the back
            body.add(jetpack);

            // Jetpack thrusters (decorative)
            const thrusterGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8);
            const thrusterMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x666666, 
                roughness: 0.3,
                metalness: 0.8,
                emissive: 0x222222
            });
            const thrusterLeft = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
            thrusterLeft.position.set(-0.15, -0.2, -0.55);
            thrusterLeft.rotation.x = Math.PI / 2;
            body.add(thrusterLeft);

            const thrusterRight = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
            thrusterRight.position.set(0.15, -0.2, -0.55);
            thrusterRight.rotation.x = Math.PI / 2;
            body.add(thrusterRight);

            // Jetpack flame effects (will be visible when flying)
            const flameGeometry = new THREE.ConeGeometry(0.12, 0.5, 8);
            const flameMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xff6600,
                transparent: true,
                opacity: 0.8
            });
            const flameLeft = new THREE.Mesh(flameGeometry, flameMaterial);
            flameLeft.position.set(-0.15, -0.5, -0.55);
            flameLeft.rotation.x = Math.PI;
            flameLeft.visible = false;
            body.add(flameLeft);

            const flameRight = new THREE.Mesh(flameGeometry, flameMaterial);
            flameRight.position.set(0.15, -0.5, -0.55);
            flameRight.rotation.x = Math.PI;
            flameRight.visible = false;
            body.add(flameRight);

            headGroup.add(thirdPersonCamera);
            headGroup.add(firstPersonCamera);
            
            // Set character references in camera controller
            cameraController.pivot = pivot;
            cameraController.headGroup = headGroup;

            // =================== CHARACTER CONTROLLER ===================
            const characterController = new CharacterController(
                scene, 
                pivot, 
                body, 
                headGroup, 
                cameraController, 
                solarSystemData
            );
            characterController.setJetpackEquipment(helmet, jetpack, thrusterLeft, thrusterRight, flameLeft, flameRight);
            
            // Legacy compatibility references
            const raycaster = characterController.raycaster;
            let velocityY = characterController.velocityY;
            let isGrounded = characterController.isGrounded;
            let vPos = characterController.vPos;
            let isInWater = characterController.isInWater;
            let jetpackEnabled = characterController.jetpackEnabled;
            let jetpackActive = characterController.jetpackActive;

            // =================== TELEPORTATION & ROCKET MECHANICS ===================
            // infoElement already declared at top of load handler
            
            // Legacy compatibility - sync with controller state
            let currentSurfaceObject = characterController.currentSurfaceObject;
            let currentSystemIndex = characterController.currentSystemIndex;
            let currentBodyIndex = characterController.currentBodyIndex;
            
            // Set teleport locations now that they've been populated during scene building
            characterController.setTeleportLocations(teleportLocations);

           

            // Initialize character at starting position
            characterController.setInitialPosition();
            // Sync legacy references for free camera tracking
            currentSurfaceObject = characterController.currentSurfaceObject;

            // =================== EXPLOSION HELPER FUNCTIONS ===================
            /**
             * Create explosion particle effect moved to pRenderPipeline.js
             * @param {THREE.Vector3} position - World position of explosion
             * @param {THREE.Color} color - Color of explosion particles
             * @param {number} size - Size of the exploding body
             */
 

            /**
             * Safely remove visual elements of a planet/moon while preserving the black hole bubble
             * This allows for planet explosions without damaging the bubble or rocket
             * @param {Object} bodyData - The planet or moon data object
             */
            function removeCelestialBodyVisuals(bodyData) {
                if (!bodyData) return;

                const bubble = bodyData.blackHoleBubble;
                if (!bubble) return;

                // Remove the main mesh (planet or moon surface)
                if (bodyData.mesh && bubble) {
                    bubble.remove(bodyData.mesh);
                    if (bodyData.mesh.geometry) bodyData.mesh.geometry.dispose();
                    if (bodyData.mesh.material) bodyData.mesh.material.dispose();
                    bodyData.mesh = null;
                }

                // Remove atmosphere (if planet has one)
                if (bodyData.atmosphereSphere && bubble) {
                    bubble.remove(bodyData.atmosphereSphere);
                    if (bodyData.atmosphereSphere.geometry) bodyData.atmosphereSphere.geometry.dispose();
                    if (bodyData.atmosphereSphere.material) bodyData.atmosphereSphere.material.dispose();
                    bodyData.atmosphereSphere = null;
                }

                // Remove water sphere (ocean)
                if (bodyData.waterSphere && bubble) {
                    bubble.remove(bodyData.waterSphere);
                    if (bodyData.waterSphere.geometry) bodyData.waterSphere.geometry.dispose();
                    if (bodyData.waterSphere.material) bodyData.waterSphere.material.dispose();
                    bodyData.waterSphere = null;
                }

                // Remove gas sphere (for gas giants)
                if (bodyData.gasSphere && bubble) {
                    bubble.remove(bodyData.gasSphere);
                    if (bodyData.gasSphere.geometry) bodyData.gasSphere.geometry.dispose();
                    if (bodyData.gasSphere.material) bodyData.gasSphere.material.dispose();
                    bodyData.gasSphere = null;
                }

                // Remove liquid sphere (for gas giants)
                if (bodyData.liquidSphere && bubble) {
                    bubble.remove(bodyData.liquidSphere);
                    if (bodyData.liquidSphere.geometry) bodyData.liquidSphere.geometry.dispose();
                    if (bodyData.liquidSphere.material) bodyData.liquidSphere.material.dispose();
                    bodyData.liquidSphere = null;
                }

                // Remove ring system (if planet has rings)
                if (bodyData.ringSystemGroup && bodyData.planetGroup) {
                    bodyData.planetGroup.remove(bodyData.ringSystemGroup);
                    // Dispose of each ring mesh
                    if (bodyData.rings) {
                        bodyData.rings.forEach(ringData => {
                            if (ringData.mesh) {
                                if (ringData.mesh.geometry) ringData.mesh.geometry.dispose();
                                if (ringData.mesh.material) ringData.mesh.material.dispose();
                                ringData.mesh = null;
                            }
                        });
                    }
                    bodyData.ringSystemGroup = null;
                }

                // Note: The black hole bubble and moons remain intact
                // The rocket is not affected as it's managed separately
            }

            /**
             * Trigger an explosion effect for a planet or moon
             * @param {Object} bodyData - The planet or moon data object
             */
            function explodeCelestialBody(bodyData) {
                if (!bodyData) return;
                
                // Check if already exploded
                if (bodyData.hasExploded) {
                    console.log(`${bodyData.name} has already been destroyed`);
                    return;
                }

                // Get world position and color before removing visuals
                const worldPos = new THREE.Vector3();
                if (bodyData.mesh) {
                    bodyData.mesh.getWorldPosition(worldPos);
                }
                
                // Get color from mesh material
                let explosionColor = new THREE.Color(0xff8800); // Default orange
                if (bodyData.mesh && bodyData.mesh.material && bodyData.mesh.material.color) {
                    explosionColor = bodyData.mesh.material.color.clone();
                }
                
                // Create explosion particle effect
                vfxManager.createExplosion(worldPos, explosionColor, bodyData.radius);

                // Remove the visuals after a short delay to allow explosion to start
                setTimeout(() => {
                    removeCelestialBodyVisuals(bodyData);
                }, 100);
                
                // Mark as exploded
                bodyData.hasExploded = true;

                console.log(`${bodyData.name} has exploded! Only the black hole bubble remains.`);
            }

            // =================== BLACK HOLE SYSTEM ===================
            // function cleanupBlackHole() moved to pRenderPipeline.js
          

           //  function createBlackHole()   moved to pRenderPipeline.js
              

            function triggerQuestComplete() {
                if (questComplete) return;
                questComplete = true;

                console.log('Quest Complete! System collapsing...');

                // Explode all planets
                solarSystemData.forEach(planetData => {
                    if (!planetData.hasExploded) {
                        explodeCelestialBody(planetData);
                    }
                    // Also explode all moons
                    planetData.orbiters.forEach(orbiter => {
                        if (orbiter.type === 'moon' && !orbiter.hasExploded) {
                            explodeCelestialBody(orbiter);
                        }
                    });
                });

                // Start the sun collapse animation
                sunCollapsing = true;
                sunCollapseTimer = 0;
            }

            // =================== HELPERS ===================
            function setCurrentLocationByMesh(mesh) {
                const match = findBodyByMesh(mesh, solarSystemData);
                if (!match) return;
                // Use controller's teleport to properly sync all state
                characterController.teleport(match.systemIndex, match.bodyIndex);
                // Sync legacy reference for free camera tracking
                currentSurfaceObject = characterController.currentSurfaceObject;
            }

            // =================== INPUT SYSTEM INITIALIZATION ===================
            const inputManager = new InputManager();
            
            // Setup keydown handler
            inputManager.onKeyDown((key, event, keys) => {

                if (key === 'F') {
                    // Toggle between controlling rocket and character
                    if (rocketSystem.isInRocket) {
                        rocketSystem.switchToCharacter();
                    } else {
                        rocketSystem.switchToRocket();
                    }
                }

                if (key === 'SPACE') {
                    // Jump/jetpack handled by CharacterController in updatePhysics
                    // Just set jetpackActive flag for visual feedback when in jetpack mode
                    if (jetpackEnabled) {
                        jetpackActive = true;
                    }
                }

                if (key === 'V' && !rocketSystem.isInRocket) {
                    const result = cameraController.cycleMode();
                    if (result === 'thirdPerson') {
                        inputManager.requestPointerLock();
                    } else if (result === 'free') {
                        inputManager.exitPointerLock();
                    }
                }

                if (key === 'Z' && cameraController.mode === 'free') {
                    const result = cameraController.cycleFreeZoom();
                    if (result) {
                        const bodyName = teleportLocations[currentSystemIndex][currentBodyIndex].name;
                        const modeStr = jetpackEnabled ? "JETPACK" : "NORMAL";
                        infoElement.textContent = `${modeStr} | ${bodyName} | Zoom: ${result.name} (WASD/QE, ${jetpackEnabled ? 'SPACE/CTRL jetpack' : 'SPACE jump'}, G toggle, F-Rocket, M/L, V, Z)`;
                    }
                }

                if (key === 'Z' && rocketSystem.isInRocket) {
                    if (inputManager.isKeyPressed('SHIFT')) {
                        cameraController.rocketCameraZoomFactor = 1.0;
                    } else {
                        cameraController.rocketCameraZoomFactor *= 0.5;
                    }
                }

                if (key === 'M' && !rocketSystem.isInRocket) {
                    // Teleport to next moon/body within the current system
                    characterController.teleportNextBody();
                    // Sync legacy reference for free camera tracking
                    currentSurfaceObject = characterController.currentSurfaceObject;
                }

                if (key === 'L' && !rocketSystem.isInRocket) {
                    // Teleport to next planetary system
                    characterController.teleportNextSystem();
                    // Sync legacy reference for free camera tracking
                    currentSurfaceObject = characterController.currentSurfaceObject;
                }

                if (key === 'G' && !rocketSystem.isInRocket) {
                    // Toggle jetpack mode
                    characterController.toggleJetpack();
                    // Sync legacy reference
                    jetpackEnabled = characterController.jetpackEnabled;
                    jetpackActive = characterController.jetpackActive;
                }

                if (key === 'P') {
                    // Trigger sun collapse and black hole conversion
                    if (!questComplete) {
                        triggerQuestComplete();
                    }
                }

                if (key === 'R') {
                    // Explode the planet/moon the rocket is currently on
                    console.log('R key pressed - Rocket state:', {
                        isInRocket: rocketSystem.isInRocket,
                        rocketPivotParent: rocketSystem.rocketPivot ? rocketSystem.rocketPivot.parent : null,
                        isLanded: rocketSystem.rocketPivot && rocketSystem.rocketPivot.parent !== scene
                    });
                    
                    if (rocketSystem.isInRocket && rocketSystem.rocketPivot && rocketSystem.rocketPivot.parent !== scene) {
                        // Rocket is landed on a body
                        const landedBody = rocketSystem.rocketPivot.parent;
                        console.log('Landed body:', landedBody);
                        
                        // Find which body this is
                        let explodingBodyData = null;
                        let explodingSystemIndex = -1;
                        let explodingBodyIndex = -1;
                        
                        for (let si = 0; si < solarSystemData.length; si++) {
                            const planetData = solarSystemData[si];
                            
                            // Check if landed on planet mesh
                            if (planetData.mesh === landedBody) {
                                console.log('Found planet mesh match');
                                explodingBodyData = planetData;
                                explodingSystemIndex = si;
                                explodingBodyIndex = 0;
                                break;
                            }
                            
                            // Check if landed on a moon mesh
                            for (let mi = 0; mi < planetData.moons.length; mi++) {
                                const moonData = planetData.moons[mi];
                                if (moonData.mesh === landedBody) {
                                    console.log('Found moon mesh match');
                                    explodingBodyData = moonData;
                                    explodingSystemIndex = si;
                                    explodingBodyIndex = mi + 1;
                                    break;
                                }
                            }
                            if (explodingBodyData) break;
                        }
                        
                        if (explodingBodyData) {
                            console.log(`Exploding ${explodingBodyData.name}...`);
                            
                            // Get rocket's current world position BEFORE any changes
                            const rocketCurrentWorldPos = new THREE.Vector3();
                            rocketSystem.rocketPivot.getWorldPosition(rocketCurrentWorldPos);
                            
                            // Get rocket object's current world quaternion
                            const rocketCurrentWorldQuat = new THREE.Quaternion();
                            rocketSystem.rocketObject.getWorldQuaternion(rocketCurrentWorldQuat);
                            
                            // Detach rocket from body
                            rocketSystem.rocketPivot.parent.remove(rocketSystem.rocketPivot);
                            scene.add(rocketSystem.rocketPivot);
                            
                            // Set rocket pivot to exact world position where it was
                            rocketSystem.rocketPivot.position.copy(rocketCurrentWorldPos);
                            rocketSystem.rocketPivot.position.y = 0; // Keep in orbital plane
                            rocketSystem.rocketPivot.quaternion.identity(); // Reset pivot rotation
                            
                            // Reset rocket object local position/rotation (relative to pivot)
                            rocketSystem.rocketObject.position.set(0, 0, 0);
                            rocketSystem.rocketObject.rotation.set(-Math.PI / 2, 0, 0); // Base rotation
                            rocketSystem.rocketObject.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rocketSystem.rocketYaw);
                            
                            // Give the rocket a small upward velocity to escape
                            rocketSystem.rocketVelocity.set(0, 0, 0);
                            const escapeDirection = rocketCurrentWorldPos.clone().normalize();
                            rocketSystem.rocketVelocity.copy(escapeDirection.multiplyScalar(20)); // 20 m/s escape velocity
                            
                            // Explode the body (removes all visual elements except bubble)
                            explodeCelestialBody(explodingBodyData);
                            
                            // If character is on the same body, teleport to nearest non-exploded planet
                            if (explodingSystemIndex === currentSystemIndex && explodingBodyIndex === currentBodyIndex) {
                                // Find nearest non-exploded planet
                                let nearestPlanetIndex = -1;
                                let nearestDistance = Infinity;
                                
                                for (let si = 0; si < solarSystemData.length; si++) {
                                    const planetData = solarSystemData[si];
                                    if (!planetData.hasExploded && planetData.mesh) {
                                        // Calculate distance from exploded body to this planet
                                        const explodedPos = new THREE.Vector3(
                                            explodingSystemIndex >= 0 ? 
                                                solarSystemData[explodingSystemIndex].orbitRadius * Math.cos(solarSystemData[explodingSystemIndex].orbitAngle) : 0,
                                            0,
                                            explodingSystemIndex >= 0 ? 
                                                solarSystemData[explodingSystemIndex].orbitRadius * Math.sin(solarSystemData[explodingSystemIndex].orbitAngle) : 0
                                        );
                                        const planetPos = new THREE.Vector3(
                                            planetData.orbitRadius * Math.cos(planetData.orbitAngle),
                                            0,
                                            planetData.orbitRadius * Math.sin(planetData.orbitAngle)
                                        );
                                        const distance = explodedPos.distanceTo(planetPos);
                                        
                                        if (distance < nearestDistance) {
                                            nearestDistance = distance;
                                            nearestPlanetIndex = si;
                                        }
                                    }
                                }
                                
                                if (nearestPlanetIndex >= 0) {
                                    console.log(`Teleporting character to nearest safe planet: ${solarSystemData[nearestPlanetIndex].name}`);
                                    characterController.teleport(nearestPlanetIndex, 0);
                                    // Sync legacy references
                                    currentSurfaceObject = characterController.currentSurfaceObject;
                                }
                            }
                            
                            // Rocket remains intact and keeps flying
                            infoElement.textContent = `${explodingBodyData.name} DESTROYED! Only the black hole core remains. (Rocket auto-escaped)`;
                        } else {
                            console.log('Could not identify landed body for explosion. Parent:', landedBody);
                            console.log('Available planet meshes:', solarSystemData.map(p => ({name: p.name, mesh: p.mesh})));
                        }
                    } else {
                        console.log('Rocket must be landed on a planet/moon to explode it (press R)');
                        console.log('Current state: isInRocket =', isInRocket, ', parent =', rocketPivot ? rocketPivot.parent : 'null');
                    }
                }

                if (key === 'T' && rocketSystem.isInRocket) {
                    // Launch rocket to moon orbit distance
                    if (rocketPivot.parent !== scene) {
                        // Get current body information
                        const currentBody = teleportLocations[currentSystemIndex][currentBodyIndex];
                        const bodyRadius = currentBody.radius;
                        
                        // Calculate moon orbit distance (typically 2-4x the body radius)
                        const moonOrbitDistance = bodyRadius * 3;
                        
                        // Get the rocket's current parent (the body it's landed on)
                        const landedOnBody = rocketPivot.parent;
                        
                        // Get the body's world position BEFORE detaching (in XZ plane, Y=0)
                        const bodyWorldPos = new THREE.Vector3();
                        landedOnBody.getWorldPosition(bodyWorldPos);
                        bodyWorldPos.y = 0; // Constrain to orbital plane
                        
                        // Get world position and rotation before detaching
                        const worldPos = new THREE.Vector3();
                        const worldQuat = new THREE.Quaternion();
                        rocketPivot.getWorldPosition(worldPos);
                        rocketPivot.getWorldQuaternion(worldQuat);
                        
                        // Calculate the rocket's position in world space (accounting for local offset)
                        const rocketWorldPos = new THREE.Vector3();
                        rocketObject.getWorldPosition(rocketWorldPos);
                        rocketWorldPos.y = 0; // Constrain to orbital plane
                        
                        // Calculate launch direction (radially away from body center in XZ plane)
                        const launchDirection = new THREE.Vector3()
                            .subVectors(rocketWorldPos, bodyWorldPos)
                            .setY(0) // Ensure it's in the XZ plane
                            .normalize();
                        
                        console.log('Before detach - Rocket world pos:', rocketWorldPos);
                        console.log('Before detach - Body world pos:', bodyWorldPos);
                        console.log('Launch direction (XZ plane):', launchDirection);
                        console.log('Distance from body:', rocketWorldPos.distanceTo(bodyWorldPos));
                        
                        // Remove from current parent
                        rocketPivot.parent.remove(rocketPivot);
                        
                        // Add to scene
                        scene.add(rocketPivot);

                        // Set world position (in XZ plane) and rotation
                        rocketPivot.position.copy(rocketWorldPos);
                        rocketPivot.position.y = 0;
                        // IMPORTANT: clear pivot rotation so child local == world frame while flying
                        rocketPivot.quaternion.identity();

                        // Reset rocket local rotation for flight mode
                        rocketObject.rotation.set(-Math.PI / 2, 0, 0);
                        rocketObject.position.set(0, 0, 0);
                        
                        // Calculate launch velocity in XZ plane to reach moon orbit distance
                        // Using escape velocity-ish and extra boost
                        // Base launch speed scaled by body size and tweakable strength
                        // Smaller bodies -> less speed, larger bodies -> more speed
                        const bodyScale = Math.sqrt(bodyRadius / LAUNCH_BASE_BODY_RADIUS);
                        const launchSpeed = Math.sqrt(G_CONSTANT / bodyRadius * moonOrbitDistance) * 8 * LAUNCH_STRENGTH * bodyScale;
                        const launchVelocity = launchDirection.multiplyScalar(launchSpeed);
                        launchVelocity.y = 0; // Ensure no Y component
                        rocketVelocity.copy(launchVelocity);

                        // Activate launch assist: keep accelerating radially away until clear
                        launchAssistActive = true;
                        launchAssistElapsed = 0;
                        launchAssistGraceLeft = LAUNCH_ASSIST_GRACE_TIME;
                        launchAssistBody = landedOnBody; // body group we were attached to
                        launchAssistBodyRadius = bodyRadius;
                        launchAssistBodyName = (currentBody && currentBody.name) ? currentBody.name : 'Body';
                        // Also remember the exact mesh of the body we launched from
                        launchAssistBodyMesh = currentBody.object;
                        // Scale assist targets by body size and user strength
                        launchAssistTargetRadialSpeed = LAUNCH_ASSIST_TARGET_RADIAL_SPEED * LAUNCH_STRENGTH * bodyScale;
                        launchAssistAccelCurrent = LAUNCH_ASSIST_ACCEL * LAUNCH_STRENGTH * bodyScale;
                        
                        console.log(`Rocket launched to moon orbit distance: ${moonOrbitDistance.toFixed(2)} units with speed ${launchSpeed.toFixed(2)}; Launch assist active.`);
                        console.log('Rocket velocity (XZ plane):', rocketVelocity);
                        infoElement.textContent = `Rocket launched from ${launchAssistBodyName}! Assist engaged. W/S thrust, A/D yaw, Q/E strafe, X brake, O tractor.`;
                    } else {
                        console.log('Rocket is already in flight');
                    }
                }

                if (key === 'O' && rocketSystem.isInRocket) {
                    // Toggle tractor beam
                    tractorBeamActive = !tractorBeamActive;
                    
                    if (tractorBeamActive) {
                        // Find and lock onto the closest body that the trajectory intersects
                        const rocketWorldPos = new THREE.Vector3();
                        rocketObject.getWorldPosition(rocketWorldPos);
                        
                        let targetBody = null;
                        let targetBodyData = null;
                        let minDistance = Infinity;
                        
                        // Get trajectory points if available
                        if (trajectoryLine && trajectoryLine.geometry) {
                            const trajectoryPositions = trajectoryLine.geometry.attributes.position.array;
                            
                            // Check all celestial bodies for intersection with trajectory
                            solarSystemData.forEach(planetData => {
                                if (!planetData.mesh) return;
                                const bodyWorldPos = new THREE.Vector3();
                                planetData.mesh.getWorldPosition(bodyWorldPos);
                                
                                // Check if trajectory passes near this planet
                                let closestTrajectoryDist = Infinity;
                                for (let i = 0; i < trajectoryPositions.length; i += 3) {
                                    const trajPoint = new THREE.Vector3(
                                        trajectoryPositions[i],
                                        trajectoryPositions[i + 1],
                                        trajectoryPositions[i + 2]
                                    );
                                    const dist = trajPoint.distanceTo(bodyWorldPos);
                                    if (dist < closestTrajectoryDist) {
                                        closestTrajectoryDist = dist;
                                    }
                                }
                                
                                const influenceRadius = planetData.effectiveRadius * 3;
                                if (closestTrajectoryDist < influenceRadius) {
                                    const distToRocket = rocketWorldPos.distanceTo(bodyWorldPos);
                                    if (distToRocket < minDistance) {
                                        minDistance = distToRocket;
                                        targetBody = planetData.mesh;
                                        targetBodyData = {
                                            ...planetData,
                                            isMoon: false,
                                            parentOrbitRadius: planetData.orbitRadius,
                                            orbitAngle: planetData.orbitAngle
                                        };
                                    }
                                }
                                
                                // Check moons of this planet
                                if (planetData.moons) {
                                    planetData.moons.forEach(moonData => {
                                        if (!moonData.mesh) return;
                                        const moonWorldPos = new THREE.Vector3();
                                        moonData.mesh.getWorldPosition(moonWorldPos);
                                        
                                        let closestMoonTrajDist = Infinity;
                                        for (let i = 0; i < trajectoryPositions.length; i += 3) {
                                            const trajPoint = new THREE.Vector3(
                                                trajectoryPositions[i],
                                                trajectoryPositions[i + 1],
                                                trajectoryPositions[i + 2]
                                            );
                                            const dist = trajPoint.distanceTo(moonWorldPos);
                                            if (dist < closestMoonTrajDist) {
                                                closestMoonTrajDist = dist;
                                            }
                                        }
                                        
                                        const moonInfluenceRadius = moonData.radius * 2;
                                        if (closestMoonTrajDist < moonInfluenceRadius) {
                                            const distToRocket = rocketWorldPos.distanceTo(moonWorldPos);
                                            if (distToRocket < minDistance) {
                                                minDistance = distToRocket;
                                                targetBody = moonData.mesh;
                                                targetBodyData = {
                                                    ...moonData,
                                                    isMoon: true,
                                                    parentOrbitRadius: planetData.orbitRadius,
                                                    planetRadius: planetData.effectiveRadius,
                                                    planetOrbitAngle: planetData.orbitAngle,
                                                    planetMesh: planetData.mesh
                                                };
                                            }
                                        }
                                    });
                                }
                            });
                        }
                        
                        if (targetBodyData) {
                            tractorBeamTarget = targetBody;
                            tractorBeamTargetData = targetBodyData;
                            tractorBeamLandingMode = false;
                            
                            // Create cyan highlight circle around target
                            const highlightRadius = targetBodyData.radius * 1.2;
                            const highlightGeometry = new THREE.TorusGeometry(highlightRadius, targetBodyData.radius * 0.05, 16, 64);
                            const highlightMaterial = new THREE.MeshBasicMaterial({ 
                                color: 0x00ffff, 
                                transparent: true, 
                                opacity: 0.8 
                            });
                            tractorBeamHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
                            tractorBeamHighlight.rotation.x = Math.PI / 2; // Rotate to horizontal plane
                            targetBody.add(tractorBeamHighlight);
                            
                            console.log('Tractor beam locked onto:', targetBodyData.name);
                        } else {
                            tractorBeamActive = false;
                            console.log('No valid target found in trajectory');
                        }
                    } else {
                        // Deactivate tractor beam
                        if (tractorBeamHighlight && tractorBeamTarget) {
                            tractorBeamTarget.remove(tractorBeamHighlight);
                            tractorBeamHighlight.geometry.dispose();
                            tractorBeamHighlight.material.dispose();
                            tractorBeamHighlight = null;
                        }
                        tractorBeamTarget = null;
                        tractorBeamTargetData = null;
                        tractorBeamLandingMode = false;
                        console.log('Tractor beam deactivated');
                    }
                }
            });
            
            // Setup keyup handler
            inputManager.onKeyUp((key, event, keys) => {
                if (key === 'SPACE') {
                    jetpackActive = false; // Stop jetpack when space is released
                }
            });

            // Setup mouse move handler
            inputManager.onMouseMove((mouseX, mouseY, event) => {
                if (cameraController.mouseLookEnabled) {
                    if (!rocketSystem.isInRocket) {
                        cameraController.handleMouseMove(mouseX, mouseY, MOUSE_SENSITIVITY, MAX_PITCH);
                    }
                }
            });

            // Note: Pointer lock change is handled internally by InputManager

            // Setup mouse wheel handler
            inputManager.onWheel((delta, event) => {
                event.preventDefault();
                if (rocketSystem.isInRocket) {
                    const zoomSensitivity = 0.1;
                    if (delta < 0) { // Scroll down (zoom out)
                        cameraController.rocketCameraZoomFactor = Math.min(cameraController.rocketCameraZoomFactor * (1 + zoomSensitivity), 10.0);
                    } else { // Scroll up (zoom in)
                        cameraController.rocketCameraZoomFactor = Math.max(cameraController.rocketCameraZoomFactor * (1 - zoomSensitivity), 0.01);
                    }
                } else if (cameraController.mode === 'free') {
                    // Delta is ±1, so we need a larger sensitivity for smooth zooming
                    const zoomSensitivity = 0.1; // Changed from 0.001 to 0.1 for noticeable zoom
                    const zoomDelta = delta * zoomSensitivity;
                    cameraController.freeCameraZoomSmooth += zoomDelta;
                    cameraController.freeCameraZoomSmooth = Math.max(0, Math.min(cameraController.freeCameraConfigs.length - 0.001, cameraController.freeCameraZoomSmooth));
                    cameraController.freeCameraZoomLevel = Math.floor(cameraController.freeCameraZoomSmooth);
                    const zoomName = cameraController.freeCameraConfigs[cameraController.freeCameraZoomLevel].name;
                    const bodyName = teleportLocations[currentSystemIndex][currentBodyIndex].name;
                    const zoomPercent = ((cameraController.freeCameraZoomSmooth % 1) * 100).toFixed(0);
                    const modeStr = jetpackEnabled ? "JETPACK" : "NORMAL";
                    infoElement.textContent = `${modeStr} | ${bodyName} | Zoom: ${zoomName} ${zoomPercent}% (WASD/QE, ${jetpackEnabled ? 'SPACE/CTRL jetpack' : 'SPACE jump'}, G toggle, F-Rocket, M/L, V, Z)`;
                }
            });

            // Setup pointer lock change handler
            document.addEventListener('pointerlockchange', () => {
                const isLocked = inputManager.isPointerLocked();
                if (isLocked && cameraController.mode !== 'free') {
                    // Pointer lock acquired and we're in a character view mode
                    cameraController.mouseLookEnabled = true;
                } else if (!isLocked) {
                    // Pointer lock released
                    cameraController.mouseLookEnabled = false;
                }
            });

            // =================== ROCKET PHYSICS UPDATE ===================
            function updateTrajectory(delta) {
                if (!rocketObject) return;

                // Remove existing trajectory line if it exists
                if (trajectoryLine) {
                    scene.remove(trajectoryLine);
                    trajectoryLine.geometry.dispose();
                    trajectoryLine.material.dispose();
                }

                const positions = [];
                const tempPos = new THREE.Vector3();
                rocketObject.getWorldPosition(tempPos);
                const tempVel = rocketVelocity.clone();
                const tempQuat = rocketObject.quaternion.clone();
                const steps = 500;
                const dt = 0.1;

                // Track which planets we've passed through for moon gravity
                const planetsEncountered = new Set();

                for (let i = 0; i < steps; i++) {
                    // Use physics module to calculate gravity
                    const totalGravityForce = calculateTrajectoryGravity(
                        tempPos,
                        solarSystemData,
                        sun,
                        SUN_RADIUS,
                        planetsEncountered
                    );

                    tempVel.add(totalGravityForce.multiplyScalar(dt));

                    // Thrust prediction (uses current orientation snapshot)
                    const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(tempQuat);
                    const currentThrust = (inputManager.isKeyPressed('W') ? (inputManager.isKeyPressed('SHIFT') ? ROCKET_BOOST_THRUST : ROCKET_MAIN_THRUST) : 0);
                    tempVel.add(direction.multiplyScalar(currentThrust * dt));

                    tempPos.add(tempVel.clone().multiplyScalar(dt));

                    // Constrain to orbital plane
                    tempPos.y = 0;

                    // Store position as Vector3 (will be used by BufferGeometry.setFromPoints)
                    positions.push(tempPos.clone());
                }

                // Create a new line with standard BufferGeometry instead of LineGeometry
                trajectoryLine = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(positions),
                    new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 })
                );
                scene.add(trajectoryLine);
            }

            function updateRocket(delta) {
                // --- Gravity ---
                // Cache previous rocket world position for anti-tunneling checks
                const prevPosTmp = new THREE.Vector3();
                rocketObject.getWorldPosition(prevPosTmp);
                if (!prevRocketWorldPos) prevRocketWorldPos = prevPosTmp.clone();
                const totalGravityForce = new THREE.Vector3();
                const rocketWorldPos = new THREE.Vector3();
                rocketObject.getWorldPosition(rocketWorldPos);

                // Find closest planet to rocket
                let closestPlanet = null;
                let closestPlanetDist = Infinity;
                solarSystemData.forEach(planetData => {
                    if (!planetData.mesh) return;
                    const planetWorldPos = new THREE.Vector3();
                    planetData.mesh.getWorldPosition(planetWorldPos);
                    const dist = rocketWorldPos.distanceTo(planetWorldPos);
                    if (dist < closestPlanetDist) {
                        closestPlanetDist = dist;
                        closestPlanet = planetData;
                    }
                });

                // Collect all celestial bodies that should affect gravity
                const celestialBodies = [...solarSystemData, { mesh: sun, radius: SUN_RADIUS }];
                
                // Add moons from closest planet
                if (closestPlanet && closestPlanet.moons) {
                    closestPlanet.moons.forEach(moonData => {
                        celestialBodies.push(moonData);
                    });
                }

                // Apply gravity from all collected bodies
                celestialBodies.forEach(body => {
                    // For exploded bodies, use the black hole bubble; otherwise use the mesh
                    let gravitySource = null;
                    let bodyRadius = body.radius;
                    
                    if (body.hasExploded && body.blackHoleBubble) {
                        // Use bubble for exploded bodies
                        gravitySource = body.blackHoleBubble;
                        bodyRadius = body.blackHoleBubble.userData.originalRadius || body.radius;
                    } else if (body.mesh) {
                        // Use mesh for intact bodies
                        gravitySource = body.mesh;
                    }
                    
                    if (!gravitySource) return;
                    
                    const bodyWorldPos = new THREE.Vector3();
                    gravitySource.getWorldPosition(bodyWorldPos);
                    const vectorToBody = bodyWorldPos.sub(rocketWorldPos);
                    const distanceSq = vectorToBody.lengthSq();
                    if (distanceSq > 1) {
                        const gravityStrength = (G_CONSTANT * bodyRadius) / distanceSq;
                        const gravityForce = vectorToBody.normalize().multiplyScalar(gravityStrength);
                        totalGravityForce.add(gravityForce);
                    }
                });
                rocketVelocity.add(totalGravityForce.multiplyScalar(delta));

                // --- Launch Assist: add outward acceleration until we're clearly moving away ---
                if (launchAssistActive && launchAssistBody) {
                    const bodyWorldPos = new THREE.Vector3();
                    launchAssistBody.getWorldPosition(bodyWorldPos);
                    // Constrain to orbital plane (XZ)
                    const rocketXZ = rocketWorldPos.clone(); rocketXZ.y = 0;
                    const bodyXZ = bodyWorldPos.clone(); bodyXZ.y = 0;
                    const radialOut = rocketXZ.clone().sub(bodyXZ);
                    const distanceFromCenter = radialOut.length();
                    const distanceToSurface = distanceFromCenter - launchAssistBodyRadius;
                    if (radialOut.lengthSq() > 1e-6) {
                        radialOut.normalize();
                    } else {
                        radialOut.set(1, 0, 0);
                    }

                    // Current radial speed (projection of velocity onto radialOut)
                    const radialSpeed = rocketVelocity.clone().setY(0).dot(radialOut);

                    // If not yet meeting target radial speed, push harder
                    if (radialSpeed < launchAssistTargetRadialSpeed) {
                        rocketVelocity.add(radialOut.multiplyScalar(launchAssistAccelCurrent * delta));
                    }

                    // Keep rocket strictly in orbital plane while assisting
                    rocketPivot.position.y = 0;
                    rocketVelocity.y = 0;

                    // Update assist timers
                    launchAssistElapsed += delta;
                    if (launchAssistGraceLeft > 0) launchAssistGraceLeft -= delta;

                    // Stop assist when sufficiently clear of the surface and moving out fast enough
                    if (distanceToSurface > LAUNCH_ASSIST_CLEARANCE && radialSpeed > launchAssistTargetRadialSpeed * 0.8) {
                        launchAssistActive = false;
                        launchAssistBody = null;
                        console.log('Launch assist completed. Clear of surface.');
                    }
                }

                // --- Controls ---
                // A/D for yaw (turning left/right) around WORLD Y axis (no pitch/roll)
                if (inputManager.isKeyPressed('A')) rocketYaw += ROCKET_TURN_SPEED * delta; // turn left
                if (inputManager.isKeyPressed('D')) rocketYaw -= ROCKET_TURN_SPEED * delta; // turn right
                // keep yaw normalized to avoid float drift
                if (rocketYaw > Math.PI) rocketYaw -= Math.PI * 2;
                if (rocketYaw < -Math.PI) rocketYaw += Math.PI * 2;

                // Q/E for strafing left/right on X-Z plane (RCS thrust along rocket's local X-axis)
                if (inputManager.isKeyPressed('Q')) {
                    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(rocketObject.quaternion);
                    rocketVelocity.add(left.multiplyScalar(ROCKET_RCS_THRUST * delta));
                }
                if (inputManager.isKeyPressed('E')) {
                    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rocketObject.quaternion);
                    rocketVelocity.add(right.multiplyScalar(ROCKET_RCS_THRUST * delta));
                }

                // W for forward thrust (along rocket's local Y-axis, which is on X-Z plane)
                if (inputManager.isKeyPressed('W')) {
                    // Check if rocket is landed (attached to a body) and needs to take off
                    if (rocketPivot.parent !== scene) {
                        // Takeoff sequence: detach from planet/moon and enter flight mode
                        const worldPos = new THREE.Vector3();
                        const worldQuat = new THREE.Quaternion();
                        rocketPivot.getWorldPosition(worldPos);
                        rocketPivot.getWorldQuaternion(worldQuat);
                        
                        // Store the body we're taking off from for launch assist
                        const takeoffBody = rocketPivot.parent; // this is the rotating body mesh when landed
                        
                        // Remove from current parent
                        rocketPivot.parent.remove(rocketPivot);
                        
                        // Add to scene
                        scene.add(rocketPivot);

                        // Set world position (in XZ plane) and rotation
                        rocketPivot.position.copy(rocketWorldPos);
                        rocketPivot.position.y = 0;
                        // IMPORTANT: clear pivot rotation so child local == world frame while flying
                        rocketPivot.quaternion.identity();

                        // Reset rocket local rotation for flight mode
                        rocketObject.rotation.set(-Math.PI / 2, 0, 0);
                        rocketObject.position.set(0, 0, 0);
                        
                        // Enable launch assist grace period to prevent immediate re-collision
                        launchAssistGraceLeft = LAUNCH_ASSIST_GRACE_TIME;
                        launchAssistBody = takeoffBody;
                        launchAssistBodyMesh = takeoffBody; // ensure collision grace skips this body immediately after takeoff
                        
                        console.log('Rocket taking off from landed position with grace period');
                        infoElement.textContent = `Flying Rocket! (W thrust, Shift boost, A/D turn (yaw), Q/E strafe, X brake, Shift+X sync orbit, O toggle tractor beam, Z zoom, F switch to character)`;
                    }
                    
                    const thrust = inputManager.isKeyPressed('SHIFT') ? ROCKET_BOOST_THRUST : ROCKET_MAIN_THRUST;
                    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocketObject.quaternion);
                    rocketVelocity.add(forward.multiplyScalar(thrust * delta));

                    // Update plume visualization
                    if (rocketPlume) {
                        rocketPlume.visible = true;
                        // Scale plume length based on thrust (boost = longer plume)
                        const plumeLength = inputManager.isKeyPressed('SHIFT') ? 15 : 5;
                        rocketPlume.scale.y = plumeLength;
                        // Adjust color intensity based on thrust
                        const color = inputManager.isKeyPressed('SHIFT') ? 0xffaa00 : 0xff6600;
                        rocketPlume.material.color.setHex(color);
                        rocketPlume.material.opacity = inputManager.isKeyPressed('SHIFT') ? 0.9 : 0.8;
                    }
                } else {
                    // Hide plume when not thrusting
                    if (rocketPlume) {
                        rocketPlume.visible = false;
                    }
                }

                // X for brake (relative to sun/orbital plane)
                // Shift+X for orbital sync with closest body
                if (inputManager.isKeyPressed('X')) {
                    if (inputManager.isKeyPressed('SHIFT')) {
                        // Find closest celestial body (planet or moon)
                        let closestBody = null;
                        let closestBodyDist = Infinity;
                        let closestBodyData = null;

                        // Check all planets
                        solarSystemData.forEach(planetData => {
                            if (!planetData.mesh) return;
                            const bodyWorldPos = new THREE.Vector3();
                            planetData.mesh.getWorldPosition(bodyWorldPos);
                            const dist = rocketWorldPos.distanceTo(bodyWorldPos);
                            if (dist < closestBodyDist) {
                                closestBodyDist = dist;
                                closestBody = planetData.mesh;
                                closestBodyData = { ...planetData, isMoon: false, parentOrbitRadius: planetData.orbitRadius };
                            }

                            // Check moons of this planet
                            if (planetData.moons) {
                                planetData.moons.forEach(moonData => {
                                    if (!moonData.mesh) return;
                                    const moonWorldPos = new THREE.Vector3();
                                    moonData.mesh.getWorldPosition(moonWorldPos);
                                    const moonDist = rocketWorldPos.distanceTo(moonWorldPos);
                                    if (moonDist < closestBodyDist) {
                                        closestBodyDist = moonDist;
                                        closestBody = moonData.mesh;
                                        closestBodyData = { 
                                            ...moonData, 
                                            isMoon: true, 
                                            parentOrbitRadius: planetData.orbitRadius,
                                            planetRadius: planetData.radius 
                                        };
                                    }
                                });
                            }
                        });

                        // Sync velocity with closest body's orbital motion
                        if (closestBody && closestBodyData) {
                            const bodyWorldPos = new THREE.Vector3();
                            closestBody.getWorldPosition(bodyWorldPos);

                            if (closestBodyData.isMoon) {
                                // Moon: orbits around its planet
                                // Get planet position
                                const planetPos = new THREE.Vector3(
                                    closestBodyData.parentOrbitRadius * Math.cos(closestBodyData.orbitAngle || 0),
                                    0,
                                    closestBodyData.parentOrbitRadius * Math.sin(closestBodyData.orbitAngle || 0)
                                );
                                
                                // Calculate moon's orbital velocity around planet
                                const moonToPlanet = planetPos.clone().sub(bodyWorldPos);
                                const moonOrbitRadius = moonToPlanet.length();
                                
                                // Tangential velocity perpendicular to radius vector
                                const moonOrbitalVelocity = new THREE.Vector3(-moonToPlanet.z, 0, moonToPlanet.x).normalize();
                                const moonSpeed = Math.sqrt((G_CONSTANT * closestBodyData.planetRadius) / moonOrbitRadius);
                                moonOrbitalVelocity.multiplyScalar(moonSpeed);

                                // Add planet's orbital velocity around sun
                                const planetToSun = new THREE.Vector3(0, 0, 0).sub(planetPos);
                                const planetOrbitalVelocity = new THREE.Vector3(-planetToSun.z, 0, planetToSun.x).normalize();
                                const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / closestBodyData.parentOrbitRadius);
                                planetOrbitalVelocity.multiplyScalar(planetSpeed);

                                // Total velocity is moon's velocity around planet + planet's velocity around sun
                                rocketVelocity.copy(moonOrbitalVelocity.add(planetOrbitalVelocity));
                            } else {
                                // Planet: orbits around sun
                                const vectorToSun = new THREE.Vector3(0, 0, 0).sub(bodyWorldPos);
                                const orbitRadius = bodyWorldPos.length();
                                
                                // Tangential velocity perpendicular to radius vector
                                const orbitalVelocity = new THREE.Vector3(-vectorToSun.z, 0, vectorToSun.x).normalize();
                                const orbitalSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / orbitRadius);
                                
                                rocketVelocity.copy(orbitalVelocity.multiplyScalar(orbitalSpeed));
                            }
                        }
                    } else {
                        // Regular brake
                        rocketVelocity.multiplyScalar(ROCKET_BRAKE_FORCE);
                    }
                }

                // --- Tractor Beam Lasso (O key toggle) ---
                if (tractorBeamActive && tractorBeamTarget && tractorBeamTargetData) {
                    // Get current positions
                    const targetBodyWorldPos = new THREE.Vector3();
                    tractorBeamTarget.getWorldPosition(targetBodyWorldPos);
                    
                    const currentDistance = rocketWorldPos.distanceTo(targetBodyWorldPos);
                    const currentDistanceToSurface = currentDistance - tractorBeamTargetData.radius;
                    
                    // Calculate body's velocity through space
                    let bodyVelocity = new THREE.Vector3();
                    
                    if (tractorBeamTargetData.isMoon) {
                        // Moon orbits planet, planet orbits sun
                        const planetPos = new THREE.Vector3(
                            tractorBeamTargetData.parentOrbitRadius * Math.cos(tractorBeamTargetData.planetOrbitAngle),
                            0,
                            tractorBeamTargetData.parentOrbitRadius * Math.sin(tractorBeamTargetData.planetOrbitAngle)
                        );
                        
                        // Planet's velocity around sun
                        const planetOrbitalVel = new THREE.Vector3(-planetPos.z, 0, planetPos.x).normalize();
                        const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / tractorBeamTargetData.parentOrbitRadius);
                        planetOrbitalVel.multiplyScalar(planetSpeed);
                        
                        // Moon's velocity around planet
                        const moonToPlanet = planetPos.clone().sub(targetBodyWorldPos);
                        const moonOrbitRadius = moonToPlanet.length();
                        const moonOrbitalVel = new THREE.Vector3(-moonToPlanet.z, 0, moonToPlanet.x).normalize();
                        const moonSpeed = Math.sqrt((G_CONSTANT * tractorBeamTargetData.planetRadius) / moonOrbitRadius);
                        moonOrbitalVel.multiplyScalar(moonSpeed);
                        
                        bodyVelocity.copy(planetOrbitalVel.add(moonOrbitalVel));
                    } else {
                        // Planet orbits sun
                        const planetOrbitalVel = new THREE.Vector3(-targetBodyWorldPos.z, 0, targetBodyWorldPos.x).normalize();
                        const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / tractorBeamTargetData.parentOrbitRadius);
                        bodyVelocity.copy(planetOrbitalVel.multiplyScalar(planetSpeed));
                    }
                    
                    // Check if close enough to switch to landing mode
                    const landingDistance = ROCKET_LENGTH * 1.5; // One rocket-length away
                    if (currentDistanceToSurface <= landingDistance && !tractorBeamLandingMode) {
                        tractorBeamLandingMode = true;
                        console.log('Entering landing mode');
                    }
                    
                    if (tractorBeamLandingMode) {
                        // Landing mode - gentle descent to surface
                        const desiredLandingSpeed = Math.max(currentDistanceToSurface * 0.3, 0.5);
                        const directionToSurface = targetBodyWorldPos.clone().sub(rocketWorldPos).normalize();
                        
                        // Desired velocity: slow descent + body's orbital velocity
                        const desiredVelocity = directionToSurface.clone().multiplyScalar(desiredLandingSpeed).add(bodyVelocity);
                        
                        // Apply strong correction
                        const velocityError = desiredVelocity.clone().sub(rocketVelocity);
                        rocketVelocity.add(velocityError.multiplyScalar(delta * 5));
                        
                        // Point rocket down toward surface
                        const thrustDirection = directionToSurface.clone();
                        thrustDirection.y = 0;
                        thrustDirection.normalize();
                        
                        const currentForward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocketObject.quaternion);
                        currentForward.y = 0;
                        currentForward.normalize();
                        
                        let angleToTarget = Math.atan2(
                            thrustDirection.x * currentForward.z - thrustDirection.z * currentForward.x,
                            thrustDirection.x * currentForward.x + thrustDirection.z * currentForward.z
                        );
                        
                        const maxTurnRate = ROCKET_TURN_SPEED * delta * 3;
                        angleToTarget = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleToTarget));
                        rocketYaw += angleToTarget;
                        
                        // Visual feedback - green pulsing plume
                        if (rocketPlume) {
                            rocketPlume.visible = true;
                            rocketPlume.scale.y = 2 + Math.sin(Date.now() * 0.005) * 0.5;
                            rocketPlume.material.color.setHex(0x00ff00); // Green for landing
                            rocketPlume.material.opacity = 0.5;
                        }
                        
                        // Check if landed
                        if (currentDistanceToSurface < tractorBeamTargetData.radius * 0.05 && rocketVelocity.length() < 15) {
                            // Auto-land: switch to character on this body
                            tractorBeamActive = false;
                            if (tractorBeamHighlight && tractorBeamTarget) {
                                tractorBeamTarget.remove(tractorBeamHighlight);
                                tractorBeamHighlight.geometry.dispose();
                                tractorBeamHighlight.material.dispose();
                                tractorBeamHighlight = null;
                            }
                            
                            // Find the body data for landing
                            let landingBodyData = null;
                            solarSystemData.forEach(planetData => {
                                if (planetData.mesh === tractorBeamTarget) {
                                    landingBodyData = planetData;
                                } else if (planetData.moons) {
                                    planetData.moons.forEach(moonData => {
                                        if (moonData.mesh === tractorBeamTarget) {
                                            landingBodyData = moonData;
                                        }
                                    });
                                }
                            });
                            
                            if (landingBodyData) {
                                // Land rocket at exact touch point on equator, upright
                                // Re-parent rocket pivot directly to the rotating body mesh so it spins with the surface
                                if (rocketPivot.parent !== tractorBeamTarget) {
                                    if (rocketPivot.parent) rocketPivot.parent.remove(rocketPivot);
                                    tractorBeamTarget.add(rocketPivot);
                                }

                                // Reset pivot transform at body center (local to mesh)
                                rocketPivot.position.set(0, 0, 0);
                                rocketPivot.rotation.set(0, 0, 0);
                                rocketPivot.quaternion.identity();

                                // Compute surface point in the body's LOCAL space (so rocket follows mesh spin)
                                const bodyWorldPos = new THREE.Vector3();
                                tractorBeamTarget.getWorldPosition(bodyWorldPos);
                                const surfaceWorldPoint = bodyWorldPos.clone().add(
                                    rocketWorldPos.clone().sub(bodyWorldPos).normalize().multiplyScalar(landingBodyData.radius)
                                );
                                const surfaceLocalPoint = surfaceWorldPoint.clone();
                                tractorBeamTarget.worldToLocal(surfaceLocalPoint);

                                // Place rocket on surface at exact impact latitude/longitude
                                const localUp = surfaceLocalPoint.clone().normalize();
                                rocketObject.position.copy(localUp.clone().multiplyScalar(landingBodyData.radius));

                                // Align rocket +Y to local radial vector so it stands upright on surface
                                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localUp);
                                rocketObject.quaternion.copy(q);
                                                                rocketYaw = 0; // Reset yaw

                                // Stop motion and reset state
                                
                                rocketVelocity.set(0, 0, 0);
                                rocketYaw = 0;
                                if (rocketPlume) rocketPlume.visible = false;
                                rocketLaunchPlanet = tractorBeamTarget; // parent mesh

                                // Stay in rocket mode on landing; keep rocket visible and controllable
                                isInRocket = true;
                                rocketObject.visible = true;
                                infoElement.textContent = `Landed in rocket on ${landingBodyData.name}. Press F to switch to character. (W thrust, A/D yaw, Q/E strafe, X brake)`;

                                console.log('Auto-landed on:', landingBodyData.name);
                            }
                            
                            tractorBeamTarget = null;
                            tractorBeamTargetData = null;
                            tractorBeamLandingMode = false;
                        }
                    } else {
                        // Approach mode - pull toward target and sync rotation
                        const directionToBody = targetBodyWorldPos.clone().sub(rocketWorldPos).normalize();
                        
                        // Halve the distance every second
                        // If current distance = D, we want to reach D/2 in 1 second
                        // So speed needed = D/2 per second
                        const approachSpeed = currentDistanceToSurface / 2.0; // Halve distance every second
                        const desiredVelocity = directionToBody.clone().multiplyScalar(approachSpeed).add(bodyVelocity);
                        
                        // Calculate velocity error
                        const velocityError = desiredVelocity.clone().sub(rocketVelocity);
                        
                        // Point rocket toward target
                        const thrustDirection = directionToBody.clone();
                        thrustDirection.y = 0;
                        thrustDirection.normalize();
                        
                        const currentForward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocketObject.quaternion);
                        currentForward.y = 0;
                        currentForward.normalize();
                        
                        let angleToTarget = Math.atan2(
                            thrustDirection.x * currentForward.z - thrustDirection.z * currentForward.x,
                            thrustDirection.x * currentForward.x + thrustDirection.z * currentForward.z
                        );
                        
                        const maxTurnRate = ROCKET_TURN_SPEED * delta * 4;
                        angleToTarget = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleToTarget));
                        rocketYaw += angleToTarget;
                        
                        // Apply constant high thrust toward target
                        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocketObject.quaternion);
                        const alignmentFactor = forward.dot(thrustDirection);
                        const thrustMagnitude = TRACTOR_BEAM_PULL_FORCE * Math.max(alignmentFactor, 0.4);
                        
                        rocketVelocity.add(forward.multiplyScalar(thrustMagnitude * delta));
                        
                        // Visual feedback - cyan pulsing plume
                        if (rocketPlume) {
                            rocketPlume.visible = true;
                            rocketPlume.scale.y = 4 + Math.sin(Date.now() * 0.01) * 1;
                            rocketPlume.material.color.setHex(0x00ffff); // Cyan for tractor beam
                            rocketPlume.material.opacity = 0.7;
                        }
                    }
                    
                    // Update highlight to pulse
                    if (tractorBeamHighlight) {
                        const pulseScale = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
                        tractorBeamHighlight.scale.set(pulseScale, pulseScale, pulseScale);
                    }
                }

                // --- Update Position ---
                // Update pivot position when flying (parent is scene)
                if (rocketPivot.parent === scene) {
                    rocketPivot.position.add(rocketVelocity.clone().multiplyScalar(delta));
                }

                // --- Collision Detection with Planets/Moons ---
                // Only check collisions if rocket is flying (not already landed)
                if (rocketPivot.parent === scene) {
                    // Update rocketWorldPos to current position
                    rocketWorldPos.setFromMatrixPosition(rocketObject.matrixWorld);
                    
                    // Check collision with all planets and their moons (with anti-tunneling)
                    let collisionDetected = false;
                    let collisionBody = null;
                    let collisionBodyData = null;
                    const rocketWorldPosAfter = new THREE.Vector3();
                    rocketObject.getWorldPosition(rocketWorldPosAfter);
                    const p0 = prevRocketWorldPos.clone();
                    const p1 = rocketWorldPosAfter.clone();
                    const COLLISION_MARGIN = 2.0;
                
                solarSystemData.forEach(planetData => {
                    // Skip exploded planets
                    if (!collisionDetected && planetData.mesh && !planetData.hasExploded) {
                        const planetWorldPos = new THREE.Vector3();
                        planetData.mesh.getWorldPosition(planetWorldPos);
                        const distanceToCenter = rocketWorldPosAfter.distanceTo(planetWorldPos);
                        const r = planetData.radius + COLLISION_MARGIN;
                        if (distanceToCenter <= r || segmentIntersectsSphere(p0, p1, planetWorldPos, r)) {
                            collisionDetected = true;
                            collisionBody = planetData.mesh;
                            collisionBodyData = planetData;
                        }
                    }
                    
                    // Check moons (skip exploded moons)
                    if (!collisionDetected && planetData.moons) {
                        planetData.moons.forEach(moonData => {
                            if (!collisionDetected && moonData.mesh && !moonData.hasExploded) {
                                const moonWorldPos = new THREE.Vector3();
                                moonData.mesh.getWorldPosition(moonWorldPos);
                                const distanceToCenter = rocketWorldPosAfter.distanceTo(moonWorldPos);
                                const r = moonData.radius + COLLISION_MARGIN;
                                if (distanceToCenter <= r || segmentIntersectsSphere(p0, p1, moonWorldPos, r)) {
                                    collisionDetected = true;
                                    collisionBody = moonData.mesh;
                                    collisionBodyData = moonData;
                                }
                            }
                        });
                    }
                });
                
                // Handle forced landing if collision detected
                if (collisionDetected && collisionBodyData) {
                    // Skip collision if the body has been exploded
                    if (collisionBodyData.hasExploded) {
                        console.log('Skipping collision with exploded body:', collisionBodyData.name);
                        collisionDetected = false;
                    }
                    
                    // If launch assist grace time is active, conditionally skip collisions ONLY while moving outward and still near the launch body
                    if (launchAssistGraceLeft > 0 && launchAssistBodyMesh && collisionBody === launchAssistBodyMesh) {
                        const bodyWorldPos = new THREE.Vector3();
                        collisionBody.getWorldPosition(bodyWorldPos);

                        const radialVec = rocketWorldPosAfter.clone().sub(bodyWorldPos);
                        const distanceFromCenter = radialVec.length();
                        const distanceToSurface = distanceFromCenter - collisionBodyData.radius;
                        if (radialVec.lengthSq() > 1e-8) radialVec.normalize();
                        const radialSpeed = rocketVelocity.dot(radialVec);

                        // Only ignore collision if still very close to surface and moving outward
                        const nearSurface = distanceToSurface < LAUNCH_ASSIST_CLEARANCE;
                        const movingOutward = radialSpeed > 0;
                        if (nearSurface && movingOutward) {
                            collisionDetected = false; // still in takeoff; allow clearing the surface
                        }
                    }
                }

                if (collisionDetected && collisionBodyData) {
                    console.log('Forced landing on:', collisionBodyData.name);
                    
                    // Get body's world position
                    const bodyWorldPos = new THREE.Vector3();
                    collisionBody.getWorldPosition(bodyWorldPos);
                    
                    // Calculate surface position and direction (radially outward from center)
                    const directionFromCenter = rocketWorldPos.clone().sub(bodyWorldPos).normalize();
                    const surfacePosition = directionFromCenter.clone().multiplyScalar(collisionBodyData.radius);
                    
                    // Remove pivot from scene and re-parent directly to the rotating body mesh
                    scene.remove(rocketPivot);

                    collisionBody.add(rocketPivot);

                    // Reset pivot position and rotation to center of body (mesh local space)
                    rocketPivot.position.set(0, 0, 0);
                    rocketPivot.rotation.set(0, 0, 0);
                    rocketPivot.quaternion.identity();

                    // Compute surface point in body LOCAL space so the rocket follows mesh spin
                    const surfaceWorldPoint = bodyWorldPos.clone().add(
                        directionFromCenter.clone().normalize().multiplyScalar(collisionBodyData.radius)
                    );
                    const surfaceLocalPoint = surfaceWorldPoint.clone();
                    collisionBody.worldToLocal(surfaceLocalPoint);

                    // Place rocket on surface at exact impact latitude/longitude
                    const localUp = surfaceLocalPoint.clone().normalize();
                    rocketObject.position.copy(localUp.clone().multiplyScalar(collisionBodyData.radius));

                    // Align rocket's +Y to local radial-out vector so it stands upright on the surface
                    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localUp);
                    rocketObject.quaternion.copy(q);
                    rocketYaw = 0; // Reset yaw
                    
                    // Stop rocket velocity
                    rocketVelocity.set(0, 0, 0);

                    // Cancel launch assist on landing
                    launchAssistActive = false;
                    launchAssistBody = null;
                    launchAssistGraceLeft = 0;
                    launchAssistBodyMesh = null;
                    
                    // Hide plume
                    if (rocketPlume) {
                        rocketPlume.visible = false;
                    }
                    
                    // Exit tractor beam mode if active
                    if (tractorBeamActive) {
                        tractorBeamActive = false;
                        tractorBeamLandingMode = false;
                        if (tractorBeamHighlight && tractorBeamTarget) {
                            tractorBeamTarget.remove(tractorBeamHighlight);
                            tractorBeamHighlight.geometry.dispose();
                            tractorBeamHighlight.material.dispose();
                            tractorBeamHighlight = null;
                        }
                        tractorBeamTarget = null;
                        tractorBeamTargetData = null;
                    }
                    
                    // Update launch planet reference to the parent mesh
                    rocketLaunchPlanet = collisionBody;
                    // Sync current location to landed body so character mode selects the right one
                    setCurrentLocationByMesh(collisionBody);
                    prevRocketWorldPos = null;
                    
                    console.log('Rocket positioned at landing site on surface');
                }
                
                    // Store position for next frame's anti-tunneling (only if flying)
                    if (prevRocketWorldPos) {
                        prevRocketWorldPos.copy(rocketWorldPosAfter);
                    } else {
                        prevRocketWorldPos = rocketWorldPosAfter.clone();
                    }
                } // End of collision detection block (only runs when flying)

                // --- Constrain rocket to orbital plane (Y = 0) ONLY if flying ---
                // Skip constraints if pivot is a child of a body (landed state)
                if (rocketPivot.parent === scene) {
                    rocketPivot.position.y = 0;
                    rocketVelocity.y = 0; // Remove any vertical velocity
                }

                // --- Constrain rocket rotation to yaw-only ---
                // Only apply yaw rotation if flying
                if (rocketPivot.parent === scene) {
                    // Base: tipped onto X-Z plane so local Z aligns to world +Y
                    rocketObject.rotation.set(-Math.PI / 2, 0, 0);
                    // Apply yaw around world Y explicitly
                    rocketObject.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rocketYaw);
                }
            }

            // =================== SYSTEM INITIALIZATION ===================
            // Initialize UI Manager
            const uiManager = new UIManager(infoElement);

            // Initialize Visual Effects Manager  
            const vfxManager = new VisualEffectsManager(scene);

            // Initialize Sun Animation Manager
            const sunAnimManager = new SunAnimationManager(scene, sun, corona, sunLight, camera);

            // Initialize LOD Manager
            const lodManager = new LODManager(scene, sun);

            // Pregenerate all high LOD voxel terrains to prevent lag spikes during gameplay
            infoElement.textContent = 'Generating voxel terrains...';
            
            lodManager.pregenerateAllHighLOD(solarSystemData, (current, total) => {
                infoElement.textContent = `Generating voxel terrains... ${current}/${total}`;
            });

            // Initialize Rocket System (it will create the rocket itself)
            const rocketSystem = new RocketSystem(
                scene,
                solarSystemData,
                sun,
                infoElement
            );

            // Create the rocket at the first planet's position
            const firstPlanetData = solarSystemData[0];
            const planetWorldPos = new THREE.Vector3(
                firstPlanetData.orbitRadius * Math.cos(firstPlanetData.orbitAngle),
                0,
                firstPlanetData.orbitRadius * Math.sin(firstPlanetData.orbitAngle)
            );
            const radial = planetWorldPos.clone().normalize();
            const spawnOffset = firstPlanetData.effectiveRadius + 5;
            const rocketSpawnPos = planetWorldPos.clone().add(radial.multiplyScalar(spawnOffset));
            
            rocketSystem.createRocket(rocketSpawnPos, firstPlanetData.planetGroup);

            // Get references for backward compatibility
            const rocketObject = rocketSystem.rocketObject;
            const rocketPivot = rocketSystem.rocketPivot;
            const rocketPlume = rocketSystem.rocketPlume;
            // Note: Always use rocketSystem.isInRocket directly, not a local copy
            let rocketYaw = rocketSystem.rocketYaw;

            // Initialize Animation Loop Manager
            const animLoopManager = new AnimationLoopManager();

            // =================== INITIALIZE LOD SYSTEM ===================
            // Set initial LOD for all bodies now that lodManager is created
            const initialCharacterWorldPos = new THREE.Vector3();
            pivot.getWorldPosition(initialCharacterWorldPos);
            
            const initialCameraWorldPos = new THREE.Vector3();
            camera.getWorldPosition(initialCameraWorldPos);
            
            const initialLODContext = {
                characterPosition: initialCharacterWorldPos,
                rocketPosition: null,
                cameraPosition: initialCameraWorldPos,
                characterSystemIndex: 0, // Start on first planet
                rocketClosestSystemIndex: -1,
                trajectoryIntersections: new Set(),
                isCharacterMode: true,
                sunPosition: new THREE.Vector3(0, 0, 0)
            };
            
            // Set initial LOD for all bodies
            lodManager.updateAllLODs(solarSystemData, initialLODContext);
            console.log('LOD system initialized');

            // =================== ANIMATION LOOP ===================
            const rotationSpeed = Math.PI;

            // =================== REGISTER UPDATE CALLBACKS ===================
            
            // Priority 0: Sun collapse animation (highest priority)
            animLoopManager.onUpdate((delta) => {
                if (sunCollapsing) {
                    sunCollapseTimer += delta;
                    const timer = sunCollapseTimer;
                    const flashDuration = 0.3;
                    const expandDuration = 1.5;
                    const shrinkDuration = 2.0;
                    const totalDuration = flashDuration + expandDuration + shrinkDuration;

                    // 1. Corona Flash
                    if (timer <= flashDuration) {
                        const progress = timer / flashDuration;
                        // Corona gets extremely bright
                        corona.material.opacity = THREE.MathUtils.lerp(0.8, 20.0, progress);
                        const scale = THREE.MathUtils.lerp(SUN_RADIUS * 4, SUN_RADIUS * 12, progress);
                        corona.scale.set(scale, scale, 1);
                        sunLight.intensity = THREE.MathUtils.lerp(1000000, 10000000, progress);
                    }
                    // 2. Corona Expansion
                    else if (timer <= flashDuration + expandDuration) {
                        const progress = (timer - flashDuration) / expandDuration;
                        // Rapidly expand to fill screen, and fade out
                        const scale = THREE.MathUtils.lerp(SUN_RADIUS * 12, SUN_RADIUS * 150, progress);
                        corona.scale.set(scale, scale, 1);
                        corona.material.opacity = THREE.MathUtils.lerp(20.0, 0.0, progress);
                        sunLight.intensity = THREE.MathUtils.lerp(10000000, 0, progress);
                    }
                    // 3. Sun Shrink
                    else if (timer <= totalDuration) {
                        if (corona.parent) sun.remove(corona); // Remove corona, it's gone
                        const progress = (timer - (flashDuration + expandDuration)) / shrinkDuration;
                        // Fade sun color to black
                        const colorValue = 1.0 - progress;
                        sun.material.color.setRGB(colorValue, colorValue * 0.5, colorValue * 0.3);
                        
                        const scale = 1.0 - progress;
                        sun.scale.set(scale, scale, scale);
                    }
                    // 4. Animation Finished
                    else {
                        sunCollapsing = false;
                        sun.scale.set(0.01, 0.01, 0.01);
                        sun.material.color.setRGB(0, 0, 0);
                        
                        // Remove corona and sun light
                        if (corona.parent) sun.remove(corona);
                        if (sunLight.parent) {
                            scene.remove(sunLight);
                        }
                        
                        sunAnimManager.createBlackHole();
                        blackHoleActive = true;
                        
                        console.log('Black hole created at system center!');
                    }
                }
            }, 0);

            // Priority 1: Rocket updates
            animLoopManager.onUpdate((delta) => {
                if (rocketSystem.isInRocket) {
                    // Update rocket physics and trajectory using RocketSystem
                    rocketSystem.updateRocket(delta, inputManager.keys);
                    rocketSystem.updateTrajectory(delta, inputManager.keys);
                    
                    // Update info display with tractor beam status
                    if (rocketSystem.tractorBeamActive && rocketSystem.tractorBeamTargetData) {
                        const rocketWorldPos = rocketSystem.getRocketWorldPosition();
                        const targetBodyWorldPos = new THREE.Vector3();
                        rocketSystem.tractorBeamTarget.getWorldPosition(targetBodyWorldPos);
                        
                        const currentDistance = rocketWorldPos.distanceTo(targetBodyWorldPos);
                        const surfaceDistance = currentDistance - rocketSystem.tractorBeamTargetData.radius;
                        const speed = rocketSystem.rocketVelocity.length();
                        const mode = rocketSystem.tractorBeamLandingMode ? 'LANDING' : 'APPROACH';
                        
                        infoElement.textContent = `TRACTOR BEAM ${mode} - Target: ${rocketSystem.tractorBeamTargetData.name} | Surface Distance: ${surfaceDistance.toFixed(1)}m | Speed: ${speed.toFixed(1)}m/s | Press O to cancel`;
                    } else if (rocketSystem.launchAssistActive && rocketSystem.rocketObject && rocketSystem.launchAssistBody) {
                        const rocketWorldPos = rocketSystem.getRocketWorldPosition();
                        const bodyWorldPos = new THREE.Vector3();
                        rocketSystem.launchAssistBody.getWorldPosition(bodyWorldPos);
                        const rocketXZ = rocketWorldPos.clone(); rocketXZ.y = 0;
                        const bodyXZ = bodyWorldPos.clone(); bodyXZ.y = 0;
                        const radialOut = rocketXZ.clone().sub(bodyXZ);
                        const distanceFromCenter = radialOut.length();
                        const distanceToSurface = distanceFromCenter - rocketSystem.launchAssistBodyRadius;
                        if (radialOut.lengthSq() > 1e-6) {
                            radialOut.normalize();
                        } else {
                            radialOut.set(1, 0, 0);
                        }
                        const radialSpeed = rocketSystem.rocketVelocity.clone().setY(0).dot(radialOut);

                        infoElement.textContent = `LAUNCH ASSIST - ${rocketSystem.launchAssistBodyName} | Surface: ${distanceToSurface.toFixed(1)}m | Radial speed: ${radialSpeed.toFixed(1)}m/s (target ${rocketSystem.launchAssistTargetRadialSpeed.toFixed(0)})`;
                    } else {
                        infoElement.textContent = `Flying Rocket! (W thrust, Shift boost, A/D turn (yaw), Q/E strafe, X brake, Shift+X sync orbit, O toggle tractor beam, Z zoom, F switch to character)`;
                    }
                }
            }, 1);

            // Priority 2: Orbital updates
            animLoopManager.onUpdate((delta) => {
                solarSystemData.forEach(planetData => {
                    planetData.orbitAngle += planetData.orbitSpeed * delta;
                    planetData.planetGroup.position.set(
                        planetData.orbitRadius * Math.cos(planetData.orbitAngle),
                        0,
                        planetData.orbitRadius * Math.sin(planetData.orbitAngle)
                    );

                    planetData.moons.forEach(moonData => {
                        moonData.orbitAngle += moonData.orbitSpeed * delta;
                        moonData.moonGroup.position.set(moonData.orbitRadius * Math.cos(moonData.orbitAngle), 0, moonData.orbitRadius * Math.sin(moonData.orbitAngle));
                    });
                });
            }, 2);

            // Priority 2.5: LOD System updates
            animLoopManager.onUpdate((delta) => {
                // Build LOD context
                const characterWorldPos = new THREE.Vector3();
                pivot.getWorldPosition(characterWorldPos);
                
                const cameraWorldPos = new THREE.Vector3();
                const activeCamera = cameraController.getActiveCamera(rocketSystem.isInRocket);
                activeCamera.getWorldPosition(cameraWorldPos);
                
                const rocketWorldPos = rocketSystem.isInRocket ? rocketSystem.getRocketWorldPosition() : null;
                
                // Find which system the character is on
                const characterSystemIndex = characterController.currentSystemIndex;
                
                // Find which system the rocket is closest to
                let rocketClosestSystemIndex = -1;
                if (rocketWorldPos) {
                    rocketClosestSystemIndex = findClosestSystemIndex(rocketWorldPos, solarSystemData);
                }
                
                // Track which systems the trajectory line intersects
                const trajectoryIntersections = new Set();
                if (rocketSystem.isInRocket && rocketSystem.trajectoryLine && rocketSystem.trajectoryLine.geometry) {
                    const trajectoryPositions = rocketSystem.trajectoryLine.geometry.attributes.position.array;
                    
                    // Check each planet system for trajectory intersection
                    solarSystemData.forEach((planetData, pIndex) => {
                        const planetWorldPos = new THREE.Vector3();
                        planetData.planetGroup.getWorldPosition(planetWorldPos);
                        
                        // Check if trajectory passes near this planet system
                        const influenceRadius = planetData.effectiveRadius * 3;
                        
                        for (let i = 0; i < trajectoryPositions.length; i += 3) {
                            const trajPoint = new THREE.Vector3(
                                trajectoryPositions[i],
                                trajectoryPositions[i + 1],
                                trajectoryPositions[i + 2]
                            );
                            
                            if (trajPoint.distanceTo(planetWorldPos) < influenceRadius) {
                                trajectoryIntersections.add(pIndex);
                                break;
                            }
                        }
                    });
                }
                
                // Determine if camera is on opposite side of sun (for low LOD)
                const sunPos = new THREE.Vector3(0, 0, 0);
                
                const lodContext = {
                    characterPosition: characterWorldPos,
                    rocketPosition: rocketWorldPos,
                    cameraPosition: cameraWorldPos,
                    characterSystemIndex: characterSystemIndex,
                    rocketClosestSystemIndex: rocketClosestSystemIndex,
                    trajectoryIntersections: trajectoryIntersections,
                    isCharacterMode: !rocketSystem.isInRocket,
                    sunPosition: sunPos
                };
                
                // Update all LODs based on context
                lodManager.updateAllLODs(solarSystemData, lodContext);
            }, 2.5);

            // Priority 3: Visual effects updates
            animLoopManager.onUpdate((delta) => {
                // --- Update Black Hole Bubbles ---
                allBlackHoleBubbles.forEach(bubble => {
                    updateBlackHoleBubble(bubble, delta, camera);
                });

                // --- Update Explosion Particles ---
                vfxManager.updateExplosions(delta);
            }, 3);

            // Priority 4: Character controls and rotation
            animLoopManager.onUpdate((delta) => {
                if (!rocketSystem.isInRocket) {
                    cameraController.applyCharacterRotation();
                }
            }, 4);

            // Priority 5: Character movement
            animLoopManager.onUpdate((delta) => {
                if (!rocketSystem.isInRocket && characterController.getCurrentSurface()) {
                    characterController.handleMovement(inputManager.keys, delta);
                    // Sync legacy references
                    currentSurfaceObject = characterController.currentSurfaceObject;
                    isInWater = characterController.isInWater;
                }
            }, 5);

            // Priority 6: Camera updates
            animLoopManager.onUpdate((delta) => {
                // Update camera controller with current surface for tracking
                cameraController.setCurrentSurface(currentSurfaceObject);
                
                // Update camera based on current mode and state
                cameraController.update(
                    rocketSystem.isInRocket, 
                    rocketObject, 
                    solarSystemData
                );
            }, 6);

            // Priority 7: Character physics
            animLoopManager.onUpdate((delta) => {
                if (!rocketSystem.isInRocket && characterController.getCurrentSurface()) {
                    characterController.updatePhysics(inputManager.keys, delta);
                    // Sync legacy references
                    vPos = characterController.vPos;
                    velocityY = characterController.velocityY;
                    isGrounded = characterController.isGrounded;
                    jetpackEnabled = characterController.jetpackEnabled;
                    jetpackActive = characterController.jetpackActive;
                }
            }, 7);

            // Priority 8: Sun texture updates
            animLoopManager.onUpdate((delta) => {
                if (!sunCollapsing && !blackHoleActive) {
                    const elapsed = animLoopManager.getElapsedTime();
                    // Update sun surface texture
                    generateSunTexture(256, 256, elapsed * 0.5, sunCanvas);
                    sunTexture.needsUpdate = true;
                    
                    // Update corona halo texture
                    generateCoronaTexture(512, 512, elapsed * 0.3, coronaCanvas);
                    coronaTexture.needsUpdate = true;
                    corona.material.opacity = 0.8 + Math.sin(animLoopManager.getElapsedTime() * 2) * 0.2; // Subtle pulse
                }
            }, 8);

            // Priority 9: Celestial body rotations
            animLoopManager.onUpdate((delta) => {
                solarSystemData.forEach(p => {
                    if (p.mesh) p.mesh.rotation.y += 0.001;
                    if (p.moons) {
                        p.moons.forEach(m => {
                            if (m.mesh) m.mesh.rotation.y += 0.01;
                        });
                    }
                    if (p.ringSystemGroup) p.ringSystemGroup.rotation.z += 0.0005;
                });
            }, 9);

            // Priority 10: Direction arrow updates
            animLoopManager.onUpdate((delta) => {
                // --- Adjust direction arrow scale based on camera distance ---
                if (rocketObject && rocketObject.directionArrow) {
                    // Configurable factor - adjust this value to make the arrow more or less prominent
                    const ARROW_SCALE_FACTOR = 0.5;

                    const rocketWorldPosition = new THREE.Vector3();
                    rocketObject.getWorldPosition(rocketWorldPosition);

                    // Use active camera to calculate distance
                    const activeCamera = cameraController.getActiveCamera(rocketSystem.isInRocket);

                    const distance = activeCamera.position.distanceTo(rocketWorldPosition);
                    let newScale = distance * ARROW_SCALE_FACTOR;

                    // Minimum scale to ensure the arrow is always visible
                    newScale = Math.max(newScale, 3.0);

                    // Apply scale to the arrow mesh
                    rocketObject.directionArrow.arrowMesh.scale.set(newScale, newScale, newScale);

                    // Ensure the arrow stays in orbital plane (Y=0 constraint)
                    if (rocketSystem.isInRocket) {
                        // When flying, the arrow should follow the rocket's orientation
                        rocketObject.directionArrow.position.y = 0;
                    }
                }

                // --- Debug HUD for yaw/speed ---
                if (debugMode && rocketObject) {
                    const yawDeg = (rocketYaw * 180 / Math.PI).toFixed(1);
                    const speed = rocketVelocity.length().toFixed(2);
                    const lodStats = lodManager.getStats();
                    const baseText = infoElement.textContent.split('\n')[0];
                    infoElement.textContent = `${baseText}\nYaw: ${yawDeg}°  Speed: ${speed}\nLOD: High=${lodStats.high} Med=${lodStats.medium} Low=${lodStats.low}`;
                } else if (debugMode) {
                    // Show LOD stats even when not in rocket
                    const lodStats = lodManager.getStats();
                    const baseText = infoElement.textContent.split('\n')[0];
                    infoElement.textContent = `${baseText}\nLOD: High=${lodStats.high} Med=${lodStats.medium} Low=${lodStats.low}`;
                }
            }, 10);

            // =================== REGISTER RENDER CALLBACKS ===================
            
            // Render callback: Determine active camera and render scene
            animLoopManager.onRender((delta) => {
                // Get the active camera from camera controller
                const activeCamera = cameraController.getActiveCamera(rocketSystem.isInRocket);
                
                // Black hole rendering with gravitational lensing effect
                if (blackHoleActive && blackHoleSystem.bhSphere) {
                    // Update black hole disk animation
                    if (blackHoleSystem.disk && blackHoleSystem.disk.material && blackHoleSystem.disk.material.uniforms && blackHoleSystem.disk.material.uniforms.time) {
                        blackHoleSystem.disk.material.uniforms.time.value = animLoopManager.getElapsedTime();
                    }
                    
                    // Animate inner particles
                    if (blackHoleSystem.innerParticles) {
                        blackHoleSystem.innerParticles.rotation.y += 0.05 * delta * 60;
                    }
                    
                    // Render scene to texture for lensing effect
                    blackHoleSystem.bhSphere.visible = false;
                    renderer.setRenderTarget(blackHoleSystem.screenTarget);
                    renderer.clear();
                    renderer.render(scene, activeCamera);
                    
                    // Render final scene with black hole visible
                    blackHoleSystem.bhSphere.visible = true;
                    renderer.setRenderTarget(null);
                    renderer.clear();
                    renderer.render(scene, activeCamera);
                } else {
                    renderer.clear();
                    renderer.render(scene, activeCamera);
                }
            });

            // =================== START ANIMATION LOOP ===================
            animLoopManager.start();


            // Handle window resize - Extended handler for black hole updates
            const originalResizeHandler = sceneSetup.onWindowResize.bind(sceneSetup);
            sceneSetup.onWindowResize = function() {
                originalResizeHandler();
                
                // Update screen texture target reference
                screenTextureTarget = sceneSetup.screenTextureTarget;
                
                // Update black hole uniforms if active
                if (blackHoleActive && blackHoleSystem.bhSphere) {
                    blackHoleSystem.bhSphere.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
                }
            };
        });
