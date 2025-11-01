// =================== CHARACTER CONTROLLER MODULE ===================
// Manages character physics, movement, jetpack system, and teleportation

import * as THREE from 'three';
import {
    BODY_HALF_HEIGHT,
    CHARACTER_GRAVITY,
    JUMP_STRENGTH,
    WALK_SPEED,
    RUN_SPEED,
    SWIM_SPEED,
    SWIM_UP_SPEED,
    WATER_DRAG,
    BUOYANCY,
    JETPACK_THRUST,
    JETPACK_DOWN_THRUST,
    MAX_NO_JETPACK_ALTITUDE
} from './pConstants.js';
import { getOrbitMaxDistance } from './pSolarSystemGenerator.js';

export class CharacterController {
    constructor(scene, pivot, body, headGroup, cameraController, solarSystemData) {
        this.scene = scene;
        this.pivot = pivot;
        this.body = body;
        this.headGroup = headGroup;
        this.cameraController = cameraController;
        this.solarSystemData = solarSystemData;
        
        // Character state
        this.velocityY = 0;
        this.isGrounded = true;
        this.vPos = 0;
        this.isInWater = false;
        
        // Jetpack system
        this.jetpackEnabled = false;
        this.jetpackActive = false;
        
        // Teleportation state
        this.currentSurfaceObject = null;
        this.currentSystemIndex = 0;
        this.currentBodyIndex = 0;
        this.teleportLocations = [];
        
        // Raycaster for ground detection
        this.raycaster = new THREE.Raycaster();
        
        // Character meshes (for equipment visibility)
        this.helmet = null;
        this.jetpack = null;
        this.thrusterLeft = null;
        this.thrusterRight = null;
        this.flameLeft = null;
        this.flameRight = null;
        
        // UI element reference
        this.infoElement = document.getElementById('info');
        
        // Movement constants
        this.rotationSpeed = 0.8;
    }
    
    /**
     * Initialize jetpack equipment references
     */
    setJetpackEquipment(helmet, jetpack, thrusterLeft, thrusterRight, flameLeft, flameRight) {
        this.helmet = helmet;
        this.jetpack = jetpack;
        this.thrusterLeft = thrusterLeft;
        this.thrusterRight = thrusterRight;
        this.flameLeft = flameLeft;
        this.flameRight = flameRight;
        
        // Set initial visibility
        this.updateJetpackVisibility();
    }
    
    /**
     * Set teleport locations array
     */
    setTeleportLocations(locations) {
        this.teleportLocations = locations;
    }
    
    /**
     * Set initial character position on first planet
     */
    setInitialPosition() {
        if (this.teleportLocations.length > 0 && this.teleportLocations[0].length > 0) {
            this.currentSystemIndex = 0;
            this.currentBodyIndex = this.teleportLocations[0].length > 1 ? 1 : 0;
            this.teleport();
        } else {
            this.infoElement.textContent = "No planets generated to land on!";
        }
    }
    
    /**
     * Teleport character to a specific system/body
     */
    teleport(systemIndex = this.currentSystemIndex, bodyIndex = this.currentBodyIndex) {
        if (!this.teleportLocations[systemIndex] || !this.teleportLocations[systemIndex][bodyIndex]) {
            console.error("Teleport destination is invalid.");
            return;
        }
        
        this.currentSystemIndex = systemIndex;
        this.currentBodyIndex = bodyIndex;
        const destination = this.teleportLocations[this.currentSystemIndex][this.currentBodyIndex];

        destination.object.add(this.pivot);
        this.pivot.position.set(0, 0, 0);
        this.pivot.rotation.set(0, 0, 0);

        this.currentSurfaceObject = destination.object;
        this.vPos = destination.radius + BODY_HALF_HEIGHT + 0.01;
        this.velocityY = 0;
        this.isGrounded = true;

        const destinationSystem = this.solarSystemData[this.currentSystemIndex];
        const maxOrbitDistance = getOrbitMaxDistance(destinationSystem);
        const planetaryDistance = maxOrbitDistance * 1.5;
        
        // Update camera controller's planetary zoom configuration
        if (this.cameraController) {
            this.cameraController.updatePlanetaryZoomConfig(planetaryDistance);
        }

        this.updateInfoText();
    }
    
    /**
     * Toggle jetpack mode on/off
     */
    toggleJetpack() {
        this.jetpackEnabled = !this.jetpackEnabled;
        this.jetpackActive = false;
        
        this.updateJetpackVisibility();
        this.updateInfoText();
    }
    
    /**
     * Update jetpack equipment visibility based on enabled state
     */
    updateJetpackVisibility() {
        if (this.helmet) this.helmet.visible = this.jetpackEnabled;
        if (this.jetpack) this.jetpack.visible = this.jetpackEnabled;
        if (this.thrusterLeft) this.thrusterLeft.visible = this.jetpackEnabled;
        if (this.thrusterRight) this.thrusterRight.visible = this.jetpackEnabled;
        if (this.flameLeft) this.flameLeft.visible = false;
        if (this.flameRight) this.flameRight.visible = false;
    }
    
    /**
     * Update info text based on current state
     */
    updateInfoText() {
        const destName = this.teleportLocations[this.currentSystemIndex] && 
                        this.teleportLocations[this.currentSystemIndex][this.currentBodyIndex]
            ? this.teleportLocations[this.currentSystemIndex][this.currentBodyIndex].name
            : "Unknown";
        
        const modeStr = this.jetpackEnabled ? "JETPACK" : "NORMAL";
        const controls = this.jetpackEnabled ? 'SPACE/CTRL jetpack' : 'SPACE jump';
        this.infoElement.textContent = `${modeStr} mode: ${destName} (WASD/QE move, ${controls}, G toggle, F-Rocket, M/L Teleport, V Camera)`;
    }
    
    /**
     * Teleport to next moon/body in current system
     */
    teleportNextBody() {
        if (this.teleportLocations[this.currentSystemIndex].length > 1) {
            this.currentBodyIndex = (this.currentBodyIndex + 1) % this.teleportLocations[this.currentSystemIndex].length;
            this.teleport();
        }
    }
    
    /**
     * Teleport to next planetary system
     */
    teleportNextSystem() {
        if (this.teleportLocations.length > 1) {
            this.currentSystemIndex = (this.currentSystemIndex + 1) % this.teleportLocations.length;
            this.currentBodyIndex = 0;
            this.teleport();
        }
    }
    
    /**
     * Handle character movement input
     */
    handleMovement(keys, delta) {
        if (!this.currentSurfaceObject) return;
        
        const currentRadius = this.teleportLocations[this.currentSystemIndex][this.currentBodyIndex].radius;
        const distanceFromCenter = this.vPos;
        
        // Check if in water
        const currentSystem = this.solarSystemData[this.currentSystemIndex];
        let waterRadius = null;
        if (currentSystem.waterSphere && this.currentBodyIndex === 0) waterRadius = currentSystem.waterRadius;
        else if (currentSystem.liquidSphere && currentSystem.isGasGiant && this.currentBodyIndex === 0) waterRadius = currentSystem.liquidRadius;
        this.isInWater = waterRadius && distanceFromCenter < waterRadius;

        const baseSpeed = this.isInWater ? SWIM_SPEED : (keys['SHIFT'] ? RUN_SPEED : WALK_SPEED);
        const angularSpeed = baseSpeed / currentRadius;

        if (keys['W']) this.pivot.rotateX(angularSpeed * delta);
        if (keys['S']) this.pivot.rotateX(-angularSpeed * delta);
        if (keys['A']) this.pivot.rotateZ(-angularSpeed * delta);
        if (keys['D']) this.pivot.rotateZ(angularSpeed * delta);
        if (keys['Q']) this.pivot.rotateY(this.rotationSpeed * delta);
        if (keys['E']) this.pivot.rotateY(-this.rotationSpeed * delta);
    }
    
    /**
     * Update character physics (gravity, jumping, jetpack)
     */
    updatePhysics(keys, delta) {
        if (!this.currentSurfaceObject) return;
        
        const bodyWorldPos = new THREE.Vector3();
        this.body.getWorldPosition(bodyWorldPos);
        
        const surfaceCenter = new THREE.Vector3();
        this.currentSurfaceObject.getWorldPosition(surfaceCenter);

        const downDirection = surfaceCenter.clone().sub(bodyWorldPos).normalize();

        // Define local offsets from the character's feet.
        const bodyBaseLocalY = this.body.position.y - BODY_HALF_HEIGHT; 
        
        const localRayOffsets = [
            new THREE.Vector3(0, 0, 0),      // Center of feet
            new THREE.Vector3(0, 0, 0.25),   // Front
            new THREE.Vector3(0, 0, -0.25),  // Back
            new THREE.Vector3(0.4, 0, 0),    // Right
            new THREE.Vector3(-0.4, 0, 0)    // Left
        ];

        let highestIntersectionPoint = null;
        let maxDistance = -Infinity;
        
        // Find the highest ground point under the character
        for (const offset of localRayOffsets) {
            const localOrigin = new THREE.Vector3(offset.x, bodyBaseLocalY + 0.1, offset.z);
            const worldOrigin = localOrigin.clone().applyMatrix4(this.pivot.matrixWorld);

            // Start the ray from slightly "up" (away from the center) to ensure it's outside the geometry
            const rayStart = worldOrigin.clone().sub(downDirection.clone().multiplyScalar(5));
            
            this.raycaster.set(rayStart, downDirection);
            const intersects = this.raycaster.intersectObject(this.currentSurfaceObject, false);

            if (intersects.length > 0) {
                const intersectionPoint = intersects[0].point;
                const distFromCenter = intersectionPoint.distanceTo(surfaceCenter);
                if (distFromCenter > maxDistance) {
                    maxDistance = distFromCenter;
                    highestIntersectionPoint = intersectionPoint;
                }
            }
        }

        let groundHeight;
        if (highestIntersectionPoint) {
            groundHeight = maxDistance;
        } else {
            // Fallback if no rays hit the ground
            groundHeight = this.teleportLocations[this.currentSystemIndex][this.currentBodyIndex].radius;
        }
        
        const groundPosition = groundHeight + BODY_HALF_HEIGHT + 0.01;

        // Physics modes: water, jetpack, or normal
        if (this.isInWater) {
            this.handleWaterPhysics(keys, delta, groundPosition);
        } else if (this.jetpackEnabled) {
            this.handleJetpackPhysics(keys, delta, groundPosition);
        } else {
            this.handleNormalPhysics(keys, delta, groundPosition, groundHeight);
        }

        // Update body and head positions
        this.body.position.y = this.vPos;
        this.headGroup.position.y = this.vPos + 1.2;
        
        // Update jetpack flame effects
        this.updateJetpackFlames(keys);
    }
    
    /**
     * Handle physics when in water
     */
    handleWaterPhysics(keys, delta, groundPosition) {
        this.velocityY *= WATER_DRAG;
        this.velocityY += BUOYANCY * delta;
        if (keys['SPACE']) this.velocityY = SWIM_UP_SPEED;
        if (keys['CTRL']) this.velocityY = -SWIM_UP_SPEED;
        this.vPos += this.velocityY * delta;
        if (this.vPos <= groundPosition) { 
            this.vPos = groundPosition; 
            this.velocityY = 0; 
            this.isGrounded = true; 
        } else { 
            this.isGrounded = false; 
        }
    }
    
    /**
     * Handle physics when jetpack is enabled
     */
    handleJetpackPhysics(keys, delta, groundPosition) {
        if (keys['SPACE']) {
            // Spacebar - fly up
            this.velocityY += JETPACK_THRUST * delta;
            this.jetpackActive = true;
        } else if (keys['CTRL']) {
            // Ctrl - fly down
            this.velocityY += JETPACK_DOWN_THRUST * delta;
            this.jetpackActive = true;
        } else {
            // No jetpack input - apply gravity
            this.velocityY += CHARACTER_GRAVITY * delta;
            this.jetpackActive = false;
        }
        
        // Apply velocity with damping for control
        this.velocityY *= 0.95; // Air resistance/damping
        this.vPos += this.velocityY * delta;
        
        // Ground collision
        if (this.vPos <= groundPosition) { 
            this.vPos = groundPosition; 
            this.velocityY = 0; 
            this.isGrounded = true;
            this.jetpackActive = false;
        } else { 
            this.isGrounded = false; 
        }
        
        // NO ALTITUDE LIMITS in jetpack mode - can fly to space!
    }
    
    /**
     * Handle physics in normal mode (no jetpack)
     */
    handleNormalPhysics(keys, delta, groundPosition, groundHeight) {
        // Check for jump input (only when grounded)
        if (keys['SPACE'] && this.isGrounded) {
            this.velocityY = JUMP_STRENGTH;
            this.isGrounded = false;
        }
        
        this.velocityY += CHARACTER_GRAVITY * delta;
        this.vPos += this.velocityY * delta;
        if (this.vPos <= groundPosition) { 
            this.velocityY = 0; 
            this.vPos = groundPosition; 
            this.isGrounded = true; 
        } else { 
            this.isGrounded = false; 
        }
        
        // Hard one-way altitude limit without jetpack
        const currentSystem = this.solarSystemData[this.currentSystemIndex];
        let maxAltitudeRadius;
        
        // Determine the altitude limit based on planet type
        if (this.currentBodyIndex === 0) { // Only apply to main planet (not moons)
            if (currentSystem.atmosphereRadius) {
                // Planet with atmosphere
                maxAltitudeRadius = currentSystem.atmosphereRadius;
            } else if (currentSystem.isGasGiant && currentSystem.effectiveRadius) {
                // Gas giant - use effective radius (gas layer)
                maxAltitudeRadius = currentSystem.effectiveRadius;
            } else {
                // Regular planet without atmosphere - use default altitude limit
                maxAltitudeRadius = groundHeight + MAX_NO_JETPACK_ALTITUDE;
            }
        } else {
            // Moons use default altitude limit
            maxAltitudeRadius = groundHeight + MAX_NO_JETPACK_ALTITUDE;
        }
        
        if (this.vPos > maxAltitudeRadius) {
            this.vPos = maxAltitudeRadius;
            if (this.velocityY > 0) this.velocityY = 0; // kill upward motion
        }
    }
    
    /**
     * Update jetpack flame visibility and animation
     */
    updateJetpackFlames(keys) {
        if (!this.flameLeft || !this.flameRight) return;
        
        if (this.jetpackActive && (keys['SPACE'] || keys['CTRL'])) {
            this.flameLeft.visible = true;
            this.flameRight.visible = true;
            // Animate flames with pulsing effect
            const flameScale = 1.0 + Math.sin(Date.now() * 0.01) * 0.3;
            this.flameLeft.scale.y = flameScale;
            this.flameRight.scale.y = flameScale;
        } else {
            this.flameLeft.visible = false;
            this.flameRight.visible = false;
        }
    }
    
    /**
     * Get current surface object
     */
    getCurrentSurface() {
        return this.currentSurfaceObject;
    }
    
    /**
     * Get current system/body indices
     */
    getCurrentLocation() {
        return {
            systemIndex: this.currentSystemIndex,
            bodyIndex: this.currentBodyIndex
        };
    }
}
