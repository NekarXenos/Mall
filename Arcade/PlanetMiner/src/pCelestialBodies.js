import * as THREE from 'three';

/**
 * Celestial Body Classes Module
 * Base classes and utilities for planets, moons, and rings
 */

/**
 * Base class for all celestial bodies
 */
export class CelestialBody {
    constructor(radius, orbitRadius = 0, orbitSpeed = 0) {
        this.radius = radius;
        this.orbitRadius = orbitRadius;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitSpeed = orbitSpeed;
        this.mesh = null;
        this.parentGroup = null;
        this.name = '';
    }

    /**
     * Update orbital position
     * @param {number} deltaTime - Time elapsed since last update
     */
    updateOrbit(deltaTime) {
        this.orbitAngle += this.orbitSpeed * deltaTime;
        
        if (this.parentGroup) {
            const x = Math.cos(this.orbitAngle) * this.orbitRadius;
            const z = Math.sin(this.orbitAngle) * this.orbitRadius;
            this.parentGroup.position.set(x, 0, z);
        }
    }

    /**
     * Get world position of this body
     * @returns {THREE.Vector3}
     */
    getWorldPosition() {
        if (this.parentGroup) {
            const worldPos = new THREE.Vector3();
            this.parentGroup.getWorldPosition(worldPos);
            return worldPos;
        }
        return new THREE.Vector3();
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.mesh) {
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(mat => mat.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
        }
    }
}

/**
 * Planet class
 */
export class Planet extends CelestialBody {
    constructor(radius, orbitRadius, orbitSpeed, isGasGiant = false) {
        super(radius, orbitRadius, orbitSpeed);
        
        this.type = 'planet';
        this.isGasGiant = isGasGiant;
        this.effectiveRadius = isGasGiant ? radius * 2 : radius;
        
        // Visual elements
        this.planetGroup = null;
        this.blackHoleBubble = null;
        this.waterSphere = null;
        this.waterRadius = 0;
        this.atmosphereSphere = null;
        this.atmosphereRadius = 0;
        this.gasSphere = null;
        this.liquidSphere = null;
        this.liquidRadius = 0;
        this.orbitPathMesh = null;
        
        // Orbital system
        this.moons = [];
        this.rings = [];
        this.orbiters = []; // Combined list for calculations
        this.ringSystemGroup = null;
    }

    /**
     * Add a moon to this planet
     * @param {Moon} moon
     */
    addMoon(moon) {
        this.moons.push(moon);
        moon.parentPlanet = this;
    }

    /**
     * Add a ring to this planet
     * @param {Ring} ring
     */
    addRing(ring) {
        this.rings.push(ring);
        ring.parentPlanet = this;
    }

    /**
     * Calculate orbiters (moons and rings) in alternating order
     */
    calculateOrbiters() {
        const localMoons = [...this.moons];
        const localRings = [...this.rings];

        this.orbiters = [];

        // Create an alternating list of moons and rings
        while (localMoons.length > 0 || localRings.length > 0) {
            if (localRings.length > 0) {
                this.orbiters.push(localRings.shift());
            }
            if (localMoons.length > 0) {
                this.orbiters.push(localMoons.shift());
            }
        }

        if (this.orbiters.length === 0) return;

        // Calculate positions sequentially
        let lastOrbitEnd = this.effectiveRadius + (this.effectiveRadius * 0.4);

        for (let i = 0; i < this.orbiters.length; i++) {
            const orbiter = this.orbiters[i];
            const gap = this.effectiveRadius * (0.2 + Math.random() * 0.2);

            if (orbiter.type === 'ring') {
                const ringWidth = this.effectiveRadius * (0.3 + Math.random() * 0.5);
                orbiter.innerRadius = lastOrbitEnd + gap;
                orbiter.outerRadius = orbiter.innerRadius + ringWidth;
                lastOrbitEnd = orbiter.outerRadius;
            } else if (orbiter.type === 'moon') {
                orbiter.orbitRadius = lastOrbitEnd + gap + orbiter.radius;
                lastOrbitEnd = orbiter.orbitRadius + orbiter.radius;
            }
        }
    }

    /**
     * Get the outermost diameter including all orbiters
     * @returns {number}
     */
    getOutermostDiameter() {
        if (this.orbiters.length === 0) {
            return this.effectiveRadius * 2;
        }
        const outermostObject = this.orbiters[this.orbiters.length - 1];
        let outermostEdge = 0;
        if (outermostObject.type === 'moon') {
            outermostEdge = outermostObject.orbitRadius + outermostObject.radius;
        } else {
            outermostEdge = outermostObject.outerRadius;
        }
        return outermostEdge * 2;
    }

    /**
     * Get maximum orbit distance for camera calculations
     * @returns {number}
     */
    getOrbitMaxDistance() {
        if (this.orbiters.length === 0) return this.effectiveRadius * 3;
        const outermost = this.orbiters[this.orbiters.length - 1];
        let distance = 0;
        if (outermost.type === 'moon') {
            distance = outermost.orbitRadius + outermost.radius;
        } else {
            distance = outermost.outerRadius;
        }
        return distance * 2;
    }

    /**
     * Update this planet and all its moons
     * @param {number} deltaTime
     */
    update(deltaTime) {
        this.updateOrbit(deltaTime);
        
        // Update moons
        this.moons.forEach(moon => moon.updateOrbit(deltaTime));
        
        // Rotate ring system if it exists
        if (this.ringSystemGroup) {
            this.ringSystemGroup.rotation.z += deltaTime * 0.1;
        }
    }

    /**
     * Dispose of all resources including moons and rings
     */
    dispose() {
        super.dispose();
        
        // Dispose moons
        this.moons.forEach(moon => moon.dispose());
        
        // Dispose rings
        this.rings.forEach(ring => ring.dispose());
        
        // Dispose additional visual elements
        if (this.waterSphere) {
            if (this.waterSphere.geometry) this.waterSphere.geometry.dispose();
            if (this.waterSphere.material) this.waterSphere.material.dispose();
        }
        if (this.atmosphereSphere) {
            if (this.atmosphereSphere.geometry) this.atmosphereSphere.geometry.dispose();
            if (this.atmosphereSphere.material) this.atmosphereSphere.material.dispose();
        }
        if (this.gasSphere) {
            if (this.gasSphere.geometry) this.gasSphere.geometry.dispose();
            if (this.gasSphere.material) this.gasSphere.material.dispose();
        }
        if (this.liquidSphere) {
            if (this.liquidSphere.geometry) this.liquidSphere.geometry.dispose();
            if (this.liquidSphere.material) this.liquidSphere.material.dispose();
        }
    }
}

/**
 * Moon class
 */
export class Moon extends CelestialBody {
    constructor(radius, orbitRadius, orbitSpeed) {
        super(radius, orbitRadius, orbitSpeed);
        
        this.type = 'moon';
        this.isMoon = true;
        this.parentPlanet = null;
        this.moonGroup = null;
        this.blackHoleBubble = null;
    }

    /**
     * Update moon orbit
     * @param {number} deltaTime
     */
    updateOrbit(deltaTime) {
        this.orbitAngle += this.orbitSpeed * deltaTime;
        
        if (this.moonGroup) {
            const x = Math.cos(this.orbitAngle) * this.orbitRadius;
            const z = Math.sin(this.orbitAngle) * this.orbitRadius;
            this.moonGroup.position.set(x, 0, z);
        }
    }
}

/**
 * Ring class
 */
export class Ring {
    constructor(innerRadius = 0, outerRadius = 0) {
        this.type = 'ring';
        this.innerRadius = innerRadius;
        this.outerRadius = outerRadius;
        this.mesh = null;
        this.parentPlanet = null;
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.mesh) {
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
    }
}

/**
 * Factory function to create a planet with moons and rings
 * @param {Object} config - Configuration object
 * @returns {Planet}
 */
export function createPlanet(config) {
    const {
        radius,
        orbitRadius,
        orbitSpeed,
        isGasGiant = false,
        numMoons = 0,
        hasRings = false,
        numRings = 0
    } = config;

    const planet = new Planet(radius, orbitRadius, orbitSpeed, isGasGiant);

    // Add moons
    for (let i = 0; i < numMoons; i++) {
        const moonRadius = radius * (0.1 + Math.random() * 0.3); // 10-40% of planet size
        const moon = new Moon(
            moonRadius,
            0, // Will be calculated later
            0.2 + Math.random() * 0.8
        );
        planet.addMoon(moon);
    }

    // Add rings
    if (hasRings) {
        for (let i = 0; i < numRings; i++) {
            const ring = new Ring();
            planet.addRing(ring);
        }
    }

    // Calculate orbiter positions
    planet.calculateOrbiters();

    return planet;
}

/**
 * Convert legacy planet data to Planet class instance
 * @param {Object} legacyData - Old planet data structure
 * @returns {Planet}
 */
export function convertLegacyPlanetData(legacyData) {
    const planet = new Planet(
        legacyData.radius,
        legacyData.orbitRadius,
        legacyData.orbitSpeed,
        legacyData.isGasGiant
    );

    // Copy properties
    Object.assign(planet, legacyData);

    // Convert moons
    planet.moons = legacyData.moons.map(moonData => {
        const moon = new Moon(moonData.radius, moonData.orbitRadius, moonData.orbitSpeed);
        Object.assign(moon, moonData);
        moon.parentPlanet = planet;
        return moon;
    });

    // Convert rings
    planet.rings = legacyData.rings.map(ringData => {
        const ring = new Ring(ringData.innerRadius, ringData.outerRadius);
        Object.assign(ring, ringData);
        ring.parentPlanet = planet;
        return ring;
    });

    planet.orbiters = legacyData.orbiters || [];

    return planet;
}
