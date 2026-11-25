import { describe, expect, it } from 'vitest';
import { DT } from '../src/core/constants.ts';
import { gravity, sweptHit, verletStep, type Ship } from '../src/core/physics.ts';

// One static body at the origin. The table only needs one entry because it never moves.
const mu = new Float64Array([1e6]);
const table = new Float64Array([0, 0]);

function shipAt(x: number, y: number, vx: number, vy: number): Ship {
  const a = { x: 0, y: 0 };
  gravity(mu, table, 0, x, y, a);
  return { x, y, vx, vy, ax: a.x, ay: a.y };
}

function energy(s: Ship): number {
  return 0.5 * (s.vx * s.vx + s.vy * s.vy) - mu[0] / Math.hypot(s.x, s.y);
}

describe('gravity', () => {
  it('pulls toward the body with strength mu / r²', () => {
    const a = { x: 0, y: 0 };
    gravity(mu, table, 0, 200, 0, a);
    expect(a.x).toBeCloseTo(-1e6 / 200 ** 2, 9);
    expect(a.y).toBeCloseTo(0, 12);
  });

  it('adds up the pull of every body', () => {
    const two = new Float64Array([1e6, 1e6]);
    const t2 = new Float64Array([-100, 0, 100, 0]);
    const a = { x: 0, y: 0 };
    gravity(two, t2, 0, 0, 0, a);
    expect(a.x).toBeCloseTo(0, 9);
    gravity(two, t2, 0, 0, 100, a);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo((-2 * 1e6 * 100) / Math.pow(Math.SQRT2 * 100, 3), 9);
  });
});

describe('verletStep', () => {
  it('holds a circular orbit for five revolutions', () => {
    const r = 200;
    const v = Math.sqrt(mu[0] / r);
    const ship = shipAt(r, 0, 0, v);
    const period = (2 * Math.PI * r) / v;
    const steps = Math.round((5 * period) / DT);
    const e0 = energy(ship);
    let minR = Infinity;
    let maxR = 0;
    for (let i = 0; i < steps; i++) {
      verletStep(mu, table, 0, ship, 0, 0);
      const d = Math.hypot(ship.x, ship.y);
      minR = Math.min(minR, d);
      maxR = Math.max(maxR, d);
    }
    expect(minR).toBeGreaterThan(r * 0.999);
    expect(maxR).toBeLessThan(r * 1.001);
    expect(Math.abs((energy(ship) - e0) / e0)).toBeLessThan(1e-5);
    // Back near the start after a whole number of orbits.
    expect(Math.hypot(ship.x - r, ship.y)).toBeLessThan(2);
  });

  it('changes velocity by exactly thrust × DT in empty space', () => {
    const none = new Float64Array([0]);
    const ship: Ship = { x: 0, y: 0, vx: 10, vy: 0, ax: 0, ay: 0 };
    verletStep(none, table, 0, ship, 60, -30);
    expect(ship.vx).toBeCloseTo(10 + 60 * DT, 12);
    expect(ship.vy).toBeCloseTo(-30 * DT, 12);
  });

  it('is deterministic', () => {
    const a = shipAt(150, 20, 5, 70);
    const b = shipAt(150, 20, 5, 70);
    for (let i = 0; i < 1000; i++) {
      verletStep(mu, table, 0, a, 0, 0);
      verletStep(mu, table, 0, b, 0, 0);
    }
    expect(a).toEqual(b);
  });
});

describe('sweptHit', () => {
  it('catches a fast ship that jumps clean over a body between ticks', () => {
    expect(sweptHit(-100, 0, 100, 0, 0, 0, 0, 0, 10)).toBe(true);
  });
  it('misses when the path clears the body', () => {
    expect(sweptHit(-100, 20, 100, 20, 0, 0, 0, 0, 10)).toBe(false);
  });
  it('works in the frame of a moving body', () => {
    // The body moves onto the ship's path during the step.
    expect(sweptHit(0, 0, 0, 1, 50, 0, 0, 0, 5)).toBe(true);
    // Ship and body move together, staying 20 apart.
    expect(sweptHit(0, 0, 100, 0, 0, 20, 100, 20, 10)).toBe(false);
  });
});
