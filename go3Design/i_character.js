import * as THREE from 'three';

// This function creates and manages the 'i' character.
export function createICharacter(options = {}) {
    const { position = { x: 0, y: 0, z: 0 } } = options;

    // --- Character State and Parts ---
    let isRevealed = false;
    let isAimingAtHead = false;
    let canToggleReveal = true;

    const characterGroup = new THREE.Group();
    characterGroup.position.set(position.x, position.y, position.z);

    let head, leftEye, rightEye, mouth;
    let blueHeadMaterial, skinHeadMaterial;
    let initialHeadPosition = new THREE.Vector3();
    let originalHeadEmissive = null;
    let originalHeadEmissiveIntensity = null;

    // --- Create the Character Meshes and Materials ---
    // Character Proportions (adjusted to be close to 1.77 units total height from feet to top of head)
    const legHeight = 0.15;
    const torsoHeight = 0.8;
    const armHeight = 0.15;
    const headRadius = 0.22; // Diameter 0.44

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x0077ff, // Shiny blue
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x0033aa, // Slight glow
        emissiveIntensity: 0.3
    });

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.2, legHeight, 0.3); // width, height, depth
    const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    leftLeg.position.set(-0.2, legHeight * 1.5, 0); // Position relative to character group (feet at y=0)
    leftLeg.castShadow = true;
    characterGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    rightLeg.position.set(0.2, legHeight * 1.5, 0);
    rightLeg.castShadow = true;
    characterGroup.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.3, torsoHeight, 0.3);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, legHeight + (torsoHeight / 2), 0); // Position above legs
    torso.castShadow = true;
    torso.receiveShadow = true; // Allow torso to receive shadows
    characterGroup.add(torso);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.2, armHeight, 0.3);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.2, legHeight + torsoHeight - (armHeight / 2), 0); // Position beside torso
    leftArm.castShadow = true;
    leftArm.receiveShadow = true; // Allow left arm to receive shadows
    characterGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(0.2, legHeight + torsoHeight - (armHeight / 2), 0);
    rightArm.castShadow = true;
    rightArm.receiveShadow = true; // Allow right arm to receive shadows
    characterGroup.add(rightArm);

    // Head (Floating Sphere)
    const headGeometry = new THREE.SphereGeometry(headRadius, 32, 32);
    blueHeadMaterial = new THREE.MeshStandardMaterial({
        color: 0x0077ff, // Shiny blue
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x0033aa,
        emissiveIntensity: 0.3
    });
    skinHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xaa8844, roughness: 0.6, metalness: 0.0 });

    head = new THREE.Mesh(headGeometry, blueHeadMaterial);
    head.name = "iSphereHead"; // Naming the head as requested
    // Position head slightly above torso (float effect)
    head.position.set(0, legHeight + torsoHeight + 0.05 + headRadius, 0);
    head.castShadow = true; // Enable shadow casting for the head
    characterGroup.add(head);
    initialHeadPosition.copy(head.position); // Store initial position for bobbing

    // Eyes (Black spheres, stretched vertically) - Shiny black with StandardMaterial
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.0 });
    const eyeGeometry = new THREE.SphereGeometry(0.03, 16, 16); // Small sphere

    leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial); // Assign to global
    leftEye.position.set(-0.04, 0.03, headRadius - 0.03); // Position relative to head center
    leftEye.scale.y = 1.75; // Stretch vertically to make it look like a smile-like eye
    leftEye.rotation.z = Math.PI / 30; // Rotate to make it curve upwards (smiley face)
    // head.add(leftEye); // Don't add initially

    rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial); // Assign to global
    rightEye.position.set(0.04, 0.03, headRadius - 0.03); // Position relative to head center
    rightEye.scale.y = 1.75; // Stretch vertically
    rightEye.rotation.z = -Math.PI / 30; // Rotate to make it curve upwards (smiley face)
    // head.add(rightEye); // Don't add initially

    // Mouth
    const mouthGeometry = new THREE.TorusGeometry(0.14, 0.02, 16, 100, Math.PI); // Radius, tube, radial seg, tubular seg, arc (Math.PI for semi-circle)
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.0 }); // Matte black for mouth
    mouth = new THREE.Mesh(mouthGeometry, mouthMaterial); // Assign to global
    mouth.position.set(0, 0.01, headRadius - 0.09); // Position relative to head center
    mouth.rotation.z = Math.PI; // Rotate to make it curve upwards (smiley face)
    mouth.rotation.x = -Math.PI / 10; // Rotate to make it curve upwards (smiley face)
    // head.add(mouth); // Don't add initially

    // --- Character Methods ---
    function revealCharacter() {
        head.material = skinHeadMaterial;
        head.add(leftEye, rightEye, mouth);
        head.position.y = initialHeadPosition.y; // Reset bobbing
    }

    function hideCharacter() {
        head.material = blueHeadMaterial;
        head.remove(leftEye, rightEye, mouth);
        head.position.y = initialHeadPosition.y; // Reset bobbing
    }

    function toggleReveal() {
        if (!canToggleReveal) return;
        canToggleReveal = false;
        setTimeout(() => canToggleReveal = true, 300); // Debounce

        isRevealed = !isRevealed;
        if (isRevealed) {
            revealCharacter();
        } else {
            hideCharacter();
        }
        // When toggling, we might stop aiming, so reset glow
        setAimingAtHead(isAimingAtHead);
    }

    function setAimingAtHead(isAiming) {
        if (isAiming === isAimingAtHead && head.material.emissive) return; // No change needed
        isAimingAtHead = isAiming;

        if (isAimingAtHead) {
            if (head.material && head.material.emissive) {
                originalHeadEmissive = head.material.emissive.clone();
                originalHeadEmissiveIntensity = head.material.emissiveIntensity;
                if (!isRevealed) {
                    head.material.emissive.set(0x66ffff); // Cyan glow
                    head.material.emissiveIntensity = 0.7;
                } else {
                    head.material.emissive.set(0xffff66); // Yellow glow
                    head.material.emissiveIntensity = 1.5;
                }
            }
        } else {
            if (head.material && originalHeadEmissive) {
                head.material.emissive.copy(originalHeadEmissive);
                head.material.emissiveIntensity = originalHeadEmissiveIntensity !== null ? originalHeadEmissiveIntensity : 0.3;
            }
        }
    }

    function update(updateOptions) {
        const { camera, time } = updateOptions; // time is in milliseconds

        if (!isRevealed) {
            characterGroup.rotation.y += 0.01;
            const bobbingSpeed = 2;
            const bobbingAmount = 0.05;
            if (!isAimingAtHead) {
                head.position.y = initialHeadPosition.y + Math.sin(time * 0.001 * bobbingSpeed) * bobbingAmount;
            } else {
                head.position.y = initialHeadPosition.y; // Stop bobbing
            }
            // Head always points away from the player (camera)
            const headWorldPos = new THREE.Vector3();
            head.getWorldPosition(headWorldPos);
            const camPos = camera.position.clone();
            const toCamera = camPos.sub(headWorldPos);
            toCamera.y = 0;
            toCamera.normalize();
            const worldAngle = Math.atan2(toCamera.x, toCamera.z) + Math.PI;
            const localAngle = worldAngle - characterGroup.rotation.y;
            head.rotation.set(0, localAngle, 0);

        } else {
            // Character and head always face the player
            const charPos = characterGroup.position;
            const camPos = camera.position;
            const dx = camPos.x - charPos.x;
            const dz = camPos.z - charPos.z;
            const angle = Math.atan2(dx, dz);
            characterGroup.rotation.y = angle;
            head.rotation.set(0, 0, 0); // Reset head rotation relative to body
        }
    }

    function raycast(raycaster) {
        // The head is the only interactive part
        return raycaster.intersectObject(head, false);
    }

    // Return the public API for the character
    return {
        group: characterGroup,
        toggleReveal,
        setAimingAtHead,
        update,
        raycast
    };
}