const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSizeSlider = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const bristleCountSlider = document.getElementById('bristleCount');
const bristleCountValue = document.getElementById('bristleCountValue');
const dampingSlider = document.getElementById('damping');
const dampingValue = document.getElementById('dampingValue');
const clearButton = document.getElementById('clearButton');

// --- Configuration for Touch Pressure ---
const MIN_PRESSURE_RADIUS = 5; // Minimum radius (pixels) to map to min pressure
const MAX_PRESSURE_RADIUS = 35; // Maximum radius (pixels) to map to max pressure
const MIN_LINE_WIDTH_FACTOR = 0.1; // Smallest line width relative to base size
const MAX_LINE_WIDTH_FACTOR = 0.4; // Largest line width relative to base size (tune this)
const DEFAULT_PRESSURE = 0.75; // Pressure assumed for mouse or unsupported touch


let isPainting = false;
let brush = {
    x: 0,
    y: 0,
    px: 0, // Previous x
    py: 0, // Previous y
    size: parseInt(brushSizeSlider.value, 10), // Base spread/size
    color: colorPicker.value,
    bristleCount: parseInt(bristleCountSlider.value, 10),
    dampingFactor: parseFloat(dampingSlider.value) / 100, // Make it 0.01 to 0.5
    currentPressure: DEFAULT_PRESSURE, // Normalized pressure (0.0 to 1.0)
    bristles: []
};

// --- Helper Functions ---
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

// Clamp value between min and max
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// Normalize value from a range to 0-1
function normalize(value, min, max) {
    if (max - min === 0) return 0; // Avoid division by zero
    return clamp((value - min) / (max - min), 0, 1);
}


// --- Bristle Class ---
class Bristle {
    constructor(parentX, parentY, offsetAngle, offsetLength) {
        this.angle = offsetAngle;
        this.length = offsetLength;
        this.x = parentX + Math.cos(this.angle) * this.length;
        this.y = parentY + Math.sin(this.angle) * this.length;
        this.px = this.x;
        this.py = this.y;
    }

    update(targetX, targetY, damping) {
        const targetBristleX = targetX + Math.cos(this.angle) * this.length;
        const targetBristleY = targetY + Math.sin(this.angle) * this.length;
        this.px = this.x;
        this.py = this.y;
        this.x = lerp(this.x, targetBristleX, damping);
        this.y = lerp(this.y, targetBristleY, damping);
    }

    // Draw method now accepts pressure and base size
    draw(ctx, color, pressure, baseSize) {
        ctx.beginPath();
        ctx.moveTo(this.px, this.py);
        ctx.lineTo(this.x, this.y);
        ctx.strokeStyle = color; // Keep color simple for now

        // Calculate line width based on pressure and speed
        const minWidth = baseSize * MIN_LINE_WIDTH_FACTOR;
        const maxWidth = baseSize * MAX_LINE_WIDTH_FACTOR;

        // Pressure determines the max possible width for this segment
        const pressureBasedMaxWidth = minWidth + pressure * (maxWidth - minWidth);

        // Speed still modulates the width, but capped by pressureBasedMaxWidth
        const dist = distance(this.px, this.py, this.x, this.y);
        // Normalize speed - adjust divisor (e.g., 15) for sensitivity
        const speedFactor = clamp(dist / 15, 0, 1);

        // Final width: minimum width + speed modulation up to the pressure cap
        // Ensure minimum width is respected, especially at low pressure/speed
        ctx.lineWidth = Math.max(0.5, minWidth + speedFactor * (pressureBasedMaxWidth - minWidth));

        ctx.stroke();
    }
}

// --- Initialization ---
function initializeBristles() {
    brush.bristles = [];
    const baseLength = brush.size / 2; // Bristles spread out from center

    for (let i = 0; i < brush.bristleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const length = baseLength * (0.5 + Math.random() * 0.75);
        brush.bristles.push(new Bristle(brush.x, brush.y, angle, length));
    }
}

function resizeCanvas() {
    const controlsHeight = document.querySelector('.controls').offsetHeight;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - controlsHeight;
    // Consider adding a background fill if clearing on resize looks bad
    // ctx.fillStyle = '#ffffff';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- Event Listeners ---
function startPainting(event) {
    isPainting = true;
    updateBrushState(event); // Update position and pressure
    brush.px = brush.x;
    brush.py = brush.y;

    // Initialize bristle positions
    brush.bristles.forEach(bristle => {
        bristle.x = brush.x + Math.cos(bristle.angle) * bristle.length;
        bristle.y = brush.y + Math.sin(bristle.angle) * bristle.length;
        bristle.px = bristle.x;
        bristle.py = bristle.y;
    });
    event.preventDefault();
}

function stopPainting() {
    if (isPainting) {
        isPainting = false;
        brush.currentPressure = DEFAULT_PRESSURE; // Reset pressure
        ctx.beginPath();
    }
}

// --- Core Update Logic ---
function updateBrushState(event) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    let pressure = DEFAULT_PRESSURE; // Start with default

    if (event.touches && event.touches.length > 0) {
        const touch = event.touches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;

        // 1. Try using touch.force (most direct pressure)
        if (touch.force !== undefined && touch.force > 0) {
            pressure = clamp(touch.force, 0, 1); // force is typically 0 to 1
            // console.log("Using Force:", pressure.toFixed(2));
        }
        // 2. Fallback to radiusX/Y if force is not available/supported
        else if (touch.radiusX !== undefined && touch.radiusX > 0) {
            // Use average radius as a proxy for contact size
            const avgRadius = (touch.radiusX + touch.radiusY) / 2;
            // Normalize the radius within our defined range
            pressure = normalize(avgRadius, MIN_PRESSURE_RADIUS, MAX_PRESSURE_RADIUS);
            // console.log("Using Radius:", avgRadius.toFixed(1), "-> Pressure:", pressure.toFixed(2));
        } else {
             // console.log("No pressure data, using default");
        }

    } else if (event.clientX !== undefined) { // Mouse event
        clientX = event.clientX;
        clientY = event.clientY;
        // Keep default pressure for mouse for now
        // console.log("Mouse event, using default pressure");

    } else {
        return; // No valid coordinates found
    }

    // Update brush position
    brush.px = brush.x;
    brush.py = brush.y;
    brush.x = clientX - rect.left;
    brush.y = clientY - rect.top;

    // Update brush pressure
    brush.currentPressure = pressure;
}


function paint(event) {
    if (!isPainting) return;

    updateBrushState(event); // Update position and pressure first

    // Update and draw each bristle using current pressure and size
    brush.bristles.forEach(bristle => {
        bristle.update(brush.x, brush.y, brush.dampingFactor);
        // Pass current pressure and base size to the draw method
        bristle.draw(ctx, brush.color, brush.currentPressure, brush.size);
    });

    event.preventDefault();
}

// --- Control Handlers ---
colorPicker.addEventListener('input', (e) => {
    brush.color = e.target.value;
});

brushSizeSlider.addEventListener('input', (e) => {
    brush.size = parseInt(e.target.value, 10);
    brushSizeValue.textContent = brush.size;
    // Don't necessarily re-initialize bristles here, just update the base size used in drawing
    // initializeBristles(); // Optional: uncomment if you want bristles to reposition based on size slider
});

bristleCountSlider.addEventListener('input', (e) => {
    brush.bristleCount = parseInt(e.target.value, 10);
    bristleCountValue.textContent = brush.bristleCount;
    initializeBristles(); // Recreate bristles is necessary if count changes
});

dampingSlider.addEventListener('input', (e) => {
    brush.dampingFactor = parseFloat(e.target.value) / 100;
    if (brush.dampingFactor === 0) brush.dampingFactor = 0.01;
    dampingValue.textContent = brush.dampingFactor.toFixed(2);
});

clearButton.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// --- Setup ---
window.addEventListener('resize', resizeCanvas);

// Mouse events
canvas.addEventListener('mousedown', startPainting);
canvas.addEventListener('mouseup', stopPainting);
canvas.addEventListener('mousemove', paint);
canvas.addEventListener('mouseout', stopPainting);

// Touch events - Use passive: false to allow preventDefault()
canvas.addEventListener('touchstart', startPainting, { passive: false });
canvas.addEventListener('touchend', stopPainting);
canvas.addEventListener('touchcancel', stopPainting);
canvas.addEventListener('touchmove', paint, { passive: false });

// Initial setup
resizeCanvas();
initializeBristles();

console.log("Bristle Brush Ready! (Touch pressure enabled)");