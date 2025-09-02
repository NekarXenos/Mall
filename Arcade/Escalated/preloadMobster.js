// preloadMobster.js
import { Mobster } from './mobster.js';

export function preloadMobster(scene) {
    const dummyMobster = new Mobster(scene, new THREE.Vector3(9999, 9999, 9999), 0, 0, 1);
    dummyMobster.characterGroup.visible = false;

    // Force rendering one frame to compile shaders
    const tempRenderer = new THREE.WebGLRenderer();
    const tempCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    tempCamera.position.z = 10;

    setTimeout(() => {
        tempRenderer.setSize(1, 1);
        tempRenderer.render(scene, tempCamera);
        scene.remove(dummyMobster.characterGroup);
        tempRenderer.dispose();
    }, 100); // Give the browser some time before forcing GPU draw
}
