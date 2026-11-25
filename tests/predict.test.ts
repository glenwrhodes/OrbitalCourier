import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/core/levels.ts';
import { predict } from '../src/core/predict.ts';
import { createSession, launch, runSolution, setAim, stepSession } from '../src/core/sim.ts';
import { createWorld } from '../src/core/world.ts';
import { testLevel } from './helpers.ts';

describe('trajectory preview', () => {
  it('matches the real unpowered flight point for point, on every level', () => {
    for (const level of LEVELS) {
      const world = createWorld(level);
      const ballistic = { ...level.solution, burns: [] };
      const flown = runSolution(level, ballistic, world);

      const aim = createSession(level, world);
      setAim(aim, ballistic.heading, ballistic.power);
      const p = predict(world, aim.ship, 0, world.maxTick);

      expect(p.points, `level ${level.id}`).toEqual(flown.trail);
      expect(p.endTicks).toBe(flown.outcome!.tick);
      expect(p.end).toBe(flown.outcome!.reason);
    }
  });

  it('stays exact when started mid-flight, after a burn', () => {
    const level = LEVELS[8];
    const world = createWorld(level);
    const s = createSession(level, world);
    setAim(s, level.solution.heading, level.solution.power);
    launch(s);
    for (let i = 0; i < 300; i++) stepSession(s, i < 40 ? 1 : 0);
    const p = predict(world, s.ship, s.tick, 600, 1);
    for (let k = 1; k <= 600 && s.phase === 'flying'; k++) {
      stepSession(s, 0);
      expect(s.ship.x).toBe(p.points[2 * k]);
      expect(s.ship.y).toBe(p.points[2 * k + 1]);
    }
  });

  it('does not move the ship it predicts for', () => {
    const level = testLevel();
    const s = createSession(level);
    setAim(s, 45, 100);
    const before = { ...s.ship };
    predict(s.world, s.ship, 0, 500);
    expect(s.ship).toEqual(before);
  });

  it('stops at the horizon, at an impact, and at the end of the window', () => {
    const level = testLevel();
    const world = createWorld(level);
    const s = createSession(level, world);

    setAim(s, 0, 60);
    const short = predict(world, s.ship, 0, 100);
    expect(short.end).toBe('horizon');
    expect(short.endTicks).toBe(100);
    expect(short.points.length).toBe(2 + 2 * 50);

    setAim(s, 90, 150);
    const crash = predict(world, s.ship, 0, world.maxTick);
    expect(crash.end).toBe('impact');
    expect(world.sys.defs[crash.endBody].id).toBe('p');

    setAim(s, 0, 20);
    const late = predict(world, s.ship, world.maxTick - 10, 100);
    expect(late.end).toBe('timeout');
    expect(late.endTicks).toBe(10);
  });

  it('tracks the closest approach to the target', () => {
    const level = LEVELS[0];
    const world = createWorld(level);
    const s = createSession(level, world);
    setAim(s, level.solution.heading, level.solution.power);
    const p = predict(world, s.ship, 0, world.maxTick);
    expect(p.end).toBe('delivered');
    expect(p.closest.dist).toBeLessThanOrEqual(level.deliveryRadius);
    expect(p.closest.ticks).toBeGreaterThan(0);
  });
});
