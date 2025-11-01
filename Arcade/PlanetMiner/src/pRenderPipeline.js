/**
 * Render Pipeline Module
 * Handles main render loop, visual effects, animations, and explosions
 */

import * as THREE from 'three';
import { updateBlackHoleBubble } from './pBlackHoleBubble.js';
import { SUN_RADIUS } from './pConstants.js';

/**
 * Visual Effects Manager
 * Handles explosions, particles, and other visual effects
 */
export class VisualEffectsManager {
    constructor(scene) {
        this.scene = scene;
        this.activeExplosions = [];
        this.allBlackHoleBubbles = [];
        this.voxelCubes = []; // Track voxel cubes for explosions
    }
    
    /**
     * Create voxel-based explosion from mesh vertices
     * @param {THREE.Vector3} position - World position of explosion center
     * @param {THREE.Color} color - Color of explosion cubes
     * @param {number} size - Size of the exploding body
     * @param {THREE.Mesh} mesh - The mesh to extract vertices from
     */
    createVoxelExplosion(position, color, size, mesh) {
        if (!mesh || !mesh.geometry) {
            // Fallback to particle explosion if no mesh
            this.createExplosion(position, color, size);
            return;
        }

        const geometry = mesh.geometry;
        const positionAttribute = geometry.attributes.position;
        
        if (!positionAttribute) {
            this.createExplosion(position, color, size);
            return;
        }

        // Calculate cube size based on body radius (smaller cubes for smaller bodies)
        const cubeSize = Math.max(0.5, size * 0.01); // 1% of body radius, minimum 0.5
        const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        
        // Sample vertices (use every Nth vertex to avoid too many cubes)
        const vertexCount = positionAttribute.count;
        const samplingRate = Math.max(1, Math.floor(vertexCount / 500)); // Max ~500 cubes
        
        const worldMatrix = new THREE.Matrix4();
        if (mesh.parent) {
            mesh.parent.updateWorldMatrix(true, false);
            worldMatrix.copy(mesh.parent.matrixWorld);
        }
        worldMatrix.multiply(mesh.matrix);

        for (let i = 0; i < vertexCount; i += samplingRate) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getY(i);
            const z = positionAttribute.getZ(i);
            
            // Transform vertex to world space
            const vertex = new THREE.Vector3(x, y, z);
            vertex.applyMatrix4(worldMatrix);
            
            // Calculate explosion velocity (radial direction from center)
            const velocity = new THREE.Vector3()
                .subVectors(vertex, position)
                .normalize()
                .multiplyScalar(size * (2 + Math.random() * 3)); // Varying speeds
            
            // Add some randomness to velocity
            velocity.x += (Math.random() - 0.5) * size;
            velocity.y += (Math.random() - 0.5) * size;
            velocity.z += (Math.random() - 0.5) * size;
            
            // Create cube material with slight color variation
            const cubeColor = color.clone();
            cubeColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
            
            const cubeMaterial = new THREE.MeshStandardMaterial({
                color: cubeColor,
                emissive: cubeColor,
                emissiveIntensity: 0.3,
                roughness: 0.8,
                metalness: 0.2
            });
            
            const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cube.position.copy(vertex);
            
            // Add rotation velocity
            cube.userData.rotationVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );
            
            this.scene.add(cube);
            
            // Store cube data for updates
            this.voxelCubes.push({
                mesh: cube,
                velocity: velocity,
                lifetime: 2.0, // 2 seconds
                age: 0
            });
        }
    }
    
    /**
     * Create explosion particle effect (legacy/fallback)
     * @param {THREE.Vector3} position - World position of explosion
     * @param {THREE.Color} color - Color of explosion particles
     * @param {number} size - Size of the exploding body
     */
    createExplosion(position, color, size) {
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = position.getComponent(i % 3);
            velocities[i] = (Math.random() - 0.5) * size * 5;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.1 * size,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const points = new THREE.Points(geometry, material);
        this.scene.add(points);
        this.activeExplosions.push(points);
    }
    
    /**
     * Update all active explosions
     * @param {number} delta - Time delta
     */
    updateExplosions(delta) {
        // Update particle-based explosions
        const explosionsToRemove = [];
        
        this.activeExplosions.forEach(exp => {
            const geom = exp.geometry;
            const pos = geom.attributes.position.array;
            const vel = geom.attributes.velocity.array;
            
            for (let i = 0; i < pos.length; i++) {
                pos[i] += vel[i] * delta;
            }
            
            geom.attributes.position.needsUpdate = true;
            exp.material.opacity -= delta * 0.5;
            
            if (exp.material.opacity <= 0) {
                explosionsToRemove.push(exp);
            }
        });
        
        // Remove finished explosions
        explosionsToRemove.forEach(exp => {
            this.scene.remove(exp);
            exp.geometry.dispose();
            exp.material.dispose();
            const index = this.activeExplosions.indexOf(exp);
            if (index !== -1) {
                this.activeExplosions.splice(index, 1);
            }
        });

        // Update voxel cubes
        const cubesToRemove = [];
        
        this.voxelCubes.forEach(cubeData => {
            cubeData.age += delta;
            
            // Update position based on velocity
            cubeData.mesh.position.x += cubeData.velocity.x * delta;
            cubeData.mesh.position.y += cubeData.velocity.y * delta;
            cubeData.mesh.position.z += cubeData.velocity.z * delta;
            
            // Apply gravity (weak gravity for dramatic effect)
            cubeData.velocity.y -= 2 * delta;
            
            // Apply rotation
            if (cubeData.mesh.userData.rotationVelocity) {
                cubeData.mesh.rotation.x += cubeData.mesh.userData.rotationVelocity.x * delta;
                cubeData.mesh.rotation.y += cubeData.mesh.userData.rotationVelocity.y * delta;
                cubeData.mesh.rotation.z += cubeData.mesh.userData.rotationVelocity.z * delta;
            }
            
            // Fade out in the last 0.5 seconds
            const fadeStartTime = cubeData.lifetime - 0.5;
            if (cubeData.age > fadeStartTime) {
                const fadeProgress = (cubeData.age - fadeStartTime) / 0.5;
                cubeData.mesh.material.opacity = 1 - fadeProgress;
                cubeData.mesh.material.transparent = true;
            }
            
            // Mark for removal after lifetime expires
            if (cubeData.age >= cubeData.lifetime) {
                cubesToRemove.push(cubeData);
            }
        });
        
        // Remove expired cubes
        cubesToRemove.forEach(cubeData => {
            this.scene.remove(cubeData.mesh);
            cubeData.mesh.geometry.dispose();
            cubeData.mesh.material.dispose();
            const index = this.voxelCubes.indexOf(cubeData);
            if (index !== -1) {
                this.voxelCubes.splice(index, 1);
            }
        });
    }
    
    /**
     * Register a black hole bubble for animation updates
     * @param {THREE.Mesh} bubble - Black hole bubble mesh
     */
    registerBlackHoleBubble(bubble) {
        if (!this.allBlackHoleBubbles.includes(bubble)) {
            this.allBlackHoleBubbles.push(bubble);
        }
    }
    
    /**
     * Update all black hole bubbles
     * @param {number} delta - Time delta
     * @param {THREE.Camera} camera - Active camera
     */
    updateBlackHoleBubbles(delta, camera) {
        this.allBlackHoleBubbles.forEach(bubble => {
            updateBlackHoleBubble(bubble, delta, camera);
        });
    }
    
    /**
     * Clear all visual effects
     */
    clear() {
        // Remove all explosions
        this.activeExplosions.forEach(exp => {
            this.scene.remove(exp);
            exp.geometry.dispose();
            exp.material.dispose();
        });
        this.activeExplosions = [];
    }
    
    /**
     * Get active explosion count
     * @returns {number}
     */
    getExplosionCount() {
        return this.activeExplosions.length;
    }
}

/**
 * Sun Animation Manager
 * Handles sun collapse animation and black hole creation
 */
export class SunAnimationManager {
    constructor(scene, sun, corona, sunLight, camera) {
        this.scene = scene;
        this.sun = sun;
        this.corona = corona;
        this.sunLight = sunLight;
        this.camera = camera;
        
        this.sunCollapsing = false;
        this.sunCollapseTimer = 0;
        this.blackHoleActive = false;
        this.blackHoleSystem = {};
        this.screenTextureTarget = null;
    }
    
    /**
     * Start sun collapse animation
     */
    startCollapse() {
        this.sunCollapsing = true;
        this.sunCollapseTimer = 0;
        console.log('Sun collapse initiated');
    }
    
    /**
     * Update sun collapse animation
     * @param {number} delta - Time delta
     */
    updateCollapse(delta) {
        if (!this.sunCollapsing) return;
        
        this.sunCollapseTimer += delta;
        const timer = this.sunCollapseTimer;
        const flashDuration = 0.3;
        const expandDuration = 1.5;
        const shrinkDuration = 2.0;
        const totalDuration = flashDuration + expandDuration + shrinkDuration;

        // 1. Corona Flash
        if (timer <= flashDuration) {
            const progress = timer / flashDuration;
            this.corona.material.opacity = THREE.MathUtils.lerp(0.8, 20.0, progress);
            const scale = THREE.MathUtils.lerp(SUN_RADIUS * 4, SUN_RADIUS * 12, progress);
            this.corona.scale.set(scale, scale, 1);
            this.sunLight.intensity = THREE.MathUtils.lerp(1000000, 10000000, progress);
        }
        // 2. Corona Expansion
        else if (timer <= flashDuration + expandDuration) {
            const progress = (timer - flashDuration) / expandDuration;
            const scale = THREE.MathUtils.lerp(SUN_RADIUS * 12, SUN_RADIUS * 150, progress);
            this.corona.scale.set(scale, scale, 1);
            this.corona.material.opacity = THREE.MathUtils.lerp(20.0, 0.0, progress);
            this.sunLight.intensity = THREE.MathUtils.lerp(10000000, 0, progress);
        }
        // 3. Sun Shrink
        else if (timer <= totalDuration) {
            if (this.corona.parent) this.sun.remove(this.corona);
            const progress = (timer - (flashDuration + expandDuration)) / shrinkDuration;
            const colorValue = 1.0 - progress;
            this.sun.material.color.setRGB(colorValue, colorValue * 0.5, colorValue * 0.3);
            
            const scale = 1.0 - progress;
            this.sun.scale.set(scale, scale, scale);
        }
        // 4. Animation Finished
        else {
            this.sunCollapsing = false;
            this.sun.scale.set(0.01, 0.01, 0.01);
            this.sun.material.color.setRGB(0, 0, 0);
            
            if (this.corona.parent) this.sun.remove(this.corona);
            if (this.sunLight.parent) this.scene.remove(this.sunLight);
            
            this.createBlackHole();
            this.blackHoleActive = true;
            
            console.log('Black hole created at system center!');
        }
    }
    
    /**
     * Create black hole system
     */
    createBlackHole() {
        this.cleanupBlackHole();
        
        // Ensure screen texture target is ready
        if (!this.screenTextureTarget) {
            this.screenTextureTarget = new THREE.WebGLRenderTarget(
                window.innerWidth, 
                window.innerHeight
            );
        }
        
        // Accretion disk light
        const accretionLight = new THREE.PointLight(0xffaa00, 50000, 2000, 1);
        accretionLight.position.set(0, 0, 0);
        this.scene.add(accretionLight);

        // Black hole sphere with gravitational lensing
        const bhRadius = SUN_RADIUS * 0.5;
        const lensUniforms = {
            tScene: { value: this.screenTextureTarget.texture },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            strength: { value: 0.12 },
            falloff: { value: 0.9 },
            chroma: { value: 0.0015 }
        };
        
        const lensMat = new THREE.ShaderMaterial({
            uniforms: lensUniforms,
            vertexShader: `
                varying vec4 vPos;
                void main() {
                    vPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_Position = vPos;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tScene;
                uniform vec2 resolution;
                uniform float strength;
                uniform float falloff;
                uniform float chroma;
                
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 c = vec2(0.5);
                    vec2 d = uv - c;
                    d.x *= resolution.x / resolution.y;
                    float r = length(d) + 1e-6;
                    
                    if (r < 0.035) {
                        gl_FragColor = vec4(0., 0., 0., 1.);
                        return;
                    }
                    
                    float k = strength / pow(r, falloff);
                    vec2 dir = d / r;
                    vec2 shift = dir * k;
                    shift.x /= resolution.x / resolution.y;
                    
                    vec3 col;
                    col.r = texture2D(tScene, uv - shift * (1.0 + chroma)).r;
                    col.g = texture2D(tScene, uv - shift).g;
                    col.b = texture2D(tScene, uv - shift * (1.0 - chroma)).b;
                    
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            side: THREE.DoubleSide,
        });
        
        const bhSphere = new THREE.Mesh(
            new THREE.SphereGeometry(bhRadius, 32, 16), 
            lensMat
        );
        this.scene.add(bhSphere);

        // Accretion disk
        const diskInner = bhRadius * 1.25;
        const diskOuter = bhRadius * 3.125;
        const diskGeo = new THREE.RingGeometry(diskInner, diskOuter, 128, 1);
        diskGeo.rotateX(Math.PI / 2);
        
        const diskMat = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            uniforms: {
                time: { value: 0 },
                innerRadius: { value: diskInner },
                outerRadius: { value: diskOuter }
            },
            vertexShader: `
                varying vec3 vWorldPos;
                void main() {
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPos;
                uniform float time;
                uniform float innerRadius;
                uniform float outerRadius;
                
                float hash(float n) {
                    return fract(sin(n) * 753.5453);
                }
                
                float noise(vec3 x) {
                    vec3 p = floor(x);
                    vec3 f = fract(x);
                    f = f * f * (3.0 - 2.0 * f);
                    float n = p.x + p.y * 157.0 + 113.0 * p.z;
                    return mix(
                        mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                            mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
                        mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                            mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y),
                        f.z
                    );
                }
                
                float fbm(vec3 pos) {
                    float t = 0.0;
                    float amp = 0.5;
                    for (int i = 0; i < 4; i++) {
                        t += noise(pos) * amp;
                        pos *= 2.0;
                        amp *= 0.5;
                    }
                    return t;
                }
                
                void main() {
                    float dist = length(vWorldPos.xz);
                    float angle = atan(vWorldPos.z, vWorldPos.x);
                    float diskTwist = 10.0 / sqrt(dist);
                    vec3 uvw = vec3(angle / (2.0 * 3.14159) - diskTwist, dist, 0.0);
                    float densityVariation = fbm(uvw * 2.0);
                    float radialProfile = smoothstep(innerRadius, innerRadius + 1.0, dist) * 
                                        (1.0 - smoothstep(outerRadius - 1.0, outerRadius, dist));
                    float density = radialProfile * densityVariation;
                    
                    vec3 color = mix(
                        vec3(1.0, 0.5, 0.0), 
                        vec3(0.8, 0.2, 0.0), 
                        (dist - innerRadius) / (outerRadius - innerRadius)
                    );
                    
                    vec3 viewDir = normalize(cameraPosition - vWorldPos);
                    vec3 velocityDir = normalize(vec3(-vWorldPos.z, 0.0, vWorldPos.x));
                    float doppler = dot(viewDir, velocityDir);
                    color.r *= 1.0 - doppler * 0.3;
                    color.b *= 1.0 + doppler * 0.3;
                    
                    float gravitationalShift = 1.0 - 1.0 / sqrt(dist);
                    color *= gravitationalShift;
                    
                    gl_FragColor = vec4(color, density * 1.5);
                }
            `
        });
        
        const disk = new THREE.Mesh(diskGeo, diskMat);
        this.scene.add(disk);

        // Inner glowing particles
        const particleCount = 5000;
        const particlePositions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = diskInner + Math.random() * (diskOuter - diskInner);
            particlePositions[i * 3] = Math.cos(angle) * radius;
            particlePositions[i * 3 + 1] = (Math.random() - 0.5) * (bhRadius * 0.1);
            particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
        }
        
        const particleGeo = new THREE.BufferGeometry();
        particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMat = new THREE.PointsMaterial({
            color: 0xffddaa,
            size: bhRadius * 0.02,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false
        });
        const innerParticles = new THREE.Points(particleGeo, particleMat);
        this.scene.add(innerParticles);

        this.blackHoleSystem = {
            bhSphere,
            disk,
            innerParticles,
            accretionLight,
            radius: bhRadius,
            screenTarget: this.screenTextureTarget
        };
    }
    
    /**
     * Update black hole animation
     * @param {number} delta - Time delta
     * @param {THREE.Clock} clock - Game clock
     */
    updateBlackHole(delta, clock) {
        if (!this.blackHoleActive || !this.blackHoleSystem.bhSphere) return;
        
        // Update disk animation
        if (this.blackHoleSystem.disk && 
            this.blackHoleSystem.disk.material && 
            this.blackHoleSystem.disk.material.uniforms && 
            this.blackHoleSystem.disk.material.uniforms.time) {
            this.blackHoleSystem.disk.material.uniforms.time.value = clock.getElapsedTime();
        }
        
        // Animate inner particles
        if (this.blackHoleSystem.innerParticles) {
            this.blackHoleSystem.innerParticles.rotation.y += 0.05 * delta * 60;
        }
    }
    
    /**
     * Render scene with black hole gravitational lensing effect
     * @param {THREE.WebGLRenderer} renderer - Three.js renderer
     * @param {THREE.Scene} scene - Scene to render
     * @param {THREE.Camera} camera - Active camera
     */
    renderWithBlackHole(renderer, scene, camera) {
        if (!this.blackHoleActive || !this.blackHoleSystem.bhSphere) {
            renderer.clear();
            renderer.render(scene, camera);
            return;
        }
        
        // Render scene to texture for lensing effect
        this.blackHoleSystem.bhSphere.visible = false;
        renderer.setRenderTarget(this.blackHoleSystem.screenTarget);
        renderer.clear();
        renderer.render(scene, camera);
        
        // Render final scene with black hole visible
        this.blackHoleSystem.bhSphere.visible = true;
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(scene, camera);
    }
    
    /**
     * Cleanup black hole system
     */
    cleanupBlackHole() {
        if (this.blackHoleSystem.bhSphere) this.scene.remove(this.blackHoleSystem.bhSphere);
        if (this.blackHoleSystem.disk) this.scene.remove(this.blackHoleSystem.disk);
        if (this.blackHoleSystem.innerParticles) this.scene.remove(this.blackHoleSystem.innerParticles);
        if (this.blackHoleSystem.outerBelt) {
            this.blackHoleSystem.outerBelt.forEach(a => this.scene.remove(a));
        }
        if (this.blackHoleSystem.accretionLight) this.scene.remove(this.blackHoleSystem.accretionLight);
        this.blackHoleSystem = {};
    }
    
    /**
     * Update screen texture resolution
     * @param {number} width - New width
     * @param {number} height - New height
     */
    updateResolution(width, height) {
        if (this.screenTextureTarget) {
            this.screenTextureTarget.setSize(width, height);
        }
        
        if (this.blackHoleActive && this.blackHoleSystem.bhSphere) {
            this.blackHoleSystem.bhSphere.material.uniforms.resolution.value.set(width, height);
        }
    }
    
    /**
     * Check if sun is collapsing
     * @returns {boolean}
     */
    isCollapsing() {
        return this.sunCollapsing;
    }
    
    /**
     * Check if black hole is active
     * @returns {boolean}
     */
    isBlackHoleActive() {
        return this.blackHoleActive;
    }
    
    /**
     * Get black hole system
     * @returns {Object}
     */
    getBlackHoleSystem() {
        return this.blackHoleSystem;
    }
}

/**
 * Animation Loop Manager
 * Coordinates the main animation/render loop
 */
export class AnimationLoopManager {
    constructor() {
        this.isRunning = false;
        this.animationFrameId = null;
        this.updateCallbacks = [];
        this.renderCallbacks = [];
        this.clock = new THREE.Clock();
        this.maxDelta = 0.1; // Cap delta at 100ms to prevent huge jumps
        this.frameCount = 0;
        this.lastLogTime = 0;
        this.totalElapsedTime = 0; // Track elapsed time manually to avoid calling clock.getElapsedTime()
        
        // Bind animate to preserve 'this' context
        this.animate = this.animate.bind(this);
    }
    
    /**
     * Register an update callback
     * @param {Function} callback - Callback function(delta)
     * @param {number} priority - Priority (lower = earlier execution)
     */
    onUpdate(callback, priority = 0) {
        this.updateCallbacks.push({ callback, priority });
        this.updateCallbacks.sort((a, b) => a.priority - b.priority);
    }
    
    /**
     * Register a render callback
     * @param {Function} callback - Callback function(delta)
     */
    onRender(callback) {
        this.renderCallbacks.push(callback);
    }
    
    /**
     * Start the animation loop
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.clock.start();
        this.animate();
    }
    
    /**
     * Stop the animation loop
     */
    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * Main animation loop
     */
    animate() {
        if (!this.isRunning) return;
        
        let delta = this.clock.getDelta();
        
        // Cap delta to prevent huge jumps (e.g., when tab is inactive)
        delta = Math.min(delta, this.maxDelta);
        
        // Track total elapsed time manually
        this.totalElapsedTime += delta;
        
        // Execute all update callbacks
        this.updateCallbacks.forEach(item => {
            item.callback(delta);
        });
        
        // Execute all render callbacks
        this.renderCallbacks.forEach(callback => {
            callback(delta);
        });
        
        this.animationFrameId = requestAnimationFrame(this.animate);
    }
    
    /**
     * Get elapsed time
     * @returns {number}
     */
    getElapsedTime() {
        return this.totalElapsedTime; // Use our manual tracking instead of clock.getElapsedTime()
    }
    
    /**
     * Get delta time - DO NOT USE! Delta is passed to callbacks.
     * This method exists for backwards compatibility but should not be called.
     * @returns {number}
     * @deprecated
     */
    getDelta() {
        console.warn('[AnimationLoopManager] getDelta() should not be called! Use the delta parameter in callbacks instead.');
        return 0.016; // Return a default value
    }
}
