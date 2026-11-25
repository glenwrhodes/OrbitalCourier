import { describe, expect, it } from 'vitest';
import { compileSystem, positionsAt, velocitiesAt, type BodyDef } from '../src/core/bodies.ts';

const defs: BodyDef[] = [
  { id: 'fixed', name: 'F', kind: 'planet', radius: 20, mu: 1e6, pos: { x: 100, y: -50 } },
  { id: 'rover', name: 'R', kind: 'planet', radius: 20, mu: 1e6, orbit: { center: { x: 0, y: 0 }, radius: 300, period: 20, phase: 90 } },
  { id: 'moon', name: 'M', kind: 'moon', radius: 5, mu: 1e3, orbit: { around: 'rover', radius: 50, period: -5, phase: 0 } },
];

function pos(t: number): Float64Array {
  const sys = compileSystem(defs);
  const out = new Float64Array(2 * sys.count);
  positionsAt(sys, t, out);
  return out;
}

describe('scripted orbits', () => {
  it('keeps a body without an orbit where it was put', () => {
    for (const t of [0, 3.3, 100]) {
      const p = pos(t);
      expect([p[0], p[1]]).toEqual([100, -50]);
    }
  });

  it('starts an orbiting body at its phase angle (90° is below the centre)', () => {
    const p = pos(0);
    expect(p[2]).toBeCloseTo(0, 9);
    expect(p[3]).toBeCloseTo(300, 9);
  });

  it('turns clockwise on screen for a positive period, back to the start after one period', () => {
    const quarter = pos(5);
    // From straight below the centre, a clockwise quarter turn on screen (y down) ends on the left.
    expect(quarter[2]).toBeCloseTo(-300, 6);
    expect(quarter[3]).toBeCloseTo(0, 6);
    const full = pos(20);
    expect(full[2]).toBeCloseTo(0, 6);
    expect(full[3]).toBeCloseTo(300, 6);
  });

  it('carries a moon along with the planet it circles', () => {
    for (const t of [0, 1.25, 7]) {
      const p = pos(t);
      const dx = p[4] - p[2];
      const dy = p[5] - p[3];
      expect(Math.hypot(dx, dy)).toBeCloseTo(50, 9);
    }
    // Negative period: counter-clockwise, so a quarter period later the moon sits above its planet.
    const p = pos(1.25);
    expect(p[4] - p[2]).toBeCloseTo(0, 6);
    expect(p[5] - p[3]).toBeCloseTo(-50, 6);
  });

  it('reports velocities that match the motion', () => {
    const sys = compileSystem(defs);
    const vel = new Float64Array(2 * sys.count);
    const t = 3.7;
    const h = 1e-5;
    velocitiesAt(sys, t, vel);
    const a = pos(t - h);
    const b = pos(t + h);
    for (let i = 0; i < 6; i++) expect(vel[i]).toBeCloseTo((b[i] - a[i]) / (2 * h), 4);
  });
});

describe('compileSystem', () => {
  it('rejects a body that orbits one listed after it', () => {
    expect(() => compileSystem([defs[2], defs[1]])).toThrow(/listed before/);
  });
  it('rejects duplicate ids', () => {
    expect(() => compileSystem([defs[0], defs[0]])).toThrow(/Duplicate/);
  });
  it('rejects a body with neither a position nor an orbit', () => {
    expect(() => compileSystem([{ id: 'x', name: 'X', kind: 'moon', radius: 1, mu: 1 }])).toThrow(/pos or an orbit/);
  });
  it('rejects a zero period', () => {
    expect(() => compileSystem([{ id: 'x', name: 'X', kind: 'moon', radius: 1, mu: 1, orbit: { radius: 5, period: 0, phase: 0 } }])).toThrow(/period/);
  });
});
