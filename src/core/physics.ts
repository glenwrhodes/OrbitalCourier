import { DT } from './constants.ts';
import { segmentOriginDistSq } from './vec.ts';

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity at the current position and tick, cached between steps. */
  ax: number;
  ay: number;
}

export interface Accel {
  x: number;
  y: number;
}

/**
 * Sums the pull of every body on a point. Body positions are read from
 * `table` starting at `base`, laid out as [x0, y0, x1, y1, ...].
 */
export function gravity(
  mu: Float64Array,
  table: Float64Array,
  base: number,
  x: number,
  y: number,
  out: Accel,
): void {
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < mu.length; i++) {
    const dx = table[base + 2 * i] - x;
    const dy = table[base + 2 * i + 1] - y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) continue;
    const k = mu[i] / (r2 * Math.sqrt(r2));
    ax += dx * k;
    ay += dy * k;
  }
  out.x = ax;
  out.y = ay;
}

const scratch: Accel = { x: 0, y: 0 };

/**
 * One velocity-Verlet step of length DT. Body positions for the end of the
 * step are read from `table` at `nextBase`. Thrust (tx, ty) is a constant
 * acceleration over the step, so it changes velocity by exactly thrust × DT.
 * Mutates `ship`.
 */
export function verletStep(
  mu: Float64Array,
  table: Float64Array,
  nextBase: number,
  ship: Ship,
  tx: number,
  ty: number,
): void {
  const h = DT * 0.5;
  const hvx = ship.vx + (ship.ax + tx) * h;
  const hvy = ship.vy + (ship.ay + ty) * h;
  const x = ship.x + hvx * DT;
  const y = ship.y + hvy * DT;
  gravity(mu, table, nextBase, x, y, scratch);
  ship.x = x;
  ship.y = y;
  ship.vx = hvx + (scratch.x + tx) * h;
  ship.vy = hvy + (scratch.y + ty) * h;
  ship.ax = scratch.x;
  ship.ay = scratch.y;
}

/**
 * Whether a ship moving from (x0, y0) to (x1, y1) came within `r` of a body
 * that moved from (bx0, by0) to (bx1, by1) during the same step. Works in the
 * body's frame, so a fast ship cannot tunnel through a body between ticks.
 */
export function sweptHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
  r: number,
): boolean {
  return segmentOriginDistSq(x0 - bx0, y0 - by0, x1 - bx1, y1 - by1) <= r * r;
}
