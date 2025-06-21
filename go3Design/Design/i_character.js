// ES module version of the "i" character for Three.js scenes
// Usage: import { createICharacter } from './Design/i_character.js';
// const iChar = createICharacter({ scene, position: {x, y, z} });
// scene.add(iChar.group); ...

import * as THREE from 'three';

export function createICharacter({ scene, position = { x: 0, y: 0, z: 0 } }) {
    // State
    let isRevealed = false;
    let isAimingAtHead = false;
    let canToggleReveal = true;
    let originalHeadEmissive = null;
    let originalHeadEmissiveIntensity = null;
    let lastBobbing = 0;
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);

    // Proportions
    const legHeight = 0.15;
    const torsoHeight = 0.8;
    const armHeight = 0.15;
    const headRadius = 0.22;

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x0077ff,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x0033aa,
        emissiveIntensity: 0.3
    });
    const blueHeadMaterial = bodyMaterial.clone();
    const skinHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xaa8844, roughness: 0.6, metalness: 0.0 });

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.2, legHeight, 0.3);
    const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    leftLeg.position.set(-0.2, legHeight * 1.5, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
    rightLeg.position.set(0.2, legHeight * 1.5, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.3, torsoHeight, 0.3);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.set(0, legHeight + (torsoHeight / 2), 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.2, armHeight, 0.3);
    const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
    leftArm.position.set(-0.2, legHeight + torsoHeight - (armHeight / 2), 0);
    leftArm.castShadow = true;
    leftArm.receiveShadow = true;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
    rightArm.position.set(0.2, legHeight + torsoHeight - (armHeight / 2), 0);
    rightArm.castShadow = true;
    rightArm.receiveShadow = true;
    group.add(rightArm);

    // Head
    const headGeometry = new THREE.SphereGeometry(headRadius, 32, 32);
    const head = new THREE.Mesh(headGeometry, blueHeadMaterial);
    head.position.set(0, legHeight + torsoHeight + 0.05 + headRadius, 0);
    head.castShadow = true;
    group.add(head);
    const initialHeadY = head.position.y;

    // Eyes
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.0 });
    const eyeGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.04, 0.03, headRadius - 0.03);
    leftEye.scale.y = 1.75;
    leftEye.rotation.z = Math.PI / 30;
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.04, 0.03, headRadius - 0.03);
    rightEye.scale.y = 1.75;
    rightEye.rotation.z = -Math.PI / 30;
    // Not added by default

    // Mouth
    const mouthGeometry = new THREE.TorusGeometry(0.14, 0.02, 16, 100, Math.PI);
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.0 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 0.01, headRadius - 0.09);
    mouth.rotation.z = Math.PI;
    mouth.rotation.x = -Math.PI / 10;
    // Not added by default

    // Reveal/Hide
    function reveal() {
        head.material = skinHeadMaterial;
        head.add(leftEye);
        head.add(rightEye);
        head.add(mouth);
        head.position.y = initialHeadY;
        isRevealed = true;
    }
    function hide() {
        head.material = blueHeadMaterial;
        if (head.children.includes(leftEye)) head.remove(leftEye);
        if (head.children.includes(rightEye)) head.remove(rightEye);
        if (head.children.includes(mouth)) head.remove(mouth);
        head.position.y = initialHeadY;
        isRevealed = false;
    }
    function toggleReveal() {
        if (!canToggleReveal) return;
        canToggleReveal = false;
        setTimeout(() => { canToggleReveal = true; }, 400);
        if (isRevealed) hide(); else reveal();
    }

    // Animation
    function update({ camera, time }) {
        // Raycast for hover (handled externally)
        // Animate rotation/bobbing
        if (!isRevealed) {
            group.rotation.y += 0.01;
            // Bobbing
            const bobbingSpeed = 2;
            const bobbingAmount = 0.05;
            if (!isAimingAtHead) {
                head.position.y = initialHeadY + Math.sin(time * bobbingSpeed) * bobbingAmount;
            } else {
                head.position.y = initialHeadY;
            }
            // Head faces away from camera
            if (camera) {
                const headWorldPos = new THREE.Vector3();
                head.getWorldPosition(headWorldPos);
                const camPos = camera.position.clone();
                const toCamera = camPos.sub(headWorldPos);
                toCamera.y = 0;
                toCamera.normalize();
                const angle = Math.atan2(toCamera.x, toCamera.z) + Math.PI;
                head.rotation.set(0, angle, 0);
            }
        } else {
            // Face camera
            if (camera) {
                const charPos = group.position;
                const camPos = camera.position;
                const dx = camPos.x - charPos.x;
                const dz = camPos.z - charPos.z;
                const angle = Math.atan2(dx, dz);
                group.rotation.y = angle;
                head.rotation.set(0, 0, 0);
            }
        }
    }

    // Raycast for hover/click
    function raycast(raycaster) {
        return raycaster.intersectObject(head, false);
    }

    // Glow effect
    function setAimingAtHead(val) {
        if (val === isAimingAtHead) return;
        isAimingAtHead = val;
        if (isAimingAtHead) {
            if (head.material && head.material.emissive) {
                originalHeadEmissive = head.material.emissive.clone();
                originalHeadEmissiveIntensity = head.material.emissiveIntensity;
                head.material.emissive.set(0x00ffff); // Cyan glow for hover
                head.material.emissiveIntensity = 1.0;
            }
        } else {
            if (head.material && originalHeadEmissive) {
                head.material.emissive.copy(originalHeadEmissive);
                head.material.emissiveIntensity = originalHeadEmissiveIntensity;
            }
        }
    }

    // Only allow toggle if canToggleReveal is true
    function tryToggleReveal() {
        if (!canToggleReveal) return false;
        canToggleReveal = false;
        setTimeout(() => { canToggleReveal = true; }, 400);
        toggleReveal();
        return true;
    }

    // Start hidden
    hide();

    return {
        group,
        update,
        raycast,
        toggleReveal: tryToggleReveal,
        setAimingAtHead,
        isRevealed: () => isRevealed
    };
}
