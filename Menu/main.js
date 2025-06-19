import * as THREE from 'https://unpkg.com/three@0.148.0/build/three.module.js';
import { PointerLockControls } from 'https://threejs.org/examples/jsm/controls/PointerLockControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.y = 10;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(0, 50, 0);
scene.add(directionalLight);

// Ground plane
const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
const planeMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

// PointerLockControls for mouselook
const controls = new PointerLockControls(camera, renderer.domElement);
const instructions = document.getElementById('instructions');
instructions.addEventListener('click', () => {
    controls.lock();
});
controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});
controls.addEventListener('unlock', () => {
    instructions.style.display = '';
});

// Create rotating "i" text
let textMesh;
const loader = new THREE.FontLoader();
loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
    const textGeometry = new THREE.TextGeometry('i', {
        font: font,
        size: 10,
        height: 2,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 0.5,
        bevelOffset: 0,
        bevelSegments: 5
    });
    const textMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.set(0, 15, -50); // Adjust position as desired
    scene.add(textMesh);
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    // Rotate the "i" if it's loaded
    if (textMesh) {
        textMesh.rotation.y += 0.01;
    }
    renderer.render(scene, camera);
}
animate();