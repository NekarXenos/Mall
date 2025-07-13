// Convert the voxel rendering to use instanced meshes
// instead of creating thousands of separate materials and meshes

// Create a single shared material with color as an instance attribute
const voxelBaseMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.7,
    metalness: 0.2,
    emissive: 0x000000,
    onBeforeCompile: shader => {
        shader.vertexColors = true;
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
             diffuseColor.rgb *= vColor.rgb;
             emissiveColor.rgb = vColor.rgb * 0.5;` // Simple emissive approximation
        );
    },
    vertexColors: true
});

// Accumulate voxel instance data
const voxelPositions = [];
const voxelColors = [];

// Replace voxel creation with instancing logic (simplified loop example)
// Original voxel code used separate Mesh per cube — now gather all instance data instead:

// Example loop where you previously created a voxel:
for (let x = -diskRadius; x <= diskRadius; x += blockMeshSize) {
    for (let y = -diskRadius; y <= diskRadius; y += blockMeshSize) {
        if (x * x + y * y <= diskRadius * diskRadius) {
            for (let z = zMin; z < zMax; z += blockMeshSize) {
                const voxelPos = new THREE.Vector3(x, y, z);

                // Compute color and emissive "baked" value from getDiskMaterial or getCoreMaterial logic
                const mat = getDiskMaterial(z, zMin, zMax, x, y, diskRadius);
                const finalColor = new THREE.Color(mat.color);
                finalColor.lerp(mat.emissive, mat.emissiveIntensity); // Simple blend

                voxelPositions.push(voxelPos);
                voxelColors.push(finalColor);
            }
        }
    }
}

// Create InstancedMesh
const voxelGeometry = new THREE.BoxGeometry(blockMeshSize, blockMeshSize, blockMeshSize);
const count = voxelPositions.length;
const instancedMesh = new THREE.InstancedMesh(voxelGeometry, voxelBaseMaterial, count);

// Set instance matrices and colors
const dummy = new THREE.Object3D();
const colorAttr = new Float32Array(count * 3);
for (let i = 0; i < count; i++) {
    dummy.position.copy(voxelPositions[i]);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    colorAttr[i * 3 + 0] = voxelColors[i].r;
    colorAttr[i * 3 + 1] = voxelColors[i].g;
    colorAttr[i * 3 + 2] = voxelColors[i].b;
}
instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);

scene.add(instancedMesh);
