// --- Elevator Creation ---
function createElevator(config) {
    const elevatorObj = {
        id: config.id,
        platform: null,
        roof: null, // elevator's own internal roof
        chain: null,
        shaftCeiling: null, // Topmost ceiling of the elevator shaft
        shaftPit: null,     // Bottommost base of the elevator shaft
        poles: [],
        minFloorIndex: config.minFloorIndex,
        maxFloorIndex: config.maxFloorIndex,
        // Platform center Y is -0.1 from the actual floor level for visual alignment
        currentY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        targetY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        isMoving: false,
        direction: 0,
        currentFloorIndexVal: config.startFloorIndex,
        config: config, // Store original config for reference
        upButtons: null,      // Will hold the InstancedMesh for up buttons
        downButtons: null,    // Will hold the InstancedMesh for down buttons
        upButtonMaterial: null,   // Will hold the material for up buttons
        downButtonMaterial: null, // Will hold the material for down buttons
    };

    // 1. Elevator Platform
    const platformGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, 0.2, config.shaftDepth - 0.2);
    elevatorObj.platform = new THREE.Mesh(platformGeo, config.platformMaterial);
    elevatorObj.platform.name = `ElevatorPlatform_${config.id}`;
    elevatorObj.platform.position.set(config.x, elevatorObj.currentY, config.z);
    elevatorObj.platform.castShadow = true;
    elevatorObj.platform.receiveShadow = true;
    config.scene.add(elevatorObj.platform);
    config.worldObjectsRef.push(elevatorObj.platform);
    elevatorObj.platform.userData.elevatorId = config.id;

    // 2. Elevator's Own Internal Roof
    const elevatorInternalRoofThickness = 0.2;
    const internalRoofGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, elevatorInternalRoofThickness, config.shaftDepth - 0.2);
    elevatorObj.roof = new THREE.Mesh(internalRoofGeo, config.platformMaterial);
    elevatorObj.roof.name = `ElevatorInternalRoof_${config.id}`;
    elevatorObj.roof.position.set(config.x, elevatorObj.currentY + SETTINGS.wallHeight, config.z); // Positioned relative to platform
    elevatorObj.roof.castShadow = true;
    elevatorObj.roof.receiveShadow = true;
    config.scene.add(elevatorObj.roof);
    config.worldObjectsRef.push(elevatorObj.roof);
    elevatorObj.roof.geometry.computeBoundingBox();
    elevatorObj.roof.userData.elevatorId = config.id;

    // Add a light inside the elevator, attached to its internal roof
    const elevatorLight = new THREE.PointLight(0xffffff, 0.8, 4); // color, intensity, distance
    elevatorLight.position.set(0, -elevatorInternalRoofThickness / 2 - 0.1, 0);
    elevatorObj.roof.add(elevatorLight);

    // 3. Vertical Poles and Instanced Buttons
    const poleDimension = 0.2;
    const poleHeight = SETTINGS.wallHeight;
    const poleGeo = new THREE.BoxGeometry(poleDimension, poleHeight, poleDimension);
    const platformInnerWidth = config.shaftWidth - 0.2;
    const platformInnerDepth = config.shaftDepth - 0.2;

    const polePositions = [
        { x: -platformInnerWidth / 2 + poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x:  platformInnerWidth / 2 - poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x: -platformInnerWidth / 2 + poleDimension / 2, z:  platformInnerDepth / 2 - poleDimension / 2 },
        { x:  platformInnerWidth / 2 - poleDimension / 2, z:  platformInnerDepth / 2 - poleDimension / 2 }
    ];

    // --- Button Geometries and Materials (defined once) ---
    const buttonSize = 0.2;
    const buttonDepth = 0.05; // A more reasonable depth for the button
    const buttonOffset = 0.12; // Adjusted offset from pole surface

    // Up button (triangle pointing up)
    const upButtonShape = new THREE.Shape();
    upButtonShape.moveTo(0, buttonSize / 2);
    upButtonShape.lineTo(-buttonSize / 2, -buttonSize / 2);
    upButtonShape.lineTo(buttonSize / 2, -buttonSize / 2);
    upButtonShape.lineTo(0, buttonSize / 2);
    const upButtonGeo = new THREE.ExtrudeGeometry(upButtonShape, { steps: 1, depth: buttonDepth, bevelEnabled: false });
    const upButtonMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.1 });
    upButtonMaterial.userData = { originalEmissiveIntensity: 0.1 }; // Store original state
    elevatorObj.upButtonMaterial = upButtonMaterial;

    // Down button (triangle pointing down)
    const downButtonShape = new THREE.Shape();
    downButtonShape.moveTo(0, -buttonSize / 2);
    downButtonShape.lineTo(-buttonSize / 2, buttonSize / 2);
    downButtonShape.lineTo(buttonSize / 2, buttonSize / 2);
    downButtonShape.lineTo(0, -buttonSize / 2);
    const downButtonGeo = new THREE.ExtrudeGeometry(downButtonShape, { steps: 1, depth: buttonDepth, bevelEnabled: false });
    const downButtonMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.1 }); // Red for down
    downButtonMaterial.userData = { originalEmissiveIntensity: 0.1 };
    elevatorObj.downButtonMaterial = downButtonMaterial;

    // --- Create InstancedMeshes ---
    const upButtonsInstanced = new THREE.InstancedMesh(upButtonGeo, upButtonMaterial, polePositions.length);
    upButtonsInstanced.name = `ElevatorUpButtons_${config.id}`;
    upButtonsInstanced.userData = { isElevatorButton: true, elevatorId: config.id, direction: 'up' };
    elevatorObj.platform.add(upButtonsInstanced);
    elevatorObj.upButtons = upButtonsInstanced;

    const downButtonsInstanced = new THREE.InstancedMesh(downButtonGeo, downButtonMaterial, polePositions.length);
    downButtonsInstanced.name = `ElevatorDownButtons_${config.id}`;
    downButtonsInstanced.userData = { isElevatorButton: true, elevatorId: config.id, direction: 'down' };
    elevatorObj.platform.add(downButtonsInstanced);
    elevatorObj.downButtons = downButtonsInstanced;
    
    // --- Position Poles and Button Instances ---
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // Rotate to face outwards
    const scale = new THREE.Vector3(1, 1, 1);

    polePositions.forEach((pos, index) => {
        // Create the individual pole
        const pole = new THREE.Mesh(poleGeo, config.platformMaterial);
        pole.name = `ElevatorPole_${config.id}_${index}`;
        pole.position.set(pos.x, 0.1 + poleHeight / 2, pos.z);
        pole.castShadow = true; pole.receiveShadow = true;
        pole.userData.elevatorId = config.id;
        elevatorObj.platform.add(pole);
        elevatorObj.poles.push(pole);

        // Set matrix for the UP button instance
        const upPosition = new THREE.Vector3(pos.x, 0.1 + poleHeight / 2 + 0.4, pos.z + poleDimension / 2 + buttonOffset);
        matrix.compose(upPosition, rotation, scale);
        upButtonsInstanced.setMatrixAt(index, matrix);

        // Set matrix for the DOWN button instance
        const downPosition = new THREE.Vector3(pos.x, 0.1 + poleHeight / 2 - 0.4, pos.z + poleDimension / 2 + buttonOffset);
        matrix.compose(downPosition, rotation, scale);
        downButtonsInstanced.setMatrixAt(index, matrix);
    });
    upButtonsInstanced.instanceMatrix.needsUpdate = true;
    downButtonsInstanced.instanceMatrix.needsUpdate = true;


    // 4. Elevator Shaft Ceiling
    const shaftCeilingY = (config.maxFloorIndex + 1) * SETTINGS.floorHeight;
    const shaftCeilingGeo = new THREE.BoxGeometry(config.shaftWidth, floorDepth-0.02, config.shaftDepth);
    elevatorObj.shaftCeiling = new THREE.Mesh(shaftCeilingGeo, config.shaftMaterial);
    elevatorObj.shaftCeiling.name = `ElevatorShaftCeiling_${config.id}`;
    elevatorObj.shaftCeiling.position.set(config.x, shaftCeilingY - floorDepth / 2, config.z);
    elevatorObj.shaftCeiling.castShadow = true; elevatorObj.shaftCeiling.receiveShadow = true;
    config.scene.add(elevatorObj.shaftCeiling);
    config.worldObjectsRef.push(elevatorObj.shaftCeiling);
    elevatorObj.shaftCeiling.geometry.computeBoundingBox();

    // 5. Elevator Shaft Pit Base
    const pitThickness = SETTINGS.floorHeight;
    const pitTopSurfaceY = (config.minFloorIndex * SETTINGS.floorHeight) - floorDepth;
    const pitCenterY = pitTopSurfaceY - pitThickness / 2;
    const pitGeo = new THREE.BoxGeometry(config.shaftWidth, pitThickness, config.shaftDepth);
    elevatorObj.shaftPit = new THREE.Mesh(pitGeo, config.shaftMaterial);
    elevatorObj.shaftPit.name = `ElevatorShaftPit_${config.id}`;
    elevatorObj.shaftPit.position.set(config.x, pitCenterY, config.z);
    elevatorObj.shaftPit.receiveShadow = true;
    config.scene.add(elevatorObj.shaftPit);
    config.worldObjectsRef.push(elevatorObj.shaftPit);
    elevatorObj.shaftPit.geometry.computeBoundingBox();

    // 6. Dynamic Chain
    const chain = createDynamicChainMesh(elevatorObj, config.platformMaterial);
    elevatorObj.chain = chain;
    chain.userData.elevatorId = config.id;
    elevatorObj.platform.add(chain);

    // 7. Bottom Piston Shaft
    const piston = createElevatorPistonMesh(elevatorObj, config.platformMaterial);
    piston.userData.elevatorId = config.id;
    elevatorObj.platform.add(piston);
    config.worldObjectsRef.push(piston);

    elevators.push(elevatorObj);
    if (!activeElevator) {
        activeElevator = elevatorObj;
    }
    return elevatorObj;
}