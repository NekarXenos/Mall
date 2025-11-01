/**
 * Input System Module
 * Handles keyboard events, mouse controls, and input state management
 */

export class InputManager {
    constructor() {
        this.keys = {};
        this.keyDownHandlers = [];
        this.keyUpHandlers = [];
        this.mouseMoveHandlers = [];
        this.wheelHandlers = [];
        
        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        
        // Bind event listeners
        this.setupEventListeners();
    }
    
    /**
     * Setup global keyboard and mouse event listeners
     */
    setupEventListeners() {
        window.addEventListener('keydown', (event) => this.handleKeyDown(event));
        window.addEventListener('keyup', (event) => this.handleKeyUp(event));
        window.addEventListener('mousemove', (event) => this.handleMouseMove(event));
        window.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
        document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());
    }
    
    /**
     * Handle keydown event
     * @param {KeyboardEvent} event
     */
    handleKeyDown(event) {
        let key = event.key.toUpperCase();
        
        // Normalize space key to 'SPACE' for consistency
        if (key === ' ') key = 'SPACE';
        
        this.keys[key] = true;
        
        // Update modifier keys
        if (event.shiftKey) this.keys['SHIFT'] = true;
        if (event.ctrlKey) this.keys['CTRL'] = true;
        if (event.altKey) this.keys['ALT'] = true;
        
        // Call registered handlers
        this.keyDownHandlers.forEach(handler => {
            try {
                handler(key, event, this.keys);
            } catch (error) {
                console.error('Error in keydown handler:', error);
            }
        });
    }
    
    /**
     * Handle keyup event
     * @param {KeyboardEvent} event
     */
    handleKeyUp(event) {
        let key = event.key.toUpperCase();
        
        // Normalize space key to 'SPACE' for consistency
        if (key === ' ') key = 'SPACE';
        
        this.keys[key] = false;
        
        // Update modifier keys
        if (!event.shiftKey) this.keys['SHIFT'] = false;
        if (!event.ctrlKey) this.keys['CTRL'] = false;
        if (!event.altKey) this.keys['ALT'] = false;
        
        // Call registered handlers
        this.keyUpHandlers.forEach(handler => {
            try {
                handler(key, event, this.keys);
            } catch (error) {
                console.error('Error in keyup handler:', error);
            }
        });
    }
    
    /**
     * Handle mouse move event
     * @param {MouseEvent} event
     */
    handleMouseMove(event) {
        this.mouseX = event.movementX || 0;
        this.mouseY = event.movementY || 0;
        
        // Call registered handlers
        this.mouseMoveHandlers.forEach(handler => {
            try {
                handler(this.mouseX, this.mouseY, event);
            } catch (error) {
                console.error('Error in mousemove handler:', error);
            }
        });
    }
    
    /**
     * Handle mouse wheel event
     * @param {WheelEvent} event
     */
    handleWheel(event) {
        const delta = Math.sign(event.deltaY) * -1;
        
        // Call registered handlers
        this.wheelHandlers.forEach(handler => {
            try {
                handler(delta, event);
            } catch (error) {
                console.error('Error in wheel handler:', error);
            }
        });
    }
    
    /**
     * Handle pointer lock change
     */
    handlePointerLockChange() {
        const isLocked = document.pointerLockElement !== null;
        // Notify any registered handlers if needed
    }
    
    /**
     * Register a keydown handler
     * @param {Function} handler - Callback(key, event, keys)
     */
    onKeyDown(handler) {
        this.keyDownHandlers.push(handler);
    }
    
    /**
     * Register a keyup handler
     * @param {Function} handler - Callback(key, event, keys)
     */
    onKeyUp(handler) {
        this.keyUpHandlers.push(handler);
    }
    
    /**
     * Register a mouse move handler
     * @param {Function} handler - Callback(mouseX, mouseY, event)
     */
    onMouseMove(handler) {
        this.mouseMoveHandlers.push(handler);
    }
    
    /**
     * Register a mouse wheel handler
     * @param {Function} handler - Callback(delta, event)
     */
    onWheel(handler) {
        this.wheelHandlers.push(handler);
    }
    
    /**
     * Check if a key is currently pressed
     * @param {string} key - Key to check (uppercase)
     * @returns {boolean}
     */
    isKeyPressed(key) {
        return this.keys[key.toUpperCase()] === true;
    }
    
    /**
     * Check if any of the given keys are pressed
     * @param {...string} keys - Keys to check
     * @returns {boolean}
     */
    isAnyKeyPressed(...keys) {
        return keys.some(key => this.isKeyPressed(key));
    }
    
    /**
     * Check if all of the given keys are pressed
     * @param {...string} keys - Keys to check
     * @returns {boolean}
     */
    areAllKeysPressed(...keys) {
        return keys.every(key => this.isKeyPressed(key));
    }
    
    /**
     * Get all currently pressed keys
     * @returns {Array<string>}
     */
    getPressedKeys() {
        return Object.keys(this.keys).filter(key => this.keys[key]);
    }
    
    /**
     * Clear all key states
     */
    clearKeys() {
        Object.keys(this.keys).forEach(key => {
            this.keys[key] = false;
        });
    }
    
    /**
     * Request pointer lock
     */
    requestPointerLock() {
        document.body.requestPointerLock();
    }
    
    /**
     * Exit pointer lock
     */
    exitPointerLock() {
        document.exitPointerLock();
    }
    
    /**
     * Check if pointer is locked
     * @returns {boolean}
     */
    isPointerLocked() {
        return document.pointerLockElement === document.body;
    }
    
    /**
     * Dispose and remove event listeners
     */
    dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('wheel', this.handleWheel);
    }
}

/**
 * Input action mapping helper
 * Maps named actions to key combinations
 */
export class InputActions {
    constructor(inputManager) {
        this.inputManager = inputManager;
        this.actions = new Map();
    }
    
    /**
     * Define an action with key bindings
     * @param {string} name - Action name
     * @param {string|Array<string>} keys - Key or keys that trigger this action
     * @param {Function} handler - Callback when action is triggered
     */
    define(name, keys, handler = null) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        this.actions.set(name, {
            keys: keyArray.map(k => k.toUpperCase()),
            handler: handler
        });
    }
    
    /**
     * Check if an action is currently active (keys pressed)
     * @param {string} name - Action name
     * @returns {boolean}
     */
    isActive(name) {
        const action = this.actions.get(name);
        if (!action) return false;
        
        // Check if any of the mapped keys are pressed
        return action.keys.some(key => 
            this.inputManager.isKeyPressed(key)
        );
    }
    
    /**
     * Get all active actions
     * @returns {Array<string>}
     */
    getActiveActions() {
        const active = [];
        this.actions.forEach((action, name) => {
            if (this.isActive(name)) {
                active.push(name);
            }
        });
        return active;
    }
    
    /**
     * Execute handler for an action if it's active
     * @param {string} name - Action name
     * @param {...any} args - Arguments to pass to handler
     * @returns {boolean} True if action was executed
     */
    execute(name, ...args) {
        const action = this.actions.get(name);
        if (!action || !action.handler) return false;
        
        if (this.isActive(name)) {
            action.handler(...args);
            return true;
        }
        return false;
    }
    
    /**
     * Remove an action
     * @param {string} name
     */
    remove(name) {
        this.actions.delete(name);
    }
    
    /**
     * Clear all actions
     */
    clear() {
        this.actions.clear();
    }
}

/**
 * Common input presets for standard game controls
 */
export const InputPresets = {
    /**
     * Standard WASD movement keys
     */
    MOVEMENT: {
        FORWARD: 'W',
        BACKWARD: 'S',
        LEFT: 'A',
        RIGHT: 'D',
        UP: 'SPACE',
        DOWN: 'CTRL'
    },
    
    /**
     * Standard rotation keys
     */
    ROTATION: {
        ROTATE_LEFT: 'Q',
        ROTATE_RIGHT: 'E'
    },
    
    /**
     * Camera controls
     */
    CAMERA: {
        CYCLE_MODE: 'V',
        ZOOM: 'Z'
    },
    
    /**
     * Modifier keys
     */
    MODIFIERS: {
        SHIFT: 'SHIFT',
        CTRL: 'CTRL',
        ALT: 'ALT'
    }
};
