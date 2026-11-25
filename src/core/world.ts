import { compileSystem, bodyIndex, positionsAt, velocitiesAt, type System } from './bodies.ts';
import { BOUNDS_MARGIN, DT, LAUNCH_CLEARANCE, TICK_RATE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.ts';
import type { Level } from './level.ts';
import { gravity, sweptHit, verletStep, type Ship } from './physics.ts';
import { headingToDir } from './vec.ts';

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * A level ready to fly: the compiled bodies plus a table of every body's
 * position at every tick up to the time limit. Because the bodies follow
 * scripted orbits, the table is the same for every flight, which is what
 * makes the trajectory preview exact.
 */
export interface World {
  readonly sys: System;
  readonly pickup: number;
  readonly target: number;
  readonly deliveryRadius: number;
  readonly bounds: Bounds;
  /** Last tick of the flight: the delivery window closes here. */
  readonly maxTick: number;
  /** Body positions for ticks 0..maxTick; tick k starts at k × stride. */
  readonly table: Float64Array;
  readonly stride: number;
}

export type StepEvent = 'none' | 'delivered' | 'impact' | 'out-of-bounds';

export interface StepOut {
  event: StepEvent;
  /** Body involved in the event, or -1. */
  body: number;
}

export function playfieldBounds(margin = BOUNDS_MARGIN): Bounds {
  return {
    minX: -WORLD_WIDTH / 2 - margin,
    maxX: WORLD_WIDTH / 2 + margin,
    minY: -WORLD_HEIGHT / 2 - margin,
    maxY: WORLD_HEIGHT / 2 + margin,
  };
}

export function createWorld(level: Level): World {
  const sys = compileSystem(level.bodies);
  const pickup = bodyIndex(sys, level.pickup);
  const target = bodyIndex(sys, level.target);
  if (pickup === target) throw new Error(`Level ${level.id}: pickup and target are the same body`);
  const maxTick = Math.round(level.timeLimit * TICK_RATE);
  const stride = 2 * sys.count;
  const table = new Float64Array((maxTick + 1) * stride);
  for (let k = 0; k <= maxTick; k++) positionsAt(sys, k * DT, table, k * stride);
  return { sys, pickup, target, deliveryRadius: level.deliveryRadius, bounds: playfieldBounds(), maxTick, table, stride };
}

/** Position of body i at a tick (clamped to the flight window). */
export function bodyX(world: World, tick: number, i: number): number {
  return world.table[clampTick(world, tick) * world.stride + 2 * i];
}

export function bodyY(world: World, tick: number, i: number): number {
  return world.table[clampTick(world, tick) * world.stride + 2 * i + 1];
}

function clampTick(world: World, tick: number): number {
  return tick < 0 ? 0 : tick > world.maxTick ? world.maxTick : tick;
}

/** The ship sitting on the pickup moon's surface, aimed and launched with the given Δv. */
export function launchState(world: World, heading: number, power: number): Ship {
  const { sys, pickup } = world;
  const vel = new Float64Array(2 * sys.count);
  velocitiesAt(sys, 0, vel);
  const dir = headingToDir(heading);
  const r = sys.radius[pickup] + LAUNCH_CLEARANCE;
  const x = world.table[2 * pickup] + dir.x * r;
  const y = world.table[2 * pickup + 1] + dir.y * r;
  const acc = { x: 0, y: 0 };
  gravity(sys.mu, world.table, 0, x, y, acc);
  return {
    x,
    y,
    vx: vel[2 * pickup] + dir.x * power,
    vy: vel[2 * pickup + 1] + dir.y * power,
    ax: acc.x,
    ay: acc.y,
  };
}

/**
 * Advances the ship from `tick` to `tick + 1` with thrust (tx, ty), then
 * reports whether it reached the target, hit a body or left the playfield
 * during that step. The flight and the preview both use exactly this
 * function, so they cannot disagree. Requires tick < world.maxTick.
 */
export function advance(world: World, ship: Ship, tick: number, tx: number, ty: number, out: StepOut): void {
  const { sys, table, stride } = world;
  const b0 = tick * stride;
  const b1 = b0 + stride;
  const x0 = ship.x;
  const y0 = ship.y;
  verletStep(sys.mu, table, b1, ship, tx, ty);
  const x1 = ship.x;
  const y1 = ship.y;

  const t = world.target;
  if (sweptHit(x0, y0, x1, y1, table[b0 + 2 * t], table[b0 + 2 * t + 1], table[b1 + 2 * t], table[b1 + 2 * t + 1], world.deliveryRadius)) {
    out.event = 'delivered';
    out.body = t;
    return;
  }
  for (let i = 0; i < sys.count; i++) {
    if (sweptHit(x0, y0, x1, y1, table[b0 + 2 * i], table[b0 + 2 * i + 1], table[b1 + 2 * i], table[b1 + 2 * i + 1], sys.radius[i])) {
      out.event = 'impact';
      out.body = i;
      return;
    }
  }
  const bd = world.bounds;
  if (x1 < bd.minX || x1 > bd.maxX || y1 < bd.minY || y1 > bd.maxY) {
    out.event = 'out-of-bounds';
    out.body = -1;
    return;
  }
  out.event = 'none';
  out.body = -1;
}
