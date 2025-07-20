
import * as THREE from 'three';

// This function creates and returns an object containing the gorilla group and its animated parts.
export function createGorilla() {
    const gorillaGroup = new THREE.Group();
    gorillaGroup.castShadow = true;
    gorillaGroup.receiveShadow = true;

    // Materials
    const gorillaMaterial = new THREE.MeshStandardMaterial({ color: 0x36454F });
    const blueFurMaterial = new THREE.MeshStandardMaterial({ color: 0x113366 });
    const armorMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFD700, // Bright yellow/gold
        metalness: 0.7,
        roughness: 0.3
    });
    const hydraulicMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        metalness: 0.9,
        roughness: 0.2
    });

    // Body
    const bodyGeometry = new THREE.DodecahedronGeometry(1);
    const body = new THREE.Mesh(bodyGeometry, blueFurMaterial);
    body.scale.set(2.5, 3.5, 2);
    body.rotation.x = 0.3;
    body.position.set(0, 2.25, -0.5);
    gorillaGroup.add(body);

    // Head
    const headGeometry = new THREE.DodecahedronGeometry(2);
    const head = new THREE.Mesh(headGeometry, gorillaMaterial);
    head.rotation.x = 0.1;
    head.position.set(0, 5.75, 0.5);
    gorillaGroup.add(head);
    gorillaGroup.head = head; // Expose head for camera/look controls

    // Lips
    const lipsGeometry = new THREE.TorusGeometry(0.7, 0.9, 6, 6);
    const lips = new THREE.Mesh(lipsGeometry, gorillaMaterial);
    lips.rotation.z = Math.PI / 2;
    lips.scale.set(0.5, 1, 1.2);
    lips.position.set(0, -0.6, 1.2); // Position relative to head
    lips.rotation.x = Math.PI / 6;
    head.add(lips);

    // Nose
    const noseGeometry = new THREE.DodecahedronGeometry(0.5);
    const nose = new THREE.Mesh(noseGeometry, gorillaMaterial);
    nose.scale.set(1, 0.5, 1);
    nose.position.set(0, 0, 1.7); // Position relative to head
    head.add(nose);

    // Eyes
    const eyeGeometry = new THREE.IcosahedronGeometry(0.2, 1);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x001122, roughness: 0.1, metalness: 0.1 });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.4, 0.25, 1.7); // Position relative to head
    head.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.4, 0.25, 1.7); // Position relative to head
    head.add(rightEye);

    // Mining Helmet
    const helmetGeo = new THREE.DodecahedronGeometry(2, 0);
    const helmet = new THREE.Mesh(helmetGeo, armorMaterial);
    helmet.position.set(0, 0.75, -0.1); // Position relative to head
    head.add(helmet);

    const helmetTorchGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const helmetTorch = new THREE.Mesh(helmetTorchGeo, hydraulicMaterial);
    helmetTorch.rotation.x = Math.PI / 2;
    helmetTorch.position.set(0, 2, 1); // Position relative to head
    head.add(helmetTorch);

    // --- Helper function to create a jointed limb ---
    function createJointedLimb(limbLength, limbRadius, rotationPointOffset, isArm) {
        const limbGroup = new THREE.Group();
        const baseDodecahedronRadius = 1;

        const upperPartGeometry = new THREE.DodecahedronGeometry(baseDodecahedronRadius, 0);
        const upperPart = new THREE.Mesh(upperPartGeometry, blueFurMaterial);
        upperPart.scale.set(limbRadius / baseDodecahedronRadius, limbLength / (baseDodecahedronRadius * 2), limbRadius / baseDodecahedronRadius);
        upperPart.position.y = -limbLength / 2;
        limbGroup.add(upperPart);

        const lowerPartGroup = new THREE.Group();
        lowerPartGroup.position.y = -limbLength - rotationPointOffset;
        limbGroup.add(lowerPartGroup);

        const lowerLimbRadius = isArm ? limbRadius * 1.2 : limbRadius;
        const lowerLimbLength = isArm ? limbLength * 1.2 : limbLength;
        const lowerPartGeometry = new THREE.DodecahedronGeometry(baseDodecahedronRadius, 0);
        const lowerPart = new THREE.Mesh(lowerPartGeometry, blueFurMaterial);
        lowerPart.scale.set(lowerLimbRadius / baseDodecahedronRadius, lowerLimbLength / (baseDodecahedronRadius * 2), lowerLimbRadius / baseDodecahedronRadius);
        lowerPart.position.y = -lowerLimbLength / 2;
        lowerPartGroup.add(lowerPart);

        return { limbGroup, lowerPartGroup };
    }

    // --- Helper function for Hydraulic Cylinders ---
    function createHydraulic(length) {
        const group = new THREE.Group();
        const outerGeo = new THREE.CylinderGeometry(0.3, 0.3, length, 6);
        const outerCylinder = new THREE.Mesh(outerGeo, armorMaterial);
        outerCylinder.position.y = -length / 2;
        group.add(outerCylinder);

        const pistonGeo = new THREE.CylinderGeometry(0.15, 0.15, length, 8);
        const piston = new THREE.Mesh(pistonGeo, hydraulicMaterial);
        piston.position.y = -length / 2;

        const pistonGroup = new THREE.Group();
        pistonGroup.add(piston);

        return { outer: group, piston: pistonGroup };
    }

    // Arms & Armor
    const armLength = 4.5;
    const armRadius = 0.9;
    const elbowOffset = -2;

    const pauldronGeo = new THREE.CylinderGeometry(1.1, 2.1, 3, 6);
    const leftPauldron = new THREE.Mesh(pauldronGeo, armorMaterial);
    leftPauldron.rotation.z = Math.PI * 0.4;
    leftPauldron.position.set(-2, 4, 0);
    gorillaGroup.add(leftPauldron);

    const rightPauldron = leftPauldron.clone();
    rightPauldron.rotation.y = Math.PI;
    rightPauldron.position.x = -leftPauldron.position.x;
    gorillaGroup.add(rightPauldron);

    // Left Arm
    const leftArmData = createJointedLimb(armLength, armRadius, elbowOffset, true);
    const leftArmGroup = leftArmData.limbGroup;
    const leftForearmGroup = leftArmData.lowerPartGroup;
    leftArmGroup.position.set(-2.5, 5.5, 0);
    gorillaGroup.add(leftArmGroup);
    gorillaGroup.leftArmGroup = leftArmGroup;
    gorillaGroup.leftForearmGroup = leftForearmGroup;

    const handGeometry = new THREE.DodecahedronGeometry(1.3);
    const leftHand = new THREE.Mesh(handGeometry, gorillaMaterial);
    leftHand.position.y = -(armLength * 0.9) - 0.4;
    leftHand.position.z = -0.3;
    leftForearmGroup.add(leftHand);

    // Right Arm
    const rightArmData = createJointedLimb(armLength, armRadius, elbowOffset, true);
    const rightArmGroup = rightArmData.limbGroup;
    const rightForearmGroup = rightArmData.lowerPartGroup;
    rightArmGroup.position.set(2.5, 5.5, 0);
    gorillaGroup.add(rightArmGroup);
    gorillaGroup.rightArmGroup = rightArmGroup;
    gorillaGroup.rightForearmGroup = rightForearmGroup;

    const rightHand = new THREE.Mesh(handGeometry, gorillaMaterial);
    rightHand.position.y = -(armLength * 0.9) - 0.4;
    rightHand.position.z = -0.3;
    rightForearmGroup.add(rightHand);

    // Arm Hydraulics & Gauntlets
    const gauntletGeo = new THREE.CylinderGeometry(1.2, 1, 3, 5);
    const leftGauntlet = new THREE.Mesh(gauntletGeo, armorMaterial);
    leftGauntlet.position.y = -2;
    leftForearmGroup.add(leftGauntlet);
    const rightGauntlet = leftGauntlet.clone();
    rightForearmGroup.add(rightGauntlet);

    const leftArmHydraulic = createHydraulic(2.5);
    leftArmHydraulic.outer.position.set(-1, -0.2, 0);
    leftArmHydraulic.piston.position.set(-1, 0.2, 0);
    leftArmGroup.add(leftArmHydraulic.outer);
    leftForearmGroup.add(leftArmHydraulic.piston);

    const rightArmHydraulic = createHydraulic(2.5);
    rightArmHydraulic.outer.position.set(1, -0.2, 0);
    rightArmHydraulic.piston.position.set(1, 0.2, 0);
    rightArmGroup.add(rightArmHydraulic.outer);
    rightForearmGroup.add(rightArmHydraulic.piston);

    // Legs & Armor
    const legLength = 3.5;
    const legRadius = 1;
    const kneeOffset = -1;

    // Left Leg
    const leftLegData = createJointedLimb(legLength, legRadius, kneeOffset, false);
    const leftLegGroup = leftLegData.limbGroup;
    const leftLowerLegGroup = leftLegData.lowerPartGroup;
    leftLegGroup.position.set(-1.2, 1.5, -1.5);
    gorillaGroup.add(leftLegGroup);
    gorillaGroup.leftLegGroup = leftLegGroup;
    gorillaGroup.leftLowerLegGroup = leftLowerLegGroup;

    const footGeometry = new THREE.DodecahedronGeometry(1);
    footGeometry.scale(1.2, 0.5, 2);
    const leftFoot = new THREE.Mesh(footGeometry, gorillaMaterial);
    leftFoot.position.y = -(legLength * 0.9) - 0.5;
    leftFoot.rotation.x = 0.4;
    leftLowerLegGroup.add(leftFoot);

    // Right Leg
    const rightLegData = createJointedLimb(legLength, legRadius, kneeOffset, false);
    const rightLegGroup = rightLegData.limbGroup;
    const rightLowerLegGroup = rightLegData.lowerPartGroup;
    rightLegGroup.position.set(1.2, 1.5, -1.5);
    gorillaGroup.add(rightLegGroup);
    gorillaGroup.rightLegGroup = rightLegGroup;
    gorillaGroup.rightLowerLegGroup = rightLowerLegGroup;

    const rightFoot = new THREE.Mesh(footGeometry, gorillaMaterial);
    rightFoot.position.y = -(legLength * 0.9) - 0.5;
    rightFoot.rotation.x = 0.4;
    rightLowerLegGroup.add(rightFoot);

    // Leg Hydraulics & Greaves
    const greaveGeo = new THREE.CylinderGeometry(1.2, 1, 3, 5);
    const leftGreave = new THREE.Mesh(greaveGeo, armorMaterial);
    leftGreave.position.y = -2;
    leftLowerLegGroup.add(leftGreave);
    const rightGreave = leftGreave.clone();
    rightLowerLegGroup.add(rightGreave);

    const leftLegHydraulic = createHydraulic(2);
    leftLegHydraulic.outer.position.set(0, -0.5, -1);
    leftLegHydraulic.piston.position.set(0, 0, -1);
    leftLegGroup.add(leftLegHydraulic.outer);
    leftLowerLegGroup.add(leftLegHydraulic.piston);

    const rightLegHydraulic = createHydraulic(2);
    rightLegHydraulic.outer.position.set(0, -0.5, -1);
    rightLegHydraulic.piston.position.set(0, 0, -1);
    rightLegGroup.add(rightLegHydraulic.outer);
    rightLowerLegGroup.add(rightLegHydraulic.piston);
    
    // The original model's feet are at y=-3 and head is around y=6, so total height is ~9.
    // We scale it to be 2 units high.
    const scale = 2 / 9;
    gorillaGroup.scale.set(scale, scale, scale);

    // The model's procedural origin is not at its center of mass.
    // After scaling, the feet are at y = -3 * scale = -0.66, and the head is at y = 6 * scale = 1.33.
    // The vertical center of the model is at (-0.66 + 1.33) / 2 = 0.335.
    // We shift the entire group down so its center is at the player's origin (0,0,0).
    gorillaGroup.position.y = -0.335;
    //gorillaGroup.rotation.y = Math.PI; // Rotate the gorilla model to face forward
    //gorillaGroup.scale.set(1, 1, -1); // Reset scale to 1 for correct positioning

    return gorillaGroup;
}

export function animateGorilla(gorilla, isMoving, time) {
    if (!gorilla) return;

    // Return to neutral pose if not moving
    if (!isMoving) {
        // Lerp to 0 for smooth transition
        gorilla.leftLegGroup.rotation.x += (0 - gorilla.leftLegGroup.rotation.x) * 0.1;
        gorilla.rightLegGroup.rotation.x += (0 - gorilla.rightLegGroup.rotation.x) * 0.1;
        gorilla.leftArmGroup.rotation.x += (0 - gorilla.leftArmGroup.rotation.x) * 0.1;
        gorilla.rightArmGroup.rotation.x += (0 - gorilla.rightArmGroup.rotation.x) * 0.1;
        gorilla.leftLowerLegGroup.rotation.x += (0 - gorilla.leftLowerLegGroup.rotation.x) * 0.1;
        gorilla.rightLowerLegGroup.rotation.x += (0 - gorilla.rightLowerLegGroup.rotation.x) * 0.1;
        gorilla.leftForearmGroup.rotation.x += (0 - gorilla.leftForearmGroup.rotation.x) * 0.1;
        gorilla.rightForearmGroup.rotation.x += (0 - gorilla.rightForearmGroup.rotation.x) * 0.1;
        return;
    }

    const walkAmplitude = 0.5;
    const kneeBendAmplitude = 0.8;
    const animationSpeed = 5;
    const t = time * animationSpeed;

    gorilla.leftLegGroup.rotation.x = Math.sin(t) * walkAmplitude;
    gorilla.rightLegGroup.rotation.x = Math.sin(t + Math.PI) * walkAmplitude;
    gorilla.leftArmGroup.rotation.x = Math.sin(t + Math.PI) * walkAmplitude * 1.2;
    gorilla.rightArmGroup.rotation.x = Math.sin(t) * walkAmplitude * 1.2;

    gorilla.leftLowerLegGroup.rotation.x = Math.max(0, Math.sin(t + Math.PI / 4)) * kneeBendAmplitude;
    gorilla.rightLowerLegGroup.rotation.x = Math.max(0, Math.sin(t + Math.PI + Math.PI / 4)) * kneeBendAmplitude;
    gorilla.leftForearmGroup.rotation.x = -Math.max(0, Math.sin(t + Math.PI + Math.PI / 4)) * kneeBendAmplitude * 0.8;
    gorilla.rightForearmGroup.rotation.x = -Math.max(0, Math.sin(t + Math.PI / 4)) * kneeBendAmplitude * 0.8;
}
