import * as THREE from 'three';
import { G_CONSTANT, CHARACTER_GRAVITY } from './pConstants.js';

/**
 * Physics Module
 * Handles gravity calculations, collision detection, and physics utilities
 */

/**
 * Calculate gravitational force between two bodies
 * @param {THREE.Vector3} position - Position of the object experiencing gravity
 * @param {THREE.Vector3} bodyPosition - Position of the gravitating body
 * @param {number} bodyRadius - Radius of the gravitating body (used as mass proxy)
 * @param {number} gravitationalConstant - G constant (default from constants)
 * @returns {THREE.Vector3} Gravity force vector
 */
export function calculateGravityForce(position, bodyPosition, bodyRadius, gravitationalConstant = G_CONSTANT) {
    const vectorToBody = bodyPosition.clone().sub(position);
    const distanceSq = vectorToBody.lengthSq();
    
    if (distanceSq <= 1) {
        return new THREE.Vector3(0, 0, 0);
    }
    
    const gravityStrength = (gravitationalConstant * bodyRadius) / distanceSq;
    return vectorToBody.normalize().multiplyScalar(gravityStrength);
}

/**
 * Calculate total gravity force from multiple celestial bodies
 * @param {THREE.Vector3} position - Position to calculate gravity at
 * @param {Array} celestialBodies - Array of body data objects
 * @param {THREE.Object3D} sun - Sun object (optional)
 * @param {number} sunRadius - Sun radius (optional)
 * @returns {THREE.Vector3} Total gravity force vector
 */
export function calculateTotalGravity(position, celestialBodies, sun = null, sunRadius = 0) {
    const totalGravityForce = new THREE.Vector3();
    const bodyWorldPos = new THREE.Vector3();
    
    // Add sun gravity if provided
    if (sun && sunRadius > 0) {
        sun.getWorldPosition(bodyWorldPos);
        const sunGravity = calculateGravityForce(position, bodyWorldPos, sunRadius);
        totalGravityForce.add(sunGravity);
    }
    
    // Calculate gravity from each celestial body
    celestialBodies.forEach(body => {
        let gravitySource = null;
        let bodyRadius = body.radius;
        
        // For exploded bodies, use the black hole bubble; otherwise use the mesh
        if (body.hasExploded && body.blackHoleBubble) {
            gravitySource = body.blackHoleBubble;
            bodyRadius = body.blackHoleBubble.userData.originalRadius || body.radius;
        } else if (body.mesh) {
            gravitySource = body.mesh;
        }
        
        if (!gravitySource) return;
        
        gravitySource.getWorldPosition(bodyWorldPos);
        const gravityForce = calculateGravityForce(position, bodyWorldPos, bodyRadius);
        totalGravityForce.add(gravityForce);
    });
    
    return totalGravityForce;
}

/**
 * Calculate gravity for trajectory prediction with moon support
 * @param {THREE.Vector3} position - Current position in trajectory
 * @param {Array} solarSystemData - Array of planet data
 * @param {THREE.Object3D} sun - Sun object
 * @param {number} sunRadius - Sun radius
 * @param {Set} planetsEncountered - Set to track which planets we're near (for moon gravity)
 * @returns {THREE.Vector3} Total gravity force
 */
export function calculateTrajectoryGravity(position, solarSystemData, sun, sunRadius, planetsEncountered) {
    const totalGravityForce = new THREE.Vector3();
    
    // Find closest planet and check spheres of influence
    solarSystemData.forEach(planetData => {
        if (!planetData.mesh) return;
        
        const planetWorldPos = new THREE.Vector3();
        planetData.mesh.getWorldPosition(planetWorldPos);
        const dist = position.distanceTo(planetWorldPos);
        
        // Calculate sphere of influence (includes moon system)
        let sphereOfInfluence = planetData.effectiveRadius * 3;
        if (planetData.orbiters && planetData.orbiters.length > 0) {
            const outermost = planetData.orbiters[planetData.orbiters.length - 1];
            if (outermost.type === 'moon') {
                sphereOfInfluence = (outermost.orbitRadius + outermost.radius) * 1.5;
            } else if (outermost.outerRadius) {
                sphereOfInfluence = outermost.outerRadius * 1.5;
            }
        }
        
        if (dist < sphereOfInfluence) {
            planetsEncountered.add(planetData);
        }
    });
    
    // Build list of celestial bodies to calculate gravity from
    const celestialBodies = [...solarSystemData, { mesh: sun, radius: sunRadius }];
    
    // Add moons from all planets we've encountered
    planetsEncountered.forEach(planetData => {
        if (planetData.moons) {
            planetData.moons.forEach(moonData => {
                celestialBodies.push(moonData);
            });
        }
    });
    
    // Calculate total gravity
    celestialBodies.forEach(body => {
        let gravitySource = null;
        let bodyRadius = body.radius;
        
        if (body.hasExploded && body.blackHoleBubble) {
            gravitySource = body.blackHoleBubble;
            bodyRadius = body.blackHoleBubble.userData.originalRadius || body.radius;
        } else if (body.mesh) {
            gravitySource = body.mesh;
        }
        
        if (!gravitySource) return;
        
        const bodyWorldPos = new THREE.Vector3();
        gravitySource.getWorldPosition(bodyWorldPos);
        const vectorToBody = bodyWorldPos.sub(position);
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
 * Check if a line segment intersects with a sphere
 * Used for anti-tunneling collision detection
 * @param {THREE.Vector3} p0 - Start point of segment
 * @param {THREE.Vector3} p1 - End point of segment
 * @param {THREE.Vector3} center - Center of sphere
 * @param {number} radius - Radius of sphere
 * @returns {boolean} True if segment intersects sphere
 */
export function segmentIntersectsSphere(p0, p1, center, radius) {
    const d = p1.clone().sub(p0);
    const f = p0.clone().sub(center);
    const a = d.dot(d);
    
    if (a === 0) {
        // No movement, check if point is inside sphere
        return f.length() <= radius;
    }
    
    const b = 2 * f.dot(d);
    const c = f.dot(f) - radius * radius;
    const disc = b * b - 4 * a * c;
    
    if (disc < 0) {
        return false; // No intersection
    }
    
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a);
    const t2 = (-b + s) / (2 * a);
    
    // Check if intersection occurs within the segment [0, 1]
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

/**
 * Check collision between a sphere and all celestial bodies
 * @param {THREE.Vector3} position - Position to check
 * @param {number} radius - Radius of collision sphere
 * @param {Array} celestialBodies - Array of bodies to check against
 * @param {Object} options - Optional parameters (excludeBody, useBlackHoleBubbles)
 * @returns {Object|null} Collision data {body, distance} or null if no collision
 */
export function checkSphereCollision(position, radius, celestialBodies, options = {}) {
    const { excludeBody = null, useBlackHoleBubbles = false } = options;
    
    for (const body of celestialBodies) {
        if (body === excludeBody) continue;
        
        let collisionSource = null;
        let bodyRadius = body.radius;
        
        if (useBlackHoleBubbles && body.blackHoleBubble) {
            collisionSource = body.blackHoleBubble;
        } else if (body.mesh) {
            collisionSource = body.mesh;
        }
        
        if (!collisionSource) continue;
        
        const bodyWorldPos = new THREE.Vector3();
        collisionSource.getWorldPosition(bodyWorldPos);
        const distance = position.distanceTo(bodyWorldPos);
        const collisionRadius = bodyRadius + radius;
        
        if (distance < collisionRadius) {
            return {
                body: body,
                bodyPosition: bodyWorldPos,
                distance: distance,
                penetrationDepth: collisionRadius - distance
            };
        }
    }
    
    return null;
}

/**
 * Find a celestial body by its mesh
 * @param {THREE.Mesh} mesh - Mesh to search for
 * @param {Array} solarSystemData - Array of planet data
 * @returns {Object|null} {systemIndex, bodyIndex} or null if not found
 */
export function findBodyByMesh(mesh, solarSystemData) {
    for (let si = 0; si < solarSystemData.length; si++) {
        const p = solarSystemData[si];
        if (p.mesh === mesh) {
            return { systemIndex: si, bodyIndex: 0, body: p };
        }
        for (let mi = 0; mi < p.moons.length; mi++) {
            const m = p.moons[mi];
            if (m.mesh === mesh) {
                return { systemIndex: si, bodyIndex: mi + 1, body: m };
            }
        }
    }
    return null;
}

/**
 * Apply character gravity and handle ground collision
 * @param {THREE.Object3D} pivot - Character pivot
 * @param {number} velocityY - Current vertical velocity
 * @param {number} deltaTime - Time step
 * @param {THREE.Object3D} currentSurfaceObject - Current surface mesh
 * @param {number} bodyHalfHeight - Half height of character body
 * @returns {Object} {newVelocityY, isGrounded, vPos}
 */
export function applyCharacterGravity(pivot, velocityY, deltaTime, currentSurfaceObject, bodyHalfHeight) {
    let newVelocityY = velocityY;
    let isGrounded = false;
    let vPos = pivot.position.y;
    
    if (!currentSurfaceObject) {
        return { newVelocityY, isGrounded, vPos };
    }
    
    // Apply gravity
    newVelocityY += CHARACTER_GRAVITY * deltaTime;
    vPos += newVelocityY * deltaTime;
    
    // Ground collision
    const raycaster = new THREE.Raycaster();
    raycaster.set(
        new THREE.Vector3(pivot.position.x, vPos, pivot.position.z),
        new THREE.Vector3(0, -1, 0)
    );
    raycaster.far = bodyHalfHeight + 1;
    
    const intersects = raycaster.intersectObject(currentSurfaceObject, true);
    
    if (intersects.length > 0 && newVelocityY <= 0) {
        const hitPoint = intersects[0].point;
        vPos = hitPoint.y + bodyHalfHeight;
        newVelocityY = 0;
        isGrounded = true;
    }
    
    return { newVelocityY, isGrounded, vPos };
}

/**
 * Calculate escape velocity for a body
 * @param {number} bodyRadius - Radius of the body
 * @param {number} distance - Distance from body center
 * @returns {number} Escape velocity
 */
export function calculateEscapeVelocity(bodyRadius, distance) {
    return Math.sqrt((2 * G_CONSTANT * bodyRadius) / distance);
}

/**
 * Calculate orbital velocity for a circular orbit
 * @param {number} bodyRadius - Radius of the body being orbited
 * @param {number} orbitRadius - Radius of the orbit
 * @returns {number} Orbital velocity
 */
export function calculateOrbitalVelocity(bodyRadius, orbitRadius) {
    return Math.sqrt((G_CONSTANT * bodyRadius) / orbitRadius);
}

/**
 * Get all bodies within a sphere of influence
 * @param {THREE.Vector3} position - Center position
 * @param {number} radius - Sphere radius
 * @param {Array} solarSystemData - Array of planet data
 * @returns {Array} Array of bodies within range
 */
export function getBodiesInRange(position, radius, solarSystemData) {
    const bodiesInRange = [];
    
    solarSystemData.forEach(planetData => {
        if (!planetData.mesh) return;
        
        const planetWorldPos = new THREE.Vector3();
        planetData.mesh.getWorldPosition(planetWorldPos);
        const distance = position.distanceTo(planetWorldPos);
        
        if (distance < radius) {
            bodiesInRange.push({
                body: planetData,
                distance: distance,
                type: 'planet'
            });
            
            // Check moons
            if (planetData.moons) {
                planetData.moons.forEach(moonData => {
                    if (!moonData.mesh) return;
                    
                    const moonWorldPos = new THREE.Vector3();
                    moonData.mesh.getWorldPosition(moonWorldPos);
                    const moonDistance = position.distanceTo(moonWorldPos);
                    
                    if (moonDistance < radius) {
                        bodiesInRange.push({
                            body: moonData,
                            distance: moonDistance,
                            type: 'moon'
                        });
                    }
                });
            }
        }
    });
    
    // Sort by distance (closest first)
    bodiesInRange.sort((a, b) => a.distance - b.distance);
    
    return bodiesInRange;
}

/**
 * Physics utility class for common calculations
 */
export class PhysicsUtils {
    /**
     * Clamp a vector's magnitude
     * @param {THREE.Vector3} vector - Vector to clamp
     * @param {number} maxMagnitude - Maximum magnitude
     * @returns {THREE.Vector3} Clamped vector
     */
    static clampVectorMagnitude(vector, maxMagnitude) {
        const magnitude = vector.length();
        if (magnitude > maxMagnitude) {
            return vector.normalize().multiplyScalar(maxMagnitude);
        }
        return vector;
    }
    
    /**
     * Smoothly damp a value towards a target
     * @param {number} current - Current value
     * @param {number} target - Target value
     * @param {number} smoothTime - Approximate time to reach target
     * @param {number} deltaTime - Time step
     * @returns {number} Damped value
     */
    static smoothDamp(current, target, smoothTime, deltaTime) {
        const omega = 2.0 / smoothTime;
        const x = omega * deltaTime;
        const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
        return current + (target - current) * (1.0 - exp);
    }
    
    /**
     * Linear interpolation
     * @param {number} a - Start value
     * @param {number} b - End value
     * @param {number} t - Interpolation factor (0-1)
     * @returns {number} Interpolated value
     */
    static lerp(a, b, t) {
        return a + (b - a) * Math.max(0, Math.min(1, t));
    }
}
