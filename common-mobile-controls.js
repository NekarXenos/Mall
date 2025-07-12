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

    // --- It's a touch device, proceed with mobile setup ---
    const reticule = document.getElementById('reticule');
    if (!reticule) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;

    reticule.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (controls.isLocked) {
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            isDragging = false;
            // Set a timeout to distinguish a tap from a drag
            setTimeout(() => {
                if (!isDragging) {
                    move.forward = true;
                }
            }, 150);
        }
    }, { passive: false });

    reticule.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (controls.isLocked) {
            isDragging = true;
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            // Normalize the drag vector
            const dragVector = new THREE.Vector2(deltaX, deltaY);
            dragVector.normalize();

            // Move based on the drag direction
            if (dragVector.y < -0.5) move.forward = true; else move.forward = false;
            if (dragVector.y > 0.5) move.backward = true; else move.backward = false;
            if (dragVector.x < -0.5) move.left = true; else move.left = false;
            if (dragVector.x > 0.5) move.right = true; else move.right = false;
        }
    }, { passive: false });

    reticule.addEventListener('touchend', (e) => {
        e.preventDefault();
        move.forward = false;
        move.backward = false;
        move.left = false;
        move.right = false;
        isDragging = false;
    }, { passive: false });

    // Since the reticule is now the control, we need to handle looking around differently.
    // A common approach is to use the rest of the screen for looking.
    const lookArea = document.createElement('div');
    lookArea.style.position = 'fixed';
    lookArea.style.top = '0';
    lookArea.style.left = '0';
    lookArea.style.width = '100vw';
    lookArea.style.height = '100vh';
    lookArea.style.zIndex = '999'; // Behind the reticule
    document.body.appendChild(lookArea);

    let lookStartX = 0;
    let lookStartY = 0;
    let isLooking = false;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    lookArea.addEventListener('touchstart', (e) => {
        if (controls.isLocked) {
            // Ignore touches on the reticule
            if (e.target === reticule) return;
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

    lookArea.addEventListener('touchend', () => {
        isLooking = false;
    });
}