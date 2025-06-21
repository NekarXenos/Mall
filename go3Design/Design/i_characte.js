import * as THREE from 'three';

/**
 * Creates a 3D "i" character that rotates and periodically transforms into a smiley face.
 * @returns {THREE.Group} A group containing the character. The group has an `update(delta)` method for animation.
 */
export function createICharacter() {
    const iCharacterGroup = new THREE.Group();
    const TRON_BLUE = 0x0088ff;

    // --- "i" character parts ---
    const iGroup = new THREE.Group();
    const blueMaterial = new THREE.MeshStandardMaterial({
        color: TRON_BLUE,
        metalness: 0.3,
        roughness: 0.4,
        emissive: TRON_BLUE,
        emissiveIntensity: 0.5
    });

    // Body of the "i"
    const bodyGeom = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const iBody = new THREE.Mesh(bodyGeom, blueMaterial);
    iBody.castShadow = true;
    iBody.receiveShadow = true;
    iGroup.add(iBody);

    // Dot of the "i"
    const dotGeom = new THREE.SphereGeometry(0.12, 32, 16);
    const iDot = new THREE.Mesh(dotGeom, blueMaterial);
    iDot.position.y = 0.4;
    iDot.castShadow = true;
    iDot.receiveShadow = true;
    iGroup.add(iDot);

    iCharacterGroup.add(iGroup);

    // --- Smiley face parts ---
    const smileyGroup = new THREE.Group();
    smileyGroup.visible = false; // Initially hidden

    const faceGeom = new THREE.SphereGeometry(0.3, 32, 16);
    const faceMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00, // Yellow
        metalness: 0.1,
        roughness: 0.5
    });
    const smileyFace = new THREE.Mesh(faceGeom, faceMaterial);
    smileyFace.castShadow = true;
    smileyFace.receiveShadow = true;

    // Eyes
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), eyeMaterial);
    leftEye.position.set(-0.1, 0.1, 0.28);
    smileyFace.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), eyeMaterial);
    rightEye.position.set(0.1, 0.1, 0.28);
    smileyFace.add(rightEye);

    // Mouth (using a curved tube)
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.15, -0.1, 0),
        new THREE.Vector3(0, -0.2, 0),
        new THREE.Vector3(0.15, -0.1, 0)
    ]);
    const mouthGeom = new THREE.TubeGeometry(curve, 20, 0.015, 8, false);
    const mouth = new THREE.Mesh(mouthGeom, eyeMaterial);
    mouth.position.z = 0.28;
    smileyFace.add(mouth);

    smileyGroup.add(smileyFace);
    iCharacterGroup.add(smileyGroup);

    // --- Animation and Interaction Logic ---
    let isSmiley = false;

    function toggleCharacter() {
        isSmiley = !isSmiley;
        iGroup.visible = !isSmiley;
        smileyGroup.visible = isSmiley;
    }

    // Switch every 4 seconds
    setInterval(toggleCharacter, 4000);

    // Add an update function for rotation, to be called in the main render loop
    iCharacterGroup.update = (delta) => {
        iCharacterGroup.rotation.y += 0.5 * delta;
    };

    return iCharacterGroup;
}