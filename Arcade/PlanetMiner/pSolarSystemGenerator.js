import { 
    SUN_RADIUS,
    NUM_PLANETS, 
    PLANET_MIN_RADIUS, 
    PLANET_MAX_RADIUS, 
    MAX_MOONS_PER_PLANET, 
    MOON_MIN_RADIUS_FACTOR, 
    MOON_MAX_RADIUS_FACTOR 
} from './pConstants.js';

/**
 * Solar System Generator Module
 * Handles procedural generation of planets, moons, rings, and orbits
 */

/**
 * Generate a procedural solar system with planets, moons, and rings
 * @returns {Array} Array of planet data objects
 */
export function generateSolarSystem() {
    const solarSystem = [];
    const outerPlanetStartIndex = Math.floor(NUM_PLANETS / 2);

    // 1. Generate random sizes and properties for planets, moons, and rings
    for (let i = 0; i < NUM_PLANETS; i++) {
        const planetRadius = PLANET_MIN_RADIUS + Math.random() * (PLANET_MAX_RADIUS - PLANET_MIN_RADIUS);

        const isGasGiant = i >= outerPlanetStartIndex && Math.random() < 0.9;
        const effectiveRadius = isGasGiant ? planetRadius * 2 : planetRadius;

        // --- Moons ---
        const numMoons = Math.floor(Math.random() * (MAX_MOONS_PER_PLANET + 1));
        const moons = [];
        for (let j = 0; j < numMoons; j++) {
            const moonMin = planetRadius * MOON_MIN_RADIUS_FACTOR;
            const moonMax = planetRadius * MOON_MAX_RADIUS_FACTOR;
            const moonRadius = moonMin + Math.random() * (moonMax - moonMin);
            moons.push({
                type: 'moon',
                radius: moonRadius,
                orbitRadius: 0,
                orbitAngle: Math.random() * Math.PI * 2,
                orbitSpeed: (0.2 + Math.random() * 0.8),
                moonGroup: null,
                mesh: null
            });
        }

        // --- Rings ---
        const rings = [];
        const hasRings = (isGasGiant && Math.random() < 0.5) || (!isGasGiant && Math.random() < 0.05);
        if (hasRings) {
            const numRings = isGasGiant ? Math.floor(Math.random() * 3) + 1 : 1;
            for (let j = 0; j < numRings; j++) {
                rings.push({
                    type: 'ring',
                    innerRadius: 0,
                    outerRadius: 0,
                    // For rendering
                    mesh: null
                });
            }
        }

        solarSystem.push({
            radius: planetRadius,
            isGasGiant: isGasGiant,
            effectiveRadius: effectiveRadius,
            orbitRadius: 0,
            moons: moons,
            rings: rings,
            orbiters: [], // Combined list for orbital calculations
            ringSystemGroup: null, // For rotating the entire ring system
            planetGroup: null,
            mesh: null,
            orbitAngle: Math.random() * Math.PI * 2,
            orbitSpeed: (0.05 + Math.random() * 0.15)
        });
    }

    // 2. Calculate orbits by alternating moons and rings
    solarSystem.forEach(planet => {
        const localMoons = [...planet.moons];
        const localRings = [...planet.rings];

        // Create an alternating list of moons and rings
        while (localMoons.length > 0 || localRings.length > 0) {
            if (localRings.length > 0) {
                planet.orbiters.push(localRings.shift());
            }
            if (localMoons.length > 0) {
                planet.orbiters.push(localMoons.shift());
            }
        }

        if (planet.orbiters.length === 0) return;

        // Calculate positions sequentially
        let lastOrbitEnd = planet.effectiveRadius + (planet.effectiveRadius * 0.4); // Start with a gap from the planet surface

        for (let i = 0; i < planet.orbiters.length; i++) {
            const orbiter = planet.orbiters[i];
            const gap = planet.effectiveRadius * (0.2 + Math.random() * 0.2); // Random gap between orbiters

            if (orbiter.type === 'ring') {
                const ringWidth = planet.effectiveRadius * (0.3 + Math.random() * 0.5);
                orbiter.innerRadius = lastOrbitEnd + gap;
                orbiter.outerRadius = orbiter.innerRadius + ringWidth;
                lastOrbitEnd = orbiter.outerRadius;
            } else if (orbiter.type === 'moon') {
                orbiter.orbitRadius = lastOrbitEnd + gap + orbiter.radius;
                lastOrbitEnd = orbiter.orbitRadius + orbiter.radius;
            }
        }
    });

    // 3. Calculate planet orbits based on the specified rules
    const getOutermostDiameter = (body) => {
        if (body.orbiters.length === 0) {
            return body.effectiveRadius * 2;
        }
        const outermostObject = body.orbiters[body.orbiters.length - 1];
        let outermostEdge = 0;
        if (outermostObject.type === 'moon') {
            outermostEdge = outermostObject.orbitRadius + outermostObject.radius;
        } else { // It's a ring
            outermostEdge = outermostObject.outerRadius;
        }
        return outermostEdge * 2;
    };

    if (solarSystem.length > 0) {
        solarSystem[0].orbitRadius = (SUN_RADIUS * 2) + getOutermostDiameter(solarSystem[0]);

        for (let i = 1; i < solarSystem.length; i++) {
            const prevPlanet = solarSystem[i - 1];
            const currentPlanet = solarSystem[i];
            currentPlanet.orbitRadius = prevPlanet.orbitRadius + getOutermostDiameter(prevPlanet) + getOutermostDiameter(currentPlanet);
        }
    }

    return solarSystem;
}

/**
 * Calculate the maximum distance from a planet's center to its outermost orbiter
 * Used for camera zoom calculations
 * @param {Object} planetData - Planet data object
 * @returns {number} Maximum distance in scene units
 */
export function getOrbitMaxDistance(planetData) {
    if (planetData.orbiters.length === 0) return planetData.effectiveRadius * 3;
    const outermost = planetData.orbiters[planetData.orbiters.length - 1];
    let distance = 0;
    if (outermost.type === 'moon') {
        distance = outermost.orbitRadius + outermost.radius;
    } else { // It's a ring
        distance = outermost.outerRadius;
    }
    return distance * 2;
}

/**
 * Get the outermost diameter of a celestial body including all orbiters
 * @param {Object} body - Planet or moon data object
 * @returns {number} Diameter in scene units
 */
export function getOutermostDiameter(body) {
    if (body.orbiters && body.orbiters.length === 0) {
        return body.effectiveRadius * 2;
    }
    if (!body.orbiters) {
        return (body.effectiveRadius || body.radius) * 2;
    }
    const outermostObject = body.orbiters[body.orbiters.length - 1];
    let outermostEdge = 0;
    if (outermostObject.type === 'moon') {
        outermostEdge = outermostObject.orbitRadius + outermostObject.radius;
    } else { // It's a ring
        outermostEdge = outermostObject.outerRadius;
    }
    return outermostEdge * 2;
}

/**
 * Update orbital positions for all planets in the solar system
 * @param {Array} solarSystemData - Array of planet data objects
 * @param {number} deltaTime - Time elapsed since last update
 */
export function updateOrbits(solarSystemData, deltaTime) {
    solarSystemData.forEach(planetData => {
        // Update planet orbit angle
        planetData.orbitAngle += planetData.orbitSpeed * deltaTime;
        
        // Update planet group position if it exists
        if (planetData.planetGroup) {
            const x = Math.cos(planetData.orbitAngle) * planetData.orbitRadius;
            const z = Math.sin(planetData.orbitAngle) * planetData.orbitRadius;
            planetData.planetGroup.position.set(x, 0, z);
        }
        
        // Update moon orbits
        planetData.moons.forEach(moon => {
            moon.orbitAngle += moon.orbitSpeed * deltaTime;
            
            if (moon.moonGroup) {
                const mx = Math.cos(moon.orbitAngle) * moon.orbitRadius;
                const mz = Math.sin(moon.orbitAngle) * moon.orbitRadius;
                moon.moonGroup.position.set(mx, 0, mz);
            }
        });
    });
}
