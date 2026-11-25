// Ghost of a past flight: the ship's position sampled every few ticks, small
// enough to save with the best run and replayed by interpolating between
// samples. Positions, not inputs, are stored, so a ghost still replays the
// same way if the physics is retuned later.
import { TRAIL_EVERY } from './constants.ts';

/** Ticks between ghost samples (30 per second). A multiple of TRAIL_EVERY. */
export const GHOST_EVERY = 4;

/** Saved coordinates are rounded to this many decimals. */
const DECIMALS = 1;

export interface Ghost {
  /** Ticks between samples. */
  every: number;
  /** Ticks from launch to the end of the flight. */
  ticks: number;
  /**
   * Positions as [x, y, x, y, ...] at ticks 0, every, 2·every, ... below
   * `ticks`, then one last sample exactly at `ticks`.
   */
  points: number[];
}

/** How many samples a ghost of this length holds. */
export function ghostSampleCount(every: number, ticks: number): number {
  return Math.ceil(ticks / every) + 1;
}

/**
 * Builds a ghost from a flown path (Session.trail: one point every
 * TRAIL_EVERY ticks from launch, ending exactly where the flight ended).
 */
export function ghostFromTrail(trail: readonly number[], endTick: number): Ghost {
  const step = GHOST_EVERY / TRAIL_EVERY;
  const points: number[] = [];
  const k = 10 ** DECIMALS;
  // (+ 0 turns -0 into 0, which is what JSON gives back anyway.)
  const round = (v: number) => Math.round(v * k) / k + 0;
  const push = (i: number) => points.push(round(trail[2 * i]), round(trail[2 * i + 1]));
  for (let tick = 0; tick < endTick; tick += GHOST_EVERY) push((tick / GHOST_EVERY) * step);
  push(trail.length / 2 - 1);
  return { every: GHOST_EVERY, ticks: endTick, points };
}

export interface GhostPose {
  x: number;
  y: number;
  /** Direction of travel in screen radians. */
  angle: number;
  /** The ghost's flight is over at this tick. */
  finished: boolean;
}

/** Where the ghost is `tick` ticks after launch (clamped to its flight). */
export function ghostAt(ghost: Ghost, tick: number): GhostPose {
  const n = ghost.points.length / 2;
  const t = Math.max(0, Math.min(tick, ghost.ticks));
  // Sample i sits at tick i·every, except the last, which sits at `ticks`.
  let i = Math.min(Math.floor(t / ghost.every), n - 2);
  if (i < 0) i = 0;
  const t0 = i * ghost.every;
  const t1 = i + 1 === n - 1 ? ghost.ticks : (i + 1) * ghost.every;
  const p = ghost.points;
  const x0 = p[2 * i];
  const y0 = p[2 * i + 1];
  const x1 = p[2 * i + 2] ?? x0;
  const y1 = p[2 * i + 3] ?? y0;
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return {
    x: x0 + (x1 - x0) * u,
    y: y0 + (y1 - y0) * u,
    angle: Math.atan2(y1 - y0, x1 - x0),
    finished: tick >= ghost.ticks,
  };
}

/** Validates ghost data read from storage. */
export function isGhost(v: unknown): v is Ghost {
  if (typeof v !== 'object' || v === null) return false;
  const { every, ticks, points } = v as Record<string, unknown>;
  if (!Number.isInteger(every) || (every as number) < 1 || (every as number) > 120) return false;
  if (!Number.isInteger(ticks) || (ticks as number) < 1 || (ticks as number) > 120 * 600) return false;
  if (!Array.isArray(points)) return false;
  if (points.length !== 2 * ghostSampleCount(every as number, ticks as number)) return false;
  return points.every((c) => typeof c === 'number' && Number.isFinite(c) && Math.abs(c) < 1e5);
}
