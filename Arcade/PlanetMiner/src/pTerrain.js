/**
 * Voxel Terrain Generation Module
 * Handles procedural voxel-based planet terrain generation with marching cubes
 */

import * as THREE from 'three';

// SimplexNoise is loaded globally via script tag in HTML
// Access it from window.SimplexNoise

// --- Terrain Constants ---
const GRID_SIZE = 128; // Increased from 100 for better coverage
const BLOCK_SIZE = 1;
const ISO_LEVEL = 0.5;

// Marching Cubes lookup tables
const EdgeVertexIndices = [
    [0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4],
    [0, 4], [1, 5], [3, 7], [2, 6]
];

const TriangleTable = [[-1], [0, 3, 8, -1], [0, 9, 1, -1], [3, 8, 1, 1, 8, 9, -1], [2, 11, 3, -1], [8, 0, 11, 11, 0, 2, -1], [3, 2, 11, 1, 0, 9, -1], [11, 1, 2, 11, 9, 1, 11, 8, 9, -1], [1, 10, 2, -1], [0, 3, 8, 2, 1, 10, -1], [10, 2, 9, 9, 2, 0, -1], [8, 2, 3, 8, 10, 2, 8, 9, 10, -1], [11, 3, 10, 10, 3, 1, -1], [10, 0, 1, 10, 8, 0, 10, 11, 8, -1], [9, 3, 0, 9, 11, 3, 9, 10, 11, -1], [8, 9, 11, 11, 9, 10, -1], [4, 8, 7, -1], [7, 4, 3, 3, 4, 0, -1], [4, 8, 7, 0, 9, 1, -1], [1, 4, 9, 1, 7, 4, 1, 3, 7, -1], [8, 7, 4, 11, 3, 2, -1], [4, 11, 7, 4, 2, 11, 4, 0, 2, -1], [0, 9, 1, 8, 7, 4, 11, 3, 2, -1], [7, 4, 11, 11, 4, 2, 2, 4, 9, 2, 9, 1, -1], [4, 8, 7, 2, 1, 10, -1], [7, 4, 3, 3, 4, 0, 10, 2, 1, -1], [10, 2, 9, 9, 2, 0, 7, 4, 8, -1], [10, 2, 3, 10, 3, 4, 3, 7, 4, 9, 10, 4, -1], [1, 10, 3, 3, 10, 11, 4, 8, 7, -1], [10, 11, 1, 11, 7, 4, 1, 11, 4, 1, 4, 0, -1], [7, 4, 8, 9, 3, 0, 9, 11, 3, 9, 10, 11, -1], [7, 4, 11, 4, 9, 11, 9, 10, 11, -1], [9, 4, 5, -1], [9, 4, 5, 8, 0, 3, -1], [4, 5, 0, 0, 5, 1, -1], [5, 8, 4, 5, 3, 8, 5, 1, 3, -1], [9, 4, 5, 11, 3, 2, -1], [2, 11, 0, 0, 11, 8, 5, 9, 4, -1], [4, 5, 0, 0, 5, 1, 11, 3, 2, -1], [5, 1, 4, 1, 2, 11, 4, 1, 11, 4, 11, 8, -1], [1, 10, 2, 5, 9, 4, -1], [9, 4, 5, 0, 3, 8, 2, 1, 10, -1], [2, 5, 10, 2, 4, 5, 2, 0, 4, -1], [10, 2, 5, 5, 2, 4, 4, 2, 3, 4, 3, 8, -1], [11, 3, 10, 10, 3, 1, 4, 5, 9, -1], [4, 5, 9, 10, 0, 1, 10, 8, 0, 10, 11, 8, -1], [11, 3, 0, 11, 0, 5, 0, 4, 5, 10, 11, 5, -1], [4, 5, 8, 5, 10, 8, 10, 11, 8, -1], [8, 7, 9, 9, 7, 5, -1], [3, 9, 0, 3, 5, 9, 3, 7, 5, -1], [7, 0, 8, 7, 1, 0, 7, 5, 1, -1], [7, 5, 3, 3, 5, 1, -1], [5, 9, 7, 7, 9, 8, 2, 11, 3, -1], [2, 11, 7, 2, 7, 9, 7, 5, 9, 0, 2, 9, -1], [2, 11, 3, 7, 0, 8, 7, 1, 0, 7, 5, 1, -1], [2, 11, 1, 11, 7, 1, 7, 5, 1, -1], [8, 7, 9, 9, 7, 5, 2, 1, 10, -1], [10, 2, 1, 3, 9, 0, 3, 5, 9, 3, 7, 5, -1], [7, 5, 8, 5, 10, 2, 8, 5, 2, 8, 2, 0, -1], [10, 2, 5, 2, 3, 5, 3, 7, 5, -1], [8, 7, 5, 8, 5, 9, 11, 3, 10, 3, 1, 10, -1], [5, 11, 7, 10, 11, 5, 1, 9, 0, -1], [11, 5, 10, 7, 5, 11, 8, 3, 0, -1], [5, 11, 7, 10, 11, 5, -1], [6, 7, 11, -1], [7, 11, 6, 3, 8, 0, -1], [6, 7, 11, 0, 9, 1, -1], [9, 1, 8, 8, 1, 3, 6, 7, 11, -1], [3, 2, 7, 7, 2, 6, -1], [0, 7, 8, 0, 6, 7, 0, 2, 6, -1], [6, 7, 2, 2, 7, 3, 9, 1, 0, -1], [6, 7, 8, 6, 8, 1, 8, 9, 1, 2, 6, 1, -1], [11, 6, 7, 10, 2, 1, -1], [3, 8, 0, 11, 6, 7, 10, 2, 1, -1], [0, 9, 2, 2, 9, 10, 7, 11, 6, -1], [6, 7, 11, 8, 2, 3, 8, 10, 2, 8, 9, 10, -1], [7, 10, 6, 7, 1, 10, 7, 3, 1, -1], [8, 0, 7, 7, 0, 6, 6, 0, 1, 6, 1, 10, -1], [7, 3, 6, 3, 0, 9, 6, 3, 9, 6, 9, 10, -1], [6, 7, 10, 7, 8, 10, 8, 9, 10, -1], [11, 6, 8, 8, 6, 4, -1], [6, 3, 11, 6, 0, 3, 6, 4, 0, -1], [11, 6, 8, 8, 6, 4, 1, 0, 9, -1], [1, 3, 9, 3, 11, 6, 9, 3, 6, 9, 6, 4, -1], [2, 8, 3, 2, 4, 8, 2, 6, 4, -1], [4, 0, 6, 6, 0, 2, -1], [9, 1, 0, 2, 8, 3, 2, 4, 8, 2, 6, 4, -1], [9, 1, 4, 1, 2, 4, 2, 6, 4, -1], [4, 8, 6, 6, 8, 11, 1, 10, 2, -1], [1, 10, 2, 6, 3, 11, 6, 0, 3, 6, 4, 0, -1], [11, 6, 4, 11, 4, 8, 10, 2, 9, 2, 0, 9, -1], [10, 4, 9, 6, 4, 10, 11, 2, 3, -1], [4, 8, 3, 4, 3, 10, 3, 1, 10, 6, 4, 10, -1], [1, 10, 0, 10, 6, 0, 6, 4, 0, -1], [4, 10, 6, 9, 10, 4, 0, 8, 3, -1], [4, 10, 6, 9, 10, 4, -1], [6, 7, 11, 4, 5, 9, -1], [4, 5, 9, 7, 11, 6, 3, 8, 0, -1], [1, 0, 5, 5, 0, 4, 11, 6, 7, -1], [11, 6, 7, 5, 8, 4, 5, 3, 8, 5, 1, 3, -1], [3, 2, 7, 7, 2, 6, 9, 4, 5, -1], [5, 9, 4, 0, 7, 8, 0, 6, 7, 0, 2, 6, -1], [3, 2, 6, 3, 6, 7, 1, 0, 5, 0, 4, 5, -1], [6, 1, 2, 5, 1, 6, 4, 7, 8, -1], [10, 2, 1, 6, 7, 11, 4, 5, 9, -1], [0, 3, 8, 4, 5, 9, 11, 6, 7, 10, 2, 1, -1], [7, 11, 6, 2, 5, 10, 2, 4, 5, 2, 0, 4, -1], [8, 4, 7, 5, 10, 6, 3, 11, 2, -1], [9, 4, 5, 7, 10, 6, 7, 1, 10, 7, 3, 1, -1], [10, 6, 5, 7, 8, 4, 1, 9, 0, -1], [4, 3, 0, 7, 3, 4, 6, 5, 10, -1], [10, 6, 5, 8, 4, 7, -1], [9, 6, 5, 9, 11, 6, 9, 8, 11, -1], [11, 6, 3, 3, 6, 0, 0, 6, 5, 0, 5, 9, -1], [11, 6, 5, 11, 5, 0, 5, 1, 0, 8, 11, 0, -1], [11, 6, 3, 6, 5, 3, 5, 1, 3, -1], [9, 8, 5, 8, 3, 2, 5, 8, 2, 6, 5, 2, -1], [5, 9, 6, 9, 0, 6, 0, 2, 6, -1], [1, 6, 5, 2, 6, 1, 3, 0, 8, -1], [1, 6, 5, 2, 6, 1, -1], [2, 1, 10, 9, 6, 5, 9, 11, 6, 9, 8, 11, -1], [9, 0, 1, 3, 11, 2, 5, 10, 6, -1], [11, 0, 8, 2, 0, 11, 10, 6, 5, -1], [3, 11, 2, 5, 10, 6, -1], [1, 8, 3, 9, 8, 1, 5, 10, 6, -1], [6, 5, 10, 0, 1, 9, -1], [8, 3, 0, 5, 10, 6, -1], [6, 5, 10, -1], [10, 5, 6, -1], [0, 3, 8, 6, 10, 5, -1], [10, 5, 6, 9, 1, 0, -1], [3, 8, 1, 1, 8, 9, 6, 10, 5, -1], [2, 11, 3, 6, 10, 5, -1], [8, 0, 11, 11, 0, 2, 5, 6, 10, -1], [1, 0, 9, 2, 11, 3, 6, 10, 5, -1], [5, 6, 10, 11, 1, 2, 11, 9, 1, 11, 8, 9, -1], [5, 6, 1, 1, 6, 2, -1], [5, 6, 1, 1, 6, 2, 8, 0, 3, -1], [6, 9, 5, 6, 0, 9, 6, 2, 0, -1], [6, 2, 5, 2, 3, 8, 5, 2, 8, 5, 8, 9, -1], [3, 6, 11, 3, 5, 6, 3, 1, 5, -1], [8, 0, 1, 8, 1, 6, 1, 5, 6, 11, 8, 6, -1], [11, 3, 6, 6, 3, 5, 5, 3, 0, 5, 0, 9, -1], [5, 6, 9, 6, 11, 9, 11, 8, 9, -1], [5, 6, 10, 7, 4, 8, -1], [0, 3, 4, 4, 3, 7, 10, 5, 6, -1], [5, 6, 10, 4, 8, 7, 0, 9, 1, -1], [6, 10, 5, 1, 4, 9, 1, 7, 4, 1, 3, 7, -1], [7, 4, 8, 6, 10, 5, 2, 11, 3, -1], [10, 5, 6, 4, 11, 7, 4, 2, 11, 4, 0, 2, -1], [4, 8, 7, 6, 10, 5, 3, 2, 11, 1, 0, 9, -1], [1, 2, 10, 11, 7, 6, 9, 5, 4, -1], [2, 1, 6, 6, 1, 5, 8, 7, 4, -1], [0, 3, 7, 0, 7, 4, 2, 1, 6, 1, 5, 6, -1], [8, 7, 4, 6, 9, 5, 6, 0, 9, 6, 2, 0, -1], [7, 2, 3, 6, 2, 7, 5, 4, 9, -1], [4, 8, 7, 3, 6, 11, 3, 5, 6, 3, 1, 5, -1], [5, 0, 1, 4, 0, 5, 7, 6, 11, -1], [9, 5, 4, 6, 11, 7, 0, 8, 3, -1], [11, 7, 6, 9, 5, 4, -1], [6, 10, 4, 4, 10, 9, -1], [6, 10, 4, 4, 10, 9, 3, 8, 0, -1], [0, 10, 1, 0, 6, 10, 0, 4, 6, -1], [6, 10, 1, 6, 1, 8, 1, 3, 8, 4, 6, 8, -1], [9, 4, 10, 10, 4, 6, 3, 2, 11, -1], [2, 11, 8, 2, 8, 0, 6, 10, 4, 10, 9, 4, -1], [11, 3, 2, 0, 10, 1, 0, 6, 10, 0, 4, 6, -1], [6, 8, 4, 11, 8, 6, 2, 10, 1, -1], [4, 1, 9, 4, 2, 1, 4, 6, 2, -1], [3, 8, 0, 4, 1, 9, 4, 2, 1, 4, 6, 2, -1], [6, 2, 4, 4, 2, 0, -1], [3, 8, 2, 8, 4, 2, 4, 6, 2, -1], [4, 6, 9, 6, 11, 3, 9, 6, 3, 9, 3, 1, -1], [8, 6, 11, 4, 6, 8, 9, 0, 1, -1], [11, 3, 6, 3, 0, 6, 0, 4, 6, -1], [8, 6, 11, 4, 6, 8, -1], [10, 7, 6, 10, 8, 7, 10, 9, 8, -1], [3, 7, 0, 7, 6, 10, 0, 7, 10, 0, 10, 9, -1], [6, 10, 7, 7, 10, 8, 8, 10, 1, 8, 1, 0, -1], [6, 10, 7, 10, 1, 7, 1, 3, 7, -1], [3, 2, 11, 10, 7, 6, 10, 8, 7, 10, 9, 8, -1], [9, 2, 10, 0, 2, 9, 8, 4, 7, -1], [0, 8, 3, 7, 6, 11, 1, 2, 10, -1], [7, 6, 11, 1, 2, 10, -1], [2, 1, 9, 2, 9, 7, 9, 8, 7, 6, 2, 7, -1], [2, 7, 6, 3, 7, 2, 0, 1, 9, -1], [8, 7, 0, 7, 6, 0, 6, 2, 0, -1], [7, 2, 3, 6, 2, 7, -1], [8, 1, 9, 3, 1, 8, 11, 7, 6, -1], [11, 7, 6, 1, 9, 0, -1], [6, 11, 7, 0, 8, 3, -1], [11, 7, 6, -1], [7, 11, 5, 5, 11, 10, -1], [10, 5, 11, 11, 5, 7, 0, 3, 8, -1], [7, 11, 5, 5, 11, 10, 0, 9, 1, -1], [7, 11, 10, 7, 10, 5, 3, 8, 1, 8, 9, 1, -1], [5, 2, 10, 5, 3, 2, 5, 7, 3, -1], [5, 7, 10, 7, 8, 0, 10, 7, 0, 10, 0, 2, -1], [0, 9, 1, 5, 2, 10, 5, 3, 2, 5, 7, 3, -1], [9, 7, 8, 5, 7, 9, 10, 1, 2, -1], [1, 11, 2, 1, 7, 11, 1, 5, 7, -1], [8, 0, 3, 1, 11, 2, 1, 7, 11, 1, 5, 7, -1], [7, 11, 2, 7, 2, 9, 2, 0, 9, 5, 7, 9, -1], [7, 9, 5, 8, 9, 7, 3, 11, 2, -1], [3, 1, 7, 7, 1, 5, -1], [8, 0, 7, 0, 1, 7, 1, 5, 7, -1], [0, 9, 3, 9, 5, 3, 5, 7, 3, -1], [9, 7, 8, 5, 7, 9, -1], [8, 5, 4, 8, 10, 5, 8, 11, 10, -1], [0, 3, 11, 0, 11, 5, 11, 10, 5, 4, 0, 5, -1], [1, 0, 9, 8, 5, 4, 8, 10, 5, 8, 11, 10, -1], [10, 3, 11, 1, 3, 10, 9, 5, 4, -1], [3, 2, 8, 8, 2, 4, 4, 2, 10, 4, 10, 5, -1], [10, 5, 2, 5, 4, 2, 4, 0, 2, -1], [5, 4, 9, 8, 3, 0, 10, 1, 2, -1], [2, 10, 1, 4, 9, 5, -1], [8, 11, 4, 11, 2, 1, 4, 11, 1, 4, 1, 5, -1], [0, 5, 4, 1, 5, 0, 2, 3, 11, -1], [0, 11, 2, 8, 11, 0, 4, 9, 5, -1], [5, 4, 9, 2, 3, 11, -1], [4, 8, 5, 8, 3, 5, 3, 1, 5, -1], [0, 5, 4, 1, 5, 0, -1], [5, 4, 9, 3, 0, 8, -1], [5, 4, 9, -1], [11, 4, 7, 11, 9, 4, 11, 10, 9, -1], [0, 3, 8, 11, 4, 7, 11, 9, 4, 11, 10, 9, -1], [11, 10, 7, 10, 1, 0, 7, 10, 0, 7, 0, 4, -1], [3, 10, 1, 11, 10, 3, 7, 8, 4, -1], [3, 2, 10, 3, 10, 4, 10, 9, 4, 7, 3, 4, -1], [9, 2, 10, 0, 2, 9, 8, 4, 7, -1], [3, 4, 7, 0, 4, 3, 1, 2, 10, -1], [7, 8, 4, 10, 1, 2, -1], [7, 11, 4, 4, 11, 9, 9, 11, 2, 9, 2, 1, -1], [1, 9, 0, 4, 7, 8, 2, 3, 11, -1], [7, 11, 4, 11, 2, 4, 2, 0, 4, -1], [4, 7, 8, 2, 3, 11, -1], [9, 4, 1, 4, 7, 1, 7, 3, 1, -1], [7, 8, 4, 1, 9, 0, -1], [3, 4, 7, 0, 4, 3, -1], [7, 8, 4, -1], [11, 10, 8, 8, 10, 9, -1], [0, 3, 9, 3, 11, 9, 11, 10, 9, -1], [1, 0, 10, 0, 8, 10, 8, 11, 10, -1], [10, 3, 11, 1, 3, 10, -1], [3, 2, 8, 2, 10, 8, 10, 9, 8, -1], [9, 2, 10, 0, 2, 9, -1], [8, 3, 0, 10, 1, 2, -1], [2, 10, 1, -1], [2, 1, 11, 1, 9, 11, 9, 8, 11, -1], [11, 2, 3, 9, 0, 1, -1], [11, 0, 8, 2, 0, 11, -1], [3, 11, 2, -1], [1, 8, 3, 9, 8, 1, -1], [1, 9, 0, -1], [8, 3, 0, -1], [-1]];

/**
 * Default terrain generation formula
 */
const defaultTerrainFormula = `(function() {
    const lerp = (a, b, alpha) => a * (1.0 - alpha) + b * alpha;
    
    // --- BASE TERRAIN GENERATION ---
    let terrainNoise;
    if (!p.useFractal) {
        const noise = simplex.noise3D(x * p.scale, y * p.scale, z * p.scale);
        const finalNoise = noise * 0.5 + 0.5;
        terrainNoise = finalNoise * p.strength;
    } else {
        let amplitude = 1.0;
        let frequency = p.scale;
        let noiseSum = 0.0;
        let amplitudeSum = 0.0;
        
        for (let i = 0; i < p.levels; i++) {
            let layerNoise = simplex.noise3D(x * frequency, y * frequency, z * frequency);
            layerNoise = layerNoise * 0.5 + 0.5;
            
            if (p.ridgedBlend > 0.0) {
                const ridgedNoise = 1.0 - Math.abs(layerNoise * 2.0 - 1.0);
                layerNoise = lerp(layerNoise, ridgedNoise, p.ridgedBlend);
            }
            
            noiseSum += layerNoise * amplitude;
            amplitudeSum += amplitude;
            amplitude *= p.persistence;
            frequency *= p.lacunarity;
        }
        
        terrainNoise = (noiseSum / amplitudeSum) * p.strength;
    }
    
    // --- SPHERE BLEND ---
    terrainNoise = lerp(terrainNoise, 0, p.sphereBlend);
    
    // --- BEACH PLATEAU LOGIC ---
    if ((p.beachWidthAbove && p.beachWidthAbove > 0.0001) || (p.beachWidthBelow && p.beachWidthBelow > 0.0001)) {
        const waterThreshold = 0.0;
        if (terrainNoise > waterThreshold && p.beachWidthAbove > 0.0001) {
            const distAbove = terrainNoise - waterThreshold;
            if (distAbove < p.beachWidthAbove) {
                terrainNoise = waterThreshold;
            }
        } else if (terrainNoise < waterThreshold && p.beachWidthBelow > 0.0001) {
            const distBelow = waterThreshold - terrainNoise;
            if (distBelow < p.beachWidthBelow) {
                terrainNoise = waterThreshold;
            }
        }
    }
    return terrainNoise;
})();`;

/**
 * Terrain Color Themes
 * Different color schemes for various celestial body types
 */
export const TERRAIN_COLOR_THEMES = {
    EARTHLIKE: 'earthlike',     // Green grass, blue water, beige beaches
    LUNA: 'luna',               // Light grey lunar surface
    MERCURY: 'mercury',         // Dark grey rocky surface
    MARS: 'mars',               // Iron-rich reddish surface
    SULFUR: 'sulfur',           // Sulphuric yellow/orange surface
    ROCKY: 'rocky',             // Generic grey-brown rocky surface
    ICY: 'icy',                 // White/light blue icy surface
};

/**
 * Terrain Generator Class
 * Handles voxel terrain generation with marching cubes
 */
export class TerrainGenerator {
    constructor(planetRadius, seed = 'hello-voxel', colorTheme = TERRAIN_COLOR_THEMES.EARTHLIKE) {
        this.seed = seed;
        this.simplex = new window.SimplexNoise(seed);
        this.voxelData = [];
        this.colorTheme = colorTheme;
        
        this.blockSize = BLOCK_SIZE;
        this.planetRadius = planetRadius;
        this.terrainRadius = planetRadius;
        
        // Calculate grid extent with padding to avoid edge artifacts
        this.gridExtent = GRID_SIZE * this.blockSize;
        this.maxTerrainRadius = this.gridExtent * 0.45; // 45% to leave margin
        
        // Warn if planet is too large for grid
        if (this.planetRadius > this.maxTerrainRadius) {
            console.warn(`Planet radius ${this.planetRadius} exceeds safe grid size. Consider increasing GRID_SIZE or reducing planet radius.`);
        }
        
        // Default parameters
        this.params = {
            scale: 0.01,
            strength: 0.15,
            useFractal: true,
            levels: 4,
            lacunarity: 2.0,
            persistence: 0.5,
            ridgedBlend: 0.0,
            sphereBlend: 0.0,
            waterLevel: 0.96,
            beachWidthAbove: 0.0,
            beachWidthBelow: 0.0
        };
        
        // Set initial water radius based on default waterLevel
        this.waterRadius = this.planetRadius * this.params.waterLevel;
        
        // Compile default formula
        this.compileFormula(defaultTerrainFormula);
    }
    
    /**
     * Compile terrain generation formula
     * @param {string} formula - JavaScript formula string
     */
    compileFormula(formula) {
        try {
            this.noiseFunction = new Function('simplex', 'x', 'y', 'z', 'p', `return ${formula}`);
        } catch (e) {
            console.error("Invalid terrain formula:", e);
            this.noiseFunction = () => 0;
        }
    }
    
    /**
     * Update terrain parameters
     * @param {Object} newParams - Parameter overrides
     */
    updateParams(newParams) {
        Object.assign(this.params, newParams);
        // Update water radius based on waterLevel parameter
        this.waterRadius = this.planetRadius * this.params.waterLevel;
    }
    
    /**
     * Get color for terrain based on current theme
     * @param {boolean} isUpwardFacing - Is the surface facing upward
     * @param {boolean} isSteep - Is the surface steep
     * @param {number} heightDiff - Height difference from water level
     * @returns {THREE.Color}
     */
    getTerrainColor(isUpwardFacing, isSteep, heightDiff) {
        // Default: rocky grey for cliffs and overhangs
        if (!isUpwardFacing || isSteep) {
            switch(this.colorTheme) {
                case TERRAIN_COLOR_THEMES.LUNA:
                    return new THREE.Color(0.45, 0.45, 0.48); // Light grey cliffs
                case TERRAIN_COLOR_THEMES.MERCURY:
                    return new THREE.Color(0.25, 0.24, 0.26); // Dark grey cliffs
                case TERRAIN_COLOR_THEMES.MARS:
                    return new THREE.Color(0.4, 0.25, 0.2); // Reddish brown cliffs
                case TERRAIN_COLOR_THEMES.SULFUR:
                    return new THREE.Color(0.6, 0.5, 0.15); // Darker yellow cliffs
                case TERRAIN_COLOR_THEMES.ROCKY:
                    return new THREE.Color(0.35, 0.33, 0.3); // Grey-brown cliffs
                case TERRAIN_COLOR_THEMES.ICY:
                    return new THREE.Color(0.7, 0.75, 0.8); // Light blue-grey ice cliffs
                default: // EARTHLIKE
                    return new THREE.Color(0.4, 0.4, 0.4); // Standard grey
            }
        }
        
        // Colors for flat/upward-facing surfaces
        switch(this.colorTheme) {
            case TERRAIN_COLOR_THEMES.LUNA:
                // Luna: Light grey surface with subtle variation
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.55, 0.55, 0.58); // Highland light grey
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.35, 0.35, 0.37); // Lowland darker grey
                } else {
                    return new THREE.Color(0.48, 0.48, 0.50); // Mid-tone grey
                }
                
            case TERRAIN_COLOR_THEMES.MERCURY:
                // Mercury: Dark grey surface
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.35, 0.34, 0.36); // Highland grey
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.18, 0.17, 0.19); // Lowland very dark
                } else {
                    return new THREE.Color(0.28, 0.27, 0.29); // Mid-tone dark grey
                }
                
            case TERRAIN_COLOR_THEMES.MARS:
                // Mars: Iron-rich reddish-brown surface
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.65, 0.4, 0.25); // Highland rust
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.45, 0.25, 0.15); // Lowland dark rust
                } else {
                    return new THREE.Color(0.58, 0.35, 0.22); // Mid-tone rust
                }
                
            case TERRAIN_COLOR_THEMES.SULFUR:
                // Sulfur: Yellow-orange volcanic surface (Io-like)
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.95, 0.85, 0.25); // Highland bright yellow
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.75, 0.5, 0.1); // Lowland orange
                } else {
                    return new THREE.Color(0.88, 0.7, 0.18); // Mid-tone yellow-orange
                }
                
            case TERRAIN_COLOR_THEMES.ROCKY:
                // Generic rocky: Grey-brown surface
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.5, 0.47, 0.43); // Highland light grey-brown
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.3, 0.28, 0.25); // Lowland dark grey-brown
                } else {
                    return new THREE.Color(0.42, 0.4, 0.36); // Mid-tone grey-brown
                }
                
            case TERRAIN_COLOR_THEMES.ICY:
                // Icy: White/light blue surface (Europa-like)
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.95, 0.97, 1.0); // Highland bright white
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.7, 0.8, 0.9); // Lowland light blue
                } else {
                    return new THREE.Color(0.85, 0.9, 0.95); // Mid-tone white-blue
                }
                
            default: // EARTHLIKE
                // Earth-like: Green grass, blue water, beige beaches
                if (heightDiff > 1.5) {
                    return new THREE.Color(0.2, 0.5, 0.1); // Grass green
                } else if (heightDiff < -1.5) {
                    return new THREE.Color(0.0, 0.3, 0.8); // Underwater blue
                } else {
                    return new THREE.Color(0.9, 0.8, 0.7); // Beach beige
                }
        }
    }
    
    /**
     * Generate voxel terrain data
     * @returns {Array} 3D voxel data array
     */
    generateVoxelData() {
        this.voxelData = [];
        const halfGrid = GRID_SIZE / 2;
        
        for (let x = 0; x < GRID_SIZE; x++) {
            this.voxelData[x] = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                this.voxelData[x][y] = [];
                for (let z = 0; z < GRID_SIZE; z++) {
                    const wx = (x - halfGrid) * this.blockSize;
                    const wy = (y - halfGrid) * this.blockSize;
                    const wz = (z - halfGrid) * this.blockSize;
                    const dist = Math.sqrt(wx * wx + wy * wy + wz * wz);
                    
                    // Ensure we sample beyond planet radius to avoid clipping
                    const normalizedDist = dist / this.planetRadius;
                    const terrainNoise = this.noiseFunction(this.simplex, wx, wy, wz, this.params);
                    
                    // Add fade-out near grid boundaries to prevent hard edges
                    const maxDist = halfGrid * this.blockSize;
                    const boundaryDist = Math.max(
                        Math.abs(wx),
                        Math.abs(wy),
                        Math.abs(wz)
                    );
                    const boundaryFade = Math.min(1.0, (maxDist - boundaryDist) / (maxDist * 0.1));
                    
                    this.voxelData[x][y][z] = (normalizedDist - terrainNoise) * boundaryFade + (1.0 - boundaryFade);
                }
            }
        }
        
        return this.voxelData;
    }
    
    /**
     * Generate terrain mesh using marching cubes
     * @returns {THREE.Mesh} Terrain mesh with vertex colors
     */
    generateTerrainMesh() {
        const voxelData = this.generateVoxelData();
        const geometry = this.generateMarchingCubesGeometry(voxelData);
        
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        return new THREE.Mesh(geometry, material);
    }
    
    /**
     * Generate geometry from voxel data using marching cubes algorithm
     * @param {Array} grid - 3D voxel data
     * @returns {THREE.BufferGeometry}
     */
    generateMarchingCubesGeometry(grid) {
        const vertices = [];
        const indices = [];
        const colors = [];
        
        const sizeX = grid ? grid.length : 0;
        const sizeY = (sizeX > 0 && grid[0]) ? grid[0].length : 0;
        const sizeZ = (sizeY > 0 && grid[0][0]) ? grid[0][0].length : 0;
        if (sizeX < 2 || sizeY < 2 || sizeZ < 2) return new THREE.BufferGeometry();
        
        const centerOffset = GRID_SIZE / 2;
        
        const interpolateVertex = (p1, p2, val1, val2) => {
            if (Math.abs(val1 - val2) < 0.00001) return p1.clone();
            const mu = (ISO_LEVEL - val1) / (val2 - val1);
            return p1.clone().lerp(p2, mu);
        };
        
        for (let x = 0; x < sizeX - 1; x++) {
            for (let y = 0; y < sizeY - 1; y++) {
                for (let z = 0; z < sizeZ - 1; z++) {
                    const cubeValues = new Array(8);
                    const cubeCorners = new Array(8);
                    let missingCorner = false;
                    
                    for (let i = 0; i < 8; i++) {
                        const x_offset = (i & 1);
                        const y_offset = (i & 2) >> 1;
                        const z_offset = (i & 4) >> 2;
                        const gx = x + x_offset;
                        const gy = y + y_offset;
                        const gz = z + z_offset;
                        
                        if (!grid[gx] || !grid[gx][gy] || typeof grid[gx][gy][gz] !== 'number') {
                            missingCorner = true;
                            break;
                        }
                        
                        cubeValues[i] = grid[gx][gy][gz];
                        cubeCorners[i] = new THREE.Vector3(
                            (gx - centerOffset + 0.5) * this.blockSize,
                            (gy - centerOffset + 0.5) * this.blockSize,
                            (gz - centerOffset + 0.5) * this.blockSize
                        );
                    }
                    
                    if (missingCorner) continue;
                    
                    let cubeIndex = 0;
                    for (let i = 0; i < 8; i++) {
                        if (cubeValues[i] < ISO_LEVEL) cubeIndex |= (1 << i);
                    }
                    
                    const triangles = TriangleTable[cubeIndex];
                    if (!triangles || triangles[0] === -1) continue;
                    
                    for (let i = 0; triangles[i] !== -1; i += 3) {
                        const edge1Index = triangles[i];
                        const edge2Index = triangles[i + 1];
                        const edge3Index = triangles[i + 2];
                        const [v1a_idx, v1b_idx] = EdgeVertexIndices[edge1Index];
                        const [v2a_idx, v2b_idx] = EdgeVertexIndices[edge2Index];
                        const [v3a_idx, v3b_idx] = EdgeVertexIndices[edge3Index];
                        
                        const p1 = interpolateVertex(cubeCorners[v1a_idx], cubeCorners[v1b_idx], cubeValues[v1a_idx], cubeValues[v1b_idx]);
                        const p2 = interpolateVertex(cubeCorners[v2a_idx], cubeCorners[v2b_idx], cubeValues[v2a_idx], cubeValues[v2b_idx]);
                        const p3 = interpolateVertex(cubeCorners[v3a_idx], cubeCorners[v3b_idx], cubeValues[v3a_idx], cubeValues[v3b_idx]);
                        
                        // Calculate face normal and center
                        const edge1 = new THREE.Vector3().subVectors(p2, p1);
                        const edge2 = new THREE.Vector3().subVectors(p3, p1);
                        const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
                        const center = new THREE.Vector3().addVectors(p1, p2).add(p3).multiplyScalar(1 / 3);
                        const centerNormal = center.clone().normalize();
                        
                        // Determine terrain type based on orientation
                        const dotProduct = faceNormal.dot(centerNormal);
                        const isUpwardFacing = dotProduct > 0.3;
                        const isSteep = Math.abs(dotProduct) < 0.7;
                        
                        // Color based on height and orientation using theme
                        const waterLevel = this.params.waterLevel;
                        const height = center.length();
                        const waterHeight = this.planetRadius * waterLevel;
                        const heightDiff = height - waterHeight;
                        
                        const color = this.getTerrainColor(isUpwardFacing, isSteep, heightDiff);
                        
                        const currentVertexCount = vertices.length / 3;
                        vertices.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
                        colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
                        indices.push(currentVertexCount, currentVertexCount + 1, currentVertexCount + 2);
                    }
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        if (vertices.length > 0) {
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
        }
        
        return geometry;
    }
}

/**
 * Create textured water sphere
 * @param {number} radius - Water sphere radius
 * @param {Object} options - Water appearance options
 * @returns {THREE.Mesh}
 */
export function createWaterSphere(radius, options = {}) {
    const {
        color = 0x3399ff,
        opacity = 0.6,
        roughness = 0.3,
        metalness = 0.7
    } = options;
    
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        roughness: roughness,
        metalness: metalness
    });
    
    return new THREE.Mesh(geometry, material);
}

/**
 * Generate terrain for a planet with given radius and seed
 * @param {number} planetRadius - Desired planet visual size (terrain radius)
 * @param {string} seed - Noise generation seed
 * @param {Object} params - Terrain generation parameters
 * @param {string} colorTheme - Color theme from TERRAIN_COLOR_THEMES
 * @returns {Object} {terrainMesh, waterSphere, generator, terrainRadius, waterRadius}
 */
export function generatePlanetTerrain(planetRadius, seed, params = {}, colorTheme = TERRAIN_COLOR_THEMES.EARTHLIKE) {
    const generator = new TerrainGenerator(planetRadius, seed, colorTheme);
    generator.updateParams(params);
    
    const terrainMesh = generator.generateTerrainMesh();
    const waterSphere = createWaterSphere(generator.waterRadius);
    
    return {
        terrainMesh,
        waterSphere,
        generator,
        terrainRadius: generator.planetRadius, // Terrain radius
        waterRadius: generator.waterRadius     // Water sphere radius (96% of terrain)
    };
}
