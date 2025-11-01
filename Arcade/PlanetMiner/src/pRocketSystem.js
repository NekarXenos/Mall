/**
 * Rocket System Module
 * Handles rocket physics, controls, trajectory, landing/takeoff, and tractor beam
 */

import * as THREE from 'three';
import {
    ROCKET_LENGTH,
    ROCKET_MAIN_THRUST,
    ROCKET_BOOST_THRUST,
    ROCKET_TURN_SPEED,
    ROCKET_RCS_THRUST,
    ROCKET_BRAKE_FORCE,
    G_CONSTANT,
    SUN_RADIUS,
    LAUNCH_ASSIST_TARGET_RADIAL_SPEED,
    LAUNCH_ASSIST_ACCEL,
    LAUNCH_ASSIST_GRACE_TIME,
    LAUNCH_ASSIST_CLEARANCE,
    LAUNCH_STRENGTH,
    LAUNCH_BASE_BODY_RADIUS,
    TRACTOR_BEAM_PULL_FORCE,
    TRACTOR_BEAM_ROTATION_SYNC,
    TRACTOR_BEAM_MAX_DISTANCE
} from './pConstants.js';
import { segmentIntersectsSphere, calculateTrajectoryGravity } from './pPhysics.js';

/**
 * Rocket System Class
 * Manages all rocket-related functionality
 */
export class RocketSystem {
    constructor(scene, solarSystemData, sun, infoElement) {
        this.scene = scene;
        this.solarSystemData = solarSystemData;
        this.sun = sun;
        this.infoElement = infoElement;
        
        // Rocket objects
        this.rocketObject = null;
        this.rocketPivot = null;
        this.rocketPlume = null;
        this.trajectoryLine = null;
        this.directionArrow = null;
        this.debugAxesGroup = null;
        
        // Rocket state
        this.isInRocket = false;
        this.rocketVelocity = new THREE.Vector3();
        this.rocketYaw = 0; // Current yaw angle in radians
        this.rocketLaunchPlanet = null;
        this.prevRocketWorldPos = null;
        
        // Launch assist state
        this.launchAssistActive = false;
        this.launchAssistBody = null;
        this.launchAssistBodyRadius = 0;
        this.launchAssistGraceLeft = 0;
        this.launchAssistElapsed = 0;
        this.launchAssistTargetRadialSpeed = 0;
        this.launchAssistAccelCurrent = 0;
        this.launchAssistBodyName = '';
        this.launchAssistBodyMesh = null;
        
        // Tractor beam state
        this.tractorBeamActive = false;
        this.tractorBeamTarget = null;
        this.tractorBeamTargetData = null;
        this.tractorBeamHighlight = null;
        this.tractorBeamLandingMode = false;
        
        // Trajectory update throttling
        this.trajUpdateTimer = 0;
    }
    
    /**
     * Create rocket mesh and add to scene
     * @param {THREE.Vector3} initialPosition - Initial world position
     * @param {THREE.Object3D} launchPlanetGroup - Planet group to launch from
     * @returns {Object} {rocketObject, rocketPivot, rocketPlume}
     */
    createRocket(initialPosition, launchPlanetGroup) {
        const rocket = new THREE.Group();

        // Rocket body
        const rocketBodyGeometry = new THREE.SphereGeometry(1.5, 16, 16);
        const rocketBodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xdddddd, 
            metalness: 0.7, 
            roughness: 0.3 
        });
        const rocketBody = new THREE.Mesh(rocketBodyGeometry, rocketBodyMaterial);
        rocketBody.scale.y = 10 / 3;
        rocketBody.position.y = 5; // Position along local Y-axis
        rocket.add(rocketBody);

        // Fins
        const finGeometry = new THREE.TetrahedronGeometry(1);
        const finMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xee4444, 
            metalness: 0.4, 
            roughness: 0.6 
        });
        for (let i = 0; i < 3; i++) {
            const fin = new THREE.Mesh(finGeometry, finMaterial);
            fin.scale.set(0.1, 3, 2.0);
            const angle = (i / 3) * Math.PI * 2;
            const radiusFromCenter = 1;
            
            fin.position.set(
                Math.sin(angle) * radiusFromCenter, 
                1.5, 
                Math.cos(angle) * radiusFromCenter
            );
            fin.rotation.y = angle;
            rocket.add(fin);
        }

        // Rocket plume (thrust visualization)
        const plumeGeometry = new THREE.ConeGeometry(1.2, 1, 8, 1, true);
        const plumeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const plume = new THREE.Mesh(plumeGeometry, plumeMaterial);
        plume.position.y = 0; // At the base of the rocket
        plume.rotation.x = Math.PI; // Point downward
        plume.visible = false;
        rocket.add(plume);
        this.rocketPlume = plume;

        // Create rocket pivot
        const pivot = new THREE.Object3D();
        pivot.add(rocket);
        this.scene.add(pivot);

        // Set initial position
        pivot.position.copy(initialPosition);

        // Rotate rocket to lie on X-Z plane
        rocket.rotation.x = -Math.PI / 2;
        this.rocketYaw = 0;

        // Store references
        this.rocketObject = rocket;
        this.rocketPivot = pivot;
        this.rocketLaunchPlanet = launchPlanetGroup;

        // Create direction arrow
        this.createDirectionArrow(rocket);

        return { rocketObject: rocket, rocketPivot: pivot, rocketPlume: plume };
    }
    
    /**
     * Create direction arrow indicator for rocket
     * @param {THREE.Group} rocket - Rocket group to attach arrow to
     */
    createDirectionArrow(rocket) {
        const arrowGroup = new THREE.Group();

        // Create chevron shape (^)
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.4);      // Tip
        arrowShape.lineTo(0.25, 0);     // Bottom-right
        arrowShape.lineTo(0, 0.15);     // Indent
        arrowShape.lineTo(-0.25, 0);    // Bottom-left
        arrowShape.closePath();
        
        const points = arrowShape.getPoints();
        const arrowGeo = new THREE.BufferGeometry().setFromPoints(points);
        const arrowMat = new THREE.LineBasicMaterial({ 
            color: 0x00ffff, 
            linewidth: 5, 
            side: THREE.DoubleSide 
        });

        const arrowMesh = new THREE.Line(arrowGeo, arrowMat);
        arrowMesh.rotation.x = -Math.PI / 2;
        arrowMesh.position.y = 15;
        arrowMesh.scale.set(5, 5, 5);
        arrowMesh.renderOrder = 10000;

        arrowGroup.add(arrowMesh);
        arrowGroup.position.set(0, 0, 0);
        arrowGroup.rotation.set(Math.PI / 2, 0, 0);
        arrowGroup.renderOrder = 10000;

        rocket.add(arrowGroup);
        rocket.directionArrow = arrowGroup;
        arrowGroup.arrowMesh = arrowMesh;
        
        this.directionArrow = arrowGroup;
    }
    
    /**
     * Switch to rocket control mode
     */
    switchToRocket() {
        this.isInRocket = true;
        
        const isLanded = this.rocketPivot.parent !== this.scene;
        if (isLanded) {
            this.infoElement.textContent = `Rocket landed! (W to take off, R to EXPLODE planet/moon, F to switch to character)`;
        } else {
            this.infoElement.textContent = `Flying Rocket! (W thrust, Shift boost, A/D turn (yaw), Q/E strafe, X brake, Shift+X sync orbit, HOLD O landing autopilot, Z zoom, F switch to character)`;
        }
    }
    
    /**
     * Switch to character control mode
     */
    switchToCharacter() {
        this.isInRocket = false;
    }
    
    /**
     * Get rocket world position
     * @returns {THREE.Vector3}
     */
    getRocketWorldPosition() {
        if (!this.rocketObject) return new THREE.Vector3();
        const pos = new THREE.Vector3();
        this.rocketObject.getWorldPosition(pos);
        return pos;
    }
    
    /**
     * Get rocket world quaternion
     * @returns {THREE.Quaternion}
     */
    getRocketWorldQuat() {
        if (!this.rocketObject) return new THREE.Quaternion();
        return this.rocketObject.getWorldQuaternion(new THREE.Quaternion());
    }
    
    /**
     * Get rocket forward direction in world space
     * @returns {THREE.Vector3}
     */
    getRocketForwardWS() {
        return new THREE.Vector3(0, 1, 0)
            .applyQuaternion(this.getRocketWorldQuat())
            .normalize();
    }
    
    /**
     * Get rocket right direction in world space
     * @returns {THREE.Vector3}
     */
    getRocketRightWS() {
        return new THREE.Vector3(1, 0, 0)
            .applyQuaternion(this.getRocketWorldQuat())
            .normalize();
    }
    
    /**
     * Get rocket left direction in world space
     * @returns {THREE.Vector3}
     */
    getRocketLeftWS() {
        return new THREE.Vector3(-1, 0, 0)
            .applyQuaternion(this.getRocketWorldQuat())
            .normalize();
    }
    
    /**
     * Update trajectory prediction line
     * @param {number} delta - Time delta
     * @param {Object} keys - Key state object
     */
    updateTrajectory(delta, keys) {
        if (!this.rocketObject) return;

        // Remove existing trajectory line
        if (this.trajectoryLine) {
            this.scene.remove(this.trajectoryLine);
            this.trajectoryLine.geometry.dispose();
            this.trajectoryLine.material.dispose();
        }

        const positions = [];
        const tempPos = new THREE.Vector3();
        this.rocketObject.getWorldPosition(tempPos);
        const tempVel = this.rocketVelocity.clone();
        const tempQuat = this.rocketObject.quaternion.clone();
        const steps = 500;
        const dt = 0.1;

        // Track which planets we've passed through for moon gravity
        const planetsEncountered = new Set();

        for (let i = 0; i < steps; i++) {
            // Calculate gravity
            const totalGravityForce = calculateTrajectoryGravity(
                tempPos,
                this.solarSystemData,
                this.sun,
                SUN_RADIUS,
                planetsEncountered
            );

            tempVel.add(totalGravityForce.multiplyScalar(dt));

            // Thrust prediction (uses current orientation snapshot)
            const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(tempQuat);
            const currentThrust = (keys['W'] ? (keys['SHIFT'] ? ROCKET_BOOST_THRUST : ROCKET_MAIN_THRUST) : 0);
            tempVel.add(direction.multiplyScalar(currentThrust * dt));

            tempPos.add(tempVel.clone().multiplyScalar(dt));

            // Constrain to orbital plane
            tempPos.y = 0;

            positions.push(tempPos.clone());
        }

        // Create new trajectory line
        this.trajectoryLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(positions),
            new THREE.LineBasicMaterial({ 
                color: 0x00ff00, 
                transparent: true, 
                opacity: 0.5 
            })
        );
        this.scene.add(this.trajectoryLine);
    }
    
    /**
     * Update rocket physics and controls
     * @param {number} delta - Time delta
     * @param {Object} keys - Key state object
     */
    updateRocket(delta, keys) {
        if (!this.rocketObject) return;

        // --- Cache previous position for collision detection ---
        const prevPosTmp = new THREE.Vector3();
        this.rocketObject.getWorldPosition(prevPosTmp);
        if (!this.prevRocketWorldPos) this.prevRocketWorldPos = prevPosTmp.clone();
        
        const rocketWorldPos = this.getRocketWorldPosition();

        // --- Gravity Calculation ---
        const totalGravityForce = this.calculateRocketGravity(rocketWorldPos);
        this.rocketVelocity.add(totalGravityForce.multiplyScalar(delta));

        // --- Launch Assist ---
        if (this.launchAssistActive && this.launchAssistBody) {
            this.updateLaunchAssist(delta, rocketWorldPos);
        }

        // --- Controls ---
        this.handleRocketControls(delta, keys, rocketWorldPos);

        // --- Tractor Beam ---
        if (this.tractorBeamActive && this.tractorBeamTarget && this.tractorBeamTargetData) {
            this.updateTractorBeam(delta, rocketWorldPos);
        }

        // --- Update Position ---
        if (this.rocketPivot.parent === this.scene) {
            this.rocketPivot.position.add(this.rocketVelocity.clone().multiplyScalar(delta));
        }

        // --- Collision Detection ---
        if (this.rocketPivot.parent === this.scene) {
            this.checkRocketCollisions(rocketWorldPos, prevPosTmp);
        }

        // --- Update rocket rotation from yaw ---
        this.rocketObject.rotation.z = this.rocketYaw;

        // Update previous position for next frame
        this.prevRocketWorldPos.copy(rocketWorldPos);
    }
    
    /**
     * Calculate gravity force on rocket from all celestial bodies
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     * @returns {THREE.Vector3} Total gravity force
     */
    calculateRocketGravity(rocketWorldPos) {
        const totalGravityForce = new THREE.Vector3();

        // Find closest planet for moon gravity
        let closestPlanet = null;
        let closestPlanetDist = Infinity;
        this.solarSystemData.forEach(planetData => {
            if (!planetData.mesh) return;
            const planetWorldPos = new THREE.Vector3();
            planetData.mesh.getWorldPosition(planetWorldPos);
            const dist = rocketWorldPos.distanceTo(planetWorldPos);
            if (dist < closestPlanetDist) {
                closestPlanetDist = dist;
                closestPlanet = planetData;
            }
        });

        // Collect all celestial bodies
        const celestialBodies = [...this.solarSystemData, { mesh: this.sun, radius: SUN_RADIUS }];
        
        // Add moons from closest planet
        if (closestPlanet && closestPlanet.moons) {
            closestPlanet.moons.forEach(moonData => {
                celestialBodies.push(moonData);
            });
        }

        // Apply gravity from all bodies
        celestialBodies.forEach(body => {
            let gravitySource = null;
            let bodyRadius = body.radius;
            
            // Use bubble for exploded bodies, mesh for intact bodies
            if (body.hasExploded && body.blackHoleBubble) {
                gravitySource = body.blackHoleBubble;
                bodyRadius = body.blackHoleBubble.userData.originalRadius || body.radius;
            } else if (body.mesh) {
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

        return totalGravityForce;
    }
    
    /**
     * Update launch assist system
     * @param {number} delta - Time delta
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    updateLaunchAssist(delta, rocketWorldPos) {
        const bodyWorldPos = new THREE.Vector3();
        this.launchAssistBody.getWorldPosition(bodyWorldPos);
        
        // Constrain to orbital plane (XZ)
        const rocketXZ = rocketWorldPos.clone(); 
        rocketXZ.y = 0;
        const bodyXZ = bodyWorldPos.clone(); 
        bodyXZ.y = 0;
        
        const radialOut = rocketXZ.clone().sub(bodyXZ);
        const distanceFromCenter = radialOut.length();
        const distanceToSurface = distanceFromCenter - this.launchAssistBodyRadius;
        
        if (radialOut.lengthSq() > 1e-6) {
            radialOut.normalize();
        } else {
            radialOut.set(1, 0, 0);
        }

        // Current radial speed
        const radialSpeed = this.rocketVelocity.clone().setY(0).dot(radialOut);

        // Push harder if not yet meeting target speed
        if (radialSpeed < this.launchAssistTargetRadialSpeed) {
            this.rocketVelocity.add(radialOut.multiplyScalar(this.launchAssistAccelCurrent * delta));
        }

        // Keep rocket in orbital plane
        this.rocketPivot.position.y = 0;
        this.rocketVelocity.y = 0;

        // Update timers
        this.launchAssistElapsed += delta;
        if (this.launchAssistGraceLeft > 0) this.launchAssistGraceLeft -= delta;

        // Stop assist when clear of surface
        if (distanceToSurface > LAUNCH_ASSIST_CLEARANCE && radialSpeed > this.launchAssistTargetRadialSpeed * 0.8) {
            this.launchAssistActive = false;
            this.launchAssistBody = null;
            console.log('Launch assist completed. Clear of surface.');
        }
    }
    
    /**
     * Handle rocket control inputs
     * @param {number} delta - Time delta
     * @param {Object} keys - Key state object
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    handleRocketControls(delta, keys, rocketWorldPos) {
        // A/D for yaw (turning left/right)
        if (keys['A']) this.rocketYaw += ROCKET_TURN_SPEED * delta;
        if (keys['D']) this.rocketYaw -= ROCKET_TURN_SPEED * delta;
        
        // Normalize yaw
        if (this.rocketYaw > Math.PI) this.rocketYaw -= Math.PI * 2;
        if (this.rocketYaw < -Math.PI) this.rocketYaw += Math.PI * 2;

        // Q/E for strafing
        if (keys['Q']) {
            const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.rocketObject.quaternion);
            this.rocketVelocity.add(left.multiplyScalar(ROCKET_RCS_THRUST * delta));
        }
        if (keys['E']) {
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rocketObject.quaternion);
            this.rocketVelocity.add(right.multiplyScalar(ROCKET_RCS_THRUST * delta));
        }

        // W for thrust
        if (keys['W']) {
            this.handleThrustControl(delta, keys, rocketWorldPos);
        } else {
            if (this.rocketPlume) this.rocketPlume.visible = false;
        }

        // X for brake / orbital sync
        if (keys['X']) {
            this.handleBrakeControl(keys, rocketWorldPos);
        }
    }
    
    /**
     * Handle thrust control (W key)
     * @param {number} delta - Time delta
     * @param {Object} keys - Key state object
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    handleThrustControl(delta, keys, rocketWorldPos) {
        // Check if rocket is landed and needs to take off
        if (this.rocketPivot.parent !== this.scene) {
            this.handleTakeoff(rocketWorldPos);
        }
        
        const thrust = keys['SHIFT'] ? ROCKET_BOOST_THRUST : ROCKET_MAIN_THRUST;
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocketObject.quaternion);
        this.rocketVelocity.add(forward.multiplyScalar(thrust * delta));

        // Update plume visualization
        if (this.rocketPlume) {
            this.rocketPlume.visible = true;
            const plumeLength = keys['SHIFT'] ? 15 : 5;
            this.rocketPlume.scale.y = plumeLength;
            const color = keys['SHIFT'] ? 0xffaa00 : 0xff6600;
            this.rocketPlume.material.color.setHex(color);
            this.rocketPlume.material.opacity = keys['SHIFT'] ? 0.9 : 0.8;
        }
    }
    
    /**
     * Handle rocket takeoff from landed state
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    handleTakeoff(rocketWorldPos) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.rocketPivot.getWorldPosition(worldPos);
        this.rocketPivot.getWorldQuaternion(worldQuat);
        
        // Store the body we're taking off from
        const takeoffBody = this.rocketPivot.parent;
        
        // Remove from current parent
        this.rocketPivot.parent.remove(this.rocketPivot);
        
        // Add to scene
        this.scene.add(this.rocketPivot);

        // Set world position and rotation
        this.rocketPivot.position.copy(rocketWorldPos);
        this.rocketPivot.position.y = 0;
        this.rocketPivot.quaternion.identity();

        // Reset rocket local rotation
        this.rocketObject.rotation.set(-Math.PI / 2, 0, 0);
        this.rocketObject.position.set(0, 0, 0);
        
        // Enable launch assist
        this.launchAssistGraceLeft = LAUNCH_ASSIST_GRACE_TIME;
        this.launchAssistBody = takeoffBody;
        this.launchAssistBodyMesh = takeoffBody;
        
        console.log('Rocket taking off from landed position with grace period');
        this.infoElement.textContent = `Flying Rocket! (W thrust, Shift boost, A/D turn (yaw), Q/E strafe, X brake, Shift+X sync orbit, O toggle tractor beam, Z zoom, F switch to character)`;
    }
    
    /**
     * Handle brake/orbital sync controls (X key)
     * @param {Object} keys - Key state object
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    handleBrakeControl(keys, rocketWorldPos) {
        if (keys['SHIFT']) {
            // Orbital sync with closest body
            this.syncOrbitalVelocity(rocketWorldPos);
        } else {
            // Regular brake
            this.rocketVelocity.multiplyScalar(ROCKET_BRAKE_FORCE);
        }
    }
    
    /**
     * Sync rocket velocity with closest celestial body's orbital motion
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    syncOrbitalVelocity(rocketWorldPos) {
        let closestBody = null;
        let closestBodyDist = Infinity;
        let closestBodyData = null;

        // Check all planets
        this.solarSystemData.forEach(planetData => {
            if (!planetData.mesh) return;
            const bodyWorldPos = new THREE.Vector3();
            planetData.mesh.getWorldPosition(bodyWorldPos);
            const dist = rocketWorldPos.distanceTo(bodyWorldPos);
            if (dist < closestBodyDist) {
                closestBodyDist = dist;
                closestBody = planetData.mesh;
                closestBodyData = { 
                    ...planetData, 
                    isMoon: false, 
                    parentOrbitRadius: planetData.orbitRadius 
                };
            }

            // Check moons
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

        if (closestBody && closestBodyData) {
            const bodyWorldPos = new THREE.Vector3();
            closestBody.getWorldPosition(bodyWorldPos);

            if (closestBodyData.isMoon) {
                // Moon velocity calculation
                const planetPos = new THREE.Vector3(
                    closestBodyData.parentOrbitRadius * Math.cos(closestBodyData.orbitAngle || 0),
                    0,
                    closestBodyData.parentOrbitRadius * Math.sin(closestBodyData.orbitAngle || 0)
                );
                
                const moonToPlanet = planetPos.clone().sub(bodyWorldPos);
                const moonOrbitRadius = moonToPlanet.length();
                
                const moonOrbitalVelocity = new THREE.Vector3(-moonToPlanet.z, 0, moonToPlanet.x).normalize();
                const moonSpeed = Math.sqrt((G_CONSTANT * closestBodyData.planetRadius) / moonOrbitRadius);
                moonOrbitalVelocity.multiplyScalar(moonSpeed);

                const planetToSun = new THREE.Vector3(0, 0, 0).sub(planetPos);
                const planetOrbitalVelocity = new THREE.Vector3(-planetToSun.z, 0, planetToSun.x).normalize();
                const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / closestBodyData.parentOrbitRadius);
                planetOrbitalVelocity.multiplyScalar(planetSpeed);

                this.rocketVelocity.copy(moonOrbitalVelocity.add(planetOrbitalVelocity));
            } else {
                // Planet velocity calculation
                const vectorToSun = new THREE.Vector3(0, 0, 0).sub(bodyWorldPos);
                const orbitRadius = bodyWorldPos.length();
                
                const orbitalVelocity = new THREE.Vector3(-vectorToSun.z, 0, vectorToSun.x).normalize();
                const orbitalSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / orbitRadius);
                
                this.rocketVelocity.copy(orbitalVelocity.multiplyScalar(orbitalSpeed));
            }
        }
    }
    
    /**
     * Toggle tractor beam on/off
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    toggleTractorBeam(rocketWorldPos) {
        if (this.tractorBeamActive) {
            // Deactivate tractor beam
            this.tractorBeamActive = false;
            if (this.tractorBeamHighlight && this.tractorBeamTarget) {
                this.tractorBeamTarget.remove(this.tractorBeamHighlight);
                this.tractorBeamHighlight.geometry.dispose();
                this.tractorBeamHighlight.material.dispose();
                this.tractorBeamHighlight = null;
            }
            this.tractorBeamTarget = null;
            this.tractorBeamTargetData = null;
            this.tractorBeamLandingMode = false;
            console.log('Tractor beam deactivated');
        } else {
            // Find closest body within range
            const result = this.findClosestBody(rocketWorldPos, TRACTOR_BEAM_MAX_DISTANCE);
            if (result) {
                this.tractorBeamActive = true;
                this.tractorBeamTarget = result.mesh;
                this.tractorBeamTargetData = result.data;
                this.tractorBeamLandingMode = false;
                
                // Create cyan highlight circle
                const highlightGeometry = new THREE.TorusGeometry(
                    result.data.radius * 1.1, 
                    result.data.radius * 0.05, 
                    16, 
                    100
                );
                const highlightMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.8,
                    side: THREE.DoubleSide
                });
                this.tractorBeamHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
                this.tractorBeamHighlight.rotation.x = Math.PI / 2;
                result.mesh.add(this.tractorBeamHighlight);
                
                console.log('Tractor beam locked on:', result.data.name);
            } else {
                console.log('No valid target within range');
            }
        }
    }
    
    /**
     * Find closest celestial body to a position
     * @param {THREE.Vector3} position - Position to search from
     * @param {number} maxDistance - Maximum search distance
     * @returns {Object|null} {mesh, data, distance} or null
     */
    findClosestBody(position, maxDistance = Infinity) {
        let closest = null;
        let closestDist = maxDistance;

        this.solarSystemData.forEach(planetData => {
            if (!planetData.mesh) return;
            const planetWorldPos = new THREE.Vector3();
            planetData.mesh.getWorldPosition(planetWorldPos);
            const dist = position.distanceTo(planetWorldPos);
            
            if (dist < closestDist) {
                closestDist = dist;
                closest = {
                    mesh: planetData.mesh,
                    data: {
                        ...planetData,
                        isMoon: false,
                        parentOrbitRadius: planetData.orbitRadius,
                        planetOrbitAngle: planetData.orbitAngle
                    },
                    distance: dist
                };
            }

            // Check moons
            if (planetData.moons) {
                planetData.moons.forEach(moonData => {
                    if (!moonData.mesh) return;
                    const moonWorldPos = new THREE.Vector3();
                    moonData.mesh.getWorldPosition(moonWorldPos);
                    const moonDist = position.distanceTo(moonWorldPos);
                    
                    if (moonDist < closestDist) {
                        closestDist = moonDist;
                        closest = {
                            mesh: moonData.mesh,
                            data: {
                                ...moonData,
                                isMoon: true,
                                parentOrbitRadius: planetData.orbitRadius,
                                planetRadius: planetData.radius,
                                planetOrbitAngle: planetData.orbitAngle
                            },
                            distance: moonDist
                        };
                    }
                });
            }
        });

        return closest;
    }
    
    /**
     * Update tractor beam autopilot
     * @param {number} delta - Time delta
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    updateTractorBeam(delta, rocketWorldPos) {
        const targetBodyWorldPos = new THREE.Vector3();
        this.tractorBeamTarget.getWorldPosition(targetBodyWorldPos);
        
        const currentDistance = rocketWorldPos.distanceTo(targetBodyWorldPos);
        const currentDistanceToSurface = currentDistance - this.tractorBeamTargetData.radius;
        
        // Calculate body's velocity
        const bodyVelocity = this.calculateBodyVelocity(this.tractorBeamTargetData, targetBodyWorldPos);
        
        // Check if close enough for landing mode
        const landingDistance = ROCKET_LENGTH * 1.5;
        if (currentDistanceToSurface <= landingDistance && !this.tractorBeamLandingMode) {
            this.tractorBeamLandingMode = true;
            console.log('Entering landing mode');
        }
        
        if (this.tractorBeamLandingMode) {
            this.updateTractorBeamLanding(delta, rocketWorldPos, targetBodyWorldPos, currentDistanceToSurface, bodyVelocity);
        } else {
            this.updateTractorBeamApproach(delta, rocketWorldPos, targetBodyWorldPos, currentDistanceToSurface, bodyVelocity);
        }
        
        // Update highlight pulse effect
        if (this.tractorBeamHighlight) {
            const pulseScale = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
            this.tractorBeamHighlight.scale.set(pulseScale, pulseScale, pulseScale);
        }
    }
    
    /**
     * Calculate orbital velocity of a celestial body
     * @param {Object} bodyData - Body data
     * @param {THREE.Vector3} bodyWorldPos - Body world position
     * @returns {THREE.Vector3} Body velocity vector
     */
    calculateBodyVelocity(bodyData, bodyWorldPos) {
        const bodyVelocity = new THREE.Vector3();
        
        if (bodyData.isMoon) {
            // Moon orbits planet, planet orbits sun
            const planetPos = new THREE.Vector3(
                bodyData.parentOrbitRadius * Math.cos(bodyData.planetOrbitAngle),
                0,
                bodyData.parentOrbitRadius * Math.sin(bodyData.planetOrbitAngle)
            );
            
            // Planet's velocity around sun
            const planetOrbitalVel = new THREE.Vector3(-planetPos.z, 0, planetPos.x).normalize();
            const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / bodyData.parentOrbitRadius);
            planetOrbitalVel.multiplyScalar(planetSpeed);
            
            // Moon's velocity around planet
            const moonToPlanet = planetPos.clone().sub(bodyWorldPos);
            const moonOrbitRadius = moonToPlanet.length();
            const moonOrbitalVel = new THREE.Vector3(-moonToPlanet.z, 0, moonToPlanet.x).normalize();
            const moonSpeed = Math.sqrt((G_CONSTANT * bodyData.planetRadius) / moonOrbitRadius);
            moonOrbitalVel.multiplyScalar(moonSpeed);
            
            bodyVelocity.copy(planetOrbitalVel.add(moonOrbitalVel));
        } else {
            // Planet orbits sun
            const planetOrbitalVel = new THREE.Vector3(-bodyWorldPos.z, 0, bodyWorldPos.x).normalize();
            const planetSpeed = Math.sqrt((G_CONSTANT * SUN_RADIUS) / bodyData.parentOrbitRadius);
            bodyVelocity.copy(planetOrbitalVel.multiplyScalar(planetSpeed));
        }
        
        return bodyVelocity;
    }
    
    /**
     * Update tractor beam landing mode
     */
    updateTractorBeamLanding(delta, rocketWorldPos, targetBodyWorldPos, currentDistanceToSurface, bodyVelocity) {
        // Gentle descent to surface
        const desiredLandingSpeed = Math.max(currentDistanceToSurface * 0.3, 0.5);
        const directionToSurface = targetBodyWorldPos.clone().sub(rocketWorldPos).normalize();
        
        const desiredVelocity = directionToSurface.clone()
            .multiplyScalar(desiredLandingSpeed)
            .add(bodyVelocity);
        
        // Apply strong correction
        const velocityError = desiredVelocity.clone().sub(this.rocketVelocity);
        this.rocketVelocity.add(velocityError.multiplyScalar(delta * 5));
        
        // Point rocket toward surface
        this.pointRocketToward(directionToSurface, delta, 3);
        
        // Visual feedback - green pulsing plume
        if (this.rocketPlume) {
            this.rocketPlume.visible = true;
            this.rocketPlume.scale.y = 2 + Math.sin(Date.now() * 0.005) * 0.5;
            this.rocketPlume.material.color.setHex(0x00ff00); // Green
            this.rocketPlume.material.opacity = 0.5;
        }
        
        // Check if landed
        if (currentDistanceToSurface < this.tractorBeamTargetData.radius * 0.05 && this.rocketVelocity.length() < 15) {
            this.performAutoLanding(rocketWorldPos);
        }
    }
    
    /**
     * Update tractor beam approach mode
     */
    updateTractorBeamApproach(delta, rocketWorldPos, targetBodyWorldPos, currentDistanceToSurface, bodyVelocity) {
        // Pull toward target
        const directionToBody = targetBodyWorldPos.clone().sub(rocketWorldPos).normalize();
        
        // Halve distance every second
        const approachSpeed = currentDistanceToSurface / 2.0;
        const desiredVelocity = directionToBody.clone()
            .multiplyScalar(approachSpeed)
            .add(bodyVelocity);
        
        // Point rocket toward target
        this.pointRocketToward(directionToBody, delta, 4);
        
        // Apply thrust toward target
        const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocketObject.quaternion);
        const alignmentFactor = forward.dot(directionToBody);
        const thrustMagnitude = TRACTOR_BEAM_PULL_FORCE * Math.max(alignmentFactor, 0.4);
        
        this.rocketVelocity.add(forward.multiplyScalar(thrustMagnitude * delta));
        
        // Visual feedback - cyan pulsing plume
        if (this.rocketPlume) {
            this.rocketPlume.visible = true;
            this.rocketPlume.scale.y = 4 + Math.sin(Date.now() * 0.01) * 1;
            this.rocketPlume.material.color.setHex(0x00ffff); // Cyan
            this.rocketPlume.material.opacity = 0.7;
        }
    }
    
    /**
     * Point rocket toward a direction
     * @param {THREE.Vector3} targetDirection - Direction to point toward
     * @param {number} delta - Time delta
     * @param {number} speedMultiplier - Turn speed multiplier
     */
    pointRocketToward(targetDirection, delta, speedMultiplier = 1) {
        const thrustDirection = targetDirection.clone();
        thrustDirection.y = 0;
        thrustDirection.normalize();
        
        const currentForward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rocketObject.quaternion);
        currentForward.y = 0;
        currentForward.normalize();
        
        let angleToTarget = Math.atan2(
            thrustDirection.x * currentForward.z - thrustDirection.z * currentForward.x,
            thrustDirection.x * currentForward.x + thrustDirection.z * currentForward.z
        );
        
        const maxTurnRate = ROCKET_TURN_SPEED * delta * speedMultiplier;
        angleToTarget = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleToTarget));
        this.rocketYaw += angleToTarget;
    }
    
    /**
     * Perform automatic landing on target body
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    performAutoLanding(rocketWorldPos) {
        // Find the body data for landing
        let landingBodyData = null;
        this.solarSystemData.forEach(planetData => {
            if (planetData.mesh === this.tractorBeamTarget) {
                landingBodyData = planetData;
            } else if (planetData.moons) {
                planetData.moons.forEach(moonData => {
                    if (moonData.mesh === this.tractorBeamTarget) {
                        landingBodyData = moonData;
                    }
                });
            }
        });
        
        if (landingBodyData) {
            this.landRocketOnBody(this.tractorBeamTarget, landingBodyData, rocketWorldPos);
            
            this.infoElement.textContent = `Landed in rocket on ${landingBodyData.name}. Press F to switch to character. (W thrust, A/D yaw, Q/E strafe, X brake)`;
            console.log('Auto-landed on:', landingBodyData.name);
        }
        
        // Deactivate tractor beam
        this.tractorBeamActive = false;
        if (this.tractorBeamHighlight && this.tractorBeamTarget) {
            this.tractorBeamTarget.remove(this.tractorBeamHighlight);
            this.tractorBeamHighlight.geometry.dispose();
            this.tractorBeamHighlight.material.dispose();
            this.tractorBeamHighlight = null;
        }
        this.tractorBeamTarget = null;
        this.tractorBeamTargetData = null;
        this.tractorBeamLandingMode = false;
    }
    
    /**
     * Check for collisions with celestial bodies
     * @param {THREE.Vector3} rocketWorldPos - Current rocket world position
     * @param {THREE.Vector3} prevPos - Previous rocket world position
     */
    checkRocketCollisions(rocketWorldPos, prevPos) {
        const rocketWorldPosAfter = new THREE.Vector3();
        this.rocketObject.getWorldPosition(rocketWorldPosAfter);
        const p0 = prevPos.clone();
        const p1 = rocketWorldPosAfter.clone();
        const COLLISION_MARGIN = 2.0;
        
        let collisionDetected = false;
        let collisionBody = null;
        let collisionBodyData = null;
        
        // Check all planets and moons
        this.solarSystemData.forEach(planetData => {
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
            
            // Check moons
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
        
        // Handle collision
        if (collisionDetected && collisionBodyData) {
            // Skip exploded bodies
            if (collisionBodyData.hasExploded) {
                console.log('Skipping collision with exploded body:', collisionBodyData.name);
                collisionDetected = false;
            }
            
            // Check launch assist grace period
            if (this.launchAssistGraceLeft > 0 && this.launchAssistBodyMesh && collisionBody === this.launchAssistBodyMesh) {
                const bodyWorldPos = new THREE.Vector3();
                collisionBody.getWorldPosition(bodyWorldPos);
                
                const radialVec = rocketWorldPosAfter.clone().sub(bodyWorldPos);
                const distanceFromCenter = radialVec.length();
                const distanceToSurface = distanceFromCenter - collisionBodyData.radius;
                if (radialVec.lengthSq() > 1e-8) radialVec.normalize();
                const radialSpeed = this.rocketVelocity.dot(radialVec);
                
                const nearSurface = distanceToSurface < LAUNCH_ASSIST_CLEARANCE;
                const movingOutward = radialSpeed > 0;
                if (nearSurface && movingOutward) {
                    collisionDetected = false; // Still in takeoff
                }
            }
        }
        
        // Perform forced landing
        if (collisionDetected && collisionBodyData) {
            console.log('Forced landing on:', collisionBodyData.name);
            this.landRocketOnBody(collisionBody, collisionBodyData, rocketWorldPos);
        }
    }
    
    /**
     * Land rocket on a celestial body
     * @param {THREE.Object3D} bodyMesh - Body mesh to land on
     * @param {Object} bodyData - Body data
     * @param {THREE.Vector3} rocketWorldPos - Rocket world position
     */
    landRocketOnBody(bodyMesh, bodyData, rocketWorldPos) {
        const bodyWorldPos = new THREE.Vector3();
        bodyMesh.getWorldPosition(bodyWorldPos);
        
        // Calculate surface position
        const directionFromCenter = rocketWorldPos.clone().sub(bodyWorldPos).normalize();
        const surfacePosition = directionFromCenter.clone().multiplyScalar(bodyData.radius);
        
        // Re-parent to body
        this.scene.remove(this.rocketPivot);
        bodyMesh.add(this.rocketPivot);
        
        // Reset pivot
        this.rocketPivot.position.set(0, 0, 0);
        this.rocketPivot.rotation.set(0, 0, 0);
        this.rocketPivot.quaternion.identity();
        
        // Compute surface point in local space
        const surfaceWorldPoint = bodyWorldPos.clone().add(
            directionFromCenter.clone().normalize().multiplyScalar(bodyData.radius)
        );
        const surfaceLocalPoint = surfaceWorldPoint.clone();
        bodyMesh.worldToLocal(surfaceLocalPoint);
        
        // Place rocket on surface
        const localUp = surfaceLocalPoint.clone().normalize();
        this.rocketObject.position.copy(localUp.clone().multiplyScalar(bodyData.radius));
        
        // Align rocket with surface normal
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localUp);
        this.rocketObject.quaternion.copy(q);
        this.rocketYaw = 0;
        
        // Stop motion
        this.rocketVelocity.set(0, 0, 0);
        this.rocketYaw = 0;
        
        // Cancel launch assist
        this.launchAssistActive = false;
        this.launchAssistBody = null;
        this.launchAssistGraceLeft = 0;
        this.launchAssistBodyMesh = null;
        
        // Hide plume
        if (this.rocketPlume) {
            this.rocketPlume.visible = false;
        }
        
        // Exit tractor beam if active
        if (this.tractorBeamActive) {
            this.tractorBeamActive = false;
            if (this.tractorBeamHighlight && this.tractorBeamTarget) {
                this.tractorBeamTarget.remove(this.tractorBeamHighlight);
                this.tractorBeamHighlight.geometry.dispose();
                this.tractorBeamHighlight.material.dispose();
                this.tractorBeamHighlight = null;
            }
            this.tractorBeamTarget = null;
            this.tractorBeamTargetData = null;
            this.tractorBeamLandingMode = false;
        }
        
        // Update state
        this.rocketLaunchPlanet = bodyMesh;
        this.isInRocket = true;
        this.rocketObject.visible = true;
    }
    
    /**
     * Check if rocket is currently landed
     * @returns {boolean}
     */
    isLanded() {
        return this.rocketPivot && this.rocketPivot.parent !== this.scene;
    }
    
    /**
     * Get rocket state for saving/loading
     * @returns {Object}
     */
    getState() {
        return {
            isInRocket: this.isInRocket,
            position: this.rocketPivot ? this.rocketPivot.position.clone() : null,
            velocity: this.rocketVelocity.clone(),
            yaw: this.rocketYaw,
            isLanded: this.isLanded()
        };
    }
    
    /**
     * Dispose of resources
     */
    dispose() {
        if (this.trajectoryLine) {
            this.scene.remove(this.trajectoryLine);
            this.trajectoryLine.geometry.dispose();
            this.trajectoryLine.material.dispose();
        }
        
        if (this.tractorBeamHighlight) {
            this.tractorBeamHighlight.geometry.dispose();
            this.tractorBeamHighlight.material.dispose();
        }
        
        if (this.rocketPivot) {
            this.scene.remove(this.rocketPivot);
        }
    }
}
