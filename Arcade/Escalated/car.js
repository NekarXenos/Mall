// car.js
// Modular car model for Three.js scene
// Usage: import { addGarageCar } from './car.js';
//        addGarageCar(scene, new THREE.Vector3(x, y, z));

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Store reference to the car mesh
let lastGarageCar = null;

export function addGarageCar(scene, position = new THREE.Vector3(0, 0, 0)) {
    // --- Lighting for car (optional, can be skipped if scene already has lights) ---
    RectAreaLightUniformsLib.init();

    // --- Load Car Model ---
    const loader = new GLTFLoader();
    const modelPath = 'W203-C.glb'; // Replace with your own model as needed

    loader.load(modelPath, (gltf) => {
        const carBody = gltf.scene;
        carBody.name = "GarageCar"; // Set name for debug overlay
        lastGarageCar = carBody; // Store reference
        carBody.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
            }
        });
        // --- Scaling Logic ---
        const box = new THREE.Box3().setFromObject(carBody);
        const size = box.getSize(new THREE.Vector3());
        const longestSide = Math.max(size.x, size.y, size.z);
        const scaleFactor = 4.556 / longestSide;
        carBody.scale.set(scaleFactor, scaleFactor, scaleFactor);
        // --- Centering and Positioning ---
        const postScaleBox = new THREE.Box3().setFromObject(carBody);
        // Move car's origin to its bottom center
        const carHeight = postScaleBox.max.y - postScaleBox.min.y;
        carBody.position.sub(postScaleBox.getCenter(new THREE.Vector3())); // Center the car model at (0,0,0)
        carBody.position.y += carHeight / 2; // Shift up so its bottom is at y=0
        carBody.position.add(position);
        scene.add(carBody);
        // --- Add Wheels as children of the car body ---
        addWheels(carBody);
    }, undefined, (error) => {
        // --- Placeholder logic ---
        const placeholderGeometry = new THREE.BoxGeometry(4.556, 1.2, 2);
        const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3 });
        const placeholderBody = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
        placeholderBody.name = "GarageCarPlaceholder"; // Set name for debug overlay
        lastGarageCar = placeholderBody; // Store reference
        // Position placeholder so its base is at `position.y`
        placeholderBody.position.set(position.x, position.y + placeholderGeometry.parameters.height / 2, position.z);
        scene.add(placeholderBody);
        addWheels(placeholderBody);
    });
}

// Export a getter for the last car added
export function getLastGarageCar() {
    return lastGarageCar;
}

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
        //new THREE.Vector3(-offsetX, offsetY, frontOffsetZ), // Corrected: This line was missing a comma
        new THREE.Vector3(-offsetX, offsetY, frontOffsetZ), // Corrected: This line was missing a comma
        
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
