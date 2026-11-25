import { describe, expect, it } from 'vitest';
import { LAUNCH_CLEARANCE, TICK_RATE } from '../src/core/constants.ts';
import { advance, bodyX, bodyY, createWorld, launchState, type StepOut } from '../src/core/world.ts';
import { emptySpace, testLevel } from './helpers.ts';

describe('createWorld', () => {
  it('tabulates every body position for the whole flight window', () => {
    const level = testLevel({
      timeLimit: 2,
      bodies: [
        ...emptySpace(),
        { id: 'r', name: 'R', kind: 'planet', radius: 10, mu: 0, orbit: { radius: 100, period: 4, phase: 0 } },
      ],
    });
    const w = createWorld(level);
    expect(w.maxTick).toBe(2 * TICK_RATE);
    const r = w.sys.index.get('r')!;
    // Half a period after t = 0 the rover is on the far side.
    expect(bodyX(w, 0, r)).toBeCloseTo(100);
    expect(bodyX(w, w.maxTick, r)).toBeCloseTo(-100);
    expect(bodyY(w, w.maxTick, r)).toBeCloseTo(0);
  });

  it('rejects a level whose pickup is its target', () => {
    expect(() => createWorld(testLevel({ target: 'a' }))).toThrow(/same body/);
  });

  it('rejects unknown pickup or target ids', () => {
    expect(() => createWorld(testLevel({ target: 'nope' }))).toThrow(/Unknown body/);
  });
});

describe('launchState', () => {
  it('puts the ship on the pickup surface along the heading, adding the moon velocity', () => {
    const level = testLevel({
      bodies: [
        { id: 'c', name: 'C', kind: 'planet', radius: 20, mu: 0, pos: { x: 0, y: 0 } },
        { id: 'a', name: 'A', kind: 'moon', radius: 10, mu: 0, orbit: { around: 'c', radius: 200, period: 10, phase: 0 } },
        { id: 'b', name: 'B', kind: 'moon', radius: 10, mu: 0, pos: { x: 500, y: 0 } },
      ],
    });
    const w = createWorld(level);
    const s = launchState(w, 0, 50);
    // Heading 0 is straight up the screen.
    expect(s.x).toBeCloseTo(200);
    expect(s.y).toBeCloseTo(-(10 + LAUNCH_CLEARANCE));
    // The moon is moving down the screen at 2πr/T at phase 0 (clockwise), so it carries the ship.
    const moonSpeed = (2 * Math.PI * 200) / 10;
    expect(s.vx).toBeCloseTo(0);
    expect(s.vy).toBeCloseTo(moonSpeed - 50);
  });
});

describe('advance', () => {
  const out: StepOut = { event: 'none', body: -1 };

  it('reports a delivery when the ship enters the target ring', () => {
    const w = createWorld(testLevel({ bodies: emptySpace() }));
    const ship = { x: 500 - 40, y: 300, vx: 1200, vy: 0, ax: 0, ay: 0 };
    advance(w, ship, 0, 0, 0, out);
    expect(out.event).toBe('delivered');
    expect(w.sys.defs[out.body].id).toBe('b');
  });

  it('reports an impact with the body that was hit', () => {
    const w = createWorld(testLevel({ bodies: emptySpace([{ id: 'rock', name: 'R', kind: 'rock', radius: 15, mu: 0, pos: { x: 0, y: 0 } }]) }));
    const ship = { x: -30, y: 0, vx: 6000, vy: 0, ax: 0, ay: 0 };
    advance(w, ship, 0, 0, 0, out);
    expect(out.event).toBe('impact');
    expect(w.sys.defs[out.body].id).toBe('rock');
  });

  it('reports leaving the playfield', () => {
    const w = createWorld(testLevel({ bodies: emptySpace() }));
    const ship = { x: w.bounds.maxX - 1, y: 0, vx: 600, vy: 0, ax: 0, ay: 0 };
    advance(w, ship, 0, 0, 0, out);
    expect(out.event).toBe('out-of-bounds');
  });
});
