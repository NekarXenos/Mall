/**
 * Adds a 'keydown' event listener to navigate back on a second 'Escape' press.
 * @param {object} controls - The Three.js PointerLockControls instance.
 * @param {string} [homeUrl='../index.html'] - The URL to navigate back to.
 */
export function addEscapeToGoBack(controls, homeUrl = '../index.html') {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && controls && !controls.isLocked) {
            window.location.href = homeUrl;
        }
    });
}