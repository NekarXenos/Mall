import * as THREE from 'three';
import { createBlackHoleBubble } from './pBlackHoleBubble.js';
import { COLOR_PALETTE } from './pConstants.js';

export class SceneBuilder {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.teleportLocations = [];
    }

    buildSolarSystem(solarSystemData) {
        solarSystemData.forEach((planetData, pIndex) => {
            this.buildPlanetSystem(planetData, pIndex);
        });
        return this.teleportLocations;
    }

    buildPlanetSystem(planetData, pIndex) {
        // Move all the planet building logic here
    }

    // ... other helper methods
}