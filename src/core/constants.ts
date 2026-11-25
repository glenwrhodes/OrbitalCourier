/** Fixed simulation rate. Every flight advances in steps of exactly 1/TICK_RATE seconds. */
export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;

/** Engine acceleration while a burn key is held, in units/s². */
export const THRUST_ACCEL = 45;

/** Gap between the pickup moon's surface and the ship at launch. */
export const LAUNCH_CLEARANCE = 4;

/** Launches weaker than this are ignored (a click is not a launch). */
export const MIN_LAUNCH_POWER = 20;

/** The playfield is a fixed 1920×1080 design space centred on the origin; y points down. */
export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

/** How far past the screen edge the ship may wander before the signal is lost. */
export const BOUNDS_MARGIN = 140;

/** How far ahead the trajectory preview looks. */
export const PREVIEW_SECONDS = 10;

/** The flown path and the preview keep one point every this many ticks. */
export const TRAIL_EVERY = 2;
