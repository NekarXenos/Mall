/**
 * UI System Module
 * Handles info text updates, status messages, and UI management
 */

/**
 * UI Manager Class
 * Centralizes all UI text updates and formatting
 */
export class UIManager {
    constructor(infoElement) {
        this.infoElement = infoElement;
        this.baseText = '';
        this.debugText = '';
    }
    
    /**
     * Set loading message
     * @param {string} message - Loading message
     */
    setLoading(message = 'Loading...') {
        this.infoElement.textContent = message;
    }
    
    /**
     * Update character mode info text
     * @param {Object} state - Character state object
     */
    updateCharacterInfo(state) {
        const {
            modeStr = 'NORMAL',
            bodyName = 'Unknown',
            zoomName = '',
            zoomPercent = 100,
            jetpackEnabled = false,
            showZoomPercent = false,
            cameraMode = 'free'
        } = state;
        
        const jetpackText = jetpackEnabled ? 'SPACE/CTRL jetpack' : 'SPACE jump';
        const zoomText = showZoomPercent ? 
            `Zoom: ${zoomName} ${zoomPercent}%` : 
            `Zoom: ${zoomName}`;
        
        if (cameraMode === 'free') {
            this.infoElement.textContent = 
                `${modeStr} | ${bodyName} | ${zoomText} (WASD/QE, ${jetpackText}, G toggle, F-Rocket, M/L, V, Z)`;
        } else {
            this.infoElement.textContent = 
                `${modeStr} | ${bodyName} (WASD/QE, ${jetpackText}, G toggle, F-Rocket, M/L, V)`;
        }
        
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update rocket landed info text
     */
    updateRocketLanded() {
        this.infoElement.textContent = 
            `Rocket landed! (W to take off, R to EXPLODE planet/moon, F to switch to character)`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update rocket flying info text
     */
    updateRocketFlying() {
        this.infoElement.textContent = 
            `Flying Rocket! (W thrust, Shift boost, A/D turn (yaw), Q/E strafe, X brake, Shift+X sync orbit, O toggle tractor beam, Z zoom, F switch to character)`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update rocket launch assist info text
     * @param {Object} state - Launch assist state
     */
    updateLaunchAssist(state) {
        const {
            bodyName,
            distanceToSurface,
            radialSpeed,
            targetRadialSpeed
        } = state;
        
        this.infoElement.textContent = 
            `LAUNCH ASSIST - ${bodyName} | Surface: ${distanceToSurface.toFixed(1)}m | Radial speed: ${radialSpeed.toFixed(1)}m/s (target ${targetRadialSpeed.toFixed(0)})`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update tractor beam info text
     * @param {Object} state - Tractor beam state
     */
    updateTractorBeam(state) {
        const {
            mode,
            targetName,
            surfaceDistance,
            speed
        } = state;
        
        this.infoElement.textContent = 
            `TRACTOR BEAM ${mode} - Target: ${targetName} | Surface Distance: ${surfaceDistance.toFixed(1)}m | Speed: ${speed.toFixed(1)}m/s | Press O to cancel`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update rocket auto-landed info text
     * @param {string} bodyName - Name of body landed on
     */
    updateRocketAutoLanded(bodyName) {
        this.infoElement.textContent = 
            `Landed in rocket on ${bodyName}. Press F to switch to character. (W thrust, A/D yaw, Q/E strafe, X brake)`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update explosion message
     * @param {string} bodyName - Name of exploded body
     */
    updateExplosion(bodyName) {
        this.infoElement.textContent = 
            `${bodyName} DESTROYED! Only the black hole core remains. (Rocket auto-escaped)`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Update quest complete message
     */
    updateQuestComplete() {
        this.infoElement.textContent = 
            `QUEST COMPLETE! System collapsing into black hole...`;
        this.baseText = this.infoElement.textContent;
    }
    
    /**
     * Add debug info to display
     * @param {Object} debugInfo - Debug information object
     */
    addDebugInfo(debugInfo) {
        const { yaw, speed } = debugInfo;
        const yawDeg = (yaw * 180 / Math.PI).toFixed(1);
        const speedStr = speed.toFixed(2);
        
        this.debugText = `\nYaw: ${yawDeg}°  Speed: ${speedStr}`;
        this.infoElement.textContent = `${this.baseText}${this.debugText}`;
    }
    
    /**
     * Clear debug info
     */
    clearDebugInfo() {
        this.debugText = '';
        this.infoElement.textContent = this.baseText;
    }
    
    /**
     * Set custom message
     * @param {string} message - Custom message to display
     */
    setMessage(message) {
        this.infoElement.textContent = message;
        this.baseText = message;
    }
    
    /**
     * Append line to current message
     * @param {string} line - Line to append
     */
    appendLine(line) {
        this.infoElement.textContent += `\n${line}`;
    }
    
    /**
     * Get current text
     * @returns {string}
     */
    getText() {
        return this.infoElement.textContent;
    }
    
    /**
     * Get base text (without debug info)
     * @returns {string}
     */
    getBaseText() {
        return this.baseText;
    }
}

/**
 * Message Queue System
 * For showing temporary messages that fade away
 */
export class MessageQueue {
    constructor(containerElement) {
        this.container = containerElement;
        this.messages = [];
        this.nextId = 0;
    }
    
    /**
     * Add a temporary message
     * @param {string} text - Message text
     * @param {number} duration - Duration in milliseconds
     * @param {string} type - Message type ('info', 'warning', 'error', 'success')
     */
    addMessage(text, duration = 3000, type = 'info') {
        const id = this.nextId++;
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = text;
        messageEl.style.cssText = `
            position: absolute;
            top: ${60 + this.messages.length * 40}px;
            left: 10px;
            padding: 10px 15px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border-left: 3px solid ${this.getTypeColor(type)};
            font-family: monospace;
            font-size: 14px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        
        this.container.appendChild(messageEl);
        
        const message = { id, element: messageEl, timestamp: Date.now() };
        this.messages.push(message);
        
        // Auto-remove after duration
        setTimeout(() => {
            this.removeMessage(id);
        }, duration);
    }
    
    /**
     * Remove a message
     * @param {number} id - Message ID
     */
    removeMessage(id) {
        const index = this.messages.findIndex(m => m.id === id);
        if (index !== -1) {
            const message = this.messages[index];
            message.element.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (message.element.parentNode) {
                    message.element.parentNode.removeChild(message.element);
                }
            }, 300);
            this.messages.splice(index, 1);
            
            // Reposition remaining messages
            this.repositionMessages();
        }
    }
    
    /**
     * Reposition all messages
     */
    repositionMessages() {
        this.messages.forEach((message, index) => {
            message.element.style.top = `${60 + index * 40}px`;
        });
    }
    
    /**
     * Get color for message type
     * @param {string} type - Message type
     * @returns {string} CSS color
     */
    getTypeColor(type) {
        const colors = {
            info: '#00aaff',
            warning: '#ffaa00',
            error: '#ff3333',
            success: '#00ff88'
        };
        return colors[type] || colors.info;
    }
    
    /**
     * Clear all messages
     */
    clear() {
        this.messages.forEach(message => {
            if (message.element.parentNode) {
                message.element.parentNode.removeChild(message.element);
            }
        });
        this.messages = [];
    }
}

/**
 * Helper function to format large numbers
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
}

/**
 * Helper function to format distance with units
 * @param {number} distance - Distance in meters
 * @returns {string} Formatted distance string
 */
export function formatDistance(distance) {
    if (distance >= 1000) {
        return (distance / 1000).toFixed(2) + ' km';
    }
    return distance.toFixed(1) + ' m';
}

/**
 * Helper function to format velocity with units
 * @param {number} velocity - Velocity in m/s
 * @returns {string} Formatted velocity string
 */
export function formatVelocity(velocity) {
    return velocity.toFixed(1) + ' m/s';
}

/**
 * Helper function to format angle in degrees
 * @param {number} radians - Angle in radians
 * @returns {string} Formatted angle string
 */
export function formatAngle(radians) {
    const degrees = (radians * 180 / Math.PI) % 360;
    return degrees.toFixed(1) + '°';
}
