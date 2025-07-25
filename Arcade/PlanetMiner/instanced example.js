const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const instanceCount = 1000000; // Millions of objects
const mesh = new THREE.InstancedMesh(geometry, material, instanceCount);

// Set transformations for each instance
for (let i = 0; i < instanceCount; i++) {
  const matrix = new THREE.Matrix4();
  matrix.setPosition(Math.random() * 100, Math.random() * 100, Math.random() * 100);
  mesh.setMatrixAt(i, matrix);
}

scene.add(mesh);