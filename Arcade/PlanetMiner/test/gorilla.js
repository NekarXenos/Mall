// gorilla.js

/**
 * This module exports a function to create a 3D gorilla model for Three.js.
 * The gorilla can switch between an "armored" look and a "base" look
 * by pressing the 'U' key.
 *
 * The base model is from 'ArmoredGorilla.html' and the swappable parts for the
 * base look are from 'BlueGorillaWalking.html'.
 */

// Ensure THREE is loaded
if (typeof THREE === 'undefined') {
    console.error('This module requires THREE.js to be loaded first.');
}

export function createGorilla() {
    const gorillaGroup = new THREE.Group();
    let isArmorVisible = true; // Start with armor visible

    // --- Materials ---
    const gorillaMaterial = new THREE.MeshStandardMaterial({ color: 0x36454F }); // Charcoal grey
    const blueFurMaterial = new THREE.MeshStandardMaterial({ color: 0x113366 }); // Blue fur
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
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x001122, roughness: 0.1, metalness: 0.1 });

    // --- Base Body and Head (from ArmoredGorilla) ---
    const bodyGeometry = new THREE.DodecahedronGeometry(1);
    const body = new THREE.Mesh(bodyGeometry, blueFurMaterial);
    body.scale.set(2.5, 3.5, 2);
    body.rotation.x = 0.3;
    body.position.set(0, 2.25, -0.5);
    gorillaGroup.add(body);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(2), gorillaMaterial);
    head.rotation.x = 0.1;
    head.position.set(0, 5.75, 0.5);
    gorillaGroup.add(head);

    // --- Facial Features (Common to both) ---
    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.9, 6, 6), gorillaMaterial);
    lips.rotation.z = Math.PI / 2;
    lips.scale.set(0.5, 1, 1.2);
    lips.position.set(head.position.x, head.position.y - 0.6, head.position.z + 1.2);
    lips.rotation.x = Math.PI / 6;
    gorillaGroup.add(lips);

    const nose = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), gorillaMaterial);
    nose.scale.set(1, 0.5, 1);
    nose.position.set(head.position.x, head.position.y, head.position.z + 1.7);
    gorillaGroup.add(nose);

    const leftEye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), eyeMaterial);
    leftEye.position.set(head.position.x - 0.4, head.position.y + 0.25, head.position.z + 1.7);
    gorillaGroup.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = -leftEye.position.x;
    gorillaGroup.add(rightEye);

    // --- Unarmored Parts (from BlueGorillaWalking) ---
    const unarmoredParts = new THREE.Group();
    unarmoredParts.userData.isUnarmored = true;
    gorillaGroup.add(unarmoredParts);

    const hairGeometry = new THREE.BoxGeometry(2.5, 3, 2.6);
    const flatTopHair = new THREE.Mesh(hairGeometry, blueFurMaterial);
    // Position relative to the head
    flatTopHair.position.set(head.position.x, head.position.y + 0.5, head.position.z - 0.5);
    flatTopHair.rotation.x = 0.1;
    unarmoredParts.add(flatTopHair);

    const earGeometry = new THREE.TorusGeometry(0.5, 0.3, 6, 6);
    const leftEar = new THREE.Mesh(earGeometry, gorillaMaterial);
    // Position relative to the head
    leftEar.position.set(head.position.x - 1.75, head.position.y + 0.25, head.position.z);
    leftEar.rotation.y = 0.2 - Math.PI / 2;
    unarmoredParts.add(leftEar);

    const rightEar = leftEar.clone();
    rightEar.position.x = -rightEar.position.x;
    rightEar.rotation.y = -leftEar.rotation.y;
    unarmoredParts.add(rightEar);

    const shoulderGeometry = new THREE.DodecahedronGeometry(1.5);
    const leftShoulder = new THREE.Mesh(shoulderGeometry, blueFurMaterial);
    // Adjusted Y position to fit ArmoredGorilla body
    leftShoulder.position.set(-2.5, 3.25, 0.4);
    unarmoredParts.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = -leftShoulder.position.x;
    unarmoredParts.add(rightShoulder);

    const chestGeometry = new THREE.DodecahedronGeometry(2.5);
    const chest = new THREE.Mesh(chestGeometry, gorillaMaterial);
    chest.scale.set(1.3, 0.8, 1);
    chest.rotation.x = 0.1;
    // Adjusted Y position to fit ArmoredGorilla body
    chest.position.set(0, 3.25, 0.5);
    unarmoredParts.add(chest);

    // --- Armor Parts (from ArmoredGorilla) ---
    const armorParts = new THREE.Group();
    armorParts.userData.isArmor = true;
    gorillaGroup.add(armorParts);

    const helmet = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), armorMaterial);
    helmet.position.set(head.position.x, head.position.y + 0.75, head.position.z - 0.1);
    armorParts.add(helmet);
    
    const helmetTorch = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), hydraulicMaterial);
    helmetTorch.rotation.x = Math.PI / 2;
    helmetTorch.position.set(0, head.position.y + 2, head.position.z + 1);
    armorParts.add(helmetTorch);

    const pauldronGeo = new THREE.CylinderGeometry(1.1, 2.1, 3, 6);
    const leftPauldron = new THREE.Mesh(pauldronGeo, armorMaterial);
    leftPauldron.rotation.z = Math.PI * 0.4;
    leftPauldron.position.set(-2, 4, 0);
    armorParts.add(leftPauldron);

    const rightPauldron = leftPauldron.clone();
    rightPauldron.rotation.y = Math.PI;
    rightPauldron.position.x = -leftPauldron.position.x;
    armorParts.add(rightPauldron);

    // --- Limb Creation Helpers ---
    function createJointedLimb(limbLength, limbRadius, rotationPointOffset, isArm) {
        const limbGroup = new THREE.Group();
        const baseDodecahedronRadius = 1;

        const upperPart = new THREE.Mesh(new THREE.DodecahedronGeometry(baseDodecahedronRadius, 0), blueFurMaterial);
        upperPart.scale.set(limbRadius / baseDodecahedronRadius, limbLength / (baseDodecahedronRadius * 2), limbRadius / baseDodecahedronRadius);
        upperPart.position.y = -limbLength / 2;
        limbGroup.add(upperPart);

        const lowerPartGroup = new THREE.Group();
        lowerPartGroup.position.y = -limbLength - rotationPointOffset;
        limbGroup.add(lowerPartGroup);

        const lowerLimbRadius = isArm ? limbRadius * 1.2 : limbRadius;
        const lowerLimbLength = isArm ? limbLength * 1.2 : limbLength;
        const lowerPart = new THREE.Mesh(new THREE.DodecahedronGeometry(baseDodecahedronRadius, 0), blueFurMaterial);
        lowerPart.scale.set(lowerLimbRadius / baseDodecahedronRadius, lowerLimbLength / (baseDodecahedronRadius * 2), lowerLimbRadius / baseDodecahedronRadius);
        lowerPart.position.y = -lowerLimbLength / 2;
        lowerPartGroup.add(lowerPart);

        return { limbGroup, lowerPartGroup };
    }

    function createHydraulic(length) {
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, length, 6), armorMaterial);
        outer.position.y = -length / 2;
        const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, length, 8), hydraulicMaterial);
        piston.position.y = -length / 2;
        return { outer, piston };
    }

    // --- Arms ---
    const armLength = 4.5;
    const armRadius = 0.9;
    const elbowOffset = -2;

    const { limbGroup: leftArmGroup, lowerPartGroup: leftForearmGroup } = createJointedLimb(armLength, armRadius, elbowOffset, true);
    leftArmGroup.position.set(-2.5, 5.5, 0);
    gorillaGroup.add(leftArmGroup);

    const handGeometry = new THREE.DodecahedronGeometry(1.3);
    const leftHand = new THREE.Mesh(handGeometry, gorillaMaterial);
    leftHand.position.y = -(armLength * 0.9) - 0.4;
    leftHand.position.z = -0.3;
    leftForearmGroup.add(leftHand);

    const { limbGroup: rightArmGroup, lowerPartGroup: rightForearmGroup } = createJointedLimb(armLength, armRadius, elbowOffset, true);
    rightArmGroup.position.set(2.5, 5.5, 0);
    gorillaGroup.add(rightArmGroup);

    const rightHand = leftHand.clone();
    rightForearmGroup.add(rightHand);

    // --- Arm Armor ---
    const gauntletGeo = new THREE.CylinderGeometry(1.2, 1, 3, 5);
    const leftGauntlet = new THREE.Mesh(gauntletGeo, armorMaterial);
    leftGauntlet.position.y = -2;
    leftForearmGroup.add(leftGauntlet);
    armorParts.add(leftGauntlet);

    const rightGauntlet = leftGauntlet.clone();
    rightForearmGroup.add(rightGauntlet);
    armorParts.add(rightGauntlet);

    const leftArmHydraulic = createHydraulic(2.5);
    leftArmHydraulic.outer.position.set(-1, -0.2, 0);
    leftArmHydraulic.piston.position.set(-1, 0.2, 0);
    leftArmGroup.add(leftArmHydraulic.outer);
    leftForearmGroup.add(leftArmHydraulic.piston);
    armorParts.add(leftArmHydraulic.outer, leftArmHydraulic.piston);

    const rightArmHydraulic = createHydraulic(2.5);
    rightArmHydraulic.outer.position.set(1, -0.2, 0);
    rightArmHydraulic.piston.position.set(1, 0.2, 0);
    rightArmGroup.add(rightArmHydraulic.outer);
    rightForearmGroup.add(rightArmHydraulic.piston);
    armorParts.add(rightArmHydraulic.outer, rightArmHydraulic.piston);

    // --- Legs ---
    const legLength = 3.5;
    const legRadius = 1;
    const kneeOffset = -1;

    const { limbGroup: leftLegGroup, lowerPartGroup: leftLowerLegGroup } = createJointedLimb(legLength, legRadius, kneeOffset, false);
    leftLegGroup.position.set(-1.2, 1.5, -1.5);
    gorillaGroup.add(leftLegGroup);

    const footGeometry = new THREE.DodecahedronGeometry(1);
    footGeometry.scale(1.2, 0.5, 2);
    const leftFoot = new THREE.Mesh(footGeometry, gorillaMaterial);
    leftFoot.position.y = -(legLength * 0.9) - 0.5;
    leftFoot.rotation.x = 0.4;
    leftLowerLegGroup.add(leftFoot);

    const { limbGroup: rightLegGroup, lowerPartGroup: rightLowerLegGroup } = createJointedLimb(legLength, legRadius, kneeOffset, false);
    rightLegGroup.position.set(1.2, 1.5, -1.5);
    gorillaGroup.add(rightLegGroup);

    const rightFoot = leftFoot.clone();
    rightLowerLegGroup.add(rightFoot);

    // --- Leg Armor ---
    const greaveGeo = new THREE.CylinderGeometry(1.2, 1, 3, 5);
    const leftGreave = new THREE.Mesh(greaveGeo, armorMaterial);
    leftGreave.position.y = -2;
    leftLowerLegGroup.add(leftGreave);
    armorParts.add(leftGreave);

    const rightGreave = leftGreave.clone();
    rightLowerLegGroup.add(rightGreave);
    armorParts.add(rightGreave);

    const leftLegHydraulic = createHydraulic(2);
    leftLegHydraulic.outer.position.set(0, -0.5, -1);
    leftLegHydraulic.piston.position.set(0, 0, -1);
    leftLegGroup.add(leftLegHydraulic.outer);
    leftLowerLegGroup.add(leftLegHydraulic.piston);
    armorParts.add(leftLegHydraulic.outer, leftLegHydraulic.piston);

    const rightLegHydraulic = createHydraulic(2);
    rightLegHydraulic.outer.position.set(0, -0.5, -1);
    rightLegHydraulic.piston.position.set(0, 0, -1);
    rightLegGroup.add(rightLegHydraulic.outer);
    rightLowerLegGroup.add(rightLegHydraulic.piston);
    armorParts.add(rightLegHydraulic.outer, rightLegHydraulic.piston);

    // --- Initial Visibility & Armor Toggle ---
    function setArmorVisibility(visible) {
        isArmorVisible = visible;
        armorParts.visible = isArmorVisible;
        unarmoredParts.visible = !isArmorVisible;
    }

    // Set initial state
    setArmorVisibility(true);

    function toggleArmor() {
        setArmorVisibility(!isArmorVisible);
    }

    window.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'u') {
            toggleArmor();
        }
    });

    // --- Scale and Position ---
    const tempBox = new THREE.Box3().setFromObject(gorillaGroup);
    const height = tempBox.max.y - tempBox.min.y;
    const desiredHeight = 2.0;
    const scale = desiredHeight / height;

    gorillaGroup.scale.set(scale, scale, scale);

    const finalBox = new THREE.Box3().setFromObject(gorillaGroup);
    gorillaGroup.position.y = -finalBox.min.y;

    // --- Return the fully constructed gorilla ---
    return {
        gorillaGroup,
        leftArmGroup,
        rightArmGroup,
        leftLegGroup,
        rightLegGroup,
        leftForearmGroup,
        rightForearmGroup,
        leftLowerLegGroup,
        rightLowerLegGroup,
        toggleArmor
    };
}