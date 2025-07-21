import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// Scene, camera, renderer
let scene, camera, renderer;

// Gorilla and animation variables
let gorillaGroup, headGroup;
let leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup;
let leftForearmGroup, rightForearmGroup, leftLowerLegGroup, rightLowerLegGroup;
let clock;

// Movement variables
const controls = {};
const speed = 0.04; // Halved from 0.08
const jumpForce = 8;
const gravity = -25;
let verticalVelocity = 0;

const GROUND_Y = 0;
const PLAYER_START_Y = 0.76; // Calculated to place feet on GROUND_Y
let isGrounded = true;

// Camera control variables
let cameraPivot;
const cameraOffset = new THREE.Vector3(0, 4, 10);

// Mouse look variables
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const pitchSpeed = 1;
const yawSpeed = 1;

export function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);
    scene.fog = new THREE.Fog(0x333333, 30, 100);
    clock = new THREE.Clock();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraPivot = new THREE.Group();
    cameraPivot.add(camera);
    camera.position.copy(cameraOffset);
    camera.lookAt(new THREE.Vector3(0, 2, 0));

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    const pointLight = new THREE.PointLight(0xffd700, 1.5, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    // 5. Materials
    const gorillaMaterial = new THREE.MeshStandardMaterial({ color: 0x36454F });
    const blueFurMaterial = new THREE.MeshStandardMaterial({ color: 0x113366 });
    const armorMaterial = new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7, roughness: 0.3 });
    const hydraulicMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.2 });

    // 6. Create Gorilla
    gorillaGroup = new THREE.Group();
    gorillaGroup.castShadow = true;
    gorillaGroup.receiveShadow = true;
    gorillaGroup.add(cameraPivot); // Attach camera pivot to the gorilla

    // Body
    const bodyGeometry = new THREE.DodecahedronGeometry(1);
    const body = new THREE.Mesh(bodyGeometry, blueFurMaterial);
    body.scale.set(2.5, 3.5, 2);
    body.rotation.x = -0.3;
    body.position.set(0, 2.25, -0.5);
    gorillaGroup.add(body);

    // Head Group
    headGroup = new THREE.Group();
    headGroup.position.set(0, 5.75, -0.5); // Set pivot point for head rotation
    gorillaGroup.add(headGroup);

    // Head
    const headGeometry = new THREE.DodecahedronGeometry(2);
    const head = new THREE.Mesh(headGeometry, gorillaMaterial);
    head.rotation.x = 0.1;
    headGroup.add(head);

    // Lips
    const lipsGeometry = new THREE.TorusGeometry(0.7, 0.9, 6, 6);
    const lips = new THREE.Mesh(lipsGeometry, gorillaMaterial);
    lips.rotation.z = Math.PI / 2;
    lips.scale.set(0.5, 1, 1.2);
    lips.position.set(0, -0.6, -1.2);
    lips.rotation.x = -Math.PI / 6;
    headGroup.add(lips);

    // Nose
    const noseGeometry = new THREE.DodecahedronGeometry(0.5);
    const nose = new THREE.Mesh(noseGeometry, gorillaMaterial);
    nose.scale.set(1, 0.5, 1);
    nose.position.set(0, 0, -1.7);
    headGroup.add(nose);

    // Eyes
    const eyeGeometry = new THREE.IcosahedronGeometry(0.2, 1);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x001122, roughness: 0.1, metalness: 0.1 });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.4, 0.25, -1.7);
    headGroup.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.4, 0.25, -1.7);
    headGroup.add(rightEye);

    // Helmet
    const helmetGeo = new THREE.DodecahedronGeometry(2, 0);
    const helmet = new THREE.Mesh(helmetGeo, armorMaterial);
    helmet.position.set(0, 0.75, 0.1);
    headGroup.add(helmet);
    const helmetTorchGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const helmetTorch = new THREE.Mesh(helmetTorchGeo, hydraulicMaterial);
    helmetTorch.rotation.x = -Math.PI / 2;
    helmetTorch.position.set(0, 2, -1);
    headGroup.add(helmetTorch);

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

    const leftArmData = createJointedLimb(armLength, armRadius, elbowOffset, true);
    leftArmGroup = leftArmData.limbGroup;
    leftForearmGroup = leftArmData.lowerPartGroup;
    leftArmGroup.position.set(-2.5, 5.5, 0);
    gorillaGroup.add(leftArmGroup);
    const handGeometry = new THREE.DodecahedronGeometry(1.3);
    const leftHand = new THREE.Mesh(handGeometry, gorillaMaterial);
    leftHand.position.y = -(armLength * 0.9) - 0.4;
    leftHand.position.z = 0.3;
    leftForearmGroup.add(leftHand);

    const rightArmData = createJointedLimb(armLength, armRadius, elbowOffset, true);
    rightArmGroup = rightArmData.limbGroup;
    rightForearmGroup = rightArmData.lowerPartGroup;
    rightArmGroup.position.set(2.5, 5.5, 0);
    gorillaGroup.add(rightArmGroup);
    const rightHand = new THREE.Mesh(handGeometry, gorillaMaterial);
    rightHand.position.y = -(armLength * 0.9) - 0.4;
    rightHand.position.z = 0.3;
    rightForearmGroup.add(rightHand);

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
    const leftLegData = createJointedLimb(legLength, legRadius, kneeOffset, false);
    leftLegGroup = leftLegData.limbGroup;
    leftLowerLegGroup = leftLegData.lowerPartGroup;
    leftLegGroup.position.set(-1.2, 1.5, 1.5);
    gorillaGroup.add(leftLegGroup);
    const footGeometry = new THREE.DodecahedronGeometry(1);
    footGeometry.scale(1.2, 0.5, 2);
    const leftFoot = new THREE.Mesh(footGeometry, gorillaMaterial);
    leftFoot.position.y = -(legLength * 0.9) - 0.5;
    leftFoot.rotation.x = -0.4;
    leftLowerLegGroup.add(leftFoot);

    const rightLegData = createJointedLimb(legLength, legRadius, kneeOffset, false);
    rightLegGroup = rightLegData.limbGroup;
    rightLowerLegGroup = rightLegData.lowerPartGroup;
    rightLegGroup.position.set(1.2, 1.5, 1.5);
    gorillaGroup.add(rightLegGroup);
    const rightFoot = new THREE.Mesh(footGeometry, gorillaMaterial);
    rightFoot.position.y = -(legLength * 0.9) - 0.5;
    rightFoot.rotation.x = -0.4;
    rightLowerLegGroup.add(rightFoot);

    const greaveGeo = new THREE.CylinderGeometry(1.2, 1, 3, 5);
    const leftGreave = new THREE.Mesh(greaveGeo, armorMaterial);
    leftGreave.position.y = -2;
    leftLowerLegGroup.add(leftGreave);
    const rightGreave = leftGreave.clone();
    rightLowerLegGroup.add(rightGreave);
    const leftLegHydraulic = createHydraulic(2);
    leftLegHydraulic.outer.position.set(0, -0.5, 1);
    leftLegHydraulic.piston.position.set(0, 0, 1);
    leftLegGroup.add(leftLegHydraulic.outer);
    leftLowerLegGroup.add(leftLegHydraulic.piston);
    const rightLegHydraulic = createHydraulic(2);
    rightLegHydraulic.outer.position.set(0, -0.5, 1);
    rightLegHydraulic.piston.position.set(0, 0, 1);
    rightLegGroup.add(rightLegHydraulic.outer);
    rightLowerLegGroup.add(rightLegHydraulic.piston);

    scene.add(gorillaGroup);
    gorillaGroup.scale.set(0.147, 0.147, 0.147);
    gorillaGroup.position.y = PLAYER_START_Y;

    // 7. Ground Plane
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.2, roughness: 0.8 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    plane.position.y = GROUND_Y;
    scene.add(plane);

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', (event) => (controls[event.key.toLowerCase()] = true));
    document.addEventListener('keyup', (event) => (controls[event.key.toLowerCase()] = false));
    renderer.domElement.addEventListener('click', () => document.body.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            document.addEventListener('mousemove', onMouseMove, false);
        } else {
            document.removeEventListener('mousemove', onMouseMove, false);
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    euler.y -= event.movementX * 0.002 * yawSpeed;
    euler.x -= event.movementY * 0.002 * pitchSpeed;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x)); // Clamp pitch
}

function updatePlayer(deltaTime) {
    const moveDirection = new THREE.Vector3();
    const forward = new THREE.Vector3();
    gorillaGroup.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    if (controls['w']) moveDirection.add(forward);
    if (controls['s']) moveDirection.sub(forward);
    if (controls['a']) moveDirection.sub(right);
    if (controls['d']) moveDirection.add(right);

    gorillaGroup.position.add(moveDirection.normalize().multiplyScalar(speed));

    // Jumping and Gravity
    if (controls[' '] && isGrounded) {
        verticalVelocity = jumpForce;
        isGrounded = false;
    }
    if (!isGrounded) {
        verticalVelocity += gravity * deltaTime;
    }
    gorillaGroup.position.y += verticalVelocity * deltaTime;

    // Ground check
    if (gorillaGroup.position.y <= PLAYER_START_Y) {
        gorillaGroup.position.y = PLAYER_START_Y;
        verticalVelocity = 0;
        isGrounded = true;
    }

    // Apply rotation from mouse
    gorillaGroup.rotation.y = euler.y;
    cameraPivot.rotation.x = euler.x;
    headGroup.rotation.x = euler.x;
}

export function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const time = clock.getElapsedTime() * 5;

    updatePlayer(deltaTime);

    const isMoving = controls['w'] || controls['a'] || controls['s'] || controls['d'];
    if (isMoving) {
        const walkAmplitude = 0.5;
        const kneeBendAmplitude = 0.8;
        leftLegGroup.rotation.x = -Math.sin(time) * walkAmplitude;
        rightLegGroup.rotation.x = -Math.sin(time + Math.PI) * walkAmplitude;
        leftArmGroup.rotation.x = -Math.sin(time + Math.PI) * walkAmplitude * 1.2;
        rightArmGroup.rotation.x = -Math.sin(time) * walkAmplitude * 1.2;
        leftLowerLegGroup.rotation.x = -Math.max(0, Math.sin(time + Math.PI / 4)) * kneeBendAmplitude;
        rightLowerLegGroup.rotation.x = -Math.max(0, Math.sin(time + Math.PI + Math.PI / 4)) * kneeBendAmplitude;
        leftForearmGroup.rotation.x = Math.max(0, Math.sin(time + Math.PI + Math.PI / 4)) * kneeBendAmplitude * 0.8;
        rightForearmGroup.rotation.x = Math.max(0, Math.sin(time + Math.PI / 4)) * kneeBendAmplitude * 0.8;
    } else {
        leftLegGroup.rotation.x = 0;
        rightLegGroup.rotation.x = 0;
        leftArmGroup.rotation.x = 0;
        rightArmGroup.rotation.x = 0;
        leftLowerLegGroup.rotation.x = 0;
        rightLowerLegGroup.rotation.x = 0;
        leftForearmGroup.rotation.x = 0;
        rightForearmGroup.rotation.x = 0;
    }

    renderer.render(scene, camera);
}
