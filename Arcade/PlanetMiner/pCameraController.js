import * as THREE from 'three';

/**
 * Camera Controller Module
 * Handles camera modes, zoom levels, tracking, and transitions
 */

export class CameraController {
    constructor(sceneSetup, pivot, headGroup) {
        this.sceneSetup = sceneSetup;
        this.pivot = pivot; // Character pivot
        this.headGroup = headGroup; // Character head group
        
        // Camera references
        this.camera = sceneSetup.camera;
        this.thirdPersonCamera = sceneSetup.thirdPersonCamera;
        this.firstPersonCamera = sceneSetup.firstPersonCamera;
        
        // Camera mode: 'free', 'thirdPerson', 'firstPerson'
        this.mode = 'free';
        
        // Free camera zoom state
        this.freeCameraZoomLevel = 0;
        this.freeCameraZoomSmooth = 0;
        this.freeCameraConfigs = [];
        
        // Rocket camera state
        this.rocketCameraZoomFactor = 1.0;
        
        // Mouse look state
        this.mouseLookEnabled = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.headPitch = 0;
        this.bodyYaw = 0;
        
        // Current surface for tracking
        this.currentSurfaceObject = null;
    }
    
    /**
     * Initialize free camera zoom configurations
     * @param {number} furthestOrbitRadius - Furthest planet orbit radius
     * @param {number} sunRadius - Sun radius
     */
    initFreeCameraConfigs(furthestOrbitRadius, sunRadius) {
        this.freeCameraConfigs = [
            {
                name: "Solar System",
                isFixedY: true,
                y: furthestOrbitRadius * 1.5,
                z: furthestOrbitRadius * 0.5
            },
            {
                name: "Planetary System",
                isFixedY: false,
                y: 1,
                z: 1
            },
            {
                name: "Surface",
                isFixedY: false,
                y: 15,
                z: 10
            }
        ];
        
        // Set initial camera position
        const initialConfig = this.freeCameraConfigs[0];
        this.camera.position.set(0, initialConfig.y, initialConfig.z);
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * Update planetary system camera zoom configuration
     * @param {number} planetaryDistance - Distance for planetary zoom level
     */
    updatePlanetaryZoomConfig(planetaryDistance) {
        if (this.freeCameraConfigs.length > 1) {
            this.freeCameraConfigs[1].y = planetaryDistance * 1.2;
            this.freeCameraConfigs[1].z = planetaryDistance * 0.4;
        }
    }
    
    /**
     * Cycle to the next camera mode
     * @returns {string} New camera mode
     */
    cycleMode() {
        if (this.mode === 'free') {
            this.mode = 'thirdPerson';
            this.mouseLookEnabled = true;
        } else if (this.mode === 'thirdPerson') {
            this.mode = 'firstPerson';
            this.mouseLookEnabled = true;
        } else {
            this.mode = 'free';
            this.mouseLookEnabled = false;
            this.freeCameraZoomLevel = 0;
        }
        return this.mode;
    }
    
    /**
     * Cycle to the next free camera zoom level
     * @returns {Object} {level, name}
     */
    cycleFreeZoom() {
        if (this.mode !== 'free') return null;
        
        this.freeCameraZoomLevel = (this.freeCameraZoomLevel + 1) % this.freeCameraConfigs.length;
        this.freeCameraZoomSmooth = this.freeCameraZoomLevel;
        
        return {
            level: this.freeCameraZoomLevel,
            name: this.freeCameraConfigs[this.freeCameraZoomLevel].name
        };
    }
    
    /**
     * Handle mouse wheel zoom
     * @param {number} delta - Wheel delta
     */
    handleWheelZoom(delta) {
        if (this.mode === 'free') {
            this.freeCameraZoomSmooth += delta;
            this.freeCameraZoomSmooth = Math.max(
                0, 
                Math.min(this.freeCameraConfigs.length - 0.001, this.freeCameraZoomSmooth)
            );
            this.freeCameraZoomLevel = Math.floor(this.freeCameraZoomSmooth);
        } else {
            // Rocket camera zoom
            this.rocketCameraZoomFactor -= delta * 0.5;
            this.rocketCameraZoomFactor = Math.max(0.1, Math.min(5.0, this.rocketCameraZoomFactor));
        }
    }
    
    /**
     * Update free camera position to track character
     * @param {THREE.Vector3} characterWorldPosition - Character world position
     */
    updateFreeCamera(characterWorldPosition) {
        if (this.mode !== 'free' || !this.currentSurfaceObject) return;
        
        const lowerLevel = Math.floor(this.freeCameraZoomSmooth);
        const upperLevel = Math.min(lowerLevel + 1, this.freeCameraConfigs.length - 1);
        const t = this.freeCameraZoomSmooth - lowerLevel;
        
        const lowerConfig = this.freeCameraConfigs[lowerLevel];
        const upperConfig = this.freeCameraConfigs[upperLevel];
        
        const newCameraPosition = new THREE.Vector3();
        
        if (lowerConfig.isFixedY && upperConfig.isFixedY) {
            // Both fixed Y
            newCameraPosition.x = characterWorldPosition.x;
            newCameraPosition.y = lowerConfig.y * (1 - t) + upperConfig.y * t;
            newCameraPosition.z = characterWorldPosition.z + (lowerConfig.z * (1 - t) + upperConfig.z * t);
        } else if (lowerConfig.isFixedY && !upperConfig.isFixedY) {
            // Transitioning from fixed to relative
            const fixedY = lowerConfig.y;
            const fixedZ = characterWorldPosition.z + lowerConfig.z;
            const relativeY = characterWorldPosition.y + upperConfig.y;
            const relativeZ = characterWorldPosition.z + upperConfig.z;
            
            newCameraPosition.x = characterWorldPosition.x;
            newCameraPosition.y = fixedY * (1 - t) + relativeY * t;
            newCameraPosition.z = fixedZ * (1 - t) + relativeZ * t;
        } else {
            // Both relative Y
            newCameraPosition.x = characterWorldPosition.x;
            newCameraPosition.y = characterWorldPosition.y + (lowerConfig.y * (1 - t) + upperConfig.y * t);
            newCameraPosition.z = characterWorldPosition.z + (lowerConfig.z * (1 - t) + upperConfig.z * t);
        }
        
        this.camera.position.copy(newCameraPosition);
        this.camera.lookAt(characterWorldPosition);
        this.camera.up.set(0, 1, 0);
    }
    
    /**
     * Update rocket camera position
     * @param {THREE.Vector3} rocketWorldPosition - Rocket world position
     * @param {Array} solarSystemData - Solar system data for distance calculation
     */
    updateRocketCamera(rocketWorldPosition, solarSystemData) {
        // Find the closest planet to determine scale
        let closestPlanet = solarSystemData[0];
        let minDistance = Infinity;
        
        solarSystemData.forEach(planet => {
            if (planet.mesh) {
                const planetPos = new THREE.Vector3();
                planet.mesh.getWorldPosition(planetPos);
                const dist = rocketWorldPosition.distanceTo(planetPos);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestPlanet = planet;
                }
            }
        });
        
        // Use zoom level 1 (Planetary System) configuration
        const zoomFactor = this.rocketCameraZoomFactor;
        const cameraOffset = new THREE.Vector3(
            rocketWorldPosition.x,
            rocketWorldPosition.y + (closestPlanet.orbitRadius * 0.5 * zoomFactor),
            rocketWorldPosition.z + (closestPlanet.orbitRadius * 0.3 * zoomFactor)
        );
        
        this.camera.position.copy(cameraOffset);
        this.camera.lookAt(rocketWorldPosition);
        this.camera.up.set(0, 1, 0);
    }
    
    /**
     * Get the currently active camera
     * @param {boolean} isInRocket - Whether player is in rocket
     * @returns {THREE.PerspectiveCamera}
     */
    getActiveCamera(isInRocket = false) {
        if (isInRocket) {
            return this.camera; // Free camera for rocket
        }
        
        switch (this.mode) {
            case 'thirdPerson':
                return this.thirdPersonCamera;
            case 'firstPerson':
                return this.firstPersonCamera;
            default:
                return this.camera;
        }
    }
    
    /**
     * Handle mouse movement for look controls
     * @param {number} movementX - Mouse X movement
     * @param {number} movementY - Mouse Y movement
     * @param {number} sensitivity - Mouse sensitivity
     * @param {number} maxPitch - Maximum pitch angle
     */
    handleMouseMove(movementX, movementY, sensitivity, maxPitch) {
        if (!this.mouseLookEnabled) return;
        
        this.mouseX += movementX;
        this.mouseY += movementY;
        
        this.bodyYaw += movementX * sensitivity;
        this.headPitch += movementY * sensitivity;
        this.headPitch = Math.max(-maxPitch, Math.min(maxPitch, this.headPitch));
    }
    
    /**
     * Apply character rotation (call after movement)
     */
    applyCharacterRotation() {
        if (this.mode !== 'free') {
            this.pivot.rotateY(-this.bodyYaw);
            this.headGroup.rotation.x = this.headPitch;
        }
        this.bodyYaw = 0; // Reset after applying
    }
    
    /**
     * Set the current surface object for tracking
     * @param {THREE.Object3D} surfaceObject
     */
    setCurrentSurface(surfaceObject) {
        this.currentSurfaceObject = surfaceObject;
    }
    
    /**
     * Update camera (call every frame)
     * @param {boolean} isInRocket - Whether player is in rocket
     * @param {THREE.Object3D} rocketObject - Rocket object (if in rocket)
     * @param {Array} solarSystemData - Solar system data (if in rocket)
     */
    update(isInRocket = false, rocketObject = null, solarSystemData = null) {
        if (isInRocket && rocketObject && solarSystemData) {
            // Update rocket camera
            const rocketWorldPosition = new THREE.Vector3();
            rocketObject.getWorldPosition(rocketWorldPosition);
            this.updateRocketCamera(rocketWorldPosition, solarSystemData);
        } else if (this.mode === 'free' && this.pivot) {
            // Update free camera tracking character
            const characterWorldPosition = new THREE.Vector3();
            this.pivot.getWorldPosition(characterWorldPosition);
            this.updateFreeCamera(characterWorldPosition);
        }
    }
    
    /**
     * Get camera state for saving/loading
     * @returns {Object}
     */
    getState() {
        return {
            mode: this.mode,
            freeCameraZoomLevel: this.freeCameraZoomLevel,
            freeCameraZoomSmooth: this.freeCameraZoomSmooth,
            rocketCameraZoomFactor: this.rocketCameraZoomFactor,
            mouseLookEnabled: this.mouseLookEnabled,
            headPitch: this.headPitch
        };
    }
    
    /**
     * Restore camera state from saved data
     * @param {Object} state
     */
    setState(state) {
        this.mode = state.mode || 'free';
        this.freeCameraZoomLevel = state.freeCameraZoomLevel || 0;
        this.freeCameraZoomSmooth = state.freeCameraZoomSmooth || 0;
        this.rocketCameraZoomFactor = state.rocketCameraZoomFactor || 1.0;
        this.mouseLookEnabled = state.mouseLookEnabled || false;
        this.headPitch = state.headPitch || 0;
    }
}

/**
 * Lerp between two values
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}
