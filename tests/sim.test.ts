import { describe, expect, it } from 'vitest';
import { DT, MIN_LAUNCH_POWER, THRUST_ACCEL } from '../src/core/constants.ts';
import { canLaunch, createSession, fuelUsed, launch, maxLaunchPower, runSolution, setAim, stepSession } from '../src/core/sim.ts';
import { thrustAt } from '../src/core/solution.ts';
import { emptySpace, testLevel } from './helpers.ts';

const space = () => testLevel({ bodies: emptySpace(), fuel: 200, maxLaunch: 150, timeLimit: 20 });

describe('aiming', () => {
  it('wraps the heading and clamps the power to the launch limit', () => {
    const s = createSession(space());
    setAim(s, -90, 999);
    expect(s.heading).toBe(270);
    expect(s.power).toBe(150);
    setAim(s, 10, -5);
    expect(s.power).toBe(0);
  });

  it('never allows a launch bigger than the fuel', () => {
    const s = createSession(testLevel({ bodies: emptySpace(), fuel: 80, maxLaunch: 150 }));
    expect(maxLaunchPower(s)).toBe(80);
    setAim(s, 90, 120);
    expect(s.power).toBe(80);
  });

  it('needs a minimum power to launch', () => {
    const s = createSession(space());
    setAim(s, 90, MIN_LAUNCH_POWER - 1);
    expect(canLaunch(s)).toBe(false);
    expect(launch(s)).toBe(false);
    expect(s.phase).toBe('aiming');
    setAim(s, 90, MIN_LAUNCH_POWER);
    expect(launch(s)).toBe(true);
    expect(s.phase).toBe('flying');
  });

  it('charges the launch to the fuel', () => {
    const s = createSession(space());
    setAim(s, 90, 120);
    launch(s);
    expect(s.fuel).toBe(80);
    expect(s.launchDv).toBe(120);
  });

  it('ignores aim changes once flying', () => {
    const s = createSession(space());
    setAim(s, 90, 100);
    launch(s);
    setAim(s, 0, 10);
    expect(s.heading).toBe(90);
    expect(s.power).toBe(100);
  });
});

describe('burns', () => {
  function flying(fuel = 200) {
    const s = createSession(testLevel({ bodies: emptySpace(), fuel, maxLaunch: 150, timeLimit: 20 }));
    setAim(s, 90, 50);
    launch(s);
    return s;
  }

  it('prograde burns speed the ship up, retrograde burns slow it down', () => {
    const coast = flying();
    const pro = flying();
    const retro = flying();
    for (let i = 0; i < 60; i++) {
      stepSession(coast, 0);
      stepSession(pro, 1);
      stepSession(retro, -1);
    }
    const speed = (s: typeof coast) => Math.hypot(s.ship.vx, s.ship.vy);
    expect(speed(pro)).toBeCloseTo(speed(coast) + 60 * THRUST_ACCEL * DT, 6);
    expect(speed(retro)).toBeCloseTo(speed(coast) - 60 * THRUST_ACCEL * DT, 6);
  });

  it('spends THRUST_ACCEL × DT of fuel per tick of burn', () => {
    const s = flying();
    for (let i = 0; i < 120; i++) stepSession(s, 1);
    expect(s.burnDv).toBeCloseTo(THRUST_ACCEL, 9);
    expect(s.fuel).toBeCloseTo(150 - THRUST_ACCEL, 9);
    expect(fuelUsed(s)).toBeCloseTo(50 + THRUST_ACCEL, 9);
  });

  it('never lets the fuel go negative, and burns nothing once the tank is empty', () => {
    const s = flying(51); // 1 unit left after the launch
    for (let i = 0; i < 200; i++) {
      stepSession(s, 1);
      expect(s.fuel).toBeGreaterThanOrEqual(0);
    }
    expect(s.fuel).toBe(0);
    expect(s.burnDv).toBeCloseTo(1, 9);
    expect(s.thrust).toBe(0);
  });

  it('flies an empty-tank burn exactly like a coast', () => {
    const dry = flying(50);
    const coast = flying(50);
    for (let i = 0; i < 300; i++) {
      stepSession(dry, 1);
      stepSession(coast, 0);
    }
    expect(dry.ship).toEqual(coast.ship);
  });

  it('reads burns from a solution by tick', () => {
    const sol = { heading: 0, power: 0, burns: [{ start: 10, end: 20, dir: -1 as const }, { start: 30, end: 31, dir: 1 as const }] };
    expect(thrustAt(sol, 9)).toBe(0);
    expect(thrustAt(sol, 10)).toBe(-1);
    expect(thrustAt(sol, 19)).toBe(-1);
    expect(thrustAt(sol, 20)).toBe(0);
    expect(thrustAt(sol, 30)).toBe(1);
  });
});

describe('flight outcomes', () => {
  it('delivers when it reaches the target ring', () => {
    // From (-500, 0) straight right at the target moon at (500, 0), past nothing.
    const level = testLevel({
      bodies: [
        { id: 'a', name: 'A', kind: 'moon', radius: 10, mu: 0, pos: { x: -500, y: 0 } },
        { id: 'b', name: 'B', kind: 'moon', radius: 10, mu: 0, pos: { x: 500, y: 0 } },
      ],
    });
    const s = runSolution(level, { heading: 90, power: 200, burns: [] });
    expect(s.phase).toBe('ended');
    expect(s.outcome?.reason).toBe('delivered');
    expect(s.outcome?.bodyId).toBe('b');
    // 1000 between centres, minus the 14 launch offset and the 30 ring, at 200 per second.
    expect(s.outcome!.tick * DT).toBeCloseTo((1000 - 14 - 30) / 200, 1);
  });

  it('ends in an impact when it flies into a planet', () => {
    const s = runSolution(testLevel(), { heading: 90, power: 150, burns: [] });
    expect(s.outcome?.reason).toBe('impact');
    expect(s.outcome?.bodyId).toBe('p');
  });

  it('loses the signal when it leaves the playfield', () => {
    const s = runSolution(space(), { heading: 0, power: 150, burns: [] });
    expect(s.outcome?.reason).toBe('out-of-bounds');
  });

  it('times out when the delivery window closes', () => {
    const s = runSolution(testLevel({ bodies: emptySpace(), timeLimit: 0.5 }), { heading: 90, power: 30, burns: [] });
    expect(s.outcome?.reason).toBe('timeout');
    expect(s.tick).toBe(60);
  });

  it('stops stepping once the flight has ended', () => {
    const s = runSolution(testLevel(), { heading: 90, power: 150, burns: [] });
    const before = JSON.stringify(s.ship);
    stepSession(s, 1);
    expect(JSON.stringify(s.ship)).toBe(before);
  });

  it('records the flown path, ending exactly where the flight ended', () => {
    const s = runSolution(testLevel(), { heading: 90, power: 150, burns: [] });
    const n = s.trail.length;
    expect(s.trail[n - 2]).toBe(s.outcome!.x);
    expect(s.trail[n - 1]).toBe(s.outcome!.y);
  });
});
