import * as THREE from 'three';

export const MATERIALS = {
    // Planet Surface
    GRASS: { id: 'grass', color: new THREE.Color(0x335010), buildable: true },
    SOIL: { id: 'soil', color: new THREE.Color(0x332208), buildable: true },
    SAND: { id: 'sand', color: new THREE.Color(0xD2B48C), buildable: true },
    ROCK: { id: 'rock', color: new THREE.Color(0x222222), buildable: true },
    ICE: { id: 'ice', color: new THREE.Color(0xadd8e6), buildable: true },
    // Underwater
    SEAWEED: { id: 'seaweed', color: new THREE.Color(0x2E8B57) }, // Still defined, but won't be used for generation
    ANEMONE: { id: 'anemone', color: new THREE.Color(0x4169E1), buildable: true },
    // Subsurface & Special
    LAVA: { id: 'lava', color: new THREE.Color(0xFF4500), emissive: new THREE.Color(0xdd3300), buildable: true },
    BASALT: { id: 'basalt', color: new THREE.Color(0x36454F), buildable: true }, // NEW MATERIAL
    // Moon
    MOON_ROCK: { id: 'moon_rock', color: new THREE.Color(0x8c8c8c), buildable: true },
    MOON_SAND: { id: 'moon_sand', color: new THREE.Color(0xbebebe), buildable: true },
    // Default/Error
    DEFAULT: { id: 'default', color: new THREE.Color(0xff00ff) }
};