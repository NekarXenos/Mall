function animate() {
    if (isGameOver) return;

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (controls.isLocked) {
        updatePlayer(deltaTime);
        updateElevators(deltaTime);
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
        updateGarageDoors(deltaTime);
        updateUI();
        updateLODSystem();
        animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStepsB, escalatorStarts, escalatorStartsB, escalatorEnds, escalatorEndsB, SETTINGS, {
            escalatorMaterial: window.EscalatorMaterial,
            escalatorEmbarkMaterial: window.EscalatorEmbarkMaterial,
            escalatorEmbarkMaterialB: window.EscalatorEmbarkMaterialB
        });

        // Animate falling lampshades
        for (let i = fallenLampshades.length - 1; i >= 0; i--) {
            const shade = fallenLampshades[i];
            if (shade.userData.isFalling) {
                // Apply gravity
                shade.userData.velocity.y += SETTINGS.gravity * deltaTime; // Gravity from SETTINGS (-18.0)
                shade.position.addScaledVector(shade.userData.velocity, deltaTime);

                // Check if it hits the ground
                const floorY = shade.userData.floorIndex * SETTINGS.floorHeight;
                if (shade.position.y <= floorY + 0.1) {
                    shade.position.y = floorY + 0.1;
                    shade.userData.isFalling = false;
                    shade.userData.velocity.set(0, 0, 0);
                } else {
                    // Check collision with enemies
                    for (let j = enemies.length - 1; j >= 0; j--) {
                        const enemy = enemies[j];
                        const enemyBox = new THREE.Box3().setFromObject(enemy.getObject());
                        const shadeBox = new THREE.Box3().setFromObject(shade);

                        if (shadeBox.intersectsBox(enemyBox)) {
                            // Kill the enemy instantly
                            enemy.takeDamage(100); // 100 ensures instant kill (health starts at 100)
                            if (enemy.health <= 0) {
                                playerScore += 100;
                                updateUI();
                                enemy.fallAndDisappear();
                                enemies.splice(j, 1);
                            }
                            // Remove the lampshade
                            scene.remove(shade);
                            fallenLampshades.splice(i, 1);
                            const worldIndex = worldObjects.indexOf(shade);
                            if (worldIndex > -1) worldObjects.splice(worldIndex, 1);
                            break; // Stop checking after hitting an enemy
                        }
                    }
                }
            }
        }

        // Existing light animation and debug code...
    }

    renderer.render(scene, camera);
}