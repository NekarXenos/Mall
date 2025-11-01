/**
 * LOD (Level of Detail) System Module
 * Manages terrain detail levels based on camera position and game state
 */

import * as THREE from 'three';
import { TerrainGenerator, TERRAIN_COLOR_THEMES } from './pTerrain.js';

/**
 * LOD levels for celestial bodies
 */
export const LOD_LEVELS = {
    HIGH: 'high',       // Full voxel terrain with marching cubes
    MEDIUM: 'medium',   // Textured sphere
    LOW: 'low'          // Simple icosahedron
};

/**
 * LOD Manager
 * Handles dynamic LOD switching for all celestial bodies
 */
export class LODManager {
    constructor(scene, sun) {
        this.scene = scene;
        this.sun = sun;
        this.lodCache = new Map(); // Cache LOD meshes by body ID
        this.bodyLODStates = new Map(); // Track current LOD level per body
    }

    /**
     * Get unique ID for a body
     * @param {number} systemIndex - Planet system index
     * @param {number} bodyIndex - Body index (0 = planet, >0 = moon)
     * @returns {string}
     */
    getBodyId(systemIndex, bodyIndex) {
        return `${systemIndex}-${bodyIndex}`;
    }

    /**
     * Pregenerate all high LOD voxel terrains at startup
     * This prevents lag spikes when switching to high LOD during gameplay
     * @param {Array} solarSystemData - All planet/moon data
     * @param {Function} progressCallback - Optional callback(current, total) for progress tracking
     */
    pregenerateAllHighLOD(solarSystemData, progressCallback = null) {
        console.log('Pregenerating high LOD voxel terrains...');
        const startTime = performance.now();
        let generated = 0;
        let totalBodies = 0;
        
        // Count total bodies
        solarSystemData.forEach(planetData => {
            totalBodies++; // Planet
            if (planetData.moons) {
                totalBodies += planetData.moons.length; // Moons
            }
        });
        
        // Generate high LOD for all bodies
        solarSystemData.forEach((planetData, pIndex) => {
            // Generate planet terrain
            this.createHighLOD(planetData);
            generated++;
            if (progressCallback) progressCallback(generated, totalBodies);
            
            // Generate moon terrains
            if (planetData.moons) {
                planetData.moons.forEach((moonData, mIndex) => {
                    this.createHighLOD(moonData);
                    generated++;
                    if (progressCallback) progressCallback(generated, totalBodies);
                });
            }
        });
        
        const endTime = performance.now();
        console.log(`Pregenerated ${generated} high LOD terrains in ${(endTime - startTime).toFixed(0)}ms`);
    }

    /**
     * Create high LOD voxel terrain
     * @param {Object} bodyData - Planet or moon data
     * @returns {THREE.Mesh}
     */
    createHighLOD(bodyData) {
        const bodyId = this.getBodyId(bodyData.systemIndex, bodyData.bodyIndex);
        const cacheKey = `${bodyId}-high`;
        
        // If mesh already exists in bodyData and matches our expectations, cache and return it
        if (bodyData.mesh && bodyData.mesh.userData.lodLevel === LOD_LEVELS.HIGH) {
            if (!this.lodCache.has(cacheKey)) {
                this.lodCache.set(cacheKey, bodyData.mesh);
            }
            return bodyData.mesh;
        }
        
        // Check cache second - this will be hit during LOD switches after pregeneration
        if (this.lodCache.has(cacheKey)) {
            const cached = this.lodCache.get(cacheKey);
            return cached;
        }

        // Generate new terrain (only happens during pregeneration or if cache is cleared)
        const terrainGen = new TerrainGenerator(
            bodyData.radius,
            bodyData.seed || `planet-${bodyId}`,
            bodyData.colorTheme || TERRAIN_COLOR_THEMES.ROCKY
        );
        
        const terrainMesh = terrainGen.generateTerrainMesh();
        terrainMesh.userData.lodLevel = LOD_LEVELS.HIGH;
        terrainMesh.userData.bodyId = bodyId;
        
        this.lodCache.set(cacheKey, terrainMesh);
        return terrainMesh;
    }

    /**
     * Create medium LOD textured sphere
     * @param {Object} bodyData - Planet or moon data
     * @returns {THREE.Mesh}
     */
    createMediumLOD(bodyData) {
        const bodyId = this.getBodyId(bodyData.systemIndex, bodyData.bodyIndex);
        const cacheKey = `${bodyId}-medium`;
        
        // Check cache first
        if (this.lodCache.has(cacheKey)) {
            return this.lodCache.get(cacheKey);
        }

        const geometry = new THREE.SphereGeometry(bodyData.radius, 32, 32);
        
        // Create simple procedural texture based on color theme
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Generate simple noise texture based on theme
        this.generateTextureForTheme(ctx, bodyData.colorTheme || TERRAIN_COLOR_THEMES.ROCKY, bodyData.seed);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.8,
            metalness: 0.0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.lodLevel = LOD_LEVELS.MEDIUM;
        mesh.userData.bodyId = bodyId;
        
        this.lodCache.set(cacheKey, mesh);
        return mesh;
    }

    /**
     * Create low LOD icosahedron
     * @param {Object} bodyData - Planet or moon data
     * @returns {THREE.Mesh}
     */
    createLowLOD(bodyData) {
        const bodyId = this.getBodyId(bodyData.systemIndex, bodyData.bodyIndex);
        const cacheKey = `${bodyId}-low`;
        
        // Check cache first
        if (this.lodCache.has(cacheKey)) {
            return this.lodCache.get(cacheKey);
        }

        const geometry = new THREE.IcosahedronGeometry(bodyData.radius, 1);
        
        // Get base color from theme
        const baseColor = this.getThemeBaseColor(bodyData.colorTheme || TERRAIN_COLOR_THEMES.ROCKY);
        
        const material = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: true
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.lodLevel = LOD_LEVELS.LOW;
        mesh.userData.bodyId = bodyId;
        
        this.lodCache.set(cacheKey, mesh);
        return mesh;
    }

    /**
     * Generate texture for a theme
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {string} theme - Color theme
     * @param {string} seed - Random seed
     */
    generateTextureForTheme(ctx, theme, seed) {
        // Sanitize theme input and fetch palette
        let colors = this.getThemeColors(theme);
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        
        // Validate and sanitize colors array
        if (!Array.isArray(colors)) {
            console.warn(`Theme colors not an array for theme: ${theme}, using default`);
            colors = [{ r: 128, g: 128, b: 128 }];
        }
        // Filter out any malformed entries defensively
        colors = colors.filter(c => c && typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number');
        if (colors.length === 0) {
            console.warn(`No valid colors found for theme: ${theme}, using default`);
            colors = [{ r: 128, g: 128, b: 128 }];
        }
        
        // Simple noise-based texture
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        // Use seed to generate consistent random values (with fallback)
        const random = this.seededRandom(seed || 'default-seed');
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const noise = random() * 0.3 + 0.7; // 0.7 to 1.0
                
                // Pick random color from theme
                const colorIdx = Math.floor(random() * colors.length);
                const color = colors[colorIdx];
                
                // Safety check for color object
                if (!color || typeof color.r === 'undefined') {
                    console.error('Invalid color in palette:', color, 'theme:', theme);
                    data[idx] = 128;
                    data[idx + 1] = 128;
                    data[idx + 2] = 128;
                    data[idx + 3] = 255;
                    continue;
                }
                
                data[idx] = color.r * noise;
                data[idx + 1] = color.g * noise;
                data[idx + 2] = color.b * noise;
                data[idx + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Get color palette for a theme
     * @param {string} theme - Color theme
     * @returns {Array<{r,g,b}>}
     */
    getThemeColors(theme) {
        // Ensure theme is a trimmed lowercase string
        const themeKey = (typeof theme === 'string' ? theme : String(theme || 'rocky')).trim().toLowerCase();
        
        switch(themeKey) {
            case 'earthlike':
                return [
                    {r: 34, g: 139, b: 34},   // Green
                    {r: 139, g: 69, b: 19},   // Brown
                    {r: 169, g: 169, b: 169}  // Grey
                ];
            case 'luna':
                return [
                    {r: 180, g: 180, b: 180},
                    {r: 160, g: 160, b: 160},
                    {r: 140, g: 140, b: 140}
                ];
            case 'mercury':
                return [
                    {r: 100, g: 100, b: 100},
                    {r: 80, g: 80, b: 80},
                    {r: 60, g: 60, b: 60}
                ];
            case 'mars':
                return [
                    {r: 193, g: 68, b: 14},
                    {r: 139, g: 69, b: 19},
                    {r: 160, g: 82, b: 45}
                ];
            case 'sulfur':
                return [
                    {r: 255, g: 255, b: 0},
                    {r: 218, g: 165, b: 32},
                    {r: 255, g: 215, b: 0}
                ];
            case 'rocky':
                return [
                    {r: 139, g: 137, b: 137},
                    {r: 105, g: 105, b: 105},
                    {r: 119, g: 136, b: 153}
                ];
            case 'icy':
                return [
                    {r: 240, g: 248, b: 255},
                    {r: 176, g: 224, b: 230},
                    {r: 135, g: 206, b: 235}
                ];
            default:
                console.warn(`Unknown theme: ${theme}, using default rocky`);
                return [
                    {r: 128, g: 128, b: 128},
                    {r: 100, g: 100, b: 100},
                    {r: 150, g: 150, b: 150}
                ];
        }
    }

    /**
     * Get base color for a theme
     * @param {string} theme - Color theme
     * @returns {number}
     */
    getThemeBaseColor(theme) {
        const colors = this.getThemeColors(theme);
        if (!colors || colors.length === 0) {
            return 0x808080; // Grey fallback
        }
        const color = colors[0];
        if (!color || typeof color.r === 'undefined') {
            return 0x808080; // Grey fallback
        }
        return (color.r << 16) | (color.g << 8) | color.b;
    }

    /**
     * Seeded random number generator
     * @param {string} seed - Seed string
     * @returns {Function}
     */
    seededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        
        return function() {
            hash = (hash * 9301 + 49297) % 233280;
            return hash / 233280;
        };
    }

    /**
     * Determine required LOD level for a body
     * @param {Object} bodyData - Planet or moon data
     * @param {Object} context - {characterPosition, rocketPosition, cameraPosition, trajectoryIntersections, isCharacterMode, sunPosition}
     * @returns {string} LOD level
     */
    determineRequiredLOD(bodyData, context) {
        const bodyId = this.getBodyId(bodyData.systemIndex, bodyData.bodyIndex);
        const bodyWorldPos = bodyData.mesh ? bodyData.mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();

        // HIGH LOD: Character's current planet/moon system
        if (context.characterSystemIndex === bodyData.systemIndex) {
            return LOD_LEVELS.HIGH;
        }

        // HIGH LOD: Rocket's closest planet/moon system
        if (context.rocketPosition && bodyData.systemIndex === context.rocketClosestSystemIndex) {
            return LOD_LEVELS.HIGH;
        }

        // HIGH LOD: Trajectory intersection system
        if (context.trajectoryIntersections && context.trajectoryIntersections.has(bodyData.systemIndex)) {
            return LOD_LEVELS.HIGH;
        }

        // LOW LOD: Bodies on the opposite side of the sun from camera (in character mode)
        if (context.isCharacterMode && this.sun) {
            const sunPos = new THREE.Vector3();
            if (this.sun.getWorldPosition) {
                this.sun.getWorldPosition(sunPos);
            }
            
            const cameraDir = new THREE.Vector3().subVectors(context.cameraPosition, sunPos).normalize();
            const bodyDir = new THREE.Vector3().subVectors(bodyWorldPos, sunPos).normalize();
            const dot = cameraDir.dot(bodyDir);
            
            // If dot product < 0, body is on opposite side of sun
            if (dot < -0.2) { // Small threshold to avoid edge cases
                return LOD_LEVELS.LOW;
            }
        }

        // MEDIUM LOD: Everything else
        return LOD_LEVELS.MEDIUM;
    }

    /**
     * Update LOD for a specific body
     * @param {Object} bodyData - Planet or moon data
     * @param {string} requiredLOD - Required LOD level
     * @param {THREE.Object3D} parentContainer - Parent object to add mesh to
     */
    updateBodyLOD(bodyData, requiredLOD, parentContainer) {
        const bodyId = this.getBodyId(bodyData.systemIndex, bodyData.bodyIndex);
        const currentLOD = this.bodyLODStates.get(bodyId);

        // If LOD hasn't changed, do nothing
        if (currentLOD === requiredLOD && bodyData.mesh && bodyData.mesh.parent) {
            return;
        }

        // If this is the first time or mesh is missing, we need to create/restore
        let newMesh;
        
        // Create new mesh based on required LOD
        switch(requiredLOD) {
            case LOD_LEVELS.HIGH:
                newMesh = this.createHighLOD(bodyData);
                break;
            case LOD_LEVELS.MEDIUM:
                newMesh = this.createMediumLOD(bodyData);
                break;
            case LOD_LEVELS.LOW:
                newMesh = this.createLowLOD(bodyData);
                break;
            default:
                newMesh = this.createMediumLOD(bodyData);
        }

        // Remove old mesh if it exists
        if (bodyData.mesh && bodyData.mesh.parent) {
            bodyData.mesh.parent.remove(bodyData.mesh);
            // Don't dispose geometry/material as it might be cached
        }

        // Add new mesh to parent container (usually the blackHoleBubble)
        // Try to find the bubble first
        let targetParent = parentContainer;
        if (bodyData.blackHoleBubble) {
            targetParent = bodyData.blackHoleBubble;
        }
        
        targetParent.add(newMesh);
        bodyData.mesh = newMesh;
        this.bodyLODStates.set(bodyId, requiredLOD);
    }

    /**
     * Update LOD for all bodies in the solar system
     * @param {Array} solarSystemData - Array of planet data
     * @param {Object} context - LOD determination context
     */
    updateAllLODs(solarSystemData, context) {
        solarSystemData.forEach((planetData, systemIndex) => {
            // Add system index to planet data
            planetData.systemIndex = systemIndex;
            planetData.bodyIndex = 0;

            // Determine and update planet LOD
            const planetLOD = this.determineRequiredLOD(planetData, context);
            this.updateBodyLOD(planetData, planetLOD, planetData.pivot || this.scene);

            // Update moons
            if (planetData.moons) {
                planetData.moons.forEach((moonData, moonIndex) => {
                    moonData.systemIndex = systemIndex;
                    moonData.bodyIndex = moonIndex + 1; // +1 because planet is 0
                    
                    const moonLOD = this.determineRequiredLOD(moonData, context);
                    this.updateBodyLOD(moonData, moonLOD, moonData.pivot || this.scene);
                });
            }
        });
    }

    /**
     * Clear all LOD cache
     */
    clearCache() {
        this.lodCache.forEach((mesh) => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });
        this.lodCache.clear();
        this.bodyLODStates.clear();
    }

    /**
     * Get LOD statistics
     * @returns {Object}
     */
    getStats() {
        const stats = {
            high: 0,
            medium: 0,
            low: 0,
            total: this.bodyLODStates.size
        };

        this.bodyLODStates.forEach((lod) => {
            if (lod === LOD_LEVELS.HIGH) stats.high++;
            else if (lod === LOD_LEVELS.MEDIUM) stats.medium++;
            else if (lod === LOD_LEVELS.LOW) stats.low++;
        });

        return stats;
    }
}

/**
 * Find closest system index to a position
 * @param {THREE.Vector3} position - Position to check
 * @param {Array} solarSystemData - Solar system data
 * @returns {number} System index
 */
export function findClosestSystemIndex(position, solarSystemData) {
    let closestIndex = 0;
    let closestDistance = Infinity;

    solarSystemData.forEach((planetData, index) => {
        if (!planetData.pivot) return;
        
        const planetPos = new THREE.Vector3();
        planetData.pivot.getWorldPosition(planetPos);
        
        const distance = position.distanceTo(planetPos);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex;
}
