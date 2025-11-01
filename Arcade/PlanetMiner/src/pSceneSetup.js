import * as THREE from 'three';

/**
 * Core Three.js Scene Setup Module
 * Handles scene, renderer, cameras, and window resize
 */

export class SceneSetup {
    constructor() {
        // Scene
        this.scene = new THREE.Scene();
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false;
        document.body.appendChild(this.renderer.domElement);
        
        // Main Free Camera
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            50000
        );
        
        // Third Person Camera
        this.thirdPersonCamera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            50000
        );
        this.thirdPersonCamera.position.set(2, 0.3, -5);
        this.thirdPersonCamera.lookAt(0, 1.5, 0);
        
        // First Person Camera
        this.firstPersonCamera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            50000
        );
        this.firstPersonCamera.position.set(0, 0, 0.5);
        this.firstPersonCamera.lookAt(0, 0, 1);
        
        // Camera mode tracking
        this.cameraMode = 'free'; // 'free', 'third', 'first'
        
        // Mouse look state
        this.mouseLookEnabled = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.headPitch = 0;
        this.bodyYaw = 0;
        
        // Free camera zoom state
        this.freeCameraZoomLevel = 0; // 0: Solar System, 1: Planetary System, 2: Surface
        this.freeCameraZoomSmooth = 0; // Smooth interpolation value (0.0 to 2.999...)
        this.freeCameraConfigs = []; // Will be set after solar system generation
        
        // Rocket camera zoom
        this.rocketCameraZoomFactor = 1.0;
        
        // Setup resize handler
        this.setupResizeHandler();
        
        // Screen texture target for post-processing effects
        this.screenTextureTarget = new THREE.WebGLRenderTarget(
            window.innerWidth, 
            window.innerHeight
        );
    }
    
    /**
     * Initialize free camera configurations based on solar system size
     * @param {number} furthestOrbitRadius - The orbit radius of the furthest planet
     * @param {number} sunRadius - The radius of the sun
     */
    initFreeCameraConfigs(furthestOrbitRadius, sunRadius) {
        this.freeCameraConfigs = [
            {
                name: "Solar System",
                isFixedY: true,
                y: furthestOrbitRadius * 1.5,
                z: furthestOrbitRadius * 0.5
            },
            {
                name: "Planetary System",
                isFixedY: false,
                y: 1,
                z: 1
            },
            {
                name: "Surface",
                isFixedY: false,
                y: 15,
                z: 10
            }
        ];
        
        // Set initial camera position based on Solar System config (Level 0)
        const initialConfig = this.freeCameraConfigs[0];
        this.camera.position.set(0, initialConfig.y, initialConfig.z);
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * Get the currently active camera based on mode
     * @returns {THREE.PerspectiveCamera}
     */
    getActiveCamera() {
        switch (this.cameraMode) {
            case 'third':
                return this.thirdPersonCamera;
            case 'first':
                return this.firstPersonCamera;
            default:
                return this.camera;
        }
    }
    
    /**
     * Switch camera mode
     * @param {string} mode - 'free', 'third', or 'first'
     */
    setCameraMode(mode) {
        if (['free', 'third', 'first'].includes(mode)) {
            this.cameraMode = mode;
        }
    }
    
    /**
     * Handle window resize events
     */
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspect = width / height;
        
        // Update all cameras
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        
        this.thirdPersonCamera.aspect = aspect;
        this.thirdPersonCamera.updateProjectionMatrix();
        
        this.firstPersonCamera.aspect = aspect;
        this.firstPersonCamera.updateProjectionMatrix();
        
        // Update renderer
        this.renderer.setSize(width, height);
        
        // Update screen texture target
        this.screenTextureTarget.setSize(width, height);
    }
    
    /**
     * Setup automatic window resize handling
     */
    setupResizeHandler() {
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }
    
    /**
     * Add basic lighting to the scene
     * @param {THREE.Vector3} sunPosition - Position of the sun/main light
     * @param {number} intensity - Light intensity
     */
    addSunLight(sunPosition = new THREE.Vector3(0, 0, 0), intensity = 1000000) {
        const sunLight = new THREE.PointLight(0xfffefd, intensity);
        sunLight.position.copy(sunPosition);
        this.scene.add(sunLight);
        return sunLight;
    }
    
    /**
     * Add ambient lighting to the scene
     * @param {number} color - Light color (hex)
     * @param {number} intensity - Light intensity
     */
    addAmbientLight(color = 0x555555, intensity = 0.5) {
        const ambientLight = new THREE.AmbientLight(color, intensity);
        this.scene.add(ambientLight);
        return ambientLight;
    }
    
    /**
     * Render the scene
     * @param {THREE.Camera} camera - Optional camera override
     */
    render(camera = null) {
        const activeCamera = camera || this.getActiveCamera();
        this.renderer.render(this.scene, activeCamera);
    }
    
    /**
     * Clear the renderer
     */
    clear() {
        this.renderer.clear();
    }
    
    /**
     * Cleanup and dispose of resources
     */
    dispose() {
        window.removeEventListener('resize', this.onWindowResize);
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
        this.screenTextureTarget.dispose();
    }
}
