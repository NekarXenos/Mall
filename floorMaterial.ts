import * as THREE from 'three';

// Load your existing color/vein/grout texture
const colorMap = new THREE.TextureLoader().load('textures/floor_color.jpg');

// Create or load grayscale textures for metalness and roughness
const metalnessMap = new THREE.TextureLoader().load('textures/floor_metalness.jpg'); // veins white, rest black
const roughnessMap = new THREE.TextureLoader().load('textures/floor_roughness.jpg'); // grout white, marble/veins black

const floorMaterial = new THREE.MeshPhysicalMaterial({
  map: colorMap,
  metalness: 0.1, // base value, overridden by map
  roughness: 0.2, // base value, overridden by map
  metalnessMap: metalnessMap,
  roughnessMap: roughnessMap,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
});

// ...existing code for the floor mesh and scene setup