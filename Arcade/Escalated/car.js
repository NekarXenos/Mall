// car.js
// Modular car model for Three.js scene
// Usage: import { addGarageCar } from './car.js';
//        addGarageCar(scene, new THREE.Vector3(x, y, z));

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Store reference to the car mesh
let lastGarageCar = null;
// Store vehicle physics for driving mode
export const vehiclePhysics = {
    speed: 0,
    maxSpeed: 30,
    acceleration: 2,
    drag: 0.98, // Air resistance
    brake: 0.9,
    turnRate: 0.2, // How fast the steering angle changes
    maxSteer: Math.PI / 6, // 30 degrees
    steerAngle: 0,
    wheelRadius: 0.3,
    wheelCircumference: 2 * Math.PI * 0.3,
    wheelObjects: [] // To store wheel meshes for rotation
};

// Constants for car dimensions
const CAR_LENGTH = 4; // Used for calculating turning radius
const WHEEL_BASE = 2.5; // Distance between front and back wheels

export function addGarageCar(scene, position) {
    if (!position) {
        throw new Error('Car position is required for addGarageCar()');
    }
    
    // --- Lighting for car (optional, can be skipped if scene already has lights) ---
    RectAreaLightUniformsLib.init();
    
    // --- Create Custom Car Model (from CarTest.html) ---
    const carGroup = createCustomCar();
    carGroup.name = "GarageCar"; // Set name for debug overlay
    lastGarageCar = carGroup; // Store reference
    
    // Apply position
    carGroup.position.copy(position);
    
    // Add to scene
    scene.add(carGroup);
    
    return carGroup;
}

// Create car model from CarTest.html
function createCustomCar() {
    const carGroup = new THREE.Group();
    carGroup.name = "CarGroup";

    // Chassis (Red Box: 1.8, 0.7, 4) translate y+0.4
    const chassisGeometry = new THREE.BoxGeometry(1.8, 0.5, CAR_LENGTH);
    const chassisMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const chassisMesh = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassisMesh.position.y = 0.4;
    carGroup.add(chassisMesh);

    // Cockpit (Blue Cylinder: 0.6, 0.7, 4 segments) translate (0, 0.95, -1)
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    const cockpitGeometry = new THREE.CylinderGeometry(0.5, 0.9, 0.3, 4);
    const cockpitMaterial = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    const cockpitMesh = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpitMesh.rotation.y = Math.PI / 4;
    cockpitMesh.position.set(0, 0.8, -0.5);
    carGroup.add(cockpitMesh);

    // Wheel Dimensions
    const wheelRadius = 0.3;
    const wheelHeight = 0.3;
    const wheelSegments = 8;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelHeight, wheelSegments);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 50 });

    // Wheel Setup
    const wheelPositions = [
        { x: -0.9, y: 0.125, z: 1.25, name: 'FL' }, // Front Left
        { x: 0.9, y: 0.125, z: 1.25, name: 'FR' },  // Front Right
        { x: -0.9, y: 0.125, z: -1.25, name: 'BL' }, // Back Left
        { x: 0.9, y: 0.125, z: -1.25, name: 'BR' }   // Back Right
    ];

    wheelPositions.forEach(pos => {
        // Create a Group for each wheel to handle multiple rotations
        const wheelPivot = new THREE.Group();
        wheelPivot.position.set(pos.x, pos.y, pos.z);

        // Create the wheel mesh
        const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
        // Initial Z-rotation (90 degrees) to make it stand up
        wheelMesh.rotation.z = Math.PI / 2;
        
        // Add the wheel mesh to its pivot group
        wheelPivot.add(wheelMesh);
        carGroup.add(wheelPivot);

        // Store the mesh and pivot for later manipulation
        vehiclePhysics.wheelObjects.push({
            mesh: wheelMesh,
            pivot: wheelPivot,
            position: pos,
            isFront: pos.z > 0
        });
    });

    return carGroup;
}

// --- Export additional car functions ---
export function resetCarPhysics() {
    vehiclePhysics.speed = 0;
    vehiclePhysics.steerAngle = 0;
}

// Export a getter for the last car added
export function getLastGarageCar() {
    return lastGarageCar;
}

/* Legacy code - keeping for reference
    const placeholderGeometry = new THREE.BoxGeometry(4.556, 1.2, 2);
    const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 });
    const placeholderBody = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    placeholderBody.name = "GarageCarPlaceholder"; // Set name for debug overlay
    lastGarageCar = placeholderBody; // Store reference
    // Position placeholder so its base is at `position.y`
    placeholderBody.position.set(position.x, position.y + placeholderGeometry.parameters.height / 2, position.z);
    scene.add(placeholderBody);
    addWheels(placeholderBody);
*/

// Legacy function for old car model (kept for compatibility)
function addWheels(vehicleBody) {
    const bodyBox = new THREE.Box3().setFromObject(vehicleBody);
    const bodySize = bodyBox.getSize(new THREE.Vector3());
    const wheelDiameter = bodySize.y * 0.65;
    const wheelRadius = wheelDiameter / 2;
    const wheelThickness = wheelRadius / 1.5;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 32);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0.1
    });
    wheelGeometry.rotateZ(Math.PI / 2);
    const rearOffsetZ = (bodySize.z / 2) - (bodySize.z / 5);
    const frontOffsetZ = -((bodySize.z / 2) - (bodySize.z / 5));
    const offsetX = bodySize.x * 0.4;
    const offsetXback = bodySize.x * 0.45;
    const offsetY = wheelRadius;
    const wheelPositions = [
        new THREE.Vector3(offsetX, offsetY, frontOffsetZ),
        new THREE.Vector3(-offsetX, offsetY, frontOffsetZ),
        new THREE.Vector3(offsetXback, offsetY, rearOffsetZ),
        new THREE.Vector3(-offsetXback, offsetY, rearOffsetZ)
    ];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.castShadow = true; // Ensure wheels cast shadows
        wheel.position.copy(pos); // Set position local to the vehicleBody
        vehicleBody.add(wheel); // Add wheel as a child of the car body
    });
}

// In enterCar() function
function enterCar() {
    originalCarPosition = carObject.position.clone(); // Store original position
    // Rest of the function
}

// Add collision detection function for the car
export function checkCarCollision(carBody, worldObjects) {
    if (!carBody) return { collided: false };

    // Create a bounding box for the car
    const carBox = new THREE.Box3().setFromObject(carBody);
    
    // Check collision with world objects
    for (const obj of worldObjects) {
        if (!obj || !obj.geometry) continue;
        
        // Skip if it's the car itself or other vehicles
        if (obj === carBody || obj.userData.type === 'car') continue;
        
        // Create bounding box for the object
        const objBox = new THREE.Box3().setFromObject(obj);
        
        // Check if boxes intersect
        if (carBox.intersectsBox(objBox)) {
            return {
                collided: true,
                object: obj,
                carBox: carBox,
                objBox: objBox
            };
        }
    }
    
    return { collided: false };
}

// --- Car Driving Functions ---
export function updateCar(carBody, deltaTime, keyState, worldObjects = []) {
    // Store original position for collision rollback
    const originalPosition = carBody.position.clone();
    const originalRotation = carBody.rotation.clone();
    
    // Handle Acceleration/Braking
    if (keyState['w']) {
        vehiclePhysics.speed += vehiclePhysics.acceleration * deltaTime;
    } else if (keyState['s']) {
        vehiclePhysics.speed -= vehiclePhysics.acceleration * deltaTime;
    }
    
    // Apply regular drag/friction
    //vehiclePhysics.speed *= vehiclePhysics.drag ** deltaTime;
            
    // Handbrake logic
    if (keyState[' ']) {
        vehiclePhysics.speed *= 0.1 ** deltaTime; // Apply a very high friction/drag
        vehiclePhysics.steerAngle *= 0.5 ** deltaTime; // Drastically reduce steering
    } else {
        // Apply regular drag/friction when handbrake is not active
        vehiclePhysics.speed *= vehiclePhysics.drag ** deltaTime;
        // Self-center steering (optional, helps stabilize)
        vehiclePhysics.steerAngle *= 0.95 ** deltaTime;
    }

    // Self-center steering
    vehiclePhysics.steerAngle *= 0.95 ** deltaTime;

    // Clamp speed
    vehiclePhysics.speed = Math.min(
        Math.max(vehiclePhysics.speed, -vehiclePhysics.maxSpeed), 
        vehiclePhysics.maxSpeed
    );

    // Handle Steering
    if (keyState['a']) {
        vehiclePhysics.steerAngle += vehiclePhysics.turnRate * deltaTime;
    } else if (keyState['d']) {
        vehiclePhysics.steerAngle -= vehiclePhysics.turnRate * deltaTime;
    }

    // Clamp steering angle
    vehiclePhysics.steerAngle = Math.min(
        Math.max(vehiclePhysics.steerAngle, -vehiclePhysics.maxSteer), 
        vehiclePhysics.maxSteer
    );

    // Apply movement only if there is significant speed
    if (Math.abs(vehiclePhysics.speed) > 0.01) {
        // Calculate turning radius (r = L / tan(steerAngle))
        if (Math.abs(vehiclePhysics.steerAngle) > 0.001) {
            // If steering, rotate the car around the turning circle
            const turnRadius = WHEEL_BASE / Math.tan(vehiclePhysics.steerAngle);
            const angularVelocity = vehiclePhysics.speed / turnRadius;
            carBody.rotation.y += angularVelocity * deltaTime;
        }

        // Move the car in its current forward direction
        carBody.translateZ(vehiclePhysics.speed * deltaTime);
        
        // Check for collisions after movement (if worldObjects provided)
        if (worldObjects.length > 0) {
            const collision = checkCarCollision(carBody, worldObjects);
            
            if (collision.collided) {
                // Rollback position and rotation
                carBody.position.copy(originalPosition);
                carBody.rotation.copy(originalRotation);
                
                // Stop the car or bounce back slightly
                vehiclePhysics.speed *= -0.2; // Small bounce back effect
                
                // Optional: Add collision effects
                console.log(`Car collided with: ${collision.object.name || 'unnamed object'}`);
                
                // Return collision info for main.js to handle
                return { collided: true, object: collision.object };
            }
        }
    }

    // Update wheel rotations
    const wheelRotationSpeed = (vehiclePhysics.speed * deltaTime) / vehiclePhysics.wheelRadius;
    
    vehiclePhysics.wheelObjects.forEach(wheel => {
        // Rolling rotation (around x-axis since wheel is rotated)
        wheel.mesh.rotation.x += wheelRotationSpeed;
        
        // Apply steering to front wheels
        if (wheel.isFront) {
            wheel.pivot.rotation.y = vehiclePhysics.steerAngle;
        }
    });
    
    return { collided: false };
}

// Add boundary checking function
export function checkCarBoundaries(carBody, boundaries = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }) {
    const position = carBody.position;
    let corrected = false;
    
    if (position.x < boundaries.minX) {
        position.x = boundaries.minX;
        vehiclePhysics.speed = 0;
        corrected = true;
    } else if (position.x > boundaries.maxX) {
        position.x = boundaries.maxX;
        vehiclePhysics.speed = 0;
        corrected = true;
    }
    
    if (position.z < boundaries.minZ) {
        position.z = boundaries.minZ;
        vehiclePhysics.speed = 0;
        corrected = true;
    } else if (position.z > boundaries.maxZ) {
        position.z = boundaries.maxZ;
        vehiclePhysics.speed = 0;
        corrected = true;
    }
    
    return corrected;
}
