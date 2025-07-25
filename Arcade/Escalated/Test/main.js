import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { addGarageCar, getLastGarageCar } from './car.js'; // Import the car model function
import { calculateEscalatorBoost, animateActiveEscalatorSteps, updateEscalatorStepVisuals } from './escalator.js';
import { Mobster } from './mobster.js'; // Import the Mobster class

// IMPORTANT: Left is +X and Right is -X in this world
// Up is +Y and Down is -Y in this world
// +Z is forward and -Z is backward in this world

let isGamePaused = false; let animationFrameIdGame; // Or whatever you call your game's animation frame ID


// --- Game Settings ---
const SETTINGS = {
    numFloors: 3, // Number of floors
    doorsPerSide: 3,
    corridorSegmentLength: 5, // Length of corridor section for one door pair
    corridorWidth: 4,
    wallHeight: 3.5,
    numBasementFloors: 1, // Number of basement floors (e.g., 1 means one level below ground at index -1)
    floorHeight: 4, // Vertical distance between floors
    doorWidth: 1,
    doorHeight: 2.1,
    doorDepth: 0.15,
    elevatorSpeed: 4.0, // Units per second
    elevatorSize: 4.0,
    playerSpeed: 5.0,
    sprintMultiplier: 1.8,
    jumpVelocity: 7.0,
    gravity: -18.0,
    lookSensitivity: 0.002, // PointerLockControls sensitivity is different
    escalatorLength: 4.0, // Add this line to define escalatorLength
    escalatorWidth: 3.0,
    escalatorSpeed: 1.0,
    roomSize: 5.0,
};

// --- Core Variables ---
let scene, camera, renderer, controls;

// --- Global Arrays ---
const fallenLampshades = [];
let playerBox; // Added: Global player's collision box
let clock;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isSprinting = false;
let playerHeight = 1.7; // Camera height offset
let isCrouching = false; // New crouch state
let playerState = 'upright'; // Possible states: 'upright', 'crouching', 'prone'
let isWireframeView = false; // For wireframe debug view

// let elevator, elevatorTargetY = 0, isElevatorMoving = false, elevatorDirection = 0; // Old single elevator state
// let currentFloorIndex = 0; // Old single elevator state
const elevators = []; // Array to store all elevator objects
let activeElevator = null; // The elevator currently being controlled or closest to the player

const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length
const escalatorWidth = SETTINGS.escalatorWidth;
const roomSize = SETTINGS.roomSize; // Use the defined room size
const elevatorSize = SETTINGS.elevatorSize; // Use the defined elevator size
// let buildingWidth = SETTINGS.corridorWidth + (2 * roomSize); // Total width of the building - will be recalculated
const worldCentre = new THREE.Vector3(SETTINGS.corridorWidth / 2, 0, -8); // Center of the world for reference

const worldObjects = []; // For basic collision detection
const doors = []; // To store door data for interaction
let lights = []; // Move lights array to global scope

let playerLives = 3; // Player starts with 3 lives
let playerScore = 0; // Initial score
let isGameOver = false; // Game over state
let isPlayerRespawning = false; // Tracks if the player is waiting to respawn

const animatedGarageDoors = []; // To store garage doors that need animation
const enemies = []; // Array to store enemy objects
let currentElevatorConfig = null; // To help generateWorld access the current elevator's properties
let isPlayerInCar = false; // New state variable to track if player is in the car

const floorDepth = SETTINGS.floorHeight - SETTINGS.wallHeight; // Add this near your SETTINGS or at the top of generateWorld

// Add these for escalator step tracking
const escalatorSteps = {
    up: {},   // { floorIndex: [stepUpMesh, ...] }
    down: {}  // { floorIndex: [stepDownMesh, ...] }
};
const escalatorStepsB = {
    up: {},   // { floorIndex: [stepUpMesh, ...] }
    down: {}  // { floorIndex: [stepDownMesh, ...] }
};
const escalatorStarts = {
    up: {},   // { floorIndex: startEscUpMesh }
    down: {}  // { floorIndex: startEscDownMesh }
};
const escalatorStartsB = {
    up: {},   // { floorIndex: startEscUpMesh }
    down: {}  // { floorIndex: startEscDownMesh }
};
const escalatorEnds = {
    up: {},   // For up steps if needed in future
    down: {}  // For down-step ending points
};
const escalatorEndsB = {
    up: {},   // For up steps if needed in future
    down: {}  // For down-step ending points
};
let playerOnEscalator = { type: null, floor: null, wing: null }; // Track which escalator area player is on

// --- Escalator Control System ---
// This object will hold the state and button references for each escalator system.
// Each key will be a unique escalator ID (e.g., 'escalator_A_0_up').
// The value will be an object containing the current direction and an array of all its buttons.
const escalatorSystems = {};

// --- LOD System ---
const allRoomsData = []; // Stores data for each room for LOD management
/* Each entry: {
    id: string, // e.g., R_F0_D0
    door: THREE.Mesh | null,
    windowGlass: THREE.Mesh | null,
    opaqueMaterial: THREE.Material | null, // Added to store the opaque window material
    transparentMaterial: THREE.Material | null, // Already implicitly stored, making it explicit
    contentsGroup: THREE.Group, visibleByDoor: boolean, visibleByWindow: boolean, lamp: THREE.Group }
*/
// --- Reusable Lamp Geometries & Materials (defined once) ---
const lampConeGeo = new THREE.ConeGeometry(0.3, 0.2, 8);
const lampChainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
const lampBulbGeo = new THREE.SphereGeometry(0.08, 8, 8); // bulbRadius = 0.08
const lampBottomDiskGeo = new THREE.CircleGeometry(0.3, 16);

// Materials for standard corridor/area lamps (non-animated parts)
const lampChainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
const lampLampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0 });
// This material is for the glowing disk of corridor/area lamps, which is statically emissive.
const lampCorridorDiskMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1 });
// lightBulbMaterial (for the bulb itself) will be passed in, as it's already globally defined in generateWorld.

// --- Window Constants ---
const WINDOW_WIDTH_RATIO = 0.7;
const WINDOW_HEIGHT_RATIO = 0.6;
const WINDOW_SILL_RATIO = 0.2; // of wallHeight


const playerInventory = {
    lampshades: 0,
    // other items can be added here
};



// --- Initialization ---
let frameTimes = [];
let performanceCheckDone = false;
let downgradeTriggered = false;

function checkPerformanceAndDowngrade() {
    if (performanceCheckDone) return;
    const now = performance.now();
    frameTimes.push(now);

    // Only keep the last 10 seconds of frame times
    while (frameTimes.length > 2 && (now - frameTimes[0]) > 10000) {
        frameTimes.shift();
    }

    // After 10 seconds, check average FPS
    if ((now - frameTimes[0]) >= 10000 && !downgradeTriggered) {
        const avgFPS = (frameTimes.length - 1) / ((frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000);
        if (avgFPS < 30) {
            downgradeAllMaterials();
            downgradeTriggered = true;
            // Optional: Show a message
            const msg = document.createElement('div');
            msg.style.position = 'fixed';
            msg.style.top = '10px';
            msg.style.left = '50%';
            msg.style.transform = 'translateX(-50%)';
            msg.style.background = 'rgba(0,0,0,0.7)';
            msg.style.color = '#fff';
            msg.style.padding = '10px 20px';
            msg.style.zIndex = 9999;
            msg.style.fontSize = '18px';
            msg.innerText = 'Performance mode enabled for smoother gameplay.';
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 4000);
        }
        performanceCheckDone = true;
    }
}

function downgradeAllMaterials() {
    scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
            // Handle multi-material meshes
            if (Array.isArray(obj.material)) {
                obj.material = obj.material.map(mat => downgradeMaterial(mat));
            } else {
                obj.material = downgradeMaterial(obj.material);
            }
        }
    });
}

function downgradeMaterial(mat) {
    // Only downgrade PBR materials
    if (
        mat.type === 'MeshStandardMaterial' ||
        mat.type === 'MeshPhysicalMaterial' ||
        mat.type === 'MeshPhongMaterial'
    ) {
        // Use color and map if present
        return new THREE.MeshBasicMaterial({
            color: mat.color ? mat.color.clone() : 0xffffff,
            map: mat.map || null,
            transparent: mat.transparent,
            opacity: mat.opacity,
            side: mat.side,
        });
    }
    return mat;
}

function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    playerBox = new THREE.Box3(); // Initialize playerBox here

    // Set background to a dark blue for a moonlit night
    scene.background = new THREE.Color(0x010309); // Dark blue
    scene.fog = new THREE.Fog(0x010309, 10, 100); // Fog to match the night theme

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 0); // Start at the beginning of the new connector floor

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x115599, 0.1); // Dim bluish ambient light
    scene.add(ambientLight);

    const moonlight = new THREE.DirectionalLight(0x015599, 0.3); // Soft bluish moonlight
    moonlight.position.set(-10, 20, -10); // Position the moonlight
    moonlight.castShadow = true;
    scene.add(moonlight);

    // Pointer Lock Controls
    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject()); // Add the camera holder to the scene

    const instructions = document.getElementById('instructions');
    instructions.innerHTML = `
        <p>Move: W/A/S/D</p>
        <p>Jump: Space</p>
        <p>Sprint: Shift</p>
        <p>Crouch: Ctrl</p>
        <p>Prone: Ctrl, Ctrl</p>
        <p>U: Call Elevator Up</p>
        <p>J: Call Elevator Down</p>
        <p>Interact: E</p>
        <p>Shoot: Left Mouse Button</p
        <p>Throwable: Right Mouse Button</p>>
    `; // Updated instructions to include crouch toggle

    controls.addEventListener('lock', () => {
        instructions.style.display = 'none';
        if (typeof toggleMenu === 'function') {
            toggleMenu(false); // Hide the menu-container
        }
    });
    controls.addEventListener('unlock', () => {
        instructions.style.display = 'block';
        if (typeof toggleMenu === 'function') {
            toggleMenu(true); // Show the menu-container
        }
    });
    document.body.addEventListener('click', () => controls.lock());

    // --- Procedural Generation ---
    generateWorld();

    // --- Event Listeners ---
    document.addEventListener('mousedown', function (event) {
        // Left mouse button (0): normal shoot
        // Right mouse button (2): lampshade shoot
        if (event.button === 0) {
            // Check for elevator button click
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObjects(scene.children, true);

            for (const intersect of intersects) {
                if (intersect.object.userData.elevatorId && (intersect.object.userData.direction === 'up' || intersect.object.userData.direction === 'down')) {
                    const elevatorId = intersect.object.userData.elevatorId;
                    const direction = intersect.object.userData.direction;
                    const targetElevator = elevators.find(elev => elev.id === elevatorId);

                    if (targetElevator) {
                        activeElevator = targetElevator; // Set the clicked elevator as active
                        callElevator(direction === 'up' ? 1 : -1);
                        return; // Exit after handling button click
                    }
                }
            }
            shoot();
        } else if (event.button === 2) {
            shootLampshade();
        }
    });
    // Prevent context menu on right click
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Make the player jump slightly at the start
    playerVelocity.y = 2.0;

    document.addEventListener('keydown', function (event) {
        if (!controls.isLocked) return; // Only allow menu if game is active
        if (event.key === 'm' || event.key === 'M' || event.key === 'Escape') {
            event.preventDefault();
            const currentGameUrl = window.location.pathname.replace(/^\//, '') + window.location.search + window.location.hash;
            window.location.href = '../../Menu.html?returnTo=' + encodeURIComponent(currentGameUrl);
        }
    });

    // Start the animation loop
    animate();
}


// --- Elevator Creation ---
function createElevator(config) {
    const elevatorObj = {
        id: config.id,
        platform: null,
        roof: null, // elevator's own internal roof
        chain: null,
        shaftCeiling: null, // Topmost ceiling of the elevator shaft
        shaftPit: null,     // Bottommost base of the elevator shaft
        poles: [],
        minFloorIndex: config.minFloorIndex,
        maxFloorIndex: config.maxFloorIndex,
        // Platform center Y is -0.1 from the actual floor level for visual alignment
        currentY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        targetY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        isMoving: false,
        direction: 0,
        currentFloorIndexVal: config.startFloorIndex,
        config: config // Store original config for reference
    };

    // 1. Elevator Platform
    const platformGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, 0.2, config.shaftDepth - 0.2);
    elevatorObj.platform = new THREE.Mesh(platformGeo, config.platformMaterial);
    elevatorObj.platform.name = `ElevatorPlatform_${config.id}`;
    elevatorObj.platform.position.set(config.x, elevatorObj.currentY, config.z);
    elevatorObj.platform.castShadow = true;
    elevatorObj.platform.receiveShadow = true;
    config.scene.add(elevatorObj.platform);
    config.worldObjectsRef.push(elevatorObj.platform);
    elevatorObj.platform.userData.elevatorId = config.id;

    // 2. Elevator's Own Internal Roof
    const elevatorInternalRoofThickness = 0.2;
    const internalRoofGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, elevatorInternalRoofThickness, config.shaftDepth - 0.2);
    elevatorObj.roof = new THREE.Mesh(internalRoofGeo, config.platformMaterial);
    elevatorObj.roof.name = `ElevatorInternalRoof_${config.id}`;
    elevatorObj.roof.position.set(config.x, elevatorObj.currentY + SETTINGS.wallHeight, config.z); // Positioned relative to platform
    elevatorObj.roof.castShadow = true;
    elevatorObj.roof.receiveShadow = true;
    config.scene.add(elevatorObj.roof);
    config.worldObjectsRef.push(elevatorObj.roof);
    elevatorObj.roof.geometry.computeBoundingBox();
    elevatorObj.roof.userData.elevatorId = config.id;

    // Add a light inside the elevator, attached to its internal roof
    const elevatorLight = new THREE.PointLight(0xffffff, 0.8, 4); // color, intensity, distance
    // Position slightly below the center of the internal roof
    elevatorLight.position.set(0, -elevatorInternalRoofThickness / 2 - 0.1, 0);
    elevatorObj.roof.add(elevatorLight);

    // 3. Vertical Poles inside elevator (children of the platform)
    const poleDimension = 0.2;
    const poleHeight = SETTINGS.wallHeight; // From platform to internal roof bottom
    const poleGeo = new THREE.BoxGeometry(poleDimension, poleHeight, poleDimension);
    const platformInnerWidth = config.shaftWidth - 0.2;
    const platformInnerDepth = config.shaftDepth - 0.2;

    const polePositions = [
        { x: -platformInnerWidth / 2 + poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x: platformInnerWidth / 2 - poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x: -platformInnerWidth / 2 + poleDimension / 2, z: platformInnerDepth / 2 - poleDimension / 2 },
        { x: platformInnerWidth / 2 - poleDimension / 2, z: platformInnerDepth / 2 - poleDimension / 2 }
    ];
    polePositions.forEach((pos, index) => {
        const pole = new THREE.Mesh(poleGeo, config.platformMaterial);
        pole.name = `ElevatorPole_${config.id}_${index}`;
        // Y position is relative to platform's center. Platform top is 0.1 above its center.
        pole.position.set(pos.x, 0.1 + poleHeight / 2, pos.z);
        pole.castShadow = true; pole.receiveShadow = true;
        pole.userData.elevatorId = config.id; // Tag pole
        elevatorObj.platform.add(pole);
        elevatorObj.poles.push(pole);

    });

    // Add Up and Down buttons
    const buttonSize = 0.2;
    const buttonDepth = 0.25;
    const buttonOffset = 0.025; // 0.1; // Offset from the pole surface

    // Up button (triangle pointing up)
    const upButtonShape = new THREE.Shape();
    upButtonShape.moveTo(0, buttonSize / 2);
    upButtonShape.lineTo(-buttonSize / 2, -buttonSize / 2);
    upButtonShape.lineTo(buttonSize / 2, -buttonSize / 2);
    upButtonShape.lineTo(0, buttonSize / 2);
    const upButtonGeo = new THREE.ExtrudeGeometry(upButtonShape, {
        steps: 1,
        depth: buttonDepth,
        bevelEnabled: false
    });
    const controlsPos = elevatorObj.platform.position; // Use platform's position for button placement
    const controlsX =  platformInnerWidth / 2 - poleDimension / 2;
    const controlsZ =  -platformInnerDepth / 2 + poleDimension / 2 ;
    const upButtonMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.1 });
    const upButton = new THREE.Mesh(upButtonGeo, upButtonMaterial);
    upButton.position.set(controlsX , 0.1 + poleHeight / 2 + 0.5, controlsZ - buttonOffset - poleDimension / 2);
    //upButton.rotation.y = Math.PI / 2; // Rotate to face outwards
    upButton.name = `ElevatorUpButton_${config.id}`; //  `ElevatorUpButton_${config.id}_${index}`;
    upButton.userData.elevatorId = config.id;
    upButton.userData.direction = 'up';
    upButton.userData.originalEmissiveIntensity = upButtonMaterial.emissiveIntensity;
    elevatorObj.platform.add(upButton);
    elevatorObj.upButton = upButton; // Store reference to the up button

    // Down button (triangle pointing down)
    const downButtonShape = new THREE.Shape();
    downButtonShape.moveTo(0, -buttonSize / 2);
    downButtonShape.lineTo(-buttonSize / 2, buttonSize / 2);
    downButtonShape.lineTo(buttonSize / 2, buttonSize / 2);
    downButtonShape.lineTo(0, -buttonSize / 2);
    const downButtonGeo = new THREE.ExtrudeGeometry(downButtonShape, {
        steps: 1,
        depth: buttonDepth,
        bevelEnabled: false
    });
    const downButtonMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.1 });
    const downButton = new THREE.Mesh(downButtonGeo, downButtonMaterial);
    downButton.position.set(controlsX, 0.1 + poleHeight / 2 - 0.5, controlsZ - buttonOffset - poleDimension / 2);
    //downButton.rotation.y = Math.PI / 2; // Rotate to face outwards
    downButton.name = `ElevatorDownButton_${config.id}`; //  `ElevatorDownButton_${config.id}_${index}`;
    downButton.userData.elevatorId = config.id;
    downButton.userData.direction = 'down';
    downButton.userData.originalEmissiveIntensity = downButtonMaterial.emissiveIntensity;
    elevatorObj.platform.add(downButton);
    elevatorObj.downButton = downButton; // Store reference to the down button

    // Elevator control Buttons set B
    const controlsXb =  -platformInnerWidth / 2 + poleDimension / 2;
    const controlsZb =  platformInnerDepth / 2 - poleDimension / 2 ;
    const upButtonB = new THREE.Mesh(upButtonGeo, upButtonMaterial);
    upButtonB.position.set(controlsXb , 0.1 + poleHeight / 2 + 0.5, controlsZb - buttonOffset - poleDimension / 2);
    //upButton.rotation.y = Math.PI / 2; // Rotate to face outwards
    upButtonB.name = `ElevatorUpButtonB_${config.id}`; //  `ElevatorUpButton_${config.id}_${index}`;
    upButtonB.userData.elevatorId = config.id;
    upButtonB.userData.direction = 'up';
    upButtonB.userData.originalEmissiveIntensity = upButtonMaterial.emissiveIntensity;
    elevatorObj.platform.add(upButtonB);
    elevatorObj.upButtonB = upButtonB; // Store reference to the up button

    // Down buttonB (triangle pointing down)
    const downButtonB = new THREE.Mesh(downButtonGeo, downButtonMaterial);
    downButtonB.position.set(controlsXb, 0.1 + poleHeight / 2 - 0.5, controlsZb - buttonOffset - poleDimension / 2);
    //downButton.rotation.y = Math.PI / 2; // Rotate to face outwards
    downButtonB.name = `ElevatorDownButtonB_${config.id}`; //  `ElevatorDownButton_${config.id}_${index}`;
    downButtonB.userData.elevatorId = config.id;
    downButtonB.userData.direction = 'down';
    downButtonB.userData.originalEmissiveIntensity = downButtonMaterial.emissiveIntensity;
    elevatorObj.platform.add(downButtonB);
    elevatorObj.downButtonB = downButtonB; // Store reference to the down button



    // 4. Elevator Shaft Ceiling (Topmost structure of the shaft)
    const shaftCeilingY = (config.maxFloorIndex + 1) * SETTINGS.floorHeight; // One floor height above max floor served
    const shaftCeilingGeo = new THREE.BoxGeometry(config.shaftWidth, floorDepth - 0.02, config.shaftDepth);
    elevatorObj.shaftCeiling = new THREE.Mesh(shaftCeilingGeo, config.shaftMaterial); // e.g., concrete or floorMaterial
    elevatorObj.shaftCeiling.name = `ElevatorShaftCeiling_${config.id}`;
    elevatorObj.shaftCeiling.position.set(config.x, shaftCeilingY - floorDepth / 2, config.z);
    elevatorObj.shaftCeiling.castShadow = true; elevatorObj.shaftCeiling.receiveShadow = true;
    config.scene.add(elevatorObj.shaftCeiling);
    config.worldObjectsRef.push(elevatorObj.shaftCeiling);
    elevatorObj.shaftCeiling.geometry.computeBoundingBox();

    // 5. Elevator Shaft Pit Base (Bottommost structure of the shaft)
    const pitThickness = SETTINGS.floorHeight; // Substantial base
    const pitTopSurfaceY = (config.minFloorIndex * SETTINGS.floorHeight) - floorDepth; // Top of floor slab of lowest served floor
    const pitCenterY = pitTopSurfaceY - pitThickness / 2;
    const pitGeo = new THREE.BoxGeometry(config.shaftWidth, pitThickness, config.shaftDepth);
    elevatorObj.shaftPit = new THREE.Mesh(pitGeo, config.shaftMaterial); // e.g., concreteMaterial
    elevatorObj.shaftPit.name = `ElevatorShaftPit_${config.id}`;
    elevatorObj.shaftPit.position.set(config.x, pitCenterY, config.z);
    elevatorObj.shaftPit.receiveShadow = true;
    config.scene.add(elevatorObj.shaftPit);
    config.worldObjectsRef.push(elevatorObj.shaftPit);
    elevatorObj.shaftPit.geometry.computeBoundingBox();

    // 6. Dynamic Chain (child of the platform)
    // Connects elevator's internal roof to the shaftCeiling
    const chain = createDynamicChainMesh(elevatorObj, config.platformMaterial);
    elevatorObj.chain = chain;
    chain.userData.elevatorId = config.id; // Tag chain
    elevatorObj.platform.add(chain);

    // 7. Bottom Piston Shaft (child of the platform)
    const piston = createElevatorPistonMesh(elevatorObj, config.platformMaterial);
    piston.userData.elevatorId = config.id; // Tag piston
    elevatorObj.platform.add(piston);
    config.worldObjectsRef.push(piston); // Add to worldObjects for collision

    elevators.push(elevatorObj);
    if (!activeElevator) { // Set the first created elevator as active
        activeElevator = elevatorObj;
    }
    return elevatorObj;
}

// --- Enemy Settings ---
const ENEMY_SETTINGS = {
    height: 1.8,
    width: 0.5,
    depth: 0.5,
    fireRate: 2000, // milliseconds between shots
    projectileSpeed: 15.0,
    projectileSize: 0.1,
    activationRadius: 40, // Enemies become active if player is within this radius
    losMaxDistance: 50,   // Max distance for line of sight check
};

const projectiles = []; // Array to store active projectiles
const projectileGeometry = new THREE.SphereGeometry(ENEMY_SETTINGS.projectileSize, 6, 6);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1 });


// --- Standard Lamp Creation Function ---
function createStandardLamp(x, y, z, floorIndex, lampIdSuffix, sceneRef, lightsArrayRef, globalLightBulbMaterialRef) {
    const chainMesh = new THREE.Mesh(lampChainGeo, lampChainMaterial);
    chainMesh.position.y = 0.15;

    // Standard lamps use the global lightBulbMaterial directly as their bulbs are not individually animated for on/off state
    const bulbMesh = new THREE.Mesh(lampBulbGeo, globalLightBulbMaterialRef);
    bulbMesh.position.y = -0.3 + 0.08 * 2; // -0.3 + bulbRadius * 2

    const lampshadeMesh = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial);

    // Standard lamps use a shared material for their bottom disk
    const bottomLightDisk = new THREE.Mesh(lampBottomDiskGeo, lampCorridorDiskMaterial);
    bottomLightDisk.rotation.x = Math.PI / 2;
    bottomLightDisk.position.y = -0.11;

    const lightGroup = new THREE.Group();
    lightGroup.add(lampshadeMesh);
    lightGroup.add(bottomLightDisk);
    lightGroup.add(bulbMesh);
    lightGroup.add(chainMesh);

    const lampName = `Lamp_${lampIdSuffix}`; // To match original naming like "Lamp 101"
    lightGroup.name = lampName;
    lampshadeMesh.name = `${lampName}_Lampshade`;
    // bulbMesh.name = `${lampName}_Bulb`; // Optional, if needed for direct access
    // bottomLightDisk.name = `${lampName}_Disk`; // Optional

    lightGroup.position.set(x, y, z);
    lightGroup.castShadow = true; // Lampshade can cast shadow

    sceneRef.add(lightGroup);
    lightsArrayRef.push(lightGroup);

    const pointLight = new THREE.PointLight(0xffffaa, 1, 5); // Standard intensity and color
    pointLight.position.set(x, y - 0.3, z); // Position point light source
    sceneRef.add(pointLight);

    lightGroup.userData = { pointLight, floorIndex, isDestroyed: false };
    // Note: isRoomLight defaults to false or undefined, differentiating from specialized room lights.
    return lightGroup;
}

// --- Enemy Creation ---
function createEnemy(x, y, z, floorIndex) {
    const scaleFactor = 1.7 / 4.2; // 1.7 / 4.2; // Mobster's desired height / original model height
    const mobsterFeetOffset = 3 * scaleFactor; //  3 * scaleFactor; // Distance from mobster's origin to its feet
    const desiredLift = 0; //1.5; // Additional lift requested by user
    const mobsterHeight = 1.7; // Mobster's actual height
    const floorY = y; // The y position of the floor

    // Calculate the correct initial Y position for the mobster's origin
    // The mobster's origin (0,0,0) is at its waist/center. Its feet are at -3 units in its local Y. 
    // After scaling, its feet are at -mobsterFeetOffset from its origin.
    // We want the feet to be at floorY + desiredLift.
    // So, mobster.position.y - mobsterFeetOffset = floorY + desiredLift
    // mobster.position.y = floorY + desiredLift + mobsterFeetOffset
    const adjustedY = floorY + desiredLift + mobsterFeetOffset;

    const initialPosition = new THREE.Vector3(x, adjustedY, z);
    const mobster = new Mobster(scene, initialPosition, floorIndex, worldObjects);
    enemies.push(mobster);
    // Add individual meshes of the mobster to worldObjects for collision detection
    mobster.getObject().traverse(child => {
        if (child.isMesh) {
            worldObjects.push(child);
        }
    });
    return mobster;
}

// --- Projectile Creation ---
function createProjectile(startPosition, direction, firedByPlayer = false, firer = null) {
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectile.position.copy(startPosition);
    projectile.userData = {
        type: 'projectile',
        velocity: direction.clone().multiplyScalar(ENEMY_SETTINGS.projectileSpeed),
        spawnTime: clock.getElapsedTime(),
        firedByPlayer: firedByPlayer, // Mark who fired the projectile
        firer: firer // Store the entity that fired the projectile
    };
    // console.log(`Projectile created by ${firer ? firer.name + ' (ID: ' + firer.id + ')' : (firedByPlayer ? 'Player' : 'Unknown')}. Projectile ID: ${projectile.id}`);
    scene.add(projectile);
    projectiles.push(projectile);
    worldObjects.push(projectile); // Add to worldObjects for collision detection
}

// --- Lampshade Projectile Shooter ---
function shootLampshade() {
    if (!controls.isLocked) return;
    if (playerInventory.lampshades <= 0) return;

    // Player shoots a lampshade projectile
    const projectileStartOffset = 0.5;
    const projectileDirection = new THREE.Vector3();
    camera.getWorldDirection(projectileDirection);
    const projectileStartPosition = new THREE.Vector3();
    camera.getWorldPosition(projectileStartPosition);
    projectileStartPosition.addScaledVector(projectileDirection, projectileStartOffset);
    projectileStartPosition.y -= 0.2;

    createLampshadeProjectile(projectileStartPosition, projectileDirection, true);
    playerInventory.lampshades--;
    updateUI();
}

// --- Create Lampshade Projectile ---
function createLampshadeProjectile(startPosition, direction, firedByPlayer = false, firer = null) {
    // Use the same geometry/material as a lampshade
    const lampshadeProjectile = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial.clone());
    lampshadeProjectile.scale.set(1.1, 1.1, 1.1); // Slightly larger for fun
    lampshadeProjectile.position.copy(startPosition);
    lampshadeProjectile.userData = {
        type: 'lampshadeProjectile',
        velocity: direction.clone().multiplyScalar(ENEMY_SETTINGS.projectileSpeed * 0.85), // Slightly slower
        spawnTime: clock.getElapsedTime(),
        firedByPlayer: firedByPlayer,
        firer: firer
    };
    lampshadeProjectile.castShadow = true;
    lampshadeProjectile.receiveShadow = true;
    scene.add(lampshadeProjectile);
    projectiles.push(lampshadeProjectile);
    worldObjects.push(lampshadeProjectile);
}

// --- Update Projectiles ---
function updateProjectiles(deltaTime) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        projectile.position.addScaledVector(projectile.userData.velocity, deltaTime);

        let hitEnemy = false;

        // Check for collisions with enemies if fired by player
        if (projectile.userData.firedByPlayer) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                if (!enemy || !enemy.getObject()) continue; // Safety check for valid enemy
                const enemyBox = new THREE.Box3().setFromObject(enemy.getObject());

                let collisionDetected = false;
                // Logic for lampshade projectiles
                if (projectile.userData.type === 'lampshadeProjectile') {
                    const projectileBox = new THREE.Box3().setFromObject(projectile);
                    if (enemyBox.intersectsBox(projectileBox)) {
                        // Insta-kill for lampshade
                        enemy.takeDamage(1000); // Overkill damage to ensure death
                        collisionDetected = true;
                    }
                }
                // Logic for regular projectiles
                else {
                    if (enemyBox.containsPoint(projectile.position)) {
                        enemy.takeDamage(100); // Standard damage
                        collisionDetected = true;
                    }
                }

                if (collisionDetected) {
                    if (enemy.health <= 0) {
                        // Award score based on projectile type
                        playerScore += (projectile.userData.type === 'lampshadeProjectile' ? 150 : 100);
                        updateUI();
                        const playerDirection = new THREE.Vector3();
                        camera.getWorldDirection(playerDirection);
                        enemy.fallAndDisappear(playerDirection);
                        enemies.splice(j, 1);
                    }
                    hitEnemy = true;
                    break; // Projectile hits one enemy and is used up
                }
            }
        }

        // Simplified removal logic for projectiles that hit something or are too old
        if (hitEnemy || (clock.getElapsedTime() - projectile.userData.spawnTime > 5)) {
            scene.remove(projectile);
            const worldIndex = worldObjects.indexOf(projectile);
            if (worldIndex > -1) {
                worldObjects.splice(worldIndex, 1);
            }
            projectiles.splice(i, 1);
        }
    }
}

function updateUI() {
    document.getElementById('score').innerText = `Score: ${playerScore}`;
    document.getElementById('lives').innerText = `Lives: ${playerLives}`;

    // Calculate and display current floor
    if (controls && controls.isLocked) {
        const playerCameraY = controls.getObject().position.y;
        // Assuming playerHeight is the height from feet to camera. // This comment is fine.
        // Floor index is based on the Y position of the player's feet.
        const playerFeetY = playerCameraY - playerHeight;
        const currentFloor = Math.round(playerFeetY / SETTINGS.floorHeight);
        let floorText = `Floor: ${currentFloor}`;
        if (currentFloor === 0) {
            floorText = "Floor: G";
        } else if (currentFloor < 0) {
            floorText = `Floor: B${Math.abs(currentFloor)}`;
        }
        document.getElementById('floorLevel').innerText = floorText;
    }
    const lampshadeCountElement = document.getElementById('lampshadeCount');
    if (lampshadeCountElement) {
        lampshadeCountElement.innerText = `Lampshades: ${playerInventory.lampshades}`;
    } else {
        // console.warn("UI element 'lampshadeCount' not found."); // Optional warning
    }
}



// --- World Generation ---
function generateWorld() {
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbbb }); // Slightly different for testing
    const wallMaterialA = new THREE.MeshStandardMaterial({ color: 0xb0c4c4 }); // Teal tint for A-wing (+Z)
    const wallMaterialB = new THREE.MeshStandardMaterial({ color: 0xc4b8b0 }); // Red-orange tint for B-wing (-Z)
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.5 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    // Make blackDoorMaterial accessible globally or pass it around if needed for interact()
    const textMaterial = new THREE.MeshStandardMaterial({ color: 0xcc9911, metalness: 0.8, roughness: 0.5 });



    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x121111, roughness: 0.3, emissive: 0x010000, emissiveIntensity: 0.01 }); // Added emissive property
    // Add new B-Wing door material: dark navy blue
    const blueElevatorMaterial = new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5 });
    const orangyYellowElevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xFFA500, metalness: 0.7, roughness: 0.4 }); // Orangy Yellow
    const navyDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x002030, roughness: 0.3 });
    const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xaa1111, metalness: 0.8, roughness: 0.5 });
    const lightBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 1 }); // Glowing bulb
    // --- Furniture Materials ---
    const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3 }); // Brown for wood
    const cabinetMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }); // DarkGray for metal
    const safeMaterial = new THREE.MeshStandardMaterial({ color: 0xee1111, }); // Red, metallic safe
    const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.2 }); // Dark metallic dial // Dark metallic dial
    const lawnMaterial = new THREE.MeshStandardMaterial({ color: 0x558B2F, roughness: 0.8 }); // A nice lawn green
    const perimeterWallMaterial = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 }); // Brick/stone color
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.6, roughness: 0.4 }); // Dark metal for gate

    const EscalatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.5 });
    // --- Basement Materials ---
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.8, metalness: 0.1 });
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.7 });
    const basementWallMaterial = new THREE.MeshStandardMaterial({ color: 0x656565, roughness: 0.8 });
    const EscalatorEmbarkMaterial = new THREE.MeshStandardMaterial({ color: 0x332222, metalness: 0.8, roughness: 0.5, emissive: 0x110000, emissiveIntensity: 0.1 }); // Added emissive property
    const garageDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.6, roughness: 0.5 });
    const EscalatorEmbarkMaterialB = new THREE.MeshStandardMaterial({ color: 0xDD8822, metalness: 0.8, roughness: 0.5, emissive: 0x442200, emissiveIntensity: 0.1 }); // Dark Orange for B-Wing

    // Store references globally for use in updatePlayer
    window.EscalatorMaterial = EscalatorMaterial;
    window.EscalatorEmbarkMaterial = EscalatorEmbarkMaterial;
    window.EscalatorEmbarkMaterialB = EscalatorEmbarkMaterialB; // Make B-Wing material global
    // Store blackDoorMaterial globally for use in interact()
    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xadc5d4, // A light blueish grey
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.95, // High transmission for clear glass
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false, // Important for transparency with transmission
        envMapIntensity: 0.5,
        premultipliedAlpha: true
    });
    window.blackDoorMaterial = blackDoorMaterial;

    // New opaque window material for unactivated rooms
    const opaqueGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x50aaaa, // A light blueish grey
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.95, // High transmission for clear glass
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false, // Important for transparency with transmission
        envMapIntensity: 0.5,
        premultipliedAlpha: true
    });

    // Walls & Doors
    const wallDepth = 0.1;
    const doorOffset = (SETTINGS.corridorSegmentLength - SETTINGS.doorWidth) / 2;

    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (loadedFont) {

        const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length


        // --- Elevator Configuration (for the single elevator in this setup) ---
        currentElevatorConfig = {
            id: "mainElevator",
            x: SETTINGS.corridorWidth / 2, // Center X of the shaft
            z: -SETTINGS.elevatorSize / 2 - 4, // Center Z of the shaft
            shaftWidth: SETTINGS.corridorWidth,     // Width of the shaft opening
            shaftDepth: SETTINGS.elevatorSize,      // Depth of the shaft
            minFloorIndex: 0, // -SETTINGS.numBasementFloors,
            maxFloorIndex: SETTINGS.numFloors, // Roof access is effectively maxFloorIndex + 1
            startFloorIndex: SETTINGS.numFloors, // Start on the roof level
            platformMaterial: elevatorMaterial,
            shaftMaterial: concreteMaterial, // Material for shaft ceiling and pit
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(currentElevatorConfig); // Create the first elevator instance



        // --- Create a second elevator ---
        const secondElevatorConfig = {
            id: "secondElevator",
            x: currentElevatorConfig.x - 4, // Shifted 4 units in negative X
            z: currentElevatorConfig.z,     // Same Z
            shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
            shaftDepth: currentElevatorConfig.shaftDepth,
            minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
            maxFloorIndex: SETTINGS.numFloors - 1, // //currentElevatorConfig.maxFloorIndex,
            startFloorIndex: 0, // Start at ground floor
            platformMaterial: elevatorMaterial, // new THREE.MeshStandardMaterial({ color: 0x11aa11, metalness: 0.8, roughness: 0.5  }), // Different color
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(secondElevatorConfig); // Create the second elevator instance

        // --- Create a third elevator ---
        const thirdElevatorConfig = {
            id: "thirdElevator",
            x: currentElevatorConfig.x + 4, // Shifted 4 units in positive X from the first
            z: currentElevatorConfig.z,     // Same Z
            shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
            shaftDepth: currentElevatorConfig.shaftDepth,
            minFloorIndex: -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
            maxFloorIndex: 0, // SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
            startFloorIndex: 0, // Start at ground floor
            platformMaterial: orangyYellowElevatorMaterial,
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(thirdElevatorConfig); // Create the third elevator instance

        // --- Create a fourth elevator ---
        const fourthElevatorConfig = {
            id: "fouthElevator",
            x: currentElevatorConfig.x, // Center X of the shaft
            z: currentElevatorConfig.z - 4,     // Shifted 4 units in positive X from the first
            shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
            shaftDepth: currentElevatorConfig.shaftDepth,
            minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
            maxFloorIndex: SETTINGS.numFloors - 1, // //currentElevatorConfig.maxFloorIndex,
            startFloorIndex: 2, // Start at ground floor
            platformMaterial: blueElevatorMaterial,
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(fourthElevatorConfig); // Create the fourth elevator instance

        // --- Create a fifth elevator ---
        const fifthElevatorConfig = {
            id: "fifthElevator",
            x: currentElevatorConfig.x - 4, // Shifted 4 units in negative X
            z: currentElevatorConfig.z - 4,     // Shifted 4 units in positive X from the first
            shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
            shaftDepth: currentElevatorConfig.shaftDepth,
            minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
            maxFloorIndex: 2, //  SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
            startFloorIndex: 0, // Start at ground floor
            platformMaterial: blueElevatorMaterial,
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(fifthElevatorConfig); // Create the fourth elevator instance


        // --- Create a sixth elevator ---
        const sixthElevatorConfig = {
            id: "sixthElevator",
            x: currentElevatorConfig.x + 4, // Shifted 4 units in positive X from the first
            z: currentElevatorConfig.z - 4,     // Shifted 4 units in positive X from the first
            shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
            shaftDepth: currentElevatorConfig.shaftDepth,
            minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
            maxFloorIndex: 2, //  SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
            startFloorIndex: 0, // Start at ground floor
            platformMaterial: blueElevatorMaterial,
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsRef: worldObjects
        };
        createElevator(sixthElevatorConfig); // Create the fourth elevator instance



        // --- Define Overall Elevator Shaft Dimensions for a 3-elevator bank ---
        const single_shaftX_center = currentElevatorConfig.x;
        const single_shaft_width = currentElevatorConfig.shaftWidth; // Width of one elevator shaft
        const single_shaft_depth = currentElevatorConfig.shaftDepth;
        const single_shaft_z_center = currentElevatorConfig.z;

        // Overall X dimensions for the 3-elevator bank
        // Assumes middle elevator is at single_shaftX_center,
        // side elevators are +/- 4 units away (center to center)
        const overallShaftMinX = (single_shaftX_center - 4) - (single_shaft_width / 2);
        const overallShaftMaxX = (single_shaftX_center + 4) + (single_shaft_width / 2);
        const overallShaftActualWidth = overallShaftMaxX - overallShaftMinX;
        const overallShaftActualCenterX = (overallShaftMinX + overallShaftMaxX) / 2; // Should still be single_shaftX_center

        // Overall Z dimensions (assuming all elevators aligned in Z)
        const overallShaftMinZ = single_shaft_z_center - single_shaft_depth / 2;
        const overallShaftMaxZ = single_shaft_z_center + single_shaft_depth / 2;
        const overallShaftActualDepth = single_shaft_depth;
        const overallShaftActualCenterZ = single_shaft_z_center;

        // Recalculate buildingWidth to ensure it covers the new wider shaft
        const buildingWidth = Math.max(SETTINGS.corridorWidth + (2 * roomSize), overallShaftActualWidth);

        // --- Lawn, Perimeter Wall, and Gate ---
        const lawnBorderWidth = 20.0; // How much the lawn extends beyond the building
        const buildingBaseY = -0.05; // Top surface of the lawn, consistent with old ground

        // Approximate building footprint for lawn calculation (using potentially new buildingWidth)
        const buildingMinX = overallShaftActualCenterX - buildingWidth / 2; // Centered with the building/shaft
        const buildingMaxX = overallShaftActualCenterX + buildingWidth / 2;
        const buildingMinZ_footprint = -(2 * SETTINGS.elevatorSize) - totalCorridorLength - SETTINGS.escalatorLength - 8; // Building front edge. Shaft is now behind this if elevatorSize > 0.
        const buildingMaxZ_footprint = totalCorridorLength + SETTINGS.escalatorLength + 8; // Far end of escalator area

        const lawnMinX = buildingMinX - lawnBorderWidth;
        const lawnMaxX = buildingMaxX + lawnBorderWidth;
        const lawnMinZ = buildingMinZ_footprint - lawnBorderWidth;
        const lawnMaxZ = buildingMaxZ_footprint + lawnBorderWidth;

        const lawnWidth = lawnMaxX - lawnMinX;
        const lawnDepth = lawnMaxZ - lawnMinZ;
        const lawnCenterX = (lawnMinX + lawnMaxX) / 2;
        const lawnCenterZ = (lawnMinZ + lawnMaxZ) / 2;
        const lawnThickness = 0.1;

        // --- Lawn Generation with Hole for Elevator Shaft ---
        const lawnPanels = [];
        // Panel A (West of shaft)
        if (overallShaftMinX > lawnMinX) {
            const panelA_width = overallShaftMinX - lawnMinX;
            const panelA_geo = new THREE.BoxGeometry(panelA_width, lawnThickness, lawnDepth);
            const panelA = new THREE.Mesh(panelA_geo, lawnMaterial);
            panelA.position.set((lawnMinX + overallShaftMinX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
            panelA.name = "LawnPanel_A"; lawnPanels.push(panelA);
        }
        // Panel B (East of shaft)
        if (overallShaftMaxX < lawnMaxX) {
            const panelB_width = lawnMaxX - overallShaftMaxX;
            const panelB_geo = new THREE.BoxGeometry(panelB_width, lawnThickness, lawnDepth);
            const panelB = new THREE.Mesh(panelB_geo, lawnMaterial);
            panelB.position.set((overallShaftMaxX + lawnMaxX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
            panelB.name = "LawnPanel_B"; lawnPanels.push(panelB);
        }
        // Panel C (North of shaft, within shaft's X-span)
        if (overallShaftMaxZ < lawnMaxZ) {
            const panelC_depth = lawnMaxZ - overallShaftMaxZ;
            const panelC_geo = new THREE.BoxGeometry(overallShaftActualWidth, lawnThickness, panelC_depth);
            const panelC = new THREE.Mesh(panelC_geo, lawnMaterial);
            panelC.position.set(overallShaftActualCenterX, buildingBaseY - lawnThickness / 2, (overallShaftMaxZ + lawnMaxZ) / 2);
            panelC.name = "LawnPanel_C"; lawnPanels.push(panelC);
        }
        // Panel D (South of shaft, within shaft's X-span)
        if (overallShaftMinZ > lawnMinZ) {
            const panelD_depth = overallShaftMinZ - lawnMinZ;
            const panelD_geo = new THREE.BoxGeometry(overallShaftActualWidth, lawnThickness, panelD_depth);
            const panelD = new THREE.Mesh(panelD_geo, lawnMaterial);
            panelD.position.set(overallShaftActualCenterX, buildingBaseY - lawnThickness / 2, (lawnMinZ + overallShaftMinZ) / 2);
            panelD.name = "LawnPanel_D"; lawnPanels.push(panelD);
        }

        lawnPanels.forEach(panel => {
            panel.receiveShadow = true;
            scene.add(panel);
            worldObjects.push(panel);
        });

        // const lawnGeo = new THREE.BoxGeometry(lawnWidth, lawnThickness, lawnDepth);
        // const lawn = new THREE.Mesh(lawnGeo, lawnMaterial);
        // lawn.position.set(lawnCenterX, buildingBaseY - lawnThickness / 2, lawnCenterZ);
        // lawn.receiveShadow = true;
        // lawn.name = "Lawn";
        // scene.add(lawn);
        // worldObjects.push(lawn);

        // Perimeter Wall parameters
        const perimeterWallHeight = 2.5;
        const perimeterWallThickness = 0.5;
        const perimeterWallY = buildingBaseY + perimeterWallHeight / 2;

        // Gate parameters
        const gateWidth = 4.0;
        const gateGap = 0.1; // gateWidth + 0.2; // Total opening for the gate
        const gateHeight = perimeterWallHeight - 0.3; // Slightly shorter than wall
        const gateDoorThickness = 0.2;

        // Wall 1: Front wall (at lawnMinZ) - with gate opening
        const frontWallSegmentLength = (lawnWidth - gateGap) / 2;
        if (frontWallSegmentLength > 0) {
            const wall1aGeo = new THREE.BoxGeometry(frontWallSegmentLength, perimeterWallHeight, perimeterWallThickness);
            const wall1a = new THREE.Mesh(wall1aGeo, perimeterWallMaterial);
            wall1a.position.set(lawnMinX + frontWallSegmentLength / 2, perimeterWallY, lawnMinZ + perimeterWallThickness / 2);
            wall1a.name = "PerimeterWall_FrontLeft";
            wall1a.castShadow = true; wall1a.receiveShadow = true; scene.add(wall1a); worldObjects.push(wall1a);

            const wall1bGeo = new THREE.BoxGeometry(frontWallSegmentLength, perimeterWallHeight, perimeterWallThickness);
            const wall1b = new THREE.Mesh(wall1bGeo, perimeterWallMaterial);
            wall1b.position.set(lawnMaxX - frontWallSegmentLength / 2, perimeterWallY, lawnMinZ + perimeterWallThickness / 2);
            wall1b.name = "PerimeterWall_FrontRight";
            wall1b.castShadow = true; wall1b.receiveShadow = true; scene.add(wall1b); worldObjects.push(wall1b);
        }

        // Wall 2: Back wall (at lawnMaxZ)
        const wall2Geo = new THREE.BoxGeometry(lawnWidth, perimeterWallHeight, perimeterWallThickness);
        const wall2 = new THREE.Mesh(wall2Geo, perimeterWallMaterial);
        wall2.position.set(lawnCenterX, perimeterWallY, lawnMaxZ - perimeterWallThickness / 2);
        wall2.name = "PerimeterWall_Back";
        wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);

        // Wall 3: Left wall (at lawnMinX)
        const sideWallLength = lawnDepth - (2 * perimeterWallThickness); // Adjust to fit between front/back walls
        const wall3Geo = new THREE.BoxGeometry(perimeterWallThickness, perimeterWallHeight, sideWallLength);
        const wall3 = new THREE.Mesh(wall3Geo, perimeterWallMaterial);
        wall3.position.set(lawnMinX + perimeterWallThickness / 2, perimeterWallY, lawnCenterZ);
        wall3.name = "PerimeterWall_Left";
        wall3.castShadow = true; wall3.receiveShadow = true; scene.add(wall3); worldObjects.push(wall3);

        // Wall 4: Right wall (at lawnMaxX)
        const wall4Geo = new THREE.BoxGeometry(perimeterWallThickness, perimeterWallHeight, sideWallLength);
        const wall4 = new THREE.Mesh(wall4Geo, perimeterWallMaterial);
        wall4.position.set(lawnMaxX - perimeterWallThickness / 2, perimeterWallY, lawnCenterZ);
        wall4.name = "PerimeterWall_Right";
        wall4.castShadow = true; wall4.receiveShadow = true; scene.add(wall4); worldObjects.push(wall4);

        // Gate Doors (simple swinging doors)
        const gateDoorWidth = gateWidth / 2;
        const gateDoorGeo = new THREE.BoxGeometry(gateDoorWidth, gateHeight, gateDoorThickness);

        // Left Gate Door
        const leftGateDoor = new THREE.Mesh(gateDoorGeo, gateMaterial);
        // Position pivot at the edge of the gap
        leftGateDoor.geometry.translate(gateDoorWidth / 2, 0, 0); // Shift geometry so rotation is around one edge
        leftGateDoor.position.set(lawnCenterX - gateGap / 2, buildingBaseY + gateHeight / 2, lawnMinZ + perimeterWallThickness / 2);
        leftGateDoor.name = "Gate_LeftDoor";
        leftGateDoor.castShadow = true; leftGateDoor.receiveShadow = true;
        // leftGateDoor.rotation.y = -Math.PI / 4; // Example: open
        scene.add(leftGateDoor);
        worldObjects.push(leftGateDoor);
        // Add to doors array if you want to interact with it like other doors
        // doors.push({ object: leftGateDoor, userData: { type: 'gateDoor', isOpen: false, locked: false } });

        // Right Gate Door
        const rightGateDoor = new THREE.Mesh(gateDoorGeo, gateMaterial);
        rightGateDoor.geometry.translate(-gateDoorWidth / 2, 0, 0); // Shift geometry for right-side pivot
        rightGateDoor.position.set(lawnCenterX + gateGap / 2, buildingBaseY + gateHeight / 2, lawnMinZ + perimeterWallThickness / 2);
        rightGateDoor.name = "Gate_RightDoor";
        rightGateDoor.castShadow = true; rightGateDoor.receiveShadow = true;
        // rightGateDoor.rotation.y = Math.PI / 4; // Example: open
        scene.add(rightGateDoor);
        worldObjects.push(rightGateDoor);
        // doors.push({ object: rightGateDoor, userData: { type: 'gateDoor', isOpen: false, locked: false } });

        // Escalator Floor Plane (replace PlaneGeometry with BoxGeometry)
        const floorEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), floorDepth, escalatorLength + 4);
        const floorEsc = new THREE.Mesh(floorEscGeo, floorMaterial);
        floorEsc.name = `Floor Escalator`;
        floorEsc.position.set(
            SETTINGS.corridorWidth / 2,
            -floorDepth / 2, // So the top is at y=0
            totalCorridorLength + (escalatorLength / 2) + 2 // Centered in the corridor
        );
        floorEsc.receiveShadow = true;
        scene.add(floorEsc);
        worldObjects.push(floorEsc);

        // Escalator B Floor Plane (replace PlaneGeometry with BoxGeometry)
        const floorEscBGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), floorDepth, escalatorLength + 4);
        const floorEscB = new THREE.Mesh(floorEscBGeo, floorMaterial);
        floorEscB.name = `Floor B Escalator`;
        floorEscB.position.set(
            SETTINGS.corridorWidth / 2,
            -floorDepth / 2, // So the top is at y=0
            -16 - (totalCorridorLength + (escalatorLength / 2) + 2)// Centered in the corridor
        );
        floorEscB.receiveShadow = true;
        scene.add(floorEscB);
        worldObjects.push(floorEscB);



        // Roof Plane
        const roofGeo = new THREE.BoxGeometry(buildingWidth, floorDepth / 2, 4 + totalCorridorLength + escalatorLength + 8);
        const roof = new THREE.Mesh(roofGeo, floorMaterial);
        roof.name = `Roof`;
        // roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2)); // Old
        roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 4, 2 + ((totalCorridorLength + escalatorLength) / 2));
        roof.receiveShadow = true;
        scene.add(roof);
        worldObjects.push(roof);

        // Roof B Plane
        const roofBGeo = new THREE.BoxGeometry(buildingWidth, floorDepth, 4 + 4 + totalCorridorLength + escalatorLength + 8);
        const roofB = new THREE.Mesh(roofBGeo, floorMaterial);
        roofB.name = `Roof B`;
        // roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2)); // Old
        roofB.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 2, 2 - 16 - (2 + ((totalCorridorLength + escalatorLength) / 2)));
        roofB.receiveShadow = true;
        scene.add(roofB);
        worldObjects.push(roofB);

        //  roof over Left escalator
        const roofEscLGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, 4);
        const roofEscL = new THREE.Mesh(roofEscLGeo, floorMaterial);
        roofEscL.name = `Left Escalator Roof`;
        roofEscL.position.set(
            SETTINGS.corridorWidth + (SETTINGS.roomSize / 2),
            (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 2, // So the top is at the roof level        
            - 4 - 2// Centered 
        );
        roofEscL.receiveShadow = true;
        scene.add(roofEscL);
        worldObjects.push(roofEscL);

        //  roof over Right escalator
        const roofEscRGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, 4);
        const roofEscR = new THREE.Mesh(roofEscRGeo, floorMaterial);
        roofEscR.name = `Right Escalator Roof`;
        roofEscR.position.set(
            - (SETTINGS.roomSize / 2),
            (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 2, // So the top is at the roof level
            - 4 - 2// Centered
        );
        roofEscR.receiveShadow = true;
        scene.add(roofEscR);
        worldObjects.push(roofEscR);


        // --- Walls for Elevator Penthouse on the Roof ---
        // These walls surround the top part of the elevator shaft that protrudes above the main roof.
        // The individual elevatorObj.shaftCeiling(s) are the roofs *inside* this penthouse.
        const mainRoofSurfaceY = currentElevatorConfig.maxFloorIndex * SETTINGS.floorHeight;
        // Use the Y of the first (middle) elevator's shaft ceiling as reference for penthouse height
        const shaftCeilingBottomY = elevators.find(e => e.id === "mainElevator").shaftCeiling.position.y - floorDepth / 2;
        const penthouseWallHeight = Math.max(0.1, shaftCeilingBottomY - mainRoofSurfaceY);
        const penthouseWallCenterY = mainRoofSurfaceY + penthouseWallHeight / 2;

        // Penthouse Wall Left (Player's Right when facing +Z)
        const penthouseWallLeftGeo = new THREE.BoxGeometry(2 * wallDepth, penthouseWallHeight + floorDepth, overallShaftActualDepth);
        const penthouseWallLeft = new THREE.Mesh(penthouseWallLeftGeo, wallMaterial);
        penthouseWallLeft.name = `ElevatorPenthouseWall_Left`;
        penthouseWallLeft.position.set(
        /* overallShaftMinX */ - wallDepth, // Adjusted
            penthouseWallCenterY,
            overallShaftActualCenterZ
        );
        penthouseWallLeft.castShadow = true; penthouseWallLeft.receiveShadow = true;
        scene.add(penthouseWallLeft); worldObjects.push(penthouseWallLeft);

        // Penthouse Wall Right (Player's Left when facing +Z)
        const penthouseWallRightGeo = new THREE.BoxGeometry(wallDepth * 2, penthouseWallHeight + floorDepth, overallShaftActualDepth);
        const penthouseWallRight = new THREE.Mesh(penthouseWallRightGeo, wallMaterial);
        penthouseWallRight.name = `ElevatorPenthouseWall_Right`;
        penthouseWallRight.position.set(
        /* overallShaftMaxX */ SETTINGS.elevatorSize + wallDepth, // Adjusted
            penthouseWallCenterY,
            overallShaftActualCenterZ
        );
        penthouseWallRight.castShadow = true; penthouseWallRight.receiveShadow = true;
        scene.add(penthouseWallRight); worldObjects.push(penthouseWallRight);



        // --- Floodlight on Elevator Shaft Roof ---
        const floodlightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
        const floodlightLensMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 0.5 }); // Slightly glowing lens

        const floodlightHousingGeo = new THREE.BoxGeometry(0.8, 0.4, 0.4); // width, height, depth
        const floodlightHousing = new THREE.Mesh(floodlightHousingGeo, floodlightHousingMaterial);

        const floodlightLensGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.1, 16); // radiusTop, radiusBottom, height, segments
        const floodlightLens = new THREE.Mesh(floodlightLensGeo, floodlightLensMaterial);
        floodlightLens.rotation.x = Math.PI / 2;
        floodlightLens.position.z = 0.2; // Position at the front of the housing

        const floodlightAssembly = new THREE.Group();
        floodlightAssembly.add(floodlightHousing);
        floodlightAssembly.add(floodlightLens);

        // Position the floodlight assembly on top of the 'Top Roof over Elevator'
        // Use the middle elevator's shaft ceiling for floodlight positioning
        const middleElevatorShaftCeiling = elevators.find(e => e.id === "mainElevator").shaftCeiling;
        const shaftCeilingSurfaceY = middleElevatorShaftCeiling.position.y + floorDepth / 2;
        floodlightAssembly.position.set(
            middleElevatorShaftCeiling.position.x, // Centered on X of middle elevator's ceiling
            shaftCeilingSurfaceY + 0.2, // Housing height/2 = 0.4/2 = 0.2
            middleElevatorShaftCeiling.position.z + (overallShaftActualDepth / 2) - 0.3 // Near the edge facing the main roof
        );
        scene.add(floodlightAssembly);

        const rooftopSpotLight = new THREE.SpotLight(0xffffff, 20, 200, Math.PI / 3, 1, 1.5); // color, intensity, distance, angle, penumbra, decay
        rooftopSpotLight.position.copy(floodlightAssembly.position);
        rooftopSpotLight.position.z += 0.2; // Emitter slightly in front of housing
        // Target the center of the main roof area
        // const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength; // Already defined
        const mainRoofCenterY = (SETTINGS.numFloors) * SETTINGS.floorHeight;
        const mainRoofCenterZ = 4 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2);
        rooftopSpotLight.target.position.set(SETTINGS.corridorWidth / 2, mainRoofCenterY, mainRoofCenterZ);

        rooftopSpotLight.castShadow = true;
        rooftopSpotLight.shadow.mapSize.width = 1024;
        rooftopSpotLight.shadow.mapSize.height = 1024;
        rooftopSpotLight.shadow.camera.near = 1;
        rooftopSpotLight.shadow.camera.far = 200;
        rooftopSpotLight.shadow.focus = 1; // Softer shadows

        scene.add(rooftopSpotLight);
        scene.add(rooftopSpotLight.target); // Important: add the target to the scene as well

        // RoofTop B-Wing Spot Light
        // --- Floodlight on Elevator Shaft Roof ---
        //const floodlightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
        //const floodlightLensMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 0.5 }); // Slightly glowing lens

        const floodlightHousingGeoB = new THREE.BoxGeometry(0.8, 0.4, 0.4); // width, height, depth
        const floodlightHousingB = new THREE.Mesh(floodlightHousingGeoB, floodlightHousingMaterial);

        const floodlightLensGeoB = new THREE.CylinderGeometry(0.15, 0.18, 0.1, 16); // radiusTop, radiusBottom, height, segments
        const floodlightLensB = new THREE.Mesh(floodlightLensGeoB, floodlightLensMaterial);
        floodlightLensB.rotation.x = Math.PI / 2;
        floodlightLensB.position.z = -0.2; // Position at the front of the housing

        const floodlightAssemblyB = new THREE.Group();
        floodlightAssemblyB.add(floodlightHousingB);
        floodlightAssemblyB.add(floodlightLensB);

        floodlightAssemblyB.name = "FloodlightAssembly_B";

        // Position the floodlight assembly on top of the 'Top Roof over Elevator'
        // Use the middle elevator's shaft ceiling for floodlight positioning
        //const middleElevatorShaftCeiling = elevators.find(e => e.id === "mainElevator").shaftCeiling;
        //const shaftCeilingSurfaceY = middleElevatorShaftCeiling.position.y + floorDepth / 2;
        floodlightAssemblyB.position.set(
            middleElevatorShaftCeiling.position.x, // Centered on X of middle elevator's ceiling
            shaftCeilingSurfaceY + 0.2, // Housing height/2 = 0.4/2 = 0.2
            middleElevatorShaftCeiling.position.z - (overallShaftActualDepth / 2) + 0.3 // Near the edge facing the main roof
        );
        scene.add(floodlightAssemblyB);

        const rooftopSpotLightB = new THREE.SpotLight(0xffffff, 20, 200, Math.PI / 3, 1, 1.5); // color, intensity, distance, angle, penumbra, decay
        rooftopSpotLightB.position.copy(floodlightAssemblyB.position);
        rooftopSpotLightB.position.z -= 0.2; // Emitter slightly in front of housing
        // Target the center of the main roof area
        // const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength; // Already defined
        //const mainRoofCenterY = (SETTINGS.numFloors) * SETTINGS.floorHeight;
        const mainRoofCenterZB = -8 - 4 - ((totalCorridorLength + SETTINGS.escalatorLength) / 2);
        rooftopSpotLightB.target.position.set(SETTINGS.corridorWidth / 2, mainRoofCenterY, mainRoofCenterZB);

        rooftopSpotLightB.castShadow = true;
        rooftopSpotLightB.shadow.mapSize.width = 1024;
        rooftopSpotLightB.shadow.mapSize.height = 1024;
        rooftopSpotLightB.shadow.camera.near = 1;
        rooftopSpotLightB.shadow.camera.far = 200;
        rooftopSpotLightB.shadow.focus = 1; // Softer shadows

        scene.add(rooftopSpotLightB);
        scene.add(rooftopSpotLightB.target); // Important: add the target to the scene as well

        //End RoofTop B-Wing Spot Light


        // --- Rooftop Perimeter Walls ---
        const rooftopWallHeight = 1.0; // Low walls
        const rooftopWallThickness = 0.5; // Wide walls
        const rooftopWallMaterial = wallMaterial.clone();
        rooftopWallMaterial.color.set(0x777777); // Different color for rooftop walls to avoid z-fighting

        const roofActualWidth = buildingWidth; // Use the potentially wider buildingWidth
        const roofActualDepth = totalCorridorLength + SETTINGS.escalatorLength + 12;
        const roofActualCenterX = overallShaftActualCenterX; // Center roof with the shaft/building
        const roofActualCenterZ = 2 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2); // Z center remains the same
        const roofActualCenterZB = -16 - (2 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2)); // Z center remains the same
        const roofTopSurfaceY = (SETTINGS.numFloors) * SETTINGS.floorHeight; // Top Y of the main roof slab

        const wallYPos = roofTopSurfaceY + rooftopWallHeight / 2; // Position walls to sit ON the roof surface

        // Wall 1: Far Z (Positive Z end of the roof)
        const wallFarZGeo = new THREE.BoxGeometry(roofActualWidth, rooftopWallHeight, rooftopWallThickness);
        const wallFarZ = new THREE.Mesh(wallFarZGeo, rooftopWallMaterial);
        wallFarZ.position.set(roofActualCenterX, wallYPos, roofActualCenterZ + roofActualDepth / 2 - rooftopWallThickness / 2);
        wallFarZ.name = "RooftopWall_FarZ";
        wallFarZ.castShadow = true; wallFarZ.receiveShadow = true; wallFarZ.geometry.computeBoundingBox();
        scene.add(wallFarZ); worldObjects.push(wallFarZ);

        // Wall 1B: Far Z (Nagative Z end of the roof)
        const wallFarZBGeo = new THREE.BoxGeometry(roofActualWidth, rooftopWallHeight, rooftopWallThickness);
        const wallFarZB = new THREE.Mesh(wallFarZBGeo, rooftopWallMaterial);
        wallFarZB.position.set(roofActualCenterX, wallYPos, roofActualCenterZB - roofActualDepth / 2 + rooftopWallThickness / 2);
        wallFarZB.name = "RooftopWall_B_FarZ";
        wallFarZB.castShadow = true; wallFarZB.receiveShadow = true; wallFarZB.geometry.computeBoundingBox();
        scene.add(wallFarZB); worldObjects.push(wallFarZB);

        // Wall 2: Near Z (Negative Z end of the roof), with opening for elevator
        // Elevator opening X: from 0 to SETTINGS.corridorWidth. Roof X spans from -SETTINGS.roomSize to SETTINGS.corridorWidth + SETTINGS.roomSize
        // const nearWallZPos = roofActualCenterZ - roofActualDepth / 2 + rooftopWallThickness / 2;



        // Wall 3: Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
        const wallSideLeftGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 2);
        const wallSideLeft = new THREE.Mesh(wallSideLeftGeo, rooftopWallMaterial);
        wallSideLeft.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, roofActualCenterZ - 1);
        wallSideLeft.name = "RooftopWall_SideLeft";
        wallSideLeft.castShadow = true; wallSideLeft.receiveShadow = true; wallSideLeft.geometry.computeBoundingBox();
        scene.add(wallSideLeft); worldObjects.push(wallSideLeft);

        // Wall 3B : Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
        const wallSideLeftBGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 6);
        const wallSideLeftB = new THREE.Mesh(wallSideLeftBGeo, rooftopWallMaterial);
        wallSideLeftB.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, -16 - roofActualCenterZ + 3);
        wallSideLeftB.name = "RooftopWall_B_SideLeft";
        wallSideLeftB.castShadow = true; wallSideLeftB.receiveShadow = true; wallSideLeftB.geometry.computeBoundingBox();
        scene.add(wallSideLeftB); worldObjects.push(wallSideLeftB);


        // Wall 4: Side X (Positive X side of roof, at X = SETTINGS.corridorWidth + SETTINGS.roomSize)
        const wallSideRightGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 2);
        const wallSideRight = new THREE.Mesh(wallSideRightGeo, rooftopWallMaterial);
        wallSideRight.position.set(roofActualCenterX + roofActualWidth / 2 - rooftopWallThickness / 2, wallYPos, roofActualCenterZ - 1);
        wallSideRight.name = "RooftopWall_SideRight";
        wallSideRight.castShadow = true; wallSideRight.receiveShadow = true; wallSideRight.geometry.computeBoundingBox();
        scene.add(wallSideRight); worldObjects.push(wallSideRight);

        // Wall 4B : Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
        const wallSideRightBGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 6);
        const wallSideRightB = new THREE.Mesh(wallSideRightBGeo, rooftopWallMaterial);
        wallSideRightB.position.set(roofActualCenterX + roofActualWidth / 2 - rooftopWallThickness / 2, wallYPos, -16 - roofActualCenterZ + 3);
        wallSideRightB.name = "RooftopWall_B_SideRight";
        wallSideRightB.castShadow = true; wallSideRightB.receiveShadow = true; wallSideRightB.geometry.computeBoundingBox();
        scene.add(wallSideRightB); worldObjects.push(wallSideRightB);




        // --- Define Building Footprint for Basement ---
        // Use overall shaft/building dimensions for basement footprint
        const basementMinX = overallShaftActualCenterX - buildingWidth / 2;
        const basementMaxX = overallShaftActualCenterX + buildingWidth / 2;
        const basementWidth = buildingWidth; // Use the potentially wider buildingWidth
        const basementCenterX = overallShaftActualCenterX;

        const basementMinZ = -SETTINGS.elevatorSize; // Front of building at elevator
        const basementMaxZ = totalCorridorLength + 4 + SETTINGS.escalatorLength + 4; // Back of building
        const basementDepth = basementMaxZ - basementMinZ;
        const basementCenterZ = (basementMinZ + basementMaxZ) / 2;


        // Floor levels
        // Loop from the lowest basement floor up to the highest above-ground floor
        for (let i = -SETTINGS.numBasementFloors; i < SETTINGS.numFloors; i++) {
            const floorY = i * SETTINGS.floorHeight;
            const redDoorIndex = Math.floor(Math.random() * SETTINGS.doorsPerSide * 4);
            let currentDoorIndex = 0;

            if (i < 0) { // --- Basement Floor Generation ---
                const basementFloorPanels = [];
                const basementCeilingPanels = [];
                const floorPanelY = floorY - floorDepth / 2; // Y for top surface of floor slab
                const ceilingPanelY = floorY + SETTINGS.wallHeight - (floorDepth / 4); // Y for top surface of ceiling slab



                const connectorBasementCeilingGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, 4); // Adjusted width
                const connectorBasementCeiling = new THREE.Mesh(connectorBasementCeilingGeo, concreteMaterial);
                connectorBasementCeiling.position.set(overallShaftActualCenterX, ceilingPanelY, -2); // Adjusted X
                connectorBasementCeiling.name = `BasementConnectorCeiling_F${i}`;
                scene.add(connectorBasementCeiling); worldObjects.push(connectorBasementCeiling);

                // Panel A (West of shaft)
                if (overallShaftMinX > basementMinX) {
                    const panelA_width = overallShaftMinX - basementMinX;
                    const panelA_floor_geo = new THREE.BoxGeometry(panelA_width, floorDepth, basementDepth);
                    const panelA_floor = new THREE.Mesh(panelA_floor_geo, concreteMaterial);
                    panelA_floor.position.set((basementMinX + overallShaftMinX) / 2, floorPanelY, basementCenterZ);
                    panelA_floor.name = `BasementFloorPanel_A_F${i}`; basementFloorPanels.push(panelA_floor);

                    const panelA_ceil_geo = new THREE.BoxGeometry(panelA_width, floorDepth / 2, basementDepth);
                    const panelA_ceil = new THREE.Mesh(panelA_ceil_geo, concreteMaterial);
                    panelA_ceil.position.set((basementMinX + overallShaftMinX) / 2, ceilingPanelY, basementCenterZ);
                    panelA_ceil.name = `BasementCeilingPanel_A_F${i}`; basementCeilingPanels.push(panelA_ceil);
                }
                // Panel B (East of shaft)
                if (overallShaftMaxX < basementMaxX) {
                    const panelB_width = basementMaxX - overallShaftMaxX;
                    const panelB_floor_geo = new THREE.BoxGeometry(panelB_width, floorDepth, basementDepth);
                    const panelB_floor = new THREE.Mesh(panelB_floor_geo, concreteMaterial);
                    panelB_floor.position.set((overallShaftMaxX + basementMaxX) / 2, floorPanelY, basementCenterZ);
                    panelB_floor.name = `BasementFloorPanel_B_F${i}`; basementFloorPanels.push(panelB_floor);

                    const panelB_ceil_geo = new THREE.BoxGeometry(panelB_width, floorDepth / 2, basementDepth);
                    const panelB_ceil = new THREE.Mesh(panelB_ceil_geo, concreteMaterial);
                    panelB_ceil.position.set((overallShaftMaxX + basementMaxX) / 2, ceilingPanelY, basementCenterZ);
                    panelB_ceil.name = `BasementCeilingPanel_B_F${i}`; basementCeilingPanels.push(panelB_ceil);
                }
                // Panel C (North of shaft, within shaft's X-span)
                if (overallShaftMaxZ < basementMaxZ) {
                    const panelC_depth = basementMaxZ - overallShaftMaxZ;
                    const panelC_floor_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, panelC_depth);
                    const panelC_floor = new THREE.Mesh(panelC_floor_geo, concreteMaterial);
                    panelC_floor.position.set(overallShaftActualCenterX, floorPanelY, (overallShaftMaxZ + basementMaxZ) / 2);
                    panelC_floor.name = `BasementFloorPanel_C_F${i}`; basementFloorPanels.push(panelC_floor);

                    const panelC_ceil_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, panelC_depth);
                    const panelC_ceil = new THREE.Mesh(panelC_ceil_geo, concreteMaterial);
                    panelC_ceil.position.set(overallShaftActualCenterX, ceilingPanelY, (overallShaftMaxZ + basementMaxZ) / 2);
                    panelC_ceil.name = `BasementCeilingPanel_C_F${i}`; basementCeilingPanels.push(panelC_ceil);
                }
                // Panel D (South of shaft, within shaft's X-span)
                if (overallShaftMinZ > basementMinZ) {
                    const panelD_depth = overallShaftMinZ - basementMinZ;
                    const panelD_floor_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, panelD_depth);
                    const panelD_floor = new THREE.Mesh(panelD_floor_geo, concreteMaterial);
                    panelD_floor.position.set(overallShaftActualCenterX, floorPanelY, (basementMinZ + overallShaftMinZ) / 2);
                    panelD_floor.name = `BasementFloorPanel_D_F${i}`; basementFloorPanels.push(panelD_floor);

                    const panelD_ceil_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, panelD_depth);
                    const panelD_ceil = new THREE.Mesh(panelD_ceil_geo, concreteMaterial);
                    panelD_ceil.position.set(overallShaftActualCenterX, ceilingPanelY, (basementMinZ + overallShaftMinZ) / 2);
                    panelD_ceil.name = `BasementCeilingPanel_D_F${i}`; basementCeilingPanels.push(panelD_ceil);
                }

                basementFloorPanels.forEach(panel => {
                    panel.receiveShadow = true;
                    scene.add(panel);
                    worldObjects.push(panel);
                });
                basementCeilingPanels.forEach(panel => {
                    panel.castShadow = true;
                    scene.add(panel);
                    worldObjects.push(panel);
                });

                // --- Basement Perimeter Walls ---
                // Back Wall (Far Z) - with Garage Door Opening
                const garageDoorWidth = 6;
                const garageDoorHeight = SETTINGS.wallHeight - 0.5; // Leave 0.5m for header
                const garageDoorPanelThickness = 0.2;
                const wallFarZPlane = basementMaxZ - wallDepth / 2;

                // Segment Left of Garage Door
                const farWallLeftWidth = (basementWidth - garageDoorWidth) / 2;
                if (farWallLeftWidth > 0.01) {
                    const farWallLeftGeo = new THREE.BoxGeometry(farWallLeftWidth, SETTINGS.wallHeight, wallDepth);
                    const farWallLeft = new THREE.Mesh(farWallLeftGeo, basementWallMaterial);
                    farWallLeft.position.set(basementMinX + farWallLeftWidth / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane);
                    farWallLeft.name = `BasementWall_Far_Right_F${i}`; // Adjusted: MinX side is player's right
                    farWallLeft.castShadow = true; farWallLeft.receiveShadow = true;
                    scene.add(farWallLeft); worldObjects.push(farWallLeft);
                }

                // Segment Right of Garage Door
                const farWallRightWidth = (basementWidth - garageDoorWidth) / 2;
                if (farWallRightWidth > 0.01) {
                    const farWallRightGeo = new THREE.BoxGeometry(farWallRightWidth, SETTINGS.wallHeight, wallDepth);
                    const farWallRight = new THREE.Mesh(farWallRightGeo, basementWallMaterial);
                    farWallRight.position.set(basementMaxX - farWallRightWidth / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane);
                    farWallRight.name = `BasementWall_Far_Left_F${i}`; // Adjusted: MaxX side is player's left
                    farWallRight.castShadow = true; farWallRight.receiveShadow = true;
                    scene.add(farWallRight); worldObjects.push(farWallRight);
                }

                // Header Above Garage Door
                const headerHeight = SETTINGS.wallHeight - garageDoorHeight;
                if (headerHeight > 0.01) {
                    const headerGeo = new THREE.BoxGeometry(garageDoorWidth, headerHeight, wallDepth);
                    const header = new THREE.Mesh(headerGeo, basementWallMaterial);
                    header.position.set(basementCenterX, floorY + garageDoorHeight + headerHeight / 2, wallFarZPlane);
                    header.name = `BasementWall_Far_Header_F${i}`;
                    header.castShadow = true; header.receiveShadow = true;
                    scene.add(header); worldObjects.push(header);
                }

                // Create Garage Door (only for the lowest basement floor for now)
                if (i === -SETTINGS.numBasementFloors) {
                    const garageDoorGeo = new THREE.BoxGeometry(garageDoorWidth, garageDoorHeight, garageDoorPanelThickness);
                    garageDoorGeo.translate(0, -garageDoorHeight / 2, 0); // Pivot at top edge
                    const garageDoor = new THREE.Mesh(garageDoorGeo, garageDoorMaterial);
                    garageDoor.name = `GarageDoor_F${i}`;
                    garageDoor.position.set(basementCenterX, floorY + garageDoorHeight, wallFarZPlane - wallDepth / 2 + garageDoorPanelThickness / 2); // Position top edge
                    garageDoor.castShadow = true; garageDoor.receiveShadow = true;
                    garageDoor.userData = { type: 'garageDoor', isOpen: false, isAnimating: false, targetRotationX: 0, floor: i };
                    scene.add(garageDoor); worldObjects.push(garageDoor); doors.push(garageDoor); // Add to doors for interaction

                    // --- Add Garage Structure Behind the Door ---
                    const garageDepthVal = 8; // How deep the garage extends
                    const garageWallThickness = wallDepth; // Use existing wallDepth

                    // Garage Floor
                    const garageFloorGeo = new THREE.BoxGeometry(garageDoorWidth, floorDepth, garageDepthVal);
                    const garageFloor = new THREE.Mesh(garageFloorGeo, concreteMaterial);
                    garageFloor.name = `Garage_Floor_F${i}`;
                    garageFloor.position.set(basementCenterX, floorY - floorDepth / 2, wallFarZPlane + wallDepth / 2 + garageDepthVal / 2);
                    garageFloor.receiveShadow = true;
                    scene.add(garageFloor); worldObjects.push(garageFloor);

                    // Garage Ceiling
                    const garageCeilingGeo = new THREE.BoxGeometry(garageDoorWidth, floorDepth / 2, garageDepthVal); // Thinner ceiling for garage
                    const garageCeiling = new THREE.Mesh(garageCeilingGeo, concreteMaterial);
                    garageCeiling.name = `Garage_Ceiling_F${i}`;
                    garageCeiling.position.set(basementCenterX, floorY + SETTINGS.wallHeight + (floorDepth / 2) / 2, wallFarZPlane + wallDepth / 2 + garageDepthVal / 2);
                    garageCeiling.castShadow = true;
                    scene.add(garageCeiling); worldObjects.push(garageCeiling);

                    // Garage Side Walls
                    const garageSideWallGeo = new THREE.BoxGeometry(garageWallThickness, SETTINGS.wallHeight, garageDepthVal);
                    const garageSideWallLeft = new THREE.Mesh(garageSideWallGeo, basementWallMaterial);
                    garageSideWallLeft.name = `Garage_SideWall_Left_F${i}`;
                    garageSideWallLeft.position.set(basementCenterX - garageDoorWidth / 2 + garageWallThickness / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane + wallDepth / 2 + garageDepthVal / 2);
                    scene.add(garageSideWallLeft); worldObjects.push(garageSideWallLeft);

                    const garageSideWallRight = new THREE.Mesh(garageSideWallGeo, basementWallMaterial);
                    garageSideWallRight.name = `Garage_SideWall_Right_F${i}`;
                    garageSideWallRight.position.set(basementCenterX + garageDoorWidth / 2 - garageWallThickness / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane + wallDepth / 2 + garageDepthVal / 2);
                    scene.add(garageSideWallRight); worldObjects.push(garageSideWallRight);

                    // Garage Back Wall
                    const garageBackWallGeo = new THREE.BoxGeometry(garageDoorWidth, SETTINGS.wallHeight, garageWallThickness);
                    const garageBackWall = new THREE.Mesh(garageBackWallGeo, basementWallMaterial);
                    garageBackWall.name = `Garage_BackWall_F${i}`;
                    garageBackWall.position.set(basementCenterX, floorY + SETTINGS.wallHeight / 2, wallFarZPlane + wallDepth / 2 + garageDepthVal - garageWallThickness / 2);
                    scene.add(garageBackWall); worldObjects.push(garageBackWall);

                    // Garage Light
                    const garageLightYPos = floorY + SETTINGS.wallHeight - 0.5;
                    const garageLightXPos = basementCenterX;
                    const garageLightZPos = wallFarZPlane + wallDepth / 2 + garageDepthVal / 2;

                    const garagePointLight = new THREE.PointLight(0xffccaa, 0.7, 15); // Light color, intensity, range
                    garagePointLight.position.set(garageLightXPos, garageLightYPos, garageLightZPos);
                    garagePointLight.castShadow = true; // Enable shadow casting for the garage light
                    garagePointLight.shadow.mapSize.width = 1024; // Increase shadow map resolution for better quality
                    garagePointLight.shadow.mapSize.height = 1024;
                    garagePointLight.shadow.camera.far = 15; // Set shadow camera far plane to match light's distance

                    scene.add(garagePointLight);

                    // Add a simple fixture mesh for the garage light
                    const garageFixtureGeo = new THREE.BoxGeometry(1.0, 0.15, 0.2); // A bit smaller or different style
                    const garageFixtureMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 1, emissiveIntensity: 100 }); // Slightly different color for variety
                    const garageFixture = new THREE.Mesh(garageFixtureGeo, garageFixtureMat);
                    garageFixture.position.set(garageLightXPos, garageLightYPos + 0.075, garageLightZPos); // Centered with the light Y
                    scene.add(garageFixture);

                    // Add the car model to the garage floor
                    // The garage floor's top surface is at y = floorY.
                    addGarageCar(scene, new THREE.Vector3(basementCenterX, floorY, wallFarZPlane + wallDepth / 2 + garageDepthVal / 2));

                }

                // Front Wall (Near Z - around elevator shaft)
                // Part 1: Left of elevator shaft (X from basementMinX to 0)
                const frontWallLeftWidth = 0 - basementMinX; // Width of this segment

                // Part 2: Right of elevator shaft (X from SETTINGS.corridorWidth to basementMaxX)
                const frontWallRightWidth = basementMaxX - SETTINGS.corridorWidth; // Width of this segment

                // Note: The actual back wall of the elevator shaft itself is handled by `endWallNear` later.

                // Side Wall Left (Min X)
                const wallSideLeftGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, basementDepth);
                const wallSideLeft = new THREE.Mesh(wallSideLeftGeo, basementWallMaterial);
                wallSideLeft.position.set(basementMinX + wallDepth / 2, floorY + SETTINGS.wallHeight / 2, basementCenterZ);
                wallSideLeft.name = `BasementWall_SideRight_F${i}`; // Adjusted: MinX side is player's right
                wallSideLeft.castShadow = true; wallSideLeft.receiveShadow = true;
                scene.add(wallSideLeft); worldObjects.push(wallSideLeft);

                // Side Wall Right (Max X)
                const wallSideRightGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, basementDepth);
                const wallSideRight = new THREE.Mesh(wallSideRightGeo, basementWallMaterial);
                wallSideRight.position.set(basementMaxX - wallDepth / 2, floorY + SETTINGS.wallHeight / 2, basementCenterZ);
                wallSideRight.name = `BasementWall_SideLeft_F${i}`; // Adjusted: MaxX side is player's left
                wallSideRight.castShadow = true; wallSideRight.receiveShadow = true;
                scene.add(wallSideRight); worldObjects.push(wallSideRight);

                // Concrete Pillars
                const pillarSize = 0.5;
                const pillarGeo = new THREE.BoxGeometry(pillarSize, SETTINGS.wallHeight, pillarSize);
                const pillarYPos = floorY + SETTINGS.wallHeight / 2;
                const pillarSpacingX = 7;
                const pillarSpacingZ = 7;
                // Use overall shaft dimensions for pillar exclusion zone
                const elevatorShaftZone = { minX: overallShaftMinX - 0.1, maxX: overallShaftMaxX + 0.1, minZ: overallShaftMinZ - 0.1, maxZ: overallShaftMaxZ + 0.1 };


                for (let px = basementMinX + pillarSpacingX / 2; px < basementMaxX; px += pillarSpacingX) {
                    for (let pz = basementMinZ + pillarSpacingZ / 2; pz < basementMaxZ; pz += pillarSpacingZ) {
                        if (px > elevatorShaftZone.minX && px < elevatorShaftZone.maxX &&
                            pz > elevatorShaftZone.minZ && pz < elevatorShaftZone.maxZ) {
                            continue;
                        }


                        const pillar = new THREE.Mesh(pillarGeo, pillarMaterial);
                        pillar.position.set(px, pillarYPos, pz);
                        pillar.name = `BasementPillar_F${i}_X${Math.round(px)}_Z${Math.round(pz)}`;
                        pillar.castShadow = true; pillar.receiveShadow = true;
                        scene.add(pillar);
                        worldObjects.push(pillar);
                    }
                }

                // Place enemies on basement floors
                const numBasementEnemies = 3; // Number of enemies per basement floor
                for (let e = 0; e < numBasementEnemies; e++) {
                    let enemyX, enemyZ;
                    let attempts = 0;
                    const maxAttempts = 10; // Prevent infinite loops if space is too constrained

                    do {
                        enemyX = basementMinX + Math.random() * (basementMaxX - basementMinX);
                        enemyZ = basementMinZ + Math.random() * (basementMaxZ - basementMinZ);
                        attempts++;
                        // Check if the random position is inside the elevator shaft zone
                        // Add a small buffer to avoid placing enemies too close to the shaft walls
                        const buffer = 1.0; // Buffer around the elevator shaft
                        const isInShaft = (enemyX > elevatorShaftZone.minX - buffer && enemyX < elevatorShaftZone.maxX + buffer &&
                            enemyZ > elevatorShaftZone.minZ - buffer && enemyZ < elevatorShaftZone.maxZ + buffer);

                        if (!isInShaft) {
                            createEnemy(enemyX, floorY, enemyZ, i);
                            break; // Found a valid spot, move to next enemy
                        }
                    } while (attempts < maxAttempts);

                    if (attempts >= maxAttempts) {
                        console.warn(`Could not find a suitable spot for basement enemy ${e} on floor ${i} after ${maxAttempts} attempts.`);
                    }
                }

                // Basement Lighting (simple point lights for now)
                const lightSpacing = 6; // Reduced spacing for better coverage
                const lightYPos = floorY + SETTINGS.wallHeight - 0.5; // Under the ceiling

                // Determine X positions for lights, ensuring they are centered around basementCenterX
                // basementWidth and basementCenterX are defined earlier in generateWorld
                const numLightsX = Math.max(1, Math.floor(basementWidth / lightSpacing));
                const totalLightSpanX = (numLightsX - 1) * lightSpacing;
                const startLx = basementCenterX - totalLightSpanX / 2;

                for (let lz = basementMinZ + lightSpacing / 2; lz < basementMaxZ; lz += lightSpacing) {
                    for (let k = 0; k < numLightsX; k++) {
                        const lx = startLx + k * lightSpacing;

                        const parkingLight = new THREE.PointLight(0xddddff, 0.5, 18); // Dim, cool white
                        parkingLight.position.set(lx, lightYPos, lz);
                        // parkingLight.castShadow = true; // Optional: for performance, might turn off
                        scene.add(parkingLight);

                        // Add a simple fixture mesh
                        const fixtureGeo = new THREE.BoxGeometry(1.2, 0.15, 0.25); // Fluorescent light like
                        const fixtureMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 1, emissiveIntensity: 100 }); // Slightly glowing
                        const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
                        fixture.position.set(lx, lightYPos + 0.1, lz); // Slightly below ceiling
                        scene.add(fixture);
                    }
                }
            } else { // --- Office Floor Generation (i >= 0) ---

                // Floor Plane (Corridor only for office floors)
                const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2 * SETTINGS.roomSize), totalCorridorLength);
                const floor = new THREE.Mesh(floorGeo, floorMaterial);
                floor.name = `Floor ${i}`;
                floor.rotation.x = -Math.PI / 2;
                floor.position.set(SETTINGS.corridorWidth / 2, floorY, totalCorridorLength / 2);
                floor.receiveShadow = true;
                scene.add(floor);
                worldObjects.push(floor);

                // Floor Plane -Z (Corridor only for office floors)
                //const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
                const floorB = new THREE.Mesh(floorGeo, floorMaterial);
                floorB.name = `Floor B ${i}`;
                floorB.rotation.x = -Math.PI / 2;
                floorB.position.set(SETTINGS.corridorWidth / 2, floorY, -16 - totalCorridorLength / 2);
                floorB.receiveShadow = true;
                scene.add(floorB);
                worldObjects.push(floorB);

                // --- Add Connector Floor for Office Floors (between corridor end Z=0 and new shaft front Z=-4) ---
                const connectorFloorGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, 4); // Adjusted width
                const connectorFloor = new THREE.Mesh(connectorFloorGeo, floorMaterial);
                connectorFloor.name = `ConnectorFloor_F${i}`;
                connectorFloor.position.set(overallShaftActualCenterX, floorY - floorDepth / 2, -2); // Adjusted X
                connectorFloor.receiveShadow = true;
                scene.add(connectorFloor);
                worldObjects.push(connectorFloor);

                const connectorFloorBGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, 4); // Adjusted width
                const connectorFloorB = new THREE.Mesh(connectorFloorBGeo, floorMaterial);
                connectorFloorB.name = `ConnectorFloorB_F${i}`;
                connectorFloorB.position.set(overallShaftActualCenterX, floorY - floorDepth / 2, -14); // Adjusted X
                connectorFloorB.receiveShadow = true;
                scene.add(connectorFloorB);
                worldObjects.push(connectorFloorB);


                // --- Add two ceiling lamps at each connector floor (x=0 and x=corridorWidth) ---
                [0, SETTINGS.corridorWidth].forEach((lampX, lampIdx) => {
                    createStandardLamp(
                        lampX,
                        floorY + SETTINGS.wallHeight - 0.5,
                        -2, // Z position for connector lamps
                        i, // floorIndex
                        `Connector_F${i}_Idx${lampIdx}`, // lampIdSuffix
                        scene, lights, lightBulbMaterial // Pass scene, lights array, and global bulb material
                    );
                });

                // --- Add two ceiling lamps at each B wing connector floor (x=0 and x=corridorWidth) ---
                [0, SETTINGS.corridorWidth].forEach((lampX, lampIdx) => {
                    createStandardLamp(
                        lampX,
                        floorY + SETTINGS.wallHeight - 0.5,
                        -2 - 8 - 4, // Z position for connector lamps
                        i, // floorIndex
                        `Connector_B_F${i}_Idx${lampIdx}`, // lampIdSuffix
                        scene, lights, lightBulbMaterial // Pass scene, lights array, and global bulb material
                    );
                });


                // Room Partition Walls
                for (let k = 0; k <= SETTINGS.doorsPerSide; k++) {
                    const zPosBoundary = k * SETTINGS.corridorSegmentLength;
                    const partRGeo = new THREE.BoxGeometry(SETTINGS.roomSize + (wallDepth * 0.8), SETTINGS.wallHeight, wallDepth);
                    const partR = new THREE.Mesh(partRGeo, wallMaterialA); // A-wing
                    partR.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                    partR.castShadow = true; partR.receiveShadow = true; scene.add(partR); worldObjects.push(partR);
                    partR.name = `RoomPartition_R_F${i}_Z${k}`;

                    // A-Wing Left partition wall
                    const partLGeo = new THREE.BoxGeometry(SETTINGS.roomSize + (wallDepth * 0.8), SETTINGS.wallHeight, wallDepth);
                    const partL = new THREE.Mesh(partLGeo, wallMaterialA); // A-wing
                    partL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                    partL.castShadow = true; partL.receiveShadow = true; scene.add(partL); worldObjects.push(partL);
                    partL.name = `RoomPartition_L_F${i}_Z${k}`;

                    // B-Wing Right partition wall
                    const partRBGeo = new THREE.BoxGeometry(SETTINGS.roomSize + (wallDepth * 0.8), SETTINGS.wallHeight, wallDepth);
                    const partRB = new THREE.Mesh(partRBGeo, wallMaterialB); // B-wing
                    partRB.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
                    partRB.castShadow = true; partRB.receiveShadow = true; scene.add(partRB); worldObjects.push(partRB);
                    partRB.name = `RoomPartition_B_R_F${i}_Z${k}`;

                    // B-Wing Left partition wall
                    const partLBGeo = new THREE.BoxGeometry(SETTINGS.roomSize + (wallDepth * 0.8), SETTINGS.wallHeight, wallDepth);
                    const partLB = new THREE.Mesh(partLBGeo, wallMaterialB); // B-wing
                    partLB.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
                    partLB.castShadow = true; partLB.receiveShadow = true; scene.add(partLB); worldObjects.push(partLB);
                    partLB.name = `RoomPartition_B_L_F${i}_Z${k}`;
                }

                // Loop for individual rooms
                for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                    const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                    const segmentStartZ = j * SETTINGS.corridorSegmentLength;
                    const deskWidth = 1.5, deskHeight = 0.75, deskDepth = 0.8;
                    const cabinetWidth = 0.5, cabinetHeight = 1.5, cabinetDepth = 0.6;
                    const safeWidth = 0.8, safeHeight = 0.8, safeDepth = 0.8;
                    const dialRadius = 0.08, dialLength = 0.1;
                    const roomCeilingThickness = 0.2; // Thickness for individual room ceilings
                    const defaultSafeUserData = () => ({ isCracked: false, dialPresses: 0, dialPressesRequired: Math.floor(Math.random() * 9) + 2, pointsAwarded: false });

                    // --- Right Side Room ---
                    const roomRXCenter = -SETTINGS.roomSize / 2;
                    const isRightRoomRedDoor = (j === redDoorIndex);


                    const deskRGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                    const deskR = new THREE.Mesh(deskRGeo, deskMaterial);
                    deskR.rotateY(Math.PI / 2);
                    deskR.position.set(-(SETTINGS.roomSize / 2), floorY + deskHeight / 2, segmentCenterZ + 1.3);
                    deskR.castShadow = true; deskR.receiveShadow = true; // scene.add(deskR); worldObjects.push(deskR);
                    deskR.name = `Desk_R_F${i}_D${j}`;
                    const cabinetRGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                    const cabinetR = new THREE.Mesh(cabinetRGeo, cabinetMaterial);
                    cabinetR.position.set(-SETTINGS.roomSize + cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                    cabinetR.castShadow = true; cabinetR.receiveShadow = true; // scene.add(cabinetR); worldObjects.push(cabinetR);
                    cabinetR.name = `Cabinet_R_F${i}_D${j}`;
                    // Chair for Right Room
                    const chairSeatWidth = 0.5, chairSeatDepth = 0.65, chairSeatHeight = 0.5;
                    const chairBackrestHeight = 0.8, chairBackrestThickness = 0.15;
                    const backWallZ_R_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                    const chairZ_R = 0.1 + (deskR.position.z + backWallZ_R_Chair) / 2;
                    const chairX_R = -(SETTINGS.roomSize / 2);
                    const chairY_R = floorY + chairSeatHeight / 2;
                    const chairSeat_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                    chairSeat_R.position.set(chairX_R, chairY_R, chairZ_R); // scene.add(chairSeat_R); worldObjects.push(chairSeat_R);
                    const backrest_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                    backrest_R.position.set(chairX_R, chairY_R + chairBackrestHeight / 2, chairZ_R + chairSeatDepth / 2 - chairBackrestThickness / 2);
                    // scene.add(backrest_R); worldObjects.push(backrest_R);

                    const rightRoomContents = new THREE.Group();
                    const rightRoomId = `R_F${i}_D${j}`;
                    rightRoomContents.name = `RoomContents_${rightRoomId}`;
                    //rightRoomContents.add(rFloor); worldObjects.push(rFloor); // Add to worldObjects for collision if needed
                    //rightRoomContents.add(rCeiling); worldObjects.push(rCeiling);
                    rightRoomContents.add(deskR); worldObjects.push(deskR);
                    rightRoomContents.add(cabinetR); worldObjects.push(cabinetR);
                    rightRoomContents.add(chairSeat_R); worldObjects.push(chairSeat_R);
                    rightRoomContents.add(backrest_R); worldObjects.push(backrest_R);

                    if (isRightRoomRedDoor) {
                        const safeRGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                        const safeR = new THREE.Mesh(safeRGeo, safeMaterial);
                        safeR.position.set(-SETTINGS.roomSize + safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                        safeR.castShadow = true; safeR.receiveShadow = true; safeR.name = `Safe_R_F${i}_D${j}`;
                        safeR.userData = defaultSafeUserData(); // scene.add(safeR); worldObjects.push(safeR);
                        rightRoomContents.add(safeR); worldObjects.push(safeR);
                        const dialRGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                        const dialR = new THREE.Mesh(dialRGeo, dialMaterial);
                        dialR.position.set(safeDepth / 2, 0, 0); dialR.rotation.z = -Math.PI / 2;
                        dialR.userData.isSafeDial = true; dialR.name = `Dial_Safe_R_F${i}_D${j}`; safeR.add(dialR);
                    }
                    const roomLampR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, rightRoomId, lightBulbMaterial);
                    rightRoomContents.add(roomLampR); // Add lamp's visual group

                    // Call modified function for pillars and window
                    createOuterWall_SegmentFeatures(-SETTINGS.roomSize + wallDepth / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialA, opaqueGlassMaterial, glassMaterial, rightRoomId);

                    rightRoomContents.visible = false;
                    scene.add(rightRoomContents);


                    /* allRoomsData.push({
                        id: rightRoomId,
                        door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: rightRoomContents,
                        visibleByDoor: false, visibleByWindow: false, lamp: roomLampR }
                    );  */

                    // --- Right Side B Room ---
                    const segmentBCenterZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                    const segmentBStartZ = (j * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;

                    const roomBRXCenter = -SETTINGS.roomSize / 2;
                    const isRightBRoomRedDoor = (j === redDoorIndex);


                    const deskRBGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                    const deskRB = new THREE.Mesh(deskRBGeo, deskMaterial);
                    deskRB.rotateY(Math.PI / 2);
                    deskRB.position.set(-(SETTINGS.roomSize / 2), floorY + deskHeight / 2, segmentBCenterZ + 1.3);
                    deskRB.castShadow = true; deskRB.receiveShadow = true; // scene.add(deskRB); worldObjects.push(deskRB);
                    deskRB.name = `Desk_B_R_F${i}_D${j}`;
                    const cabinetRBGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                    const cabinetRB = new THREE.Mesh(cabinetRBGeo, cabinetMaterial);
                    cabinetRB.position.set(-SETTINGS.roomSize + cabinetDepth / 2, floorY + cabinetHeight / 2, segmentBStartZ + cabinetWidth / 2 + 0.1);
                    cabinetRB.castShadow = true; cabinetRB.receiveShadow = true; // scene.add(cabinetR); worldObjects.push(cabinetR);
                    cabinetRB.name = `Cabinet_R_B_F${i}_D${j}`;
                    // Chair for Right Room B
                    //const chairSeatWidth = 0.5, chairSeatDepth = 0.65, chairSeatHeight = 0.5;
                    //const chairBackrestHeight = 0.8, chairBackrestThickness = 0.15;
                    const backWallZ_B_R_Chair = segmentBCenterZ + SETTINGS.corridorSegmentLength / 2; // This is the Z of the wall behind the desk
                    const chairZ_B_R = 0.1 + (deskRB.position.z + backWallZ_B_R_Chair) / 2; // Position chair between desk and back wall
                    const chairX_B_R = -(SETTINGS.roomSize / 2);
                    const chairY_B_R = floorY + chairSeatHeight / 2;
                    const chairBSeat_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                    chairBSeat_R.position.set(chairX_B_R, chairY_B_R, chairZ_B_R); // scene.add(chairBSeat_R); worldObjects.push(chairBSeat_R);
                    const backrestB_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                    backrestB_R.position.set(chairX_B_R, chairY_B_R + chairBackrestHeight / 2, chairZ_B_R + chairSeatDepth / 2 - chairBackrestThickness / 2);
                    // scene.add(backrestB_R); worldObjects.push(backrestB_R);

                    //const rightRoomContents = new THREE.Group();
                    const rightRoomBId = `B_R_F${i}_D${j}`;
                    rightRoomContents.name = `RoomContents_B_${rightRoomBId}`;
                    //rightRoomContents.add(rFloorB); worldObjects.push(rFloorB); // Add to worldObjects for collision if needed
                    //rightRoomContents.add(rCeilingB); worldObjects.push(rCeilingB);
                    rightRoomContents.add(deskRB); worldObjects.push(deskRB);
                    rightRoomContents.add(cabinetRB); worldObjects.push(cabinetRB);
                    rightRoomContents.add(chairBSeat_R); worldObjects.push(chairBSeat_R);
                    rightRoomContents.add(backrestB_R); worldObjects.push(backrestB_R);

                    if (isRightBRoomRedDoor) {
                        const safeRBGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                        const safeBR = new THREE.Mesh(safeRBGeo, safeMaterial);
                        safeBR.position.set(-SETTINGS.roomSize + safeDepth / 2, floorY + safeHeight / 2, segmentBStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                        safeBR.castShadow = true; safeBR.receiveShadow = true; safeBR.name = `Safe_B_R_F${i}_D${j}`;
                        safeBR.userData = defaultSafeUserData(); // scene.add(safeR); worldObjects.push(safeR);
                        rightRoomContents.add(safeBR); worldObjects.push(safeBR);
                        const dialRBGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                        const dialRB = new THREE.Mesh(dialRBGeo, dialMaterial);
                        dialRB.position.set(safeDepth / 2, 0, 0); dialRB.rotation.z = -Math.PI / 2;
                        dialRB.userData.isSafeDial = true; dialRB.name = `Dial_Safe_B_R_F${i}_D${j}`; safeBR.add(dialRB);
                    }
                    const roomLampBR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentBCenterZ, i, rightRoomBId, lightBulbMaterial);
                    rightRoomContents.add(roomLampBR); // Add lamp's visual group

                    // Call modified function for pillars and window (B-Wing Right)
                    createOuterWall_SegmentFeatures(-SETTINGS.roomSize + wallDepth / 2, segmentBCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialB, opaqueGlassMaterial, glassMaterial, rightRoomBId);

                    rightRoomContents.visible = false;
                    scene.add(rightRoomContents);

                    allRoomsData.push({
                        id: rightRoomId,
                        door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: rightRoomContents,
                        visibleByDoor: false, visibleByWindow: false, lamp: roomLampBR
                    });

                    // --- Left Side Room ---
                    const roomLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                    const isLeftRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);


                    const deskLGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                    const deskL = new THREE.Mesh(deskLGeo, deskMaterial);
                    deskL.rotateY(Math.PI / 2);
                    deskL.position.set(SETTINGS.corridorWidth + (SETTINGS.roomSize / 2), floorY + deskHeight / 2, segmentCenterZ + 1.3);
                    deskL.castShadow = true; deskL.receiveShadow = true; // scene.add(deskL); worldObjects.push(deskL);
                    deskL.name = `Desk_L_F${i}_D${j}`;
                    const cabinetLGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                    const cabinetL = new THREE.Mesh(cabinetLGeo, cabinetMaterial);
                    cabinetL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                    cabinetL.castShadow = true; cabinetL.receiveShadow = true; // scene.add(cabinetL); worldObjects.push(cabinetL);
                    cabinetL.name = `Cabinet_L_F${i}_D${j}`;
                    // Chair for Left Room
                    const backWallZ_L_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                    const chairZ_L = 0.15 + (deskL.position.z + backWallZ_L_Chair) / 2;
                    const chairX_L = SETTINGS.corridorWidth + (SETTINGS.roomSize / 2);
                    const chairY_L = floorY + chairSeatHeight / 2;
                    const chairSeat_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                    chairSeat_L.position.set(chairX_L, chairY_L, chairZ_L); // scene.add(chairSeat_L); worldObjects.push(chairSeat_L);
                    const backrest_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                    backrest_L.position.set(chairX_L, chairY_L + chairBackrestHeight / 2, chairZ_L + chairSeatDepth / 2 - chairBackrestThickness / 2);
                    // scene.add(backrest_L); worldObjects.push(backrestL);

                    const leftRoomContents = new THREE.Group();
                    const leftRoomId = `L_F${i}_D${j}`;
                    leftRoomContents.name = `RoomContents_${leftRoomId}`;
                    //leftRoomContents.add(lFloor); worldObjects.push(lFloor);
                    //leftRoomContents.add(lCeiling); worldObjects.push(lCeiling);
                    leftRoomContents.add(deskL); worldObjects.push(deskL);
                    leftRoomContents.add(cabinetL); worldObjects.push(cabinetL);
                    leftRoomContents.add(chairSeat_L); worldObjects.push(chairSeat_L);
                    leftRoomContents.add(backrest_L); worldObjects.push(backrest_L);

                    if (isLeftRoomRedDoor) {
                        const safeLGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                        const safeL = new THREE.Mesh(safeLGeo, safeMaterial);
                        safeL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                        safeL.castShadow = true; safeL.receiveShadow = true; safeL.name = `Safe_L_F${i}_D${j}`;
                        safeL.userData = defaultSafeUserData(); // scene.add(safeL); worldObjects.push(safeL);
                        leftRoomContents.add(safeL); worldObjects.push(safeL);
                        const dialLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                        const dialL = new THREE.Mesh(dialLGeo, dialMaterial);
                        dialL.position.set(-safeDepth / 2, 0, 0); dialL.rotation.z = Math.PI / 2;
                        dialL.userData.isSafeDial = true; dialL.name = `Dial_Safe_L_F${i}_D${j}`; safeL.add(dialL);
                    }
                    const roomLampL = createRoomLamp(roomLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, leftRoomId, lightBulbMaterial);
                    leftRoomContents.add(roomLampL);

                    // Call modified function for pillars and window (A-Wing Left)
                    createOuterWall_SegmentFeatures(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialA, opaqueGlassMaterial, glassMaterial, leftRoomId);

                    leftRoomContents.visible = false;
                    scene.add(leftRoomContents);

                    // --- Left Side B Room ---
                    const roomBLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                    const isLeftBRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);


                    const deskLBGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                    const deskBL = new THREE.Mesh(deskLBGeo, deskMaterial);
                    deskBL.rotateY(Math.PI / 2);
                    deskBL.position.set(SETTINGS.corridorWidth + (SETTINGS.roomSize / 2), floorY + deskHeight / 2, segmentBCenterZ + 1.3);
                    deskBL.castShadow = true; deskBL.receiveShadow = true; // scene.add(deskL); worldObjects.push(deskL);
                    deskBL.name = `Desk_B_L_F${i}_D${j}`;
                    const cabinetBLGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                    const cabinetBL = new THREE.Mesh(cabinetBLGeo, cabinetMaterial);
                    cabinetBL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - cabinetDepth / 2, floorY + cabinetHeight / 2, segmentBStartZ + cabinetWidth / 2 + 0.1);
                    cabinetBL.castShadow = true; cabinetBL.receiveShadow = true; // scene.add(cabinetL); worldObjects.push(cabinetL);
                    cabinetBL.name = `Cabinet_B_L_F${i}_D${j}`;
                    // Chair for Left Room
                    const backWallZ_BL_Chair = segmentBCenterZ + SETTINGS.corridorSegmentLength / 2;
                    const chairZ_BL = 0.15 + (deskL.position.z + backWallZ_L_Chair) / 2 - 16 - totalCorridorLength;
                    const chairX_BL = SETTINGS.corridorWidth + (SETTINGS.roomSize / 2);
                    const chairY_BL = floorY + chairSeatHeight / 2;
                    const chairSeat_BL = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                    chairSeat_BL.position.set(chairX_BL, chairY_BL, chairZ_BL); // scene.add(chairSeat_L); worldObjects.push(chairSeat_L);
                    const backrest_BL = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                    backrest_BL.position.set(chairX_BL, chairY_BL + chairBackrestHeight / 2, chairZ_BL + chairSeatDepth / 2 - chairBackrestThickness / 2);
                    // scene.add(backrest_L); worldObjects.push(backrest_L);

                    //const leftRoomContents = new THREE.Group();
                    const leftRoomBId = `B_L_F${i}_D${j}`;
                    leftRoomContents.name = `RoomContents_${leftRoomBId}`;
                    //leftRoomContents.add(lFloorB); worldObjects.push(lFloorB);
                    //leftRoomContents.add(lCeilingB); worldObjects.push(lCeilingB);
                    leftRoomContents.add(deskBL); worldObjects.push(deskBL);
                    leftRoomContents.add(cabinetBL); worldObjects.push(cabinetBL);
                    leftRoomContents.add(chairSeat_BL); worldObjects.push(chairSeat_BL);
                    leftRoomContents.add(backrest_BL); worldObjects.push(backrest_BL);

                    if (isLeftBRoomRedDoor) {
                        const safeBLGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                        const safeBL = new THREE.Mesh(safeBLGeo, safeMaterial);
                        safeBL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                        safeBL.castShadow = true; safeBL.receiveShadow = true; safeBL.name = `Safe_L_F${i}_D${j}`;
                        safeBL.userData = defaultSafeUserData(); // scene.add(safeL); worldObjects.push(safeL);
                        leftRoomContents.add(safeBL); worldObjects.push(safeBL);
                        const dialBLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                        const dialBL = new THREE.Mesh(dialBLGeo, dialMaterial);
                        dialBL.position.set(-safeDepth / 2, 0, 0); dialBL.rotation.z = Math.PI / 2;
                        dialBL.userData.isSafeDial = true; dialBL.name = `Dial_Safe_B_L_F${i}_D${j}`; safeBL.add(dialBL);
                    }
                    const roomLampBL = createRoomLamp(roomBLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentBCenterZ, i, leftRoomBId, lightBulbMaterial);
                    leftRoomContents.add(roomLampBL);

                    // Call modified function for pillars and window (B-Wing Left)
                    createOuterWall_SegmentFeatures(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, segmentBCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialB, opaqueGlassMaterial, glassMaterial, leftRoomBId);

                    leftRoomContents.visible = false;
                    scene.add(leftRoomContents);
                    allRoomsData.push({ // Ensure new properties are initialized
                        id: leftRoomId, door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: leftRoomContents,
                        visibleByDoor: false, visibleByWindow: false, lamp: roomLampBL
                    });
                }

                // --- Create Long Sills and Headers for Outer Walls ---
                const sillH = SETTINGS.wallHeight * WINDOW_SILL_RATIO;
                const headerH = SETTINGS.wallHeight - (SETTINGS.wallHeight * WINDOW_HEIGHT_RATIO) - sillH;

                // A-Wing Outer Walls
                const outerWallAX_Right = -SETTINGS.roomSize + wallDepth / 2;
                const outerWallAX_Left = SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2;
                const centerZ_A = totalCorridorLength / 2;

                if (sillH > 0.01) {
                    const sillAGeo = new THREE.BoxGeometry(wallDepth, sillH, totalCorridorLength);
                    const sillAR = new THREE.Mesh(sillAGeo, wallMaterialA); // Right side sill
                    sillAR.position.set(outerWallAX_Right, floorY + sillH / 2, centerZ_A);
                    scene.add(sillAR); worldObjects.push(sillAR); sillAR.name = `OuterWallSill_A_R_F${i}`;
                    const sillAL = new THREE.Mesh(sillAGeo, wallMaterialA); // Left side sill
                    sillAL.position.set(outerWallAX_Left, floorY + sillH / 2, centerZ_A);
                    scene.add(sillAL); worldObjects.push(sillAL); sillAL.name = `OuterWallSill_A_L_F${i}`;
                }
                if (headerH > 0.01) {
                    const headerAGeo = new THREE.BoxGeometry(wallDepth, headerH, totalCorridorLength);
                    const headerAR = new THREE.Mesh(headerAGeo, wallMaterialA); // Right side header
                    headerAR.position.set(outerWallAX_Right, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_A);
                    scene.add(headerAR); worldObjects.push(headerAR); headerAR.name = `OuterWallHeader_A_R_F${i}`;
                    const headerAL = new THREE.Mesh(headerAGeo, wallMaterialA); // Left side header
                    headerAL.position.set(outerWallAX_Left, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_A);
                    scene.add(headerAL); worldObjects.push(headerAL); headerAL.name = `OuterWallHeader_A_L_F${i}`;
                }

                // B-Wing Outer Walls
                const outerWallBX_Right = -SETTINGS.roomSize + wallDepth / 2; // Same X as A-wing
                const outerWallBX_Left = SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2; // Same X as A-wing
                const centerZ_B = -16 - totalCorridorLength / 2;

                if (sillH > 0.01) {
                    const sillBGeo = new THREE.BoxGeometry(wallDepth, sillH, totalCorridorLength);
                    const sillBR = new THREE.Mesh(sillBGeo, wallMaterialB); // Right side sill
                    sillBR.position.set(outerWallBX_Right, floorY + sillH / 2, centerZ_B);
                    scene.add(sillBR); worldObjects.push(sillBR); sillBR.name = `OuterWallSill_B_R_F${i}`;
                    const sillBL = new THREE.Mesh(sillBGeo, wallMaterialB); // Left side sill
                    sillBL.position.set(outerWallBX_Left, floorY + sillH / 2, centerZ_B);
                    scene.add(sillBL); worldObjects.push(sillBL); sillBL.name = `OuterWallSill_B_L_F${i}`;
                }
                if (headerH > 0.01) {
                    const headerBGeo = new THREE.BoxGeometry(wallDepth, headerH, totalCorridorLength);
                    const headerBR = new THREE.Mesh(headerBGeo, wallMaterialB); // Right side header
                    headerBR.position.set(outerWallBX_Right, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_B);
                    scene.add(headerBR); worldObjects.push(headerBR); headerBR.name = `OuterWallHeader_B_R_F${i}`;
                    const headerBL = new THREE.Mesh(headerBGeo, wallMaterialB); // Left side header
                    headerBL.position.set(outerWallBX_Left, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_B);
                    scene.add(headerBL); worldObjects.push(headerBL); headerBL.name = `OuterWallHeader_B_L_F${i}`;
                }

                // Corridor Ceiling Plane
                const ceilingGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2 * SETTINGS.roomSize), totalCorridorLength);
                const ceiling = new THREE.Mesh(ceilingGeo, ceilingMaterial);
                ceiling.rotation.x = Math.PI / 2;
                ceiling.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, totalCorridorLength / 2);
                ceiling.castShadow = true;
                scene.add(ceiling);
                worldObjects.push(ceiling);

                // Corridor B Ceiling Plane
                const ceilingBGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2 * SETTINGS.roomSize), totalCorridorLength);
                const ceilingB = new THREE.Mesh(ceilingBGeo, ceilingMaterial);
                ceilingB.rotation.x = Math.PI / 2;
                ceilingB.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, (totalCorridorLength / 2) - 16 - totalCorridorLength);
                ceilingB.castShadow = true;
                scene.add(ceilingB);
                worldObjects.push(ceilingB);


                // --- Corridor Walls & Doors ---
                const wallAboveDoorHeight = SETTINGS.wallHeight - SETTINGS.doorHeight;

                // Create long header walls for A-Wing
                if (wallAboveDoorHeight > 0.01) { // Only create if there's actual height
                    const headerAGeo = new THREE.BoxGeometry(wallDepth, wallAboveDoorHeight, totalCorridorLength);
                    // Right side header (A-Wing)
                    const headerAR = new THREE.Mesh(headerAGeo, wallMaterialA);
                    headerAR.position.set(0, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, totalCorridorLength / 2);
                    scene.add(headerAR); worldObjects.push(headerAR); headerAR.name = `CorridorHeader_A_R_F${i}`;
                    // Left side header (A-Wing)
                    const headerAL = new THREE.Mesh(headerAGeo, wallMaterialA);
                    headerAL.position.set(SETTINGS.corridorWidth, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, totalCorridorLength / 2);
                    scene.add(headerAL); worldObjects.push(headerAL); headerAL.name = `CorridorHeader_A_L_F${i}`;
                }

                // Create long header walls for B-Wing
                if (wallAboveDoorHeight > 0.01) {
                    const headerBGeo = new THREE.BoxGeometry(wallDepth, wallAboveDoorHeight, totalCorridorLength);
                    const zPosB = -16 - totalCorridorLength / 2;
                    // Right side header (B-Wing)
                    const headerBR = new THREE.Mesh(headerBGeo, wallMaterialB);
                    headerBR.position.set(0, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, zPosB);
                    scene.add(headerBR); worldObjects.push(headerBR); headerBR.name = `CorridorHeader_B_R_F${i}`;
                    // Left side header (B-Wing)
                    const headerBL = new THREE.Mesh(headerBGeo, wallMaterialB);
                    headerBL.position.set(SETTINGS.corridorWidth, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, zPosB);
                    scene.add(headerBL); worldObjects.push(headerBL); headerBL.name = `CorridorHeader_B_L_F${i}`;
                }

                // Create individual door segments (walls and doors)
                for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                    const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                    const segmentStartZ = j * SETTINGS.corridorSegmentLength;
                    const segmentEndZ = (j + 1) * SETTINGS.corridorSegmentLength;

                    // --- A-Wing Doors and Walls ---
                    // Right side (X=0)
                    const isRightRed = (currentDoorIndex++ === redDoorIndex);
                    createDoorSegment(0, floorY, segmentCenterZ, segmentStartZ, segmentEndZ, isRightRed, false, i, j, 'R', wallMaterialA, blackDoorMaterial, redDoorMaterial, loadedFont, textMaterial);
                    // Left side (X=corridorWidth)
                    const isLeftRed = (currentDoorIndex++ === redDoorIndex);
                    createDoorSegment(SETTINGS.corridorWidth, floorY, segmentCenterZ, segmentStartZ, segmentEndZ, isLeftRed, true, i, j, 'L', wallMaterialA, blackDoorMaterial, redDoorMaterial, loadedFont, textMaterial);

                    // --- B-Wing Doors and Walls ---
                    const segmentBCenterZ = segmentCenterZ - 16 - totalCorridorLength;
                    const segmentBStartZ = segmentStartZ - 16 - totalCorridorLength;
                    const segmentBEndZ = segmentEndZ - 16 - totalCorridorLength;
                    // Right side (X=0)
                    const isBRightRed = (currentDoorIndex++ === redDoorIndex);
                    createDoorSegment(0, floorY, segmentBCenterZ, segmentBStartZ, segmentBEndZ, isBRightRed, false, i, j, 'B_R', wallMaterialB, navyDoorMaterial, redDoorMaterial, loadedFont, textMaterial);
                    // Left side (X=corridorWidth)
                    const isBLeftRed = (currentDoorIndex++ === redDoorIndex);
                    createDoorSegment(SETTINGS.corridorWidth, floorY, segmentBCenterZ, segmentBStartZ, segmentBEndZ, isBLeftRed, true, i, j, 'B_L', wallMaterialB, navyDoorMaterial, redDoorMaterial, loadedFont, textMaterial);
                }

                // --- Corridor End Walls ---
                // A-Wing End Walls
                const endWallFarGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.wallHeight, wallDepth);
                const endWallFar = new THREE.Mesh(endWallFarGeo, wallMaterialA);
                endWallFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength);
                scene.add(endWallFar); worldObjects.push(endWallFar); endWallFar.name = `EndWall_A_Far_F${i}`;
                const endWallNearGeo = new THREE.BoxGeometry(overallShaftActualWidth, SETTINGS.wallHeight, wallDepth);
                const endWallNear = new THREE.Mesh(endWallNearGeo, wallMaterialA);
                endWallNear.position.set(overallShaftActualCenterX, floorY + SETTINGS.wallHeight / 2, 0);
                scene.add(endWallNear); worldObjects.push(endWallNear); endWallNear.name = `EndWall_A_Near_F${i}`;

                // B-Wing End Walls
                const endWallBFarGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.wallHeight, wallDepth);
                const endWallBFar = new THREE.Mesh(endWallBFarGeo, wallMaterialB);
                endWallBFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, -16 - totalCorridorLength);
                scene.add(endWallBFar); worldObjects.push(endWallBFar); endWallBFar.name = `EndWall_B_Far_F${i}`;
                const endWallBNearGeo = new THREE.BoxGeometry(overallShaftActualWidth, SETTINGS.wallHeight, wallDepth);
                const endWallBNear = new THREE.Mesh(endWallBNearGeo, wallMaterialB);
                endWallBNear.position.set(overallShaftActualCenterX, floorY + SETTINGS.wallHeight / 2, -16);
                scene.add(endWallBNear); worldObjects.push(endWallBNear); endWallBNear.name = `EndWall_B_Near_F${i}`;

                // --- Corridor Lamps ---
                for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                    const lampZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                    // A-Wing Lamps
                    createStandardLamp(0, floorY + SETTINGS.wallHeight - 0.5, lampZ, i, `A_R_F${i}_D${j}`, scene, lights, lightBulbMaterial);
                    createStandardLamp(SETTINGS.corridorWidth, floorY + SETTINGS.wallHeight - 0.5, lampZ, i, `A_L_F${i}_D${j}`, scene, lights, lightBulbMaterial);
                    // B-Wing Lamps
                    const lampBZ = lampZ - 16 - totalCorridorLength;
                    createStandardLamp(0, floorY + SETTINGS.wallHeight - 0.5, lampBZ, i, `B_R_F${i}_D${j}`, scene, lights, lightBulbMaterial);
                    createStandardLamp(SETTINGS.corridorWidth, floorY + SETTINGS.wallHeight - 0.5, lampBZ, i, `B_L_F${i}_D${j}`, scene, lights, lightBulbMaterial);
                }
            }
        }

        // --- Escalators ---
        for (let i = 0; i < SETTINGS.numFloors; i++) {
            const floorY = i * SETTINGS.floorHeight;
            // A-Wing Escalators
            createEscalatorSet(floorY, totalCorridorLength, i, 'A', EscalatorMaterial, EscalatorEmbarkMaterial, loadedFont, textMaterial);
            // B-Wing Escalators
            createEscalatorSet(floorY, -16 - totalCorridorLength, i, 'B', EscalatorMaterial, EscalatorEmbarkMaterialB, loadedFont, textMaterial);
        }
    });
}

function createDoorSegment(x, y, zCenter, zStart, zEnd, isRed, isLeft, floorIndex, doorIndex, wing, wallMat, doorMat, redDoorMat, font, textMat) {
    const wallDepth = 0.1;
    const doorGeo = new THREE.BoxGeometry(SETTINGS.doorWidth, SETTINGS.doorHeight, SETTINGS.doorDepth);
    const door = new THREE.Mesh(doorGeo, isRed ? redDoorMat : doorMat);
    door.position.set(x, y + SETTINGS.doorHeight / 2, zCenter);
    door.castShadow = true;
    door.receiveShadow = true;
    door.userData = { type: 'door', isOpen: false, locked: isRed, isRed: isRed, floor: floorIndex, doorIndex: doorIndex, side: wing };
    door.name = `Door_${wing}_F${floorIndex}_D${doorIndex}`;
    scene.add(door);
    doors.push(door);

    const wallSegmentLength = (SETTINGS.corridorSegmentLength - SETTINGS.doorWidth) / 2;
    if (wallSegmentLength > 0.01) {
        const wallGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, wallSegmentLength);
        const wall1 = new THREE.Mesh(wallGeo, wallMat);
        wall1.position.set(x, y + SETTINGS.doorHeight / 2, zCenter - SETTINGS.doorWidth / 2 - wallSegmentLength / 2);
        scene.add(wall1); worldObjects.push(wall1); wall1.name = `DoorWall1_${wing}_F${floorIndex}_D${doorIndex}`;
        const wall2 = new THREE.Mesh(wallGeo, wallMat);
        wall2.position.set(x, y + SETTINGS.doorHeight / 2, zCenter + SETTINGS.doorWidth / 2 + wallSegmentLength / 2);
        scene.add(wall2); worldObjects.push(wall2); wall2.name = `DoorWall2_${wing}_F${floorIndex}_D${doorIndex}`;
    }

    const textSideOffset = isLeft ? -0.1 : 0.1;
    const textRotation = isLeft ? Math.PI / 2 : -Math.PI / 2;
    const textGeo = new TextGeometry(`${floorIndex}${doorIndex}`, { font: font, size: 0.2, height: 0.05 });
    textGeo.center();
    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.position.set(x + textSideOffset, y + SETTINGS.doorHeight + 0.2, zCenter);
    textMesh.rotation.y = textRotation;
    scene.add(textMesh);
}

function createOuterWall_SegmentFeatures(x, zCenter, segmentLength, y, wallHeight, wallDepth, wallMat, opaqueGlassMat, transparentGlassMat, roomId) {
    const windowWidth = segmentLength * WINDOW_WIDTH_RATIO;
    const windowHeight = wallHeight * WINDOW_HEIGHT_RATIO;
    const sillHeight = wallHeight * WINDOW_SILL_RATIO;
    const pillarWidth = (segmentLength - windowWidth) / 2;

    if (pillarWidth > 0.01) {
        const pillarGeo = new THREE.BoxGeometry(wallDepth, wallHeight, pillarWidth);
        const pillar1 = new THREE.Mesh(pillarGeo, wallMat);
        pillar1.position.set(x, y + wallHeight / 2, zCenter - windowWidth / 2 - pillarWidth / 2);
        scene.add(pillar1); worldObjects.push(pillar1); pillar1.name = `OuterPillar1_${roomId}`;
        const pillar2 = new THREE.Mesh(pillarGeo, wallMat);
        pillar2.position.set(x, y + wallHeight / 2, zCenter + windowWidth / 2 + pillarWidth / 2);
        scene.add(pillar2); worldObjects.push(pillar2); pillar2.name = `OuterPillar2_${roomId}`;
    }

    const windowGlassGeo = new THREE.BoxGeometry(wallDepth * 0.5, windowHeight, windowWidth);
    const windowGlass = new THREE.Mesh(windowGlassGeo, opaqueGlassMat);
    windowGlass.position.set(x, y + sillHeight + windowHeight / 2, zCenter);
    windowGlass.name = `WindowGlass_${roomId}`;
    scene.add(windowGlass);

    const roomData = allRoomsData.find(r => r.id === roomId);
    if (roomData) {
        roomData.windowGlass = windowGlass;
        roomData.opaqueMaterial = opaqueGlassMat;
        roomData.transparentMaterial = transparentGlassMat;
    }
}

function createRoomLamp(x, y, z, floorIndex, roomId, bulbMat) {
    const lightGroup = new THREE.Group();
    lightGroup.position.set(x, y, z);
    lightGroup.name = `Lamp_${roomId}`;

    const chain = new THREE.Mesh(lampChainGeo, lampChainMaterial);
    chain.position.y = 0.15;
    lightGroup.add(chain);

    const lampshade = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial.clone());
    lampshade.name = `Lampshade_${roomId}`;
    lightGroup.add(lampshade);

    const bulb = new THREE.Mesh(lampBulbGeo, bulbMat.clone());
    bulb.position.y = -0.3 + 0.08 * 2;
    bulb.name = `Bulb_${roomId}`;
    lightGroup.add(bulb);

    const bottomDisk = new THREE.Mesh(lampBottomDiskGeo, lampCorridorDiskMaterial.clone());
    bottomDisk.rotation.x = Math.PI / 2;
    bottomDisk.position.y = -0.11;
    bottomDisk.name = `Disk_${roomId}`;
    lightGroup.add(bottomDisk);

    const pointLight = new THREE.PointLight(0, 0, 5);
    pointLight.position.set(x, y - 0.3, z);
    scene.add(pointLight);

    lightGroup.userData = {
        pointLight,
        bulbMesh: bulb,
        bottomLightDisk: bottomDisk,
        floorIndex,
        isRoomLight: true,
        isDestroyed: false,
        isOn: false,
        animationState: {
            isAnimating: false,
            startTime: 0,
            duration: 250,
            startLightIntensity: 0,
            targetLightIntensity: 0,
            startBulbEmissive: 0,
            targetBulbEmissive: 0,
            startDiskEmissive: 0,
            targetDiskEmissive: 0,
        }
    };
    return lightGroup;
}

function createEscalatorSet(floorY, zOffset, floorIndex, wing, escalatorMat, embarkMat, font, textMat) {
    const escalatorYStep = SETTINGS.floorHeight;
    const upStartX = -SETTINGS.roomSize / 2;
    const upStartZ = zOffset + SETTINGS.escalatorLength / 2 + 2;
    const downStartX = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
    const downStartZ = zOffset + SETTINGS.escalatorLength / 2 + 2;

    createEscalator(upStartX, floorY, upStartZ, escalatorYStep, true, floorIndex, wing, escalatorMat, embarkMat, font, textMat);
    createEscalator(downStartX, floorY, downStartZ, -escalatorYStep, false, floorIndex, wing, escalatorMat, embarkMat, font, textMat);
}

function createEscalator(x, y, z, yStep, isUp, floorIndex, wing, escalatorMat, embarkMat, font, textMat) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    scene.add(group);

    const numSteps = 10;
    const stepLength = SETTINGS.escalatorLength / numSteps;
    const stepHeight = yStep / numSteps;
    const stepWidth = SETTINGS.escalatorWidth;
    const stepDepth = 0.1;

    const stepsArray = [];
    for (let i = 0; i < numSteps; i++) {
        const stepGeo = new THREE.BoxGeometry(stepWidth, stepDepth, stepLength);
        const step = new THREE.Mesh(stepGeo, escalatorMat);
        step.position.set(0, i * stepHeight, -SETTINGS.escalatorLength / 2 + i * stepLength + stepLength / 2);
        step.name = `EscalatorStep_${wing}_${floorIndex}_${isUp ? 'Up' : 'Down'}_${i}`;
        group.add(step);
        stepsArray.push(step);
    }

    const sideWallHeight = Math.abs(yStep) + 0.5;
    const sideWallGeo = new THREE.BoxGeometry(0.1, sideWallHeight, SETTINGS.escalatorLength);
    const sideWall1 = new THREE.Mesh(sideWallGeo, escalatorMat);
    sideWall1.position.set(-stepWidth / 2 - 0.05, yStep / 2, 0);
    group.add(sideWall1);
    const sideWall2 = new THREE.Mesh(sideWallGeo, escalatorMat);
    sideWall2.position.set(stepWidth / 2 + 0.05, yStep / 2, 0);
    group.add(sideWall2);

    const startPlatformGeo = new THREE.BoxGeometry(stepWidth, 0.2, 2);
    const startPlatform = new THREE.Mesh(startPlatformGeo, embarkMat);
    startPlatform.position.set(x, y - 0.1, z - SETTINGS.escalatorLength / 2 - 1);
    startPlatform.name = `EscalatorStart_${wing}_${floorIndex}_${isUp ? 'Up' : 'Down'}`;
    scene.add(startPlatform);
    worldObjects.push(startPlatform);

    const endPlatformGeo = new THREE.BoxGeometry(stepWidth, 0.2, 2);
    const endPlatform = new THREE.Mesh(endPlatformGeo, embarkMat);
    endPlatform.position.set(x, y + yStep - 0.1, z + SETTINGS.escalatorLength / 2 + 1);
    endPlatform.name = `EscalatorEnd_${wing}_${floorIndex}_${isUp ? 'Up' : 'Down'}`;
    scene.add(endPlatform);
    worldObjects.push(endPlatform);

    const escalatorId = `escalator_${wing}_${floorIndex}_${isUp ? 'up' : 'down'}`;
    escalatorSystems[escalatorId] = {
        direction: isUp ? 1 : -1,
        buttons: [],
        steps: stepsArray,
        floorIndex: floorIndex,
        wing: wing
    };
}

function createDynamicChainMesh(elevator, material) {
    const chainGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
    const chain = new THREE.Mesh(chainGeo, material);
    chain.name = `ElevatorChain_${elevator.id}`;
    return chain;
}

function createElevatorPistonMesh(elevator, material) {
    const pistonGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 8);
    const piston = new THREE.Mesh(pistonGeo, material);
    piston.name = `ElevatorPiston_${elevator.id}`;
    return piston;
}

function shoot() {
    if (!controls.isLocked) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    const intersects = raycaster.intersectObjects(lights, true);
    if (intersects.length > 0) {
        const intersectedGroup = findParentGroup(intersects[0].object);
        if (intersectedGroup && intersectedGroup.userData && !intersectedGroup.userData.isDestroyed) {
            destroyLamp(intersectedGroup);
        }
    } else {
        const projectileStartOffset = 0.5;
        const projectileDirection = new THREE.Vector3();
        camera.getWorldDirection(projectileDirection);
        const projectileStartPosition = new THREE.Vector3();
        camera.getWorldPosition(projectileStartPosition);
        projectileStartPosition.addScaledVector(projectileDirection, projectileStartOffset);
        projectileStartPosition.y -= 0.2;
        createProjectile(projectileStartPosition, projectileDirection, true);
    }
}

function findParentGroup(object) {
    let current = object;
    while (current) {
        if (current.isGroup && current.name.startsWith('Lamp_')) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

function destroyLamp(lampGroup) {
    if (lampGroup.userData.isDestroyed) return;
    lampGroup.userData.isDestroyed = true;

    const lampshade = lampGroup.children.find(child => child.name.includes('Lampshade'));
    if (lampshade) {
        const worldPosition = new THREE.Vector3();
        lampshade.getWorldPosition(worldPosition);
        const worldQuaternion = new THREE.Quaternion();
        lampshade.getWorldQuaternion(worldQuaternion);

        lampGroup.remove(lampshade);
        scene.add(lampshade);
        lampshade.position.copy(worldPosition);
        lampshade.quaternion.copy(worldQuaternion);

        lampshade.userData.velocity = new THREE.Vector3(0, -0.1, 0);
        fallenLampshades.push(lampshade);
    }

    if (lampGroup.userData.pointLight) {
        lampGroup.userData.pointLight.intensity = 0;
    }

    const bulb = lampGroup.children.find(child => child.name.includes('Bulb'));
    if (bulb) {
        bulb.material.emissiveIntensity = 0;
    }

    const bottomDisk = lampGroup.children.find(child => child.name.includes('Disk'));
    if (bottomDisk) {
        bottomDisk.material.emissiveIntensity = 0;
    }
}

function updateFallenLampshades(deltaTime) {
    for (let i = fallenLampshades.length - 1; i >= 0; i--) {
        const lampshade = fallenLampshades[i];

        // Apply gravity
        lampshade.userData.velocity.y += SETTINGS.gravity * deltaTime;
        lampshade.position.addScaledVector(lampshade.userData.velocity, deltaTime);

        let hitSomething = false;

        // Check collision with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const enemyObject = enemy.getObject();
            if (!enemyObject) continue;

            const enemyBox = new THREE.Box3().setFromObject(enemyObject);
            const lampshadeBox = new THREE.Box3().setFromObject(lampshade);

            if (lampshadeBox.intersectsBox(enemyBox)) {
                // Enemy hit by lampshade, insta-kill
                enemy.takeDamage(1000); // Use takeDamage with overkill
                if (enemy.health <= 0) {
                    playerScore += 150; // More points for environmental kill
                    updateUI();
                    const fallDirection = new THREE.Vector3(0, -1, 0); // Fall straight down
                    enemy.fallAndDisappear(fallDirection);
                    enemies.splice(j, 1);
                }
                hitSomething = true;
                break; // Lampshade hits one enemy and is consumed
            }
        }

        // Check collision with floor based on the floor the lampshade is on
        const lampshadeFloorIndex = Math.round(lampshade.position.y / SETTINGS.floorHeight);
        const floorY = lampshadeFloorIndex * SETTINGS.floorHeight;

        if (lampshade.position.y <= floorY) {
            lampshade.position.y = floorY;
            hitSomething = true;
        }

        if (hitSomething) {
            // If it hit an enemy OR the floor, remove the lampshade
            scene.remove(lampshade);
            fallenLampshades.splice(i, 1);
        }
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (playerOnGround) playerVelocity.y = SETTINGS.jumpVelocity; break;
        case 'ShiftLeft': isSprinting = true; break;
        case 'ControlLeft':
            if (playerState === 'upright') {
                playerState = 'crouching';
                playerHeight = 1.1;
            } else if (playerState === 'crouching') {
                playerState = 'prone';
                playerHeight = 0.5;
            }
            break;
        case 'KeyE': interact(); break;
        case 'KeyU': callElevator(1); break;
        case 'KeyJ': callElevator(-1); break;
        case 'KeyV': isWireframeView = !isWireframeView; toggleWireframe(isWireframeView); break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': isSprinting = false; break;
        case 'ControlLeft':
            if (playerState === 'prone') {
                playerState = 'crouching';
                playerHeight = 1.1;
            } else if (playerState === 'crouching') {
                playerState = 'upright';
                playerHeight = 1.7;
            }
            break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function callElevator(direction) {
    if (!activeElevator || activeElevator.isMoving) return;

    const currentFloor = Math.round(activeElevator.currentY / SETTINGS.floorHeight);
    let targetFloor = activeElevator.currentFloorIndexVal + direction;

    targetFloor = Math.max(activeElevator.minFloorIndex, Math.min(activeElevator.maxFloorIndex, targetFloor));

    if (targetFloor * SETTINGS.floorHeight !== activeElevator.targetY) {
        activeElevator.targetY = targetFloor * SETTINGS.floorHeight;
        activeElevator.isMoving = true;
        activeElevator.direction = direction;
        activeElevator.currentFloorIndexVal = targetFloor;
    }
}

function interact() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    const intersects = raycaster.intersectObjects([...doors, ...lights.flatMap(lg => lg.children)], true);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;

        if (doors.includes(intersectedObject)) {
            const door = intersectedObject;
            if (door.userData.type === 'door' && !door.userData.locked) {
                door.userData.isOpen = !door.userData.isOpen;
                const targetRotation = door.userData.isOpen ? (door.position.x === 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
                new TWEEN.Tween(door.rotation)
                    .to({ y: targetRotation }, 500)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .start();
            } else if (door.userData.type === 'garageDoor') {
                door.userData.isOpen = !door.userData.isOpen;
                door.userData.targetRotationX = door.userData.isOpen ? -Math.PI / 2 : 0;
                door.userData.isAnimating = true;
                if (!animatedGarageDoors.includes(door)) {
                    animatedGarageDoors.push(door);
                }
            }
        } else {
            const parentGroup = findParentGroup(intersectedObject);
            if (parentGroup && parentGroup.userData.isRoomLight) {
                toggleRoomLight(parentGroup);
            }
        }
    }
}

function toggleRoomLight(lampGroup) {
    if (lampGroup.userData.isDestroyed || lampGroup.userData.animationState.isAnimating) return;

    lampGroup.userData.isOn = !lampGroup.userData.isOn;
    const state = lampGroup.userData.animationState;
    state.isAnimating = true;
    state.startTime = performance.now();

    state.startLightIntensity = lampGroup.userData.pointLight.intensity;
    state.startBulbEmissive = lampGroup.userData.bulbMesh.material.emissiveIntensity;
    state.startDiskEmissive = lampGroup.userData.bottomLightDisk.material.emissiveIntensity;

    if (lampGroup.userData.isOn) {
        state.targetLightIntensity = 1.0;
        state.targetBulbEmissive = 1.0;
        state.targetDiskEmissive = 1.0;
    } else {
        state.targetLightIntensity = 0;
        state.targetBulbEmissive = 0;
        state.targetDiskEmissive = 0;
    }
}

function updatePlayer(deltaTime) {
    const speed = (isSprinting ? SETTINGS.playerSpeed * SETTINGS.sprintMultiplier : SETTINGS.playerSpeed) * deltaTime;
    const moveDirection = new THREE.Vector3(
        (moveRight ? 1 : 0) - (moveLeft ? 1 : 0),
        0,
        (moveBackward ? 1 : 0) - (moveForward ? 1 : 0)
    ).normalize();

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const right = new THREE.Vector3().crossVectors(camera.up, cameraDirection).normalize();
    const forward = new THREE.Vector3().crossVectors(right, camera.up).normalize();

    const finalMoveDirection = new THREE.Vector3().addScaledVector(right, moveDirection.x).addScaledVector(forward, moveDirection.z).normalize();

    const prevPosition = controls.getObject().position.clone();

    controls.getObject().position.addScaledVector(finalMoveDirection, speed);

    playerVelocity.y += SETTINGS.gravity * deltaTime;
    controls.getObject().position.y += playerVelocity.y * deltaTime;

    playerBox.setFromCenterAndSize(
        controls.getObject().position,
        new THREE.Vector3(0.5, playerHeight, 0.5)
    );

    if (checkCollision()) {
        controls.getObject().position.copy(prevPosition);
        playerVelocity.y = 0;
    }

    if (controls.getObject().position.y < playerHeight) {
        controls.getObject().position.y = playerHeight;
        playerVelocity.y = 0;
        playerOnGround = true;
    } else {
        playerOnGround = false;
    }

    const playerWorldPos = controls.getObject().position;
    allRoomsData.forEach(roomData => {
        if (roomData.door) {
            const doorPos = new THREE.Vector3();
            roomData.door.getWorldPosition(doorPos);
            const distanceToDoor = playerWorldPos.distanceTo(doorPos);
            const isDoorOpen = roomData.door.userData.isOpen;
            roomData.visibleByDoor = isDoorOpen && distanceToDoor < 8;
        }
        updateSingleRoomVisibility(roomData);
    });
}

function updateElevators(deltaTime) {
    elevators.forEach(elevator => {
        if (elevator.isMoving) {
            const moveStep = SETTINGS.elevatorSpeed * deltaTime * elevator.direction;
            elevator.currentY += moveStep;

            if ((elevator.direction > 0 && elevator.currentY >= elevator.targetY) ||
                (elevator.direction < 0 && elevator.currentY <= elevator.targetY)) {
                elevator.currentY = elevator.targetY;
                elevator.isMoving = false;
            }
            elevator.platform.position.y = elevator.currentY;
            elevator.roof.position.y = elevator.currentY + SETTINGS.wallHeight;
        }

        const chain = elevator.chain;
        const piston = elevator.platform.children.find(c => c.name.startsWith('ElevatorPiston'));
        if (chain) {
            const chainTopY = elevator.shaftCeiling.position.y - (floorDepth / 2);
            const chainBottomY = elevator.roof.position.y + 0.1;
            const chainLength = Math.max(0.1, chainTopY - chainBottomY);
            chain.scale.y = chainLength;
            chain.position.y = 0.1 + SETTINGS.wallHeight + chainLength / 2;
        }
        if (piston) {
            const pistonBottomY = elevator.shaftPit.position.y + (SETTINGS.floorHeight / 2);
            const pistonTopY = elevator.platform.position.y - 0.1;
            const pistonLength = Math.max(0.1, pistonTopY - pistonBottomY);
            piston.scale.y = pistonLength;
            piston.position.y = -pistonLength / 2 - 0.1;
        }
    });
}

function checkCollision() {
    const playerFeet = controls.getObject().position.clone();
    playerFeet.y -= playerHeight / 2;
    playerBox.setFromCenterAndSize(playerFeet, new THREE.Vector3(0.5, playerHeight, 0.5));

    const checkObjectCollision = (obj) => {
        if (obj.userData.isEnemy || (obj.parent && obj.parent.userData.isEnemy)) {
            return false;
        }
        if (obj.geometry) {
            if (!obj.geometry.boundingBox) {
                obj.geometry.computeBoundingBox();
            }
            if (obj.geometry.boundingBox) {
                const tempBox = obj.geometry.boundingBox.clone();
                tempBox.applyMatrix4(obj.matrixWorld);
                if (playerBox.intersectsBox(tempBox)) {
                    return true;
                }
            } else {
                const tempBox = new THREE.Box3().setFromObject(obj);
                if (playerBox.intersectsBox(tempBox)) {
                    return true;
                }
            }
        }
        return false;
    }

    for (const object of worldObjects) {
        if (object.isGroup) {
            // If it's a group, iterate through its children
            let collisionFound = false;
            object.traverse(child => {
                if (checkObjectCollision(child)) {
                    collisionFound = true;
                }
            });
            if (collisionFound) return true;
        } else {
            // If it's a single mesh, check directly
            if (checkObjectCollision(object)) {
                return true;
            }
        }
    }
    return false; // No collision
}

function updateEnemies(delta) {
    const playerPosition = new THREE.Vector3();
    controls.getObject().getWorldPosition(playerPosition);

    enemies.forEach(enemy => {
        if (enemy.health <= 0) return; // Skip dead enemies

        const enemyPosition = new THREE.Vector3();
        enemy.getObject().getWorldPosition(enemyPosition);

        const distanceToPlayer = playerPosition.distanceTo(enemyPosition);

        if (distanceToPlayer < ENEMY_SETTINGS.activationRadius) {
            // Simple line-of-sight check
            const directionToPlayer = playerPosition.clone().sub(enemyPosition).normalize();
            const raycaster = new THREE.Raycaster(enemyPosition, directionToPlayer, 0, ENEMY_SETTINGS.losMaxDistance);
            const intersects = raycaster.intersectObjects(worldObjects, true);

            let isPlayerVisible = false;
            if (intersects.length > 0) {
                const firstIntersected = intersects[0].object;
                // Check if the first intersected object is the player or part of the player
                if (firstIntersected === playerBox || (firstIntersected.parent && firstIntersected.parent === playerBox)) {
                    isPlayerVisible = true;
                }
            }

            if (isPlayerVisible) {
                enemy.aimAt(playerPosition);
                const now = clock.getElapsedTime();
                if (now - enemy.lastShotTime > ENEMY_SETTINGS.fireRate / 1000) {
                    enemy.shoot();
                    enemy.lastShotTime = now;

                    // Create a projectile from the enemy's gun
                    const projectileStartPosition = new THREE.Vector3();
                    enemy.gunGroup.getWorldPosition(projectileStartPosition);
                    createProjectile(projectileStartPosition, directionToPlayer, false, enemy.getObject());
                }
            } else {
                enemy.stand();
            }
        } else {
            enemy.stand();
        }
        enemy.update(delta);
    });
}

function handleCollisions() {
    const playerPosition = new THREE.Vector3();
    controls.getObject().getWorldPosition(playerPosition);

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        const projectilePosition = projectile.position;

        // Simplified collision detection for projectiles
        const raycaster = new THREE.Raycaster(projectilePosition, projectile.userData.velocity.clone().normalize(), 0, 1);
        const intersects = raycaster.intersectObjects(worldObjects, true);

        if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;

            // Avoid projectile hitting its firer immediately
            if (intersectedObject === projectile.userData.firer) {
                continue;
            }

            // Projectile hits something
            scene.remove(projectile);
            projectiles.splice(i, 1);
            const worldIndexProjectile = worldObjects.indexOf(projectile);
            if (worldIndexProjectile > -1) {
                worldObjects.splice(worldIndexProjectile, 1);
            }

            if (projectile.userData.firedByPlayer) {
                const enemy = enemies.find(e => e.getObject().children.includes(intersectedObject) || e.getObject() === intersectedObject);
                if (enemy) {
                    enemy.takeDamage(25); // Example damage
                    if (enemy.health <= 0) {
                        const enemyIndex = enemies.indexOf(enemy);
                        if (enemyIndex > -1) {
                            enemies.splice(enemyIndex, 1);
                        }
                        const worldIndex = worldObjects.indexOf(enemy.getObject());
                        if (worldIndex > -1) {
                            worldObjects.splice(worldIndex, 1);
                        }
                        scene.remove(enemy.getObject());

                        playerScore += 100;
                        updateUI();
                    }
                }
            } else if (intersectedObject === playerBox) {
                // Player is hit by an enemy projectile
                playerLives--;
                updateUI();
                if (playerLives <= 0) {
                    gameOver();
                } else {
                    // Respawn player
                    respawnPlayer();
                }
            }
        }
    }
}

function toggleGameMenuOverlay() {
    const menuOverlayContainer = document.getElementById('menuOverlayContainer'); const menuFrame = document.getElementById('menuFrame');

    if (menuOverlayContainer.style.display === 'block') {
        // Hide menu, resume game
        menuOverlayContainer.style.display = 'none';
        menuFrame.src = 'about:blank'; // Clear iframe content
        isGamePaused = false;
        if (document.pointerLockElement) { // If pointer was locked
            // Attempt to re-lock pointer, specific to how your game handles it
            // e.g., renderer.domElement.requestPointerLock(); or controls.lock();
        }
        // If you cancelAnimationFrame, you need to restart it here.
        // If animate checks isGamePaused, it will resume automatically.
        // For games like PacSnake or Paint that are event-driven, isGamePaused
        // might be checked before processing input events.

    } else {
        // Show menu, pause game
        isGamePaused = true;
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        // Adjust path to Menu.html based on current file's location
        // Example for a game in Arcade/GameName/Game.html:
        let pathToMenu = '../../Menu.html';
        // Example for Arcade.html:
        // let pathToMenu = '../Menu.html';

        // Dynamically calculate path (more robust)
        const currentPath = window.location.pathname;
        const pathSegments = currentPath.split('/');
        let relativePath = '';
        // Find 'Arcade' and go up one level from there for Menu.html in SHOP
        // Or, if Menu.html is at the root of SHOP, and games are in SHOP/Arcade/...
        const shopIndex = pathSegments.indexOf('SHOP'); // Assuming SHOP is in the path
        if (shopIndex > -1) {
            const depth = pathSegments.length - shopIndex - 1; // -1 because SHOP itself is one level
            for (let i = 0; i < depth; i++) {
                relativePath += '../';
            }
            pathToMenu = relativePath + 'Menu.html';
        } else { // Fallback if SHOP isn't in path (e.g. running from a different structure)
            const depth = currentPath.includes('/Arcade/') ? (currentPath.split('/Arcade/')[1].split('/').length) : 1;
            pathToMenu = '../'.repeat(depth) + 'Menu.html';
        }


        menuFrame.src = pathToMenu + '?isOverlay=true&returnLabel=Resume';
        menuOverlayContainer.style.display = 'block';
    }
}


// --- Animation Loop ---
function animate() {
    // animationFrameIdGame = requestAnimationFrame(animate); // If you re-assign it here if (isGamePaused) { // Optional: If you want to completely stop rAF and restart, you'd cancel it here. // But for a simple pause, just returning is often enough if rAF is called once outside. // If animate calls itself, you must ensure it doesn't get called when paused. return; } // ... rest of your game's animate function } // Ensure requestAnimationFrame(animate) is called to start the loop initially. // If animate calls itself (e.g. requestAnimationFrame(animate) is inside animate), // then the `if (isGamePaused) return;` is sufficient.
    if (isGameOver) return; // Stop animation loop if game is over

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (controls.isLocked) {
        updatePlayer(deltaTime);
        updateElevators(deltaTime);
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
        updateGarageDoors(deltaTime);
        updateUI();
        updateLODSystem();
        animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStepsB, escalatorStarts, escalatorStartsB, escalatorEnds, escalatorEndsB, SETTINGS, {
            escalatorMaterial: window.EscalatorMaterial,
            escalatorEmbarkMaterial: window.EscalatorEmbarkMaterial,
            escalatorEmbarkMaterialB: window.EscalatorEmbarkMaterialB // Pass B-Wing material
        });

        // --- Animate Room Lights ---
        lights.forEach(lightGroup => {
            if (lightGroup.userData.isRoomLight && lightGroup.userData.animationState.isAnimating) {
                const animationState = lightGroup.userData.animationState;
                const elapsed = performance.now() - animationState.startTime;
                const progress = Math.min(elapsed / animationState.duration, 1);

                // Simple linear interpolation
                lightGroup.userData.pointLight.intensity = THREE.MathUtils.lerp(
                    animationState.startLightIntensity,
                    animationState.targetLightIntensity,
                    progress
                );
                lightGroup.userData.bulbMesh.material.emissiveIntensity = THREE.MathUtils.lerp(
                    animationState.startBulbEmissive,
                    animationState.targetBulbEmissive,
                    progress
                );
                lightGroup.userData.bottomLightDisk.material.emissiveIntensity = THREE.MathUtils.lerp(
                    animationState.startDiskEmissive,
                    animationState.targetDiskEmissive,
                    progress
                );
                lightGroup.userData.bulbMesh.material.needsUpdate = true;
                lightGroup.userData.bottomLightDisk.material.needsUpdate = true;

                if (progress >= 1) {
                    animationState.isAnimating = false; // Animation finished
                }
            }
        });

        // --- FPS Counter ---
        if (!window._fpsTimes) window._fpsTimes = [];
        const now = performance.now();
        window._fpsTimes.push(now);
        // Only keep the last 1 second of frame times
        while (window._fpsTimes.length > 2 && (now - window._fpsTimes[0]) > 1000) {
            window._fpsTimes.shift();
        }
        const fps = (window._fpsTimes.length - 1) / ((window._fpsTimes[window._fpsTimes.length - 1] - window._fpsTimes[0]) / 1000);
        const fpsText = `FPS: ${fps.toFixed(1)}`;

        // --- Debug Overlay Update ---
        const playerPos = controls.getObject().position;
        document.getElementById('playerCoords').innerText = `Player: (x: ${playerPos.x.toFixed(2)}, y: ${playerPos.y.toFixed(2)}, z: ${playerPos.z.toFixed(2)})`;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2(0, 0); // Center of the screen
        raycaster.setFromCamera(pointer, camera);

        // Intersect with world objects, doors, and lights
        const objectsToCheck = [...worldObjects, ...doors, ...lights.flatMap(lg => lg.children)]; // Flatten lights group
        const intersects = raycaster.intersectObjects(objectsToCheck, false); // Don't check recursively unless needed

        let pointedObjectInfo = "Looking at: None"; // Default text

        if (intersects.length > 0) {
            const hit = intersects[0]; // Get the full intersection result
            const hitObject = hit.object;

            // Get common info
            const objectId = hitObject.id;
            const objectName = hitObject.name || "Unnamed"; // <-- Get the name, provide fallback
            const worldPosition = new THREE.Vector3();
            hitObject.getWorldPosition(worldPosition); // Calculate world position

            // Get dimensions (handle different geometry types)
            let dimensions = "N/A";
            let objectType = "Unknown"; // Default type

            if (hitObject.geometry) {
                objectType = hitObject.geometry.type || "Unknown"; // Get geometry type
                if (hitObject.geometry.parameters) {
                    const params = hitObject.geometry.parameters;
                    if (objectType === 'BoxGeometry') {
                        dimensions = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}, D: ${params.depth?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'PlaneGeometry') {
                        dimensions = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'ConeGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'SphereGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'CircleGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                    }
                    // Add more geometry types here if needed
                }
            }

            // Construct the output string - Added Name
            pointedObjectInfo = `Looking at: Name: ${objectName} | ID: ${objectId} | ` +
                `Type: ${objectType} | ` +
                `Dims: ${dimensions} | ` +
                `World: (${worldPosition.x.toFixed(2)}, ${worldPosition.y.toFixed(2)}, ${worldPosition.z.toFixed(2)})`;

            // You could still add specific checks, e.g., if it's a door or part of a light
            if (doors.includes(hitObject)) {
                pointedObjectInfo += ` (Door - Red: ${hitObject.userData.isRed})`;
            } else if (lights.some(lg => lg.children.includes(hitObject))) {
                pointedObjectInfo += ` (Part of Light)`;
            } else { // Check for elevator parts among other objects
                const hitElevator = elevators.find(e => e.platform === hitObject || e.roof === hitObject);
                if (hitElevator) {
                    pointedObjectInfo += ` (Elevator ${hitElevator.id} ${hitObject === hitElevator.platform ? 'Platform' : 'Roof'})`;
                }
            }
            // Add more specific checks if needed

        }

        // --- Find object player is standing on ---
        let standingOnInfo = "None";
        const playerFeet = controls.getObject().position.clone();
        playerFeet.y -= playerHeight / 2 + 0.01; // Just below player's feet

        // Use a small box under the player to check for collisions with worldObjects
        const playerStandBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(playerFeet.x, playerFeet.y - 0.05, playerFeet.z),
            new THREE.Vector3(0.45, 0.12, 0.45)
        );

        let foundStanding = null;
        for (const obj of worldObjects) {
            // Compute or get bounding box
            let objBox;
            if (obj.geometry && obj.geometry.boundingBox) {
                objBox = obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld);
            } else {
                objBox = new THREE.Box3().setFromObject(obj);
            }
            if (playerStandBox.intersectsBox(objBox)) {
                foundStanding = obj;
                break;
            }
        }

        if (foundStanding) {
            // Get info for the object
            const obj = foundStanding;
            const objId = obj.id;
            const objName = obj.name || "Unnamed";
            const objType = obj.geometry?.type || "Unknown";
            let objDims = "N/A";
            if (obj.geometry && obj.geometry.parameters) {
                const params = obj.geometry.parameters;
                if (objType === 'BoxGeometry') {
                    objDims = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}, D: ${params.depth?.toFixed(2) ?? '?'}`;
                } else if (objType === 'PlaneGeometry') {
                    objDims = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                } else if (objType === 'ConeGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                } else if (objType === 'SphereGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                } else if (objType === 'CircleGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                }
            }
            const objWorldPos = new THREE.Vector3();
            obj.getWorldPosition(objWorldPos);
            standingOnInfo = `Name: ${objName} | ID: ${objId} | Type: ${objType} | Dims: ${objDims} | World: (${objWorldPos.x.toFixed(2)}, ${objWorldPos.y.toFixed(2)}, ${objWorldPos.z.toFixed(2)})`;
        }

        // Show standing on info in playerCoords and pointedObject
        document.getElementById('playerCoords').innerText += ` | Standing on: ${standingOnInfo}`;
        document.getElementById('pointedObject').innerText = pointedObjectInfo + ` | Standing on: ${standingOnInfo}`;

        // --- Find objects player is colliding with ---
        //const playerStandBox = new THREE.Box3().setFromCenterAndSize(
        //    new THREE.Vector3(playerFeet.x, playerFeet.y - 0.05, playerFeet.z),
        //    new THREE.Vector3(0.45, 0.12, 0.45)
        //);

        let collidingObjects = [];
        for (const obj of worldObjects) {
            let objBox;
            if (obj.geometry && obj.geometry.boundingBox) {
                objBox = obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld);
            } else {
                objBox = new THREE.Box3().setFromObject(obj);
            }
            if (playerStandBox.intersectsBox(objBox)) {
                collidingObjects.push(obj);
            }
        }

        let collisionInfo = "None";
        if (collidingObjects.length > 0) {
            collisionInfo = collidingObjects.map(obj => {
                const objId = obj.id;
                const objName = obj.name || "Unnamed";
                const objType = obj.geometry?.type || "Unknown";
                const worldPos = new THREE.Vector3();
                obj.getWorldPosition(worldPos);
                return `Name: ${objName}, ID: ${objId}, Type: ${objType}, World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`;
            }).join(" | ");
        }

        // Update the output (adjust element IDs as needed)
        document.getElementById('playerCoords').innerText = `Player: (${controls.getObject().position.x.toFixed(2)}, ${controls.getObject().position.y.toFixed(2)}, ${controls.getObject().position.z.toFixed(2)}) | Colliding with: ${collisionInfo}`;
        document.getElementById('pointedObject').innerText = pointedObjectInfo + ` | Colliding with: ${collisionInfo}`;
        const playerCoordsElem = document.getElementById('playerCoords');
        if (playerCoordsElem) {
            playerCoordsElem.innerText += ` | ${fpsText}`;
        }
        // --- End Debug Overlay Update ---

        // Add this line to update the FPS counter in a dedicated element
        const fpsElem = document.getElementById('fpsCounter');
        if (fpsElem) {
            fpsElem.innerText = fpsText;
        }

        // --- Find object directly beneath the player using a downward ray ---
        const maxDistance = 2; // Adjust as needed
        const downDirection = new THREE.Vector3(0, -1, 0);
        const downRaycaster = new THREE.Raycaster(controls.getObject().position, downDirection, 0, maxDistance);
        const downIntersections = downRaycaster.intersectObjects(worldObjects, true);

        let belowCollisionInfo = "None";
        if (downIntersections.length > 0) {
            const hit = downIntersections[0]; // closest intersected object
            const hitObject = hit.object;
            const objName = hitObject.name || "Unnamed";

            // Check if the player is over "Escalator Up..." or "Escalator Down..."
            if (objName.includes("Escalator Up Start")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.up[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
                escalatorStepsB.up[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterialB; // Change material
                });
            } else if (objName.includes("Escalator Down Start")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.down[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
                escalatorStepsB.down[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterialB; // Change material
                });
            }

            // Reset step materials if above "Left Escalator Down End...", "Right Escalator Up End...", or any floor object
            if (
                objName.includes("Escalator Down End") ||
                objName.includes("Escalator Up End") ||
                objName.includes("Floor") // Check if "Floor" is anywhere in the name
            ) {
                for (const steps of Object.values(escalatorSteps.up)) {
                    steps.forEach(step => {
                        step.material = window.EscalatorMaterial; // Reset material
                    });
                }
                for (const steps of Object.values(escalatorSteps.down)) {
                    steps.forEach(step => {
                        step.material = window.EscalatorMaterial; // Reset material
                    });
                }
            }

            const objId = hitObject.id;
            const objType = hitObject.geometry?.type || "Unknown";
            const worldPos = new THREE.Vector3();
            hitObject.getWorldPosition(worldPos);
            belowCollisionInfo = `Name: ${objName}, ID: ${objId}, Type: ${objType}, World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`;
        }

        // Update the output elements with the collision info:
        document.getElementById('playerCoords').innerText =
            `Player: (${controls.getObject().position.x.toFixed(2)}, ${controls.getObject().position.y.toFixed(2)}, ${controls.getObject().position.z.toFixed(2)}) | Below: ${belowCollisionInfo}`;
        document.getElementById('pointedObject').innerText =
            pointedObjectInfo + ` | Below: ${belowCollisionInfo}`;
    }

    renderer.render(scene, camera);
}

function updateGarageDoors(deltaTime) {
    for (let i = animatedGarageDoors.length - 1; i >= 0; i--) {
        const door = animatedGarageDoors[i];
        if (door.userData.isAnimating) {
            const currentRotation = door.rotation.x;
            const targetRotation = door.userData.targetRotationX;
            const rotationSpeed = Math.PI / 2 * deltaTime * 0.8; // Adjust speed as needed (radians per second)

            if (Math.abs(currentRotation - targetRotation) < rotationSpeed) {
                door.rotation.x = targetRotation;
                door.userData.isAnimating = false;
                animatedGarageDoors.splice(i, 1); // Remove from active animation list
            } else {
                door.rotation.x += Math.sign(targetRotation - currentRotation) * rotationSpeed;
            }
        } else {
            // Should not happen if logic is correct, but good for cleanup
            animatedGarageDoors.splice(i, 1);
        }
    }
}

// --- LOD System Functions ---
// Helper function to parse roomId (e.g., "R_F0_D0", "B_L_F1_D2")
function parseRoomId(roomId) {
    const parts = roomId.split('_');
    let isBWing = false;
    let side, floorStr, doorStr;

    if (parts[0] === 'B') {
        isBWing = true;
        side = parts[1]; // R or L
        floorStr = parts[2]; // F<number>
        doorStr = parts[3]; // D<number>
    } else {
        side = parts[0]; // R or L
        floorStr = parts[1]; // F<number>
        doorStr = parts[2]; // D<number>
    }

    const floorIndex = parseInt(floorStr.substring(1));
    const doorIndex = parseInt(doorStr.substring(1));

    return { isBWing, side, floorIndex, doorIndex };
}

// Helper function to check if player is inside a given room
function isPlayerInRoom(playerWorldPos, roomData) {
    if (!roomData || !roomData.id || !controls.isLocked) return false;

    const { isBWing, side, floorIndex, doorIndex } = parseRoomId(roomData.id);

    const floorY = floorIndex * SETTINGS.floorHeight;
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    let segmentCenterZ;
    if (isBWing) {
        segmentCenterZ = ((doorIndex + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
    } else {
        segmentCenterZ = (doorIndex + 0.5) * SETTINGS.corridorSegmentLength;
    }

    const roomXCenter = (side === 'R') ? -SETTINGS.roomSize / 2 : SETTINGS.corridorWidth + SETTINGS.roomSize / 2;

    const roomMinX = roomXCenter - SETTINGS.roomSize / 2;
    const roomMaxX = roomXCenter + SETTINGS.roomSize / 2;
    const roomMinZ = segmentCenterZ - SETTINGS.corridorSegmentLength / 2;
    const roomMaxZ = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;

    if (playerWorldPos.x < roomMinX || playerWorldPos.x > roomMaxX || playerWorldPos.z < roomMinZ || playerWorldPos.z > roomMaxZ) {
        return false;
    }
    const playerFeetY = playerWorldPos.y - playerHeight; // playerHeight is camera offset
    if (playerFeetY < floorY - 0.1 || playerFeetY > floorY + SETTINGS.wallHeight + 0.1) { // Added small tolerance
        return false;
    }
    return true;
}

function updateSingleRoomVisibility(roomData) {
    if (!roomData || !roomData.contentsGroup || !roomData.lamp) return;

    const playerWorldPos = controls.getObject().position;
    const playerIsInThisRoom = isPlayerInRoom(playerWorldPos, roomData);

    const shouldBeVisible = roomData.visibleByDoor || roomData.visibleByWindow || playerIsInThisRoom;

    if (roomData.contentsGroup.visible !== shouldBeVisible) {
        roomData.contentsGroup.visible = shouldBeVisible;
        // console.log(`Room ${roomData.id} contents visibility: ${shouldBeVisible} (Door: ${roomData.visibleByDoor}, Window: ${roomData.visibleByWindow}, Inside: ${playerIsInThisRoom})`);
    }

    const roomLampGroup = roomData.lamp;
    if (roomLampGroup.userData && roomLampGroup.userData.pointLight) {
        if (shouldBeVisible && roomLampGroup.userData.isOn && !roomLampGroup.userData.isDestroyed) {
            // Check animation state to avoid overriding a fade-out
            if (!roomLampGroup.userData.animationState.isAnimating || roomLampGroup.userData.animationState.targetLightIntensity > 0) {
                roomLampGroup.userData.pointLight.intensity = 1.0; // Default "on" intensity for room lights
            }
        } else {
            roomLampGroup.userData.pointLight.intensity = 0;
        }
    }
}

function updateLODSystem() {
    const playerPos = controls.getObject().position;
    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);

    // Check if player is generally outside the main building's corridor/room area
    const isOutsideBuilding = playerPos.x < -SETTINGS.roomSize + 1 || playerPos.x > SETTINGS.corridorWidth + SETTINGS.roomSize - 1;

    allRoomsData.forEach(roomData => {
        let isVisibleByWindowThisFrame = false;

        if (roomData.windowGlass && isOutsideBuilding && !roomData.visibleByDoor) {
            // Check line of sight for window visibility from outside
            // (This part of your existing logic determines if contents should be visible)
            // For simplicity, we'll assume if conditions are met, player *could* see in.
            // The actual visibility check (distance, angle) is already in your code:
            // const windowPos = new THREE.Vector3(); roomData.windowGlass.getWorldPosition(windowPos); ...
            // For this example, let's assume `isVisibleByWindowThisFrame` is determined by your existing checks.
            // Replace this with your more detailed dotProduct/distance check
            const windowPos = new THREE.Vector3(); roomData.windowGlass.getWorldPosition(windowPos);
            if (playerPos.distanceTo(windowPos) < 35) { // Simplified check
                const vectorToWindow = new THREE.Vector3().subVectors(windowPos, playerPos).normalize();
                const dotProduct = playerDirection.dot(vectorToWindow);
                if (dotProduct > 0.25) {
                    isVisibleByWindowThisFrame = true;
                }
            }

            // Now, manage the window material based on this
            if (isVisibleByWindowThisFrame) {
                if (roomData.transparentMaterial && roomData.windowGlass.material !== roomData.transparentMaterial) {
                    roomData.windowGlass.material = roomData.transparentMaterial;
                }
            } else {
                if (roomData.opaqueMaterial && roomData.windowGlass.material !== roomData.opaqueMaterial) {
                    roomData.windowGlass.material = roomData.opaqueMaterial;
                }
            }
        }
        if (roomData.visibleByWindow !== isVisibleByWindowThisFrame) {
            roomData.visibleByWindow = isVisibleByWindowThisFrame;
            updateSingleRoomVisibility(roomData);
        }
    });
}

// --- Start the application ---
init();

//const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Example geometry for an enemy
//const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Example material for an enemy

//const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
//enemy.position.set(x, y, z); // Set the enemy's position
//scene.add(enemy);
//enemies.push(enemy); // Add the enemy to the array

// // Inside your main game loop (e.g., in mainTMPd.js)
// let playerOnEscVisualState = { type: null, floor: null, wing: null }; // Persistent state for visuals

// // After calling calculateEscalatorBoost:
// const escalatorActualStatus = calculateEscalatorBoost(...);

// if (!escalatorActualStatus.onEscalator && playerOnEscVisualState.type !== null) {
//     // Player is confirmed to be off all escalator steps by calculateEscalatorBoost,
//     // but visuals might still be active for playerOnEscVisualState.
//     const oldEscGroup = allEscalatorStarts.find( /* logic to find based on playerOnEscVisualState */ );
//     if (oldEscGroup && oldEscGroup.steps[playerOnEscVisualState.floor]) {
//         oldEscGroup.steps[playerOnEscVisualState.floor].forEach(step => {
//             step.material = materials.escalatorMaterial;
//         });
//     }
//     playerOnEscVisualState.type = null;
//     playerOnEscVisualState.floor = null;
//     playerOnEscVisualState.wing = null;
// }

// // Then call updateEscalatorStepVisuals, potentially updating playerOnEscVisualState
// // if the player steps on a new start platform.
// updateEscalatorStepVisuals(playerWorldPos, playerHeight, playerOnEscVisualState, ...);

// // And ensure playerOnEscVisualState is also updated if player gets on steps not via start platform
// if (escalatorActualStatus.onEscalator && playerOnEscVisualState.type === null) {
//    // Player got on steps directly, update visual state to match actual
//    playerOnEscVisualState.type = escalatorActualStatus.type;
//    playerOnEscVisualState.floor = escalatorActualStatus.floor;
//    playerOnEscVisualState.wing = escalatorActualStatus.wing;
//    // Optionally, trigger material change here too if not covered by updateEscalatorStepVisuals
// }
''