import { describe, expect, it } from 'vitest';
import { LAUNCH_CLEARANCE, WORLD_HEIGHT, WORLD_WIDTH } from '../src/core/constants.ts';
import { LEVELS } from '../src/core/levels.ts';
import { sessionStars } from '../src/core/scoring.ts';
import { fuelUsed, runSolution } from '../src/core/sim.ts';
import { createWorld } from '../src/core/world.ts';
import { circleHitsRect, HUD_RECTS } from '../src/render/layout.ts';

describe('the level set', () => {
  it('has ten levels numbered 1 to 10', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('gives every level a unique name and a brief', () => {
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(10);
    for (const l of LEVELS) expect(l.brief.length).toBeGreaterThan(10);
  });
});

describe.each(LEVELS.map((l) => [l.id, l.name, l] as const))('level %i %s', (_id, _name, level) => {
  const world = createWorld(level);

  it('delivers with its stored solution within the fuel and time limits', () => {
    const s = runSolution(level, level.solution, world);
    expect(s.outcome?.reason).toBe('delivered');
    expect(s.outcome?.bodyId).toBe(level.target);
    expect(fuelUsed(s)).toBeLessThanOrEqual(level.fuel);
    expect(level.solution.power).toBeLessThanOrEqual(level.maxLaunch);
    expect(s.tick).toBeLessThan(world.maxTick);
  });

  it('flies its stored solution entirely on screen (it is what demo mode records)', () => {
    const s = runSolution(level, level.solution, world);
    for (let i = 0; i < s.trail.length; i += 2) {
      expect(Math.abs(s.trail[i])).toBeLessThan(WORLD_WIDTH / 2);
      expect(Math.abs(s.trail[i + 1])).toBeLessThan(WORLD_HEIGHT / 2);
    }
  });

  it('earns three stars with its stored solution, with a par tighter than the limits', () => {
    const s = runSolution(level, level.solution, world);
    expect(sessionStars(s)).toBe(3);
    expect(level.par.fuel).toBeLessThan(level.fuel);
    expect(level.par.time).toBeLessThan(level.timeLimit);
  });

  it('has a stored solution that is not a knife edge', () => {
    for (const dh of [-0.05, 0.05]) {
      for (const dp of [-0.25, 0.25]) {
        const sol = { ...level.solution, heading: level.solution.heading + dh, power: level.solution.power + dp };
        const s = runSolution(level, sol, world);
        expect(s.outcome?.reason, `heading ${sol.heading} power ${sol.power}`).toBe('delivered');
      }
    }
  });

  it('has well-formed burns', () => {
    for (const b of level.solution.burns) {
      expect(Number.isInteger(b.start) && Number.isInteger(b.end)).toBe(true);
      expect(b.start).toBeGreaterThanOrEqual(0);
      expect(b.end).toBeGreaterThan(b.start);
    }
  });

  it('collects from one moon and delivers to another', () => {
    const kinds = new Map(level.bodies.map((b) => [b.id, b.kind]));
    expect(kinds.get(level.pickup)).toBe('moon');
    expect(kinds.get(level.target)).toBe('moon');
    expect(level.fuel).toBeGreaterThanOrEqual(level.maxLaunch);
  });

  it('starts with every body on screen and the launch pad clear', () => {
    const { sys, table } = world;
    for (let i = 0; i < sys.count; i++) {
      if (sys.defs[i].kind === 'rock') continue; // belts may run off the edge
      expect(Math.abs(table[2 * i]), sys.defs[i].id).toBeLessThan(WORLD_WIDTH / 2 - sys.radius[i]);
      expect(Math.abs(table[2 * i + 1]), sys.defs[i].id).toBeLessThan(WORLD_HEIGHT / 2 - sys.radius[i]);
    }
    const p = world.pickup;
    const pad = sys.radius[p] + LAUNCH_CLEARANCE;
    for (let i = 0; i < sys.count; i++) {
      if (i === p) continue;
      const d = Math.hypot(table[2 * i] - table[2 * p], table[2 * i + 1] - table[2 * p + 1]);
      expect(d - sys.radius[i], sys.defs[i].id).toBeGreaterThan(pad + 20);
    }
  });

  it('keeps every body out from under the HUD for the whole flight window', () => {
    const { sys, table, stride } = world;
    for (let k = 0; k <= world.maxTick; k += 6) {
      for (let i = 0; i < sys.count; i++) {
        if (sys.defs[i].kind === 'rock') continue;
        for (const rect of HUD_RECTS) {
          if (circleHitsRect(table[k * stride + 2 * i], table[k * stride + 2 * i + 1], sys.radius[i] + 8, rect)) {
            throw new Error(`${sys.defs[i].id} is under a HUD panel at tick ${k}`);
          }
        }
      }
    }
  });

  it('has a brief short enough for the flight plan panel', () => {
    expect(level.brief.length).toBeLessThanOrEqual(100);
  });

  it('never lets two bodies touch during the flight window', () => {
    const { sys, table, stride } = world;
    for (let k = 0; k <= world.maxTick; k += 6) {
      for (let i = 0; i < sys.count; i++) {
        for (let j = i + 1; j < sys.count; j++) {
          if (sys.defs[i].kind === 'rock' && sys.defs[j].kind === 'rock') continue;
          const d = Math.hypot(table[k * stride + 2 * i] - table[k * stride + 2 * j], table[k * stride + 2 * i + 1] - table[k * stride + 2 * j + 1]);
          if (d <= sys.radius[i] + sys.radius[j] + 8) {
            throw new Error(`${sys.defs[i].id} and ${sys.defs[j].id} touch at tick ${k}`);
          }
        }
      }
    }
  });
});
