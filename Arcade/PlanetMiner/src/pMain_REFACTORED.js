/**
 * Main Application Entry Point
 * Coordinates all game systems and initializes the application
 */
import * as THREE from 'three';
import { 
    SUN_RADIUS, 
    COLOR_PALETTE
} from './pConstants.js';
import { SceneSetup } from './pSceneSetup.js';
import { generateSolarSystem } from './pSolarSystemGenerator.js';
import { CharacterController } from './pCharacterController.js';
import { RocketSystem } from './pRocketSystem.js';
import { UIManager } from './pUISystem.js';
import { VisualEffectsManager, SunAnimationManager, AnimationLoopManager } from './pRenderPipeline.js';
import { InputManager } from './pInputSystem.js';
import { CameraController } from './pCameraController.js';
import { createBlackHoleBubble } from './pBlackHoleBubble.js';

// =================== SUN TEXTURE GENERATION ===================
// (These are specialized textures that don't fit neatly into other modules)
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

// =================== MAIN APPLICATION CLASS ===================
class PlanetMinerGame {
    constructor() {
        // Core systems
        this.sceneSetup = null;
        this.inputManager = null;
        this.cameraController = null;
        this.characterController = null;
        this.rocketSystem = null;
        this.uiManager = null;
        this.vfxManager = null;
        this.sunAnimManager = null;
        this.animLoopManager = null;
        
        // Game state
        this.solarSystemData = [];
        this.teleportLocations = [];
        this.isInRocket = false;
        this.questComplete = false;
        
        // Scene objects
        this.sun = null;
        this.corona = null;
        this.sunLight = null;
        
        // Character objects
        this.pivot = null;
        this.body = null;
        this.headGroup = null;
        this.jetpackEquipment = {};
        
        // Clock
        this.clock = new THREE.Clock();
    }
    
    async init() {
        // 1. Generate solar system data
        this.solarSystemData = generateSolarSystem();
        
        // 2. Initialize Three.js scene
        this.sceneSetup = new SceneSetup();
        const furthestPlanet = this.solarSystemData.length > 0 
            ? this.solarSystemData[this.solarSystemData.length - 1] 
            : { orbitRadius: SUN_RADIUS * 4 };
        this.sceneSetup.initFreeCameraConfigs(furthestPlanet.orbitRadius, SUN_RADIUS);
        
        // 3. Initialize managers
        this.uiManager = new UIManager(document.getElementById('info'));
        this.inputManager = new InputManager();
        this.vfxManager = new VisualEffectsManager(this.sceneSetup.scene);
        this.animLoopManager = new AnimationLoopManager();
        
        // 4. Build the scene
        this.buildScene();
        
        // 5. Setup character
        this.setupCharacter();
        
        // 6. Setup camera controller
        this.cameraController = new CameraController(
            this.sceneSetup, 
            this.pivot, 
            this.headGroup
        );
        this.cameraController.initFreeCameraConfigs(furthestPlanet.orbitRadius, SUN_RADIUS);
        
        // 7. Setup rocket
        this.rocketSystem = new RocketSystem(
            this.sceneSetup.scene,
            this.solarSystemData,
            this.sun,
            document.getElementById('info')
        );
        
        // 8. Initialize character controller with all dependencies
        this.characterController = new CharacterController(
            this.sceneSetup.scene,
            this.pivot,
            this.body,
            this.headGroup,
            this.sceneSetup.freeCameraConfigs,
            this.solarSystemData
        );
        this.characterController.setJetpackEquipment(
            this.jetpackEquipment.helmet,
            this.jetpackEquipment.jetpack,
            this.jetpackEquipment.thrusterLeft,
            this.jetpackEquipment.thrusterRight,
            this.jetpackEquipment.flameLeft,
            this.jetpackEquipment.flameRight
        );
        this.characterController.setTeleportLocations(this.teleportLocations);
        this.characterController.setInitialPosition();
        
        // 9. Setup sun animation manager
        this.sunAnimManager = new SunAnimationManager(
            this.sceneSetup.scene,
            this.sun,
            this.corona,
            this.sunLight,
            this.sceneSetup.camera
        );
        
        // 10. Setup input handlers
        this.setupInputHandlers();
        
        // 11. Setup animation loop
        this.setupAnimationLoop();
        
        // 12. Start the game
        this.uiManager.setLoading('Game Ready!');
        this.animLoopManager.start();
    }
    
    buildScene() {
        const scene = this.sceneSetup.scene;
        
        // Create sun with animated textures
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
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        scene.add(this.sun);

        // Add corona sprite
        this.corona = new THREE.Sprite(new THREE.SpriteMaterial({
            map: coronaTexture,
            color: 0xffffaa,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.8
        }));
        this.corona.scale.set(SUN_RADIUS * 4, SUN_RADIUS * 4, 1);
        this.sun.add(this.corona);
        
        // Add lighting
        this.sunLight = this.sceneSetup.addSunLight();
        this.sceneSetup.addAmbientLight();
        
        // Build planets, moons, and rings
        this.solarSystemData.forEach((planetData, pIndex) => {
            this.buildPlanetSystem(planetData, pIndex);
        });
    }
    
    buildPlanetSystem(planetData, pIndex) {
        const scene = this.sceneSetup.scene;
        const camera = this.sceneSetup.camera;
        const planetSystemLocations = [];

        const planetGroup = new THREE.Object3D();
        planetData.planetGroup = planetGroup;
        scene.add(planetGroup);

        // Create black hole bubble for planet
        const planetBubbleSize = planetData.effectiveRadius * 0.2;
        const planetBubble = createBlackHoleBubble(planetBubbleSize, camera);
        planetGroup.add(planetBubble);
        planetData.blackHoleBubble = planetBubble;
        planetBubble.userData.originalRadius = planetData.radius;
        planetBubble.userData.bodyData = planetData;
        this.vfxManager.registerBlackHoleBubble(planetBubble);

        // Create planet mesh
        const planetGeometry = new THREE.IcosahedronGeometry(planetData.radius, 1);
        const planetMaterial = new THREE.MeshStandardMaterial({ 
            color: COLOR_PALETTE[pIndex % COLOR_PALETTE.length], 
            roughness: 0.8 
        });
        const planet = new THREE.Mesh(planetGeometry, planetMaterial);
        planetData.mesh = planet;
        planetData.name = `Planet ${pIndex + 1}`;
        planetBubble.add(planet);

        // Add special features to first planet (ocean, atmosphere)
        if (pIndex === 0) {
            this.addOceanAndAtmosphere(planetData, planetBubble);
        }

        // Add gas giant atmosphere
        if (planetData.isGasGiant) {
            this.addGasGiantAtmosphere(planetData, planetBubble, pIndex);
        }

        planetSystemLocations.push({ 
            name: `Planet ${pIndex + 1}`, 
            object: planet, 
            parentGroup: planetGroup, 
            radius: planetData.effectiveRadius 
        });

        // Build rings
        if (planetData.rings.length > 0) {
            this.buildRings(planetData, planetGroup);
        }

        // Build moons
        planetData.moons.forEach((moonData, mIndex) => {
            const moonLocation = this.buildMoon(moonData, mIndex, pIndex, planetGroup, camera);
            planetSystemLocations.push(moonLocation);
        });

        this.teleportLocations.push(planetSystemLocations);

        // Add orbit path visualization
        this.addOrbitPath(planetData, pIndex);
    }
    
    addOceanAndAtmosphere(planetData, planetBubble) {
        // Ocean
        const oceanRadius = planetData.radius * 0.96;
        const oceanGeometry = new THREE.SphereGeometry(oceanRadius, 32, 32);
        const oceanMaterial = new THREE.MeshStandardMaterial({
            color: 0x3399ff,
            transparent: true,
            opacity: 0.6,
            roughness: 0.3,
            metalness: 0.7
        });
        const oceanSphere = new THREE.Mesh(oceanGeometry, oceanMaterial);
        planetBubble.add(oceanSphere);
        planetData.waterSphere = oceanSphere;
        planetData.waterRadius = oceanRadius;

        // Atmosphere
        let atmosphereRadius;
        if (planetData.moons.length === 0) {
            atmosphereRadius = oceanRadius + 16;
        } else {
            let closestMoonOrbit = Infinity;
            let closestMoonRadius = 0;
            planetData.moons.forEach(moonData => {
                if (moonData.orbitRadius < closestMoonOrbit) {
                    closestMoonOrbit = moonData.orbitRadius;
                    closestMoonRadius = moonData.radius;
                }
            });
            atmosphereRadius = oceanRadius + (closestMoonOrbit - closestMoonRadius - oceanRadius) / 3;
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
    
    addGasGiantAtmosphere(planetData, planetBubble, pIndex) {
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
    
    buildRings(planetData, planetGroup) {
        const ringSystemGroup = new THREE.Object3D();
        planetData.ringSystemGroup = ringSystemGroup;
        planetGroup.add(ringSystemGroup);
        ringSystemGroup.rotation.x = Math.PI / 2;
        
        planetData.rings.forEach(ringData => {
            const ringGeometry = new THREE.RingGeometry(ringData.innerRadius, ringData.outerRadius, 64);
            const ringMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xaaaaaa, 
                side: THREE.DoubleSide, 
                transparent: true, 
                opacity: 0.4 + Math.random() * 0.2 
            });
            const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            ringSystemGroup.add(ringMesh);
            ringData.mesh = ringMesh;
        });
    }
    
    buildMoon(moonData, mIndex, pIndex, planetGroup, camera) {
        const moonGroup = new THREE.Object3D();
        moonGroup.position.set(moonData.orbitRadius, 0, 0);
        planetGroup.add(moonGroup);
        moonData.moonGroup = moonGroup;
        moonData.isMoon = true;
        
        const moonBubbleSize = moonData.radius * 0.2;
        const moonBubble = createBlackHoleBubble(moonBubbleSize, camera);
        moonGroup.add(moonBubble);
        moonData.blackHoleBubble = moonBubble;
        moonBubble.userData.originalRadius = moonData.radius;
        moonBubble.userData.bodyData = moonData;
        this.vfxManager.registerBlackHoleBubble(moonBubble);
        
        const moonGeometry = new THREE.IcosahedronGeometry(moonData.radius, 0);
        const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.9 });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moonData.mesh = moon;
        moonData.name = `Moon ${pIndex + 1}-${String.fromCharCode(65 + mIndex)}`;
        moonBubble.add(moon);
        
        return { 
            name: moonData.name, 
            object: moon, 
            parentGroup: moonGroup, 
            radius: moonData.radius 
        };
    }
    
    addOrbitPath(planetData, pIndex) {
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
        this.sceneSetup.scene.add(orbitRing);
        planetData.orbitPathMesh = orbitRing;
    }
    
    setupCharacter() {
        // Create character pivot and body
        this.pivot = new THREE.Object3D();
        const bodyGeometry = new THREE.BoxGeometry(1, 1.5, 0.5);
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.pivot.add(this.body);

        // Create head
        this.headGroup = new THREE.Object3D();
        this.pivot.add(this.headGroup);
        const headGeometry = new THREE.IcosahedronGeometry(0.4, 0);
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, roughness: 0.5 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        this.headGroup.add(head);

        // Create jetpack equipment
        this.jetpackEquipment = this.createJetpackEquipment();
        
        // Add cameras to head
        this.headGroup.add(this.sceneSetup.thirdPersonCamera);
        this.headGroup.add(this.sceneSetup.firstPersonCamera);
    }
    
    createJetpackEquipment() {
        // Helmet
        const helmetGeometry = new THREE.SphereGeometry(0.55, 16, 16);
        const helmetMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x88ccff, 
            transparent: true, 
            opacity: 0.3,
            roughness: 0.1,
            metalness: 0.3
        });
        const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.headGroup.add(helmet);

        // Jetpack
        const jetpackGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.3);
        const jetpackMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333, 
            roughness: 0.6,
            metalness: 0.5
        });
        const jetpack = new THREE.Mesh(jetpackGeometry, jetpackMaterial);
        jetpack.position.set(0, 0.3, -0.4);
        this.body.add(jetpack);

        // Thrusters
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
        this.body.add(thrusterLeft);

        const thrusterRight = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
        thrusterRight.position.set(0.15, -0.2, -0.55);
        thrusterRight.rotation.x = Math.PI / 2;
        this.body.add(thrusterRight);

        // Flames
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
        this.body.add(flameLeft);

        const flameRight = new THREE.Mesh(flameGeometry, flameMaterial);
        flameRight.position.set(0.15, -0.5, -0.55);
        flameRight.rotation.x = Math.PI;
        flameRight.visible = false;
        this.body.add(flameRight);

        return { helmet, jetpack, thrusterLeft, thrusterRight, flameLeft, flameRight };
    }
    
    setupInputHandlers() {
        this.inputManager.setupEventListeners();
        
        // Key down handlers
        this.inputManager.onKeyDown((key, event, keys) => {
            if (key === 'V') {
                this.cameraController.cycleMode();
            } else if (key === 'Z') {
                this.cameraController.cycleFreeZoom();
            } else if (key === 'J') {
                this.characterController.toggleJetpack();
            } else if (key === 'T') {
                this.characterController.teleportNextBody();
            } else if (key === 'Y') {
                this.characterController.teleportNextSystem();
            } else if (key === 'R' && this.isInRocket) {
                // Explode planet/moon when in rocket
                // TODO: Implement explosion logic using vfxManager
            } else if (key === 'F') {
                this.toggleRocketMode();
            }
        });
        
        // Mouse wheel handler
        this.inputManager.onWheel((delta) => {
            this.cameraController.handleWheelZoom(delta);
        });
        
        // Mouse move handler
        this.inputManager.onMouseMove((mouseX, mouseY, event) => {
            if (this.inputManager.isPointerLocked()) {
                this.cameraController.handleMouseMove(
                    event.movementX, 
                    event.movementY, 
                    0.002, // sensitivity
                    Math.PI / 3 // max pitch
                );
            }
        });
    }
    
    toggleRocketMode() {
        if (this.isInRocket) {
            // Switch to character
            this.isInRocket = false;
            this.rocketSystem.switchToCharacter();
            this.characterController.updateInfoText();
            
            if (this.cameraController.cameraMode === 'free') {
                this.inputManager.exitPointerLock();
            }
        } else {
            // Switch to rocket
            const charWorldPos = new THREE.Vector3();
            this.pivot.getWorldPosition(charWorldPos);
            const rocketWorldPos = this.rocketSystem.getRocketWorldPosition();
            const distance = charWorldPos.distanceTo(rocketWorldPos);
            
            if (distance < 10) { // ROCKET_ENTER_DISTANCE from constants
                this.isInRocket = true;
                this.rocketSystem.switchToRocket();
                this.inputManager.requestPointerLock();
            } else {
                this.uiManager.setMessage('Too far from rocket!');
            }
        }
    }
    
    setupAnimationLoop() {
        // Register update callbacks with priority ordering
        
        // Priority 0: Input and physics
        this.animLoopManager.onUpdate((delta) => {
            if (!this.isInRocket) {
                this.characterController.handleMovement(this.inputManager.keys, delta);
                this.characterController.updatePhysics(this.inputManager.keys, delta);
            } else {
                this.rocketSystem.updateRocket(delta, this.inputManager.keys);
                this.rocketSystem.updateTrajectory(delta, this.inputManager.keys);
            }
        }, 0);
        
        // Priority 1: Camera updates
        this.animLoopManager.onUpdate((delta) => {
            this.cameraController.update(
                this.isInRocket,
                this.rocketSystem.rocketObject,
                this.solarSystemData
            );
        }, 1);
        
        // Priority 2: Visual effects
        this.animLoopManager.onUpdate((delta) => {
            this.vfxManager.updateExplosions(delta);
            this.vfxManager.updateBlackHoleBubbles(delta, this.cameraController.getActiveCamera(this.isInRocket));
        }, 2);
        
        // Priority 3: Sun animation
        this.animLoopManager.onUpdate((delta) => {
            if (this.sunAnimManager.isCollapsing()) {
                this.sunAnimManager.updateCollapse(delta);
            }
            if (this.sunAnimManager.isBlackHoleActive()) {
                this.sunAnimManager.updateBlackHole(delta, this.clock);
            }
        }, 3);
        
        // Priority 4: Rendering
        this.animLoopManager.onUpdate((delta) => {
            const activeCamera = this.cameraController.getActiveCamera(this.isInRocket);
            
            if (this.sunAnimManager.isBlackHoleActive()) {
                this.sunAnimManager.renderWithBlackHole(
                    this.sceneSetup.renderer,
                    this.sceneSetup.scene,
                    activeCamera
                );
            } else {
                this.sceneSetup.render(activeCamera);
            }
        }, 4);
    }
}

// =================== START THE GAME ===================
window.addEventListener('load', async () => {
    const game = new PlanetMinerGame();
    await game.init();
});
