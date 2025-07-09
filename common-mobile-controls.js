export function setupMobileControls(THREE, controls, move) {

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Update instructions based on device type
    const infoDiv = document.getElementById('info');
    if (isTouchDevice) {
        if (infoDiv) {
            infoDiv.innerHTML = '3D Mall<br/>Touch to Start<br/>Use left stick to move, swipe right side to look.';
        }
        if (controls) {
            controls.addEventListener('unlock', function () {
                if (infoDiv) {
                    infoDiv.innerHTML = 'Paused - Touch to Resume<br/>Use left stick to move, swipe right side to look.';
                }
            });
        }
    } else {
         if (infoDiv) {
            infoDiv.innerHTML = "3D Mall<br/>Click to Start<br/>Use mouse to look, W/A/S/D to move.";
        }
        if (controls) {
            controls.addEventListener('unlock', function () {
                if (infoDiv) {
                    infoDiv.innerHTML = 'Paused - Click to Resume<br/>Use mouse to look, W/A/S/D to move.';
                }
            });
        }
    }


    if (!isTouchDevice) {
        // Setup keyboard controls for desktop
        const onKeyDown = function (event) {
            switch (event.code) {
                case 'ArrowUp': case 'KeyW': move.forward = true; break;
                case 'ArrowLeft': case 'KeyA': move.left = true; break;
                case 'ArrowDown': case 'KeyS': move.backward = true; break;
                case 'ArrowRight': case 'KeyD': move.right = true; break;
            }
        };
        const onKeyUp = function (event) {
            switch (event.code) {
                case 'ArrowUp': case 'KeyW': move.forward = false; break;
                case 'ArrowLeft': case 'KeyA': move.left = false; break;
                case 'ArrowDown': case 'KeyS': move.backward = false; break;
                case 'ArrowRight': case 'KeyD': move.right = false; break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        return;
    }

    // --- It's a touch device, proceed with mobile setup ---

    // ADD VIRTUAL JOYSTICK AND CSS
    const joystickSize = 150;
    const stickSize = 70;

    const style = document.createElement('style');
    style.innerHTML = `
        #joystick-container {
            position: fixed;
            bottom: 30px;
            left: 30px;
            width: ${joystickSize}px;
            height: ${joystickSize}px;
            background: rgba(128, 128, 128, 0.3);
            border-radius: 50%;
            display: none;
            z-index: 1001;
            user-select: none;
        }
        #joystick-stick {
            position: absolute;
            top: ${joystickSize / 2 - stickSize / 2}px;
            left: ${joystickSize / 2 - stickSize / 2}px;
            width: ${stickSize}px;
            height: ${stickSize}px;
            background: rgba(200, 200, 200, 0.5);
            border-radius: 50%;
        }
        #look-area {
            position: fixed;
            top: 0;
            right: 0;
            width: 50vw;
            height: 100vh;
            z-index: 1000;
            display: none;
            user-select: none;
        }
    `;
    document.head.appendChild(style);

    const joystickContainer = document.createElement('div');
    joystickContainer.id = 'joystick-container';
    const joystickStick = document.createElement('div');
    joystickStick.id = 'joystick-stick';
    joystickContainer.appendChild(joystickStick);

    const lookArea = document.createElement('div');
    lookArea.id = 'look-area';

    document.body.appendChild(joystickContainer);
    document.body.appendChild(lookArea);

    // JOYSTICK LOGIC
    function handleJoystickMove(event) {
        event.preventDefault();
        const touch = event.touches[0];
        const rect = joystickContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = touch.clientX - centerX;
        const deltaY = touch.clientY - centerY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX);

        const maxDist = joystickSize / 2;
        const stickX = Math.min(maxDist, distance) * Math.cos(angle);
        const stickY = Math.min(maxDist, distance) * Math.sin(angle);

        joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;

        const deadZone = 0.1;
        const normalizedX = deltaX / maxDist;
        const normalizedY = deltaY / maxDist;

        move.forward = normalizedY < -deadZone;
        move.backward = normalizedY > deadZone;
        move.left = normalizedX < -deadZone;
        move.right = normalizedX > deadZone;
    }

    function resetJoystick() {
        joystickStick.style.transform = 'translate(0, 0)';
        move.forward = false;
        move.backward = false;
        move.left = false;
        move.right = false;
    }

    joystickContainer.addEventListener('touchstart', handleJoystickMove, { passive: false });
    joystickContainer.addEventListener('touchmove', handleJoystickMove, { passive: false });
    joystickContainer.addEventListener('touchend', resetJoystick, { passive: false });

    // LOOK (SWIPE) LOGIC
    let lookStartX = 0;
    let lookStartY = 0;
    let isLooking = false;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    lookArea.addEventListener('touchstart', (e) => {
        if (controls.isLocked) {
            e.preventDefault();
            const touch = e.touches[0];
            lookStartX = touch.clientX;
            lookStartY = touch.clientY;
            isLooking = true;
        }
    }, { passive: false });

    lookArea.addEventListener('touchmove', (e) => {
        if (controls.isLocked && isLooking) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - lookStartX;
            const deltaY = touch.clientY - lookStartY;

            euler.setFromQuaternion(controls.getObject().quaternion);
            euler.y -= deltaX * 0.002;
            euler.x -= deltaY * 0.002;
            const minPolarAngle = 0;
            const maxPolarAngle = Math.PI;
            euler.x = Math.max(Math.PI / 2 - maxPolarAngle, Math.min(Math.PI / 2 - minPolarAngle, euler.x));
            controls.getObject().quaternion.setFromEuler(euler);

            lookStartX = touch.clientX;
            lookStartY = touch.clientY;
        }
    }, { passive: false });

    lookArea.addEventListener('touchend', () => { isLooking = false; });

    // SHOW/HIDE CONTROLS
    if (controls) {
        controls.addEventListener('lock', () => {
            joystickContainer.style.display = 'block';
            lookArea.style.display = 'block';
        });
        controls.addEventListener('unlock', () => {
            joystickContainer.style.display = 'none';
            lookArea.style.display = 'none';
            resetJoystick();
        });
    }
}