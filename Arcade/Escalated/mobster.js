import * as THREE from 'three';

/**
 * A class to represent a low-poly mobster character.
 * It handles its own creation, animation, and state (walking, standing, aiming).
 * The main game loop should call the `update` method on each frame.
 */
export class Mobster {
    /**
     * @param {THREE.Scene} scene The scene to add the character to.
     * @param {THREE.Vector3} initialPosition The initial position of the character.
     * @param {number} floorIndex The floor index the mobster is on.
     */
    constructor(scene, initialPosition = new THREE.Vector3(0, 0, 0), floorIndex = 0) {
        this.scene = scene;
        this.clock = new THREE.Clock();
        this.lastShotTime = 0;
        this.floorIndex = floorIndex;

        // --- Animation parameters ---
        this.animationTime = 0;
        this.walkSpeed = 0.4;
        this.limbAnimationSpeedFactor = 8;
        this.armSwingAmplitude = Math.PI / 8;
        this.legSwingAmplitude = Math.PI / 6;
        this.forearmBendAmplitude = Math.PI / 7;
        this.calfBendAmplitude = Math.PI / 6;

        // --- State ---
        this.characterState = 'standing'; // 'standing', 'walking', 'aiming'
        this.aimTarget = new THREE.Vector3();
        this.aimStartTime = 0;
        this.aimTransitionDuration = 0.75;
        this.startAimRotations = {};
        this.initialRotations = {};

        // --- THREE.js objects ---
        this.characterGroup = null;
        this.gunGroup = null;
        this.leftArm = null;
        this.rightArm = null;
        this.leftForeArm = null;
        this.rightForeArm = null;
        this.leftLeg = null;
        this.rightLeg = null;
        this.leftCalf = null;
        this.rightCalf = null;

        this.health = 100; // Add health property

        this._createCharacter();
        this.characterGroup.position.copy(initialPosition);
        this.scene.add(this.characterGroup);
    }

    /**
     * Creates the character's geometry, materials, and meshes.
     * @private
     */
    _createCharacter() {
        this.characterGroup = new THREE.Group();

        // Materials
        const coatMaterial = new THREE.MeshStandardMaterial({ color: 0x212121, flatShading: true });
        const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xFAD49B, flatShading: true });
        const fedoraMaterial = new THREE.MeshStandardMaterial({ color: 0x3A3A3A, flatShading: true });
        const fedBandMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true });
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x4A4A4A, flatShading: true });
        const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, flatShading: true, side: THREE.DoubleSide });

        // Body
        const bodyGeometry = new THREE.BoxGeometry(2.5, 6, 1.7);
        const body = new THREE.Mesh(bodyGeometry, coatMaterial);
        body.position.set(0, -2, -0.5);
        this.characterGroup.add(body);

        // Head
        const headGeometry = new THREE.DodecahedronGeometry(1.2, 0);
        const head = new THREE.Mesh(headGeometry, skinMaterial);
        head.rotation.x = -0.2;
        head.position.y = 1.2;
        this.characterGroup.add(head);

        const hairGeometry = new THREE.BoxGeometry(1.8, 1.5, 1.5);
        const hair = new THREE.Mesh(hairGeometry, coatMaterial);
        hair.position.set(0, 1.2, -0.5);
        this.characterGroup.add(hair);

        // Sunglasses
        const shadesGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
        shadesGeometry.scale(0.5, 1, 1);
        const shades = new THREE.Mesh(shadesGeometry, shoeMaterial);
        shades.rotation.x = Math.PI / 2;
        shades.rotation.y = Math.PI / 2;
        shades.position.set(0, 1.5, 0.5);
        this.characterGroup.add(shades);

        // Fedora
        const fedoraTop1Geometry = new THREE.SphereGeometry(1, 6, 4);
        fedoraTop1Geometry.scale(0.7, 1, 1);
        const fedoraTop1 = new THREE.Mesh(fedoraTop1Geometry, fedoraMaterial);
        fedoraTop1.position.set(0.3, 2.1, 0);
        this.characterGroup.add(fedoraTop1);

        const fedoraTop2Geometry = new THREE.SphereGeometry(1, 6, 4);
        fedoraTop2Geometry.scale(0.7, 1, 1);
        const fedoraTop2 = new THREE.Mesh(fedoraTop2Geometry, fedoraMaterial);
        fedoraTop2.position.set(-0.3, 2.1, 0);
        this.characterGroup.add(fedoraTop2);

        const fedoraBrimGeometry = new THREE.TorusGeometry(1.3, 0.5, 3, 6);
        fedoraBrimGeometry.scale(1, 1, 0.5);
        const fedoraBrim = new THREE.Mesh(fedoraBrimGeometry, fedoraMaterial);
        fedoraBrim.rotation.set(Math.PI / 2 + 0.1, 0, Math.PI / 2);
        fedoraBrim.position.y = 1.8;
        this.characterGroup.add(fedoraBrim);

        const fedoraBandGeometry = new THREE.TorusGeometry(1, 0.2, 4, 6);
        fedoraBandGeometry.scale(1, 1, 1.5);
        const fedoraBand = new THREE.Mesh(fedoraBandGeometry, fedBandMaterial);
        fedoraBand.rotation.x = Math.PI / 2 + 0.1;
        fedoraBand.position.y = 2;
        this.characterGroup.add(fedoraBand);

        // Limbs
        const upperArmGeometry = new THREE.CylinderGeometry(0.5, 0.45, 1.5, 6);
        upperArmGeometry.translate(0, -0.75, 0);
        const lowerArmGeometry = new THREE.CylinderGeometry(0.45, 0.4, 1.5, 6);
        lowerArmGeometry.translate(0, -0.75, 0);
        const upperLegGeometry = new THREE.CylinderGeometry(0.8, 0.6, 2, 6);
        upperLegGeometry.translate(0, -1, 0);
        const lowerLegGeometry = new THREE.CylinderGeometry(0.6, 0.4, 2, 6);
        lowerLegGeometry.translate(0, -1, 0);
        const handGeometry = new THREE.DodecahedronGeometry(0.6, 0);
        const footGeometry = new THREE.TetrahedronGeometry(1, 0);
        footGeometry.scale(1, 0.6, 1.5);

        // Left Arm
        this.leftArm = new THREE.Mesh(upperArmGeometry, coatMaterial);
        this.leftArm.position.set(-1.5, 0, 0);
        this.characterGroup.add(this.leftArm);
        this.leftForeArm = new THREE.Mesh(lowerArmGeometry, coatMaterial);
        this.leftForeArm.position.y = -1.5;
        this.leftArm.add(this.leftForeArm);
        const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
        leftHand.position.y = -1.5;
        this.leftForeArm.add(leftHand);

        // Right Arm
        this.rightArm = new THREE.Mesh(upperArmGeometry, coatMaterial);
        this.rightArm.position.set(1.5, 0, 0);
        this.characterGroup.add(this.rightArm);
        this.rightForeArm = new THREE.Mesh(lowerArmGeometry, coatMaterial);
        this.rightForeArm.position.y = -1.5;
        this.rightArm.add(this.rightForeArm);
        const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
        rightHand.position.y = -1.5;
        this.rightForeArm.add(rightHand);

        // Left Leg
        this.leftLeg = new THREE.Mesh(upperLegGeometry, coatMaterial);
        this.leftLeg.position.set(-0.8, -3, -0.2);
        this.characterGroup.add(this.leftLeg);
        this.leftCalf = new THREE.Mesh(lowerLegGeometry, coatMaterial);
        this.leftCalf.position.y = -2;
        this.leftLeg.add(this.leftCalf);
        const leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
        leftFoot.position.set(0, -2, 0.3);
        leftFoot.rotation.x = -Math.PI / 8;
        this.leftCalf.add(leftFoot);

        // Right Leg
        this.rightLeg = new THREE.Mesh(upperLegGeometry, coatMaterial);
        this.rightLeg.position.set(0.8, -3, -0.2);
        this.characterGroup.add(this.rightLeg);
        this.rightCalf = new THREE.Mesh(lowerLegGeometry, coatMaterial);
        this.rightCalf.position.y = -2;
        this.rightLeg.add(this.rightCalf);
        const rightFootGeometry = footGeometry.clone();
        rightFootGeometry.scale(-1, 1, 1);
        const rightFoot = new THREE.Mesh(rightFootGeometry, shoeMaterial);
        rightFoot.position.set(0, -2, 0.3);
        rightFoot.rotation.x = -Math.PI / 8;
        this.rightCalf.add(rightFoot);

        // Initial pose
        this.leftArm.rotation.x = Math.PI * 0.05;
        this.leftForeArm.rotation.x = -Math.PI * 0.05;
        this.rightArm.rotation.x = Math.PI * 0.05;
        this.rightForeArm.rotation.x = -Math.PI * 0.05;
        this.leftLeg.rotation.x = -Math.PI * 0.1;
        this.leftCalf.rotation.x = Math.PI * 0.05;
        this.rightLeg.rotation.x = -Math.PI * 0.1;
        this.rightCalf.rotation.x = Math.PI * 0.05;

        // Tommy Gun
        this.gunGroup = new THREE.Group();
        this.leftForeArm.add(this.gunGroup);
        this.gunGroup.position.set(0, -1.5, 0.5);
        this.gunGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 12);

        const barrelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 2.5, 6);
        const barrel = new THREE.Mesh(barrelGeometry, gunMaterial);
        barrel.rotation.z = Math.PI / 2;
        barrel.rotation.y = Math.PI / 2;
        barrel.position.set(0.5, 0, 0.5);
        this.gunGroup.add(barrel);

        const magazineGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
        const magazine = new THREE.Mesh(magazineGeometry, gunMaterial);
        magazine.rotation.x = Math.PI / 2;
        magazine.position.set(0.5, -0.5, 0.2);
        this.gunGroup.add(magazine);

        const stockGeometry = new THREE.BoxGeometry(0.5, 0.7, 2);
        const stock = new THREE.Mesh(stockGeometry, gunMaterial);
        stock.position.set(0.5, -0.2, -0.5);
        this.gunGroup.add(stock);

        const handleGeometry = new THREE.BoxGeometry(0.3, 1, 0.5);
        const handle = new THREE.Mesh(handleGeometry, gunMaterial);
        handle.position.set(0.5, -0.5, 0);
        this.gunGroup.add(handle);

        const handle2 = new THREE.Mesh(handleGeometry, gunMaterial);
        handle2.position.set(0.5, -0.5, 1);
        this.gunGroup.add(handle2);

        // Scaling & Positioning
        const currentHeight = 10.7;
        const desiredHeight = 1.7;
        const scaleFactor = desiredHeight / currentHeight;
        this.characterGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
        

        this.characterGroup.traverse(object => {
            if (object.isMesh) {
                object.castShadow = true;
            }
        });

        // Store initial rotations for animations
        this.initialRotations = {
            leftArm: this.leftArm.rotation.clone(),
            leftForeArm: this.leftForeArm.rotation.clone(),
            rightArm: this.rightArm.rotation.clone(),
            rightForeArm: this.rightForeArm.rotation.clone(),
            leftLeg: this.leftLeg.rotation.clone(),
            leftCalf: this.leftCalf.rotation.clone(),
            rightLeg: this.rightLeg.rotation.clone(),
            rightCalf: this.rightCalf.rotation.clone(),
        };
    }

    /**
     * Call this method in your main animation loop.
     * @param {number} deltaTime Time since last frame.
     */
    update(deltaTime) {
        const elapsedTime = this.clock.getElapsedTime();

        switch (this.characterState) {
            case 'walking':
                this.animationTime += deltaTime * this.walkSpeed;
                this._animateWalking();
                break;
            case 'standing':
                this._animateStanding();
                break;
            case 'aiming':
                this._animateAiming(elapsedTime);
                break;
        }
    }

    // --- Public Methods to Control State ---

    /** Sets the character's state to 'walking'. */
    walk() {
        if (this.characterState !== 'walking') {
            this.characterState = 'walking';
        }
    }

    /** Sets the character's state to 'standing'. */
    stand() {
        if (this.characterState !== 'standing') {
            this.characterState = 'standing';
        }
    }

    /**
     * Sets the character's state to 'aiming'. The character will turn to face the target.
     * @param {THREE.Vector3} targetPoint The point in world space to aim at.
     */
    aimAt(targetPoint) {
        if (this.characterState !== 'aiming') {
            this.characterState = 'aiming';
            this.aimStartTime = this.clock.getElapsedTime();
            
            // Store current rotations for smooth transition
            this.startAimRotations = {
                leftArm: this.leftArm.rotation.clone(),
                rightArm: this.rightArm.rotation.clone(),
                leftForeArm: this.leftForeArm.rotation.clone(),
                rightForeArm: this.rightForeArm.rotation.clone(),
                character: this.characterGroup.quaternion.clone(),
            };
        }
        this.aimTarget.copy(targetPoint);
    }

    /** Fires the gun, creating a muzzle flash. Only works if aiming. */
    shoot() {
        if (this.characterState === 'aiming') {
            this._createMuzzleFlash();
        }
    }

    // --- Private Animation Methods ---

    _animateWalking() {
        const limbCycleTime = this.animationTime * this.limbAnimationSpeedFactor;
        const mainSwingAngle = Math.sin(limbCycleTime);
        const secondaryBendAngle = Math.sin(limbCycleTime - Math.PI / 3);

        this.leftArm.rotation.x = this.initialRotations.leftArm.x + mainSwingAngle * this.armSwingAmplitude;
        this.leftForeArm.rotation.x = this.initialRotations.leftForeArm.x + secondaryBendAngle * this.forearmBendAmplitude;
        this.rightArm.rotation.x = this.initialRotations.rightArm.x - mainSwingAngle * this.armSwingAmplitude;
        this.rightForeArm.rotation.x = this.initialRotations.rightForeArm.x - secondaryBendAngle * this.forearmBendAmplitude;

        const legSwingCenter = 0.1;
        this.leftLeg.rotation.x = legSwingCenter - mainSwingAngle * this.legSwingAmplitude;
        this.leftCalf.rotation.x = this.initialRotations.leftCalf.x + secondaryBendAngle * this.calfBendAmplitude;
        this.rightLeg.rotation.x = legSwingCenter + mainSwingAngle * this.legSwingAmplitude;
        this.rightCalf.rotation.x = this.initialRotations.rightCalf.x - secondaryBendAngle * this.calfBendAmplitude;
    }

    _animateStanding() {
        // Smoothly transition back to initial pose
        const lerpFactor = 0.1;
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, this.initialRotations.leftArm.x, lerpFactor);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, this.initialRotations.rightArm.x, lerpFactor);
        this.leftForeArm.rotation.x = THREE.MathUtils.lerp(this.leftForeArm.rotation.x, this.initialRotations.leftForeArm.x, lerpFactor);
        this.rightForeArm.rotation.x = THREE.MathUtils.lerp(this.rightForeArm.rotation.x, this.initialRotations.rightForeArm.x, lerpFactor);
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, this.initialRotations.leftLeg.x, lerpFactor);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, this.initialRotations.rightLeg.x, lerpFactor);
        this.leftCalf.rotation.x = THREE.MathUtils.lerp(this.leftCalf.rotation.x, this.initialRotations.leftCalf.x, lerpFactor);
        this.rightCalf.rotation.x = THREE.MathUtils.lerp(this.rightCalf.rotation.x, this.initialRotations.rightCalf.x, lerpFactor);
    }

    _animateAiming(elapsedTime) {
        const aimProgress = Math.min((elapsedTime - this.aimStartTime) / this.aimTransitionDuration, 1);

        const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(this.aimTarget, this.characterGroup.position, this.characterGroup.up)
        );
        THREE.Quaternion.slerp(this.startAimRotations.character, targetQuaternion, this.characterGroup.quaternion, aimProgress);

        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.startAimRotations.leftArm.x, -Math.PI / 2.2, aimProgress);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.startAimRotations.rightArm.x, -Math.PI / 2.2, aimProgress);
        this.leftForeArm.rotation.x = THREE.MathUtils.lerp(this.startAimRotations.leftForeArm.x, 0, aimProgress);
        this.rightForeArm.rotation.x = THREE.MathUtils.lerp(this.startAimRotations.rightForeArm.x, 0, aimProgress);

        this.leftLeg.rotation.x = this.initialRotations.leftLeg.x;
        this.rightLeg.rotation.x = this.initialRotations.rightLeg.x;
        this.leftCalf.rotation.x = this.initialRotations.leftCalf.x;
        this.rightCalf.rotation.x = this.initialRotations.rightCalf.x;
    }

    _createMuzzleFlash() {
        const flash = new THREE.PointLight(0xfff7a1, 10, 5, 2);
        flash.position.set(0.5, 0, 1.75); // Position at barrel tip relative to gunGroup
        this.gunGroup.add(flash);

        setTimeout(() => {
            this.gunGroup.remove(flash);
            flash.dispose();
        }, 80);
    }

    /**
     * Returns the main character group object.
     * @returns {THREE.Group}
     */
        getObject() {
        return this.characterGroup;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.fallAndDisappear();
        }
    }

    fallAndDisappear() {
        // Simple fall animation: rotate the character group
        const rotationSpeed = 0.1; // Adjust as needed
        const targetRotation = new THREE.Euler(0, 0, Math.PI / 2); // Rotate 90 degrees around Z-axis

        const animateFall = () => {
            if (this.characterGroup.rotation.z < targetRotation.z) {
                this.characterGroup.rotation.z += rotationSpeed;
                requestAnimationFrame(animateFall);
            } else {
                // After falling, remove from scene
                this.scene.remove(this.characterGroup);
                this.characterGroup.traverse(object => {
                    if (object.isMesh) {
                        object.geometry.dispose();
                        object.material.dispose();
                    }
                });
            }
        };
        animateFall();
    }
}
