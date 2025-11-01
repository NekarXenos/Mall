// --- Core Constants ---
export const SUN_RADIUS = 200;
export const WALK_SPEED = 5; // meters per second
export const RUN_SPEED = 12; // meters per second
export const BODY_HALF_HEIGHT = 1.5 / 2;

// --- Swimming Constants ---
export const SWIM_SPEED = 3; // meters per second
export const SWIM_UP_SPEED = 2; // vertical speed in water
export const WATER_DRAG = 0.85; // velocity multiplier for water resistance
export const BUOYANCY = 2; // upward force in water

// Prevent leaving a body without a jetpack
export const MAX_NO_JETPACK_ALTITUDE = 3.0; // meters above local ground

// --- Rocket Constants ---
export const ROCKET_ENTER_DISTANCE = 10;
export const ROCKET_LENGTH = 10; // Rocket body length
export const ROCKET_MAIN_THRUST = 25.0;
export const ROCKET_BOOST_THRUST = 250.0;
export const ROCKET_TURN_SPEED = 2.5; // Yaw turning speed for A/D keys
export const ROCKET_RCS_THRUST = 15.0; // RCS strafe thrust for Q/E keys
export const ROCKET_BRAKE_FORCE = 0.95; // Brake multiplier (5% speed reduction per frame)
export const G_CONSTANT = 6000; // Gravitational constant, tweaked for gameplay
// --- Launch Assist (auto-boost until clear of surface) ---
export const LAUNCH_ASSIST_TARGET_RADIAL_SPEED = 500; // m/s outward along XZ radial
export const LAUNCH_ASSIST_ACCEL = 2500; // m/s^2 additional outward acceleration
export const LAUNCH_ASSIST_GRACE_TIME = 1.0; // seconds to ignore collision after takeoff
export const LAUNCH_ASSIST_CLEARANCE = ROCKET_LENGTH * 2.5; // meters past surface before collisions resume
// --- Launch tuning (user-tweakable) ---
export const LAUNCH_STRENGTH = 0.6; // Global multiplier to make launch stronger or weaker
export const LAUNCH_BASE_BODY_RADIUS = 100; // Reference body radius for scaling thrust with body size

// --- Tractor Beam Constants ---
export const TRACTOR_BEAM_PULL_FORCE = 100.0; // Force pulling rocket toward target (increased for faster approach)
export const TRACTOR_BEAM_ROTATION_SYNC = 2.0; // Speed of rotation synchronization
export const TRACTOR_BEAM_MAX_DISTANCE = 2000; // Maximum effective range

// --- Generation Settings ---
export const NUM_PLANETS = Math.floor(Math.random() * 4) + 5; // Generate 5 to 8 planets
export const PLANET_MIN_RADIUS = 50;
export const PLANET_MAX_RADIUS = 150;
export const MAX_MOONS_PER_PLANET = 4;
export const MOON_MIN_RADIUS_FACTOR = 0.1; // e.g., moon is at least 10% of planet size
export const MOON_MAX_RADIUS_FACTOR = 0.4; // e.g., moon is at most 40% of planet size

// --- Character Controls ---
export const MOUSE_SENSITIVITY = 0.002;  // Mouse look sensitivity (higher = faster rotation)
export const MAX_PITCH = Math.PI / 3;
export const JUMP_STRENGTH = 5;

// --- Jetpack ---
export const JETPACK_THRUST = 15.0;
export const JETPACK_DOWN_THRUST = -12.0;

// --- UI/Camera ---
export const AXES_SCALE_FACTOR = 0.001;
export const ARROW_SCALE_FACTOR = 0.5;

// --- Theming ---
export const COLOR_PALETTE = [0x88ff22, 0xff8822, 0x99ff99, 0xff9999, 0x9999ff, 0xffff99, 0x99ffff, 0xff99ff];

// --- Physics ---
export const CHARACTER_GRAVITY = -9.8;
export const ROCKET_COLLISION_MARGIN = 2.0;