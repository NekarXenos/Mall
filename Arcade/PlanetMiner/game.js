// Basic Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('game-canvas'),
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(100, 100, 100);
scene.add(directionalLight);

// Planet
const planetGeometry = new THREE.SphereGeometry(50, 64, 64);
const planetMaterial = new THREE.MeshStandardMaterial({ color: 0x552211 });
const planet = new THREE.Mesh(planetGeometry, planetMaterial);
scene.add(planet);

// Player
const player = new THREE.Group();
const bodyGeometry = new THREE.BoxGeometry(1, 2, 1);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
player.add(body);

const headGeometry = new THREE.DodecahedronGeometry(0.75);
const headMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const head = new THREE.Mesh(headGeometry, headMaterial);
head.position.y = 1.5;
player.add(head);

// Player's starting position on top of the planet
player.position.set(0, 51.5, 0);
scene.add(player);

// Camera Setup
const thirdPersonCamera = new THREE.Object3D();
player.add(thirdPersonCamera);
thirdPersonCamera.position.set(0, 5, 10);


// Player Physics and Controls
const playerVelocity = new THREE.Vector3();
const playerSpeed = 10;
const jumpHeight = 8;
let isJumping = false;
const gravity = -20;
const keys = {};

document.addEventListener('keydown', (event) => {
    keys[event.code] = true;
    if (event.code === 'Space' && !isJumping) {
        isJumping = true;
        playerVelocity.y = jumpHeight;
    }
});
document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
});

// Mouse controls
document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === renderer.domElement) {
        player.rotation.y -= event.movementX * 0.002;
        thirdPersonCamera.rotation.x -= event.movementY * 0.002;
        thirdPersonCamera.rotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, thirdPersonCamera.rotation.x));
    }
});

renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});


const clock = new THREE.Clock();

// Game Loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Player movement
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW']) {
        moveDirection.z -= 1;
    }
    if (keys['KeyS']) {
        moveDirection.z += 1;
    }
    if (keys['KeyA']) {
        moveDirection.x -= 1;
    }
    if (keys['KeyD']) {
        moveDirection.x += 1;
    }
    moveDirection.normalize().applyQuaternion(player.quaternion);
    player.position.add(moveDirection.multiplyScalar(playerSpeed * delta));


    // Gravity
    playerVelocity.y += gravity * delta;
    player.position.add(playerVelocity.clone().multiplyScalar(delta));


    // Keep player on the planet
    const playerToPlanetCenter = player.position.clone().normalize();
    const planetSurfacePosition = playerToPlanetCenter.clone().multiplyScalar(50 + 1);

    if (player.position.length() < 51.5) {
        player.position.copy(planetSurfacePosition);
        playerVelocity.y = 0;
        isJumping = false;
    }

    // Orient player to planet surface
    const up = new THREE.Vector3(0, 1, 0);
    const playerUp = player.position.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, playerUp);
    player.quaternion.premultiply(quaternion);


    // Update camera
    const cameraPosition = new THREE.Vector3();
    thirdPersonCamera.getWorldPosition(cameraPosition);
    camera.position.copy(cameraPosition);
    camera.lookAt(player.position);


    renderer.render(scene, camera);
}

animate();

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});