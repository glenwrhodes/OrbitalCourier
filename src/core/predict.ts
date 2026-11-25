import { TRAIL_EVERY } from './constants.ts';
import type { Ship } from './physics.ts';
import { advance, type StepOut, type World } from './world.ts';

export type PredictionEnd = 'delivered' | 'impact' | 'out-of-bounds' | 'timeout' | 'horizon';

export interface Prediction {
  /** Predicted path as [x, y, ...]: the start point, then one point every `sampleEvery` ticks, then the end point. */
  points: number[];
  end: PredictionEnd;
  /** Body involved in the end event, or -1. */
  endBody: number;
  /** Ticks (from the start tick) until the end of the prediction. */
  endTicks: number;
  /** Closest the path came to the target's centre, the tick (from start) it happened, and where. */
  closest: { dist: number; ticks: number; x: number; y: number; targetX: number; targetY: number };
}

/**
 * Flies a copy of `ship` forward from `tick` with no thrust, for up to
 * `horizonTicks` or until the flight window closes. Uses the same step
 * function as the real flight, so an unpowered flight follows it exactly.
 */
export function predict(
  world: World,
  ship: Ship,
  tick: number,
  horizonTicks: number,
  sampleEvery = TRAIL_EVERY,
): Prediction {
  const s: Ship = { ...ship };
  const points = [s.x, s.y];
  const out: StepOut = { event: 'none', body: -1 };
  const t = world.target;
  const { table, stride } = world;

  let bestD2 = sqDist(s.x, s.y, table[tick * stride + 2 * t], table[tick * stride + 2 * t + 1]);
  const closest = { dist: 0, ticks: 0, x: s.x, y: s.y, targetX: table[tick * stride + 2 * t], targetY: table[tick * stride + 2 * t + 1] };

  let end: PredictionEnd = 'horizon';
  let endBody = -1;
  let k = 0;
  while (k < horizonTicks) {
    if (tick + k >= world.maxTick) {
      end = 'timeout';
      break;
    }
    advance(world, s, tick + k, 0, 0, out);
    k++;
    const base = (tick + k) * stride + 2 * t;
    const d2 = sqDist(s.x, s.y, table[base], table[base + 1]);
    if (d2 < bestD2) {
      bestD2 = d2;
      closest.ticks = k;
      closest.x = s.x;
      closest.y = s.y;
      closest.targetX = table[base];
      closest.targetY = table[base + 1];
    }
    if (k % sampleEvery === 0 || out.event !== 'none') points.push(s.x, s.y);
    if (out.event !== 'none') {
      end = out.event;
      endBody = out.body;
      break;
    }
  }
  if (end === 'horizon' || end === 'timeout') {
    if (k % sampleEvery !== 0) points.push(s.x, s.y);
  }
  closest.dist = Math.sqrt(bestD2);
  return { points, end, endBody, endTicks: k, closest };
}

function sqDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
