function shoot() {
    if (!controls.isLocked) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0); // Center of screen
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects([...worldObjects, ...lights], true);

    for (const intersect of intersects) {
        const lightGroup = lights.find(lg => lg === intersect.object || lg.children.includes(intersect.object));
        if (lightGroup && !lightGroup.userData.isDestroyed) {
            lightGroup.userData.isDestroyed = true;
            lightGroup.userData.pointLight.intensity = 0;

            const fallenShade = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial.clone());
            fallenShade.scale.set(1.1, 1.1, 1.1);
            fallenShade.position.copy(lightGroup.position);
            fallenShade.position.y -= 0.2; // Start slightly below the lamp
            fallenShade.userData = {
                velocity: new THREE.Vector3(0, -5, 0), // Initial downward velocity
                isFalling: true,
                originalLightId: lightGroup.id,
                floorIndex: lightGroup.userData.floorIndex
            };
            fallenShade.castShadow = true;
            fallenShade.receiveShadow = true;
            scene.add(fallenShade);
            fallenLampshades.push(fallenShade);
            worldObjects.push(fallenShade);

            return; // Exit after hitting a light
        }
    }

    // Existing projectile shooting code...
    const projectileStartOffset = 0.5;
    const projectileDirection = new THREE.Vector3();
    camera.getWorldDirection(projectileDirection);
    const projectileStartPosition = camera.position.clone().addScaledVector(projectileDirection, projectileStartOffset);
    createProjectile(projectileStartPosition, projectileDirection, true);
}