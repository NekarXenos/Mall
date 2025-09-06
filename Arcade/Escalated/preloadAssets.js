// preloadAssets.js
import * as THREE from 'three';
import { Mobster } from './mobster.js';
// import { OtherEnemy } from './otherEnemy.js'; // Add more as needed

export function preloadAllAssets(scene, renderer) {
    const tempCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    tempCamera.position.z = 10;
    renderer.setSize(1, 1); // Minimal offscreen size

    // --- Preload Mobster ---
    const dummyMobster = new Mobster(scene, new THREE.Vector3(9999, 9999, 9999), 0, 0, 1, false); // isBoss = false

    // --- Add an aim and firing sequence for pre-compiling shaders ---
    const dummyPlayerPosition = new THREE.Vector3(9999, 9999, 9989); // A target in front of the mobster

    // 1. Force mobster into an aiming pose for the snapshot render
    dummyMobster.characterState = 'aiming'; // Set state to allow firing logic if we were to call it
    dummyMobster.characterGroup.lookAt(dummyPlayerPosition);
    // Manually set arm rotations to the final aiming pose from mobster.js _animateAiming
    dummyMobster.leftArm.rotation.x = -Math.PI / 2.2;
    dummyMobster.rightArm.rotation.x = -Math.PI / 2.2;
    dummyMobster.leftForeArm.rotation.x = 0;
    dummyMobster.rightForeArm.rotation.x = 0;

    // 2. Create a dummy projectile to compile its material
    const projectileGeometry = new THREE.SphereGeometry(0.1, 6, 6); // Based on ENEMY_SETTINGS in main.js
    const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1 });
    const dummyProjectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    const projectileStartPosition = new THREE.Vector3();
    // Place it at the gun's barrel tip
    const barrelTip = new THREE.Vector3(0.5, 0, 2.0); // Local position in gunGroup from mobster.js
    dummyMobster.gunGroup.localToWorld(barrelTip);
    dummyProjectile.position.copy(barrelTip);
    scene.add(dummyProjectile);

    // 3. Create a dummy muzzle flash to compile the point light
    const muzzleFlash = new THREE.PointLight(0xfff7a1, 10, 5, 2);
    // The flash is added to the gun group, so its position is local
    muzzleFlash.position.set(0.5, 0, 1.75); // Local position from _createMuzzleFlash in mobster.js
    dummyMobster.gunGroup.add(muzzleFlash);

    // 4. Render the scene with all dummy objects visible
    dummyMobster.characterGroup.visible = true;
    renderer.render(scene, tempCamera);

    // 5. Clean up all temporary objects
    scene.remove(dummyMobster.characterGroup);
    scene.remove(dummyProjectile);
    dummyMobster.gunGroup.remove(muzzleFlash);

    // Dispose of geometries and materials to free up memory
    dummyMobster.characterGroup.traverse(object => {
        if (object.isMesh) {
            object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
    });
    projectileGeometry.dispose();
    projectileMaterial.dispose();
    muzzleFlash.dispose();


    // --- Preload Other Enemies or Assets ---
    // const dummyEnemy = new OtherEnemy(scene, new THREE.Vector3(9999, 9999, 9999));
    // dummyEnemy.mesh.visible = false;
    // renderer.render(scene, tempCamera);
    // scene.remove(dummyEnemy.mesh);

    // --- Clean up temporary camera if needed ---
    // (Renderer reuse is fine since your main renderer will take over)
}
